import type { Metadata } from 'next';
import { loadTitleContext } from '@/lib/titres-public';
import { TitleUploadPublic } from '@/components/titre-upload';
import { BackLink } from '@/components/back-link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Titre d’habilitation · CF Réseaux', robots: { index: false, follow: false } };

/** Dépôt du titre d'habilitation par le stagiaire, après scan du QR code (sans compte). */
export default async function TitrePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await loadTitleContext(token);
  return (
    <main className="sign-page">
      <div className="sign-card">
        <BackLink />
        <p className="sign-brand">CF Réseaux · Titre d’habilitation</p>
        {!ctx.ok ? (
          <div role="alert" className="alert alert-error">{ctx.error}</div>
        ) : (
          <>
            <h1>{ctx.title}</h1>
            <p className="hint">{[ctx.period, ctx.trainer && `Formateur : ${ctx.trainer}`].filter(Boolean).join(' · ')}</p>
            <TitleUploadPublic token={token} trainees={ctx.trainees} />
          </>
        )}
      </div>
    </main>
  );
}
