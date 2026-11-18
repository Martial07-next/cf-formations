import type { Metadata } from 'next';
import { Download, ShieldCheck } from 'lucide-react';
import { RGPD_INTRO, RGPD_SECTIONS, RGPD_SUBTITLE, RGPD_TITLE, RGPD_VERSION, type RgpdBlock } from '@/lib/rgpd';

export const metadata: Metadata = { title: 'Protection des données · CF Réseaux', robots: { index: false, follow: false } };

/** Gras « **…** » du texte → <strong>. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (/^\*\*[^*]+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>))}
    </>
  );
}

function Block({ b }: { b: RgpdBlock }) {
  if (b.kind === 'p') return <p><Rich text={b.text} /></p>;
  if (b.kind === 'note') return <p className="rgpd-note"><Rich text={b.text} /></p>;
  if (b.kind === 'list')
    return (
      <ul>
        {b.items.map((it, i) => (
          <li key={i}><Rich text={it} /></li>
        ))}
      </ul>
    );
  return (
    <div className="rgpd-table">
      <table>
        <thead>
          <tr>{b.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
        </thead>
        <tbody>
          {b.rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row"><Rich text={c} /></th> : <td key={j}><Rich text={c} /></td>))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Page publique (sans compte) : ouverte depuis les pages des QR codes. */
export default function ConfidentialitePage() {
  return (
    <main className="sign-page">
      <article className="sign-card rgpd">
        <p className="sign-brand">CF Réseaux · Protection des données</p>
        <h1><ShieldCheck size={22} aria-hidden /> {RGPD_TITLE}</h1>
        <p className="rgpd-sub">{RGPD_SUBTITLE}</p>
        <p className="rgpd-intro">{RGPD_INTRO}</p>
        <a className="btn small" href="/rgpd-cf-reseaux.pdf" download>
          <Download size={14} aria-hidden /> Télécharger en PDF
        </a>
        {RGPD_SECTIONS.map((s, i) => (
          <section key={s.title}>
            <h2><span className="rgpd-num">{i + 1}</span> {s.title}</h2>
            {s.blocks.map((b, j) => <Block key={j} b={b} />)}
          </section>
        ))}
        <p className="hint rgpd-version">{RGPD_VERSION}</p>
      </article>
    </main>
  );
}
