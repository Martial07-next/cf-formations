import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/supabase/server';
import { listFeedback } from '@/app/ameliorations/actions';
import { FeedbackBoard } from '@/components/dev/feedback-board';

export default async function AmeliorationsPage() {
  const profile = await getCurrentProfile();
  if (!profile || !(profile.role === 'admin' || profile.can_dev)) redirect('/');
  const res = await listFeedback();
  return (
    <main>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Dev</p>
            <h1>Améliorations</h1>
            <p>
              Bugs, améliorations et suggestions épinglés sur les pages du site. Ajoute une remarque avec le bouton
              « Ajouter une remarque » en bas à droite, puis clique à l’endroit concerné.
            </p>
          </div>
        </header>
        {res.ok ? (
          <FeedbackBoard items={res.items} isAdmin={profile.role === 'admin'} meId={profile.id} />
        ) : (
          <div role="alert" className="alert alert-error">{res.error}</div>
        )}
      </section>
    </main>
  );
}
