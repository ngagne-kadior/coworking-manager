# 03 — Architecture technique

## 1. Objectif
Définir une architecture simple, maintenable et sécurisée pour l'application interne Coworking Manager.

## 2. Technologies
- Next.js App Router pour l'application web.
- React et TypeScript pour l'interface et la logique applicative.
- Tailwind CSS pour le style.
- Supabase Auth pour l'authentification.
- Supabase Database pour les données.
- Supabase Storage pour les fichiers et photos nécessaires.
- Git et GitHub pour le versionnement.
- Vercel pour l'hébergement.

Les versions réellement installées dans le projet doivent être vérifiées dans `package.json` et le fichier de verrouillage avant toute mise à jour.

## 3. Principes d'architecture
- Utiliser TypeScript et des types explicites.
- Séparer les composants d'interface, les règles métier et l'accès aux données.
- Réutiliser les composants communs lorsque cela améliore la cohérence.
- Gérer les états de chargement, les erreurs et les formulaires invalides.
- Concevoir une interface responsive et accessible.

## 4. Authentification et autorisations
- Utiliser Supabase Auth pour l'authentification.
- Définir clairement les rôles administrateur et gestionnaire.
- Vérifier les autorisations sur le serveur pour chaque opération protégée.
- Appliquer des politiques RLS adaptées aux tables concernées.
- Ne jamais exposer une clé de service ou une clé secrète dans le navigateur.
- Les variables publiques doivent être limitées aux valeurs prévues pour un usage client.

## 5. Données et intégrité
- Définir un schéma explicite pour les membres, espaces, réservations, profils utilisateurs et événements d'historique.
- Ajouter les contraintes et index nécessaires.
- Garantir l'absence de chevauchement des réservations confirmées au niveau base de données ou via une opération transactionnelle sûre.
- Ne pas se reposer uniquement sur une vérification faite dans l'interface.
- Prévoir les migrations SQL et les tester avant utilisation en production.

## 6. Fichiers et stockage
- Utiliser Supabase Storage uniquement lorsque le projet nécessite des fichiers ou photos.
- Restreindre les accès aux fichiers selon les besoins et les rôles.
- Valider les types et tailles de fichiers téléversés.

## 7. Qualité et tests
- Tester chaque fonctionnalité avant de la considérer terminée.
- Tester les permissions des deux rôles.
- Tester les cas limites de réservation et les requêtes simultanées.
- Exécuter les vérifications TypeScript et lint prévues par le projet.
- Ne pas corriger une alerte de dépendance par une mise à jour majeure forcée sans analyser l'impact.

## 8. Déploiement
- Versionner le code avec Git et GitHub.
- Configurer les variables d'environnement dans l'environnement d'hébergement.
- Déployer sur Vercel après vérification des tests et de la configuration Supabase.
- Ne jamais inclure de secrets dans Git.

## 9. Décisions à documenter
Toute modification importante de la pile technique, des permissions, du schéma de données ou du déploiement doit être documentée avant son application.
