import { supabase } from '@/utils/supabase';
import { purchaseBook } from '@/utils/bookPurchase';

/**
 * Satıcı onayı: atomik RPC ile ilanı kapatır ve alıcıya kopya oluşturur.
 *
 * İlan aç/kapat için istemci tarafında `bookListingActivePayload` /
 * `bookListingCancelledPayload` (@/utils/bookListing) kullanılmalı; RPC
 * `purchase_book_atomic` satıcı satırında `sale_status = 'sold'` ve
 * `is_for_sale = false` atar.
 */
export async function completeP2PBookTransfer(params: {
  bookId: string;
  buyerUserId: string | null;
  buyerNpub: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { bookId, buyerUserId, buyerNpub } = params;

  try {
    let resolvedBuyerId = buyerUserId?.trim() || null;
    if (!resolvedBuyerId) {
      const { data: tok } = await supabase
        .from('push_tokens')
        .select('user_id')
        .eq('npub', buyerNpub.trim())
        .not('user_id', 'is', null)
        .limit(1)
        .maybeSingle();
      resolvedBuyerId = tok?.user_id ?? null;
    }

    if (!resolvedBuyerId) {
      return {
        ok: false,
        message:
          'Alıcının Supabase hesabı bulunamadı. Alıcının uygulamada oturum açmış olması gerekir.',
      };
    }

    const res = await purchaseBook(bookId, resolvedBuyerId);
    if (!res.ok) {
      return { ok: false, message: res.message };
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}
