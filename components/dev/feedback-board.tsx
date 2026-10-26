'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink, MessageSquare, Search } from 'lucide-react';
import { updateFeedback } from '@/app/ameliorations/actions';
import { KINDS, KIND_LABEL, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type Feedback, type FeedbackStatus } from '@/lib/dev-feedback';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'Europe/Paris' });
const PRIO_ORDER = { haute: 0, normale: 1, basse: 2 } as const;

/** Liste de toutes les remarques : filtres, statut (administrateur), lien vers la bulle sur sa page. */
export function FeedbackBoard({ items, isAdmin, meId }: { items: Feedback[]; isAdmin: boolean; meId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<'ouvertes' | FeedbackStatus | 'toutes'>('ouvertes');
  const [kind, setKind] = useState('');
  const [mine, setMine] = useState(false);
  const [query, setQuery] = useState('');
  const [local, setLocal] = useState<Record<string, FeedbackStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const st = (f: Feedback) => local[f.id] ?? f.status;

  const counts = useMemo(() => {
    const c: Record<string, number> = { a_faire: 0, en_cours: 0, fait: 0, refuse: 0 };
    for (const f of items) c[st(f)]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, local]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((f) => (status === 'toutes' ? true : status === 'ouvertes' ? st(f) === 'a_faire' || st(f) === 'en_cours' : st(f) === status))
      .filter((f) => !kind || f.kind === kind)
      .filter((f) => !mine || f.created_by === meId)
      .filter((f) => !q || `${f.body} ${f.path} ${f.page_title || ''} ${f.author || ''}`.toLowerCase().includes(q))
      .sort((a, b) => PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority] || b.created_at.localeCompare(a.created_at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, status, kind, mine, query, local, meId]);

  function setStatusOf(f: Feedback, s: FeedbackStatus) {
    const before = st(f);
    setLocal((l) => ({ ...l, [f.id]: s }));
    startTransition(async () => {
      const r = await updateFeedback(f.id, { status: s });
      if (!r.ok) {
        setError(r.error);
        setLocal((l) => ({ ...l, [f.id]: before }));
      } else router.refresh();
    });
  }

  return (
    <>
      <div className="counters" style={{ marginBottom: 14 }}>
        {STATUSES.map((s) => (
          <button key={s} type="button" className={`counter-chip fb-count s-${s}${status === s ? ' on' : ''}`} onClick={() => setStatus(status === s ? 'ouvertes' : s)}>
            <strong>{counts[s]}</strong>
            <span>{STATUS_LABEL[s].toLowerCase()}</span>
          </button>
        ))}
      </div>
      <div className="toolbar">
        <div className="toggle-group" role="group" aria-label="Statut">
          {(['ouvertes', 'toutes'] as const).map((s) => (
            <button key={s} className={status === s ? 'active' : ''} aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s === 'ouvertes' ? 'À traiter' : 'Toutes'}
            </button>
          ))}
        </div>
        <select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Tous les types</option>
          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <button className={`small${mine ? ' primary' : ''}`} aria-pressed={mine} onClick={() => setMine((v) => !v)}>Mes remarques</button>
        <span className="spacer" />
        <label className="search">
          <Search size={15} aria-hidden />
          <span className="sr-only">Rechercher</span>
          <input placeholder="Texte, page, auteur…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      {error && <div role="alert" className="alert alert-error">{error}</div>}

      {list.length === 0 ? (
        <p className="empty">Aucune remarque{status === 'ouvertes' ? ' à traiter' : ''}.</p>
      ) : (
        <div className="fb-list">
          {list.map((f) => (
            <article key={f.id} className={`fb-item k-${f.kind} s-${st(f)}`}>
              <div className="fb-head">
                <span className={`dev-chip k-${f.kind}`}>{KIND_LABEL[f.kind]}</span>
                {f.priority !== 'normale' && <span className={`dev-prio-chip p-${f.priority}`}>Priorité {PRIORITY_LABEL[f.priority].toLowerCase()}</span>}
                <span className="hint">
                  {f.author || 'Compte supprimé'} · {fmt(f.created_at)}
                </span>
                <span style={{ flex: 1 }} />
                {isAdmin ? (
                  <select className={`fb-status s-${st(f)}`} aria-label="Statut" value={st(f)} onChange={(e) => setStatusOf(f, e.target.value as FeedbackStatus)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                ) : (
                  <span className={`dev-status s-${st(f)}`}>{STATUS_LABEL[st(f)]}</span>
                )}
              </div>
              <p className="fb-body">{f.body}</p>
              <div className="fb-foot">
                <Link href={`${f.path}?remarque=${f.id}`} className="btn small">
                  <ExternalLink size={13} aria-hidden /> Voir sur la page
                </Link>
                <span className="hint fb-path" title={f.path}>{f.page_title ? `${f.page_title} · ` : ''}{f.path}</span>
                {f.replies.length > 0 && (
                  <span className="hint"><MessageSquare size={13} aria-hidden style={{ verticalAlign: '-2px' }} /> {f.replies.length} réponse{f.replies.length > 1 ? 's' : ''}</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
