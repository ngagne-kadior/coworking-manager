import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nos espaces de coworking",
  description: "Découvre nos espaces de travail et envoie ta demande de réservation.",
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return children;
}
