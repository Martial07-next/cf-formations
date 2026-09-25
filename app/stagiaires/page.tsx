import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { CrudTable } from '@/components/crud-table';
import { createTrainee, deleteTrainee } from './actions';

export default async function StagiairesPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const { data: trainees } = await supabase
    .from('trainees')
    .select('id, full_name, email, company, session_trainees(status, sessions(id, title, start_at))')
    .order('full_name');

  const rows = (trainees || []).map((t: any) => ({
    ...t,
    sessionLinks: (t.session_trainees || [])
      .map((l: any) => (l.sessions ? { ...l.sessions, status: l.status } : null))
      .filter(Boolean),
  }));

  return (
    <main>
      <Sidebar active="/stagiaires" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Organisation des formations</p>
            <h1>Stagiaires</h1>
            <p>L'annuaire des stagiaires inscrits aux formations.</p>
          </div>
        </header>
        <CrudTable
          isAdmin={profile?.role === 'admin'}
          title="un stagiaire"
          columns={[
            { key: 'full_name', label: 'Nom' },
            { key: 'email', label: 'E-mail' },
            { key: 'company', label: 'Entreprise' },
            {
              key: 'sessions',
              label: 'Sessions',
              render: (row) =>
                row.sessionLinks.length === 0 ? (
                  <span style={{ color: 'var(--muted)' }}>Aucune</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {row.sessionLinks.map((s: any) => (
                      <a key={s.id} href={`/sessions/${s.id}`} style={{ fontSize: 12.5 }}>
                        {s.title} <span className={`badge ${s.status}`} style={{ marginLeft: 4 }}>
                          {s.status === 'validee' ? 'validé' : 'en attente'}
                        </span>
                      </a>
                    ))}
                  </div>
                ),
            },
          ]}
          fields={[
            { name: 'full_name', label: 'Nom complet', required: true },
            { name: 'email', label: 'E-mail', type: 'email' },
            { name: 'company', label: 'Entreprise' },
          ]}
          rows={rows}
          onCreate={createTrainee}
          onDelete={deleteTrainee}
          emptyLabel="Aucun stagiaire enregistré."
        />
      </section>
    </main>
  );
}
