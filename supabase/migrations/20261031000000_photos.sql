-- =====================================================================
-- Photos des espaces et des membres (Supabase Storage)
-- =====================================================================
-- À exécuter UNE FOIS dans Supabase > SQL Editor.
--
-- - space-photos  : photos des espaces, lecture publique (pas sensible).
-- - member-photos : photos de profil, PRIVÉES (données personnelles) :
--                   lisibles uniquement par admin et manager, via des
--                   liens temporaires.
-- - Taille max : 2 Mo (espaces), 1 Mo (membres). Formats : JPEG, PNG, WebP.
--   L'application redimensionne et compresse avant l'envoi.
-- - Ajout, remplacement et suppression : admin et manager uniquement.
-- =====================================================================

begin;

alter table public.spaces  add column if not exists photo_path text;
alter table public.members add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('space-photos',  'space-photos',  true,  2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('member-photos', 'member-photos', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Staff can read photos" on storage.objects;
create policy "Staff can read photos" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('space-photos', 'member-photos')
    and (select public.current_app_role()) in ('admin', 'manager')
  );

drop policy if exists "Staff can upload photos" on storage.objects;
create policy "Staff can upload photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('space-photos', 'member-photos')
    and (select public.current_app_role()) in ('admin', 'manager')
  );

drop policy if exists "Staff can replace photos" on storage.objects;
create policy "Staff can replace photos" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('space-photos', 'member-photos')
    and (select public.current_app_role()) in ('admin', 'manager')
  )
  with check (
    bucket_id in ('space-photos', 'member-photos')
    and (select public.current_app_role()) in ('admin', 'manager')
  );

drop policy if exists "Staff can delete photos" on storage.objects;
create policy "Staff can delete photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('space-photos', 'member-photos')
    and (select public.current_app_role()) in ('admin', 'manager')
  );

commit;
