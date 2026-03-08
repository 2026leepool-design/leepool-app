import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SimplePool } from 'nostr-tools/pool';
import * as nip04 from 'nostr-tools/nip04';
import * as nip19 from 'nostr-tools/nip19';
import { loadKeys, sendEncryptedMessage, RELAYS } from '@/utils/nostr';

type ChatMessage = {
  id: string;
  text: string;
  isFromMe: boolean;
  createdAt: number;
};

function truncateNpub(npub: string) {
  if (!npub || npub.length <= 28) return npub;
  return `${npub.slice(0, 12)}...${npub.slice(-12)}`;
}

export default function ChatScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { pubkey: peerNpub } = useLocalSearchParams<{ pubkey: string }>();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poolRef = useRef<SimplePool | null>(null);
  const subRef = useRef<{ close: () => void } | null>(null);
  const keysRef = useRef<Awaited<ReturnType<typeof loadKeys>>>(null);
  const peerHexRef = useRef<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const peerNpubTrimmed = peerNpub?.trim() || '';

  // Scroll to bottom when keyboard opens so the input stays visible
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!peerNpubTrimmed) {
      setError(t('error'));
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function init() {
      try {
        const keys = await loadKeys();
        if (!isMounted) return;
        if (!keys) {
          setError('Nostr kimliği bulunamadı.');
          setLoading(false);
          return;
        }

        keysRef.current = keys;

        const decoded = nip19.decode(peerNpubTrimmed);
        if (decoded.type !== 'npub') {
          setError('Geçersiz npub.');
          setLoading(false);
          return;
        }
        const peerHex = decoded.data as string;
        peerHexRef.current = peerHex;

        const pool = new SimplePool();
        poolRef.current = pool;

        const filter = {
          kinds: [4],
          authors: [keys.publicKey, peerHex],
          '#p': [keys.publicKey, peerHex],
        };

        const sub = pool.subscribe(RELAYS, filter, {
          onevent: async (event) => {
            if (!isMounted || !keysRef.current || !peerHexRef.current) return;
            try {
              const myHex = keysRef.current.publicKey;
              const theirHex = peerHexRef.current;
              let plaintext = '';
              const isFromMe = event.pubkey === myHex;

              if (isFromMe) {
                const pTag = event.tags.find((t) => t[0] === 'p');
                const recipientHex = pTag?.[1] || theirHex;
                plaintext = await nip04.decrypt(
                  keysRef.current.privateKey,
                  recipientHex,
                  event.content
                );
              } else {
                plaintext = await nip04.decrypt(
                  keysRef.current.privateKey,
                  event.pubkey,
                  event.content
                );
              }

              const msg: ChatMessage = {
                id: event.id,
                text: plaintext,
                isFromMe,
                createdAt: event.created_at,
              };
              setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                const filtered = isFromMe
                  ? prev.filter((m) => !(m.id.startsWith('opt-') && m.text === plaintext && m.isFromMe))
                  : prev;
                const next = [...filtered, msg].sort((a, b) => a.createdAt - b.createdAt);
                return next;
              });
            } catch {
              // skip unreadable events
            }
          },
        });
        subRef.current = sub;
      } catch (e) {
        if (isMounted) setError(String(e));
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    init();
    return () => {
      isMounted = false;
      subRef.current?.close();
      poolRef.current?.destroy();
    };
  }, [peerNpubTrimmed, t]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !peerNpubTrimmed || sending) return;

    setSending(true);
    setInputText('');
    try {
      await sendEncryptedMessage(peerNpubTrimmed, text);
      const optimistic: ChatMessage = {
        id: `opt-${Date.now()}`,
        text,
        isFromMe: true,
        createdAt: Math.floor(Date.now() / 1000),
      };
      setMessages((prev) => [...prev, optimistic].sort((a, b) => a.createdAt - b.createdAt));
    } catch (e) {
      setInputText(text);
    } finally {
      setSending(false);
    }
  }, [inputText, peerNpubTrimmed, sending]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-[#0A0F1A]" edges={['top']}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#00E5FF" />
          <Text
            className="text-[#8892B0] text-xs mt-3"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
            {t('loading')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-[#0A0F1A]" edges={['top']}>
        <View className="flex-1 items-center justify-center px-6 gap-4">
          <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
          <Text
            className="text-[#EF4444] text-sm text-center"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            className="rounded-xl px-6 py-3"
            style={{
              backgroundColor: '#131B2B',
              borderWidth: 1,
              borderColor: '#00E5FF',
            }}>
            <Text className="text-[#00E5FF] text-sm" style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
              {t('back')}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView className="flex-1 bg-[#0A0F1A]" edges={['top']}>
        {/* Header */}
        <View
          className="flex-row items-center px-4 py-3 border-b"
          style={{
            backgroundColor: '#0A0F1A',
            borderColor: 'rgba(0, 229, 255, 0.15)',
          }}>
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <Ionicons name="arrow-back" size={24} color="#00E5FF" />
          </TouchableOpacity>
          <Text
            className="text-[#00E5FF] text-sm flex-1"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
            numberOfLines={1}>
            {truncateNpub(peerNpubTrimmed)} {t('chatWith')}
          </Text>
        </View>

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 8 }}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          ListEmptyComponent={
            <View className="py-12 items-center">
              <Ionicons name="chatbubbles-outline" size={40} color="#4A5568" />
              <Text
                className="text-[#4A5568] text-xs mt-2"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
                {t('noMessagesYet')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View
              className={`mb-3 max-w-[80%] ${item.isFromMe ? 'self-end' : 'self-start'}`}>
              <View
                className="rounded-2xl px-4 py-3"
                style={{
                  backgroundColor: item.isFromMe
                    ? 'rgba(0, 229, 255, 0.12)'
                    : 'rgba(100, 116, 139, 0.15)',
                  borderWidth: 1,
                  borderColor: item.isFromMe ? '#00E5FF' : 'rgba(139, 92, 246, 0.3)',
                }}>
                <Text
                  className="text-sm"
                  style={{
                    fontFamily: 'SpaceGrotesk_400Regular',
                    color: item.isFromMe ? '#00E5FF' : '#E2E8F0',
                  }}>
                  {item.text}
                </Text>
              </View>
            </View>
          )}
        />

        {/* Input row */}
        <View
          className="flex-row items-end gap-2 px-4 py-3"
          style={{
            backgroundColor: '#0A0F1A',
            borderTopWidth: 1,
            borderColor: 'rgba(0, 229, 255, 0.1)',
          }}>
          <TextInput
            className="flex-1 rounded-xl px-4 py-3 text-base min-h-[44] max-h-[100]"
            style={{
              backgroundColor: '#131B2B',
              borderWidth: 1,
              borderColor: 'rgba(0, 229, 255, 0.2)',
              fontFamily: 'SpaceGrotesk_400Regular',
              color: '#E2E8F0',
            }}
            placeholderTextColor="#4A5568"
            placeholder={t('typeMessage')}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
            editable={!sending}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
            className="rounded-xl px-5 py-3 min-h-[44] justify-center items-center"
            style={{
              backgroundColor: inputText.trim() && !sending ? '#00E5FF' : 'rgba(0, 229, 255, 0.2)',
              borderWidth: 1,
              borderColor: '#00E5FF',
            }}>
            {sending ? (
              <ActivityIndicator size="small" color="#0A0F1A" />
            ) : (
              <Text
                className="text-[#0A0F1A] text-sm tracking-widest"
                style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                {t('send')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
