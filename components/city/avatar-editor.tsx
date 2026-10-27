'use client';

import dynamic from 'next/dynamic';
import { useState, useTransition } from 'react';
import { Check, X } from 'lucide-react';
import { saveAvatar } from '@/app/tableau-de-bord/ville/actions';
import { ACCESSORIES, HAIR_COLORS, HAIR_STYLES, OUTFIT_COLORS, SKINS, VACATION_COLORS, type AvatarLook, type CityTrainer } from '@/lib/city/types';

const Preview = dynamic(() => import('./avatar-preview'), { ssr: false, loading: () => <div className="city-avatar-preview" /> });

/** Création de son personnage par le formateur (silhouette stylisée, pas de portrait). */
export function AvatarEditor({ trainer, webgl, missing, onClose, onSaved }: { trainer: CityTrainer | null; webgl: boolean; missing: boolean; onClose: () => void; onSaved: () => void }) {
  const [look, setLook] = useState<AvatarLook | null>(trainer?.look || null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!trainer || !look) return null;
  const set = (patch: Partial<AvatarLook>) => setLook({ ...look, ...patch });
  const Swatches = ({ colors, value, onPick, label }: { colors: string[]; value: string; onPick: (c: string) => void; label: string }) => (
    <div className="city-swatches" role="radiogroup" aria-label={label}>
      {colors.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} className={value === c ? 'on' : ''} style={{ background: c }} onClick={() => onPick(c)} aria-label={c} />
      ))}
    </div>
  );
  return (
    <aside className="city-drawer city-avatar" aria-label="Mon personnage">
      <button className="city-panel-close" onClick={onClose} aria-label="Fermer"><X size={16} /></button>
      <h2>Mon personnage</h2>
      <p className="hint">{trainer.label} · visible par l’équipe dans CF Réseaux City.</p>
      {webgl ? <Preview look={look} /> : null}
      <div className="city-field"><span>Peau</span><Swatches label="Peau" colors={SKINS} value={look.skin} onPick={(skin) => set({ skin })} /></div>
      <div className="city-field">
        <span>Coiffure</span>
        <div className="city-chips">
          {HAIR_STYLES.map((h) => (
            <button key={h.value} type="button" className={look.hair === h.value ? 'on' : ''} onClick={() => set({ hair: h.value })}>{h.label}</button>
          ))}
        </div>
        <Swatches label="Couleur des cheveux" colors={HAIR_COLORS} value={look.hairColor} onPick={(hairColor) => set({ hairColor })} />
      </div>
      <div className="city-field"><span>Haut</span><Swatches label="Haut" colors={OUTFIT_COLORS} value={look.top} onPick={(top) => set({ top })} /></div>
      <div className="city-field"><span>Bas</span><Swatches label="Bas" colors={OUTFIT_COLORS} value={look.bottom} onPick={(bottom) => set({ bottom })} /></div>
      <div className="city-field">
        <span>Accessoire</span>
        <div className="city-chips">
          {ACCESSORIES.map((a) => (
            <button key={a.value} type="button" className={look.accessory === a.value ? 'on' : ''} onClick={() => set({ accessory: a.value })}>{a.label}</button>
          ))}
        </div>
      </div>
      <div className="city-field"><span>Chemise du Beach Club</span><Swatches label="Chemise de vacances" colors={VACATION_COLORS} value={look.vacation} onPick={(vacation) => set({ vacation })} /></div>
      {missing && <p className="city-warn">La migration 45 n’est pas encore exécutée : le personnage ne peut pas être enregistré.</p>}
      {msg && <p className="hint">{msg}</p>}
      <button
        className="btn primary"
        disabled={pending || missing}
        onClick={() =>
          start(async () => {
            const res = await saveAvatar(look);
            setMsg(res.ok ? 'Personnage enregistré.' : res.error);
            if (res.ok) onSaved();
          })
        }
      >
        <Check size={15} aria-hidden /> {pending ? 'Enregistrement…' : 'Enregistrer mon personnage'}
      </button>
    </aside>
  );
}
