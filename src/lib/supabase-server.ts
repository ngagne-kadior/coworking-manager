import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Client Supabase avec la session de l'utilisateur connecté (cookies).
 * Toutes les règles RLS s'appliquent, et l'historique enregistre
 * cet utilisateur comme auteur des actions.
 */
export async function createUserClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl!, anonKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Appelé depuis un contexte en lecture seule : le proxy
          // se charge de rafraîchir la session.
        }
      },
    },
  });
}

/**
 * Client Supabase « administrateur » (clé service_role).
 * Contourne le RLS : à utiliser UNIQUEMENT côté serveur, après avoir
 * vérifié que l'utilisateur connecté est admin.
 * Le fichier importe "server-only" : le build échoue si ce code
 * est importé par erreur dans une page du navigateur.
 */
export function createAdminClient(): SupabaseClient | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

type AdminContext =
  | {
      ok: true;
      userId: string;
      userClient: Awaited<ReturnType<typeof createUserClient>>;
      adminClient: SupabaseClient;
    }
  | { ok: false; response: NextResponse };

/**
 * Vérifie, côté serveur, que la requête vient d'un admin actif.
 * La vérification est faite par la base (fonction require_admin),
 * pas par l'interface.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const userClient = await createUserClient();

  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) {
    return { ok: false, response: jsonError("Session expirée. Reconnecte-toi.", 401) };
  }

  const { error: roleError } = await userClient.rpc("require_admin");
  if (roleError) {
    return {
      ok: false,
      response: jsonError("Action réservée à l'administrateur.", 403),
    };
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return {
      ok: false,
      response: jsonError(
        "Configuration incomplète : la variable SUPABASE_SERVICE_ROLE_KEY est absente du serveur.",
        500
      ),
    };
  }

  return { ok: true, userId: userData.user.id, userClient, adminClient };
}
