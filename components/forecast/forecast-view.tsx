'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarCheck2, ChevronLeft, ChevronRight, Info, Plus, Sparkles, Trash2, Wand2, X, EyeOff } from 'lucide-react';
import { addForecast, dropForecast, generateForecast, updateForecast, type ForecastInput } from '@/app/previsionnel/actions';
import { forecastIso, spanInWeek, type Forecast } from '@/lib/forecast';
import { askConfirm } from '@/lib/confirm-dialog';

type Room = { id: string; name: string };
type Trainer = { id: string; name: string; color: string | null };
type Real = { id: string; title: string; status: string; room_id: string | null; start_date: string; end_date: string; trainer: string | null };

const DAYS = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.'];
const fr = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const frLong = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const period = (f: { start_date: string; end_date: string }) => (f.start_date === f.end_date ? frLong(f.start_date) : `${frLong(f.start_date)} → ${frLong(f.end_date)}`);
const firstName = (n: string) => n.split(/\s+/).find((w) => w && w !== w.toUpperCase()) || n;

/** Onglet Prévisionnel : semaine par salle, prévisions de l'IA et ajoutées à la main. */
export function ForecastView({
  mondayIso,
  todayIso,
  rooms,
  trainers,
  templates,
  forecasts,
  real,
  migrationMissing,
}: {
  mondayIso: string;
  todayIso: string;
  rooms: Room[];
  trainers: Trainer[];
  templates: { id: string; title: string }[];
  forecasts: Forecast[];
  real: Real[];
  migrationMissing: boolean;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState(12);
  const [edit, setEdit] = useState<Forecast | 'new' | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const days = [0, 1, 2, 3, 4].map((i) => forecastIso.addD(mondayIso, i));
  const go = (iso: string) => router.push(`/?vue=previsionnel&week=${iso}`, { scroll: false });

  const inWeek = forecasts.filter((f) => spanInWeek(f, mondayIso));
  const roomName = (id: string | null) => rooms.find((r) => r.id === id)?.name || 'Salle à trouver';
  const trainerOf = (id: string | null) => trainers.find((t) => t.id === id) || null;
  const rows = useMemo(() => {
    const list: { id: string | null; name: string }[] = rooms.map((r) => ({ id: r.id, name: r.name }));
    if (inWeek.some((f) => !f.room_id || !rooms.some((r) => r.id === f.room_id))) list.push({ id: null, name: 'Salle à trouver' });
    return list;
  }, [rooms, inWeek]);
  const upcoming = forecasts.filter((f) => f.status === 'prevu' && f.end_date >= todayIso);
  const placed = forecasts.filter((f) => f.status === 'place').length;

  function openEdit(f: Forecast | 'new') {
    setError(null);
    setEdit(f);
    dialogRef.current?.showModal();
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

  if (migrationMissing) {
    return (
      <section className="content">
        <p className="alert alert-error">Exécute d’abord la migration 80 (supabase/migration_phase80.sql) dans Supabase pour utiliser le prévisionnel.</p>
      </section>
    );
  }

  return (
    <section className="content forecast">
      <header>
        <div>
          <p className="eyebrow">Planning</p>
          <h1>Planning prévisionnel</h1>
        </div>
      </header>

      <div className="forecast-ai" role="note">
        <Sparkles size={18} aria-hidden />
        <div>
          <strong>Estimé à l’aide d’une intelligence artificielle · rien n’est défini</strong>
          <span>
            L’IA lit l’historique des sessions (rythme, jour, durée, salle, formateur) et propose les prochaines formations. Ce sont des estimations pour
            anticiper les salles et les formateurs : visibles seulement par le bureau, jamais envoyées aux formateurs ni aux stagiaires. Pour en faire une vraie
            session : <b>« Positionner sur le planning »</b>, puis la configuration complète de la session.
          </span>
        </div>
      </div>

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
        <label className="forecast-horizon">
          <span className="sr-only">Période</span>
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
      </div>
      {notice && <p role="status" className="alert alert-success">{notice}</p>}
      {error && <p role="alert" className="alert alert-error">{error}</p>}

      <div className="forecast-grid-wrap">
        <div className="forecast-grid" role="table" aria-label={`Prévisionnel, semaine du ${fr(mondayIso)}`}>
          <div className="fg-head" role="row">
            <span className="fg-room" role="columnheader">Salle</span>
            <div className="fg-days">
              {days.map((d, i) => (
                <span key={d} role="columnheader" className={d === todayIso ? 'today' : ''}>
                  {DAYS[i]} <b>{fr(d)}</b>
                </span>
              ))}
            </div>
          </div>
          {rows.map((row) => {
            const fcs = inWeek.filter((f) => (row.id ? f.room_id === row.id : !f.room_id || !rooms.some((r) => r.id === f.room_id)));
            const rs = row.id ? real.filter((s) => s.room_id === row.id) : [];
            return (
              <div className="fg-row" role="row" key={row.id || 'none'}>
                <span className="fg-room" role="rowheader">{row.name}</span>
                <div className="fg-days fg-cells">
                  {days.map((d) => (
                    <span key={d} className="fg-cell" aria-hidden />
                  ))}
                  {rs.map((s) => {
                    const sp = spanInWeek(s, mondayIso)!;
                    if (!sp) return null;
                    return (
                      <Link key={s.id} href={`/sessions/${s.id}`} className="fg-real" style={{ gridColumn: `${sp.col + 1} / span ${sp.span}` }} title="Session réelle du planning">
                        <span className="fg-title">{s.title}</span>
                        <small>Planning réel{s.trainer ? ` · ${firstName(s.trainer)}` : ''}</small>
                      </Link>
                    );
                  })}
                  {fcs.map((f) => {
                    const sp = spanInWeek(f, mondayIso);
                    if (!sp) return null;
                    const t = trainerOf(f.trainer_id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        className={`fg-fc ${f.status}${f.source === 'ia' ? ' ai' : ''}`}
                        style={{ gridColumn: `${sp.col + 1} / span ${sp.span}`, ['--c' as any]: t?.color || undefined }}
                        onClick={() => openEdit(f)}
                        title={f.reason || 'Prévision ajoutée à la main'}
                      >
                        <span className="fg-title">{f.title}</span>
                        <small>
                          {f.status === 'place' ? '✓ Positionnée' : f.source === 'ia' ? `IA · ${f.confidence ?? '?'} %` : 'Ajoutée à la main'}
                          {t ? ` · ${firstName(t.name)}` : ''}
                        </small>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="legend">
        <span className="legend-item"><span className="fg-swatch ai" /> Prévision de l’IA (pourcentage = confiance)</span>
        <span className="legend-item"><span className="fg-swatch man" /> Prévision ajoutée à la main</span>
        <span className="legend-item"><span className="fg-swatch real" /> Session réelle (déjà sur le planning)</span>
        {placed > 0 && <span className="legend-item"><CalendarCheck2 size={13} aria-hidden /> {placed} prévision{placed > 1 ? 's' : ''} déjà positionnée{placed > 1 ? 's' : ''}</span>}
      </p>

      <h2 className="sub-heading">À venir · {upcoming.length} prévision{upcoming.length > 1 ? 's' : ''}</h2>
      {!upcoming.length ? (
        <p className="empty">Aucune prévision. Clique sur « Générer avec l’IA » ou ajoute-en une à la main.</p>
      ) : (
        <ul className="forecast-list">
          {upcoming.slice(0, 80).map((f) => (
            <li key={f.id}>
              <button type="button" className="fl-main" onClick={() => go(f.start_date)} title="Voir la semaine">
                <span className="fl-date">{period(f)}</span>
                <strong>{f.title}</strong>
                <small>
                  {roomName(f.room_id)}
                  {trainerOf(f.trainer_id) ? ` · ${trainerOf(f.trainer_id)!.name}` : ''}
                  {f.source === 'ia' ? ` · IA ${f.confidence ?? '?'} %` : ' · ajoutée à la main'}
                </small>
              </button>
              <span className="fl-actions">
                <button type="button" className="small ghost" onClick={() => openEdit(f)}>Détails</button>
                <Link className="btn small primary" href={`/?week=${f.start_date}&prevision=${f.id}`}>Positionner</Link>
              </span>
            </li>
          ))}
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
    </section>
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
