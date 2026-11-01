-- Réseaux sociaux du coworking, affichés en bas de la page publique.
-- À exécuter UNE FOIS dans Supabase (SQL Editor), après 20261101000000_portail_public.sql.
-- Ne supprime aucune donnée.

begin;

-- 1. Nouvelles colonnes (liens https uniquement, pour bloquer tout lien piégé)
alter table public.app_settings
  add column if not exists facebook_url  text,
  add column if not exists instagram_url text,
  add column if not exists tiktok_url    text,
  add column if not exists linkedin_url  text,
  add column if not exists youtube_url   text,
  add column if not exists x_url         text;

alter table public.app_settings drop constraint if exists app_settings_social_urls_https;
alter table public.app_settings add constraint app_settings_social_urls_https check (
      (facebook_url  is null or (facebook_url  ~ '^https://[^\s]+$' and length(facebook_url)  <= 300))
  and (instagram_url is null or (instagram_url ~ '^https://[^\s]+$' and length(instagram_url) <= 300))
  and (tiktok_url    is null or (tiktok_url    ~ '^https://[^\s]+$' and length(tiktok_url)    <= 300))
  and (linkedin_url  is null or (linkedin_url  ~ '^https://[^\s]+$' and length(linkedin_url)  <= 300))
  and (youtube_url   is null or (youtube_url   ~ '^https://[^\s]+$' and length(youtube_url)   <= 300))
  and (x_url         is null or (x_url         ~ '^https://[^\s]+$' and length(x_url)         <= 300))
);

-- 2. Le catalogue public renvoie aussi les liens (toujours sans aucun prix)
create or replace function public.get_public_catalog()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'settings', (
      select jsonb_build_object(
        'coworking_name', s.coworking_name,
        'tagline', s.tagline,
        'whatsapp', s.whatsapp,
        'phone', s.phone,
        'email', s.email,
        'address', s.address,
        'requests_enabled', s.public_requests_enabled,
        'socials', jsonb_strip_nulls(jsonb_build_object(
          'facebook', s.facebook_url,
          'instagram', s.instagram_url,
          'tiktok', s.tiktok_url,
          'linkedin', s.linkedin_url,
          'youtube', s.youtube_url,
          'x', s.x_url
        ))
      )
      from public.app_settings s
      where s.id
    ),
    'spaces', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', sp.id,
          'name', sp.name,
          'space_type', sp.space_type,
          'description', sp.description,
          'capacity', sp.capacity,
          'booking_mode', sp.booking_mode,
          'area_m2', sp.area_m2,
          'location', sp.location,
          'amenities', sp.amenities,
          'cover', sp.photo_path,
          'photos', coalesce((
            select jsonb_agg(ph.path order by ph.position)
            from public.space_photos ph
            where ph.space_id = sp.id
          ), '[]'::jsonb)
        )
        order by sp.name
      )
      from public.spaces sp
      where sp.is_active
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_public_catalog() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.get_public_catalog() to anon, authenticated;
  end if;
end;
$$;

commit;
