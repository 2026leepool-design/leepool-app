-- DM başlığında peer için Supabase user id (RLS bypass, yalnızca id döner)
create or replace function public.profile_id_by_npub(p_npub text)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.id as user_id
  from public.profiles p
  where p.npub is not null
    and trim(p.npub) = trim(coalesce(p_npub, ''))
  limit 1;
$$;

revoke all on function public.profile_id_by_npub(text) from public;
grant execute on function public.profile_id_by_npub(text) to authenticated, anon;

comment on function public.profile_id_by_npub(text) is
  'Sohbette gösterim için npub → auth user id (salt okunur).';
