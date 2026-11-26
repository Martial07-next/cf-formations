/**
 * Avis clients de CF Réseaux, présentés aux stagiaires au début de chaque
 * session (QR codes Google = à chaud, Plus que pro = à froid, 2 semaines après).
 * Valeurs par défaut : attestation Plus que pro du 26/11/2026 ; mises à jour
 * dans Administration › Paramètres (et Plus que pro lu sur cf-reseaux.fr si possible).
 */

export type Review = {
  /** Formation concernée (Plus que pro) ou auteur (Google). */
  title: string;
  text: string;
  rating: number;
  /** Date affichée (« 23/11/2026 »). */
  date?: string | null;
  author?: string | null;
};

export type ReviewSource = {
  /** Note moyenne (/5). */
  note: number | null;
  /** Nombre d'avis. */
  count: number | null;
  reviews: Review[];
};

export type AvisData = {
  pqp: ReviewSource & { recommandation?: number | null; indices?: { label: string; note: number }[] };
  google: ReviewSource;
  /** Lien Plus que pro (QR code) et lien Google (avis). */
  pqpUrl: string;
  googleUrl: string | null;
};

export const AVIS_DEFAULT: AvisData = {
  pqp: {
    note: 4.9,
    count: 377,
    recommandation: 98,
    indices: [
      { label: 'Contenus pédagogiques', note: 4.8 },
      { label: 'Matériel à disposition', note: 4.8 },
      { label: 'Équipes pédagogiques', note: 4.9 },
      { label: 'Gestion des cours', note: 4.8 },
      { label: 'Formation et objectifs', note: 4.8 },
    ],
    reviews: [
      { title: 'Formation CF Réseaux IRVE P1/P2', rating: 5, date: '23/11/2026', text: 'Une très bonne formation de 3 jours avec l’utilisation de nombreux appareils en comprenant outils, manipulation, savoir-faire de l’entreprise dans la pédagogie et les besoins du stagiaire, à recommander fortement.' },
      { title: 'Formation CF Réseaux Fondamentaux TST BT', rating: 5, date: '18/11/2026', text: 'J’ai apprécié les échanges, les rex et surtout les exercices pratiques.' },
      { title: 'Formation CF Réseaux Habilitation BT', rating: 5, date: '28/10/2026', text: 'Très satisfait.' },
      { title: 'Formation CF Réseaux IRVE P1', rating: 5, date: '27/10/2026', text: 'Très bon formateur.' },
      { title: 'Recyclage habilitation électrique B0/H0V', rating: 5, date: '27/10/2026', text: 'Bonne animation avec expérience du sujet et anecdotes concrètes.' },
    ],
  },
  google: { note: null, count: null, reviews: [] },
  pqpUrl: 'https://forms.office.com/e/TXUj70wjSf',
  googleUrl: null,
};

/** Avis enregistrés (Administration) par-dessus les valeurs par défaut. */
export function mergeAvis(saved: Partial<AvisData> | null | undefined): AvisData {
  if (!saved || typeof saved !== 'object') return structuredClone(AVIS_DEFAULT);
  const src = (d: ReviewSource, s: any): ReviewSource => ({
    note: typeof s?.note === 'number' ? s.note : d.note,
    count: typeof s?.count === 'number' ? s.count : d.count,
    reviews: Array.isArray(s?.reviews) && s.reviews.length ? s.reviews.filter((r: any) => r && String(r.text || '').trim()).slice(0, 5) : d.reviews,
  });
  return {
    pqp: { ...AVIS_DEFAULT.pqp, ...src(AVIS_DEFAULT.pqp, saved.pqp), ...(typeof (saved.pqp as any)?.recommandation === 'number' ? { recommandation: (saved.pqp as any).recommandation } : {}) },
    google: src(AVIS_DEFAULT.google, saved.google),
    pqpUrl: saved.pqpUrl || AVIS_DEFAULT.pqpUrl,
    googleUrl: saved.googleUrl || AVIS_DEFAULT.googleUrl,
  };
}
