import { supabase } from "@/lib/supabase";

export const SPACE_BUCKET = "space-photos";
export const MEMBER_BUCKET = "member-photos";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SOURCE_BYTES = 15 * 1024 * 1024; // photo de téléphone avant compression

/**
 * Redimensionne et compresse une image dans le navigateur avant l'envoi :
 * plus rapide sur une connexion mobile et reste sous la limite du stockage.
 */
export async function prepareImage(file: File, maxSide: number): Promise<Blob> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error("Format non accepté. Utilise une photo JPEG, PNG ou WebP.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Photo trop lourde (15 Mo maximum).");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Traitement de l'image impossible.");

  context.fillStyle = "#ffffff"; // fond blanc pour les PNG transparents
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.82)
  );
  if (!blob) throw new Error("Traitement de l'image impossible.");
  return blob;
}

/**
 * Envoie la photo, met à jour la ligne (photo_path) puis supprime
 * l'ancienne photo. Renvoie le nouveau chemin.
 */
export async function replacePhoto(options: {
  bucket: typeof SPACE_BUCKET | typeof MEMBER_BUCKET;
  table: "spaces" | "members";
  id: string;
  file: File;
  maxSide: number;
  previousPath: string | null;
}): Promise<string> {
  const { bucket, table, id, file, maxSide, previousPath } = options;
  const blob = await prepareImage(file, maxSide);

  // Nom unique à chaque envoi : évite qu'une ancienne image reste en cache.
  const path = `${id}/${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (uploadError) {
    throw new Error(`Envoi impossible : ${uploadError.message}`);
  }

  const { error: updateError } = await supabase
    .from(table)
    .update({ photo_path: path })
    .eq("id", id);
  if (updateError) {
    await supabase.storage.from(bucket).remove([path]);
    throw new Error(`Enregistrement impossible : ${updateError.message}`);
  }

  if (previousPath) {
    await supabase.storage.from(bucket).remove([previousPath]);
  }
  return path;
}

/** Retire la photo d'un espace ou d'un membre. */
export async function removePhoto(options: {
  bucket: typeof SPACE_BUCKET | typeof MEMBER_BUCKET;
  table: "spaces" | "members";
  id: string;
  path: string;
}) {
  const { bucket, table, id, path } = options;
  const { error } = await supabase
    .from(table)
    .update({ photo_path: null })
    .eq("id", id);
  if (error) throw new Error(`Suppression impossible : ${error.message}`);
  await supabase.storage.from(bucket).remove([path]);
}

/** URL publique d'une photo d'espace. */
export function spacePhotoUrl(path: string | null) {
  if (!path) return null;
  return supabase.storage.from(SPACE_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Liens temporaires (1 h) des photos de membres, mis en cache.
const signedCache = new Map<string, { url: string; expires: number }>();

export async function memberPhotoUrl(path: string): Promise<string | null> {
  const cached = signedCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;

  const { data, error } = await supabase.storage
    .from(MEMBER_BUCKET)
    .createSignedUrl(path, 3600);
  if (error || !data) return null;

  signedCache.set(path, { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

// ---------- Galerie des espaces (5 photos maximum) ----------

export const MAX_SPACE_PHOTOS = 5;

export type SpacePhoto = { id: string; space_id: string; path: string; position: number };

/**
 * Ajoute une photo à la galerie d'un espace. Si l'espace n'a pas encore de
 * couverture, cette photo le devient. La base refuse au-delà de 5 photos.
 */
export async function addSpacePhoto(options: {
  spaceId: string;
  file: File;
  position: number;
  setAsCover: boolean;
}): Promise<SpacePhoto> {
  const { spaceId, file, position, setAsCover } = options;
  const blob = await prepareImage(file, 1600);
  const path = `${spaceId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(SPACE_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw new Error(`Envoi impossible : ${uploadError.message}`);

  const { data, error: insertError } = await supabase
    .from("space_photos")
    .insert({ space_id: spaceId, path, position })
    .select("id, space_id, path, position")
    .single();
  if (insertError || !data) {
    await supabase.storage.from(SPACE_BUCKET).remove([path]);
    throw new Error(insertError?.message ?? "Enregistrement de la photo impossible.");
  }

  if (setAsCover) {
    await supabase.from("spaces").update({ photo_path: path }).eq("id", spaceId);
  }
  return data as SpacePhoto;
}

/** Supprime une photo de la galerie ; si c'était la couverture, la suivante la remplace. */
export async function deleteSpacePhoto(photo: SpacePhoto, remaining: SpacePhoto[], currentCover: string | null) {
  const { error } = await supabase.from("space_photos").delete().eq("id", photo.id);
  if (error) throw new Error(`Suppression impossible : ${error.message}`);
  await supabase.storage.from(SPACE_BUCKET).remove([photo.path]);

  let cover = currentCover;
  if (currentCover === photo.path) {
    cover = remaining[0]?.path ?? null;
    await supabase.from("spaces").update({ photo_path: cover }).eq("id", photo.space_id);
  }
  return cover;
}

/** Choisit la photo de couverture d'un espace. */
export async function setSpaceCover(spaceId: string, path: string) {
  const { error } = await supabase.from("spaces").update({ photo_path: path }).eq("id", spaceId);
  if (error) throw new Error(`Modification impossible : ${error.message}`);
}
