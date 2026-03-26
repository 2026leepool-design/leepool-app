import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { searchBooksOmni, type GoogleBookResult } from '@/utils/api';

function formatPrice(amount: number, currency: string | null): string {
  const code = (currency ?? 'USD').toUpperCase();
  if (code === 'USD') return `$${amount.toFixed(2)}`;
  if (code === 'EUR') return `€${amount.toFixed(2)}`;
  return `${amount.toFixed(2)} ${code}`;
}

function ResultCard({
  item,
  onPress,
  t,
}: {
  item: GoogleBookResult;
  onPress: () => void;
  t: (k: string) => string;
}) {
  const hasPrice = item.price_amount != null && item.price_amount > 0;
  const hasRating =
    item.average_rating != null &&
    item.average_rating > 0 &&
    item.ratings_count != null &&
    item.ratings_count > 0;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      className="flex-row rounded-2xl p-4 mb-3"
      style={{
        backgroundColor: '#131B2B',
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.2)',
      }}>
      <View
        className="rounded-xl overflow-hidden mr-4"
        style={{ width: 56, height: 84, backgroundColor: '#1a2235' }}>
        {item.cover_url ? (
          <ExpoImage
            source={{ uri: item.cover_url }}
            style={{ width: 56, height: 84 }}
            contentFit="cover"
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Ionicons name="book-outline" size={28} color="#4A5568" />
          </View>
        )}
      </View>
      <View className="flex-1 min-w-0 justify-center">
        <Text
          className="text-[#00E5FF] text-sm mb-1"
          style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
          numberOfLines={2}>
          {item.title}
        </Text>
        <Text
          className="text-[#8892B0] text-[10px] tracking-widest"
          style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          numberOfLines={1}>
          {item.author.toUpperCase()}
        </Text>
        {item.page_count != null && (
          <Text
            className="text-[#4A5568] text-[10px] mt-1"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
            {item.page_count} pg
          </Text>
        )}
        {hasPrice && (
          <Text
            className="text-[10px] mt-1"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#00FF9D' }}>
            {formatPrice(item.price_amount!, item.price_currency)} ({t('googlePlay')})
          </Text>
        )}
        {hasRating && (
          <Text
            className="text-[10px] mt-1"
            style={{ fontFamily: 'SpaceGrotesk_400Regular', color: '#F59E0B' }}>
            ⭐ {item.average_rating!.toFixed(1)} ({item.ratings_count!.toLocaleString()} {t('reviews')})
          </Text>
        )}
        {!hasPrice && (
          <Text
            className="text-[10px] mt-1"
            style={{ fontFamily: 'SpaceGrotesk_400Regular', color: '#4A5568' }}>
            {t('priceNotFound')}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#4A5568" style={{ alignSelf: 'center' }} />
    </TouchableOpacity>
  );
}

export default function SearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { query } = useLocalSearchParams<{ query: string }>();

  const [results, setResults] = useState<GoogleBookResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [localQuery, setLocalQuery] = useState(query ?? '');

  useEffect(() => {
    const q = (query ?? '').trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLocalQuery(q);
    setLoading(true);
    searchBooksOmni(q)
      .then(setResults)
      .finally(() => setLoading(false));
  }, [query]);

  const handleSelect = (item: GoogleBookResult) => {
    const params: Record<string, string> = {
      title: item.title,
      author: item.author,
      cover_url: item.cover_url ?? '',
      page_count: item.page_count != null ? String(item.page_count) : '',
    };
    if (item.price_amount != null && item.price_amount > 0) {
      params.market_value = String(item.price_amount);
    }
    router.push({ pathname: '/add-book', params });
  };

  return (
    <SafeAreaView className="flex-1 bg-[#0A0F1A]" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b" style={{ borderColor: 'rgba(0, 229, 255, 0.15)' }}>
        <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
          <Ionicons name="arrow-back" size={24} color="#00E5FF" />
        </TouchableOpacity>
        <Text
          className="text-[#00E5FF] text-base flex-1"
          style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
          {t('search')}
        </Text>
      </View>

      {/* Query badge */}
      {query && (
        <View className="px-4 py-2">
          <Text
            className="text-[#8892B0] text-xs"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
            &quot;{localQuery}&quot;
          </Text>
        </View>
      )}

      {loading ? (
        <View className="flex-1 items-center justify-center py-20">
          <ActivityIndicator size="large" color="#00E5FF" />
          <Text className="text-[#8892B0] text-xs mt-4" style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
            {t('searching')}
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <View
            className="w-20 h-20 rounded-2xl items-center justify-center mb-4"
            style={{ backgroundColor: 'rgba(0, 229, 255, 0.06)', borderWidth: 1, borderColor: 'rgba(0, 229, 255, 0.15)' }}>
            <Ionicons name="search-outline" size={36} color="#00E5FF" />
          </View>
          <Text
            className="text-[#8892B0] text-sm text-center"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
            {t('noSearchResults')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ResultCard item={item} onPress={() => handleSelect(item)} t={t} />
          )}
          contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}
