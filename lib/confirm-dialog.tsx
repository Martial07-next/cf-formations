'use client';

import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * Fenêtre de confirmation aux couleurs de CF Réseaux (remplace le confirm()
 * du navigateur) : bandeau sombre, éclair vert, titre Archivo Expanded.
 *
 *   if (!(await askConfirm('Supprimer la session ?'))) return;
 *
 * Bouton rouge pour les actions destructrices (supprimer, retirer, effacer,
 * annuler, détacher), vert sinon. Échap ou clic hors de la fenêtre = Annuler.
 */
export type ConfirmOptions = { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };

const DESTRUCTIVE = /^(Dernière confirmation\s*:\s*)?(supprimer|retirer|effacer|annuler|détacher)/i;

function defaults(message: string, o: ConfirmOptions) {
  const m = message.trim().match(DESTRUCTIVE);
  const verb = m?.[2] ? m[2][0].toUpperCase() + m[2].slice(1).toLowerCase() : null;
  const danger = o.danger ?? Boolean(m);
  return {
    danger,
    title: o.title ?? (danger ? 'Action à confirmer' : 'Confirmation'),
    confirmLabel: o.confirmLabel ?? (danger && verb ? (verb === 'Annuler' ? 'Oui, annuler' : verb) : 'Confirmer'),
    cancelLabel: o.cancelLabel ?? (verb === 'Annuler' ? 'Non' : 'Annuler'),
  };
}

function ConfirmBox({ message, options, onDone }: { message: string; options: ReturnType<typeof defaults>; onDone: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const answered = useRef(false);
  const finish = (ok: boolean) => {
    if (answered.current) return;
    answered.current = true;
    ref.current?.close();
    onDone(ok);
  };
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  // Question en gras, explication en dessous ; guillemets et « ? » insécables.
  const nb = (s: string) => s.replace(/« /g, '«\u00a0').replace(/ »/g, '\u00a0»').replace(/ \?/g, '\u00a0?');
  const parts = message.split('\n\n');
  const q = parts[0].indexOf(' ? ');
  const [first, ...rest] = (q > 0 ? [parts[0].slice(0, q + 2), parts[0].slice(q + 3), ...parts.slice(1)] : parts).map(nb);
  return (
    <dialog
      ref={ref}
      className="cf-confirm"
      aria-labelledby="cf-confirm-title"
      aria-describedby="cf-confirm-msg"
      onClose={() => finish(false)}
      onClick={(e) => {
        if (e.target === ref.current) finish(false);
      }}
    >
      <div className="cf-confirm-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/templates/eclair.png" alt="" aria-hidden width={18} height={19} />
        <span id="cf-confirm-title">{options.title}</span>
      </div>
      <div className="cf-confirm-body" id="cf-confirm-msg">
        <p className="cf-confirm-main">{first}</p>
        {rest.map((p, i) => <p key={i} className="cf-confirm-more">{p}</p>)}
      </div>
      <div className="cf-confirm-foot">
        <button type="button" onClick={() => finish(false)} autoFocus={options.danger}>
          {options.cancelLabel}
        </button>
        <button type="button" className={options.danger ? 'cf-confirm-danger' : 'primary'} onClick={() => finish(true)} autoFocus={!options.danger}>
          {options.confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

export function askConfirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(
      <ConfirmBox
        message={message}
        options={defaults(message, options)}
        onDone={(ok) => {
          resolve(ok);
          // Laisse l'animation de fermeture se terminer avant de démonter.
          window.setTimeout(() => {
            root.unmount();
            host.remove();
          }, 0);
        }}
      />
    );
  });
}
