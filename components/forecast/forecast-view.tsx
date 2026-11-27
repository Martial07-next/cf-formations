'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarCheck2, ChevronLeft, ChevronRight, CornerDownRight, Info, Plus, Sparkles, Trash2, Wand2, X, EyeOff, Users } from 'lucide-react';
import { addForecast, dropForecast, generateForecast, updateForecast, type ForecastInput } from '@/app/previsionnel/actions';
import { forecastIso, workingDaysOf, type DfForecast, type Forecast } from '@/lib/forecast';
import { askConfirm } from '@/lib/confirm-dialog';

type Room = { id: string; name: string };
type Trainer = { id: string; name: string; color: string | null };
type Real = { id: string; title: string; status: string; room_id: string | null; start_date: string; end_date: string; trainer: string | null };

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const fr = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const frLong = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const period = (f: { start_date: string; end_date: string }) => (f.start_date === f.end_date ? frLong(f.start_date) : `${frLong(f.start_date)} → ${frLong(f.end_date)}`);
const firstName = (n: string) => n.split(/\s+/).find((w) => w && w !== w.toUpperCase()) || n;
const on = (x: { start_date: string; end_date: string }, d: string) => x.start_date <= d && x.end_date >= d && workingDaysOf(x.start_date, x.end_date).includes(d);
const placeHref = (d: DfForecast, room: string | null, trainer: string | null) =>
  `/?week=${d.start_date}&placer=${encodeURIComponent(d.key)}${room ? `&salle=${room}` : ''}${trainer ? `&formateur=${trainer}` : ''}`;

/**
 * Onglet Prévisionnel : jours à gauche, salles en haut (comme le planning).
 * Sessions Digiforma à placer (pré-positionnées), prévisions de l'IA ou
 * manuelles, et en grisé les vraies sessions.
 */
export function ForecastView({
  mondayIso,
  todayIso,
  rooms,
  trainers,
  templates,
  forecasts,
  digiforma,
  real,
  migrationMissing,
}: {
  mondayIso: string;
  todayIso: string;
  rooms: Room[];
  trainers: Trainer[];
  templates: { id: string; title: string }[];
  forecasts: Forecast[];
  digiforma: DfForecast[];
  real: Real[];
  migrationMissing: boolean;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState(12);
  const [edit, setEdit] = useState<Forecast | 'new' | null>(null);
  const [dfOpen, setDfOpen] = useState<DfForecast | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dfRef = useRef<HTMLDialogElement>(null);
  const days = [0, 1, 2, 3, 4].map((i) => forecastIso.addD(mondayIso, i));
  const fridayIso = days[4];
  const go = (iso: string) => router.push(`/?vue=previsionnel&week=${iso}`, { scroll: false });

  const inWeek = <T extends { start_date: string; end_date: string }>(x: T) => x.start_date <= fridayIso && x.end_date >= mondayIso;
  const fcWeek = forecasts.filter(inWeek);
  const dfWeek = digiforma.filter(inWeek);
  const realWeek = real.filter(inWeek);
  const known = (id: string | null) => Boolean(id && rooms.some((r) => r.id === id));
  const cols = useMemo(() => {
    const list: { id: string | null; name: string }[] = rooms.map((r) => ({ id: r.id, name: r.name }));
    if ([...fcWeek, ...dfWeek].some((f) => !known(f.room_id))) list.push({ id: null, name: 'Salle à trouver' });
    return list;
  }, [rooms, fcWeek, dfWeek]); // eslint-disable-line react-hooks/exhaustive-deps
  const inCol = (col: string | null, room: string | null) => (col ? room === col : !known(room));
  const roomName = (id: string | null) => rooms.find((r) => r.id === id)?.name || 'Salle à trouver';
  const trainerOf = (id: string | null) => trainers.find((t) => t.id === id) || null;
  // Liste sous la grille : seulement la semaine affichée.
  const upcoming = [
    ...dfWeek.map((d) => ({ kind: 'df' as const, d, start: d.start_date })),
    ...fcWeek.filter((f) => f.status === 'prevu').map((f) => ({ kind: 'fc' as const, f, start: f.start_date })),
  ].sort((a, b) => a.start.localeCompare(b.start));
  const stats = {
    df: dfWeek.length,
    ai: fcWeek.filter((f) => f.status === 'prevu' && f.source === 'ia').length,
    man: fcWeek.filter((f) => f.status === 'prevu' && f.source !== 'ia').length,
    noRoom: [...dfWeek, ...fcWeek.filter((f) => f.status === 'prevu')].filter((x) => !known(x.room_id)).length,
  };
  const placed = forecasts.filter((f) => f.status === 'place').length;

  function openEdit(f: Forecast | 'new') {
    setError(null);
    setEdit(f);
    dialogRef.current?.showModal();
  }
  function openDf(d: DfForecast) {
    setDfOpen(d);
    dfRef.current?.showModal();
  }
  function generate() {
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await generateForecast(horizon);
      if (!r.ok) return setError(r.error);
      setNotice(r.count ? `L’IA a proposé ${r.count} formation${r.count > 1 ? 's' : ''} sur ${horizon} semaines.` : 'Aucune formation récurrente à prévoir sur cette période.');
      router.refresh();
    });
  }

  return (
    <section className="content forecast">
      <header className="fc-header">
        <div>
          <p className="eyebrow">Planning</p>
          <h1>Planning prévisionnel</h1>
        </div>
        <span className="fc-ai-badge" title="Estimé à l’aide d’une intelligence artificielle : rien n’est défini">
          <Sparkles size={14} aria-hidden /> Estimé par IA · non définitif
        </span>
      </header>

      <details className="fc-help">
        <summary>
          <Info size={14} aria-hidden /> Comment ça marche ? <span className="hint">Visible seulement par le bureau</span>
        </summary>
        <ol className="fc-steps">
          <li>
            <span className="fc-step df">1</span>
            <span><b>Sessions Digiforma à placer</b> : pré-positionnées dans une salle libre (celle de Digiforma, sinon la salle habituelle de la formation).</span>
          </li>
          <li>
            <span className="fc-step ai">2</span>
            <span><b>Prévisions de l’IA</b> : formations qui reviennent d’après l’historique (rythme, jour, salle, formateur), avec un % de confiance.</span>
          </li>
          <li>
            <span className="fc-step ok">3</span>
            <span><b>« Positionner sur le planning »</b> : ouvre la configuration complète de la vraie session. Rien n’est réservé avant.</span>
          </li>
        </ol>
      </details>
      {migrationMissing && <p className="alert alert-error">Prévisions de l’IA : exécute d’abord la migration 80 (supabase/migration_phase80.sql) dans Supabase. Les sessions Digiforma sont déjà pré-positionnées.</p>}

      <div className="toolbar">
        <div className="period">
          <button type="button" className="icon ghost" aria-label="Semaine précédente" onClick={() => go(forecastIso.addD(mondayIso, -7))}>
            <ChevronLeft size={18} />
          </button>
          <strong className="fc-week">Semaine du {fr(mondayIso)}</strong>
          <button type="button" className="icon ghost" aria-label="Semaine suivante" onClick={() => go(forecastIso.addD(mondayIso, 7))}>
            <ChevronRight size={18} />
          </button>
          <button type="button" className="small ghost" onClick={() => go(todayIso)}>Cette semaine</button>
        </div>
        <span className="spacer" />
        {!migrationMissing && (
          <>
            <label className="forecast-horizon">
              <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} aria-label="Période à prévoir">
                <option value={8}>8 semaines</option>
                <option value={12}>12 semaines</option>
                <option value={26}>6 mois</option>
              </select>
            </label>
            <button type="button" className="small" onClick={generate} disabled={isPending}>
              <Wand2 size={14} aria-hidden /> {isPending ? 'L’IA réfléchit…' : 'Générer avec l’IA'}
            </button>
            <button type="button" className="small primary" onClick={() => openEdit('new')}>
              <Plus size={14} aria-hidden /> Ajouter une prévision
            </button>
          </>
        )}
      </div>
      <div className="fc-stats" aria-label="Cette semaine">
        <span className={`fc-stat df${stats.df ? '' : ' zero'}`}><b>{stats.df}</b> Digiforma à placer</span>
        <span className={`fc-stat ai${stats.ai ? '' : ' zero'}`}><b>{stats.ai}</b> prévision{stats.ai > 1 ? 's' : ''} de l’IA</span>
        <span className={`fc-stat man${stats.man ? '' : ' zero'}`}><b>{stats.man}</b> ajoutée{stats.man > 1 ? 's' : ''} à la main</span>
        {stats.noRoom > 0 && <span className="fc-stat warn"><b>{stats.noRoom}</b> salle{stats.noRoom > 1 ? 's' : ''} à trouver</span>}
      </div>
      {notice && <p role="status" className="alert alert-success">{notice}</p>}
      {error && <p role="alert" className="alert alert-error">{error}</p>}

      <div className="forecast-grid-wrap">
        <table className="fg-table" style={{ ['--n' as any]: cols.length }} aria-label={`Prévisionnel, semaine du ${fr(mondayIso)}`}>
          <thead>
            <tr>
              <th className="fg-day-h">Jour</th>
              {cols.map((c) => (
                <th key={c.id || 'none'} className={c.id ? '' : 'fg-none'}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d, i) => (
              <tr key={d} className={d === todayIso ? 'today' : ''}>
                <th scope="row" className="fg-day">
                  <span>{DAYS[i]}</span>
                  <b>{fr(d)}</b>
                </th>
                {cols.map((c) => {
                  const rs = c.id ? realWeek.filter((s) => s.room_id === c.id && on(s, d)) : [];
                  const dfs = dfWeek.filter((x) => inCol(c.id, x.room_id) && on(x, d));
                  const fcs = fcWeek.filter((x) => inCol(c.id, x.room_id) && on(x, d));
                  return (
                    <td key={c.id || 'none'}>
                      {dfs.map((x) => {
                        const suite = x.start_date < d;
                        const t = trainerOf(x.trainer_id);
                        return (
                          <button key={x.key} type="button" className="fg-card df" onClick={() => openDf(x)} title={x.why}>
                            <span className="fg-title">{suite && <CornerDownRight size={11} aria-label="suite" />} {x.title}</span>
                            <small>
                              Digiforma · <Users size={10} aria-hidden /> {x.trainees}
                              {t ? ` · ${firstName(t.name)}` : ''}
                            </small>
                          </button>
                        );
                      })}
                      {fcs.map((f) => {
                        const suite = f.start_date < d;
                        const t = trainerOf(f.trainer_id);
                        return (
                          <button
                            key={f.id}
                            type="button"
                            className={`fg-card ${f.status}${f.source === 'ia' ? ' ai' : ' man'}`}
                            style={{ ['--c' as any]: t?.color || undefined }}
                            onClick={() => openEdit(f)}
                            title={f.reason || 'Prévision ajoutée à la main'}
                          >
                            <span className="fg-title">{suite && <CornerDownRight size={11} aria-label="suite" />} {f.title}</span>
                            <small>
                              {f.status === 'place' ? '✓ Positionnée' : f.source === 'ia' ? `IA · ${f.confidence ?? '?'} %` : 'À la main'}
                              {t ? ` · ${firstName(t.name)}` : ''}
                            </small>
                          </button>
                        );
                      })}
                      {rs.map((s) => (
                        <Link key={s.id} href={`/sessions/${s.id}`} className="fg-card real" title="Session réelle du planning">
                          <span className="fg-title">{s.start_date < d && <CornerDownRight size={11} aria-label="suite" />} {s.title}</span>
                          <small>Planning{s.trainer ? ` · ${firstName(s.trainer)}` : ''}</small>
                        </Link>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="legend">
        <span className="legend-item"><span className="fg-swatch df" /> Session Digiforma à placer (salle proposée)</span>
        <span className="legend-item"><span className="fg-swatch ai" /> Prévision de l’IA (% = confiance)</span>
        <span className="legend-item"><span className="fg-swatch man" /> Ajoutée à la main</span>
        <span className="legend-item"><span className="fg-swatch real" /> Déjà sur le planning</span>
        {placed > 0 && <span className="legend-item"><CalendarCheck2 size={13} aria-hidden /> {placed} prévision{placed > 1 ? 's' : ''} positionnée{placed > 1 ? 's' : ''}</span>}
      </p>

      <h2 className="sub-heading">Cette semaine · {upcoming.length} à positionner</h2>
      {!upcoming.length ? (
        <p className="empty">Rien à positionner cette semaine. Change de semaine, clique sur « Générer avec l’IA » ou ajoute une prévision à la main.</p>
      ) : (
        <ul className="forecast-list">
          {upcoming.slice(0, 100).map((u) =>
            u.kind === 'df' ? (
              <li key={u.d.key} className="df">
                <button type="button" className="fl-main" onClick={() => go(u.d.start_date)} title="Voir la semaine">
                  <span className="fl-date">{period(u.d)}</span>
                  <strong>{u.d.title}</strong>
                  <small>
                    <span className="fl-tag df">Digiforma</span> {roomName(u.d.room_id)}
                    {trainerOf(u.d.trainer_id) ? ` · ${trainerOf(u.d.trainer_id)!.name}` : ''} · {u.d.trainees} stagiaire{u.d.trainees > 1 ? 's' : ''}
                  </small>
                </button>
                <span className="fl-actions">
                  <button type="button" className="small ghost" onClick={() => openDf(u.d)}>Détails</button>
                  <Link className="btn small primary" href={placeHref(u.d, u.d.room_id, u.d.trainer_id)}>Positionner</Link>
                </span>
              </li>
            ) : (
              <li key={u.f.id}>
                <button type="button" className="fl-main" onClick={() => go(u.f.start_date)} title="Voir la semaine">
                  <span className="fl-date">{period(u.f)}</span>
                  <strong>{u.f.title}</strong>
                  <small>
                    <span className={`fl-tag ${u.f.source === 'ia' ? 'ai' : 'man'}`}>{u.f.source === 'ia' ? `IA ${u.f.confidence ?? '?'} %` : 'À la main'}</span> {roomName(u.f.room_id)}
                    {trainerOf(u.f.trainer_id) ? ` · ${trainerOf(u.f.trainer_id)!.name}` : ''}
                  </small>
                </button>
                <span className="fl-actions">
                  <button type="button" className="small ghost" onClick={() => openEdit(u.f)}>Détails</button>
                  <Link className="btn small primary" href={`/?week=${u.f.start_date}&prevision=${u.f.id}`}>Positionner</Link>
                </span>
              </li>
            )
          )}
        </ul>
      )}

      <dialog ref={dialogRef} className="modal forecast-modal" onClose={() => setEdit(null)} aria-labelledby="fc-title">
        {edit && (
          <ForecastEditor
            key={edit === 'new' ? 'new' : edit.id}
            f={edit === 'new' ? null : edit}
            mondayIso={mondayIso}
            rooms={rooms}
            trainers={trainers}
            templates={templates}
            onClose={() => dialogRef.current?.close()}
            onSaved={(msg) => {
              setNotice(msg);
              dialogRef.current?.close();
              router.refresh();
            }}
          />
        )}
      </dialog>
      <dialog ref={dfRef} className="modal forecast-modal" onClose={() => setDfOpen(null)} aria-labelledby="df-title">
        {dfOpen && <DfDetails key={dfOpen.key} d={dfOpen} rooms={rooms} trainers={trainers} onClose={() => dfRef.current?.close()} />}
      </dialog>
    </section>
  );
}

/** Session Digiforma à placer : salle et formateur proposés, modifiables avant de la positionner. */
function DfDetails({ d, rooms, trainers, onClose }: { d: DfForecast; rooms: Room[]; trainers: Trainer[]; onClose: () => void }) {
  const [room, setRoom] = useState(d.room_id || '');
  const [trainer, setTrainer] = useState(d.trainer_id || '');
  return (
    <>
      <div className="modal-head">
        <h2 id="df-title">Session Digiforma à placer</h2>
        <button type="button" className="icon ghost" aria-label="Fermer" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="modal-body">
        <p className="df-head">
          <strong>{d.title}</strong>
          {d.parent && d.parent !== d.title && <span className="hint">Session Digiforma : {d.parent}</span>}
          <span className="hint">
            {period(d)} · {d.start_time.replace(':', 'h')} – {d.end_time.replace(':', 'h')} · {d.trainees} stagiaire{d.trainees > 1 ? 's' : ''}
          </span>
        </p>
        <p className="forecast-why">
          <Sparkles size={15} aria-hidden />
          <span>
            <b>Pré-positionnement proposé</b> : {d.why}
            {d.df_place ? ` Sur Digiforma : ${d.df_place}.` : ''}
          </span>
        </p>
        <div className="form-row">
          <label className="field">
            <span>Salle</span>
            <select value={room} onChange={(e) => setRoom(e.target.value)}>
              <option value="">À affecter</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}{r.id === d.room_id ? ' (proposée)' : ''}{r.id === d.df_room_id ? ' (Digiforma)' : ''}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Formateur</span>
            <select value={trainer} onChange={(e) => setTrainer(e.target.value)}>
              <option value="">À définir</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.id === d.df_trainer_id ? ' (Digiforma)' : ''}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint">
          <Info size={13} aria-hidden style={{ verticalAlign: '-2px' }} /> « Positionner sur le planning » ouvre la fenêtre « Placer » de la session Digiforma (formation, parcours, salle, formateur, documents) : la
          session reste reliée à Digiforma (stagiaires et modules à jour).
        </p>
      </div>
      <div className="modal-foot forecast-foot">
        <span className="spacer" />
        <Link className="btn small primary" href={placeHref(d, room || null, trainer || null)}>
          <CalendarCheck2 size={14} aria-hidden /> Positionner sur le planning
        </Link>
      </div>
    </>
  );
}

function ForecastEditor({
  f,
  mondayIso,
  rooms,
  trainers,
  templates,
  onClose,
  onSaved,
}: {
  f: Forecast | null;
  mondayIso: string;
  rooms: Room[];
  trainers: Trainer[];
  templates: { id: string; title: string }[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [v, setV] = useState<ForecastInput>({
    template_id: f?.template_id || null,
    title: f?.title || '',
    room_id: f?.room_id || null,
    trainer_id: f?.trainer_id || null,
    start_date: f?.start_date || mondayIso,
    end_date: f?.end_date || mondayIso,
    start_time: f?.start_time || '08:00',
    end_time: f?.end_time || '16:00',
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();
  const set = (patch: Partial<ForecastInput>) => setV((x) => ({ ...x, ...patch }));
  const placed = f?.status === 'place';

  function save() {
    setError(null);
    start(async () => {
      const r = f ? await updateForecast(f.id, v) : await addForecast(v);
      if (!r.ok) return setError(r.error);
      onSaved(f ? 'Prévision modifiée.' : 'Prévision ajoutée.');
    });
  }
  async function drop() {
    if (!f) return;
    const ia = Boolean(f.ai_key);
    if (!(await askConfirm(ia ? 'Ignorer cette prévision ? L’IA ne la proposera plus.' : 'Supprimer cette prévision ?', { danger: !ia, confirmLabel: ia ? 'Ignorer' : 'Supprimer' }))) return;
    start(async () => {
      const r = await dropForecast(f.id);
      if (!r.ok) return setError(r.error);
      onSaved(ia ? 'Prévision ignorée.' : 'Prévision supprimée.');
    });
  }

  return (
    <>
      <div className="modal-head">
        <h2 id="fc-title">{f ? (f.source === 'ia' ? 'Prévision de l’IA' : 'Prévision') : 'Nouvelle prévision'}</h2>
        <button type="button" className="icon ghost" aria-label="Fermer" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="modal-body">
        {f?.source === 'ia' && f.reason && (
          <p className="forecast-why">
            <Sparkles size={15} aria-hidden />
            <span>
              <b>Pourquoi l’IA la propose</b> (confiance {f.confidence ?? '?'} %) : {f.reason}
            </span>
          </p>
        )}
        {placed && f?.placed_session_id && (
          <p className="alert alert-success">
            Déjà positionnée sur le planning : <Link href={`/sessions/${f.placed_session_id}`}>ouvrir la session</Link>.
          </p>
        )}
        <div className="form-row">
          <label className="field" style={{ flex: 2 }}>
            <span>Formation</span>
            <select
              value={v.template_id || ''}
              onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value);
                set({ template_id: t?.id || null, title: t ? t.title : v.title });
              }}
            >
              <option value="">Formation hors catalogue</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </label>
        </div>
        {!v.template_id && (
          <label className="field">
            <span>Intitulé</span>
            <input value={v.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ex. H0B0 initial" />
          </label>
        )}
        <div className="form-row">
          <label className="field">
            <span>Du</span>
            <input type="date" value={v.start_date} onChange={(e) => set({ start_date: e.target.value, end_date: v.end_date < e.target.value ? e.target.value : v.end_date })} />
          </label>
          <label className="field">
            <span>Au</span>
            <input type="date" value={v.end_date} min={v.start_date} onChange={(e) => set({ end_date: e.target.value })} />
          </label>
          <label className="field">
            <span>De</span>
            <input type="time" value={v.start_time} onChange={(e) => set({ start_time: e.target.value })} />
          </label>
          <label className="field">
            <span>À</span>
            <input type="time" value={v.end_time} onChange={(e) => set({ end_time: e.target.value })} />
          </label>
        </div>
        <div className="form-row">
          <label className="field">
            <span>Salle</span>
            <select value={v.room_id || ''} onChange={(e) => set({ room_id: e.target.value || null })}>
              <option value="">Salle à trouver</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Formateur</span>
            <select value={v.trainer_id || ''} onChange={(e) => set({ trainer_id: e.target.value || null })}>
              <option value="">À définir</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint">
          <Info size={13} aria-hidden style={{ verticalAlign: '-2px' }} /> Une prévision n’est pas une session : rien n’est réservé ni envoyé. « Positionner sur le planning » ouvre la configuration complète de la session (formation, salle, formateur, modules, stagiaires).
        </p>
        {error && <p role="alert" className="field-error">{error}</p>}
      </div>
      <div className="modal-foot forecast-foot">
        {f && (
          <button type="button" className="small ghost" onClick={drop} disabled={isPending}>
            {f.ai_key ? <><EyeOff size={14} aria-hidden /> Ignorer</> : <><Trash2 size={14} aria-hidden /> Supprimer</>}
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="small" onClick={save} disabled={isPending}>
          {isPending ? '…' : f ? 'Enregistrer' : 'Ajouter'}
        </button>
        {f && !placed && (
          <Link className="btn small primary" href={`/?week=${v.start_date}&prevision=${f.id}`}>
            <CalendarCheck2 size={14} aria-hidden /> Positionner sur le planning
          </Link>
        )}
      </div>
    </>
  );
}
