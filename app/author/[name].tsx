import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';

type AuthorSearchDoc = {
  key: string;
  name: string;
  birth_date?: string;
  work_count?: number;
  top_work?: string;
};

type AuthorDetail = {
  name: string;
  personal_name?: string;
  birth_date?: string;
  bio?: string | { value?: string };
  photos?: number[];
};

type AuthorWork = {
  key: string;
  title: string;
  covers?: number[];
};

async function searchAuthor(name: string): Promise<AuthorSearchDoc | null> {
  const q = encodeURIComponent(name.trim());
  if (!q) return null;
  const res = await fetch(`https://openlibrary.org/search/authors.json?q=${q}&limit=5`);
  if (!res.ok) return null;
  const json = await res.json();
  const docs: AuthorSearchDoc[] = json?.docs ?? [];
  return docs[0] ?? null;
}

async function fetchAuthorDetail(key: string): Promise<AuthorDetail | null> {
  const id = key.replace('/authors/', '');
  const res = await fetch(`https://openlibrary.org/authors/${id}.json`);
  if (!res.ok) return null;
  return res.json();
}

async function fetchAuthorWorks(key: string): Promise<AuthorWork[]> {
  const id = key.replace('/authors/', '');
  const res = await fetch(`https://openlibrary.org/authors/${id}/works.json?limit=20`);
  if (!res.ok) return [];
  const json = await res.json();
  return json?.entries ?? [];
}

function coverUrl(coverId: number): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
}

function photoUrl(photoId: number): string {
  return `https://covers.openlibrary.org/a/id/${photoId}-L.jpg`;
}

export default function AuthorScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name: string }>();

  const [author, setAuthor] = useState<AuthorDetail | null>(null);
  const [works, setWorks] = useState<AuthorWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bioExpanded, setBioExpanded] = useState(false);

  useEffect(() => {
    const n = (name ?? '').trim();
    if (!n) {
      setError(t('error'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    searchAuthor(n)
      .then(async (doc) => {
        if (!doc) {
          setError(t('noSearchResults'));
          return;
        }
        const [detail, worksList] = await Promise.all([
          fetchAuthorDetail(doc.key),
          fetchAuthorWorks(doc.key),
        ]);
        setAuthor(detail ?? { name: doc.name, birth_date: doc.birth_date });
        setWorks(worksList);
      })
      .catch(() => setError(t('error')))
      .finally(() => setLoading(false));
  }, [name, t]);

  const bioText =
    author?.bio == null
      ? ''
      : typeof author.bio === 'string'
        ? author.bio
        : author.bio?.value ?? '';

  const photoId = author?.photos?.[0];

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-[#0A0F1A]" edges={['top']}>
        <View className="flex-row items-center px-4 py-3 border-b" style={{ borderColor: 'rgba(0, 229, 255, 0.15)' }}>
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <Ionicons name="arrow-back" size={24} color="#00E5FF" />
          </TouchableOpacity>
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#00E5FF" />
          <Text className="text-[#8892B0] text-xs mt-4" style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
            {t('loading')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !author) {
    return (
      <SafeAreaView className="flex-1 bg-[#0A0F1A]" edges={['top']}>
        <View className="flex-row items-center px-4 py-3 border-b" style={{ borderColor: 'rgba(0, 229, 255, 0.15)' }}>
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <Ionicons name="arrow-back" size={24} color="#00E5FF" />
          </TouchableOpacity>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="person-outline" size={48} color="#4A5568" />
          <Text className="text-[#8892B0] text-sm text-center mt-4" style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
            {error || t('noSearchResults')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#0A0F1A]" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b" style={{ borderColor: 'rgba(0, 229, 255, 0.15)' }}>
        <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
          <Ionicons name="arrow-back" size={24} color="#00E5FF" />
        </TouchableOpacity>
        <Text
          className="text-[#00E5FF] text-sm flex-1"
          style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          numberOfLines={1}>
          {t('author')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}>
        {/* Author card */}
        <View
          className="rounded-2xl p-5 mb-6"
          style={{
            backgroundColor: '#131B2B',
            borderWidth: 1,
            borderColor: 'rgba(0, 229, 255, 0.25)',
          }}>
          <View className="flex-row items-start gap-4">
            {photoId ? (
              <View className="rounded-xl overflow-hidden" style={{ width: 96, height: 96, backgroundColor: '#1a2235' }}>
                <ExpoImage
                  source={{ uri: photoUrl(photoId) }}
                  style={{ width: 96, height: 96 }}
                  contentFit="cover"
                />
              </View>
            ) : (
              <View
                className="rounded-xl items-center justify-center"
                style={{ width: 96, height: 96, backgroundColor: 'rgba(0, 229, 255, 0.1)' }}>
                <Ionicons name="person" size={40} color="#00E5FF" />
              </View>
            )}
            <View className="flex-1 min-w-0">
              <Text
                className="text-[#00E5FF] text-xl mb-1"
                style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                {author.name}
              </Text>
              {author.birth_date && (
                <Text
                  className="text-[#8892B0] text-xs"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                  b. {author.birth_date}
                </Text>
              )}
            </View>
          </View>

          {bioText ? (
            <View className="mt-4 pt-4" style={{ borderTopWidth: 1, borderTopColor: 'rgba(0, 229, 255, 0.1)' }}>
              <Text
                className="text-[10px] tracking-widest mb-2"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#8892B0' }}>
                BIO
              </Text>
              <Text
                className="text-[#E2E8F0] text-sm leading-6"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
                numberOfLines={bioExpanded ? undefined : 5}>
                {bioText}
              </Text>
              {bioText.length > 200 && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setBioExpanded((v) => !v)}
                  className="mt-2 self-start flex-row items-center gap-1">
                  <Text
                    className="text-xs tracking-widest"
                    style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#00E5FF' }}>
                    {bioExpanded ? '▲ ' + t('showLess') : '▼ ' + t('readMore')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </View>

        {/* Works */}
        <View className="mb-4">
          <Text
            className="text-[#00E5FF] text-xs tracking-widest mb-3"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
            {t('books')} ({works.length})
          </Text>
        </View>

        {works.map((work) => {
          const coverId = work.covers?.[0];
          return (
            <TouchableOpacity
              key={work.key}
              activeOpacity={0.85}
              onPress={() => {
                const title = work.title ?? '';
                if (title) router.push({ pathname: '/add-book', params: { title, author: author.name } });
              }}
              className="flex-row rounded-2xl p-4 mb-3"
              style={{
                backgroundColor: '#131B2B',
                borderWidth: 1,
                borderColor: 'rgba(0, 229, 255, 0.15)',
              }}>
              <View
                className="rounded-xl overflow-hidden mr-4"
                style={{ width: 48, height: 72, backgroundColor: '#1a2235' }}>
                {coverId && coverId > 0 ? (
                  <ExpoImage
                    source={{ uri: coverUrl(coverId) }}
                    style={{ width: 48, height: 72 }}
                    contentFit="cover"
                  />
                ) : (
                  <View className="flex-1 items-center justify-center">
                    <Ionicons name="book-outline" size={22} color="#4A5568" />
                  </View>
                )}
              </View>
              <View className="flex-1 justify-center min-w-0">
                <Text
                  className="text-[#E2E8F0] text-sm"
                  style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                  numberOfLines={2}>
                  {work.title}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#4A5568" style={{ alignSelf: 'center' }} />
            </TouchableOpacity>
          );
        })}

        {works.length === 0 && (
          <View className="py-8 items-center">
            <Text className="text-[#4A5568] text-sm" style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
              {t('noBooksYet')}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
