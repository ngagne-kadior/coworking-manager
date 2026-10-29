import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Les variables de connexion Supabase sont absentes. Vérifie le fichier .env.local."
  );
}

// Client navigateur : la session est stockée dans des cookies,
// ce qui permet au fichier src/proxy.ts de la lire côté serveur.
export const supabase = createBrowserClient(supabaseUrl, supabaseKey);
