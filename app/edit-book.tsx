import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Slider from '@react-native-community/slider';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/utils/supabase';
import { fetchSmartBookData, searchBooksMulti, fetchBooksByAuthor, type AuthorBookItem, type SmartBookData } from '@/utils/bookApi';
import {
  pickCoverFromCamera,
  pickCoverFromGallery,
  showCoverPickerAlert,
} from '@/utils/coverPicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardWrapper } from '@/components/KeyboardWrapper';

type BookData = {
  id: string;
  title: string;
  author: string;
  total_pages: number;
  read_pages: number;
  reading_started_at: string | null;
  reading_finished_at: string | null;
  cover_url: string | null;
  isbn: string | null;
  translator: string | null;
  first_publish_year: number | null;
  translated_titles: Array<{ lang: string; title: string; isOriginal?: boolean }> | null;
  lightning_address: string | null;
};

export default function EditBookScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [permission, requestPermission] = useCameraPermissions();

  const [book, setBook] = useState<BookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchingCover, setSearchingCover] = useState(false);
  const [searchingDetails, setSearchingDetails] = useState(false);
  const [focusField, setFocusField] = useState<string | null>(null);
  const [apiUpdatedFields, setApiUpdatedFields] = useState<Record<string, boolean>>({});
  const [isAuthorModalVisible, setIsAuthorModalVisible] = useState(false);
  const [authorBooks, setAuthorBooks] = useState<AuthorBookItem[]>([]);
  const [isBarcodeScannerVisible, setIsBarcodeScannerVisible] = useState(false);
  const [searchResults, setSearchResults] = useState<SmartBookData[]>([]);
  const [isSearchResultModalVisible, setIsSearchResultModalVisible] = useState(false);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [totalPages, setTotalPages] = useState('');
  const [readPages, setReadPages] = useState('');
  const [isbn, setIsbn] = useState('');
  const [translator, setTranslator] = useState('');
  const [firstPublishYear, setFirstPublishYear] = useState('');
  const [translatedTitles, setTranslatedTitles] = useState<string>('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [lightningAddress, setLightningAddress] = useState('');
  const [readingStartedAt, setReadingStartedAt] = useState<Date | null>(null);
  const [readingFinishedAt, setReadingFinishedAt] = useState<Date | null>(null);
  const [datePickerTarget, setDatePickerTarget] = useState<'started' | 'finished' | null>(null);

  const initialValuesRef = useRef<{
    title: string;
    author: string;
    totalPages: string;
    firstPublishYear: string;
    translator: string;
    translatedTitles: string;
    isbn: string;
    coverUrl: string | null;
  } | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let isMounted = true;
    setLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase
          .from('books')
          .select('*')
          .eq('id', id)
          .single();
        if (!isMounted) return;
        if (!error && data) {
          const b = data as BookData;
          setBook(b);
          const tit = b.title ?? '';
          const aut = b.author ?? '';
          const tot = String(b.total_pages ?? '');
          const fpy = b.first_publish_year ? String(b.first_publish_year) : '';
          const trn = b.translator ?? '';
          const ttl = b.translated_titles ? JSON.stringify(b.translated_titles) : '';
          const isb = b.isbn ?? '';
          const cov = b.cover_url ?? null;
          const lig = b.lightning_address ?? '';
          const rs = b.reading_started_at ? new Date(b.reading_started_at) : null;
          const rf = b.reading_finished_at ? new Date(b.reading_finished_at) : null;
          setTitle(tit);
          setAuthor(aut);
          setTotalPages(tot);
          setReadPages(String(b.read_pages ?? 0));
          setIsbn(isb);
          setTranslator(trn);
          setFirstPublishYear(fpy);
          setTranslatedTitles(ttl);
          setCoverUrl(cov);
          setLightningAddress(lig);
          setReadingStartedAt(rs);
          setReadingFinishedAt(rf);
          initialValuesRef.current = {
            title: tit,
            author: aut,
            totalPages: tot,
            firstPublishYear: fpy,
            translator: trn,
            translatedTitles: ttl,
            isbn: isb,
            coverUrl: cov,
          };
        }
      } catch {
        // network / unexpected error — book stays null → guard shows error
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => { isMounted = false; };
  }, [id]);

  const handleOpenScanner = useCallback(async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert(t('error'), t('cameraPermission'));
        return;
      }
    }
    setIsBarcodeScannerVisible(true);
  }, [permission, requestPermission, t]);

  const handleBarcodeScanned = useCallback(({ data }: { data: string }) => {
    setIsbn(data);
    setIsBarcodeScannerVisible(false);
  }, []);

  const handleCoverPermissionDenied = useCallback(() => {
    Alert.alert(t('error'), t('cameraPermission'));
  }, [t]);

  const handleCoverPress = useCallback(() => {
    showCoverPickerAlert(t, async () => {
      const uri = await pickCoverFromCamera(handleCoverPermissionDenied);
      if (uri) setCoverUrl(uri);
    }, async () => {
      const uri = await pickCoverFromGallery(handleCoverPermissionDenied);
      if (uri) setCoverUrl(uri);
    });
  }, [t, handleCoverPermissionDenied]);

  const handleSearchCover = useCallback(async () => {
    if (!title.trim() && !author.trim() && !isbn.trim()) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    setSearchingCover(true);
    try {
      const results = await searchBooksMulti(isbn.trim(), title.trim(), author.trim());
      if (results.length > 0) {
        setSearchResults(results);
        setIsSearchResultModalVisible(true);
      } else {
        Alert.alert(t('noResultsWeb'));
      }
    } catch {
      Alert.alert(t('noResultsWeb'));
    } finally {
      setSearchingCover(false);
    }
  }, [title, author, isbn, t]);

  const applyBookData = useCallback((result: {
    title?: string;
    author?: string;
    totalPages?: number | null;
    isbn?: string | null;
    first_publish_year?: number | null;
    translator?: string | null;
    original_title?: string | null;
    cover_url?: string | null;
  }) => {
    const updates: Record<string, boolean> = {};
    if (result.title) { setTitle(result.title); updates.title = true; }
    if (result.author) { setAuthor(result.author); updates.author = true; }
    if (result.totalPages && result.totalPages > 0) { setTotalPages(String(result.totalPages)); updates.totalPages = true; }
    if (result.isbn) { setIsbn(result.isbn); updates.isbn = true; }
    if (result.first_publish_year) { setFirstPublishYear(String(result.first_publish_year)); updates.firstPublishYear = true; }
    if (result.translator) { setTranslator(result.translator); updates.translator = true; }
    if (result.original_title) {
      setTranslatedTitles(JSON.stringify([{ lang: 'orj', title: result.original_title, isOriginal: true }]));
      updates.translatedTitles = true;
    }
    if (result.cover_url) { setCoverUrl(result.cover_url); updates.coverUrl = true; }
    setApiUpdatedFields((prev) => ({ ...prev, ...updates }));
    setIsSearchResultModalVisible(false);
    return updates;
  }, []);

  const handleSelectAuthorBook = useCallback((item: AuthorBookItem) => {
    applyBookData(item);
    setIsAuthorModalVisible(false);
  }, [applyBookData]);

  const digitsOnly = useCallback((text: string) => text.replace(/[^0-9]/g, ''), []);

  const totalNum = parseInt(totalPages, 10) || 0;
  const readNum = parseInt(readPages, 10) || 0;
  const sliderMax = totalNum > 0 ? totalNum : 100;

  const handleTotalPagesChange = useCallback((txt: string) => {
    const clean = digitsOnly(txt);
    setTotalPages(clean);
    const nextTotal = parseInt(clean, 10) || 0;
    if (nextTotal > 0) {
      const currentRead = parseInt(readPages, 10) || 0;
      if (currentRead > nextTotal) setReadPages(String(nextTotal));
    }
  }, [digitsOnly, readPages]);

  const handleReadPagesChange = useCallback((txt: string) => {
    const clean = digitsOnly(txt);
    if (!clean) {
      setReadPages('');
      return;
    }
    const num = parseInt(clean, 10) || 0;
    const capped = totalNum > 0 ? Math.min(num, totalNum) : num;
    setReadPages(String(capped));
  }, [digitsOnly, totalNum]);

  useEffect(() => {
    if (readNum > 0 && !readingStartedAt) {
      setReadingStartedAt(new Date());
    }
    if (totalNum > 0 && readNum >= totalNum) {
      if (!readingFinishedAt) setReadingFinishedAt(new Date());
    } else if (readingFinishedAt) {
      setReadingFinishedAt(null);
    }
  }, [readNum, totalNum, readingStartedAt, readingFinishedAt]);

  const formatDate = useCallback((d: Date) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  }, []);

  const handleSearchDetails = useCallback(async () => {
    if (!title.trim() && !author.trim() && !isbn.trim()) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    setSearchingDetails(true);
    try {
      const results = await searchBooksMulti(isbn.trim(), title.trim(), author.trim());
      if (results.length > 0) {
        setSearchResults(results);
        setIsSearchResultModalVisible(true);
      } else {
        // Fallback: search by author
        const authorQuery = author.trim();
        if (authorQuery) {
          const books = await fetchBooksByAuthor(authorQuery);
          if (books.length > 0) {
            setAuthorBooks(books);
            setIsAuthorModalVisible(true);
          } else {
            Alert.alert(t('noResultsWeb'));
          }
        } else {
          Alert.alert(t('noResultsWeb'));
        }
      }
    } catch {
      Alert.alert(t('noResultsWeb'));
    } finally {
      setSearchingDetails(false);
    }
  }, [title, author, isbn, t]);

  const handleUpdate = useCallback(async () => {
    if (!id) return;
    if (!title.trim() || !author.trim() || !totalPages.trim()) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }

    const total = parseInt(totalPages, 10);
    const read = parseInt(readPages, 10);
    if (isNaN(total) || total <= 0 || isNaN(read) || read < 0) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }

    const year = firstPublishYear.trim() ? parseInt(firstPublishYear, 10) : null;
    let parsedTitles: unknown = null;
    if (translatedTitles.trim()) {
      try {
        parsedTitles = JSON.parse(translatedTitles);
      } catch {}
    }

    setSaving(true);
    try {
      const oldRead = book?.read_pages ?? 0;
      const pagesAdded = read - oldRead;

      const payload = {
        title: title.trim(),
        author: author.trim(),
        total_pages: total,
        read_pages: read,
        reading_started_at: readingStartedAt ? readingStartedAt.toISOString() : null,
        reading_finished_at: readingFinishedAt ? readingFinishedAt.toISOString() : null,
        isbn: isbn.trim() || null,
        translator: translator.trim() || null,
        first_publish_year: year && !isNaN(year) ? year : null,
        translated_titles: parsedTitles,
        cover_url: coverUrl || null,
        lightning_address: lightningAddress.trim() || null,
        status: read >= total ? 'read' : 'bought',
      };

      const { error } = await supabase
        .from('books')
        .update(payload)
        .eq('id', id);

      if (error) throw error;

      if (pagesAdded > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          await supabase.from('reading_logs').insert({
            user_id: user.id,
            book_id: id,
            pages_read: pagesAdded,
          });
        }
      }

      router.back();
    } catch (err: unknown) {
      Alert.alert(t('error'), (err as Error)?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  }, [id, title, author, totalPages, readPages, isbn, translator, firstPublishYear, translatedTitles, coverUrl, lightningAddress, readingStartedAt, readingFinishedAt, t, router]);

  const handleRollbackField = useCallback((field: keyof NonNullable<typeof initialValuesRef.current>) => {
    const initial = initialValuesRef.current;
    if (!initial) return;
    switch (field) {
      case 'title': setTitle(initial.title); break;
      case 'author': setAuthor(initial.author); break;
      case 'totalPages': setTotalPages(initial.totalPages); break;
      case 'firstPublishYear': setFirstPublishYear(initial.firstPublishYear); break;
      case 'translator': setTranslator(initial.translator); break;
      case 'translatedTitles': setTranslatedTitles(initial.translatedTitles); break;
      case 'isbn': setIsbn(initial.isbn); break;
      case 'coverUrl': setCoverUrl(initial.coverUrl); break;
      default: break;
    }
    setApiUpdatedFields((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const inputStyle = (field: string) => {
    const isApiUpdated = apiUpdatedFields[field];
    return {
      backgroundColor: '#131B2B',
      borderWidth: 1,
      borderColor: focusField === field ? '#00E5FF' : isApiUpdated ? '#00FF9D' : 'transparent',
      fontFamily: 'SpaceGrotesk_400Regular',
    };
  };

  const RollbackButton = useCallback(({ field }: { field: keyof NonNullable<typeof initialValuesRef.current> }) => {
    if (!apiUpdatedFields[field]) return null;
    return (
      <TouchableOpacity
        onPress={() => handleRollbackField(field)}
        activeOpacity={0.7}
        className="ml-2 w-9 h-9 rounded-lg items-center justify-center"
        style={{ backgroundColor: 'rgba(136, 146, 176, 0.2)' }}>
        <Ionicons name="arrow-undo-outline" size={18} color="#8892B0" />
      </TouchableOpacity>
    );
  }, [apiUpdatedFields, handleRollbackField]);

  const progressPercent =
    totalNum > 0 ? Math.min(100, Math.round((readNum / totalNum) * 100)) : 0;

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
            className="text-[#FF5050] text-xs tracking-[0.2em]"
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
            <Text
              className="text-[#00E5FF] text-xs tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
              {t('back')}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
    <KeyboardWrapper
      edges={['top']}
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingBottom: 40 }}>
        {/* ── Back button (top left) ── */}
        <View className="px-5 py-3">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-xl items-center justify-center self-start"
            style={{
              backgroundColor: '#131B2B',
              borderWidth: 1,
              borderColor: 'rgba(0, 229, 255, 0.2)',
            }}>
            <Ionicons name="arrow-back" size={22} color="#00E5FF" />
          </TouchableOpacity>
        </View>

        {/* ── Header + Cover ── */}
        <View className="py-2 items-center">
          <Text
            className="text-[#00E5FF] text-xl tracking-widest mb-6"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            {t('editDetails')}
          </Text>

          {/* ── Large tappable cover with Web search button ── */}
          <View className="relative mb-6">
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleCoverPress}
              className="rounded-xl overflow-hidden"
              style={{
                width: 160,
                height: 213,
                backgroundColor: '#131B2B',
                borderWidth: 2,
                borderColor: 'rgba(0, 229, 255, 0.3)',
              }}>
              {coverUrl ? (
                <Image
                  source={{ uri: coverUrl }}
                  style={{ width: 160, height: 213 }}
                  contentFit="cover"
                />
              ) : (
                <View
                  className="flex-1 items-center justify-center"
                  style={{ backgroundColor: '#1a2235' }}>
                  <Ionicons name="camera-outline" size={48} color="#00E5FF" />
                  <Text
                    className="text-[#00E5FF] text-xs mt-2 px-2 text-center"
                    style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                    {t('photoOptions')}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleSearchCover}
              disabled={searchingCover}
              className="absolute bottom-2 right-2 w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: '#00E5FF' }}>
              {searchingCover ? (
                <ActivityIndicator size="small" color="#0A0F1A" />
              ) : (
                <Ionicons name="globe-outline" size={20} color="#0A0F1A" />
              )}
            </TouchableOpacity>
            {apiUpdatedFields.coverUrl && (
              <TouchableOpacity
                onPress={() => handleRollbackField('coverUrl')}
                activeOpacity={0.7}
                className="absolute bottom-2 left-2 w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: 'rgba(136, 146, 176, 0.9)' }}>
                <Ionicons name="arrow-undo-outline" size={20} color="#E2E8F0" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Reading status ── */}
        <View
          className="rounded-2xl p-4 mb-6"
          style={{
            backgroundColor: '#131B2B',
            borderWidth: 1,
            borderColor: 'rgba(0, 229, 255, 0.15)',
          }}>
          <Text
            className="text-[#8892B0] text-xs mb-2 tracking-widest"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
            {t('pagesReadInput')}
          </Text>
          <View className="relative mb-4 justify-center">
            <TextInput
              className="rounded-xl pl-4 pr-12 py-4 text-white text-base"
              style={[
                inputStyle('readPages'),
                { backgroundColor: '#0F172A' }
              ]}
              placeholderTextColor="#4A5568"
              value={readPages}
              onChangeText={handleReadPagesChange}
              onFocus={() => setFocusField('readPages')}
              onBlur={() => setFocusField(null)}
              keyboardType="numeric"
            />
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleUpdate}
              disabled={saving}
              className="absolute right-2 w-10 h-10 rounded-xl items-center justify-center"
              style={{ backgroundColor: 'rgba(0, 229, 255, 0.1)' }}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#00E5FF" />
              ) : (
                <Ionicons name="save" size={20} color="#00E5FF" />
              )}
            </TouchableOpacity>
          </View>
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
            className="w-full rounded-full overflow-hidden"
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

          <View className="mt-3">
            <Slider
              minimumValue={0}
              maximumValue={sliderMax}
              step={1}
              value={readNum}
              onValueChange={(v) => setReadPages(String(v))}
              minimumTrackTintColor="#00E5FF"
              maximumTrackTintColor="rgba(136, 146, 176, 0.25)"
              thumbTintColor="#00E5FF"
            />
          </View>

          <View className="flex-row gap-3 mt-3">
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setDatePickerTarget('started')}
              className="flex-1 rounded-xl px-4 py-3"
              style={{
                backgroundColor: '#0F172A',
                borderWidth: 1,
                borderColor: 'rgba(0, 229, 255, 0.2)',
              }}>
              <Text className="text-[#8892B0] text-[10px] tracking-widest" style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                {t('startedReading')}
              </Text>
              <Text className="text-[#00E5FF] text-sm mt-1" style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                {readingStartedAt ? formatDate(readingStartedAt) : t('notSpecified')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setDatePickerTarget('finished')}
              className="flex-1 rounded-xl px-4 py-3"
              style={{
                backgroundColor: '#0F172A',
                borderWidth: 1,
                borderColor: 'rgba(0, 229, 255, 0.2)',
              }}>
              <Text className="text-[#8892B0] text-[10px] tracking-widest" style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                {t('finishedReading')}
              </Text>
              <Text className="text-[#00E5FF] text-sm mt-1" style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                {readingFinishedAt ? formatDate(readingFinishedAt) : t('notSpecified')}
              </Text>
            </TouchableOpacity>
          </View>

          {datePickerTarget && (
            <DateTimePicker
              value={(datePickerTarget === 'started' ? readingStartedAt : readingFinishedAt) ?? new Date()}
              mode="date"
              display="default"
              onChange={(event, selectedDate) => {
                if (event.type !== 'set' || !selectedDate) {
                  setDatePickerTarget(null);
                  return;
                }
                if (datePickerTarget === 'started') setReadingStartedAt(selectedDate);
                if (datePickerTarget === 'finished') setReadingFinishedAt(selectedDate);
                setDatePickerTarget(null);
              }}
            />
          )}
        </View>

        {/* ── Details form ── */}
        <View
          className="rounded-2xl p-4 mb-6"
          style={{
            backgroundColor: '#131B2B',
            borderWidth: 1,
            borderColor: 'rgba(0, 229, 255, 0.15)',
          }}>
          <View className="flex-row items-center justify-between mb-4">
            <Text
              className="text-[#00E5FF] text-xs tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
              {t('editDetails')}
            </Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleSearchDetails}
              disabled={searchingDetails}
              className="flex-row items-center gap-2 rounded-lg px-3 py-2"
              style={{
                backgroundColor: 'rgba(0, 229, 255, 0.15)',
                borderWidth: 1,
                borderColor: 'rgba(0, 229, 255, 0.4)',
              }}>
              {searchingDetails ? (
                <ActivityIndicator size="small" color="#00E5FF" />
              ) : (
                <Ionicons name="globe-outline" size={18} color="#00E5FF" />
              )}
              <Text
                className="text-[#00E5FF] text-[10px]"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                {t('searchFromWeb')}
              </Text>
            </TouchableOpacity>
          </View>

          <View className="mb-4">
            <Text
              className="text-[#8892B0] text-[10px] mb-2 tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {t('bookTitle')}
            </Text>
            <View className="flex-row items-center">
              <TextInput
                className="flex-1 rounded-xl px-4 py-3 text-white text-base"
                style={inputStyle('title')}
                placeholderTextColor="#4A5568"
                value={title}
                onChangeText={setTitle}
                onFocus={() => setFocusField('title')}
                onBlur={() => setFocusField(null)}
              />
              <RollbackButton field="title" />
            </View>
          </View>

          <View className="mb-4">
            <Text
              className="text-[#8892B0] text-[10px] mb-2 tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {t('author')}
            </Text>
            <View className="flex-row items-center">
              <TextInput
                className="flex-1 rounded-xl px-4 py-3 text-white text-base"
                style={inputStyle('author')}
                placeholderTextColor="#4A5568"
                value={author}
                onChangeText={setAuthor}
                onFocus={() => setFocusField('author')}
                onBlur={() => setFocusField(null)}
              />
              <RollbackButton field="author" />
            </View>
          </View>

          <View className="mb-4">
            <Text
              className="text-[#8892B0] text-[10px] mb-2 tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {t('totalPages')}
            </Text>
            <View className="flex-row items-center">
              <TextInput
                className="flex-1 rounded-xl px-4 py-3 text-white text-base"
                style={inputStyle('totalPages')}
                placeholderTextColor="#4A5568"
                value={totalPages}
                onChangeText={handleTotalPagesChange}
                onFocus={() => setFocusField('totalPages')}
                onBlur={() => setFocusField(null)}
                keyboardType="numeric"
              />
              <RollbackButton field="totalPages" />
            </View>
          </View>

          <View className="mb-4">
            <Text
              className="text-[#8892B0] text-[10px] mb-2 tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {t('isbn')}
            </Text>
            <View className="flex-row items-center">
              <TextInput
                className="flex-1 min-w-0 rounded-xl px-4 py-3 text-white text-base"
                style={inputStyle('isbn')}
                placeholderTextColor="#4A5568"
                value={isbn}
                onChangeText={setIsbn}
                onFocus={() => setFocusField('isbn')}
                onBlur={() => setFocusField(null)}
                keyboardType="default"
              />
              <RollbackButton field="isbn" />
              <TouchableOpacity
                onPress={handleOpenScanner}
                activeOpacity={0.7}
                className="ml-2 w-9 h-9 rounded-lg items-center justify-center"
                style={{ backgroundColor: 'rgba(0, 229, 255, 0.15)' }}>
                <Ionicons name="barcode-outline" size={22} color="#00E5FF" />
              </TouchableOpacity>
            </View>
          </View>

          <View className="mb-4">
            <Text
              className="text-[#8892B0] text-[10px] mb-2 tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {t('firstPublishYear')}
            </Text>
            <View className="flex-row items-center">
              <TextInput
                className="flex-1 rounded-xl px-4 py-3 text-white text-base"
                style={inputStyle('firstPublishYear')}
                placeholderTextColor="#4A5568"
                value={firstPublishYear}
                onChangeText={setFirstPublishYear}
                onFocus={() => setFocusField('firstPublishYear')}
                onBlur={() => setFocusField(null)}
                keyboardType="numeric"
              />
              <RollbackButton field="firstPublishYear" />
            </View>
          </View>

          <View className="mb-4">
            <Text
              className="text-[#8892B0] text-[10px] mb-2 tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {t('translator')}
            </Text>
            <View className="flex-row items-center">
              <TextInput
                className="flex-1 rounded-xl px-4 py-3 text-white text-base"
                style={inputStyle('translator')}
                placeholderTextColor="#4A5568"
                value={translator}
                onChangeText={setTranslator}
                onFocus={() => setFocusField('translator')}
                onBlur={() => setFocusField(null)}
                keyboardType="default"
              />
              <RollbackButton field="translator" />
            </View>
          </View>

          <View>
            <Text
              className="text-[#8892B0] text-[10px] mb-2 tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {t('lightningAddress')}
            </Text>
            <TextInput
              className="rounded-xl px-4 py-3 text-white text-base"
              style={inputStyle('lightningAddress')}
              placeholderTextColor="#4A5568"
              placeholder={t('lightningAddressPlaceholder')}
              value={lightningAddress}
              onChangeText={setLightningAddress}
              onFocus={() => setFocusField('lightningAddress')}
              onBlur={() => setFocusField(null)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {/* ── Update button ── */}
        <TouchableOpacity
          activeOpacity={0.8}
          className="rounded-2xl py-5 items-center justify-center"
          style={{ backgroundColor: saving ? '#00b3c8' : '#00E5FF' }}
          onPress={handleUpdate}
          disabled={saving}>
          <Text
            className="text-[#0A0F1A] text-base tracking-widest"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            {saving ? '...' : t('update')}
          </Text>
        </TouchableOpacity>
    </KeyboardWrapper>

        {/* ── Search Result Selection Modal ── */}
        <Modal
          visible={isSearchResultModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setIsSearchResultModalVisible(false)}>
          <View
            className="flex-1 justify-end"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}>
            <View
              className="rounded-t-3xl px-5 pt-5 pb-8"
              style={{
                backgroundColor: '#131B2B',
                borderTopWidth: 1,
                borderTopColor: 'rgba(0, 229, 255, 0.2)',
                maxHeight: '80%',
              }}>
              {/* Header */}
              <View className="flex-row items-center justify-between mb-4">
                <View>
                  <Text
                    className="text-[#00E5FF] text-lg tracking-widest"
                    style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                    {t('selectBook').toUpperCase()}
                  </Text>
                  <Text
                    className="text-[#8892B0] text-[10px] tracking-widest mt-1"
                    style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                    {t('selectFoundBook')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setIsSearchResultModalVisible(false)}
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: 'rgba(136, 146, 176, 0.15)' }}>
                  <Ionicons name="close" size={24} color="#8892B0" />
                </TouchableOpacity>
              </View>

              {/* List */}
              <FlatList
                data={searchResults}
                keyExtractor={(item, index) => `${item.isbn || item.title}-${index}`}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 20 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => applyBookData(item)}
                    className="flex-row items-center rounded-2xl p-3 mb-3"
                    style={{
                      backgroundColor: 'rgba(0, 229, 255, 0.05)',
                      borderWidth: 1,
                      borderColor: 'rgba(0, 229, 255, 0.1)',
                    }}>
                    {/* Mini Cover */}
                    <View
                      className="rounded-lg overflow-hidden mr-4"
                      style={{ width: 50, height: 70, backgroundColor: '#0A0F1A' }}>
                      {item.cover_url ? (
                        <Image
                          source={{ uri: item.cover_url }}
                          style={{ width: 50, height: 70 }}
                          contentFit="cover"
                        />
                      ) : (
                        <View className="flex-1 items-center justify-center">
                          <Ionicons name="book-outline" size={24} color="#4A5568" />
                        </View>
                      )}
                    </View>

                    {/* Info */}
                    <View className="flex-1">
                      <Text
                        className="text-white text-sm"
                        style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                        numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text
                        className="text-[#8892B0] text-xs mt-1"
                        style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                        {item.author}
                      </Text>
                      {item.first_publish_year ? (
                        <Text
                          className="text-[#4A5568] text-[10px] mt-1"
                          style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                          {item.first_publish_year}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="rgba(0, 229, 255, 0.3)" />
                  </TouchableOpacity>
                )}
              />

              {/* Cancel Button */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setIsSearchResultModalVisible(false)}
                className="mt-2 rounded-2xl py-4 items-center justify-center"
                style={{
                  borderWidth: 1,
                  borderColor: 'rgba(136, 146, 176, 0.3)',
                  backgroundColor: 'rgba(136, 146, 176, 0.1)',
                }}>
                <Text
                  className="text-[#8892B0] text-sm tracking-widest"
                  style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                  {t('cancel').toUpperCase()}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ── Author Books Fallback Modal ── */}
      <Modal
        visible={isAuthorModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsAuthorModalVisible(false)}>
        <View
          className="flex-1 justify-end"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}>
          <View
            className="rounded-t-3xl px-5 pt-5 pb-8"
            style={{
              backgroundColor: '#131B2B',
              borderTopWidth: 1,
              borderTopColor: 'rgba(0, 229, 255, 0.2)',
              maxHeight: '75%',
            }}>
            {/* Header */}
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-1 mr-3">
                <Text
                  className="text-[#00E5FF] text-xs tracking-widest leading-relaxed"
                  style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                  {t('authorBooksFallback')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsAuthorModalVisible(false)}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: 'rgba(136, 146, 176, 0.15)' }}>
                <Ionicons name="close" size={18} color="#8892B0" />
              </TouchableOpacity>
            </View>

            {/* Book List */}
            <FlatList
              data={authorBooks}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
              ItemSeparatorComponent={() => (
                <View style={{ height: 1, backgroundColor: 'rgba(0, 229, 255, 0.06)', marginVertical: 4 }} />
              )}
              renderItem={({ item }) => (
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => handleSelectAuthorBook(item)}
                  className="flex-row items-center rounded-xl py-3 px-2"
                  style={{ backgroundColor: 'rgba(0, 229, 255, 0.04)' }}>
                  {/* Cover */}
                  <View
                    className="rounded-lg overflow-hidden mr-3"
                    style={{ width: 44, height: 60, backgroundColor: '#0A0F1A' }}>
                    {item.cover_url ? (
                      <Image
                        source={{ uri: item.cover_url }}
                        style={{ width: 44, height: 60 }}
                        contentFit="cover"
                      />
                    ) : (
                      <View className="flex-1 items-center justify-center">
                        <Ionicons name="book-outline" size={20} color="#4A5568" />
                      </View>
                    )}
                  </View>
                  {/* Info */}
                  <View className="flex-1 min-w-0">
                    <Text
                      className="text-white text-sm"
                      style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                      numberOfLines={2}>
                      {item.title}
                    </Text>
                    {item.first_publish_year ? (
                      <Text
                        className="text-[#8892B0] text-[10px] mt-1"
                        style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                        {item.first_publish_year}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#4A5568" style={{ marginLeft: 8 }} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View className="py-8 items-center">
                  <Text className="text-[#4A5568] text-sm" style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                    {t('noResultsWeb')}
                  </Text>
                </View>
              }
            />

            {/* Cancel button */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIsAuthorModalVisible(false)}
              className="mt-4 rounded-2xl py-4 items-center justify-center"
              style={{
                borderWidth: 1,
                borderColor: 'rgba(136, 146, 176, 0.25)',
                backgroundColor: 'rgba(136, 146, 176, 0.08)',
              }}>
              <Text
                className="text-[#8892B0] text-sm tracking-widest"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                {t('cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Barcode Scanner Modal ── */}
      <Modal
        visible={isBarcodeScannerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsBarcodeScannerVisible(false)}>
        <View className="flex-1 bg-black">
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'qr'] }}
            onBarcodeScanned={handleBarcodeScanned}
          />
          <TouchableOpacity
            onPress={() => setIsBarcodeScannerVisible(false)}
            activeOpacity={0.8}
            className="absolute bottom-12 left-10 right-10 rounded-2xl py-4 items-center justify-center"
            style={{
              backgroundColor: 'rgba(255, 80, 80, 0.2)',
              borderWidth: 1,
              borderColor: '#FF5050',
            }}>
            <Text
              className="text-[#FF5050] text-sm tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
              {t('cancel').toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}
