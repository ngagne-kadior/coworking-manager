"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export const BRAND_BUCKET = "brand";
const BRAND_EVENT = "brand-changed";

export type Brand = { name: string | null; logoUrl: string | null };

let cache: Promise<Brand> | null = null;

function logoUrl(path: string | null) {
  return path ? supabase.storage.from(BRAND_BUCKET).getPublicUrl(path).data.publicUrl : null;
}

function fetchBrand(): Promise<Brand> {
  if (!cache) {
    cache = Promise.resolve(supabase.rpc("get_public_brand")).then(({ data, error }) => {
      if (error || !data) {
        cache = null; // nouvel essai au prochain affichage (ex. SQL pas encore exécuté)
        return { name: null, logoUrl: null };
      }
      const d = data as { name: string | null; logo: string | null };
      return { name: d.name, logoUrl: logoUrl(d.logo) };
    });
  }
  return cache;
}

/** À appeler après un changement de logo : tous les logos affichés se mettent à jour. */
export function refreshBrand() {
  cache = null;
  window.dispatchEvent(new Event(BRAND_EVENT));
}

export function useBrand(): Brand {
  const [brand, setBrand] = useState<Brand>({ name: null, logoUrl: null });
  useEffect(() => {
    let active = true;
    const load = () => void fetchBrand().then((b) => active && setBrand(b));
    load();
    window.addEventListener(BRAND_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(BRAND_EVENT, load);
    };
  }, []);
  return brand;
}

/** Redimensionne le logo (côté le plus long : 512 px) en PNG, en gardant la transparence. */
export async function prepareLogo(file: File): Promise<Blob> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Format non accepté. Utilise un logo PNG, JPEG ou WebP.");
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("Image trop lourde (10 Mo maximum).");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Traitement de l'image impossible.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Traitement de l'image impossible.");
  if (blob.size > 1024 * 1024) throw new Error("Logo trop lourd après traitement (1 Mo maximum).");
  return blob;
}
