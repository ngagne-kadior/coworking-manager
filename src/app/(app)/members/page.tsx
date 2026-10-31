"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import PhotoButton from "@/components/PhotoButton";
import { MEMBER_BUCKET, removePhoto, replacePhoto } from "@/lib/photos";

type Member = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  is_active: boolean;
  created_at: string;
  photo_path: string | null;
};

type Reservation = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  notes: string | null;
};

const MEMBER_FIELDS =
  "id, full_name, email, phone, company, is_active, created_at, photo_path";

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
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);

  // Formulaire d'ajout
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [newPhoto, setNewPhoto] = useState<File | null>(null);

  // Fiche « Détails »
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [detailsTab, setDetailsTab] = useState<"infos" | "history">("infos");

  // Modification d'un membre
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Activation / désactivation
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [photoBusyId, setPhotoBusyId] = useState<string | null>(null);

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
    // Chargement initial des données depuis Supabase. L'état « loading »
    // vaut déjà true au premier rendu : le setLoading(true) synchrone de
    // loadMembers ne provoque aucun rendu supplémentaire.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    setNewPhoto(null);
  }

  function openDetails(member: Member) {
    resetMessages();
    cancelEditing();
    setDetailsTab("infos");
    setHistoryMember(null);
    setDetailsId(member.id);
  }

  function closeDetails() {
    cancelEditing();
    setDetailsId(null);
    setHistoryMember(null);
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
    setAddError("");

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const cleanCompany = company.trim();

    if (!cleanName) {
      setAddError("Le nom complet est obligatoire.");
      return;
    }

    if (!cleanPhone && !cleanEmail) {
      setAddError("Renseigne au moins un numéro de téléphone ou un e-mail.");
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
          setAddError("Cet e-mail est déjà utilisé par un autre membre.");
        } else {
          setAddError(`Impossible d'ajouter le membre : ${insertError.message}`);
        }
        return;
      }

      let created = data as Member;
      let photoWarning = "";

      if (newPhoto) {
        try {
          const path = await replacePhoto({
            bucket: MEMBER_BUCKET,
            table: "members",
            id: created.id,
            file: newPhoto,
            maxSide: 480,
            previousPath: null,
          });
          created = { ...created, photo_path: path };
        } catch (err) {
          photoWarning = ` La photo n'a pas pu être envoyée (${
            err instanceof Error ? err.message : "erreur inconnue"
          }) : ajoute-la depuis sa fiche.`;
        }
      }

      setMembers((current) => [created, ...current]);
      resetAddForm();
      setAddOpen(false);
      setSuccess(`${cleanName} a été ajouté(e).${photoWarning}`);
    } catch {
      setAddError("Une erreur inattendue est survenue lors de l'ajout.");
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
  async function changeMemberPhoto(member: Member, file: File) {
    resetMessages();
    setPhotoBusyId(member.id);
    try {
      const path = await replacePhoto({
        bucket: MEMBER_BUCKET,
        table: "members",
        id: member.id,
        file,
        maxSide: 480,
        previousPath: member.photo_path,
      });
      setMembers((current) =>
        current.map((item) => (item.id === member.id ? { ...item, photo_path: path } : item))
      );
      setSuccess(`Photo de ${member.full_name} enregistrée.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi de la photo impossible.");
    } finally {
      setPhotoBusyId(null);
    }
  }

  async function deleteMemberPhoto(member: Member) {
    if (!member.photo_path) return;
    if (!window.confirm(`Retirer la photo de ${member.full_name} ?`)) return;
    resetMessages();
    setPhotoBusyId(member.id);
    try {
      await removePhoto({
        bucket: MEMBER_BUCKET,
        table: "members",
        id: member.id,
        path: member.photo_path,
      });
      setMembers((current) =>
        current.map((item) => (item.id === member.id ? { ...item, photo_path: null } : item))
      );
      setSuccess(`Photo de ${member.full_name} retirée.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible.");
    } finally {
      setPhotoBusyId(null);
    }
  }

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
    <div className="text-slate-900">
      <div className="mx-auto max-w-7xl">
        <PageHeader
          title="Membres"
          description="Ajoute, modifie et consulte les membres et leurs réservations."
          actions={
            <>
              <button
                type="button"
                onClick={() => void loadMembers()}
                disabled={loading}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
              >
                {loading ? "Actualisation..." : "Actualiser"}
              </button>
              <button
                type="button"
                onClick={() => {
                  resetMessages();
                  setAddError("");
                  setAddOpen(true);
                }}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                + Ajouter un membre
              </button>
            </>
          }
        />

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
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-4">Membre</th>
                    <th className="p-4">Téléphone</th>
                    <th className="p-4">E-mail</th>
                    <th className="p-4">Inscription</th>
                    <th className="p-4">Statut</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredMembers.map((member) => (
                    <tr
                      key={member.id}
                      onClick={() => openDetails(member)}
                      className="cursor-pointer hover:bg-slate-50/70"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={member.full_name} photoPath={member.photo_path} size="md" />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{member.full_name}</p>
                            {member.company && (
                              <p className="mt-0.5 text-xs text-slate-500">{member.company}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-slate-600">{member.phone || "—"}</td>
                      <td className="p-4 text-slate-600">{member.email || "—"}</td>
                      <td className="whitespace-nowrap p-4 text-slate-600">{formatDate(member.created_at)}</td>
                      <td className="p-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            member.is_active ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {member.is_active ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openDetails(member);
                          }}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
                        >
                          Détails
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>


        <p className="mt-6 text-center text-xs text-slate-400">
          Coworking Manager — Gestion des membres
        </p>
      </div>


      {detailsId && (() => {
        const member = members.find((m) => m.id === detailsId);
        if (!member) return null;
        const isEditing = editingId === member.id;
        const busy = photoBusyId === member.id || togglingId === member.id;
        const phoneDigits = (member.phone ?? "").replace(/[^\d]/g, "");
        const whatsapp = phoneDigits
          ? `https://wa.me/${phoneDigits.length === 9 ? `221${phoneDigits}` : phoneDigits}`
          : null;

        return (
          <SideDialog title="Fiche membre" onClose={closeDetails}>
            {error && (
              <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            {success && (
              <p role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                {success}
              </p>
            )}

            {/* En-tête : photo, nom, statut */}
            <div className="flex flex-col items-center text-center">
              <Avatar name={member.full_name} photoPath={member.photo_path} size="lg" />
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <PhotoButton
                  label={member.photo_path ? "Changer la photo" : "Ajouter une photo"}
                  disabled={busy}
                  onFile={(file) => void changeMemberPhoto(member, file)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-60"
                >
                  {photoBusyId === member.id
                    ? "Envoi..."
                    : member.photo_path
                      ? "Changer la photo"
                      : "Ajouter une photo"}
                </PhotoButton>
                {member.photo_path && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteMemberPhoto(member)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    Retirer
                  </button>
                )}
              </div>
              <h3 className="mt-4 text-xl font-bold">{member.full_name}</h3>
              {member.company && <p className="text-sm text-slate-500">{member.company}</p>}
              <span
                className={`mt-2 rounded-full px-3 py-1 text-xs font-semibold ${
                  member.is_active ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"
                }`}
              >
                {member.is_active ? "Actif" : "Inactif"}
              </span>
            </div>

            {/* Onglets */}
            <div className="mt-6 grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-1 text-sm">
              <button
                type="button"
                onClick={() => setDetailsTab("infos")}
                aria-pressed={detailsTab === "infos"}
                className={`rounded-lg py-2 font-medium ${detailsTab === "infos" ? "bg-white shadow-sm" : "text-slate-500"}`}
              >
                Informations
              </button>
              <button
                type="button"
                onClick={() => {
                  setDetailsTab("history");
                  void viewReservationHistory(member);
                }}
                aria-pressed={detailsTab === "history"}
                className={`rounded-lg py-2 font-medium ${detailsTab === "history" ? "bg-white shadow-sm" : "text-slate-500"}`}
              >
                Réservations
              </button>
            </div>

            {detailsTab === "infos" && !isEditing && (
              <>
                <dl className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
                  {[
                    ["Téléphone", member.phone],
                    ["E-mail", member.email],
                    ["Entreprise", member.company],
                    ["Inscription", formatDate(member.created_at)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 px-4 py-3">
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="text-right font-medium">{value || "—"}</dd>
                    </div>
                  ))}
                </dl>

                {(member.phone || member.email) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {member.phone && (
                      <a href={`tel:${member.phone}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">
                        Appeler
                      </a>
                    )}
                    {whatsapp && (
                      <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                        WhatsApp
                      </a>
                    )}
                    {member.email && (
                      <a href={`mailto:${member.email}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">
                        Envoyer un e-mail
                      </a>
                    )}
                  </div>
                )}

                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => startEditing(member)}
                    className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleMemberStatus(member)}
                    className={`rounded-lg border px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${
                      member.is_active
                        ? "border-red-200 text-red-700 hover:bg-red-50"
                        : "border-green-200 text-green-700 hover:bg-green-50"
                    }`}
                  >
                    {togglingId === member.id ? "..." : member.is_active ? "Désactiver" : "Réactiver"}
                  </button>
                </div>
              </>
            )}

            {detailsTab === "infos" && isEditing && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveMemberEdit(member.id);
                }}
                className="mt-5 space-y-3"
              >
                {(
                  [
                    ["Nom complet *", editFullName, setEditFullName, "text"],
                    ["Téléphone", editPhone, setEditPhone, "tel"],
                    ["Adresse e-mail", editEmail, setEditEmail, "email"],
                    ["Entreprise", editCompany, setEditCompany, "text"],
                  ] as const
                ).map(([label, value, setter, type]) => (
                  <label key={label} className="block text-sm">
                    <span className="mb-1 block font-medium">{label}</span>
                    <input
                      type={type}
                      value={value}
                      onChange={(event) => setter(event.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                ))}
                <p className="text-xs text-slate-500">Le téléphone ou l&apos;adresse e-mail doit être renseigné.</p>
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={editSaving}
                    className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {editSaving ? "Enregistrement..." : "Enregistrer"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            )}

            {detailsTab === "history" && (
              <div className="mt-5">
                {historyLoading ? (
                  <p className="text-sm text-slate-500">Chargement des réservations...</p>
                ) : reservationHistory.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-500">
                    Aucune réservation enregistrée pour ce membre.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {reservationHistory.map((reservation) => (
                      <li key={reservation.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{formatDateTime(reservation.start_at)}</p>
                            <p className="text-xs text-slate-500">Fin : {formatDateTime(reservation.end_at)}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {reservationStatusLabel(reservation.status)}
                          </span>
                        </div>
                        {reservation.notes && <p className="mt-2 text-xs text-slate-600">{reservation.notes}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </SideDialog>
        );
      })()}

      {addOpen && (
        <AddMemberDialog onClose={() => setAddOpen(false)}>
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
                        autoFocus
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

                  <NewPhotoField file={newPhoto} onChange={setNewPhoto} />

                  <p className="mt-3 text-xs text-slate-500">
                    Le téléphone ou l’adresse e-mail doit être renseigné.
                  </p>

                  {addError && (
                    <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {addError}
                    </p>
                  )}

                  <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setAddOpen(false)}
                      className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium hover:bg-slate-50"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? "Enregistrement..." : "Ajouter le membre"}
                    </button>
                  </div>
                </form>
        </AddMemberDialog>
      )}
    </div>
  );
}
function AddMemberDialog({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-member-title"
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:max-w-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="add-member-title" className="text-xl font-semibold">
              Ajouter un membre
            </h2>
            <p className="mt-1 text-sm text-slate-500">Les nouveaux membres sont actifs par défaut.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NewPhotoField({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // Aperçu local : l'image n'est envoyée qu'à la création du membre.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="mt-4 flex items-center gap-4 rounded-lg border border-dashed border-slate-300 p-3">
      {file && preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- aperçu local
        <img src={preview} alt="Aperçu de la photo" className="h-16 w-16 rounded-full object-cover" />
      ) : (
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-2xl text-slate-400">
          ＋
        </span>
      )}
      <div className="text-sm">
        <p className="font-medium">Photo (facultatif)</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <PhotoButton
            label={file ? "Changer" : "Choisir une photo"}
            onFile={(selected) => onChange(selected)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          />
          {file && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Retirer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SideDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-900/50 sm:justify-end sm:items-stretch" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:max-h-none sm:max-w-md sm:rounded-none"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
