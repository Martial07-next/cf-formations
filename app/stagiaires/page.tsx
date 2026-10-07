import Link from 'next/link';
import { Download } from 'lucide-react';
import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { CrudTable } from '@/components/crud-table';
import { createTrainee, deleteTrainee, updateTrainee } from './actions';
import { QuickImportPanel } from '@/components/quick-import-panel';

export default async function StagiairesPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const { data: trainees } = await supabase
    .from('trainees')
    .select('id, full_name, email, company, session_trainees(status, sessions(id, title, start_at, end_at))')
    .order('full_name');

  // Important : on pré-calcule ici le contenu affiché (un élément React, pas
  // une fonction) car un Server Component ne peut pas passer de fonction à un
  // Client Component (CrudTable) — seuls des éléments/données sérialisables le peuvent.
  const now = new Date().toISOString();
  const rows = (trainees || []).map((t: any) => {
    const links = (t.session_trainees || []).filter((l: any) => l.sessions);
    const done = links.filter((l: any) => l.status === 'validee' && l.sessions.end_at < now).length;
    const next = links
      .filter((l: any) => l.sessions.end_at >= now)
      .sort((a: any, b: any) => a.sessions.start_at.localeCompare(b.sessions.start_at))[0];
    return {
      ...t,
      name_cell: <Link href={`/stagiaires/${t.id}`}>{t.full_name}</Link>,
      done_cell: done,
      next_cell: next ? (
        <Link href={`/sessions/${next.sessions.id}`} style={{ fontWeight: 600 }}>
          {next.sessions.title}{' '}
          <span className={`badge ${next.status}`}>{next.status === 'validee' ? 'validé' : 'en attente'}</span>
        </Link>
      ) : (
        <span className="hint">—</span>
      ),
    };
  });

  return (
    <main>
      <Sidebar active="/stagiaires" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Ressources</p>
            <h1>Stagiaires</h1>
            <p>L’annuaire des stagiaires — clique sur un nom pour voir son historique de formations.</p>
          </div>
          {canManage(profile?.role) && (
            <div className="header-actions">
              <a href="/stagiaires/export" className="btn"><Download size={15} aria-hidden /> Export CSV</a>
            </div>
          )}
        </header>
        {canManage(profile?.role) && <QuickImportPanel />}
        <CrudTable
          isAdmin={canManage(profile?.role)}
          title="un stagiaire"
          columns={[
            { key: 'name_cell', label: 'Nom' },
            { key: 'company', label: 'Entreprise' },
            { key: 'email', label: 'E-mail' },
            { key: 'done_cell', label: 'Formations suivies' },
            { key: 'next_cell', label: 'Prochaine formation' },
          ]}
          fields={[
            { name: 'full_name', label: 'Nom complet', required: true },
            { name: 'email', label: 'E-mail', type: 'email' },
            { name: 'company', label: 'Entreprise' },
          ]}
          rows={rows}
          onCreate={createTrainee}
          onDelete={deleteTrainee}
          onUpdate={updateTrainee}
          emptyLabel="Aucun stagiaire enregistré."
          searchKeys={['full_name', 'email', 'company']}
        />
      </section>
    </main>
  );
}
