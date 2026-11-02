'use client';

import { useEffect, useMemo, useState } from 'react';
import { HAB_SYMBOLS, parseSymbols } from '@/lib/habilitation';

/**
 * Réglage d'une formation : certificat d'habilitation électrique et symboles
 * possibles. Par défaut, ceux détectés dans l'intitulé de la formation.
 * Champs envoyés : hab_present, hab_on, hab_symbols[].
 */
export function HabSymbolsField({ title, saved }: { title: string; saved: string | null | undefined }) {
  const detected = useMemo(() => parseSymbols(title).symbols, [title]);
  const initial = saved != null ? saved.split(',').map((s) => s.trim()).filter(Boolean) : detected;
  const [on, setOn] = useState(initial.length > 0);
  const [chosen, setChosen] = useState<string[]>(initial);
  const [touched, setTouched] = useState(saved != null);
  // Tant que rien n'est choisi à la main, on suit l'intitulé saisi.
  useEffect(() => {
    if (touched) return;
    setChosen(detected);
    setOn(detected.length > 0);
  }, [detected, touched]);
  const all = [...new Set([...HAB_SYMBOLS, ...detected, ...chosen])];
  const toggle = (s: string) => {
    setTouched(true);
    setChosen((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s]));
  };
  return (
    <fieldset className="ar-models hab-symbols">
      <input type="hidden" name="hab_present" value="1" />
      <legend>Certificat d’habilitation électrique (symboles choisis par le formateur pour chaque stagiaire)</legend>
      <label className="check-line">
        <input type="checkbox" name="hab_on" checked={on} onChange={(e) => { setOn(e.target.checked); setTouched(true); }} />
        Délivrer un certificat d’habilitation à la fin de la formation
      </label>
      {on && (
        <>
          <p className="hint" style={{ margin: '4px 0 6px' }}>
            Symboles possibles pour cette formation{detected.length ? ` (détectés dans l’intitulé : ${detected.join(' ')})` : ''}. Le formateur coche ensuite ceux qu’il attribue à chaque stagiaire.
          </p>
          <div className="hab-chips" role="group" aria-label="Symboles possibles">
            {all.map((s) => (
              <button key={s} type="button" className={`hab-chip${chosen.includes(s) ? ' on' : ''}`} aria-pressed={chosen.includes(s)} onClick={() => toggle(s)}>
                {s}
              </button>
            ))}
          </div>
          {/* Valeurs envoyées (champs cachés : aucun défilement de la fenêtre au clic). */}
          {chosen.map((s) => <input key={s} type="hidden" name="hab_symbols" value={s} />)}
        </>
      )}
    </fieldset>
  );
}
