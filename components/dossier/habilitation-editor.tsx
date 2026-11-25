'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Download, Eraser, Loader2, Pencil, ThumbsDown, ThumbsUp, Users, X } from 'lucide-react';
import { askConfirm } from '@/lib/confirm-dialog';
import { saveHabilitation } from '@/app/dossier/actions';
import { LivePeers, useLiveForm } from '@/components/dossier/use-live-form';
import { HAB_GROUPS, certificateTitle, habDone, habEntryDone, sortSymbols, symbolsOf, type HabData, type HabEntry } from '@/lib/habilitation';
import type { HabCertInput } from '@/lib/pdf-habilitation';

export type HabSession = Omit<HabCertInput, 'trainees' | 'entries'> & {
  trainees: { id: string; name: string; company: string | null }[];
  /** Nom sur le certificat (« Prénom NOM »). */
  certNames?: Record<string, string>;
};

/**
 * Sélecteur de symboles par catégorie (repliable) : un clic ajoute ou retire.
 * Les symboles proposés pour la formation sont signalés d'un point.
 */
function SymbolPicker({ value, suggested, onChange, disabled }: { value: string[]; suggested: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const extra = value.filter((s) => !HAB_GROUPS.some((g) => g.items.includes(s)));
  const groups = extra.length ? [...HAB_GROUPS, { label: 'Autres', items: extra }] : HAB_GROUPS;
  const toggle = (s: string) => onChange(sortSymbols(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]));
  return (
    <div className="hab-picker">
      {groups.map((g) => (
        <div key={g.label} className="hab-group">
          <span className="hab-group-label">{g.label}</span>
          <div className="hab-chips">
            {g.items.map((s) => (
              <button
                key={s}
                type="button"
                className={`hab-chip${value.includes(s) ? ' on' : ''}${suggested.includes(s) ? ' sugg' : ''}`}
                aria-pressed={value.includes(s)}
                disabled={disabled}
                onClick={() => toggle(s)}
                title={suggested.includes(s) ? 'Proposé pour cette formation' : undefined}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Symboles choisis, en petites étiquettes (ou « aucun »). */
function Chosen({ list, warn }: { list: string[]; warn?: boolean }) {
  if (!list.length)
    return <span className={warn ? 'hab-none warn' : 'hab-none'}>{warn ? <><AlertTriangle size={12} aria-hidden /> Choisis au moins un symbole</> : 'Aucun symbole'}</span>;
  return (
    <span className="hab-chosen">
      {list.map((s) => <span key={s} className="hab-tag">{s}</span>)}
    </span>
  );
}

/**
 * Certificats d'habilitation électrique. Le formateur :
 * 1. choisit une fois les symboles de la session (proposés d'après l'intitulé) ;
 * 2. les applique à tous (ou « Tous favorables ») ;
 * 3. ajuste un stagiaire si besoin (sélecteur replié sous sa ligne) et donne son avis.
 * Enregistré en direct, à plusieurs ; PDF au modèle de CF Réseaux.
 */
export function HabilitationEditor({
  session,
  initialData,
  canEdit,
  blocked = [],
  me = null,
  onClose,
  onSaved,
}: {
  session: HabSession;
  initialData: HabData | null;
  canEdit: boolean;
  /** Titre d'habilitation manquant : certificat non remis. */
  blocked?: string[];
  me?: { id: string; name: string } | null;
  onClose: () => void;
  onSaved?: (data: HabData, completed: boolean) => void;
}) {
  const [data, setData] = useState<HabData>(initialData || {});
  const [busy, setBusy] = useState<string | null>(null);
  const [localError, setError] = useState<string | null>(null);
  // Sélecteur ouvert : 'session' ou l'id d'un stagiaire.
  const [open, setOpen] = useState<string | null>(null);
  const ids = session.trainees.map((t) => t.id);
  const live = useLiveForm<HabData>({
    sessionId: session.sessionId,
    kind: 'habilitation',
    data,
    setData,
    canEdit,
    me,
    completedOf: (d) => habDone(d, ids, session.symbols),
    legacySave: (d, comp) => saveHabilitation(session.sessionId, d, Boolean(comp)),
    onSynced: (d) => onSaved?.(d, habDone(d, ids, session.symbols)),
  });
  const error = localError || live.error;
  // Symboles de la session : choisis par le formateur, sinon proposés d'après l'intitulé.
  const base = data.symbols ? sortSymbols(data.symbols) : session.symbols;
  const done = session.trainees.filter((t) => habEntryDone(data.trainees?.[t.id], base)).length;
  const set = (id: string, patch: Partial<HabEntry>) =>
    setData((d) => ({ ...d, trainees: { ...(d.trainees || {}), [id]: { ...(d.trainees?.[id] || {}), ...patch } } }));
  // Avis favorable sans symbole choisi : ceux de la session sont attribués.
  const setAvis = (id: string, avis: HabEntry['avis']) => {
    const cur = data.trainees?.[id];
    const next = cur?.avis === avis ? undefined : avis;
    set(id, { avis: next, ...(next === 'favorable' && !cur?.symbols ? { symbols: base } : {}) });
  };
  const applyToAll = () =>
    setData((d) => ({ ...d, trainees: Object.fromEntries(session.trainees.map((t) => [t.id, { ...(d.trainees?.[t.id] || {}), symbols: base }])) }));

  async function download(only?: string) {
    setBusy(only || 'all');
    setError(null);
    try {
      const list = session.trainees.filter((t) => (only ? t.id === only : habEntryDone(data.trainees?.[t.id], base)) && !blocked.includes(t.id));
      if (!list.length) throw new Error(only ? 'Titre d’habilitation manquant : certificat bloqué.' : 'Aucun certificat prêt (avis et symboles à donner).');
      const { buildHabilitationPdf } = await import('@/lib/pdf-habilitation');
      const { downloadPdf } = await import('@/lib/pdf-dossier');
      const bytes = await buildHabilitationPdf({ ...session, symbols: base, trainees: list.map((t) => ({ id: t.id, name: session.certNames?.[t.id] || t.name })), entries: data.trainees || {} });
      downloadPdf(bytes, only ? `Certificat habilitation - ${list[0].name}.pdf` : `Certificats habilitation - ${session.title}.pdf`);
    } catch (e: any) {
      setError(e?.message || 'PDF impossible.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pf fai">
      <div className="pf-bar">
        <div className="pf-title">
          <strong>Certificats d’habilitation · {session.title}</strong>
          <span className="hint">
            {live.status === 'saving' ? (
              <><Loader2 size={12} className="spin" aria-hidden /> Enregistrement…</>
            ) : live.status === 'saved' ? (
              <>Enregistré automatiquement à {live.savedAt}</>
            ) : canEdit ? (
              'Chaque saisie est enregistrée automatiquement'
            ) : (
              'Lecture seule'
            )}
            {' · '}
            {done === session.trainees.length && done > 0 ? (
              <span className="badge validee"><CheckCircle2 size={12} aria-hidden /> Tous les certificats sont remplis</span>
            ) : (
              `${done}/${session.trainees.length} remplis`
            )}
          </span>
        </div>
        <div className="row-actions">
          <LivePeers peers={live.peers} live={live.live} />
          {canEdit && (
            <button
              type="button"
              className="small"
              disabled={!base.length}
              title={!base.length ? 'Choisis d’abord les symboles de la session' : 'Avis favorable et symboles de la session pour ceux qui n’ont pas encore d’avis'}
              onClick={() =>
                setData((d) => ({
                  ...d,
                  trainees: Object.fromEntries(
                    session.trainees.map((t) => {
                      const cur = d.trainees?.[t.id] || {};
                      return [t.id, cur.avis ? cur : { ...cur, avis: 'favorable', symbols: cur.symbols || base }];
                    })
                  ),
                }))
              }
            >
              <ThumbsUp size={14} aria-hidden /> Tous favorables
            </button>
          )}
          {canEdit && (done > 0 || data.symbols) && (
            <button
              type="button"
              className="small ghost"
              onClick={async () => {
                if (await askConfirm('Effacer tous les avis et symboles des certificats de cette session ?', { danger: true, confirmLabel: 'Tout effacer' }))
                  setData(() => ({ trainees: {} }));
              }}
            >
              <Eraser size={14} aria-hidden /> Tout effacer
            </button>
          )}
          <button type="button" className={`small${done ? ' primary' : ''}`} onClick={() => download()} disabled={!!busy || !done}>
            {busy === 'all' ? <Loader2 size={14} className="spin" aria-hidden /> : <Download size={14} aria-hidden />} Tous les certificats
          </button>
          <button type="button" className="icon ghost" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
      </div>
      {error && <div role="alert" className="alert alert-error" style={{ margin: '8px 16px' }}>{error}</div>}

      <div className="tdt-body">
        {/* 1. Symboles de la session */}
        <div className="hab-session">
          <div className="hab-session-head">
            <span className="hab-step">1</span>
            <span className="hab-session-title">
              <strong>Symboles de la session</strong>
              <small className="hint">
                {session.symbols.length
                  ? `Proposés d’après l’intitulé : ${session.symbols.join(' ')}. Ajuste si besoin.`
                  : 'Choisis les symboles visés par la formation.'}
              </small>
            </span>
            <Chosen list={base} />
            {canEdit && (
              <span className="row-actions">
                <button type="button" className="small" onClick={() => setOpen(open === 'session' ? null : 'session')} aria-expanded={open === 'session'}>
                  <Pencil size={13} aria-hidden /> {open === 'session' ? 'Fermer' : 'Modifier'}
                </button>
                <button type="button" className="small primary" disabled={!base.length || !session.trainees.length} onClick={applyToAll} title="Ces symboles pour tous les stagiaires (avis inchangés)">
                  <Users size={13} aria-hidden /> Appliquer à tous
                </button>
              </span>
            )}
          </div>
          {open === 'session' && canEdit && (
            <SymbolPicker value={base} suggested={session.symbols} onChange={(v) => setData((d) => ({ ...d, symbols: v }))} />
          )}
        </div>

        {/* 2. Un certificat par stagiaire */}
        <p className="hab-step-line"><span className="hab-step">2</span> Pour chaque stagiaire : ton avis, et ses symboles s’il n’obtient pas tout.</p>
        {session.trainees.length === 0 && <p className="empty">Aucun stagiaire validé sur cette session.</p>}
        <div className="hab-list">
          {session.trainees.map((t) => {
            const e = data.trainees?.[t.id] || {};
            const syms = symbolsOf(e, base);
            const isBlocked = blocked.includes(t.id);
            const complete = habEntryDone(e, base);
            const isOpen = open === t.id;
            return (
              <div key={t.id} className={`hab-row${e.avis ? ` ${e.avis}` : ''}${isOpen ? ' open' : ''}`}>
                <div className="hab-who">
                  <strong>{complete && <CheckCircle2 size={13} aria-hidden className="hab-ok" />} {t.name}</strong>
                  <small className="hint">{t.company || 'Sans entreprise'}</small>
                </div>
                <div className="hab-avis" role="radiogroup" aria-label={`Avis pour ${t.name}`}>
                  <button type="button" role="radio" aria-checked={e.avis === 'favorable'} className={e.avis === 'favorable' ? 'on ok' : ''} disabled={!canEdit} onClick={() => setAvis(t.id, 'favorable')} title={e.avis === 'favorable' ? 'Cliquer à nouveau pour retirer l’avis' : undefined}>
                    <ThumbsUp size={13} aria-hidden /> Favorable
                  </button>
                  <button type="button" role="radio" aria-checked={e.avis === 'defavorable'} className={e.avis === 'defavorable' ? 'on ko' : ''} disabled={!canEdit} onClick={() => setAvis(t.id, 'defavorable')} title={e.avis === 'defavorable' ? 'Cliquer à nouveau pour retirer l’avis' : undefined}>
                    <ThumbsDown size={13} aria-hidden /> Défavorable
                  </button>
                </div>
                <div className="hab-syms">
                  {e.avis === 'defavorable' ? <span className="hab-none">Pas de symbole (avis défavorable)</span> : <Chosen list={syms} warn={e.avis === 'favorable'} />}
                  {canEdit && e.avis !== 'defavorable' && (
                    <button type="button" className="small ghost hab-edit" onClick={() => setOpen(isOpen ? null : t.id)} aria-expanded={isOpen}>
                      {isOpen ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />} Symboles
                    </button>
                  )}
                </div>
                <div className="row-actions hab-actions">
                  <button
                    type="button"
                    className="small"
                    disabled={!!busy || !complete || isBlocked}
                    title={isBlocked ? 'Titre d’habilitation manquant (tour de table)' : !complete ? 'Donne ton avis (et au moins un symbole)' : undefined}
                    onClick={() => download(t.id)}
                  >
                    {busy === t.id ? <Loader2 size={13} className="spin" aria-hidden /> : <Download size={13} aria-hidden />} {isBlocked ? 'Titre manquant' : 'Certificat'}
                  </button>
                  {canEdit && data.trainees?.[t.id] && (
                    <button
                      type="button"
                      className="icon ghost"
                      title="Effacer (avis et symboles remis à zéro)"
                      aria-label={`Effacer le certificat de ${t.name}`}
                      onClick={() =>
                        setData((d) => {
                          const next = { ...(d.trainees || {}) };
                          delete next[t.id];
                          return { ...d, trainees: next };
                        })
                      }
                    >
                      <Eraser size={15} />
                    </button>
                  )}
                </div>
                {isOpen && canEdit && (
                  <div className="hab-row-picker">
                    <SymbolPicker value={syms} suggested={base} onChange={(v) => set(t.id, { symbols: v })} />
                    <div className="row-actions">
                      <button type="button" className="small ghost" onClick={() => set(t.id, { symbols: base })}>Comme la session</button>
                      <button type="button" className="small" onClick={() => setOpen(null)}>Fermer</button>
                    </div>
                  </div>
                )}
                {e.avis === 'favorable' && syms.length > 0 && <small className="hab-line">{certificateTitle(session.title, syms)}</small>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
