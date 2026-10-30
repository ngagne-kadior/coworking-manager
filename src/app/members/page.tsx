"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import LogoutButton from "@/components/LogoutButton";

type Member = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  is_active: boolean;
  created_at: string;
};

type Reservation = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  notes: string | null;
};

const MEMBER_FIELDS =
  "id, full_name, email, phone, company, is_active, created_at";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("fr-FR");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function reservationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "En attente",
    confirmed: "Confirmée",
    cancelled: "Annulée",
    completed: "Terminée",
    expired: "Expirée",
  };

  return labels[status] ?? status;
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);

  // Formulaire d'ajout
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");

  // Modification d'un membre
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Activation / désactivation
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Historique des réservations
  const [historyMember, setHistoryMember] = useState<Member | null>(null);
  const [reservationHistory, setReservationHistory] = useState<Reservation[]>(
    []
  );
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data, error: queryError } = await supabase
        .from("members")
        .select(MEMBER_FIELDS)
        .order("created_at", { ascending: false });

      if (queryError) {
        setError(`Impossible de charger les membres : ${queryError.message}`);
        return;
      }

      setMembers((data ?? []) as Member[]);
    } catch {
      setError("Une erreur inattendue est survenue lors du chargement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  function resetMessages() {
    setError("");
    setSuccess("");
  }

  function resetAddForm() {
    setName("");
    setEmail("");
    setPhone("");
    setCompany("");
  }

  function cancelEditing() {
    setEditingId(null);
    setEditFullName("");
    setEditEmail("");
    setEditPhone("");
    setEditCompany("");
  }

  // Ajouter un membre
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetMessages();

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const cleanCompany = company.trim();

    if (!cleanName) {
      setError("Le nom complet est obligatoire.");
      return;
    }

    if (!cleanPhone && !cleanEmail) {
      setError("Renseigne au moins un numéro de téléphone ou un e-mail.");
      return;
    }

    setSaving(true);

    try {
      const { data, error: insertError } = await supabase
        .from("members")
        .insert({
          full_name: cleanName,
          email: cleanEmail || null,
          phone: cleanPhone || null,
          company: cleanCompany || null,
          is_active: true,
        })
        .select(MEMBER_FIELDS)
        .single();

      if (insertError) {
        if (insertError.code === "23505") {
          setError("Cet e-mail est déjà utilisé par un autre membre.");
        } else {
          setError(`Impossible d'ajouter le membre : ${insertError.message}`);
        }
        return;
      }

      setMembers((current) => [data as Member, ...current]);
      resetAddForm();
      setSuccess("Le membre a été ajouté avec succès.");
    } catch {
      setError("Une erreur inattendue est survenue lors de l'ajout.");
    } finally {
      setSaving(false);
    }
  }

  // Commencer la modification
  function startEditing(member: Member) {
    resetMessages();

    setEditingId(member.id);
    setEditFullName(member.full_name);
    setEditEmail(member.email ?? "");
    setEditPhone(member.phone ?? "");
    setEditCompany(member.company ?? "");
  }

  // Enregistrer les modifications
  async function saveMemberEdit(memberId: string) {
    resetMessages();

    const cleanName = editFullName.trim();
    const cleanEmail = editEmail.trim().toLowerCase();
    const cleanPhone = editPhone.trim();
    const cleanCompany = editCompany.trim();

    if (!cleanName) {
      setError("Le nom complet est obligatoire.");
      return;
    }

    if (!cleanPhone && !cleanEmail) {
      setError("Renseigne au moins un numéro de téléphone ou un e-mail.");
      return;
    }

    setEditSaving(true);

    try {
      const { data, error: updateError } = await supabase
        .from("members")
        .update({
          full_name: cleanName,
          email: cleanEmail || null,
          phone: cleanPhone || null,
          company: cleanCompany || null,
        })
        .eq("id", memberId)
        .select(MEMBER_FIELDS)
        .single();

      if (updateError) {
        if (updateError.code === "23505") {
          setError("Cet e-mail est déjà utilisé par un autre membre.");
        } else {
          setError(
            `Impossible de modifier le membre : ${updateError.message}`
          );
        }
        return;
      }

      setMembers((current) =>
        current.map((member) =>
          member.id === memberId ? (data as Member) : member
        )
      );

      if (historyMember?.id === memberId) {
        setHistoryMember(data as Member);
      }

      cancelEditing();
      setSuccess("Les informations du membre ont été mises à jour.");
    } catch {
      setError("Une erreur inattendue est survenue lors de la modification.");
    } finally {
      setEditSaving(false);
    }
  }

  // Désactiver ou réactiver un membre
  async function toggleMemberStatus(member: Member) {
    resetMessages();

    const activating = !member.is_active;

    if (
      !activating &&
      !window.confirm(
        `Désactiver ${member.full_name} ? Les réservations confirmées à venir doivent d'abord être annulées.`
      )
    ) {
      return;
    }

    setTogglingId(member.id);

    try {
      if (activating) {
        const { data, error: updateError } = await supabase
          .from("members")
          .update({ is_active: true })
          .eq("id", member.id)
          .select(MEMBER_FIELDS)
          .single();

        if (updateError) {
          setError(
            `Impossible de réactiver le membre : ${updateError.message}`
          );
          return;
        }

        setMembers((current) =>
          current.map((item) =>
            item.id === member.id ? (data as Member) : item
          )
        );

        setSuccess(`${member.full_name} a été réactivé.`);
        return;
      }

      // La fonction SQL vérifie les réservations confirmées à venir
      // avant d'autoriser la désactivation.
      const { data, error: rpcError } = await supabase.rpc(
        "deactivate_member",
        {
          p_member_id: member.id,
        }
      );

      if (rpcError) {
        setError(
          `Impossible de désactiver le membre : ${rpcError.message}. Vérifie que la fonction SQL deactivate_member existe.`
        );
        return;
      }

      if (data === "upcoming_reservations") {
        setError(
          "Désactivation impossible : ce membre possède des réservations confirmées à venir. Annule d'abord ces réservations."
        );
        return;
      }

      if (data !== "deactivated") {
        setError("Le membre est introuvable ou déjà inactif.");
        return;
      }

      setMembers((current) =>
        current.map((item) =>
          item.id === member.id ? { ...item, is_active: false } : item
        )
      );

      setSuccess(`${member.full_name} a été désactivé.`);
    } catch {
      setError("Une erreur inattendue est survenue.");
    } finally {
      setTogglingId(null);
    }
  }

  // Consulter l'historique des réservations
  async function viewReservationHistory(member: Member) {
    resetMessages();

    setHistoryMember(member);
    setReservationHistory([]);
    setHistoryLoading(true);

    try {
      const { data, error: queryError } = await supabase
        .from("reservations")
        .select("id, start_at, end_at, status, notes")
        .eq("member_id", member.id)
        .order("start_at", { ascending: false });

      if (queryError) {
        setError(
          `Impossible de charger l'historique : ${queryError.message}`
        );
        return;
      }

      setReservationHistory((data ?? []) as Reservation[]);
    } catch {
      setError("Une erreur inattendue est survenue lors du chargement.");
    } finally {
      setHistoryLoading(false);
    }
  }

  // Recherche et filtre
  const filteredMembers = members.filter((member) => {
    const term = search.trim().toLowerCase();

    const matchesSearch =
      !term ||
      member.full_name.toLowerCase().includes(term) ||
      (member.email ?? "").toLowerCase().includes(term) ||
      (member.phone ?? "").toLowerCase().includes(term) ||
      (member.company ?? "").toLowerCase().includes(term);

    const matchesStatus = showInactive || member.is_active;

    return matchesSearch && matchesStatus;
  });

  const activeCount = members.filter((member) => member.is_active).length;
  const inactiveCount = members.length - activeCount;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* En-tête */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600">
              Coworking Manager
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Gestion des membres
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Ajouter, modifier et consulter les membres et leurs réservations.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void loadMembers()}
              disabled={loading}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
            >
              {loading ? "Actualisation..." : "Actualiser"}
            </button>

            <a
             href="/"
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              Retour au tableau de bord
            </a>

            <LogoutButton />
          </div>
        </header>

        {/* Messages */}
        {error && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700"
          >
            {success}
          </div>
        )}

        {/* Statistiques */}
        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Total des membres</p>
            <p className="mt-2 text-3xl font-bold">{members.length}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Membres actifs</p>
            <p className="mt-2 text-3xl font-bold text-green-600">
              {activeCount}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Membres inactifs</p>
            <p className="mt-2 text-3xl font-bold text-slate-500">
              {inactiveCount}
            </p>
          </div>
        </section>

        {/* Formulaire d'ajout */}
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Ajouter un membre</h2>

          <p className="mt-1 text-sm text-slate-500">
            Les nouveaux membres sont actifs par défaut.
          </p>

          <form onSubmit={handleSubmit} className="mt-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="member-name"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Nom complet *
                </label>

                <input
                  id="member-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={150}
                  placeholder="Ex. : Amadou Ndiaye"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="member-phone"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Téléphone
                </label>

                <input
                  id="member-phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  maxLength={30}
                  placeholder="Ex. : 77 000 00 00"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="member-email"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Adresse e-mail
                </label>

                <input
                  id="member-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={254}
                  placeholder="Ex. : membre@email.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="member-company"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Entreprise
                </label>

                <input
                  id="member-company"
                  type="text"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  maxLength={150}
                  placeholder="Nom de l'entreprise"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Le téléphone ou l’adresse e-mail doit être renseigné.
            </p>

            <button
              type="submit"
              disabled={saving}
              className="mt-5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Enregistrement..." : "Ajouter le membre"}
            </button>
          </form>
        </section>

        {/* Liste des membres */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Liste des membres</h2>
              <p className="mt-1 text-sm text-slate-500">
                {filteredMembers.length} membre(s) affiché(s)
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nom, téléphone, e-mail..."
                aria-label="Rechercher un membre"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-72"
              />

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(event) => setShowInactive(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Afficher les inactifs
              </label>
            </div>
          </div>

          {loading ? (
            <div className="p-10 text-center text-slate-500">
              Chargement des membres...
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-medium text-slate-700">
                Aucun membre trouvé
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Essaie une autre recherche ou ajoute un nouveau membre.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-4">Membre</th>
                    <th className="p-4">Téléphone</th>
                    <th className="p-4">E-mail</th>
                    <th className="p-4">Entreprise</th>
                    <th className="p-4">Inscription</th>
                    <th className="p-4">Statut</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredMembers.map((member) => {
                    const isEditing = editingId === member.id;

                    return (
                      <tr
                        key={member.id}
                        className="align-top hover:bg-slate-50/70"
                      >
                        <td className="p-4">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editFullName}
                              onChange={(event) =>
                                setEditFullName(event.target.value)
                              }
                              aria-label="Nom complet"
                              className="w-48 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                            />
                          ) : (
                            <div>
                              <p className="font-semibold text-slate-900">
                                {member.full_name}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                ID : {member.id.slice(0, 8)}
                              </p>
                            </div>
                          )}
                        </td>

                        <td className="p-4 text-slate-600">
                          {isEditing ? (
                            <input
                              type="tel"
                              value={editPhone}
                              onChange={(event) =>
                                setEditPhone(event.target.value)
                              }
                              aria-label="Téléphone"
                              className="w-36 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                            />
                          ) : (
                            member.phone || "—"
                          )}
                        </td>

                        <td className="p-4 text-slate-600">
                          {isEditing ? (
                            <input
                              type="email"
                              value={editEmail}
                              onChange={(event) =>
                                setEditEmail(event.target.value)
                              }
                              aria-label="E-mail"
                              className="w-52 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                            />
                          ) : (
                            member.email || "—"
                          )}
                        </td>

                        <td className="p-4 text-slate-600">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editCompany}
                              onChange={(event) =>
                                setEditCompany(event.target.value)
                              }
                              aria-label="Entreprise"
                              className="w-40 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                            />
                          ) : (
                            member.company || "—"
                          )}
                        </td>

                        <td className="whitespace-nowrap p-4 text-slate-600">
                          {formatDate(member.created_at)}
                        </td>

                        <td className="p-4">
                          {member.is_active ? (
                            <span className="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                              Actif
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">
                              Inactif
                            </span>
                          )}
                        </td>

                        <td className="p-4">
                          <div className="flex min-w-36 flex-col items-start gap-2">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void saveMemberEdit(member.id)
                                  }
                                  disabled={editSaving}
                                  className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {editSaving ? "Enregistrement..." : "Sauver"}
                                </button>

                                <button
                                  type="button"
                                  onClick={cancelEditing}
                                  disabled={editSaving}
                                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-100"
                                >
                                  Annuler
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEditing(member)}
                                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-100"
                                >
                                  Modifier
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    void viewReservationHistory(member)
                                  }
                                  className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200"
                                >
                                  Historique
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    void toggleMemberStatus(member)
                                  }
                                  disabled={togglingId === member.id}
                                  className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                                    member.is_active
                                      ? "bg-red-50 text-red-700 hover:bg-red-100"
                                      : "bg-green-50 text-green-700 hover:bg-green-100"
                                  }`}
                                >
                                  {togglingId === member.id
                                    ? "Traitement..."
                                    : member.is_active
                                      ? "Désactiver"
                                      : "Réactiver"}
                                </button>
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
          )}
        </section>

        {/* Historique des réservations */}
        {historyMember && (
          <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">
                  Historique des réservations
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {historyMember.full_name}
                  {historyMember.company
                    ? ` — ${historyMember.company}`
                    : ""}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Les réservations passées et leur statut restent consultables,
                  même si le membre est inactif.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setHistoryMember(null);
                  setReservationHistory([]);
                }}
                className="self-start rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 sm:self-auto"
              >
                Fermer
              </button>
            </div>

            {historyLoading ? (
              <p className="mt-6 text-sm text-slate-500">
                Chargement de l'historique...
              </p>
            ) : reservationHistory.length === 0 ? (
              <div className="mt-6 rounded-lg bg-slate-50 p-6 text-center">
                <p className="font-medium text-slate-700">
                  Aucune réservation enregistrée
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  L'historique de ce membre est vide.
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {reservationHistory.map((reservation) => (
                  <article
                    key={reservation.id}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium text-slate-900">
                          Réservation du{" "}
                          {formatDateTime(reservation.start_at)}
                        </p>

                        <p className="mt-1 text-sm text-slate-600">
                          Fin : {formatDateTime(reservation.end_at)}
                        </p>
                      </div>

                      <span className="inline-flex self-start rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {reservationStatusLabel(reservation.status)}
                      </span>
                    </div>

                    {reservation.notes && (
                      <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
                        <span className="font-medium">Notes :</span>{" "}
                        {reservation.notes}
                      </p>
                    )}

                    <p className="mt-3 text-xs text-slate-400">
                      Référence : {reservation.id}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          Coworking Manager — Gestion des membres
        </p>
      </div>
    </main>
  );
}