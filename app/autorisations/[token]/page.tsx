import type { Metadata } from 'next';
import { loadAutorContext } from '@/lib/autorisations-server';
import { AUTH_KIND } from '@/lib/autorisations';
import { AutorSign } from '@/components/autorisations/autor-sign';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Autorisations · CF Réseaux', robots: { index: false, follow: false } };

/** Page ouverte en scannant le QR code de la session (sans compte). */
export default async function AutorisationsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await loadAutorContext(token);
  return (
    <main className="sign-page">
      <div className="sign-card">
        <div className="poec-band"><img src="/logo-cf-reseaux.svg" alt="CF Réseaux" /></div>
        <p className="sign-brand">Autorisations stagiaire</p>
        {!ctx.ok ? (
          <div role="alert" className="alert alert-error">{ctx.error}</div>
        ) : (
          <>
            <h1>{ctx.title}</h1>
            <p className="hint">
              À remplir une seule fois : {ctx.kinds.map((k) => AUTH_KIND[k].short).join(' · ') || 'vêtements prêtés'}. Choisis ton nom.
            </p>
            <AutorSign token={token} trainees={ctx.trainees} />
          </>
        )}
      </div>
    </main>
  );
}
