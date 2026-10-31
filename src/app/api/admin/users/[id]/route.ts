import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/supabase-server";
import { isAppRole, passwordProblem } from "@/lib/accounts";

// Durée de blocage « illimitée » côté Supabase Auth (100 ans)
const BAN_FOREVER = "876000h";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body =
  | { action: "update"; full_name?: unknown; role?: unknown }
  | { action: "activate" }
  | { action: "deactivate" }
  | { action: "password"; password?: unknown };

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return jsonError("Compte introuvable.", 404);

  const ctx = await requireAdmin();
  if (!ctx.ok) return ctx.response;

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || typeof body.action !== "string") {
    return jsonError("Requête invalide.", 400);
  }

  switch (body.action) {
    case "update": {
      const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
      if (!fullName) return jsonError("Le nom est obligatoire.", 400);
      if (!isAppRole(body.role)) return jsonError("Rôle invalide.", 400);

      const { error } = await ctx.userClient.rpc("admin_update_profile", {
        p_id: id,
        p_full_name: fullName,
        p_role: body.role,
      });
      if (error) return jsonError(error.message, 400);
      return NextResponse.json({ ok: true });
    }

    case "deactivate": {
      // 1. La base applique les règles (pas soi-même, dernier admin)
      //    et coupe immédiatement l'accès aux données.
      const { error } = await ctx.userClient.rpc("admin_set_profile_active", {
        p_id: id,
        p_active: false,
      });
      if (error) return jsonError(error.message, 400);

      // 2. Bloque aussi la connexion.
      const { error: banError } = await ctx.adminClient.auth.admin.updateUserById(id, {
        ban_duration: BAN_FOREVER,
      });
      if (banError) {
        return NextResponse.json({
          ok: true,
          warning:
            "Compte désactivé (plus aucun accès aux données), mais le blocage de connexion a échoué.",
        });
      }
      return NextResponse.json({ ok: true });
    }

    case "activate": {
      const { error: unbanError } = await ctx.adminClient.auth.admin.updateUserById(id, {
        ban_duration: "none",
      });
      if (unbanError) {
        return jsonError(`Réactivation impossible : ${unbanError.message}`, 400);
      }

      const { error } = await ctx.userClient.rpc("admin_set_profile_active", {
        p_id: id,
        p_active: true,
      });
      if (error) return jsonError(error.message, 400);
      return NextResponse.json({ ok: true });
    }

    case "password": {
      const password = typeof body.password === "string" ? body.password : "";
      const problem = passwordProblem(password);
      if (problem) return jsonError(problem, 400);

      const { error: passwordError } =
        await ctx.adminClient.auth.admin.updateUserById(id, { password });
      if (passwordError) {
        return jsonError(`Réinitialisation impossible : ${passwordError.message}`, 400);
      }

      // Trace dans l'historique (sans le mot de passe)
      await ctx.userClient.rpc("admin_log_password_reset", { p_id: id });
      return NextResponse.json({ ok: true });
    }

    default:
      return jsonError("Action inconnue.", 400);
  }
}
