import { supabase } from '@/utils/supabase';

export type PurchaseBookResult =
  | { ok: true; newBookId: string }
  | { ok: false; message: string };

/**
 * Atomik P2P transfer — Supabase RPC `purchase_book_atomic`.
 * Başarısızlıkta kullanıcıya gösterilecek kısa mesaj.
 */
export async function purchaseBook(
  bookId: string,
  buyerId: string
): Promise<PurchaseBookResult> {
  const cleanBook = bookId?.trim();
  const cleanBuyer = buyerId?.trim();
  if (!cleanBook || !cleanBuyer) {
    return { ok: false, message: 'İşlem tamamlanamadı.' };
  }

  const { data, error } = await supabase.rpc('purchase_book_atomic', {
    p_book_id: cleanBook,
    p_buyer_id: cleanBuyer,
  });

  if (error) {
    const code = error.message ?? '';
    if (code.includes('book_not_for_sale')) {
      return { ok: false, message: 'Bu kitap satılık değil veya satışı kapanmış.' };
    }
    if (code.includes('only_seller_can_complete_sale')) {
      return { ok: false, message: 'Bu işlemi yalnızca satıcı tamamlayabilir.' };
    }
    if (code.includes('cannot_buy_own_book')) {
      return { ok: false, message: 'Kendi kitabınızı satın alamazsınız.' };
    }
    if (code.includes('book_not_found')) {
      return { ok: false, message: 'Kitap bulunamadı.' };
    }
    return { ok: false, message: 'İşlem tamamlanamadı.' };
  }

  if (data == null) {
    return { ok: false, message: 'İşlem tamamlanamadı.' };
  }

  const newBookId = String(data);
  if (!newBookId) {
    return { ok: false, message: 'İşlem tamamlanamadı.' };
  }

  return { ok: true, newBookId };
}
