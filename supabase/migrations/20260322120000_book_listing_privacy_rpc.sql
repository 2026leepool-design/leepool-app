-- P2P: listing_status (in_library | for_sale | sold), satıcı/alıcı izleri, market view, atomik satın alma.
-- Okuma: Eski `status` (bought/read) sütunu varsa `reading_progress` olarak yeniden adlandırılır; ilerleme için read_pages kullanılır.

-- Önce eski `status` (bought/read) → reading_progress; sonra eksik sütunları ekle
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'books' and column_name = 'status'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'books' and column_name = 'reading_progress'
  ) then
    alter table public.books rename column status to reading_progress;
  end if;
end $$;

alter table public.books add column if not exists reading_progress text;
alter table public.books add column if not exists personal_notes text;
alter table public.books add column if not exists user_book_rating numeric;

alter table public.books
  add column if not exists sold_to_id uuid references auth.users (id) on delete set null;

alter table public.books
  add column if not exists purchased_from_id uuid references auth.users (id) on delete set null;

alter table public.books
  add column if not exists is_app_purchase boolean not null default false;

alter table public.books
  add column if not exists purchased_from_display text;

alter table public.books
  add column if not exists listing_status text;

comment on column public.books.purchased_from_display is 'Satın alma anında mühürlenmiş eski sahip etiketi (display_name / npub)';

comment on column public.books.sold_to_id is 'Satış tamamlandığında alıcı auth.users.id';
comment on column public.books.purchased_from_id is 'Uygulama içi satın almada önceki sahip user_id';
comment on column public.books.is_app_purchase is 'LeePool P2P ile eklenen kopya';
comment on column public.books.listing_status is 'in_library | for_sale | sold';

update public.books b
set listing_status = case
  when coalesce(b.sale_status, '') = 'sold' then 'sold'
  when coalesce(b.sale_status, '') = 'for_sale' or coalesce(b.is_for_sale, false) then 'for_sale'
  else 'in_library'
end
where b.listing_status is null;

alter table public.books alter column listing_status set default 'in_library';
alter table public.books alter column listing_status set not null;

do $$
begin
  alter table public.books
    add constraint books_listing_status_check
    check (listing_status in ('in_library', 'for_sale', 'sold'));
exception
  when duplicate_object then null;
end $$;

update public.books set sale_status = 'for_sale', is_for_sale = true
where listing_status = 'for_sale' and coalesce(sale_status, '') <> 'sold';

update public.books set sale_status = 'sold', is_for_sale = false
where listing_status = 'sold';

update public.books set sale_status = 'not_for_sale', is_for_sale = false
where listing_status = 'in_library';

alter table public.profiles add column if not exists display_name text;

-- Market: kişisel alanlar maskeli (RLS tek başına sütun maskelemez; ilanlar bu view’dan okunmalı)
drop view if exists public.books_market_public;

create view public.books_market_public as
select
  b.id,
  b.user_id,
  b.title,
  b.author,
  b.cover_url,
  b.price_sats,
  b.condition,
  b.isbn,
  b.translator,
  b.first_publish_year,
  b.created_at,
  b.seller_npub,
  b.page_count,
  b.total_pages,
  b.average_rating,
  b.ratings_count,
  b.maturity_rating,
  b.language,
  b.categories,
  b.subjects,
  b.ia_synopsis,
  b.lightning_address,
  b.translated_titles,
  b.current_value,
  b.listing_status,
  b.sale_status,
  b.is_for_sale,
  0::integer as read_pages,
  null::timestamptz as reading_started_at,
  null::timestamptz as reading_finished_at,
  null::text as personal_notes,
  null::numeric as user_book_rating
from public.books b
where b.listing_status = 'for_sale';

comment on view public.books_market_public is
  'Satılık ilanlar; okuma ilerlemesi ve kişisel alanlar dışarıya kapalı.';

grant select on public.books_market_public to anon, authenticated;

-- Atomik transfer (SECURITY DEFINER — RLS aşımı)
create or replace function public.purchase_book_atomic(p_book_id uuid, p_buyer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
  v_new_id uuid;
  v_seller_label text;
begin
  if p_buyer_id is null then
    raise exception 'buyer_required';
  end if;

  select user_id into v_seller from public.books where id = p_book_id for update;
  if v_seller is null then
    raise exception 'book_not_found';
  end if;
  -- Yalnızca oturumdaki satıcı işlemi onaylayabilir (P2P sohbet akışı)
  if (select auth.uid()) is distinct from v_seller then
    raise exception 'only_seller_can_complete_sale';
  end if;
  if v_seller = p_buyer_id then
    raise exception 'cannot_buy_own_book';
  end if;

  update public.books
  set
    listing_status = 'sold',
    sold_to_id = p_buyer_id,
    sale_status = 'sold',
    is_for_sale = false
  where id = p_book_id and listing_status = 'for_sale';

  if not found then
    raise exception 'book_not_for_sale';
  end if;

  select coalesce(
    nullif(trim(p.display_name), ''),
    nullif(trim(p.npub), ''),
    v_seller::text
  )
  into v_seller_label
  from public.profiles p
  where p.id = v_seller;

  if v_seller_label is null then
    v_seller_label := v_seller::text;
  end if;

  insert into public.books (
    user_id,
    title,
    author,
    total_pages,
    read_pages,
    reading_progress,
    listing_status,
    purchased_from_id,
    is_app_purchase,
    isbn,
    translator,
    first_publish_year,
    page_count,
    categories,
    subjects,
    average_rating,
    ratings_count,
    maturity_rating,
    language,
    translated_titles,
    current_value,
    cover_url,
    lightning_address,
    ia_synopsis,
    condition,
    price_sats,
    is_for_sale,
    sale_status,
    is_purchased,
    seller_npub,
    reading_started_at,
    reading_finished_at,
    personal_notes,
    user_book_rating,
    purchased_from_display
  )
  select
    p_buyer_id,
    b.title,
    b.author,
    coalesce(b.total_pages, 0),
    0,
    'bought',
    'in_library',
    v_seller,
    true,
    b.isbn,
    b.translator,
    b.first_publish_year,
    b.page_count,
    b.categories,
    b.subjects,
    b.average_rating,
    b.ratings_count,
    b.maturity_rating,
    b.language,
    b.translated_titles,
    coalesce(b.current_value, 0),
    b.cover_url,
    b.lightning_address,
    b.ia_synopsis,
    null,
    null,
    false,
    'not_for_sale',
    true,
    null,
    null,
    null,
    null,
    v_seller_label
  from public.books b
  where b.id = p_book_id
  returning id into v_new_id;

  return v_new_id;
end;
$$;

comment on function public.purchase_book_atomic(uuid, uuid) is
  'P2P: ilanı sold yapar, alıcıya klon ekler (kişisel alanlar sıfır).';

revoke all on function public.purchase_book_atomic(uuid, uuid) from public;
grant execute on function public.purchase_book_atomic(uuid, uuid) to authenticated;

-- ─── RLS (isteğe bağlı sıkılaştırma) ─────────────────────────────────────────
-- books üzerinde sahibi dışı SELECT, satırdaki kişisel verileri sızdırır.
-- Öneri: market ve başkasının ilan detayı için books_market_public kullanın.
-- Aşağıdaki politikalar yalnızca sahibin kendi satırlarını görmesine izin verir;
-- uygulama kodu market + paylaşılan kitap linki için view kullanacak şekilde güncellenmelidir.

alter table public.books enable row level security;

drop policy if exists "books_select_own" on public.books;
create policy "books_select_own"
  on public.books for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "books_insert_own" on public.books;
create policy "books_insert_own"
  on public.books for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "books_update_own" on public.books;
create policy "books_update_own"
  on public.books for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "books_delete_own" on public.books;
create policy "books_delete_own"
  on public.books for delete
  to authenticated
  using ((select auth.uid()) = user_id);
