import { billingStep, type DossierBadge } from '@/lib/billing';
import { computeDossierTodo, type DossierTodo } from '@/lib/dossier-todo';

/**
 * Pastille « dossier » d'une session (planning, page Sessions) :
 *  · équipe : lien Digiforma, puis documents du formateur, du bureau, puis facturation ;
 *  · formateur : seulement ses sessions, ce qui lui reste à remplir puis « rempli ».
 * « Dossier complet » seulement une fois la facturation faite.
 */
export function dossierBadges(input: {
  sessions: any[];
  todo: DossierTodo;
  billRows: any[] | null;
  billError?: unknown;
  invRows: any[] | null;
  dfRows: any[] | null;
  dfError?: unknown;
  staffView: boolean;
  trainerId: string | null;
  nowKey: string;
}): Record<string, DossierBadge> {
  const { dossierComplete, trainerDone, todo } = input.todo;
  const out: Record<string, DossierBadge> = {};
  const noDigiforma = new Set(input.dfError ? [] : (input.dfRows || []).filter((r) => !String(r.digiforma_docs_url || '').trim()).map((r) => r.id as string));
  const billed = new Map<string, boolean>((input.billRows || []).map((r) => [r.id, Boolean(r.billing_done)]));
  const invCount: Record<string, number> = {};
  for (const r of input.invRows || []) invCount[r.session_id] = (invCount[r.session_id] || 0) + 1;
  for (const s of input.sessions) {
    const complete = Boolean(dossierComplete[s.id]);
    const done = input.billError ? true : billed.get(s.id) ?? true;
    const ended = s.end_at.slice(0, 16) <= input.nowKey;
    const left = todo[s.id];
    if (complete && done) out[s.id] = { kind: 'complet' };
    else if (!input.staffView) {
      // Formateur : seulement ses propres sessions (les autres dossiers ne lui sont pas lisibles).
      if (!input.trainerId || s.trainer_id !== input.trainerId) continue;
      if (trainerDone[s.id]) out[s.id] = { kind: 'formateur' };
      else if (left?.trainer) out[s.id] = { kind: 'a-remplir', n: left.trainer };
    } else if (s.status !== 'brouillon' && noDigiforma.has(s.id)) {
      // Équipe : d'abord le lien Digiforma, pour que la session soit 100 % dématérialisée.
      out[s.id] = { kind: 'digiforma' };
    } else if (s.status !== 'brouillon' && left) {
      // Équipe : formateur, puis bureau, puis facturation.
      if (left.trainer) out[s.id] = { kind: 'attente-formateur', n: left.trainer };
      else if (left.office) out[s.id] = { kind: 'bureau', n: left.office };
      else if (!input.billError && !done) {
        const step = billingStep(invCount[s.id] || 0, complete, ended);
        if (step) out[s.id] = { kind: step };
      }
    }
  }
  return out;
}

/** Charge tout ce qu'il faut pour les pastilles (page Sessions). */
export async function loadDossierBadges(
  supabase: any,
  sessions: any[],
  opts: { staffView: boolean; trainerId: string | null; nowKey: string }
): Promise<Record<string, DossierBadge>> {
  if (!sessions.length) return {};
  const ids = sessions.map((s) => s.id as string);
  const chunks = <T,>(f: (part: string[]) => Promise<{ data: T[] | null; error?: unknown }>) =>
    Promise.all(Array.from({ length: Math.ceil(ids.length / 200) }, (_, i) => f(ids.slice(i * 200, i * 200 + 200)))).then((r) => ({
      data: r.flatMap((x) => (x.data as T[]) || []),
      error: r.find((x) => x.error)?.error,
    }));
  const [days, mods, links, bill, inv, df] = await Promise.all([
    chunks((p) => supabase.from('session_days').select('session_id, day, start_time, end_time').in('session_id', p)),
    chunks((p) => supabase.from('session_modules').select('id, session_id, position, name, start_day, end_day').in('session_id', p)),
    chunks((p) => supabase.from('session_trainee_modules').select('session_id, trainee_id, module_id').in('session_id', p)),
    chunks((p) => supabase.from('sessions').select('id, billing_done').in('id', p)),
    chunks((p) => supabase.from('session_invoices').select('session_id').in('session_id', p)),
    chunks((p) => supabase.from('sessions').select('id, digiforma_docs_url').in('id', p)),
  ]);
  const todo = await computeDossierTodo(supabase, sessions, { dayRows: days.data, moduleRows: mods.data, linkRows: links.data });
  return dossierBadges({
    sessions,
    todo,
    billRows: bill.data,
    billError: bill.error,
    invRows: inv.data,
    dfRows: df.data,
    dfError: df.error,
    ...opts,
  });
}
