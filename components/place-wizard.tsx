'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, FileText, Loader2, Search, Sparkles, X } from 'lucide-react';
import { TemplatePicker } from '@/components/template-picker';
import { rankCatalog } from '@/lib/catalog-match';
import { detectSettings, settingsDiff, settingsFromTemplate, type SmartField, type SmartSettings, type SmartReasons } from '@/lib/session-smart';
import { REUSSITE_MODELS } from '@/lib/reussite';
import { PERIMETRES } from '@/lib/perimetres';
import { AUTH_KINDS } from '@/lib/autorisations';

type Catalog = { id: string; title: string; category: string | null; duration_hours: number };
export type WizardItem = {
  id: string;
  title: string;
  parent: string | null;
  start_at: string;
  end_at: string;
  trainees: number;
  people: { key: string; name: string; waiting?: boolean }[];
  program: { id: string; title: string } | null;
  roomId?: string | null;
  trainerId?: string | null;
  match: { templateId: string | null; confidence: 'sure' | 'doute' | 'none' } | null;
  modules?: { name: string; start_at: string; end_at: string; trainees: number }[];
};

const STEPS = ['Formation', 'Session', 'Documents', 'Récapitulatif'] as const;
const LEVEL = { tres: 'Très proche', proche: 'Proche', possible: 'Possible' } as const;
const d2 = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const hm = (iso: string) => iso.slice(11, 16).replace(':', 'h');

/** Une ligne de réglage : interrupteur, explication, et pourquoi il est proposé. */
function Toggle({ on, onChange, label, desc, reason, fromTpl, children }: { on: boolean; onChange: (v: boolean) => void; label: string; desc: string; reason?: string; fromTpl?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`pw-toggle${on ? ' on' : ''}`}>
      <label className="pw-toggle-main">
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
        <span className="pw-switch" aria-hidden />
        <span className="pw-toggle-text">
          <strong>{label}</strong>
          <small>{desc}</small>
          {reason ? (
            <em className="pw-reason"><Sparkles size={11} aria-hidden /> Détecté : {reason}</em>
          ) : fromTpl && on ? (
            <em className="pw-reason tpl">Réglage de la formation</em>
          ) : null}
        </span>
      </label>
      {on && children && <div className="pw-toggle-extra">{children}</div>}
    </div>
  );
}

/**
 * Assistant « Placer » d'un module Digiforma, en 4 étapes :
 * 1. formation du catalogue (les plus proches du nom Digiforma, ou session personnalisée) ;
 * 2. nom, salle, formateur, parcours ;
 * 3. documents et réglages, détectés d'après les noms (cette session seulement) ;
 * 4. récapitulatif, puis création.
 */
export function PlaceWizard({
  item,
  catalog,
  rooms,
  trainers,
  programs,
  onClose,
}: {
  item: WizardItem;
  catalog: Catalog[];
  rooms: { id: string; name: string }[];
  trainers: { id: string; name: string }[];
  programs: { id: string; title: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);
  const [step, setStep] = useState(0);
  const ranked = useMemo(() => rankCatalog(item.title, item.parent || '', catalog), [item.title, item.parent, catalog]);
  // Formation proposée d'office : celle reconnue avec certitude, sinon la première « très proche » / « proche ».
  const initialTpl = item.match?.confidence === 'sure' && item.match.templateId ? item.match.templateId : ranked[0] && ranked[0].level !== 'possible' ? ranked[0].id : '';
  const [tplId, setTplId] = useState<string>(initialTpl);
  const [searching, setSearching] = useState(false);
  const [tplRow, setTplRow] = useState<any | null>(null);
  const [loadingTpl, setLoadingTpl] = useState(false);
  const tpl = catalog.find((t) => t.id === tplId) || null;

  // Étape 2
  const [nameMode, setNameMode] = useState<'digiforma' | 'catalogue' | 'autre'>('digiforma');
  const [customName, setCustomName] = useState(item.title);
  const [roomId, setRoomId] = useState(item.roomId || '');
  const [trainerId, setTrainerId] = useState(item.trainerId || '');
  const [programId, setProgramId] = useState(item.program?.id || '');
  const title = nameMode === 'catalogue' && tpl ? tpl.title : nameMode === 'autre' ? customName.trim() || item.title : item.title;

  // Étape 3 : réglages de départ (formation) + détection d'après les noms.
  const base = useMemo(() => settingsFromTemplate(tplRow), [tplRow]);
  const names = useMemo(() => [item.title, ...(item.modules || []).map((m) => m.name)], [item.title, item.modules]);
  const context = useMemo(() => [item.parent || '', tpl?.title || ''], [item.parent, tpl?.title]);
  const detected = useMemo(() => detectSettings(names, base, context), [names, base, context]);
  const [settings, setSettings] = useState<SmartSettings>(detected.settings);
  const [reasons, setReasons] = useState<SmartReasons>(detected.reasons);
  // Formation changée : réglages recalculés.
  useEffect(() => {
    setSettings(detected.settings);
    setReasons(detected.reasons);
  }, [detected]);
  const set = <K extends SmartField>(k: K, v: SmartSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    let alive = true;
    if (!tplId) {
      setTplRow(null);
      return;
    }
    setLoadingTpl(true);
    import('@/app/digiforma/actions')
      .then((m) => m.templateDefaults(tplId))
      .then((r) => alive && setTplRow(r.ok ? r.template : null))
      .catch(() => alive && setTplRow(null))
      .finally(() => alive && setLoadingTpl(false));
    return () => {
      alive = false;
    };
  }, [tplId]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<{ text: string; sessionId: string } | null>(null);
  const close = () => ref.current?.close();
  const diff = tplRow ? settingsDiff(settings, base) : settings;
  const ownSettings = !tplRow || Object.keys(diff).length > 0;

  async function place() {
    setBusy(true);
    setError(null);
    const { placeDigiformaModule } = await import('@/app/digiforma/actions');
    const r = await placeDigiformaModule(item.id, tplId || null, programId || null, { roomId: roomId || null, trainerId: trainerId || null }, { title, settings: diff as Record<string, unknown> });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    const warn = [r.warning, r.settingsWarning].filter(Boolean).join(' · ');
    if (warn) return setWarning({ text: warn, sessionId: r.sessionId });
    close();
    router.push(`/sessions/${r.sessionId}`);
  }

  const docs: { label: string; on: boolean }[] = [
    { label: 'Tour de table', on: settings.tour_de_table },
    { label: 'Fiches d’appréciation', on: settings.fiche_appreciation },
    { label: `Périmètre ${PERIMETRES.find((p) => p.key === settings.perimetre_habilitation)?.label.replace(/^Module\s+/, '') || ''}`, on: settings.fiche_appreciation && Boolean(settings.perimetre_habilitation) },
    { label: 'Certificat d’habilitation', on: settings.habilitation_symbols === '*' },
    { label: 'Titre d’habilitation exigé', on: settings.titre_habilitation },
    { label: 'Certificats de réalisation', on: settings.certificat_realisation },
    { label: 'Grille IRVE', on: settings.grille_irve },
    { label: 'Grille Maintenance IRVE', on: settings.grille_maintenance },
    ...settings.attestation_reussite.map((k) => ({ label: `Réussite ${REUSSITE_MODELS.find((m) => m.key === k)?.label || k}`, on: true })),
    { label: 'Initial / Recyclage', on: settings.recyclage_available },
    { label: 'Départ anticipé', on: settings.early_departure },
    ...settings.authorizations.map((k) => ({ label: AUTH_KINDS.find((a) => a.kind === k)?.short || k, on: true })),
  ];

  return (
    <dialog ref={ref} className="modal place-modal pw" aria-labelledby="pw-title" onClose={onClose}>
      <div className="place-body">
        <div className="modal-head">
          <div>
            <h2 id="pw-title">Placer la session</h2>
            <small className="hint">Digiforma : <strong>{item.title}</strong>{item.parent && item.parent !== item.title ? ` · ${item.parent}` : ''}</small>
          </div>
          <button type="button" className="icon ghost" onClick={close} aria-label="Fermer"><X size={18} /></button>
        </div>
        <ol className="pw-steps" aria-label="Étapes">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>
              <button type="button" onClick={() => setStep(i)} disabled={i > step + 1 || busy}>
                <span className="pw-num">{i < step ? <Check size={12} aria-hidden /> : i + 1}</span> {s}
              </button>
            </li>
          ))}
        </ol>

        <div className="modal-body place-content">
          {step === 0 && (
            <>
              <p className="pw-lead">Quelle formation du catalogue correspond à ce module ? Ses documents et réglages serviront de base.</p>
              <div className="pw-options" role="radiogroup" aria-label="Formation du catalogue">
                {ranked.map((r) => {
                  const c = catalog.find((t) => t.id === r.id);
                  return (
                    <button key={r.id} type="button" role="radio" aria-checked={tplId === r.id} className={`pw-option${tplId === r.id ? ' on' : ''}`} onClick={() => setTplId(r.id)}>
                      <span className="pw-radio" aria-hidden />
                      <span className="pw-option-text">
                        <strong>{r.title}</strong>
                        <small>{[c?.category, c?.duration_hours ? `${c.duration_hours} h` : null].filter(Boolean).join(' · ')}</small>
                      </span>
                      <span className={`pw-level ${r.level}`}>{LEVEL[r.level]}</span>
                    </button>
                  );
                })}
                {tplId && !ranked.some((r) => r.id === tplId) && tpl && (
                  <button type="button" role="radio" aria-checked className="pw-option on">
                    <span className="pw-radio" aria-hidden />
                    <span className="pw-option-text"><strong>{tpl.title}</strong><small>Choisie dans le catalogue</small></span>
                  </button>
                )}
                <button type="button" role="radio" aria-checked={!tplId} className={`pw-option${!tplId ? ' on' : ''}`} onClick={() => setTplId('')}>
                  <span className="pw-radio" aria-hidden />
                  <span className="pw-option-text">
                    <strong>Aucune : session personnalisée</strong>
                    <small>Réglages proposés d’après le nom Digiforma, pour cette session seulement.</small>
                  </span>
                </button>
              </div>
              {searching ? (
                <div className="pw-search">
                  <TemplatePicker templates={catalog} value={tplId} onChange={(id) => { setTplId(id); setSearching(false); }} />
                  <button type="button" className="small ghost" onClick={() => setSearching(false)}>Fermer</button>
                </div>
              ) : (
                <button type="button" className="small ghost" onClick={() => setSearching(true)}><Search size={13} aria-hidden /> Chercher une autre formation du catalogue</button>
              )}
              {ranked.length === 0 && <p className="hint">Aucune formation du catalogue ne ressemble à ce nom : la session sera personnalisée.</p>}
            </>
          )}

          {step === 1 && (
            <>
              <div className="pw-field">
                <span className="pw-label">Nom de la session (planning et documents)</span>
                <div className="pw-names" role="radiogroup">
                  <label className={nameMode === 'digiforma' ? 'on' : ''}>
                    <input type="radio" checked={nameMode === 'digiforma'} onChange={() => setNameMode('digiforma')} /> <span><small>Nom Digiforma</small>{item.title}</span>
                  </label>
                  {tpl && (
                    <label className={nameMode === 'catalogue' ? 'on' : ''}>
                      <input type="radio" checked={nameMode === 'catalogue'} onChange={() => setNameMode('catalogue')} /> <span><small>Nom du catalogue</small>{tpl.title}</span>
                    </label>
                  )}
                  <label className={nameMode === 'autre' ? 'on' : ''}>
                    <input type="radio" checked={nameMode === 'autre'} onChange={() => setNameMode('autre')} /> <span><small>Autre nom</small>
                      <input className="input" value={customName} onFocus={() => setNameMode('autre')} onChange={(e) => setCustomName(e.target.value)} maxLength={200} aria-label="Autre nom" />
                    </span>
                  </label>
                </div>
              </div>
              <div className="place-summary">
                <span className="place-when">
                  {d2(item.start_at)}{item.start_at.slice(0, 10) !== item.end_at.slice(0, 10) ? ` → ${d2(item.end_at)}` : ''} · {hm(item.start_at)}–{hm(item.end_at)}
                </span>
                {item.modules && item.modules.length > 1 && (
                  <span className="place-modules">
                    {item.modules.map((mo, i) => <span key={i} className="ta-module"><b>{mo.name}</b> · {mo.trainees} stag.</span>)}
                  </span>
                )}
              </div>
              <div className="place-fields">
                <label>
                  Salle
                  <select className="input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                    <option value="">À affecter (choisir plus tard)</option>
                    {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}{r.id === item.roomId ? ' (Digiforma)' : ''}</option>)}
                  </select>
                </label>
                <label>
                  Formateur
                  <select className="input" value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
                    <option value="">À choisir plus tard</option>
                    {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.id === item.trainerId ? ' (Digiforma)' : ''}</option>)}
                  </select>
                </label>
                {programs.length > 0 && (
                  <label>
                    Parcours
                    <select className="input" value={programId} onChange={(e) => setProgramId(e.target.value)}>
                      <option value="">Aucun</option>
                      {programs.map((p) => <option key={p.id} value={p.id}>{p.title}{p.id === item.program?.id ? ' (détecté)' : ''}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <div className="place-people">
                <span className="place-label">{item.trainees} stagiaire{item.trainees > 1 ? 's' : ''}</span>
                <span className="place-chips">
                  {item.people.map((p) => <span key={p.key} className={`to-assign-person${p.waiting ? ' waiting' : ''}`}>{p.name}</span>)}
                </span>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="pw-lead">
                {loadingTpl ? <><Loader2 size={13} className="spin" aria-hidden /> Lecture de la formation…</> : <>Documents et réglages proposés{tpl ? ` (formation « ${tpl.title} »` : ' (d’après le nom'}{tpl ? ' + détection d’après les noms)' : ')'}. Ils s’appliquent à <strong>cette session seulement</strong>.</>}
              </p>
              <div className="pw-group">
                <h3>Dossier</h3>
                <Toggle on={settings.tour_de_table} onChange={(v) => set('tour_de_table', v)} label="Tour de table" desc="Début de formation : attentes, EPI, habilitations." reason={reasons.tour_de_table} fromTpl={Boolean(tplRow)} />
                <Toggle on={settings.fiche_appreciation} onChange={(v) => set('fiche_appreciation', v)} label="Fiches d’appréciation" desc="Avis du formateur → attestations de fin de formation et appréciation des compétences." reason={reasons.fiche_appreciation} fromTpl={base.fiche_appreciation}>
                  <label className="pw-inline">Codification SERECT <input className="input" value={settings.codification} placeholder="Vide = intitulé en majuscules" onChange={(e) => set('codification', e.target.value)} /></label>
                  <label className="pw-inline">
                    Périmètre d’habilitation (3e page)
                    <select className="input" value={settings.perimetre_habilitation} onChange={(e) => set('perimetre_habilitation', e.target.value)}>
                      <option value="">Aucun</option>
                      {PERIMETRES.filter((p) => p.image).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                  </label>
                  {reasons.perimetre_habilitation && <em className="pw-reason"><Sparkles size={11} aria-hidden /> Périmètre détecté : {reasons.perimetre_habilitation}</em>}
                </Toggle>
                <Toggle on={settings.certificat_realisation} onChange={(v) => set('certificat_realisation', v)} label="Certificats de réalisation" desc="Le formateur choisit la nature de l’action pour chaque stagiaire." reason={reasons.certificat_realisation} fromTpl={base.certificat_realisation} />
              </div>
              <div className="pw-group">
                <h3>Habilitation</h3>
                <Toggle on={settings.habilitation_symbols === '*'} onChange={(v) => set('habilitation_symbols', v ? '*' : '')} label="Certificat d’habilitation" desc="Le formateur choisit les symboles de chaque stagiaire." reason={reasons.habilitation_symbols} fromTpl={base.habilitation_symbols === '*'} />
                <Toggle on={settings.titre_habilitation} onChange={(v) => set('titre_habilitation', v)} label="Titre d’habilitation exigé" desc="Recyclage : le stagiaire fournit son titre actuel, sinon attestation bloquée." reason={reasons.titre_habilitation} fromTpl={base.titre_habilitation} />
                <Toggle on={settings.recyclage_available} onChange={(v) => set('recyclage_available', v)} label="Initial / Recyclage" desc="Chaque stagiaire est classé initial ou recyclage (durée et objectifs propres)." reason={reasons.recyclage_available} fromTpl={base.recyclage_available} />
              </div>
              <div className="pw-group">
                <h3>Évaluations</h3>
                <Toggle on={settings.grille_irve} onChange={(v) => set('grille_irve', v)} label="Grille d’évaluation IRVE" desc="Grille pratique P1 / P2 / P3, note sur 20." reason={reasons.grille_irve} fromTpl={base.grille_irve} />
                <Toggle on={settings.grille_maintenance} onChange={(v) => set('grille_maintenance', v)} label="Grille Maintenance IRVE" desc="Grille MA1 / MA2 / MA3." reason={reasons.grille_maintenance} fromTpl={base.grille_maintenance} />
                <div className={`pw-toggle${settings.attestation_reussite.length ? ' on' : ''}`}>
                  <div className="pw-toggle-text pw-pad">
                    <strong>Attestations de réussite</strong>
                    <small>Une par stagiaire et par module suivi.</small>
                    {reasons.attestation_reussite && <em className="pw-reason"><Sparkles size={11} aria-hidden /> Détecté : {reasons.attestation_reussite}</em>}
                    <span className="hab-chips" style={{ marginTop: 6 }}>
                      {REUSSITE_MODELS.map((m) => {
                        const on = settings.attestation_reussite.includes(m.key);
                        return (
                          <button key={m.key} type="button" className={`hab-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => set('attestation_reussite', on ? settings.attestation_reussite.filter((k) => k !== m.key) : [...settings.attestation_reussite, m.key])}>
                            {m.label}
                          </button>
                        );
                      })}
                    </span>
                  </div>
                </div>
              </div>
              <div className="pw-group">
                <h3>Stagiaires</h3>
                <Toggle on={settings.early_departure} onChange={(v) => set('early_departure', v)} label="Départ anticipé" desc="QR code pour partir avant la fin (attestation et décharge)." reason={reasons.early_departure} fromTpl={Boolean(tplRow)} />
                {AUTH_KINDS.map((a) => (
                  <Toggle
                    key={a.kind}
                    on={settings.authorizations.includes(a.kind)}
                    onChange={(v) => set('authorizations', v ? [...settings.authorizations, a.kind] : settings.authorizations.filter((k) => k !== a.kind))}
                    label={a.short}
                    desc="Signé une seule fois par le stagiaire (QR code)."
                    fromTpl={base.authorizations.includes(a.kind)}
                  />
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <div className="pw-recap">
              <dl>
                <dt>Session</dt>
                <dd><strong>{title}</strong></dd>
                <dt>Formation</dt>
                <dd>{tpl ? tpl.title : 'Session personnalisée'}</dd>
                <dt>Dates</dt>
                <dd>{d2(item.start_at)}{item.start_at.slice(0, 10) !== item.end_at.slice(0, 10) ? ` → ${d2(item.end_at)}` : ''}</dd>
                <dt>Salle</dt>
                <dd>{rooms.find((r) => r.id === roomId)?.name || 'À affecter'}</dd>
                <dt>Formateur</dt>
                <dd>{trainers.find((t) => t.id === trainerId)?.name || 'À choisir plus tard'}</dd>
                {programs.length > 0 && (
                  <>
                    <dt>Parcours</dt>
                    <dd>{programs.find((p) => p.id === programId)?.title || 'Aucun'}</dd>
                  </>
                )}
                <dt>Stagiaires</dt>
                <dd>{item.trainees} (repris de Digiforma, modules et jours compris)</dd>
                <dt>Documents</dt>
                <dd className="pw-docs">
                  {docs.filter((x) => x.on).map((x) => <span key={x.label} className="pw-doc"><FileText size={11} aria-hidden /> {x.label}</span>)}
                </dd>
              </dl>
              <p className="hint">
                {ownSettings
                  ? 'Ces réglages seront propres à cette session (le catalogue n’est pas modifié). Tu pourras les changer ensuite avec la roue crantée de la fiche.'
                  : 'Réglages identiques à la formation du catalogue.'}
              </p>
            </div>
          )}

          {error && <div role="alert" className="alert alert-error">{error}</div>}
          {warning && (
            <div role="alert" className="alert alert-warning">
              Session créée. {warning.text}{' '}
              <button type="button" className="small" onClick={() => { close(); router.push(`/sessions/${warning.sessionId}`); }}>Ouvrir la session</button>
            </div>
          )}
        </div>
        <div className="modal-foot">
          {step > 0 ? (
            <button type="button" onClick={() => setStep(step - 1)} disabled={busy}><ChevronLeft size={14} aria-hidden /> Retour</button>
          ) : (
            <button type="button" onClick={close}>Annuler</button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="primary" onClick={() => setStep(step + 1)} disabled={step === 1 && nameMode === 'autre' && !customName.trim()}>
              Suivant <ChevronRight size={14} aria-hidden />
            </button>
          ) : (
            <button type="button" className="primary" onClick={place} disabled={busy || Boolean(warning)}>
              {busy ? <><Loader2 size={14} className="spin" aria-hidden /> Création…</> : <>Placer la session <ChevronRight size={14} aria-hidden /></>}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
