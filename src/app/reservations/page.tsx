
"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import LogoutButton from "@/components/LogoutButton";

type Member = {
  id: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
};

type Space = {
  id: string;
  name: string;
  capacity: number;
  is_active: boolean;
};

type ReservationStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "expired";

type Reservation = {
  id: string;
  member_id: string;
  space_id: string;
  start_at: string;
  end_at: string;
  expires_at: string | null;
  status: ReservationStatus;
  notes: string | null;
  members: { full_name: string } | null;
  spaces: { name: string } | null;
};

const statusLabels: Record<ReservationStatus, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  cancelled: "Annulée",
  completed: "Terminée",
  expired: "Expirée",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function localDateTimeValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isExpired(reservation: Reservation) {
  return (
    reservation.status === "expired" ||
    (reservation.status === "pending" &&
      (!reservation.expires_at ||
        new Date(reservation.expires_at).getTime() <= Date.now()))
  );
}

export default function ReservationsPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [memberId, setMemberId] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [notes, setNotes] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [membersResult, spacesResult, reservationsResult] =
        await Promise.all([
          supabase
            .from("members")
            .select("id, full_name, email, is_active")
            .eq("is_active", true)
            .order("full_name"),

          supabase
            .from("spaces")
            .select("id, name, capacity, is_active")
            .eq("is_active", true)
            .order("name"),

          supabase
            .from("reservations")
            .select(
              "id, member_id, space_id, start_at, end_at, expires_at, status, notes, members(full_name), spaces(name)"
            )
            .order("created_at", { ascending: false }),
        ]);

      if (membersResult.error) {
        setError(
          `Erreur lors du chargement des membres : ${membersResult.error.message}`
        );
        return;
      }

      if (spacesResult.error) {
        setError(
          `Erreur lors du chargement des espaces : ${spacesResult.error.message}`
        );
        return;
      }

      if (reservationsResult.error) {
        setError(
          `Erreur lors du chargement des réservations : ${reservationsResult.error.message}`
        );
        return;
      }

      setMembers(membersResult.data ?? []);
      setSpaces(spacesResult.data ?? []);
      setReservations(
        (reservationsResult.data ?? []) as unknown as Reservation[]
      );

      setMemberId((current) => current || membersResult.data?.[0]?.id || "");
      setSpaceId((current) => current || spacesResult.data?.[0]?.id || "");
    } catch {
      setError("Une erreur inattendue est survenue lors du chargement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function createReservation(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!memberId || !spaceId || !startAt || !endAt) {
      setError("Choisis un membre, un espace et les deux horaires.");
      return;
    }

    const startDate = new Date(startAt);
    const endDate = new Date(endAt);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate <= startDate
    ) {
      setError("L'heure de fin doit être postérieure à l'heure de début.");
      return;
    }

    if (startDate <= new Date()) {
      setError("La réservation doit commencer dans le futur.");
      return;
    }

    setSaving(true);

    try {
      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();

      // Seules les réservations confirmées bloquent un créneau.
      const { data: conflicts, error: conflictError } = await supabase
        .from("reservations")
        .select("id")
        .eq("space_id", spaceId)
        .eq("status", "confirmed")
        .lt("start_at", endISO)
        .gt("end_at", startISO);

      if (conflictError) {
        setError(
          `Impossible de vérifier la disponibilité : ${conflictError.message}`
        );
        return;
      }

      if (conflicts && conflicts.length > 0) {
        setError(
          "Cet espace est déjà réservé sur ce créneau par une réservation confirmée."
        );
        return;
      }

      const { data: newReservation, error: insertError } = await supabase
        .from("reservations")
        .insert({
          member_id: memberId,
          space_id: spaceId,
          start_at: startISO,
          end_at: endISO,
          status: "confirmed",
          notes: notes.trim() || null,
        })
        .select("id")
        .single();

      if (insertError) {
        setError(
          insertError.code === "23P01"
            ? "Ce créneau vient d'être réservé. Choisis un autre horaire."
            : `Impossible de créer la réservation : ${insertError.message}`
        );
        return;
      }

      if (!newReservation) {
        setError("La réservation n'a pas été retournée par la base de données.");
        return;
      }

      setSuccess(
        "Réservation créée et confirmée."
      );

      setStartAt("");
      setEndAt("");
      setNotes("");

      await loadData();
    } catch {
      setError("Une erreur inattendue est survenue pendant la réservation.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(
    reservation: Reservation,
    nextStatus: ReservationStatus
  ) {
    setError("");
    setSuccess("");

    if (reservation.status === nextStatus) return;

    if (nextStatus === "confirmed") {
      if (reservation.status !== "pending") {
        setError("Seule une réservation en attente peut être confirmée.");
        return;
      }

      if (isExpired(reservation)) {
        setError(
          "Cette demande a expiré. Elle ne peut plus être confirmée."
        );
        await loadData();
        return;
      }
    }

    if (
      nextStatus === "cancelled" &&
      !window.confirm("Veux-tu vraiment annuler cette réservation ?")
    ) {
      return;
    }

    if (
      nextStatus === "completed" &&
      new Date(reservation.end_at) > new Date()
    ) {
      setError(
        "Une réservation ne peut être terminée qu'après son heure de fin."
      );
      return;
    }

    try {
      const { data, error } = await supabase
        .from("reservations")
        .update({ status: nextStatus })
        .eq("id", reservation.id)
        .select("id")
        .maybeSingle();

      if (error) {
        const message = error.message.toLowerCase();

        if (
          nextStatus === "confirmed" &&
          (message.includes("expir") ||
            message.includes("date limite") ||
            message.includes("attente"))
        ) {
          setError(
            "Confirmation refusée : cette demande a expiré ou n'est plus en attente."
          );
        } else if (
          nextStatus === "confirmed" &&
          (message.includes("créneau") ||
            message.includes("occupé") ||
            error.code === "23P01")
        ) {
          setError(
            "Confirmation refusée : ce créneau est déjà occupé."
          );
        } else {
          setError(`Impossible de modifier le statut : ${error.message}`);
        }

        await loadData();
        return;
      }

      if (!data) {
        setError(
          "Aucune modification enregistrée. Vérifie les droits Supabase et les règles de réservation."
        );
        return;
      }

      setSuccess(`Statut mis à jour : ${statusLabels[nextStatus]}.`);
      await loadData();
    } catch {
      setError("Une erreur inattendue est survenue pendant la modification.");
    }
  }

  const visibleReservations =
    statusFilter === "all"
      ? reservations
      : reservations.filter(
          (reservation) => reservation.status === statusFilter
        );

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-900 md:p-10">
      <div className="mx-auto max-w-7xl">
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
          <h1 className="text-3xl font-bold">Réservations</h1>
          <p className="mt-2 text-slate-600">
            Crée et gère les réservations des espaces de coworking.
          </p>
        </header>

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {success && (
          <p
            role="status"
            className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700"
          >
            {success}
          </p>
        )}

        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Créer une réservation</h2>

          {members.length === 0 || spaces.length === 0 ? (
            <p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
              Pour créer une réservation, il faut au moins un membre actif et
              un espace actif. Ajoute-les dans les pages correspondantes.
            </p>
          ) : (
            <form
              onSubmit={createReservation}
              className="mt-5 grid gap-5 md:grid-cols-2"
            >
              <div>
                <label htmlFor="member" className="mb-1 block text-sm font-medium">
                  Membre *
                </label>
                <select
                  id="member"
                  required
                  value={memberId}
                  onChange={(event) => setMemberId(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3"
                >
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="space" className="mb-1 block text-sm font-medium">
                  Espace *
                </label>
                <select
                  id="space"
                  required
                  value={spaceId}
                  onChange={(event) => setSpaceId(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3"
                >
                  {spaces.map((space) => (
                    <option key={space.id} value={space.id}>
                      {space.name} — {space.capacity} personne(s)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="startAt" className="mb-1 block text-sm font-medium">
                  Début *
                </label>
                <input
                  id="startAt"
                  type="datetime-local"
                  required
                  min={localDateTimeValue(new Date())}
                  value={startAt}
                  onChange={(event) => setStartAt(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>

              <div>
                <label htmlFor="endAt" className="mb-1 block text-sm font-medium">
                  Fin *
                </label>
                <input
                  id="endAt"
                  type="datetime-local"
                  required
                  min={startAt || localDateTimeValue(new Date())}
                  value={endAt}
                  onChange={(event) => setEndAt(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="notes" className="mb-1 block text-sm font-medium">
                  Notes (facultatif)
                </label>
                <textarea
                  id="notes"
                  rows={3}
                  maxLength={1000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Informations complémentaires..."
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {saving ? "Enregistrement..." : "Créer la réservation"}
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="mt-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-xl font-semibold">
                Liste des réservations
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {visibleReservations.length} réservation(s)
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <select
                aria-label="Filtrer par statut"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2"
              >
                <option value="all">Tous les statuts</option>
                <option value="pending">En attente</option>
                <option value="confirmed">Confirmées</option>
                <option value="cancelled">Annulées</option>
                <option value="completed">Terminées</option>
                <option value="expired">Expirées</option>
              </select>

              <button
                type="button"
                onClick={() => void loadData()}
                disabled={loading}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {loading ? "Chargement..." : "Actualiser"}
              </button>
            </div>
          </div>

          {loading && (
            <p className="mt-5 text-slate-600">
              Chargement des réservations...
            </p>
          )}

          {!loading && visibleReservations.length === 0 && (
            <p className="mt-5 rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
              Aucune réservation pour ce filtre.
            </p>
          )}

          {!loading && visibleReservations.length > 0 && (
            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="p-4">Membre</th>
                    <th className="p-4">Espace</th>
                    <th className="p-4">Début</th>
                    <th className="p-4">Fin</th>
                    <th className="p-4">Statut</th>
                    <th className="p-4">Notes</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleReservations.map((reservation) => {
                    const expired = isExpired(reservation);

                    return (
                      <tr
                        key={reservation.id}
                        className="border-t border-slate-100"
                      >
                        <td className="p-4 font-medium">
                          {reservation.members?.full_name ??
                            "Membre indisponible"}
                        </td>
                        <td className="p-4">
                          {reservation.spaces?.name ?? "Espace indisponible"}
                        </td>
                        <td className="p-4">
                          {formatDate(reservation.start_at)}
                        </td>
                        <td className="p-4">
                          {formatDate(reservation.end_at)}
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              reservation.status === "confirmed"
                                ? "bg-green-100 text-green-800"
                                : reservation.status === "pending"
                                  ? expired
                                    ? "bg-red-100 text-red-800"
                                    : "bg-amber-100 text-amber-800"
                                  : reservation.status === "cancelled"
                                    ? "bg-red-100 text-red-800"
                                    : reservation.status === "expired"
                                      ? "bg-red-100 text-red-800"
                                      : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {expired
                              ? "Expirée"
                              : statusLabels[reservation.status]}
                          </span>
                        </td>
                        <td className="max-w-xs p-4">
                          {reservation.notes || "—"}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-2">
                            {reservation.status === "pending" && !expired && (
                              <button
                                type="button"
                                onClick={() =>
                                  void changeStatus(reservation, "confirmed")
                                }
                                className="rounded-md border border-green-200 px-3 py-2 font-medium text-green-700 hover:bg-green-50"
                              >
                                Confirmer
                              </button>
                            )}

                            {(reservation.status === "pending" ||
                              reservation.status === "confirmed") && (
                              <button
                                type="button"
                                onClick={() =>
                                  void changeStatus(reservation, "cancelled")
                                }
                                className="rounded-md border border-red-200 px-3 py-2 font-medium text-red-700 hover:bg-red-50"
                              >
                                Annuler
                              </button>
                            )}

                            {reservation.status === "confirmed" &&
                              new Date(reservation.end_at) <= new Date() && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void changeStatus(reservation, "completed")
                                  }
                                  className="rounded-md border border-slate-300 px-3 py-2 font-medium hover:bg-slate-50"
                                >
                                  Terminer
                                </button>
                              )}

                            {reservation.status === "pending" && expired && (
                              <span className="text-xs text-red-700">
                                Confirmation impossible
                              </span>
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
      </div>
    </main>
  );
}
