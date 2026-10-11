'use client';

import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

/** Charte CF Réseaux pour les PDF générés (tour de table, émargement…). */
export const C = {
  green: rgb(8 / 255, 250 / 255, 100 / 255), // #08FA64
  yellow: rgb(1, 242 / 255, 0), // #FFF200
  night: rgb(23 / 255, 36 / 255, 27 / 255), // #17241B
  card: rgb(36 / 255, 53 / 255, 43 / 255), // #24352B
  cream: rgb(1, 253 / 255, 243 / 255), // #FFFDF3
  grey: rgb(229 / 255, 229 / 255, 229 / 255), // #E5E5E5
  white: rgb(1, 1, 1),
  muted: rgb(0.42, 0.47, 0.44),
  red: rgb(0.72, 0.18, 0.12),
};
/** Proportions du logo (viewBox 1814,62 × 293,44). */
export const LOGO_RATIO = 1814.62 / 293.44;
export const PAGE = { W: 842, H: 595, M: 24, BAND: 92 };

export type Brand = { title: PDFFont; bold: PDFFont; regular: PDFFont; logo: PDFImage | null };

/** Logo dégradé (SVG) converti en image haute définition pour le PDF. */
async function logoPng(): Promise<Uint8Array | null> {
  try {
    const svg = await fetch('/logo-cf-reseaux.svg').then((r) => (r.ok ? r.text() : Promise.reject()));
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 2400;
    canvas.height = Math.round(2400 / LOGO_RATIO);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
}

export async function loadBrand(doc: PDFDocument): Promise<Brand> {
  doc.registerFontkit(fontkit);
  const get = (f: string) =>
    fetch(`/fonts/${f}`).then((r) => {
      if (!r.ok) throw new Error('Polices introuvables.');
      return r.arrayBuffer();
    });
  const [title, bold, regular, logo] = await Promise.all([
    get('ArchivoExpanded-ExtraBold.ttf'),
    get('SpaceGrotesk-Bold.ttf'),
    get('SpaceGrotesk-Regular.ttf'),
    logoPng(),
  ]);
  return {
    title: await doc.embedFont(title, { subset: true }),
    bold: await doc.embedFont(bold, { subset: true }),
    regular: await doc.embedFont(regular, { subset: true }),
    logo: logo ? await doc.embedPng(logo) : null,
  };
}

/** Garde uniquement les caractères présents dans la police. */
export function clean(font: PDFFont, text: string) {
  const chars = new Set(font.getCharacterSet());
  return Array.from(text || '')
    .map((ch) => (ch === '\n' || chars.has(ch.codePointAt(0)!) ? ch : ch === '’' ? "'" : '?'))
    .join('');
}

/** Découpe un texte en lignes tenant dans `width` (mots trop longs coupés). */
export function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of clean(font, text || '').replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(tryLine, size) <= width) {
        line = tryLine;
        continue;
      }
      if (line) out.push(line);
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

export type SessionCard = { title: string; period: string; room: string | null; trainerName: string | null };

/**
 * Nouvelle page à la charte : fond crème, bandeau vert nuit avec le logo,
 * titre du document et carte « session ». Renvoie le haut de la zone utile.
 */
export function brandPage(doc: PDFDocument, b: Brand, docTitle: string, subtitle: string, s: SessionCard) {
  const { W, H, M, BAND } = PAGE;
  const page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.cream });
  page.drawRectangle({ x: 0, y: H - BAND, width: W, height: BAND, color: C.night });
  // Logo (fond vert foncé)
  const logoW = 150;
  if (b.logo) page.drawImage(b.logo, { x: M, y: H - 20 - logoW / LOGO_RATIO, width: logoW, height: logoW / LOGO_RATIO });
  else page.drawText('CF RÉSEAUX', { x: M, y: H - 38, size: 14, font: b.title, color: C.green });
  page.drawText(clean(b.title, docTitle), { x: M, y: H - 66, size: 19, font: b.title, color: C.cream });
  page.drawRectangle({ x: M, y: H - 79, width: 34, height: 3, color: C.yellow });
  page.drawText(clean(b.regular, subtitle), { x: M + 42, y: H - 80, size: 8.5, font: b.regular, color: C.grey });
  // Carte « Session de formation et dates »
  const cardW = 300;
  const cx = W - M - cardW;
  page.drawRectangle({ x: cx, y: H - BAND + 12, width: cardW, height: BAND - 24, color: C.card });
  page.drawRectangle({ x: cx, y: H - BAND + 12, width: 4, height: BAND - 24, color: C.green });
  page.drawText('SESSION DE FORMATION ET DATES', { x: cx + 14, y: H - 30, size: 7, font: b.bold, color: C.green });
  const titleLines = wrap(b.bold, s.title, 10, cardW - 26).slice(0, 2);
  titleLines.forEach((l, i) => page.drawText(l, { x: cx + 14, y: H - 44 - i * 12, size: 10, font: b.bold, color: C.cream }));
  const meta = [s.period, s.room, s.trainerName && `Formateur : ${s.trainerName}`].filter(Boolean).join('  ·  ');
  wrap(b.regular, meta, 8, cardW - 26)
    .slice(0, 2)
    .forEach((l, i) => page.drawText(l, { x: cx + 14, y: H - 46 - titleLines.length * 12 - i * 10, size: 8, font: b.regular, color: C.grey }));
  return { page, top: H - BAND - 16 };
}

/** Pied de page sur toutes les pages : rappel du document et numérotation. */
export function brandFooters(pages: PDFPage[], b: Brand, label: string, note?: string, legal?: string) {
  const { W, M } = PAGE;
  pages.forEach((p, i) => {
    // Mentions légales (SIRET, déclaration d'activité) au-dessus du pied de page.
    if (legal) {
      const lines = wrap(b.regular, legal, 6.6, W - 2 * M);
      lines.slice(0, 2).forEach((l, k) =>
        p.drawText(l, { x: (W - b.regular.widthOfTextAtSize(l, 6.6)) / 2, y: 24 + (lines.length > 1 ? 8 : 0) - k * 8, size: 6.6, font: b.regular, color: C.muted })
      );
    }
    p.drawRectangle({ x: M, y: legal ? 44 : 26, width: W - 2 * M, height: 0.6, color: C.grey });
    p.drawText(clean(b.regular, label), { x: M, y: 14, size: 7, font: b.regular, color: C.muted });
    if (note) {
      const t = clean(b.regular, note);
      p.drawText(t, { x: (W - b.regular.widthOfTextAtSize(t, 7)) / 2, y: 14, size: 7, font: b.regular, color: C.muted });
    }
    const n = `${i + 1} / ${pages.length}`;
    p.drawText(n, { x: W - M - b.bold.widthOfTextAtSize(n, 7.5), y: 14, size: 7.5, font: b.bold, color: C.night });
  });
}

/** Ligne d'en-tête de tableau (vert CF Réseaux). */
export function headerRow(page: PDFPage, b: Brand, x0: number, y: number, cols: { label: string; width: number; sub?: string }[]) {
  const h = cols.some((c) => c.sub) ? 30 : 22;
  const width = cols.reduce((n, c) => n + c.width, 0);
  page.drawRectangle({ x: x0, y: y - h, width, height: h, color: C.green });
  let x = x0;
  for (const c of cols) {
    page.drawText(clean(b.bold, c.label), { x: x + 6, y: y - (c.sub ? 12.5 : 14.5), size: 7.8, font: b.bold, color: C.night });
    if (c.sub) page.drawText(clean(b.regular, c.sub), { x: x + 6, y: y - 24, size: 6.8, font: b.regular, color: C.night });
    x += c.width;
  }
  return y - h;
}
