import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/utils/supabase';
import { fetchSmartBookData, searchBooksMulti, type SmartBookData } from '@/utils/bookApi';
import { analyzeBookCover } from '@/utils/gemini';
import {
  pickCoverFromCamera,
  pickCoverFromGallery,
  showCoverPickerAlert,
} from '@/utils/coverPicker';
import { KeyboardWrapper } from '@/components/KeyboardWrapper';
import { FlatList, Modal } from 'react-native';

const CAMERA_AVAILABLE = Platform.OS === 'ios' || Platform.OS === 'android';

export default function AddBookScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    title?: string;
    author?: string;
    cover_url?: string;
    page_count?: string;
    market_value?: string;
  }>();
  const [permission, requestPermission] = useCameraPermissions();

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [totalPages, setTotalPages] = useState('');
  const [isbn, setIsbn] = useState('');
  const [firstPublishYear, setFirstPublishYear] = useState('');
  const [translator, setTranslator] = useState('');
  const [translatedTitles, setTranslatedTitles] = useState<string>('');
  const [currentValue, setCurrentValue] = useState('');
  const [lightningAddress, setLightningAddress] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [focusField, setFocusField] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [searching, setSearching] = useState(false);
  const [analyzingCover, setAnalyzingCover] = useState(false);
  const [searchingWeb, setSearchingWeb] = useState(false);
  const [apiUpdatedFields, setApiUpdatedFields] = useState<Record<string, boolean>>({});
  const [searchResults, setSearchResults] = useState<SmartBookData[]>([]);
  const [isSearchResultModalVisible, setIsSearchResultModalVisible] = useState(false);
  const scanProcessed = useRef(false);
  const paramsApplied = useRef(false);

  useEffect(() => {
    if (paramsApplied.current) return;
    if (params?.title) { setTitle(params.title); paramsApplied.current = true; }
    if (params?.author) setAuthor(params.author);
    if (params?.cover_url?.trim()) setCoverUrl(params.cover_url.trim());
    if (params?.page_count) setTotalPages(params.page_count);
    if (params?.market_value) setCurrentValue(params.market_value);
  }, [params?.title, params?.author, params?.cover_url, params?.page_count, params?.market_value]);

  const applyBookData = useCallback((result: SmartBookData) => {
    const updates: Record<string, boolean> = {};
    if (result.title) { setTitle(result.title); updates.title = true; }
    if (result.author) { setAuthor(result.author); updates.author = true; }
    if (result.totalPages && result.totalPages > 0) { setTotalPages(String(result.totalPages)); updates.pages = true; }
    if (result.isbn) { setIsbn(result.isbn); updates.isbn = true; }
    if (result.first_publish_year) { setFirstPublishYear(String(result.first_publish_year)); updates.firstPublishYear = true; }
    if (result.translator) { setTranslator(result.translator); updates.translator = true; }
    if (result.cover_url) { setCoverUrl(result.cover_url); updates.coverUrl = true; }
    if (result.original_title) {
      setTranslatedTitles(JSON.stringify([{ lang: 'orj', title: result.original_title, isOriginal: true }]));
      updates.translatedTitles = true;
    }
    setApiUpdatedFields((prev) => ({ ...prev, ...updates }));
    setIsSearchResultModalVisible(false);
  }, []);

  const handleScanPress = useCallback(async () => {
    if (!CAMERA_AVAILABLE) {
      Alert.alert(t('error'), t('cameraPermission'));
      return;
    }
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert(t('error'), t('cameraPermission'));
        return;
      }
    }
    scanProcessed.current = false;
    setScanning(true);
  }, [permission, requestPermission, t]);

  const handleBarcodeScanned = useCallback(
    async ({ data }: { type: string; data: string }) => {
      if (scanProcessed.current) return;
      scanProcessed.current = true;
      setScanning(false);
      setSearching(true);
      try {
        const results = await searchBooksMulti(data, '', '');
        if (results.length > 0) {
          setSearchResults(results);
          setIsSearchResultModalVisible(true);
        } else {
          Alert.alert(t('error'), t('bookNotFound'));
        }
      } catch {
        Alert.alert(t('error'), t('bookNotFound'));
      } finally {
        setSearching(false);
      }
    },
    [t]
  );

  const handleCoverPermissionDenied = useCallback(() => {
    Alert.alert(t('error'), t('cameraPermission'));
  }, [t]);

  const processCoverAndAnalyze = useCallback(
    async (uri: string) => {
      setCoverUrl(uri);
      setAnalyzingCover(true);
      try {
        const rawBase64 = uri.replace(/^data:image\/\w+;base64,/, '');
        const ocrResult = await analyzeBookCover(rawBase64);
        let ocrTitle = '';
        let ocrAuthor = '';
        if (ocrResult) {
          if (ocrResult.title) {
            setTitle(ocrResult.title);
            ocrTitle = ocrResult.title;
          }
          if (ocrResult.author) {
            setAuthor(ocrResult.author);
            ocrAuthor = ocrResult.author;
          }
        }

        if (ocrTitle || ocrAuthor) {
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {}
          
          const webResults = await searchBooksMulti('', ocrTitle, ocrAuthor);
          if (webResults.length > 0) {
            setSearchResults(webResults);
            setIsSearchResultModalVisible(true);
          } else {
            // Even if no web results, we have OCR data already applied to title/author via lines 114/118
            Alert.alert(t('aiScanSuccess'));
          }
        }
      } catch {
        // Silent fail - user can fill manually
      } finally {
        setAnalyzingCover(false);
      }
    },
    [t]
  );

  const handleSearchFromWeb = useCallback(async () => {
    if (!title.trim() && !author.trim() && !isbn.trim()) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    setSearchingWeb(true);
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
      setSearchingWeb(false);
    }
  }, [title, author, isbn, t]);

  const handleCoverPress = useCallback(() => {
    showCoverPickerAlert(t, async () => {
      const uri = await pickCoverFromCamera(handleCoverPermissionDenied);
      if (uri) processCoverAndAnalyze(uri);
    }, async () => {
      const uri = await pickCoverFromGallery(handleCoverPermissionDenied);
      if (uri) processCoverAndAnalyze(uri);
    });
  }, [t, handleCoverPermissionDenied, processCoverAndAnalyze]);

  const handleAmazonRedirect = useCallback(() => {
    const url = isbn.trim()
      ? `https://www.amazon.com/s?k=${isbn.trim()}&tag=leepool-21`
      : `https://www.amazon.com/s?k=${encodeURIComponent(`${title.trim()} ${author.trim()}`.trim())}&tag=leepool-21`;
    Linking.openURL(url);
  }, [isbn, title, author]);

  const handleSave = useCallback(async () => {
    if (!title.trim() || !author.trim() || !totalPages.trim()) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }

    const pages = parseInt(totalPages, 10);
    if (isNaN(pages) || pages <= 0) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }

    setLoading(true);
    try {
      const year = firstPublishYear.trim() ? parseInt(firstPublishYear, 10) : null;
      let parsedTitles: unknown = null;
      if (translatedTitles.trim()) {
        try {
          parsedTitles = JSON.parse(translatedTitles);
        } catch {}
      }
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('books').insert([
        {
          title: title.trim(),
          author: author.trim(),
          total_pages: pages,
          isbn: isbn.trim() || null,
          first_publish_year: year && !isNaN(year) ? year : null,
          translator: translator.trim() || null,
          translated_titles: parsedTitles,
          current_value: parseFloat(currentValue) || 0,
          read_pages: 0,
          status: 'bought',
          cover_url: coverUrl || null,
          lightning_address: lightningAddress.trim() || null,
          user_id: user?.id ?? null,
        },
      ]);

      if (error) throw error;

      router.back();
    } catch (err: unknown) {
      Alert.alert(t('error'), (err as Error)?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [title, author, totalPages, isbn, firstPublishYear, translator, translatedTitles, currentValue, lightningAddress, coverUrl, t, router]);

  const inputStyle = (field: string) => {
    const isApiUpdated = apiUpdatedFields[field];
    return {
      backgroundColor: '#131B2B',
      borderWidth: 1,
      borderColor: focusField === field ? '#00E5FF' : isApiUpdated ? '#00FF9D' : 'transparent',
      fontFamily: 'SpaceGrotesk_400Regular',
    };
  };

  // ─── Camera Scanner (full screen) ───────────────────────────────────────────
  if (scanning && CAMERA_AVAILABLE) {
    return (
      <View className="flex-1 bg-black">
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8'] }}
          onBarcodeScanned={handleBarcodeScanned}
        />
        <View
          className="absolute left-0 right-0 bottom-0 p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <TouchableOpacity
            className="rounded-xl py-3 items-center"
            style={{ backgroundColor: '#131B2B', borderWidth: 1, borderColor: '#00E5FF' }}
            onPress={() => setScanning(false)}>
            <Text
              className="text-[#00E5FF] text-sm"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
              {t('cancel')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Searching overlay ─────────────────────────────────────────────────────
  if (searching) {
    return (
      <View className="flex-1 bg-[#0A0F1A] items-center justify-center px-8">
        <ActivityIndicator size="large" color="#00E5FF" />
        <Text
          className="text-[#00E5FF] text-lg mt-6"
          style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
          {t('searching')}
        </Text>
      </View>
    );
  }

  // ─── Form ──────────────────────────────────────────────────────────────────
  return (
    <>
    <KeyboardWrapper
      contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 24 }}
      edges={['top']}>
        <Text
          className="text-[#00E5FF] text-2xl mb-4 tracking-widest"
          style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
          {t('addBook')}
        </Text>

        {/* ── Scan Barcode Button ── */}
        {CAMERA_AVAILABLE && (
          <TouchableOpacity
            activeOpacity={0.8}
            className="flex-row items-center justify-center rounded-2xl py-4 mb-6 gap-3"
            style={{ backgroundColor: '#00E5FF' }}
            onPress={handleScanPress}>
            <Ionicons name="barcode-outline" size={24} color="#0A0F1A" />
            <Text
              className="text-[#0A0F1A] text-base tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
              {t('scanBarcode')}
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Analyzing overlay ── */}
        {analyzingCover && (
          <View
            className="rounded-2xl flex-row items-center justify-center gap-3 py-4 mb-4"
            style={{
              backgroundColor: 'rgba(0, 229, 255, 0.1)',
              borderWidth: 1,
              borderColor: 'rgba(0, 229, 255, 0.3)',
            }}>
            <ActivityIndicator size="small" color="#00E5FF" />
            <Text
              className="text-[#00E5FF] text-sm tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
              {t('analyzingCover')}
            </Text>
          </View>
        )}

        {/* ── Cover: placeholder (take photo) or preview + Web search ── */}
        <View className="mb-4 flex-row items-center gap-3">
          <View className="relative">
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleCoverPress}
            disabled={analyzingCover}
            className="rounded-lg overflow-hidden"
            style={{
              width: 64,
              height: 88,
              backgroundColor: '#131B2B',
              borderWidth: 1,
              borderColor: 'rgba(0, 229, 255, 0.2)',
              borderStyle: 'dashed',
            }}>
            {coverUrl ? (
              <Image
                source={{ uri: coverUrl }}
                style={{ width: 64, height: 88 }}
                contentFit="cover"
              />
            ) : (
              <View className="flex-1 items-center justify-center gap-1">
                <Ionicons name="camera-outline" size={24} color="#00E5FF" />
                <Text
                  className="text-[#00E5FF] text-[9px] px-2 text-center"
                  style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                  {t('photoOptions')}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleSearchFromWeb}
            disabled={searchingWeb || (!title.trim() && !author.trim() && !isbn.trim())}
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full items-center justify-center"
            style={{ backgroundColor: '#00E5FF' }}>
            {searchingWeb ? (
              <ActivityIndicator size="small" color="#0A0F1A" />
            ) : (
              <Ionicons name="globe-outline" size={16} color="#0A0F1A" />
            )}
          </TouchableOpacity>
          </View>
          {coverUrl ? (
            <TouchableOpacity
              onPress={() => setCoverUrl(null)}
              className="rounded-lg py-2 px-3"
              style={{ backgroundColor: 'rgba(255, 80, 80, 0.15)' }}>
              <Text
                className="text-[#FF5050] text-[10px]"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                ✕
              </Text>
            </TouchableOpacity>
          ) : (
            <Text
              className="text-[#8892B0] text-xs flex-1"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              Cover
            </Text>
          )}
        </View>

        {/* Book Title */}
        <View className="mb-5">
          <Text
            className="text-[#8892B0] text-xs mb-2 tracking-widest"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
            {t('bookTitle')}
          </Text>
          <TextInput
            className="rounded-xl px-4 py-4 text-white text-base"
            style={inputStyle('title')}
            placeholderTextColor="#4A5568"
            value={title}
            onChangeText={setTitle}
            onFocus={() => setFocusField('title')}
            onBlur={() => setFocusField(null)}
          />
        </View>

        {/* Author */}
        <View className="mb-5">
          <Text
            className="text-[#8892B0] text-xs mb-2 tracking-widest"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
            {t('author')}
          </Text>
          <TextInput
            className="rounded-xl px-4 py-4 text-white text-base"
            style={inputStyle('author')}
            placeholderTextColor="#4A5568"
            value={author}
            onChangeText={setAuthor}
            onFocus={() => setFocusField('author')}
            onBlur={() => setFocusField(null)}
          />
        </View>

        {/* Total Pages + Current Value */}
        <View className="flex-row gap-3 mb-5">
          <View className="flex-1">
            <Text
              className="text-[#8892B0] text-xs mb-2 tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {t('totalPages')}
            </Text>
            <TextInput
              className="rounded-xl px-4 py-4 text-white text-base"
              style={inputStyle('pages')}
              placeholderTextColor="#4A5568"
              value={totalPages}
              onChangeText={setTotalPages}
              onFocus={() => setFocusField('pages')}
              onBlur={() => setFocusField(null)}
              keyboardType="numeric"
            />
          </View>
          <View className="flex-1">
            <Text
              className="text-[#8892B0] text-xs mb-2 tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {t('marketValue')}
            </Text>
            <TextInput
              className="rounded-xl px-4 py-4 text-white text-base"
              style={inputStyle('value')}
              placeholderTextColor="#4A5568"
              value={currentValue}
              onChangeText={setCurrentValue}
              onFocus={() => setFocusField('value')}
              onBlur={() => setFocusField(null)}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* ISBN + First Publish Year */}
        <View className="flex-row gap-3 mb-5">
          <View className="flex-1">
            <Text
              className="text-[#8892B0] text-xs mb-2 tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {t('isbn')}
            </Text>
            <TextInput
              className="rounded-xl px-4 py-4 text-white text-base"
              style={inputStyle('isbn')}
              placeholderTextColor="#4A5568"
              value={isbn}
              onChangeText={setIsbn}
              onFocus={() => setFocusField('isbn')}
              onBlur={() => setFocusField(null)}
              keyboardType="default"
            />
          </View>
          <View className="flex-1">
            <Text
              className="text-[#8892B0] text-xs mb-2 tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {t('firstPublishYear')}
            </Text>
            <TextInput
              className="rounded-xl px-4 py-4 text-white text-base"
              style={inputStyle('firstPublishYear')}
              placeholderTextColor="#4A5568"
              value={firstPublishYear}
              onChangeText={setFirstPublishYear}
              onFocus={() => setFocusField('firstPublishYear')}
              onBlur={() => setFocusField(null)}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Translator */}
        <View className="mb-5">
          <Text
            className="text-[#8892B0] text-xs mb-2 tracking-widest"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
            {t('translator')}
          </Text>
          <TextInput
            className="rounded-xl px-4 py-4 text-white text-base"
            style={inputStyle('translator')}
            placeholderTextColor="#4A5568"
            value={translator}
            onChangeText={setTranslator}
            onFocus={() => setFocusField('translator')}
            onBlur={() => setFocusField(null)}
            keyboardType="default"
          />
        </View>

        {/* Lightning Address (LUD-16) - Optional */}
        <View className="mb-5">
          <Text
            className="text-[#8892B0] text-xs mb-2 tracking-widest"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
            {t('lightningAddress')}
          </Text>
          <TextInput
            className="rounded-xl px-4 py-4 text-white text-base"
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

        {/* Buttons */}
        <View className="flex-row gap-4 mb-4">
          <TouchableOpacity
            activeOpacity={0.7}
            className="flex-1 rounded-2xl py-5 items-center justify-center"
            style={{ borderWidth: 1, borderColor: 'rgba(136, 146, 176, 0.2)' }}
            onPress={() => router.back()}>
            <Text
              className="text-[#8892B0] text-base tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
              {t('cancel')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            className="flex-1 rounded-2xl py-5 items-center justify-center"
            style={{ backgroundColor: loading ? '#00b3c8' : '#00E5FF' }}
            onPress={handleSave}
            disabled={loading}>
            <Text
              className="text-[#0A0F1A] text-base tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
              {loading ? '...' : t('save')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Amazon Affiliate Button ── */}
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
          disabled={!title.trim() && !isbn.trim()}
          className="rounded-2xl py-4 items-center justify-center flex-row gap-3"
          style={{
            backgroundColor: '#0A0D13',
            borderWidth: 1.5,
            borderColor: (!title.trim() && !isbn.trim()) ? 'rgba(255, 153, 0, 0.3)' : '#FF9900',
            shadowColor: '#FF9900',
            shadowOpacity: (!title.trim() && !isbn.trim()) ? 0 : 0.35,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 0 },
            elevation: 8,
          }}>
          <Text style={{ fontSize: 18 }}>🛒</Text>
          <Text
            className="text-sm tracking-widest"
            style={{
              fontFamily: 'SpaceGrotesk_700Bold',
              color: (!title.trim() && !isbn.trim()) ? 'rgba(255, 153, 0, 0.4)' : '#FF9900',
            }}>
            {t('findPhysicalCopy')}
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
    </>
  );
}
