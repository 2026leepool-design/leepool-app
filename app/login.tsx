import 'react-native-get-random-values';

import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardWrapper } from '@/components/KeyboardWrapper';
import { LoginIntroOverlay } from '@/components/LoginIntroOverlay';
import { supabase } from '@/utils/supabase';
import { syncNostrProfileAfterAuth } from '@/utils/nostrProfileSync';
import { setCachedAccountPassword } from '@/utils/authPasswordSession';

const LANGUAGES = [
  { code: 'tr', flag: '🇹🇷' },
  { code: 'en', flag: '🇺🇸' },
  { code: 'es', flag: '🇪🇸' },
];

function CyberInput({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  accent = '#00E5FF',
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'sentences';
  accent?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#3A4560"
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize ?? 'none'}
      autoCorrect={false}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        backgroundColor: '#0D1525',
        borderWidth: 1,
        borderColor: focused ? accent : 'rgba(136, 146, 176, 0.2)',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        color: '#E2E8F0',
        fontFamily: 'SpaceGrotesk_400Regular',
        fontSize: 14,
        shadowColor: focused ? accent : 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: focused ? 0.4 : 0,
        shadowRadius: 8,
        elevation: focused ? 4 : 0,
      }}
    />
  );
}

type IntroPhase = 'intro' | 'ready';

export default function LoginScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  /** Her login ekranına gelişte veya logoya tıklanınca artırılır → overlay yeniden mount */
  const [introRunId, setIntroRunId] = useState(0);
  const [introPhase, setIntroPhase] = useState<IntroPhase>('intro');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [classicLoading, setClassicLoading] = useState(false);

  const onIntroFinished = useCallback(() => {
    setIntroPhase('ready');
  }, []);

  const replayIntroFromLogo = useCallback(() => {
    setIntroRunId((n) => n + 1);
    setIntroPhase('intro');
  }, []);

  const navigateIn = () => router.replace('/(tabs)/dashboard');

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    setClassicLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      try {
        await syncNostrProfileAfterAuth(password, data.session?.user?.id);
      } catch (syncErr: unknown) {
        console.error(syncErr);
        await supabase.auth.signOut();
        const code =
          typeof syncErr === 'object' && syncErr !== null && 'message' in syncErr
            ? String((syncErr as Error).message)
            : String(syncErr);
        const msg =
          code === 'NOSTR_DECRYPT_FAILED'
            ? t('nostrSyncDecryptError')
            : code;
        Alert.alert(t('error'), msg);
        return;
      }
      setCachedAccountPassword(password);
      navigateIn();
    } catch (err) {
      console.error(err);
      Alert.alert(t('error'), err instanceof Error ? err.message : String(err));
    } finally {
      setClassicLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    setClassicLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      if (data.session) {
        try {
          await syncNostrProfileAfterAuth(password, data.session.user.id);
        } catch (syncErr: unknown) {
          console.error(syncErr);
          await supabase.auth.signOut();
          const code =
            typeof syncErr === 'object' && syncErr !== null && 'message' in syncErr
              ? String((syncErr as Error).message)
              : String(syncErr);
          const msg =
            code === 'NOSTR_DECRYPT_FAILED'
              ? t('nostrSyncDecryptError')
              : code;
          Alert.alert(t('error'), msg);
          return;
        }
        setCachedAccountPassword(password);
        Alert.alert(t('success'), t('signUpSuccess'));
        navigateIn();
      } else {
        setCachedAccountPassword(null);
        Alert.alert(t('success'), t('signUpSuccess'));
      }
    } catch (err) {
      console.error(err);
      Alert.alert(t('error'), err instanceof Error ? err.message : String(err));
    } finally {
      setClassicLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0F1A' }}>
      {introPhase === 'intro' ? (
        <LoginIntroOverlay key={`login-intro-${introRunId}`} onFinished={onIntroFinished} />
      ) : null}

      {introPhase === 'ready' ? (
    <KeyboardWrapper
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 }}>
      {/* ── Logo (tıkla → intro tekrar) ── */}
      <View style={{ alignItems: 'center', marginBottom: 40 }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={replayIntroFromLogo}
          accessibilityRole="button"
          accessibilityLabel={t('replayLoginIntroA11y')}
          style={{
            width: 88,
            height: 88,
            borderRadius: 22,
            backgroundColor: 'rgba(0, 229, 255, 0.08)',
            borderWidth: 1,
            borderColor: '#00E5FF',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            shadowColor: '#00E5FF',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.45,
            shadowRadius: 22,
            elevation: 8,
            overflow: 'hidden',
          }}>
          <Image
            source={require('../assets/images/android-icon-foreground.png')}
            style={{ width: 88, height: 88 }}
            resizeMode="cover"
          />
        </TouchableOpacity>
        <Text
          style={{
            fontFamily: 'SpaceGrotesk_700Bold',
            fontSize: 26,
            letterSpacing: 8,
            color: '#00E5FF',
            textShadowColor: 'rgba(0, 229, 255, 0.4)',
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 12,
          }}>
          LEEPOOL
        </Text>
        <Text
          style={{
            fontFamily: 'SpaceGrotesk_400Regular',
            fontSize: 10,
            letterSpacing: 4,
            color: '#4A5568',
            marginTop: 4,
          }}>
          {t('management')}
        </Text>
      </View>

      {/* ── Language Picker ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 24 }}>
        {LANGUAGES.map((lang) => (
          <TouchableOpacity
            key={lang.code}
            onPress={() => i18n.changeLanguage(lang.code)}
            activeOpacity={0.8}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: i18n.language.startsWith(lang.code)
                ? 'rgba(0, 229, 255, 0.15)'
                : '#131B2B',
              borderWidth: 1,
              borderColor: i18n.language.startsWith(lang.code)
                ? '#00E5FF'
                : 'rgba(136, 146, 176, 0.2)',
            }}>
            <Text style={{ fontSize: 18 }}>{lang.flag}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── E-posta / şifre (tek yol) ── */}
      <View style={{ gap: 14 }}>
        <CyberInput
          value={email}
          onChangeText={setEmail}
          placeholder={t('emailPlaceholder')}
          keyboardType="email-address"
        />
        <CyberInput
          value={password}
          onChangeText={setPassword}
          placeholder={t('passwordPlaceholder')}
          secureTextEntry
        />

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleSignIn}
          disabled={classicLoading}
          style={{
            backgroundColor: '#00E5FF',
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            marginTop: 6,
            opacity: classicLoading ? 0.7 : 1,
          }}>
          {classicLoading ? (
            <ActivityIndicator size="small" color="#0A0F1A" />
          ) : (
            <Text
              style={{
                fontFamily: 'SpaceGrotesk_700Bold',
                fontSize: 13,
                letterSpacing: 3,
                color: '#0A0F1A',
              }}>
              {t('signIn').toUpperCase()}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleSignUp}
          disabled={classicLoading}
          style={{
            backgroundColor: 'transparent',
            borderRadius: 14,
            paddingVertical: 15,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: 'rgba(0, 229, 255, 0.35)',
          }}>
          <Text
            style={{
              fontFamily: 'SpaceGrotesk_600SemiBold',
              fontSize: 13,
              letterSpacing: 3,
              color: '#00E5FF',
            }}>
            {t('signUp').toUpperCase()}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardWrapper>
      ) : null}
    </View>
  );
}
