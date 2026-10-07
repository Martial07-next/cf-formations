'use client';

import { useRef, useState, useTransition } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { purgeData, type PurgeResult } from '@/app/administration/donnees/actions';

const ITEMS = [
  { name: 'sessions', label: 'Sessions', desc: 'avec les inscriptions des stagiaires et les horaires par jour' },
  { name: 'stagiaires', label: 'Stagiaires', desc: 'tout l’annuaire et leurs historiques' },
  { name: 'formateurs', label: 'Formateurs', desc: 'fiches, couleurs, rattachements aux référents' },
  { name: 'formations', label: 'Formations', desc: 'le catalogue et ses dossiers' },
  { name: 'salles', label: 'Salles', desc: 'sauf « À affecter »' },
];

export function PurgePanel({ counts, phrase }: { counts: Record<string, number>; phrase: string }) {
  const [result, setResult] = useState<PurgeResult | null>(null);
  const [typed, setTyped] = useState('');
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handle(fd: FormData) {
    const chosen = ITEMS.filter((i) => fd.get(i.name) === 'on').map((i) => i.label.toLowerCase());
    if (!confirm(`Dernière confirmation : supprimer définitivement ${chosen.join(', ')} ? Cette action est irréversible.`)) return;
    setResult(null);
    startTransition(async () => {
      const res = await purgeData(fd);
      setResult(res);
      if (res.ok) {
        formRef.current?.reset();
        setTyped('');
      }
    });
  }

  return (
    <div className="panel danger-zone">
      <h2><AlertTriangle size={18} aria-hidden /> Supprimer les données de la plateforme</h2>
      <p className="panel-intro">
        Efface définitivement les données cochées. <strong>Aucun retour en arrière possible.</strong> Les comptes
        utilisateurs et les paramètres sont conservés (un accès se supprime depuis l’onglet Utilisateurs). Pense à
        exporter avant :{' '}
        <a href="/sessions/export">sessions (CSV)</a> · <a href="/stagiaires/export">stagiaires (CSV)</a>.
      </p>

      {result && (
        <div role="alert" className={`alert ${result.ok ? 'alert-success' : 'alert-error'}`}>
          {result.ok ? result.summary : result.error}
        </div>
      )}

      <form ref={formRef} action={handle}>
        <div className="purge-list">
          {ITEMS.map((i) => (
            <label key={i.name}>
              <input type="checkbox" name={i.name} defaultChecked />
              <span>
                <strong>{i.label}</strong> <span className="badge brouillon">{counts[i.name] ?? 0}</span>
                <small>{i.desc}</small>
              </span>
            </label>
          ))}
        </div>

        <div className="form-row">
          <label>
            Recopie « {phrase} »
            <input name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <label>
            Ton mot de passe
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
        </div>

        <button type="submit" className="danger" disabled={isPending || typed.trim() !== phrase}>
          <Trash2 size={15} aria-hidden /> {isPending ? 'Suppression…' : 'Supprimer définitivement'}
        </button>
      </form>
    </div>
  );
}
