import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pages accessibles sans être connecté.
// /espaces-disponibles : vitrine publique (les données passent par
// get_public_catalog, qui ne renvoie que les espaces actifs).
const PUBLIC_PATHS = ["/login", "/espaces-disponibles"];

export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Vérifie la session (et la rafraîchit si nécessaire).
  // Les données restent protégées par le RLS de Supabase :
  // ce contrôle sert à rediriger proprement, pas à sécuriser la base.
  let isLoggedIn = false;
  try {
    const { data } = await supabase.auth.getClaims();
    isLoggedIn = Boolean(data?.claims?.sub);
  } catch {
    // Cookie de session illisible ou corrompu : on le traite comme une
    // absence de connexion (redirection vers /login) au lieu d'une erreur 500.
    isLoggedIn = false;
  }

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some(
    (p) => path === p || path.startsWith(`${p}/`)
  );

  if (!isLoggedIn && !isPublic) {
    const url = request.nextUrl.clone();
    // L'adresse du site mène les visiteurs à la vitrine ; les autres pages
    // internes mènent à la connexion.
    url.pathname = path === "/" ? "/espaces-disponibles" : "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Ignore les fichiers techniques et les images.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
