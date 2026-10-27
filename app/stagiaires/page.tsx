import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Download, Search } from 'lucide-react';
import { Pagination } from '@/components/pagination';
import { nameFields } from '@/lib/trainee-name';
import { searchTrainees } from '@/lib/trainee-search';
import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { CrudTable } from '@/components/crud-table';
import { createTrainee, deleteTrainee, updateTrainee } from './actions';
import { QuickImportPanel } from '@/components/quick-import-panel';
import { PasteImport } from '@/components/paste-import';
import { BackLink } from '@/components/back-link';

// Les imports de gros fichiers (plusieurs milliers de lignes) passent par les actions de cette page.
export const maxDuration = 60;

const PAGE_SIZE = 50;

/** Nettoie un texte de recherche pour un filtre PostgREST `or(...)`. */
function cleanQuery(q: string) {
  return q.replace(/[,()*"\\%_]/g, ' ').trim().slice(0, 80);
}

export default async function StagiairesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; entreprise?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = cleanQuery(sp.q || '');
  const company = (sp.entreprise || '').trim();
  const page = Math.max(1, Number.parseInt(sp.page || '1', 10) || 1);

  const supabase = await createClient();
  const profile = await getCurrentProfile();
  // Réservé à l'équipe (administrateur, bureau) : un formateur n'a pas accès à cette page.
  if (!canManage(profile?.role)) redirect('/');

  const SELECT = 'id, full_name, first_name, last_name, email, company, session_trainees(status, sessions(id, title, start_at, end_at))';
  const withCompany = <Q extends { is: any; eq: any }>(query: Q): Q =>
    company === '__none' ? query.is('company', null) : company ? query.eq('company', company) : query;

  // Recherche : classée par pertinence (sans accents, nom / prénom dans n'importe quel ordre).
  const load = async (): Promise<{ data: any[]; count: number }> => {
    if (!q) {
      const { data, count } = await withCompany(
        supabase
          .from('trainees')
          .select(SELECT, { count: 'exact' })
          .order('last_name', { ascending: true, nullsFirst: false })
          .order('full_name', { ascending: true })
          .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
      );
      return { data: (data as any[]) || [], count: count ?? 0 };
    }
    const all: any[] = [];
    for (let from = 0; from < 50000; from += 1000) {
      const { data } = await withCompany(supabase.from('trainees').select('id, full_name, first_name, last_name, email, company').order('id').range(from, from + 999));
      if (!data?.length) break;
      all.push(...data);
      if (data.length < 1000) break;
    }
    const ranked = searchTrainees(all, q);
    const ids = ranked.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((t) => t.id);
    if (!ids.length) return { data: [], count: ranked.length };
    const { data } = await supabase.from('trainees').select(SELECT).in('id', ids);
    const byId = new Map(((data as any[]) || []).map((t) => [t.id, t]));
    return { data: ids.map((id) => byId.get(id)).filter(Boolean), count: ranked.length };
  };

  const [{ data: trainees, count }, { data: companyRows }] = await Promise.all([
    load(),
    supabase.from('trainees').select('company').not('company', 'is', null).order('company').limit(5000),
  ]);
  const companies = [...new Set((companyRows || []).map((r: any) => (r.company as string).trim()).filter(Boolean))];
  const total = count ?? 0;

  // Important : on pré-calcule ici le contenu affiché (un élément React, pas
  // une fonction) car un Server Component ne peut pas passer de fonction à un
  // Client Component (CrudTable) : seuls des éléments/données sérialisables le peuvent.
  const now = new Date().toISOString();
  const rows = (trainees || []).map((t: any) => {
    const n = nameFields(t);
    const links = (t.session_trainees || []).filter((l: any) => l.sessions);
    const done = links.filter((l: any) => l.status === 'validee' && l.sessions.end_at < now).length;
    const next = links
      .filter((l: any) => l.sessions.end_at >= now)
      .sort((a: any, b: any) => a.sessions.start_at.localeCompare(b.sessions.start_at))[0];
    return {
      ...t,
      ...n,
      name_cell: <Link href={`/stagiaires/${t.id}`}>{n.last_name}</Link>,
      first_cell: n.first_name || <span className="hint">-</span>,
      done_cell: done,
      next_cell: next ? (
        <Link href={`/sessions/${next.sessions.id}`} style={{ fontWeight: 600 }}>
          {next.sessions.title}{' '}
          <span className={`badge ${next.status}`}>{next.status === 'validee' ? 'validé' : 'en attente'}</span>
        </Link>
      ) : (
        <span className="hint">-</span>
      ),
    };
  });

  return (
    <main>
      <section className="content">
        <header>
          <div>
            <BackLink />
            <p className="eyebrow">Ressources</p>
            <h1>Stagiaires</h1>
            <p>L’annuaire des stagiaires : clique sur un nom pour voir son historique de formations.</p>
          </div>
          {canManage(profile?.role) && (
            <div className="header-actions">
              <a href="/stagiaires/export" className="btn"><Download size={15} aria-hidden /> Export CSV</a>
            </div>
          )}
        </header>
        {canManage(profile?.role) && <PasteImport />}
        {canManage(profile?.role) && <QuickImportPanel digiformaEnabled={Boolean(process.env.DIGIFORMA_API_TOKEN)} />}

        <form className="list-filters" method="get" role="search">
          <label className="search">
            <Search size={15} aria-hidden />
            <span className="sr-only">Rechercher</span>
            <input name="q" defaultValue={sp.q || ''} placeholder="Nom, prénom, e-mail, entreprise…" />
          </label>
          <select name="entreprise" defaultValue={company} aria-label="Filtrer par entreprise">
            <option value="">Toutes les entreprises</option>
            <option value="__none">Sans entreprise</option>
            {companies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button type="submit" className="small primary">Filtrer</button>
          {(q || company) && <Link href="/stagiaires" className="btn small ghost">Effacer</Link>}
        </form>

        <Pagination basePath="/stagiaires" params={{ q: sp.q, entreprise: company }} page={page} pageSize={PAGE_SIZE} total={total} />
        <CrudTable
          isAdmin={canManage(profile?.role)}
          title="un stagiaire"
          columns={[
            { key: 'name_cell', label: 'Nom' },
            { key: 'first_cell', label: 'Prénom' },
            { key: 'company', label: 'Entreprise' },
            { key: 'email', label: 'E-mail' },
            { key: 'done_cell', label: 'Formations suivies' },
            { key: 'next_cell', label: 'Prochaine formation' },
          ]}
          fields={[
            { name: 'last_name', label: 'Nom', required: true },
            { name: 'first_name', label: 'Prénom' },
            { name: 'email', label: 'E-mail', type: 'email' },
            { name: 'company', label: 'Entreprise' },
          ]}
          rows={rows}
          onCreate={createTrainee}
          onDelete={deleteTrainee}
          onUpdate={updateTrainee}
          emptyLabel={q || company ? 'Aucun stagiaire ne correspond à ces filtres.' : 'Aucun stagiaire enregistré.'}
        />
        {total > PAGE_SIZE && (
          <Pagination basePath="/stagiaires" params={{ q: sp.q, entreprise: company }} page={page} pageSize={PAGE_SIZE} total={total} />
        )}
      </section>
    </main>
  );
}
