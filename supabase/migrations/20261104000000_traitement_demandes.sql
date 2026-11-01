-- Traitement des demandes clients : vérifier la disponibilité, accepter (créer la
-- réservation) ou refuser avec un motif.
-- À exécuter UNE FOIS dans Supabase (SQL Editor), après 20261103000000_logo.sql.
-- Ne supprime aucune donnée.

begin;

-- 1. Suivi de la demande ------------------------------------------------------
alter table public.booking_requests
  add column if not exists reservation_id uuid references public.reservations(id),
  add column if not exists member_id uuid references public.members(id),
  add column if not exists decline_reason text,
  add column if not exists handled_at timestamptz;

-- Instructions de paiement envoyées au client (ex. « Wave : 77 000 00 00 »)
alter table public.app_settings
  add column if not exists payment_instructions text;

-- 2. Disponibilité d'un espace sur un créneau (même règle que la réservation) ---
create or replace function public.space_availability(
  p_space_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_seats integer default 1
)
returns jsonb
language plpgsql
stable
security invoker
set search_path to ''
as $$
declare
  v_space public.spaces;
  v_peak integer := 0;
  v_conflicts jsonb;
begin
  if coalesce((select public.current_app_role())::text, '') not in ('admin', 'manager') then
    raise exception 'Accès réservé à l''équipe.';
  end if;
  select * into v_space from public.spaces where id = p_space_id;
  if not found then
    raise exception 'Espace introuvable.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'start_at', r.start_at, 'end_at', r.end_at, 'seats', r.seats,
           'member', m.full_name) order by r.start_at), '[]'::jsonb)
  into v_conflicts
  from public.reservations r
  join public.members m on m.id = r.member_id
  where r.space_id = p_space_id
    and r.status = 'confirmed'
    and r.start_at < p_end
    and r.end_at > p_start;

  if v_space.booking_mode = 'seats' then
    select coalesce(max(load), 0) into v_peak
    from (
      select (
        select coalesce(sum(r.seats), 0) from public.reservations r
        where r.space_id = p_space_id and r.status = 'confirmed'
          and r.start_at <= t.at and r.end_at > t.at
      ) as load
      from (
        select p_start as at
        union
        select r.start_at from public.reservations r
        where r.space_id = p_space_id and r.status = 'confirmed'
          and r.start_at > p_start and r.start_at < p_end
      ) as t
    ) as loads;
  end if;

  return jsonb_build_object(
    'mode', v_space.booking_mode,
    'active', v_space.is_active,
    'capacity', v_space.capacity,
    'peak', v_peak,
    'free', case when v_space.booking_mode = 'seats'
                 then greatest(v_space.capacity - v_peak, 0)
                 else case when jsonb_array_length(v_conflicts) = 0 then v_space.capacity else 0 end end,
    'available', v_space.is_active and case
                   when v_space.booking_mode = 'seats'
                     then p_seats <= v_space.capacity and v_peak + p_seats <= v_space.capacity
                   else jsonb_array_length(v_conflicts) = 0 and p_seats <= v_space.capacity end,
    'conflicts', v_conflicts
  );
end;
$$;

-- 3. Accepter une demande : membre (trouvé ou créé) + réservation confirmée ----
create or replace function public.accept_booking_request(
  p_request_id uuid,
  p_price_amount integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_req public.booking_requests;
  v_space public.spaces;
  v_member_id uuid;
  v_member_created boolean := false;
  v_reservation_id uuid;
  v_digits text;
begin
  if coalesce((select public.current_app_role())::text, '') not in ('admin', 'manager') then
    raise exception 'Accès réservé à l''équipe.';
  end if;

  select * into v_req from public.booking_requests where id = p_request_id for update;
  if not found then
    raise exception 'Demande introuvable.';
  end if;
  if v_req.status not in ('new', 'contacted') then
    raise exception 'Cette demande a déjà été traitée.';
  end if;
  if p_price_amount is not null and p_price_amount < 0 then
    raise exception 'Montant invalide.';
  end if;

  select * into v_space from public.spaces where id = v_req.space_id;
  if not v_space.is_active then
    raise exception 'Cet espace est désactivé.';
  end if;
  if v_space.booking_mode = 'whole' and v_req.people > v_space.capacity then
    raise exception 'Capacité insuffisante : cet espace accueille % personne(s) maximum.', v_space.capacity;
  end if;

  -- Membre existant avec le même numéro (9 derniers chiffres), sinon création.
  v_digits := right(regexp_replace(v_req.phone, '[^0-9]', '', 'g'), 9);
  select m.id into v_member_id
  from public.members m
  where length(v_digits) = 9
    and right(regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g'), 9) = v_digits
  order by m.is_active desc, m.created_at
  limit 1;

  if v_member_id is null then
    insert into public.members (full_name, phone, email)
    values (v_req.full_name, v_req.phone, nullif(trim(coalesce(v_req.email, '')), ''))
    returning id into v_member_id;
    v_member_created := true;
  end if;

  -- La vérification des places / chevauchements est faite par le déclencheur
  -- validate_reservation_capacity : en cas de conflit, rien n'est enregistré.
  insert into public.reservations (member_id, space_id, start_at, end_at, status, seats, price_amount, notes, created_by)
  values (
    v_member_id,
    v_req.space_id,
    (v_req.desired_date + v_req.start_time) at time zone 'Africa/Dakar',
    (v_req.desired_date + v_req.end_time) at time zone 'Africa/Dakar',
    'confirmed',
    case when v_space.booking_mode = 'seats' then v_req.people else 1 end,
    p_price_amount,
    'Demande en ligne' || coalesce(' : ' || nullif(trim(v_req.message), ''), ''),
    auth.uid()
  )
  returning id into v_reservation_id;

  update public.booking_requests
  set status = 'converted',
      reservation_id = v_reservation_id,
      member_id = v_member_id,
      decline_reason = null,
      handled_by = auth.uid(),
      handled_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'reservation_id', v_reservation_id,
    'member_id', v_member_id,
    'member_created', v_member_created
  );
end;
$$;

revoke all on function public.space_availability(uuid, timestamptz, timestamptz, integer) from public;
revoke all on function public.accept_booking_request(uuid, integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.space_availability(uuid, timestamptz, timestamptz, integer) to authenticated;
    grant execute on function public.accept_booking_request(uuid, integer) to authenticated;
  end if;
end;
$$;

commit;
