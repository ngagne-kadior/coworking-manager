import { formatFCFA } from "@/lib/payments";

/** Messages envoyés au client (WhatsApp ou e-mail), rédigés une seule fois ici. */

export type RequestInfo = {
  full_name: string;
  space: string;
  desired_date: string;
  start_time: string;
  end_time: string;
  people: number;
};

export function formatDay(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const hhmm = (t: string) => t.slice(0, 5);

export const DECLINE_REASONS = [
  { key: "booked", label: "Créneau déjà réservé", sentence: "ce créneau est déjà réservé" },
  { key: "unavailable", label: "Espace indisponible à cette date", sentence: "l'espace n'est pas disponible à cette date" },
  { key: "capacity", label: "Capacité insuffisante", sentence: "" },
  { key: "other", label: "Autre motif", sentence: "" },
] as const;

export type DeclineKey = (typeof DECLINE_REASONS)[number]["key"];

export function declineSentence(key: DeclineKey, people: number, custom: string) {
  if (key === "capacity") return `l'espace ne peut pas accueillir ${people} personne${people > 1 ? "s" : ""}`;
  if (key === "other") return custom.trim();
  return DECLINE_REASONS.find((r) => r.key === key)!.sentence;
}

export function confirmationMessage(
  r: RequestInfo,
  opts: { coworking: string; amount: number | null; paymentInstructions: string | null }
) {
  const lines = [
    `Bonjour ${r.full_name},`,
    "",
    `Votre réservation chez ${opts.coworking} est confirmée ✅`,
    "",
    `📍 Espace : ${r.space}`,
    `📅 Date : ${formatDay(r.desired_date)}`,
    `🕘 Horaire : ${hhmm(r.start_time)} – ${hhmm(r.end_time)}`,
    `👥 Personnes : ${r.people}`,
  ];
  if (opts.amount !== null && opts.amount > 0) lines.push(`💰 Montant à régler : ${formatFCFA(opts.amount)}`);
  if (opts.paymentInstructions?.trim()) {
    lines.push("", `Paiement : ${opts.paymentInstructions.trim()}`);
    lines.push("Merci de nous envoyer la capture du paiement pour validation.");
  }
  lines.push("", "À bientôt !", opts.coworking);
  return lines.join("\n");
}

export function paymentReceiptMessage(
  r: RequestInfo,
  opts: { coworking: string; paid: number; due: number | null }
) {
  const rest = opts.due !== null ? Math.max(opts.due - opts.paid, 0) : 0;
  return [
    `Bonjour ${r.full_name},`,
    "",
    `Nous confirmons la réception de votre paiement de ${formatFCFA(opts.paid)} ✅`,
    `Réservation : ${r.space}, ${formatDay(r.desired_date)} de ${hhmm(r.start_time)} à ${hhmm(r.end_time)}.`,
    rest > 0 ? `Reste à régler : ${formatFCFA(rest)}.` : "Votre réservation est entièrement réglée.",
    "",
    "Merci et à bientôt !",
    opts.coworking,
  ].join("\n");
}

export function declineMessage(r: RequestInfo, opts: { coworking: string; reason: string; publicUrl: string }) {
  return [
    `Bonjour ${r.full_name},`,
    "",
    `Merci pour votre demande pour « ${r.space} » le ${formatDay(r.desired_date)} de ${hhmm(r.start_time)} à ${hhmm(r.end_time)}.`,
    `Malheureusement, ${opts.reason}.`,
    "",
    `Vous pouvez choisir un autre créneau ici : ${opts.publicUrl}`,
    "ou nous répondre directement sur ce numéro.",
    "",
    "Cordialement,",
    opts.coworking,
  ].join("\n");
}

export function mailtoLink(email: string, subject: string, body: string) {
  return `mailto:${encodeURIComponent(email).replace("%40", "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
