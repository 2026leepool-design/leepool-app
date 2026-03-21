-- P2P teklif/satış akışı: satış durumu (okuma status alanından ayrı)
-- Mevcut is_for_sale ile uyum için backfill yapılır.

alter table public.books
  add column if not exists sale_status text not null default 'not_for_sale'
  check (sale_status in ('not_for_sale', 'for_sale', 'sold'));

alter table public.books
  add column if not exists is_purchased boolean not null default false;

comment on column public.books.sale_status is 'P2P ilan: not_for_sale | for_sale | sold';
comment on column public.books.is_purchased is 'Kütüphanede uygulama içi satın alma ile eklendi mi';

-- Eski satır: is_for_sale true -> for_sale
update public.books
set sale_status = 'for_sale'
where coalesce(is_for_sale, false) = true
  and sale_status = 'not_for_sale';

-- is_for_sale false ve hâlâ default kalanlar zaten not_for_sale
