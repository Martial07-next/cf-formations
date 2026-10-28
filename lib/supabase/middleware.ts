import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseUrl, getSupabaseKey } from '@/lib/supabase-env';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabaseKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isLogin = request.nextUrl.pathname.startsWith('/login');
  // Émargement par QR code : ouvert aux stagiaires, sans compte.
  const path = request.nextUrl.pathname;
  // Conventions POEC : liens personnels de l'entreprise d'accueil, du stagiaire et de France Travail.
  const isPublicRoute =
    isLogin || path.startsWith('/emargement/') || path.startsWith('/convention/') ||
    path.startsWith('/france-travail/') ||
    path.startsWith('/autorisations/') ||
    path.startsWith('/salarie/') ||
    // Dépôt du titre d'habilitation par le stagiaire (QR code de la session).
    path.startsWith('/titre/') ||
    path.startsWith('/auth/');

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Page demandée (ex. une fiche session ouverte depuis la plateforme de congés) : rouverte après connexion.
    url.search = path !== '/' ? `?suite=${encodeURIComponent(path + request.nextUrl.search)}` : '';
    return NextResponse.redirect(url);
  }

  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
