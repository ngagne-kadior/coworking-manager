"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BrandMark } from "@/components/BrandMark";
import { spacePhotoUrl } from "@/lib/photos";
import {
  AMENITY_LABELS,
  SOCIALS,
  type PublicCatalog,
  type PublicSpace,
  whatsappLink,
} from "@/lib/public";

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ok"; catalog: PublicCatalog };

const HOURS = Array.from({ length: (22 - 7) * 2 + 1 }, (_, i) => {
  const minutes = 7 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

export default function EspacesDisponiblesPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [type, setType] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.rpc("get_public_catalog").then(({ data, error }) => {
      if (!active) return;
      setState(error || !data ? { kind: "error" } : { kind: "ok", catalog: data as PublicCatalog });
    });
    return () => {
      active = false;
    };
  }, []);

  const catalog = state.kind === "ok" ? state.catalog : null;
  const settings = catalog?.settings;
  const name = settings?.coworking_name ?? "Coworking";
  const socialLinks = SOCIALS.flatMap((s) => {
    const url = settings?.socials?.[s.key];
    return url && url.startsWith("https://") ? [{ ...s, url }] : [];
  });

  const types = useMemo(
    () => Array.from(new Set((catalog?.spaces ?? []).map((s) => s.space_type).filter(Boolean))) as string[],
    [catalog]
  );
  const visible = (catalog?.spaces ?? []).filter((s) => type === "all" || s.space_type === type);
  const open = catalog?.spaces.find((s) => s.id === openId) ?? null;

  return (
    <div className="min-h-screen bg-[#f4f7fc] text-slate-900">
      {/* En-tête */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <BrandMark size="md" letter={name} />
            <span className="font-bold">{name}</span>
          </div>
          <Link
            href="/login"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Espace équipe
          </Link>
        </div>
      </header>

      {/* Présentation */}
      <section className="bg-[#111c36] text-white">
        <div className="mx-auto max-w-6xl px-4 py-9 sm:px-6 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">Espaces de travail</p>
          <h1 className="mt-3 max-w-2xl text-2xl font-bold leading-tight sm:text-4xl">
            {settings?.tagline || `Trouve l'espace qui te convient chez ${name}`}
          </h1>
          {settings?.address && <p className="mt-3 text-sm text-slate-300">{settings.address}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="#espaces"
              className="rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-400 sm:px-5 sm:py-3"
            >
              Voir les espaces
            </a>
            {settings?.whatsapp && (
              <a
                href={whatsappLink(settings.whatsapp, `Bonjour ${name}, je souhaite des informations sur vos espaces.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-white/25 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 sm:px-5 sm:py-3"
              >
                Nous écrire sur WhatsApp
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Espaces */}
      <main id="espaces" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold">Nos espaces</h2>
            <p className="mt-1 text-sm text-slate-500">Clique sur un espace pour voir les photos et faire une demande.</p>
          </div>
          {types.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par type">
              {["all", ...types].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  aria-pressed={type === t}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    type === t ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-600"
                  }`}
                >
                  {t === "all" ? "Tous" : t}
                </button>
              ))}
            </div>
          )}
        </div>

        {state.kind === "loading" && <p className="mt-8 text-slate-500">Chargement des espaces...</p>}
        {state.kind === "error" && (
          <p className="mt-8 rounded-xl bg-red-50 p-5 text-sm text-red-700">
            Impossible d&apos;afficher les espaces pour le moment. Réessaie dans un instant.
          </p>
        )}
        {state.kind === "ok" && visible.length === 0 && (
          <p className="mt-8 rounded-xl border border-slate-200 bg-white p-6 text-slate-500">
            Aucun espace à afficher pour le moment.
          </p>
        )}

        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((space) => {
            const cover = spacePhotoUrl(space.cover ?? space.photos[0] ?? null);
            return (
              <button
                key={space.id}
                type="button"
                onClick={() => setOpenId(space.id)}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="relative h-48 bg-gradient-to-br from-blue-50 to-slate-100">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element -- image Supabase Storage
                    <img src={cover} alt={`Photo de ${space.name}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">Photo à venir</div>
                  )}
                  {space.photos.length > 1 && (
                    <span className="absolute bottom-3 right-3 rounded-full bg-slate-900/70 px-2.5 py-1 text-xs text-white">
                      {space.photos.length} photos
                    </span>
                  )}
                </div>
                <div className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                    {space.space_type ?? "Espace"}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold">{space.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {space.booking_mode === "seats" ? `${space.capacity} places` : `Jusqu'à ${space.capacity} pers.`}
                    {space.area_m2 ? ` · ${space.area_m2} m²` : ""}
                    {space.location ? ` · ${space.location}` : ""}
                  </p>
                  {space.amenities.length > 0 && (
                    <p className="mt-3 line-clamp-1 text-xs text-slate-500">
                      {space.amenities.map((a) => AMENITY_LABELS[a] ?? a).join(" · ")}
                    </p>
                  )}
                  <p className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
                    <span className="text-slate-500">Prix sur demande</span>
                    <span className="font-semibold text-blue-700 group-hover:underline">Voir l&apos;espace →</span>
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </main>

      {/* Pied de page */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:justify-between sm:px-6">
          <div>
            <p className="font-semibold text-slate-700">{name}</p>
            {socialLinks.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Suivez-nous</p>
                <ul className="flex flex-wrap gap-2">
                  {socialLinks.map((s) => (
                    <li key={s.key}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-block rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-sm transition hover:opacity-85 ${s.style}`}
                      >
                        {s.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 sm:items-end">
            {settings?.address && <span>{settings.address}</span>}
            {settings?.phone && (
              <a href={`tel:${settings.phone}`} className="hover:underline">
                {settings.phone}
              </a>
            )}
            {settings?.email && (
              <a href={`mailto:${settings.email}`} className="hover:underline">
                {settings.email}
              </a>
            )}
          </div>
        </div>
      </footer>

      {open && settings && <SpaceModal space={open} settings={catalog!.settings} onClose={() => setOpenId(null)} />}
    </div>
  );
}

// ---------- Fiche d'un espace ----------

function SpaceModal({
  space,
  settings,
  onClose,
}: {
  space: PublicSpace;
  settings: PublicCatalog["settings"];
  onClose: () => void;
}) {
  const photos = space.photos.length ? space.photos : space.cover ? [space.cover] : [];
  const [index, setIndex] = useState(() => Math.max(0, photos.indexOf(space.cover ?? "")));
  const [mode, setMode] = useState<"view" | "form" | "sent">("view");

  const goTo = useCallback(
    (delta: number) => {
      if (photos.length < 2) return;
      setIndex((i) => (i + delta + photos.length) % photos.length);
    },
    [photos.length]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName ?? "";
      if (event.key === "Escape") onClose();
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (event.key === "ArrowLeft") goTo(-1);
      if (event.key === "ArrowRight") goTo(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, onClose]);

  const touchX = useRef<number | null>(null);
  const url = spacePhotoUrl(photos[index] ?? null);
  const waMessage = `Bonjour ${settings.coworking_name}, je souhaite réserver « ${space.name} ». Pouvez-vous me donner vos disponibilités et vos tarifs ?`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={space.name}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[94vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:max-w-3xl sm:rounded-2xl"
      >
        {/* Galerie */}
        <div
          className="relative aspect-[16/10] select-none bg-slate-100 sm:rounded-t-2xl"
          onTouchStart={(e) => {
            touchX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (Math.abs(dx) > 40) goTo(dx < 0 ? 1 : -1);
          }}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- image Supabase Storage
            <img
              src={url}
              alt={`Photo ${index + 1} de ${space.name}`}
              draggable={false}
              className="h-full w-full object-cover sm:rounded-t-2xl"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">Photo à venir</div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow"
          >
            ✕
          </button>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => goTo(-1)}
                aria-label="Photo précédente"
                className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-xl font-bold shadow-md hover:bg-white"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => goTo(1)}
                aria-label="Photo suivante"
                className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-xl font-bold shadow-md hover:bg-white"
              >
                ›
              </button>
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Photo ${i + 1}`}
                    className={`h-2 rounded-full transition-all ${i === index ? "w-5 bg-white" : "w-2 bg-white/60"}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{space.space_type ?? "Espace"}</p>
          <h2 className="mt-1 text-2xl font-bold">{space.name}</h2>

          {mode === "view" && (
            <>
              {space.description && <p className="mt-3 text-slate-600">{space.description}</p>}
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                {[
                  ["Capacité", space.booking_mode === "seats" ? `${space.capacity} places` : `${space.capacity} pers.`],
                  ["Surface", space.area_m2 ? `${space.area_m2} m²` : "—"],
                  ["Emplacement", space.location ?? "—"],
                  ["Tarif", "Sur demande"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 p-3">
                    <dt className="text-xs text-slate-500">{label}</dt>
                    <dd className="mt-0.5 font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              {space.amenities.length > 0 && (
                <div className="mt-5">
                  <p className="text-sm font-medium">Équipements</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {space.amenities.map((a) => (
                      <span key={a} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                        {AMENITY_LABELS[a] ?? a}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {settings.whatsapp && (
                  <a
                    href={whatsappLink(settings.whatsapp, waMessage)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl bg-emerald-600 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Réserver par WhatsApp
                  </a>
                )}
                {settings.requests_enabled && (
                  <button
                    type="button"
                    onClick={() => setMode("form")}
                    className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Faire une demande en ligne
                  </button>
                )}
              </div>
              {!settings.whatsapp && !settings.requests_enabled && settings.phone && (
                <a
                  href={`tel:${settings.phone}`}
                  className="mt-6 block rounded-xl bg-blue-600 px-5 py-3 text-center text-sm font-semibold text-white"
                >
                  Appeler pour réserver
                </a>
              )}
            </>
          )}

          {mode === "form" && (
            <RequestForm space={space} onCancel={() => setMode("view")} onSent={() => setMode("sent")} />
          )}

          {mode === "sent" && (
            <div className="mt-6 rounded-xl bg-emerald-50 p-6 text-center">
              <p className="text-lg font-semibold text-emerald-800">Demande envoyée !</p>
              <p className="mt-2 text-sm text-emerald-700">
                Merci. L&apos;équipe de {settings.coworking_name} te recontacte rapidement pour confirmer la
                disponibilité et le tarif.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 rounded-lg border border-emerald-300 px-5 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RequestForm({
  space,
  onCancel,
  onSent,
}: {
  space: PublicSpace;
  onCancel: () => void;
  onSent: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState(todayKey);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("12:00");
  const [people, setPeople] = useState(1);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // champ piège pour les robots
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (end <= start) {
      setError("L'heure de fin doit être après l'heure de début.");
      return;
    }
    setSending(true);
    const { error: rpcError } = await supabase.rpc("submit_booking_request", {
      p_space_id: space.id,
      p_full_name: fullName,
      p_phone: phone,
      p_email: email || null,
      p_desired_date: date,
      p_start_time: start,
      p_end_time: end,
      p_people: people,
      p_message: message || null,
      p_website: website || null,
    });
    setSending(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    onSent();
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <p className="text-sm text-slate-500">
        Envoie ta demande : l&apos;équipe te confirme la disponibilité et le tarif. Rien n&apos;est payé en ligne.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Nom complet *</span>
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Téléphone / WhatsApp *</span>
          <input
            required
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            placeholder="77 000 00 00"
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">E-mail (facultatif)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Date souhaitée *</span>
          <input type="date" required min={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">De</span>
            <select value={start} onChange={(e) => setStart(e.target.value)} className={inputClass}>
              {HOURS.slice(0, -1).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">À</span>
            <select value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass}>
              {HOURS.slice(1).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Nombre de personnes</span>
          <input
            type="number"
            min={1}
            max={space.capacity}
            value={people}
            onChange={(e) => setPeople(Math.min(Math.max(Number(e.target.value) || 1, 1), space.capacity))}
            className={inputClass}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Message (facultatif)</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Ex. réunion d'équipe, besoin d'un vidéoprojecteur..."
          className={inputClass}
        />
      </label>

      {/* Champ invisible pour les humains : s'il est rempli, c'est un robot */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Site web
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium hover:bg-slate-50">
          Retour
        </button>
        <button
          type="submit"
          disabled={sending}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {sending ? "Envoi..." : "Envoyer ma demande"}
        </button>
      </div>
    </form>
  );
}
