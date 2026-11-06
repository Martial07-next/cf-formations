'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Settings, X } from 'lucide-react';
import { TemplateFields } from '@/components/template-catalog';
import { updateTemplate } from '@/app/modeles/actions';
import { ensureSessionSettings } from '@/app/sessions/[id]/settings-actions';
import { submitWith } from '@/lib/form-submit';

/**
 * Roue crantée de la fiche session : paramétrer la session comme une
 * formation du catalogue (durée, modules, documents, objectifs, fiche
 * d'appréciation, habilitation, recyclage, autorisations, supports…),
 * sans toucher au catalogue.
 */
export function SessionSettingsButton({
  sessionId,
  personalised,
  trainers,
}: {
  sessionId: string;
  /** La session a déjà ses paramètres propres. */
  personalised: boolean;
  trainers: { id: string; full_name: string; color: string | null }[];
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [template, setTemplate] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();

  async function open() {
    setLoading(true);
    setError(null);
    const r = await ensureSessionSettings(sessionId);
    setLoading(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setTemplate(r.template);
    ref.current?.showModal();
  }

  return (
    <>
      <button
        type="button"
        className="small session-gear"
        onClick={open}
        disabled={loading}
        title={personalised ? 'Paramètres propres à cette session' : 'Paramétrer cette session comme une formation du catalogue'}
      >
        {loading ? <Loader2 size={14} className="spin" aria-hidden /> : <Settings size={14} aria-hidden />} {personalised ? 'Paramètres de la session' : 'Paramétrer'}
      </button>
      {error && <span role="alert" className="field-error">{error}</span>}
      <dialog ref={ref} className="modal tpl-modal" aria-label="Paramètres de la session" onClose={() => setTemplate(null)}>
        {template && (
          <form
            key={template.id}
            className="tpl-form"
            onSubmit={submitWith((fd) =>
              start(async () => {
                const r = await updateTemplate(template.id, fd);
                if (!r.ok) setError((r as any).error || 'Enregistrement impossible.');
                else {
                  setError(null);
                  ref.current?.close();
                  router.refresh();
                }
              })
            )}
          >
            <div className="modal-head">
              <div>
                <h2>Paramètres de la session</h2>
                <small className="hint">Comme une formation du catalogue, mais pour cette session uniquement : le catalogue n’est pas modifié.</small>
              </div>
              <button type="button" className="icon ghost" onClick={() => ref.current?.close()} aria-label="Fermer"><X size={18} /></button>
            </div>
            <div className="modal-body">
              {error && <div role="alert" className="alert alert-error">{error}</div>}
              <TemplateFields t={template} folders={[]} trainers={trainers} />
            </div>
            <div className="modal-foot">
              <button type="button" onClick={() => ref.current?.close()}>Annuler</button>
              <button type="submit" className="primary" disabled={pending}>{pending ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
