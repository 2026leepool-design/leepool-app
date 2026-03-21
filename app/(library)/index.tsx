import { useState, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  FlatList,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/utils/supabase';
import { generateBookSynopsis } from '@/utils/gemini';

// ─── Types ────────────────────────────────────────────────────────────────────

type Book = {
  id: string;
  title: string;
  author: string;
  total_pages: number;
  read_pages: number;
  current_value: number;
  ia_synopsis: string | null;
  status: string;
  cover_url: string | null;
  isbn: string | null;
  translated_titles: Array<{ lang: string; title: string; isOriginal?: boolean }> | null;
  created_at?: string;
};

type FilterMode = 'all' | 'read';
type SortMode = 'date' | 'progress';

// ─── BookCard ─────────────────────────────────────────────────────────────────

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
  const [coverExpanded, setCoverExpanded] = useState(false);
  const readPages = book.read_pages ?? 0;
  const totalPages = book.total_pages ?? 0;
  const progressPercent =
    totalPages > 0 ? Math.round((readPages / totalPages) * 100) : 0;
  const hasSynopsis = !!(book.ia_synopsis?.trim());
  const isAiLoading = aiLoadingId === book.id;
  const synopsisText = getSynopsisForLanguage(book.ia_synopsis, currentLang);

  const confirmDelete = () => {
    Alert.alert(t('error'), t('deleteConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => onDelete(book.id),
      },
    ]);
  };

  const placeholderBg = '#1a2235';

  return (
    <View
      className="rounded-2xl p-4 mb-4 flex-row"
      style={{
        backgroundColor: '#131B2B',
        borderWidth: 1,
        borderColor: '#1a2235',
      }}>
      {/* ── Cover (left) ── */}
      <View
        className="rounded-lg overflow-hidden mr-4"
        style={{ width: 80, height: 112, backgroundColor: placeholderBg }}>
        {book.cover_url ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setCoverExpanded(true)}
            style={{ width: 80, height: 112 }}>
            <Image
              source={{ uri: book.cover_url }}
              style={{ width: 80, height: 112 }}
              contentFit="cover"
            />
          </TouchableOpacity>
        ) : (
          <View
            className="flex-1 items-center justify-center"
            style={{ backgroundColor: placeholderBg }}>
            <Ionicons name="book-outline" size={32} color="#4A5568" />
          </View>
        )}
      </View>

      {/* ── Content (right) ── */}
      <View className="flex-1 min-w-0">
        {/* ── Header Row ── */}
        <View className="flex-row items-start justify-between mb-3">
          <View className="flex-1 mr-3 min-w-0">
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => onOpenSynopsis(book)}>
              <Text
                className="text-[#00E5FF] text-base leading-tight"
                style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
                numberOfLines={2}>
                {book.title}
              </Text>
            </TouchableOpacity>
            {(() => {
              let titles = book.translated_titles;
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
              return (
                <Text
                  className="text-[#6B7280] text-xs mt-1"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular', fontStyle: 'italic' }}
                  numberOfLines={2}>
                  (Orj: {original.title})
                </Text>
              );
            })()}
            <Text
              className="text-[#8892B0] text-[10px] tracking-widest mt-1"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {book.author.toUpperCase()}
            </Text>
          </View>

          {/* Action Buttons */}
          <View className="flex-row gap-2">
          <Pressable
            className="w-8 h-8 rounded-lg items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 229, 255, 0.1)' }}
            onPress={() => onEdit(book)}>
            <Ionicons name="create-outline" size={16} color="#00E5FF" />
          </Pressable>
          <Pressable
            className="w-8 h-8 rounded-lg items-center justify-center"
            style={{ backgroundColor: 'rgba(255, 80, 80, 0.1)' }}
            onPress={confirmDelete}>
            <Ionicons name="trash-outline" size={16} color="#FF5050" />
          </Pressable>
        </View>
        </View>

        {/* ── IA Synopsis Box ── */}
      <View
        className="rounded-xl p-3 mb-3"
        style={{ backgroundColor: '#0A0F1A' }}>
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
              className="w-10 h-10 rounded-lg items-center justify-center"
              style={{
                backgroundColor: 'rgba(0, 229, 255, 0.12)',
                borderWidth: 1,
                borderColor: 'rgba(0, 229, 255, 0.3)',
              }}
              onPress={() => onGenerateAI(book)}
              disabled={isAiLoading}>
              {isAiLoading ? (
                <ActivityIndicator size="small" color="#00E5FF" />
              ) : (
                <Text className="text-lg">✨</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Progress ── */}
      <View>
        <View className="flex-row justify-between items-center mb-1">
          <Text
            className="text-[#8892B0] text-[9px] tracking-widest"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
            {t('leido')}
          </Text>
          <Text
            className="text-[#00E5FF] text-[10px]"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
            {progressPercent}%
          </Text>
        </View>

        <View
          className="w-full rounded-full mb-1"
          style={{ height: 4, backgroundColor: '#0A0F1A' }}>
          <View
            className="rounded-full"
            style={{
              height: 4,
              width: `${progressPercent}%`,
              backgroundColor: '#00E5FF',
            }}
          />
        </View>

        <Text
          className="text-[#8892B0] text-[9px]"
          style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
          {readPages.toLocaleString()} / {totalPages.toLocaleString()}{' '}
          {t('pagesRead')}
        </Text>
      </View>
      </View>

      {/* ── Full Screen Cover Modal ── */}
      {book.cover_url && (
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
                  source={{ uri: book.cover_url }}
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
      )}
    </View>
  );
}

// ─── LibraryScreen ────────────────────────────────────────────────────────────

export default function LibraryScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [sortMode, setSortMode] = useState<SortMode>('date');
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      async function loadBooks() {
        setLoading(true);
        try {
          const { data, error } = await supabase
            .from('books')
            .select(
              'id, title, author, total_pages, read_pages, current_value, ia_synopsis, status, cover_url, isbn, translated_titles, created_at'
            )
            .order('created_at', { ascending: false });

          if (error) throw error;
          if (!isMounted) return;

          setBooks((data ?? []) as Book[]);
        } catch {
          // silently fail
        } finally {
          if (isMounted) setLoading(false);
        }
      }

      loadBooks();
      return () => {
        isMounted = false;
      };
    }, [])
  );

  const displayedBooks = useMemo(() => {
    let list = [...books];

    if (filterMode === 'read') {
      list = list.filter((b) => b.status === 'read');
    }

    if (sortMode === 'progress') {
      list.sort((a, b) => {
        const progA = (a.total_pages ?? 0) > 0
          ? (a.read_pages ?? 0) / (a.total_pages ?? 1)
          : 0;
        const progB = (b.total_pages ?? 0) > 0
          ? (b.read_pages ?? 0) / (b.total_pages ?? 1)
          : 0;
        return progB - progA;
      });
    }
    return list;
  }, [books, filterMode, sortMode]);

  const handleDelete = useCallback(async (id: string) => {
    const { error } = await supabase.from('books').delete().eq('id', id);
    if (!error) {
      setBooks((prev) => prev.filter((b) => b.id !== id));
    }
  }, []);

  const handleEdit = useCallback(
    (book: Book) => {
      router.push({ pathname: '/edit-book', params: { id: book.id } });
    },
    [router]
  );

  const handleOpenSynopsis = useCallback(
    (book: Book) => {
      router.push(`/book/${book.id}` as Href);
    },
    [router]
  );

  const handleGenerateAI = useCallback(async (book: Book) => {
    setAiLoadingId(book.id);
    try {
      const synopsis = await generateBookSynopsis(book.title, book.author);
      if (synopsis) {
        const { error } = await supabase
          .from('books')
          .update({ ia_synopsis: synopsis })
          .eq('id', book.id);

        if (!error) {
          setBooks((prev) =>
            prev.map((b) =>
              b.id === book.id ? { ...b, ia_synopsis: synopsis } : b
            )
          );
        }
      }
    } finally {
      setAiLoadingId(null);
    }
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-[#0A0F1A]" edges={['top']}>
      {/* ── Header: Back + Title ── */}
      <View className="flex-row items-center px-5 py-4 mb-0">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 rounded-xl items-center justify-center mr-3"
          style={{
            backgroundColor: '#131B2B',
            borderWidth: 1,
            borderColor: 'rgba(0, 229, 255, 0.2)',
          }}>
          <Ionicons name="arrow-back" size={22} color="#00E5FF" />
        </TouchableOpacity>
        <Text
          className="text-[#00E5FF] text-xl tracking-[0.2em] flex-1"
          style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
          {t('library')}
        </Text>
      </View>

      {/* ── Sort & Filter Buttons ── */}
      <View className="flex-row gap-3 px-5 mb-4">
        <TouchableOpacity
          activeOpacity={0.7}
          className="flex-1 flex-row items-center justify-center py-3 rounded-xl gap-2"
          style={{
            backgroundColor: '#131B2B',
            borderWidth: 1,
            borderColor: filterMode === 'read' ? '#00E5FF' : 'rgba(136, 146, 176, 0.2)',
          }}
          onPress={() => setFilterMode((m) => (m === 'all' ? 'read' : 'all'))}>
          <Ionicons
            name="filter"
            size={18}
            color={filterMode === 'read' ? '#00E5FF' : '#8892B0'}
          />
          <Text
            className="text-xs tracking-widest"
            style={{
              fontFamily: 'SpaceGrotesk_600SemiBold',
              color: filterMode === 'read' ? '#00E5FF' : '#8892B0',
            }}>
            {filterMode === 'all' ? t('filterAll') : t('filterRead')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          className="flex-1 flex-row items-center justify-center py-3 rounded-xl gap-2"
          style={{
            backgroundColor: '#131B2B',
            borderWidth: 1,
            borderColor: sortMode === 'progress' ? '#00E5FF' : 'rgba(136, 146, 176, 0.2)',
          }}
          onPress={() => setSortMode((m) => (m === 'date' ? 'progress' : 'date'))}>
          <Ionicons
            name="swap-vertical"
            size={18}
            color={sortMode === 'progress' ? '#00E5FF' : '#8892B0'}
          />
          <Text
            className="text-xs tracking-widest"
            style={{
              fontFamily: 'SpaceGrotesk_600SemiBold',
              color: sortMode === 'progress' ? '#00E5FF' : '#8892B0',
            }}>
            {sortMode === 'date' ? t('sortByDate') : t('sortByProgress')}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={displayedBooks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 32,
        }}
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
            <View className="items-center py-12">
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
    </SafeAreaView>
  );
}
