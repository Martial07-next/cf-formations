'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Car,
  Clock3,
  Eye,
  Info,
  Pause,
  Play,
  RefreshCcw,
  RotateCcw,
  Settings2,
  Sparkles,
  Umbrella,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { BUILDING_ADDRESS } from '@/lib/buildings';
import { BAT1_ROOMS, BAT2_ZONES, VIEWS, type ViewKey } from '@/lib/city/layout';
import { MOTION_LIVE, MOTION_SIM, buildPlan, roomBusyAt, roomRect } from '@/lib/city/sim';
import { computeKpi } from '@/lib/city/kpi';
import {
  DEFAULT_SETTINGS,
  FAMILY_LABEL,
  TRAINER_STATUS_LABEL,
  fmtMin,
  toMin,
  type BuildingId,
  type CitySettings,
  type CityState,
  type WorkshopFamily,
} from '@/lib/city/types';
import type { Badge, RoomChip, SceneProps } from './city-scene';
import { CityPlan2D } from './city-plan-2d';
import { AvatarEditor } from './avatar-editor';

/** La 3D (Three.js) n'est téléchargée qu'à l'ouverture de la ville. */
const CityScene = memo(
  dynamic<SceneProps>(() => import('./city-scene'), { ssr: false, loading: () => null })
);

type Mode = 'live' | 'explore' | 'sim';
const SIM_START = 6 * 60;
const SIM_END = 21 * 60;
/** Simulation : 06h → 21h en 60 secondes (15 minutes de scène par seconde). */
const SIM_SPEED = (SIM_END - SIM_START) / 60;
const SETTINGS_KEY = 'cf-city-settings';

const parisMinutes = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return (Number(p.hour) % 24) * 60 + Number(p.minute) + Number(p.second) / 60;
};
const frLong = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function readSettings(): CitySettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const s = { ...DEFAULT_SETTINGS, reducedMotion: Boolean(reduced), ...(raw || {}) } as CitySettings;
    s.carRatio = Math.min(2, Math.max(0, Number(s.carRatio) || 0));
    return s;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function CityApp({ initial, today }: { initial: CityState; today: string }) {
  const [state, setState] = useState(initial);
  const [mode, setMode] = useState<Mode>('live');
  const [date, setDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<CitySettings>(DEFAULT_SETTINGS);
  const [gl, setGl] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [room, setRoom] = useState<{ b: BuildingId; n: number } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState<{ key: ViewKey; n: number }>({ key: 'general', n: 0 });
  const [panel, setPanel] = useState<'people' | 'settings' | 'avatar' | null>(null);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    setSettings(readSettings());
    setGl(hasWebGL());
  }, []);
  const updateSettings = (patch: Partial<CitySettings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* navigation privée : réglage non mémorisé */
      }
      return next;
    });

  // ---- Horloge de la scène ----
  const clock = useRef({ base: parisMinutes(), wall: 0 });
  const modeRef = useRef(mode);
  const playingRef = useRef(playing);
  modeRef.current = mode;
  playingRef.current = playing;
  const getT = useCallback(() => {
    const c = clock.current;
    const now = performance.now();
    if (modeRef.current === 'live') return c.base + (now - c.wall) / 60000;
    if (modeRef.current === 'sim' && playingRef.current) {
      const span = SIM_END - SIM_START;
      return SIM_START + ((((c.base - SIM_START + ((now - c.wall) / 1000) * SIM_SPEED) % span) + span) % span);
    }
    return c.base;
  }, []);
  const setClock = (base: number) => {
    clock.current = { base, wall: performance.now() };
  };
  useEffect(() => setClock(parisMinutes()), []);
  const [minute, setMinute] = useState(() => Math.floor(parisMinutes()));
  useEffect(() => {
    const id = setInterval(() => setMinute(Math.floor(getT())), mode === 'sim' ? 250 : 1000);
    return () => clearInterval(id);
  }, [mode, getT]);

  const switchMode = (m: Mode) => {
    const T = getT();
    setMode(m);
    if (m === 'live') {
      setClock(parisMinutes());
      if (date !== today) setDate(today);
    } else if (m === 'sim') {
      setPlaying(true);
      setClock(SIM_START);
    } else setClock(Math.min(SIM_END, Math.max(SIM_START, T)));
  };
  const togglePlay = () => {
    const T = getT();
    playingRef.current = !playing;
    setPlaying(!playing);
    setClock(T);
  };

  // ---- Données : rechargement à la demande (date, bouton), et toutes les 5 min en temps réel ----
  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/city?date=${d}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status === 401 ? 'Session expirée : reconnecte-toi.' : 'Chargement impossible.');
      setState(await res.json());
    } catch (e: any) {
      setError(e.message || 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (date !== state.date) load(date);
  }, [date, state.date, load]);
  useEffect(() => {
    if (mode !== 'live') return;
    const id = setInterval(() => document.visibilityState === 'visible' && load(today), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [mode, today, load]);

  // ---- Simulation visuelle (dérivée des données réelles) ----
  const motion = mode === 'live' ? MOTION_LIVE : MOTION_SIM;
  const plan = useMemo(() => buildPlan(state, settings, motion), [state, settings, motion]);
  const T = minute;
  const building: BuildingId | null = focus === 'bat1' || focus === 'parking1' ? 'bat1' : focus === 'bat2' || focus === 'parking2' ? 'bat2' : null;
  const kpi = computeKpi(state, T, building);

  const busyKey = state.rooms.filter((r) => roomBusyAt(state, r.id, T)).map((r) => r.id).join(',');
  const busy = useMemo(() => {
    const ids = new Set(busyKey.split(','));
    const out: Record<BuildingId, Set<number>> = { bat1: new Set(), bat2: new Set() };
    for (const r of state.rooms) if (r.building && r.number && ids.has(r.id)) out[r.building].add(r.number);
    return out;
  }, [busyKey, state.rooms]);
  const families = useMemo(() => {
    const out: Record<BuildingId, Record<number, WorkshopFamily[]>> = { bat1: {}, bat2: {} };
    for (const r of state.rooms) if (r.building && r.number) out[r.building][r.number] = r.families;
    return out;
  }, [state.rooms]);

  const sessionsOf = (b: BuildingId) => state.sessions.filter((s) => s.building === b);
  const liveIn = (b: BuildingId) => sessionsOf(b).filter((s) => T >= toMin(s.start) - 15 && T <= toMin(s.end) + 15);
  const badgeKey = `${T}|${state.generatedAt}`;
  const badges = useMemo<Record<string, Badge>>(() => {
    const mk = (b: BuildingId, title: string): Badge => {
      const all = sessionsOf(b);
      const live = liveIn(b);
      return {
        title,
        active: live.length > 0,
        line: all.length ? `${live.length ? `${live.length} en cours` : `${all.length} session${all.length > 1 ? 's' : ''}`} · ${all.reduce((n, s) => n + s.validated, 0)} stagiaires` : 'Aucune formation',
      };
    };
    const beach = state.trainers.filter((t) => t.status === 'conge').length;
    return {
      bat1: mk('bat1', 'Bâtiment 1'),
      bat2: mk('bat2', 'Bâtiment 2'),
      admin: { title: 'Administration', line: 'Accès à la plateforme', active: false },
      beach: { title: 'Beach Club', line: beach ? `${beach} en congé` : 'Personne en congé', active: beach > 0 },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badgeKey]);

  const chips = useMemo<RoomChip[]>(() => {
    if (focus !== 'bat1' && focus !== 'bat2') return [];
    const b = focus as BuildingId;
    const list = b === 'bat1' ? BAT1_ROOMS.filter((r) => r.number).map((r) => ({ n: r.number!, label: r.label })) : BAT2_ZONES.map((z) => ({ n: z.number, label: z.label }));
    return list.map(({ n, label }) => {
      const r = roomRect(b, n).rect;
      const dbRoom = state.rooms.find((x) => x.building === b && x.number === n);
      const now = dbRoom ? state.sessions.find((s) => s.roomId === dbRoom.id && T >= toMin(s.start) - 15 && T <= toMin(s.end) + 15) : null;
      const next = dbRoom ? state.sessions.filter((s) => s.roomId === dbRoom.id && toMin(s.start) > T).sort((x, y) => x.start.localeCompare(y.start))[0] : null;
      return {
        building: b,
        x: r.x + r.w / 2,
        z: r.z + r.d / 2,
        title: dbRoom?.name || label,
        line: now ? `${now.title.slice(0, 28)} · ${now.validated} stag.` : next ? `Libre · ${fmtMin(toMin(next.start))} ${next.title.slice(0, 18)}` : dbRoom ? (dbRoom.available ? 'Libre' : 'Indisponible') : 'Non enregistrée',
        busy: Boolean(now),
        selected: room?.b === b && room.n === n,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, room, badgeKey]);

  const select = useCallback((k: string | null) => {
    setRoom(null);
    setFocus(k);
    const v: Record<string, ViewKey> = { bat1: 'bat1', bat2: 'bat2', admin: 'admin', parking1: 'parking', parking2: 'bat2', beach: 'beach' };
    if (k && v[k]) setView((x) => ({ key: v[k], n: x.n + 1 }));
  }, []);
  const goView = (key: ViewKey) => {
    const f: Partial<Record<ViewKey, string>> = { bat1: 'bat1', bat2: 'bat2', admin: 'admin', parking: 'parking1', beach: 'beach' };
    setRoom(null);
    setFocus(f[key] || null);
    setView((x) => ({ key, n: x.n + 1 }));
  };
  const onRoom = useCallback((b: BuildingId, n: number) => setRoom({ b, n }), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (setRoom(null), setFocus(null), setPanel(null));
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pickSession = (id: string) => {
    const s = state.sessions.find((x) => x.id === id);
    if (!s) return;
    setClock(Math.min(SIM_END, toMin(s.start) + 30));
    setMinute(Math.min(SIM_END, toMin(s.start) + 30));
    if (s.building) {
      select(s.building);
      const r = state.rooms.find((x) => x.id === s.roomId);
      if (r?.number) setRoom({ b: s.building, n: r.number });
    }
  };

  const synced = new Date(state.generatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  const counts = { conge: 0, indisponible: 0, formation: 0, exterieur: 0, non_affecte: 0 } as Record<string, number>;
  state.trainers.forEach((t) => counts[t.status]++);

  return (
    <main className="city-root">
      {/* ---- Scène ---- */}
      <div className="city-stage" aria-label="Mini-ville 3D CF Réseaux">
        {gl === true && (
          <CityScene
            state={state}
            plan={plan}
            getT={getT}
            minute={Math.floor(T / 10) * 10}
            selected={focus}
            hovered={hovered}
            onHover={setHovered}
            onSelect={select}
            onRoom={onRoom}
            view={view}
            settings={settings}
            busy={busy}
            families={families}
            badges={badges}
            chips={chips}
            onReady={() => setReady(true)}
          />
        )}
        {gl === false && <CityPlan2D state={state} busy={busy} onSelect={select} selected={focus} />}
      </div>

      {/* ---- Ouverture ---- */}
      {gl !== false && (
        <div className={`city-intro${ready ? ' done' : ''}`} aria-hidden={ready}>
          <div className="city-intro-mark">
            <span className="city-intro-dot" />
            <strong>CF RÉSEAUX CITY</strong>
            <small>Chargement de la ville…</small>
          </div>
        </div>
      )}

      {/* ---- Barre du haut ---- */}
      <header className="city-top">
        <Link href="/tableau-de-bord" className="city-back">
          <ArrowLeft size={15} aria-hidden /> <span>Revenir au tableau de bord</span>
        </Link>
        <div className="city-title">
          <span className="city-logo" aria-hidden><Building2 size={16} /></span>
          <div>
            <strong>CF Réseaux City <em>3D</em></strong>
            <small>{frLong(state.date)}</small>
          </div>
        </div>
        <div className="city-modes" role="tablist" aria-label="Mode">
          {([['live', 'Temps réel'], ['explore', 'Exploration'], ['sim', 'Simulation']] as [Mode, string][]).map(([m, l]) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => switchMode(m)}>
              {l}
            </button>
          ))}
        </div>
        <div className="city-clock" title={mode === 'live' ? 'Heure de Paris' : 'Heure représentée'}>
          <Clock3 size={14} aria-hidden /> {fmtMin(T)}
          {mode === 'live' && <i className="city-live" aria-label="en direct" />}
        </div>
        <div className="city-sync">
          <button className="city-icon" onClick={() => load(date)} disabled={loading} title="Actualiser les données du planning" aria-label="Actualiser">
            <RefreshCcw size={15} className={loading ? 'spin' : ''} aria-hidden />
          </button>
          <small>{error ? <span className="err">{error}</span> : <>Synchro {synced}</>}</small>
        </div>
        <div className="city-tools">
          <button className={`city-icon${panel === 'people' ? ' on' : ''}`} onClick={() => setPanel(panel === 'people' ? null : 'people')} title="Formateurs" aria-label="Formateurs"><Users size={15} aria-hidden /></button>
          {state.myTrainerId && (
            <button className={`city-icon${panel === 'avatar' ? ' on' : ''}`} onClick={() => setPanel(panel === 'avatar' ? null : 'avatar')} title="Mon personnage" aria-label="Mon personnage"><UserRound size={15} aria-hidden /></button>
          )}
          <button className={`city-icon${panel === 'settings' ? ' on' : ''}`} onClick={() => setPanel(panel === 'settings' ? null : 'settings')} title="Réglages" aria-label="Réglages"><Settings2 size={15} aria-hidden /></button>
        </div>
      </header>

      {/* ---- Barre temporelle ---- */}
      {mode !== 'live' && (
        <div className="city-time">
          {mode === 'sim' && (
            <span className="city-sim-tag"><Sparkles size={13} aria-hidden /> Simulation visuelle des données du planning · 06h → 21h en 60 s</span>
          )}
          <label className="city-date">
            <CalendarDays size={14} aria-hidden />
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          {mode === 'sim' ? (
            <button className="city-play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Lecture'}>
              {playing ? <Pause size={15} color="#17241b" aria-hidden /> : <Play size={15} color="#17241b" aria-hidden />}
            </button>
          ) : null}
          <input
            className="city-range"
            type="range"
            min={SIM_START}
            max={SIM_END}
            step={5}
            value={Math.min(SIM_END, Math.max(SIM_START, T))}
            onChange={(e) => {
              const v = Number(e.target.value);
              setClock(v);
              setMinute(v);
            }}
            aria-label="Heure"
          />
          {mode === 'explore' && (
            <>
              <select value="" onChange={(e) => e.target.value && pickSession(e.target.value)} aria-label="Aller à une session">
                <option value="">Session…</option>
                {state.sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.start.replace(':', 'h')} · {s.title.slice(0, 40)}
                  </option>
                ))}
              </select>
              <select value={building || ''} onChange={(e) => (e.target.value ? select(e.target.value) : goView('general'))} aria-label="Bâtiment">
                <option value="">Tous les bâtiments</option>
                <option value="bat1">Bâtiment 1</option>
                <option value="bat2">Bâtiment 2</option>
              </select>
            </>
          )}
        </div>
      )}

      {/* ---- Vues ---- */}
      <nav className="city-views" aria-label="Vues">
        {(['general', 'bat1', 'bat2', 'admin', 'parking', 'beach'] as ViewKey[]).map((k) => (
          <button key={k} className={view.key === k ? 'on' : ''} onClick={() => goView(k)}>
            {VIEWS[k].label}
          </button>
        ))}
        <button onClick={() => goView('general')} title="Réinitialiser la caméra" aria-label="Réinitialiser la caméra">
          <RotateCcw size={14} aria-hidden />
        </button>
      </nav>

      {/* ---- Indicateurs ---- */}
      <section className="city-kpis" aria-label="Indicateurs">
        {building && <span className="city-kpi-scope">{building === 'bat1' ? 'Bâtiment 1' : 'Bâtiment 2'} <button onClick={() => goView('general')} aria-label="Tous les bâtiments"><X size={12} /></button></span>}
        <Kpi label="Sessions du jour" value={kpi.sessions} sub={kpi.liveSessions ? `${kpi.liveSessions} en cours` : undefined} />
        <Kpi label="Stagiaires inscrits" value={kpi.validated} sub={kpi.waiting ? `+ ${kpi.waiting} en attente` : undefined} />
        <Kpi label={`Présents (${kpi.half === 'am' ? 'matin' : 'après-midi'})`} value={kpi.present ?? '—'} sub={kpi.present === null ? 'émargement non disponible' : kpi.presentPartial ? 'émargement partiel' : 'émargement'} />
        <Kpi label="Formateurs affectés" value={kpi.trainers} />
        <Kpi label="Salles occupées" value={`${kpi.roomsUsed}/${kpi.roomsAvailable}`} sub={kpi.occupancy !== null ? `${kpi.occupancy} % d’occupation` : undefined} />
        {!building && <Kpi label="Sessions à venir (7 j)" value={kpi.upcoming} />}
        {!building && state.alerts.length > 0 && <Kpi label="Alertes planning" value={kpi.alerts} tone="warn" />}
        {!building && kpi.intra > 0 && <Kpi label="En extérieur (INTRA)" value={kpi.intra} />}
      </section>

      {/* ---- Légende ---- */}
      <div className="city-legend">
        <span><i className="real" /> Donnée du planning</span>
        <span><i className="est" /> Estimation (véhicules : {String(settings.carRatio).replace('.', ',')} / stagiaire)</span>
        <span><i className="deco" /> Animation décorative</span>
      </div>

      {/* ---- Panneau de sélection ---- */}
      {focus && (
        <aside className="city-panel" aria-live="polite">
          <button className="city-panel-close" onClick={() => (setFocus(null), setRoom(null))} aria-label="Fermer"><X size={16} /></button>
          <SelectionPanel state={state} focus={focus} room={room} T={T} plan={plan} settings={settings} counts={counts} />
        </aside>
      )}

      {/* ---- Panneaux d'outils ---- */}
      {panel === 'people' && (
        <aside className="city-drawer">
          <h2><Users size={15} aria-hidden /> Formateurs du {frLong(state.date)}</h2>
          {(['formation', 'exterieur', 'conge', 'non_affecte', 'indisponible'] as const).map((st) => {
            const list = state.trainers.filter((t) => t.status === st);
            if (!list.length) return null;
            return (
              <div key={st} className="city-people">
                <h3>{TRAINER_STATUS_LABEL[st]} <span>{list.length}</span></h3>
                <ul>
                  {list.map((t) => {
                    const s = state.sessions.find((x) => t.sessionIds.includes(x.id));
                    return (
                      <li key={t.id}>
                        <i style={{ background: t.look.top }} aria-hidden />
                        <span>{t.label}</span>
                        {s && <Link href={`/sessions/${s.id}`}>{s.external ? `INTRA · ${s.external}` : s.title}</Link>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          <p className="hint">« Non affecté » : aucune session ce jour-là, ce qui ne veut pas dire disponible. « Indisponible » : absence, sans motif affiché.</p>
        </aside>
      )}
      {panel === 'settings' && (
        <aside className="city-drawer">
          <h2><Settings2 size={15} aria-hidden /> Réglages de la ville</h2>
          <label className="city-field">
            <span>Qualité graphique</span>
            <select value={settings.quality} onChange={(e) => updateSettings({ quality: e.target.value as CitySettings['quality'] })}>
              <option value="eleve">Élevée (ombres fines)</option>
              <option value="standard">Standard</option>
              <option value="economique">Économique (sans ombres)</option>
            </select>
          </label>
          <label className="city-field">
            <span>Véhicules estimés par stagiaire : <strong>{String(settings.carRatio).replace('.', ',')}</strong></span>
            <input type="range" min={0} max={1.5} step={0.1} value={settings.carRatio} onChange={(e) => updateSettings({ carRatio: Number(e.target.value) })} />
            <small>Estimation visuelle (covoiturage, transports) : jamais une donnée réelle.</small>
          </label>
          <label className="city-field">
            <span>Pause déjeuner représentée</span>
            <div className="city-row">
              <input type="time" value={settings.lunchStart} onChange={(e) => updateSettings({ lunchStart: e.target.value })} />
              <input type="time" value={settings.lunchEnd} onChange={(e) => updateSettings({ lunchEnd: e.target.value })} />
            </div>
            <small>Par défaut 12h–13h, comme le calcul des heures du planning.</small>
          </label>
          <label className="city-check">
            <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => updateSettings({ reducedMotion: e.target.checked })} />
            Réduire les mouvements (caméra, vagues, circulation décorative)
          </label>
          <p className="hint">Réglages enregistrés sur cet appareil uniquement.</p>
        </aside>
      )}
      {panel === 'avatar' && state.myTrainerId && (
        <AvatarEditor
          trainer={state.trainers.find((t) => t.id === state.myTrainerId) || null}
          webgl={gl === true}
          missing={Boolean(state.avatarsMissing)}
          onClose={() => setPanel(null)}
          onSaved={() => load(date)}
        />
      )}
    </main>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone?: 'warn' }) {
  return (
    <div className={`city-kpi${tone ? ` ${tone}` : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function SelectionPanel({ state, focus, room, T, plan, settings, counts }: { state: CityState; focus: string; room: { b: BuildingId; n: number } | null; T: number; plan: ReturnType<typeof buildPlan>; settings: CitySettings; counts: Record<string, number> }) {
  const tLabel = (ids: string[]) => ids.map((id) => state.trainers.find((t) => t.id === id)?.label).filter(Boolean).join(', ') || 'Sans formateur';

  if (room) {
    const r = state.rooms.find((x) => x.building === room.b && x.number === room.n);
    const sessions = r ? state.sessions.filter((s) => s.roomId === r.id).sort((a, b) => a.start.localeCompare(b.start)) : [];
    const now = sessions.find((s) => T >= toMin(s.start) && T <= toMin(s.end));
    return (
      <>
        <p className="city-kicker">{room.b === 'bat1' ? 'Bâtiment 1' : 'Bâtiment 2'} · salle</p>
        <h2>{r?.name || `Salle ${room.n}`}</h2>
        {!r && <p className="hint">Cette salle n’est pas enregistrée dans la plateforme.</p>}
        {r && (
          <>
            <dl className="city-dl">
              <div><dt>Capacité</dt><dd>{r.capacity} places</dd></div>
              <div><dt>État</dt><dd>{!r.available ? 'Indisponible' : now ? <b className="ok">En formation</b> : 'Libre'}</dd></div>
            </dl>
            <h3>Formations du jour</h3>
            {sessions.length === 0 && <p className="hint">Aucune formation dans cette salle ce jour-là.</p>}
            <ul className="city-list">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link href={`/sessions/${s.id}`}>{s.title}</Link>
                  <small>{s.start.replace(':', 'h')} – {s.end.replace(':', 'h')} · {tLabel(s.trainerIds)} · {s.validated} stagiaire{s.validated > 1 ? 's' : ''}</small>
                </li>
              ))}
            </ul>
            <h3>Équipements représentés</h3>
            {r.families.length ? (
              <ul className="city-tags">{r.families.map((f) => <li key={f}>{FAMILY_LABEL[f]}</li>)}</ul>
            ) : (
              <p className="hint">Aucune formation cochée pour cette salle (fiche Salles) : pas d’équipement représenté.</p>
            )}
            {r.workshops.length > 0 && <p className="hint">Ateliers : {r.workshops.join(', ')}</p>}
            <p className="hint"><Info size={12} aria-hidden /> Représentation selon les formations possibles dans la salle, pas l’inventaire réel.{room.b === 'bat2' && ' Plan intérieur du BAT 2 non fourni : position indicative.'}</p>
          </>
        )}
      </>
    );
  }

  if (focus === 'bat1' || focus === 'bat2') {
    const b = focus as BuildingId;
    const sessions = state.sessions.filter((s) => s.building === b).sort((x, y) => x.start.localeCompare(y.start));
    const rooms = state.rooms.filter((r) => r.building === b);
    const busyIds = new Set(sessions.filter((s) => T >= toMin(s.start) - 15 && T <= toMin(s.end) + 15).map((s) => s.roomId));
    const kpi = computeKpi(state, T, b);
    return (
      <>
        <p className="city-kicker">{BUILDING_ADDRESS[b === 'bat1' ? 'BAT 1' : 'BAT 2'].split(' · ')[1]}</p>
        <h2>{b === 'bat1' ? 'Bâtiment 1' : 'Bâtiment 2'}</h2>
        <dl className="city-dl">
          <div><dt>Sessions</dt><dd>{kpi.sessions}</dd></div>
          <div><dt>Stagiaires prévus</dt><dd>{kpi.validated}{kpi.waiting ? ` (+${kpi.waiting})` : ''}</dd></div>
          <div><dt>Présents</dt><dd>{kpi.present ?? '—'}</dd></div>
          <div><dt>Formateurs</dt><dd>{kpi.trainers}</dd></div>
        </dl>
        <h3>Salles</h3>
        <ul className="city-rooms">
          {rooms.map((r) => (
            <li key={r.id} className={!r.available ? 'off' : busyIds.has(r.id) ? 'busy' : ''}>
              <strong>{r.name}</strong>
              <span>{!r.available ? 'Indisponible' : busyIds.has(r.id) ? 'Occupée' : 'Libre'}</span>
            </li>
          ))}
        </ul>
        <h3>Formations du jour</h3>
        {sessions.length === 0 && <p className="hint">Aucune formation dans ce bâtiment ce jour-là.</p>}
        <ul className="city-list">
          {sessions.map((s) => {
            const r = state.rooms.find((x) => x.id === s.roomId);
            const state_ = T < toMin(s.start) ? 'À venir' : T > toMin(s.end) ? 'Terminée' : 'En cours';
            return (
              <li key={s.id}>
                <Link href={`/sessions/${s.id}`}>{s.title}</Link>
                <small>
                  {state_} · {s.start.replace(':', 'h')} – {s.end.replace(':', 'h')} · {r?.name || 'sans salle'} · {tLabel(s.trainerIds)} · {s.validated} stag.
                  {!s.trainerIds.length && <b className="warn"> · sans formateur</b>}
                </small>
              </li>
            );
          })}
        </ul>
        <p className="hint"><Eye size={12} aria-hidden /> Toit masqué : clique sur une salle pour son détail.{b === 'bat2' && ' Plan intérieur non fourni : salles en position indicative.'}</p>
        <Link href="/" className="btn small">Ouvrir le planning</Link>
      </>
    );
  }

  if (focus === 'admin') {
    const idle = state.trainers.filter((t) => t.status === 'non_affecte');
    return (
      <>
        <p className="city-kicker">Bungalow</p>
        <h2>Administration CF Réseaux</h2>
        <ul className="city-links">
          {state.adminLinks.map((l) => (
            <li key={l.href + l.label}><Link href={l.href}>{l.label}</Link></li>
          ))}
        </ul>
        <h3>Formateurs non affectés</h3>
        <p className="hint">{idle.length ? idle.map((t) => t.label).join(', ') : 'Aucun.'} (aucune session ce jour-là, ce qui ne veut pas dire disponible)</p>
        {counts.indisponible > 0 && <p className="hint">{counts.indisponible} formateur{counts.indisponible > 1 ? 's' : ''} indisponible{counts.indisponible > 1 ? 's' : ''}.</p>}
      </>
    );
  }

  if (focus === 'parking1' || focus === 'parking2') {
    const site: BuildingId = focus === 'parking1' ? 'bat1' : 'bat2';
    const e = plan.estimate[site];
    const now = plan.cars.filter((c) => c.site === site && T >= c.t1 && T <= c.t2).length;
    return (
      <>
        <p className="city-kicker"><Car size={12} aria-hidden /> Estimation</p>
        <h2>Parking {site === 'bat1' ? 'Bâtiment 1' : 'Bâtiment 2'}</h2>
        <dl className="city-dl">
          <div><dt>Places dessinées</dt><dd>{e.slots}</dd></div>
          <div><dt>Véhicules estimés (journée)</dt><dd>{e.cars}</dd></div>
          <div><dt>Garés à {fmtMin(T)}</dt><dd>{now}</dd></div>
        </dl>
        <p className="hint">Estimation : stagiaires validés × {String(settings.carRatio).replace('.', ',')} (réglable), plus un véhicule par formateur. Ce n’est pas une donnée réelle.{e.cars > e.slots && ' Au-delà des places dessinées, les véhicules ne sont pas représentés.'}</p>
      </>
    );
  }

  if (focus === 'beach') {
    const list = state.trainers.filter((t) => t.status === 'conge');
    return (
      <>
        <p className="city-kicker"><Umbrella size={12} aria-hidden /> Îlot imaginaire</p>
        <h2>CF Réseaux Beach Club</h2>
        <p>{list.length ? `${list.length} formateur${list.length > 1 ? 's' : ''} en congé aujourd’hui :` : 'Personne en congé ce jour-là.'}</p>
        {list.length > 0 && <ul className="city-tags">{list.map((t) => <li key={t.id}>{t.label}</li>)}</ul>}
        <p className="hint">Seuls les congés (synchronisés depuis la plateforme Congés) mènent ici. Les autres absences restent « Indisponible », sans motif.</p>
      </>
    );
  }
  return null;
}
