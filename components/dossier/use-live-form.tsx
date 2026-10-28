'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getSessionForm, patchSessionForm, type FormPatch } from '@/app/dossier/actions';

/**
 * Fiche du dossier à plusieurs, en direct (migration 47).
 *  · Chaque saisie part en modifications ciblées (patchs), fusionnées dans la
 *    base : deux personnes sur deux cases différentes ne s'écrasent jamais.
 *  · Les modifications des autres arrivent en direct (Supabase Realtime) et
 *    sont fusionnées avec ce qu'on est en train de taper (rien n'est perdu).
 *  · Présence : qui est sur la fiche, et quelle case chacun modifie.
 *  · Sans la migration 47 : enregistrement complet comme avant (`legacySave`).
 */

export type Peer = { key: string; name: string; color: string; field: string | null };
type Kind = 'tour_de_table' | 'appreciation' | 'reussite';

const COLORS = ['#2f6fb0', '#c4472f', '#7a3fb0', '#d97706', '#0f7a4a', '#b0306f', '#3f6f7a'];
const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/** Différences entre deux versions d'une fiche, sous forme de patchs (feuilles). */
export function diffForm(a: unknown, b: unknown, path: string[] = [], out: FormPatch[] = []): FormPatch[] {
  if (isObj(a) && isObj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in b) || b[k] === undefined) {
        if (k in a && a[k] !== undefined) out.push({ path: [...path, k], value: null });
      } else if (!(k in a)) out.push({ path: [...path, k], value: b[k] });
      else diffForm(a[k], b[k], [...path, k], out);
    }
  } else if (!same(a, b) && path.length) out.push({ path, value: b === undefined ? null : b });
  return out;
}

/** Applique des patchs (null = suppression). */
export function applyForm<T>(target: T, patches: FormPatch[]): T {
  const root: any = isObj(target) ? clone(target) : {};
  for (const p of patches) {
    let o = root;
    for (const k of p.path.slice(0, -1)) {
      if (!isObj(o[k])) o[k] = {};
      o = o[k];
    }
    const last = p.path[p.path.length - 1];
    if (p.value === null || p.value === undefined) delete o[last];
    else o[last] = clone(p.value);
  }
  return root;
}

export function useLiveForm<T extends object>({
  sessionId,
  kind,
  data,
  setData,
  canEdit,
  me,
  completedOf,
  legacySave,
  onSynced,
  onRow,
}: {
  sessionId: string;
  kind: Kind;
  data: T;
  setData: (d: T) => void;
  canEdit: boolean;
  me?: { id: string; name: string } | null;
  /** Fiche terminée d'après son contenu (fiches d'appréciation, attestations). */
  completedOf?: (d: T) => boolean;
  /** Enregistrement complet si la migration 47 n'est pas faite. */
  legacySave: (d: T, completed?: boolean) => Promise<{ ok: boolean; error?: string }>;
  onSynced?: (d: T) => void;
  /** État « terminé » reçu en direct (fiche validée par quelqu'un d'autre). */
  onRow?: (row: { completed: boolean; completed_at: string | null }) => void;
}) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [live, setLive] = useState(false);
  const base = useRef<T>(clone(data));
  const latest = useRef<T>(data);
  latest.current = data;
  const inflight = useRef(false);
  const again = useRef(false);
  const legacy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCompleted = useRef<boolean | undefined>(completedOf ? completedOf(data) : undefined);
  const first = useRef(true);
  const field = useRef<string | null>(null);
  const channel = useRef<any>(null);
  const colorRef = useRef(COLORS[0]);
  const forced = useRef<boolean | undefined>(undefined);
  const cbs = useRef({ setData, onSynced, completedOf, legacySave, onRow });
  cbs.current = { setData, onSynced, completedOf, legacySave, onRow };

  /** Version du serveur reçue : on la reprend, en gardant ce qui n'est pas encore envoyé. */
  const rebase = useCallback((server: T) => {
    const pending = diffForm(base.current, latest.current);
    base.current = clone(server);
    const next = applyForm(server, pending);
    if (!same(next, latest.current)) {
      latest.current = next;
      cbs.current.setData(next);
    }
    cbs.current.onSynced?.(next);
  }, []);

  const stamp = () => {
    setStatus('saved');
    setError(null);
    setSavedAt(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
  };

  const flush = useCallback(
    async (forceCompleted?: boolean): Promise<boolean> => {
      if (forceCompleted !== undefined) forced.current = forceCompleted;
      if (inflight.current) {
        again.current = true;
        return true;
      }
      const patches = diffForm(base.current, latest.current);
      const comp = forced.current ?? cbs.current.completedOf?.(latest.current);
      const compChanged = comp !== undefined && comp !== lastCompleted.current;
      if (!patches.length && !compChanged) return true;
      inflight.current = true;
      setStatus('saving');
      if (legacy.current) {
        const snapshot = clone(latest.current);
        const res = await cbs.current.legacySave(snapshot, comp);
        inflight.current = false;
        if (!res.ok) {
          setStatus('error');
          setError(res.error || 'Non enregistré');
          return false;
        }
        forced.current = undefined;
        base.current = snapshot;
        lastCompleted.current = comp;
        stamp();
        cbs.current.onSynced?.(latest.current);
      } else {
        const res = await patchSessionForm(sessionId, kind, patches, compChanged ? comp : undefined);
        inflight.current = false;
        if (!res.ok) {
          if ('legacy' in res) {
            legacy.current = true;
            return flush();
          }
          setStatus('error');
          setError(res.error);
          return false;
        }
        forced.current = undefined;
        if (compChanged) lastCompleted.current = comp;
        rebase(res.data as T);
        stamp();
      }
      if (again.current || diffForm(base.current, latest.current).length) {
        again.current = false;
        timer.current = setTimeout(() => flush(), 250);
      }
      return true;
    },
    [sessionId, kind, rebase]
  );

  // Saisie locale : envoi groupé après une courte pause.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!canEdit) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(), 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [data, canEdit, flush]);

  // Envoi de ce qui reste en partant (fermeture de la fiche).
  useEffect(() => () => void flush(), [flush]);

  // Diffusion en direct + présence.
  useEffect(() => {
    let alive = true;
    const sb = createClient();
    const key = `${me?.id || 'anon'}-${Math.random().toString(36).slice(2, 8)}`;
    const color = COLORS[Math.abs([...(me?.id || key)].reduce((n, c) => n * 31 + c.charCodeAt(0), 7)) % COLORS.length];
    (async () => {
      const { data: s } = await sb.auth.getSession();
      if (s.session) sb.realtime.setAuth(s.session.access_token);
      if (!alive) return;
      colorRef.current = color;
      const ch = sb.channel(`fiche:${sessionId}:${kind}`, { config: { presence: { key } } });
      channel.current = ch;
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'session_forms', filter: `session_id=eq.${sessionId}` }, (payload: any) => {
        const row = payload.new;
        if (row?.kind !== kind) return;
        if (row.data) rebase(row.data as T);
        lastCompleted.current = Boolean(row.completed);
        cbs.current.onRow?.({ completed: Boolean(row.completed), completed_at: row.completed_at || null });
      });
      ch.on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState() as Record<string, any[]>;
        const list: Peer[] = [];
        for (const [k, metas] of Object.entries(state)) {
          if (k === key) continue;
          const m = metas[metas.length - 1];
          if (m?.name) list.push({ key: k, name: m.name, color: m.color || COLORS[0], field: m.field || null });
        }
        setPeers(list);
      });
      ch.subscribe(async (st: string) => {
        if (st === 'SUBSCRIBED') {
          setLive(true);
          if (me?.name) await ch.track({ name: me.name, color, field: field.current });
        } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') setLive(false);
      });
    })();
    // Rattrapage périodique (onglet visible), au cas où la diffusion serait coupée.
    const poll = setInterval(async () => {
      if (document.visibilityState !== 'visible' || inflight.current) return;
      const res = await getSessionForm(sessionId, kind);
      if (res.ok && !same(res.data, base.current)) rebase(res.data as T);
    }, 20000);
    return () => {
      alive = false;
      clearInterval(poll);
      if (channel.current) sb.removeChannel(channel.current);
      channel.current = null;
    };
  }, [sessionId, kind, me?.id, me?.name, rebase]);

  /** Case en cours de modification (vue par les autres). */
  const focus = useCallback(
    (f: string | null) => {
      field.current = f;
      const ch = channel.current;
      if (ch && me?.name) ch.track({ name: me.name, color: colorRef.current, field: f }).catch(() => null);
    },
    [me?.name]
  );

  return { status, savedAt, error, peers, live, focus, flush };
}

/** Pastilles des personnes présentes sur la fiche. */
export function LivePeers({ peers, live }: { peers: Peer[]; live: boolean }) {
  if (!peers.length) return live ? <span className="live-peers solo" title="Modifications en direct">● En direct</span> : null;
  return (
    <span className="live-peers" aria-label={`Aussi sur la fiche : ${peers.map((p) => p.name).join(', ')}`}>
      {peers.slice(0, 5).map((p) => (
        <span key={p.key} className="live-peer" style={{ background: p.color }} title={`${p.name} est aussi sur la fiche`}>
          {p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
        </span>
      ))}
      <small>{peers.length === 1 ? `${peers[0].name.split(' ')[0]} est aussi sur la fiche` : `${peers.length} autres personnes sur la fiche`}</small>
    </span>
  );
}

/** Personne qui modifie cette case (contour de sa couleur). */
export function peerOn(peers: Peer[], f: string): Peer | null {
  return peers.find((p) => p.field === f) || null;
}
