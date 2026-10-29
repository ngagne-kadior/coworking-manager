-- =====================================================================
-- Étape 2 — Statuts automatiques et règles de transition
-- =====================================================================
-- À exécuter UNE FOIS dans Supabase > SQL Editor.
--
-- Corrige :
-- 1. Une demande non confirmée restait « pending » pour toujours, et une
--    réservation terminée restait « confirmed » : le trigger qui protège
--    les réservations passées bloquait aussi ces mises à jour de statut.
-- 2. Les transitions de statut n'étaient pas encadrées (ex. : une
--    réservation annulée pouvait repasser « en attente »).
-- 3. created_by n'était jamais rempli.
-- 4. deactivate_member n'avait pas de search_path fixé (alerte Supabase).
-- =====================================================================

begin;

-- 1. Protection des réservations passées : autorise uniquement les
--    passages automatiques pending → expired et confirmed → completed,
--    sans aucune autre modification de la ligne.
create or replace function public.prevent_past_reservation_changes()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if old.start_at <= now() then
    if tg_op = 'UPDATE'
       and (
         (old.status = 'pending' and new.status = 'expired')
         or (old.status = 'confirmed' and new.status = 'completed')
       )
       and (new.member_id, new.space_id, new.start_at, new.end_at,
            new.notes, new.expires_at, new.created_by)
           is not distinct from
           (old.member_id, old.space_id, old.start_at, old.end_at,
            old.notes, old.expires_at, old.created_by)
    then
      return new;
    end if;

    raise exception
      'Une réservation passée ou déjà commencée ne peut plus être modifiée ou supprimée.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

-- 2. Transitions de statut autorisées :
--    pending   → confirmed | cancelled | expired (si délai dépassé)
--    confirmed → cancelled | completed (si terminée)
--    cancelled, completed, expired → définitifs
create or replace function public.enforce_reservation_status_transition()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'pending' and new.status in ('confirmed', 'cancelled') then
    return new;
  end if;

  if old.status = 'pending' and new.status = 'expired' then
    if (old.expires_at is not null and old.expires_at <= now())
       or old.start_at <= now() then
      return new;
    end if;
    raise exception 'Cette demande n''est pas encore expirée.';
  end if;

  if old.status = 'confirmed' and new.status = 'cancelled' then
    return new;
  end if;

  if old.status = 'confirmed' and new.status = 'completed' then
    if old.end_at <= now() then
      return new;
    end if;
    raise exception 'Cette réservation n''est pas encore terminée.';
  end if;

  raise exception 'Changement de statut non autorisé : % → %.',
    old.status, new.status;
end;
$$;

drop trigger if exists enforce_reservation_status_transition on public.reservations;
create trigger enforce_reservation_status_transition
  before update of status on public.reservations
  for each row execute function public.enforce_reservation_status_transition();

-- 3. Mise à jour automatique des statuts (appelée par pg_cron).
--    SECURITY DEFINER : s'exécute avec les droits du propriétaire.
--    Personne ne peut l'appeler depuis l'application.
create or replace function public.refresh_reservation_statuses()
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.reservations
  set status = 'expired'
  where status = 'pending'
    and ((expires_at is not null and expires_at <= now()) or start_at <= now());

  update public.reservations
  set status = 'completed'
  where status = 'confirmed'
    and end_at <= now();
end;
$$;

revoke all on function public.refresh_reservation_statuses() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.refresh_reservation_statuses() from anon, authenticated;
  end if;
end;
$$;

-- 4. Auteur de la réservation rempli automatiquement.
alter table public.reservations
  alter column created_by set default auth.uid();

-- 5. search_path fixé sur deactivate_member (le corps n'utilise que
--    des noms qualifiés public.*, il n'est pas modifié).
alter function public.deactivate_member(uuid) set search_path to '';

-- Rattrapage immédiat des statuts bloqués.
select public.refresh_reservation_statuses();

commit;

-- =====================================================================
-- 6. Planification toutes les 5 minutes (pg_cron)
-- =====================================================================
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'refresh-reservation-statuses',
  '*/5 * * * *',
  $$select public.refresh_reservation_statuses();$$
);
