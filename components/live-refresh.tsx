'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** Tables suivies : un changement (par moi ou un collègue) actualise la page ouverte. */
const TABLES = [
  'sessions', 'session_trainees', 'session_days', 'session_modules', 'session_trainee_modules',
  'session_day_trainers', 'session_reservations', 'planning_events', 'clothing_loans', 'trainees',
  'session_invoices', 'trainer_absences',
];

/**
 * Actualisation automatique (plus besoin de F5) :
 * - en direct : un changement dans la base (migration 76) actualise la page en quelques secondes ;
 * - en revenant sur l'onglet après plus d'une minute, la page est relue.
 * Jamais pendant une saisie : si un champ est en cours d'édition ou une fenêtre
 * ouverte, l'actualisation attend la fin (rien de ce qui est tapé n'est perdu).
 */
export function LiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const sb = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;
    let last = Date.now();
    const busy = () => {
      const a = document.activeElement as HTMLElement | null;
      const typing = Boolean(a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable));
      return document.hidden || typing || Boolean(document.querySelector('dialog[open]'));
    };
    const flush = () => {
      timer = null;
      if (busy()) {
        pending = true;
        return;
      }
      pending = false;
      last = Date.now();
      router.refresh();
    };
    // Plusieurs changements d'affilée : une seule actualisation (au plus toutes les 3 s).
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, Math.max(700, 3000 - (Date.now() - last)));
    };
    const ch = sb.channel('live-refresh');
    for (const table of TABLES) ch.on('postgres_changes' as any, { event: '*', schema: 'public', table }, schedule);
    ch.subscribe();
    // Retour sur l'onglet : actualisation en attente, ou page relue si elle date de plus d'une minute.
    const onWake = () => {
      if (document.hidden) return;
      if (pending || Date.now() - last > 60_000) schedule();
    };
    // Fin de saisie / fenêtre fermée : l'actualisation en attente part.
    const onFree = () => {
      if (pending) setTimeout(() => pending && schedule(), 300);
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    document.addEventListener('focusout', onFree);
    document.addEventListener('close', onFree, true);
    return () => {
      if (timer) clearTimeout(timer);
      sb.removeChannel(ch);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('focusout', onFree);
      document.removeEventListener('close', onFree, true);
    };
  }, [router]);
  return null;
}
