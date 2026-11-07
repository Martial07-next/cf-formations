'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { AlertTriangle, Copy, ExternalLink, Link2, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { digiformaCandidates, setDigiformaLinks, type DfCandidate } from '@/app/sessions/[id]/actions';
import { setDigiformaLinkDone } from '@/app/dossier/actions';
import { DF_AUDIENCES, linkTrainees, uncoveredTrainees, type DfAudience, type DfLink } from '@/lib/digiforma-links';

export type DigiformaInfo = {
  links: DfLink[];
  /** « Fait sur Digiforma », lien par lien. */
  done: Record<string, boolean>;
  trainees: { id: string; name: string }[];
  /** Membres du groupe du parcours (GEIQ, POEC…) ; null hors parcours. */
  group: string[] | null;
  /** Autres sessions du planning qui utilisent le même lien. */
  shared: Record<string, { id: string; title: string; trainer: string | null }[]>;
};

const newId = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * Liens Digiforma du dossier (émargements, satisfaction à chaud…) :
 *  · plusieurs liens si les stagiaires sont dans des sessions Digiforma
 *    différentes (groupe GEIQ + stagiaires ajoutés), chacun avec ses stagiaires ;
 *  · un même lien sur plusieurs sessions du planning (une session Digiforma
 *    pour deux formations qui s'enchaînent) : « Reprendre le lien d'une autre session ».
 * Le formateur coche « fait » pour chaque lien.
 */
export function DigiformaDocs({
  sessionId,
  info,
  canEdit,
  canFill,
  onAllDone,
}: {
  sessionId: string;
  info: DigiformaInfo;
  canEdit: boolean;
  canFill: boolean;
  onAllDone: (v: boolean) => void;
}) {
  const [done, setDone] = useState(info.done);
  const doneKey = JSON.stringify(info.done);
  useEffect(() => setDone(info.done), [doneKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DfLink[]>(info.links);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DfCandidate[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const ids = info.trainees.map((t) => t.id);
  const group = useMemo(() => (info.group ? new Set(info.group) : null), [info.group]);
  const nameOf = (id: string) => info.trainees.find((t) => t.id === id)?.name || '';
  const missing = info.links.length ? uncoveredTrainees(info.links, ids, group) : [];

  if (!info.links.length && !canEdit) return null;

  function toggle(link: DfLink, v: boolean) {
    const next = { ...done, [link.id]: v };
    setDone(next);
    onAllDone(info.links.every((l) => next[l.id]));
    startTransition(async () => {
      const r = await setDigiformaLinkDone(sessionId, link.id, v, info.links.map((l) => l.id));
      if (!r.ok) {
        setError(r.error);
        setDone(done);
        onAllDone(info.links.every((l) => done[l.id]));
      }
    });
  }

  function startEdit() {
    setDraft(info.links.length ? info.links : [{ id: newId(), label: 'Session Digiforma', url: '', audience: 'all' }]);
    setError(null);
    setEditing(true);
  }

  function save() {
    const list = draft.filter((l) => l.url.trim());
    startTransition(async () => {
      const r = await setDigiformaLinks(sessionId, list);
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        setEditing(false);
        setCandidates(null);
      }
    });
  }

  const upd = (i: number, patch: Partial<DfLink>) => setDraft((d) => d.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function addLink() {
    // Parcours : le 2e lien est par défaut celui des stagiaires ajoutés (hors groupe).
    const geiq = group && draft.length === 1 && draft[0].audience === 'all';
    setDraft((d) => [
      ...(geiq ? [{ ...d[0], audience: 'group' as DfAudience, label: d[0].label === 'Session Digiforma' ? 'Groupe du parcours' : d[0].label }] : d),
      { id: newId(), label: geiq ? 'Stagiaires ajoutés' : 'Autre session Digiforma', url: '', audience: geiq ? 'others' : 'custom', trainee_ids: [] },
    ]);
  }

  function loadCandidates() {
    startTransition(async () => {
      const r = await digiformaCandidates(sessionId);
      if (!r.ok) setError(r.error);
      else setCandidates(r.list);
    });
  }

  const fr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' });

  if (editing) {
    return (
      <div className="digiforma-docs editing">
        <p className="hint" style={{ margin: 0 }}>
          Un lien par session Digiforma. Si les stagiaires sont dans plusieurs sessions Digiforma (ex. groupe GEIQ et stagiaires ajoutés), ajoute un lien pour chacune et indique qui est concerné.
        </p>
        {draft.map((l, i) => {
          const audiences = DF_AUDIENCES.filter((a) => !a.poecOnly || group);
          const concerned = linkTrainees(l, ids, group);
          return (
            <div key={l.id} className="df-edit-row">
              <div className="df-edit-line">
                <input className="input" value={l.label} onChange={(e) => upd(i, { label: e.target.value })} placeholder="Nom (ex. Groupe GEIQ)" aria-label={`Nom du lien ${i + 1}`} maxLength={80} />
                <input type="url" className="input df-url" value={l.url} onChange={(e) => upd(i, { url: e.target.value })} placeholder="Lien de l’intervenant (Digiforma › session › Accès)" aria-label={`Lien Digiforma ${i + 1}`} />
                <button type="button" className="small icon ghost danger" aria-label={`Retirer le lien ${i + 1}`} onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="df-edit-line">
                <label className="df-audience">
                  Stagiaires concernés
                  <select value={l.audience} onChange={(e) => upd(i, { audience: e.target.value as DfAudience, trainee_ids: e.target.value === 'custom' ? concerned : undefined })}>
                    {audiences.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </label>
                <small className="hint">{concerned.length} stagiaire{concerned.length > 1 ? 's' : ''}{l.audience !== 'custom' && concerned.length ? ` : ${concerned.map(nameOf).join(', ')}` : ''}</small>
              </div>
              {l.audience === 'custom' && (
                <div className="df-pick" role="group" aria-label={`Stagiaires du lien ${i + 1}`}>
                  {info.trainees.map((t) => {
                    const on = (l.trainee_ids || []).includes(t.id);
                    return (
                      <button key={t.id} type="button" className={`df-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => upd(i, { trainee_ids: on ? (l.trainee_ids || []).filter((x) => x !== t.id) : [...(l.trainee_ids || []), t.id] })}>
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <span className="row-actions">
          <button type="button" className="small" onClick={addLink} disabled={draft.length >= 8}><Plus size={14} aria-hidden /> Ajouter un lien</button>
          <button type="button" className="small" onClick={loadCandidates} disabled={isPending}><Copy size={14} aria-hidden /> Reprendre le lien d’une autre session</button>
        </span>
        {candidates && (
          <div className="df-candidates">
            {candidates.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>Aucune session proche (même parcours ou mêmes stagiaires) n’a encore de lien Digiforma.</p>
            ) : (
              candidates.flatMap((c) =>
                c.links.map((cl) => (
                  <button
                    key={c.sessionId + cl.id}
                    type="button"
                    className="df-candidate"
                    onClick={() => {
                      setDraft((d) => {
                        const empty = d.findIndex((x) => !x.url.trim());
                        const item: DfLink = { id: newId(), label: c.links.length > 1 ? cl.label : 'Session Digiforma partagée', url: cl.url, audience: 'all' };
                        return empty >= 0 ? d.map((x, j) => (j === empty ? { ...x, url: cl.url } : x)) : [...d, item];
                      });
                      setCandidates(null);
                    }}
                  >
                    <strong>{c.title}</strong>
                    <small>{fr(c.start)} → {fr(c.end)}{c.trainer ? ` · ${c.trainer}` : ''}{c.links.length > 1 ? ` · ${cl.label}` : ''}</small>
                  </button>
                ))
              )
            )}
          </div>
        )}
        <span className="row-actions">
          <button type="button" className="small primary" onClick={save} disabled={isPending}>{isPending ? '…' : 'Enregistrer'}</button>
          <button type="button" className="small ghost" onClick={() => { setEditing(false); setCandidates(null); setError(null); }}>Annuler</button>
        </span>
        {error && <span role="alert" className="field-error">{error}</span>}
      </div>
    );
  }

  return (
    <div className="digiforma-docs">
      {!info.links.length ? (
        <>
          <span className="hint">
            <Link2 size={14} aria-hidden style={{ verticalAlign: '-2px' }} /> Pas encore de lien Digiforma : ajoute-le pour que le formateur fasse les émargements et la satisfaction à chaud.
          </span>
          <button type="button" className="small" onClick={startEdit}>Ajouter le lien Digiforma</button>
        </>
      ) : (
        <div className="df-links">
          {info.links.map((l) => {
            const concerned = linkTrainees(l, ids, group);
            const shared = info.shared[l.id] || [];
            const several = info.links.length > 1;
            return (
              <div key={l.id} className={`df-link${done[l.id] ? ' done' : ''}`}>
                <a className="btn primary" href={l.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={15} aria-hidden /> {several ? l.label : 'Accès formateur Digiforma'}
                </a>
                <label className={`check-line${done[l.id] ? ' done' : ''}`}>
                  <input type="checkbox" checked={Boolean(done[l.id])} disabled={!canFill || isPending} onChange={(e) => toggle(l, e.target.checked)} />
                  {done[l.id] ? 'Fait sur Digiforma' : 'C’est fait sur Digiforma'}
                </label>
                {(several || l.audience !== 'all') && (
                  <small className="df-who">
                    <Users size={12} aria-hidden /> {concerned.length ? concerned.map(nameOf).join(', ') : 'Aucun stagiaire pour l’instant'}
                  </small>
                )}
                {shared.length > 0 && (
                  <small className="df-shared">
                    <Link2 size={12} aria-hidden /> Session Digiforma partagée avec {shared.map((o) => `${o.title}${o.trainer ? ` (${o.trainer})` : ''}`).join(', ')}
                  </small>
                )}
              </div>
            );
          })}
          {missing.length > 0 && (
            <p className="df-missing" role="status">
              <AlertTriangle size={13} aria-hidden /> Sans lien Digiforma : {missing.map(nameOf).join(', ')}
            </p>
          )}
          {canEdit && (
            <button type="button" className="small ghost" onClick={startEdit}>
              <Pencil size={13} aria-hidden /> {info.links.length > 1 ? 'Modifier les liens' : 'Modifier le lien'}
            </button>
          )}
        </div>
      )}
      {error && <span role="alert" className="field-error">{error}</span>}
    </div>
  );
}
