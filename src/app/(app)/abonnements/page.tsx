"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import PaymentPanel from "@/components/PaymentPanel";
import {
  STATE_LABELS,
  STATE_STYLES,
  formatFCFA,
  parseAmount,
  paymentState,
  sumPayments,
} from "@/lib/payments";
import { EXPIRY_ALERT_DAYS, localDateKey } from "@/lib/subscriptions";

type Member = { id: string; full_name: string };
type Space = {
  id: string;
  name: string;
  capacity: number;
  is_active: boolean;
  booking_mode: "whole" | "seats";
};

type Subscription = {
  id: string;
  member_id: string;
  space_id: string;
  plan_name: string;
  start_month: string;
  months: number;
  day_from: number;
  day_to: number;
  time_from: string;
  time_to: string;
  seats: number;
  price_amount: number | null;
  status: "active" | "cancelled";
  ends_on: string | null;
  sessions: number;
  notes: string | null;
  members: { full_name: string; photo_path: string | null } | null;
  spaces: { name: string } | null;
  payments: { amount: number }[] | null;
};

type LoadResult = {
  members: Member[];
  spaces: Space[];
  subscriptions: Subscription[];
  error: string;
};

const PLAN_SUGGESTIONS = ["Résident mensuel", "Pack 10 jours", "10 premiers jours du mois"];

const HOURS = Array.from({ length: (22 - 7) * 2 + 1 }, (_, i) => {
  const minutes = 7 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

const fieldClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600";

const todayKey = () => localDateKey();

function nextMonthKey() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthName(value: string) {
  return new Date(`${value.slice(0, 7)}-01T00:00:00`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
}

function addMonths(value: string, months: number) {
  const d = new Date(`${value.slice(0, 7)}-01T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysUntil(dateKey: string) {
  const target = new Date(`${dateKey}T00:00:00`).getTime();
  const today = new Date(`${todayKey()}T00:00:00`).getTime();
  return Math.round((target - today) / 86_400_000);
}

function formatDay(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("fr-FR");
}

/** Nombre de journées à venir que l'abonnement va générer (aperçu). */
function previewSessions(startMonth: string, months: number, dayFrom: number, dayTo: number, timeFrom: string) {
  let count = 0;
  let first: Date | null = null;
  let last: Date | null = null;
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const month = addMonths(startMonth, i);
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    for (let d = dayFrom; d <= Math.min(dayTo, lastDay); d++) {
      const start = new Date(`${month}-${String(d).padStart(2, "0")}T${timeFrom}:00`);
      if (start > now) {
        count++;
        first ??= start;
        last = start;
      }
    }
  }
  return { count, first, last };
}

type Badge = { label: string; style: string };

function statusBadge(sub: Subscription): Badge {
  if (sub.status === "cancelled") return { label: "Annulé", style: "bg-slate-100 text-slate-500" };
  if (!sub.ends_on) return { label: "Actif", style: "bg-emerald-50 text-emerald-700" };
  const left = daysUntil(sub.ends_on);
  if (left < 0) return { label: "Terminé", style: "bg-slate-100 text-slate-600" };
  if (left <= EXPIRY_ALERT_DAYS) {
    return {
      label: left === 0 ? "Se termine aujourd'hui" : `Se termine dans ${left} j`,
      style: "bg-amber-50 text-amber-800",
    };
  }
  return { label: "Actif", style: "bg-emerald-50 text-emerald-700" };
}

async function load(): Promise<LoadResult> {
  const [memberRes, spaceRes, subRes] = await Promise.all([
    supabase.from("members").select("id, full_name").eq("is_active", true).order("full_name"),
    supabase.from("spaces").select("id, name, capacity, is_active, booking_mode").eq("is_active", true).order("name"),
    supabase
      .from("subscriptions")
      .select(
        "id, member_id, space_id, plan_name, start_month, months, day_from, day_to, time_from, time_to, seats, price_amount, status, ends_on, sessions, notes, members(full_name, photo_path), spaces(name), payments(amount)"
      )
      .order("created_at", { ascending: false }),
  ]);
  const error = memberRes.error ?? spaceRes.error ?? subRes.error;
  return {
    members: (memberRes.data ?? []) as Member[],
    spaces: (spaceRes.data ?? []) as Space[],
    subscriptions: (subRes.data ?? []) as unknown as Subscription[],
    error: error ? `Impossible de charger les abonnements : ${error.message}` : "",
  };
}

export default function AbonnementsPage() {
  const [requestId, setRequestId] = useState(1);
  const [loadedId, setLoadedId] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [filter, setFilter] = useState<"current" | "all">("current");
  const [paying, setPaying] = useState<Subscription | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Formulaire
  const [memberId, setMemberId] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [planName, setPlanName] = useState("");
  const [startMonth, setStartMonth] = useState(nextMonthKey);
  const [months, setMonths] = useState(1);
  const [dayFrom, setDayFrom] = useState(1);
  const [dayTo, setDayTo] = useState(10);
  const [timeFrom, setTimeFrom] = useState("08:00");
  const [timeTo, setTimeTo] = useState("18:00");
  const [seats, setSeats] = useState(1);
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");

  const loading = loadedId !== requestId;

  useEffect(() => {
    let active = true;
    load().then((data) => {
      if (!active) return;
      setResult(data);
      setLoadedId(requestId);
    });
    return () => {
      active = false;
    };
  }, [requestId]);

  const members = useMemo(() => result?.members ?? [], [result]);
  const spaces = useMemo(() => result?.spaces ?? [], [result]);
  const subscriptions = useMemo(() => result?.subscriptions ?? [], [result]);

  const selectedMember = memberId || members[0]?.id || "";
  const selectedSpace = spaces.find((s) => s.id === (spaceId || spaces[0]?.id));
  const shared = selectedSpace?.booking_mode === "seats";

  const preview = previewSessions(startMonth, months, dayFrom, dayTo, timeFrom);

  const expiring = subscriptions.filter((sub) => {
    if (sub.status !== "active" || !sub.ends_on) return false;
    const left = daysUntil(sub.ends_on);
    return left >= 0 && left <= EXPIRY_ALERT_DAYS;
  });

  const visible = subscriptions.filter(
    (sub) => filter === "all" || (sub.status === "active" && (!sub.ends_on || daysUntil(sub.ends_on) >= 0))
  );

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedMember || !selectedSpace) {
      setError("Choisis un membre et un espace.");
      return;
    }
    if (!planName.trim()) {
      setError("Donne un nom à la formule (ex. « Résident mensuel »).");
      return;
    }
    if (dayTo < dayFrom) {
      setError("Le dernier jour doit être après le premier.");
      return;
    }
    if (timeTo <= timeFrom) {
      setError("L'heure de fin doit être après l'heure de début.");
      return;
    }
    if (preview.count === 0) {
      setError("Aucune journée à venir dans cette période.");
      return;
    }

    setSaving(true);
    const { error: rpcError } = await supabase.rpc("create_subscription", {
      p_member_id: selectedMember,
      p_space_id: selectedSpace.id,
      p_plan_name: planName.trim(),
      p_start_month: `${startMonth}-01`,
      p_months: months,
      p_day_from: dayFrom,
      p_day_to: dayTo,
      p_time_from: timeFrom,
      p_time_to: timeTo,
      p_seats: shared ? seats : 1,
      p_price_amount: parseAmount(price),
      p_notes: notes.trim() || null,
    });
    setSaving(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const memberName = members.find((m) => m.id === selectedMember)?.full_name ?? "le membre";
    setSuccess(
      `Abonnement créé pour ${memberName} : ${preview.count} journée(s) réservée(s) automatiquement dans le calendrier.`
    );
    setPlanName("");
    setPrice("");
    setNotes("");
    setRequestId((id) => id + 1);
  }

  async function cancel(sub: Subscription) {
    if (
      !window.confirm(
        `Annuler l'abonnement « ${sub.plan_name} » de ${sub.members?.full_name ?? "ce membre"} ? Toutes ses journées à venir seront libérées.`
      )
    ) {
      return;
    }
    setError("");
    setSuccess("");
    setBusyId(sub.id);
    const { data, error: rpcError } = await supabase.rpc("cancel_subscription", { p_id: sub.id });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setSuccess(`Abonnement annulé : ${data ?? 0} journée(s) à venir libérée(s).`);
    setRequestId((id) => id + 1);
  }

  return (
    <div className="text-slate-900">
      <div className="mx-auto max-w-7xl">
        <PageHeader
          title="Abonnements"
          description="Les journées d'un abonnement sont réservées automatiquement : l'abonné n'a rien à réserver."
        />

        {expiring.length > 0 && (
          <section
            role="status"
            className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900"
          >
            <h2 className="font-semibold">
              {expiring.length} abonnement(s) se terminent dans {EXPIRY_ALERT_DAYS} jours ou moins
            </h2>
            <ul className="mt-2 space-y-1 text-sm">
              {expiring.map((sub) => (
                <li key={sub.id}>
                  <strong>{sub.members?.full_name}</strong> · {sub.plan_name} · {sub.spaces?.name} — fin le{" "}
                  {formatDay(sub.ends_on!)}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs">Pense à proposer un renouvellement.</p>
          </section>
        )}

        {result?.error && (
          <p role="alert" className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {result.error}
          </p>
        )}
        {error && (
          <p role="alert" className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="mb-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">
            {success}
          </p>
        )}

        {/* Nouvel abonnement */}
        <form onSubmit={create} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Nouvel abonnement</h2>

          {members.length === 0 || spaces.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              {loading ? "Chargement..." : "Il faut au moins un membre actif et un espace actif."}
            </p>
          ) : (
            <>
              <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Membre</span>
                  <select value={selectedMember} onChange={(e) => setMemberId(e.target.value)} className={fieldClass}>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Espace</span>
                  <select
                    value={selectedSpace?.id ?? ""}
                    onChange={(e) => {
                      setSpaceId(e.target.value);
                      setSeats(1);
                    }}
                    className={fieldClass}
                  >
                    {spaces.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.booking_mode === "seats" ? `${s.capacity} places` : "espace entier"})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Formule</span>
                  <input
                    list="plan-suggestions"
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    placeholder="Ex. Résident mensuel"
                    className={fieldClass}
                  />
                  <datalist id="plan-suggestions">
                    {PLAN_SUGGESTIONS.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Premier mois</span>
                  <input
                    type="month"
                    value={startMonth}
                    onChange={(e) => e.target.value && setStartMonth(e.target.value)}
                    className={fieldClass}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Durée</span>
                  <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className={fieldClass}>
                    {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n} mois
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Du jour</span>
                    <select value={dayFrom} onChange={(e) => setDayFrom(Number(e.target.value))} className={fieldClass}>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Au jour</span>
                    <select value={dayTo} onChange={(e) => setDayTo(Number(e.target.value))} className={fieldClass}>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">De</span>
                    <select value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} className={fieldClass}>
                      {HOURS.slice(0, -1).map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">À</span>
                    <select value={timeTo} onChange={(e) => setTimeTo(e.target.value)} className={fieldClass}>
                      {HOURS.slice(1).map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {shared && selectedSpace && (
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Places</span>
                    <input
                      type="number"
                      min={1}
                      max={selectedSpace.capacity}
                      value={seats}
                      onChange={(e) =>
                        setSeats(Math.min(Math.max(Number(e.target.value) || 1, 1), selectedSpace.capacity))
                      }
                      className={fieldClass}
                    />
                  </label>
                )}
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Prix total (F CFA)</span>
                  <input
                    inputMode="numeric"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="Ex. 90 000 (vide = à définir)"
                    className={fieldClass}
                  />
                </label>
              </div>

              <label className="mt-4 block text-sm">
                <span className="mb-1 block font-medium">Notes (facultatif)</span>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldClass} />
              </label>

              <p className="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">
                {preview.count > 0 ? (
                  <>
                    <strong>{preview.count} journée(s)</strong> seront réservées, du{" "}
                    {preview.first?.toLocaleDateString("fr-FR")} au {preview.last?.toLocaleDateString("fr-FR")}, de{" "}
                    {timeFrom} à {timeTo}
                    {shared ? `, ${seats} place(s)` : ", espace entier"}.
                    {months > 1 && ` Jours ${dayFrom} à ${dayTo} de chaque mois, de ${monthName(startMonth)} à ${monthName(addMonths(startMonth, months - 1))}.`}
                  </>
                ) : (
                  "Aucune journée à venir dans cette période."
                )}
              </p>

              <button
                type="submit"
                disabled={saving || preview.count === 0}
                className="mt-4 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {saving ? "Création..." : "Créer l'abonnement"}
              </button>
              <p className="mt-2 text-xs text-slate-500">
                Si une seule journée est déjà prise, rien n&apos;est créé et la date en conflit est indiquée.
              </p>
            </>
          )}
        </form>

        {/* Liste */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Abonnements</h2>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {(
              [
                ["current", "En cours"],
                ["all", "Tous"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
                  filter === value ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading && !result ? (
            <p className="p-6 text-sm text-slate-500">Chargement...</p>
          ) : visible.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">Aucun abonnement {filter === "current" ? "en cours" : ""}.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map((sub) => {
                const badge = statusBadge(sub);
                const paid = sumPayments(sub.payments);
                const pay = paymentState(sub.price_amount, paid);
                const name = sub.members?.full_name ?? "Membre";
                return (
                  <li key={sub.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <Avatar name={name} photoPath={sub.members?.photo_path} size="md" />
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {name} <span className="font-normal text-slate-500">· {sub.plan_name}</span>
                        </p>
                        <p className="mt-0.5 text-sm text-slate-600">
                          {sub.spaces?.name} · jours {sub.day_from} à {sub.day_to} · {sub.time_from.slice(0, 5)}–
                          {sub.time_to.slice(0, 5)}
                          {sub.seats > 1 && ` · ${sub.seats} places`}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {sub.months} mois à partir de {monthName(sub.start_month)} · {sub.sessions} journée(s)
                          {sub.ends_on && ` · fin le ${formatDay(sub.ends_on)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge.style}`}>
                        {badge.label}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_STYLES[pay]}`}>
                        {STATE_LABELS[pay]}
                        {sub.price_amount !== null && pay !== "paid" && ` · reste ${formatFCFA(sub.price_amount - paid)}`}
                      </span>
                      {sub.status === "active" && (
                        <>
                          <button
                            type="button"
                            onClick={() => setPaying(sub)}
                            className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                          >
                            Paiement
                          </button>
                          <button
                            type="button"
                            disabled={busyId === sub.id}
                            onClick={() => void cancel(sub)}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            Annuler
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {paying && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4"
          onClick={() => setPaying(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Paiement de l'abonnement"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:max-w-md sm:rounded-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{paying.members?.full_name}</h2>
                <p className="text-sm text-slate-500">
                  {paying.plan_name} · {paying.spaces?.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaying(null)}
                aria-label="Fermer"
                className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <PaymentPanel
              target={{ kind: "subscription", id: paying.id }}
              memberId={paying.member_id}
              price={paying.price_amount}
              canPay
              onChanged={() => setRequestId((id) => id + 1)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
