/**
 * Rapprochement d'un intitulé Digiforma (module / sous-session) avec le
 * catalogue de formations de la plateforme. Les sigles comptent beaucoup
 * (« AER-RES », « BR », « B0 H0V », « IRVE P1 ») ; les petits mots presque pas.
 *   · sure  : correspondance nette → la session prend le nom du catalogue ;
 *   · doute : proche mais à vérifier (signalé) ;
 *   · none  : rien de fiable → nom Digiforma conservé.
 */

export type CatalogMatch = { templateId: string | null; title: string | null; confidence: 'sure' | 'doute' | 'none'; score: number };

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'a', 'au', 'aux', 'l', 'd', 'pour', 'sur', 'avec', 'formation', 'formations', 'module', 'modules', 'session', 'sessions', 'stage', 'h', 'heures', 'jours', 'j']);

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/\(\s*\d+\s*h\s*\)|\b\d+\s*(h|heures?|jours?)\b/g, ' ') // durées : sans effet
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function tokens(s: string): string[] {
  // Numéros seuls (« Module 3 ») ignorés ; pluriels ramenés au singulier (« aériens » = « aérien »).
  const stem = (w: string) => (w.length > 4 && /[a-z]s$/.test(w) ? w.slice(0, -1) : w);
  const t = norm(s).split(' ').filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w)).map(stem);
  // Sigles composés (« aer-res » → « aer », « res », « aerres »).
  const joined = norm(s.replace(/[-_/]/g, '')).split(' ').filter((w) => w.length >= 4 && /\d|^[a-z]{2,6}$/.test(w));
  return [...new Set([...t, ...joined])];
}

/** Mot « fort » : sigle, code avec chiffre, mot technique court (br, b0, h0v, tst, irve, p1…). */
const strong = (w: string) => /\d/.test(w) || (w.length <= 5 && !/^(et|ou|par|une|un)$/.test(w));

/**
 * Poids d'un mot : plus il est rare dans le catalogue, plus il compte
 * (« BT » ou « TST », présents partout, ne suffisent pas à reconnaître une formation).
 */
function weigher(templates: { title: string }[]) {
  const df = new Map<string, number>();
  for (const t of templates) for (const w of new Set(tokens(t.title))) df.set(w, (df.get(w) || 0) + 1);
  const n = templates.length || 1;
  return (w: string) => {
    const rarity = Math.log((n + 1) / ((df.get(w) || 0) + 0.5)) / Math.log(n + 1); // ≈ 1 rare, → 0 partout
    // Sigles un peu plus forts, mots longs et précis (« outillage », « consignation ») aussi.
    return (strong(w) ? 1.5 : w.length >= 7 ? 1.3 : 1) * Math.max(0.15, Math.min(1.2, rarity));
  };
}

function score(a: string[], b: string[], wt: (w: string) => number): number {
  if (!a.length || !b.length) return 0;
  const B = new Set(b);
  let common = 0;
  let wa = 0;
  let wb = 0;
  for (const w of a) wa += wt(w);
  for (const w of b) wb += wt(w);
  for (const w of a) if (B.has(w)) common += wt(w);
  return (2 * common) / (wa + wb);
}

export function matchCatalog(name: string, templates: { id: string; title: string }[], context = ''): CatalogMatch {
  const a = tokens(name);
  if (!a.length || !templates.length) return { templateId: null, title: null, confidence: 'none', score: 0 };
  const wt = weigher(templates);
  const na = norm(name);
  const ranked = templates
    .map((t) => {
      const nt = norm(t.title);
      let sc = score(a, tokens(t.title), wt);
      // Intitulé contenu dans l'autre (« AER-RES » dans « Aérien réseau (AER-RES) »).
      if (na.length >= 3 && (nt.includes(na) || na.includes(nt))) sc += 0.25;
      // Contexte (nom de la session Digiforma) : léger départage.
      if (context) sc += 0.1 * score(tokens(context), tokens(t.title), wt);
      return { t, sc };
    })
    .sort((x, y) => y.sc - x.sc);
  const best = ranked[0];
  const second = ranked[1]?.sc ?? 0;
  if (!best || best.sc < 0.3) return { templateId: null, title: null, confidence: 'none', score: Math.round((best?.sc || 0) * 100) / 100 };
  const sure = best.sc >= 0.62 && best.sc - second >= 0.12;
  return { templateId: best.t.id, title: best.t.title, confidence: sure ? 'sure' : 'doute', score: Math.round(best.sc * 100) / 100 };
}

/**
 * Module Digiforma : son nom (« TST BASE ») et celui de sa session
 * (« Fondamentaux des TST BT »). Le plus net des deux l'emporte ; s'ils
 * désignent deux formations différentes sans certitude, c'est « à vérifier ».
 */
export function matchModule(name: string, parent: string, templates: { id: string; title: string }[]): CatalogMatch {
  const byName = matchCatalog(name, templates, parent);
  if (!parent || parent === name) return byName;
  const byParent = matchCatalog(parent, templates, name);
  if (byName.confidence === 'sure') return byName;
  if (byParent.confidence === 'sure') return byName.templateId && byName.templateId !== byParent.templateId && byName.score > byParent.score ? { ...byName, confidence: 'doute' } : byParent;
  const best = byName.score >= byParent.score ? byName : byParent;
  return best.confidence === 'none' ? best : { ...best, confidence: 'doute' };
}
