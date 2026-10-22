# 04 — Plan de développement

## Principe
Construire le logiciel progressivement, une fonctionnalité à la fois. Chaque étape doit être testée et validée avant de commencer la suivante.

## Phase 1 — Préparation
- [ ] Vérifier la structure actuelle du projet Next.js.
- [ ] Vérifier `AGENTS.md` et les documents de cadrage.
- [ ] Vérifier les scripts de test, de lint et de compilation.
- [ ] Examiner les alertes de dépendances sans appliquer de mise à jour majeure forcée.

## Phase 2 — Conception des données et de la sécurité
- [ ] Définir les tables et relations.
- [ ] Définir les rôles et les permissions.
- [ ] Préparer les politiques RLS.
- [ ] Définir la stratégie empêchant les chevauchements de réservations confirmées.
- [ ] Préparer et relire les migrations SQL.

## Phase 3 — Authentification
- [ ] Configurer le projet Supabase.
- [ ] Configurer les variables d'environnement.
- [ ] Implémenter la connexion et la déconnexion.
- [ ] Protéger les pages internes.
- [ ] Tester les accès autorisés et refusés.

## Phase 4 — Gestion des membres
- [ ] Créer la liste des membres.
- [ ] Ajouter la recherche.
- [ ] Ajouter la création et la modification.
- [ ] Ajouter l'activation et la désactivation.
- [ ] Tester les validations et les permissions.

## Phase 5 — Gestion des espaces
- [ ] Créer la liste des espaces.
- [ ] Ajouter la création et la modification.
- [ ] Ajouter la capacité et les informations utiles.
- [ ] Ajouter l'activation et la désactivation.
- [ ] Vérifier qu'un espace désactivé ne peut pas être réservé.

## Phase 6 — Gestion des réservations
- [ ] Définir les statuts et transitions.
- [ ] Créer le formulaire de réservation.
- [ ] Afficher les réservations.
- [ ] Contrôler les dates et heures.
- [ ] Garantir l'absence de chevauchement des réservations confirmées.
- [ ] Tester les requêtes concurrentes.
- [ ] Appliquer les règles de modification et d'annulation.

## Phase 7 — Tableau de bord et historique
- [ ] Définir les indicateurs et leurs formules.
- [ ] Afficher les indicateurs issus des données réelles.
- [ ] Enregistrer les actions importantes.
- [ ] Permettre la consultation de l'historique.
- [ ] Vérifier que l'historique ne peut pas être modifié par les utilisateurs de l'application.

## Phase 8 — Comptes et rôles
- [ ] Créer l'interface de gestion des comptes réservée à l'administrateur.
- [ ] Permettre l'attribution des rôles autorisés.
- [ ] Tester qu'un gestionnaire ne peut pas gérer les comptes.

## Phase 9 — Validation et déploiement
- [ ] Tester les principaux parcours.
- [ ] Vérifier les permissions et les politiques RLS.
- [ ] Vérifier l'affichage sur ordinateur, tablette et téléphone.
- [ ] Exécuter les vérifications de code et de compilation.
- [ ] Préparer GitHub.
- [ ] Configurer Vercel et les variables d'environnement.
- [ ] Effectuer une validation finale.

## Règle de validation
Une fonctionnalité n'est terminée que lorsque son comportement normal, ses erreurs attendues et ses permissions ont été testés.
