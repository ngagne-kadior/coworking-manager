import Link from "next/link";

/** Onglets « Calendrier » / « Liste » des réservations. */
export default function ReservationTabs({ active }: { active: "calendrier" | "liste" }) {
  const base = "rounded-lg px-4 py-2 text-sm font-medium transition";
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      <Link
        href="/reservations/calendrier"
        aria-current={active === "calendrier" ? "page" : undefined}
        className={`${base} ${active === "calendrier" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
      >
        Calendrier
      </Link>
      <Link
        href="/reservations"
        aria-current={active === "liste" ? "page" : undefined}
        className={`${base} ${active === "liste" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
      >
        Liste
      </Link>
    </div>
  );
}
