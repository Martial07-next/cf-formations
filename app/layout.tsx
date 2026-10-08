import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'CF Réseaux · Formations', description: 'Gestion des plannings de formation' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="fr"><body>{children}</body></html>;
}
