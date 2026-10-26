'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Bug, Check, Eye, EyeOff, Lightbulb, ListChecks, Loader2, MessageSquarePlus, Pencil, Send, Sparkles, Trash2, X } from 'lucide-react';
import { addReply, createFeedback, deleteFeedback, listFeedback, updateFeedback } from '@/app/ameliorations/actions';
import { askConfirm } from '@/lib/confirm-dialog';
import {
  KINDS,
  KIND_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  isOpen,
  type Feedback,
  type FeedbackKind,
} from '@/lib/dev-feedback';

const MODE_KEY = 'cf_dev_mode';
const DONE_KEY = 'cf_dev_show_done';

type Draft = { x: number; y: number; selector: string | null; rel_x: number | null; rel_y: number | null; page_x: number; page_y: number };

const KIND_ICON: Record<FeedbackKind, typeof Bug> = { bug: Bug, amelioration: Sparkles, suggestion: Lightbulb };

/** Chemin CSS d'un élément (id stable si possible, sinon tag:nth-of-type). */
function cssPath(el: Element): string | null {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.body && parts.length < 14) {
    if (node.id && /^[A-Za-z][\w-]*$/.test(node.id) && !/^(radix|react|:r)/.test(node.id)) {
      parts.unshift(`#${node.id}`);
      break;
    }
    const tag = node.tagName.toLowerCase();
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    const same = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
    node = parent;
  }
  if (!parts.length) return null;
  return parts[0].startsWith('#') ? parts.join(' > ') : `body > ${parts.join(' > ')}`;
}

function docWidth() {
  return Math.max(document.documentElement.scrollWidth, document.documentElement.clientWidth);
}

/** Position (coordonnées du document) d'une remarque : sur son élément s'il est visible, sinon position de secours. */
function locate(f: Pick<Feedback, 'selector' | 'rel_x' | 'rel_y' | 'page_x' | 'page_y'>): { x: number; y: number } {
  if (f.selector) {
    try {
      const el = document.querySelector(f.selector);
      if (el && !el.closest('[data-dev-layer]')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 || r.height > 0) {
          return { x: r.left + window.scrollX + (f.rel_x ?? 0.5) * r.width, y: r.top + window.scrollY + (f.rel_y ?? 0.5) * r.height };
        }
      }
    } catch {
      /* sélecteur devenu invalide : position de secours */
    }
  }
  return { x: ((f.page_x ?? 50) / 100) * docWidth(), y: f.page_y ?? 120 };
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

/**
 * Suggestions d'amélioration épinglées sur les pages (accès Dev).
 *  · Compte dev : « Ajouter une remarque » puis clic à l'endroit concerné ;
 *    les bulles de la page sont visibles pour éviter les doublons.
 *  · Administrateur : « Mode dev » affiche les bulles, change les statuts,
 *    répond. Liste complète : /ameliorations.
 */
export function DevLayer({ me }: { me: { id: string; role: string; can_dev: boolean } }) {
  const isAdmin = me.role === 'admin';
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [hover, setHover] = useState<DOMRect | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Mode dev mémorisé sur cet ordinateur ; un compte dev voit les bulles par défaut.
  useEffect(() => {
    try {
      const v = localStorage.getItem(MODE_KEY);
      setMode(v === null ? !isAdmin : v === '1');
      setShowDone(localStorage.getItem(DONE_KEY) === '1');
    } catch {
      setMode(!isAdmin);
    }
  }, [isAdmin]);
  const toggleMode = () =>
    setMode((m) => {
      try {
        localStorage.setItem(MODE_KEY, m ? '0' : '1');
      } catch {}
      return !m;
    });
  const toggleDone = () =>
    setShowDone((v) => {
      try {
        localStorage.setItem(DONE_KEY, v ? '0' : '1');
      } catch {}
      return !v;
    });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listFeedback(pathname);
    setLoading(false);
    if (res.ok) {
      setItems(res.items);
      setError(null);
    } else setError(res.error);
  }, [pathname]);

  // Changement de page : brouillon et bulle ouverte fermés.
  useEffect(() => {
    setDraft(null);
    setPlacing(false);
    setOpenId((o) => (o && o === new URLSearchParams(window.location.search).get('remarque') ? o : null));
  }, [pathname]);
  useEffect(() => {
    load();
  }, [load]);

  // Lien depuis la liste : /page?remarque=<id> ouvre la bulle.
  const target = search.get('remarque');
  useEffect(() => {
    if (!target) return;
    setMode(true);
    setOpenId(target);
  }, [target]);
  useEffect(() => {
    if (!target || !items.some((i) => i.id === target)) return;
    const f = items.find((i) => i.id === target)!;
    const t = window.setTimeout(() => {
      const p = locate(f);
      window.scrollTo({ top: Math.max(0, p.y - 200), behavior: 'smooth' });
    }, 400);
    return () => window.clearTimeout(t);
  }, [target, items]);

  // Les pages bougent (chargement, fenêtres) : positions recalculées régulièrement.
  useEffect(() => {
    if (!mode) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 900);
    const r = () => setTick((n) => n + 1);
    window.addEventListener('resize', r);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('resize', r);
    };
  }, [mode]);

  // Placement d'une remarque : le prochain clic sur la page choisit l'endroit.
  useEffect(() => {
    if (!placing) return;
    const pick = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el.closest('[data-dev-layer]')) return;
      e.preventDefault();
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      const x = e.clientX + window.scrollX;
      const y = e.clientY + window.scrollY;
      setDraft({
        x,
        y,
        selector: cssPath(el),
        rel_x: r.width ? (e.clientX - r.left) / r.width : null,
        rel_y: r.height ? (e.clientY - r.top) / r.height : null,
        page_x: (x / docWidth()) * 100,
        page_y: y,
      });
      setPlacing(false);
      setHover(null);
      setMode(true);
    };
    const block = (e: Event) => {
      const t = e.target as Element | null;
      if (t?.closest?.('[data-dev-layer]')) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const move = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      setHover(el && !el.closest('[data-dev-layer]') ? el.getBoundingClientRect() : null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPlacing(false);
        setHover(null);
      }
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.('[data-dev-layer]')) return;
      pick(e);
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('mousedown', block, true);
    document.addEventListener('pointerdown', block, true);
    document.addEventListener('submit', block, true);
    document.addEventListener('mousemove', move, true);
    document.addEventListener('keydown', esc, true);
    document.documentElement.classList.add('dev-placing');
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mousedown', block, true);
      document.removeEventListener('pointerdown', block, true);
      document.removeEventListener('submit', block, true);
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('keydown', esc, true);
      document.documentElement.classList.remove('dev-placing');
    };
  }, [placing]);

  const visible = useMemo(
    () =>
      [...items]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((f, i) => ({ f, n: i + 1 }))
        .filter(({ f }) => showDone || isOpen(f.status) || f.id === openId),
    [items, showDone, openId]
  );
  const openCount = items.filter((i) => isOpen(i.status)).length;
  const canWrite = isAdmin || me.can_dev;
  const byKind = (k: FeedbackKind) => items.filter((i) => i.kind === k && isOpen(i.status)).length;

  // Mode dev visible sur tout le site : cadre vert, bandeau en haut, page décalée.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dev-mode', mode);
    return () => root.classList.remove('dev-mode');
  }, [mode]);

  return (
    <div data-dev-layer className="dev-layer">
      {mode && (
        <>
          <div className="dev-frame" aria-hidden />
          <div className="dev-banner" role="status">
            <span className="dev-banner-tag">
              <span className="dev-dot" aria-hidden /> MODE DEV
            </span>
            <span className="dev-banner-text">
              {openCount === 0 ? (
                'Aucune remarque à traiter sur cette page'
              ) : (
                <>
                  <strong>{openCount}</strong> remarque{openCount > 1 ? 's' : ''} à traiter sur cette page
                  <span className="dev-banner-kinds">
                    {byKind('bug') > 0 && <span className="dev-chip k-bug"><Bug size={11} aria-hidden /> {byKind('bug')}</span>}
                    {byKind('amelioration') > 0 && <span className="dev-chip k-amelioration"><Sparkles size={11} aria-hidden /> {byKind('amelioration')}</span>}
                    {byKind('suggestion') > 0 && <span className="dev-chip k-suggestion"><Lightbulb size={11} aria-hidden /> {byKind('suggestion')}</span>}
                  </span>
                </>
              )}
            </span>
            <span className="dev-banner-actions">
              {canWrite && (
                <button type="button" className="dev-banner-btn primary" onClick={() => { setDraft(null); setOpenId(null); setPlacing((p) => !p); }}>
                  <MessageSquarePlus size={14} aria-hidden /> {placing ? 'Annuler' : 'Ajouter une remarque'}
                </button>
              )}
              <Link href="/ameliorations" className="dev-banner-btn"><ListChecks size={14} aria-hidden /> Toutes les remarques</Link>
              <button type="button" className="dev-banner-btn" onClick={toggleMode}><EyeOff size={14} aria-hidden /> Quitter<span className="dev-hide-m"> le mode dev</span></button>
            </span>
          </div>
        </>
      )}
      {/* Bulles (coordonnées du document) */}
      {mode && (
        <div className="dev-pins" aria-label="Remarques de la page">
          {visible.map(({ f, n }) => {
            const p = locate(f);
            const Icon = KIND_ICON[f.kind];
            return (
              <div key={f.id} className="dev-pin-wrap" style={{ left: p.x, top: p.y }}>
                <button
                  type="button"
                  className={`dev-pin k-${f.kind} s-${f.status}${openId === f.id ? ' on' : ''}`}
                  onClick={() => setOpenId((o) => (o === f.id ? null : f.id))}
                  aria-label={`Remarque ${n} : ${KIND_LABEL[f.kind]}, ${STATUS_LABEL[f.status]}`}
                  title={f.body.slice(0, 120)}
                >
                  {f.status === 'fait' ? <Check size={13} aria-hidden /> : <><Icon size={11} aria-hidden /><span>{n}</span></>}
                </button>
                {openId === f.id && (
                  <FeedbackCard
                    f={f}
                    n={n}
                    me={me}
                    onClose={() => {
                      setOpenId(null);
                      if (target) router.replace(pathname, { scroll: false });
                    }}
                    onChanged={load}
                  />
                )}
              </div>
            );
          })}
          {draft && (
            <div className="dev-pin-wrap" style={{ left: draft.x, top: draft.y }}>
              <span className="dev-pin draft" aria-hidden>+</span>
              <Composer
                onCancel={() => setDraft(null)}
                onSave={async (v) => {
                  const res = await createFeedback({
                    path: pathname,
                    page_title: document.title,
                    selector: draft.selector,
                    rel_x: draft.rel_x,
                    rel_y: draft.rel_y,
                    page_x: draft.page_x,
                    page_y: draft.page_y,
                    viewport_w: window.innerWidth,
                    ...v,
                  });
                  if (!res.ok) return res.error;
                  setDraft(null);
                  await load();
                  setOpenId(res.id);
                  return null;
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Repère de l'élément survolé pendant le placement */}
      {placing && hover && (
        <div className="dev-hover" style={{ left: hover.left, top: hover.top, width: hover.width, height: hover.height }} aria-hidden />
      )}
      {placing && <div className="dev-placing-hint" role="status">Clique à l’endroit concerné · Échap pour annuler</div>}

      {/* Barre d'outils */}
      <div className="dev-bar" role="toolbar" aria-label="Outils dev">
        <span className="dev-bar-tag">DEV</span>
        <button type="button" className={`dev-bar-btn${mode ? ' on' : ''}`} onClick={toggleMode} aria-pressed={mode} title={mode ? 'Masquer les bulles' : 'Afficher les bulles'}>
          {mode ? <Eye size={15} aria-hidden /> : <EyeOff size={15} aria-hidden />}
          <span className="dev-bar-label">{isAdmin ? 'Mode dev' : 'Bulles'}</span>
          {openCount > 0 && <span className="dev-count">{openCount}</span>}
        </button>
        {mode && (
          <button type="button" className={`dev-bar-btn${showDone ? ' on' : ''}`} onClick={toggleDone} aria-pressed={showDone} title="Afficher aussi les remarques terminées ou refusées">
            <Check size={15} aria-hidden /> <span className="dev-bar-label">Terminées</span>
          </button>
        )}
        {canWrite && (
          <button
            type="button"
            className={`dev-bar-btn primary${placing ? ' on' : ''}`}
            onClick={() => {
              setDraft(null);
              setOpenId(null);
              setPlacing((p) => !p);
            }}
            aria-pressed={placing}
          >
            <MessageSquarePlus size={15} aria-hidden /> <span className="dev-bar-label">{placing ? 'Annuler' : 'Ajouter une remarque'}</span>
          </button>
        )}
        <Link href="/ameliorations" className="dev-bar-btn" title="Toutes les remarques">
          <ListChecks size={15} aria-hidden /> <span className="dev-bar-label">Liste</span>
        </Link>
        {loading && <Loader2 size={14} className="spin" aria-hidden />}
      </div>
      {error && (mode || placing || draft) && (
        <div className="dev-error" role="alert">
          {error}
          <button type="button" className="icon ghost small" onClick={() => setError(null)} aria-label="Fermer"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

function Composer({
  onSave,
  onCancel,
}: {
  onSave: (v: { kind: string; priority: string; body: string }) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<FeedbackKind>('amelioration');
  const [priority, setPriority] = useState('normale');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="dev-card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const err = await onSave({ kind, priority, body });
        setBusy(false);
        if (err) setError(err);
      }}
    >
      <div className="dev-card-head">
        <strong>Nouvelle remarque</strong>
        <button type="button" className="icon ghost small" onClick={onCancel} aria-label="Annuler"><X size={15} /></button>
      </div>
      <div className="dev-kinds" role="radiogroup" aria-label="Type">
        {KINDS.map((k) => {
          const Icon = KIND_ICON[k];
          return (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={`dev-kind k-${k}${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>
              <Icon size={13} aria-hidden /> {KIND_LABEL[k]}
            </button>
          );
        })}
      </div>
      <textarea
        autoFocus
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Décris ce qu’il faut modifier ou ce que tu suggères…"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) (e.currentTarget.form as HTMLFormElement)?.requestSubmit();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="dev-card-foot">
        <label className="dev-prio">
          Priorité
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </label>
        <button type="submit" className="small primary" disabled={busy || !body.trim()}>
          {busy ? <Loader2 size={14} className="spin" aria-hidden /> : <Send size={14} aria-hidden />} Enregistrer
        </button>
      </div>
      {error && <p className="dev-card-error">{error}</p>}
    </form>
  );
}

function FeedbackCard({
  f,
  n,
  me,
  onClose,
  onChanged,
}: {
  f: Feedback;
  n: number;
  me: { id: string; role: string };
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const isAdmin = me.role === 'admin';
  const mine = f.created_by === me.id;
  const editable = isAdmin || (mine && f.status === 'a_faire');
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(f.body);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const Icon = KIND_ICON[f.kind];

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setError(r.error || 'Erreur.');
    else await onChanged();
    return r.ok;
  }

  return (
    <div className="dev-card" ref={ref} role="dialog" aria-label={`Remarque ${n}`}>
      <div className="dev-card-head">
        <span className={`dev-chip k-${f.kind}`}><Icon size={12} aria-hidden /> {KIND_LABEL[f.kind]} n°{n}</span>
        <span className={`dev-status s-${f.status}`}>{STATUS_LABEL[f.status]}</span>
        {f.priority !== 'normale' && <span className={`dev-prio-chip p-${f.priority}`}>Priorité {PRIORITY_LABEL[f.priority].toLowerCase()}</span>}
        <span style={{ flex: 1 }} />
        <button type="button" className="icon ghost small" onClick={onClose} aria-label="Fermer"><X size={15} /></button>
      </div>
      <p className="dev-meta">{f.author || 'Compte supprimé'} · {fmt(f.created_at)}</p>
      {editing ? (
        <div className="dev-edit">
          <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <div className="dev-card-foot">
            <button type="button" className="small ghost" onClick={() => { setEditing(false); setText(f.body); }}>Annuler</button>
            <button type="button" className="small primary" disabled={busy || !text.trim()} onClick={async () => (await act(() => updateFeedback(f.id, { body: text }))) && setEditing(false)}>
              Enregistrer
            </button>
          </div>
        </div>
      ) : (
        <p className="dev-body">{f.body}</p>
      )}

      {isAdmin && (
        <div className="dev-statuses" role="group" aria-label="Statut">
          {STATUSES.map((s) => (
            <button key={s} type="button" disabled={busy} className={`dev-st s-${s}${f.status === s ? ' on' : ''}`} onClick={() => f.status !== s && act(() => updateFeedback(f.id, { status: s }))}>
              {STATUS_LABEL[s]}
            </button>
          ))}
          <select aria-label="Priorité" value={f.priority} disabled={busy} onChange={(e) => act(() => updateFeedback(f.id, { priority: e.target.value }))}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </div>
      )}

      {f.replies.length > 0 && (
        <ul className="dev-replies">
          {f.replies.map((r) => (
            <li key={r.id}>
              <strong>{r.author || 'Compte supprimé'}</strong> <small>{fmt(r.created_at)}</small>
              <p>{r.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form
        className="dev-reply"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!reply.trim()) return;
          if (await act(() => addReply(f.id, reply))) setReply('');
        }}
      >
        <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder={isAdmin ? 'Répondre au dev…' : 'Ajouter une précision…'} aria-label="Réponse" />
        <button type="submit" className="small icon" disabled={busy || !reply.trim()} aria-label="Envoyer"><Send size={14} /></button>
      </form>

      {editable && !editing && (
        <div className="dev-card-tools">
          <button type="button" className="small ghost" onClick={() => setEditing(true)}><Pencil size={13} aria-hidden /> Modifier</button>
          <button
            type="button"
            className="small ghost danger"
            onClick={async () => (await askConfirm(`Supprimer la remarque n°${n} ?`)) && act(() => deleteFeedback(f.id))}
          >
            <Trash2 size={13} aria-hidden /> Supprimer
          </button>
        </div>
      )}
      {error && <p className="dev-card-error">{error}</p>}
    </div>
  );
}
