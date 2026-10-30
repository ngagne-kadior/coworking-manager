-- =====================================================================
-- Réservations créées directement « confirmées »
-- =====================================================================
-- Décision du 29/10/2026 : seul le personnel crée les réservations,
-- l'étape « en attente » + délai d'une heure est supprimée.
-- À exécuter UNE FOIS dans Supabase > SQL Editor.
--
-- Les protections restent actives à la création :
-- membre actif, espace actif, début dans le futur, fin après le début,
-- aucun chevauchement avec une autre réservation confirmée.
-- Les anciens statuts (pending, expired) restent valides pour l'historique.
-- =====================================================================

alter table public.reservations
  alter column status set default 'confirmed';

alter table public.reservations
  alter column expires_at drop default;
