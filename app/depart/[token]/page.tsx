import type { Metadata } from 'next';
import { loadDepartContext } from '@/lib/departs-server';
import { DepartSign } from '@/components/departs/depart-sign';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Départ anticipé · CF Réseaux', robots: { index: false, follow: false } };

/** Page ouverte en scannant le QR code « Départ anticipé » de la session (sans compte). */
export default async function DepartPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await loadDepartContext(token);
  return (
    <main className="sign-page">
      <div className="sign-card">
        <div className="poec-band"><img src="/logo-cf-reseaux.svg" alt="CF Réseaux" /></div>
        <p className="sign-brand">Attestation de départ anticipé</p>
        {!ctx.ok ? (
          <div role="alert" className="alert alert-error">{ctx.error}</div>
        ) : !ctx.allowed ? (
          <>
            <h1>{ctx.formationTitle}</h1>
            <div role="status" className="alert alert-warning">Le départ anticipé n’est pas possible sur cette formation. Adresse-toi au formateur.</div>
          </>
        ) : (
          <>
            <h1>{ctx.formationTitle}</h1>
            <p className="hint">Tu dois partir avant la fin de la journée ? Choisis ton nom, indique la raison et signe : la date et l’heure de départ sont enregistrées automatiquement.</p>
            <DepartSign token={token} formationTitle={ctx.formationTitle} trainees={ctx.trainees} />
          </>
        )}
      </div>
    </main>
  );
}
