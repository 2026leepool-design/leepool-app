/* PRNG: tweetnacl / expo-crypto öncesi yüklenmeli (Hermes + web). */
import 'react-native-get-random-values';
import 'text-encoding';
import '../global.css';
import '@/i18n';
import {
  useFonts,
  SpaceGrotesk_300Light,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_300Light,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <View className="flex-1 bg-[#0A0F1A]">
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0A0F1A' },
          animation: 'fade',
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="add-book"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="edit-book"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="synopsis"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen name="chat" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(library)" />
        <Stack.Screen name="(market)" />
        <Stack.Screen name="(stats)" />
        <Stack.Screen
          name="modal"
          options={{ presentation: 'modal', headerShown: true }}
        />
      </Stack>
      <StatusBar style="light" />
    </View>
    </GestureHandlerRootView>
  );
}
