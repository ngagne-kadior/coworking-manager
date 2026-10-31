
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/AppShell";
import PhotoButton from "@/components/PhotoButton";
import { SPACE_BUCKET, removePhoto, replacePhoto, spacePhotoUrl } from "@/lib/photos";
import RatesDialog, { ratesSummary } from "@/components/RatesDialog";
import type { SpaceRate } from "@/lib/payments";

const SPACE_FIELDS = "id, name, description, capacity, is_active, photo_path";

type Space = {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  is_active: boolean;
  photo_path: string | null;
};

export default function SpacesPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [photoBusyId, setPhotoBusyId] = useState<string | null>(null);
  const [rates, setRates] = useState<SpaceRate[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ratesFor, setRatesFor] = useState<Space | null>(null);

  // Tarifs et rôle (seul l'admin modifie les tarifs ; la base le vérifie aussi)
  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from("space_rates").select("space_id, unit, price"),
      supabase.rpc("current_app_role"),
    ]).then(([rateRes, roleRes]) => {
      if (!active) return;
      setRates((rateRes.data ?? []) as SpaceRate[]);
      setIsAdmin(roleRes.data === "admin");
    });
    return () => {
      active = false;
    };
  }, []);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState("1");

  const loadSpaces = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data, error } = await supabase
        .from("spaces")
        .select(SPACE_FIELDS)
        .order("name");

      if (error) {
        setError(`Impossible de charger les espaces : ${error.message}`);
        return;
      }

      setSpaces(data ?? []);
    } catch {
      setError("Erreur inattendue pendant le chargement des espaces.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Chargement initial des données depuis Supabase. L'état « loading »
    // vaut déjà true au premier rendu : le setLoading(true) synchrone de
    // loadSpaces ne provoque aucun rendu supplémentaire.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSpaces();
  }, [loadSpaces]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setDescription("");
    setCapacity("1");
  }

  function startEditing(space: Space) {
    setEditingId(space.id);
    setName(space.name);
    setDescription(space.description ?? "");
    setCapacity(String(space.capacity));
    setError("");
    setSuccess("");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const cleanName = name.trim();
    const cleanDescription = description.trim();
    const parsedCapacity = Number(capacity);

    if (!cleanName) {
      setError("Le nom de l'espace est obligatoire.");
      return;
    }

    if (!Number.isInteger(parsedCapacity) || parsedCapacity < 1) {
      setError("La capacité doit être un entier supérieur à zéro.");
      return;
    }

    setSaving(true);

    try {
      if (editingId) {
        const { data, error } = await supabase
          .from("spaces")
          .update({
            name: cleanName,
            description: cleanDescription || null,
            capacity: parsedCapacity,
          })
          .eq("id", editingId)
          .select(SPACE_FIELDS)
          .maybeSingle();

        if (error) {
          setError(`Échec de la modification : ${error.message}`);
          return;
        }

        if (!data) {
          setError(
            "Aucune ligne modifiée. Vérifie tes droits Supabase et les règles RLS."
          );
          return;
        }

        setSpaces((current) =>
          current.map((space) => (space.id === data.id ? data : space))
        );
        setSuccess("Modifications enregistrées.");
      } else {
        const { data, error } = await supabase
          .from("spaces")
          .insert({
            name: cleanName,
            description: cleanDescription || null,
            capacity: parsedCapacity,
            is_active: true,
          })
          .select(SPACE_FIELDS)
          .single();

        if (error) {
          setError(`Échec de l'ajout : ${error.message}`);
          return;
        }

        setSpaces((current) =>
          [...current, data].sort((a, b) => a.name.localeCompare(b.name))
        );
        setSuccess("Espace ajouté. Ajoute maintenant sa photo depuis sa carte, plus bas.");
      }

      resetForm();
    } catch {
      setError("Erreur inattendue. Vérifie ta connexion et réessaie.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(space: Space) {
    const nextStatus = !space.is_active;
    const confirmation = window.confirm(
      nextStatus
        ? `Activer l'espace « ${space.name} » ?`
        : `Désactiver l'espace « ${space.name} » ?`
    );

    if (!confirmation) return;

    setError("");
    setSuccess("");

    try {
      const { data, error } = await supabase
        .from("spaces")
        .update({ is_active: nextStatus })
        .eq("id", space.id)
        .select(SPACE_FIELDS)
        .maybeSingle();

      if (error) {
        setError(`Échec du changement de statut : ${error.message}`);
        return;
      }

      if (!data) {
        setError(
          "Le statut n'a pas été modifié. Vérifie les droits de mise à jour Supabase."
        );
        return;
      }

      setSpaces((current) =>
        current.map((item) => (item.id === data.id ? data : item))
      );

      setSuccess(
        `L'espace « ${data.name} » est maintenant ${
          data.is_active ? "actif" : "inactif"
        }.`
      );
    } catch {
      setError("Erreur inattendue pendant le changement de statut.");
    }
  }

  async function changePhoto(space: Space, file: File) {
    setError("");
    setSuccess("");
    setPhotoBusyId(space.id);
    try {
      const path = await replacePhoto({
        bucket: SPACE_BUCKET,
        table: "spaces",
        id: space.id,
        file,
        maxSide: 1600,
        previousPath: space.photo_path,
      });
      setSpaces((current) =>
        current.map((item) => (item.id === space.id ? { ...item, photo_path: path } : item))
      );
      setSuccess(`Photo de « ${space.name} » enregistrée.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi de la photo impossible.");
    } finally {
      setPhotoBusyId(null);
    }
  }

  async function deletePhoto(space: Space) {
    if (!space.photo_path) return;
    if (!window.confirm(`Retirer la photo de « ${space.name} » ?`)) return;
    setError("");
    setSuccess("");
    setPhotoBusyId(space.id);
    try {
      await removePhoto({
        bucket: SPACE_BUCKET,
        table: "spaces",
        id: space.id,
        path: space.photo_path,
      });
      setSpaces((current) =>
        current.map((item) => (item.id === space.id ? { ...item, photo_path: null } : item))
      );
      setSuccess(`Photo de « ${space.name} » retirée.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible.");
    } finally {
      setPhotoBusyId(null);
    }
  }

  const filteredSpaces = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();

    if (!query) return spaces;

    return spaces.filter((space) =>
      `${space.name} ${space.description ?? ""}`
        .toLocaleLowerCase()
        .includes(query)
    );
  }, [spaces, search]);

  return (
    <div className="text-slate-900">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Espaces"
          description="Gère les espaces de coworking et leurs photos."
        />
        {error && (
          <p
            role="alert"
            className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {success && (
          <p
            role="status"
            className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700"
          >
            {success}
          </p>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            {editingId ? "Modifier l'espace" : "Ajouter un espace"}
          </h2>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="spaceName"
                className="mb-1 block text-sm font-medium"
              >
                Nom de l&apos;espace *
              </label>
              <input
                id="spaceName"
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex. Salle de réunion A"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label
                htmlFor="spaceDescription"
                className="mb-1 block text-sm font-medium"
              >
                Description
              </label>
              <textarea
                id="spaceDescription"
                maxLength={1000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Description de l'espace"
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label
                htmlFor="spaceCapacity"
                className="mb-1 block text-sm font-medium"
              >
                Capacité maximale *
              </label>
              <input
                id="spaceCapacity"
                type="number"
                min="1"
                step="1"
                required
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? "Enregistrement..."
                  : editingId
                    ? "Enregistrer les modifications"
                    : "Ajouter l'espace"}
              </button>

              {editingId && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    resetForm();
                    setError("");
                    setSuccess("");
                  }}
                  className="rounded-lg border border-slate-300 px-5 py-3 font-semibold hover:bg-slate-50"
                >
                  Annuler
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="mt-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-xl font-semibold">Liste des espaces</h2>
              <p className="mt-1 text-sm text-slate-600">
                {filteredSpaces.length} résultat(s) sur {spaces.length} espace(s)
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadSpaces()}
              disabled={loading}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
            >
              {loading ? "Chargement..." : "Actualiser"}
            </button>
          </div>

          <div className="mt-4">
            <label htmlFor="spaceSearch" className="sr-only">
              Rechercher un espace
            </label>
            <input
              id="spaceSearch"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher par nom ou description..."
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {loading && (
            <p className="mt-5 text-slate-600">Chargement des espaces...</p>
          )}

          {!loading && filteredSpaces.length === 0 && (
            <p className="mt-5 rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
              {spaces.length === 0
                ? "Aucun espace enregistré pour le moment."
                : "Aucun espace ne correspond à ta recherche."}
            </p>
          )}

          {!loading && filteredSpaces.length > 0 && (
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {filteredSpaces.map((space) => {
                const photoUrl = spacePhotoUrl(space.photo_path);
                const busy = photoBusyId === space.id;

                return (
                  <article
                    key={space.id}
                    className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${
                      space.is_active ? "border-slate-200" : "border-slate-200 opacity-75"
                    }`}
                  >
                    <div className="relative h-44 bg-gradient-to-br from-blue-50 to-slate-100">
                      {photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- image Supabase Storage
                        <img
                          src={photoUrl}
                          alt={`Photo de ${space.name}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-1 text-slate-400">
                          <span className="text-3xl" aria-hidden="true">▧</span>
                          <span className="text-xs font-medium">Pas encore de photo</span>
                        </div>
                      )}

                      <span
                        className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${
                          space.is_active
                            ? "bg-white/95 text-green-700"
                            : "bg-slate-800/80 text-white"
                        }`}
                      >
                        {space.is_active ? "Actif" : "Inactif"}
                      </span>

                      <PhotoButton
                        label={space.photo_path ? "Changer la photo" : "Ajouter une photo"}
                        disabled={busy}
                        onFile={(file) => void changePhoto(space, file)}
                        className="absolute bottom-3 right-3 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-white disabled:opacity-60"
                      >
                        {busy
                          ? "Envoi..."
                          : space.photo_path
                            ? "Changer la photo"
                            : "＋ Ajouter une photo"}
                      </PhotoButton>
                    </div>

                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold text-slate-900">{space.name}</h3>
                        <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                          {space.capacity} pers.
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 min-h-10 text-sm text-slate-500">
                        {space.description || "Aucune description."}
                      </p>
                      <p className="mt-3 text-xs font-medium text-slate-700">
                        {ratesSummary(rates.filter((r) => r.space_id === space.id)) || (
                          <span className="font-normal text-slate-400">Aucun tarif défini</span>
                        )}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                        <button
                          type="button"
                          onClick={() => startEditing(space)}
                          className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                        >
                          Modifier
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setRatesFor(space)}
                            className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                          >
                            Tarifs
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void toggleActive(space)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                            space.is_active
                              ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                              : "border-green-200 text-green-700 hover:bg-green-50"
                          }`}
                        >
                          {space.is_active ? "Désactiver" : "Activer"}
                        </button>
                        {space.photo_path && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void deletePhoto(space)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Retirer la photo
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
      {ratesFor && (
        <RatesDialog
          spaceId={ratesFor.id}
          spaceName={ratesFor.name}
          rates={rates.filter((r) => r.space_id === ratesFor.id)}
          onClose={() => setRatesFor(null)}
          onSaved={(saved) => {
            setRates((current) => [
              ...current.filter((r) => r.space_id !== ratesFor.id),
              ...saved,
            ]);
            setSuccess(`Tarifs de « ${ratesFor.name} » enregistrés.`);
            setRatesFor(null);
          }}
        />
      )}
    </div>
  );
}
