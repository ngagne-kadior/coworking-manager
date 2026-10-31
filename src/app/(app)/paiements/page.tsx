"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import PaymentPanel from "@/components/PaymentPanel";
import {
  METHOD_LABELS,
  STATE_LABELS,
  STATE_STYLES,
  formatFCFA,
  paymentState,
  sumPayments,
  type PaymentMethod,
} from "@/lib/payments";

type Booking = {
  id: string;
  member_id: string;
  start_at: string;
  end_at: string;
  status: "confirmed" | "completed";
  price_amount: number | null;
  members: { full_name: string; photo_path: string | null } | null;
  spaces: { name: string } | null;
  payments: { amount: number }[] | null;
};

type PaymentRow = {
  id: string;
  amount: number;
  method: PaymentMethod;
  paid_at: string;
  note: string | null;
  members: { full_name: string; photo_path: string | null } | null;
  reservations: { start_at: string; spaces: { name: string } | null } | null;
};

type LoadResult = { bookings: Booking[]; payments: PaymentRow[]; error: string };

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const text = new Date(`${key}-01T00:00:00`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatSlot(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const day = s.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  const t = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${t(s)}–${t(e)}`;
}

async function load(month: string): Promise<LoadResult> {
  const start = new Date(`${month}-01T00:00:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  const [bookingRes, paymentRes] = await Promise.all([
    supabase
      .from("reservations")
      .select(
        "id, member_id, start_at, end_at, status, price_amount, members(full_name, photo_path), spaces(name), payments(amount)"
      )
      .in("status", ["confirmed", "completed"])
      .order("start_at", { ascending: false })
      .limit(1000),
    supabase
      .from("payments")
      .select(
        "id, amount, method, paid_at, note, members(full_name, photo_path), reservations(start_at, spaces(name))"
      )
      .gte("paid_at", start.toISOString())
      .lt("paid_at", end.toISOString())
      .order("paid_at", { ascending: false }),
  ]);

  const error = bookingRes.error ?? paymentRes.error;
  return {
    bookings: (bookingRes.data ?? []) as unknown as Booking[],
    payments: (paymentRes.data ?? []) as unknown as PaymentRow[],
    error: error ? `Impossible de charger les paiements : ${error.message}` : "",
  };
}

export default function PaiementsPage() {
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [tab, setTab] = useState<"due" | "received">("due");
  const [showUnpriced, setShowUnpriced] = useState(false);
  const [requestId, setRequestId] = useState(1);
  const [loadedId, setLoadedId] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [open, setOpen] = useState<Booking | null>(null);

  const loading = loadedId !== requestId;

  useEffect(() => {
    let active = true;
    load(month).then((data) => {
      if (!active) return;
      setResult(data);
      setLoadedId(requestId);
    });
    return () => {
      active = false;
    };
  }, [month, requestId]);

  const bookings = useMemo(() => result?.bookings ?? [], [result]);
  const payments = useMemo(() => result?.payments ?? [], [result]);

  const toCollect = useMemo(
    () =>
      bookings
        .map((b) => ({ booking: b, paid: sumPayments(b.payments) }))
        .filter(({ booking, paid }) => {
          const state = paymentState(booking.price_amount, paid);
          return state === "unpaid" || state === "partial" || (showUnpriced && state === "none");
        }),
    [bookings, showUnpriced]
  );

  const totalReceived = sumPayments(payments);
  const totalRemaining = bookings.reduce(
    (total, b) => total + Math.max((b.price_amount ?? 0) - sumPayments(b.payments), 0),
    0
  );
  const unpricedCount = bookings.filter((b) => b.price_amount === null).length;
  const byMethod = (Object.keys(METHOD_LABELS) as PaymentMethod[]).map((method) => ({
    method,
    total: sumPayments(payments.filter((p) => p.method === method)),
  }));

  return (
    <div className="text-slate-900">
      <div className="mx-auto max-w-7xl">
        <PageHeader
          title="Paiements"
          description="Encaissements, montants restant dus et réservations sans montant."
          actions={
            <label className="flex items-center gap-2 text-sm">
              <span className="text-slate-600">Mois</span>
              <input
                type="month"
                value={month}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setMonth(e.target.value);
                  setRequestId((id) => id + 1);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2"
              />
            </label>
          }
        />

        {result?.error && (
          <p role="alert" className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {result.error}
          </p>
        )}

        {/* Indicateurs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Encaissé · {monthLabel(month)}</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700">
              {loading && !result ? "—" : formatFCFA(totalReceived)}
            </p>
            <p className="mt-1 text-xs text-slate-400">{payments.length} paiement(s)</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Reste à encaisser (toutes dates)</p>
            <p className="mt-2 text-2xl font-bold text-amber-700">
              {loading && !result ? "—" : formatFCFA(totalRemaining)}
            </p>
            <p className="mt-1 text-xs text-slate-400">Réservations confirmées ou terminées</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Réservations sans montant</p>
            <p className="mt-2 text-2xl font-bold text-slate-700">{loading && !result ? "—" : unpricedCount}</p>
            <p className="mt-1 text-xs text-slate-400">Montant dû à définir</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {byMethod.map(({ method, total }) => (
            <div key={method} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs text-slate-500">{METHOD_LABELS[method]}</p>
              <p className="mt-1 text-sm font-semibold">{formatFCFA(total)}</p>
            </div>
          ))}
        </div>

        {/* Onglets */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {(
              [
                ["due", `À encaisser (${toCollect.length})`],
                ["received", `Encaissements du mois (${payments.length})`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                aria-pressed={tab === value}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  tab === value ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "due" && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={showUnpriced}
                onChange={(e) => setShowUnpriced(e.target.checked)}
                className="h-4 w-4"
              />
              Afficher aussi les réservations sans montant
            </label>
          )}
        </div>

        <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading && !result ? (
            <p className="p-6 text-sm text-slate-500">Chargement...</p>
          ) : tab === "due" ? (
            toCollect.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">Rien à encaisser. Tout est à jour.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {toCollect.map(({ booking, paid }) => {
                  const name = booking.members?.full_name ?? "Membre";
                  const state = paymentState(booking.price_amount, paid);
                  return (
                    <li key={booking.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar name={name} photoPath={booking.members?.photo_path} size="md" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{name}</p>
                          <p className="truncate text-sm text-slate-500">
                            {booking.spaces?.name ?? "Espace"} · {formatSlot(booking.start_at, booking.end_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 sm:justify-end">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_STYLES[state]}`}>
                          {STATE_LABELS[state]}
                        </span>
                        {booking.price_amount !== null && (
                          <span className="text-sm font-semibold text-amber-700">
                            Reste {formatFCFA(booking.price_amount - paid)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setOpen(booking)}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                        >
                          {booking.price_amount === null ? "Définir le montant" : "Encaisser"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          ) : payments.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">Aucun paiement enregistré en {monthLabel(month).toLowerCase()}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-4">Date</th>
                    <th className="p-4">Membre</th>
                    <th className="p-4">Réservation</th>
                    <th className="p-4">Moyen</th>
                    <th className="p-4 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap p-4 text-slate-600">
                        {new Date(p.paid_at).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Avatar name={p.members?.full_name ?? "?"} photoPath={p.members?.photo_path} size="sm" />
                          <span className="font-medium">{p.members?.full_name ?? "Membre"}</span>
                        </div>
                      </td>
                      <td className="p-4 text-slate-600">
                        {p.reservations
                          ? `${p.reservations.spaces?.name ?? "Espace"} · ${new Date(p.reservations.start_at).toLocaleDateString("fr-FR")}`
                          : "—"}
                        {p.note && <span className="block text-xs text-slate-400">{p.note}</span>}
                      </td>
                      <td className="p-4">{METHOD_LABELS[p.method]}</td>
                      <td className="p-4 text-right font-semibold">{formatFCFA(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td colSpan={4} className="p-4 font-semibold">
                      Total {monthLabel(month).toLowerCase()}
                    </td>
                    <td className="p-4 text-right font-bold text-emerald-700">{formatFCFA(totalReceived)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4"
          onClick={() => setOpen(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Encaisser"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:max-w-md sm:rounded-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{open.members?.full_name ?? "Membre"}</h2>
                <p className="text-sm text-slate-500">
                  {open.spaces?.name ?? "Espace"} · {formatSlot(open.start_at, open.end_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label="Fermer"
                className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <PaymentPanel
              reservationId={open.id}
              memberId={open.member_id}
              price={open.price_amount}
              canPay
              onChanged={() => setRequestId((id) => id + 1)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
