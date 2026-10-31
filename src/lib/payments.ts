import { supabase } from "@/lib/supabase";

export type RateUnit = "hour" | "half_day" | "day" | "month";
export type PaymentMethod = "cash" | "wave" | "orange_money" | "transfer" | "card";

export type SpaceRate = { space_id: string; unit: RateUnit; price: number };

export type Payment = {
  id: string;
  reservation_id: string | null;
  member_id: string;
  amount: number;
  method: PaymentMethod;
  paid_at: string;
  note: string | null;
};

export const RATE_UNITS: { unit: RateUnit; label: string; short: string; minutes: number }[] = [
  { unit: "hour", label: "Par heure", short: "/h", minutes: 60 },
  { unit: "half_day", label: "Par demi-journée (4 h)", short: "/demi-j.", minutes: 240 },
  { unit: "day", label: "Par journée", short: "/jour", minutes: 24 * 60 },
  { unit: "month", label: "Par mois", short: "/mois", minutes: 30 * 24 * 60 },
];

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Espèces",
  wave: "Wave",
  orange_money: "Orange Money",
  transfer: "Virement",
  card: "Carte",
};

export function formatFCFA(amount: number) {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} F CFA`;
}

/**
 * Montant proposé pour une durée : la formule la moins chère parmi les
 * tarifs définis pour l'espace (ex. 6 h → 1 journée si moins cher que 6 × 1 h).
 * Renvoie null si l'espace n'a aucun tarif. Le montant reste modifiable.
 */
export function suggestPrice(rates: SpaceRate[], durationMinutes: number) {
  if (durationMinutes <= 0) return null;
  const candidates = rates
    .map((rate) => {
      const unit = RATE_UNITS.find((u) => u.unit === rate.unit);
      if (!unit) return null;
      return Math.ceil(durationMinutes / unit.minutes) * rate.price;
    })
    .filter((value): value is number => value !== null);
  return candidates.length ? Math.min(...candidates) : null;
}

export type PaymentState = "none" | "unpaid" | "partial" | "paid";

export function paymentState(price: number | null, paid: number): PaymentState {
  if (price === null) return "none";
  if (price === 0 || paid >= price) return "paid";
  return paid > 0 ? "partial" : "unpaid";
}

export const STATE_LABELS: Record<PaymentState, string> = {
  none: "Sans montant",
  unpaid: "À payer",
  partial: "Acompte versé",
  paid: "Payé",
};

export const STATE_STYLES: Record<PaymentState, string> = {
  none: "bg-slate-100 text-slate-500",
  unpaid: "bg-red-50 text-red-700",
  partial: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
};

export function sumPayments(rows: { amount: number }[] | null | undefined) {
  return (rows ?? []).reduce((total, row) => total + row.amount, 0);
}

/** Saisie d'un montant : « 15 000 », « 15000 F » → 15000 ; vide → null. */
export function parseAmount(value: string): number | null {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

export function ratesSummary(rates: SpaceRate[]) {
  return RATE_UNITS.filter(({ unit }) => rates.some((r) => r.unit === unit))
    .map(({ unit, short }) => `${formatFCFA(rates.find((r) => r.unit === unit)!.price)}${short}`)
    .join(" · ");
}

/** Enregistre les tarifs d'un espace (admin). Valeur vide = pas de tarif pour cette durée. */
export async function saveRates(spaceId: string, values: Record<RateUnit, string>): Promise<SpaceRate[]> {
  const toUpsert: SpaceRate[] = [];
  const toDelete: RateUnit[] = [];
  for (const { unit } of RATE_UNITS) {
    const price = parseAmount(values[unit]);
    if (price === null) toDelete.push(unit);
    else toUpsert.push({ space_id: spaceId, unit, price });
  }
  if (toUpsert.length) {
    const { error } = await supabase
      .from("space_rates")
      .upsert(toUpsert.map((r) => ({ ...r, updated_at: new Date().toISOString() })), {
        onConflict: "space_id,unit",
      });
    if (error) {
      throw new Error(
        error.code === "42501"
          ? "Seul l'administrateur peut modifier les tarifs."
          : `Tarifs non enregistrés : ${error.message}`
      );
    }
  }
  if (toDelete.length) {
    const { error } = await supabase.from("space_rates").delete().eq("space_id", spaceId).in("unit", toDelete);
    if (error) throw new Error(`Tarifs non enregistrés : ${error.message}`);
  }
  return toUpsert;
}
