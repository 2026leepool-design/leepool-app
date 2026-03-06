import { useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Modal, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '@/utils/supabase';
import { loadKeys, generateAndSaveKeys, deleteKeys, type NostrKeys } from '@/utils/nostr';

// ─── Types ────────────────────────────────────────────────────────────────────

type Stats = {
  bookCount: number;
  totalValue: number;
  totalPages: number;
  readPages: number;
  readCount: number;
  forSaleCount: number;
};

const LANGUAGES = [
  { code: 'tr', flag: '🇹🇷' },
  { code: 'en', flag: '🇺🇸' },
  { code: 'es', flag: '🇪🇸' },
];

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  icon: string;
}) {
  return (
    <View
      className="flex-1 rounded-2xl p-4"
      style={{
        backgroundColor: '#131B2B',
        borderWidth: 1,
        borderColor: `${accent}22`,
        minHeight: 100,
      }}>
      <View className="flex-row items-center justify-between mb-2">
        <Text
          className="text-[10px] tracking-widest"
          style={{ fontFamily: 'SpaceGrotesk_400Regular', color: '#8892B0' }}>
          {label.toUpperCase()}
        </Text>
        <View
          className="w-7 h-7 rounded-lg items-center justify-center"
          style={{ backgroundColor: `${accent}18` }}>
          <Ionicons name={icon as 'book'} size={14} color={accent} />
        </View>
      </View>
      <Text
        className="text-2xl"
        style={{ fontFamily: 'SpaceGrotesk_700Bold', color: accent }}>
        {value}
      </Text>
      {sub ? (
        <Text
          className="text-[10px] mt-1"
          style={{ fontFamily: 'SpaceGrotesk_400Regular', color: '#4A5568' }}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

// ─── DashboardScreen ──────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const [stats, setStats] = useState<Stats>({
    bookCount: 0,
    totalValue: 0,
    totalPages: 0,
    readPages: 0,
    readCount: 0,
    forSaleCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [nostrKeys, setNostrKeys] = useState<NostrKeys | null>(null);
  const [nostrLoading, setNostrLoading] = useState(true);
  const [nostrActionLoading, setNostrActionLoading] = useState(false);
  const [isQrVisible, setIsQrVisible] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      async function loadStats() {
        setLoading(true);
        try {
          const { data, error } = await supabase
            .from('books')
            .select('current_value, total_pages, read_pages, status, is_for_sale');
          if (error) throw error;
          if (!isMounted) return;
          const rows = data ?? [];
          setStats({
            bookCount: rows.length,
            totalValue: rows.reduce((s, b) => s + (b.current_value ?? 0), 0),
            totalPages: rows.reduce((s, b) => s + (b.total_pages ?? 0), 0),
            readPages: rows.reduce((s, b) => s + (b.read_pages ?? 0), 0),
            readCount: rows.filter((b) => b.status === 'read').length,
            forSaleCount: rows.filter((b) => b.is_for_sale).length,
          });
        } catch {
          // silently fail
        } finally {
          if (isMounted) setLoading(false);
        }
      }
      async function loadUser() {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (isMounted && user) {
            setUserName(user.email?.split('@')[0] || t('user'));
          }
        } catch {
          // fail silently
        }
      }
      async function loadNostrKeys() {
        setNostrLoading(true);
        try {
          const keys = await loadKeys();
          if (isMounted) {
            setNostrKeys(keys);
            if (!userName && keys) {
              setUserName(`Cyber-${truncateNpub(keys.npub).replace('npub1', '').slice(0, 6)}`);
            }
          }
        } catch {
          if (isMounted) setNostrKeys(null);
        } finally {
          if (isMounted) setNostrLoading(false);
        }
      }
      loadStats();
      loadUser();
      loadNostrKeys();
      return () => { isMounted = false; };
    }, [t])
  );

  const handleSignOut = async () => {
    Alert.alert(t('confirm'), t('signOutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('signOut'),
        style: 'destructive',
        onPress: async () => {
          try {
            await Promise.all([
              supabase.auth.signOut(),
              deleteKeys(),
            ]);
            router.replace('/login');
          } catch (err: any) {
            Alert.alert(t('error'), err.message);
          }
        },
      },
    ]);
  };

  const handleGenerateIdentity = async () => {
    setNostrActionLoading(true);
    try {
      const keys = await generateAndSaveKeys();
      setNostrKeys(keys);
    } catch {
      // silently fail
    } finally {
      setNostrActionLoading(false);
    }
  };

  const handleDeleteIdentity = async () => {
    setNostrActionLoading(true);
    try {
      await deleteKeys();
      setNostrKeys(null);
    } catch {
      // silently fail
    } finally {
      setNostrActionLoading(false);
    }
  };

  const truncateNpub = (npub: string) => {
    if (npub.length <= 28) return npub;
    return `${npub.slice(0, 12)}...${npub.slice(-12)}`;
  };

  const progressPercent =
    stats.totalPages > 0 ? Math.round((stats.readPages / stats.totalPages) * 100) : 0;

  const formatValue = (val: number) =>
    val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  return (
    <SafeAreaView className="flex-1 bg-[#0A0F1A]" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}>

        {/* ── Header row ── */}
        <View className="flex-row items-center justify-between py-4">
          <View>
            <View className="flex-row items-center gap-2">
              <Text
                className="text-[#00E5FF] text-xl tracking-[0.2em]"
                style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                LEEPOOL
              </Text>
              <TouchableOpacity
                onPress={handleSignOut}
                className="w-8 h-8 rounded-lg items-center justify-center bg-red-500/10 border border-red-500/20">
                <Ionicons name="log-out-outline" size={16} color="#EF4444" />
              </TouchableOpacity>
            </View>
            <Text
              className="text-[#8892B0] text-[10px] tracking-widest mt-1"
              style={{ fontFamily: 'SpaceGrotesk_500Medium' }}>
              {userName ? `${t('welcome')}, ${userName}` : t('management')}
            </Text>
          </View>
          <View className="flex-row gap-2">
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                onPress={() => i18n.changeLanguage(lang.code)}
                className="w-9 h-9 rounded-xl items-center justify-center border"
                style={{
                  backgroundColor: i18n.language.startsWith(lang.code)
                    ? 'rgba(0, 229, 255, 0.15)'
                    : '#131B2B',
                  borderColor: i18n.language.startsWith(lang.code)
                    ? '#00E5FF'
                    : 'rgba(136, 146, 176, 0.2)',
                }}>
                <Text style={{ fontSize: 16 }}>{lang.flag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Overall progress card ── */}
        <View
          className="rounded-2xl p-5 mb-4"
          style={{
            backgroundColor: '#131B2B',
            borderWidth: 1,
            borderColor: 'rgba(0, 229, 255, 0.15)',
          }}>
          <View className="flex-row justify-between items-center mb-3">
            <Text
              className="text-[#8892B0] text-[10px] tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {t('progressTotal')}
            </Text>
            <Text
              className="text-[#00E5FF] text-sm"
              style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
              {loading ? '—' : `${progressPercent}%`}
            </Text>
          </View>
          <View
            className="w-full rounded-full overflow-hidden mb-3"
            style={{ height: 8, backgroundColor: '#0A0F1A' }}>
            <View
              className="rounded-full"
              style={{
                height: 8,
                width: `${progressPercent}%`,
                backgroundColor: '#00E5FF',
              }}
            />
          </View>
          <Text
            className="text-[#8892B0] text-xs"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
            {loading
              ? '—'
              : `${stats.readPages.toLocaleString()} / ${stats.totalPages.toLocaleString()} ${t('pagesRead')}`}
          </Text>
        </View>

        {/* ── Stats grid row 1 ── */}
        {loading ? (
          <View className="items-center py-10">
            <ActivityIndicator color="#00E5FF" />
          </View>
        ) : (
          <>
            <View className="flex-row gap-3 mb-3">
              <StatCard
                label={t('books')}
                value={String(stats.bookCount)}
                sub={`${stats.readCount} ${t('filterRead').toLowerCase()}`}
                accent="#00E5FF"
                icon="book-outline"
              />
              <StatCard
                label={t('libraryValue')}
                value={formatValue(stats.totalValue)}
                accent="#A78BFA"
                icon="wallet-outline"
              />
            </View>
            <View className="flex-row gap-3 mb-5">
              <StatCard
                label={t('filterForSale')}
                value={String(stats.forSaleCount)}
                sub="⚡ sats"
                accent="#00FF9D"
                icon="storefront-outline"
              />
              <StatCard
                label={t('filterRead')}
                value={`${progressPercent}%`}
                sub={`${stats.totalPages.toLocaleString()} ${t('totalPages').toLowerCase()}`}
                accent="#F59E0B"
                icon="checkmark-circle-outline"
              />
            </View>
          </>
        )}

        {/* ── Nostr Identity ── */}
        <View
          className="rounded-2xl p-5 mb-4"
          style={{
            backgroundColor: '#131B2B',
            borderWidth: 1,
            borderColor: 'rgba(0, 229, 255, 0.15)',
          }}>
          {nostrLoading ? (
            <View className="py-4 items-center">
              <ActivityIndicator size="small" color="#00E5FF" />
            </View>
          ) : nostrKeys ? (
            <>
              <Text
                className="text-[#8892B0] text-[10px] tracking-widest mb-2"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                {t('nostrIdentityLabel')}
              </Text>
              <Text
                className="text-[#00E5FF] text-sm font-mono mb-3"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}>
                {truncateNpub(nostrKeys.npub)}
              </Text>

              {/* ── Copy & QR row ── */}
              <View className="flex-row gap-3 mb-3">
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={async () => {
                    await Clipboard.setStringAsync(nostrKeys.npub);
                    Alert.alert(t('success'), t('npubCopied'));
                  }}
                  className="flex-row items-center gap-2 rounded-xl px-4 py-2.5"
                  style={{
                    backgroundColor: 'rgba(0, 229, 255, 0.1)',
                    borderWidth: 1,
                    borderColor: 'rgba(0, 229, 255, 0.3)',
                  }}>
                  <Ionicons name="copy-outline" size={16} color="#00E5FF" />
                  <Text
                    className="text-xs tracking-widest"
                    style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#00E5FF' }}>
                    {t('copy')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => setIsQrVisible(true)}
                  className="flex-row items-center gap-2 rounded-xl px-4 py-2.5"
                  style={{
                    backgroundColor: 'rgba(0, 229, 255, 0.1)',
                    borderWidth: 1,
                    borderColor: 'rgba(0, 229, 255, 0.3)',
                  }}>
                  <Ionicons name="qr-code-outline" size={16} color="#00E5FF" />
                  <Text
                    className="text-xs tracking-widest"
                    style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#00E5FF' }}>
                    QR
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={handleDeleteIdentity}
                disabled={nostrActionLoading}
                className="self-start">
                <Text
                  className="text-xs"
                  style={{
                    fontFamily: 'SpaceGrotesk_400Regular',
                    color: '#EF4444',
                    opacity: nostrActionLoading ? 0.5 : 1,
                  }}>
                  {t('deleteIdentity')}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text
                className="text-[#8892B0] text-[10px] tracking-widest mb-3"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                {t('nostrConnectTitle')}
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleGenerateIdentity}
                disabled={nostrActionLoading}
                className="rounded-xl py-4 items-center justify-center"
                style={{
                  backgroundColor: 'rgba(0, 229, 255, 0.15)',
                  borderWidth: 1,
                  borderColor: '#00E5FF',
                }}>
                {nostrActionLoading ? (
                  <ActivityIndicator size="small" color="#00E5FF" />
                ) : (
                  <Text
                    className="text-base tracking-[0.1em]"
                    style={{
                      fontFamily: 'SpaceGrotesk_700Bold',
                      color: '#00E5FF',
                    }}>
                    {t('generateIdentity')}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Quick actions ── */}
        <TouchableOpacity
          activeOpacity={0.8}
          className="rounded-2xl py-5 items-center justify-center mb-3"
          style={{ backgroundColor: '#00E5FF' }}
          onPress={() => router.push('/add-book')}>
          <Text
            className="text-[#0A0F1A] text-base tracking-[0.15em]"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            + {t('addBook')}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── QR Modal ── */}
      <Modal
        visible={isQrVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setIsQrVisible(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.88)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
          }}>
          <View
            style={{
              backgroundColor: '#0D1525',
              borderRadius: 24,
              padding: 32,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(0, 229, 255, 0.25)',
              shadowColor: '#00E5FF',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.25,
              shadowRadius: 24,
              elevation: 12,
            }}>
            {/* Label */}
            <Text
              className="text-[10px] tracking-[0.3em] mb-5"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#8892B0' }}>
              {t('nostrIdentityLabel').toUpperCase()}
            </Text>

            {/* QR Code */}
            <View
              style={{
                padding: 16,
                backgroundColor: '#0B0E14',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: 'rgba(0, 229, 255, 0.2)',
              }}>
              <QRCode
                value={nostrKeys?.npub || ''}
                size={220}
                color="#00E5FF"
                backgroundColor="#0B0E14"
              />
            </View>

            {/* Truncated npub below QR */}
            <Text
              className="text-[11px] mt-4 mb-6"
              style={{
                fontFamily: 'SpaceGrotesk_500Medium',
                color: '#4A5568',
                letterSpacing: 1,
              }}>
              {nostrKeys ? truncateNpub(nostrKeys.npub) : ''}
            </Text>

            {/* Close button */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIsQrVisible(false)}
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                borderWidth: 1,
                borderColor: 'rgba(239, 68, 68, 0.4)',
                borderRadius: 12,
                paddingVertical: 12,
                paddingHorizontal: 40,
              }}>
              <Text
                className="text-sm tracking-widest"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#EF4444' }}>
                {t('close').toUpperCase()}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
