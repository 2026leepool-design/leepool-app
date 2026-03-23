-- Market: `books` tablosundan doğrudan satılık ilanlar; books_select_own ile OR birleşir.
-- (auth.uid() = user_id) VEYA (sale_status = 'for_sale')

drop policy if exists "books_select_for_sale" on public.books;

create policy "books_select_for_sale"
  on public.books for select
  to authenticated, anon
  using (sale_status = 'for_sale');

comment on policy "books_select_for_sale" on public.books is
  'Herkes satılık ilan satırlarını listeleyebilir / id ile okuyabilir (RLS kolon kısıtlamaz; gizli alanlar için ileride view veya column-level değerlendirin).';
