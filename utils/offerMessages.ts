/**
 * Nostr DM içinde stringified JSON ile yapılandırılmış P2P teklif mesajları.
 */

export type OfferPendingMessage = {
  type: 'offer';
  bookId: string;
  bookTitle?: string;
  amount: number;
  status: 'pending';
  offerId: string;
  buyerUserId: string | null;
  buyerNpub: string;
};

export type OfferAcceptedMessage = {
  type: 'offer_accepted';
  bookId: string;
  bookTitle?: string;
  amount: number;
  offerId: string;
  buyerUserId: string | null;
  buyerNpub: string;
};

export type OfferRejectedMessage = {
  type: 'offer_rejected';
  bookId: string;
  amount: number;
  offerId: string;
};

export type OfferCancelledMessage = {
  type: 'offer_cancelled';
  bookId: string;
  offerId: string;
};

export type StructuredNostrMessage =
  | OfferPendingMessage
  | OfferAcceptedMessage
  | OfferRejectedMessage
  | OfferCancelledMessage;

export function tryParseStructuredNostrMessage(text: string): StructuredNostrMessage | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const o = JSON.parse(trimmed) as Record<string, unknown>;
    if (!o || typeof o.type !== 'string') return null;
    if (
      o.type === 'offer' ||
      o.type === 'offer_accepted' ||
      o.type === 'offer_rejected' ||
      o.type === 'offer_cancelled'
    ) {
      return o as StructuredNostrMessage;
    }
    return null;
  } catch {
    return null;
  }
}

export function buildOfferMessage(payload: Omit<OfferPendingMessage, 'type' | 'status'>): string {
  const msg: OfferPendingMessage = {
    type: 'offer',
    status: 'pending',
    ...payload,
  };
  return JSON.stringify(msg);
}

export function buildOfferAcceptedMessage(
  payload: Omit<OfferAcceptedMessage, 'type'>
): string {
  return JSON.stringify({ type: 'offer_accepted', ...payload } satisfies OfferAcceptedMessage);
}

export function buildOfferRejectedMessage(
  payload: Omit<OfferRejectedMessage, 'type'>
): string {
  return JSON.stringify({ type: 'offer_rejected', ...payload } satisfies OfferRejectedMessage);
}

export function buildOfferCancelledMessage(
  payload: Omit<OfferCancelledMessage, 'type'>
): string {
  return JSON.stringify({ type: 'offer_cancelled', ...payload } satisfies OfferCancelledMessage);
}

export function generateOfferId(): string {
  return `off_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
