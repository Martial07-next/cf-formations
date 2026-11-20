/**
 * Périmètres habilitables transmis par le comité (schémas des modules TST).
 * Choisi sur la formation (catalogue) ou dans les paramètres propres à la
 * session ; ajouté en 3e page de l'appréciation des compétences.
 */
export type Perimetre = { key: string; label: string; image: string | null };

export const PERIMETRES: Perimetre[] = [
  { key: 'brt-aer-aerosou', label: 'Module Branchement Aérien et Branchement Aéro-Souterrain (Brt Aer, Brt Aéro_Sou)', image: '/templates/perimetres/brt-aer-aerosou.png' },
  { key: 'emergence', label: 'Module Emergence (EME)', image: '/templates/perimetres/emergence.png' },
  { key: 'aer-ep', label: 'Module Aérien Éclairage Public (Aer-EP)', image: '/templates/perimetres/aer-ep.png' },
  { key: 'aer-res', label: 'Module Aérien Réseau (Aer-Res)', image: '/templates/perimetres/aer-res.png' },
  { key: 'souterrain', label: 'Module Souterrain (SOU)', image: '/templates/perimetres/souterrain.png' },
  // Schéma à recevoir : choix grisé tant que l'image n'est pas ajoutée.
  { key: 'terminal', label: 'Module Terminal (TER)', image: null },
];

export function perimetreOf(key: string | null | undefined): Perimetre | null {
  return PERIMETRES.find((p) => p.key === key && p.image) || null;
}
