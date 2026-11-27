'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck, Link2, Link2Off, Mail, Receipt, Settings, Shirt, FileText, Users } from 'lucide-react';
import { setDigiformaDocsUrl, setDigiformaNone } from '@/app/sessions/[id]/actions';

export type TodoItem = {
  key: string;
  kind: 'digiforma' | 'prepare' | 'close' | 'link';
  group: 'avant' | 'apres' | 'admin';
  /** 3 urgent · 2 important · 1 normal. */
  urgency: number;
  sessionId?: string;
  href?: string;
  title: string;
  meta?: string;
  badge?: string;
  label: string;
  reasons?: string[];
  manager?: string | null;
  closure?: {
    trainerLeft: number;
    officeLeft: number;
    loans: { id: string; traineeId: string; name: string; text: string; signed: boolean; mail: string | null }[];
    billed: boolean | null;
    trainerName: string | null;
    trainerMail: string | null;
  };
};

const GROUPS: { id: TodoItem['group']; title: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'avant', title: 'Avant la formation', icon: <CalendarClock size={17} aria-hidden />, hint: 'Sessions en cours ou qui commencent d’ici la fin de la semaine prochaine.' },
  { id: 'apres', title: 'Après la formation · à clôturer', icon: <ClipboardCheck size={17} aria-hidden />, hint: 'Sessions terminées (4 derniers mois) : dossier, prêts, facturation.' },
  { id: 'admin', title: 'Administration', icon: <Settings size={17} aria-hidden />, hint: '' },
];

const firstName = (n: string | null) => (n || '').split(/\s+/).find((w) => w && w !== w.toUpperCase()) || 'le formateur';

/** Liste « À faire » : action sur chaque ligne, la ligne disparaît une fois réglée. */
export function TodoBoard({ items, canBill }: { items: TodoItem[]; canBill: boolean }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'tout' | TodoItem['group']>('tout');
  const visible = items.filter((i) => !hidden.has(i.key));
  // Compteur du menu (« À faire » · N), mis à jour à chaque visite.
  useEffect(() => {
    try {
      localStorage.setItem('cf_todo_count', String(visible.length));
      window.dispatchEvent(new Event('cf:todo-count'));
    } catch {}
  }, [visible.length]);
  const hide = (key: string) => setHidden((h) => new Set(h).add(key));
  const counts = Object.fromEntries(GROUPS.map((g) => [g.id, visible.filter((i) => i.group === g.id).length]));
  const urgent = visible.filter((i) => i.urgency >= 3).length;

  if (!visible.length) {
    return (
      <div className="todo-empty">
        <CheckCircle2 size={34} aria-hidden />
        <strong>Tout est à jour</strong>
        <span className="hint">Rien n’attend l’équipe pour l’instant.</span>
      </div>
    );
  }

  return (
    <>
      <div className="todo-filters" role="tablist" aria-label="Filtrer">
        <button type="button" role="tab" aria-selected={filter === 'tout'} className={filter === 'tout' ? 'on' : ''} onClick={() => setFilter('tout')}>
          Tout <b>{visible.length}</b>
        </button>
        {GROUPS.filter((g) => counts[g.id]).map((g) => (
          <button key={g.id} type="button" role="tab" aria-selected={filter === g.id} className={filter === g.id ? 'on' : ''} onClick={() => setFilter(g.id)}>
            {g.title.split(' · ')[0]} <b>{counts[g.id]}</b>
          </button>
        ))}
        {urgent > 0 && (
          <span className="todo-urgent-count">
            <AlertTriangle size={13} aria-hidden /> {urgent} urgent{urgent > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {GROUPS.filter((g) => (filter === 'tout' || filter === g.id) && counts[g.id]).map((g) => (
        <section key={g.id} className="todo-group">
          <h2 className="sub-heading">
            {g.icon} {g.title} <span className="todo-count">{counts[g.id]}</span>
          </h2>
          {g.hint && <p className="hint todo-group-hint">{g.hint}</p>}
          <ul className="todo-list">
            {visible
              .filter((i) => i.group === g.id)
              .map((i) => (
                <TodoRow key={i.key} item={i} canBill={canBill} onDone={() => hide(i.key)} />
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function TodoRow({ item: i, canBill, onDone }: { item: TodoItem; canBill: boolean; onDone: () => void }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error || 'Erreur');
      onDone();
      router.refresh();
    });
  const href = i.href || (i.sessionId ? `/sessions/${i.sessionId}` : '#');
  const tone = i.urgency >= 3 ? 'urgent' : i.urgency === 2 ? 'warn' : '';

  return (
    <li className={`todo-row ${tone}`}>
      <div className="todo-main">
        <span className={`todo-label k-${i.kind}`}>{i.label}</span>
        <Link href={i.kind === 'close' ? `${href}?cloture=1#cloture` : href} className="todo-title">
          {i.title}
        </Link>
        {i.meta && <span className="hint">{i.meta}</span>}
        {i.reasons && i.reasons.length > 0 && (
          <span className="todo-reasons">
            {i.reasons.map((r) => (
              <span key={r} className="todo-chip">{r}</span>
            ))}
            {i.manager && <span className="hint"> · suivi par {i.manager}</span>}
          </span>
        )}
        {i.closure && (
          <span className="todo-reasons">
            <span className={`todo-chip ${i.closure.trainerLeft ? '' : 'ok'}`}>
              <Users size={12} aria-hidden /> {i.closure.trainerLeft ? `Formateur : ${i.closure.trainerLeft} à remplir` : 'Formateur : fait'}
            </span>
            <span className={`todo-chip ${i.closure.officeLeft ? '' : 'ok'}`}>
              <FileText size={12} aria-hidden /> {i.closure.officeLeft ? `Bureau : ${i.closure.officeLeft} à remplir` : 'Bureau : fait'}
            </span>
            <span className={`todo-chip ${i.closure.loans.length ? 'bad' : 'ok'}`}>
              <Shirt size={12} aria-hidden /> {i.closure.loans.length ? `Prêts : ${i.closure.loans.length} pas rendu${i.closure.loans.length > 1 ? 's' : ''}` : 'Prêts : ok'}
            </span>
            {i.closure.billed !== null && (
              <span className={`todo-chip ${i.closure.billed ? 'ok' : ''}`}>
                <Receipt size={12} aria-hidden /> {i.closure.billed ? 'Facturée' : 'À facturer'}
              </span>
            )}
          </span>
        )}
        {i.closure && i.closure.loans.length > 0 && (
          <ul className="todo-loans">
            {i.closure.loans.map((l) => (
              <li key={l.id}>
                <Link href={`/stagiaires/${l.traineeId}#vetements`}>{l.name}</Link> · {l.text}
                {!l.signed && ' (pas signé)'}
                {l.mail && (
                  <a className="closure-mini" href={l.mail}>
                    <Mail size={12} aria-hidden /> Relancer
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        {i.kind === 'digiforma' && (
          <form
            className="todo-df"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) run(() => setDigiformaDocsUrl(i.sessionId!, url));
            }}
          >
            <input type="url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Colle le lien de l’intervenant (Digiforma › session › Accès)" aria-label="Lien Digiforma" />
            <button type="submit" className="small primary" disabled={isPending || !url.trim()}>
              <Link2 size={13} aria-hidden /> Enregistrer
            </button>
            <button type="button" className="small ghost" disabled={isPending} onClick={() => run(() => setDigiformaNone(i.sessionId!, true))}>
              <Link2Off size={13} aria-hidden /> Pas de lien
            </button>
          </form>
        )}
        {error && <span role="alert" className="field-error">{error}</span>}
      </div>
      <div className="todo-side">
        {i.badge && <span className={`todo-badge ${tone}`}>{i.badge}</span>}
        <span className="todo-actions">
          {i.closure?.trainerMail && (
            <a className="btn small" href={i.closure.trainerMail} title="Ouvre ta messagerie avec un mail prêt à envoyer">
              <Mail size={14} aria-hidden /> Relancer {firstName(i.closure.trainerName)}
            </a>
          )}
          {i.kind === 'close' ? (
            <Link className="btn small primary" href={`${href}?cloture=1#cloture`}>
              {i.closure && !i.closure.trainerLeft && !i.closure.officeLeft && !i.closure.loans.length && i.closure.billed === false && canBill ? 'Facturer' : 'Clôturer'} <ChevronRight size={14} aria-hidden />
            </Link>
          ) : i.kind !== 'digiforma' ? (
            <Link className="btn small" href={href}>
              Ouvrir <ChevronRight size={14} aria-hidden />
            </Link>
          ) : null}
        </span>
      </div>
    </li>
  );
}
