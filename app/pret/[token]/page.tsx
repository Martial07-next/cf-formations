import type { Metadata } from 'next';
import { RgpdLink } from '@/components/rgpd-link';
import { loanByToken } from '@/app/vetements/actions';
import { PretSign } from '@/components/vetements/pret-sign';
import { clothesText } from '@/lib/vetements';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Prêt de matériel · CF Réseaux', robots: { index: false, follow: false } };

/** Page ouverte en scannant le QR code d'un prêt (sans compte) : le stagiaire signe sur son téléphone. */
export default async function PretPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await loanByToken(token);
  return (
    <main className="sign-page">
      <div className="sign-card">
        <div className="poec-band"><img src="/logo-cf-reseaux.svg" alt="CF Réseaux" /></div>
        <p className="sign-brand">Prêt de matériel</p>
        {!ctx.ok ? (
          <div role="alert" className="alert alert-error">{ctx.error}</div>
        ) : ctx.signed ? (
          <>
            <h1>{ctx.traineeName}</h1>
            <div role="status" className="alert alert-success">Ce prêt est déjà signé. Merci !</div>
          </>
        ) : (
          <>
            <h1>{ctx.traineeName}</h1>
            <p className="hint">
              CF Réseaux te prête : <strong>{clothesText(ctx.vestes, ctx.pantalons, ctx.baudriers)}</strong>. Vérifie ton adresse, puis signe dans le cadre.{' '}
              <a href="/templates/vetements-tst.pdf" target="_blank" rel="noreferrer">Lire l’attestation</a>
            </p>
            <PretSign token={token} address={ctx.address} />
          </>
        )}
        <RgpdLink />
      </div>
    </main>
  );
}
