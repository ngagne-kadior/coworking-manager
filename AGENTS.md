# Coworking Manager — Instructions du projet

## Objectif
Développer une application web interne de gestion d'un espace de coworking.

## Technologies
- Next.js avec App Router
- React et TypeScript
- Tailwind CSS
- Supabase pour l'authentification et la base de données
- Supabase Storage pour les photos
- GitHub pour le versionnement
- Vercel pour le déploiement

## Méthode de travail
- Développer une fonctionnalité à la fois.
- Examiner les fichiers existants avant toute modification.
- Expliquer les changements avant de les appliquer.
- Ne jamais remplacer un fichier complet sans nécessité.
- Tester chaque fonctionnalité avant de la considérer terminée.
- Ne pas supprimer de données ou de fichiers sans autorisation.

## Sécurité
- Ne jamais exposer la clé secrète Supabase ou une clé de service dans le navigateur.
- Vérifier les permissions côté serveur.
- Utiliser les politiques RLS de Supabase pour protéger les données.
- Ne pas considérer le masquage d'un bouton comme une protection suffisante.
- Ne jamais stocker les mots de passe en clair.

## Règles métier essentielles
- Un espace désactivé ne peut pas être réservé.
- Un membre inactif ne peut pas effectuer de nouvelle réservation.
- Seules les réservations confirmées bloquent les créneaux.
- Deux réservations confirmées d'un même espace ne peuvent pas se chevaucher.
- Une réservation passée ne peut plus être modifiée ni annulée.
- L'historique des actions est consultable mais ne peut pas être modifié ou supprimé depuis l'application.
- Les membres et les espaces sont désactivés plutôt que supprimés définitivement.

## Qualité
- Utiliser TypeScript avec des types explicites.
- Prévoir une interface responsive et accessible.
- Gérer les erreurs et les états de chargement.
- Ne pas inventer de données réelles ni de statistiques.
- Ne pas ajouter de module de paiement dans cette première version.