# Coworking Manager

Application web interne de gestion d'un espace de coworking : membres, espaces, réservations et tableau de bord.

## Technologies
Next.js (App Router), React, TypeScript, Tailwind CSS, Supabase (Auth + base de données), Vercel.

## Démarrer en local
1. `npm install`
2. Créer un fichier `.env.local` à la racine :
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
   `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API → clé `service_role`)
   sert uniquement à la page Comptes, côté serveur. Elle ne doit JAMAIS porter
   le préfixe `NEXT_PUBLIC_`.
3. `npm run dev` puis ouvrir http://localhost:3000

## Déploiement
Vercel construit automatiquement chaque commit sur `main`. Les trois variables ci-dessus doivent être définies dans Vercel → Settings → Environment Variables, pour Production, Preview et Development.

## Sécurité
- Toutes les pages sauf `/login` exigent une session (voir `src/proxy.ts`).
- Les données sont protégées par les règles RLS de Supabase (rôles `admin` et `manager`).
- Aucune clé secrète Supabase ne doit être ajoutée avec le préfixe `NEXT_PUBLIC_`.

## Documentation
Cadrage, règles métier, architecture et plan : dossier `docs/`.
