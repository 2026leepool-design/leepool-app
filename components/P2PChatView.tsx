import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SectionList,
  ActivityIndicator,
  Keyboard,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardWrapper } from '@/components/KeyboardWrapper';
import { SimplePool } from 'nostr-tools/pool';
import * as nip04 from 'nostr-tools/nip04';
import * as nip19 from 'nostr-tools/nip19';
import { loadKeys, sendEncryptedMessage, RELAYS } from '@/utils/nostr';
import { supabase } from '@/utils/supabase';
import { payLightningInvoice } from '@/utils/lightning';
import {
  tryParseStructuredNostrMessage,
  buildOfferAcceptedMessage,
  buildOfferRejectedMessage,
  buildOfferCancelledMessage,
  buildLocationShareMessage,
  type OfferPendingMessage,
  type OfferAcceptedMessage,
  type LocationShareMessage,
} from '@/utils/offerMessages';
import { completeP2PBookTransfer } from '@/utils/p2pSale';
import { setDmReadCursor } from '@/utils/nostrDmReadCursor';

type ChatMessage = {
  id: string;
  text: string;
  isFromMe: boolean;
  createdAt: number;
};

function shortUserId(id: string | null | undefined): string {
  if (!id?.trim()) return '—';
  const s = id.trim();
  if (s.length <= 16) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function formatMessageTime(tsSec: number, locale: string): string {
  const d = new Date(tsSec * 1000);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type ChatSection = {
  bookId: string;
  title: string;
  data: ChatMessage[];
};

function buildMessageSections(messages: ChatMessage[], t: (k: string) => string): ChatSection[] {
  const sorted = [...messages].sort((a, b) => a.createdAt - b.createdAt);
  const sections: ChatSection[] = [];
  let cur: ChatSection | null = null;

  const ensureGeneral = () => {
    if (!cur || cur.bookId !== '_general') {
      cur = { bookId: '_general', title: t('chatSectionGeneral'), data: [] };
      sections.push(cur);
    }
  };

  for (const m of sorted) {
    const s = tryParseStructuredNostrMessage(m.text);
    let bid: string | null = null;
    let title: string | null = null;
    if (
      s &&
      (s.type === 'offer' ||
        s.type === 'offer_accepted' ||
        s.type === 'offer_rejected' ||
        s.type === 'offer_cancelled')
    ) {
      bid = s.bookId;
      const bt = 'bookTitle' in s ? s.bookTitle : undefined;
      title = bt?.trim() ? bt.trim() : bid;
    }
    if (bid) {
      if (!cur || cur.bookId !== bid) {
        cur = { bookId: bid, title: title ?? bid, data: [] };
        sections.push(cur);
      }
      cur.data.push(m);
    } else {
      if (!cur) ensureGeneral();
      cur!.data.push(m);
    }
  }
  return sections;
}

type P2PChatViewProps = {
  peerNpub: string;
};

export function P2PChatView({ peerNpub }: P2PChatViewProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const peerNpubTrimmed = peerNpub?.trim() || '';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myNpub, setMyNpub] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [peerUserId, setPeerUserId] = useState<string | null>(null);
  const [locallyTerminalOffers, setLocallyTerminalOffers] = useState<string[]>([]);
  const [payingOffer, setPayingOffer] = useState<string | null>(null);
  const [completingSale, setCompletingSale] = useState<string | null>(null);
  const [sendingLocation, setSendingLocation] = useState(false);

  const poolRef = useRef<SimplePool | null>(null);
  const subRef = useRef<{ close: () => void } | null>(null);
  const keysRef = useRef<Awaited<ReturnType<typeof loadKeys>>>(null);
  const peerHexRef = useRef<string | null>(null);
  const flatListRef = useRef<SectionList<ChatMessage, ChatSection>>(null);

  const addLocalTerminalOffer = useCallback((offerId: string) => {
    setLocallyTerminalOffers((p) => (p.includes(offerId) ? p : [...p, offerId]));
  }, []);

  /** Red / iptal / yerel tamamlananlar — offer_accepted burada yok (alıcı ödeme UI’si için). */
  const terminalOfferIds = useMemo(() => {
    const ids = new Set<string>();
    locallyTerminalOffers.forEach((id) => ids.add(id));
    for (const m of messages) {
      const s = tryParseStructuredNostrMessage(m.text);
      if (
        s &&
        (s.type === 'offer_rejected' || s.type === 'offer_cancelled') &&
        'offerId' in s &&
        typeof (s as { offerId?: string }).offerId === 'string'
      ) {
        ids.add((s as { offerId: string }).offerId);
      }
    }
    return ids;
  }, [messages, locallyTerminalOffers]);

  const acceptedOfferIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of messages) {
      const s = tryParseStructuredNostrMessage(m.text);
      if (
        s?.type === 'offer_accepted' &&
        'offerId' in s &&
        typeof (s as { offerId?: string }).offerId === 'string'
      ) {
        ids.add((s as { offerId: string }).offerId);
      }
    }
    return ids;
  }, [messages]);

  const sections = useMemo(
    () => buildMessageSections(messages, t),
    [messages, t]
  );

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      setTimeout(() => {
        const list = flatListRef.current as { scrollToEnd?: (o: { animated?: boolean }) => void } | null;
        list?.scrollToEnd?.({ animated: true });
      }, 100);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!peerNpubTrimmed) return;
    let cancel = false;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!cancel && user?.id) setMyUserId(user.id);
      const { data, error: rpcErr } = await supabase.rpc('profile_id_by_npub', {
        p_npub: peerNpubTrimmed,
      });
      if (cancel) return;
      if (rpcErr) {
        setPeerUserId(null);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      const uid =
        row && typeof row === 'object' && row !== null && 'user_id' in row
          ? String((row as { user_id: string }).user_id)
          : null;
      setPeerUserId(uid);
    })();
    return () => {
      cancel = true;
    };
  }, [peerNpubTrimmed]);

  useEffect(() => {
    if (messages.length === 0) return;
    const k = keysRef.current;
    const peer = peerHexRef.current;
    if (!k || !peer) return;
    const maxTs = Math.max(...messages.map((m) => m.createdAt));
    if (Number.isFinite(maxTs) && maxTs > 0) {
      void setDmReadCursor(k.publicKey, peer, maxTs);
    }
  }, [messages]);

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
          setError(t('nostrIdentityMissing'));
          setLoading(false);
          return;
        }

        keysRef.current = keys;
        setMyNpub(keys.npub);

        const decoded = nip19.decode(peerNpubTrimmed);
        if (decoded.type !== 'npub') {
          setError(t('invalidNpubContact'));
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

        const sub = pool.subscribe([...RELAYS], filter, {
          onevent: async (event) => {
            if (!isMounted || !keysRef.current || !peerHexRef.current) return;
            try {
              const myHex = keysRef.current.publicKey;
              const theirHex = peerHexRef.current;
              let plaintext = '';
              const isFromMe = event.pubkey === myHex;

              if (isFromMe) {
                const pTag = event.tags.find((tag) => tag[0] === 'p');
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
                  ? prev.filter(
                      (m) => !(m.id.startsWith('opt-') && m.text === plaintext && m.isFromMe)
                    )
                  : prev;
                const next = [...filtered, msg].sort((a, b) => a.createdAt - b.createdAt);
                return next;
              });
            } catch {
              // skip
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

  const openLocationInExternalMaps = useCallback(async (lat: number, lng: number) => {
    const innerMaps = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(innerMaps)}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return;
      }
      await Linking.openURL(innerMaps);
    } catch (e) {
      console.warn('[P2PChat] open maps URL failed', e);
      try {
        await Linking.openURL(innerMaps);
      } catch (e2) {
        console.warn('[P2PChat] fallback maps URL failed', e2);
        const msg = t('openMapFailed');
        if (Platform.OS === 'web') {
          (window as Window).alert(msg);
        } else {
          Alert.alert(t('error'), msg);
        }
      }
    }
  }, [t]);

  const handleSendLocation = useCallback(async () => {
    if (!peerNpubTrimmed || sending || sendingLocation) return;

    setSendingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        const msg = t('locationShareError');
        if (Platform.OS === 'web') {
          (window as Window).alert(msg);
        } else {
          Alert.alert(t('error'), msg);
        }
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const payload = buildLocationShareMessage(lat, lng);

      const optId = `opt-loc-${Date.now()}`;
      const optimistic: ChatMessage = {
        id: optId,
        text: payload,
        isFromMe: true,
        createdAt: Math.floor(Date.now() / 1000),
      };
      setMessages((prev) => [...prev, optimistic].sort((a, b) => a.createdAt - b.createdAt));

      try {
        await sendEncryptedMessage(peerNpubTrimmed, payload);
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== optId));
        const msg = t('locationShareError');
        if (Platform.OS === 'web') {
          (window as Window).alert(msg);
        } else {
          Alert.alert(t('error'), msg);
        }
      }
    } catch (e) {
      console.warn('[P2PChat] location failed', e);
      const msg = t('locationShareError');
      if (Platform.OS === 'web') {
        (window as Window).alert(msg);
      } else {
        Alert.alert(t('error'), msg);
      }
    } finally {
      setSendingLocation(false);
    }
  }, [peerNpubTrimmed, sending, sendingLocation, t]);

  const handleSendPlain = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !peerNpubTrimmed || sending) return;

    const optId = `opt-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: optId,
      text,
      isFromMe: true,
      createdAt: Math.floor(Date.now() / 1000),
    };

    setSending(true);
    setInputText('');
    setMessages((prev) => [...prev, optimistic].sort((a, b) => a.createdAt - b.createdAt));

    try {
      await sendEncryptedMessage(peerNpubTrimmed, text);
    } catch {
      setInputText(text);
      setMessages((prev) => prev.filter((m) => m.id !== optId));
    } finally {
      setSending(false);
    }
  }, [inputText, peerNpubTrimmed, sending]);

  const handleAcceptOffer = useCallback(
    async (offer: OfferPendingMessage) => {
      try {
        const payload: Omit<OfferAcceptedMessage, 'type'> = {
          bookId: offer.bookId,
          bookTitle: offer.bookTitle,
          amount: offer.amount,
          offerId: offer.offerId,
          buyerUserId: offer.buyerUserId,
          buyerNpub: offer.buyerNpub,
        };
        await sendEncryptedMessage(peerNpubTrimmed, buildOfferAcceptedMessage(payload));
        addLocalTerminalOffer(offer.offerId);
      } catch (e) {
        Alert.alert(t('error'), e instanceof Error ? e.message : String(e));
      }
    },
    [peerNpubTrimmed, t, addLocalTerminalOffer]
  );

  const handleRejectOffer = useCallback(
    async (offer: OfferPendingMessage) => {
      try {
        await sendEncryptedMessage(
          peerNpubTrimmed,
          buildOfferRejectedMessage({
            bookId: offer.bookId,
            amount: offer.amount,
            offerId: offer.offerId,
          })
        );
        addLocalTerminalOffer(offer.offerId);
      } catch (e) {
        Alert.alert(t('error'), e instanceof Error ? e.message : String(e));
      }
    },
    [peerNpubTrimmed, t, addLocalTerminalOffer]
  );

  const handlePayAccepted = useCallback(
    async (accepted: OfferAcceptedMessage) => {
      setPayingOffer(accepted.offerId);
      try {
        const { data: book, error } = await supabase
          .from('books')
          .select('lightning_address, title')
          .eq('id', accepted.bookId)
          .single();

        if (error || !book?.lightning_address?.trim()) {
          Alert.alert(t('error'), t('noWalletAdded'));
          return;
        }

        await payLightningInvoice(
          book.lightning_address.trim(),
          accepted.amount,
          `${String(book.title)} - LeePool P2P`,
          t('error'),
          t('lightningWalletOpenFailed')
        );
        addLocalTerminalOffer(accepted.offerId);
      } catch (e) {
        if (e instanceof Error && !e.message.includes('Payment')) {
          // payLightningInvoice already alerts
        }
      } finally {
        setPayingOffer(null);
      }
    },
    [t, addLocalTerminalOffer]
  );

  const handleCancelAccepted = useCallback(
    async (accepted: OfferAcceptedMessage) => {
      try {
        await sendEncryptedMessage(
          peerNpubTrimmed,
          buildOfferCancelledMessage({
            bookId: accepted.bookId,
            offerId: accepted.offerId,
          })
        );
        addLocalTerminalOffer(accepted.offerId);
      } catch (e) {
        Alert.alert(t('error'), e instanceof Error ? e.message : String(e));
      }
    },
    [peerNpubTrimmed, t, addLocalTerminalOffer]
  );

  const handleConfirmSale = useCallback(
    async (accepted: OfferAcceptedMessage) => {
      setCompletingSale(accepted.offerId);
      try {
        const res = await completeP2PBookTransfer({
          bookId: accepted.bookId,
          buyerUserId: accepted.buyerUserId,
          buyerNpub: accepted.buyerNpub,
        });
        if (res.ok) {
          addLocalTerminalOffer(accepted.offerId);
          Alert.alert(t('success'), t('p2pSaleCompleted'));
        } else {
          Alert.alert(t('error'), res.message);
        }
      } finally {
        setCompletingSale(null);
      }
    },
    [t, addLocalTerminalOffer]
  );

  const renderStructuredBubble = useCallback(
    (item: ChatMessage, structured: ReturnType<typeof tryParseStructuredNostrMessage>) => {
      if (!structured) {
        return null;
      }

      if (structured.type === 'location') {
        const loc = structured as LocationShareMessage;
        return (
          <View
            style={{
              marginBottom: 14,
              zIndex: 4,
              elevation: Platform.OS === 'android' ? 6 : 0,
            }}>
          <View
            className="rounded-2xl px-4 py-3 gap-3"
            style={{
              backgroundColor: item.isFromMe
                ? 'rgba(0, 229, 255, 0.1)'
                : 'rgba(16, 185, 129, 0.12)',
              borderWidth: 1,
              borderColor: item.isFromMe
                ? 'rgba(0, 229, 255, 0.45)'
                : 'rgba(16, 185, 129, 0.4)',
            }}>
            <View className="flex-row items-center gap-2">
              <View
                className="w-10 h-10 rounded-xl items-center justify-center"
                style={{
                  backgroundColor: item.isFromMe
                    ? 'rgba(0, 229, 255, 0.15)'
                    : 'rgba(16, 185, 129, 0.2)',
                }}>
                <Ionicons name="location" size={22} color={item.isFromMe ? '#00E5FF' : '#34D399'} />
              </View>
              <View className="flex-1">
                <Text
                  className="text-sm"
                  style={{
                    fontFamily: 'SpaceGrotesk_600SemiBold',
                    color: item.isFromMe ? '#00E5FF' : '#6EE7B7',
                  }}>
                  {t('locationSharedLabel')}
                </Text>
                <Text
                  className="text-[10px] mt-0.5"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular', color: '#8892B0' }}>
                  {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => void openLocationInExternalMaps(loc.lat, loc.lng)}
              className="rounded-xl py-2.5 items-center"
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                borderWidth: 1,
                borderColor: 'rgba(59, 130, 246, 0.5)',
              }}>
              <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', color: '#60A5FA', fontSize: 12 }}>
                {t('openInMap')}
              </Text>
            </TouchableOpacity>
          </View>
          </View>
        );
      }

      if (!myNpub) {
        return null;
      }

      if (structured.type === 'offer') {
        const o = structured as OfferPendingMessage;
        const offerSettled =
          terminalOfferIds.has(o.offerId) || acceptedOfferIds.has(o.offerId);
        if (!item.isFromMe) {
          return (
            <View
              className="rounded-2xl px-4 py-3 gap-3"
              style={{
                backgroundColor: 'rgba(255, 215, 0, 0.1)',
                borderWidth: 1,
                borderColor: 'rgba(255, 215, 0, 0.45)',
              }}>
              <Text
                className="text-sm"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#FFD700' }}>
                {t('p2pOfferReceivedTitle', {
                  title: o.bookTitle ?? t('bookTitle'),
                  amount: o.amount,
                })}
              </Text>
              {offerSettled ? (
                <Text
                  className="text-xs"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular', color: '#8892B0' }}>
                  {t('p2pOfferActionsDone')}
                </Text>
              ) : (
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => void handleAcceptOffer(o)}
                    className="flex-1 rounded-xl py-2.5 items-center"
                    style={{ backgroundColor: 'rgba(0, 255, 157, 0.2)', borderWidth: 1, borderColor: '#00FF9D' }}>
                    <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', color: '#00FF9D', fontSize: 12 }}>
                      {t('p2pAccept')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void handleRejectOffer(o)}
                    className="flex-1 rounded-xl py-2.5 items-center"
                    style={{ backgroundColor: 'rgba(255, 80, 80, 0.15)', borderWidth: 1, borderColor: '#FF5050' }}>
                    <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', color: '#FF5050', fontSize: 12 }}>
                      {t('p2pReject')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }
        return (
          <View
            className="rounded-2xl px-4 py-3"
            style={{
              backgroundColor: 'rgba(0, 229, 255, 0.12)',
              borderWidth: 1,
              borderColor: '#00E5FF',
            }}>
            <Text style={{ fontFamily: 'SpaceGrotesk_400Regular', color: '#00E5FF', fontSize: 13 }}>
              {t('p2pOfferSentSelf', { title: o.bookTitle ?? '', amount: o.amount })}
            </Text>
          </View>
        );
      }

      if (structured.type === 'offer_accepted') {
        const a = structured as OfferAcceptedMessage;
        const acceptedDone = terminalOfferIds.has(a.offerId);
        if (!item.isFromMe) {
          const busy = payingOffer === a.offerId;
          return (
            <View
              className="rounded-2xl px-4 py-3 gap-3"
              style={{
                backgroundColor: 'rgba(0, 255, 157, 0.1)',
                borderWidth: 1,
                borderColor: 'rgba(0, 255, 157, 0.4)',
              }}>
              <Text
                className="text-sm"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#00FF9D' }}>
                {t('p2pOfferApprovedBuyer')}
              </Text>
              {acceptedDone ? (
                <Text
                  className="text-xs"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular', color: '#8892B0' }}>
                  {t('p2pOfferActionsDone')}
                </Text>
              ) : (
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => void handlePayAccepted(a)}
                    disabled={busy}
                    className="flex-1 rounded-xl py-2.5 items-center"
                    style={{ backgroundColor: 'rgba(255, 215, 0, 0.2)', borderWidth: 1, borderColor: '#FFD700' }}>
                    {busy ? (
                      <ActivityIndicator size="small" color="#FFD700" />
                    ) : (
                      <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', color: '#FFD700', fontSize: 12 }}>
                        {t('p2pPay')}
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void handleCancelAccepted(a)}
                    disabled={busy}
                    className="flex-1 rounded-xl py-2.5 items-center"
                    style={{ backgroundColor: 'rgba(136, 146, 176, 0.2)', borderWidth: 1, borderColor: '#8892B0' }}>
                    <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', color: '#8892B0', fontSize: 12 }}>
                      {t('p2pCancel')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }
        const saleBusy = completingSale === a.offerId;
        return (
          <View
            className="rounded-2xl px-4 py-3 gap-3"
            style={{
              backgroundColor: 'rgba(168, 85, 247, 0.12)',
              borderWidth: 1,
              borderColor: 'rgba(168, 85, 247, 0.4)',
            }}>
            <Text style={{ fontFamily: 'SpaceGrotesk_400Regular', color: '#E879F9', fontSize: 13 }}>
              {t('p2pOfferAcceptedSellerHint', { amount: a.amount })}
            </Text>
            {acceptedDone ? (
              <Text
                className="text-xs"
                style={{ fontFamily: 'SpaceGrotesk_400Regular', color: '#8892B0' }}>
                {t('p2pOfferActionsDone')}
              </Text>
            ) : (
              <TouchableOpacity
                onPress={() => void handleConfirmSale(a)}
                disabled={saleBusy}
                className="rounded-xl py-3 items-center"
                style={{ backgroundColor: 'rgba(0, 255, 157, 0.2)', borderWidth: 1, borderColor: '#00FF9D' }}>
                {saleBusy ? (
                  <ActivityIndicator size="small" color="#00FF9D" />
                ) : (
                  <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', color: '#00FF9D', fontSize: 12 }}>
                    {t('p2pConfirmSale')}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        );
      }

      if (structured.type === 'offer_rejected') {
        return (
          <Text style={{ fontFamily: 'SpaceGrotesk_400Regular', color: '#8892B0', fontSize: 12 }}>
            {t('p2pOfferRejected')}
          </Text>
        );
      }

      if (structured.type === 'offer_cancelled') {
        return (
          <Text style={{ fontFamily: 'SpaceGrotesk_400Regular', color: '#8892B0', fontSize: 12 }}>
            {t('p2pOfferCancelled')}
          </Text>
        );
      }

      return null;
    },
    [
      myNpub,
      t,
      handleAcceptOffer,
      handleRejectOffer,
      handlePayAccepted,
      handleCancelAccepted,
      handleConfirmSale,
      payingOffer,
      completingSale,
      openLocationInExternalMaps,
      terminalOfferIds,
      acceptedOfferIds,
    ]
  );

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const structured = tryParseStructuredNostrMessage(item.text);
      const special = structured ? renderStructuredBubble(item, structured) : null;
      const timeStr = formatMessageTime(item.createdAt, i18n.language);

      return (
        <View className={`mb-3 max-w-[90%] ${item.isFromMe ? 'self-end' : 'self-start'}`}>
          <Text
            className={`text-[10px] mb-1 ${item.isFromMe ? 'text-right' : 'text-left'}`}
            style={{ fontFamily: 'SpaceGrotesk_400Regular', color: '#4A5568' }}>
            {timeStr}
          </Text>
          {special ? (
            special
          ) : (
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
          )}
        </View>
      );
    },
    [renderStructuredBubble, i18n.language]
  );

  if (loading) {
    return (
      <View className="flex-1 bg-[#0A0F1A] items-center justify-center">
        <ActivityIndicator size="large" color="#00E5FF" />
        <Text className="text-[#8892B0] text-xs mt-3" style={{ fontFamily: 'SpaceGrotesk_400Regular' }}>
          {t('loading')}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-[#0A0F1A] items-center justify-center px-6 gap-4">
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
    );
  }

  return (
    <KeyboardWrapper useScroll={false} edges={['top']}>
      <View
        className="flex-row items-center px-4 py-3 border-b"
        style={{
          backgroundColor: '#0A0F1A',
          borderColor: 'rgba(0, 229, 255, 0.15)',
        }}>
        <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
          <Ionicons name="arrow-back" size={24} color="#00E5FF" />
        </TouchableOpacity>
        <View className="flex-1 min-w-0">
          <Text
            className="text-[#8892B0] text-[10px]"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
            numberOfLines={1}>
            {t('dmYouLabel')}: {shortUserId(myUserId)}
          </Text>
          <Text
            className="text-[#00E5FF] text-xs mt-0.5"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
            numberOfLines={1}>
            {t('dmPeerLabel')}: {peerUserId ? shortUserId(peerUserId) : t('dmUserIdUnknown')}
          </Text>
        </View>
      </View>

      <SectionList
        ref={flatListRef}
        sections={sections}
        keyExtractor={(m) => m.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 8 }}
        onContentSizeChange={() => {
          const list = flatListRef.current as { scrollToEnd?: (o: { animated?: boolean }) => void } | null;
          list?.scrollToEnd?.({ animated: true });
        }}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View
            className="pt-2 pb-2 mb-1"
            style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(0, 229, 255, 0.12)' }}>
            <Text
              className="text-[#00E5FF] text-[10px] tracking-widest"
              style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
              numberOfLines={2}>
              {section.title}
            </Text>
          </View>
        )}
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
        renderItem={renderItem}
      />

      <View
        className="flex-row items-end gap-2 px-4 py-3"
        style={{
          backgroundColor: '#0A0F1A',
          borderTopWidth: 1,
          borderColor: 'rgba(0, 229, 255, 0.1)',
        }}>
        <TouchableOpacity
          onPress={() => void handleSendLocation()}
          disabled={sending || sendingLocation}
          accessibilityRole="button"
          accessibilityLabel={t('shareLocationA11y')}
          className="rounded-xl px-3 py-3 min-h-[44] justify-center items-center"
          style={{
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            borderWidth: 1,
            borderColor: 'rgba(16, 185, 129, 0.35)',
            opacity: sending || sendingLocation ? 0.5 : 1,
          }}>
          {sendingLocation ? (
            <ActivityIndicator size="small" color="#34D399" />
          ) : (
            <Ionicons name="map-outline" size={22} color="#34D399" />
          )}
        </TouchableOpacity>
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
          onPress={() => void handleSendPlain()}
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
    </KeyboardWrapper>
  );
}
