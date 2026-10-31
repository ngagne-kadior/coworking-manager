
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import { spacePhotoUrl } from "@/lib/photos";
import { formatFCFA, sumPayments } from "@/lib/payments";

type Member = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  photo_path: string | null;
};

type Space = {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  is_active: boolean;
  photo_path: string | null;
};

type Reservation = {
  id: string;
  member_id: string;
  space_id: string;
  start_at: string;
  end_at: string;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "expired";
  expires_at: string | null;
  members: { full_name: string; photo_path: string | null } | null;
  spaces: { name: string } | null;
};

const statusLabels: Record<string, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  cancelled: "Annulée",
  completed: "Terminée",
  expired: "Expirée",
};

const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
  completed: "bg-slate-100 text-slate-600",
  expired: "bg-orange-50 text-orange-700",
};

function startOfDay() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Home() {
  const router = useRouter();

  const [members, setMembers] = useState<Member[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [stats, setStats] = useState({
    activeMembers: 0,
    activeSpaces: 0,
    todayReservations: 0,
    occupancy: 0,
    occupiedSpaces: 0,
  });
  const [weeklyCounts, setWeeklyCounts] = useState<number[]>([
    0, 0, 0, 0, 0, 0, 0,
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [monthRevenue, setMonthRevenue] = useState<number | null>(null);

  // Encaissements du mois en cours (table payments)
  useEffect(() => {
    let active = true;
    const start = startOfDay();
    start.setDate(1);
    supabase
      .from("payments")
      .select("amount")
      .gte("paid_at", start.toISOString())
      .then(({ data, error }) => {
        if (active) setMonthRevenue(error ? null : sumPayments(data));
      });
    return () => {
      active = false;
    };
  }, [lastUpdated]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const now = new Date();
      const todayStart = startOfDay();
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);

      const weekStart = new Date(todayStart);
      const dayOfWeek = (weekStart.getDay() + 6) % 7;
      weekStart.setDate(weekStart.getDate() - dayOfWeek);

      const [
        memberCountResult,
        spaceResult,
        todayResult,
        occupiedResult,
        upcomingResult,
        recentMembersResult,
        weeklyResult,
      ] = await Promise.all([
        supabase
          .from("members")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true),

        supabase
          .from("spaces")
          .select("id, name, description, capacity, is_active, photo_path")
          .order("name"),

        supabase
          .from("reservations")
          .select("id", { count: "exact", head: true })
          .gte("start_at", todayStart.toISOString())
          .lt("start_at", tomorrowStart.toISOString())
          .in("status", ["confirmed", "completed"]),

        supabase
          .from("reservations")
          .select("space_id")
          .eq("status", "confirmed")
          .lte("start_at", now.toISOString())
          .gt("end_at", now.toISOString()),

        supabase
          .from("reservations")
          .select(
            "id, member_id, space_id, start_at, end_at, status, expires_at, members(full_name, photo_path), spaces(name)"
          )
          .in("status", ["pending", "confirmed"])
          .gte("start_at", now.toISOString())
          .order("start_at", { ascending: true })
          .limit(6),

        supabase
          .from("members")
          .select("id, full_name, email, phone, is_active, created_at, photo_path")
          .order("created_at", { ascending: false })
          .limit(5),

        supabase
          .from("reservations")
          .select("start_at")
          .gte("start_at", weekStart.toISOString())
          .lt(
            "start_at",
            new Date(
              weekStart.getFullYear(),
              weekStart.getMonth(),
              weekStart.getDate() + 7
            ).toISOString()
          )
          .in("status", ["confirmed", "completed"]),
      ]);

      const firstError = [
        memberCountResult.error,
        spaceResult.error,
        todayResult.error,
        occupiedResult.error,
        upcomingResult.error,
        recentMembersResult.error,
        weeklyResult.error,
      ].find(Boolean);

      if (firstError) {
        throw firstError;
      }

      const allSpaces = (spaceResult.data ?? []) as Space[];
      const activeSpaces = allSpaces.filter((space) => space.is_active);
      const occupiedSpaceIds = new Set(
        (occupiedResult.data ?? []).map((item) => item.space_id)
      );

      const occupiedActiveCount = activeSpaces.filter((space) =>
        occupiedSpaceIds.has(space.id)
      ).length;

      const occupancy = activeSpaces.length
        ? Math.round((occupiedActiveCount / activeSpaces.length) * 100)
        : 0;

      const counts = Array(7).fill(0) as number[];

      for (const reservation of weeklyResult.data ?? []) {
        const date = new Date(reservation.start_at);
        const index = (date.getDay() + 6) % 7;
        counts[index] += 1;
      }

      setStats({
        activeMembers: memberCountResult.count ?? 0,
        activeSpaces: activeSpaces.length,
        todayReservations: todayResult.count ?? 0,
        occupancy,
        occupiedSpaces: occupiedActiveCount,
      });

      setSpaces(allSpaces);
      setMembers((recentMembersResult.data ?? []) as Member[]);
      setReservations((upcomingResult.data ?? []) as unknown as Reservation[]);
      setWeeklyCounts(counts);
      setLastUpdated(
        new Date().toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    } catch (err) {
      console.error("Erreur du tableau de bord :", err);
      setError(
        "Impossible de charger toutes les données. Vérifie la connexion Supabase et les autorisations."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Chargement initial des données depuis Supabase. L'état « loading »
    // vaut déjà true au premier rendu : le setLoading(true) synchrone de
    // loadDashboard ne provoque aucun rendu supplémentaire.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard();
  }, [loadDashboard]);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredMembers = members.filter((member) =>
    `${member.full_name} ${member.email ?? ""} ${member.phone ?? ""}`
      .toLowerCase()
      .includes(normalizedSearch)
  );

  const filteredSpaces = spaces
    .filter((space) => space.is_active)
    .filter((space) =>
      `${space.name} ${space.description ?? ""}`
        .toLowerCase()
        .includes(normalizedSearch)
    )
    .slice(0, 4);

  const maxWeeklyCount = Math.max(...weeklyCounts, 1);
  const weekdayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  return (
    <div className="text-slate-800">
        <PageHeader
          title="Tableau de bord"
          description="Vue d’ensemble de ton espace de coworking."
          actions={
            <>
            <div className="relative w-full sm:w-auto">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                ⌕
              </span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un membre ou un espace..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none transition focus:border-blue-400 focus:bg-white sm:w-64 md:w-80"
              />
            </div>

            <button
              onClick={() => void loadDashboard()}
              disabled={loading}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Chargement..." : "↻ Actualiser"}
            </button>
            </>
          }
        />

        <div className="space-y-7">
          <section
            className="relative isolate overflow-hidden rounded-3xl bg-[#16294b] bg-cover bg-center px-6 py-8 text-white shadow-sm sm:px-9 sm:py-10"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(15,29,55,.96) 0%, rgba(15,29,55,.84) 52%, rgba(15,29,55,.25) 100%), url('https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=85')",
            }}
          >
            <div className="relative max-w-xl">
              <span className="inline-flex rounded-full border border-blue-300/30 bg-blue-400/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-200">
                Vue générale
              </span>
              <h2 className="mt-4 text-2xl font-bold leading-tight sm:text-3xl">
                Bonjour et bienvenue !
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-6 text-slate-200">
                Pilote ton espace de coworking, suis les réservations et
                retrouve les informations essentielles de ton activité.
              </p>
              <button
                onClick={() => router.push("/reservations/calendrier")}
                className="mt-6 rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition hover:bg-blue-400"
              >
                Ouvrir le calendrier <span className="ml-2">→</span>
              </button>
            </div>
          </section>

          {error && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              <p>{error}</p>
              <button
                onClick={() => void loadDashboard()}
                className="font-semibold underline"
              >
                Réessayer
              </button>
            </div>
          )}

          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Vue d’ensemble
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Indicateurs calculés à partir des données enregistrées
                </p>
              </div>
              <p className="text-xs text-slate-400">
                {lastUpdated ? `Mis à jour à ${lastUpdated}` : " "}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard
                title="Membres actifs"
                value={stats.activeMembers}
                icon="♙"
                description="Membres actuellement actifs"
                color="blue"
                loading={loading}
              />
              <StatCard
                title="Espaces actifs"
                value={stats.activeSpaces}
                icon="▤"
                description="Espaces disponibles dans le système"
                color="violet"
                loading={loading}
              />
              <StatCard
                title="Réservations du jour"
                value={stats.todayReservations}
                icon="▣"
                description="Confirmées ou terminées"
                color="orange"
                loading={loading}
              />
              <StatCard
                title="Occupation actuelle"
                value={`${stats.occupancy}%`}
                icon="◷"
                description={`${stats.occupiedSpaces} espace(s) occupé(s) sur ${stats.activeSpaces}`}
                color="green"
                loading={loading}
              />
              <StatCard
                title="Encaissé ce mois"
                value={monthRevenue === null ? "—" : formatFCFA(monthRevenue)}
                icon="₣"
                description="Paiements enregistrés depuis le 1er"
                color="green"
                loading={loading}
              />
            </div>
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.5fr_1fr]">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900">
                    Activité de la semaine
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Nombre de réservations par jour
                  </p>
                </div>
                <span className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                  Cette semaine
                </span>
              </div>

              <div className="mt-7 grid h-52 grid-cols-7 gap-3">
                {weeklyCounts.map((count, index) => {
                  const height =
                    count === 0
                      ? 4
                      : Math.max(10, (count / maxWeeklyCount) * 100);

                  return (
                    <div
                      key={weekdayLabels[index]}
                      className="flex min-w-0 flex-col items-center justify-end gap-2"
                    >
                      <span className="text-[10px] font-semibold text-slate-500">
                        {count}
                      </span>
                      <div className="flex h-36 w-full items-end justify-center rounded-t-lg bg-slate-50">
                        <div
                          title={`${count} réservation(s)`}
                          className={`w-full max-w-9 rounded-t-md transition-all ${
                            index === (new Date().getDay() + 6) % 7
                              ? "bg-blue-600"
                              : "bg-blue-300"
                          }`}
                          style={{ height: `${height}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 sm:text-xs">
                        {weekdayLabels[index]}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-slate-400">
                Les réservations sont regroupées selon leur date de début.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
              <h3 className="font-bold text-slate-900">
                Occupation des espaces
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Situation à l’instant présent
              </p>

              <div className="flex flex-col items-center py-6">
                <div
                  className="relative flex h-40 w-40 items-center justify-center rounded-full"
                  style={{
                    background: `conic-gradient(#3678f6 ${stats.occupancy}%, #e8eef7 ${stats.occupancy}% 100%)`,
                  }}
                >
                  <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white">
                    <span className="text-3xl font-bold text-slate-900">
                      {loading ? "—" : `${stats.occupancy}%`}
                    </span>
                    <span className="mt-1 text-[10px] text-slate-500">
                      Occupation
                    </span>
                  </div>
                </div>

                <div className="mt-6 grid w-full grid-cols-2 gap-3">
                  <div className="rounded-xl bg-blue-50 p-3">
                    <p className="text-xs text-slate-500">Occupés</p>
                    <p className="mt-1 text-xl font-bold text-blue-700">
                      {loading ? "—" : stats.occupiedSpaces}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Disponibles</p>
                    <p className="mt-1 text-xl font-bold text-slate-700">
                      {loading
                        ? "—"
                        : Math.max(
                            0,
                            stats.activeSpaces - stats.occupiedSpaces
                          )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 sm:px-6">
              <div>
                <h3 className="font-bold text-slate-900">
                  Prochaines réservations
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Les prochaines réservations confirmées
                </p>
              </div>
              <button
                onClick={() => router.push("/reservations")}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                Tout voir →
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Membre</th>
                    <th className="px-6 py-4 font-semibold">Espace</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold">Horaire</th>
                    <th className="px-6 py-4 font-semibold">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-10 text-center text-slate-400"
                      >
                        Chargement des réservations...
                      </td>
                    </tr>
                  ) : reservations.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-10 text-center text-slate-400"
                      >
                        Aucune réservation à venir.
                      </td>
                    </tr>
                  ) : (
                    reservations.map((reservation) => (
                      <tr
                        key={reservation.id}
                        className="transition hover:bg-slate-50/70"
                      >
                        <td className="px-6 py-4 font-medium text-slate-800">
                          <div className="flex items-center gap-3">
                            <Avatar
                              name={reservation.members?.full_name ?? "?"}
                              photoPath={reservation.members?.photo_path}
                              size="sm"
                            />
                            {reservation.members?.full_name ?? "Membre inconnu"}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {reservation.spaces?.name ?? "Espace inconnu"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {formatDate(reservation.start_at)}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {formatTime(reservation.start_at)} –{" "}
                          {formatTime(reservation.end_at)}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              statusStyles[reservation.status] ??
                              "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {statusLabels[reservation.status] ??
                              reservation.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <div>
                  <h3 className="font-bold text-slate-900">
                    Membres récemment ajoutés
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Les derniers profils enregistrés
                  </p>
                </div>
                <button
                  onClick={() => router.push("/members")}
                  className="text-xs font-semibold text-blue-600"
                >
                  Gérer →
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {loading ? (
                  <p className="p-6 text-sm text-slate-400">Chargement...</p>
                ) : filteredMembers.length === 0 ? (
                  <p className="p-6 text-sm text-slate-400">
                    Aucun membre correspondant.
                  </p>
                ) : (
                  filteredMembers.slice(0, 5).map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 px-5 py-4"
                    >
                      <Avatar name={member.full_name} photoPath={member.photo_path} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {member.full_name}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {member.email || member.phone || "Aucun contact"}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                          member.is_active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {member.is_active ? "Actif" : "Inactif"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <div>
                  <h3 className="font-bold text-slate-900">
                    Espaces de coworking
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Les espaces actuellement actifs
                  </p>
                </div>
                <button
                  onClick={() => router.push("/spaces")}
                  className="text-xs font-semibold text-blue-600"
                >
                  Gérer →
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
                {loading ? (
                  <p className="text-sm text-slate-400">Chargement...</p>
                ) : filteredSpaces.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    Aucun espace actif correspondant.
                  </p>
                ) : (
                  filteredSpaces.map((space) => (
                    <div
                      key={space.id}
                      className="overflow-hidden rounded-xl border border-slate-100 transition hover:border-blue-200 hover:shadow-sm"
                    >
                      <SpaceCover space={space} />
                      <div className="p-4">
                        <p className="font-semibold text-slate-800">
                          {space.name}
                        </p>
                        <p className="mt-1 line-clamp-2 min-h-8 text-xs text-slate-500">
                          {space.description || "Espace de travail"}
                        </p>
                        <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                          Capacité :{" "}
                          <span className="font-semibold text-slate-800">
                            {space.capacity}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-2 pb-3 text-xs text-slate-400">
            <p>© {new Date().getFullYear()} Coworking Manager</p>
            <p>Gestion des membres, espaces et réservations</p>
          </footer>
        </div>

    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  description,
  color,
  loading,
}: {
  title: string;
  value: string | number;
  icon: string;
  description: string;
  color: "blue" | "violet" | "orange" | "green";
  loading: boolean;
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    violet: "bg-violet-50 text-violet-600",
    orange: "bg-orange-50 text-orange-600",
    green: "bg-emerald-50 text-emerald-600",
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
            {loading ? "—" : value}
          </p>
        </div>
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl ${colors[color]}`}
        >
          {icon}
        </div>
      </div>
      <p className="mt-4 text-[11px] leading-5 text-slate-500">
        {description}
      </p>
    </div>
  );
}

function SpaceCover({ space }: { space: Space }) {
  const url = spacePhotoUrl(space.photo_path);
  if (!url) {
    return (
      <div className="flex h-28 items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 text-xs font-medium text-slate-400">
        Pas encore de photo
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- image Supabase Storage
    <img src={url} alt={`Photo de ${space.name}`} className="h-28 w-full object-cover" />
  );
}
