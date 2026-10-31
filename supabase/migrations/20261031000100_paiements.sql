-- =====================================================================
-- Paiements : tarifs par espace, montant des réservations, encaissements
-- =====================================================================
-- À exécuter UNE FOIS dans Supabase > SQL Editor (après le SQL des photos).
--
-- - space_rates : tarifs par espace (heure, demi-journée, journée, mois),
--   en francs CFA. Modifiables par l'admin, lisibles par l'équipe.
-- - reservations.price_amount : montant dû pour la réservation.
-- - payments : encaissements (un ou plusieurs par réservation : acomptes).
--   Moyens : espèces, Wave, Orange Money, virement, carte.
--   Un encaissement n'est jamais modifié ; seul l'admin peut en supprimer
--   un (erreur de saisie). Tout est tracé dans l'historique.
-- - La base refuse : un total encaissé supérieur au montant dû, un
--   paiement sur une réservation annulée ou sans montant, et un montant
--   dû inférieur à ce qui est déjà encaissé.
-- =====================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'rate_unit') then
    create type public.rate_unit as enum ('hour', 'half_day', 'day', 'month');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum ('cash', 'wave', 'orange_money', 'transfer', 'card');
  end if;
end;
$$;

-- Tarifs ----------------------------------------------------------------
create table if not exists public.space_rates (
  space_id uuid not null references public.spaces(id),
  unit public.rate_unit not null,
  price integer not null check (price >= 0),
  updated_at timestamptz not null default now(),
  primary key (space_id, unit)
);

alter table public.space_rates enable row level security;

drop policy if exists "Staff can read rates" on public.space_rates;
create policy "Staff can read rates" on public.space_rates
  for select to authenticated
  using ((select public.current_app_role()) in ('admin', 'manager'));

drop policy if exists "Admin can insert rates" on public.space_rates;
create policy "Admin can insert rates" on public.space_rates
  for insert to authenticated
  with check ((select public.current_app_role()) = 'admin');

drop policy if exists "Admin can update rates" on public.space_rates;
create policy "Admin can update rates" on public.space_rates
  for update to authenticated
  using ((select public.current_app_role()) = 'admin')
  with check ((select public.current_app_role()) = 'admin');

drop policy if exists "Admin can delete rates" on public.space_rates;
create policy "Admin can delete rates" on public.space_rates
  for delete to authenticated
  using ((select public.current_app_role()) = 'admin');

-- Montant dû d'une réservation -------------------------------------------
alter table public.reservations
  add column if not exists price_amount integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_price_amount_check') then
    alter table public.reservations
      add constraint reservations_price_amount_check
      check (price_amount is null or price_amount >= 0);
  end if;
end;
$$;

-- Encaissements -----------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id),
  member_id uuid not null references public.members(id),
  amount integer not null check (amount > 0),
  method public.payment_method not null,
  paid_at timestamptz not null default now(),
  note text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists payments_reservation_idx on public.payments (reservation_id);
create index if not exists payments_paid_at_idx on public.payments (paid_at desc);

alter table public.payments enable row level security;

drop policy if exists "Staff can read payments" on public.payments;
create policy "Staff can read payments" on public.payments
  for select to authenticated
  using ((select public.current_app_role()) in ('admin', 'manager'));

drop policy if exists "Staff can insert payments" on public.payments;
create policy "Staff can insert payments" on public.payments
  for insert to authenticated
  with check ((select public.current_app_role()) in ('admin', 'manager'));

drop policy if exists "Admin can delete payments" on public.payments;
create policy "Admin can delete payments" on public.payments
  for delete to authenticated
  using ((select public.current_app_role()) = 'admin');

-- Contrôles d'un encaissement
create or replace function public.validate_payment()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_reservation public.reservations;
  v_paid integer;
begin
  if new.reservation_id is not null then
    select * into v_reservation
    from public.reservations
    where id = new.reservation_id
    for update;

    if not found then
      raise exception 'Réservation introuvable.';
    end if;

    if v_reservation.status not in ('confirmed', 'completed') then
      raise exception 'Impossible d''encaisser une réservation annulée ou expirée.';
    end if;

    if v_reservation.price_amount is null then
      raise exception 'Définis d''abord le montant dû de cette réservation.';
    end if;

    new.member_id := v_reservation.member_id;

    select coalesce(sum(amount), 0) into v_paid
    from public.payments
    where reservation_id = new.reservation_id;

    if v_paid + new.amount > v_reservation.price_amount then
      raise exception 'Montant trop élevé : il reste % F CFA à encaisser.',
        v_reservation.price_amount - v_paid;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_payment_before_insert on public.payments;
create trigger validate_payment_before_insert
  before insert on public.payments
  for each row execute function public.validate_payment();

-- Le montant dû ne peut pas descendre sous ce qui est déjà encaissé
create or replace function public.validate_reservation_price()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_paid integer;
begin
  if new.price_amount is distinct from old.price_amount then
    select coalesce(sum(amount), 0) into v_paid
    from public.payments
    where reservation_id = new.id;

    if v_paid > 0 and (new.price_amount is null or new.price_amount < v_paid) then
      raise exception 'Le montant dû ne peut pas être inférieur au déjà encaissé (% F CFA).', v_paid;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_reservation_price on public.reservations;
create trigger validate_reservation_price
  before update of price_amount on public.reservations
  for each row execute function public.validate_reservation_price();

-- Historique : libellés des paiements et des tarifs ------------------------
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


drop trigger if exists audit_payments on public.payments;
create trigger audit_payments
  after insert or update or delete on public.payments
  for each row execute function public.write_audit_log();

drop trigger if exists audit_space_rates on public.space_rates;
create trigger audit_space_rates
  after insert or update or delete on public.space_rates
  for each row execute function public.write_audit_log();

commit;
