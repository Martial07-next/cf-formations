import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { BillingList, type BillingRow } from '@/components/billing/billing-list';
import { INVOICE_SELECT, companiesSummary, euros, type Invoice } from '@/lib/billing';
import { formatSessionPeriod } from '@/lib/week';

export const metadata = { title: 'Facturation · CF Réseaux' };

const TABS = [
  { key: 'a-facturer', label: 'À facturer' },
  { key: 'a-venir', label: 'En cours / à venir' },
  { key: 'facturees', label: 'Facturées' },
] as const;

const one = (v: any) => (Array.isArray(v) ? v[0] : v);

/**
 * Suivi de la facturation : sessions terminées à facturer (les plus
 * anciennes en premier), sessions à venir, sessions facturées. Seul le
 * compte Facturation renseigne les factures ; l'administrateur consulte.
 */
export default async function FacturationPage({ searchParams }: { searchParams: Promise<{ vue?: string; q?: string; mois?: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile || (!profile.can_invoice && profile.role !== 'admin')) redirect('/');
  const { vue, q, mois } = await searchParams;
  const tab = TABS.some((t) => t.key === vue) ? (vue as string) : 'a-facturer';
  const supabase = await createClient();
  const now = new Date().toISOString();
  const monthStart = `${now.slice(0, 7)}-01`;
  const late = new Date(Date.now() - 30 * 86400000).toISOString();

  let query = supabase
    .from('sessions')
    .select('id, title, start_at, end_at, status, billing_done, billing_done_at, billing_done_by, billing_note, trainers(full_name), session_trainees(status, trainees(company))')
    .limit(400);
  if (tab === 'a-facturer') query = query.eq('billing_done', false).lt('end_at', now).neq('status', 'brouillon').order('end_at', { ascending: true });
  else if (tab === 'a-venir') query = query.eq('billing_done', false).gte('end_at', now).order('start_at', { ascending: true });
  else {
    query = query.eq('billing_done', true).order('billing_done_at', { ascending: false });
    if (mois && /^\d{4}-\d{2}$/.test(mois)) {
      const [y, m] = mois.split('-').map(Number);
      const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
      query = query.gte('billing_done_at', `${mois}-01`).lt('billing_done_at', next);
    }
  }
  if (q?.trim()) query = query.ilike('title', `%${q.trim().replace(/[%,()]/g, ' ')}%`);
  const { data: sessions, error } = await query;

  const ids = ((sessions as any[]) || []).map((s) => s.id);
  const [{ data: invoices }, { data: staff }, toBill, lateCount, billedMonth, { data: monthInvoices }] = await Promise.all([
    ids.length ? supabase.from('session_invoices').select(INVOICE_SELECT).in('session_id', ids).order('created_at') : Promise.resolve({ data: [] as any[] }),
    supabase.from('profiles').select('id, full_name'),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('billing_done', false).lt('end_at', now).neq('status', 'brouillon'),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('billing_done', false).lt('end_at', late).neq('status', 'brouillon'),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('billing_done', true).gte('billing_done_at', monthStart),
    supabase.from('session_invoices').select('amount').gte('created_at', monthStart),
  ]);
  const monthTotal = ((monthInvoices as any[]) || []).reduce((n, i) => n + (Number(i.amount) || 0), 0);

  const rows: BillingRow[] = ((sessions as any[]) || []).map((s) => {
    const validated = ((s.session_trainees as any[]) || []).filter((t) => t.status === 'validee');
    return {
      id: s.id,
      title: s.title,
      period: formatSessionPeriod(s.start_at, s.end_at),
      endAt: s.end_at,
      trainer: one(s.trainers)?.full_name || null,
      validated: validated.length,
      companies: companiesSummary(validated.map((t) => one(t.trainees)?.company)),
      state: { done: s.billing_done, doneAt: s.billing_done_at, doneBy: s.billing_done_by, note: s.billing_note },
      doneByName: ((staff as any[]) || []).find((p) => p.id === s.billing_done_by)?.full_name || null,
      invoices: ((invoices as Invoice[]) || []).filter((i) => i.session_id === s.id),
    };
  });

  return (
    <main>
      <Sidebar active="/facturation" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Suivi</p>
            <h1>Facturation</h1>
            <p>
              {profile.can_invoice
                ? 'Nomme les factures de chaque session puis coche « Facturation faite » : le dossier passe alors en « Dossier complet » sur le planning.'
                : 'Consultation : seul le compte Facturation renseigne les factures.'}
            </p>
          </div>
        </header>

        {error ? (
          <div role="alert" className="alert alert-warning">Exécute la migration 30 (supabase/migration_phase30.sql) dans Supabase pour activer la facturation.</div>
        ) : (
          <>
            <div className="stats">
              <div className="stat"><span>À facturer</span><strong>{toBill.count ?? 0}</strong><small>sessions terminées</small></div>
              <div className="stat"><span>En retard</span><strong style={{ color: (lateCount.count ?? 0) ? 'var(--cf-red-ink)' : undefined }}>{lateCount.count ?? 0}</strong><small>terminées depuis + de 30 jours</small></div>
              <div className="stat"><span>Facturées ce mois</span><strong>{billedMonth.count ?? 0}</strong><small>sessions</small></div>
              <div className="stat"><span>Montant ce mois</span><strong>{euros(monthTotal) || '0 €'}</strong><small>factures saisies</small></div>
            </div>

            <div className="toolbar">
              <nav className="billing-tabs" aria-label="Vues">
                {TABS.map((t) => (
                  <Link key={t.key} href={`/facturation?vue=${t.key}`} className={t.key === tab ? 'active' : ''}>{t.label}</Link>
                ))}
              </nav>
              <span className="spacer" />
              <form className="row-actions">
                <input type="hidden" name="vue" value={tab} />
                {tab === 'facturees' && <input type="month" name="mois" defaultValue={mois || ''} aria-label="Mois de facturation" className="input" />}
                <input name="q" defaultValue={q || ''} placeholder="Rechercher une session…" aria-label="Rechercher une session" className="input" />
                <button type="submit" className="small">Filtrer</button>
              </form>
            </div>

            <BillingList rows={rows} canBill={profile.can_invoice} tab={tab} />
          </>
        )}
      </section>
    </main>
  );
}
