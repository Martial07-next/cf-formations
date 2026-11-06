/**
 * Grille d'évaluation pratique IRVE (P1 / P2 / P3) : remplie par le formateur
 * pour chaque stagiaire (migration 63). Notes 0 à 3 (ou N/O) par critère,
 * note par famille ramenée à son barème, total sur 20.
 */

export type Level = 0 | 1 | 2 | 3 | 'NO';
export type IrveEntry = {
  qualif?: ('P1' | 'P2' | 'P3')[];
  situations?: string[];
  scores?: Record<string, Level>;
  remarks?: Record<string, string>;
  obs?: Record<string, string>;
  critical?: Record<string, boolean>;
  criticalText?: string;
  appreciation?: AppreciationKey;
  forts?: string;
  axes?: string;
  atelier?: string;
  materiel?: string;
  scenario?: string;
  conserves?: string[];
  autreDoc?: string;
  date?: string;
};
export type IrveData = { trainees?: Record<string, IrveEntry> };
export type AppreciationKey = 'maitrise' | 'consolider' | 'partiel' | 'non';

export const LEVELS: { value: Level; label: string; hint: string }[] = [
  { value: 0, label: '0', hint: 'Non réalisé / non maîtrisé' },
  { value: 1, label: '1', hint: 'Avec aide importante' },
  { value: 2, label: '2', hint: 'Avec quelques indications' },
  { value: 3, label: '3', hint: 'Maîtrisé en autonomie' },
  { value: 'NO', label: 'N/O', hint: 'Non observé' },
];

export const SITUATIONS = ['Installation', 'Mise en service', 'Maintenance', 'Diagnostic'];
export const CONSERVES = ['Fiche de mesures', 'Photos', 'Rapport de test', 'Autre'];

export const APPRECIATIONS: { key: AppreciationKey; label: string }[] = [
  { key: 'maitrise', label: 'Compétences pratiques maîtrisées' },
  { key: 'consolider', label: 'Compétences globalement acquises – points à consolider' },
  { key: 'partiel', label: 'Compétences partiellement acquises – accompagnement nécessaire' },
  { key: 'non', label: 'Compétences non maîtrisées à ce stade' },
];

export const CRITICAL: { key: string; label: string }[] = [
  { key: 'risque', label: 'Risque électrique / non-respect de la procédure de mise en sécurité' },
  { key: 'vat', label: 'VAT absente, inadaptée ou mal réalisée' },
  { key: 'raccordement', label: 'Raccordement présentant un danger manifeste' },
  { key: 'protection', label: 'Protection ou conducteur de protection inadapté / absent' },
  { key: 'autre', label: 'Autre situation à signaler' },
];

export type Family = { key: string; title: string; short: string; bareme: number; criteria: { id: string; label: string }[] };

export const FAMILIES: Family[] = [
  { key: 'A', title: 'Préparation du chantier et analyse de l’installation', short: 'Préparation et analyse', bareme: 2, criteria: [
    'Identifie le besoin, l’usage prévu et les caractéristiques de la borne.',
    'Repère l’emplacement, les contraintes d’environnement et le cheminement des câbles.',
    'Identifie l’alimentation disponible et le régime de neutre.',
    'Vérifie la puissance disponible, l’abonnement et les contraintes de l’installation.',
  ].map((label, i) => ({ id: `A${i + 1}`, label })) },
  { key: 'B', title: 'Choix et dimensionnement du matériel électrique', short: 'Choix du matériel électrique', bareme: 3, criteria: [
    'Choisit une borne adaptée à l’usage et à l’installation.',
    'Détermine une section de conducteurs cohérente avec courant, longueur et mode de pose.',
    'Choisit les protections adaptées : surintensités et différentiel, selon prescriptions applicables.',
    'Identifie les accessoires nécessaires : coffret, connectique, commande, gestion d’énergie…',
    'Justifie ses choix à partir des caractéristiques techniques et règles applicables.',
  ].map((label, i) => ({ id: `B${i + 1}`, label })) },
  { key: 'C', title: 'Mise en sécurité de l’installation', short: 'Mise en sécurité', bareme: 4, criteria: [
    'Identifie toutes les sources et parties susceptibles d’être alimentées.',
    'Effectue la mise hors tension selon la procédure adaptée.',
    'Réalise repérage, condamnation et signalisation lorsque requis.',
    'Vérifie l’absence de tension avec un VAT adapté et vérifié avant/après usage.',
    'Respecte les limites de son habilitation et les consignes de sécurité.',
  ].map((label, i) => ({ id: `C${i + 1}`, label })) },
  { key: 'D', title: 'Réalisation des raccordements électriques', short: 'Raccordements électriques', bareme: 3, criteria: [
    'Prépare les conducteurs sans détériorer l’isolant ni les brins.',
    'Respecte le repérage des conducteurs et le schéma de raccordement.',
    'Réalise les raccordements L / N / PE ou phases / N / PE selon le cas.',
    'Respecte les prescriptions de serrage du fabricant et contrôle les connexions.',
    'Contrôle le cheminement, le maintien, la protection mécanique et la propreté.',
  ].map((label, i) => ({ id: `D${i + 1}`, label })) },
  { key: 'E', title: 'Mise en service et paramétrage', short: 'Mise en service', bareme: 2, criteria: [
    'Effectue les vérifications préalables avant remise sous tension.',
    'Met en service selon la procédure du fabricant.',
    'Configure les paramètres nécessaires : puissance, intensité, réseau, accès ou communication.',
    'Vérifie le fonctionnement de la borne et le démarrage d’une charge ou séquence de test.',
    'Explique les principales informations d’état et signalisations de la borne.',
  ].map((label, i) => ({ id: `E${i + 1}`, label })) },
  { key: 'F', title: 'Utilisation du boîtier / contrôleur de test IRVE', short: 'Boîtier de test IRVE', bareme: 2, criteria: [
    'Choisit le contrôleur et les adaptateurs compatibles avec la borne.',
    'Raccorde correctement le boîtier de test en respectant la notice.',
    'Réalise les séquences de test et simulations prévues par le matériel.',
    'Observe et interprète les états de charge et les réactions de la borne.',
    'Identifie une anomalie éventuelle et explique le résultat du test.',
  ].map((label, i) => ({ id: `F${i + 1}`, label })) },
  { key: 'G', title: 'Mesures et contrôles électriques', short: 'Mesures et contrôles', bareme: 3, criteria: [
    'Choisit l’appareil de mesure adapté et vérifie son état et son adéquation.',
    'Contrôle la continuité du conducteur de protection PE selon la méthode adaptée.',
    'Réalise ou interprète la mesure de terre selon le schéma de liaison à la terre et la méthode applicable.',
    'Effectue les contrôles de tension pertinents : L/N, L/PE et N/PE selon le contexte.',
    'Contrôle les dispositifs différentiels et protections avec une méthode et un appareil adaptés.',
    'Analyse les résultats, les compare aux valeurs attendues et signale une anomalie.',
  ].map((label, i) => ({ id: `G${i + 1}`, label })) },
  { key: 'H', title: 'Contrôle final, diagnostic et traçabilité', short: 'Contrôle final et traçabilité', bareme: 1, criteria: [
    'Effectue un contrôle final visuel et fonctionnel de l’installation.',
    'Repère une anomalie ou un défaut simulé et propose une démarche de diagnostic cohérente.',
    'Renseigne les résultats des essais et les informations utiles au dossier d’intervention.',
    'Explique au client / exploitant les consignes essentielles d’utilisation et de sécurité.',
  ].map((label, i) => ({ id: `H${i + 1}`, label })) },
];

export const ALL_CRITERIA = FAMILIES.flatMap((f) => f.criteria);

/** Note d'une famille ramenée à son barème (moyenne des critères observés), au demi-point. */
export function familyNote(f: Family, e: IrveEntry | undefined): number | null {
  const vals = f.criteria.map((c) => e?.scores?.[c.id]).filter((v): v is 0 | 1 | 2 | 3 => typeof v === 'number');
  if (!vals.length) return null;
  const ratio = vals.reduce<number>((a, b) => a + b, 0) / (vals.length * 3);
  return Math.round(ratio * f.bareme * 2) / 2;
}

export function totalNote(e: IrveEntry | undefined): number | null {
  const notes = FAMILIES.map((f) => familyNote(f, e));
  if (notes.every((n) => n === null)) return null;
  return notes.reduce<number>((a, n) => a + (n ?? 0), 0);
}

export const fmtNote = (n: number | null) => (n === null ? '–' : String(n).replace('.', ','));

/** Grille complète pour un stagiaire : tous les critères notés et une appréciation. */
export function irveEntryDone(e: IrveEntry | undefined): boolean {
  return Boolean(e?.appreciation) && ALL_CRITERIA.every((c) => e?.scores?.[c.id] !== undefined);
}

export function irveCount(data: IrveData | null, ids: string[]) {
  return { done: ids.filter((id) => irveEntryDone(data?.trainees?.[id])).length, total: ids.length };
}

export function irveDone(data: IrveData | null, ids: string[]) {
  return ids.length > 0 && ids.every((id) => irveEntryDone(data?.trainees?.[id]));
}

/** Grille nécessaire : réglage de la session, sinon de la formation, sinon automatique (IRVE dans l'intitulé). */
export function irveRequired(sessionFlag: boolean | null | undefined, templateFlag: boolean | null | undefined, title: string): boolean {
  if (typeof sessionFlag === 'boolean') return sessionFlag;
  if (typeof templateFlag === 'boolean') return templateFlag;
  return /\birve\b/i.test(title || '');
}
