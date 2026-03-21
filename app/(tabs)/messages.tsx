import { useState, useEffect, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SimplePool } from 'nostr-tools/pool';
import * as nip04 from 'nostr-tools/nip04';
import * as nip19 from 'nostr-tools/nip19';
import { loadKeys, RELAYS, type NostrKeys } from '@/utils/nostr';

// ─── Types ────────────────────────────────────────────────────────────────────

type Conversation = {
  peerHex: string;
  peerNpub: string;
  lastMessage: string;
  lastAt: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncateNpub(npub: string) {
  if (!npub || npub.length <= 26) return npub;
  return `${npub.slice(0, 10)}...${npub.slice(-10)}`;
}

function formatTime(ts: number) {
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  return isToday
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

// ─── ConversationCard ─────────────────────────────────────────────────────────

function ConversationCard({
  conv,
  onPress,
}: {
  conv: Conversation;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#131B2B',
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.15)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        gap: 14,
      }}>
      {/* Avatar */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: 'rgba(0, 229, 255, 0.08)',
          borderWidth: 1,
          borderColor: 'rgba(0, 229, 255, 0.25)',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
        <Ionicons name="person-outline" size={20} color="#00E5FF" />
      </View>

      {/* Content */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: 'SpaceGrotesk_600SemiBold',
              fontSize: 13,
              color: '#00E5FF',
              letterSpacing: 0.5,
              flex: 1,
              marginRight: 8,
            }}>
            {truncateNpub(conv.peerNpub)}
          </Text>
          <Text
            style={{
              fontFamily: 'SpaceGrotesk_400Regular',
              fontSize: 10,
              color: '#4A5568',
              flexShrink: 0,
            }}>
            {formatTime(conv.lastAt)}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: 'SpaceGrotesk_400Regular',
            fontSize: 12,
            color: '#8892B0',
            letterSpacing: 0.2,
          }}>
          {conv.lastMessage.length > 50
            ? `${conv.lastMessage.slice(0, 50)}…`
            : conv.lastMessage}
        </Text>
      </View>

      {/* Arrow */}
      <Ionicons name="chevron-forward" size={16} color="#4A5568" style={{ flexShrink: 0 }} />
    </TouchableOpacity>
  );
}

// ─── MessagesScreen ───────────────────────────────────────────────────────────

export default function MessagesScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [keys, setKeys] = useState<NostrKeys | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [noNostrKey, setNoNostrKey] = useState(false);
  const poolRef = useRef<SimplePool | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setConversations([]);

    const k = await loadKeys();
    if (!k) {
      setNoNostrKey(true);
      setLoading(false);
      return;
    }
    setKeys(k);
    setNoNostrKey(false);

    const pool = new SimplePool();
    poolRef.current = pool;

    // Fetch all kind-4 events where user is sender or recipient
    const filter = {
      kinds: [4],
      authors: [k.publicKey],
      limit: 200,
    };
    const filterIncoming = {
      kinds: [4],
      '#p': [k.publicKey],
      limit: 200,
    };

    let events: Array<{
      id: string;
      pubkey: string;
      created_at: number;
      tags: string[][];
      content: string;
    }> = [];

    try {
      const [sent, received] = await Promise.all([
        pool.querySync([...RELAYS], filter),
        pool.querySync([...RELAYS], filterIncoming),
      ]);

      // Merge and deduplicate by event id
      const seen = new Set<string>();
      for (const ev of [...sent, ...received]) {
        if (!seen.has(ev.id)) {
          seen.add(ev.id);
          events.push(ev);
        }
      }
    } catch {
      // relay fetch failed
    }

    // Decrypt events and group by peer
    const convMap = new Map<string, Conversation>();

    const decryptResults = await Promise.allSettled(
      events.map(async (ev) => {
        const isFromMe = ev.pubkey === k.publicKey;
        let peerHex: string;

        if (isFromMe) {
          const pTag = ev.tags.find((t) => t[0] === 'p');
          peerHex = pTag?.[1] ?? '';
        } else {
          peerHex = ev.pubkey;
        }

        if (!peerHex) return null;

        let plaintext = '';
        try {
          if (isFromMe) {
            plaintext = await nip04.decrypt(k.privateKey, peerHex, ev.content);
          } else {
            plaintext = await nip04.decrypt(k.privateKey, peerHex, ev.content);
          }
        } catch {
          return null;
        }

        return { peerHex, plaintext, created_at: ev.created_at };
      })
    );

    for (const result of decryptResults) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      const { peerHex, plaintext, created_at } = result.value;

      const existing = convMap.get(peerHex);
      if (!existing || created_at > existing.lastAt) {
        let peerNpub = peerHex;
        try {
          peerNpub = nip19.npubEncode(peerHex);
        } catch {}
        convMap.set(peerHex, {
          peerHex,
          peerNpub,
          lastMessage: plaintext,
          lastAt: created_at,
        });
      }
    }

    const sorted = Array.from(convMap.values()).sort((a, b) => b.lastAt - a.lastAt);
    setConversations(sorted);
    setLoading(false);
    pool.destroy();
    poolRef.current = null;
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        poolRef.current?.destroy();
        poolRef.current = null;
      };
    }, [load])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0A0F1A' }} edges={['top']}>
      {/* ── Header ── */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text
            style={{
              fontFamily: 'SpaceGrotesk_700Bold',
              fontSize: 20,
              letterSpacing: 3,
              color: '#00E5FF',
            }}>
            {t('tabMessages').toUpperCase()}
          </Text>
          {!loading && (
            <TouchableOpacity
              onPress={load}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                backgroundColor: 'rgba(0, 229, 255, 0.08)',
                borderWidth: 1,
                borderColor: 'rgba(0, 229, 255, 0.2)',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Ionicons name="refresh-outline" size={18} color="#00E5FF" />
            </TouchableOpacity>
          )}
        </View>
        <Text
          style={{
            fontFamily: 'SpaceGrotesk_400Regular',
            fontSize: 10,
            letterSpacing: 2,
            color: '#4A5568',
            marginTop: 4,
          }}>
          NIP-04 · {t('encryptedMessages')}
        </Text>
      </View>

      {/* ── Divider ── */}
      <View
        style={{
          height: 1,
          backgroundColor: 'rgba(0, 229, 255, 0.1)',
          marginHorizontal: 20,
          marginBottom: 16,
        }}
      />

      {/* ── Content ── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <ActivityIndicator size="large" color="#00E5FF" />
          <Text
            style={{
              fontFamily: 'SpaceGrotesk_400Regular',
              fontSize: 10,
              letterSpacing: 2,
              color: '#4A5568',
            }}>
            {t('loading')}
          </Text>
        </View>
      ) : noNostrKey ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              backgroundColor: 'rgba(0, 229, 255, 0.06)',
              borderWidth: 1,
              borderColor: 'rgba(0, 229, 255, 0.2)',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Ionicons name="key-outline" size={32} color="#4A5568" />
          </View>
          <Text
            style={{
              fontFamily: 'SpaceGrotesk_600SemiBold',
              fontSize: 12,
              letterSpacing: 2,
              color: '#8892B0',
              textAlign: 'center',
            }}>
            {t('noNostrKey')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.peerHex}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 32,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ConversationCard
              conv={item}
              onPress={() =>
                router.push(`/messages/${encodeURIComponent(item.peerNpub)}` as Href)
              }
            />
          )}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 14 }}>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 18,
                  backgroundColor: 'rgba(0, 229, 255, 0.06)',
                  borderWidth: 1,
                  borderColor: 'rgba(0, 229, 255, 0.15)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Ionicons name="chatbubbles-outline" size={34} color="#4A5568" />
              </View>
              <Text
                style={{
                  fontFamily: 'SpaceGrotesk_600SemiBold',
                  fontSize: 12,
                  letterSpacing: 2,
                  color: '#8892B0',
                  textAlign: 'center',
                }}>
                {t('noConversations')}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
