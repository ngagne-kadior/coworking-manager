export type PublicSettings = {
  coworking_name: string;
  tagline: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  requests_enabled: boolean;
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
