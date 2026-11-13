'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { refreshSessionFromDigiforma } from '@/app/digiforma/actions';

/** « Mettre à jour depuis Digiforma » : stagiaires relus tout de suite (clients particuliers compris). */
export function DigiformaRefresh({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="df-refresh">
      <button
        type="button"
        className="small"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await refreshSessionFromDigiforma(sessionId);
            if (!r.ok) return setMsg({ text: r.error, error: true });
            setMsg({
              text:
                `${r.found} stagiaire${r.found > 1 ? 's' : ''} sur Digiforma` +
                (r.particuliers ? ` (dont ${r.particuliers} client${r.particuliers > 1 ? 's' : ''} particulier${r.particuliers > 1 ? 's' : ''})` : '') +
                ` · ${r.added ? `${r.added} ajouté${r.added > 1 ? 's' : ''}` : 'tous déjà présents'}` +
                (r.waiting ? ` · ${r.waiting} en attente (inscription indécise sur Digiforma)` : ''),
              error: false,
            });
            router.refresh();
          })
        }
        title="Relire tout de suite les stagiaires de la session Digiforma"
      >
        {pending ? <Loader2 size={14} className="spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />} Mettre à jour depuis Digiforma
      </button>
      {msg && <small role="status" className={msg.error ? 'field-error' : 'hint'}>{msg.text}</small>}
    </span>
  );
}
