/**
 * Politique de protection des données des pages ouvertes par QR code
 * (autorisations, droit à l'image, départ anticipé, titre d'habilitation,
 * documents salariés) et de l'émargement. Un seul texte : page publique
 * /confidentialite et PDF aux couleurs de CF Réseaux (public/rgpd-cf-reseaux.pdf).
 * Texte simple (gras entre **…**), sans HTML.
 */

export const RGPD_VERSION = 'Version du 18 novembre 2026';
export const RGPD_CONTACT = 'contact@cf-reseaux.fr';
export const RGPD_ADDRESS = '20 Rue du Champ de Tir, 59553 Cuincy';

export type RgpdBlock =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'note'; text: string };

export type RgpdSection = { title: string; blocks: RgpdBlock[] };

export const RGPD_TITLE = 'Protection de vos données personnelles';
export const RGPD_SUBTITLE = 'QR codes, signatures électroniques et droit à l’image';

export const RGPD_INTRO =
  'Pendant votre formation, votre formateur peut vous présenter un QR code. En le scannant avec votre téléphone, vous ouvrez une page sécurisée de CF Réseaux pour signer un document. Ce document vous explique simplement quelles données sont recueillies, pourquoi, qui peut les voir, combien de temps elles sont gardées, comment elles sont protégées et quels sont vos droits.';

export const RGPD_SECTIONS: RgpdSection[] = [
  {
    title: 'Qui est responsable de vos données ?',
    blocks: [
      {
        kind: 'p',
        text: `**CF Réseaux**, organisme de formation et bureau d’études spécialisé dans le génie électrique, dont le siège est situé au **${RGPD_ADDRESS}**, est responsable du traitement de vos données.`,
      },
      { kind: 'p', text: `Pour toute question sur vos données : **${RGPD_CONTACT}**.` },
    ],
  },
  {
    title: 'Quand ce document s’applique-t-il ?',
    blocks: [
      { kind: 'p', text: 'Il s’applique à chaque fois que vous scannez un QR code présenté par CF Réseaux, pour :' },
      {
        kind: 'list',
        items: [
          '**l’émargement** (feuille de présence de chaque demi-journée) ;',
          '**les autorisations** : droit à l’image, remise des livrets de formation, prêt de vêtements de travail ;',
          '**un départ anticipé** (quitter la formation avant l’heure prévue) ;',
          '**le dépôt de votre titre d’habilitation** (photo ou scan) ;',
          '**les documents des salariés de CF Réseaux** (droit à l’image, matériel prêté).',
        ],
      },
      { kind: 'p', text: 'Aucun compte ni mot de passe n’est demandé : le QR code ouvre directement la page de votre session.' },
    ],
  },
  {
    title: 'Quelles données sont recueillies ?',
    blocks: [
      {
        kind: 'table',
        head: ['Page ouverte par le QR code', 'Données enregistrées'],
        rows: [
          ['Émargement (sur la plateforme ou sur Digiforma)', 'Votre nom (choisi dans la liste de la session), la date, la demi-journée, l’heure de signature et l’image de votre signature.'],
          ['Droit à l’image', 'Votre nom, votre adresse, votre choix (j’accepte / je refuse), la ville, la date et votre signature.'],
          ['Remise des livrets, vêtements prêtés', 'Votre nom, la ville, la date, votre signature et, pour les vêtements, votre adresse et la liste des vêtements prêtés.'],
          ['Départ anticipé', 'Votre nom, la raison du départ (et une précision si vous en donnez une), la ville, la date, l’heure et votre signature.'],
          ['Titre d’habilitation', 'La photo ou le scan de votre titre, que vous choisissez vous-même sur votre téléphone.'],
          ['Documents salariés', 'Votre nom, votre adresse, le matériel prêté, la date et votre signature.'],
        ],
      },
      {
        kind: 'note',
        text: 'Ces pages n’utilisent ni cookie publicitaire, ni outil de mesure d’audience, ni géolocalisation. Elles n’ouvrent jamais l’appareil photo d’elles-mêmes : c’est vous qui choisissez la photo de votre titre.',
      },
    ],
  },
  {
    title: 'Pourquoi ces données sont-elles utilisées ?',
    blocks: [
      {
        kind: 'table',
        head: ['Utilisation', 'Ce qui l’autorise (RGPD, article 6)'],
        rows: [
          ['Prouver votre présence et la réalisation de la formation (émargement, départ anticipé, remise des livrets) auprès de votre employeur, des financeurs (OPCO, France Travail…) et lors des contrôles qualité (Qualiopi).', 'Les obligations légales d’un organisme de formation et l’exécution de la formation.'],
          ['Vérifier votre titre d’habilitation et organiser votre recyclage.', 'L’exécution de la formation demandée par vous ou votre employeur.'],
          ['Utiliser des photos ou vidéos prises pendant la formation (communication de CF Réseaux).', 'Votre **consentement**, que vous pouvez refuser ou retirer à tout moment.'],
          ['Suivre le matériel et les vêtements prêtés.', 'L’intérêt légitime de CF Réseaux à récupérer son matériel.'],
        ],
      },
      { kind: 'p', text: 'Vos données ne sont **jamais vendues**, ni utilisées pour de la publicité. Aucune décision automatique n’est prise à partir de vos données.' },
    ],
  },
  {
    title: 'Le droit à l’image',
    blocks: [
      {
        kind: 'list',
        items: [
          'Votre autorisation n’est **jamais obligatoire** : vous pouvez cocher « je refuse » sans aucune conséquence sur votre formation ou votre attestation.',
          'Si vous acceptez, CF Réseaux peut utiliser les photos et vidéos prises pendant la formation, selon les conditions écrites sur l’autorisation que vous signez.',
          `Vous pouvez **retirer votre autorisation à tout moment**, en écrivant à ${RGPD_CONTACT}. Les photos et vidéos ne seront plus utilisées pour de nouvelles publications ; les publications déjà faites ne sont pas remises en cause.`,
        ],
      },
    ],
  },
  {
    title: 'Qui peut voir vos données ?',
    blocks: [
      {
        kind: 'list',
        items: [
          '**L’équipe CF Réseaux**, selon son rôle : votre formateur (pour ses propres sessions), le bureau administratif et l’administrateur. Chaque personne a un compte personnel ; les droits sont contrôlés dans la base de données elle-même.',
          '**Votre employeur et les financeurs** de votre formation, uniquement pour les documents qu’ils doivent recevoir (attestations, feuilles de présence).',
          '**Les prestataires techniques** de CF Réseaux, qui hébergent les données sans pouvoir les utiliser pour eux-mêmes : Vercel (application, serveurs à Francfort, Allemagne), Supabase (base de données et fichiers) et Digiforma (logiciel de gestion de la formation et d’émargement électronique). Ils sont liés à CF Réseaux par des contrats conformes au RGPD.',
        ],
      },
      { kind: 'p', text: 'Sur la page d’un QR code, seuls les noms des stagiaires de la session apparaissent, jamais leurs coordonnées ni leurs signatures.' },
    ],
  },
  {
    title: 'Comment vos données sont-elles protégées ?',
    blocks: [
      {
        kind: 'list',
        items: [
          '**Connexion chiffrée** (HTTPS) sur toutes les pages, imposée par le navigateur.',
          '**QR code unique et secret** pour chaque session : un code aléatoire impossible à deviner, que le formateur peut renouveler à tout moment.',
          '**Pages invisibles des moteurs de recherche** : elles ne peuvent pas être trouvées sur Internet.',
          '**Accès limité** : chaque membre de l’équipe ne voit que ce que son rôle lui permet ; les signatures et documents ne sont jamais publics.',
          '**Titres d’habilitation dans un espace privé** : ils ne s’ouvrent qu’avec un lien temporaire donné à une personne autorisée.',
          '**Liste des stagiaires figée** une fois la session commencée, et historique des modifications.',
          '**Protections du site** contre l’intégration dans d’autres sites et les détournements de page.',
        ],
      },
    ],
  },
  {
    title: 'Combien de temps sont-elles gardées ?',
    blocks: [
      {
        kind: 'table',
        head: ['Données', 'Durée de conservation'],
        rows: [
          ['Émargement, départ anticipé, remise des livrets', '5 ans après la fin de la formation, pour répondre aux contrôles des financeurs et de la certification Qualiopi.'],
          ['Autorisation de droit à l’image', 'Tant que les photos ou vidéos sont utilisées ; en cas de retrait, la preuve du retrait est gardée 5 ans.'],
          ['Titre d’habilitation', 'Pendant la durée de validité du titre, puis supprimé.'],
          ['Vêtements et matériel prêtés', 'Jusqu’au retour du matériel, puis 1 an.'],
        ],
      },
      { kind: 'p', text: 'À la fin de ces durées, les données sont supprimées ou rendues anonymes.' },
    ],
  },
  {
    title: 'Quels sont vos droits ?',
    blocks: [
      {
        kind: 'list',
        items: [
          '**Accès** : savoir quelles données CF Réseaux détient sur vous et en recevoir une copie.',
          '**Rectification** : faire corriger une donnée inexacte (nom mal écrit, adresse…).',
          '**Effacement** : demander la suppression de vos données, sauf celles que CF Réseaux doit garder par obligation légale.',
          '**Opposition et limitation** : vous opposer à une utilisation ou la faire suspendre.',
          '**Retrait du consentement** : pour le droit à l’image, à tout moment.',
          '**Portabilité** : recevoir vos données dans un format lisible.',
        ],
      },
      {
        kind: 'p',
        text: `Pour exercer vos droits, écrivez à **${RGPD_CONTACT}** ou par courrier à CF Réseaux, ${RGPD_ADDRESS}. Une réponse vous est apportée dans un délai d’un mois.`,
      },
      {
        kind: 'p',
        text: 'Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la **CNIL** (Commission nationale de l’informatique et des libertés) : www.cnil.fr.',
      },
    ],
  },
];
