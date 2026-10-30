import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/supabase-server";
import {
  isAppRole,
  isValidEmail,
  passwordProblem,
  type Account,
  type AppRole,
} from "@/lib/accounts";

// Liste des comptes (admin uniquement)
export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx.ok) return ctx.response;

  const { data: profiles, error: profileError } = await ctx.userClient
    .from("profiles")
    .select("id, full_name, role, is_active, created_at")
    .order("full_name");

  if (profileError) {
    return jsonError(`Impossible de charger les comptes : ${profileError.message}`, 500);
  }

  const { data: authData, error: authError } =
    await ctx.adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (authError) {
    return jsonError(`Impossible de charger les e-mails : ${authError.message}`, 500);
  }

  const authById = new Map(authData.users.map((user) => [user.id, user]));

  const accounts: Account[] = (profiles ?? []).map((profile) => {
    const authUser = authById.get(profile.id);
    return {
      id: profile.id,
      full_name: profile.full_name,
      role: profile.role as AppRole,
      is_active: profile.is_active,
      email: authUser?.email ?? null,
      last_sign_in_at: authUser?.last_sign_in_at ?? null,
      created_at: profile.created_at,
      is_me: profile.id === ctx.userId,
    };
  });

  return NextResponse.json({ accounts });
}

// Création d'un compte avec mot de passe provisoire (admin uniquement)
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx.ok) return ctx.response;

  const body = (await request.json().catch(() => null)) as {
    full_name?: unknown;
    email?: unknown;
    role?: unknown;
    password?: unknown;
  } | null;

  const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const role = body?.role;

  if (!fullName) return jsonError("Le nom est obligatoire.", 400);
  if (!isValidEmail(email)) return jsonError("Adresse e-mail invalide.", 400);
  if (!isAppRole(role)) return jsonError("Rôle invalide.", 400);
  const problem = passwordProblem(password);
  if (problem) return jsonError(problem, 400);

  // 1. Compte de connexion (e-mail considéré comme confirmé)
  const { data: created, error: createError } =
    await ctx.adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError || !created.user) {
    const message = createError?.message ?? "";
    if (/already|registered|exists/i.test(message)) {
      return jsonError("Un compte existe déjà avec cet e-mail.", 409);
    }
    return jsonError(`Création impossible : ${message}`, 400);
  }

  // 2. Profil, créé avec la session de l'admin (=> historique correct)
  const { error: profileError } = await ctx.userClient.rpc("admin_create_profile", {
    p_id: created.user.id,
    p_full_name: fullName,
    p_role: role,
  });

  if (profileError) {
    // Annule le compte de connexion pour ne pas laisser de compte orphelin
    await ctx.adminClient.auth.admin.deleteUser(created.user.id);
    return jsonError(`Création impossible : ${profileError.message}`, 400);
  }

  return NextResponse.json({ id: created.user.id }, { status: 201 });
}
