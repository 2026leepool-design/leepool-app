import { useState, useCallback, type ReactNode } from 'react';
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
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/utils/supabase';
import { getDefaultLightningWalletFromMetadata } from '@/utils/profileLightning';
import { generateBookSynopsis } from '@/utils/gemini';
import { loadKeys, sendEncryptedMessage } from '@/utils/nostr';
import { hasSentOfferForBook, markOfferSentForBook } from '@/utils/bookOfferTracking';
import { countUnreadIncomingFromPeer } from '@/utils/nostrDmReadCursor';
import { buildOfferMessage, generateOfferId } from '@/utils/offerMessages';
import * as nip19 from 'nostr-tools/nip19';
import { fetchBitcoinRates, satsToUsd, satsToEur, type BtcRates } from '@/utils/currency';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardWrapper } from '@/components/KeyboardWrapper';
import { parseStringArrayField, formatLanguageCode } from '@/utils/bookMetadata';
import {
  isListedForSale as bookIsListedForSale,
  isSaleSold,
  bookListingActivePayload,
  bookListingCancelledPayload,
} from '@/utils/bookListing';

type BookData = {
  user_id?: string | null;
  title: string;
  author: string;
  cover_url: string | null;
  isbn: string | null;
  total_pages: number;
  read_pages: number;
  translator: string | null;
  first_publish_year: number | null;
  page_count?: number | null;
  categories?: string[] | null;
  average_rating?: number | null;
  ratings_count?: number | null;
  maturity_rating?: string | null;
  language?: string | null;
  subjects?: string[] | null;
  ia_synopsis: string | null;
  translated_titles: Array<{ lang: string; title: string; isOriginal?: boolean }> | null;
  is_for_sale: boolean | null;
  price_sats: number | null;
  condition: string | null;
  seller_npub: string | null;
  lightning_address: string | null;
  sale_status?: 'not_for_sale' | 'for_sale' | 'sold' | null;
  is_purchased?: boolean | null;
  purchased_from_id?: string | null;
  purchased_from_display?: string | null;
  is_app_purchase?: boolean | null;
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

export default function BookDetailScreen() {
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
  const [offerModalVisible, setOfferModalVisible] = useState(false);
  const [offerAmountSats, setOfferAmountSats] = useState('');
  const [offerSending, setOfferSending] = useState(false);
  const [rates, setRates] = useState<BtcRates | null>(null);
  const [sellerUnreadCount, setSellerUnreadCount] = useState(0);
  const [offerAlreadySent, setOfferAlreadySent] = useState(false);

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
          const [keysRes, userRes] = await Promise.all([loadKeys(), supabase.auth.getUser()]);
          if (keysRes?.npub && isMounted) setMyNpub(keysRes.npub);
          if (userRes.data?.user?.id && isMounted) setMyUserId(userRes.data.user.id);
          if (!isMounted) return;

          const ownRes = await supabase.from('books').select('*').eq('id', id).maybeSingle();
          let row = ownRes.data;
          if (!row) {
            const pubRes = await supabase
              .from('books_market_public')
              .select('*')
              .eq('id', id)
              .eq('sale_status', 'for_sale')
              .maybeSingle();
            row = pubRes.data ?? undefined;
          }

          if (!isMounted) return;
          if (row) {
            const b = row as BookData;
            setBook(b);
            const listed = bookIsListedForSale(b);
            setIsForSale(listed);
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

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancel = false;
      void (async () => {
        const sent = await hasSentOfferForBook(id);
        if (!cancel) setOfferAlreadySent(sent);
      })();
      return () => {
        cancel = true;
      };
    }, [id])
  );

  useFocusEffect(
    useCallback(() => {
      let cancel = false;
      void (async () => {
        if (!book?.seller_npub || !myNpub || book.seller_npub === myNpub) {
          if (!cancel) setSellerUnreadCount(0);
          return;
        }
        const listed = !isSaleSold(book) && bookIsListedForSale(book);
        if (!listed) {
          if (!cancel) setSellerUnreadCount(0);
          return;
        }
        const keys = await loadKeys();
        if (!keys || cancel) return;
        try {
          const dec = nip19.decode(book.seller_npub);
          if (dec.type !== 'npub') {
            if (!cancel) setSellerUnreadCount(0);
            return;
          }
          const sellerHex = dec.data as string;
          const n = await countUnreadIncomingFromPeer(keys, sellerHex);
          if (!cancel) setSellerUnreadCount(n);
        } catch {
          if (!cancel) setSellerUnreadCount(0);
        }
      })();
      return () => {
        cancel = true;
      };
    }, [book, myNpub])
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
        titles = JSON.parse(titles) as BookData['translated_titles'];
      } catch {
        return null;
      }
    }
    if (!titles || !Array.isArray(titles)) return null;
    const original = titles.find((x) => x?.isOriginal && x?.title);
    if (!original?.title) return null;
    return t('bookOriginalTitle', { title: original.title });
  })();

  const handleSaveListing = useCallback(async () => {
    if (!id) return;
    setSavingListing(true);
    try {
      const keys = await loadKeys();
      const listingCore = isForSale ? bookListingActivePayload : bookListingCancelledPayload;
      const saleStatus = listingCore.sale_status;

      let lightningAddressUpdate: string | null | undefined;
      if (isForSale && !book?.lightning_address?.trim()) {
        const { data: { user } } = await supabase.auth.getUser();
        const def = getDefaultLightningWalletFromMetadata(user);
        if (def) lightningAddressUpdate = def;
      }

      const updatePayload: Record<string, unknown> = {
        ...listingCore,
        price_sats: isForSale && priceSats.trim() ? parseInt(priceSats, 10) : null,
        condition: isForSale ? condition : null,
        seller_npub: keys?.npub ?? null,
      };
      if (lightningAddressUpdate !== undefined) {
        updatePayload.lightning_address = lightningAddressUpdate;
      }

      const { error } = await supabase.from('books').update(updatePayload).eq('id', id);
      if (error) throw error;

      setBook((prev) =>
        prev
          ? {
              ...prev,
              is_for_sale: isForSale,
              sale_status: saleStatus as BookData['sale_status'],
              price_sats: isForSale && priceSats.trim() ? parseInt(priceSats, 10) : null,
              condition: isForSale ? condition : null,
              seller_npub: keys?.npub ?? null,
              ...(lightningAddressUpdate !== undefined
                ? { lightning_address: lightningAddressUpdate }
                : {}),
            }
          : null
      );
      Alert.alert(t('success'), t('listingUpdated'));
    } catch (err: any) {
      Alert.alert(t('error'), err.message || String(err));
    } finally {
      setSavingListing(false);
    }
  }, [id, book?.lightning_address, isForSale, priceSats, condition, t]);

  const truncateNpub = (npub: string) =>
    npub.length <= 28 ? npub : `${npub.slice(0, 12)}...${npub.slice(-12)}`;

  // isMyBook: kitap bana ait mi? seller_npub veya user_id ile kontrol edilir.
  const bookData = book as BookData | null;
  const isMyBook =
    !bookData?.seller_npub ||
    (!!myNpub && bookData.seller_npub === myNpub) ||
    (!!myUserId && bookData.user_id === myUserId);

  const isOwnBook = isMyBook;

  const isListedForSale =
    !!book && !isSaleSold(book) && bookIsListedForSale(book);

  const showMessageSeller =
    isListedForSale &&
    !!book?.seller_npub &&
    !!myNpub &&
    book.seller_npub !== myNpub;

  const showSendOffer =
    isListedForSale &&
    !!book?.lightning_address?.trim() &&
    !!myNpub &&
    !!book?.seller_npub &&
    book.seller_npub !== myNpub;

  const showDisabledOffer =
    isListedForSale &&
    !book?.lightning_address?.trim() &&
    !!myNpub &&
    !!book?.seller_npub &&
    book.seller_npub !== myNpub;

  const handleConfirmSendOffer = useCallback(async () => {
    if (!book?.seller_npub || !id) return;
    const amount = parseInt(offerAmountSats.trim(), 10);
    if (isNaN(amount) || amount < 1) {
      Alert.alert(t('error'), t('lightningAmountInvalid'));
      return;
    }
    const keys = await loadKeys();
    if (!keys) {
      Alert.alert(t('error'), t('nostrIdentityMissing'));
      return;
    }
    setOfferSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const offerId = generateOfferId();
      const payload = buildOfferMessage({
        bookId: id,
        bookTitle: book.title,
        amount,
        offerId,
        buyerUserId: user?.id ?? null,
        buyerNpub: keys.npub,
      });
      await sendEncryptedMessage(book.seller_npub, payload);
      await markOfferSentForBook(id);
      setOfferAlreadySent(true);
      setOfferModalVisible(false);
      setOfferAmountSats('');
      router.push(`/messages/${encodeURIComponent(book.seller_npub)}` as Href);
    } catch (e) {
      Alert.alert(t('error'), e instanceof Error ? e.message : String(e));
    } finally {
      setOfferSending(false);
    }
  }, [book, id, offerAmountSats, router, t]);

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
          visible={offerModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setOfferModalVisible(false)}>
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
                borderColor: 'rgba(0, 229, 255, 0.35)',
              }}>
              <Text
                className="text-[#00E5FF] text-base mb-4 tracking-widest"
                style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                {t('p2pSendOfferTitle')}
              </Text>
              <TextInput
                className="rounded-xl px-4 py-4 text-base mb-4"
                style={{
                  backgroundColor: '#131B2B',
                  borderWidth: 1,
                  borderColor: 'rgba(0, 229, 255, 0.35)',
                  fontFamily: 'SpaceGrotesk_400Regular',
                  color: '#00E5FF',
                }}
                placeholderTextColor="#4A5568"
                placeholder={t('lightningAmountPlaceholder')}
                value={offerAmountSats}
                onChangeText={setOfferAmountSats}
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
                  onPress={() => setOfferModalVisible(false)}>
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
                    backgroundColor: 'rgba(0, 229, 255, 0.2)',
                    borderWidth: 1,
                    borderColor: '#00E5FF',
                  }}
                  onPress={() => void handleConfirmSendOffer()}
                  disabled={offerSending}>
                  {offerSending ? (
                    <ActivityIndicator size="small" color="#00E5FF" />
                  ) : (
                    <Text
                      className="text-[#00E5FF] text-sm tracking-widest"
                      style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                      {t('p2pSendOfferSubmit')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        </>
      }>
      {/* ── Back + Edit ── */}
      <View className="px-5 py-3 flex-row items-center gap-2 flex-wrap">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center rounded-xl py-2 pr-4"
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
        {isMyBook && id ? (
          <TouchableOpacity
            onPress={() => router.push(`/book/edit/${id}` as Href)}
            className="flex-row items-center rounded-xl py-2 px-4 gap-2"
            style={{
              backgroundColor: 'rgba(0, 229, 255, 0.12)',
              borderWidth: 1,
              borderColor: 'rgba(0, 229, 255, 0.45)',
            }}>
            <Ionicons name="create-outline" size={20} color="#00E5FF" />
            <Text
              className="text-[#00E5FF] text-sm tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
              {t('editBook')}
            </Text>
          </TouchableOpacity>
        ) : null}
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
            {isListedForSale && (
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
                    {t('forSale')} ·{' '}
                    {(() => {
                      const ps = book.price_sats;
                      const n = ps == null ? NaN : Number(ps);
                      return Number.isFinite(n) ? `${n.toLocaleString()} sats` : '—';
                    })()}
                  </Text>
                </View>
                {(() => {
                  const ps = book.price_sats;
                  const n = ps == null ? NaN : Number(ps);
                  if (!Number.isFinite(n) || !rates) return null;
                  const usd = satsToUsd(n, rates);
                  const eur = satsToEur(n, rates);
                  if (
                    usd == null ||
                    eur == null ||
                    !Number.isFinite(usd) ||
                    !Number.isFinite(eur)
                  ) {
                    return null;
                  }
                  return (
                    <View className="mt-1 ml-1">
                      <Text
                        className="text-[#8892B0] text-[10px]"
                        style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                        ≈ ${usd.toFixed(2)} · €{eur.toFixed(2)}
                      </Text>
                    </View>
                  );
                })()}
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
              {(() => {
                const tp = book.total_pages;
                const tpn = tp == null ? NaN : Number(tp);
                if (!Number.isFinite(tpn) || tpn <= 0) return null;
                return (
                  <Text
                    className="text-[#6B7280] text-[10px]"
                    style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                    {t('totalPages')}: {Math.round(tpn).toLocaleString()}
                  </Text>
                );
              })()}
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

        {isListedForSale &&
        (showMessageSeller ||
          (showSendOffer && offerAlreadySent) ||
          (showSendOffer && !offerAlreadySent) ||
          showDisabledOffer) ? (
          <View className="flex-row gap-2 mb-3" style={{ alignSelf: 'stretch', width: '100%' }}>
            {showMessageSeller ? (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() =>
                  router.push(`/messages/${encodeURIComponent(book.seller_npub!)}` as Href)
                }
                className="flex-1 min-w-0 flex-row items-center justify-center gap-2 rounded-xl py-3 px-2"
                style={{
                  position: 'relative',
                  backgroundColor: 'rgba(168, 85, 247, 0.15)',
                  borderWidth: 1,
                  borderColor: '#A855F7',
                }}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color="#E879F9" />
                <Text
                  className="text-xs tracking-widest text-center flex-shrink"
                  style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#E879F9' }}
                  numberOfLines={2}>
                  {t('messageSeller')}
                </Text>
                {sellerUnreadCount > 0 ? (
                  <View
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: '#EF4444',
                      borderWidth: 1,
                      borderColor: '#0A0F1A',
                      position: 'absolute',
                    }}>
                    <Text
                      style={{
                        fontFamily: 'SpaceGrotesk_700Bold',
                        fontSize: 10,
                        color: '#fff',
                      }}>
                      {sellerUnreadCount > 9 ? '9+' : String(sellerUnreadCount)}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ) : null}
            {showSendOffer && offerAlreadySent ? (
              <View
                className="flex-1 min-w-0 flex-row items-center justify-center gap-2 rounded-xl py-3 px-2"
                style={{
                  backgroundColor: 'rgba(0, 229, 255, 0.08)',
                  borderWidth: 1,
                  borderColor: 'rgba(0, 229, 255, 0.35)',
                }}>
                <Ionicons name="checkmark-circle" size={20} color="#00E5FF" />
                <Text
                  className="text-xs tracking-widest text-center flex-shrink"
                  style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#00E5FF' }}
                  numberOfLines={2}>
                  {t('offerSent')}
                </Text>
              </View>
            ) : null}
            {showSendOffer && !offerAlreadySent ? (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setOfferAmountSats(book.price_sats ? String(book.price_sats) : '');
                  setOfferModalVisible(true);
                }}
                className="flex-1 min-w-0 flex-row items-center justify-center gap-2 rounded-xl py-3 px-2"
                style={{
                  backgroundColor: 'rgba(0, 229, 255, 0.15)',
                  borderWidth: 1,
                  borderColor: '#00E5FF',
                }}>
                <Ionicons name="pricetag-outline" size={18} color="#00E5FF" />
                <Text
                  className="text-xs tracking-widest text-center flex-shrink"
                  style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#00E5FF' }}
                  numberOfLines={2}>
                  {t('p2pSendOffer')}
                </Text>
              </TouchableOpacity>
            ) : null}
            {showDisabledOffer ? (
              <View
                className="flex-1 min-w-0 flex-row items-center justify-center gap-2 rounded-xl py-3 px-2 opacity-50"
                style={{
                  backgroundColor: 'rgba(136, 146, 176, 0.1)',
                  borderWidth: 1,
                  borderColor: '#8892B0',
                }}>
                <Ionicons name="wallet-outline" size={16} color="#8892B0" />
                <Text
                  className="text-xs tracking-widest text-center flex-shrink"
                  style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#8892B0' }}
                  numberOfLines={2}>
                  {t('noWalletAdded')}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {book.is_app_purchase &&
        (book.purchased_from_display?.trim() || book.purchased_from_id) ? (
          <View
            className="rounded-2xl px-4 py-3 mb-3 flex-row items-center gap-2"
            style={{
              backgroundColor: 'rgba(168, 85, 247, 0.1)',
              borderWidth: 1,
              borderColor: 'rgba(196, 181, 253, 0.45)',
            }}>
            <Ionicons name="person-circle-outline" size={20} color="#C4B5FD" />
            <Text
              className="text-[#E9D5FF] text-xs flex-1 leading-5"
              style={{ fontFamily: 'SpaceGrotesk_500Medium' }}>
              {t('previousOwnerBadge', {
                name:
                  book.purchased_from_display?.trim() ||
                  book.purchased_from_id ||
                  '—',
              })}
            </Text>
          </View>
        ) : null}

        {/* ── Metadata strip (Google / Open Library) ── */}
        {(() => {
          const pc = book.page_count;
          const pcn = pc == null ? NaN : Number(pc);
          const tp = book.total_pages;
          const tpn = tp == null ? NaN : Number(tp);
          const metaPages =
            Number.isFinite(pcn) && pcn > 0
              ? Math.round(pcn)
              : Number.isFinite(tpn) && tpn > 0
                ? Math.round(tpn)
                : null;
          const arn =
            book.average_rating == null ? NaN : Number(book.average_rating);
          const hasRating = Number.isFinite(arn) && arn > 0;
          const lang = book.language?.trim()
            ? formatLanguageCode(book.language)
            : null;
          const yearRaw = book.first_publish_year;
          const year =
            yearRaw != null && Number.isFinite(Number(yearRaw))
              ? Number(yearRaw)
              : null;
          if (!hasRating && metaPages == null && !lang && year == null) return null;
          const chip = (key: string, body: ReactNode) => (
            <View
              key={key}
              className="rounded-2xl px-4 py-3 mr-3"
              style={{
                backgroundColor: 'rgba(0, 229, 255, 0.06)',
                borderWidth: 1,
                borderColor: 'rgba(0, 229, 255, 0.28)',
                minWidth: 112,
              }}>
              {body}
            </View>
          );
          return (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-2 -mx-1"
              contentContainerStyle={{
                paddingHorizontal: 4,
                paddingVertical: 10,
                alignItems: 'stretch',
              }}>
              {hasRating
                ? chip(
                    'rating',
                    <>
                      <Text
                        className="text-[#FACC15] text-lg mb-0.5"
                        style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                        ⭐️ {arn.toFixed(1)}
                        <Text
                          className="text-[#8892B0] text-[10px]"
                          style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                          {' '}
                          / 5
                        </Text>
                      </Text>
                      {(() => {
                        const rc = book.ratings_count;
                        const rcn = rc == null ? NaN : Number(rc);
                        if (!Number.isFinite(rcn) || rcn <= 0) return null;
                        return (
                          <Text
                            className="text-[#6B7280] text-[9px] tracking-widest"
                            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                            {Math.round(rcn).toLocaleString()} {t('reviews')}
                          </Text>
                        );
                      })()}
                    </>
                  )
                : null}
              {metaPages != null
                ? chip(
                    'pages',
                    <>
                      <Text style={{ fontSize: 14, marginBottom: 2 }}>📄</Text>
                      <Text
                        className="text-[#00E5FF] text-sm"
                        style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                        {metaPages.toLocaleString()}
                      </Text>
                      <Text
                        className="text-[#6B7280] text-[9px] tracking-widest mt-0.5"
                        style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                        {t('bookMetaPagesShort')}
                      </Text>
                    </>
                  )
                : null}
              {lang
                ? chip(
                    'lang',
                    <>
                      <Text style={{ fontSize: 14, marginBottom: 2 }}>🌐</Text>
                      <Text
                        className="text-[#E879F9] text-base tracking-widest"
                        style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                        {lang}
                      </Text>
                      <Text
                        className="text-[#6B7280] text-[9px] tracking-widest mt-0.5"
                        style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                        {t('bookMetaLanguage')}
                      </Text>
                    </>
                  )
                : null}
              {year != null
                ? chip(
                    'year',
                    <>
                      <Text style={{ fontSize: 14, marginBottom: 2 }}>📅</Text>
                      <Text
                        className="text-[#00FF9D] text-base"
                        style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                        {year}
                      </Text>
                      <Text
                        className="text-[#6B7280] text-[9px] tracking-widest mt-0.5"
                        style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                        {t('firstPublishYear')}
                      </Text>
                    </>
                  )
                : null}
            </ScrollView>
          );
        })()}

        {/* ── Middle: Progress (owner only) ── */}
        {isMyBook ? (
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
        ) : null}

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
              {t('iaSyncSectionTitle')}
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

          {(() => {
            const cats = parseStringArrayField(book.categories);
            const subs = parseStringArrayField(book.subjects);
            const seen = new Set<string>();
            const pills: { label: string; kind: 'cat' | 'sub' }[] = [];
            for (const c of cats) {
              const k = c.toLowerCase();
              if (seen.has(k)) continue;
              seen.add(k);
              pills.push({ label: c, kind: 'cat' });
            }
            for (const s of subs) {
              const k = s.toLowerCase();
              if (seen.has(k)) continue;
              seen.add(k);
              pills.push({ label: s, kind: 'sub' });
            }
            if (!pills.length) return null;
            return (
              <View className="mt-5 pt-4 border-t border-white/10">
                <Text
                  className="text-[#8892B0] text-[10px] tracking-[0.2em] mb-3"
                  style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                  {t('bookCategoriesAndTags')}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {pills.map((p, i) => (
                    <View
                      key={`${p.kind}-${i}-${p.label}`}
                      className="px-3 py-1.5 rounded-full"
                      style={{
                        backgroundColor:
                          p.kind === 'cat'
                            ? 'rgba(0, 229, 255, 0.1)'
                            : 'rgba(168, 85, 247, 0.12)',
                        borderWidth: 1,
                        borderColor:
                          p.kind === 'cat'
                            ? 'rgba(0, 229, 255, 0.35)'
                            : 'rgba(168, 85, 247, 0.4)',
                      }}>
                      <Text
                        className="text-[11px]"
                        style={{
                          fontFamily: 'SpaceGrotesk_500Medium',
                          color: p.kind === 'cat' ? '#67E8F9' : '#E9D5FF',
                        }}
                        numberOfLines={2}>
                        {p.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })()}

          {book.isbn?.trim() ? (
            <Text
              className="text-[#4A5568] text-[10px] mt-4 tracking-wide"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {t('isbn')}: {book.isbn}
            </Text>
          ) : null}
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
              {t('bookReadOnlyBadge')} · {t('bookReadOnlyHint')}
            </Text>
          </View>
        )}

        {/* ── P2P Market Settings ── */}
        {isOwnBook && book && !isSaleSold(book) && <View className="mb-6">
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
                  {t('bitcoinSatsSubtitle')}
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
                {t('amazonAffiliateSection')}
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
