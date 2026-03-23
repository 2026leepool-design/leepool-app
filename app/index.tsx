import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/utils/supabase';

export default function Index() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        const sessionResult = await supabase.auth.getSession();

        if (!isMounted) return;

        const hasSession = !!sessionResult.data.session;

        if (hasSession) {
          router.replace('/(tabs)/dashboard');
        } else {
          router.replace('/login');
        }
      } catch (error) {
        console.error(error);
        if (isMounted) router.replace('/login');
      } finally {
        if (isMounted) setChecking(false);
      }
    }

    checkAuth();
    return () => { isMounted = false; };
  }, []);

  if (!checking) return null;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0A0F1A',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
      }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          backgroundColor: 'rgba(0, 229, 255, 0.08)',
          borderWidth: 1,
          borderColor: 'rgba(0, 229, 255, 0.3)',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <ActivityIndicator size="large" color="#00E5FF" />
      </View>
      <Text
        style={{
          fontFamily: 'SpaceGrotesk_600SemiBold',
          fontSize: 10,
          letterSpacing: 4,
          color: '#4A5568',
        }}>
        LEEPOOL
      </Text>
    </View>
  );
}
