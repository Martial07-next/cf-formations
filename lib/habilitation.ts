/**
 * Certificats d'habilitation électrique (attestation de formation avec les
 * symboles NF C18-510). Les symboles possibles sont ceux de la formation
 * (réglage « habilitation_symbols », sinon détectés dans son intitulé) ; le
 * formateur choisit, pour chaque stagiaire, les symboles qu'il lui attribue.
 */

/** Symboles proposés dans le réglage des formations (ordre d'affichage). */
export const HAB_SYMBOLS = [
  'B0', 'H0', 'H0V', 'BF', 'HF',
  'B1', 'B1V', 'B2', 'B2V', 'B2V Essais', 'BR', 'BC', 'BE Essais', 'BE Mesurage', 'BE Vérification', 'BE Manœuvre', 'BP', 'BS', 'BN',
  'H1', 'H1V', 'H2', 'H2V', 'H2V Essais', 'HC', 'HE Essais', 'HE Mesurage', 'HE Vérification', 'HE Manœuvre', 'HN',
  'B0L', 'B1L', 'B1VL', 'B2L', 'B2VL', 'BRL', 'BCL', 'BEL',
];

// Symbole (+ complément Essais, Mesurage…) dans un intitulé de formation.
const SYMBOL_RE = /\b(B0L?|H0V?|BF|HF|B[12]V?L?|H[12]V?|BRL?|BCL?|BEL?|BS|BP|BN|HC|HE|HN)\b(\s+(?:Essais?|Mesurages?|V[ée]rifications?|Man(?:œ|oe)uvres?))?/g;
// BE / HE n'existent qu'avec un complément.
const NEEDS_SUFFIX = new Set(['BE', 'HE']);

export type ParsedTitle = { prefix: string; symbols: string[]; suffix: string };

/** Découpe « Formation Electricité BT : B0 B2V Essais BR – initiale » en avant / symboles / après. */
export function parseSymbols(raw: string): ParsedTitle {
  // Symboles collés (« H0B0 », « B1VBR ») : séparés pour la lecture.
  const title = (raw || '').replace(/(?<=\b(?:B|H)[0-2]V?L?|\bB[RCSPFN]L?)(?=(?:B|H)[0-2RCSEPFN])/g, ' ');
  const found: { s: string; start: number; end: number }[] = [];
  for (const m of title.matchAll(SYMBOL_RE)) {
    const code = m[1].toUpperCase();
    if (NEEDS_SUFFIX.has(code) && !m[2]) continue;
    found.push({ s: (code + (m[2] || '').replace(/\s+/g, ' ')).trim(), start: m.index!, end: m.index! + m[0].length });
  }
  if (!found.length) return { prefix: raw, symbols: [], suffix: '' };
  return {
    prefix: title.slice(0, found[0].start).replace(/\s+$/, ''),
    symbols: [...new Set(found.map((f) => f.s))],
    suffix: title.slice(found[found.length - 1].end).replace(/^\s+/, ''),
  };
}

/**
 * Symboles de la formation : réglage enregistré (liste séparée par des virgules ;
 * vide = pas de certificat), sinon ceux détectés dans l'intitulé.
 */
export function formationSymbols(setting: string | null | undefined, title: string): string[] {
  if (setting != null) return setting.split(',').map((s) => s.trim()).filter(Boolean);
  return parseSymbols(title).symbols;
}

/** Intitulé du certificat avec les symboles attribués au stagiaire. */
export function certificateTitle(title: string, chosen: string[]): string {
  const p = parseSymbols(title);
  const syms = chosen.join(' ');
  if (!p.symbols.length) return syms ? `${title.replace(/\s*:?\s*$/, '')} : ${syms}` : title;
  return [p.prefix, syms, p.suffix].filter(Boolean).join(' ').replace(/\s+([:–-])\s*$/, '$1').replace(/:\s*(–|-)/, ': $1');
}

export type HabAvis = 'favorable' | 'defavorable';
export type HabEntry = { avis?: HabAvis | null; symbols?: string[] };
export type HabData = { trainees?: Record<string, HabEntry> };

/** Symboles attribués : choix du formateur, sinon tous ceux de la formation. */
export function symbolsOf(entry: HabEntry | undefined, all: string[]): string[] {
  return entry?.symbols ? entry.symbols.filter((s) => all.includes(s)) : all;
}

/** Tous les certificats ont un avis. */
export function habDone(data: HabData | null | undefined, traineeIds: string[]): boolean {
  return traineeIds.length > 0 && traineeIds.every((id) => data?.trainees?.[id]?.avis);
}
