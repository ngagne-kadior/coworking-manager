"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import {
  MIN_PASSWORD_LENGTH,
  ROLE_LABELS,
  type Account,
  type AppRole,
} from "@/lib/accounts";

type LoadResult =
  | { kind: "ok"; accounts: Account[] }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

type Credentials = { email: string; password: string; label: string };

const TIME_ZONE = "Africa/Dakar";

async function readError(response: Response) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? `Erreur inattendue (${response.status}).`;
}

async function fetchAccounts(): Promise<LoadResult> {
  try {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    if (response.status === 403) return { kind: "forbidden" };
    if (!response.ok) return { kind: "error", message: await readError(response) };
    const data = (await response.json()) as { accounts: Account[] };
    return { kind: "ok", accounts: data.accounts };
  } catch {
    return { kind: "error", message: "Impossible de joindre le serveur." };
  }
}

async function patchAccount(id: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/admin/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { error: await readError(response), warning: "" };
  const data = (await response.json().catch(() => ({}))) as { warning?: string };
  return { error: "", warning: data.warning ?? "" };
}

// Mot de passe provisoire lisible (sans 0/O, 1/l/I)
function generatePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint32Array(12);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => chars[v % chars.length]).join("");
}

function formatDate(value: string | null) {
  if (!value) return "Jamais";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(new Date(value));
}

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-600";

export default function UtilisateursPage() {
  const router = useRouter();

  const [requestId, setRequestId] = useState(1);
  const [loadedId, setLoadedId] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  // Création
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("manager");
  const [newPassword, setNewPassword] = useState(generatePassword);
  const [creating, setCreating] = useState(false);

  // Modification
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<AppRole>("manager");

  const loading = loadedId !== requestId;

  useEffect(() => {
    let active = true;
    fetchAccounts().then((data) => {
      if (!active) return;
      setResult(data);
      setLoadedId(requestId);
    });
    return () => {
      active = false;
    };
  }, [requestId]);

  function reload() {
    setRequestId((id) => id + 1);
  }

  function resetMessages() {
    setError("");
    setSuccess("");
    setCredentials(null);
  }

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetMessages();
    setCreating(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: newName,
          email: newEmail,
          role: newRole,
          password: newPassword,
        }),
      });

      if (!response.ok) {
        setError(await readError(response));
        return;
      }

      setCredentials({
        email: newEmail.trim().toLowerCase(),
        password: newPassword,
        label: `Compte créé pour ${newName.trim()}`,
      });
      setNewName("");
      setNewEmail("");
      setNewRole("manager");
      setNewPassword(generatePassword());
      reload();
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setCreating(false);
    }
  }

  async function runAction(
    account: Account,
    body: Record<string, unknown>,
    successMessage: string
  ) {
    resetMessages();
    setBusyId(account.id);
    const { error: actionError, warning } = await patchAccount(account.id, body);
    setBusyId(null);

    if (actionError) {
      setError(actionError);
      return false;
    }
    setSuccess(warning || successMessage);
    reload();
    return true;
  }

  async function saveEdit(account: Account) {
    const done = await runAction(
      account,
      { action: "update", full_name: editName, role: editRole },
      `Compte de ${editName.trim()} mis à jour.`
    );
    if (done) setEditingId(null);
  }

  async function toggleActive(account: Account) {
    if (
      account.is_active &&
      !window.confirm(
        `Désactiver le compte de ${account.full_name} ? Cette personne ne pourra plus se connecter.`
      )
    ) {
      return;
    }
    await runAction(
      account,
      { action: account.is_active ? "deactivate" : "activate" },
      account.is_active
        ? `Compte de ${account.full_name} désactivé.`
        : `Compte de ${account.full_name} réactivé.`
    );
  }

  async function resetPassword(account: Account) {
    if (
      !window.confirm(
        `Créer un nouveau mot de passe provisoire pour ${account.full_name} ? L'ancien ne fonctionnera plus.`
      )
    ) {
      return;
    }
    const password = generatePassword();
    const done = await runAction(
      account,
      { action: "password", password },
      "Nouveau mot de passe créé."
    );
    if (done) {
      setCredentials({
        email: account.email ?? "",
        password,
        label: `Nouveau mot de passe pour ${account.full_name}`,
      });
    }
  }

  async function copyCredentials() {
    if (!credentials) return;
    const text = `Coworking Manager\nAdresse : ${window.location.origin}/login\nE-mail : ${credentials.email}\nMot de passe provisoire : ${credentials.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setSuccess("Identifiants copiés. Colle-les dans un message à la personne.");
    } catch {
      setError("Copie impossible : sélectionne le texte à la main.");
    }
  }

  const accounts = result?.kind === "ok" ? result.accounts : [];

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-900 md:p-10">
      <div className="mx-auto max-w-6xl">
        <header>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
            >
              <span className="text-lg">←</span>
              Tableau de bord
            </button>
            <LogoutButton />
          </div>

          <h1 className="text-3xl font-bold">Comptes utilisateurs</h1>
          <p className="mt-2 text-slate-600">
            Crée les comptes de ton équipe, attribue les rôles et gère les accès.
          </p>
        </header>

        {loading && !result && (
          <p className="mt-8 text-slate-600">Chargement des comptes...</p>
        )}

        {result?.kind === "forbidden" && (
          <p role="alert" className="mt-8 rounded-xl bg-amber-50 p-5 text-amber-800">
            Cette page est réservée à l&apos;administrateur.
          </p>
        )}

        {result?.kind === "error" && (
          <p role="alert" className="mt-8 rounded-xl bg-red-50 p-5 text-red-700">
            {result.message}
          </p>
        )}

        {result?.kind === "ok" && (
          <>
            {error && (
              <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                {error}
              </p>
            )}
            {success && (
              <p role="status" className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">
                {success}
              </p>
            )}

            {credentials && (
              <section className="mt-6 rounded-2xl border-2 border-blue-200 bg-blue-50 p-5">
                <h2 className="font-semibold text-blue-900">{credentials.label}</h2>
                <p className="mt-1 text-sm text-blue-800">
                  Transmets ces identifiants à la personne. Le mot de passe ne sera plus
                  affiché après avoir quitté la page.
                </p>
                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-[auto_1fr]">
                  <dt className="text-slate-600">E-mail</dt>
                  <dd className="font-mono font-medium">{credentials.email}</dd>
                  <dt className="text-slate-600">Mot de passe</dt>
                  <dd className="font-mono font-medium">{credentials.password}</dd>
                </dl>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void copyCredentials()}
                    className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
                  >
                    Copier le message
                  </button>
                  <button
                    type="button"
                    onClick={() => setCredentials(null)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100"
                  >
                    Masquer
                  </button>
                </div>
              </section>
            )}

            <form
              onSubmit={createAccount}
              className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h2 className="text-lg font-semibold">Nouveau compte</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Nom complet</span>
                  <input
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className={inputClass}
                    placeholder="Fatou Sow"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">E-mail</span>
                  <input
                    required
                    type="email"
                    autoComplete="off"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className={inputClass}
                    placeholder="fatou@exemple.com"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Rôle</span>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as AppRole)}
                    className={inputClass}
                  >
                    <option value="manager">{ROLE_LABELS.manager}</option>
                    <option value="admin">{ROLE_LABELS.admin}</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Mot de passe provisoire</span>
                  <div className="flex gap-2">
                    <input
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className={`${inputClass} font-mono`}
                    />
                    <button
                      type="button"
                      onClick={() => setNewPassword(generatePassword())}
                      title="Générer un autre mot de passe"
                      className="rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-100"
                    >
                      ↻
                    </button>
                  </div>
                </label>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Un gestionnaire gère les membres, espaces et réservations. Un
                administrateur peut en plus gérer les comptes.
              </p>
              <button
                type="submit"
                disabled={creating}
                className="mt-4 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {creating ? "Création..." : "Créer le compte"}
              </button>
            </form>

            <section className="mt-8">
              <h2 className="text-lg font-semibold">
                Comptes existants{" "}
                <span className="text-sm font-normal text-slate-500">({accounts.length})</span>
              </h2>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="p-4">Nom</th>
                      <th className="p-4">E-mail</th>
                      <th className="p-4">Rôle</th>
                      <th className="p-4">Statut</th>
                      <th className="p-4">Dernière connexion</th>
                      <th className="p-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((account) => {
                      const editing = editingId === account.id;
                      const busy = busyId === account.id;

                      return (
                        <tr key={account.id} className="border-t border-slate-100 align-top">
                          <td className="p-4">
                            {editing ? (
                              <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className={inputClass}
                                aria-label="Nom"
                              />
                            ) : (
                              <span className="font-medium">
                                {account.full_name}
                                {account.is_me && (
                                  <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                                    Toi
                                  </span>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-slate-600">{account.email ?? "—"}</td>
                          <td className="p-4">
                            {editing && !account.is_me ? (
                              <select
                                value={editRole}
                                onChange={(e) => setEditRole(e.target.value as AppRole)}
                                className={inputClass}
                                aria-label="Rôle"
                              >
                                <option value="manager">{ROLE_LABELS.manager}</option>
                                <option value="admin">{ROLE_LABELS.admin}</option>
                              </select>
                            ) : (
                              ROLE_LABELS[account.role]
                            )}
                          </td>
                          <td className="p-4">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                account.is_active
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {account.is_active ? "Actif" : "Désactivé"}
                            </span>
                          </td>
                          <td className="p-4 text-slate-600">
                            {formatDate(account.last_sign_in_at)}
                          </td>
                          <td className="p-4">
                            <div className="flex flex-wrap gap-2">
                              {editing ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void saveEdit(account)}
                                    className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                                  >
                                    Enregistrer
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingId(null)}
                                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
                                  >
                                    Annuler
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      resetMessages();
                                      setEditingId(account.id);
                                      setEditName(account.full_name);
                                      setEditRole(account.role);
                                    }}
                                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:opacity-50"
                                  >
                                    Modifier
                                  </button>
                                  {!account.is_me && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={busy || !account.is_active}
                                        onClick={() => void resetPassword(account)}
                                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:opacity-50"
                                      >
                                        Nouveau mot de passe
                                      </button>
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => void toggleActive(account)}
                                        className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                                          account.is_active
                                            ? "border border-red-200 text-red-700 hover:bg-red-50"
                                            : "border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                        }`}
                                      >
                                        {busy
                                          ? "..."
                                          : account.is_active
                                            ? "Désactiver"
                                            : "Réactiver"}
                                      </button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
