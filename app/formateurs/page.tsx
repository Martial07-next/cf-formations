import Link from 'next/link';
import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { CrudTable } from '@/components/crud-table';
import { DEFAULT_TRAINER_COLOR } from '@/lib/colors';
import { ROLE_LABELS, type Role } from '@/lib/roles';
import { missionText } from '@/lib/external';
import { createTrainer, deleteTrainer, updateTrainer, updateTrainerStatus } from './actions';

export default async function FormateursPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const [{ data: trainers }, { data: profiles }] = await Promise.all([
    supabase
      .from('trainers')
      .select('*')
      .order('full_name'),
    supabase.from('profiles').select('id, full_name, role').order('full_name'),
  ]);

  const byId = new Map((profiles || []).map((p: any) => [p.id, p]));
  const referents = (profiles || []).filter((p: any) => ['referent', 'bureau', 'admin'].includes(p.role));

  // Contenu affiché pré-calculé côté serveur (un Server Component ne peut pas
  // passer de fonction de rendu à un Client Component).
  const rows = (trainers || []).map((t: any) => ({
    ...t,
    color: t.color || DEFAULT_TRAINER_COLOR,
    referent_id: t.referent_id || '',
    is_external: t.is_external ? 'externe' : 'interne',
    mission_start: t.mission_start || '',
    mission_end: t.mission_end || '',
    type_cell: t.is_external ? (
      <span>
        <span className="badge externe">Externe</span>
        <span className="hint" style={{ display: 'block', fontSize: 12 }}>Intervient {missionText(t)}</span>
      </span>
    ) : (
      <span className="hint">Interne</span>
    ),
    profile_id: t.profile_id || '',
    name_cell: (
      <Link href={`/formateurs/${t.id}`} className="trainer-tag">
        <span className="swatch" style={{ background: t.color || DEFAULT_TRAINER_COLOR }} aria-hidden />
        {t.full_name}
      </Link>
    ),
    referent_cell: t.referent_id ? byId.get(t.referent_id)?.full_name ?? '-' : <span className="hint">Aucun</span>,
    account_cell: t.profile_id ? byId.get(t.profile_id)?.full_name ?? '-' : <span className="hint">Non lié</span>,
  }));

  return (
    <main>
      <Sidebar active="/formateurs" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Ressources</p>
            <h1>Formateurs</h1>
            <p>Chaque formateur a sa couleur sur le planning, un référent cadre et, s’il se connecte, un compte lié.</p>
          </div>
        </header>
        <CrudTable
          isAdmin={canManage(profile?.role)}
          title="un formateur"
          columns={[
            { key: 'name_cell', label: 'Formateur' },
            { key: 'type_cell', label: 'Type' },
            { key: 'specialty', label: 'Spécialité' },
            { key: 'email', label: 'E-mail' },
            { key: 'referent_cell', label: 'Référent' },
            { key: 'account_cell', label: 'Compte' },
          ]}
          fields={[
            { name: 'full_name', label: 'Nom complet', required: true },
            { name: 'email', label: 'E-mail', type: 'email' },
            { name: 'specialty', label: 'Spécialité' },
            {
              name: 'is_external',
              label: 'Type de formateur',
              type: 'select',
              options: [
                { value: 'interne', label: 'Interne (salarié)' },
                { value: 'externe', label: 'Externe (intervenant ponctuel)' },
              ],
            },
            { name: 'mission_start', label: 'Externe : intervient du', type: 'date' },
            { name: 'mission_end', label: 'Externe : jusqu’au', type: 'date' },
            { name: 'availability', label: 'Disponibilité', placeholder: 'Ex. lundi–jeudi' },
            { name: 'color', label: 'Couleur planning', type: 'color', editOnly: true },
            {
              name: 'referent_id',
              label: 'Référent cadre',
              type: 'select',
              options: [
                { value: '', label: 'Aucun' },
                ...referents.map((p: any) => ({ value: p.id, label: `${p.full_name} (${ROLE_LABELS[p.role as Role]})` })),
              ],
            },
            {
              name: 'profile_id',
              label: 'Compte utilisateur lié',
              type: 'select',
              options: [
                { value: '', label: 'Aucun' },
                ...(profiles || []).map((p: any) => ({ value: p.id, label: `${p.full_name} (${ROLE_LABELS[p.role as Role] ?? p.role})` })),
              ],
            },
            {
              name: 'status',
              label: 'Statut',
              type: 'select',
              createOnly: true,
              options: [
                { value: 'actif', label: 'Actif' },
                { value: 'inactif', label: 'Inactif' },
              ],
            },
          ]}
          rows={rows}
          onCreate={createTrainer}
          onDelete={deleteTrainer}
          onUpdate={updateTrainer}
          emptyLabel="Aucun formateur enregistré."
          searchKeys={['full_name', 'email', 'specialty']}
          statusField={{
            key: 'status',
            label: 'Statut',
            options: [
              { value: 'actif', label: 'Actif' },
              { value: 'inactif', label: 'Inactif' },
            ],
            onChange: updateTrainerStatus,
          }}
        />
        <p className="hint" style={{ marginTop: 12 }}>
          Une couleur distincte est attribuée automatiquement à chaque nouveau formateur ; elle reste modifiable via « Modifier ».
          Un formateur externe n’est proposé à la création d’une session que pendant sa période d’intervention (dates facultatives) :
          inutile de le passer en inactif entre deux missions.
        </p>
      </section>
    </main>
  );
}
