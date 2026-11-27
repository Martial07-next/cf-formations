import Link from 'next/link';
import { headers } from 'next/headers';
import { CheckCircle2, Circle, ClipboardCheck, Mail, Receipt, Shirt, FileText, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { CLOSURE_SESSION_SEL, loadClosures, loanReminderMail, trainerReminderMail, type Closure } from '@/lib/closure';
import { formatSessionPeriod } from '@/lib/week';
import { ExportDossierButton } from '@/components/export-dossier-button';

/**
 * Clôture d'une session terminée, en un écran : dossier formateur, dossier
 * bureau, prêts rendus, facturation, puis le dossier complet en un seul PDF.
 */
export async function ClosurePanel({ sessionId, open, canBill }: { sessionId: string; open: boolean; canBill: boolean }) {
  const supabase = await createClient();
  const { data: s } = await supabase.from('sessions').select(CLOSURE_SESSION_SEL).eq('id', sessionId).maybeSingle();
  if (!s) return null;
  const c = (await loadClosures(supabase as any, [s]))[sessionId];
  if (!c) return null;
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') || 'https'}://${h.get('host') || 'cf-formations.vercel.app'}`;
  return <ClosureView c={c} open={open} canBill={canBill} origin={origin} />;
}

export function ClosureView({ c, open, canBill, origin }: { c: Closure; open: boolean; canBill: boolean; origin: string }) {
  const sessionId = c.sessionId;
  const period = formatSessionPeriod(c.startAt, c.endAt);
  const mail = c.trainerLeft ? trainerReminderMail(c, `${origin}/sessions/${sessionId}`, period) : null;

  const steps = [
    {
      icon: <Users size={16} aria-hidden />,
      label: 'Partie formateur',
      done: !c.trainerLeft,
      detail: c.trainerLeft
        ? `${c.trainerLeft} document${c.trainerLeft > 1 ? 's' : ''} à remplir par ${c.trainerName || 'le formateur'}`
        : 'Tour de table, appréciations, attestations… remplis',
      actions: (
        <>
          {mail && (
            <a className="btn small" href={mail}>
              <Mail size={14} aria-hidden /> Relancer {c.trainerName ? c.trainerName.split(/\s+/).find((w) => w && w !== w.toUpperCase()) || 'le formateur' : 'le formateur'}
            </a>
          )}
          {c.trainerLeft > 0 && <a className="btn small ghost" href="#dossier">Voir le dossier</a>}
        </>
      ),
    },
    {
      icon: <FileText size={16} aria-hidden />,
      label: 'Partie bureau',
      done: !c.officeLeft,
      detail: c.officeLeft ? `${c.officeLeft} document${c.officeLeft > 1 ? 's' : ''} à remplir par le bureau` : 'Documents du bureau remplis',
      actions: c.officeLeft ? <a className="btn small primary" href="#dossier">Remplir</a> : null,
    },
    {
      icon: <Shirt size={16} aria-hidden />,
      label: 'Prêts (vêtements, baudriers)',
      done: !c.loansOut.length,
      detail: c.loansOut.length ? null : 'Rien de prêté, ou tout est rendu',
      list: c.loansOut.map((l) => {
        const m = loanReminderMail(l, c.title);
        return (
          <li key={l.id}>
            <Link href={`/stagiaires/${l.traineeId}#vetements`}>{l.name}</Link> · {l.signed ? l.text : `${l.text} (prêt pas signé)`}
            {m && (
              <a className="closure-mini" href={m}>
                <Mail size={12} aria-hidden /> Relancer
              </a>
            )}
          </li>
        );
      }),
      actions: c.loansOut.length ? <a className="btn small ghost" href="#vetements">Noter un retour</a> : null,
    },
    ...(c.billed === null
      ? []
      : [
          {
            icon: <Receipt size={16} aria-hidden />,
            label: 'Facturation',
            done: c.billed,
            detail: c.billed ? 'Facturation faite' : canBill ? 'Nom de la facture puis « Facturation faite »' : 'À faire par le compte Facturation',
            actions: !c.billed && canBill ? <a className="btn small primary" href="#facturation">Facturer</a> : null,
          },
        ]),
  ];
  const left = steps.filter((x) => !x.done).length;

  return (
    <details className={`closure${c.closed ? ' closed' : ''}`} id="cloture" open={open || undefined}>
      <summary>
        <span className="closure-icon">{c.closed ? <CheckCircle2 size={18} aria-hidden /> : <ClipboardCheck size={18} aria-hidden />}</span>
        <span className="closure-head">
          <strong>{c.closed ? 'Session clôturée' : 'Clôturer la session'}</strong>
          <span className="hint">
            {c.closed ? 'Dossier complet, prêts rendus, facturation faite.' : `${left} point${left > 1 ? 's' : ''} à régler avant de boucler la session`}
          </span>
        </span>
        <span className="closure-dots" aria-hidden>
          {steps.map((x) => (
            <span key={x.label} className={x.done ? 'ok' : ''} />
          ))}
        </span>
      </summary>
      <ol className="closure-steps">
        {steps.map((x) => (
          <li key={x.label} className={x.done ? 'done' : ''}>
            <span className="closure-check">{x.done ? <CheckCircle2 size={18} aria-hidden /> : <Circle size={18} aria-hidden />}</span>
            <span className="closure-body">
              <strong>
                {x.icon} {x.label}
              </strong>
              {x.detail && <span className="hint">{x.detail}</span>}
              {'list' in x && x.list && x.list.length > 0 && <ul className="closure-list">{x.list}</ul>}
            </span>
            <span className="closure-actions">{x.actions}</span>
          </li>
        ))}
      </ol>
      <div className="closure-foot">
        <ExportDossierButton />
        <span className="hint">Page de garde, tour de table, appréciations, attestations, certificats et documents : tout le dossier dans un seul PDF.</span>
      </div>
    </details>
  );
}
