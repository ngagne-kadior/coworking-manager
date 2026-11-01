"use client";

import { useState, type ReactNode } from "react";
import { useBrand } from "@/lib/brand";

const SIZES = {
  sm: "h-8 w-8 rounded-lg text-sm",
  md: "h-9 w-9 rounded-xl text-base",
  lg: "h-10 w-10 rounded-xl text-lg",
  xl: "h-16 w-16 rounded-2xl text-2xl",
} as const;

/** Hauteur du logo selon l'endroit (largeur automatique, plafonnée). */
const LOGO_HEIGHTS = {
  sm: "h-8 max-w-[150px]",
  md: "h-10 max-w-[190px] sm:h-12 sm:max-w-[260px]",
  lg: "h-11 max-w-[196px]",
  xl: "h-16 max-w-[280px]",
} as const;

/** Un logo est « large » (il contient déjà le nom) quand il est 1,6 fois plus large que haut. */
const WIDE_RATIO = 1.6;

/** Petite pastille carrée (lettre ou logo réduit) — pour les aperçus compacts. */
export function BrandMark({ size = "md", letter }: { size?: keyof typeof SIZES; letter?: string }) {
  const brand = useBrand();
  const initial = (letter ?? brand.name ?? "C").trim().charAt(0).toUpperCase() || "C";
  if (brand.logoUrl) {
    return (
      <span className={`flex shrink-0 items-center justify-center overflow-hidden bg-white p-0.5 shadow-sm ring-1 ring-slate-200 ${SIZES[size]}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- image Supabase Storage */}
        <img src={brand.logoUrl} alt="Logo" className="h-full w-full object-contain" />
      </span>
    );
  }
  return (
    <span className={`flex shrink-0 items-center justify-center bg-blue-600 font-bold text-white ${SIZES[size]}`}>
      {initial}
    </span>
  );
}

/**
 * Logo d'en-tête complet, à sa vraie forme :
 * - logo large (avec le nom dedans) : affiché seul, en grand ;
 * - logo carré : affiché avec le nom à côté ;
 * - pas de logo : lettre + nom.
 * Sur fond sombre, le logo est posé sur une plaque blanche pour rester lisible.
 */
export function BrandLockup({
  size = "md",
  surface = "light",
  name,
}: {
  size?: keyof typeof LOGO_HEIGHTS;
  surface?: "light" | "dark";
  /** Texte affiché à côté d'un logo carré ou de la lettre. */
  name: ReactNode;
}) {
  const brand = useBrand();
  const [ratio, setRatio] = useState<{ url: string; value: number } | null>(null);
  const measured = brand.logoUrl && ratio?.url === brand.logoUrl ? ratio.value : null;

  if (!brand.logoUrl) {
    return (
      <span className="flex items-center gap-2.5">
        <BrandMark size={size === "xl" ? "xl" : size === "sm" ? "sm" : size === "lg" ? "lg" : "md"} letter="C" />
        {name}
      </span>
    );
  }

  const wide = measured !== null && measured >= WIDE_RATIO;
  const image = (
    // eslint-disable-next-line @next/next/no-img-element -- image Supabase Storage
    <img
      src={brand.logoUrl}
      alt="Logo"
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.naturalHeight > 0) setRatio({ url: brand.logoUrl!, value: img.naturalWidth / img.naturalHeight });
      }}
      className={`block w-auto object-contain ${LOGO_HEIGHTS[size]} ${measured === null ? "opacity-0" : ""}`}
    />
  );

  return (
    <span className="flex min-w-0 items-center gap-3">
      {surface === "dark" ? (
        <span className="flex shrink-0 items-center rounded-xl bg-white px-2.5 py-1.5 shadow-sm">{image}</span>
      ) : (
        <span className="flex shrink-0 items-center">{image}</span>
      )}
      {measured !== null && !wide && name}
    </span>
  );
}
