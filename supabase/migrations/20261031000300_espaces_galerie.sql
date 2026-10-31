-- =====================================================================
-- Espaces : caractéristiques et galerie de photos (5 max par espace)
-- =====================================================================
-- À exécuter UNE FOIS dans Supabase > SQL Editor (après le SQL des abonnements).
--
-- - spaces : type d'espace, surface (m²), emplacement, équipements.
-- - space_photos : galerie de 5 photos maximum par espace (limite garantie
--   par la base). spaces.photo_path reste la photo de couverture, utilisée
--   par le calendrier et le tableau de bord.
-- - Les photos de couverture déjà enregistrées sont reprises dans la galerie.
-- =====================================================================

begin;

alter table public.spaces add column if not exists space_type text;
alter table public.spaces add column if not exists area_m2 integer;
alter table public.spaces add column if not exists location text;
alter table public.spaces add column if not exists amenities text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'spaces_area_m2_check') then
    alter table public.spaces add constraint spaces_area_m2_check check (area_m2 is null or area_m2 > 0);
  end if;
end;
$$;

create table if not exists public.space_photos (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id),
  path text not null unique,
  position integer not null default 0,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists space_photos_space_idx on public.space_photos (space_id, position);

alter table public.space_photos enable row level security;

drop policy if exists "Staff can read space photos" on public.space_photos;
create policy "Staff can read space photos" on public.space_photos
  for select to authenticated
  using ((select public.current_app_role()) in ('admin', 'manager'));

drop policy if exists "Staff can add space photos" on public.space_photos;
create policy "Staff can add space photos" on public.space_photos
  for insert to authenticated
  with check ((select public.current_app_role()) in ('admin', 'manager'));

drop policy if exists "Staff can reorder space photos" on public.space_photos;
create policy "Staff can reorder space photos" on public.space_photos
  for update to authenticated
  using ((select public.current_app_role()) in ('admin', 'manager'))
  with check ((select public.current_app_role()) in ('admin', 'manager'));

drop policy if exists "Staff can delete space photos" on public.space_photos;
create policy "Staff can delete space photos" on public.space_photos
  for delete to authenticated
  using ((select public.current_app_role()) in ('admin', 'manager'));

-- 5 photos maximum par espace (verrou sur l'espace : pas de dépassement
-- même si deux personnes ajoutent une photo au même moment)
create or replace function public.limit_space_photos()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform 1 from public.spaces where id = new.space_id for update;
  if (select count(*) from public.space_photos where space_id = new.space_id) >= 5 then
    raise exception 'Un espace peut avoir 5 photos au maximum. Supprime une photo avant d''en ajouter une.';
  end if;
  return new;
end;
$$;

drop trigger if exists limit_space_photos on public.space_photos;
create trigger limit_space_photos
  before insert on public.space_photos
  for each row execute function public.limit_space_photos();

-- Reprise des photos de couverture existantes dans la galerie
insert into public.space_photos (space_id, path, position, created_by)
select s.id, s.photo_path, 0, null
from public.spaces s
where s.photo_path is not null
on conflict (path) do nothing;

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
  elsif tg_table_name in ('space_rates', 'space_photos') then
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




drop trigger if exists audit_space_photos on public.space_photos;
create trigger audit_space_photos
  after insert or update or delete on public.space_photos
  for each row execute function public.write_audit_log();

commit;
