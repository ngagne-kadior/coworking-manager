"use client";

import { useEffect, useState } from "react";
import { memberPhotoUrl } from "@/lib/photos";

const COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

const SIZES = {
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-20 w-20 text-xl",
};

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function colorFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

type AvatarProps = {
  name: string;
  photoPath?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
};

/** Photo de profil d'un membre (lien privé temporaire) ou ses initiales. */
export default function Avatar({ name, photoPath, size = "md", className = "" }: AvatarProps) {
  const [loaded, setLoaded] = useState<{ path: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!photoPath) return;
    let active = true;
    memberPhotoUrl(photoPath).then((url) => {
      if (active) setLoaded({ path: photoPath, url });
    });
    return () => {
      active = false;
    };
  }, [photoPath]);

  const url = photoPath && loaded?.path === photoPath ? loaded.url : null;
  const base = `${SIZES[size]} shrink-0 rounded-full ${className}`;

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- lien signé Supabase, non optimisable
      <img src={url} alt={`Photo de ${name}`} className={`${base} object-cover`} />
    );
  }

  return (
    <span
      aria-label={name}
      className={`${base} inline-flex items-center justify-center font-bold ${colorFor(name)}`}
    >
      {initials(name)}
    </span>
  );
}
