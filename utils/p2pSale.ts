import { supabase } from '@/utils/supabase';

type BookRow = Record<string, unknown>;

/**
 * Satıcı onayı: orijinal kitap sold, alıcıya kopya insert (is_purchased: true).
 */
export async function completeP2PBookTransfer(params: {
  bookId: string;
  buyerUserId: string | null;
  buyerNpub: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { bookId, buyerUserId, buyerNpub } = params;

  try {
    const { data: book, error: fetchErr } = await supabase
      .from('books')
      .select('*')
      .eq('id', bookId)
      .single();

    if (fetchErr || !book) {
      return { ok: false, message: fetchErr?.message ?? 'Kitap bulunamadı.' };
    }

    let resolvedBuyerId = buyerUserId;
    if (!resolvedBuyerId?.trim()) {
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

    const b = book as BookRow;
    const { error: upErr } = await supabase
      .from('books')
      .update({
        sale_status: 'sold',
        is_for_sale: false,
      })
      .eq('id', bookId);

    if (upErr) {
      return { ok: false, message: upErr.message };
    }

    const insertPayload: Record<string, unknown> = {
      title: b.title,
      author: b.author,
      total_pages: b.total_pages ?? 0,
      read_pages: 0,
      isbn: b.isbn ?? null,
      translator: b.translator ?? null,
      first_publish_year: b.first_publish_year ?? null,
      translated_titles: b.translated_titles ?? null,
      current_value: b.current_value ?? 0,
      cover_url: b.cover_url ?? null,
      lightning_address: b.lightning_address ?? null,
      ia_synopsis: b.ia_synopsis ?? null,
      condition: null,
      price_sats: null,
      is_for_sale: false,
      sale_status: 'not_for_sale',
      is_purchased: true,
      seller_npub: null,
      status: 'bought',
      user_id: resolvedBuyerId,
      reading_started_at: null,
      reading_finished_at: null,
    };

    const { error: insErr } = await supabase.from('books').insert(insertPayload);
    if (insErr) {
      return { ok: false, message: insErr.message };
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}
