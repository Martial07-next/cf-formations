'use client';

import { buildHabilitationAttestationsPdf, type HabilitationPdfInput } from '@/lib/pdf-fin-formation';

/**
 * Certificats d'habilitation électrique : même identité que les attestations
 * de fin de formation (lib/pdf-fin-formation.ts), avec les symboles attribués.
 */
export type HabCertInput = HabilitationPdfInput & { sessionId: string };

export function buildHabilitationPdf(input: HabCertInput): Promise<Uint8Array> {
  return buildHabilitationAttestationsPdf(input);
}
