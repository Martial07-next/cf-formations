'use client';

import { PDFDocument, type PDFPage } from 'pdf-lib';
import { TDT_COLUMNS, type TdtData } from '@/lib/tdt';
import { C, PAGE, brandFooters, brandPage, drawFaitA, drawPlace, headerRow, legalLine, loadBrand, wrap, type Legal } from '@/lib/pdf-brand';
export { TDT_COLUMNS } from '@/lib/tdt';
export type { TdtData, TdtKey, TdtRow } from '@/lib/tdt';

export type TdtInput = {
  title: string;
  period: string;
  room: string | null;
  trainerName: string | null;
  trainees: { id: string; name: string; company: string | null }[];
  data: TdtData;
  completedAt?: string | null;
  /** Lieu de formation complet (salle, bâtiment, adresse). */
  place?: string | null;
  /** SIRET, déclaration d'activité, ville du « Fait à ». */
  legal?: Legal | null;
  /** Dernier jour de la session (JJ/MM/AAAA), date du « Fait à » si pas encore terminé. */
  lastDay?: string | null;
};

/**
 * Tour de table à la charte CF Réseaux (A4 paysage). Une ligne prend la
 * hauteur de son texte et n'est jamais coupée entre deux pages : si elle ne
 * tient pas en bas de page, elle passe entière sur la page suivante.
 */
export async function buildTourDeTablePdf(input: TdtInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Tour de table - ${input.title}`);
  doc.setAuthor('CF Réseaux');
  const b = await loadBrand(doc);
  const SIZE = 8.6;
  const LINE = 11.2;
  const PAD = 6;
  const BOTTOM = 58;
  const nameCol = { key: 'name', label: 'Nom Prénom', width: 98 };
  const cols = [{ key: 'num', label: 'N°', width: 26 }, nameCol, ...TDT_COLUMNS];
  const tableW = cols.reduce((n, c) => n + c.width, 0);
  const x0 = (PAGE.W - tableW) / 2;
  const pages: PDFPage[] = [];

  const open = (withHeader = true) => {
    const { page, top } = brandPage(doc, b, 'TOUR DE TABLE', 'À compléter à chaque début de formation', input);
    pages.push(page);
    const y = drawPlace(page, b, x0, top, tableW, input.place);
    return { page, y: withHeader ? headerRow(page, b, x0, y, cols) : y };
  };

  let { page, y } = open();
  const maxRowH = y - BOTTOM; // hauteur utile d'une page sous l'en-tête du tableau

  input.trainees.forEach((t, i) => {
    const row = input.data.rows?.[t.id] || {};
    const cells: Record<string, string[]> = {
      num: [String(i + 1)],
      name: wrap(b.bold, t.name, SIZE, nameCol.width - 2 * PAD),
    };
    for (const c of TDT_COLUMNS) {
      const v = c.key === 'company' ? row.company ?? t.company ?? '' : row[c.key] ?? '';
      cells[c.key] = wrap(b.regular, v, SIZE, c.width - 2 * PAD);
    }
    const maxLines = Math.floor((maxRowH - 2 * PAD - 2) / LINE);
    for (const k of Object.keys(cells)) if (cells[k].length > maxLines) cells[k] = cells[k].slice(0, maxLines);
    const lines = Math.max(...Object.values(cells).map((l) => l.length), 1);
    const h = Math.max(30, lines * LINE + 2 * PAD + 2);
    // Ligne entière sur la page suivante si elle ne tient pas.
    if (y - h < BOTTOM) ({ page, y } = open());
    page.drawRectangle({ x: x0, y: y - h, width: tableW, height: h, color: i % 2 ? C.cream : C.white, borderColor: C.grey, borderWidth: 0.6 });
    let x = x0;
    for (const c of cols) {
      const font = c.key === 'num' || c.key === 'name' ? b.bold : b.regular;
      cells[c.key].forEach((l, k) => page.drawText(l, { x: x + PAD, y: y - PAD - SIZE - k * LINE + 1, size: SIZE, font, color: C.night }));
      x += c.width;
      page.drawLine({ start: { x, y }, end: { x, y: y - h }, thickness: 0.6, color: C.grey });
    }
    y -= h;
  });

  // Incidents et remarques générales (bloc jamais coupé) + validation.
  const general = (input.data.general || '').trim();
  const lines = general ? wrap(b.regular, general, 9, tableW - 28) : [];
  const blockH = general ? lines.length * 12 + 30 : 0;
  const needed = 14 + blockH + (general ? 10 : 0) + 16;
  if (y - needed < BOTTOM) ({ page, y } = open(false));
  y -= 14;
  if (general) {
    page.drawRectangle({ x: x0, y: y - blockH, width: tableW, height: blockH, color: C.white, borderColor: C.grey, borderWidth: 0.6 });
    page.drawRectangle({ x: x0, y: y - blockH, width: 4, height: blockH, color: C.yellow });
    page.drawText('INCIDENTS ET REMARQUES GÉNÉRALES', { x: x0 + 14, y: y - 15, size: 7.5, font: b.bold, color: C.night });
    lines.forEach((l, k) => page.drawText(l, { x: x0 + 14, y: y - 30 - k * 12, size: 9, font: b.regular, color: C.night }));
    y -= blockH + 10;
  }
  const done = input.completedAt ? `Complété${input.trainerName ? ` par ${input.trainerName}` : ''} le ${input.completedAt}` : 'En cours de saisie';
  page.drawText(wrap(b.bold, done, 8.5, tableW / 2)[0], { x: x0, y: y - 10, size: 8.5, font: b.bold, color: C.night });
  drawFaitA(page, b, x0 + tableW, y - 10, input.legal, input.completedAt || input.lastDay || new Date().toLocaleDateString('fr-FR'));

  brandFooters(pages, b, `CF Réseaux · Tour de table · ${input.title}`, undefined, legalLine(input.legal));
  return doc.save();
}
