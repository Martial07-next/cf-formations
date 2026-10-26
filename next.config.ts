import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Pages dynamiques toujours fraîches : un cache navigateur (30 s) empêchait
    // l'affichage immédiat des ajouts (stagiaires, facturation…) après une action.
    staleTimes: { dynamic: 0, static: 180 },
    // Imports d'icônes allégés.
    optimizePackageImports: ['lucide-react'],
  },
};
export default nextConfig;
