/** Nombre de jours avant la fin d'un abonnement à partir duquel on alerte. */
export const EXPIRY_ALERT_DAYS = 5;

/** Date du jour (heure locale) au format AAAA-MM-JJ. */
export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Date limite pour l'alerte : aujourd'hui + EXPIRY_ALERT_DAYS. */
export function alertLimitKey() {
  const d = new Date();
  d.setDate(d.getDate() + EXPIRY_ALERT_DAYS);
  return localDateKey(d);
}
