"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { RATE_UNITS, formatFCFA, parseAmount, type RateUnit, type SpaceRate } from "@/lib/payments";

type Props = {
  spaceId: string;
  spaceName: string;
  rates: SpaceRate[];
  onClose: () => void;
  onSaved: (rates: SpaceRate[]) => void;
};

/** Saisie des tarifs d'un espace (admin). Case vide = pas de tarif pour cette durée. */
export default function RatesDialog({ spaceId, spaceName, rates, onClose, onSaved }: Props) {
  const [values, setValues] = useState<Record<RateUnit, string>>(() => {
    const initial = { hour: "", half_day: "", day: "", month: "" } as Record<RateUnit, string>;
    for (const rate of rates) initial[rate.unit] = String(rate.price);
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);

    const toUpsert: SpaceRate[] = [];
    const toDelete: RateUnit[] = [];
    for (const { unit } of RATE_UNITS) {
      const price = parseAmount(values[unit]);
      if (price === null) toDelete.push(unit);
      else toUpsert.push({ space_id: spaceId, unit, price });
    }

    if (toUpsert.length) {
      const { error: upsertError } = await supabase
        .from("space_rates")
        .upsert(
          toUpsert.map((rate) => ({ ...rate, updated_at: new Date().toISOString() })),
          { onConflict: "space_id,unit" }
        );
      if (upsertError) {
        setSaving(false);
        setError(
          upsertError.code === "42501"
            ? "Seul l'administrateur peut modifier les tarifs."
            : `Enregistrement impossible : ${upsertError.message}`
        );
        return;
      }
    }
    if (toDelete.length) {
      const { error: deleteError } = await supabase
        .from("space_rates")
        .delete()
        .eq("space_id", spaceId)
        .in("unit", toDelete);
      if (deleteError) {
        setSaving(false);
        setError(`Enregistrement impossible : ${deleteError.message}`);
        return;
      }
    }

    setSaving(false);
    onSaved(toUpsert);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Tarifs de ${spaceName}`}
        onClick={(event) => event.stopPropagation()}
        className="w-full rounded-t-2xl bg-white p-6 shadow-xl sm:max-w-md sm:rounded-2xl"
      >
        <h2 className="text-lg font-bold">Tarifs</h2>
        <p className="mt-1 text-sm text-slate-500">{spaceName} · en francs CFA</p>

        <form onSubmit={save} className="mt-5 space-y-3">
          {RATE_UNITS.map(({ unit, label }) => (
            <label key={unit} className="flex items-center justify-between gap-4 text-sm">
              <span className="font-medium">{label}</span>
              <input
                inputMode="numeric"
                value={values[unit]}
                onChange={(e) => setValues((v) => ({ ...v, [unit]: e.target.value }))}
                placeholder="—"
                className="w-36 rounded-lg border border-slate-300 px-3 py-2 text-right outline-none focus:border-blue-600"
              />
            </label>
          ))}
          <p className="text-xs text-slate-500">
            Laisse une case vide si tu ne proposes pas cette durée. À la réservation,
            l&apos;application propose la formule la moins chère, et le montant reste modifiable.
          </p>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50"
            >
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ratesSummary(rates: SpaceRate[]) {
  return RATE_UNITS.filter(({ unit }) => rates.some((r) => r.unit === unit))
    .map(({ unit, short }) => `${formatFCFA(rates.find((r) => r.unit === unit)!.price)}${short}`)
    .join(" · ");
}
