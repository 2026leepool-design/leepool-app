import { useState, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/utils/supabase';
import { loadKeys } from '@/utils/nostr';
import { fetchBitcoinRates, satsToUsd, type BtcRates } from '@/utils/currency';
import { BookCardMetaChips } from '@/components/BookCard';

// ─── Types ────────────────────────────────────────────────────────────────────

type MarketBook = {
  id: string;
  title: string;
  author: string;
  cover_url: string | null;
  price_sats: number | null;
  condition: string | null;
  isbn: string | null;
  translator: string | null;
  first_publish_year: number | null;
  seller_npub: string | null;
  created_at?: string;
  page_count?: number | null;
  total_pages?: number | null;
  average_rating?: number | null;
};

type MarketSort =
  | 'date_desc'
  | 'date_asc'
  | 'price_asc'
  | 'price_desc'
  | 'title_asc'
  | 'title_desc';

type ConditionFilter = 'all' | 'new' | 'good' | 'worn';

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function normalizeAuthorTokens(s: string): string[] {
  return norm(s)
    .split(/[,\/&]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function authorMatchesFilter(bookAuthor: string, filter: string): boolean {
  const f = norm(filter);
  if (!f) return true;
  const hay = norm(bookAuthor);
  if (!hay) return false;
  if (hay === f || hay.includes(f) || f.includes(hay)) return true;
  const tokens = normalizeAuthorTokens(bookAuthor);
  return tokens.some((tok) => tok === f || tok.includes(f) || f.includes(tok));
}

function titleMatchesFilter(bookTitle: string, filter: string): boolean {
  const f = norm(filter);
  if (!f) return true;
  const hay = norm(bookTitle);
  if (!hay) return false;
  return hay.includes(f) || f.includes(hay);
}

function parsePriceSats(ps: number | null): number {
  if (ps == null) return NaN;
  const n = Number(ps);
  return Number.isFinite(n) ? n : NaN;
}

function filterMarketBooks(
  list: MarketBook[],
  opts: {
    priceMin: string;
    priceMax: string;
    titleQ: string;
    authorQ: string;
    condition: ConditionFilter;
  }
): MarketBook[] {
  const min = opts.priceMin.trim() !== '' ? Number(opts.priceMin) : NaN;
  const max = opts.priceMax.trim() !== '' ? Number(opts.priceMax) : NaN;
  const minOk = Number.isFinite(min);
  const maxOk = Number.isFinite(max);

  return list.filter((b) => {
    const p = parsePriceSats(b.price_sats);
    if (minOk && (!Number.isFinite(p) || p < min)) return false;
    if (maxOk && (!Number.isFinite(p) || p > max)) return false;
    if (!titleMatchesFilter(b.title, opts.titleQ)) return false;
    if (!authorMatchesFilter(b.author, opts.authorQ)) return false;
    if (opts.condition !== 'all' && (b.condition ?? '') !== opts.condition) return false;
    return true;
  });
}

function parseCreatedAt(b: MarketBook): number {
  if (!b.created_at) return 0;
  const ts = Date.parse(b.created_at);
  return Number.isFinite(ts) ? ts : 0;
}

function sortMarketBooks(list: MarketBook[], sort: MarketSort): MarketBook[] {
  const copy = [...list];
  copy.sort((a, b) => {
    switch (sort) {
      case 'date_desc':
        return parseCreatedAt(b) - parseCreatedAt(a);
      case 'date_asc':
        return parseCreatedAt(a) - parseCreatedAt(b);
      case 'price_asc': {
        const pa = parsePriceSats(a.price_sats);
        const pb = parsePriceSats(b.price_sats);
        const fa = Number.isFinite(pa);
        const fb = Number.isFinite(pb);
        if (!fa && !fb) return 0;
        if (!fa) return 1;
        if (!fb) return -1;
        return pa - pb;
      }
      case 'price_desc': {
        const pa = parsePriceSats(a.price_sats);
        const pb = parsePriceSats(b.price_sats);
        const fa = Number.isFinite(pa);
        const fb = Number.isFinite(pb);
        if (!fa && !fb) return 0;
        if (!fa) return 1;
        if (!fb) return -1;
        return pb - pa;
      }
      case 'title_asc':
        return norm(a.title).localeCompare(norm(b.title), undefined, { sensitivity: 'base' });
      case 'title_desc':
        return norm(b.title).localeCompare(norm(a.title), undefined, { sensitivity: 'base' });
      default:
        return 0;
    }
  });
  return copy;
}

const SORT_OPTIONS: { key: MarketSort; labelKey: string }[] = [
  { key: 'date_desc', labelKey: 'marketSortDateNew' },
  { key: 'date_asc', labelKey: 'marketSortDateOld' },
  { key: 'price_asc', labelKey: 'marketSortPriceLow' },
  { key: 'price_desc', labelKey: 'marketSortPriceHigh' },
  { key: 'title_asc', labelKey: 'marketSortTitleAZ' },
  { key: 'title_desc', labelKey: 'marketSortTitleZA' },
];

const CONDITION_OPTIONS: { key: ConditionFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'marketConditionAll' },
  { key: 'new', labelKey: 'conditionNew' },
  { key: 'good', labelKey: 'conditionGood' },
  { key: 'worn', labelKey: 'conditionWorn' },
];

// ─── MarketCard ───────────────────────────────────────────────────────────────

function conditionColor(condition: string | null): string {
  switch (condition) {
    case 'new': return '#00FF9D';
    case 'good': return '#00E5FF';
    case 'worn': return '#8892B0';
    default: return '#4A5568';
  }
}

function MarketCard({
  book,
  t,
  onPress,
  isOwnBook,
  btcRates,
}: {
  book: MarketBook;
  t: (key: string) => string;
  onPress: () => void;
  isOwnBook?: boolean;
  btcRates: BtcRates | null;
}) {
  const cond = book.condition;
  const condLabel =
    typeof cond === 'string' && cond.length > 0
      ? t(
          `condition${cond.charAt(0).toUpperCase() + cond.slice(1)}` as
            | 'conditionNew'
            | 'conditionGood'
            | 'conditionWorn'
        )
      : null;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      className="rounded-2xl p-4 mb-4 flex-row"
      style={{
        backgroundColor: '#131B2B',
        borderWidth: 1,
        borderColor: isOwnBook ? 'rgba(0, 229, 255, 0.5)' : 'rgba(255, 255, 255, 0.1)',
      }}>
      {/* Cover */}
      <View
        className="rounded-xl overflow-hidden mr-4"
        style={{ width: 72, height: 100, backgroundColor: '#1a2235', position: 'relative' }}>
        {book.cover_url ? (
          <Image source={{ uri: book.cover_url }} style={{ width: 72, height: 100 }} contentFit="cover" />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Ionicons name="book-outline" size={28} color="#4A5568" />
          </View>
        )}
        <View className="absolute bottom-0.5 right-0.5" style={{ maxWidth: 68 }}>
          <BookCardMetaChips
            page_count={book.page_count}
            total_pages={book.total_pages}
            average_rating={book.average_rating}
            variant="column"
          />
        </View>
      </View>

      {/* Info */}
      <View className="flex-1 min-w-0 justify-between">
        <View>
          <Text
            className="text-white text-base leading-tight mb-1"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
            numberOfLines={2}>
            {book.title}
          </Text>
          <Text
            className="text-[#8892B0] text-[10px] tracking-widest"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
            {book.author.toUpperCase()}
          </Text>
          {book.seller_npub ? (
            <Text
              className="text-[#4A5568] text-[10px] mt-1"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
              numberOfLines={1}>
              {book.seller_npub.length <= 28
                ? book.seller_npub
                : `${book.seller_npub.slice(0, 12)}...${book.seller_npub.slice(-12)}`}
            </Text>
          ) : null}
          {book.first_publish_year != null &&
          Number.isFinite(Number(book.first_publish_year)) ? (
            <Text
              className="text-[#4A5568] text-[10px] mt-1"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {String(book.first_publish_year)}
            </Text>
          ) : null}
        </View>

        {/* Bottom row: condition + price */}
        <View className="flex-row items-center justify-between mt-3">
          {condLabel ? (
            <View
              className="rounded-lg px-2 py-1"
              style={{ backgroundColor: `${conditionColor(book.condition)}18` }}>
              <Text
                className="text-[10px] tracking-widest"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: conditionColor(book.condition) }}>
                {condLabel.toUpperCase()}
              </Text>
            </View>
          ) : <View />}

          <View className="items-end">
            <View className="flex-row items-center gap-1">
              <Text style={{ fontSize: 14 }}>⚡</Text>
              <Text
                className="text-xl"
                style={{ fontFamily: 'SpaceGrotesk_700Bold', color: '#00FF9D' }}>
                {(() => {
                  const ps = book.price_sats;
                  const n = ps == null ? NaN : Number(ps);
                  return Number.isFinite(n) ? n.toLocaleString() : '—';
                })()}
              </Text>
              <Text
                className="text-[#6B7280] text-[10px] self-end mb-1"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                sats
              </Text>
            </View>
            {(() => {
              const ps = book.price_sats;
              const n = ps == null ? NaN : Number(ps);
              if (!Number.isFinite(n) || !btcRates) return null;
              const usd = satsToUsd(n, btcRates);
              if (usd == null || !Number.isFinite(usd)) return null;
              return (
                <Text
                  className="text-[9px]"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular', color: '#4A5568' }}>
                  ~${usd.toLocaleString()}
                </Text>
              );
            })()}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── MarketTabScreen ──────────────────────────────────────────────────────────

export default function MarketTabScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [books, setBooks] = useState<MarketBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [myNpub, setMyNpub] = useState<string | null>(null);
  const [btcRates, setBtcRates] = useState<BtcRates | null>(null);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [filterTitle, setFilterTitle] = useState('');
  const [filterAuthor, setFilterAuthor] = useState('');
  const [conditionFilter, setConditionFilter] = useState<ConditionFilter>('all');
  const [sortKey, setSortKey] = useState<MarketSort>('date_desc');

  const displayedBooks = useMemo(() => {
    const filtered = filterMarketBooks(books, {
      priceMin,
      priceMax,
      titleQ: filterTitle,
      authorQ: filterAuthor,
      condition: conditionFilter,
    });
    return sortMarketBooks(filtered, sortKey);
  }, [books, priceMin, priceMax, filterTitle, filterAuthor, conditionFilter, sortKey]);

  const clearFilters = useCallback(() => {
    setPriceMin('');
    setPriceMax('');
    setFilterTitle('');
    setFilterAuthor('');
    setConditionFilter('all');
    setSortKey('date_desc');
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      async function loadMarket() {
        setLoading(true);
        try {
          const [booksRes, keys, rates] = await Promise.all([
            supabase
              .from('books')
              .select('id, title, author, cover_url, price_sats, condition, isbn, translator, first_publish_year, created_at, seller_npub, sale_status, is_for_sale, page_count, total_pages, average_rating')
              .eq('sale_status', 'for_sale')
              .order('created_at', { ascending: false }),
            loadKeys(),
            fetchBitcoinRates(),
          ]);
          const { data, error } = booksRes;
          if (error) throw error;
          if (!isMounted) return;
          setBooks((data ?? []) as MarketBook[]);
          if (keys?.npub) setMyNpub(keys.npub);
          if (rates) setBtcRates(rates);
        } catch {
          // silently fail
        } finally {
          if (isMounted) setLoading(false);
        }
      }
      loadMarket();
      return () => { isMounted = false; };
    }, [])
  );

  return (
    <SafeAreaView className="flex-1 bg-[#0A0F1A]" edges={['top']}>
      {/* Header */}
      <View className="px-5 py-4">
        <View className="flex-row items-center justify-between mb-1">
          <Text
            className="text-[#00FF9D] text-xl tracking-[0.2em]"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            {t('p2pMarket')}
          </Text>
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={() => setFiltersOpen((o) => !o)}
              activeOpacity={0.85}
              className="px-3 py-1.5 rounded-full"
              style={{
                backgroundColor: filtersOpen ? 'rgba(0, 229, 255, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                borderWidth: 1,
                borderColor: filtersOpen ? 'rgba(0, 229, 255, 0.4)' : 'rgba(255, 255, 255, 0.12)',
              }}>
              <Text
                className="text-[10px] tracking-widest"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: filtersOpen ? '#00E5FF' : '#8892B0' }}>
                {filtersOpen ? t('marketFilterHide') : t('marketFilters')}
              </Text>
            </TouchableOpacity>
            <View
              className="flex-row items-center gap-1 px-3 py-1 rounded-full"
              style={{ backgroundColor: 'rgba(0, 255, 157, 0.1)', borderWidth: 1, borderColor: 'rgba(0, 255, 157, 0.3)' }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#00FF9D' }} />
              <Text
                className="text-[#00FF9D] text-[10px] tracking-widest"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                LIVE
              </Text>
            </View>
          </View>
        </View>
        <Text
          className="text-[#4A5568] text-xs tracking-widest"
          style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
          {t('marketShowingCount', { count: displayedBooks.length })}
          {books.length !== displayedBooks.length ? ` · ${books.length} ${t('books')}` : ''}
          {' · ⚡ Bitcoin Sats'}
        </Text>

        {filtersOpen ? (
          <View className="mt-4 rounded-2xl p-4" style={{ backgroundColor: '#131B2B', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
            <View className="flex-row gap-2 mb-3">
              <TextInput
                value={priceMin}
                onChangeText={setPriceMin}
                placeholder={t('marketPriceMin')}
                placeholderTextColor="#4A5568"
                keyboardType="numeric"
                className="flex-1 rounded-xl px-3 py-2.5 text-white text-sm"
                style={{ fontFamily: 'SpaceGrotesk_400Regular', backgroundColor: '#0A0F1A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
              />
              <TextInput
                value={priceMax}
                onChangeText={setPriceMax}
                placeholder={t('marketPriceMax')}
                placeholderTextColor="#4A5568"
                keyboardType="numeric"
                className="flex-1 rounded-xl px-3 py-2.5 text-white text-sm"
                style={{ fontFamily: 'SpaceGrotesk_400Regular', backgroundColor: '#0A0F1A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
              />
            </View>
            <TextInput
              value={filterTitle}
              onChangeText={setFilterTitle}
              placeholder={t('marketFilterTitlePlaceholder')}
              placeholderTextColor="#4A5568"
              className="rounded-xl px-3 py-2.5 text-white text-sm mb-3"
              style={{ fontFamily: 'SpaceGrotesk_400Regular', backgroundColor: '#0A0F1A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
            />
            <TextInput
              value={filterAuthor}
              onChangeText={setFilterAuthor}
              placeholder={t('marketFilterAuthorPlaceholder')}
              placeholderTextColor="#4A5568"
              className="rounded-xl px-3 py-2.5 text-white text-sm mb-3"
              style={{ fontFamily: 'SpaceGrotesk_400Regular', backgroundColor: '#0A0F1A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
            />
            <Text
              className="text-[#4A5568] text-[10px] tracking-widest mb-2"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
              {t('condition')}
            </Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {CONDITION_OPTIONS.map(({ key, labelKey }) => {
                const active = conditionFilter === key;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setConditionFilter(key)}
                    activeOpacity={0.85}
                    className="px-3 py-1.5 rounded-full"
                    style={{
                      backgroundColor: active ? 'rgba(0, 255, 157, 0.15)' : 'rgba(255,255,255,0.06)',
                      borderWidth: 1,
                      borderColor: active ? 'rgba(0, 255, 157, 0.4)' : 'rgba(255,255,255,0.1)',
                    }}>
                    <Text
                      className="text-[10px] tracking-widest"
                      style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: active ? '#00FF9D' : '#8892B0' }}>
                      {t(labelKey as 'marketConditionAll' | 'conditionNew' | 'conditionGood' | 'conditionWorn')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text
              className="text-[#4A5568] text-[10px] tracking-widest mb-2"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
              {t('marketSortBy')}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
              {SORT_OPTIONS.map(({ key, labelKey }) => {
                const active = sortKey === key;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setSortKey(key)}
                    activeOpacity={0.85}
                    className="px-3 py-1.5 rounded-full"
                    style={{
                      backgroundColor: active ? 'rgba(0, 229, 255, 0.15)' : 'rgba(255,255,255,0.06)',
                      borderWidth: 1,
                      borderColor: active ? 'rgba(0, 229, 255, 0.4)' : 'rgba(255,255,255,0.1)',
                    }}>
                    <Text
                      className="text-[10px] tracking-widest"
                      style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: active ? '#00E5FF' : '#8892B0' }}>
                      {t(labelKey as 'marketSortDateNew')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              onPress={clearFilters}
              activeOpacity={0.85}
              className="items-center py-2 rounded-xl"
              style={{ backgroundColor: 'rgba(136, 146, 176, 0.12)', borderWidth: 1, borderColor: 'rgba(136, 146, 176, 0.25)' }}>
              <Text className="text-[#8892B0] text-xs tracking-widest" style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                {t('marketFilterClear')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {/* Divider */}
      <View style={{ height: 1, backgroundColor: 'rgba(0, 255, 157, 0.1)', marginHorizontal: 20, marginBottom: 16 }} />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#00FF9D" />
        </View>
      ) : (
        <FlatList
          data={displayedBooks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <MarketCard
              book={item}
              t={t}
              onPress={() => router.push(`/book/${item.id}` as Href)}
              isOwnBook={!!myNpub && !!item.seller_npub && item.seller_npub === myNpub}
              btcRates={btcRates}
            />
          )}
          ListEmptyComponent={
            <View className="items-center py-16">
              <View
                className="w-20 h-20 rounded-2xl items-center justify-center mb-6"
                style={{ backgroundColor: 'rgba(0, 255, 157, 0.06)', borderWidth: 1, borderColor: 'rgba(0, 255, 157, 0.15)' }}>
                <Ionicons name="storefront-outline" size={36} color="#00FF9D" />
              </View>
              <Text
                className="text-[#8892B0] text-sm text-center tracking-wide mb-2"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                {books.length > 0 ? t('marketNoMatches') : t('tabMarket')}
              </Text>
              {books.length === 0 ? (
                <Text
                  className="text-[#4A5568] text-xs text-center"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                  {t('noBooksYet')}
                </Text>
              ) : null}
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}
