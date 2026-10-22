# 01 — Cadrage du projet Coworking Manager

## 1. Présentation
Coworking Manager est une application web interne destinée à faciliter la gestion quotidienne d'un espace de coworking. Le personnel autorisé y gère les membres, les espaces et les réservations, et consulte les informations de suivi.

L'application doit être simple à utiliser, sécurisée et adaptée aux ordinateurs, tablettes et téléphones.

## 2. Objectifs
- Centraliser les informations de gestion.
- Simplifier la gestion des membres.
- Organiser les espaces et leurs disponibilités.
- Créer, consulter et gérer les réservations.
- Éviter les chevauchements de réservations confirmées pour un même espace.
- Contrôler les accès selon le rôle de chaque utilisateur.
- Conserver un historique des actions importantes.
- Faciliter le suivi de l'activité avec un tableau de bord.

## 3. Utilisateurs et rôles

### Administrateur
Peut gérer les comptes utilisateurs et les rôles, les membres, les espaces, les réservations, le tableau de bord et l'historique.

### Gestionnaire
Peut gérer les membres, les espaces et les réservations, consulter le tableau de bord et l'historique. Il ne peut pas gérer les comptes utilisateurs ni modifier les rôles.

## 4. Fonctionnalités prévues
- Authentification et contrôle des permissions.
- Gestion des membres : création, recherche, modification, activation et désactivation.
- Gestion des espaces : création, modification, capacité, activation et désactivation.
- Gestion des réservations : création, consultation, modification et annulation selon les règles.
- Tableau de bord basé sur les données réelles.
- Historique des actions importantes.
- Gestion des comptes utilisateurs réservée à l'administrateur.

## 5. Sécurité
- Ne jamais stocker les mots de passe en clair.
- Ne jamais exposer les clés secrètes dans le navigateur.
- Vérifier les droits côté serveur et dans la base de données lorsque cela s'applique.
- Protéger les données avec les politiques de sécurité adaptées.
- Masquer un bouton ne remplace pas une vérification d'autorisation.
- Désactiver les données plutôt que les supprimer définitivement lorsque les règles le prévoient.

## 6. Technologies prévues
- Next.js avec App Router
- React et TypeScript
- Tailwind CSS
- Supabase Auth et base de données
- Supabase Storage
- Git et GitHub
- Vercel

## 7. Périmètre de la première version
La première version couvre la gestion interne des membres, espaces, réservations, comptes et rôles, tableau de bord et historique. Les paiements en ligne et le portail public client sont exclus du MVP.

## 8. Méthode de développement
- Développer une fonctionnalité à la fois.
- Examiner les fichiers avant modification.
- Tester chaque fonctionnalité.
- Corriger les erreurs fonctionnelles et de sécurité avant validation.
- Ne pas supprimer ni remplacer des fichiers sans nécessité.
- Documenter les décisions importantes.

## 9. Points à préciser
- Informations à enregistrer pour un membre.
- Types d'espaces et capacités.
- Horaires d'ouverture et créneaux de réservation.
- Statuts des réservations.
- Règles de modification et d'annulation.
- Indicateurs du tableau de bord.
- Actions à conserver dans l'historique.
