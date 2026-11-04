'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Sparkles, Wand2 } from 'lucide-react';
import { parseSymbols } from '@/lib/habilitation';
import { suggestFor, type Suggestion } from '@/lib/smart-config';

/**
 * Configuration intelligente (formulaire d'une formation) : suggestions tirées
 * de l'intitulé, appliquées d'un clic aux champs du formulaire.
 */
export function SmartConfig({ title }: { title: string }) {
  const root = useRef<HTMLDivElement>(null);
  const suggestions = useMemo(() => suggestFor(title), [title]);
  const symbols = useMemo(() => parseSymbols(title).symbols, [title]);
  const [tick, setTick] = useState(0);
  const form = () => root.current?.closest('form') || null;

  // État de chaque suggestion d'après le formulaire (déjà appliquée ou non).
  const applied = (s: Suggestion): boolean => {
    const f = form();
    if (!f) return false;
    if (s.kind === 'check') {
      const boxes = [...f.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${s.field}"]`)];
      const box = s.value ? boxes.find((b) => b.value === s.value) : boxes[0];
      return Boolean(box?.checked);
    }
    if (s.kind === 'duration') {
      const h = f.querySelector<HTMLInputElement>('input[name="duration_h"]:not([type=hidden])');
      return !h || Number(h.value || 0) === s.hours;
    }
    const area = f.querySelector<HTMLTextAreaElement>(`textarea[name="${s.field}"]`);
    return !area || area.value.trim().length > 0;
  };

  function apply(s: Suggestion) {
    const f = form();
    if (!f) return;
    if (s.kind === 'check') {
      const boxes = [...f.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${s.field}"]`)];
      const box = s.value ? boxes.find((b) => b.value === s.value) : boxes[0];
      if (box && !box.checked) box.click();
    } else if (s.kind === 'duration') {
      const h = f.querySelector<HTMLInputElement>('input[name="duration_h"]:not([type=hidden])');
      const m = f.querySelector<HTMLSelectElement>('select[name="duration_min"]');
      if (h) setNative(h, String(s.hours));
      if (m) setNative(m, '0');
    } else {
      const area = f.querySelector<HTMLTextAreaElement>(`textarea[name="${s.field}"]`);
      if (area) setNative(area, s.text);
    }
    setTick((x) => x + 1);
  }

  // Les champs du formulaire peuvent changer à la main : on relit leur état.
  useEffect(() => {
    const f = form();
    if (!f) return;
    const on = () => setTick((x) => x + 1);
    f.addEventListener('change', on);
    f.addEventListener('input', on);
    return () => {
      f.removeEventListener('change', on);
      f.removeEventListener('input', on);
    };
  }, []);

  if (!title.trim()) return null;
  void tick;
  const todo = suggestions.filter((s) => !applied(s));
  return (
    <div ref={root} className="smart-config" aria-live="polite">
      <div className="smart-head">
        <span className="smart-icon" aria-hidden><Sparkles size={15} /></span>
        <strong>Configuration intelligente</strong>
        {todo.length > 1 && (
          <button type="button" className="small primary" onClick={() => todo.forEach(apply)}>
            <Wand2 size={13} aria-hidden /> Tout appliquer ({todo.length})
          </button>
        )}
      </div>
      {symbols.length > 0 && (
        <p className="smart-info">
          <Check size={13} aria-hidden /> Habilitation électrique détectée : certificat avec les symboles <strong>{symbols.join(' ')}</strong> (section 4).
        </p>
      )}
      {suggestions.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>Aucune suggestion pour cet intitulé : configure la formation ci-dessous.</p>
      ) : (
        <ul className="smart-list">
          {suggestions.map((s) => {
            const done = applied(s);
            return (
              <li key={s.id} className={done ? 'done' : ''}>
                <span className="smart-main">
                  <strong>{s.label}</strong>
                  <small>{s.why}</small>
                </span>
                {done ? (
                  <span className="smart-ok"><Check size={13} aria-hidden /> Appliqué</span>
                ) : (
                  <button type="button" className="small" onClick={() => apply(s)}>Appliquer</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Valeur posée comme une saisie (les champs contrôlés par React la voient). */
function setNative(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}
