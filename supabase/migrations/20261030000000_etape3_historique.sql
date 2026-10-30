-- =====================================================================
-- Étape 3 — Historique des actions (audit_log)
-- =====================================================================
-- À exécuter UNE FOIS dans Supabase > SQL Editor.
--
-- - Chaque création / modification / activation / désactivation /
--   changement de statut sur members, spaces, reservations et profiles
--   est enregistrée automatiquement par la base (triggers).
-- - L'historique est lisible par les rôles admin et manager.
-- - Personne ne peut le modifier ni le supprimer, même depuis le
--   SQL Editor (trigger de protection).
-- =====================================================================

begin;

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,                 -- null = action automatique du système
  actor_name text not null,      -- nom figé au moment de l'action
  table_name text not null,
  record_id uuid,
  record_label text,             -- ex. nom du membre, de l'espace
  action text not null,          -- create | update | activate | deactivate | status | delete
  changed_fields text[] not null default '{}',
  old_data jsonb,
  new_data jsonb
);

create index if not exists audit_log_occurred_at_idx
  on public.audit_log (occurred_at desc);
create index if not exists audit_log_table_record_idx
  on public.audit_log (table_name, record_id);
create index if not exists audit_log_actor_idx
  on public.audit_log (actor_id);

-- Fonction d'enregistrement ---------------------------------------------
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
  else
    v_label := coalesce(v_row ->> 'full_name', v_row ->> 'name');
  end if;

  insert into public.audit_log
    (actor_id, actor_name, table_name, record_id, record_label,
     action, changed_fields, old_data, new_data)
  values
    (v_actor, v_actor_name, tg_table_name, (v_row ->> 'id')::uuid, v_label,
     v_action, v_changed, v_old, v_new);

  return coalesce(new, old);
end;
$$;

revoke all on function public.write_audit_log() from public;

-- Triggers (AFTER : seules les actions réellement enregistrées sont tracées)
drop trigger if exists audit_members on public.members;
create trigger audit_members
  after insert or update or delete on public.members
  for each row execute function public.write_audit_log();

drop trigger if exists audit_spaces on public.spaces;
create trigger audit_spaces
  after insert or update or delete on public.spaces
  for each row execute function public.write_audit_log();

drop trigger if exists audit_reservations on public.reservations;
create trigger audit_reservations
  after insert or update or delete on public.reservations
  for each row execute function public.write_audit_log();

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.write_audit_log();

-- Historique non modifiable -------------------------------------------
create or replace function public.prevent_audit_log_changes()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  raise exception 'L''historique des actions ne peut pas être modifié ni supprimé.';
end;
$$;

drop trigger if exists protect_audit_log on public.audit_log;
create trigger protect_audit_log
  before update or delete on public.audit_log
  for each row execute function public.prevent_audit_log_changes();

drop trigger if exists protect_audit_log_truncate on public.audit_log;
create trigger protect_audit_log_truncate
  before truncate on public.audit_log
  for each statement execute function public.prevent_audit_log_changes();

-- Sécurité (RLS) : lecture seule pour admin et manager -----------------
alter table public.audit_log enable row level security;

drop policy if exists "Authorized users can read audit log" on public.audit_log;
create policy "Authorized users can read audit log" on public.audit_log
  for select to authenticated
  using ((select public.current_app_role()) in ('admin', 'manager'));

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;
    grant select on public.audit_log to authenticated;
  end if;
end;
$$;

commit;
