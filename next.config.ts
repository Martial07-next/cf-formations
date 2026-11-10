import type { NextConfig } from 'next';

/**
 * En-têtes de sécurité envoyés sur toutes les pages :
 *  · connexion toujours chiffrée (HSTS) ;
 *  · la plateforme ne peut pas être affichée dans le cadre d'un autre site (clickjacking) ;
 *  · le navigateur ne devine pas le type des fichiers ;
 *  · l'adresse complète (liens à jeton des QR codes) n'est jamais transmise à un autre site ;
 *  · micro, position, paiement… désactivés ;
 *  · formulaires envoyés seulement à la plateforme, pas de greffon ni de <base> étranger ;
 *  · jamais indexée par les moteurs de recherche (outil interne).
 */
const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), browsing-topics=()' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests" },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Ne pas annoncer la technologie utilisée.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  experimental: {
    // Pages dynamiques toujours fraîches : un cache navigateur (30 s) empêchait
    // l'affichage immédiat des ajouts (stagiaires, facturation…) après une action.
    staleTimes: { dynamic: 0, static: 180 },
    // Imports d'icônes allégés.
    optimizePackageImports: ['lucide-react'],
  },
};
export default nextConfig;
