import { useState, useCallback, useMemo, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Modal,
  Animated,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/utils/supabase';
import { generateBookSynopsis } from '@/utils/gemini';
import { BookCardMetaChips } from '@/components/BookCard';
import { isListedForSale } from '@/utils/bookListing';

// ─── Types ────────────────────────────────────────────────────────────────────

type Book = {
  id: string;
  title: string;
  author: string;
  total_pages: number;
  read_pages: number;
  current_value: number;
  ia_synopsis: string | null;
  status?: string;
  cover_url: string | null;
  isbn: string | null;
  is_for_sale: boolean | null;
  sale_status?: string | null;
  is_purchased?: boolean | null;
  price_sats: number | null;
  translated_titles: Array<{ lang: string; title: string; isOriginal?: boolean }> | null;
  created_at?: string;
  page_count?: number | null;
  average_rating?: number | null;
};

type FilterMode = 'all' | 'reading' | 'for_sale' | 'finished' | 'unread';
type SortMode = 'date' | 'title_az' | 'author_az' | 'price_high';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSynopsisForLanguage(iaSynopsis: string | null, lang: string): string {
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

// ─── BookCard ─────────────────────────────────────────────────────────────────

function BookCard({
  book,
  onDelete,
  onEdit,
  onGenerateAI,
  onOpenSynopsis,
  aiLoadingId,
  currentLang,
  t,
}: {
  book: Book;
  onDelete: (id: string) => void;
  onEdit: (book: Book) => void;
  onGenerateAI: (book: Book) => void;
  onOpenSynopsis: (book: Book) => void;
  aiLoadingId: string | null;
  currentLang: string;
  t: (key: string) => string;
}) {
  const swipeableRef = useRef<Swipeable>(null);
  const readPages = book.read_pages ?? 0;
  const totalPages = book.total_pages ?? 0;
  const progressPercent = totalPages > 0 ? Math.round((readPages / totalPages) * 100) : 0;
  const hasSynopsis = !!(book.ia_synopsis?.trim());
  const isAiLoading = aiLoadingId === book.id;
  const synopsisText = getSynopsisForLanguage(book.ia_synopsis, currentLang);

  const renderLeftActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({ inputRange: [0, 80], outputRange: [0.7, 1], extrapolate: 'clamp' });
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          swipeableRef.current?.close();
          onEdit(book);
        }}
        style={{
          width: 76,
          backgroundColor: 'rgba(0, 229, 255, 0.12)',
          borderWidth: 1,
          borderColor: 'rgba(0, 229, 255, 0.3)',
          borderRadius: 16,
          marginRight: 8,
          marginBottom: 16,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
        <Animated.View style={{ alignItems: 'center', transform: [{ scale }] }}>
          <Ionicons name="create-outline" size={22} color="#00E5FF" />
          <Text style={{ color: '#00E5FF', fontSize: 9, fontFamily: 'SpaceGrotesk_600SemiBold', marginTop: 4, letterSpacing: 1 }}>
            EDIT
          </Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0.7], extrapolate: 'clamp' });
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          swipeableRef.current?.close();
          onDelete(book.id);
        }}
        style={{
          width: 76,
          backgroundColor: 'rgba(255, 80, 80, 0.10)',
          borderWidth: 1,
          borderColor: 'rgba(255, 80, 80, 0.3)',
          borderRadius: 16,
          marginLeft: 8,
          marginBottom: 16,
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
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      overshootLeft={false}
      overshootRight={false}
      friction={2}>
      <View
        className="rounded-2xl p-4 mb-4 flex-row"
        style={{ backgroundColor: '#131B2B', borderWidth: 1, borderColor: '#1a2235' }}>

        {/* Cover */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => onOpenSynopsis(book)}
          className="rounded-lg overflow-hidden mr-4"
          style={{ width: 80, height: 112, backgroundColor: '#1a2235' }}>
          {book.cover_url ? (
            <Image source={{ uri: book.cover_url }} style={{ width: 80, height: 112 }} contentFit="cover" />
          ) : (
            <View className="flex-1 items-center justify-center">
              <Ionicons name="book-outline" size={32} color="#4A5568" />
            </View>
          )}
        </TouchableOpacity>

        {/* Content */}
        <View className="flex-1 min-w-0">
          {/* Header */}
          <View className="flex-row items-start justify-between mb-2">
            <View className="flex-1 mr-2 min-w-0">
              <TouchableOpacity activeOpacity={0.8} onPress={() => onOpenSynopsis(book)}>
                <Text
                  className="text-[#00E5FF] text-base leading-tight"
                  style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
                  numberOfLines={2}>
                  {book.title ?? '—'}
                </Text>
              </TouchableOpacity>
              {(() => {
                let titles = book.translated_titles;
                if (typeof titles === 'string') {
                  try { titles = JSON.parse(titles) as typeof book.translated_titles; } catch { return null; }
                }
                if (!titles || !Array.isArray(titles)) return null;
                const original = titles.find((x) => x?.isOriginal && x?.title);
                if (!original) return null;
                return (
                  <Text
                    className="text-[#6B7280] text-xs mt-1"
                    style={{ fontFamily: 'SpaceGrotesk_400Regular', fontStyle: 'italic' }}
                    numberOfLines={1}>
                    (Orj: {original.title})
                  </Text>
                );
              })()}
              <Text
                className="text-[#8892B0] text-[10px] tracking-widest mt-1"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                {String(book.author ?? '').toUpperCase()}
              </Text>
              <BookCardMetaChips
                page_count={book.page_count}
                total_pages={book.total_pages}
                average_rating={book.average_rating}
              />
            </View>
            {/* For-sale badge */}
            <View className="flex-row flex-wrap gap-1 justify-end">
              {isListedForSale(book) ? (
                <View
                  className="flex-row items-center gap-1 px-2 py-1 rounded-full"
                  style={{ backgroundColor: 'rgba(0, 255, 157, 0.1)', borderWidth: 1, borderColor: 'rgba(0, 255, 157, 0.3)' }}>
                  <Text style={{ fontSize: 9 }}>⚡</Text>
                  <Text style={{ color: '#00FF9D', fontSize: 9, fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                    {(() => {
                      const ps = book.price_sats;
                      const n = ps == null ? NaN : Number(ps);
                      return Number.isFinite(n) ? n.toLocaleString() : '—';
                    })()}
                  </Text>
                </View>
              ) : null}
              {book.is_purchased ? (
                <View
                  className="px-2 py-1 rounded-full"
                  style={{ backgroundColor: 'rgba(0, 229, 255, 0.12)', borderWidth: 1, borderColor: 'rgba(0, 229, 255, 0.35)' }}>
                  <Text style={{ color: '#00E5FF', fontSize: 8, fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                    {t('purchasedInAppBadge')}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Synopsis */}
          <View className="rounded-xl p-3 mb-3" style={{ backgroundColor: '#0A0F1A' }}>
            {hasSynopsis ? (
              <Text
                className="text-[#8892B0] text-[11px] leading-relaxed"
                style={{ fontFamily: 'SpaceGrotesk_400Regular', fontStyle: 'italic' }}
                numberOfLines={2}
                ellipsizeMode="tail">
                {synopsisText}
              </Text>
            ) : (
              <View className="flex-row items-center justify-between">
                <Text
                  className="text-[#8892B0] text-[11px] flex-1 mr-2"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular', fontStyle: 'italic' }}>
                  {t('iaSyncPending')}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  className="w-9 h-9 rounded-lg items-center justify-center"
                  style={{ backgroundColor: 'rgba(0, 229, 255, 0.12)', borderWidth: 1, borderColor: 'rgba(0, 229, 255, 0.3)' }}
                  onPress={() => onGenerateAI(book)}
                  disabled={isAiLoading}>
                  {isAiLoading ? <ActivityIndicator size="small" color="#00E5FF" /> : <Text>✨</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Progress */}
          <View>
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-[#8892B0] text-[9px] tracking-widest" style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                {t('leido')}
              </Text>
              <Text className="text-[#00E5FF] text-[10px]" style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                {progressPercent}%
              </Text>
            </View>
            <View className="w-full rounded-full mb-1" style={{ height: 4, backgroundColor: '#0A0F1A' }}>
              <View className="rounded-full" style={{ height: 4, width: `${progressPercent}%`, backgroundColor: '#00E5FF' }} />
            </View>
            <Text className="text-[#8892B0] text-[9px]" style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {readPages.toLocaleString()} / {totalPages.toLocaleString()} {t('pagesRead')}
            </Text>
          </View>
        </View>
      </View>
    </Swipeable>
  );
}

// ─── BottomModal ──────────────────────────────────────────────────────────────

function BottomModal<T extends string>({
  visible,
  onClose,
  title,
  options,
  selected,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: { value: T; label: string; icon?: string }[];
  selected: T;
  onSelect: (v: T) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' }}
        onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {}}
          style={{
            backgroundColor: '#131B2B',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderTopWidth: 1,
            borderTopColor: 'rgba(0, 229, 255, 0.2)',
            paddingTop: 20,
            paddingHorizontal: 20,
            paddingBottom: 40,
          }}>
          {/* Handle */}
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#3A4560', alignSelf: 'center', marginBottom: 16 }} />
          <Text
            style={{ color: '#00E5FF', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 12, letterSpacing: 2, marginBottom: 16 }}>
            {title.toUpperCase()}
          </Text>
          {options.map((opt) => {
            const isSelected = selected === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                activeOpacity={0.75}
                onPress={() => { onSelect(opt.value); onClose(); }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderRadius: 14,
                  marginBottom: 6,
                  backgroundColor: isSelected ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                  borderWidth: 1,
                  borderColor: isSelected ? 'rgba(0, 229, 255, 0.3)' : 'transparent',
                }}>
                {opt.icon ? (
                  <Ionicons
                    name={opt.icon as 'filter'}
                    size={18}
                    color={isSelected ? '#00E5FF' : '#4A5568'}
                    style={{ marginRight: 12 }}
                  />
                ) : null}
                <Text
                  style={{
                    fontFamily: isSelected ? 'SpaceGrotesk_600SemiBold' : 'SpaceGrotesk_400Regular',
                    fontSize: 14,
                    color: isSelected ? '#00E5FF' : '#8892B0',
                    flex: 1,
                  }}>
                  {opt.label}
                </Text>
                {isSelected ? (
                  <Ionicons name="checkmark-circle" size={18} color="#00E5FF" />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── LibraryTabScreen ─────────────────────────────────────────────────────────

export default function LibraryTabScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const [mainBooks, setMainBooks] = useState<Book[]>([]);
  const [listedBooks, setListedBooks] = useState<Book[]>([]);
  const [soldBooks, setSoldBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [sortMode, setSortMode] = useState<SortMode>('date');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [soldHistoryOpen, setSoldHistoryOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      async function loadBooks() {
        setLoading(true);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const uid = user?.id;
          const cols =
            'id, title, author, total_pages, read_pages, current_value, ia_synopsis, status, cover_url, isbn, is_for_sale, sale_status, is_purchased, price_sats, translated_titles, created_at, page_count, average_rating';
          if (!uid) {
            if (!isMounted) return;
            setMainBooks([]);
            setListedBooks([]);
            setSoldBooks([]);
            return;
          }
          const forUser = () =>
            supabase
              .from('books')
              .select(cols)
              .eq('user_id', uid)
              .order('created_at', { ascending: false });
          const [mainRes, listedRes, soldRes] = await Promise.all([
            forUser().neq('sale_status', 'sold'),
            forUser().eq('sale_status', 'for_sale'),
            forUser().eq('sale_status', 'sold'),
          ]);
          if (mainRes.error) throw mainRes.error;
          if (listedRes.error) throw listedRes.error;
          if (soldRes.error) throw soldRes.error;
          if (!isMounted) return;
          setMainBooks((mainRes.data ?? []) as Book[]);
          setListedBooks((listedRes.data ?? []) as Book[]);
          setSoldBooks((soldRes.data ?? []) as Book[]);
        } catch {
          // silently fail
        } finally {
          if (isMounted) setLoading(false);
        }
      }
      loadBooks();
      return () => { isMounted = false; };
    }, [])
  );

  const displayedBooks = useMemo(() => {
    const source = filterMode === 'for_sale' ? listedBooks : mainBooks;
    let list = [...source];

    const isFinished = (b: Book) =>
      b.status === 'read' ||
      ((b.read_pages ?? 0) >= (b.total_pages ?? 1) && (b.total_pages ?? 0) > 0);

    switch (filterMode) {
      case 'reading':
        list = list.filter((b) => (b.read_pages ?? 0) > 0 && !isFinished(b));
        break;
      case 'for_sale':
        break;
      case 'finished':
        list = list.filter((b) => isFinished(b));
        break;
      case 'unread':
        list = list.filter((b) => (b.read_pages ?? 0) === 0);
        break;
      default:
        break;
    }

    switch (sortMode) {
      case 'title_az':
        list.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'author_az':
        list.sort((a, b) => a.author.localeCompare(b.author));
        break;
      case 'price_high':
        list.sort((a, b) => (b.price_sats ?? 0) - (a.price_sats ?? 0));
        break;
      default:
        break;
    }

    return list;
  }, [mainBooks, listedBooks, filterMode, sortMode]);

  const handleDelete = useCallback(async (id: string) => {
    const { error } = await supabase.from('books').delete().eq('id', id);
    if (!error) {
      setMainBooks((p) => p.filter((b) => b.id !== id));
      setListedBooks((p) => p.filter((b) => b.id !== id));
      setSoldBooks((p) => p.filter((b) => b.id !== id));
    }
  }, []);

  const handleEdit = useCallback(    (book: Book) => {
      router.push(`/book/edit/${book.id}` as Href);
    }, [router]);

  const handleOpenSynopsis = useCallback((book: Book) => {
    router.push(`/book/${book.id}` as Href);
  }, [router]);

  const handleGenerateAI = useCallback(async (book: Book) => {
    setAiLoadingId(book.id);
    try {
      const synopsis = await generateBookSynopsis(book.title, book.author);
      if (synopsis) {
        const { error } = await supabase.from('books').update({ ia_synopsis: synopsis }).eq('id', book.id);
        if (!error) {
          const patch = (prev: Book[]) =>
            prev.map((b) => (b.id === book.id ? { ...b, ia_synopsis: synopsis } : b));
          setMainBooks(patch);
          setListedBooks(patch);
          setSoldBooks(patch);
        }
      }
    } finally {
      setAiLoadingId(null);
    }
  }, []);

  // Filter options
  const filterOptions: { value: FilterMode; label: string; icon: string }[] = [
    { value: 'all', label: t('filterAll'), icon: 'layers-outline' },
    { value: 'reading', label: t('filterReading'), icon: 'book-outline' },
    { value: 'for_sale', label: t('filterForSale'), icon: 'storefront-outline' },
    { value: 'finished', label: t('filterFinished'), icon: 'checkmark-circle-outline' },
    { value: 'unread', label: t('filterUnread'), icon: 'ellipse-outline' },
  ];

  // Sort options
  const sortOptions: { value: SortMode; label: string; icon: string }[] = [
    { value: 'date', label: t('sortByDate'), icon: 'calendar-outline' },
    { value: 'title_az', label: t('sortTitle'), icon: 'text-outline' },
    { value: 'author_az', label: t('sortAuthor'), icon: 'person-outline' },
    { value: 'price_high', label: t('sortPrice'), icon: 'flash-outline' },
  ];

  const activeFilter = filterOptions.find((o) => o.value === filterMode);
  const activeSort = sortOptions.find((o) => o.value === sortMode);
  const isFilterActive = filterMode !== 'all';
  const isSortActive = sortMode !== 'date';

  return (
    <SafeAreaView className="flex-1 bg-[#0A0F1A]" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-4 gap-2">
        <Text
          className="text-[#00E5FF] text-xl tracking-[0.2em] flex-1 min-w-0"
          style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
          {t('tabLibrary').toUpperCase()}
        </Text>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setSoldHistoryOpen(true)}
          disabled={soldBooks.length === 0}
          className="flex-row items-center gap-1 rounded-xl px-3 py-2"
          style={{
            backgroundColor: 'rgba(251, 191, 36, 0.12)',
            borderWidth: 1,
            borderColor: soldBooks.length ? 'rgba(251, 191, 36, 0.45)' : 'rgba(136, 146, 176, 0.2)',
            opacity: soldBooks.length ? 1 : 0.45,
          }}>
          <Ionicons name="archive-outline" size={16} color="#FBBF24" />
          <Text
            className="text-[#FBBF24] text-[10px] tracking-widest"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            {t('soldHistoryButton')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/add-book')}
          className="flex-row items-center gap-2 rounded-xl px-4 py-2"
          style={{ backgroundColor: '#00E5FF' }}>
          <Ionicons name="add" size={18} color="#0A0F1A" />
          <Text
            className="text-[#0A0F1A] text-xs tracking-widest"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            {t('addBook')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filter & Sort buttons */}
      <View className="flex-row gap-3 px-5 mb-4">
        <TouchableOpacity
          activeOpacity={0.7}
          className="flex-1 flex-row items-center justify-center py-3 rounded-xl gap-2"
          style={{
            backgroundColor: '#131B2B',
            borderWidth: 1,
            borderColor: isFilterActive ? '#00E5FF' : 'rgba(136, 146, 176, 0.2)',
          }}
          onPress={() => setFilterModalVisible(true)}>
          <Ionicons name="filter" size={15} color={isFilterActive ? '#00E5FF' : '#8892B0'} />
          <Text
            className="text-xs tracking-widest"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: isFilterActive ? '#00E5FF' : '#8892B0' }}>
            {activeFilter?.label ?? t('filterAll')}
          </Text>
          <Ionicons name="chevron-down" size={12} color={isFilterActive ? '#00E5FF' : '#4A5568'} />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          className="flex-1 flex-row items-center justify-center py-3 rounded-xl gap-2"
          style={{
            backgroundColor: '#131B2B',
            borderWidth: 1,
            borderColor: isSortActive ? '#00E5FF' : 'rgba(136, 146, 176, 0.2)',
          }}
          onPress={() => setSortModalVisible(true)}>
          <Ionicons name="swap-vertical" size={15} color={isSortActive ? '#00E5FF' : '#8892B0'} />
          <Text
            className="text-xs tracking-widest"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: isSortActive ? '#00E5FF' : '#8892B0' }}>
            {activeSort?.label ?? t('sortByDate')}
          </Text>
          <Ionicons name="chevron-down" size={12} color={isSortActive ? '#00E5FF' : '#4A5568'} />
        </TouchableOpacity>
      </View>

      {/* Book count */}
      {!loading && (
        <Text
          className="px-5 mb-3 text-[#4A5568] text-xs tracking-widest"
          style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
          {displayedBooks.length} {t('books')}
        </Text>
      )}

      <FlatList
        data={displayedBooks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 32 }}
        renderItem={({ item }) => (
          <BookCard
            book={item}
            onDelete={handleDelete}
            onEdit={handleEdit}
            onGenerateAI={handleGenerateAI}
            onOpenSynopsis={handleOpenSynopsis}
            aiLoadingId={aiLoadingId}
            currentLang={i18n.language}
            t={t}
          />
        )}
        ListEmptyComponent={
          !loading ? (
            <View className="items-center py-16">
              <Text style={{ fontSize: 48, marginBottom: 16 }}>📭</Text>
              <Text
                className="text-[#8892B0] text-sm text-center tracking-wide"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                {t('noBooksYet')}
              </Text>
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Filter Bottom Modal */}
      <BottomModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        title={t('filterModalTitle')}
        options={filterOptions}
        selected={filterMode}
        onSelect={setFilterMode}
      />

      {/* Sort Bottom Modal */}
      <BottomModal
        visible={sortModalVisible}
        onClose={() => setSortModalVisible(false)}
        title={t('sortModalTitle')}
        options={sortOptions}
        selected={sortMode}
        onSelect={setSortMode}
      />

      <Modal
        visible={soldHistoryOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSoldHistoryOpen(false)}>
        <TouchableOpacity
          activeOpacity={1}
          className="flex-1 justify-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.82)' }}
          onPress={() => setSoldHistoryOpen(false)}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View
              className="rounded-t-3xl px-5 pt-5 pb-8"
              style={{
                backgroundColor: '#131B2B',
                borderTopWidth: 1,
                borderTopColor: 'rgba(251, 191, 36, 0.35)',
                maxHeight: '78%',
              }}>
              <View className="flex-row items-center justify-between mb-4">
                <Text
                  className="text-[#FBBF24] text-lg tracking-widest"
                  style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                  {t('soldBooksTitle')}
                </Text>
                <TouchableOpacity
                  onPress={() => setSoldHistoryOpen(false)}
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: 'rgba(136, 146, 176, 0.15)' }}>
                  <Ionicons name="close" size={22} color="#8892B0" />
                </TouchableOpacity>
              </View>
              <FlatList
                data={soldBooks}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      setSoldHistoryOpen(false);
                      router.push(`/book/${item.id}` as Href);
                    }}
                    className="rounded-2xl p-4 mb-3 flex-row"
                    style={{
                      backgroundColor: 'rgba(251, 191, 36, 0.06)',
                      borderWidth: 1,
                      borderColor: 'rgba(251, 191, 36, 0.2)',
                    }}>
                    <View
                      className="rounded-lg overflow-hidden mr-3"
                      style={{ width: 48, height: 68, backgroundColor: '#1a2235' }}>
                      {item.cover_url ? (
                        <Image
                          source={{ uri: item.cover_url }}
                          style={{ width: 48, height: 68 }}
                          contentFit="cover"
                        />
                      ) : (
                        <View className="flex-1 items-center justify-center">
                          <Ionicons name="book-outline" size={22} color="#4A5568" />
                        </View>
                      )}
                    </View>
                    <View className="flex-1 min-w-0 justify-center">
                      <Text
                        className="text-white text-sm"
                        style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                        numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text
                        className="text-[#8892B0] text-[10px] mt-1 tracking-widest"
                        style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                        {item.author.toUpperCase()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text
                    className="text-[#8892B0] text-sm text-center py-8"
                    style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                    {t('noSoldBooksYet')}
                  </Text>
                }
              />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
