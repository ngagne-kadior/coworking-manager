"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function TestSupabasePage() {
  const [result, setResult] = useState("Vérification en cours...");

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      try {
        const diagnostic = await Promise.race([
          (async () => {
            const {
              data: { session },
              error: sessionError,
            } = await supabase.auth.getSession();

            const { data, error } = await supabase
              .from("members")
              .select("id, full_name")
              .eq("full_name", "Membre Test");

            return {
              sessionExiste: Boolean(session),
              erreurSession: sessionError?.message ?? null,
              membresTrouves: data?.length ?? 0,
              membres: data ?? [],
              erreurLecture: error?.message ?? null,
            };
          })(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Délai dépassé : Supabase ne répond pas à temps.")),
              10000
            )
          ),
        ]);

        if (active) setResult(JSON.stringify(diagnostic, null, 2));
      } catch (error) {
        if (active) {
          setResult(
            error instanceof Error ? error.message : "Erreur inconnue."
          );
        }
      }
    }

    void checkAccess();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <h1 className="text-2xl font-bold">Diagnostic Supabase</h1>
      <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-white p-4 text-sm">
        {result}
      </pre>
    </main>
  );
}