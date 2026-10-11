'use client';

import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

/**
 * Tour de table (à compléter à chaque début de formation + recueil des
 * incidents) : saisie en ligne et PDF à la charte CF Réseaux.
 */

import { TDT_COLUMNS, type TdtData } from '@/lib/tdt';
export { TDT_COLUMNS } from '@/lib/tdt';
export type { TdtData, TdtKey, TdtRow } from '@/lib/tdt';

// Charte CF Réseaux
const C = {
  green: rgb(8 / 255, 250 / 255, 100 / 255), // #08FA64
  yellow: rgb(1, 242 / 255, 0), // #FFF200
  night: rgb(23 / 255, 36 / 255, 27 / 255), // #17241B
  card: rgb(36 / 255, 53 / 255, 43 / 255), // #24352B
  cream: rgb(1, 253 / 255, 243 / 255), // #FFFDF3
  grey: rgb(229 / 255, 229 / 255, 229 / 255), // #E5E5E5
  white: rgb(1, 1, 1),
  muted: rgb(0.42, 0.47, 0.44),
};
/** Éclair du logo CF Réseaux (tracé vectoriel, 10 × 16). */
const BOLT = 'M6.4 0 L0 9.2 L4.6 9.2 L3.2 16 L10 6.4 L5.4 6.4 L7.2 0 Z';

async function loadFonts(doc: PDFDocument) {
  doc.registerFontkit(fontkit);
  const get = (f: string) => fetch(`/fonts/${f}`).then((r) => {
    if (!r.ok) throw new Error('Polices introuvables.');
    return r.arrayBuffer();
  });
  const [title, bold, regular] = await Promise.all([
    get('ArchivoExpanded-ExtraBold.ttf'),
    get('SpaceGrotesk-Bold.ttf'),
    get('SpaceGrotesk-Regular.ttf'),
  ]);
  return {
    title: await doc.embedFont(title, { subset: true }),
    bold: await doc.embedFont(bold, { subset: true }),
    regular: await doc.embedFont(regular, { subset: true }),
  };
}

/** Découpe un texte en lignes tenant dans `width` (mots trop longs coupés). */
export function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of (text || '').replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(tryLine, size) <= width) {
        line = tryLine;
        continue;
      }
      if (line) out.push(line);
      // Mot plus long que la colonne : coupé.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
        out.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    out.push(line);
  }
  while (out.length > 1 && out[out.length - 1] === '') out.pop();
  return out;
}

/** Garde uniquement les caractères présents dans la police. */
function clean(font: PDFFont, text: string) {
  const chars = new Set(font.getCharacterSet());
  return Array.from(text || '')
    .map((ch) => (ch === '\n' || chars.has(ch.codePointAt(0)!) ? ch : ch === '’' ? "'" : '?'))
    .join('');
}

export type TdtInput = {
  title: string;
  period: string;
  room: string | null;
  trainerName: string | null;
  trainees: { id: string; name: string; company: string | null }[];
  data: TdtData;
  completedAt?: string | null;
};

export async function buildTourDeTablePdf(input: TdtInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Tour de table - ${input.title}`);
  doc.setAuthor('CF Réseaux');
  const f = await loadFonts(doc);
  const W = 842;
  const H = 595;
  const M = 24;
  const SIZE = 8.6;
  const LINE = 11.2;
  const PAD = 6;
  const nameCol = { key: 'name', label: 'Nom Prénom', width: 98 };
  const cols = [{ key: 'num', label: 'N°', width: 26 }, nameCol, ...TDT_COLUMNS];
  const tableW = cols.reduce((n, c) => n + c.width, 0);
  const x0 = (W - tableW) / 2;
  const pages: PDFPage[] = [];

  const newPage = () => {
    const page = doc.addPage([W, H]);
    pages.push(page);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.cream });
    // Bandeau vert nuit
    const bandH = 92;
    page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: C.night });
    page.drawSvgPath(BOLT, { x: M, y: H - 22, scale: 1.55, color: C.green });
    page.drawText('CF RÉSEAUX', { x: M + 22, y: H - 40, size: 13, font: f.title, color: C.cream });
    page.drawText('TOUR DE TABLE', { x: M, y: H - 68, size: 21, font: f.title, color: C.green });
    page.drawRectangle({ x: M, y: H - 80, width: 34, height: 3, color: C.yellow });
    page.drawText('À compléter à chaque début de formation · Recueil des incidents', {
      x: M + 42,
      y: H - 81,
      size: 8.5,
      font: f.regular,
      color: C.grey,
    });
    // Carte « Session »
    const cardW = 300;
    const cx = W - M - cardW;
    page.drawRectangle({ x: cx, y: H - bandH + 12, width: cardW, height: bandH - 24, color: C.card, borderColor: C.card, borderWidth: 0 });
    page.drawRectangle({ x: cx, y: H - bandH + 12, width: 4, height: bandH - 24, color: C.green });
    page.drawText('SESSION DE FORMATION ET DATES', { x: cx + 14, y: H - 30, size: 7, font: f.bold, color: C.green });
    const titleLines = wrap(f.bold, clean(f.bold, input.title), 10, cardW - 26).slice(0, 2);
    titleLines.forEach((l, i) => page.drawText(l, { x: cx + 14, y: H - 44 - i * 12, size: 10, font: f.bold, color: C.cream }));
    const meta = [input.period, input.room, input.trainerName && `Formateur : ${input.trainerName}`].filter(Boolean).join('  ·  ');
    wrap(f.regular, clean(f.regular, meta), 8, cardW - 26)
      .slice(0, 2)
      .forEach((l, i) => page.drawText(l, { x: cx + 14, y: H - 46 - titleLines.length * 12 - i * 10, size: 8, font: f.regular, color: C.grey }));
    return page;
  };

  const headerRow = (page: PDFPage, y: number) => {
    const h = 22;
    page.drawRectangle({ x: x0, y: y - h, width: tableW, height: h, color: C.green });
    let x = x0;
    for (const c of cols) {
      page.drawText(c.label, { x: x + PAD, y: y - 14.5, size: 7.8, font: f.bold, color: C.night });
      x += c.width;
    }
    return y - h;
  };

  let page = newPage();
  let y = headerRow(page, H - 92 - 16);
  const bottom = 46;

  input.trainees.forEach((t, i) => {
    const row = input.data.rows?.[t.id] || {};
    const cells: Record<string, string[]> = {
      num: [String(i + 1)],
      name: wrap(f.bold, clean(f.bold, t.name), SIZE, nameCol.width - 2 * PAD),
    };
    for (const c of TDT_COLUMNS) {
      const v = c.key === 'company' ? row.company ?? t.company ?? '' : row[c.key] ?? '';
      cells[c.key] = wrap(f.regular, clean(f.regular, v), SIZE, c.width - 2 * PAD);
    }
    const lines = Math.max(...Object.values(cells).map((l) => l.length), 1);
    const h = Math.max(30, lines * LINE + 2 * PAD + 2);
    if (y - h < bottom) {
      page = newPage();
      y = headerRow(page, H - 92 - 16);
    }
    page.drawRectangle({ x: x0, y: y - h, width: tableW, height: h, color: i % 2 ? C.cream : C.white, borderColor: C.grey, borderWidth: 0.6 });
    let x = x0;
    for (const c of cols) {
      const font = c.key === 'num' || c.key === 'name' ? f.bold : f.regular;
      cells[c.key].forEach((l, k) => page.drawText(l, { x: x + PAD, y: y - PAD - SIZE - k * LINE + 1, size: SIZE, font, color: C.night }));
      x += c.width;
      page.drawLine({ start: { x, y }, end: { x, y: y - h }, thickness: 0.6, color: C.grey });
    }
    y -= h;
  });

  // Incidents / remarques générales + validation
  const general = wrap(f.regular, clean(f.regular, input.data.general || ''), 9, tableW - 28);
  const hasGeneral = Boolean((input.data.general || '').trim());
  const blockH = (hasGeneral ? general.length * 12 + 30 : 0) + 22;
  if (y - 14 - blockH < bottom) {
    page = newPage();
    y = H - 92 - 16;
  }
  y -= 14;
  if (hasGeneral) {
    const h = general.length * 12 + 30;
    page.drawRectangle({ x: x0, y: y - h, width: tableW, height: h, color: C.white, borderColor: C.grey, borderWidth: 0.6 });
    page.drawRectangle({ x: x0, y: y - h, width: 4, height: h, color: C.yellow });
    page.drawText('INCIDENTS ET REMARQUES GÉNÉRALES', { x: x0 + 14, y: y - 15, size: 7.5, font: f.bold, color: C.night });
    general.forEach((l, k) => page.drawText(l, { x: x0 + 14, y: y - 30 - k * 12, size: 9, font: f.regular, color: C.night }));
    y -= h + 10;
  }
  const done = input.completedAt ? `Complété${input.trainerName ? ` par ${input.trainerName}` : ''} le ${input.completedAt}` : 'En cours de saisie';
  page.drawText(clean(f.bold, done), { x: x0, y: y - 10, size: 8.5, font: f.bold, color: C.night });

  pages.forEach((p, i) => {
    p.drawSvgPath(BOLT, { x: M, y: 24, scale: 0.75, color: C.night });
    p.drawText(clean(f.regular, `CF Réseaux · Tour de table · ${input.title}`), { x: M + 12, y: 14, size: 7, font: f.regular, color: C.muted });
    const label = `${i + 1} / ${pages.length}`;
    p.drawText(label, { x: W - M - f.bold.widthOfTextAtSize(label, 7.5), y: 14, size: 7.5, font: f.bold, color: C.night });
  });
  return doc.save();
}
