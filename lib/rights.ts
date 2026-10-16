import type { Role } from '@/lib/roles';

/**
 * Ce que chaque type d'accès peut faire (affiché dans Administration).
 * true = oui ; 'own' = seulement ses propres sessions / son équipe ; false = non.
 */
export type Right = true | false | 'own';

export const RIGHTS: { group: string; items: { label: string; roles: Record<Role, Right>; note?: string }[] }[] = [
  {
    group: 'Planning et sessions',
    items: [
      { label: 'Voir le planning et les sessions', roles: { admin: true, bureau: true, referent: true, formateur: true, consultation: true, aucun: false } },
      { label: 'Créer, modifier, supprimer une session (salle, formateur, dates, stagiaires)', roles: { admin: true, bureau: true, referent: false, formateur: false, consultation: false, aucun: false } },
      { label: 'Changer les horaires (début et fin), jour par jour', roles: { admin: true, bureau: true, referent: true, formateur: 'own', consultation: false, aucun: false } },
      { label: 'Remplaçant certains jours, places réservées par entreprise', roles: { admin: true, bureau: true, referent: false, formateur: false, consultation: false, aucun: false } },
      { label: 'Mettre en attente, relancer, choisir le gestionnaire (Suivi interne)', roles: { admin: true, bureau: true, referent: false, formateur: false, consultation: false, aucun: false } },
      { label: 'Modifier le créateur d’une session, effacer l’historique', roles: { admin: true, bureau: false, referent: false, formateur: false, consultation: false, aucun: false } },
      { label: 'Parcours POEC : créer, construire, conventions, lien France Travail', roles: { admin: true, bureau: true, referent: false, formateur: false, consultation: false, aucun: false } },
    ],
  },
  {
    group: 'Dossier de formation et signatures',
    items: [
      { label: 'Tour de table, fiches d’appréciation individuelle', roles: { admin: true, bureau: true, referent: true, formateur: 'own', consultation: false, aucun: false } },
      { label: 'QR code des autorisations (droit à l’image, livrets, règlement…)', roles: { admin: true, bureau: true, referent: true, formateur: 'own', consultation: false, aucun: false } },
      { label: 'Prêt et retour des vêtements TST', roles: { admin: true, bureau: true, referent: true, formateur: 'own', consultation: false, aucun: false } },
      { label: 'Attestations de fin de formation, appréciation des compétences', roles: { admin: true, bureau: true, referent: false, formateur: false, consultation: false, aucun: false } },
      { label: 'Déposer les documents du dossier (PDF à remplir)', roles: { admin: true, bureau: true, referent: false, formateur: false, consultation: false, aucun: false } },
    ],
  },
  {
    group: 'Ressources',
    items: [
      { label: 'Base des stagiaires (fiches, recherche, export)', roles: { admin: true, bureau: true, referent: false, formateur: false, consultation: false, aucun: false } },
      { label: 'Voir les stagiaires et leurs signatures (dans la session)', roles: { admin: true, bureau: true, referent: true, formateur: 'own', consultation: false, aucun: false } },
      { label: 'Stagiaires : ajouter, importer, modifier', roles: { admin: true, bureau: true, referent: false, formateur: false, consultation: false, aucun: false } },
      { label: 'Formateurs et salles', roles: { admin: true, bureau: false, referent: false, formateur: false, consultation: false, aucun: false } },
      { label: 'Catalogue des formations, liens utiles', roles: { admin: true, bureau: true, referent: false, formateur: false, consultation: false, aucun: false } },
      { label: 'Congés des formateurs', roles: { admin: true, bureau: true, referent: 'own', formateur: false, consultation: false, aucun: false } },
      { label: 'Suivi d’équipe (heures des formateurs)', roles: { admin: true, bureau: true, referent: 'own', formateur: 'own', consultation: false, aucun: false } },
    ],
  },
  {
    group: 'Administration',
    items: [
      { label: 'Accès : créer, modifier (nom, e-mail, mot de passe), supprimer', roles: { admin: true, bureau: false, referent: false, formateur: false, consultation: false, aucun: false } },
      { label: 'Documents à signer : ajouter, modifier, supprimer, activer', roles: { admin: true, bureau: false, referent: false, formateur: false, consultation: false, aucun: false } },
      { label: 'Salariés : droit à l’image, matériel, restitution', roles: { admin: true, bureau: false, referent: false, formateur: false, consultation: false, aucun: false } },
      { label: 'Paramètres (SIRET, cachet, signataire…), intégrations, données', roles: { admin: true, bureau: false, referent: false, formateur: false, consultation: false, aucun: false } },
    ],
  },
];
