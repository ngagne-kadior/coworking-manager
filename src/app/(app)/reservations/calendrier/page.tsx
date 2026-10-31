"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import ReservationTabs from "@/components/ReservationTabs";
import { spacePhotoUrl } from "@/lib/photos";
import PaymentPanel from "@/components/PaymentPanel";
import {
  formatFCFA,
  parseAmount,
  paymentState,
  suggestPrice,
  sumPayments,
  type SpaceRate,
} from "@/lib/payments";

// Plage horaire affichée et pas de réservation
const OPEN_HOUR = 7;
const CLOSE_HOUR = 22;
const SLOT_MINUTES = 30;
const SLOT_WIDTH = 44; // px
const SLOTS = ((CLOSE_HOUR - OPEN_HOUR) * 60) / SLOT_MINUTES;
const NAME_COLUMN = 200; // px (136 px sur téléphone)

type Space = {
  id: string;
  name: string;
  capacity: number;
  is_active: boolean;
  photo_path: string | null;
  booking_mode: "whole" | "seats";
};

type Member = { id: string; full_name: string };

type Reservation = {
  id: string;
  member_id: string;
  space_id: string;
  start_at: string;
  end_at: string;
  status: "confirmed" | "completed";
  notes: string | null;
  price_amount: number | null;
  seats: number;
  subscription_id: string | null;
  members: { full_name: string; photo_path: string | null } | null;
  payments: { amount: number }[] | null;
};

type DayData = {
  spaces: Space[];
  members: Member[];
  reservations: Reservation[];
  rates: SpaceRate[];
  weekCounts: number[];
  error: string;
};

type NewSlot = { space: Space; startMinutes: number };

// ---------- Dates (heure locale du navigateur) ----------

function toDateKey(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayStart(key: string) {
  return new Date(`${key}T00:00:00`);
}

function addDays(key: string, days: number) {
  const date = dayStart(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function weekStartKey(key: string) {
  const date = dayStart(key);
  const offset = (date.getDay() + 6) % 7; // lundi = 0
  date.setDate(date.getDate() - offset);
  return toDateKey(date);
}

function atMinutes(key: string, minutes: number) {
  const date = dayStart(key);
  date.setMinutes(minutes);
  return date;
}

function minutesOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function formatClock(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const LANE_HEIGHT = 52; // px

/** Début et fin (minutes, bornées à la plage affichée) d'une réservation ce jour-là. */
function visibleRange(booking: Reservation, key: string) {
  const start = new Date(booking.start_at);
  const end = new Date(booking.end_at);
  const startMin = Math.max(start < dayStart(key) ? 0 : minutesOfDay(start), OPEN_HOUR * 60);
  const endMin = Math.min(end >= dayStart(addDays(key, 1)) ? 24 * 60 : minutesOfDay(end), CLOSE_HOUR * 60);
  return endMin > startMin ? { startMin, endMin } : null;
}

/** Répartit les réservations qui se chevauchent sur plusieurs lignes (« couloirs »). */
function assignLanes(bookings: Reservation[], key: string) {
  const laneEnds: number[] = [];
  const placed: { booking: Reservation; startMin: number; endMin: number; lane: number }[] = [];
  const items = bookings
    .map((booking) => ({ booking, range: visibleRange(booking, key) }))
    .filter((item): item is { booking: Reservation; range: { startMin: number; endMin: number } } => item.range !== null)
    .sort((a, b) => a.range.startMin - b.range.startMin);
  for (const { booking, range } of items) {
    let lane = laneEnds.findIndex((end) => end <= range.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(range.endMin);
    } else {
      laneEnds[lane] = range.endMin;
    }
    placed.push({ booking, ...range, lane });
  }
  return { placed, lanes: Math.max(laneEnds.length, 1) };
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatLongDate(key: string) {
  const text = dayStart(key).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---------- Chargement ----------

async function fetchDay(key: string): Promise<DayData> {
  const start = dayStart(key);
  const end = dayStart(addDays(key, 1));
  const weekStart = dayStart(weekStartKey(key));
  const weekEnd = dayStart(addDays(weekStartKey(key), 7));

  const [spaceRes, memberRes, dayRes, weekRes, rateRes] = await Promise.all([
    supabase.from("spaces").select("id, name, capacity, is_active, photo_path, booking_mode").order("name"),
    supabase.from("members").select("id, full_name").eq("is_active", true).order("full_name"),
    supabase
      .from("reservations")
      .select(
        "id, member_id, space_id, start_at, end_at, status, notes, price_amount, seats, subscription_id, members(full_name, photo_path), payments(amount)"
      )
      .in("status", ["confirmed", "completed"])
      .lt("start_at", end.toISOString())
      .gt("end_at", start.toISOString())
      .order("start_at"),
    supabase
      .from("reservations")
      .select("start_at")
      .in("status", ["confirmed", "completed"])
      .gte("start_at", weekStart.toISOString())
      .lt("start_at", weekEnd.toISOString()),
    supabase.from("space_rates").select("space_id, unit, price"),
  ]);

  const firstError = [spaceRes.error, memberRes.error, dayRes.error, weekRes.error, rateRes.error].find(Boolean);
  if (firstError) {
    return {
      spaces: [],
      members: [],
      reservations: [],
      rates: [],
      weekCounts: Array(7).fill(0),
      error: `Impossible de charger le calendrier : ${firstError.message}`,
    };
  }

  const weekCounts = Array(7).fill(0) as number[];
  for (const row of weekRes.data ?? []) {
    const index = (new Date(row.start_at).getDay() + 6) % 7;
    weekCounts[index] += 1;
  }

  return {
    spaces: (spaceRes.data ?? []) as Space[],
    members: (memberRes.data ?? []) as Member[],
    reservations: (dayRes.data ?? []) as unknown as Reservation[],
    rates: (rateRes.data ?? []) as SpaceRate[],
    weekCounts,
    error: "",
  };
}

function friendlyError(error: { code?: string; message: string }) {
  if (error.code === "23P01" || /occupé|chevauch/i.test(error.message)) {
    return "Ce créneau est déjà réservé pour cet espace. Choisis un autre horaire.";
  }
  return error.message;
}

// ---------- Page ----------

export default function CalendrierPage() {
  const [dateKey, setDateKey] = useState(() => toDateKey(new Date()));
  const [requestId, setRequestId] = useState(1);
  const [loadedId, setLoadedId] = useState(0);
  const [data, setData] = useState<DayData | null>(null);
  const [now, setNow] = useState(() => new Date());

  const [success, setSuccess] = useState("");
  const [newSlot, setNewSlot] = useState<NewSlot | null>(null);
  const [selected, setSelected] = useState<Reservation | null>(null);

  const loading = loadedId !== requestId;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetchDay(dateKey).then((result) => {
      if (!active) return;
      setData(result);
      setLoadedId(requestId);
    });
    return () => {
      active = false;
    };
  }, [dateKey, requestId]);

  // À chaque chargement : la grille s'ouvre sur l'heure actuelle (aujourd'hui)
  // ou sur la première réservation du jour, au lieu de 7 h.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !data || loadedId !== requestId) return;
    const first = data.reservations[0];
    const target =
      dateKey === toDateKey(new Date())
        ? minutesOfDay(new Date()) - 60
        : first
          ? minutesOfDay(new Date(first.start_at)) - 30
          : 8 * 60;
    const offset = ((Math.max(target, OPEN_HOUR * 60) - OPEN_HOUR * 60) / SLOT_MINUTES) * SLOT_WIDTH;
    container.scrollLeft = offset;
  }, [data, loadedId, requestId, dateKey]);

  // Ligne « maintenant » mise à jour chaque minute
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  function goTo(key: string) {
    setDateKey(key);
    setSuccess("");
    setRequestId((id) => id + 1);
  }

  function reload(message: string) {
    setSuccess(message);
    setRequestId((id) => id + 1);
  }

  const todayKey = toDateKey(now);
  const isToday = dateKey === todayKey;
  const weekStart = weekStartKey(dateKey);

  // Espaces actifs + espaces désactivés qui ont encore une réservation ce jour-là
  const visibleSpaces = useMemo(() => {
    if (!data) return [];
    const withBooking = new Set(data.reservations.map((r) => r.space_id));
    return data.spaces.filter((s) => s.is_active || withBooking.has(s.id));
  }, [data]);

  const nowMinutes = minutesOfDay(now);
  const nowOffset =
    isToday && nowMinutes >= OPEN_HOUR * 60 && nowMinutes <= CLOSE_HOUR * 60
      ? ((nowMinutes - OPEN_HOUR * 60) / SLOT_MINUTES) * SLOT_WIDTH
      : null;

  return (
    <div className="text-slate-900">
      <div className="mx-auto max-w-7xl">
        <PageHeader
          title="Réservations"
          description="Clique sur un créneau libre pour réserver, ou sur une réservation pour la consulter."
          actions={<ReservationTabs active="calendrier" />}
        />

        {/* Navigation dans les dates */}
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => goTo(addDays(dateKey, -1))}
              aria-label="Jour précédent"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => goTo(todayKey)}
              disabled={isToday}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Aujourd&apos;hui
            </button>
            <button
              type="button"
              onClick={() => goTo(addDays(dateKey, 1))}
              aria-label="Jour suivant"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
            >
              →
            </button>
            <input
              type="date"
              value={dateKey}
              onChange={(event) => event.target.value && goTo(event.target.value)}
              aria-label="Choisir une date"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <h2 className="ml-1 text-base font-semibold">{formatLongDate(dateKey)}</h2>
          </div>

          <div className="grid grid-cols-7 gap-1" aria-label="Semaine">
            {Array.from({ length: 7 }, (_, index) => {
              const key = addDays(weekStart, index);
              const date = dayStart(key);
              const count = data?.weekCounts[index] ?? 0;
              const current = key === dateKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => goTo(key)}
                  aria-current={current ? "date" : undefined}
                  className={`flex min-w-11 flex-col items-center rounded-lg px-2 py-1.5 text-xs transition ${
                    current
                      ? "bg-blue-600 text-white"
                      : key === todayKey
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span className="capitalize">
                    {date.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}
                  </span>
                  <span className="text-sm font-bold">{date.getDate()}</span>
                  <span className={`text-[10px] ${current ? "text-blue-100" : "text-slate-400"}`}>
                    {count} résa.
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {data?.error && (
          <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {data.error}
          </p>
        )}
        {success && (
          <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">
            {success}
          </p>
        )}

        {/* Grille : espaces en lignes, heures en colonnes */}
        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading && !data ? (
            <p className="p-6 text-sm text-slate-500">Chargement du calendrier...</p>
          ) : visibleSpaces.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              Aucun espace actif. Ajoute d&apos;abord un espace dans la page Espaces.
            </p>
          ) : (
            <div ref={scrollRef} className={`overflow-x-auto scroll-smooth ${loading ? "opacity-60" : ""}`}>
              <div style={{ minWidth: NAME_COLUMN + SLOTS * SLOT_WIDTH }}>
                {/* Ligne des heures */}
                <div className="flex border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <div
                    className="sticky left-0 z-20 w-[136px] shrink-0 border-r border-slate-200 bg-slate-50 px-3 py-2 font-semibold uppercase tracking-wide sm:w-[200px] sm:px-4"
                  >
                    Espace
                  </div>
                  {Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => (
                    <div
                      key={i}
                      className="shrink-0 border-r border-slate-100 px-1.5 py-2"
                      style={{ width: SLOT_WIDTH * (60 / SLOT_MINUTES) }}
                    >
                      {formatClock((OPEN_HOUR + i) * 60)}
                    </div>
                  ))}
                </div>

                {visibleSpaces.map((space) => {
                  const bookings = data!.reservations.filter((r) => r.space_id === space.id);
                  const photo = spacePhotoUrl(space.photo_path);
                  const shared = space.booking_mode === "seats";
                  const { placed, lanes } = assignLanes(bookings, dateKey);
                  // Par place : un couloir libre en plus pour pouvoir cliquer et ajouter
                  const rowHeight = (shared ? lanes + 1 : 1) * LANE_HEIGHT + 12;

                  return (
                    <div key={space.id} className="flex border-b border-slate-100 last:border-b-0">
                      <div
                        className="sticky left-0 z-20 flex w-[136px] shrink-0 items-center gap-2 border-r border-slate-200 bg-white px-2 py-2 sm:w-[200px] sm:gap-3 sm:px-3"
                      >
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element -- image Supabase Storage
                          <img src={photo} alt="" className="hidden h-10 w-10 shrink-0 rounded-lg object-cover sm:block" />
                        ) : (
                          <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-blue-600 sm:flex">
                            {space.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{space.name}</p>
                          <p className="text-xs text-slate-400">
                            {shared ? `${space.capacity} places` : `${space.capacity} pers.`}
                            {!space.is_active && " · inactif"}
                          </p>
                        </div>
                      </div>

                      <div
                        className="relative shrink-0"
                        style={{ width: SLOTS * SLOT_WIDTH, height: rowHeight }}
                      >
                        {/* Créneaux cliquables */}
                        {Array.from({ length: SLOTS }, (_, i) => {
                          const startMinutes = OPEN_HOUR * 60 + i * SLOT_MINUTES;
                          const past = atMinutes(dateKey, startMinutes + SLOT_MINUTES) <= now;
                          const disabled = past || !space.is_active;
                          return (
                            <button
                              key={i}
                              type="button"
                              disabled={disabled}
                              onClick={() => setNewSlot({ space, startMinutes })}
                              aria-label={`Réserver ${space.name} à ${formatClock(startMinutes)}`}
                              className={`absolute top-0 h-full border-r ${
                                i % 2 === 1 ? "border-slate-100" : "border-slate-50"
                              } ${disabled ? "cursor-default bg-slate-50/70" : "hover:bg-blue-50"}`}
                              style={{ left: i * SLOT_WIDTH, width: SLOT_WIDTH }}
                            />
                          );
                        })}

                        {/* Réservations */}
                        {placed.map(({ booking, startMin, endMin, lane }) => {
                          const left = ((startMin - OPEN_HOUR * 60) / SLOT_MINUTES) * SLOT_WIDTH;
                          const width = ((endMin - startMin) / SLOT_MINUTES) * SLOT_WIDTH;
                          const done = booking.status === "completed";
                          const subscribed = booking.subscription_id !== null;
                          const name = booking.members?.full_name ?? "Membre";

                          return (
                            <button
                              key={booking.id}
                              type="button"
                              onClick={() => setSelected(booking)}
                              title={`${name} · ${formatTime(booking.start_at)}–${formatTime(booking.end_at)}`}
                              className={`absolute z-10 flex items-center gap-2 overflow-hidden rounded-lg px-2 text-left text-xs shadow-sm transition hover:brightness-95 ${
                                done
                                  ? "bg-slate-200 text-slate-600"
                                  : subscribed
                                    ? "bg-violet-600 text-white"
                                    : "bg-blue-600 text-white"
                              }`}
                              style={{
                                left: left + 2,
                                width: Math.max(width - 4, 24),
                                top: 6 + lane * LANE_HEIGHT,
                                height: LANE_HEIGHT - 8,
                              }}
                            >
                              {width >= 110 && (
                                <Avatar name={name} photoPath={booking.members?.photo_path} size="sm" />
                              )}
                              <span className="min-w-0">
                                <span className="flex items-center gap-1.5 truncate font-semibold">
                                  <PaymentDot booking={booking} />
                                  <span className="truncate">{name}</span>
                                </span>
                                <span className={`block truncate ${done ? "text-slate-500" : "text-white/75"}`}>
                                  {formatTime(booking.start_at)}–{formatTime(booking.end_at)}
                                  {shared && booking.seats > 1 && ` · ${booking.seats} places`}
                                  {subscribed && " · abonné"}
                                </span>
                              </span>
                            </button>
                          );
                        })}

                        {nowOffset !== null && (
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute top-0 z-10 h-full w-0.5 bg-red-500"
                            style={{ left: nowOffset }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <p className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-blue-600" /> Confirmée
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-violet-600" /> Abonnement
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-slate-200" /> Terminée
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-0.5 bg-red-500" /> Maintenant
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Payé
            <span className="ml-1 h-2 w-2 rounded-full bg-amber-400" /> Acompte
            <span className="ml-1 h-2 w-2 rounded-full bg-red-400" /> À payer
          </span>
          <span>
            Horaires affichés : {formatClock(OPEN_HOUR * 60)}–{formatClock(CLOSE_HOUR * 60)}, par
            tranches de {SLOT_MINUTES} min.
          </span>
        </p>
      </div>

      {newSlot && data && (
        <NewReservationDialog
          key={`${newSlot.space.id}-${newSlot.startMinutes}`}
          slot={newSlot}
          dateKey={dateKey}
          members={data.members}
          rates={data.rates.filter((r) => r.space_id === newSlot.space.id)}
          bookings={data.reservations.filter((r) => r.space_id === newSlot.space.id)}
          onClose={() => setNewSlot(null)}
          onCreated={(message) => {
            setNewSlot(null);
            reload(message);
          }}
        />
      )}

      {selected && (
        <ReservationDialog
          reservation={selected}
          spaceName={data?.spaces.find((s) => s.id === selected.space_id)?.name ?? "Espace"}
          rates={data?.rates.filter((r) => r.space_id === selected.space_id) ?? []}
          now={now}
          onPaymentChanged={() => setRequestId((id) => id + 1)}
          onClose={() => setSelected(null)}
          onCancelled={(message) => {
            setSelected(null);
            reload(message);
          }}
        />
      )}
    </div>
  );
}

// ---------- Fenêtres ----------

function Dialog({
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:max-w-md sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold">{title}</h2>
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

const fieldClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600";

function NewReservationDialog({
  slot,
  dateKey,
  members,
  rates,
  bookings,
  onClose,
  onCreated,
}: {
  slot: NewSlot;
  dateKey: string;
  members: Member[];
  rates: SpaceRate[];
  bookings: Reservation[];
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const shared = slot.space.booking_mode === "seats";
  // Fin proposée : 1 h plus tard, sans dépasser la prochaine réservation
  // (espace entier uniquement : en mode « par place », la base compte les places)
  const nextBookingStart = (shared ? [] : bookings)
    .map((b) => minutesOfDay(new Date(b.start_at)))
    .filter((m) => m > slot.startMinutes)
    .sort((a, b) => a - b)[0];
  const maxEnd = Math.min(nextBookingStart ?? CLOSE_HOUR * 60, CLOSE_HOUR * 60);
  const defaultEnd = Math.min(slot.startMinutes + 60, maxEnd);

  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [startMinutes, setStartMinutes] = useState(slot.startMinutes);
  const [endMinutes, setEndMinutes] = useState(defaultEnd);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Montant : proposé d'après les tarifs tant que l'utilisateur ne l'a pas modifié
  const [priceInput, setPriceInput] = useState<string | null>(null);
  const [seats, setSeats] = useState(1);
  const baseSuggestion = suggestPrice(rates, endMinutes - startMinutes);
  const suggested = baseSuggestion === null ? null : baseSuggestion * (shared ? seats : 1);
  const priceValue = priceInput ?? (suggested !== null ? String(suggested) : "");

  const startOptions = Array.from({ length: SLOTS }, (_, i) => OPEN_HOUR * 60 + i * SLOT_MINUTES);
  const endOptions = Array.from({ length: SLOTS }, (_, i) => OPEN_HOUR * 60 + (i + 1) * SLOT_MINUTES).filter(
    (m) => m > startMinutes
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!memberId) {
      setError("Choisis un membre.");
      return;
    }
    if (endMinutes <= startMinutes) {
      setError("L'heure de fin doit être après l'heure de début.");
      return;
    }
    const start = atMinutes(dateKey, startMinutes);
    if (start <= new Date()) {
      setError("La réservation doit commencer dans le futur.");
      return;
    }

    setSaving(true);
    const { error: insertError } = await supabase.from("reservations").insert({
      member_id: memberId,
      space_id: slot.space.id,
      start_at: start.toISOString(),
      end_at: atMinutes(dateKey, endMinutes).toISOString(),
      status: "confirmed",
      notes: notes.trim() || null,
      price_amount: parseAmount(priceValue),
      seats: shared ? seats : 1,
    });
    setSaving(false);

    if (insertError) {
      setError(friendlyError(insertError));
      return;
    }

    const member = members.find((m) => m.id === memberId)?.full_name ?? "le membre";
    onCreated(
      `Réservation confirmée : ${slot.space.name}, ${formatClock(startMinutes)}–${formatClock(endMinutes)}, pour ${member}.`
    );
  }

  return (
    <Dialog title="Nouvelle réservation" onClose={onClose}>
      <p className="mb-5 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
        <strong>{slot.space.name}</strong> · {formatLongDate(dateKey)}
      </p>

      {members.length === 0 ? (
        <p className="text-sm text-slate-600">
          Aucun membre actif. Ajoute d&apos;abord un membre dans la page Membres.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Membre</span>
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className={fieldClass}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Début</span>
              <select
                value={startMinutes}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setStartMinutes(value);
                  if (endMinutes <= value) setEndMinutes(value + SLOT_MINUTES);
                }}
                className={fieldClass}
              >
                {startOptions.map((m) => (
                  <option key={m} value={m}>
                    {formatClock(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Fin</span>
              <select
                value={endMinutes}
                onChange={(e) => setEndMinutes(Number(e.target.value))}
                className={fieldClass}
              >
                {endOptions.map((m) => (
                  <option key={m} value={m}>
                    {formatClock(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {shared && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Nombre de places</span>
              <input
                type="number"
                min={1}
                max={slot.space.capacity}
                value={seats}
                onChange={(e) =>
                  setSeats(Math.min(Math.max(Number(e.target.value) || 1, 1), slot.space.capacity))
                }
                className={fieldClass}
              />
              <span className="mt-1 block text-xs text-slate-500">
                Sur {slot.space.capacity} places. L&apos;application refuse si le créneau est complet.
              </span>
            </label>
          )}

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Montant dû (F CFA)</span>
            <input
              inputMode="numeric"
              value={priceValue}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="Laisser vide si pas encore fixé"
              className={fieldClass}
            />
            <span className="mt-1 block text-xs text-slate-500">
              {suggested !== null
                ? `Proposé d'après les tarifs : ${formatFCFA(suggested)}. Modifiable.`
                : "Aucun tarif pour cet espace : saisis le montant ou laisse vide."}
            </span>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Notes (facultatif)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={fieldClass}
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {saving ? "Réservation..." : "Confirmer la réservation"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50"
            >
              Annuler
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function ReservationDialog({
  reservation,
  spaceName,
  rates,
  now,
  onClose,
  onCancelled,
  onPaymentChanged,
}: {
  reservation: Reservation;
  spaceName: string;
  rates: SpaceRate[];
  now: Date;
  onPaymentChanged: () => void;
  onClose: () => void;
  onCancelled: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = reservation.members?.full_name ?? "Membre";
  const canCancel = reservation.status === "confirmed" && new Date(reservation.start_at) > now;

  async function cancel() {
    if (!window.confirm(`Annuler la réservation de ${name} ?`)) return;
    setBusy(true);
    setError("");
    const { error: updateError } = await supabase
      .from("reservations")
      .update({ status: "cancelled" })
      .eq("id", reservation.id);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onCancelled(`Réservation de ${name} annulée. Le créneau est de nouveau libre.`);
  }

  return (
    <Dialog title="Réservation" onClose={onClose}>
      <div className="flex items-center gap-3">
        <Avatar name={name} photoPath={reservation.members?.photo_path} size="md" />
        <div>
          <p className="font-semibold">{name}</p>
          <p className="text-sm text-slate-500">{spaceName}</p>
        </div>
      </div>

      <dl className="mt-5 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Date</dt>
          <dd className="font-medium">{formatLongDate(toDateKey(new Date(reservation.start_at)))}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Horaire</dt>
          <dd className="font-medium">
            {formatTime(reservation.start_at)}–{formatTime(reservation.end_at)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Statut</dt>
          <dd className="font-medium">{reservation.status === "completed" ? "Terminée" : "Confirmée"}</dd>
        </div>
        {reservation.notes && (
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Notes</dt>
            <dd className="text-right">{reservation.notes}</dd>
          </div>
        )}
      </dl>

      {reservation.subscription_id ? (
        <p className="mt-5 rounded-xl bg-violet-50 p-4 text-sm text-violet-800">
          Journée d&apos;abonnement : le paiement se gère dans la page <strong>Abonnements</strong>.
        </p>
      ) : (
      <div className="mt-5">
        <PaymentPanel
          target={{ kind: "reservation", id: reservation.id }}
          memberId={reservation.member_id}
          price={reservation.price_amount}
          suggestedPrice={suggestPrice(
            rates,
            (new Date(reservation.end_at).getTime() - new Date(reservation.start_at).getTime()) / 60000
          )}
          canPay
          onChanged={onPaymentChanged}
        />
      </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-3">
        {canCancel && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void cancel()}
            className="flex-1 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            {busy ? "Annulation..." : "Annuler la réservation"}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50"
        >
          Fermer
        </button>
      </div>
      {!canCancel && reservation.status === "confirmed" && (
        <p className="mt-3 text-xs text-slate-500">
          Une réservation déjà commencée ne peut plus être annulée.
        </p>
      )}
    </Dialog>
  );
}

function PaymentDot({ booking }: { booking: Reservation }) {
  // Les journées d'abonnement se paient sur l'abonnement : pas de pastille.
  if (booking.subscription_id) return null;
  const state = paymentState(booking.price_amount, sumPayments(booking.payments));
  if (state === "none") return null;
  const color =
    state === "paid" ? "bg-emerald-400" : state === "partial" ? "bg-amber-400" : "bg-red-400";
  return <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ring-1 ring-white/70 ${color}`} />;
}
