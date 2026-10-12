'use client';

import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import { C, COMPANY, LOGO_RATIO, clean, loadBrand, wrap, type Brand, type Legal } from '@/lib/pdf-brand';
import type { AppreciationEntry } from '@/lib/appreciation';

/** Éclair du logo (tracé 10 × 16). */
const BOLT = 'M6.4 0 L0 9.2 L4.6 9.2 L3.2 16 L10 6.4 L5.4 6.4 L7.2 0 Z';

export type AppreciationInput = {
  trainees: { id: string; name: string; company: string | null }[];
  entries: Record<string, AppreciationEntry>;
  codification: string;
  startDate: string; // AAAA-MM-JJ
  endDate: string;
  lieu: string | null;
  trainerName: string | null;
  legal?: Legal | null;
};

const short = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y.slice(2)}`;
};

function roundedBox(page: PDFPage, x: number, yTop: number, w: number, h: number, r = 14) {
  const p = `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
  page.drawSvgPath(p, { x, y: yTop, borderColor: C.night, borderWidth: 1.3, color: C.white });
}

function checkbox(page: PDFPage, x: number, yBase: number, checked: boolean) {
  const s = 9;
  page.drawRectangle({ x, y: yBase - 1, width: s, height: s, borderColor: C.night, borderWidth: 0.9, color: checked ? C.night : C.white });
  if (checked) {
    page.drawLine({ start: { x: x + 1.8, y: yBase + 3.4 }, end: { x: x + 3.8, y: yBase + 1.2 }, thickness: 1.4, color: C.green });
    page.drawLine({ start: { x: x + 3.8, y: yBase + 1.2 }, end: { x: x + 7.4, y: yBase + 6.6 }, thickness: 1.4, color: C.green });
  }
}

/** Une page A4 par stagiaire, à la charte de la fiche actuelle. */
export async function buildAppreciationPdf(input: AppreciationInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Fiches d'appréciation individuelle - ${input.codification}`);
  doc.setAuthor('CF Réseaux');
  const b = await loadBrand(doc);
  for (const t of input.trainees) drawPage(doc, b, input, t, input.entries[t.id] || {});
  return doc.save();
}

function drawPage(doc: PDFDocument, b: Brand, input: AppreciationInput, t: { name: string; company: string | null }, e: AppreciationEntry) {
  const W = 595;
  const H = 842;
  const M = 40;
  const TW = W - 2 * M;
  const page = doc.addPage([W, H]);
  const ink = C.night;

  // Filigrane : grands éclairs gris très clair.
  page.drawSvgPath(BOLT, { x: 300, y: H - 150, scale: 26, color: rgb(0.965, 0.965, 0.965) });

  // Logo
  const lw = 165;
  if (b.logoDark) page.drawImage(b.logoDark, { x: M, y: H - 40 - lw / LOGO_RATIO, width: lw, height: lw / LOGO_RATIO });
  // Titre
  page.drawText('FICHE APPRÉCIATION', { x: M, y: H - 112, size: 33, font: b.title, color: ink });
  page.drawText('INDIVIDUELLE', { x: M, y: H - 150, size: 33, font: b.title, color: ink });
  page.drawRectangle({ x: M, y: H - 176, width: 70, height: 3.5, color: C.green });

  // Informations pré-remplies
  let y = H - 202;
  const info = (label: string, value: string) => {
    page.drawText(label, { x: M, y, size: 10.5, font: b.regular, color: ink });
    const lx = M + b.regular.widthOfTextAtSize(label, 10.5) + 6;
    const lines = wrap(b.bold, value, 10.5, TW - (lx - M));
    lines.slice(0, 2).forEach((l, k) => page.drawText(l, { x: lx, y: y - k * 13, size: 10.5, font: b.bold, color: ink }));
    y -= 14 + (Math.min(lines.length, 2) - 1) * 13;
  };
  info('Nom & Prénom du participant :', t.name.toUpperCase());
  info('Entreprise :', (t.company || '').toUpperCase());
  info('Codification SERECT :', input.codification);
  info('Dates du stage :', `du ${short(input.startDate)} au ${short(input.endDate)}`);
  info('Lieu de dispense :', input.lieu || 'CF RÉSEAUX');

  const heading = (text: string) => {
    y -= 12;
    page.drawSvgPath(BOLT, { x: M, y: y + 12, scale: 0.95, color: C.green });
    page.drawText(clean(b.bold, text), { x: M + 15, y, size: 11, font: b.bold, color: ink });
    y -= 16;
  };
  const para = (text: string, opts: { bold?: boolean; indent?: number; size?: number } = {}) => {
    const size = opts.size ?? 9.8;
    const font = opts.bold ? b.bold : b.regular;
    const x = M + (opts.indent ?? 0);
    for (const l of wrap(font, text, size, TW - (x - M))) {
      page.drawText(l, { x, y, size, font, color: ink });
      y -= size + 3.2;
    }
  };
  const box = (text: string, minH: number) => {
    const lines = wrap(b.regular, (text || '').trim(), 9.5, TW - 30).slice(0, 14);
    const h = Math.max(minH, lines.filter(Boolean).length * 12.5 + 22);
    roundedBox(page, M, y, TW, h);
    lines.forEach((l, k) => page.drawText(l, { x: M + 16, y: y - 18 - k * 12.5, size: 9.5, font: b.regular, color: ink }));
    y -= h + 10;
  };

  // Avis du formateur
  heading('AVIS DU FORMATEUR (À REPORTER SUR LES ATTESTATIONS)');
  checkbox(page, M, y, e.avis === 'defavorable');
  const defLines = wrap(b.regular, 'AVIS DÉFAVORABLE = Réserves, car les exercices n’ont pas été réalisés de façon satisfaisante.', 9.8, TW - 14);
  defLines.forEach((l, k) => page.drawText(l, { x: M + 14, y: y - k * 13, size: 9.8, font: b.regular, color: ink }));
  y -= defLines.length * 13 + 2;
  para('Écarts constatés :', { bold: true, indent: 14 });
  // « (Attention → Se limiter aux constats… ) » avec « Attention » en gras.
  const pre = '(';
  const att = 'Attention';
  const rest = clean(b.regular, '→ Se limiter aux constats faits pendant la formation, ne pas proposer de restriction d’habilitation).');
  page.drawText(pre, { x: M, y, size: 9.8, font: b.regular, color: ink });
  const ax = M + b.regular.widthOfTextAtSize(pre, 9.8);
  page.drawText(att, { x: ax, y, size: 9.8, font: b.bold, color: ink });
  const rx = ax + b.bold.widthOfTextAtSize(att + ' ', 9.8);
  const restLines = wrap(b.regular, rest, 9.8, M + TW - rx);
  page.drawText(restLines[0] || '', { x: rx, y, size: 9.8, font: b.regular, color: ink });
  y -= 13;
  // Suite de la phrase (mots restants) sur la ligne suivante.
  const firstWords = (restLines[0] || '').split(/\s+/).filter(Boolean).length;
  const remaining = rest.split(/\s+/).filter(Boolean).slice(firstWords).join(' ');
  if (remaining) para(remaining);
  y -= 2;
  box(e.ecarts || '', 40);

  checkbox(page, M, y, e.avis === 'favorable');
  page.drawText(clean(b.regular, 'AVIS FAVORABLE = Exercices réalisés de façon satisfaisante, objectifs atteints.'), { x: M + 14, y, size: 9.8, font: b.regular, color: ink });
  y -= 14;
  para('→ Pas de réserve quant à la délivrance (ou maintien) d’une habilitation.', { bold: true, indent: 14 });

  heading('AUTRES INFORMATIONS (À REPORTER SUR LES ATTESTATIONS)');
  box(e.autres_attestation || '', 78);
  heading('AUTRES INFORMATIONS (INTERNES, NON DESTINÉES AU CLIENT)');
  box(e.autres_internes || '', 78);

  page.drawText(clean(b.bold, `Nom du formateur : ${input.trainerName || ''}`), { x: M, y: Math.max(y - 4, 78), size: 10.5, font: b.bold, color: ink });

  // Bandeau de pied de page vert nuit
  const fh = 58;
  page.drawRectangle({ x: 0, y: 0, width: W, height: fh, color: C.night });
  const flw = 120;
  if (b.logo) page.drawImage(b.logo, { x: M - 14, y: (fh - flw / LOGO_RATIO) / 2, width: flw, height: flw / LOGO_RATIO });
  const center = (text: string, yy: number, size: number, font: any, color: any) => {
    const tx = clean(font, text);
    page.drawText(tx, { x: 300 - font.widthOfTextAtSize(tx, size) / 2, y: yy, size, font, color });
  };
  center('COMPTE RENDU', 37, 9.5, b.bold, C.green);
  center('D’ÉVALUATION INDIVIDUELLE', 25, 9.5, b.title, C.white);
  center('Document à joindre au RAPPORT DE L’INTERVENANT', 14, 6.5, b.bold, C.white);
  const right = [COMPANY.name, `SIRET ${input.legal?.siret || COMPANY.siret}`, `TVA intra ${COMPANY.tva}`, COMPANY.email];
  right.forEach((l, k) => page.drawText(clean(b.bold, l), { x: W - M - 95, y: 41 - k * 9, size: 6.6, font: b.bold, color: C.white }));
}
