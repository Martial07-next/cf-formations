import type { SupabaseClient } from '@supabase/supabase-js';
import { computeDossierTodo } from '@/lib/dossier-todo';
import { loanText, missingOf, type ClothingLoan } from '@/lib/vetements';

/**
 * Clôture d'une session terminée : tout ce qui doit être fait avant de la
 * considérer comme bouclée (dossier formateur, dossier bureau, prêts rendus,
 * facturation). Sert à la page « À faire » et à l'écran « Clôturer ».
 */
export type ClosureLoan = { id: string; traineeId: string; name: string; email: string | null; text: string; signed: boolean };

export type Closure = {
  sessionId: string;
  title: string;
  startAt: string;
  endAt: string;
  trainerId: string | null;
  trainerName: string | null;
  trainerEmail: string | null;
  /** Documents qui restent à remplir côté formateur / côté bureau. */
  trainerLeft: number;
  officeLeft: number;
  dossierComplete: boolean;
  /** null : facturation pas suivie (migration absente). */
  billed: boolean | null;
  loansOut: ClosureLoan[];
  /** Tout est fait. */
  closed: boolean;
};

export const CLOSURE_SESSION_SEL =
  'id, title, status, start_at, end_at, trainer_id, template_id, trainers(full_name, email), session_trainees(trainee_id, status)';

const one = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function loadClosures(supabase: SupabaseClient, sessions: any[]): Promise<Record<string, Closure>> {
  const out: Record<string, Closure> = {};
  if (!sessions.length) return out;
  const ids = sessions.map((s) => s.id as string);
  const chunk = <T,>(list: T[], n = 150) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));
  const many = async (table: string, sel: string) => {
    const rows: any[] = [];
    for (const part of chunk(ids)) {
      const { data } = await supabase.from(table).select(sel).in('session_id', part);
      rows.push(...((data as any[]) || []));
    }
    return rows;
  };
  const [dayRows, moduleRows, linkRows, loanRows, billRows] = await Promise.all([
    many('session_days', 'session_id, day, start_time, end_time'),
    many('session_modules', 'id, session_id, position, name, start_day, end_day'),
    many('session_trainee_modules', 'session_id, trainee_id, module_id'),
    many('clothing_loans', '*, trainees(full_name, email)'),
    (async () => {
      const rows: any[] = [];
      for (const part of chunk(ids)) {
        const { data, error } = await supabase.from('sessions').select('id, billing_done').in('id', part);
        if (error) return null;
        rows.push(...((data as any[]) || []));
      }
      return rows;
    })(),
  ]);
  const { todo, dossierComplete } = await computeDossierTodo(supabase, sessions, { dayRows, moduleRows, linkRows });
  const billed = billRows ? new Map(billRows.map((r) => [r.id, Boolean(r.billing_done)])) : null;

  for (const s of sessions) {
    const t = one(s.trainers);
    const loansOut: ClosureLoan[] = loanRows
      .filter((l) => l.session_id === s.id)
      .filter((l) => {
        const m = missingOf(l as ClothingLoan);
        return !l.signed_at || m.vestes + m.pantalons + m.baudriers > 0;
      })
      .map((l) => {
        const m = missingOf(l as ClothingLoan);
        const tr = one(l.trainees);
        return {
          id: l.id,
          traineeId: l.trainee_id,
          name: tr?.full_name || 'Stagiaire',
          email: tr?.email || null,
          text: l.returned_at ? `manque ${loanText({ ...m } as ClothingLoan)}` : loanText(l as ClothingLoan),
          signed: Boolean(l.signed_at),
        };
      });
    const left = todo[s.id] || { trainer: 0, office: 0 };
    const b = billed ? billed.get(s.id) ?? false : null;
    const complete = Boolean(dossierComplete[s.id]);
    out[s.id] = {
      sessionId: s.id,
      title: s.title,
      startAt: s.start_at,
      endAt: s.end_at,
      trainerId: s.trainer_id || null,
      trainerName: t?.full_name || null,
      trainerEmail: t?.email || null,
      trainerLeft: left.trainer,
      officeLeft: left.office,
      dossierComplete: complete,
      billed: b,
      loansOut,
      // Sans document obligatoire, le dossier n'est jamais « complet » : seuls les restes comptent.
      closed: !left.trainer && !left.office && b !== false && !loansOut.length,
    };
  }
  return out;
}

/** Relance du formateur par mail (messagerie de l'ordinateur, rien d'envoyé par la plateforme). */
export function trainerReminderMail(c: Pick<Closure, 'trainerEmail' | 'trainerName' | 'title' | 'trainerLeft'>, sessionUrl: string, period: string) {
  if (!c.trainerEmail) return null;
  const first = (c.trainerName || '').split(/\s+/).find((w) => w && w !== w.toUpperCase()) || '';
  const subject = `Dossier à compléter : ${c.title} (${period})`;
  const body = [
    `Bonjour${first ? ` ${first}` : ''},`,
    '',
    `Il reste ${c.trainerLeft} document${c.trainerLeft > 1 ? 's' : ''} à remplir dans le dossier de la session « ${c.title} » (${period}).`,
    `Tu peux le compléter ici : ${sessionUrl}#dossier`,
    '',
    'Merci !',
  ].join('\n');
  return `mailto:${encodeURIComponent(c.trainerEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Relance d'un stagiaire pour un prêt pas rendu. */
export function loanReminderMail(l: ClosureLoan, title: string) {
  if (!l.email) return null;
  const subject = `Matériel prêté à rendre · ${title}`;
  const body = [
    'Bonjour,',
    '',
    `Lors de votre formation « ${title} », CF Réseaux vous a prêté : ${l.text.replace(/^manque /, '')}.`,
    'Merci de nous le rapporter (ou de nous contacter) au plus vite.',
    '',
    'Bonne journée,',
    'CF Réseaux',
  ].join('\n');
  return `mailto:${encodeURIComponent(l.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
