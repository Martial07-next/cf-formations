'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { Bot, Loader2, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { matthiasSuggestions } from '@/lib/matthias-faq';
import { matthiasAnswer } from '@/lib/matthias-match';

/** related : questions proches proposées sous une réponse. */
type Turn = { role: 'user' | 'assistant'; text: string; related?: string[] };

const FORMATEUR_ROLES = ['formateur', 'referent', 'consultation'];

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
 * toute l'équipe connectée. Gratuit : les réponses viennent d'une base de
 * questions / réponses cherchée dans le navigateur (aucun service extérieur).
 */
export function MatthiasBot({ role, firstName, raised = false }: { role: string; firstName: string; raised?: boolean }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
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

  function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setTurns((t) => [...t, { role: 'user', text: q }, { role: 'assistant', text: '' }]);
    setDraft('');
    setBusy(true);
    // Réponse trouvée tout de suite ; un court délai pour la lecture.
    const r = matthiasAnswer(q);
    let text: string;
    let related: string[] = r.related.map((f) => f.q);
    if (r.smallTalk) text = r.smallTalk;
    else if (r.entry) {
      const note = r.entry.bureau && FORMATEUR_ROLES.includes(role) ? '(C’est le bureau administratif qui s’en occupe, mais voici comment ça marche.)\n\n' : '';
      text = note + r.entry.a;
    } else {
      text = related.length
        ? 'Je ne suis pas sûr d’avoir bien compris 🤔 Tu parles de l’une de ces questions ? Sinon reformule avec d’autres mots, ou demande à **Martial**.'
        : 'Je n’ai pas la réponse à ça 🤔 Essaie avec d’autres mots (ex. « QR code émargement », « placer une session », « grille IRVE »), choisis une question ci-dessous, ou demande à **Martial**.';
      if (!related.length) related = matthiasSuggestions(role).slice(0, 4);
    }
    window.setTimeout(() => {
      setTurns((t) => [...t.slice(0, -1), { role: 'assistant', text, related }]);
      setBusy(false);
    }, 350);
  }

  const suggestions = matthiasSuggestions(role);

  return (
    <>
      {!open && (
        <button type="button" className={`mb-fab${raised ? ' raised' : ''}`} onClick={() => setOpen(true)} aria-label="Ouvrir Matthias, l’assistant de la plateforme">
          <span className="mb-avatar" aria-hidden><Bot size={22} strokeWidth={2.2} /></span>
          <span className="mb-fab-label">Matthias · une question ?</span>
        </button>
      )}
      {open && (
        <section className={`mb-panel${raised ? ' raised' : ''}`} role="dialog" aria-label="Matthias, l’assistant de la plateforme">
          <header className="mb-head">
            <span className="mb-avatar" aria-hidden><Bot size={20} strokeWidth={2.2} /></span>
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
                  Salut {firstName || ''} 👋 Je suis <strong>Matthias</strong>, le robot d’aide de la plateforme. Pose-moi n’importe quelle question sur la plateforme ou Digiforma :
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
                  t.text ? <Rich text={t.text} /> : <span className="mb-typing"><Loader2 size={14} className="spin" aria-hidden /> Matthias cherche…</span>
                ) : (
                  t.text
                )}
                {t.role === 'assistant' && t.related && t.related.length > 0 && (
                  <span className="mb-related">
                    <small>{t.text.startsWith('Je n') ? 'Questions possibles :' : 'Questions proches :'}</small>
                    {t.related.map((q) => (
                      <button key={q} type="button" onClick={() => ask(q)}>
                        {q}
                      </button>
                    ))}
                  </span>
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
            <button type="submit" className="icon primary" disabled={!draft.trim() || busy} aria-label="Envoyer">
              <Send size={16} />
            </button>
          </form>
          <p className="mb-foot">Une réponse manque ? Dis-le à Martial, il l’ajoute à Matthias.</p>
        </section>
      )}
    </>
  );
}
