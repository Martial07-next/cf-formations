import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Numéros affichés : 1 … 4 5 [6] 7 8 … 20 */
function pageList(page: number, total: number): (number | '…')[] {
  const pages = new Set([1, total, page - 2, page - 1, page, page + 1, page + 2]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

/**
 * Pagination par liens (fonctionne sans JavaScript). `params` contient les
 * filtres courants, conservés d'une page à l'autre.
 */
export function Pagination({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (p > 1) q.set('page', String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="hint">
        {from}–{to} sur {total}
      </span>
      {totalPages > 1 && (
        <span className="pages">
          {page > 1 ? (
            <Link href={href(page - 1)} className="page-link" aria-label="Page précédente"><ChevronLeft size={16} /></Link>
          ) : (
            <span className="page-link disabled" aria-hidden><ChevronLeft size={16} /></span>
          )}
          {pageList(page, totalPages).map((p, i) =>
            p === '…' ? (
              <span key={`e${i}`} className="page-gap">…</span>
            ) : (
              <Link key={p} href={href(p)} className={`page-link${p === page ? ' current' : ''}`} aria-current={p === page ? 'page' : undefined}>
                {p}
              </Link>
            )
          )}
          {page < totalPages ? (
            <Link href={href(page + 1)} className="page-link" aria-label="Page suivante"><ChevronRight size={16} /></Link>
          ) : (
            <span className="page-link disabled" aria-hidden><ChevronRight size={16} /></span>
          )}
        </span>
      )}
    </nav>
  );
}
