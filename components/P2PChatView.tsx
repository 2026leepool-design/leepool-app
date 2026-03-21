import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Keyboard,
  Alert,
} from 'react-native';
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
  type OfferPendingMessage,
  type OfferAcceptedMessage,
} from '@/utils/offerMessages';
import { completeP2PBookTransfer } from '@/utils/p2pSale';

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

type P2PChatViewProps = {
  peerNpub: string;
};

export function P2PChatView({ peerNpub }: P2PChatViewProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const peerNpubTrimmed = peerNpub?.trim() || '';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myNpub, setMyNpub] = useState<string | null>(null);
  const [payingOffer, setPayingOffer] = useState<string | null>(null);
  const [completingSale, setCompletingSale] = useState<string | null>(null);

  const poolRef = useRef<SimplePool | null>(null);
  const subRef = useRef<{ close: () => void } | null>(null);
  const keysRef = useRef<Awaited<ReturnType<typeof loadKeys>>>(null);
  const peerHexRef = useRef<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

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
        setMyNpub(keys.npub);

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
      } catch (e) {
        Alert.alert(t('error'), e instanceof Error ? e.message : String(e));
      }
    },
    [peerNpubTrimmed, t]
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
      } catch (e) {
        Alert.alert(t('error'), e instanceof Error ? e.message : String(e));
      }
    },
    [peerNpubTrimmed, t]
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
          t('error')
        );
      } catch (e) {
        if (e instanceof Error && !e.message.includes('Payment')) {
          // payLightningInvoice already alerts
        }
      } finally {
        setPayingOffer(null);
      }
    },
    [t]
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
      } catch (e) {
        Alert.alert(t('error'), e instanceof Error ? e.message : String(e));
      }
    },
    [peerNpubTrimmed, t]
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
          Alert.alert(t('success'), t('p2pSaleCompleted'));
        } else {
          Alert.alert(t('error'), res.message);
        }
      } finally {
        setCompletingSale(null);
      }
    },
    [t]
  );

  const renderStructuredBubble = useCallback(
    (item: ChatMessage, structured: ReturnType<typeof tryParseStructuredNostrMessage>) => {
      if (!structured || !myNpub) {
        return null;
      }

      if (structured.type === 'offer') {
        const o = structured as OfferPendingMessage;
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
                  className="flex-1 rounded-xl py-2.5 items-center"
                  style={{ backgroundColor: 'rgba(136, 146, 176, 0.2)', borderWidth: 1, borderColor: '#8892B0' }}>
                  <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', color: '#8892B0', fontSize: 12 }}>
                    {t('p2pCancel')}
                  </Text>
                </TouchableOpacity>
              </View>
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
    ]
  );

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const structured = tryParseStructuredNostrMessage(item.text);
      const special = structured ? renderStructuredBubble(item, structured) : null;

      return (
        <View className={`mb-3 max-w-[90%] ${item.isFromMe ? 'self-end' : 'self-start'}`}>
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
    [renderStructuredBubble]
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
        keyExtractor={(m) => m.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 8 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
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
