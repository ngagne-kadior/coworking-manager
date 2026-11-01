"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/AppShell";
import PhotoButton from "@/components/PhotoButton";
import {
  MAX_SPACE_PHOTOS,
  addSpacePhoto,
  deleteSpacePhoto,
  setSpaceCover,
  spacePhotoUrl,
  type SpacePhoto,
} from "@/lib/photos";
import {
  RATE_UNITS,
  ratesSummary,
  saveRates,
  type RateUnit,
  type SpaceRate,
} from "@/lib/payments";

// ---------- Données ----------

const SPACE_FIELDS =
  "id, name, description, capacity, is_active, photo_path, booking_mode, space_type, area_m2, location, amenities";

type Space = {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  is_active: boolean;
  photo_path: string | null;
  booking_mode: "whole" | "seats";
  space_type: string | null;
  area_m2: number | null;
  location: string | null;
  amenities: string[];
};

const SPACE_TYPES = [
  "Salle de réunion",
  "Bureau privé",
  "Open space",
  "Salle de formation",
  "Cabine téléphonique",
  "Espace événementiel",
];

const AMENITIES: { key: string; label: string }[] = [
  { key: "wifi", label: "Wi-Fi" },
  { key: "clim", label: "Climatisation" },
  { key: "ecran", label: "Écran / TV" },
  { key: "projecteur", label: "Vidéoprojecteur" },
  { key: "tableau", label: "Tableau blanc" },
  { key: "imprimante", label: "Imprimante" },
  { key: "cafe", label: "Café / thé" },
  { key: "casiers", label: "Casiers" },
  { key: "parking", label: "Parking" },
  { key: "pmr", label: "Accès PMR" },
];

const amenityLabel = (key: string) => AMENITIES.find((a) => a.key === key)?.label ?? key;

const fieldClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

const EMPTY_RATES: Record<RateUnit, string> = { hour: "", half_day: "", day: "", month: "" };

// ---------- Page ----------

type LiveReservation = { space_id: string; start_at: string; end_at: string; seats: number | null };

/** Statut affiché sur la carte : Inactif, Réservé (en ce moment), places occupées, ou Actif. */
function liveStatus(space: Space, seatsNow: number) {
  if (!space.is_active) return { label: "Inactif", card: "bg-slate-800/80 text-white", pill: "bg-slate-200 text-slate-600" };
  if (seatsNow > 0 && space.booking_mode === "seats" && seatsNow < space.capacity) {
    return {
      label: `${seatsNow}/${space.capacity} places occupées`,
      card: "bg-amber-400 text-amber-950",
      pill: "bg-amber-100 text-amber-800",
    };
  }
  if (seatsNow > 0) {
    return {
      label: space.booking_mode === "seats" ? "Complet" : "Réservé",
      card: "bg-orange-500 text-white",
      pill: "bg-orange-100 text-orange-800",
    };
  }
  return { label: "Actif", card: "bg-white/95 text-green-700", pill: "bg-green-100 text-green-800" };
}

export default function SpacesPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [rates, setRates] = useState<SpaceRate[]>([]);
  const [photos, setPhotos] = useState<SpacePhoto[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [live, setLive] = useState<LiveReservation[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const [formFor, setFormFor] = useState<Space | "new" | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  // Réservations en cours ou à venir dans les 24 h (hors annulées / expirées).
  const loadLive = useCallback(async () => {
    const from = new Date();
    const to = new Date(from.getTime() + 24 * 3600 * 1000);
    const { data } = await supabase
      .from("reservations")
      .select("space_id, start_at, end_at, seats")
      .lt("start_at", to.toISOString())
      .gt("end_at", from.toISOString())
      .not("status", "in", "(cancelled,expired)");
    setLive((data ?? []) as LiveReservation[]);
    setNow(Date.now());
  }, []);

  // Mise à jour automatique chaque minute : une réservation terminée ne compte plus.
  useEffect(() => {
    const timer = window.setInterval(() => void loadLive(), 60_000);
    return () => window.clearInterval(timer);
  }, [loadLive]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [spaceRes, rateRes, photoRes, roleRes] = await Promise.all([
      supabase.from("spaces").select(SPACE_FIELDS).order("name"),
      supabase.from("space_rates").select("space_id, unit, price"),
      supabase.from("space_photos").select("id, space_id, path, position").order("position"),
      supabase.rpc("current_app_role"),
      loadLive(),
    ]);
    const firstError = spaceRes.error ?? rateRes.error ?? photoRes.error;
    if (firstError) {
      setError(`Impossible de charger les espaces : ${firstError.message}`);
    } else {
      setSpaces((spaceRes.data ?? []) as Space[]);
      setRates((rateRes.data ?? []) as SpaceRate[]);
      setPhotos((photoRes.data ?? []) as SpacePhoto[]);
    }
    setIsAdmin(roleRes.data === "admin");
    setLoading(false);
  }, [loadLive]);

  useEffect(() => {
    // Chargement initial : « loading » vaut déjà true au premier rendu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return spaces.filter(
      (space) =>
        (showInactive || space.is_active) &&
        (!query ||
          `${space.name} ${space.description ?? ""} ${space.space_type ?? ""} ${space.location ?? ""}`
            .toLocaleLowerCase()
            .includes(query))
    );
  }, [spaces, search, showInactive]);

  const activeCount = spaces.filter((s) => s.is_active).length;
  const seatsNow = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of live) {
      if (new Date(r.start_at).getTime() <= now && now < new Date(r.end_at).getTime()) {
        map.set(r.space_id, (map.get(r.space_id) ?? 0) + (r.seats ?? 1));
      }
    }
    return map;
  }, [live, now]);
  const bookedNowCount = spaces.filter((s) => s.is_active && (seatsNow.get(s.id) ?? 0) > 0).length;

  function photosOf(spaceId: string) {
    return photos.filter((p) => p.space_id === spaceId).sort((a, b) => a.position - b.position);
  }

  async function toggleActive(space: Space) {
    const next = !space.is_active;
    if (
      !window.confirm(
        next ? `Activer « ${space.name} » ?` : `Désactiver « ${space.name} » ? Il ne pourra plus être réservé.`
      )
    ) {
      return;
    }
    setError("");
    setSuccess("");
    const { data, error: updateError } = await supabase
      .from("spaces")
      .update({ is_active: next })
      .eq("id", space.id)
      .select(SPACE_FIELDS)
      .maybeSingle();
    if (updateError || !data) {
      setError(`Changement de statut impossible : ${updateError?.message ?? "droits insuffisants"}`);
      return;
    }
    setSpaces((current) => current.map((s) => (s.id === space.id ? (data as Space) : s)));
    setSuccess(`« ${space.name} » est maintenant ${next ? "actif" : "inactif"}.`);
  }

  const detailsSpace = spaces.find((s) => s.id === detailsId) ?? null;

  return (
    <div className="text-slate-900">
      <div className="mx-auto max-w-7xl">
        <PageHeader
          title="Espaces"
          description="Tes espaces, leurs photos, tarifs et équipements."
          actions={
            <>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
              >
                {loading ? "Actualisation..." : "Actualiser"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setSuccess("");
                  setFormFor("new");
                }}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                + Ajouter un espace
              </button>
            </>
          }
        />

        {error && (
          <p role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {success}
          </p>
        )}

        {/* Chiffres */}
        <section className="mb-5 grid grid-cols-3 gap-3">
          {(
            [
              ["Espaces", String(spaces.length), "text-slate-900"],
              ["Espaces actifs", String(activeCount), "text-green-600"],
              ["Réservés maintenant", `${bookedNowCount} / ${activeCount}`, "text-orange-600"],
            ] as const
          ).map(([label, value, color]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <p className="text-[11px] leading-tight text-slate-500 sm:text-sm">{label}</p>
              <p className={`mt-1 text-lg font-bold sm:text-2xl ${color}`}>{loading && spaces.length === 0 ? "—" : value}</p>
            </div>
          ))}
        </section>

        {/* Recherche */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, type, emplacement..."
            aria-label="Rechercher un espace"
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-600 sm:max-w-md"
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4"
            />
            Afficher les espaces inactifs
          </label>
        </div>

        {/* Cartes */}
        {loading && spaces.length === 0 ? (
          <p className="text-slate-600">Chargement des espaces...</p>
        ) : filtered.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
            {spaces.length === 0
              ? "Aucun espace pour le moment. Clique sur « + Ajouter un espace »."
              : "Aucun espace ne correspond à ta recherche."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filtered.map((space) => {
              const cover = spacePhotoUrl(space.photo_path);
              const count = photosOf(space.id).length;
              const summary = ratesSummary(rates.filter((r) => r.space_id === space.id));
              return (
                <article
                  key={space.id}
                  onClick={() => setDetailsId(space.id)}
                  className={`group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                    space.is_active ? "" : "opacity-70"
                  }`}
                >
                  <div className="relative h-24 bg-gradient-to-br from-blue-50 to-slate-100 sm:h-28">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element -- image Supabase Storage
                      <img src={cover} alt={`Photo de ${space.name}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[11px] font-medium text-slate-400">
                        Pas de photo
                      </div>
                    )}
                    <span
                      className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm ${
                        liveStatus(space, seatsNow.get(space.id) ?? 0).card
                      }`}
                    >
                      {liveStatus(space, seatsNow.get(space.id) ?? 0).label}
                    </span>
                    <span className="absolute right-2 top-2 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] font-medium text-white">
                      {count}/{MAX_SPACE_PHOTOS}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-3">
                    <h3 className="truncate text-sm font-semibold" title={space.name}>
                      {space.name}
                    </h3>
                    <p className="truncate text-[11px] text-slate-500">
                      {[space.space_type, space.location].filter(Boolean).join(" · ") || "Type non précisé"}
                    </p>
                    <p className="mt-1.5 truncate text-[11px] font-medium text-slate-700" title={summary || undefined}>
                      {summary || <span className="font-normal text-slate-400">Aucun tarif</span>}
                    </p>

                    <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                        {space.booking_mode === "seats" ? `${space.capacity} places` : `${space.capacity} pers.`}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailsId(space.id);
                        }}
                        className="text-[11px] font-semibold text-blue-700 hover:underline"
                      >
                        Détails →
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {detailsSpace && !formFor && (
        <SpaceDetails
          space={detailsSpace}
          seatsNow={seatsNow.get(detailsSpace.id) ?? 0}
          photos={photosOf(detailsSpace.id)}
          rates={rates.filter((r) => r.space_id === detailsSpace.id)}
          onClose={() => setDetailsId(null)}
          onEdit={() => setFormFor(detailsSpace)}
          onToggle={() => void toggleActive(detailsSpace)}
          onPhotosChanged={(next, cover) => {
            setPhotos((current) => [...current.filter((p) => p.space_id !== detailsSpace.id), ...next]);
            setSpaces((current) =>
              current.map((s) => (s.id === detailsSpace.id ? { ...s, photo_path: cover } : s))
            );
          }}
        />
      )}

      {formFor && (
        <SpaceForm
          space={formFor === "new" ? null : formFor}
          rates={formFor === "new" ? [] : rates.filter((r) => r.space_id === formFor.id)}
          isAdmin={isAdmin}
          onClose={() => setFormFor(null)}
          onSaved={(message) => {
            setFormFor(null);
            setSuccess(message);
            void load();
          }}
        />
      )}
    </div>
  );
}

// ---------- Fenêtres ----------

function Overlay({
  title,
  side,
  onClose,
  children,
}: {
  title: string;
  side?: boolean;
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
      className={`fixed inset-0 z-50 flex items-end bg-slate-900/50 ${
        side ? "sm:items-stretch sm:justify-end" : "justify-center sm:items-center sm:p-4"
      }`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl ${
          side ? "sm:max-h-none sm:max-w-lg sm:rounded-none" : "sm:max-w-2xl sm:rounded-2xl"
        }`}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2
            className={
              side ? "text-sm font-semibold uppercase tracking-wide text-slate-500" : "text-xl font-semibold"
            }
          >
            {title}
          </h2>
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

function SpaceForm({
  space,
  rates,
  isAdmin,
  onClose,
  onSaved,
}: {
  space: Space | null;
  rates: SpaceRate[];
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const creating = space === null;
  const [name, setName] = useState(space?.name ?? "");
  const [spaceType, setSpaceType] = useState(space?.space_type ?? "");
  const [description, setDescription] = useState(space?.description ?? "");
  const [capacity, setCapacity] = useState(String(space?.capacity ?? 1));
  const [bookingMode, setBookingMode] = useState<"whole" | "seats">(space?.booking_mode ?? "whole");
  const [area, setArea] = useState(space?.area_m2 ? String(space.area_m2) : "");
  const [location, setLocation] = useState(space?.location ?? "");
  const [amenities, setAmenities] = useState<string[]>(space?.amenities ?? []);
  const [rateValues, setRateValues] = useState<Record<RateUnit, string>>(() => {
    const values = { ...EMPTY_RATES };
    for (const r of rates) values[r.unit] = String(r.price);
    return values;
  });
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleAmenity(key: string) {
    setAmenities((current) => (current.includes(key) ? current.filter((a) => a !== key) : [...current, key]));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const cleanName = name.trim();
    const parsedCapacity = Number(capacity);
    const parsedArea = area.trim() ? Number(area) : null;

    if (!cleanName) {
      setError("Le nom de l'espace est obligatoire.");
      return;
    }
    if (!Number.isInteger(parsedCapacity) || parsedCapacity < 1) {
      setError("La capacité doit être un nombre entier supérieur à zéro.");
      return;
    }
    if (parsedArea !== null && (!Number.isInteger(parsedArea) || parsedArea < 1)) {
      setError("La surface doit être un nombre entier de m².");
      return;
    }

    setSaving(true);
    const payload = {
      name: cleanName,
      space_type: spaceType || null,
      description: description.trim() || null,
      capacity: parsedCapacity,
      booking_mode: bookingMode,
      area_m2: parsedArea,
      location: location.trim() || null,
      amenities,
    };

    const { data, error: saveError } = space
      ? await supabase.from("spaces").update(payload).eq("id", space.id).select("id").maybeSingle()
      : await supabase
          .from("spaces")
          .insert({ ...payload, is_active: true })
          .select("id")
          .single();

    if (saveError || !data) {
      setSaving(false);
      setError(`Enregistrement impossible : ${saveError?.message ?? "droits insuffisants"}`);
      return;
    }
    const spaceId = data.id as string;
    const warnings: string[] = [];

    if (isAdmin) {
      try {
        await saveRates(spaceId, rateValues);
      } catch (err) {
        warnings.push(err instanceof Error ? err.message : "Tarifs non enregistrés.");
      }
    }

    let sent = 0;
    for (const [index, file] of files.entries()) {
      try {
        await addSpacePhoto({ spaceId, file, position: index, setAsCover: index === 0 });
        sent++;
      } catch (err) {
        warnings.push(`Photo ${index + 1} : ${err instanceof Error ? err.message : "échec"}`);
      }
    }

    setSaving(false);
    const base = creating ? `Espace « ${cleanName} » ajouté` : `Espace « ${cleanName} » mis à jour`;
    const photoText = sent ? ` avec ${sent} photo(s)` : "";
    onSaved(`${base}${photoText}.${warnings.length ? ` Attention : ${warnings.join(" ; ")}` : ""}`);
  }

  return (
    <Overlay title={creating ? "Ajouter un espace" : "Modifier l'espace"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-6">
        {/* Informations */}
        <section className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Nom de l&apos;espace *</span>
            <input
              required
              autoFocus
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Salle de réunion Baobab"
              className={fieldClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Type d&apos;espace</span>
            <select value={spaceType} onChange={(e) => setSpaceType(e.target.value)} className={fieldClass}>
              <option value="">— Non précisé —</option>
              {SPACE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Emplacement</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={100}
              placeholder="Ex. 1er étage, aile gauche"
              className={fieldClass}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Ce qui rend cet espace utile : lumière, calme, vue..."
              className={fieldClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Capacité (personnes) *</span>
            <input
              type="number"
              min={1}
              required
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Surface (m²)</span>
            <input
              type="number"
              min={1}
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Facultatif"
              className={fieldClass}
            />
          </label>
        </section>

        {/* Mode de réservation */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Mode de réservation</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["whole", "Espace entier", "Une réservation bloque tout l'espace (salle de réunion, bureau privé)."],
                ["seats", "Par place", "Plusieurs membres en même temps, jusqu'à la capacité (open space)."],
              ] as const
            ).map(([value, label, help]) => (
              <label
                key={value}
                className={`cursor-pointer rounded-lg border p-3 text-sm ${
                  bookingMode === value ? "border-blue-600 bg-blue-50" : "border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    name="bookingMode"
                    checked={bookingMode === value}
                    onChange={() => setBookingMode(value)}
                  />
                  {label}
                </span>
                <span className="mt-1 block text-xs text-slate-500">{help}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Tarifs */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Tarifs (F CFA)</legend>
          {isAdmin ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {RATE_UNITS.map(({ unit, label }) => (
                  <label key={unit} className="block text-xs">
                    <span className="mb-1 block text-slate-600">{label.replace("Par ", "")}</span>
                    <input
                      inputMode="numeric"
                      value={rateValues[unit]}
                      onChange={(e) => setRateValues((v) => ({ ...v, [unit]: e.target.value }))}
                      placeholder="—"
                      className={fieldClass}
                    />
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Case vide = durée non proposée. À la réservation, la formule la moins chère est proposée.
                {bookingMode === "seats" && " En mode « par place », le tarif s'entend par place."}
              </p>
            </>
          ) : (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
              Seul l&apos;administrateur peut définir les tarifs.
            </p>
          )}
        </fieldset>

        {/* Équipements */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Équipements</legend>
          <div className="flex flex-wrap gap-2">
            {AMENITIES.map(({ key, label }) => {
              const on = amenities.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleAmenity(key)}
                  aria-pressed={on}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    on
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {on ? "✓ " : ""}
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Photos (création) */}
        {creating ? (
          <NewPhotosField files={files} onChange={setFiles} />
        ) : (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
            Les photos se gèrent dans la fiche de l&apos;espace (bouton « Détails »).
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving
              ? files.length
                ? "Envoi des photos..."
                : "Enregistrement..."
              : creating
                ? "Ajouter l'espace"
                : "Enregistrer"}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

function NewPhotosField({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">
        Photos ({files.length}/{MAX_SPACE_PHOTOS}) — la première sera la couverture
      </legend>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {previews.map((url, index) => (
          <div key={url} className="relative aspect-square overflow-hidden rounded-lg border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local */}
            <img src={url} alt={`Photo ${index + 1}`} className="h-full w-full object-cover" />
            {index === 0 && (
              <span className="absolute left-1 top-1 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                Couverture
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange(files.filter((_, i) => i !== index))}
              aria-label={`Retirer la photo ${index + 1}`}
              className="absolute right-1 top-1 rounded-full bg-white/90 px-1.5 text-xs font-bold text-red-600 shadow"
            >
              ✕
            </button>
          </div>
        ))}
        {files.length < MAX_SPACE_PHOTOS && (
          <PhotoButton
            label="Ajouter une photo"
            onFile={(file) => onChange([...files, file].slice(0, MAX_SPACE_PHOTOS))}
            className="flex aspect-square flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-600"
          >
            <span className="text-2xl">＋</span>
            <span className="text-[11px] font-medium">Photo</span>
          </PhotoButton>
        )}
      </div>
    </fieldset>
  );
}

function SpaceDetails({
  space,
  photos,
  rates,
  seatsNow,
  onClose,
  onEdit,
  onToggle,
  onPhotosChanged,
}: {
  space: Space;
  photos: SpacePhoto[];
  rates: SpaceRate[];
  seatsNow: number;
  onClose: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onPhotosChanged: (photos: SpacePhoto[], cover: string | null) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selected =
    photos.find((p) => p.id === selectedId) ??
    photos.find((p) => p.path === space.photo_path) ??
    photos[0] ??
    null;
  const selectedUrl = spacePhotoUrl(selected?.path ?? null);
  const selectedIndex = selected ? photos.findIndex((p) => p.id === selected.id) : -1;
  const canBrowse = photos.length > 1;

  // Photo précédente / suivante (la galerie boucle : après la dernière, la première)
  const goTo = useCallback(
    (delta: number) => {
      if (photos.length < 2 || selectedIndex < 0) return;
      const next = (selectedIndex + delta + photos.length) % photos.length;
      setSelectedId(photos[next].id);
    },
    [photos, selectedIndex]
  );

  // Flèches du clavier (sauf pendant une saisie)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "ArrowLeft") goTo(-1);
      if (event.key === "ArrowRight") goTo(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  // Glisser du doigt sur téléphone
  const touchStartX = useRef<number | null>(null);

  // La miniature de la photo affichée reste visible dans la bande
  const thumbsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const thumb = thumbsRef.current?.querySelector<HTMLElement>(`[data-photo-id="${selected?.id}"]`);
    thumb?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [selected?.id]);

  async function add(file: File) {
    setError("");
    setBusy(true);
    try {
      const photo = await addSpacePhoto({
        spaceId: space.id,
        file,
        position: Math.max(-1, ...photos.map((p) => p.position)) + 1,
        setAsCover: !space.photo_path,
      });
      onPhotosChanged([...photos, photo], space.photo_path ?? photo.path);
      setSelectedId(photo.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(photo: SpacePhoto) {
    if (!window.confirm("Supprimer cette photo ?")) return;
    setError("");
    setBusy(true);
    try {
      const remaining = photos.filter((p) => p.id !== photo.id);
      const cover = await deleteSpacePhoto(photo, remaining, space.photo_path);
      onPhotosChanged(remaining, cover);
      setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function makeCover(photo: SpacePhoto) {
    setError("");
    setBusy(true);
    try {
      await setSpaceCover(space.id, photo.path);
      onPhotosChanged(photos, photo.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Modification impossible.");
    } finally {
      setBusy(false);
    }
  }

  const summary = ratesSummary(rates);

  return (
    <Overlay title="Fiche espace" side onClose={onClose}>
      {/* Galerie */}
      <div className="overflow-hidden rounded-xl bg-slate-100">
        <div
          className="relative aspect-[4/3] select-none"
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0].clientX;
          }}
          onTouchEnd={(event) => {
            if (touchStartX.current === null) return;
            const dx = event.changedTouches[0].clientX - touchStartX.current;
            touchStartX.current = null;
            if (Math.abs(dx) > 40) goTo(dx < 0 ? 1 : -1);
          }}
        >
          {selectedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- image Supabase Storage
            <img
              key={selectedUrl}
              src={selectedUrl}
              alt={`Photo ${selectedIndex + 1} de ${space.name}`}
              draggable={false}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">Aucune photo</div>
          )}
          {selected && selected.path === space.photo_path && (
            <span className="absolute left-3 top-3 rounded-full bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white">
              Couverture
            </span>
          )}

          {canBrowse && (
            <>
              <button
                type="button"
                onClick={() => goTo(-1)}
                aria-label="Photo précédente"
                className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-xl font-bold text-slate-800 shadow-md transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => goTo(1)}
                aria-label="Photo suivante"
                className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-xl font-bold text-slate-800 shadow-md transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                ›
              </button>
              <span
                aria-live="polite"
                className="absolute bottom-3 right-3 rounded-full bg-slate-900/70 px-2.5 py-1 text-xs font-medium text-white"
              >
                {selectedIndex + 1} / {photos.length}
              </span>
            </>
          )}
        </div>
      </div>

      <div ref={thumbsRef} className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            data-photo-id={photo.id}
            onClick={() => setSelectedId(photo.id)}
            aria-label={`Voir la photo ${index + 1}`}
            className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${
              selected?.id === photo.id ? "border-blue-600" : "border-transparent"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- image Supabase Storage */}
            <img src={spacePhotoUrl(photo.path) ?? ""} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
        {photos.length < MAX_SPACE_PHOTOS && (
          <PhotoButton
            label="Ajouter une photo"
            disabled={busy}
            onFile={(file) => void add(file)}
            className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
          >
            <span className="text-lg">{busy ? "…" : "＋"}</span>
          </PhotoButton>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-slate-500">
          {photos.length}/{MAX_SPACE_PHOTOS} photos
        </span>
        {selected && (
          <div className="flex gap-2">
            {selected.path !== space.photo_path && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void makeCover(selected)}
                className="rounded-lg border border-slate-300 px-2.5 py-1 font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                Mettre en couverture
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove(selected)}
              className="rounded-lg border border-red-200 px-2.5 py-1 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Supprimer la photo
            </button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Informations */}
      <div className="mt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold">{space.name}</h3>
            <p className="text-sm text-slate-500">{space.space_type ?? "Type non précisé"}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${liveStatus(space, seatsNow).pill}`}>
            {liveStatus(space, seatsNow).label}
          </span>
        </div>
        {space.description && <p className="mt-3 text-sm text-slate-600">{space.description}</p>}
      </div>

      <dl className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
        {(
          [
            ["Capacité", `${space.capacity} personne(s)`],
            ["Mode de réservation", space.booking_mode === "seats" ? "Par place" : "Espace entier"],
            ["Surface", space.area_m2 ? `${space.area_m2} m²` : null],
            ["Emplacement", space.location],
            ["Tarifs", summary || null],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-right font-medium">{value || "—"}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        <p className="mb-2 text-sm font-medium">Équipements</p>
        {space.amenities.length ? (
          <div className="flex flex-wrap gap-1.5">
            {space.amenities.map((a) => (
              <span key={a} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                {amenityLabel(a)}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Aucun équipement renseigné.</p>
        )}
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Modifier
        </button>
        <button
          type="button"
          onClick={onToggle}
          className={`rounded-lg border px-4 py-2.5 text-sm font-semibold ${
            space.is_active
              ? "border-red-200 text-red-700 hover:bg-red-50"
              : "border-green-200 text-green-700 hover:bg-green-50"
          }`}
        >
          {space.is_active ? "Désactiver" : "Activer"}
        </button>
      </div>
    </Overlay>
  );
}
