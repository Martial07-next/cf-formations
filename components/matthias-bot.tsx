'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Loader2, RotateCcw, Send, Sparkles, Square, X } from 'lucide-react';
import { matthiasSuggestions } from '@/lib/matthias-suggestions';

type Turn = { role: 'user' | 'assistant'; text: string };

const STORE = 'cf_matthias_chat';

/** Mise en forme légère des réponses : gras, listes, code, liens, retours à la ligne (sans HTML brut). */
function Rich({ text }: { text: string }) {
  const inline = (s: string, k: string) => {
    const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s)]+)/g);
    return parts.map((p, i) => {
      if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={`${k}-${i}`}>{p.slice(2, -2)}</strong>;
      if (/^`[^`]+`$/.test(p)) return <code key={`${k}-${i}`}>{p.slice(1, -1)}</code>;
      if (/^https?:\/\//.test(p))
        return (
          <a key={`${k}-${i}`} href={p} target="_blank" rel="noopener noreferrer">
            {p}
          </a>
        );
      return <Fragment key={`${k}-${i}`}>{p}</Fragment>;
    });
  };
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={`l${blocks.length}`}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it, `li${blocks.length}-${i}`)}</li>
        ))}
      </Tag>
    );
    list = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-•*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((ul || ol)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push(h ? <p key={`p${blocks.length}`} className="mb-h">{inline(h[1], `h${blocks.length}`)}</p> : <p key={`p${blocks.length}`}>{inline(line, `p${blocks.length}`)}</p>);
  }
  flush();
  return <>{blocks}</>;
}

/**
 * Matthias bot : bulle d'aide en bas à droite, sur toutes les pages, pour
 * toute l'équipe connectée. Conversation gardée le temps de l'onglet.
 */
export function MatthiasBot({ role, firstName, raised = false }: { role: string; firstName: string; raised?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORE);
      if (saved) setTurns(JSON.parse(saved));
    } catch {
      /* stockage indisponible */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(turns.slice(-30)));
    } catch {
      /* stockage indisponible */
    }
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns]);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history: Turn[] = [...turns, { role: 'user', text: q }];
    setTurns([...history, { role: 'assistant', text: '' }]);
    setDraft('');
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let answer = '';
    try {
      const res = await fetch('/api/matthias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, page: pageName(pathname) }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        answer = (await res.text().catch(() => '')) || 'Matthias n’a pas pu répondre, réessaie.';
      } else {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          answer += dec.decode(value, { stream: true });
          const now = answer;
          setTurns((t) => [...t.slice(0, -1), { role: 'assistant', text: now }]);
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') answer = answer || 'Connexion perdue, réessaie.';
    } finally {
      const final = answer.trim() || '…';
      setTurns((t) => [...t.slice(0, -1), { role: 'assistant', text: final }]);
      setBusy(false);
      abortRef.current = null;
    }
  }

  const suggestions = matthiasSuggestions(role);

  return (
    <>
      {!open && (
        <button type="button" className={`mb-fab${raised ? ' raised' : ''}`} onClick={() => setOpen(true)} aria-label="Ouvrir Matthias, l’assistant de la plateforme">
          <span className="mb-avatar" aria-hidden>M</span>
          <span className="mb-fab-label">Une question ?</span>
        </button>
      )}
      {open && (
        <section className={`mb-panel${raised ? ' raised' : ''}`} role="dialog" aria-label="Matthias, l’assistant de la plateforme">
          <header className="mb-head">
            <span className="mb-avatar" aria-hidden>M</span>
            <span className="mb-title">
              <strong>Matthias</strong>
              <small>L’assistant de la plateforme CF Réseaux</small>
            </span>
            {turns.length > 0 && (
              <button type="button" className="icon ghost" onClick={() => !busy && setTurns([])} title="Nouvelle conversation" aria-label="Nouvelle conversation">
                <RotateCcw size={16} />
              </button>
            )}
            <button type="button" className="icon ghost" onClick={() => setOpen(false)} aria-label="Fermer">
              <X size={18} />
            </button>
          </header>
          <div className="mb-list" ref={listRef} aria-live="polite">
            {turns.length === 0 && (
              <div className="mb-hello">
                <p>
                  Salut {firstName || ''} 👋 Je suis <strong>Matthias</strong>. Pose-moi n’importe quelle question sur la plateforme ou Digiforma :
                  planning, sessions, dossier, documents à remplir… Écris comme tu veux, l’orthographe on s’en fiche.
                </p>
                <div className="mb-sugg">
                  {suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => ask(s)}>
                      <Sparkles size={13} aria-hidden /> {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`mb-msg ${t.role}`}>
                {t.role === 'assistant' ? (
                  t.text ? <Rich text={t.text} /> : <span className="mb-typing"><Loader2 size={14} className="spin" aria-hidden /> Matthias réfléchit…</span>
                ) : (
                  t.text
                )}
              </div>
            ))}
          </div>
          <form
            className="mb-form"
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
          >
            <textarea
              ref={inputRef}
              className="input"
              rows={1}
              value={draft}
              maxLength={4000}
              placeholder="Ta question…"
              aria-label="Ta question pour Matthias"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  ask(draft);
                }
              }}
            />
            {busy ? (
              <button type="button" className="icon" onClick={() => abortRef.current?.abort()} aria-label="Arrêter la réponse">
                <Square size={15} />
              </button>
            ) : (
              <button type="submit" className="icon primary" disabled={!draft.trim()} aria-label="Envoyer">
                <Send size={16} />
              </button>
            )}
          </form>
          <p className="mb-foot">Matthias peut se tromper : en cas de doute, demande à Martial.</p>
        </section>
      )}
    </>
  );
}

/** Nom lisible de la page ouverte (contexte donné à Matthias). */
function pageName(path: string): string {
  if (path === '/') return 'Planning';
  const map: [RegExp, string][] = [
    [/^\/sessions\/[^/]+/, 'Fiche d’une session'],
    [/^\/sessions/, 'Liste des sessions'],
    [/^\/tableau-de-bord/, 'Tableau de bord'],
    [/^\/modeles/, 'Catalogue des formations'],
    [/^\/stagiaires/, 'Stagiaires'],
    [/^\/poec/, 'Parcours POEC et personnalisés'],
    [/^\/formateurs/, 'Formateurs / historique'],
    [/^\/salles/, 'Salles'],
    [/^\/facturation/, 'Facturation'],
    [/^\/suivi/, 'Suivi interne'],
    [/^\/equipe/, 'Équipes & suivi'],
    [/^\/administration/, 'Administration'],
    [/^\/salaries/, 'Salariés'],
    [/^\/profil/, 'Mon profil'],
  ];
  return map.find(([re]) => re.test(path))?.[1] || path;
}
