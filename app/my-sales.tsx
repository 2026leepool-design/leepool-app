import { useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/utils/supabase';
import { loadKeys } from '@/utils/nostr';

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
};

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
}: {
  book: MarketBook;
  t: (key: string) => string;
  onPress: () => void;
}) {
  const condLabel = book.condition
    ? t(`condition${book.condition.charAt(0).toUpperCase() + book.condition.slice(1)}` as 'conditionNew' | 'conditionGood' | 'conditionWorn')
    : null;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      className="rounded-2xl p-4 mb-4 flex-row"
      style={{
        backgroundColor: '#131B2B',
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.5)',
      }}>
      {/* Cover */}
      <View
        className="rounded-xl overflow-hidden mr-4"
        style={{ width: 72, height: 100, backgroundColor: '#1a2235' }}>
        {book.cover_url ? (
          <Image source={{ uri: book.cover_url }} style={{ width: 72, height: 100 }} contentFit="cover" />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Ionicons name="book-outline" size={28} color="#4A5568" />
          </View>
        )}
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
          {book.first_publish_year ? (
            <Text
              className="text-[#4A5568] text-[10px] mt-1"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {book.first_publish_year}
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

          <View className="flex-row items-center gap-1">
            <Text style={{ fontSize: 14 }}>⚡</Text>
            <Text
              className="text-xl"
              style={{ fontFamily: 'SpaceGrotesk_700Bold', color: '#00FF9D' }}>
              {book.price_sats?.toLocaleString() ?? '—'}
            </Text>
            <Text
              className="text-[#6B7280] text-[10px] self-end mb-1"
              style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              sats
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── MySalesScreen ────────────────────────────────────────────────────────────

export default function MySalesScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [books, setBooks] = useState<MarketBook[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      async function loadMarket() {
        setLoading(true);
        try {
          const keys = await loadKeys();
          if (!keys?.npub) {
            if (isMounted) setBooks([]);
            return;
          }

          const { data, error } = await supabase
            .from('books')
            .select('id, title, author, cover_url, price_sats, condition, isbn, translator, first_publish_year, created_at, seller_npub')
            .eq('is_for_sale', true)
            .eq('seller_npub', keys.npub)
            .order('created_at', { ascending: false });

          if (error) throw error;
          if (!isMounted) return;
          setBooks((data ?? []) as MarketBook[]);
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
      <View className="px-5 py-4 flex-row items-center justify-between">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center bg-[#131B2B] rounded-full border border-white/10">
          <Ionicons name="arrow-back" size={20} color="#00E5FF" />
        </TouchableOpacity>
        <View className="items-center flex-1">
          <Text
            className="text-[#00E5FF] text-lg tracking-[0.1em]"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            {t('myActiveSales')}
          </Text>
          <Text
            className="text-[#4A5568] text-[10px] tracking-widest mt-1"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
            {books.length} {t('books')} · ⚡ Bitcoin Sats
          </Text>
        </View>
        <View className="w-10" />
      </View>

      {/* Divider */}
      <View style={{ height: 1, backgroundColor: 'rgba(0, 229, 255, 0.1)', marginHorizontal: 20, marginBottom: 16 }} />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#00E5FF" />
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <MarketCard
              book={item}
              t={t}
              onPress={() => router.push({ pathname: '/synopsis', params: { id: item.id } })}
            />
          )}
          ListEmptyComponent={
            <View className="items-center py-16">
              <View
                className="w-20 h-20 rounded-2xl items-center justify-center mb-6"
                style={{ backgroundColor: 'rgba(0, 229, 255, 0.06)', borderWidth: 1, borderColor: 'rgba(0, 229, 255, 0.15)' }}>
                <Ionicons name="cart-outline" size={36} color="#00E5FF" />
              </View>
              <Text
                className="text-[#8892B0] text-sm text-center tracking-wide mb-2"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
                {t('noSalesYet')}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}
