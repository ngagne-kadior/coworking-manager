# 02 — Règles métier

## 1. Rôles et permissions
### Administrateur
- Gérer les comptes utilisateurs et les rôles.
- Gérer les membres, espaces et réservations.
- Consulter le tableau de bord et l'historique.

### Gestionnaire
- Gérer les membres, espaces et réservations.
- Consulter le tableau de bord et l'historique.
- Ne pas créer, supprimer ni modifier les comptes utilisateurs ou les rôles.

Les permissions doivent être contrôlées côté serveur et, lorsque cela est pertinent, dans Supabase. Le contrôle de l'interface seul ne suffit pas.

## 2. Membres
- Un membre peut être actif ou inactif.
- Un membre inactif ne peut pas effectuer de nouvelle réservation.
- Les informations historiques d'un membre doivent rester cohérentes si son compte est désactivé.
- La suppression définitive d'un membre n'est pas prévue dans le fonctionnement normal.

## 3. Espaces
- Un espace contient au minimum un nom et un statut.
- Sa capacité et ses autres caractéristiques doivent pouvoir être définies.
- Un espace désactivé ne peut pas recevoir de nouvelle réservation.
- La désactivation ne doit pas effacer l'historique des réservations existantes.

## 4. Réservations
- Une réservation concerne un membre, un espace, une date et une heure de début et de fin.
- L'heure de fin doit être postérieure à l'heure de début.
- Une réservation ne peut pas être créée pour un membre inactif.
- Une réservation ne peut pas être créée pour un espace désactivé.
- Seules les réservations confirmées bloquent un créneau.
- Deux réservations confirmées pour le même espace ne doivent jamais se chevaucher.
- La vérification des chevauchements doit être garantie côté serveur/base de données afin d'éviter les conflits en cas de requêtes simultanées.
- Une réservation passée ne peut plus être modifiée ni annulée.
- Les statuts et transitions autorisés devront être définis avant l'implémentation.

## 5. Définition d'un chevauchement
Deux réservations du même espace se chevauchent si le début de l'une est antérieur à la fin de l'autre et si sa fin est postérieure au début de l'autre.

Deux réservations consécutives, par exemple 10 h–11 h et 11 h–12 h, ne se chevauchent pas.

## 6. Historique
- Enregistrer les actions importantes, notamment les créations et modifications sensibles.
- Conserver l'identité de l'utilisateur qui a effectué l'action, la date et la nature de l'action lorsque ces informations sont disponibles.
- L'historique peut être consulté par les utilisateurs autorisés.
- L'historique ne peut pas être modifié ou supprimé depuis l'application.

## 7. Tableau de bord
- Tous les indicateurs doivent provenir des données enregistrées.
- Les filtres et périodes utilisés doivent être clairs.
- Ne jamais afficher de chiffres inventés.
- Les règles de calcul des indicateurs seront documentées avant leur implémentation.

## 8. Points à confirmer
- Les statuts exacts d'une réservation.
- Les règles de confirmation et d'annulation.
- Les horaires et durées minimales ou maximales.
- Le fuseau horaire de référence.
- Les règles de réservation récurrente, si cette fonction est nécessaire.
