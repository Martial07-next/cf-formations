'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { Search, X, Folder } from 'lucide-react';
import { formatHours } from '@/lib/week';

type T = { id: string; title: string; category: string | null; duration_hours: number };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Recherche rapide d'une formation du catalogue : on tape quelques lettres
 * (nom ou dossier, accents ignorés), flèches ↑↓ puis Entrée pour choisir.
 */
export function TemplatePicker({ templates, value, onChange }: { templates: T[]; value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = templates.find((t) => t.id === value) || null;

  const results = useMemo(() => {
    const words = norm(query).split(/\s+/).filter(Boolean);
    return templates
      .filter((t) => {
        const hay = norm(`${t.title} ${t.category ?? ''}`);
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => (a.category || '').localeCompare(b.category || '', 'fr') || a.title.localeCompare(b.title, 'fr'))
      .slice(0, 40);
  }, [templates, query]);

  function choose(t: T) {
    onChange(t.id);
    setQuery('');
    setOpen(false);
  }

  if (selected) {
    return (
      <div className="picker-selected">
        <Folder size={15} aria-hidden />
        <span>
          {selected.category && <span className="hint">{selected.category} › </span>}
          <strong>{selected.title}</strong> · {formatHours(Number(selected.duration_hours))}
        </span>
        <button
          type="button"
          className="small ghost"
          onClick={() => {
            onChange('');
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
        >
          <X size={14} aria-hidden /> Changer
        </button>
      </div>
    );
  }

  return (
    <div className="picker">
      <span className="search" style={{ width: '100%' }}>
        <Search size={15} aria-hidden />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Rechercher une formation du catalogue"
          placeholder="Rechercher une formation (ex. « hab b0 », « sst »)… ou laisser vide pour une formation libre"
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && open && results[active]) {
              e.preventDefault();
              choose(results[active]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          style={{ width: '100%' }}
        />
      </span>
      {open && (
        <ul className="picker-list" id={listId} role="listbox">
          {results.length === 0 ? (
            <li className="hint" style={{ padding: '8px 12px' }}>Aucune formation trouvée.</li>
          ) : (
            results.map((t, i) => (
              <li
                key={t.id}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'active' : ''}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(t);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span>
                  {t.category && <span className="hint">{t.category} › </span>}
                  {t.title}
                </span>
                <span className="hint">{formatHours(Number(t.duration_hours))}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
