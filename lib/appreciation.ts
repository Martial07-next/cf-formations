/** Fiche d'appréciation individuelle (une par stagiaire). Module léger, sans PDF. */
export type Avis = 'favorable' | 'defavorable';
export type AppreciationEntry = {
  avis?: Avis | null;
  /** Avis favorable avec recommandations (points de vigilance). */
  recommandations?: boolean;
  ecarts?: string;
  autres_attestation?: string;
  autres_internes?: string;
};
export type AppreciationData = { trainees?: Record<string, AppreciationEntry> };

/** Fiche à remplir pour cette session : réglage de la session, sinon celui de la formation. */
export function appreciationRequired(sessionFlag: boolean | null | undefined, templateFlag: boolean | null | undefined) {
  return sessionFlag ?? Boolean(templateFlag);
}

/** Toutes les fiches ont un avis. */
export function appreciationDone(data: AppreciationData | null | undefined, traineeIds: string[]) {
  return traineeIds.length > 0 && traineeIds.every((id) => data?.trainees?.[id]?.avis);
}

/** Codification SERECT : celle de la formation, sinon l'intitulé en majuscules. */
export function codificationOf(codification: string | null | undefined, title: string) {
  return (codification || '').trim() || title.toUpperCase();
}

export type Cursus = 'initial' | 'recyclage';

/** Codification de la fiche précédée de INITIALE / RECYCLAGE (formations disponibles en recyclage). */
export function codificationFor(codification: string, cursus?: Cursus | null): string {
  if (!cursus) return codification;
  return `${cursus === 'recyclage' ? 'RECYCLAGE' : 'INITIALE'} ${codification}`;
}
