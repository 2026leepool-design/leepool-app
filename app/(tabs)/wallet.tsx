import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getWalletBalanceWithNwc, loadNwcConnection } from '@/utils/nwc';

export default function WalletScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const connection = await loadNwcConnection();
      setConnected(!!connection);
      if (!connection) {
        setBalance(null);
        return;
      }
      setBalance(await getWalletBalanceWithNwc());
      setUpdatedAt(new Date());
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  return (
    <SafeAreaView className="flex-1 bg-[#0A0F1A]" edges={['top']}>
      <View className="px-5 py-4">
        <Text className="text-[#FFD700] text-xl tracking-[0.2em]" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
          {t('walletTitle')}
        </Text>
        <Text className="text-[#4A5568] text-xs mt-1" style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
          Nostr Wallet Connect
        </Text>
      </View>
      <View className="mx-5 rounded-2xl p-6" style={{ backgroundColor: '#131B2B', borderWidth: 1, borderColor: 'rgba(255,215,0,0.25)' }}>
        <View className="flex-row items-center justify-between mb-6">
          <View className="w-12 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: 'rgba(255,215,0,0.12)' }}>
            <Ionicons name="wallet" size={26} color="#FFD700" />
          </View>
          <View className="flex-row items-center gap-2">
            <View className="w-2 h-2 rounded-full" style={{ backgroundColor: connected ? '#00FF9D' : '#8892B0' }} />
            <Text className="text-[#8892B0] text-[10px] tracking-widest" style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
              {connected ? 'CONNECTED' : 'NOT CONNECTED'}
            </Text>
          </View>
        </View>
        <Text className="text-[#8892B0] text-xs mb-2" style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>{t('walletBalance')}</Text>
        <Text className="text-[#FFD700] text-4xl" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
          {loading ? '—' : balance == null ? '—' : `${balance.toLocaleString()} sats`}
        </Text>
        {updatedAt ? <Text className="text-[#4A5568] text-[10px] mt-2" style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>{t('walletLastUpdated')} {updatedAt.toLocaleTimeString()}</Text> : null}
        {error ? <Text className="text-[#F87171] text-xs mt-3" style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>{error}</Text> : null}
      </View>
      <View className="px-5 mt-5">
        {connected ? (
          <TouchableOpacity onPress={() => void refresh()} disabled={loading} className="rounded-2xl py-4 items-center" style={{ backgroundColor: 'rgba(255,215,0,0.12)', borderWidth: 1, borderColor: '#FFD700' }}>
            {loading ? <ActivityIndicator color="#FFD700" /> : <Text className="text-[#FFD700] text-sm tracking-widest" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>{t('walletRefresh').toUpperCase()}</Text>}
          </TouchableOpacity>
        ) : (
          <>
            <Text className="text-[#8892B0] text-sm leading-6 mb-4" style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>{t('walletConnectFirst')}</Text>
            <TouchableOpacity onPress={() => router.push('/profile')} className="rounded-2xl py-4 items-center" style={{ backgroundColor: 'rgba(255,215,0,0.12)', borderWidth: 1, borderColor: '#FFD700' }}>
              <Text className="text-[#FFD700] text-sm tracking-widest" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>{t('walletOpenProfile').toUpperCase()}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
