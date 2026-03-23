-- Ticaret yalnızca sale_status üzerinden; okuma durumu `status` sütunu ayrı kalır.
-- books_market_public: satılık ilanlar (kişisel alanlar maskeli)

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
  b.sale_status,
  b.is_for_sale,
  0::integer as read_pages,
  null::timestamptz as reading_started_at,
  null::timestamptz as reading_finished_at
from public.books b
where b.sale_status = 'for_sale';

comment on view public.books_market_public is
  'sale_status = for_sale ilanları; okuma alanları maskeli.';

grant select on public.books_market_public to anon, authenticated;

-- Atomik satın alma: yalnızca sale_status; satıcı oturumu zorunlu
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
  if (select auth.uid()) is distinct from v_seller then
    raise exception 'only_seller_can_complete_sale';
  end if;
  if v_seller = p_buyer_id then
    raise exception 'cannot_buy_own_book';
  end if;

  update public.books
  set
    sale_status = 'sold',
    is_for_sale = false,
    sold_to_id = p_buyer_id
  where id = p_book_id and sale_status = 'for_sale';

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
    status,
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
    purchased_from_id,
    is_app_purchase,
    purchased_from_display,
    reading_started_at,
    reading_finished_at
  )
  select
    p_buyer_id,
    b.title,
    b.author,
    coalesce(b.total_pages, 0),
    0,
    'bought',
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
    v_seller,
    true,
    v_seller_label,
    null,
    null
  from public.books b
  where b.id = p_book_id
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke all on function public.purchase_book_atomic(uuid, uuid) from public;
grant execute on function public.purchase_book_atomic(uuid, uuid) to authenticated;
