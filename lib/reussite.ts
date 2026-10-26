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
};

const IRVE = 'Une attestation de formation est délivrée à l’issue de cette formation, elle vous permettra d’obtenir la mention';

export const REUSSITE_MODELS: ReussiteModel[] = [
  {
    key: 'irve_p1',
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
    key: 'irve_ma1',
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

/** Représentant de l'organisme qui signe les attestations de réussite. */
export const REUSSITE_SIGNATAIRE = 'Aurélie LANCELLE';

export type ReussiteAvis = 'favorable' | 'defavorable';
export type ReussiteEntry = { avis?: ReussiteAvis | null; note?: string; observations?: string };
export type ReussiteData = {
  trainees?: Record<string, ReussiteEntry>;
  /** Signature du formateur (image), apposée sur toutes les attestations. */
  signature?: string | null;
  signedBy?: string | null;
};

/** Terminé : un avis pour chaque stagiaire et la signature du formateur. */
export function reussiteDone(data: ReussiteData | null | undefined, traineeIds: string[]) {
  return traineeIds.length > 0 && Boolean(data?.signature) && traineeIds.every((id) => data?.trainees?.[id]?.avis);
}
