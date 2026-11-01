"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/AppShell";
import { whatsappLink } from "@/lib/public";

type RequestStatus = "new" | "contacted" | "converted" | "declined";

type BookingRequest = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  desired_date: string;
  start_time: string;
  end_time: string;
  people: number;
  message: string | null;
  status: RequestStatus;
  created_at: string;
  spaces: { name: string } | null;
};

const STATUS: Record<RequestStatus, { label: string; style: string }> = {
  new: { label: "Nouvelle", style: "bg-blue-100 text-blue-800" },
  contacted: { label: "Client contacté", style: "bg-amber-50 text-amber-800" },
  converted: { label: "Réservation créée", style: "bg-emerald-50 text-emerald-700" },
  declined: { label: "Refusée", style: "bg-slate-100 text-slate-500" },
};

function formatDay(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function DemandesPage() {
  const [requestId, setRequestId] = useState(1);
  const [loadedId, setLoadedId] = useState(0);
  const [rows, setRows] = useState<BookingRequest[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loading = loadedId !== requestId;

  useEffect(() => {
    let active = true;
    supabase
      .from("booking_requests")
      .select("id, full_name, phone, email, desired_date, start_time, end_time, people, message, status, created_at, spaces(name)")
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data, error: loadError }) => {
        if (!active) return;
        setError(loadError ? `Impossible de charger les demandes : ${loadError.message}` : "");
        setRows((data ?? []) as unknown as BookingRequest[]);
        setLoadedId(requestId);
      });
    return () => {
      active = false;
    };
  }, [requestId]);

  const visible = useMemo(
    () => rows.filter((r) => filter === "all" || r.status === "new" || r.status === "contacted"),
    [rows, filter]
  );
  const newCount = rows.filter((r) => r.status === "new").length;

  async function setStatus(row: BookingRequest, status: RequestStatus) {
    setBusyId(row.id);
    const { data: auth } = await supabase.auth.getUser();
    const { error: updateError } = await supabase
      .from("booking_requests")
      .update({ status, handled_by: auth.user?.id ?? null })
      .eq("id", row.id);
    setBusyId(null);
    if (updateError) {
      setError(`Mise à jour impossible : ${updateError.message}`);
      return;
    }
    setRows((current) => current.map((r) => (r.id === row.id ? { ...r, status } : r)));
  }

  return (
    <div className="text-slate-900">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Demandes des clients"
          description="Demandes de réservation envoyées depuis la page publique des espaces."
          actions={
            <button
              type="button"
              onClick={() => setRequestId((id) => id + 1)}
              disabled={loading}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
            >
              {loading ? "Actualisation..." : "Actualiser"}
            </button>
          }
        />

        {error && (
          <p role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            <strong>{newCount}</strong> nouvelle(s) demande(s)
          </p>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {(
              [
                ["open", "À traiter"],
                ["all", "Toutes"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
                  filter === value ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <p className="text-slate-500">Chargement...</p>
        ) : visible.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-500">
            {filter === "open" ? "Aucune demande à traiter." : "Aucune demande reçue pour le moment."}
          </p>
        ) : (
          <ul className="space-y-3">
            {visible.map((r) => {
              const status = STATUS[r.status];
              const busy = busyId === r.id;
              const wa = whatsappLink(
                r.phone,
                `Bonjour ${r.full_name}, nous avons bien reçu votre demande pour « ${r.spaces?.name ?? "l'espace"} » le ${formatDay(r.desired_date)} de ${r.start_time.slice(0, 5)} à ${r.end_time.slice(0, 5)}.`
              );
              return (
                <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{r.full_name}</p>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.style}`}>
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-700">
                        <strong>{r.spaces?.name ?? "Espace"}</strong> · {formatDay(r.desired_date)} ·{" "}
                        {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)} · {r.people} pers.
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {r.phone}
                        {r.email ? ` · ${r.email}` : ""}
                      </p>
                      {r.message && (
                        <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">« {r.message} »</p>
                      )}
                      <p className="mt-2 text-xs text-slate-400">
                        Reçue le {new Date(r.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        WhatsApp
                      </a>
                      <a
                        href={`tel:${r.phone}`}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-center text-xs font-medium hover:bg-slate-50"
                      >
                        Appeler
                      </a>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    {r.status === "new" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void setStatus(r, "contacted")}
                        className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                      >
                        Marquer « contacté »
                      </button>
                    )}
                    {(r.status === "new" || r.status === "contacted") && (
                      <>
                        <Link
                          href="/reservations/calendrier"
                          className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                        >
                          Ouvrir le calendrier
                        </Link>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void setStatus(r, "converted")}
                          className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          Réservation créée
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void setStatus(r, "declined")}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Refuser
                        </button>
                      </>
                    )}
                    {(r.status === "converted" || r.status === "declined") && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void setStatus(r, "contacted")}
                        className="text-xs font-medium text-slate-500 hover:underline disabled:opacity-50"
                      >
                        Remettre « à traiter »
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-6 text-xs text-slate-400">
          Une demande ne bloque aucun créneau. Pour réserver, crée la réservation dans le calendrier (en ajoutant le
          client comme membre s&apos;il ne l&apos;est pas encore), puis marque la demande « Réservation créée ».
        </p>
      </div>
    </div>
  );
}
