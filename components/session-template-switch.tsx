'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Pencil } from 'lucide-react';
import { TemplatePicker } from '@/components/template-picker';
import { setSessionTemplate } from '@/app/sessions/[id]/actions';
import { formatHours } from '@/lib/week';

type T = { id: string; title: string; category: string | null; duration_hours: number };

/**
 * Formation du catalogue de la session, modifiable (recherche dans le
 * catalogue) : utile après un import Digiforma mal reconnu.
 */
export function SessionTemplateSwitch({ sessionId, catalog, currentId, sessionTitle }: { sessionId: string; catalog: T[]; currentId: string | null; sessionTitle: string }) {
  const router = useRouter();
  const current = catalog.find((t) => t.id === currentId) || null;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentId || '');
  const [rename, setRename] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <span className="tpl-switch">
        <BookOpen size={14} aria-hidden />
        {current ? (
          <span className="hint">
            Catalogue : {current.category ? `${current.category} › ` : ''}
            {current.title} · {formatHours(Number(current.duration_hours))}
          </span>
        ) : (
          <span className="hint">Aucune formation du catalogue</span>
        )}
        <button type="button" className="small ghost" onClick={() => setEditing(true)}>
          <Pencil size={13} aria-hidden /> {current ? 'Changer' : 'Choisir'}
        </button>
      </span>
    );
  }
  const chosen = catalog.find((t) => t.id === value) || null;
  return (
    <div className="tpl-switch editing">
      <span style={{ fontWeight: 700, fontSize: 13 }}>Formation du catalogue</span>
      <TemplatePicker templates={catalog} value={value} onChange={setValue} />
      {chosen && chosen.title !== sessionTitle && (
        <label className="check-line">
          <input type="checkbox" checked={rename} onChange={(e) => setRename(e.target.checked)} /> Renommer la session « {chosen.title} »
        </label>
      )}
      {error && <span role="alert" className="field-error">{error}</span>}
      <span className="row-actions">
        <button
          type="button"
          className="small primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setSessionTemplate(sessionId, value || null, rename);
              if (!r.ok) setError(r.error);
              else {
                setEditing(false);
                router.refresh();
              }
            })
          }
        >
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button type="button" className="small ghost" onClick={() => { setEditing(false); setValue(currentId || ''); setError(null); }}>Annuler</button>
      </span>
    </div>
  );
}
