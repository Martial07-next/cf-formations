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

function score(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const B = new Set(b);
  let common = 0;
  let weightA = 0;
  let weightB = 0;
  for (const w of a) weightA += strong(w) ? 2 : 1;
  for (const w of b) weightB += strong(w) ? 2 : 1;
  for (const w of a) if (B.has(w)) common += strong(w) ? 2 : 1;
  return (2 * common) / (weightA + weightB);
}

export function matchCatalog(name: string, templates: { id: string; title: string }[], context = ''): CatalogMatch {
  const a = tokens(name);
  if (!a.length || !templates.length) return { templateId: null, title: null, confidence: 'none', score: 0 };
  const na = norm(name);
  const ranked = templates
    .map((t) => {
      const nt = norm(t.title);
      let sc = score(a, tokens(t.title));
      // Intitulé contenu dans l'autre (« AER-RES » dans « Aérien réseau (AER-RES) »).
      if (na.length >= 3 && (nt.includes(na) || na.includes(nt))) sc += 0.25;
      // Contexte (nom de la session Digiforma) : léger départage.
      if (context) sc += 0.1 * score(tokens(context), tokens(t.title));
      return { t, sc };
    })
    .sort((x, y) => y.sc - x.sc);
  const best = ranked[0];
  const second = ranked[1]?.sc ?? 0;
  if (!best || best.sc < 0.3) return { templateId: null, title: null, confidence: 'none', score: best?.sc || 0 };
  const sure = best.sc >= 0.62 && best.sc - second >= 0.12;
  return { templateId: best.t.id, title: best.t.title, confidence: sure ? 'sure' : 'doute', score: Math.round(best.sc * 100) / 100 };
}
