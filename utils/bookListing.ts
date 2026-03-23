/**
 * Pazar yeri: `sale_status === 'for_sale'` tek kaynak; `is_for_sale` aynı payload ile güncellenir.
 * Okuma durumu `status` sütununda (bought, read, …); burada kullanılmaz.
 */

export function isListedForSale(row: {
  sale_status?: string | null;
  is_for_sale?: boolean | null;
}): boolean {
  return row.sale_status === 'for_sale';
}

export function isSaleSold(row: { sale_status?: string | null }): boolean {
  return row.sale_status === 'sold';
}

/** Ana kütüphane listesi: satılmamış tüm satırlar (`sale_status !== 'sold'`) */
export function isLibraryMainRow(row: { sale_status?: string | null }): boolean {
  return row.sale_status !== 'sold';
}

/** Supabase update: satışa çıkar — her zaman ikisi birlikte */
export const bookListingActivePayload = {
  is_for_sale: true,
  sale_status: 'for_sale' as const,
};

/** Supabase update: satışı iptal — her zaman ikisi birlikte */
export const bookListingCancelledPayload = {
  is_for_sale: false,
  sale_status: 'not_for_sale' as const,
};
