import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { loadTodoItems } from '@/lib/todo-items';
import { TodoBoard } from '@/components/todo-board';

export const metadata = { title: 'À faire · CF Réseaux' };

/**
 * « À faire » du bureau : une seule liste, triée par urgence, avec l'action
 * sur chaque ligne (lien Digiforma, relances, clôture, facturation…).
 */
export default async function AFairePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!canManage(profile.role)) redirect(profile.can_invoice ? '/facturation' : '/tableau-de-bord');
  const canBill = Boolean(profile.can_invoice) || profile.role === 'admin';
  const supabase = await createClient();
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') || 'https'}://${h.get('host') || 'cf-formations.vercel.app'}`;
  const items = await loadTodoItems(supabase as any, profile, origin);

  return (
    <main>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Bureau</p>
            <h1>À faire</h1>
            <p className="hint">Tout ce qui attend l’équipe, du plus urgent au moins urgent. Chaque ligne disparaît dès qu’elle est réglée.</p>
          </div>
        </header>
        <TodoBoard items={items} canBill={canBill} />
      </section>
    </main>
  );
}
