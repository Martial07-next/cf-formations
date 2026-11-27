import { redirect } from 'next/navigation';
import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { TraceRegister, type RegisterImage, type RegisterLoan } from '@/components/trace-register';
import { loanStatus, missingOf, type ClothingLoan } from '@/lib/vetements';
import type { TraceRow } from '@/lib/trace';

export const metadata = { title: 'Traçabilité · CF Réseaux' };

const one = (v: any) => (Array.isArray(v) ? v[0] : v);

/**
 * Registre de traçabilité : prêts (vêtements TST, baudriers), droits à
 * l'image (stagiaires et salariés) et journal de toutes les actions (qui,
 * quand, comment). Réservé à l'équipe (administrateur, bureau).
 */
export default async function TracabilitePage() {
  const profile = await getCurrentProfile();
  if (!profile || !canManage(profile.role)) redirect('/');
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [loansRes, imagesRes, empRes, traceRes, staffRes] = await Promise.all([
    supabase.from('clothing_loans').select('*, trainees(full_name, company), sessions(title, start_at, end_at)').order('created_at', { ascending: false }).limit(3000),
    supabase
      .from('trainee_authorizations')
      .select('id, trainee_id, accepted, signed_at, city, session_id, collected_by, data, trainees(full_name, company), sessions(title, start_at)')
      .eq('kind', 'image')
      .order('signed_at', { ascending: false })
      .limit(5000),
    supabase.from('employee_documents').select('id, employee_id, accepted, signed_at, city, employees(full_name, job)').eq('kind', 'image').not('signed_at', 'is', null).order('signed_at', { ascending: false }),
    supabase.from('trace_log').select('*').order('created_at', { ascending: false }).limit(1500),
    supabase.from('profiles').select('id, full_name'),
  ]);
  const staff = new Map(((staffRes.data as any[]) || []).map((p) => [p.id, p.full_name as string]));

  const loans: RegisterLoan[] = ((loansRes.data as any[]) || []).map((l) => {
    const loan = l as ClothingLoan & Record<string, any>;
    const m = missingOf(loan);
    const s = one(l.sessions);
    const status = loanStatus(loan);
    const out = m.vestes + m.pantalons + m.baudriers;
    return {
      id: l.id,
      traineeId: l.trainee_id,
      trainee: one(l.trainees)?.full_name || '—',
      company: one(l.trainees)?.company || null,
      sessionId: l.session_id,
      session: s?.title || null,
      sessionEnd: s?.end_at?.slice(0, 10) || null,
      createdAt: l.created_at,
      lentBy: l.lent_by ? staff.get(l.lent_by) || null : null,
      vestes: l.vestes,
      pantalons: l.pantalons,
      baudriers: l.baudriers || 0,
      signedAt: l.signed_at,
      city: l.city,
      returnedAt: l.returned_at,
      returnedBy: l.returned_by ? staff.get(l.returned_by) || null : null,
      returned: { vestes: l.returned_vestes ?? 0, pantalons: l.returned_pantalons ?? 0, baudriers: l.returned_baudriers ?? 0 },
      missing: m,
      note: l.return_note,
      status,
      late: out > 0 && status !== 'restitue' && Boolean(s?.end_at) && s.end_at.slice(0, 10) < today,
    };
  });

  // Droit à l'image : la dernière signature de chaque stagiaire fait foi ; les précédentes restent dans l'historique.
  const seen = new Set<string>();
  const images: RegisterImage[] = [];
  for (const a of (imagesRes.data as any[]) || []) {
    const previous = seen.has(a.trainee_id);
    seen.add(a.trainee_id);
    images.push({
      id: a.id,
      who: 'stagiaire',
      personId: a.trainee_id,
      name: one(a.trainees)?.full_name || '—',
      company: one(a.trainees)?.company || null,
      accepted: a.accepted,
      revokedAt: a.data?.revoked_at || null,
      revokedBy: a.data?.revoked_by || null,
      revokedNote: a.data?.revoked_note || null,
      signedAt: a.signed_at,
      city: a.city,
      session: one(a.sessions)?.title || null,
      collectedBy: a.collected_by ? staff.get(a.collected_by) || null : null,
      superseded: previous,
    });
  }
  const seenEmp = new Set<string>();
  for (const d of (empRes.data as any[]) || []) {
    const previous = seenEmp.has(d.employee_id);
    seenEmp.add(d.employee_id);
    images.push({
      id: d.id,
      who: 'salarie',
      personId: d.employee_id,
      name: one(d.employees)?.full_name || '—',
      company: one(d.employees)?.job || 'Salarié CF Réseaux',
      accepted: d.accepted,
      revokedAt: null,
      revokedBy: null,
      revokedNote: null,
      signedAt: d.signed_at,
      city: d.city,
      session: null,
      collectedBy: null,
      superseded: previous,
    });
  }

  return (
    <main>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Suivi</p>
            <h1>Traçabilité</h1>
            <p className="hint">Prêts de vêtements et de baudriers, droits à l’image et journal de chaque action : qui, quand, comment (tablette, QR code, lien), appareil et empreinte de la signature.</p>
          </div>
        </header>
        <TraceRegister
          loans={loans}
          images={images}
          journal={traceRes.error ? null : ((traceRes.data as TraceRow[]) || [])}
          loansError={Boolean(loansRes.error)}
        />
      </section>
    </main>
  );
}
