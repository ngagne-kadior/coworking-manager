"use client";

import { useBrand } from "@/lib/brand";

const SIZES = {
  sm: "h-8 w-8 rounded-lg text-sm",
  md: "h-9 w-9 rounded-xl text-base",
  lg: "h-10 w-10 rounded-xl text-lg",
  xl: "h-16 w-16 rounded-2xl text-2xl",
} as const;

/** Logo du coworking (envoyé dans Paramètres), ou la première lettre du nom s'il n'y en a pas. */
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
