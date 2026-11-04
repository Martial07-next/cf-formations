import { parseSymbols } from '@/lib/habilitation';
import { REUSSITE_MODELS } from '@/lib/reussite';

/**
 * Configuration intelligente d'une formation : à partir de son intitulé, on
 * propose les réglages adaptés (certificat d'habilitation, titre exigé,
 * recyclage, attestations IRVE, durée, objectifs du certificat). Rien n'est
 * appliqué sans un clic : ce sont des suggestions.
 */

export type Suggestion =
  | { id: string; kind: 'check'; field: string; value?: string; label: string; why: string }
  | { id: string; kind: 'duration'; hours: number; label: string; why: string }
  | { id: string; kind: 'text'; field: string; text: string; label: string; why: string };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Objectifs types (NF C18-510) selon les symboles de la formation. */
export function habilitationObjectives(symbols: string[]): string[] {
  const has = (re: RegExp) => symbols.some((s) => re.test(s));
  const hta = has(/^H/);
  const domain = hta && has(/^B/) ? 'BT et HTA' : hta ? 'HTA' : 'BT';
  const out = ['Connaître les dangers de l’électricité et analyser le risque électrique', 'Intégrer la prévention dans l’organisation du travail'];
  if (has(/^(B0|H0V?|BF|HF)$/)) out.push(`Réaliser des travaux d’ordre non électrique en sécurité dans un environnement électrique ${domain}`);
  if (has(/^[BH][12]V?$/)) out.push(`Réaliser des travaux d’ordre électrique hors tension et au voisinage des installations ${domain}`);
  if (has(/^[BH]2V?/)) out.push('Organiser et diriger des travaux électriques en tant que chargé de travaux');
  if (has(/^BR$/)) out.push('Réaliser des interventions BT générales (dépannage, raccordement, mise en service) en sécurité');
  if (has(/^[BH]C$/)) out.push(`Réaliser des consignations d’installations électriques ${domain}`);
  if (has(/Essais/)) out.push('Réaliser des essais sur les ouvrages et installations électriques');
  if (has(/Mesurage/)) out.push('Réaliser des mesurages en sécurité');
  if (has(/V[ée]rification/)) out.push('Réaliser des vérifications d’installations électriques');
  if (has(/Man(œ|oe)uvre/)) out.push('Réaliser des manœuvres d’exploitation en sécurité');
  if (has(/^BS$/)) out.push('Réaliser des interventions élémentaires (remplacement, raccordement à l’identique)');
  if (has(/^BP$/)) out.push('Intervenir en sécurité sur des installations photovoltaïques');
  if (has(/L$/)) out.push('Intervenir en sécurité sur les véhicules et engins à motorisation électrique');
  out.push('Remplir les documents à transmettre et rendre compte de son activité');
  return out;
}

/** Durée écrite dans l'intitulé : « (14h) », « 21 heures », « 2 jours », « 3j ». */
export function durationFromTitle(title: string): number | null {
  const t = norm(title);
  const h = t.match(/(\d{1,3})\s*(h|heures?)\b/);
  if (h) return Number(h[1]);
  const d = t.match(/(\d{1,2})\s*(j|jours?)\b/);
  if (d) return Number(d[1]) * 7;
  return null;
}

export function suggestFor(title: string): Suggestion[] {
  if (!title.trim()) return [];
  const t = norm(title);
  const out: Suggestion[] = [];
  const symbols = parseSymbols(title).symbols;
  const habilitation = symbols.length > 0 || /habilitation/.test(t);

  // Recyclage d'une habilitation : le titre précédent est exigé.
  if (habilitation && /recyclage/.test(t)) {
    out.push({ id: 'titre', kind: 'check', field: 'titre_habilitation', label: 'Exiger le titre d’habilitation', why: 'Recyclage d’habilitation : le stagiaire doit présenter son titre actuel.' });
  }
  // Initiale et recyclage dans la même formation.
  if (/initial(e)?\b.*recyclage|recyclage.*initial(e)?\b|initiale?\s*\/\s*recyclage/.test(t)) {
    out.push({ id: 'recyclage', kind: 'check', field: 'recyclage_available', label: 'Activer Initial / Recyclage', why: 'L’intitulé couvre l’initiale et le recyclage : chaque stagiaire est classé à la session.' });
  }
  // IRVE : attestations de réussite par niveau.
  for (const m of REUSSITE_MODELS) {
    const code = m.label.replace(/^IRVE\s+/, '').toLowerCase();
    if (/irve/.test(t) && new RegExp(`\\b${code}\\b`).test(t)) {
      out.push({ id: `ar-${m.key}`, kind: 'check', field: 'attestation_reussite', value: m.key, label: `Attestation de réussite ${m.label}`, why: `« ${m.label} » figure dans l’intitulé.` });
    }
  }
  // Durée écrite dans l'intitulé.
  const hours = durationFromTitle(title);
  if (hours && hours <= 300) out.push({ id: 'duree', kind: 'duration', hours, label: `Durée : ${hours} h`, why: 'Durée indiquée dans l’intitulé.' });
  // Objectifs du certificat selon les symboles.
  if (symbols.length) {
    out.push({
      id: 'objectifs',
      kind: 'text',
      field: 'objectifs_habilitation',
      text: habilitationObjectives(symbols).map((o) => `- ${o}`).join('\n'),
      label: `Objectifs du certificat (${symbols.join(' ')})`,
      why: 'Objectifs types de la norme NF C18-510 pour ces symboles, modifiables.',
    });
  }
  return out;
}
