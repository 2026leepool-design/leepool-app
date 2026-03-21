import { useEffect, useRef } from 'react';
import {
  View,
  Animated,
  Dimensions,
  Image,
  Easing,
  StyleSheet,
} from 'react-native';
import {
  Audio,
  InterruptionModeAndroid,
  InterruptionModeIOS,
} from 'expo-av';

/** Orijinal hızın %50’si = yarı hız */
const BOOKPAGE_PLAYBACK_RATE = 0.5;

const { height: SCREEN_H } = Dimensions.get('window');

type Props = {
  onFinished: () => void;
};

async function stopAndUnloadSound(sound: Audio.Sound | null): Promise<void> {
  if (!sound) return;
  try {
    await sound.stopAsync();
  } catch {
    /* */
  }
  try {
    await sound.unloadAsync();
  } catch {
    /* */
  }
}

/**
 * Login ekranı: önce arka plan belirir → logo ortaya büyür → dönüş başlarken ses (%50 yavaş loop) →
 * dönüş bitince ses kesilir → logo küçülüp üstteki konuma kayar → overlay söner.
 */
export function LoginIntroOverlay({ onFinished }: Props) {
  const scale = useRef(new Animated.Value(0.18)).current;
  const translateY = useRef(new Animated.Value(-SCREEN_H * 0.12)).current;
  const rotateY = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;

  const soundRef = useRef<Audio.Sound | null>(null);
  const cancelledRef = useRef(false);

  const spinY = rotateY.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '540deg'],
  });

  useEffect(() => {
    cancelledRef.current = false;

    const run = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          interruptionModeIOS: InterruptionModeIOS.DuckOthers,
          interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        });
      } catch {
        /* sessiz devam */
      }

      const driver = false;

      // 0) Önce intro ekranı belirir
      await new Promise<void>((resolve) => {
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.quad),
          useNativeDriver: driver,
        }).start(() => resolve());
      });

      if (cancelledRef.current) return;

      // 1) Kısa duraklama → logo belirir ve ortaya büyür (ses henüz yok)
      await new Promise<void>((resolve) => {
        Animated.sequence([
          Animated.delay(420),
          Animated.parallel([
            Animated.timing(logoOpacity, {
              toValue: 1,
              duration: 280,
              easing: Easing.out(Easing.quad),
              useNativeDriver: driver,
            }),
            Animated.timing(scale, {
              toValue: 1.32,
              duration: 920,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: driver,
            }),
            Animated.timing(translateY, {
              toValue: 0,
              duration: 920,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: driver,
            }),
          ]),
        ]).start(() => resolve());
      });

      if (cancelledRef.current) return;

      // 2) Dönüş başlarken ses (yarı hız, loop)
      try {
        const { sound } = await Audio.Sound.createAsync(
          require('../assets/bookpage.wav'),
          { isLooping: true, volume: 0.85, shouldPlay: false }
        );
        if (cancelledRef.current) {
          await stopAndUnloadSound(sound);
          return;
        }
        soundRef.current = sound;
        try {
          await sound.setRateAsync(BOOKPAGE_PLAYBACK_RATE, true);
        } catch {
          /* Web / bazı cihazlarda rate desteklenmeyebilir */
        }
        await sound.playAsync();
      } catch {
        /* ses yoksa animasyon devam */
      }

      if (cancelledRef.current) return;

      // 3) Sayfa çevirme (ses bu süre boyunca)
      await new Promise<void>((resolve) => {
        Animated.timing(rotateY, {
          toValue: 1,
          duration: 3200,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: driver,
        }).start(() => resolve());
      });

      if (cancelledRef.current) return;

      // 4) Küçülmeye başlamadan önce sesi kes
      const s = soundRef.current;
      soundRef.current = null;
      await stopAndUnloadSound(s);

      // 5) Logo küçülüp üstteki (form) konumuna doğru
      const settleY = -SCREEN_H * 0.19;
      await new Promise<void>((resolve) => {
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: 780,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: driver,
          }),
          Animated.timing(translateY, {
            toValue: settleY,
            duration: 780,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: driver,
          }),
        ]).start(() => resolve());
      });

      if (cancelledRef.current) return;

      await new Promise<void>((resolve) => {
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 450,
          easing: Easing.out(Easing.quad),
          useNativeDriver: driver,
        }).start(() => resolve());
      });

      if (!cancelledRef.current) {
        onFinished();
      }
    };

    void run();

    return () => {
      cancelledRef.current = true;
      const s = soundRef.current;
      soundRef.current = null;
      void stopAndUnloadSound(s);
    };
  }, [onFinished]);

  return (
    <Animated.View
      pointerEvents="auto"
      style={[StyleSheet.absoluteFillObject, styles.overlay, { opacity: overlayOpacity }]}>
      <Animated.View style={[styles.logoStage, { opacity: logoOpacity }]}>
        <Animated.View
          style={{
            transform: [
              { perspective: 1000 },
              { translateY },
              { scale },
              { rotateY: spinY },
            ],
          }}>
          <View style={styles.logoFrame}>
            <Image
              source={require('../assets/images/android-icon-foreground.png')}
              style={styles.logoImg}
              resizeMode="cover"
            />
          </View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const LOGO = 120;

const styles = StyleSheet.create({
  overlay: {
    zIndex: 1000,
    backgroundColor: '#0A0F1A',
    elevation: 1000,
  },
  logoStage: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoFrame: {
    width: LOGO,
    height: LOGO,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderWidth: 1,
    borderColor: '#00E5FF',
    overflow: 'hidden',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
  },
  logoImg: {
    width: LOGO,
    height: LOGO,
  },
});
