import type { Metadata } from 'next';
import { CalendarClock } from 'lucide-react';
import { loadSigningContext } from '@/lib/emargement';
import { HALF_LABEL } from '@/lib/dossier';
import { frDate } from '@/lib/absences';
import { EmargementSign } from '@/components/emargement-sign';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Émargement · CF Réseaux', robots: { index: false, follow: false } };

export default async function EmargementPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await loadSigningContext(token);

  return (
    <main className="sign-page">
      <div className="sign-card">
        <p className="sign-brand">CF Réseaux · Feuille d’émargement</p>
        {!ctx.ok ? (
          <div role="alert" className="alert alert-error">{ctx.error}</div>
        ) : (
          <>
            <h1>{ctx.title}</h1>
            <p className="hint">
              {[ctx.room, ctx.trainer && `Formateur : ${ctx.trainer}`].filter(Boolean).join(' · ')}
            </p>
            {ctx.slot ? (
              <>
                <p className="sign-slot">
                  <CalendarClock size={16} aria-hidden /> {HALF_LABEL[ctx.slot.half]} du {frDate(ctx.slot.day)}
                </p>
                <EmargementSign token={token} trainees={ctx.trainees} />
              </>
            ) : (
              <div role="status" className="alert alert-warning">
                L’émargement n’est pas ouvert en ce moment.
                {ctx.nextSlot && ` Prochaine signature : ${HALF_LABEL[ctx.nextSlot.half].toLowerCase()} du ${frDate(ctx.nextSlot.day)}.`}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
