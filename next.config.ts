import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Pages déjà visitées gardées 30 s côté navigateur : retour arrière et
    // allers-retours instantanés (les enregistrements rafraîchissent quand même).
    staleTimes: { dynamic: 30, static: 180 },
    // Imports d'icônes allégés.
    optimizePackageImports: ['lucide-react'],
  },
};
export default nextConfig;
