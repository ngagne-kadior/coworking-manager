-- =====================================================================
-- Abonnements et réservation par place
-- =====================================================================
-- À exécuter UNE FOIS dans Supabase > SQL Editor (après le SQL des paiements).
--
-- 1. Deux modes de réservation par espace :
--    - 'whole' (espace entier) : une réservation bloque tout l'espace
--      (salle de réunion, bureau privé). C'est le fonctionnement actuel.
--    - 'seats' (par place) : plusieurs réservations peuvent se chevaucher
--      tant que le total des places ne dépasse pas la capacité (open space).
--    La règle est vérifiée par la base, avec un verrou sur l'espace pour
--    que deux réservations simultanées ne puissent pas dépasser la capacité.
--    Elle remplace la contrainte no_overlapping_confirmed_reservations.
--
-- 2. Abonnements : un membre occupe un espace du jour X au jour Y de chaque
--    mois, à des horaires fixes, pendant N mois. La création génère toutes
--    les réservations d'un coup (tout ou rien : si un seul jour est en
--    conflit, rien n'est créé et le jour est indiqué). L'abonné n'a rien à
--    réserver. Annuler l'abonnement libère toutes ses réservations à venir.
--
-- 3. Paiement d'un abonnement : payments.subscription_id (acomptes possibles).
-- =====================================================================

begin;

-- 1. Mode de réservation et places ---------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'booking_mode') then
    create type public.booking_mode as enum ('whole', 'seats');
  end if;
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum ('active', 'cancelled');
  end if;
end;
$$;

alter table public.spaces
  add column if not exists booking_mode public.booking_mode not null default 'whole';

alter table public.reservations
  add column if not exists seats integer not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_seats_check') then
    alter table public.reservations add constraint reservations_seats_check check (seats > 0);
  end if;
end;
$$;

alter table public.reservations
  drop constraint if exists no_overlapping_confirmed_reservations;

create or replace function public.validate_reservation_capacity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_space public.spaces;
  v_peak integer;
begin
  if new.status <> 'confirmed' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'confirmed'
     and (new.space_id, new.start_at, new.end_at, new.seats)
         is not distinct from (old.space_id, old.start_at, old.end_at, old.seats) then
    return new; -- rien qui change l'occupation
  end if;

  -- Verrou : les réservations simultanées du même espace passent une par une.
  select * into v_space from public.spaces where id = new.space_id for update;

  if v_space.booking_mode = 'whole' then
    if exists (
      select 1 from public.reservations r
      where r.space_id = new.space_id
        and r.id <> new.id
        and r.status = 'confirmed'
        and r.start_at < new.end_at
        and r.end_at > new.start_at
    ) then
      raise exception 'Ce créneau est déjà occupé par une réservation confirmée.'
        using errcode = '23P01';
    end if;
    return new;
  end if;

  -- Par place : occupation maximale sur l'intervalle (elle ne change qu'au
  -- début d'une réservation, donc on teste chaque début dans l'intervalle).
  if new.seats > v_space.capacity then
    raise exception 'Cet espace n''a que % place(s).', v_space.capacity using errcode = '23P01';
  end if;

  select coalesce(max(load), 0) into v_peak
  from (
    select (
      select coalesce(sum(r.seats), 0)
      from public.reservations r
      where r.space_id = new.space_id
        and r.id <> new.id
        and r.status = 'confirmed'
        and r.start_at <= t.at
        and r.end_at > t.at
    ) as load
    from (
      select new.start_at as at
      union
      select r.start_at from public.reservations r
      where r.space_id = new.space_id
        and r.id <> new.id
        and r.status = 'confirmed'
        and r.start_at > new.start_at
        and r.start_at < new.end_at
    ) as t
  ) as loads;

  if v_peak + new.seats > v_space.capacity then
    raise exception 'Plus assez de places : % place(s) libre(s) sur ce créneau.',
      greatest(v_space.capacity - v_peak, 0)
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_reservation_capacity on public.reservations;
create trigger validate_reservation_capacity
  before insert or update on public.reservations
  for each row execute function public.validate_reservation_capacity();

-- L'ancien contrôle de chevauchement à la confirmation est remplacé par
-- validate_reservation_capacity (qui gère aussi les places).
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
  end if;
  return new;
end;
$$;

-- 2. Abonnements -----------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id),
  space_id uuid not null references public.spaces(id),
  plan_name text not null check (trim(plan_name) <> ''),
  start_month date not null,
  months integer not null check (months between 1 and 24),
  day_from integer not null check (day_from between 1 and 31),
  day_to integer not null check (day_to between 1 and 31),
  time_from time not null,
  time_to time not null,
  seats integer not null default 1 check (seats > 0),
  price_amount integer check (price_amount is null or price_amount >= 0),
  status public.subscription_status not null default 'active',
  ends_on date,
  sessions integer not null default 0,
  notes text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (day_to >= day_from),
  check (time_to > time_from)
);

alter table public.subscriptions enable row level security;

drop policy if exists "Staff can read subscriptions" on public.subscriptions;
create policy "Staff can read subscriptions" on public.subscriptions
  for select to authenticated
  using ((select public.current_app_role()) in ('admin', 'manager'));

drop policy if exists "Staff can insert subscriptions" on public.subscriptions;
create policy "Staff can insert subscriptions" on public.subscriptions
  for insert to authenticated
  with check ((select public.current_app_role()) in ('admin', 'manager'));

drop policy if exists "Staff can update subscriptions" on public.subscriptions;
create policy "Staff can update subscriptions" on public.subscriptions
  for update to authenticated
  using ((select public.current_app_role()) in ('admin', 'manager'))
  with check ((select public.current_app_role()) in ('admin', 'manager'));

alter table public.reservations
  add column if not exists subscription_id uuid references public.subscriptions(id);

create index if not exists reservations_subscription_idx on public.reservations (subscription_id);

-- Création d'un abonnement + génération de ses réservations (tout ou rien)
create or replace function public.create_subscription(
  p_member_id uuid,
  p_space_id uuid,
  p_plan_name text,
  p_start_month date,
  p_months integer,
  p_day_from integer,
  p_day_to integer,
  p_time_from time,
  p_time_to time,
  p_seats integer,
  p_price_amount integer,
  p_notes text
)
returns uuid
language plpgsql
set search_path to ''
as $$
declare
  v_id uuid;
  v_month date;
  v_last integer;
  v_day integer;
  v_date date;
  v_start timestamptz;
  v_end timestamptz;
  v_count integer := 0;
  v_ends date;
begin
  if (select public.current_app_role()) is null then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  insert into public.subscriptions
    (member_id, space_id, plan_name, start_month, months, day_from, day_to,
     time_from, time_to, seats, price_amount, notes)
  values
    (p_member_id, p_space_id, trim(p_plan_name), date_trunc('month', p_start_month)::date,
     p_months, p_day_from, p_day_to, p_time_from, p_time_to, p_seats,
     p_price_amount, nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_id;

  for i in 0 .. p_months - 1 loop
    v_month := (date_trunc('month', p_start_month) + make_interval(months => i))::date;
    v_last := extract(day from (v_month + interval '1 month' - interval '1 day'))::integer;

    for v_day in p_day_from .. least(p_day_to, v_last) loop
      v_date := v_month + (v_day - 1);
      -- Horaires saisis en heure de Dakar
      v_start := (v_date + p_time_from) at time zone 'Africa/Dakar';
      v_end := (v_date + p_time_to) at time zone 'Africa/Dakar';

      if v_start > now() then
        begin
          insert into public.reservations
            (member_id, space_id, start_at, end_at, status, seats,
             price_amount, subscription_id, notes)
          values
            (p_member_id, p_space_id, v_start, v_end, 'confirmed', p_seats,
             0, v_id, 'Abonnement : ' || trim(p_plan_name));
        exception when sqlstate '23P01' then
          raise exception 'Conflit le % : %', to_char(v_date, 'DD/MM/YYYY'), sqlerrm
            using errcode = '23P01';
        end;
        v_count := v_count + 1;
        v_ends := v_date;
      end if;
    end loop;
  end loop;

  if v_count = 0 then
    raise exception 'Aucune journée à venir dans cette période : vérifie le mois de début et les jours.';
  end if;

  update public.subscriptions
  set ends_on = v_ends, sessions = v_count
  where id = v_id;

  return v_id;
end;
$$;

-- Annulation : libère toutes les réservations à venir de l'abonnement
create or replace function public.cancel_subscription(p_id uuid)
returns integer
language plpgsql
set search_path to ''
as $$
declare
  v_count integer;
begin
  if (select public.current_app_role()) is null then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  update public.subscriptions set status = 'cancelled'
  where id = p_id and status = 'active';
  if not found then
    raise exception 'Abonnement introuvable ou déjà annulé.';
  end if;

  update public.reservations
  set status = 'cancelled'
  where subscription_id = p_id
    and status = 'confirmed'
    and start_at > now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.create_subscription(uuid, uuid, text, date, integer, integer, integer, time, time, integer, integer, text) from public;
revoke all on function public.cancel_subscription(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.create_subscription(uuid, uuid, text, date, integer, integer, integer, time, time, integer, integer, text) to authenticated;
    grant execute on function public.cancel_subscription(uuid) to authenticated;
  end if;
end;
$$;

-- 3. Paiement des abonnements ----------------------------------------------
alter table public.payments
  add column if not exists subscription_id uuid references public.subscriptions(id);

create index if not exists payments_subscription_idx on public.payments (subscription_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_one_target') then
    alter table public.payments
      add constraint payments_one_target check (num_nonnulls(reservation_id, subscription_id) = 1);
  end if;
end;
$$;

create or replace function public.validate_payment()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_reservation public.reservations;
  v_subscription public.subscriptions;
  v_due integer;
  v_paid integer;
begin
  if new.reservation_id is not null then
    select * into v_reservation from public.reservations
    where id = new.reservation_id for update;
    if not found then
      raise exception 'Réservation introuvable.';
    end if;
    if v_reservation.status not in ('confirmed', 'completed') then
      raise exception 'Impossible d''encaisser une réservation annulée ou expirée.';
    end if;
    new.member_id := v_reservation.member_id;
    v_due := v_reservation.price_amount;
    select coalesce(sum(amount), 0) into v_paid
    from public.payments where reservation_id = new.reservation_id;
  else
    select * into v_subscription from public.subscriptions
    where id = new.subscription_id for update;
    if not found then
      raise exception 'Abonnement introuvable.';
    end if;
    if v_subscription.status = 'cancelled' then
      raise exception 'Impossible d''encaisser un abonnement annulé.';
    end if;
    new.member_id := v_subscription.member_id;
    v_due := v_subscription.price_amount;
    select coalesce(sum(amount), 0) into v_paid
    from public.payments where subscription_id = new.subscription_id;
  end if;

  if v_due is null then
    raise exception 'Définis d''abord le montant dû.';
  end if;
  if v_paid + new.amount > v_due then
    raise exception 'Montant trop élevé : il reste % F CFA à encaisser.', v_due - v_paid;
  end if;

  return new;
end;
$$;

create or replace function public.validate_subscription_price()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_paid integer;
begin
  if new.price_amount is distinct from old.price_amount then
    select coalesce(sum(amount), 0) into v_paid
    from public.payments where subscription_id = new.id;
    if v_paid > 0 and (new.price_amount is null or new.price_amount < v_paid) then
      raise exception 'Le montant dû ne peut pas être inférieur au déjà encaissé (% F CFA).', v_paid;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_subscription_price on public.subscriptions;
create trigger validate_subscription_price
  before update of price_amount on public.subscriptions
  for each row execute function public.validate_subscription_price();

-- Historique ----------------------------------------------------------------
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_changed text[] := '{}';
  v_action text;
  v_label text;
begin
  -- Champs modifiés
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}')
    into v_changed
    from jsonb_object_keys(v_new) as k
    where v_new -> k is distinct from v_old -> k;

    if cardinality(v_changed) = 0 then
      return new; -- rien n'a changé : pas de ligne d'historique
    end if;
  end if;

  -- Type d'action
  v_action := case
    when tg_op = 'INSERT' then 'create'
    when tg_op = 'DELETE' then 'delete'
    when 'is_active' = any (v_changed) then
      case when (v_new ->> 'is_active')::boolean then 'activate' else 'deactivate' end
    when 'status' = any (v_changed) then 'status'
    else 'update'
  end;

  -- Auteur
  if v_actor is null then
    v_actor_name := 'Système';
  else
    select p.full_name into v_actor_name
    from public.profiles p where p.id = v_actor;
    v_actor_name := coalesce(v_actor_name, 'Utilisateur inconnu');
  end if;

  -- Libellé lisible de l'élément concerné
  if tg_table_name = 'reservations' then
    select m.full_name || ' · ' || s.name
    into v_label
    from public.members m, public.spaces s
    where m.id = (v_row ->> 'member_id')::uuid
      and s.id = (v_row ->> 'space_id')::uuid;
  elsif tg_table_name = 'payments' then
    select m.full_name || ' · ' || (v_row ->> 'amount') || ' F CFA'
    into v_label
    from public.members m
    where m.id = (v_row ->> 'member_id')::uuid;
  elsif tg_table_name = 'subscriptions' then
    select m.full_name || ' · ' || (v_row ->> 'plan_name')
    into v_label
    from public.members m
    where m.id = (v_row ->> 'member_id')::uuid;
  elsif tg_table_name = 'space_rates' then
    select s.name into v_label
    from public.spaces s
    where s.id = (v_row ->> 'space_id')::uuid;
  else
    v_label := coalesce(v_row ->> 'full_name', v_row ->> 'name');
  end if;

  insert into public.audit_log
    (actor_id, actor_name, table_name, record_id, record_label,
     action, changed_fields, old_data, new_data)
  values
    (v_actor, v_actor_name, tg_table_name, coalesce((v_row ->> 'id')::uuid, (v_row ->> 'space_id')::uuid), v_label,
     v_action, v_changed, v_old, v_new);

  return coalesce(new, old);
end;
$$;



drop trigger if exists audit_subscriptions on public.subscriptions;
create trigger audit_subscriptions
  after insert or update or delete on public.subscriptions
  for each row execute function public.write_audit_log();

commit;
