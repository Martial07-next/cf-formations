'use client';

import { PDFDocument } from 'pdf-lib';
import { C, PAGE, brandFooters, brandPage, drawFaitA, drawPlace, legalLine, loadBrand, wrap, type Legal, type SessionCard } from '@/lib/pdf-brand';

export type CoverItem = { title: string; detail: string; done: boolean };

/** Page de garde du dossier complet : session, lieu, contenu et état de chaque pièce. */
export async function buildDossierCover(
  input: SessionCard & { place?: string | null; legal?: Legal | null; lastDay?: string | null; items: CoverItem[]; complete: boolean }
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Dossier de formation - ${input.title}`);
  doc.setAuthor('CF Réseaux');
  const b = await loadBrand(doc);
  const { page, top } = brandPage(doc, b, 'DOSSIER DE FORMATION', 'Récapitulatif des pièces du dossier', input);
  const x0 = PAGE.M;
  const width = PAGE.W - 2 * PAGE.M;
  let y = drawPlace(page, b, x0, top, width, input.place) - 10;

  // État global
  const status = input.complete ? 'DOSSIER COMPLET' : 'DOSSIER INCOMPLET';
  page.drawRectangle({ x: x0, y: y - 30, width, height: 30, color: input.complete ? C.green : C.yellow });
  page.drawText(status, { x: x0 + 14, y: y - 19.5, size: 11, font: b.title, color: C.night });
  y -= 44;

  page.drawText('CONTENU DU DOSSIER', { x: x0, y: y - 8, size: 7.5, font: b.bold, color: C.muted });
  y -= 16;
  input.items.forEach((it, i) => {
    const h = 30;
    page.drawRectangle({ x: x0, y: y - h, width, height: h, color: i % 2 ? C.cream : C.white, borderColor: C.grey, borderWidth: 0.6 });
    page.drawText(String(i + 1), { x: x0 + 12, y: y - 19, size: 9, font: b.bold, color: C.night });
    page.drawText(wrap(b.bold, it.title, 10, width * 0.5)[0] || '', { x: x0 + 34, y: y - 19, size: 10, font: b.bold, color: C.night });
    page.drawText(wrap(b.regular, it.detail, 8.5, width * 0.32)[0] || '', { x: x0 + width * 0.55, y: y - 18.5, size: 8.5, font: b.regular, color: C.muted });
    const tag = it.done ? 'TERMINÉ' : 'À COMPLÉTER';
    const tw = b.bold.widthOfTextAtSize(tag, 7.5) + 14;
    page.drawRectangle({ x: x0 + width - tw - 10, y: y - 21, width: tw, height: 14, color: it.done ? C.green : C.grey });
    page.drawText(tag, { x: x0 + width - tw - 3, y: y - 17, size: 7.5, font: b.bold, color: C.night });
    y -= h;
  });

  drawFaitA(page, b, x0 + width, y - 26, input.legal, input.lastDay || new Date().toLocaleDateString('fr-FR'));
  brandFooters([page], b, `CF Réseaux · Dossier de formation · ${input.title}`, `Généré le ${new Date().toLocaleDateString('fr-FR')}`, legalLine(input.legal));
  return doc.save();
}
