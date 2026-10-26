/**
 * Attestations de réussite (une par stagiaire), remplies par le formateur.
 * Modèles CF Réseaux : chaque formation concernée indique le sien
 * (Formations › Modifier). Module léger, sans PDF.
 */

export type ReussiteModel = {
  key: string;
  /** Intitulé imprimé (ex. « IRVE P1 »). */
  label: string;
  objectives: string[];
  /** Phrase finale (mention QUALIFELEC…). */
  mention: string;
  /** Durée habituelle (sans module de session correspondant). */
  hours: number;
  days: number;
};

const IRVE = 'Une attestation de formation est délivrée à l’issue de cette formation, elle vous permettra d’obtenir la mention';

export const REUSSITE_MODELS: ReussiteModel[] = [
  {
    key: 'irve_p1',
    hours: 7,
    days: 1,
    label: 'IRVE P1',
    objectives: [
      'Comprendre les enjeux de ce marché.',
      'Identifier les besoins liés aux types de véhicule, à leur exploitation et aux installations électriques des clients.',
      'Identifier les normes, les types d’architectures, connaître les caractéristiques principales des bornes de recharge et des prises.',
      'Identifier les réglementations en vigueur.',
      'Identifier les exigences de sécurité propres aux infrastructures de recharge de véhicules électriques.',
      'Déterminer les composants nécessaires à l’adaptation de l’installation électrique.',
      'Mettre en œuvre, tester et mettre en service la borne de recharge.',
    ],
    mention: `${IRVE} IRVE de niveau 1 auprès de QUALIFELEC.`,
  },
  {
    key: 'irve_p2',
    hours: 14,
    days: 2,
    label: 'IRVE P2',
    objectives: [
      'Déterminer l’infrastructure nécessaire (déploiement en étoile ou en rocade et le sous-comptage) et les modifications de l’installation électrique.',
      'Connaître les réglementations propres aux BUP/ERP et aux parcs de stationnement.',
      'Choisir la borne de recharge adéquate et les accessoires associés.',
      'Connaître les constituants de base dans le protocole TCP/IP.',
      'Mettre en œuvre et paramétrer les bornes de recharge communicantes.',
      'Concevoir une grappe de bornes de recharge avec communication embarquée.',
      'Savoir paramétrer un gestionnaire de bornes de recharge.',
      'Élaborer les documents nécessaires à l’obtention de la conformité par un bureau de contrôle.',
    ],
    mention: `${IRVE} IRVE de niveau 2 auprès de QUALIFELEC.`,
  },
  {
    key: 'irve_p3',
    hours: 14,
    days: 2,
    label: 'IRVE P3',
    objectives: [
      'Installer une infrastructure de recharge rapide selon les règles de l’art.',
      'Déterminer l’infrastructure nécessaire (déploiement en étoile ou en rocade et le sous-comptage) et les modifications de l’installation électrique.',
      'Connaître les réglementations applicables aux IRVE de recharge rapide dans les ERP, les parcs de stationnement, les stations-services, la voie publique.',
      'Connaître les constituants de base des bornes de recharge en DC.',
      'Mettre en œuvre et paramétrer les bornes de charge communicantes.',
      'Effectuer les opérations d’auto-contrôle.',
      'Élaborer les documents nécessaires à l’obtention de la conformité par un bureau de contrôle.',
    ],
    mention: `${IRVE} IRVE de niveau 3 auprès de QUALIFELEC.`,
  },
  {
    key: 'irve_ma1',
    hours: 7,
    days: 1,
    label: 'IRVE MA1',
    objectives: [
      'Comprendre et mettre en œuvre une maintenance préventive et/ou curative des IRVE, en complément des formations P1 ou P2, dans le respect des consignes des fabricants de bornes.',
      'Assurer la maintenance élémentaire et de diagnostics NIV 1 et NIV 2 des bornes AC selon AFNOR NF X 60-000 : dépannages par échange standard des éléments prévus à cet effet et opérations mineures de maintenance préventive, telles que graissage ou contrôle de bon fonctionnement.',
      'Respecter les objectifs du décret n° 2021-546 du 4 mai 2021 portant modification du décret n° 2017-26 du 12 janvier 2017 relatif aux infrastructures de recharge pour véhicules électriques, ainsi que l’arrêté du 27 octobre 2021 relatif aux qualifications pour les études de conception, l’installation et la maintenance des infrastructures de recharge pour véhicules électriques.',
      'Réaliser les opérations de maintenance permettant d’accéder aux subventions conditionnées.',
    ],
    mention: `${IRVE} Maintenance IRVE de niveau 1 auprès de QUALIFELEC.`,
  },
  {
    key: 'irve_ma2',
    hours: 7,
    days: 1,
    label: 'IRVE MA2',
    objectives: [
      'Comprendre et mettre en œuvre une maintenance préventive et/ou curative des IRVE, en complément de la formation MA1.',
      'Maintenance des bornes AC communicantes.',
      'Assurer les opérations de maintenance élémentaires et de diagnostics NIV 1 (selon AFNOR FD X 60-000 de 2002) : opérations simples relevant de l’exploitation courante.',
      'Assurer les opérations de maintenance élémentaires et de diagnostics NIV 2 (selon AFNOR FD X 60-000 de 2002) : dépannages par échange standard des éléments prévus à cet effet et opérations mineures de maintenance préventive, telles que graissage ou contrôle de bon fonctionnement.',
      'Assurer une partie des opérations de maintenance élémentaires et de diagnostics NIV 3 (selon AFNOR FD X 60-000 de 2002), opérations complexes. L’intervention doit au préalable être le fruit d’un diagnostic et d’une identification.',
    ],
    mention: `${IRVE} Maintenance IRVE de niveau 2 auprès de QUALIFELEC.`,
  },
  {
    key: 'irve_ma3',
    hours: 7,
    days: 1,
    label: 'IRVE MA3',
    objectives: [
      'Comprendre et mettre en œuvre une maintenance préventive et/ou curative des IRVE, en complément de la formation MA1.',
      'Maintenance des bornes DC.',
      'Assurer les opérations de maintenance élémentaires et de diagnostics NIV 1 (selon AFNOR FD X 60-000 de 2002) : opérations simples relevant de l’exploitation courante.',
      'Assurer les opérations de maintenance élémentaires et de diagnostics NIV 2 (selon AFNOR FD X 60-000 de 2002) : dépannages par échange standard des éléments prévus à cet effet et opérations mineures de maintenance préventive, telles que graissage ou contrôle de bon fonctionnement.',
      'Assurer une partie des opérations de maintenance élémentaires et de diagnostics NIV 3 (selon AFNOR FD X 60-000 de 2002), opérations complexes. L’intervention doit au préalable être le fruit d’un diagnostic et d’une identification.',
    ],
    mention: `${IRVE} Maintenance IRVE de niveau 3 auprès de QUALIFELEC.`,
  },
];

export const reussiteModel = (key: string | null | undefined) => REUSSITE_MODELS.find((m) => m.key === key) || null;

/**
 * Modèles choisis pour une formation (colonne texte, clés séparées par des
 * virgules : « irve_p1,irve_p2,irve_p3 »), dans l'ordre du catalogue.
 */
export function reussiteModels(value: string | null | undefined): ReussiteModel[] {
  const keys = new Set(String(value || '').split(',').map((k) => k.trim()));
  return REUSSITE_MODELS.filter((m) => keys.has(m.key));
}

/** Module de la session qui correspond au modèle (« P1 », « IRVE P2 », « MA3 - DC »…). */
export function reussiteModule<T extends { name: string }>(model: ReussiteModel, modules: T[]): T | null {
  const code = model.label.replace(/^IRVE\s+/i, '');
  const re = new RegExp(`(^|[^A-Z0-9])${code}([^0-9]|$)`, 'i');
  return modules.find((m) => re.test(m.name)) || null;
}

/** Représentant de l'organisme qui signe les attestations de réussite. */
export const REUSSITE_SIGNATAIRE = 'Aurélie LANCELLE';

export type ReussiteAvis = 'favorable' | 'defavorable';
export type ReussiteEntry = { avis?: ReussiteAvis | null; note?: string; observations?: string };
export type ReussiteData = {
  /** Saisies par modèle (clé du modèle → stagiaire → saisie). */
  models?: Record<string, Record<string, ReussiteEntry>>;
  /** Ancien format (un seul modèle) : rattaché au premier modèle. */
  trainees?: Record<string, ReussiteEntry>;
  /** Signature du formateur (image), apposée sur toutes les attestations. */
  signature?: string | null;
  signedBy?: string | null;
};

/** Saisies d'un modèle (l'ancien format compte pour le premier modèle). */
export function reussiteEntries(data: ReussiteData | null | undefined, key: string, first: boolean): Record<string, ReussiteEntry> {
  return data?.models?.[key] || (first ? data?.trainees : undefined) || {};
}

/** Une série d'attestations : un modèle et les stagiaires qui le suivent. */
export type ReussiteGroup = { key: string; traineeIds: string[] };

/** Nombre d'avis donnés / d'attestations attendues. */
export function reussiteCount(data: ReussiteData | null | undefined, groups: ReussiteGroup[]) {
  let done = 0;
  let total = 0;
  groups.forEach((g, i) => {
    const e = reussiteEntries(data, g.key, i === 0);
    total += g.traineeIds.length;
    done += g.traineeIds.filter((id) => e[id]?.avis).length;
  });
  return { done, total };
}

/** Terminé : un avis sur chaque attestation et la signature du formateur. */
export function reussiteDone(data: ReussiteData | null | undefined, groups: ReussiteGroup[]) {
  const { done, total } = reussiteCount(data, groups);
  return total > 0 && done === total && Boolean(data?.signature);
}
