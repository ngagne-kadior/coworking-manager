-- =====================================================================
-- Coworking Manager — schéma initial (état de la base au 29/10/2026)
-- =====================================================================
-- Ce fichier SAUVEGARDE la structure déjà présente dans Supabase.
-- NE PAS l'exécuter sur la base de production : tout existe déjà.
-- Il sert à reconstruire la base sur un nouveau projet Supabase.
-- Les index autres que ceux des contraintes ne sont pas repris.
-- =====================================================================

create extension if not exists btree_gist;

-- Types ---------------------------------------------------------------
create type public.app_role as enum ('admin', 'manager');
create type public.reservation_status as enum
  ('pending', 'confirmed', 'cancelled', 'completed', 'expired');

-- Tables --------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'manager',
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  company text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint members_email_not_blank
    check (email is null or trim(both from email) <> '')
);

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  capacity integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint spaces_capacity_check check (capacity > 0)
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id),
  space_id uuid not null references public.spaces(id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status public.reservation_status not null default 'pending',
  expires_at timestamptz default (now() + interval '1 hour'),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint reservations_check check (end_at > start_at),
  constraint no_overlapping_confirmed_reservations
    exclude using gist (
      space_id with =,
      tstzrange(start_at, end_at, '[)') with &&
    ) where (status = 'confirmed')
);

-- Fonctions -----------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role
language sql
stable security definer
set search_path to ''
as $$
  select p.role
  from public.profiles as p
  where p.id = (select auth.uid())
  limit 1;
$$;

create or replace function public.deactivate_member(p_member_id uuid)
returns text
language plpgsql
as $$
begin
  if exists (
    select 1 from public.reservations
    where member_id = p_member_id
      and status = 'confirmed'
      and start_at > now()
  ) then
    return 'upcoming_reservations';
  end if;

  update public.members
  set is_active = false
  where id = p_member_id and is_active = true;

  if not found then
    return 'not_found_or_inactive';
  end if;

  return 'deactivated';
end;
$$;

create or replace function public.prevent_past_reservation_changes()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if old.start_at <= now() then
    raise exception
      'Une réservation passée ou déjà commencée ne peut plus être modifiée ou supprimée.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.validate_reservation()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.status in ('pending', 'confirmed') then
    if not exists (
      select 1 from public.members m
      where m.id = new.member_id and m.is_active = true
    ) then
      raise exception 'Impossible de réserver pour un membre inactif ou inexistant.';
    end if;

    if not exists (
      select 1 from public.spaces s
      where s.id = new.space_id and s.is_active = true
    ) then
      raise exception 'Impossible de réserver un espace inactif ou inexistant.';
    end if;

    if new.start_at <= now() then
      raise exception 'Une nouvelle réservation doit commencer dans le futur.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.validate_reservation_confirmation()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    if old.status <> 'pending' then
      raise exception 'Seules les réservations en attente peuvent être confirmées.';
    end if;

    if new.expires_at is null or new.expires_at <= now() then
      raise exception 'Cette réservation a expiré et ne peut plus être confirmée.';
    end if;

    if exists (
      select 1 from public.reservations as r
      where r.space_id = new.space_id
        and r.id <> new.id
        and r.status = 'confirmed'
        and r.start_at < new.end_at
        and r.end_at > new.start_at
    ) then
      raise exception 'Ce créneau est déjà occupé par une réservation confirmée.';
    end if;
  end if;
  return new;
end;
$$;

-- Triggers ------------------------------------------------------------
create trigger protect_past_reservations
  before delete or update on public.reservations
  for each row execute function public.prevent_past_reservation_changes();

create trigger validate_reservation_before_write
  before insert or update on public.reservations
  for each row execute function public.validate_reservation();

create trigger validate_reservation_confirmation
  before update of status on public.reservations
  for each row execute function public.validate_reservation_confirmation();

-- Sécurité (RLS) ------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.spaces enable row level security;
alter table public.reservations enable row level security;

create policy "Users can read permitted profiles" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.current_app_role()) = 'admin');

create policy "Authorized users can read members" on public.members
  for select to authenticated
  using ((select public.current_app_role()) in ('admin', 'manager'));
create policy "Authorized users can insert members" on public.members
  for insert to authenticated
  with check ((select public.current_app_role()) in ('admin', 'manager'));
create policy "Authorized users can update members" on public.members
  for update to authenticated
  using ((select public.current_app_role()) in ('admin', 'manager'))
  with check ((select public.current_app_role()) in ('admin', 'manager'));

create policy "Authorized users can read spaces" on public.spaces
  for select to authenticated
  using ((select public.current_app_role()) in ('admin', 'manager'));
create policy "Authorized users can insert spaces" on public.spaces
  for insert to authenticated
  with check ((select public.current_app_role()) in ('admin', 'manager'));
create policy "Authorized users can update spaces" on public.spaces
  for update to authenticated
  using ((select public.current_app_role()) in ('admin', 'manager'))
  with check ((select public.current_app_role()) in ('admin', 'manager'));

create policy "Authorized users can read reservations" on public.reservations
  for select to authenticated
  using ((select public.current_app_role()) in ('admin', 'manager'));
create policy "Authorized users can insert reservations" on public.reservations
  for insert to authenticated
  with check ((select public.current_app_role()) in ('admin', 'manager'));
create policy "Authorized users can update reservations" on public.reservations
  for update to authenticated
  using ((select public.current_app_role()) in ('admin', 'manager'))
  with check ((select public.current_app_role()) in ('admin', 'manager'));
