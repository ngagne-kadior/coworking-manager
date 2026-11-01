"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/AppShell";
import { normalizeSocial, PUBLIC_PATH, SOCIALS } from "@/lib/public";
import { BRAND_BUCKET, prepareLogo, refreshBrand, useBrand } from "@/lib/brand";
import { BrandLockup } from "@/components/BrandMark";

type Settings = {
  coworking_name: string;
  tagline: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  public_requests_enabled: boolean;
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  linkedin_url: string | null;
  youtube_url: string | null;
  x_url: string | null;
};

type SocialColumn = "facebook_url" | "instagram_url" | "tiktok_url" | "linkedin_url" | "youtube_url" | "x_url";

type Load = { kind: "loading" } | { kind: "forbidden" } | { kind: "error"; message: string } | { kind: "ok" };

const fieldClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

export default function ParametresPage() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [form, setForm] = useState<Settings>({
    coworking_name: "",
    tagline: "",
    whatsapp: "",
    phone: "",
    email: "",
    address: "",
    public_requests_enabled: true,
    facebook_url: "",
    instagram_url: "",
    tiktok_url: "",
    linkedin_url: "",
    youtube_url: "",
    x_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.rpc("current_app_role"),
      supabase
        .from("app_settings")
        .select(
          "coworking_name, tagline, whatsapp, phone, email, address, public_requests_enabled, facebook_url, instagram_url, tiktok_url, linkedin_url, youtube_url, x_url"
        )
        .maybeSingle(),
    ]).then(([roleRes, settingsRes]) => {
      if (!active) return;
      setOrigin(window.location.origin);
      if (roleRes.data !== "admin") {
        setLoad({ kind: "forbidden" });
        return;
      }
      if (settingsRes.error || !settingsRes.data) {
        setLoad({
          kind: "error",
          message: settingsRes.error?.message ?? "Paramètres introuvables : le SQL du portail public a-t-il été exécuté ?",
        });
        return;
      }
      const d = settingsRes.data as Settings;
      setForm({
        ...d,
        tagline: d.tagline ?? "",
        whatsapp: d.whatsapp ?? "",
        phone: d.phone ?? "",
        email: d.email ?? "",
        address: d.address ?? "",
        facebook_url: d.facebook_url ?? "",
        instagram_url: d.instagram_url ?? "",
        tiktok_url: d.tiktok_url ?? "",
        linkedin_url: d.linkedin_url ?? "",
        youtube_url: d.youtube_url ?? "",
        x_url: d.x_url ?? "",
      });
      setLoad({ kind: "ok" });
    });
    return () => {
      active = false;
    };
  }, []);

  const publicUrl = `${origin}${PUBLIC_PATH}`;

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!form.coworking_name.trim()) {
      setMessage({ ok: false, text: "Le nom du coworking est obligatoire." });
      return;
    }
    const socials: Partial<Record<SocialColumn, string | null>> = {};
    for (const social of SOCIALS) {
      const column = social.column as SocialColumn;
      const value = normalizeSocial(social.base, form[column] ?? "");
      if (value === "invalid") {
        setMessage({ ok: false, text: `Lien ${social.label} incorrect : colle le lien de ta page ou ton nom (@...).` });
        return;
      }
      socials[column] = value;
    }
    setSaving(true);
    const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
    const { error } = await supabase
      .from("app_settings")
      .update({
        coworking_name: form.coworking_name.trim(),
        tagline: clean(form.tagline),
        whatsapp: clean(form.whatsapp),
        phone: clean(form.phone),
        email: clean(form.email),
        address: clean(form.address),
        public_requests_enabled: form.public_requests_enabled,
        ...socials,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    setSaving(false);
    if (!error) setForm((f) => ({ ...f, ...socials }));
    setMessage(
      error
        ? { ok: false, text: `Enregistrement impossible : ${error.message}` }
        : { ok: true, text: "Paramètres enregistrés. La page publique est à jour." }
    );
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setMessage({ ok: true, text: "Lien copié : tu peux le coller dans WhatsApp, un SMS ou tes réseaux." });
    } catch {
      setMessage({ ok: false, text: "Copie impossible : sélectionne le lien à la main." });
    }
  }

  return (
    <div className="text-slate-900">
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Paramètres" description="Informations affichées aux clients sur la page publique des espaces." />

        {load.kind === "loading" && <p className="text-slate-500">Chargement...</p>}
        {load.kind === "forbidden" && (
          <p role="alert" className="rounded-xl bg-amber-50 p-5 text-amber-800">
            Cette page est réservée à l&apos;administrateur.
          </p>
        )}
        {load.kind === "error" && (
          <p role="alert" className="rounded-xl bg-red-50 p-5 text-red-700">
            {load.message}
          </p>
        )}

        {load.kind === "ok" && (
          <>
            {/* Lien public */}
            <section className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
              <h2 className="font-semibold text-blue-900">Lien à partager avec tes clients</h2>
              <p className="mt-1 text-sm text-blue-800">
                Les clients qui ouvrent l&apos;adresse du site arrivent aussi directement sur cette page.
              </p>
              <p className="mt-3 break-all rounded-lg bg-white px-3 py-2 font-mono text-sm">{publicUrl}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
                >
                  Copier le lien
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Découvre nos espaces de coworking : ${publicUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  Partager sur WhatsApp
                </a>
                <Link
                  href={PUBLIC_PATH}
                  target="_blank"
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  Voir la page
                </Link>
              </div>
            </section>

            <LogoSection onMessage={setMessage} />

            {message && (
              <p
                role={message.ok ? "status" : "alert"}
                className={`mb-6 rounded-lg p-4 text-sm ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
              >
                {message.text}
              </p>
            )}

            <form onSubmit={save} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Nom du coworking *</span>
                <input
                  required
                  maxLength={80}
                  value={form.coworking_name}
                  onChange={(e) => set("coworking_name", e.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Phrase d&apos;accueil</span>
                <input
                  maxLength={140}
                  value={form.tagline ?? ""}
                  onChange={(e) => set("tagline", e.target.value)}
                  placeholder="Ex. Des espaces calmes et équipés au cœur de Mbour"
                  className={fieldClass}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Numéro WhatsApp</span>
                  <input
                    type="tel"
                    value={form.whatsapp ?? ""}
                    onChange={(e) => set("whatsapp", e.target.value)}
                    placeholder="77 000 00 00"
                    className={fieldClass}
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    Vide = pas de bouton WhatsApp sur la page publique.
                  </span>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Téléphone</span>
                  <input
                    type="tel"
                    value={form.phone ?? ""}
                    onChange={(e) => set("phone", e.target.value)}
                    className={fieldClass}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">E-mail</span>
                  <input
                    type="email"
                    value={form.email ?? ""}
                    onChange={(e) => set("email", e.target.value)}
                    className={fieldClass}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Adresse</span>
                  <input
                    value={form.address ?? ""}
                    onChange={(e) => set("address", e.target.value)}
                    placeholder="Ex. Route de Saly, Mbour"
                    className={fieldClass}
                  />
                </label>
              </div>

              <fieldset className="rounded-lg border border-slate-200 p-4">
                <legend className="px-1 text-sm font-medium">Réseaux sociaux</legend>
                <p className="mb-3 text-xs text-slate-500">
                  Colle le lien de ta page, ou tape juste ton nom (ex. @moncoworking). Laisse vide si tu n&apos;as
                  pas ce réseau.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {SOCIALS.map((social) => {
                    const column = social.column as SocialColumn;
                    return (
                      <label key={social.key} className="block text-sm">
                        <span className="mb-1 block font-medium">{social.label}</span>
                        <input
                          value={form[column] ?? ""}
                          onChange={(e) => set(column, e.target.value)}
                          placeholder={social.placeholder}
                          maxLength={300}
                          autoCapitalize="off"
                          autoCorrect="off"
                          spellCheck={false}
                          className={fieldClass}
                        />
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 text-sm">
                <input
                  type="checkbox"
                  checked={form.public_requests_enabled}
                  onChange={(e) => set("public_requests_enabled", e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <span className="block font-medium">Accepter les demandes en ligne</span>
                  <span className="text-slate-500">
                    Décoche pour retirer le formulaire de la page publique (le bouton WhatsApp reste).
                  </span>
                </span>
              </label>

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Logo ----------

function LogoSection({ onMessage }: { onMessage: (m: { ok: boolean; text: string } | null) => void }) {
  const brand = useBrand();
  const [busy, setBusy] = useState(false);

  async function currentPath() {
    const { data } = await supabase.from("app_settings").select("logo_path").eq("id", true).maybeSingle();
    return (data?.logo_path as string | null | undefined) ?? null;
  }

  async function upload(file: File) {
    onMessage(null);
    setBusy(true);
    try {
      const blob = await prepareLogo(file);
      const previous = await currentPath();
      const path = `logo-${Date.now()}.png`;
      const { error: upErr } = await supabase.storage
        .from(BRAND_BUCKET)
        .upload(path, blob, { contentType: "image/png", upsert: false });
      if (upErr) throw new Error(`Envoi impossible : ${upErr.message}`);
      const { error: dbErr } = await supabase.from("app_settings").update({ logo_path: path }).eq("id", true);
      if (dbErr) {
        await supabase.storage.from(BRAND_BUCKET).remove([path]);
        throw new Error(`Enregistrement impossible : ${dbErr.message}`);
      }
      if (previous) await supabase.storage.from(BRAND_BUCKET).remove([previous]);
      refreshBrand();
      onMessage({ ok: true, text: "Logo mis à jour partout : menu, page publique et page de connexion." });
    } catch (e) {
      onMessage({ ok: false, text: e instanceof Error ? e.message : "Envoi du logo impossible." });
    } finally {
      setBusy(false);
    }
  }

  async function removeLogo() {
    if (!window.confirm("Retirer le logo ? La lettre « C » reviendra à sa place.")) return;
    onMessage(null);
    setBusy(true);
    const previous = await currentPath();
    const { error } = await supabase.from("app_settings").update({ logo_path: null }).eq("id", true);
    if (!error && previous) await supabase.storage.from(BRAND_BUCKET).remove([previous]);
    setBusy(false);
    refreshBrand();
    onMessage(error ? { ok: false, text: `Suppression impossible : ${error.message}` } : { ok: true, text: "Logo retiré." });
  }

  return (
    <section className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
      <div className="flex h-16 min-w-[64px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3">
        <BrandLockup size="lg" name={null} />
      </div>
      <div className="flex-1">
        <h2 className="font-semibold">Logo du coworking</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Logo horizontal ou carré, PNG de préférence (fond transparent). Les marges vides autour sont retirées
          automatiquement.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <label
          className={`cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 ${
            busy ? "pointer-events-none opacity-60" : ""
          }`}
        >
          {busy ? "Envoi..." : brand.logoUrl ? "Changer le logo" : "Ajouter un logo"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
        {brand.logoUrl && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void removeLogo()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Retirer
          </button>
        )}
      </div>
    </section>
  );
}
