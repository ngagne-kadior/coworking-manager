"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  METHOD_LABELS,
  STATE_LABELS,
  STATE_STYLES,
  formatFCFA,
  parseAmount,
  paymentState,
  sumPayments,
  type Payment,
  type PaymentMethod,
} from "@/lib/payments";

type Props = {
  reservationId: string;
  memberId: string;
  price: number | null;
  /** Montant proposé d'après les tarifs, si le montant dû n'est pas encore défini */
  suggestedPrice?: number | null;
  canPay: boolean;
  onChanged: () => void;
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600";

/** Montant dû, encaissements et saisie d'un paiement pour une réservation. */
export default function PaymentPanel({ reservationId, memberId, price, suggestedPrice, canPay, onChanged }: Props) {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [currentPrice, setCurrentPrice] = useState(price);

  const [editingPrice, setEditingPrice] = useState(price === null);
  const [priceInput, setPriceInput] = useState(
    String(price ?? suggestedPrice ?? "")
  );
  const [amountInput, setAmountInput] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    supabase
      .from("payments")
      .select("id, reservation_id, member_id, amount, method, paid_at, note")
      .eq("reservation_id", reservationId)
      .order("paid_at")
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(`Paiements indisponibles : ${loadError.message}`);
        setPayments((data ?? []) as Payment[]);
      });
    return () => {
      active = false;
    };
  }, [reservationId, refresh]);

  const paid = sumPayments(payments);
  const remaining = currentPrice === null ? null : Math.max(currentPrice - paid, 0);
  const state = paymentState(currentPrice, paid);

  async function savePrice() {
    setError("");
    const value = parseAmount(priceInput);
    if (value === null) {
      setError("Indique le montant dû en F CFA.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase
      .from("reservations")
      .update({ price_amount: value })
      .eq("id", reservationId);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setCurrentPrice(value);
    setEditingPrice(false);
    onChanged();
  }

  async function addPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const amount = parseAmount(amountInput) ?? remaining;
    if (!amount || amount <= 0) {
      setError("Indique le montant encaissé.");
      return;
    }
    setBusy(true);
    const { error: insertError } = await supabase.from("payments").insert({
      reservation_id: reservationId,
      member_id: memberId,
      amount,
      method,
      note: note.trim() || null,
    });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setAmountInput("");
    setNote("");
    setRefresh((n) => n + 1);
    onChanged();
  }

  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Paiement</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_STYLES[state]}`}>
          {STATE_LABELS[state]}
        </span>
      </div>

      {/* Montant dû */}
      {editingPrice ? (
        <div className="mt-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Montant dû (F CFA)</span>
            <div className="flex gap-2">
              <input
                inputMode="numeric"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="Ex. 15 000"
                className={inputClass}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void savePrice()}
                className="rounded-lg bg-blue-700 px-3 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
              >
                OK
              </button>
            </div>
          </label>
          {currentPrice === null && suggestedPrice != null && (
            <p className="mt-1 text-xs text-slate-500">Proposé d&apos;après les tarifs de l&apos;espace.</p>
          )}
          {currentPrice === null && suggestedPrice == null && (
            <p className="mt-1 text-xs text-slate-500">
              Aucun tarif défini pour cet espace : saisis le montant à la main.
            </p>
          )}
        </div>
      ) : (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-slate-50 p-2">
            <dt className="text-slate-500">Dû</dt>
            <dd className="mt-0.5 text-sm font-bold">{formatFCFA(currentPrice ?? 0)}</dd>
          </div>
          <div className="rounded-lg bg-emerald-50 p-2">
            <dt className="text-emerald-700">Encaissé</dt>
            <dd className="mt-0.5 text-sm font-bold text-emerald-800">{formatFCFA(paid)}</dd>
          </div>
          <div className="rounded-lg bg-amber-50 p-2">
            <dt className="text-amber-700">Reste</dt>
            <dd className="mt-0.5 text-sm font-bold text-amber-800">{formatFCFA(remaining ?? 0)}</dd>
          </div>
        </dl>
      )}
      {!editingPrice && (
        <button
          type="button"
          onClick={() => {
            setPriceInput(String(currentPrice ?? ""));
            setEditingPrice(true);
          }}
          className="mt-2 text-xs font-medium text-blue-700 hover:underline"
        >
          Modifier le montant dû
        </button>
      )}

      {/* Encaissements */}
      {payments && payments.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-sm">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3">
              <span className="text-slate-600">
                {new Date(p.paid_at).toLocaleDateString("fr-FR")} · {METHOD_LABELS[p.method]}
                {p.note ? ` · ${p.note}` : ""}
              </span>
              <span className="font-semibold">{formatFCFA(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Nouveau paiement */}
      {canPay && currentPrice !== null && !editingPrice && (remaining ?? 0) > 0 && (
        <form onSubmit={addPayment} className="mt-4 space-y-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium text-slate-600">Enregistrer un paiement</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              inputMode="numeric"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder={`${remaining} (tout)`}
              aria-label="Montant encaissé"
              className={inputClass}
            />
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              aria-label="Moyen de paiement"
              className={inputClass}
            >
              {Object.entries(METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (ex. n° de transaction Wave)"
            aria-label="Note"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "Enregistrement..." : "Encaisser"}
          </button>
          <p className="text-xs text-slate-400">Laisse le montant vide pour encaisser tout le reste.</p>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
