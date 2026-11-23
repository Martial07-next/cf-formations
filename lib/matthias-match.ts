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

/**
 * Familles de mots : un mot de la question compte aussi pour le mot de
 * référence de sa famille (« ramène » = « repris », « apprenant » = « stagiaire »).
 */
const SYNONYMS: Record<string, string[]> = {
  repris: ['ramene', 'ramener', 'recupere', 'recuperer', 'reprend', 'reprendre', 'importe', 'importer', 'remonte'],
  stagiaire: ['apprenant', 'apprenants', 'participant', 'participants', 'eleve', 'eleves', 'inscrit', 'inscrits', 'personne'],
  formateur: ['intervenant', 'intervenants', 'prof', 'animateur', 'formatrice'],
  supprimer: ['enlever', 'virer', 'retirer', 'effacer', 'supprime'],
  changer: ['modifier', 'corriger', 'changement', 'modification', 'change'],
  abandon: ['abandonne', 'desiste', 'desistement', 'annule', 'annulation'],
  capacite: ['monde', 'places', 'place', 'plein'],
  heures: ['heure', 'duree'],
  dispo: ['disponible', 'libre', 'occupe'],
  telecharger: ['recuperer pdf', 'sortir', 'extraire'],
  synchro: ['synchronisation', 'synchroniser', 'synchronise', 'maj'],
};
const SYN_OF = new Map<string, string>(Object.entries(SYNONYMS).flatMap(([k, list]) => list.map((w) => [w, k] as [string, string])));

function tokens(s: string): string[] {
  const out: string[] = [];
  for (const raw of normalize(s).split(' ')) {
    let w = ALIASES[raw] || raw;
    // « 10h30 », « 14h » : des heures.
    if (/^\d+h\d*$/.test(w)) w = 'heures';
    if (!w || STOP.has(w)) continue;
    out.push(w);
    const syn = SYN_OF.get(w);
    if (syn && syn !== w) out.push(syn);
  }
  return out;
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

export type MatthiasResult = { entry: FaqEntry | null; related: FaqEntry[]; smallTalk?: string; guess?: boolean };

/** Phrase normalisée, mots-outils compris (pour reconnaître une expression telle quelle). */
const phrase = (s: string) => ` ${normalize(s).split(' ').map((w) => ALIASES[w] || w).join(' ')} `;

/** Rareté de chaque mot dans la base : un mot présent partout (« session ») compte moins qu'un mot rare (« baudrier »). */
let idfCache: Map<string, number> | null = null;
function idf(word: string): number {
  if (!idfCache) {
    const df = new Map<string, number>();
    for (const f of FAQ) {
      const seen = new Set(f.keys.flatMap((k) => tokens(k)));
      for (const w of seen) df.set(w, (df.get(w) || 0) + 1);
    }
    idfCache = new Map([...df].map(([w, n]) => [w, 1 / (1 + Math.log(n))]));
  }
  return idfCache.get(word) ?? 1;
}

/** Score d'un mot-clé pour la question. */
function keyScore(qPhrase: string, query: string[], key: string): number {
  const kp = phrase(key).trim();
  const words = tokens(key);
  // Expression présente telle quelle (« qui peut », « a facturer ») : le plus fort.
  if (kp && qPhrase.includes(` ${kp} `)) return 1.4 + 0.7 * Math.max(1, kp.split(' ').length) * (words.length ? Math.max(...words.map(idf)) : 0.8);
  if (!words.length) return 0;
  const hits = words.map((w) => hit(query, w) * idf(w));
  if (hits.every((h) => h > 0)) return hits.reduce((a, b) => a + b, 0) * (words.length > 1 ? 1.5 : 1);
  return words.length > 1 ? hits.reduce((a, b) => a + b, 0) * 0.3 : 0;
}

export function matthiasAnswer(question: string): MatthiasResult {
  const raw = normalize(question).split(' ').filter(Boolean);
  let query = tokens(question);
  // Politesse seule (« merci », « bonjour »).
  if (query.length <= 2) {
    for (const st of SMALL_TALK) if (raw.some((w) => st.keys.includes(w)) && query.every((w) => st.keys.includes(w) || STOP.has(w))) return { entry: null, related: [], smallTalk: st.a };
  }
  // Question faite seulement de petits mots (« qui peut faire quoi ») : on les garde.
  if (!query.length) query = raw;
  if (!query.length) return { entry: null, related: [] };
  const qPhrase = phrase(question);

  const scored = FAQ.map((f) => {
    // Les meilleurs mots-clés comptent (pas leur nombre) : 1er entier, 2e à moitié, 3e au quart.
    const ks = f.keys.map((k) => keyScore(qPhrase, query, k)).filter((x) => x > 0).sort((a, b) => b - a);
    let score = (ks[0] || 0) + 0.5 * (ks[1] || 0) + 0.25 * (ks[2] || 0);
    // Un peu de poids aux mots de la question type.
    for (const w of new Set(tokens(f.q))) score += hit(query, w) * idf(w) * 0.35;
    return { f, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const related = (n: number) => scored.slice(1, 1 + n).filter((x) => x.score >= Math.max(0.8, (best?.score || 0) * 0.45)).map((x) => x.f);
  if (!best) return { entry: null, related: [] };
  if (best.score >= 1.1) return { entry: best.f, related: related(3) };
  // Pas sûr : on propose quand même la réponse la plus proche, signalée comme une supposition.
  if (best.score >= 0.55) return { entry: best.f, related: related(3), guess: true };
  return { entry: null, related: scored.slice(0, 3).map((x) => x.f) };
}
