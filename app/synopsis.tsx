import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Switch,
  Alert,
  Linking,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/utils/supabase';
import { generateBookSynopsis } from '@/utils/gemini';
import { loadKeys } from '@/utils/nostr';
import { payLightningInvoice } from '@/utils/lightning';
import { fetchBitcoinRates, satsToUsd, satsToEur, type BtcRates } from '@/utils/currency';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardWrapper } from '@/components/KeyboardWrapper';

type BookData = {
  title: string;
  author: string;
  cover_url: string | null;
  isbn: string | null;
  total_pages: number;
  read_pages: number;
  translator: string | null;
  first_publish_year: number | null;
  ia_synopsis: string | null;
  translated_titles: Array<{ lang: string; title: string; isOriginal?: boolean }> | null;
  is_for_sale: boolean | null;
  price_sats: number | null;
  condition: string | null;
  seller_npub: string | null;
  lightning_address: string | null;
};

type ConditionOption = 'new' | 'good' | 'worn';

function getSynopsisForLanguage(
  iaSynopsis: string | null,
  lang: string
): string {
  if (!iaSynopsis?.trim()) return '';
  let raw = iaSynopsis.trim();
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) raw = jsonMatch[0];
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    const code = lang.split('-')[0];
    return parsed[code] ?? parsed.en ?? parsed.tr ?? parsed.es ?? '';
  } catch {
    return iaSynopsis;
  }
}

export default function SynopsisScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [book, setBook] = useState<BookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [coverExpanded, setCoverExpanded] = useState(false);
  const [isForSale, setIsForSale] = useState(false);
  const [priceSats, setPriceSats] = useState('');
  const [condition, setCondition] = useState<ConditionOption | null>(null);
  const [savingListing, setSavingListing] = useState(false);
  const [focusSats, setFocusSats] = useState(false);
  const [myNpub, setMyNpub] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [isLightningModalVisible, setIsLightningModalVisible] = useState(false);
  const [lightningAmount, setLightningAmount] = useState('1000');
  const [lightningPaying, setLightningPaying] = useState(false);
  const [rates, setRates] = useState<BtcRates | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchBitcoinRates().then(setRates);
      if (!id) {
        setLoading(false);
        return;
      }
      let isMounted = true;
      setLoading(true);
      setBook(null);

      const fetchBook = async () => {
        try {
          const [bookRes, keysRes, userRes] = await Promise.all([
            supabase.from('books').select('*').eq('id', id).single(),
            loadKeys(),
            supabase.auth.getUser(),
          ]);
          const { data, error } = bookRes;
          if (keysRes?.npub && isMounted) setMyNpub(keysRes.npub);
          if (userRes.data?.user?.id && isMounted) setMyUserId(userRes.data.user.id);
          if (!isMounted) return;
          if (!error && data) {
            const b = data as BookData;
            setBook(b);
            setIsForSale(b.is_for_sale ?? false);
            setPriceSats(b.price_sats ? String(b.price_sats) : '');
            setCondition((b.condition as ConditionOption) ?? null);
          }
        } catch {
          // network / unexpected error — book stays null → shows not-found screen
        } finally {
          if (isMounted) setLoading(false);
        }
      };

      fetchBook();
      return () => { isMounted = false; };
    }, [id])
  );

  const displayText = book ? getSynopsisForLanguage(book.ia_synopsis, i18n.language) : '';
  const hasCover = !!(book?.cover_url?.trim());
  const totalPages = book?.total_pages ?? 0;
  const readPages = book?.read_pages ?? 0;
  const progressPercent = totalPages > 0 ? Math.round((readPages / totalPages) * 100) : 0;

  const originalTitleText = (() => {
    let titles = book?.translated_titles;
    if (typeof titles === 'string') {
      try {
        titles = JSON.parse(titles) as typeof book.translated_titles;
      } catch {
        return null;
      }
    }
    if (!titles || !Array.isArray(titles)) return null;
    const original = titles.find((x) => x?.isOriginal && x?.title);
    if (!original) return null;
    return `(Orj: ${original.title})`;
  })();

  const handleSaveListing = useCallback(async () => {
    if (!id) return;
    setSavingListing(true);
    try {
      const keys = await loadKeys();
      const { error } = await supabase
        .from('books')
        .update({
          is_for_sale: isForSale,
          price_sats: isForSale && priceSats.trim() ? parseInt(priceSats, 10) : null,
          condition: isForSale ? condition : null,
          seller_npub: keys?.npub ?? null,
        })
        .eq('id', id);
      if (error) throw error;

      setBook((prev) =>
        prev
          ? {
              ...prev,
              is_for_sale: isForSale,
              price_sats: isForSale && priceSats.trim() ? parseInt(priceSats, 10) : null,
              condition: isForSale ? condition : null,
              seller_npub: keys?.npub ?? null,
            }
          : null
      );
      Alert.alert(t('success'), t('listingUpdated'));
    } catch (err: any) {
      Alert.alert(t('error'), err.message || String(err));
    } finally {
      setSavingListing(false);
    }
  }, [id, isForSale, priceSats, condition, t]);

  const truncateNpub = (npub: string) =>
    npub.length <= 28 ? npub : `${npub.slice(0, 12)}...${npub.slice(-12)}`;

  // isMyBook: kitap bana ait mi? seller_npub veya user_id ile kontrol edilir.
  const bookData = book as (BookData & { user_id?: string }) | null;
  const isMyBook =
    !bookData?.seller_npub ||
    (!!myNpub && bookData.seller_npub === myNpub) ||
    (!!myUserId && bookData.user_id === myUserId);

  const isOwnBook = isMyBook;

  const showMessageSeller =
    book?.is_for_sale &&
    !!book?.seller_npub &&
    !!myNpub &&
    book.seller_npub !== myNpub;

  const showBuyLightning =
    book?.is_for_sale &&
    !!book?.lightning_address?.trim() &&
    !!myNpub &&
    !!book?.seller_npub &&
    book.seller_npub !== myNpub;

  const showDisabledBuyLightning =
    book?.is_for_sale &&
    !book?.lightning_address?.trim() &&
    !!myNpub &&
    !!book?.seller_npub &&
    book.seller_npub !== myNpub;

  const handleLightningPay = useCallback(async () => {
    if (!book?.lightning_address?.trim()) return;
    const sats = parseInt(lightningAmount, 10);
    if (isNaN(sats) || sats < 1) {
      Alert.alert(t('error'), t('lightningAmountInvalid'));
      return;
    }
    setIsLightningModalVisible(false);
    setLightningPaying(true);
    try {
      await payLightningInvoice(book.lightning_address.trim(), sats, `${book.title} - LeePool`, t('error'));
    } finally {
      setLightningPaying(false);
    }
  }, [book?.lightning_address, book?.title, lightningAmount, t]);

  const handleAmazonRedirect = useCallback(() => {
    if (!book) return;
    const url = book.isbn
      ? `https://www.amazon.com/s?k=${book.isbn}&tag=leepool-21`
      : `https://www.amazon.com/s?k=${encodeURIComponent(`${book.title} ${book.author}`)}&tag=leepool-21`;
    Linking.openURL(url);
  }, [book]);

  const handleRegenerate = useCallback(async () => {
    if (!id || !book?.title || !book?.author) return;
    setRegenerating(true);
    try {
      const result = await generateBookSynopsis(book.title, book.author);
      if (result) {
        const { error } = await supabase
          .from('books')
          .update({ ia_synopsis: result })
          .eq('id', id);

        if (!error) {
          setBook((prev) => (prev ? { ...prev, ia_synopsis: result } : null));
        }
      }
    } finally {
      setRegenerating(false);
    }
  }, [id, book]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-[#0A0F1A]" edges={['top']}>
        <View className="flex-1 items-center justify-center gap-5">
          <View
            className="w-16 h-16 rounded-2xl items-center justify-center"
            style={{
              backgroundColor: 'rgba(0, 229, 255, 0.08)',
              borderWidth: 1,
              borderColor: 'rgba(0, 229, 255, 0.3)',
            }}>
            <ActivityIndicator size="large" color="#00E5FF" />
          </View>
          <Text
            className="text-[#00E5FF] text-xs tracking-[0.25em]"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
            {t('loading')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!book) {
    return (
      <SafeAreaView className="flex-1 bg-[#0A0F1A]" edges={['top']}>
        <View className="flex-1 items-center justify-center px-8 gap-4">
          <View
            className="w-16 h-16 rounded-2xl items-center justify-center"
            style={{
              backgroundColor: 'rgba(255, 80, 80, 0.08)',
              borderWidth: 1,
              borderColor: 'rgba(255, 80, 80, 0.3)',
            }}>
            <Ionicons name="alert-circle-outline" size={32} color="#FF5050" />
          </View>
          <Text
            className="text-[#FF5050] text-xs tracking-[0.2em] text-center"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
            {t('error')}
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            className="mt-2 rounded-xl px-6 py-3"
            style={{
              backgroundColor: '#131B2B',
              borderWidth: 1,
              borderColor: 'rgba(0, 229, 255, 0.3)',
            }}>
            <Text className="text-[#00E5FF] text-xs tracking-widest" style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
              {t('back')}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardWrapper
      edges={['top']}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
      extraChildren={
        <>
        <Modal
          visible={coverExpanded}
          transparent
          animationType="fade"
          onRequestClose={() => setCoverExpanded(false)}>
          <TouchableOpacity
            activeOpacity={1}
            className="flex-1 justify-center items-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
            onPress={() => setCoverExpanded(false)}>
            <View className="flex-1 w-full justify-center items-center px-4">
              <TouchableOpacity
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
                style={{ maxWidth: '100%', maxHeight: '80%' }}>
                <Image
                  source={{ uri: book.cover_url ?? undefined }}
                  style={{ width: 280, height: 400 }}
                  contentFit="contain"
                />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setCoverExpanded(false)}
              className="absolute top-14 right-5 w-12 h-12 rounded-full items-center justify-center"
              style={{
                backgroundColor: 'rgba(0, 229, 255, 0.15)',
                borderWidth: 1,
                borderColor: '#00E5FF',
              }}>
              <Ionicons name="close" size={24} color="#00E5FF" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
        <Modal
          visible={isLightningModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIsLightningModalVisible(false)}>
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 24,
            }}>
            <View
              style={{
                width: '90%',
                backgroundColor: '#0B0E14',
                borderRadius: 20,
                padding: 24,
                borderWidth: 1,
                borderColor: 'rgba(255, 215, 0, 0.3)',
              }}>
              <Text
                className="text-[#FFD700] text-base mb-4 tracking-widest"
                style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                ⚡ {t('lightningAmountPrompt')}
              </Text>
              <TextInput
                className="rounded-xl px-4 py-4 text-base mb-4"
                style={{
                  backgroundColor: '#131B2B',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 215, 0, 0.4)',
                  fontFamily: 'SpaceGrotesk_400Regular',
                  color: '#FFD700',
                }}
                placeholderTextColor="#4A5568"
                placeholder={t('lightningAmountPlaceholder')}
                value={lightningAmount}
                onChangeText={setLightningAmount}
                keyboardType="numeric"
              />
              <View className="flex-row gap-3">
                <TouchableOpacity
                  activeOpacity={0.8}
                  className="flex-1 rounded-xl py-3 items-center"
                  style={{
                    backgroundColor: 'rgba(74, 85, 104, 0.3)',
                    borderWidth: 1,
                    borderColor: 'rgba(136, 146, 176, 0.3)',
                  }}
                  onPress={() => setIsLightningModalVisible(false)}>
                  <Text
                    className="text-[#8892B0] text-sm tracking-widest"
                    style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                    {t('cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.8}
                  className="flex-1 rounded-xl py-3 items-center"
                  style={{
                    backgroundColor: 'rgba(255, 215, 0, 0.2)',
                    borderWidth: 1,
                    borderColor: '#FFD700',
                  }}
                  onPress={handleLightningPay}
                  disabled={lightningPaying}>
                  {lightningPaying ? (
                    <ActivityIndicator size="small" color="#FFD700" />
                  ) : (
                    <Text
                      className="text-[#FFD700] text-sm tracking-widest"
                      style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                      ⚡ {t('confirm')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        </>
      }>
      {/* ── Back Button ── */}
      <View className="px-5 py-3">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center rounded-xl py-2 pr-4 self-start"
          style={{
            backgroundColor: '#131B2B',
            borderWidth: 1,
            borderColor: 'rgba(0, 229, 255, 0.2)',
          }}>
          <View className="pl-3 pr-1">
            <Ionicons name="arrow-back" size={22} color="#00E5FF" />
          </View>
          <Text
            className="text-[#00E5FF] text-sm tracking-widest"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
            {t('back')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Top: Cover + Info ── */}
      <View
        className="flex-row items-start gap-4 rounded-2xl p-4 mb-4"
          style={{
            backgroundColor: '#131B2B',
            borderWidth: 1,
            borderColor: 'rgba(0, 229, 255, 0.15)',
          }}>
          {hasCover ? (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setCoverExpanded(true)}
              className="rounded-lg overflow-hidden"
              style={{ width: 100, height: 133, backgroundColor: '#1a2235' }}>
              <Image
                source={{ uri: book.cover_url! }}
                style={{ width: 100, height: 133 }}
                contentFit="cover"
              />
            </TouchableOpacity>
          ) : (
            <View
              className="rounded-lg items-center justify-center"
              style={{ width: 100, height: 133, backgroundColor: '#1a2235' }}>
              <Ionicons name="book-outline" size={36} color="#4A5568" />
            </View>
          )}
          <View className="flex-1 min-w-0">
            {/* For-sale badge */}
            {book.is_for_sale && (
              <View className="mb-2">
                <View
                  className="flex-row items-center self-start gap-1 px-3 py-1 rounded-full"
                  style={{
                    backgroundColor: 'rgba(0, 255, 157, 0.12)',
                    borderWidth: 1,
                    borderColor: 'rgba(0, 255, 157, 0.4)',
                  }}>
                  <Text style={{ fontSize: 11 }}>⚡</Text>
                  <Text
                    className="text-[#00FF9D] text-[10px] tracking-widest"
                    style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                    {t('forSale')} · {book.price_sats ? `${book.price_sats.toLocaleString()} sats` : '—'}
                  </Text>
                </View>
                {book.price_sats && rates && (
                  <View className="mt-1 ml-1">
                    <Text
                      className="text-[#8892B0] text-[10px]"
                      style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                      ≈ ${satsToUsd(book.price_sats, rates)?.toFixed(2)} · €{satsToEur(book.price_sats, rates)?.toFixed(2)}
                    </Text>
                  </View>
                )}
                <View className="flex-row flex-wrap gap-2 mt-3">
                  {showMessageSeller && (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() =>
                        router.push({ pathname: '/chat', params: { pubkey: book.seller_npub! } })
                      }
                      className="flex-row items-center gap-2 rounded-xl py-2.5 px-4"
                      style={{
                        backgroundColor: 'rgba(168, 85, 247, 0.15)',
                        borderWidth: 1,
                        borderColor: '#A855F7',
                      }}>
                      <Ionicons name="chatbubble-ellipses-outline" size={18} color="#E879F9" />
                      <Text
                        className="text-sm tracking-widest"
                        style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#E879F9' }}>
                        {t('messageSeller')}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {showBuyLightning && (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setIsLightningModalVisible(true)}
                      disabled={lightningPaying}
                      className="flex-row items-center gap-2 rounded-xl py-2.5 px-4"
                      style={{
                        backgroundColor: 'rgba(255, 215, 0, 0.15)',
                        borderWidth: 1,
                        borderColor: '#FFD700',
                      }}>
                      {lightningPaying ? (
                        <ActivityIndicator size="small" color="#FFD700" />
                      ) : (
                        <Text style={{ fontSize: 14 }}>⚡</Text>
                      )}
                      <Text
                        className="text-sm tracking-widest"
                        style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#FFD700' }}>
                        {t('buyWithLightning')}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {showDisabledBuyLightning && (
                    <View
                      className="flex-row items-center gap-2 rounded-xl py-2.5 px-4 opacity-50"
                      style={{
                        backgroundColor: 'rgba(136, 146, 176, 0.1)',
                        borderWidth: 1,
                        borderColor: '#8892B0',
                      }}>
                      <Ionicons name="wallet-outline" size={16} color="#8892B0" />
                      <Text
                        className="text-sm tracking-widest"
                        style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#8892B0' }}>
                        {t('noWalletAdded')}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}
            <Text
              className="text-[#00E5FF] text-lg mb-1"
              style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
              numberOfLines={3}>
              {book.title}
            </Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => book?.author && router.push(`/author/${encodeURIComponent(book.author)}`)}>
              <Text
                className="text-xs tracking-widest mb-1"
                style={{ fontFamily: 'SpaceGrotesk_400Regular', color: '#00E5FF' }}>
                {book.author?.toUpperCase()}
              </Text>
            </TouchableOpacity>
            {originalTitleText ? (
              <Text
                className="text-[#6B7280] text-xs mb-1"
                style={{ fontFamily: 'SpaceGrotesk_400Regular', fontStyle: 'italic' }}
                numberOfLines={2}>
                {originalTitleText}
              </Text>
            ) : null}
            <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-1">
              {book.total_pages > 0 && (
                <Text
                  className="text-[#6B7280] text-[10px]"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                  {t('totalPages')}: {book.total_pages.toLocaleString()}
                </Text>
              )}
              {book.isbn ? (
                <Text
                  className="text-[#6B7280] text-[10px]"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                  ISBN: {book.isbn}
                </Text>
              ) : null}
              {book.first_publish_year ? (
                <Text
                  className="text-[#6B7280] text-[10px]"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                  {t('firstPublishYear')}: {book.first_publish_year}
                </Text>
              ) : null}
              {book.translator ? (
                <Text
                  className="text-[#6B7280] text-[10px]"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
                  numberOfLines={1}>
                  {t('translator')}: {book.translator}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── Middle: Progress ── */}
        <View
          className="rounded-2xl p-4 mb-6"
          style={{
            backgroundColor: '#131B2B',
            borderWidth: 1,
            borderColor: 'rgba(0, 229, 255, 0.15)',
          }}>
          <View className="flex-row justify-between items-center mb-2">
            <Text
              className="text-[#8892B0] text-[10px] tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {t('leido')}
            </Text>
            <Text
              className="text-[#00E5FF] text-sm"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
              {progressPercent}%
            </Text>
          </View>
          <View
            className="w-full rounded-full overflow-hidden mb-2"
            style={{ height: 6, backgroundColor: '#0A0F1A' }}>
            <View
              className="rounded-full"
              style={{
                height: 6,
                width: `${progressPercent}%`,
                backgroundColor: '#00E5FF',
              }}
            />
          </View>
          <Text
            className="text-[#8892B0] text-[10px]"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
            {readPages.toLocaleString()} / {totalPages.toLocaleString()} {t('pagesRead')}
          </Text>
        </View>

        {/* ── Bottom: IA Synopsis ── */}
        <View
          className="rounded-2xl p-4 mb-6"
          style={{
            backgroundColor: '#131B2B',
            borderWidth: 1,
            borderColor: 'rgba(0, 229, 255, 0.15)',
          }}>
          <View className="flex-row justify-between items-center mb-3">
            <Text
              className="text-[#8892B0] text-[10px] tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              IA SYNC
            </Text>
            {isMyBook && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleRegenerate}
                disabled={regenerating}
                className="w-8 h-8 rounded-lg items-center justify-center"
                style={{ backgroundColor: 'rgba(0, 229, 255, 0.08)' }}>
                {regenerating ? (
                  <ActivityIndicator size="small" color="#00E5FF" />
                ) : (
                  <Ionicons name="refresh" size={18} color="#00E5FF" />
                )}
              </TouchableOpacity>
            )}
          </View>
          <Text
            className="text-[#FFFFFF] text-base leading-7"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
            {displayText || t('iaSyncPending')}
          </Text>
        </View>

        {/* ── Read-only badge for others' books ── */}
        {!isMyBook && (
          <View
            className="flex-row items-center gap-2 rounded-xl px-4 py-3 mb-4"
            style={{
              backgroundColor: 'rgba(139, 92, 246, 0.08)',
              borderWidth: 1,
              borderColor: 'rgba(139, 92, 246, 0.3)',
            }}>
            <Ionicons name="lock-closed-outline" size={14} color="#A78BFA" />
            <Text
              className="text-[10px] tracking-widest flex-1"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#A78BFA' }}>
              READ-ONLY · Bu kitap başka bir kullanıcıya ait
            </Text>
          </View>
        )}

        {/* ── P2P Market Settings ── */}
        {isOwnBook && <View className="mb-6">
          {/* Cyberpunk divider */}
          <View className="flex-row items-center gap-3 mb-5">
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(0, 255, 157, 0.25)' }} />
            <View
              className="flex-row items-center gap-2 px-3 py-1 rounded-full"
              style={{ backgroundColor: 'rgba(0, 255, 157, 0.08)', borderWidth: 1, borderColor: 'rgba(0, 255, 157, 0.3)' }}>
              <Text style={{ fontSize: 12 }}>⚡</Text>
              <Text
                className="text-[#00FF9D] text-[10px] tracking-widest"
                style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                {t('p2pSettings')}
              </Text>
            </View>
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(0, 255, 157, 0.25)' }} />
          </View>

          <View
            className="rounded-2xl p-4 mb-4"
            style={{ backgroundColor: '#131B2B', borderWidth: 1, borderColor: 'rgba(0, 255, 157, 0.15)' }}>
            {/* Toggle row */}
            <View className="flex-row items-center justify-between mb-2">
              <View>
                <Text className="text-white text-sm" style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                  {t('sellBook')}
                </Text>
                <Text className="text-[#6B7280] text-[10px] mt-0.5" style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                  Bitcoin · Sats
                </Text>
              </View>
              <Switch
                value={isForSale}
                onValueChange={setIsForSale}
                trackColor={{ false: '#1a2235', true: 'rgba(0, 255, 157, 0.35)' }}
                thumbColor={isForSale ? '#00FF9D' : '#3A4560'}
                ios_backgroundColor="#1a2235"
              />
            </View>

            {isForSale && (
              <View className="mt-4 gap-4">
                {/* Price in Sats */}
                <View>
                  <Text
                    className="text-[#8892B0] text-[10px] mb-2 tracking-widest"
                    style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                    ⚡ {t('priceSats')}
                  </Text>
                  <TextInput
                    className="rounded-xl px-4 py-3 text-base"
                    style={{
                      backgroundColor: '#0A0F1A',
                      borderWidth: 1,
                      borderColor: focusSats ? '#00FF9D' : 'rgba(0, 255, 157, 0.2)',
                      fontFamily: 'SpaceGrotesk_400Regular',
                      color: '#00FF9D',
                    }}
                    placeholderTextColor="#3A4560"
                    placeholder="e.g. 50000"
                    value={priceSats}
                    onChangeText={setPriceSats}
                    onFocus={() => setFocusSats(true)}
                    onBlur={() => setFocusSats(false)}
                    keyboardType="numeric"
                  />
                </View>

                {/* Condition picker */}
                <View>
                  <Text
                    className="text-[#8892B0] text-[10px] mb-2 tracking-widest"
                    style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                    {t('condition')}
                  </Text>
                  <View className="flex-row gap-2">
                    {(['new', 'good', 'worn'] as ConditionOption[]).map((opt) => {
                      const selected = condition === opt;
                      const labelKey = `condition${opt.charAt(0).toUpperCase() + opt.slice(1)}` as 'conditionNew' | 'conditionGood' | 'conditionWorn';
                      return (
                        <TouchableOpacity
                          key={opt}
                          activeOpacity={0.75}
                          onPress={() => setCondition(opt)}
                          className="flex-1 py-3 rounded-xl items-center"
                          style={{
                            backgroundColor: selected ? 'rgba(0, 255, 157, 0.15)' : '#0A0F1A',
                            borderWidth: 1,
                            borderColor: selected ? '#00FF9D' : 'rgba(136, 146, 176, 0.2)',
                          }}>
                          <Text
                            className="text-xs tracking-widest"
                            style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: selected ? '#00FF9D' : '#4A5568' }}>
                            {t(labelKey).toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Save Listing button */}
          <TouchableOpacity
            activeOpacity={0.8}
            className="rounded-2xl py-4 items-center justify-center"
            style={{
              backgroundColor: savingListing ? 'rgba(0, 255, 157, 0.5)' : 'rgba(0, 255, 157, 0.15)',
              borderWidth: 1,
              borderColor: '#00FF9D',
            }}
            onPress={handleSaveListing}
            disabled={savingListing}>
            {savingListing ? (
              <ActivityIndicator size="small" color="#00FF9D" />
            ) : (
              <Text
                className="text-[#00FF9D] text-sm tracking-widest"
                style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                ⚡ {t('saveListing').toUpperCase()}
              </Text>
            )}
          </TouchableOpacity>
        </View>}

        {/* ── Amazon Affiliate Button ── */}
        <View className="mb-2">
          <View className="flex-row items-center gap-3 mb-4">
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255, 153, 0, 0.25)' }} />
            <View
              className="px-3 py-1 rounded-full"
              style={{ backgroundColor: 'rgba(255, 153, 0, 0.08)', borderWidth: 1, borderColor: 'rgba(255, 153, 0, 0.3)' }}>
              <Text
                className="text-[#FF9900] text-[10px] tracking-widest"
                style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                AMAZON
              </Text>
            </View>
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255, 153, 0, 0.25)' }} />
          </View>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={handleAmazonRedirect}
            className="rounded-2xl py-4 items-center justify-center flex-row gap-3"
            style={{
              backgroundColor: '#0A0D13',
              borderWidth: 1.5,
              borderColor: '#FF9900',
              shadowColor: '#FF9900',
              shadowOpacity: 0.35,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 0 },
              elevation: 8,
            }}>
            <Text style={{ fontSize: 18 }}>🛒</Text>
            <Text
              className="text-[#FF9900] text-sm tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
              {t('findPhysicalCopy')}
            </Text>
          </TouchableOpacity>
        </View>
    </KeyboardWrapper>
  );
}
