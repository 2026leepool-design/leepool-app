# P2P kitap satın alma (atomik transfer)

## RPC: `purchase_book_atomic(p_book_id uuid, p_buyer_id uuid)`

Migration: `supabase/migrations/20260322120000_book_listing_privacy_rpc.sql`

### Ne yapar?

1. Satıcının kitabını `listing_status = 'sold'`, `sold_to_id = alıcı` ile mühürler.
2. Aynı metadata ile alıcı için yeni satır ekler: `listing_status = 'in_library'`, `purchased_from_id`, `is_app_purchase = true`, okuma alanları sıfır.

### İstemci

```ts
import { purchaseBook } from '@/utils/bookPurchase';

const res = await purchaseBook(bookId, buyerUserId);
```

## Mahremiyet

- **Market listesi:** `books_market_public` view — `read_pages`, okuma tarihleri, `personal_notes`, `user_book_rating` dışarıya kapalı.
- **`books` tablosu:** RLS yalnızca `user_id = auth.uid()` satırlarına doğrudan SELECT verir; başkasının ilanı için view kullanın.

## Profiller

RPC, alıcı satırına `purchased_from_display` yazar (satıcının `profiles.display_name` veya `npub`). Böylece alıcı, satıcının `profiles` RLS politikası olmadan rozeti gösterebilir.

## Güvenlik

`purchase_book_atomic` yalnızca `auth.uid() = books.user_id` (satıcı) iken çalışır; böylece alıcı veya üçüncü bir taraf başkasının ilanını tek başına kapatıp klonlayamaz. Onay, satıcının uygulamasından (ör. P2P sohbet “satışı tamamla”) tetiklenmelidir.
