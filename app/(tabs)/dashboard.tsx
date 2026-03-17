import { deleteKeys, generateAndSaveKeys, importNsecKey, loadKeys, type NostrKeys } from '@/utils/nostr';
import { supabase } from '@/utils/supabase';
import { fetchBitcoinRates, type BtcRates } from '@/utils/currency';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Animated, Image, Modal, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Swipeable } from 'react-native-gesture-handler';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import QRCode from 'react-native-qrcode-svg';
import { KeyboardWrapper } from '@/components/KeyboardWrapper';
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal';
import { analyzeBookCover, searchBooksOmni } from '@/utils/api';
import { registerForPushNotificationsAsync } from '@/utils/notifications';

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
  onPress,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  icon: string;
  onPress?: () => void;
}) {
  const CardContent = (
    <View
      className="flex-1 rounded-2xl p-4"
      style={{
        backgroundColor: '#131B2B',
        borderWidth: 1,
        borderColor: `${accent}22`,
        minHeight: 100,
      }}>
      <View className="flex-row justify-between items-start mb-2">
        <Text
          className="text-[10px] tracking-widest flex-1 mr-2"
          style={{ fontFamily: 'SpaceGrotesk_400Regular', color: '#8892B0', flexShrink: 1 }}
          numberOfLines={1}>
          {label.toUpperCase()}
        </Text>
        <View
          className="w-7 h-7 rounded-lg items-center justify-center shrink-0"
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

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        className="flex-1"
        style={{ minHeight: 100 }}>
        {CardContent}
      </TouchableOpacity>
    );
  }

  return <View className="flex-1">{CardContent}</View>;
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
  const [isExportModalVisible, setIsExportModalVisible] = useState(false);
  const [importNsec, setImportNsec] = useState('');
  const [userName, setUserName] = useState<string | null>(null);
  const [btcRates, setBtcRates] = useState<BtcRates | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeModalVisible, setBarcodeModalVisible] = useState(false);
  const [analyzingCover, setAnalyzingCover] = useState(false);
  const [omniSearchLoading, setOmniSearchLoading] = useState(false);
  /** Web: Chrome giriş sonrası ilk odaktaki input'a email basmasın — kısa süre readOnly */
  const [searchWebUnlock, setSearchWebUnlock] = useState(Platform.OS !== 'web');
  const nostrSwipeableRef = useRef<Swipeable>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const id = setTimeout(() => setSearchWebUnlock(true), 450);
    return () => clearTimeout(id);
  }, []);

  // Chart States
  const [isValueChartVisible, setIsValueChartVisible] = useState(false);
  const [isReadChartVisible, setIsReadChartVisible] = useState(false);
  const [valueTimeRange, setValueTimeRange] = useState('1M');
  const [readTimeRange, setReadTimeRange] = useState('1W');

  type ChartPoint = { value: number; label: string };
  type RawLog = { created_at: string; pages_read: number };

  const [allReadingLogs, setAllReadingLogs] = useState<RawLog[]>([]);

  const MONTHS_KEYS = ['monthJan', 'monthFeb', 'monthMar', 'monthApr', 'monthMay', 'monthJun', 'monthJul', 'monthAug', 'monthSep', 'monthOct', 'monthNov', 'monthDec'];
  const DAYS_KEYS = ['daySun', 'dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri', 'daySat'];

  function groupReadingLogs(logs: RawLog[], range: string): ChartPoint[] {
    const now = new Date();
    const cutoff = new Date(now);

    if (range === '1W') cutoff.setDate(now.getDate() - 6);
    else if (range === '1M') cutoff.setDate(now.getDate() - 27);
    else if (range === '3M') cutoff.setMonth(now.getMonth() - 2);
    else if (range === '6M') cutoff.setMonth(now.getMonth() - 5);
    else if (range === '1Y') cutoff.setFullYear(now.getFullYear() - 1);
    cutoff.setHours(0, 0, 0, 0);

    const filtered = logs.filter((l) => new Date(l.created_at) >= cutoff);
    const map = new Map<string, number>();

    for (const log of filtered) {
      const d = new Date(log.created_at);
      let key = '';
      if (range === '1W') {
        key = d.toISOString().slice(0, 10);
      } else if (range === '1M') {
        const weekNum = Math.floor((now.getTime() - d.getTime()) / (7 * 86400000));
        key = String(Math.min(3, weekNum));
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
      map.set(key, (map.get(key) ?? 0) + log.pages_read);
    }

    if (range === '1W') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now);
        d.setDate(now.getDate() - (6 - i));
        d.setHours(0, 0, 0, 0);
        const key = d.toISOString().slice(0, 10);
        return { value: map.get(key) ?? 0, label: t(DAYS_KEYS[d.getDay()]) };
      });
    }

    if (range === '1M') {
      return [3, 2, 1, 0].map((w) => ({
        value: map.get(String(w)) ?? 0,
        label: `${4 - w}. ${t('weekAbbr')}`,
      }));
    }

    const months: ChartPoint[] = [];
    const count = range === '3M' ? 3 : range === '6M' ? 6 : 12;
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = range === '1Y' && i % 3 !== 0
        ? ''
        : t(MONTHS_KEYS[d.getMonth()]);
      months.push({ value: map.get(key) ?? 0, label });
    }
    return months;
  }

  const getValueData = () => {
    switch (valueTimeRange) {
      case '1W': return [
        { value: 120, label: t('dayMon') }, { value: 125, label: t('dayTue') }, { value: 122, label: t('dayWed') },
        { value: 130, label: t('dayThu') }, { value: 133, label: t('dayFri') }, { value: 135, label: t('daySat') }, { value: 138, label: t('daySun') },
      ];
      case '1M': return [
        { value: 100, label: `1. ${t('weekAbbr')}` }, { value: 115, label: `2. ${t('weekAbbr')}` }, { value: 125, label: `3. ${t('weekAbbr')}` }, { value: 133, label: `4. ${t('weekAbbr')}` },
      ];
      case '3M': return [
        { value: 90, label: t('monthJan') }, { value: 110, label: t('monthFeb') }, { value: 133, label: t('monthMar') },
      ];
      case '6M': return [
        { value: 70, label: t('monthOct') }, { value: 85, label: t('monthNov') }, { value: 90, label: t('monthDec') },
        { value: 105, label: t('monthJan') }, { value: 120, label: t('monthFeb') }, { value: 133, label: t('monthMar') },
      ];
      case '1Y': return [
        { value: 50, label: '2025' }, { value: 80, label: t('monthJun') }, { value: 110, label: t('monthSep') }, { value: 133, label: '2026' },
      ];
      default: return [];
    }
  };

  const currentValueData = getValueData();
  const currentReadData = groupReadingLogs(allReadingLogs, readTimeRange);
  const totalReadInRange = currentReadData.reduce((acc, curr) => acc + curr.value, 0);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      async function loadStats() {
        setLoading(true);
        try {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          const statsQuery = supabase
            .from('books')
            .select('current_value, total_pages, read_pages, status, is_for_sale');
          if (authUser?.id) statsQuery.eq('user_id', authUser.id);
          const { data, error } = await statsQuery;
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
      async function loadRates() {
        const rates = await fetchBitcoinRates();
        if (isMounted && rates) setBtcRates(rates);
      }
      async function fetchReadingLogs() {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.id || !isMounted) return;
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          const { data } = await supabase
            .from('reading_logs')
            .select('created_at, pages_read')
            .eq('user_id', user.id)
            .gte('created_at', oneYearAgo.toISOString())
            .order('created_at', { ascending: true });
          if (isMounted && data) setAllReadingLogs(data);
        } catch {
          // silently fail
        }
      }
      loadStats();
      loadUser();
      loadNostrKeys();
      loadRates();
      fetchReadingLogs();
      return () => { isMounted = false; };
    }, [t])
  );

  const handleSignOut = async () => {
    const doSignOut = async () => {
      try {
        if (Platform.OS !== 'web') {
          try {
            const tokenToDelete = await registerForPushNotificationsAsync();
            if (tokenToDelete) {
              const { error } = await supabase
                .from('push_tokens')
                .delete()
                .match({ token: tokenToDelete });
              if (error) console.error('Token veritabanından silinemedi:', error.message);
            }
          } catch (error) {
            console.log('Token silinirken hata:', error);
          }
        }
        await supabase.auth.signOut();
        router.replace('/login');
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (Platform.OS === 'web') {
          (window as any).alert(msg);
        } else {
          Alert.alert(t('error'), msg);
        }
      }
    };

    if (Platform.OS === 'web') {
      if ((window as any).confirm(t('signOutConfirm'))) await doSignOut();
      return;
    }

    Alert.alert(t('confirm'), t('signOutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('signOut'), style: 'destructive', onPress: doSignOut },
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

  const handleImportIdentity = async () => {
    const text = importNsec.trim();
    if (!text) {
      const msg = t('fillAllFields');
      if (Platform.OS === 'web') {
        (window as any).alert(msg);
      } else {
        Alert.alert(t('error'), msg);
      }
      return;
    }

    setNostrActionLoading(true);
    try {
      const keys = await importNsecKey(text);
      setNostrKeys(keys);
      setImportNsec('');
      setUserName(`Cyber-${truncateNpub(keys.npub).replace('npub1', '').slice(0, 6)}`);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (Platform.OS === 'web') {
        (window as any).alert(msg);
      } else {
        Alert.alert(t('error'), msg);
      }
    } finally {
      setNostrActionLoading(false);
    }
  };

  const handleDeleteIdentity = () => {
    Alert.alert(
      t('deleteIdentityTitle'),
      t('deleteIdentityWarning'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('yesDelete'),
          style: 'destructive',
          onPress: async () => {
            setNostrActionLoading(true);
            try {
              await deleteKeys();
              setNostrKeys(null);
            } catch {
              // silently fail
            } finally {
              setNostrActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const truncateNpub = (npub: string) => {
    if (npub.length <= 28) return npub;
    return `${npub.slice(0, 12)}...${npub.slice(-12)}`;
  };

  const runOmniSearchWithApiCheck = useCallback(
    async (rawQuery: string) => {
      const q = rawQuery.trim();
      if (!q) return;
      setOmniSearchLoading(true);
      try {
        const results = await searchBooksOmni(q);
        if (!results?.length) {
          Alert.alert(t('noOmniSearchTitle'), t('noOmniSearchMessage'));
          return;
        }
        router.push(`/search?query=${encodeURIComponent(q)}`);
      } finally {
        setOmniSearchLoading(false);
      }
    },
    [router, t]
  );

  const handleCoverSearch = useCallback(async () => {
    Alert.alert(t('photoOptions'), '', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('takePhoto'),
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert(t('error'), t('cameraPermission'));
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            quality: 0.5,
            base64: true,
          });
          if (!result.canceled && result.assets[0]?.base64) {
            setAnalyzingCover(true);
            try {
              const raw = result.assets[0].base64;
              const query = await analyzeBookCover(raw);
              if (query) await runOmniSearchWithApiCheck(query);
            } finally {
              setAnalyzingCover(false);
            }
          }
        },
      },
      {
        text: t('chooseGallery'),
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert(t('error'), t('cameraPermission'));
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            quality: 0.5,
            base64: true,
          });
          if (!result.canceled && result.assets[0]?.base64) {
            setAnalyzingCover(true);
            try {
              const raw = result.assets[0].base64;
              const query = await analyzeBookCover(raw);
              if (query) await runOmniSearchWithApiCheck(query);
            } finally {
              setAnalyzingCover(false);
            }
          }
        },
      },
    ]);
  }, [t, runOmniSearchWithApiCheck]);

  const progressPercent =
    stats.totalPages > 0 ? Math.round((stats.readPages / stats.totalPages) * 100) : 0;

  const formatValue = (val: number) =>
    val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  return (
    <>
    <KeyboardWrapper
      edges={['top']}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
      {/* ── Header row ── */}
        <View className="flex-row items-center justify-between py-3">
          <View>
            <View className="flex-row items-center gap-2">
              <Image
                source={require('../../assets/images/favicon.png')}
                style={{ width: 22, height: 22, borderRadius: 6 }}
                resizeMode="contain"
              />
              <Text
                className="text-[#00E5FF] text-xl tracking-[0.2em]"
                style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                LEEPOOL
              </Text>
              <TouchableOpacity
                onPress={handleSignOut}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255, 0, 60, 0.12)',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 0, 60, 0.35)',
                }}>
                <Ionicons name="log-out-outline" size={16} color="#FF003C" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => router.push('/profile')} activeOpacity={0.7}>
              <Text
                className="text-[#8892B0] text-[10px] tracking-widest mt-1"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}>
                {userName ? `${t('welcome')}, ${userName}` : t('management')}
              </Text>
            </TouchableOpacity>
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

        {/* ── Omni-Search Bar ── */}
        <View
          className="flex-row items-center bg-[#0B0E14] rounded-lg px-3 py-2 mb-4"
          style={{ borderWidth: 1, borderColor: 'rgba(0, 229, 255, 0.5)' }}>
          {Platform.OS === 'web' ? (
            <View
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                opacity: 0,
                overflow: 'hidden',
                zIndex: -1,
                left: -2000,
              }}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
              <TextInput
                nativeID="leepool-chrome-decoy-email"
                autoComplete="username"
                textContentType="username"
                keyboardType="email-address"
                editable={false}
              />
              <TextInput
                nativeID="leepool-chrome-decoy-password"
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                editable={false}
              />
            </View>
          ) : null}
          {omniSearchLoading ? (
            <ActivityIndicator size="small" color="#00E5FF" style={{ marginRight: 10 }} />
          ) : (
            <Ionicons name="search-outline" size={20} color="#00E5FF" style={{ marginRight: 10 }} />
          )}
          <TextInput
            className="flex-1 py-2.5 text-base"
            style={[
              { fontFamily: 'SpaceGrotesk_400Regular', color: '#E2E8F0' },
              Platform.OS === 'web' ? { backgroundColor: '#0B0E14' } : null,
            ]}
            placeholder={t('searchPlaceholder')}
            placeholderTextColor="#4A5568"
            inputMode="search"
            keyboardType="web-search"
            nativeID="cyber-search-bar"
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            autoCorrect={false}
            spellCheck={false}
            autoCapitalize="none"
            {...(Platform.OS === 'web'
              ? ({
                  role: 'searchbox',
                  name: 'leepool_omni_book_search',
                  'data-form-type': 'other',
                  'data-lpignore': 'true',
                  'data-1p-ignore': 'true',
                } as Record<string, unknown>)
              : { accessibilityRole: 'search' as const })}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => {
              void runOmniSearchWithApiCheck(searchQuery);
            }}
            returnKeyType="search"
            readOnly={
              Platform.OS === 'web' &&
              (!searchWebUnlock || analyzingCover || omniSearchLoading)
            }
            editable={
              Platform.OS === 'web'
                ? searchWebUnlock && !analyzingCover && !omniSearchLoading
                : !analyzingCover && !omniSearchLoading
            }
          />
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setBarcodeModalVisible(true)}
            disabled={analyzingCover || omniSearchLoading}
            className="w-9 h-9 rounded-lg items-center justify-center mr-1"
            style={{ backgroundColor: 'rgba(0, 229, 255, 0.1)' }}>
            <Ionicons name="barcode-outline" size={20} color="#00E5FF" />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleCoverSearch}
            disabled={analyzingCover || omniSearchLoading}
            className="w-9 h-9 rounded-lg items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 229, 255, 0.1)' }}>
            {analyzingCover || omniSearchLoading ? (
              <ActivityIndicator size="small" color="#00E5FF" />
            ) : (
              <Ionicons name="camera-outline" size={20} color="#00E5FF" />
            )}
          </TouchableOpacity>
        </View>

        <BarcodeScannerModal
          visible={barcodeModalVisible}
          onClose={() => setBarcodeModalVisible(false)}
          onScan={(isbn) => {
            setBarcodeModalVisible(false);
            void runOmniSearchWithApiCheck(`isbn:${isbn}`);
          }}
        />

        {/* ── BTC Live Ticker ── */}
        {btcRates && (
          <View
            className="flex-row items-center gap-3 rounded-xl px-4 py-2 mb-4"
            style={{
              backgroundColor: 'rgba(247, 147, 26, 0.08)',
              borderWidth: 1,
              borderColor: 'rgba(247, 147, 26, 0.25)',
            }}>
            <Text style={{ fontSize: 14 }}>₿</Text>
            <Text
              className="text-[10px] tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#F7931A' }}>
              BTC/USD: ${btcRates.usd.toLocaleString()}
            </Text>
            <View style={{ width: 1, height: 10, backgroundColor: 'rgba(247, 147, 26, 0.3)' }} />
            <Text
              className="text-[10px] tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#F7931A' }}>
              BTC/EUR: €{btcRates.eur.toLocaleString()}
            </Text>
            <View style={{ flex: 1 }} />
            <View
              className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(0, 255, 157, 0.12)' }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#00FF9D' }} />
              <Text
                className="text-[8px] tracking-widest"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#00FF9D' }}>
                LIVE
              </Text>
            </View>
          </View>
        )}

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
                onPress={() => router.push('/(tabs)/library')}
              />
              <StatCard
                label={t('libraryValue')}
                value={formatValue(stats.totalValue)}
                accent="#A78BFA"
                icon="wallet-outline"
                onPress={() => setIsValueChartVisible(true)}
              />
            </View>
            <View className="flex-row gap-3 mb-5">
              <StatCard
                label={t('filterForSale')}
                value={String(stats.forSaleCount)}
                sub={btcRates ? `₿ $${Math.round((1 / 100_000_000) * btcRates.usd * 100_000).toLocaleString()}/100k sats` : '⚡ sats'}
                accent="#00FF9D"
                icon="storefront-outline"
                onPress={() => router.push('/my-sales')}
              />
              <StatCard
                label={t('filterRead')}
                value={`${progressPercent}%`}
                sub={`${stats.totalPages.toLocaleString()} ${t('totalPages').toLowerCase()}`}
                accent="#F59E0B"
                icon="checkmark-circle-outline"
                onPress={() => setIsReadChartVisible(true)}
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
            <Swipeable
              ref={nostrSwipeableRef}
              renderRightActions={(_, dragX) => {
                const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0.7], extrapolate: 'clamp' });
                return (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      nostrSwipeableRef.current?.close();
                      handleDeleteIdentity();
                    }}
                    style={{
                      width: 76,
                      backgroundColor: 'rgba(255, 80, 80, 0.12)',
                      borderWidth: 1,
                      borderColor: 'rgba(255, 80, 80, 0.3)',
                      borderRadius: 16,
                      marginLeft: 8,
                      marginVertical: 4,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}>
                    <Animated.View style={{ alignItems: 'center', transform: [{ scale }] }}>
                      <Ionicons name="trash-outline" size={22} color="#FF5050" />
                      <Text style={{ color: '#FF5050', fontSize: 9, fontFamily: 'SpaceGrotesk_600SemiBold', marginTop: 4, letterSpacing: 1 }}>
                        DEL
                      </Text>
                    </Animated.View>
                  </TouchableOpacity>
                );
              }}
              overshootRight={false}
              friction={2}>
              <View>
                <Text
                  className="text-[#8892B0] text-[10px] tracking-widest mb-2"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                  {t('nostrIdentityLabel')}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={async () => {
                    await Clipboard.setStringAsync(nostrKeys.npub);
                    Alert.alert(t('success'), t('copied'));
                  }}>
                  <Text
                    className="text-[#00E5FF] text-sm font-mono mb-3"
                    style={{ fontFamily: 'SpaceGrotesk_500Medium' }}>
                    {truncateNpub(nostrKeys.npub)}
                  </Text>
                </TouchableOpacity>
                <View className="flex-row gap-2 flex-wrap">
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setIsQrVisible(true)}
                    className="flex-row items-center gap-2 rounded-xl px-3 py-2.5"
                    style={{
                      backgroundColor: 'rgba(0, 229, 255, 0.1)',
                      borderWidth: 1,
                      borderColor: 'rgba(0, 229, 255, 0.3)',
                    }}>
                    <Ionicons name="qr-code-outline" size={15} color="#00E5FF" />
                    <Text className="text-xs tracking-widest" style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#00E5FF' }}>QR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setIsExportModalVisible(true)}
                    className="flex-row items-center gap-2 rounded-xl px-3 py-2.5"
                    style={{
                      backgroundColor: 'rgba(167, 139, 250, 0.1)',
                      borderWidth: 1,
                      borderColor: 'rgba(167, 139, 250, 0.4)',
                    }}>
                    <Ionicons name="lock-closed-outline" size={15} color="#A78BFA" />
                    <Text className="text-xs tracking-widest" style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#A78BFA' }}>{t('exportKey')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Swipeable>
          ) : (
            <>
              <Text
                className="text-[#8892B0] text-[10px] tracking-widest mb-3"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                {t('nostrConnectTitle')}
              </Text>

              {/* Import nsec */}
              <View className="mb-4 gap-3">
                <TextInput
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    backgroundColor: '#0A0F1A',
                    borderWidth: 1,
                    borderColor: 'rgba(167, 139, 250, 0.3)',
                    fontFamily: 'SpaceGrotesk_400Regular',
                    color: '#A78BFA',
                  }}
                  placeholderTextColor="#4A5568"
                  placeholder={t('nsecPlaceholder')}
                  value={importNsec}
                  onChangeText={setImportNsec}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleImportIdentity}
                  disabled={nostrActionLoading}
                  className="rounded-xl py-3 items-center justify-center"
                  style={{
                    backgroundColor: 'rgba(167, 139, 250, 0.12)',
                    borderWidth: 1,
                    borderColor: '#A78BFA',
                  }}>
                  {nostrActionLoading ? (
                    <ActivityIndicator size="small" color="#A78BFA" />
                  ) : (
                    <Text
                      className="text-xs tracking-[0.1em]"
                      style={{
                        fontFamily: 'SpaceGrotesk_700Bold',
                        color: '#E879F9',
                      }}>
                      {t('importKey').toUpperCase()}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              <View className="flex-row items-center gap-2 mb-4">
                <View className="flex-1 h-[1px] bg-white/5" />
                <Text className="text-[10px] text-[#4A5568] uppercase tracking-widest">{t('orDivider')}</Text>
                <View className="flex-1 h-[1px] bg-white/5" />
              </View>

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

    </KeyboardWrapper>

      {/* ── Export (nsec Backup) Modal ── */}
      <Modal
        visible={isExportModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setIsExportModalVisible(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.92)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}>
          <View
            style={{
              backgroundColor: '#0D1525',
              borderRadius: 24,
              padding: 28,
              width: '100%',
              borderWidth: 1,
              borderColor: 'rgba(239, 68, 68, 0.35)',
              shadowColor: '#EF4444',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.2,
              shadowRadius: 20,
              elevation: 12,
            }}>
            {/* Warning header */}
            <View className="flex-row items-center gap-2 mb-4">
              <Ionicons name="warning-outline" size={20} color="#EF4444" />
              <Text
                style={{
                  fontFamily: 'SpaceGrotesk_700Bold',
                  fontSize: 14,
                  color: '#EF4444',
                  letterSpacing: 1,
                }}>
                {t('exportKeyTitle').toUpperCase()}
              </Text>
            </View>

            {/* Warning message */}
            <View
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                borderWidth: 1,
                borderColor: 'rgba(239, 68, 68, 0.25)',
                borderRadius: 12,
                padding: 14,
                marginBottom: 20,
              }}>
              <Text
                style={{
                  fontFamily: 'SpaceGrotesk_500Medium',
                  fontSize: 12,
                  color: '#FCA5A5',
                  lineHeight: 18,
                }}>
                {t('exportKeyWarning')}
              </Text>
            </View>

            {/* nsec display */}
            <Text
              className="text-[10px] tracking-[0.25em] mb-2"
              style={{ fontFamily: 'SpaceGrotesk_400Regular', color: '#8892B0' }}>
              {t('privateKeyLabel').toUpperCase()}
            </Text>
            <View
              style={{
                backgroundColor: '#070B14',
                borderRadius: 10,
                padding: 14,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: 'rgba(167, 139, 250, 0.2)',
              }}>
              <Text
                selectable
                style={{
                  fontFamily: 'SpaceGrotesk_400Regular',
                  fontSize: 11,
                  color: '#A78BFA',
                  letterSpacing: 0.5,
                  lineHeight: 18,
                }}>
                {nostrKeys?.nsec ?? ''}
              </Text>
            </View>

            {/* Copy nsec button */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={async () => {
                if (nostrKeys?.nsec) {
                  await Clipboard.setStringAsync(nostrKeys.nsec);
                  Alert.alert(t('success'), t('nsecCopied'));
                }
              }}
              style={{
                backgroundColor: 'rgba(167, 139, 250, 0.12)',
                borderWidth: 1,
                borderColor: 'rgba(167, 139, 250, 0.4)',
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 12,
              }}>
              <Ionicons name="copy-outline" size={15} color="#A78BFA" />
              <Text
                style={{
                  fontFamily: 'SpaceGrotesk_600SemiBold',
                  fontSize: 12,
                  color: '#A78BFA',
                  letterSpacing: 2,
                }}>
                {t('copy').toUpperCase()}
              </Text>
            </TouchableOpacity>

            {/* Close button */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIsExportModalVisible(false)}
              style={{
                backgroundColor: 'rgba(74, 85, 104, 0.15)',
                borderWidth: 1,
                borderColor: 'rgba(74, 85, 104, 0.35)',
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
              }}>
              <Text
                style={{
                  fontFamily: 'SpaceGrotesk_600SemiBold',
                  fontSize: 12,
                  color: '#8892B0',
                  letterSpacing: 2,
                }}>
                {t('close').toUpperCase()}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

      {/* ── Value Chart Modal ── */}
      <Modal
        visible={isValueChartVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setIsValueChartVisible(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <View
            style={{
              backgroundColor: '#0B0E14',
              borderRadius: 24,
              padding: 24,
              width: '90%',
              borderWidth: 1,
              borderColor: 'rgba(176, 38, 255, 0.2)',
            }}>
            {/* Close Button Absolute */}
            <TouchableOpacity 
              onPress={() => setIsValueChartVisible(false)} 
              className="absolute top-4 right-4 w-8 h-8 rounded-full items-center justify-center bg-white/5 z-10"
            >
              <Ionicons name="close" size={20} color="#8892B0" />
            </TouchableOpacity>

            <View className="mb-6">
              <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', color: '#B026FF', fontSize: 18, letterSpacing: 1 }}>
                {t('libraryValue')}
              </Text>
            </View>

            <View className="flex-row gap-2 mb-8 flex-wrap">
              {['1W', '1M', '3M', '6M', '1Y'].map(range => (
                <TouchableOpacity
                  key={range}
                  onPress={() => setValueTimeRange(range)}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 20,
                    backgroundColor: valueTimeRange === range ? 'rgba(176, 38, 255, 0.2)' : 'transparent',
                    borderWidth: 1,
                    borderColor: valueTimeRange === range ? '#B026FF' : 'rgba(136, 146, 176, 0.1)',
                  }}>
                  <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: valueTimeRange === range ? '#B026FF' : '#8892B0', fontSize: 11 }}>
                    {range}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ alignItems: 'center', height: 220, marginLeft: -10 }}>
              <LineChart
                data={currentValueData}
                width={280}
                height={160}
                thickness={3}
                color="#B026FF"
                areaChart
                startFillColor="#B026FF"
                endFillColor="#B026FF"
                startOpacity={0.4}
                endOpacity={0.05}
                hideDataPoints
                hideRules
                xAxisColor="rgba(176, 38, 255, 0.2)"
                yAxisColor="transparent"
                yAxisTextStyle={{ color: '#8892B0', fontSize: 10, fontFamily: 'SpaceGrotesk_400Regular' }}
                xAxisLabelTextStyle={{ color: '#8892B0', fontSize: 10, fontFamily: 'SpaceGrotesk_400Regular' }}
                pointerConfig={{
                  pointerStripHeight: 160,
                  pointerStripColor: 'rgba(176, 38, 255, 0.5)',
                  pointerStripWidth: 2,
                  pointerColor: '#B026FF',
                  radius: 6,
                  pointerLabelWidth: 80,
                  pointerLabelHeight: 30,
                  activatePointersOnLongPress: true,
                  autoAdjustPointerLabelPosition: true,
                  pointerLabelComponent: (items: any) => {
                    return (
                      <View
                        style={{
                          height: 30,
                          width: 80,
                          justifyContent: 'center',
                          backgroundColor: '#131B2B',
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: '#B026FF',
                          alignItems: 'center',
                        }}>
                        <Text style={{ color: '#fff', fontSize: 12, fontFamily: 'SpaceGrotesk_700Bold' }}>
                          ${items[0].value}
                        </Text>
                      </View>
                    );
                  },
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Read Chart Modal ── */}
      <Modal
        visible={isReadChartVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setIsReadChartVisible(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <View
            style={{
              backgroundColor: '#0B0E14',
              borderRadius: 24,
              padding: 24,
              width: '90%',
              borderWidth: 1,
              borderColor: 'rgba(0, 229, 255, 0.2)',
            }}>
            {/* Close Button Absolute */}
            <TouchableOpacity 
              onPress={() => setIsReadChartVisible(false)} 
              className="absolute top-4 right-4 w-8 h-8 rounded-full items-center justify-center bg-white/5 z-10"
            >
              <Ionicons name="close" size={20} color="#8892B0" />
            </TouchableOpacity>

            <View className="mb-6">
              <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', color: '#00E5FF', fontSize: 18, letterSpacing: 1 }}>
                {t('pagesRead')}
              </Text>
            </View>

            <View className="flex-row gap-2 mb-4 flex-wrap">
              {['1W', '1M', '3M', '6M', '1Y'].map(range => (
                <TouchableOpacity
                  key={range}
                  onPress={() => setReadTimeRange(range)}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 20,
                    backgroundColor: readTimeRange === range ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                    borderWidth: 1,
                    borderColor: readTimeRange === range ? '#00E5FF' : 'rgba(136, 146, 176, 0.1)',
                  }}>
                  <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: readTimeRange === range ? '#00E5FF' : '#8892B0', fontSize: 11 }}>
                    {range}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Total Read Summary */}
            <View className="mb-6 items-center">
              <Text 
                className="text-neon-cyan font-bold text-lg text-center"
                style={{ fontFamily: 'SpaceGrotesk_700Bold', color: '#00E5FF' }}
              >
                {t('rangeTotal').replace('{{count}}', totalReadInRange.toLocaleString())}
              </Text>
            </View>

            {totalReadInRange === 0 ? (
              <View style={{ height: 180, justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                <Ionicons name="book-outline" size={36} color="#1a2235" />
                <Text style={{ fontFamily: 'SpaceGrotesk_400Regular', color: '#4A5568', fontSize: 12, textAlign: 'center' }}>
                  {t('noReadingLogInRange')}
                </Text>
              </View>
            ) : (
            <View style={{ alignItems: 'center', height: 220, marginLeft: -10 }}>
              <BarChart
                data={currentReadData}
                width={260}
                height={160}
                barWidth={currentReadData.length > 7 ? 12 : 24}
                spacing={currentReadData.length > 7 ? 12 : 24}
                roundedTop
                roundedBottom
                frontColor="#00E5FF"
                hideRules
                xAxisColor="rgba(0, 229, 255, 0.2)"
                yAxisColor="transparent"
                yAxisTextStyle={{ color: '#8892B0', fontSize: 10, fontFamily: 'SpaceGrotesk_400Regular' }}
                xAxisLabelTextStyle={{ color: '#8892B0', fontSize: 10, fontFamily: 'SpaceGrotesk_400Regular' }}
                pointerConfig={{
                  pointerStripHeight: 160,
                  pointerStripColor: 'rgba(0, 229, 255, 0.5)',
                  pointerStripWidth: 2,
                  pointerColor: '#00E5FF',
                  radius: 6,
                  pointerLabelWidth: 80,
                  pointerLabelHeight: 30,
                  activatePointersOnLongPress: true,
                  autoAdjustPointerLabelPosition: true,
                  pointerLabelComponent: (items: any) => {
                    return (
                      <View
                        style={{
                          height: 30,
                          width: 80,
                          justifyContent: 'center',
                          backgroundColor: '#131B2B',
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: '#00E5FF',
                          alignItems: 'center',
                        }}>
                        <Text style={{ color: '#fff', fontSize: 11, fontFamily: 'SpaceGrotesk_700Bold' }}>
                          {items[0].value} {t('pagesRead')}
                        </Text>
                      </View>
                    );
                  },
                }}
              />
            </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
