import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTH_LABELS } from '@/lib/history';
import { formatHours } from '@/lib/week';

export type MonthlyRow = {
  label: string;
  href?: string;
  color?: string | null;
  done: number[];
  planned: number[];
  sessions: number[];
};

function Cell({ done, planned }: { done: number; planned: number }) {
  const total = done + planned;
  if (total === 0) return <span className="hint">-</span>;
  return (
    <>
      <strong>{formatHours(total)}</strong>
      {planned > 0 && <small className="planned-part">{done > 0 ? `dont ${formatHours(planned)} à venir` : 'à venir'}</small>}
    </>
  );
}

const sum = (a: number[]) => a.reduce((n, x) => n + x, 0);

/** Tableau de suivi : heures mois par mois puis total de l'année. */
export function MonthlyTable({
  rows,
  year,
  yearHref,
  title,
}: {
  rows: MonthlyRow[];
  year: number;
  yearHref: (y: number) => string;
  title: string;
}) {
  const currentMonth = new Date().getUTCFullYear() === year ? new Date().getUTCMonth() : -1;
  const totals = {
    done: MONTH_LABELS.map((_, m) => sum(rows.map((r) => r.done[m]))),
    planned: MONTH_LABELS.map((_, m) => sum(rows.map((r) => r.planned[m]))),
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span className="year-nav">
          <Link href={yearHref(year - 1)} className="page-link" aria-label="Année précédente"><ChevronLeft size={16} /></Link>
          <strong>{year}</strong>
          <Link href={yearHref(year + 1)} className="page-link" aria-label="Année suivante"><ChevronRight size={16} /></Link>
        </span>
      </div>
      <div className="table-wrap">
        <table className="data monthly">
          <thead>
            <tr>
              <th>{rows.length > 1 ? 'Formateur' : 'Mois'}</th>
              {MONTH_LABELS.map((m, i) => (
                <th key={m} className={`num${i === currentMonth ? ' current-month' : ''}`}>{m}</th>
              ))}
              <th className="num year-total">Total {year}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>
                  {r.href ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                      <Link href={r.href} className="trainer-tag">
                        {r.color && <span className="swatch" style={{ background: r.color }} aria-hidden />}
                        {r.label}
                      </Link>
                      <Link href={r.href} className="btn small" style={{ whiteSpace: 'nowrap' }} aria-label={`Voir la fiche de ${r.label}`}>
                        Voir la fiche
                      </Link>
                    </span>
                  ) : (
                    r.label
                  )}
                </td>
                {MONTH_LABELS.map((m, i) => (
                  <td key={m} className={`num${i === currentMonth ? ' current-month' : ''}`}>
                    <Cell done={r.done[i]} planned={r.planned[i]} />
                    {r.sessions[i] > 0 && <small className="hint">{r.sessions[i]} sess.</small>}
                  </td>
                ))}
                <td className="num year-total">
                  <Cell done={sum(r.done)} planned={sum(r.planned)} />
                </td>
              </tr>
            ))}
            {rows.length > 1 && (
              <tr className="total-row">
                <td>Total équipe</td>
                {MONTH_LABELS.map((m, i) => (
                  <td key={m} className={`num${i === currentMonth ? ' current-month' : ''}`}>
                    <Cell done={totals.done[i]} planned={totals.planned[i]} />
                  </td>
                ))}
                <td className="num year-total">
                  <Cell done={sum(totals.done)} planned={sum(totals.planned)} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        Heures de formation (pause 12h–13h déduite, brouillons exclus). Une session à cheval sur deux mois est répartie jour par jour.
      </p>
    </div>
  );
}
