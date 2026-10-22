"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
const navigation = [
  { name: "Tableau de bord", icon: "▦" },
  { name: "Membres", icon: "♙" },
  { name: "Espaces", icon: "▤" },
  { name: "Réservations", icon: "▦" },
  { name: "Historique", icon: "◷" },
];

const demoStats = [
  { label: "Membres actifs", value: "128", detail: "Donnée de démonstration", icon: "♙", color: "blue" },
  { label: "Espaces disponibles", value: "08", detail: "Donnée de démonstration", icon: "▤", color: "green" },
  { label: "Réservations du jour", value: "24", detail: "Donnée de démonstration", icon: "▦", color: "purple" },
  { label: "Taux d’occupation", value: "76 %", detail: "Donnée de démonstration", icon: "↗", color: "orange" },
];

export default function Home() {
  const router = useRouter();
  const [activePage, setActivePage] = useState("Tableau de bord");
  const [search, setSearch] = useState("");

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 md:flex">
      <aside className="flex w-full flex-col border-r border-slate-200 bg-white md:min-h-screen md:w-64">
        <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white">
            C
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Coworking</h1>
            <p className="text-xs text-slate-500">MANAGER</p>
          </div>
        </div>

        <div className="px-4 py-5">
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Menu principal
          </p>
          <nav className="grid grid-cols-2 gap-1 md:grid-cols-1">
            {navigation.map((item) => (
              <button
                key={item.name}
                onClick={() => {
  if (item.name === "Membres") {
    router.push("/members");
    return;
  }
  if (item.name === "Espaces") {
  router.push("/spaces");
  return;
  }
  setActivePage(item.name);
}}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${
                  activePage === item.name
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className="text-lg" aria-hidden="true">{item.icon}</span>
                {item.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto hidden p-4 md:block">
          <div className="rounded-2xl bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900">Espace de travail</p>
            <p className="mt-1 text-xs leading-5 text-blue-700">
              Gérez vos membres, vos espaces et vos réservations depuis un seul endroit.
            </p>
          </div>
          <p className="px-2 pb-2 pt-5 text-xs text-slate-400">Coworking Manager · MVP</p>
        </div>
      </aside>

      <section className="min-w-0 flex-1">
        <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <p className="text-sm text-slate-500">Espace de gestion / {activePage}</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              {activePage === "Tableau de bord" ? "Vue d’ensemble" : activePage}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <label className="relative block flex-1 sm:w-64">
              <span className="sr-only">Rechercher dans la page</span>
              <span className="absolute left-3 top-2.5 text-slate-400" aria-hidden="true">⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700" title="Profil de démonstration">
              AD
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl space-y-7 p-5 sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-700">Bonjour, bienvenue !</p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">
                Voici l’activité de votre espace
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Aperçu visuel avec des chiffres fictifs de démonstration.
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Mode démonstration
            </span>
          </div>

          {activePage === "Tableau de bord" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {demoStats.map((stat) => (
                  <article key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between">
                      <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                      <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${
                        stat.color === "blue" ? "bg-blue-50 text-blue-700" :
                        stat.color === "green" ? "bg-emerald-50 text-emerald-700" :
                        stat.color === "purple" ? "bg-violet-50 text-violet-700" :
                        "bg-orange-50 text-orange-700"
                      }`}>{stat.icon}</span>
                    </div>
                    <p className="mt-5 text-3xl font-bold tracking-tight text-slate-900">{stat.value}</p>
                    <p className="mt-2 text-xs text-slate-400">{stat.detail}</p>
                  </article>
                ))}
              </div>

              <div className="grid gap-6 xl:grid-cols-3">
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900">Activité des réservations</h4>
                      <p className="mt-1 text-sm text-slate-500">Aperçu illustratif de la semaine</p>
                    </div>
                    <span className="text-xs text-slate-400">Données fictives</span>
                  </div>
                  <div className="mt-8 flex h-48 items-end justify-around gap-3 border-b border-slate-100 px-2">
                    {[42, 65, 50, 82, 60, 92, 70].map((height, index) => (
                      <div key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-3">
                        <div
                          className={`w-full max-w-10 rounded-t-lg ${index === 5 ? "bg-blue-600" : "bg-blue-100"}`}
                          style={{ height: `${height}%` }}
                          title={`Valeur illustrative ${height}`}
                        />
                        <span className="pb-2 text-xs text-slate-400">
                          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"][index]}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h4 className="font-bold text-slate-900">Raccourcis</h4>
                  <p className="mt-1 text-sm text-slate-500">Accès rapide aux modules</p>
                  <div className="mt-5 space-y-3">
                    {[
                      { label: "Gérer les membres", target: "Membres", icon: "♙" },
                      { label: "Voir les espaces", target: "Espaces", icon: "▤" },
                      { label: "Consulter les réservations", target: "Réservations", icon: "▦" },
                    ].map((item) => (
                      <button
                        key={item.target}
                        onClick={() => setActivePage(item.target)}
                        className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left text-sm font-medium transition hover:border-blue-200 hover:bg-blue-50"
                      >
                        <span className="flex items-center gap-3">
                          <span className="text-lg text-blue-600" aria-hidden="true">{item.icon}</span>
                          {item.label}
                        </span>
                        <span className="text-slate-400" aria-hidden="true">→</span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-6">
                <h4 className="font-bold text-slate-900">Prochaine étape</h4>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Connecter Supabase, puis remplacer les exemples par les données réelles.
                  Les comptes, les permissions et les réservations seront développés et testés
                  séparément avant la mise en production.
                </p>
              </section>
            </>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-2xl text-blue-700">
                {navigation.find((item) => item.name === activePage)?.icon}
              </div>
              <h3 className="mt-5 text-xl font-bold text-slate-900">{activePage}</h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                Ce module est prévu dans le projet, mais il n’est pas encore connecté aux données.
                Nous le construirons étape par étape après la préparation de la base de données et des permissions.
              </p>
              {search && (
                <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                  Recherche saisie : <strong>{search}</strong>. La recherche réelle sera activée lors du développement de ce module.
                </p>
              )}
              <button
                onClick={() => setActivePage("Tableau de bord")}
                className="mt-6 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Retour au tableau de bord
              </button>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
