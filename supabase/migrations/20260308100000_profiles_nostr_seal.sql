-- Kimlik mühürleme: Web2 (auth.users) ile Nostr (npub / sealed nsec) profil eşlemesi
-- RLS: yalnızca auth.uid() = id satırını okuyup yazabilir.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  npub text,
  encrypted_nsec text,
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.profiles is 'Auth kullanıcı başına bir satır; çoklu cihaz Nostr senkronu';
comment on column public.profiles.npub is 'Nostr public identity (npub)';
comment on column public.profiles.encrypted_nsec is 'İstemcide hesap şifresiyle mühürlenmiş nsec (JSON: s=tuz, n/c=NaCl secretbox)';

-- Mevcut şablon profiles tablosu varsa sütunları ekle
alter table public.profiles add column if not exists npub text;
alter table public.profiles add column if not exists encrypted_nsec text;
alter table public.profiles add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using ((select auth.uid()) = id);

-- Yeni auth kullanıcısı için boş profil satırı
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_user_profile();

-- Mevcut kullanıcılar (trigger tetiklenmemiş olabilir)
insert into public.profiles (id)
select u.id from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

grant select, insert, update, delete on table public.profiles to authenticated;

-- Eski taslakta nostr_key_salt sütunu varsa kaldır (tuz artık encrypted_nsec JSON içinde)
alter table public.profiles drop column if exists nostr_key_salt;
