import type { MetadataRoute } from 'next';

/** Application sur l'écran d'accueil (Android, iPhone, tablettes). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CF PLANNING',
    short_name: 'CF PLANNING',
    description: 'Planning des formations CF Réseaux',
    start_url: '/',
    display: 'standalone',
    background_color: '#17241B',
    theme_color: '#17241B',
    lang: 'fr',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
