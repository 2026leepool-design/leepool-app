-- Estado de disponibilidad del ejemplar, separado del progreso de lectura y del anuncio P2P.
alter table public.books
  add column if not exists availability text not null default 'owned';

alter table public.books
  drop constraint if exists books_availability_check;

alter table public.books
  add constraint books_availability_check
  check (availability in ('owned', 'lent', 'gifted'));

comment on column public.books.availability is
  'owned = en biblioteca; lent = prestado; gifted = regalado. Los dos últimos no se pueden anunciar.';

create or replace function public.prevent_unavailable_book_sale()
returns trigger
language plpgsql
as $$
begin
  if new.availability <> 'owned' then
    new.sale_status := 'not_for_sale';
    new.is_for_sale := false;
    new.price_sats := null;
    new.condition := null;
  end if;
  return new;
end;
$$;

drop trigger if exists books_availability_sale_guard on public.books;
create trigger books_availability_sale_guard
before insert or update of availability, sale_status, is_for_sale, price_sats, condition
on public.books
for each row execute function public.prevent_unavailable_book_sale();
