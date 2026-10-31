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

type SubscriptionDue = {
  id: string;
  member_id: string;
  plan_name: string;
  price_amount: number | null;
  ends_on: string | null;
  members: { full_name: string; photo_path: string | null } | null;
  spaces: { name: string } | null;
  payments: { amount: number }[] | null;
};

/** Élément à encaisser : une réservation ou un abonnement. */
type DueItem = {
  kind: "reservation" | "subscription";
  id: string;
  memberId: string;
  name: string;
  photo: string | null;
  detail: string;
  price: number | null;
  paid: number;
};

type PaymentRow = {
  id: string;
  amount: number;
  method: PaymentMethod;
  paid_at: string;
  note: string | null;
  members: { full_name: string; photo_path: string | null } | null;
  reservations: { start_at: string; spaces: { name: string } | null } | null;
  subscriptions: { plan_name: string; spaces: { name: string } | null } | null;
};

type LoadResult = {
  bookings: Booking[];
  subscriptions: SubscriptionDue[];
  payments: PaymentRow[];
  error: string;
};

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

  const [bookingRes, paymentRes, subRes] = await Promise.all([
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
        "id, amount, method, paid_at, note, members(full_name, photo_path), reservations(start_at, spaces(name)), subscriptions(plan_name, spaces(name))"
      )
      .gte("paid_at", start.toISOString())
      .lt("paid_at", end.toISOString())
      .order("paid_at", { ascending: false }),
    supabase
      .from("subscriptions")
      .select("id, member_id, plan_name, price_amount, ends_on, members(full_name, photo_path), spaces(name), payments(amount)")
      .eq("status", "active"),
  ]);

  const error = bookingRes.error ?? paymentRes.error ?? subRes.error;
  return {
    bookings: (bookingRes.data ?? []) as unknown as Booking[],
    subscriptions: (subRes.data ?? []) as unknown as SubscriptionDue[],
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
  const [open, setOpen] = useState<DueItem | null>(null);

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
  const subscriptions = useMemo(() => result?.subscriptions ?? [], [result]);
  const payments = useMemo(() => result?.payments ?? [], [result]);

  const dueItems = useMemo<DueItem[]>(
    () => [
      ...subscriptions.map((sub) => ({
        kind: "subscription" as const,
        id: sub.id,
        memberId: sub.member_id,
        name: sub.members?.full_name ?? "Membre",
        photo: sub.members?.photo_path ?? null,
        detail: `Abonnement « ${sub.plan_name} » · ${sub.spaces?.name ?? "Espace"}${
          sub.ends_on ? ` · jusqu'au ${new Date(`${sub.ends_on}T00:00:00`).toLocaleDateString("fr-FR")}` : ""
        }`,
        price: sub.price_amount,
        paid: sumPayments(sub.payments),
      })),
      ...bookings.map((b) => ({
        kind: "reservation" as const,
        id: b.id,
        memberId: b.member_id,
        name: b.members?.full_name ?? "Membre",
        photo: b.members?.photo_path ?? null,
        detail: `${b.spaces?.name ?? "Espace"} · ${formatSlot(b.start_at, b.end_at)}`,
        price: b.price_amount,
        paid: sumPayments(b.payments),
      })),
    ],
    [bookings, subscriptions]
  );

  const toCollect = useMemo(
    () =>
      dueItems.filter((item) => {
        const state = paymentState(item.price, item.paid);
        return state === "unpaid" || state === "partial" || (showUnpriced && state === "none");
      }),
    [dueItems, showUnpriced]
  );

  const totalReceived = sumPayments(payments);
  const totalRemaining = dueItems.reduce(
    (total, item) => total + Math.max((item.price ?? 0) - item.paid, 0),
    0
  );
  const unpricedCount = dueItems.filter((item) => item.price === null).length;
  const byMethod = (Object.keys(METHOD_LABELS) as PaymentMethod[]).map((method) => ({
    method,
    total: sumPayments(payments.filter((p) => p.method === method)),
  }));

  return (
    <div className="text-slate-900">
      <div className="mx-auto max-w-7xl">
        <PageHeader
          title="Paiements"
          description="Encaissements des réservations et des abonnements, et montants restant dus."
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
            <p className="mt-1 text-xs text-slate-400">Réservations et abonnements en cours</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Sans montant défini</p>
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
              Afficher aussi ce qui n&apos;a pas de montant
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
                {toCollect.map((item) => {
                  const state = paymentState(item.price, item.paid);
                  return (
                    <li key={`${item.kind}-${item.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar name={item.name} photoPath={item.photo} size="md" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{item.name}</p>
                          <p className="truncate text-sm text-slate-500">{item.detail}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                        {item.kind === "subscription" && (
                          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                            Abonnement
                          </span>
                        )}
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_STYLES[state]}`}>
                          {STATE_LABELS[state]}
                        </span>
                        {item.price !== null && (
                          <span className="text-sm font-semibold text-amber-700">
                            Reste {formatFCFA(item.price - item.paid)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setOpen(item)}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                        >
                          {item.price === null ? "Définir le montant" : "Encaisser"}
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
                    <th className="p-4">Objet</th>
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
                          : p.subscriptions
                            ? `Abonnement « ${p.subscriptions.plan_name} » · ${p.subscriptions.spaces?.name ?? "Espace"}`
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
                <h2 className="text-lg font-bold">{open.name}</h2>
                <p className="text-sm text-slate-500">{open.detail}</p>
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
              target={{ kind: open.kind, id: open.id }}
              memberId={open.memberId}
              price={open.price}
              canPay
              onChanged={() => setRequestId((id) => id + 1)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
