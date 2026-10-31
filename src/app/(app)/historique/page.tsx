"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/AppShell";
import { METHOD_LABELS, RATE_UNITS, type PaymentMethod } from "@/lib/payments";

type AuditEntry = {
  id: number;
  occurred_at: string;
  actor_name: string;
  table_name: string;
  record_label: string | null;
  action: string;
  changed_fields: string[];
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

type Filters = {
  table: string;
  action: string;
  from: string;
  to: string;
  search: string;
};

type PageResult = {
  entries: AuditEntry[];
  hasMore: boolean;
  error: string;
};

const PAGE_SIZE = 50;
const TIME_ZONE = "Africa/Dakar";

const EMPTY_FILTERS: Filters = {
  table: "all",
  action: "all",
  from: "",
  to: "",
  search: "",
};

const TABLE_LABELS: Record<string, string> = {
  members: "Membre",
  spaces: "Espace",
  reservations: "Réservation",
  profiles: "Compte utilisateur",
  payments: "Paiement",
  space_rates: "Tarif",
};

const ACTION_LABELS: Record<string, string> = {
  create: "Création",
  update: "Modification",
  activate: "Activation",
  deactivate: "Désactivation",
  status: "Changement de statut",
  delete: "Suppression",
  password_reset: "Mot de passe réinitialisé",
};

const ACTION_STYLES: Record<string, string> = {
  create: "bg-emerald-50 text-emerald-700",
  update: "bg-blue-50 text-blue-700",
  activate: "bg-teal-50 text-teal-700",
  deactivate: "bg-amber-50 text-amber-700",
  status: "bg-violet-50 text-violet-700",
  delete: "bg-red-50 text-red-700",
  password_reset: "bg-orange-50 text-orange-700",
};

const FIELD_LABELS: Record<string, string> = {
  full_name: "Nom",
  name: "Nom",
  email: "E-mail",
  phone: "Téléphone",
  company: "Entreprise",
  description: "Description",
  capacity: "Capacité",
  is_active: "Actif",
  status: "Statut",
  start_at: "Début",
  end_at: "Fin",
  notes: "Notes",
  role: "Rôle",
  member_id: "Membre",
  space_id: "Espace",
  photo_path: "Photo",
  price_amount: "Montant dû",
  amount: "Montant",
  method: "Moyen de paiement",
  paid_at: "Date de paiement",
  price: "Prix",
  unit: "Durée",
  reservation_id: "Réservation",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  cancelled: "Annulée",
  completed: "Terminée",
  expired: "Expirée",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  manager: "Gestionnaire",
};

// Champs techniques qui n'intéressent pas l'utilisateur.
const HIDDEN_FIELDS = new Set(["id", "created_at", "created_by", "expires_at"]);

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(new Date(value));
}

function formatValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (field === "status") return STATUS_LABELS[String(value)] ?? String(value);
  if (field === "role") return ROLE_LABELS[String(value)] ?? String(value);
  if (field === "start_at" || field === "end_at") {
    return formatDateTime(String(value));
  }
  if (field === "photo_path") return "Photo";
  if (field === "amount" || field === "price" || field === "price_amount") {
    return `${new Intl.NumberFormat("fr-FR").format(Number(value))} F CFA`;
  }
  if (field === "method") return METHOD_LABELS[value as PaymentMethod] ?? String(value);
  if (field === "unit") {
    return RATE_UNITS.find((u) => u.unit === value)?.label ?? String(value);
  }
  if (field === "paid_at") return formatDateTime(String(value));
  if (field === "reservation_id") return `#${String(value).slice(0, 8)}`;
  if (field === "member_id" || field === "space_id") {
    return `#${String(value).slice(0, 8)}`;
  }
  return String(value);
}

function actionLabel(entry: AuditEntry) {
  if (entry.action === "status" && entry.new_data?.status) {
    const status = String(entry.new_data.status);
    return `Statut : ${STATUS_LABELS[status] ?? status}`;
  }
  return ACTION_LABELS[entry.action] ?? entry.action;
}

// Retire les caractères qui ont un sens spécial dans les filtres Supabase.
function cleanSearch(value: string) {
  return value.replace(/[,()%*\\]/g, " ").trim();
}

async function fetchPage(filters: Filters, offset: number): Promise<PageResult> {
  let query = supabase
    .from("audit_log")
    .select(
      "id, occurred_at, actor_name, table_name, record_label, action, changed_fields, old_data, new_data"
    )
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + PAGE_SIZE); // un élément de plus pour savoir s'il reste une page

  if (filters.table !== "all") query = query.eq("table_name", filters.table);
  if (filters.action !== "all") query = query.eq("action", filters.action);

  if (filters.from) {
    query = query.gte("occurred_at", new Date(`${filters.from}T00:00:00`).toISOString());
  }
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    query = query.lt("occurred_at", end.toISOString());
  }

  const search = cleanSearch(filters.search);
  if (search) {
    query = query.or(`record_label.ilike.%${search}%,actor_name.ilike.%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    return {
      entries: [],
      hasMore: false,
      error: `Impossible de charger l'historique : ${error.message}`,
    };
  }

  const rows = (data ?? []) as AuditEntry[];
  return {
    entries: rows.slice(0, PAGE_SIZE),
    hasMore: rows.length > PAGE_SIZE,
    error: "",
  };
}

function EntryDetails({ entry }: { entry: AuditEntry }) {
  if (entry.action === "create" || entry.action === "delete") {
    const data = entry.action === "create" ? entry.new_data : entry.old_data;
    const fields = Object.keys(data ?? {}).filter((f) => !HIDDEN_FIELDS.has(f));

    return (
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field} className="flex gap-2">
            <dt className="min-w-24 text-slate-500">{FIELD_LABELS[field] ?? field}</dt>
            <dd className="font-medium text-slate-800">
              {formatValue(field, data?.[field])}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  const fields = entry.changed_fields.filter((f) => !HIDDEN_FIELDS.has(f));

  if (fields.length === 0) {
    return <p className="text-slate-500">Aucun champ visible modifié.</p>;
  }

  return (
    <ul className="space-y-2">
      {fields.map((field) => (
        <li key={field} className="flex flex-wrap items-center gap-2">
          <span className="min-w-24 text-slate-500">{FIELD_LABELS[field] ?? field}</span>
          <span className="rounded bg-red-50 px-2 py-0.5 text-red-700 line-through">
            {formatValue(field, entry.old_data?.[field])}
          </span>
          <span aria-hidden="true" className="text-slate-400">→</span>
          <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">
            {formatValue(field, entry.new_data?.[field])}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function HistoriquePage() {

  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // Chaque nouvelle recherche incrémente requestId ; le chargement est
  // terminé quand loadedId le rattrape.
  const [requestId, setRequestId] = useState(1);
  const [loadedId, setLoadedId] = useState(0);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const loading = loadedId !== requestId;

  useEffect(() => {
    let active = true;

    fetchPage(filters, 0).then((result) => {
      if (!active) return;
      setEntries(result.entries);
      setHasMore(result.hasMore);
      setError(result.error);
      setOpenId(null);
      setLoadedId(requestId);
    });

    return () => {
      active = false;
    };
  }, [filters, requestId]);

  function applyFilters(next: Filters) {
    setFilters(next);
    setRequestId((id) => id + 1);
  }

  function updateDraft(field: keyof Filters, value: string, applyNow = false) {
    const next = { ...draft, [field]: value };
    setDraft(next);
    if (applyNow) applyFilters(next);
  }

  async function loadMore() {
    setLoadingMore(true);
    const result = await fetchPage(filters, entries.length);
    setEntries((current) => [...current, ...result.entries]);
    setHasMore(result.hasMore);
    setError(result.error);
    setLoadingMore(false);
  }

  const filtersActive =
    JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <div className="text-slate-900">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Historique des actions"
          description="Toutes les créations et modifications, enregistrées automatiquement. Cet historique ne peut pas être modifié."
        />

        <form
          onSubmit={(event) => {
            event.preventDefault();
            applyFilters(draft);
          }}
          className="mt-8 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2 lg:grid-cols-6"
        >
          <label className="flex flex-col gap-1 text-sm lg:col-span-2">
            <span className="font-medium text-slate-700">Rechercher</span>
            <div className="flex gap-2">
              <input
                type="search"
                value={draft.search}
                onChange={(event) => updateDraft("search", event.target.value)}
                placeholder="Membre, espace ou utilisateur"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                className="rounded-lg bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800"
              >
                OK
              </button>
            </div>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Élément</span>
            <select
              value={draft.table}
              onChange={(event) => updateDraft("table", event.target.value, true)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="all">Tous</option>
              {Object.entries(TABLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Action</span>
            <select
              value={draft.action}
              onChange={(event) => updateDraft("action", event.target.value, true)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="all">Toutes</option>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Du</span>
            <input
              type="date"
              value={draft.from}
              onChange={(event) => updateDraft("from", event.target.value, true)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Au</span>
            <input
              type="date"
              value={draft.to}
              onChange={(event) => updateDraft("to", event.target.value, true)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          {filtersActive && (
            <div className="lg:col-span-6">
              <button
                type="button"
                onClick={() => {
                  setDraft(EMPTY_FILTERS);
                  applyFilters(EMPTY_FILTERS);
                }}
                className="text-sm font-medium text-blue-700 hover:underline"
              >
                Effacer les filtres
              </button>
            </div>
          )}
        </form>

        {error && (
          <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        )}

        <section className="mt-6" aria-live="polite">
          {loading && <p className="text-slate-600">Chargement de l&apos;historique...</p>}

          {!loading && !error && entries.length === 0 && (
            <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
              Aucune action enregistrée pour ces filtres.
            </p>
          )}

          {!loading && entries.length > 0 && (
            <ol className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {entries.map((entry) => {
                const open = openId === entry.id;

                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : entry.id)}
                      aria-expanded={open}
                      className="flex w-full flex-col gap-2 p-4 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <span className="w-32 shrink-0 text-xs text-slate-500">
                        {formatDateTime(entry.occurred_at)}
                      </span>
                      <span
                        className={`w-fit shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                          ACTION_STYLES[entry.action] ?? "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {actionLabel(entry)}
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="text-slate-500">
                          {TABLE_LABELS[entry.table_name] ?? entry.table_name} ·{" "}
                        </span>
                        <span className="font-medium">{entry.record_label ?? "—"}</span>
                      </span>
                      <span className="shrink-0 text-sm text-slate-600">
                        par <span className="font-medium">{entry.actor_name}</span>
                      </span>
                      <span aria-hidden="true" className="hidden text-slate-400 sm:block">
                        {open ? "▴" : "▾"}
                      </span>
                    </button>

                    {open && (
                      <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 text-sm">
                        <EntryDetails entry={entry} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {!loading && hasMore && (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
              >
                {loadingMore ? "Chargement..." : "Afficher plus"}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
