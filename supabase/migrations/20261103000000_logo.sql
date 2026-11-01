-- Logo du coworking : affiché dans le menu, sur la page publique et la page de connexion.
-- À exécuter UNE FOIS dans Supabase (SQL Editor), après 20261101000000_portail_public.sql.
-- Ne supprime aucune donnée.
--
-- - Stockage « brand » : public en lecture (un logo n'est pas sensible).
-- - Seul l'administrateur peut ajouter, remplacer ou supprimer le logo.
-- - Formats : PNG, JPEG, WebP (pas de SVG : il peut contenir du code). 1 Mo maximum.

begin;

alter table public.app_settings add column if not exists logo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand', 'brand', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- (la suppression d'un ancien logo demande aussi le droit de lecture)
drop policy if exists "Admin can read brand" on storage.objects;
create policy "Admin can read brand" on storage.objects
  for select to authenticated
  using (bucket_id = 'brand' and (select public.current_app_role()) = 'admin');

drop policy if exists "Admin can upload brand" on storage.objects;
create policy "Admin can upload brand" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'brand' and (select public.current_app_role()) = 'admin');

drop policy if exists "Admin can replace brand" on storage.objects;
create policy "Admin can replace brand" on storage.objects
  for update to authenticated
  using (bucket_id = 'brand' and (select public.current_app_role()) = 'admin')
  with check (bucket_id = 'brand' and (select public.current_app_role()) = 'admin');

drop policy if exists "Admin can delete brand" on storage.objects;
create policy "Admin can delete brand" on storage.objects
  for delete to authenticated
  using (bucket_id = 'brand' and (select public.current_app_role()) = 'admin');

-- Nom + logo, lisibles par tous (page publique, connexion, menu).
create or replace function public.get_public_brand()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object('name', s.coworking_name, 'logo', s.logo_path)
  from public.app_settings s
  where s.id;
$$;

revoke all on function public.get_public_brand() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.get_public_brand() to anon, authenticated;
  end if;
end;
$$;

commit;
