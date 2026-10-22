
"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Space = {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  is_active: boolean;
};

export default function SpacesPage() {
  const router = useRouter();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState("1");

  const loadSpaces = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data, error } = await supabase
        .from("spaces")
        .select("id, name, description, capacity, is_active")
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
          .select("id, name, description, capacity, is_active")
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
        setSuccess("Les modifications ont été enregistrées dans Supabase.");
      } else {
        const { data, error } = await supabase
          .from("spaces")
          .insert({
            name: cleanName,
            description: cleanDescription || null,
            capacity: parsedCapacity,
            is_active: true,
          })
          .select("id, name, description, capacity, is_active")
          .single();

        if (error) {
          setError(`Échec de l'ajout : ${error.message}`);
          return;
        }

        setSpaces((current) =>
          [...current, data].sort((a, b) => a.name.localeCompare(b.name))
        );
        setSuccess("L'espace a été ajouté dans Supabase.");
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
        .select("id, name, description, capacity, is_active")
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
    <main className="min-h-screen bg-slate-50 p-5 text-slate-900 md:p-10">
      <div className="mx-auto max-w-6xl">
        <header>
  <button
    type="button"
    onClick={() => router.push("/")}
    className="mb-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
  >
    <span className="text-lg">←</span>
    Tableau de bord
  </button>

  <h1 className="text-3xl font-bold">Espaces</h1>

  <p className="mt-2 text-slate-600">
    Gère les espaces de coworking.
  </p>
    </header>
        {error && (
          <p
            role="alert"
            className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {success && (
          <p
            role="status"
            className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700"
          >
            {success}
          </p>
        )}

        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            {editingId ? "Modifier l'espace" : "Ajouter un espace"}
          </h2>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="spaceName"
                className="mb-1 block text-sm font-medium"
              >
                Nom de l'espace *
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
            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="p-4">Nom</th>
                    <th className="p-4">Description</th>
                    <th className="p-4">Capacité</th>
                    <th className="p-4">Statut</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSpaces.map((space) => (
                    <tr key={space.id} className="border-t border-slate-100">
                      <td className="p-4 font-medium">{space.name}</td>
                      <td className="max-w-xs p-4 text-slate-600">
                        {space.description || "—"}
                      </td>
                      <td className="p-4">{space.capacity} personne(s)</td>
                      <td className="p-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            space.is_active
                              ? "bg-green-100 text-green-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {space.is_active ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startEditing(space)}
                            className="rounded-md border border-blue-200 px-3 py-2 font-medium text-blue-700 hover:bg-blue-50"
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleActive(space)}
                            className={`rounded-md border px-3 py-2 font-medium ${
                              space.is_active
                                ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                                : "border-green-200 text-green-700 hover:bg-green-50"
                            }`}
                          >
                            {space.is_active ? "Désactiver" : "Activer"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
