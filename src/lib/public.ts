export type PublicSettings = {
  coworking_name: string;
  tagline: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  requests_enabled: boolean;
  socials?: Partial<Record<SocialKey, string>>;
};

export type PublicSpace = {
  id: string;
  name: string;
  space_type: string | null;
  description: string | null;
  capacity: number;
  booking_mode: "whole" | "seats";
  area_m2: number | null;
  location: string | null;
  amenities: string[];
  cover: string | null;
  photos: string[];
};

export type PublicCatalog = { settings: PublicSettings; spaces: PublicSpace[] };

export const PUBLIC_PATH = "/espaces-disponibles";

export const AMENITY_LABELS: Record<string, string> = {
  wifi: "Wi-Fi",
  clim: "Climatisation",
  ecran: "Écran / TV",
  projecteur: "Vidéoprojecteur",
  tableau: "Tableau blanc",
  imprimante: "Imprimante",
  cafe: "Café / thé",
  casiers: "Casiers",
  parking: "Parking",
  pmr: "Accès PMR",
};

/** Numéro au format international pour WhatsApp (9 chiffres sénégalais → +221). */
export function internationalNumber(phone: string) {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 9) return `221${digits}`;
  return digits.replace(/^00/, "");
}

export function whatsappLink(phone: string, message: string) {
  return `https://wa.me/${internationalNumber(phone)}?text=${encodeURIComponent(message)}`;
}

// ---------- Réseaux sociaux ----------

export type SocialKey = "facebook" | "instagram" | "tiktok" | "linkedin" | "youtube" | "x";

export const SOCIALS: {
  key: SocialKey;
  label: string;
  column: string;
  base: string;
  placeholder: string;
  style: string;
}[] = [
  { key: "facebook", label: "Facebook", column: "facebook_url", base: "https://www.facebook.com/", placeholder: "lien ou nom de page", style: "bg-[#1877f2] text-white" },
  { key: "instagram", label: "Instagram", column: "instagram_url", base: "https://www.instagram.com/", placeholder: "@moncoworking", style: "bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white" },
  { key: "tiktok", label: "TikTok", column: "tiktok_url", base: "https://www.tiktok.com/@", placeholder: "@moncoworking", style: "bg-black text-white" },
  { key: "linkedin", label: "LinkedIn", column: "linkedin_url", base: "https://www.linkedin.com/company/", placeholder: "lien de la page", style: "bg-[#0a66c2] text-white" },
  { key: "youtube", label: "YouTube", column: "youtube_url", base: "https://www.youtube.com/@", placeholder: "@moncoworking", style: "bg-[#ff0000] text-white" },
  { key: "x", label: "X (Twitter)", column: "x_url", base: "https://x.com/", placeholder: "@moncoworking", style: "bg-slate-900 text-white" },
];

/**
 * Transforme ce que l'admin a tapé en lien complet :
 * "@kadior" ou "kadior" → https://www.instagram.com/kadior ; un lien est gardé (http → https).
 * Retourne null si vide, "invalid" si inutilisable.
 */
export function normalizeSocial(base: string, raw: string): string | null | "invalid" {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    const url = value.replace(/^http:\/\//i, "https://");
    return /^https:\/\/[^\s]+\.[^\s]+$/.test(url) && url.length <= 300 ? url : "invalid";
  }
  if (/^(www\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(value)) {
    return normalizeSocial(base, `https://${value}`);
  }
  const handle = value.replace(/^@/, "");
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(handle)) return "invalid";
  return `${base}${handle}`;
}
