/**
 * Supabase `books` row + optional API metadata.
 */

/** Pazar yeri: not_for_sale | for_sale | sold */
export type BookSaleStatus = 'not_for_sale' | 'for_sale' | 'sold';

export interface Book {
  id: string;
  user_id?: string | null;
  title: string;
  author: string;
  total_pages: number;
  read_pages: number;
  current_value?: number;
  /** Okuma / sahiplik durumu (ör. bought, read) — pazar mantığında kullanılmaz */
  status?: string;
  sold_to_id?: string | null;
  purchased_from_id?: string | null;
  purchased_from_display?: string | null;
  is_app_purchase?: boolean | null;
  cover_url: string | null;
  isbn?: string | null;
  translator?: string | null;
  first_publish_year?: number | null;
  translated_titles?: unknown;
  ia_synopsis?: string | null;
  lightning_address?: string | null;
  is_for_sale?: boolean | null;
  sale_status?: string | null;
  price_sats?: number | null;
  condition?: string | null;
  seller_npub?: string | null;
  created_at?: string;
  page_count?: number | null;
  categories?: string[] | null;
  average_rating?: number | null;
  ratings_count?: number | null;
  maturity_rating?: string | null;
  language?: string | null;
  subjects?: string[] | null;
}

export type BookMetadataPatch = Pick<
  Book,
  | 'page_count'
  | 'categories'
  | 'average_rating'
  | 'ratings_count'
  | 'maturity_rating'
  | 'language'
  | 'isbn'
  | 'first_publish_year'
  | 'subjects'
>;
