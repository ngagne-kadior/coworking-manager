"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/AppShell";
import { PUBLIC_PATH, whatsappLink } from "@/lib/public";
import { formatFCFA, parseAmount, suggestPrice, sumPayments, type SpaceRate } from "@/lib/payments";
import {
  confirmationMessage,
  DECLINE_REASONS,
  declineMessage,
  declineSentence,
  formatDay,
  mailtoLink,
  paymentReceiptMessage,
  type DeclineKey,
  type RequestInfo,
} from "@/lib/requestMessages";

type RequestStatus = "new" | "contacted" | "converted" | "declined";

type BookingRequest = {
  id: string;
  space_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  desired_date: string;
  start_time: string;
  end_time: string;
  people: number;
  message: string | null;
  status: RequestStatus;
  created_at: string;
  reservation_id: string | null;
  decline_reason: string | null;
  spaces: { name: string; booking_mode: "whole" | "seats"; capacity: number } | null;
};

type Availability = {
  mode: "whole" | "seats";
  active: boolean;
  capacity: number;
  peak: number;
  free: number;
  available: boolean;
  conflicts: { start_at: string; end_at: string; seats: number; member: string }[];
};

type DayBooking = { start_at: string; end_at: string; seats: number; members: { full_name: string } | null };

type Money = { due: number | null; paid: number };

type Dialog =
  | { kind: "accept"; request: BookingRequest }
  | { kind: "decline"; request: BookingRequest }
  | { kind: "message"; request: BookingRequest; title: string; subject: string; text: string };

const STATUS: Record<RequestStatus, { label: string; style: string }> = {
  new: { label: "Nouvelle", style: "bg-blue-100 text-blue-800" },
  contacted: { label: "Client contacté", style: "bg-amber-50 text-amber-800" },
  converted: { label: "Réservation créée", style: "bg-emerald-50 text-emerald-700" },
  declined: { label: "Refusée", style: "bg-slate-100 text-slate-500" },
};

const DAY_START = 7 * 60;
const DAY_END = 22 * 60;

/** Le Sénégal est à UTC+0 toute l'année : même calcul que dans la base. */
function instant(date: string, time: string) {
  return `${date}T${time.slice(0, 5)}:00+00:00`;
}

function minutesOf(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dakar" });
}

function minutesOfIso(iso: string, date: string) {
  const d = new Date(iso).getTime();
  const base = new Date(`${date}T00:00:00+00:00`).getTime();
  return Math.round((d - base) / 60000);
}

function infoOf(r: BookingRequest): RequestInfo {
  return {
    full_name: r.full_name,
    space: r.spaces?.name ?? "l'espace",
    desired_date: r.desired_date,
    start_time: r.start_time,
    end_time: r.end_time,
    people: r.people,
  };
}

export default function DemandesPage() {
  const [requestId, setRequestId] = useState(1);
  const [loadedId, setLoadedId] = useState(0);
  const [rows, setRows] = useState<BookingRequest[]>([]);
  const [rates, setRates] = useState<SpaceRate[]>([]);
  const [money, setMoney] = useState<Record<string, Money>>({});
  const [settings, setSettings] = useState<{ coworking_name: string; payment_instructions: string | null }>({
    coworking_name: "Coworking",
    payment_instructions: null,
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [origin, setOrigin] = useState("");

  const loading = loadedId !== requestId;

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase
        .from("booking_requests")
        .select(
          "id, space_id, full_name, phone, email, desired_date, start_time, end_time, people, message, status, created_at, reservation_id, decline_reason, spaces(name, booking_mode, capacity)"
        )
        .order("created_at", { ascending: false })
        .limit(300),
      supabase.from("app_settings").select("coworking_name, payment_instructions").maybeSingle(),
      supabase.from("space_rates").select("space_id, unit, price"),
    ]).then(async ([reqRes, setRes, rateRes]) => {
      if (!active) return;
      const list = (reqRes.data ?? []) as unknown as BookingRequest[];
      const ids = list.map((r) => r.reservation_id).filter((id): id is string => Boolean(id));
      const nextMoney: Record<string, Money> = {};
      if (ids.length) {
        const [resv, pays] = await Promise.all([
          supabase.from("reservations").select("id, price_amount").in("id", ids),
          supabase.from("payments").select("reservation_id, amount").in("reservation_id", ids),
        ]);
        const payRows = (pays.data ?? []) as { reservation_id: string; amount: number }[];
        for (const r of (resv.data ?? []) as { id: string; price_amount: number | null }[]) {
          nextMoney[r.id] = { due: r.price_amount, paid: sumPayments(payRows.filter((p) => p.reservation_id === r.id)) };
        }
      }
      if (!active) return;
      const missingSql =
        Boolean(reqRes.error?.message.includes("reservation_id") || reqRes.error?.message.includes("decline_reason")) ||
        Boolean(setRes.error?.message.includes("payment_instructions"));
      setError(
        missingSql
          ? "Le SQL « traitement des demandes » n'a pas encore été exécuté dans Supabase."
          : reqRes.error
            ? `Impossible de charger les demandes : ${reqRes.error.message}`
            : ""
      );
      setRows(list);
      setMoney(nextMoney);
      setRates((rateRes.data ?? []) as SpaceRate[]);
      if (setRes.data) setSettings(setRes.data as { coworking_name: string; payment_instructions: string | null });
      setOrigin(window.location.origin);
      setLoadedId(requestId);
    });
    return () => {
      active = false;
    };
  }, [requestId]);

  const reload = () => setRequestId((id) => id + 1);

  const visible = useMemo(
    () => rows.filter((r) => filter === "all" || r.status === "new" || r.status === "contacted"),
    [rows, filter]
  );
  const newCount = rows.filter((r) => r.status === "new").length;

  async function markContacted(row: BookingRequest) {
    setBusyId(row.id);
    const { data: auth } = await supabase.auth.getUser();
    const { error: updateError } = await supabase
      .from("booking_requests")
      .update({ status: "contacted", handled_by: auth.user?.id ?? null })
      .eq("id", row.id);
    setBusyId(null);
    if (updateError) {
      setError(`Mise à jour impossible : ${updateError.message}`);
      return;
    }
    setRows((current) => current.map((r) => (r.id === row.id ? { ...r, status: "contacted" } : r)));
  }

  function openConfirmation(r: BookingRequest, amount: number | null) {
    setDialog({
      kind: "message",
      request: r,
      title: "Envoyer la confirmation au client",
      subject: `Réservation confirmée – ${settings.coworking_name}`,
      text: confirmationMessage(infoOf(r), {
        coworking: settings.coworking_name,
        amount,
        paymentInstructions: settings.payment_instructions,
      }),
    });
  }

  function openDeclineMessage(r: BookingRequest, reason: string, title: string) {
    setDialog({
      kind: "message",
      request: r,
      title,
      subject: `Votre demande – ${settings.coworking_name}`,
      text: declineMessage(infoOf(r), {
        coworking: settings.coworking_name,
        reason,
        publicUrl: `${origin}${PUBLIC_PATH}`,
      }),
    });
  }

  return (
    <div className="text-slate-900">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Demandes des clients"
          description="Vérifie la disponibilité, accepte ou refuse, puis préviens le client."
          actions={
            <button
              type="button"
              onClick={reload}
              disabled={loading}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
            >
              {loading ? "Actualisation..." : "Actualiser"}
            </button>
          }
        />

        {error && (
          <p role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {notice}
          </p>
        )}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            <strong>{newCount}</strong> nouvelle(s) demande(s)
          </p>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {(
              [
                ["open", "À traiter"],
                ["all", "Toutes"],
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

        {loading && rows.length === 0 ? (
          <p className="text-slate-500">Chargement...</p>
        ) : visible.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-500">
            {filter === "open" ? "Aucune demande à traiter." : "Aucune demande reçue pour le moment."}
          </p>
        ) : (
          <ul className="space-y-3">
            {visible.map((r) => {
              const status = STATUS[r.status];
              const open = r.status === "new" || r.status === "contacted";
              const m = r.reservation_id ? money[r.reservation_id] : undefined;
              return (
                <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{r.full_name}</p>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.style}`}>
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-700">
                        <strong>{r.spaces?.name ?? "Espace"}</strong> · {formatDay(r.desired_date)} ·{" "}
                        {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)} · {r.people} pers.
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {r.phone}
                        {r.email ? ` · ${r.email}` : ""}
                      </p>
                      {r.message && (
                        <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">« {r.message} »</p>
                      )}
                      {r.status === "declined" && r.decline_reason && (
                        <p className="mt-2 text-sm text-slate-500">Motif : {r.decline_reason}</p>
                      )}
                      <p className="mt-2 text-xs text-slate-400">
                        Reçue le{" "}
                        {new Date(r.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
                      <a
                        href={whatsappLink(r.phone, `Bonjour ${r.full_name}, `)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        WhatsApp
                      </a>
                      <a
                        href={`tel:${r.phone}`}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-center text-xs font-medium hover:bg-slate-50"
                      >
                        Appeler
                      </a>
                    </div>
                  </div>

                  {open && <AvailabilityPanel request={r} />}

                  {r.status === "converted" && (
                    <p className="mt-4 rounded-xl bg-emerald-50/70 p-3 text-sm text-emerald-800">
                      Réservation créée
                      {m && m.due !== null
                        ? ` · ${formatFCFA(m.due)} · ${
                            m.paid >= m.due ? "payée ✅" : m.paid > 0 ? `${formatFCFA(m.paid)} reçus` : "pas encore payée"
                          }`
                        : ""}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    {open && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setNotice("");
                            setDialog({ kind: "accept", request: r });
                          }}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Accepter et réserver
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNotice("");
                            setDialog({ kind: "decline", request: r });
                          }}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Refuser
                        </button>
                        {r.status === "new" && (
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => void markContacted(r)}
                            className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                          >
                            Marquer « contacté »
                          </button>
                        )}
                        <Link
                          href="/reservations/calendrier"
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Calendrier
                        </Link>
                      </>
                    )}
                    {r.status === "converted" && (
                      <>
                        <button
                          type="button"
                          onClick={() => openConfirmation(r, m?.due ?? null)}
                          className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                        >
                          Renvoyer la confirmation
                        </button>
                        {m && m.paid > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setDialog({
                                kind: "message",
                                request: r,
                                title: "Confirmer le paiement au client",
                                subject: `Paiement reçu – ${settings.coworking_name}`,
                                text: paymentReceiptMessage(infoOf(r), {
                                  coworking: settings.coworking_name,
                                  paid: m.paid,
                                  due: m.due,
                                }),
                              })
                            }
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            Envoyer la validation du paiement
                          </button>
                        )}
                        {(!m || m.due === null || m.paid < m.due) && (
                          <Link
                            href="/paiements"
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Encaisser un paiement
                          </Link>
                        )}
                      </>
                    )}
                    {r.status === "declined" && (
                      <button
                        type="button"
                        onClick={() =>
                          openDeclineMessage(r, r.decline_reason ?? "ce créneau n'est pas disponible", "Renvoyer le message de refus")
                        }
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Renvoyer le message
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-6 text-xs text-slate-400">
          « Accepter et réserver » crée la réservation (et le membre s&apos;il n&apos;existe pas encore, retrouvé par son
          numéro). La base refuse toute réservation qui chevauche une autre : aucun risque de double réservation.
        </p>
      </div>

      {dialog?.kind === "accept" && (
        <AcceptDialog
          request={dialog.request}
          rates={rates.filter((x) => x.space_id === dialog.request.space_id)}
          onClose={() => setDialog(null)}
          onDone={(amount, memberCreated) => {
            const r = dialog.request;
            setRows((current) => current.map((x) => (x.id === r.id ? { ...x, status: "converted" } : x)));
            setNotice(
              `Réservation créée pour ${r.full_name}${memberCreated ? " (nouveau membre ajouté)" : ""}. Envoie-lui la confirmation.`
            );
            openConfirmation(r, amount);
            reload();
          }}
        />
      )}

      {dialog?.kind === "decline" && (
        <DeclineDialog
          request={dialog.request}
          onClose={() => setDialog(null)}
          onDone={(reason) => {
            const r = dialog.request;
            setRows((current) =>
              current.map((x) => (x.id === r.id ? { ...x, status: "declined", decline_reason: reason } : x))
            );
            setNotice(`Demande de ${r.full_name} refusée.`);
            openDeclineMessage(r, reason, "Prévenir le client du refus");
          }}
        />
      )}

      {dialog?.kind === "message" && (
        <MessageDialog
          key={dialog.title + dialog.request.id}
          request={dialog.request}
          title={dialog.title}
          subject={dialog.subject}
          initialText={dialog.text}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// ---------- Disponibilité ----------

type PanelState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; a: Availability; day: DayBooking[] };

function AvailabilityPanel({ request }: { request: BookingRequest }) {
  const [state, setState] = useState<PanelState>({ kind: "loading" });

  const load = useCallback(async () => {
    const dayStart = `${request.desired_date}T00:00:00+00:00`;
    const dayEnd = new Date(new Date(dayStart).getTime() + 24 * 3600 * 1000).toISOString();
    const [aRes, dayRes] = await Promise.all([
      supabase.rpc("space_availability", {
        p_space_id: request.space_id,
        p_start: instant(request.desired_date, request.start_time),
        p_end: instant(request.desired_date, request.end_time),
        p_seats: request.people,
      }),
      supabase
        .from("reservations")
        .select("start_at, end_at, seats, members(full_name)")
        .eq("space_id", request.space_id)
        .eq("status", "confirmed")
        .lt("start_at", dayEnd)
        .gt("end_at", dayStart)
        .order("start_at"),
    ]);
    if (aRes.error) {
      setState({
        kind: "error",
        message: aRes.error.message.includes("space_availability")
          ? "Vérification impossible : exécute d'abord le SQL « traitement des demandes » dans Supabase."
          : `Vérification impossible : ${aRes.error.message}`,
      });
      return;
    }
    setState({ kind: "ok", a: aRes.data as Availability, day: (dayRes.data ?? []) as unknown as DayBooking[] });
  }, [request]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement initial
    void load();
  }, [load]);

  if (state.kind === "loading") {
    return <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Vérification de la disponibilité...</p>;
  }
  if (state.kind === "error") {
    return <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.message}</p>;
  }

  const { a, day } = state;
  const seats = a.mode === "seats";
  let ok = false;
  let text: string;
  if (!a.active) text = "Indisponible : cet espace est désactivé.";
  else if (a.available) {
    ok = true;
    text = seats
      ? `Disponible : ${a.free} place(s) libre(s) sur ${a.capacity} pendant ce créneau.`
      : "Disponible : aucun autre client sur ce créneau.";
  } else if (request.people > a.capacity)
    text = `Indisponible : l'espace accueille ${a.capacity} ${seats ? "place(s)" : "personne(s)"} maximum.`;
  else if (seats) text = `Indisponible : il ne reste que ${a.free} place(s) libre(s), ${request.people} demandée(s).`;
  else
    text = `Indisponible : déjà réservé ${a.conflicts
      .map((c) => `de ${clock(c.start_at)} à ${clock(c.end_at)} (${c.member})`)
      .join(", ")}.`;

  const reqStart = minutesOf(request.start_time);
  const reqEnd = minutesOf(request.end_time);
  const span = DAY_END - DAY_START;
  const clamp = (min: number) => Math.min(Math.max(min, DAY_START), DAY_END);
  const left = (min: number) => `${((clamp(min) - DAY_START) / span) * 100}%`;
  const width = (from: number, to: number) => `${((clamp(to) - clamp(from)) / span) * 100}%`;

  return (
    <div className={`mt-4 rounded-xl border p-3 ${ok ? "border-emerald-200 bg-emerald-50/60" : "border-red-200 bg-red-50/60"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`text-sm font-semibold ${ok ? "text-emerald-800" : "text-red-700"}`}>
          {ok ? "✅ " : "❌ "}
          {text}
        </p>
        <button type="button" onClick={() => void load()} className="shrink-0 text-xs font-medium text-slate-500 hover:underline">
          Revérifier
        </button>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-xs text-slate-500">
          Planning de « {request.spaces?.name} » ce jour-là ({day.length} réservation{day.length > 1 ? "s" : ""})
        </p>
        <div className="relative h-7 overflow-hidden rounded-md bg-white ring-1 ring-slate-200">
          {day.map((d, i) => {
            const s = minutesOfIso(d.start_at, request.desired_date);
            const e = minutesOfIso(d.end_at, request.desired_date);
            return (
              <div
                key={i}
                title={`${clock(d.start_at)}–${clock(d.end_at)} · ${d.members?.full_name ?? ""}`}
                className="absolute inset-y-0 bg-slate-400/70"
                style={{ left: left(s), width: width(s, e) }}
              />
            );
          })}
          <div
            title="Créneau demandé"
            className={`absolute inset-y-0 border-2 ${ok ? "border-emerald-600 bg-emerald-400/30" : "border-red-600 bg-red-400/30"}`}
            style={{ left: left(reqStart), width: width(reqStart, reqEnd) }}
          />
        </div>
        <div className="relative mt-0.5 h-3 text-[10px] text-slate-400">
          {[7, 10, 13, 16, 19, 22].map((h) => (
            <span key={h} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: left(h * 60) }}>
              {h}h
            </span>
          ))}
        </div>
        {day.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
            {day.map((d, i) => (
              <li key={i}>
                {clock(d.start_at)}–{clock(d.end_at)} · {d.members?.full_name ?? "Membre"}
                {seats ? ` · ${d.seats} place(s)` : ""}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-4 rounded-sm bg-slate-400/70" /> déjà réservé
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-4 rounded-sm border-2 border-slate-600" /> créneau demandé
          </span>
        </p>
      </div>
    </div>
  );
}

// ---------- Fenêtres ----------

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg px-2 text-xl text-slate-400 hover:bg-slate-100">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AcceptDialog({
  request,
  rates,
  onClose,
  onDone,
}: {
  request: BookingRequest;
  rates: SpaceRate[];
  onClose: () => void;
  onDone: (amount: number | null, memberCreated: boolean) => void;
}) {
  const seats = request.spaces?.booking_mode === "seats";
  const minutes = minutesOf(request.end_time) - minutesOf(request.start_time);
  const unitPrice = suggestPrice(rates, minutes);
  const suggested = unitPrice === null ? null : unitPrice * (seats ? request.people : 1);
  const [amount, setAmount] = useState(suggested !== null ? String(suggested) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSaving(true);
    setError("");
    const value = parseAmount(amount);
    const { data, error: rpcError } = await supabase.rpc("accept_booking_request", {
      p_request_id: request.id,
      p_price_amount: value,
    });
    setSaving(false);
    if (rpcError) {
      setError(
        rpcError.message.includes("accept_booking_request")
          ? "Exécute d'abord le SQL « traitement des demandes » dans Supabase."
          : rpcError.message
      );
      return;
    }
    onDone(value, Boolean((data as { member_created?: boolean } | null)?.member_created));
  }

  return (
    <Modal title="Accepter et créer la réservation" onClose={onClose}>
      <dl className="space-y-1 rounded-xl bg-slate-50 p-4 text-sm">
        <div>
          <dt className="inline text-slate-500">Client : </dt>
          <dd className="inline font-medium">
            {request.full_name} ({request.phone})
          </dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Espace : </dt>
          <dd className="inline font-medium">{request.spaces?.name}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Créneau : </dt>
          <dd className="inline font-medium">
            {formatDay(request.desired_date)}, {request.start_time.slice(0, 5)}–{request.end_time.slice(0, 5)}
          </dd>
        </div>
        <div>
          <dt className="inline text-slate-500">{seats ? "Places" : "Personnes"} : </dt>
          <dd className="inline font-medium">{request.people}</dd>
        </div>
      </dl>

      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium">Montant à payer (F CFA)</span>
        <input
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Ex. 15000 — vide si à définir plus tard"
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        />
        <span className="mt-1 block text-xs text-slate-500">
          {suggested !== null
            ? `Proposé d'après tes tarifs : ${formatFCFA(suggested)}${seats && request.people > 1 ? ` (${request.people} places)` : ""}. Modifiable.`
            : "Aucun tarif défini pour cet espace : saisis le montant."}
        </span>
      </label>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
          Annuler
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? "Création..." : "Créer la réservation"}
        </button>
      </div>
    </Modal>
  );
}

function DeclineDialog({
  request,
  onClose,
  onDone,
}: {
  request: BookingRequest;
  onClose: () => void;
  onDone: (reason: string) => void;
}) {
  const [key, setKey] = useState<DeclineKey>("booked");
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const reason = declineSentence(key, request.people, custom);
    if (!reason) {
      setError("Écris le motif du refus.");
      return;
    }
    setSaving(true);
    setError("");
    const { data: auth } = await supabase.auth.getUser();
    const { error: updateError } = await supabase
      .from("booking_requests")
      .update({
        status: "declined",
        decline_reason: reason,
        handled_by: auth.user?.id ?? null,
        handled_at: new Date().toISOString(),
      })
      .eq("id", request.id);
    setSaving(false);
    if (updateError) {
      setError(
        updateError.message.includes("decline_reason") || updateError.message.includes("handled_at")
          ? "Exécute d'abord le SQL « traitement des demandes » dans Supabase."
          : `Refus impossible : ${updateError.message}`
      );
      return;
    }
    onDone(reason);
  }

  return (
    <Modal title="Refuser la demande" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">
        {request.full_name} · {request.spaces?.name} · {formatDay(request.desired_date)},{" "}
        {request.start_time.slice(0, 5)}–{request.end_time.slice(0, 5)}
      </p>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Motif du refus</legend>
        {DECLINE_REASONS.map((r) => (
          <label
            key={r.key}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${
              key === r.key ? "border-blue-500 bg-blue-50" : "border-slate-200"
            }`}
          >
            <input type="radio" name="reason" checked={key === r.key} onChange={() => setKey(r.key)} />
            {r.label}
          </label>
        ))}
      </fieldset>
      {key === "other" && (
        <textarea
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          maxLength={300}
          rows={2}
          placeholder="Ex. l'espace est en travaux cette semaine"
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
        />
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
          Annuler
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit()}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {saving ? "Enregistrement..." : "Refuser la demande"}
        </button>
      </div>
    </Modal>
  );
}

function MessageDialog({
  request,
  title,
  subject,
  initialText,
  onClose,
}: {
  request: BookingRequest;
  title: string;
  subject: string;
  initialText: string;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState(false);

  return (
    <Modal title={title} onClose={onClose}>
      <p className="mb-2 text-sm text-slate-600">Relis ou modifie le message, puis choisis comment l&apos;envoyer.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-blue-600"
      />
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <a
          href={whatsappLink(request.phone, text)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-700"
        >
          WhatsApp
        </a>
        {request.email ? (
          <a
            href={mailtoLink(request.email, subject, text)}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700"
          >
            E-mail
          </a>
        ) : (
          <span className="rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-center text-xs text-slate-400">
            Pas d&apos;e-mail fourni
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => setCopied(true));
          }}
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50"
        >
          {copied ? "Copié ✓" : "Copier"}
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        WhatsApp s&apos;ouvre avec le message prêt : il ne reste qu&apos;à appuyer sur Envoyer depuis le WhatsApp du
        coworking.
      </p>
      <div className="mt-4 text-right">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
          Terminé
        </button>
      </div>
    </Modal>
  );
}
