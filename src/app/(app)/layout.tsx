import AppShell from "@/components/AppShell";

// Toutes les pages internes partagent le même menu.
// /login reste en dehors de ce groupe.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
