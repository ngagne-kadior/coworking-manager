-- =====================================================================
-- Portail public : vitrine des espaces et demandes de réservation
-- =====================================================================
-- À exécuter UNE FOIS dans Supabase > SQL Editor (après le SQL de la galerie).
--
-- Principe de sécurité : les visiteurs non connectés n'accèdent à AUCUNE
-- table. Ils passent uniquement par deux fonctions qui ne renvoient ou
-- n'acceptent que le strict nécessaire :
--   - get_public_catalog()     : nom du coworking, contacts publics,
--                                espaces ACTIFS (sans tarifs ni réservations)
--   - submit_booking_request() : enregistre une demande, avec contrôles
--                                et limites anti-abus
-- =====================================================================

begin;

-- 1. Paramètres du coworking (une seule ligne) -----------------------------
create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  coworking_name text not null default 'Coworking Manager',
  tagline text,
  whatsapp text,
  phone text,
  email text,
  address text,
  public_requests_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "Staff can read settings" on public.app_settings;
create policy "Staff can read settings" on public.app_settings
  for select to authenticated
  using ((select public.current_app_role()) in ('admin', 'manager'));

drop policy if exists "Admin can update settings" on public.app_settings;
create policy "Admin can update settings" on public.app_settings
  for update to authenticated
  using ((select public.current_app_role()) = 'admin')
  with check ((select public.current_app_role()) = 'admin');

-- 2. Demandes de réservation des clients ------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'request_status') then
    create type public.request_status as enum ('new', 'contacted', 'converted', 'declined');
  end if;
end;
$$;

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id),
  full_name text not null,
  phone text not null,
  email text,
  desired_date date not null,
  start_time time not null,
  end_time time not null,
  people integer not null default 1 check (people > 0),
  message text,
  status public.request_status not null default 'new',
  handled_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists booking_requests_created_idx on public.booking_requests (created_at desc);
create index if not exists booking_requests_phone_idx on public.booking_requests (phone, created_at);

alter table public.booking_requests enable row level security;

-- Lecture et traitement : équipe uniquement. Aucune politique INSERT :
-- les visiteurs ne peuvent écrire que via submit_booking_request().
drop policy if exists "Staff can read requests" on public.booking_requests;
create policy "Staff can read requests" on public.booking_requests
  for select to authenticated
  using ((select public.current_app_role()) in ('admin', 'manager'));

drop policy if exists "Staff can update requests" on public.booking_requests;
create policy "Staff can update requests" on public.booking_requests
  for update to authenticated
  using ((select public.current_app_role()) in ('admin', 'manager'))
  with check ((select public.current_app_role()) in ('admin', 'manager'));

-- 3. Catalogue public ---------------------------------------------------------
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
        'requests_enabled', s.public_requests_enabled
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

-- 4. Envoi d'une demande (avec contrôles et limites anti-abus) ---------------
create or replace function public.submit_booking_request(
  p_space_id uuid,
  p_full_name text,
  p_phone text,
  p_email text,
  p_desired_date date,
  p_start_time time,
  p_end_time time,
  p_people integer,
  p_message text,
  p_website text default null   -- champ piège invisible : rempli = robot
)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_space public.spaces;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_name text := trim(coalesce(p_full_name, ''));
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_message text := nullif(trim(coalesce(p_message, '')), '');
begin
  -- Robot détecté : on répond « reçu » sans rien enregistrer
  if coalesce(trim(p_website), '') <> '' then
    return 'ok';
  end if;

  if not coalesce((select public_requests_enabled from public.app_settings where id), false) then
    raise exception 'Les demandes en ligne sont momentanément fermées. Contacte-nous par téléphone ou WhatsApp.';
  end if;

  select * into v_space from public.spaces where id = p_space_id and is_active;
  if not found then
    raise exception 'Cet espace n''est pas disponible.';
  end if;

  if length(v_name) < 2 or length(v_name) > 100 then
    raise exception 'Indique ton nom complet.';
  end if;
  if length(regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 8 and 15 then
    raise exception 'Indique un numéro de téléphone valide.';
  end if;
  if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Adresse e-mail invalide.';
  end if;
  if p_desired_date is null
     or p_desired_date < (now() at time zone 'Africa/Dakar')::date
     or p_desired_date > (now() at time zone 'Africa/Dakar')::date + 365 then
    raise exception 'Choisis une date entre aujourd''hui et dans un an.';
  end if;
  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'L''heure de fin doit être après l''heure de début.';
  end if;
  if p_people is null or p_people < 1 or p_people > v_space.capacity then
    raise exception 'Cet espace accueille % personne(s) au maximum.', v_space.capacity;
  end if;
  if v_message is not null and length(v_message) > 1000 then
    raise exception 'Message trop long (1000 caractères maximum).';
  end if;

  -- Limites anti-abus
  if (select count(*) from public.booking_requests
      where phone = v_phone and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'Tu as déjà envoyé plusieurs demandes aujourd''hui. Nous te recontactons rapidement.';
  end if;
  if (select count(*) from public.booking_requests
      where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Trop de demandes en ce moment. Réessaie dans un instant ou contacte-nous par WhatsApp.';
  end if;

  insert into public.booking_requests
    (space_id, full_name, phone, email, desired_date, start_time, end_time, people, message)
  values
    (p_space_id, v_name, v_phone, v_email, p_desired_date, p_start_time, p_end_time, p_people, v_message);

  return 'ok';
end;
$$;

-- 5. Droits ---------------------------------------------------------------------
revoke all on function public.get_public_catalog() from public;
revoke all on function public.submit_booking_request(uuid, text, text, text, date, time, time, integer, text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.get_public_catalog() to anon, authenticated;
    grant execute on function public.submit_booking_request(uuid, text, text, text, date, time, time, integer, text, text) to anon, authenticated;
    revoke insert, update, delete on public.booking_requests from anon;
    revoke all on public.app_settings from anon;
  end if;
end;
$$;

-- 6. Historique -------------------------------------------------------------------
drop trigger if exists audit_booking_requests on public.booking_requests;
create trigger audit_booking_requests
  after insert or update or delete on public.booking_requests
  for each row execute function public.write_audit_log();


commit;
