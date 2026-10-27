import type { Metadata } from 'next';
import { loadConventionByToken } from '@/lib/poec-public';
import { ConventionPublic } from '@/components/poec/convention-public';
import { BackLink } from '@/components/back-link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Convention de stage · CF Réseaux', robots: { index: false, follow: false } };

/** Lien personnel de l'entreprise d'accueil ou du stagiaire (sans compte). */
export default async function ConventionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await loadConventionByToken(token);

  return (
    <main className="sign-page">
      <div className="sign-card poec-card">
        <BackLink />
        <div className="poec-band"><img src="/logo-cf-reseaux.svg" alt="CF Réseaux" /></div>
        <p className="sign-brand">Convention de stage tripartite · POEC</p>
        {!res.ok ? (
          <div role="alert" className="alert alert-error">{res.error}</div>
        ) : (
          <>
            <h1>{res.value.party === 'company' ? 'Entreprise d’accueil' : `Bonjour ${res.value.traineeName}`}</h1>
            <p className="hint">
              {res.value.party === 'company'
                ? `CF Réseaux vous invite à compléter et signer la convention de stage de ${res.value.traineeName}.`
                : 'Relis ta convention de stage, complète ton adresse puis signe.'}
            </p>
            <ConventionPublic
              token={token}
              party={res.value.party}
              data={{
                convention: res.value.convention,
                traineeName: res.value.traineeName,
                period: res.value.period,
                programTitle: res.value.programTitle,
                director: res.value.director,
                legal: res.value.legal,
              }}
            />
          </>
        )}
      </div>
    </main>
  );
}
