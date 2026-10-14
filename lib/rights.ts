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
      { label: 'Voir le planning et les sessions', roles: { admin: true, bureau: true, referent: true, formateur: true, consultation: true } },
      { label: 'Créer, modifier, supprimer une session (salle, formateur, dates, stagiaires)', roles: { admin: true, bureau: true, referent: false, formateur: false, consultation: false } },
      { label: 'Changer l’heure de début, jour par jour', roles: { admin: true, bureau: true, referent: true, formateur: 'own', consultation: false } },
      { label: 'Remplaçant certains jours, places réservées par entreprise', roles: { admin: true, bureau: true, referent: false, formateur: false, consultation: false } },
      { label: 'Mettre en attente, relancer, choisir le gestionnaire (Suivi interne)', roles: { admin: true, bureau: true, referent: false, formateur: false, consultation: false } },
      { label: 'Modifier le créateur d’une session, effacer l’historique', roles: { admin: true, bureau: false, referent: false, formateur: false, consultation: false } },
      { label: 'Parcours POEC : créer, construire, conventions, lien France Travail', roles: { admin: true, bureau: true, referent: false, formateur: false, consultation: false } },
    ],
  },
  {
    group: 'Dossier de formation et signatures',
    items: [
      { label: 'Tour de table, fiches d’appréciation individuelle', roles: { admin: true, bureau: true, referent: true, formateur: 'own', consultation: false } },
      { label: 'QR code des autorisations (droit à l’image, livrets, règlement…)', roles: { admin: true, bureau: true, referent: true, formateur: 'own', consultation: false } },
      { label: 'Prêt et retour des vêtements TST', roles: { admin: true, bureau: true, referent: true, formateur: 'own', consultation: false } },
      { label: 'Attestations de fin de formation, appréciation des compétences', roles: { admin: true, bureau: true, referent: false, formateur: false, consultation: false } },
      { label: 'Déposer les documents du dossier (PDF à remplir)', roles: { admin: true, bureau: true, referent: false, formateur: false, consultation: false } },
    ],
  },
  {
    group: 'Ressources',
    items: [
      { label: 'Stagiaires : ajouter, importer, modifier', roles: { admin: true, bureau: true, referent: false, formateur: false, consultation: false } },
      { label: 'Formateurs, salles, catalogue des formations, liens utiles', roles: { admin: true, bureau: true, referent: false, formateur: false, consultation: false } },
      { label: 'Congés des formateurs', roles: { admin: true, bureau: true, referent: 'own', formateur: false, consultation: false } },
      { label: 'Suivi d’équipe (heures des formateurs)', roles: { admin: true, bureau: true, referent: 'own', formateur: 'own', consultation: false } },
    ],
  },
  {
    group: 'Administration',
    items: [
      { label: 'Accès : créer, modifier (nom, e-mail, mot de passe), supprimer', roles: { admin: true, bureau: false, referent: false, formateur: false, consultation: false } },
      { label: 'Documents à signer : ajouter, modifier, supprimer, activer', roles: { admin: true, bureau: false, referent: false, formateur: false, consultation: false } },
      { label: 'Salariés : droit à l’image, matériel, restitution', roles: { admin: true, bureau: false, referent: false, formateur: false, consultation: false } },
      { label: 'Paramètres (SIRET, cachet, signataire…), intégrations, données', roles: { admin: true, bureau: false, referent: false, formateur: false, consultation: false } },
    ],
  },
];
