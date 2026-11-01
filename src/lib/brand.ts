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

/** Zone utile du logo : sans les marges transparentes ou blanches autour. */
function contentBox(data: Uint8ClampedArray, width: number, height: number) {
  let top = height, left = width, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const blank = data[i + 3] < 16 || (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245);
      if (!blank) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return { x: 0, y: 0, w: width, h: height }; // image vide : on garde tout
  const pad = Math.round(Math.max(right - left, bottom - top) * 0.04);
  const x = Math.max(0, left - pad);
  const y = Math.max(0, top - pad);
  return { x, y, w: Math.min(width, right + pad + 1) - x, h: Math.min(height, bottom + pad + 1) - y };
}

/**
 * Prépare le logo : retire les marges vides autour (pour qu'il paraisse à la bonne taille),
 * puis le redimensionne (côté le plus long : 800 px) en PNG, en gardant la transparence.
 */
export async function prepareLogo(file: File): Promise<Blob> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Format non accepté. Utilise un logo PNG, JPEG ou WebP.");
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("Image trop lourde (10 Mo maximum).");
  const bitmap = await createImageBitmap(file);

  // 1. Analyse sur une copie réduite (rapide), puis découpe sur l'original.
  const probeScale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
  const probe = document.createElement("canvas");
  probe.width = Math.max(1, Math.round(bitmap.width * probeScale));
  probe.height = Math.max(1, Math.round(bitmap.height * probeScale));
  const probeCtx = probe.getContext("2d", { willReadFrequently: true });
  if (!probeCtx) throw new Error("Traitement de l'image impossible.");
  probeCtx.drawImage(bitmap, 0, 0, probe.width, probe.height);
  const box = contentBox(probeCtx.getImageData(0, 0, probe.width, probe.height).data, probe.width, probe.height);
  const sx = box.x / probeScale, sy = box.y / probeScale, sw = box.w / probeScale, sh = box.h / probeScale;

  // 2. Redimensionnement final.
  const scale = Math.min(1, 800 / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Traitement de l'image impossible.");
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Traitement de l'image impossible.");
  if (blob.size > 1024 * 1024) throw new Error("Logo trop lourd après traitement (1 Mo maximum).");
  return blob;
}
