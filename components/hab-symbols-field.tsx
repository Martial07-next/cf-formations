'use client';

import { useState } from 'react';
import { habEnabled, parseSymbols } from '@/lib/habilitation';

/**
 * Réglage d'une formation : certificat d'habilitation électrique délivré ou non.
 * Les symboles ne se règlent plus ici : le formateur les choisit pour chaque
 * stagiaire (ceux de l'intitulé lui sont proposés).
 * Champs envoyés : hab_present, hab_on, hab_symbols[] (ancien réglage conservé).
 */
export function HabSymbolsField({ title, saved, objectifs }: { title: string; saved: string | null | undefined; objectifs?: string | null }) {
  const [on, setOn] = useState(habEnabled(saved, title));
  // Ancienne liste de symboles : gardée comme proposition pour le formateur.
  const legacy = saved && saved !== '*' ? saved.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const detected = parseSymbols(title).symbols;
  return (
    <fieldset className="ar-models hab-symbols">
      <input type="hidden" name="hab_present" value="1" />
      <legend>Certificat d’habilitation électrique</legend>
      <label className="check-line">
        <input type="checkbox" name="hab_on" checked={on} onChange={(e) => setOn(e.target.checked)} />
        Délivrer un certificat d’habilitation à la fin de la formation (le formateur choisit les symboles de chaque stagiaire)
      </label>
      {legacy.map((s) => <input key={s} type="hidden" name="hab_symbols" value={s} />)}
      {on && (
        <>
          {(legacy.length > 0 || detected.length > 0) && (
            <p className="hint" style={{ margin: '4px 0 0' }}>
              Symboles proposés au formateur : <strong>{(legacy.length ? legacy : detected).join(' ')}</strong> (d’après {legacy.length ? 'l’ancien réglage' : 'l’intitulé'}).
            </p>
          )}
          <label className="hab-obj">
            <span>Objectifs du certificat</span>
            <textarea
              name="objectifs_habilitation"
              rows={5}
              defaultValue={objectifs || ''}
              placeholder={'Un objectif par ligne, ex. :\n- Réaliser et organiser des travaux d’ordre électrique en BT\n- Réaliser des consignations d’installations électriques en BT'}
            />
            <small className="hint">Imprimés sur le certificat. Vide : les objectifs de l’attestation de fin de formation sont repris.</small>
          </label>
        </>
      )}
    </fieldset>
  );
}
