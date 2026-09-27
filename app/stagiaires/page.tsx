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
    .select('id, full_name, email, company, session_trainees(status)')
    .order('full_name');

<<<<<<< HEAD
  // Important : on pré-calcule ici le contenu affiché (un élément React, pas
  // une fonction) car un Server Component ne peut pas passer de fonction à un
  // Client Component (CrudTable) — seuls des éléments/données sérialisables le peuvent.
  const rows = (trainees || []).map((t: any) => {
    const sessionLinks = (t.session_trainees || [])
      .map((l: any) => (l.sessions ? { ...l.sessions, status: l.status } : null))
      .filter(Boolean);

    return {
      ...t,
      sessions:
        sessionLinks.length === 0 ? (
          <span style={{ color: 'var(--muted)' }}>Aucune</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {sessionLinks.map((s: any) => (
              <a key={s.id} href={`/sessions/${s.id}`} style={{ fontSize: 12.5 }}>
                {s.title}{' '}
                <span className={`badge ${s.status}`} style={{ marginLeft: 4 }}>
                  {s.status === 'validee' ? 'validé' : 'en attente'}
                </span>
              </a>
            ))}
          </div>
        ),
=======
  // Un lien vers une vraie fiche historique, plutôt qu'une liste de sessions
  // en vrac dans la cellule du tableau.
  const rows = (trainees || []).map((t: any) => {
    const count = (t.session_trainees || []).length;
    return {
      ...t,
      history: (
        <a href={`/stagiaires/${t.id}`} style={{ fontSize: 12.5, fontWeight: 700 }}>
          Voir l'historique {count > 0 && `(${count})`}
        </a>
      ),
>>>>>>> f9e561d (Mise à jour complète du projet)
    };
  });

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
        {canManage(profile?.role) && <QuickImportPanel />}
        <CrudTable
          isAdmin={canManage(profile?.role)}
          title="un stagiaire"
          columns={[
            { key: 'full_name', label: 'Nom' },
            { key: 'email', label: 'E-mail' },
            { key: 'company', label: 'Entreprise' },
<<<<<<< HEAD
            { key: 'sessions', label: 'Sessions' },
=======
            { key: 'history', label: 'Historique' },
>>>>>>> f9e561d (Mise à jour complète du projet)
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
        />
      </section>
    </main>
  );
}
