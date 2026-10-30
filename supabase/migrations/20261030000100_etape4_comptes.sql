-- =====================================================================
-- Étape 4 — Comptes utilisateurs et rôles
-- =====================================================================
-- À exécuter UNE FOIS dans Supabase > SQL Editor (après l'étape 3).
--
-- - profiles.is_active : un compte désactivé perd immédiatement l'accès
--   aux données (current_app_role renvoie null).
-- - Fonctions réservées à l'admin, appelées avec SA session : l'historique
--   enregistre donc le vrai auteur de chaque action.
-- - Règles garanties par la base :
--   * seul un admin gère les comptes ;
--   * un admin ne peut ni se rétrograder ni se désactiver ;
--   * il reste toujours au moins un admin actif.
-- =====================================================================

begin;

alter table public.profiles
  add column if not exists is_active boolean not null default true;

-- Un compte désactivé n'a plus de rôle => le RLS bloque tout.
create or replace function public.current_app_role()
returns public.app_role
language sql
stable security definer
set search_path to ''
as $$
  select p.role
  from public.profiles as p
  where p.id = (select auth.uid())
    and p.is_active
  limit 1;
$$;

-- Vérification commune -------------------------------------------------
create or replace function public.require_admin()
returns void
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if public.current_app_role() is distinct from 'admin' then
    raise exception 'Action réservée à l''administrateur.'
      using errcode = '42501';
  end if;
end;
$$;

-- Création du profil d'un compte qui vient d'être créé ------------------
create or replace function public.admin_create_profile(
  p_id uuid,
  p_full_name text,
  p_role public.app_role
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform public.require_admin();

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Le nom est obligatoire.';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_id) then
    raise exception 'Compte de connexion introuvable.';
  end if;

  insert into public.profiles (id, full_name, role, is_active)
  values (p_id, trim(p_full_name), p_role, true);
end;
$$;

-- Modification du nom et du rôle ----------------------------------------
create or replace function public.admin_update_profile(
  p_id uuid,
  p_full_name text,
  p_role public.app_role
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_current public.profiles;
begin
  perform public.require_admin();

  select * into v_current from public.profiles where id = p_id for update;
  if not found then
    raise exception 'Compte introuvable.';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Le nom est obligatoire.';
  end if;

  if p_id = auth.uid() and p_role <> 'admin' then
    raise exception 'Tu ne peux pas retirer ton propre rôle d''administrateur.';
  end if;

  if v_current.role = 'admin' and p_role <> 'admin'
     and (select count(*) from public.profiles
          where role = 'admin' and is_active and id <> p_id) = 0 then
    raise exception 'Il doit rester au moins un administrateur actif.';
  end if;

  update public.profiles
  set full_name = trim(p_full_name), role = p_role
  where id = p_id;
end;
$$;

-- Activation / désactivation --------------------------------------------
create or replace function public.admin_set_profile_active(
  p_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_current public.profiles;
begin
  perform public.require_admin();

  select * into v_current from public.profiles where id = p_id for update;
  if not found then
    raise exception 'Compte introuvable.';
  end if;

  if p_id = auth.uid() and not p_active then
    raise exception 'Tu ne peux pas désactiver ton propre compte.';
  end if;

  if not p_active and v_current.role = 'admin'
     and (select count(*) from public.profiles
          where role = 'admin' and is_active and id <> p_id) = 0 then
    raise exception 'Il doit rester au moins un administrateur actif.';
  end if;

  update public.profiles set is_active = p_active where id = p_id;
end;
$$;

-- Trace d'une réinitialisation de mot de passe --------------------------
-- (le mot de passe lui-même n'est jamais enregistré)
create or replace function public.admin_log_password_reset(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_admin_name text;
  v_target_name text;
begin
  perform public.require_admin();

  select full_name into v_target_name from public.profiles where id = p_id;
  if not found then
    raise exception 'Compte introuvable.';
  end if;

  select full_name into v_admin_name from public.profiles where id = auth.uid();

  insert into public.audit_log
    (actor_id, actor_name, table_name, record_id, record_label, action)
  values
    (auth.uid(), coalesce(v_admin_name, 'Utilisateur inconnu'),
     'profiles', p_id, v_target_name, 'password_reset');
end;
$$;

-- Droits : uniquement les utilisateurs connectés (la fonction vérifie
-- ensuite le rôle admin). Personne d'anonyme ne peut les appeler.
revoke all on function public.require_admin() from public;
revoke all on function public.admin_create_profile(uuid, text, public.app_role) from public;
revoke all on function public.admin_update_profile(uuid, text, public.app_role) from public;
revoke all on function public.admin_set_profile_active(uuid, boolean) from public;
revoke all on function public.admin_log_password_reset(uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.require_admin() to authenticated;
    grant execute on function public.admin_create_profile(uuid, text, public.app_role) to authenticated;
    grant execute on function public.admin_update_profile(uuid, text, public.app_role) to authenticated;
    grant execute on function public.admin_set_profile_active(uuid, boolean) to authenticated;
    grant execute on function public.admin_log_password_reset(uuid) to authenticated;
  end if;
end;
$$;

commit;
