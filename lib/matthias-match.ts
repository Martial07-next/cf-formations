import { FAQ, SMALL_TALK, type FaqEntry } from '@/lib/matthias-faq';

/**
 * Recherche de Matthias, tolérante aux fautes : sans accents ni majuscules,
 * mots outils ignorés, un mot proche (une ou deux lettres de différence, ou
 * même début) compte comme le bon mot. Tout se fait dans le navigateur.
 */

const STOP = new Set(
  'le la les l de du des d un une et a au aux pour par sur dans en je j tu il elle on nous vous ils me te se moi toi comment faire fait fais faut quoi quel quelle quels quelles est ce c ca cela que qu qui ou mon ma mes ton ta tes son sa ses avec pas plus ne n y t s etre avoir peux peut veux voudrais dois doit bien tout tous toute il y a svp stp merci aide aider question est-ce'
    .split(' ')
);

/** Écritures courantes → mot de la base. */
const ALIASES: Record<string, string> = {
  digi: 'digiforma',
  digiformat: 'digiforma',
  digifirma: 'digiforma',
  digforma: 'digiforma',
  dgiforma: 'digiforma',
  qrcode: 'qr',
  qrcodes: 'qr',
  emargment: 'emargement',
  emargements: 'emargement',
  signatures: 'signature',
  sessions: 'session',
  stagiaires: 'stagiaire',
  formateurs: 'formateur',
  intervenants: 'intervenant',
  feries: 'ferie',
  evenements: 'evenement',
  evenemnt: 'evenement',
  event: 'evenement',
  apprec: 'appreciation',
  tdt: 'tdt',
  mdp: 'mdp',
  pv: 'pv',
  w: 'week',
  we: 'week',
};

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9/]+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .map((w) => ALIASES[w] || w)
    .filter((w) => w && !STOP.has(w));
}

/** Distance d'édition (avec inversion de deux lettres), arrêtée au-delà de `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** Le mot tapé correspond au mot de la base (exact, même racine, ou faute de frappe). */
function close(typed: string, key: string): number {
  if (typed === key) return 1;
  if (key.length <= 3 || typed.length <= 3) return 0; // petits mots (p1, qr, sst) : exacts seulement
  const common = Math.min(typed.length, key.length);
  if (common >= 5 && (typed.startsWith(key.slice(0, 5)) && key.startsWith(typed.slice(0, 5)))) return 0.85; // émarger / émargement
  const max = key.length >= 8 ? 2 : 1;
  return distance(typed, key, max) <= max ? 0.8 : 0;
}

function hit(query: string[], word: string): number {
  let best = 0;
  for (const t of query) best = Math.max(best, close(t, word));
  return best;
}

export type MatthiasResult = { entry: FaqEntry | null; related: FaqEntry[]; smallTalk?: string };

export function matthiasAnswer(question: string): MatthiasResult {
  const query = tokens(question);
  const raw = normalize(question).split(' ');
  // Politesse seule (« merci », « bonjour »).
  if (query.length <= 2) {
    for (const st of SMALL_TALK) if (raw.some((w) => st.keys.includes(w)) && query.every((w) => st.keys.includes(w) || STOP.has(w))) return { entry: null, related: [], smallTalk: st.a };
  }
  if (!query.length) return { entry: null, related: [] };

  const scored = FAQ.map((f) => {
    let score = 0;
    for (const key of f.keys) {
      const words = tokens(key);
      if (!words.length) continue;
      const hits = words.map((w) => hit(query, w));
      const all = hits.every((h) => h > 0);
      const sum = hits.reduce((a, b) => a + b, 0);
      if (all) score += sum * (words.length > 1 ? 1.6 : 1); // expression complète : plus forte
      else if (words.length > 1) score += sum * 0.35;
    }
    // Un peu de poids aux mots de la question type.
    for (const w of tokens(f.q)) score += hit(query, w) * 0.3;
    return { f, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 1.2) return { entry: null, related: scored.slice(0, 3).map((x) => x.f) };
  return { entry: best.f, related: scored.slice(1, 4).filter((x) => x.score >= Math.max(1, best.score * 0.45)).map((x) => x.f) };
}
