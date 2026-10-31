"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import LogoutButton from "@/components/LogoutButton";
import { initials } from "@/components/Avatar";

type Profile = { full_name: string; role: "admin" | "manager" };

type NavItem = {
  label: string;
  short: string;
  path: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
};

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const NAV: NavItem[] = [
  {
    label: "Tableau de bord",
    short: "Accueil",
    path: "/",
    icon: <Icon d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />,
  },
  {
    label: "Membres",
    short: "Membres",
    path: "/members",
    icon: (
      <Icon d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7" />
    ),
  },
  {
    label: "Espaces",
    short: "Espaces",
    path: "/spaces",
    icon: <Icon d="M3 21h18M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 9h3a1 1 0 0 1 1 1v11M8 8h4M8 12h4M8 16h4" />,
  },
  {
    label: "Réservations",
    short: "Résa.",
    path: "/reservations",
    icon: <Icon d="M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1M8 12h2M14 12h2M8 16h2" />,
  },
  {
    label: "Paiements",
    short: "Paiements",
    path: "/paiements",
    icon: <Icon d="M3 7h18v10H3zM3 11h18M7 15h2M17 7V5H5" />,
  },
  {
    label: "Historique",
    short: "Hist.",
    path: "/historique",
    icon: <Icon d="M12 8v4l2.5 2.5M3.05 11a9 9 0 1 1 .5 4M3 5v6h6" />,
  },
  {
    label: "Comptes",
    short: "Comptes",
    path: "/utilisateurs",
    adminOnly: true,
    icon: <Icon d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6zM9.5 12l1.8 1.8L15 10" />,
  },
];

const ROLE_LABELS = { admin: "Administrateur", manager: "Gestionnaire" };

function isActive(pathname: string, path: string) {
  return path === "/" ? pathname === "/" : pathname.startsWith(path);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (!data.user) return null;
        const { data: row } = await supabase
          .from("profiles")
          .select("full_name, role")
          .eq("id", data.user.id)
          .maybeSingle();
        return row as Profile | null;
      })
      .then((row) => {
        if (active) setProfile(row);
      });

    return () => {
      active = false;
    };
  }, []);

  // « Comptes » n'est affiché qu'à l'admin. La vraie protection est
  // côté serveur et dans la base : ceci ne fait qu'alléger le menu.
  const items = NAV.filter((item) => !item.adminOnly || profile?.role === "admin");

  return (
    <div className="min-h-screen bg-[#f4f7fc] text-slate-800">
      {/* Menu latéral (ordinateur) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#111c36] text-white lg:flex">
        <Link href="/" className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-lg font-bold">
            C
          </span>
          <span>
            <span className="block text-base font-bold tracking-wide">Coworking</span>
            <span className="block text-[11px] tracking-[0.2em] text-slate-400">MANAGER</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-1 px-4 pt-6" aria-label="Navigation principale">
          {items.map((item) => {
            const active = isActive(pathname, item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                  active
                    ? "bg-blue-600 font-semibold text-white shadow-lg shadow-blue-950/30"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="m-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-sm font-bold text-blue-200">
              {profile ? initials(profile.full_name) : "…"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{profile?.full_name ?? "Chargement..."}</p>
              <p className="text-xs text-slate-400">{profile ? ROLE_LABELS[profile.role] : " "}</p>
            </div>
          </div>
          <LogoutButton className="mt-4 w-full rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-50" />
        </div>
      </aside>

      {/* Barre du haut (téléphone et tablette) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            C
          </span>
          <span className="text-sm font-bold text-slate-900">Coworking Manager</span>
        </Link>
        <LogoutButton className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-50" />
      </header>

      <main className="px-4 pb-28 pt-6 sm:px-6 lg:ml-64 lg:px-10 lg:pb-10 lg:pt-8">{children}</main>

      {/* Menu du bas (téléphone et tablette) */}
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {items.map((item) => {
          const active = isActive(pathname, item.path);
          return (
            <Link
              key={item.path}
              href={item.path}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] ${
                active ? "font-semibold text-blue-600" : "text-slate-500"
              }`}
            >
              {item.icon}
              {item.short}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** En-tête commun à chaque page : titre, description et actions. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </header>
  );
}
