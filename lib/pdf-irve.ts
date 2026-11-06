'use client';

import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { APPRECIATIONS, CONSERVES, CRITICAL, FAMILIES, LEVELS, SITUATIONS, familyNote, fmtNote, totalNote, type IrveEntry } from '@/lib/irve-grid';

/**
 * Grille d'évaluation pratique IRVE : le document de CF Réseaux
 * (/templates/grille-irve.pdf), rempli à l'identique (cases cochées, notes,
 * remarques, appréciation), un exemplaire de 6 pages par stagiaire.
 * Coordonnées relevées sur le modèle (origine en haut à gauche, en points).
 */

export type IrvePdfInput = {
  sessionTitle: string;
  dates: string; // « Du 16 au 18 novembre 2026 »
  trainer: string;
  trainees: { id: string; name: string; company: string | null }[];
  entries: Record<string, IrveEntry>;
};

const H = 841.89;
const INK = rgb(0.09, 0.14, 0.11);
const GREEN = rgb(0.05, 0.48, 0.29);
const WHITE = rgb(1, 1, 1);
const DARK = rgb(0.09, 0.14, 0.11);
const MINT = rgb(0.03, 0.98, 0.39);
const BOX_X = [260.2, 287.2, 314.2, 341.2, 368.1]; // 0, 1, 2, 3, N/O
// Lignes des critères (haut de la case), par page et par famille.
const ROWS: Record<string, { page: number; ys: number[]; note: number; obs: number; noteX?: number }> = {
  A: { page: 1, ys: [188.0, 223.8, 259.7, 289.8], note: 317.3, obs: 312.7 },
  B: { page: 1, ys: [398.9, 434.7, 476.2, 512.0, 542.2], note: 569.7, obs: 565.1 },
  C: { page: 2, ys: [108.7, 138.9, 169.0, 199.2, 229.3], note: 256.8, obs: 252.2 },
  D: { page: 2, ys: [338.4, 368.5, 398.7, 428.8, 459.0], note: 486.5, obs: 481.9 },
  E: { page: 2, ys: [568.0, 598.2, 634.0, 669.8, 700.0], note: 727.5, obs: 722.9 },
  F: { page: 3, ys: [108.7, 138.9, 169.0, 199.2, 229.3], note: 256.8, obs: 252.2 },
  G: { page: 3, ys: [338.4, 368.5, 404.3, 440.2, 476.0, 511.8], note: 539.3, obs: 534.7 },
  H: { page: 3, ys: [620.9, 656.7, 692.5, 722.7], note: 750.2, obs: 745.6, noteX: 320.1 },
};
const SYNTH_Y = [104.3, 124.3, 144.3, 164.3, 184.3, 204.3, 224.3, 244.3];
const CRIT_Y = [405.6, 426.6, 447.6, 468.6, 489.6];
const APPR_Y = [651.7, 672.7, 693.7, 714.7];

type Fonts = { regular: PDFFont; bold: PDFFont };

/** Texte posé avec le haut de sa ligne à « top » (coordonnées du modèle). */
function put(page: PDFPage, f: PDFFont, s: string, x: number, top: number, size: number, color = INK) {
  const clean = s.replace(/[\u2028\u2029\r]/g, ' ');
  let txt = '';
  for (const ch of clean) txt += f.getCharacterSet().includes(ch.codePointAt(0)!) ? ch : ch === '’' ? "'" : '?';
  page.drawText(txt, { x, y: H - top - size * 0.95, size, font: f, color });
}

function wrap(f: PDFFont, s: string, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of (s || '').split(/\n+/)) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) <= width) line = t;
      else {
        if (line) out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/** Bloc de texte borné (lignes au-delà : « … »). */
function block(page: PDFPage, f: PDFFont, s: string, x: number, top: number, size: number, width: number, maxLines: number, step = size * 1.2) {
  const lines = wrap(f, s, size, width);
  lines.slice(0, maxLines).forEach((l, i) => {
    const last = i === maxLines - 1 && lines.length > maxLines;
    put(page, f, last ? `${l.slice(0, Math.max(0, l.length - 2))}…` : l, x, top + i * step, size);
  });
}

/** Coche dans une case « ☐ » (coin haut-gauche du glyphe). */
function check(page: PDFPage, x: number, top: number) {
  const bx = x + 0.9;
  const by = H - top - 9.2;
  page.drawLine({ start: { x: bx + 1.2, y: by + 3.6 }, end: { x: bx + 2.9, y: by + 1.4 }, thickness: 1.4, color: GREEN });
  page.drawLine({ start: { x: bx + 2.9, y: by + 1.4 }, end: { x: bx + 6.6, y: by + 7.2 }, thickness: 1.4, color: GREEN });
}

/** Valeur à la place des pointillés « …… » (fond du modèle : blanc, ou vert foncé pour le total). */
function overDots(page: PDFPage, f: Fonts, s: string, x: number, top: number, w = 12, dark = false) {
  page.drawRectangle({ x: x - 0.5, y: H - top - 11, width: w + 1, height: 10.5, color: dark ? DARK : WHITE });
  put(page, f.bold, s, x, top + 1.2, 8.6, dark ? MINT : INK);
}

export async function buildIrvePdf(input: IrvePdfInput): Promise<Uint8Array> {
  const get = (p: string) => fetch(p).then((r) => {
    if (!r.ok) throw new Error('Modèle de la grille IRVE introuvable.');
    return r.arrayBuffer();
  });
  const [tplBytes, reg, bold] = await Promise.all([get('/templates/grille-irve.pdf'), get('/fonts/SpaceGrotesk-Regular.ttf'), get('/fonts/SpaceGrotesk-Bold.ttf')]);
  const out = await PDFDocument.create();
  out.registerFontkit(fontkit);
  out.setTitle(`Grilles d'évaluation pratique IRVE - ${input.sessionTitle}`);
  out.setAuthor('CF Réseaux');
  const f: Fonts = { regular: await out.embedFont(reg, { subset: true }), bold: await out.embedFont(bold, { subset: true }) };
  const tpl = await PDFDocument.load(tplBytes);

  for (const t of input.trainees) {
    const e = input.entries[t.id] || {};
    const pages = await out.copyPages(tpl, tpl.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    const [p1, , , , p5, p6] = pages;

    // 01 · Identification
    put(p1, f.bold, t.name, 203, 227.5, 9);
    put(p1, f.regular, t.company || '', 203, 250.5, 9);
    put(p1, f.regular, input.dates, 203, 273.5, 9);
    put(p1, f.regular, input.trainer, 203, 296.5, 9);
    (['P1', 'P2', 'P3'] as const).forEach((q, i) => e.qualif?.includes(q) && check(p1, [201.7, 240.2, 280.4][i], 319.4));
    SITUATIONS.forEach((s, i) => e.situations?.includes(s) && check(p1, [201.7, 273.3, 361.9, 441.3][i], 342.4));

    // 03 · Critères : niveau coché, remarque, note de la famille, observations
    for (const fam of FAMILIES) {
      const r = ROWS[fam.key];
      const page = pages[r.page];
      fam.criteria.forEach((c, i) => {
        const v = e.scores?.[c.id];
        const idx = LEVELS.findIndex((l) => l.value === v);
        if (idx >= 0) check(page, BOX_X[idx], r.ys[i]);
        const rem = e.remarks?.[c.id];
        if (rem) block(page, f.regular, rem, 392.5, r.ys[i] - 2.5, 6.6, 150, 3, 7.6);
      });
      overDots(page, f, fmtNote(familyNote(fam, e)), r.noteX ?? 319.35, r.note);
      const obs = e.obs?.[fam.key];
      if (obs) block(page, f.regular, obs, 452, r.obs + 3.2, 6.6, 96, 2, 7.4);
    }

    // 04 · Synthèse
    FAMILIES.forEach((fam, i) => overDots(p5, f, fmtNote(familyNote(fam, e)), 494.5, SYNTH_Y[i]));
    overDots(p5, f, fmtNote(totalNote(e)), 482.9, 266.7, 16, true);

    // 05 · Erreurs critiques
    CRITICAL.forEach((c, i) => check(p5, e.critical?.[c.key] ? 511.3 : 441.3, CRIT_Y[i]));
    if (e.criticalText) block(p5, f.regular, e.criticalText, 46, 532, 8, 500, 3, 19.5);

    // 06 · Appréciation
    APPRECIATIONS.forEach((a, i) => e.appreciation === a.key && check(p5, 511.3, APPR_Y[i]));
    if (e.forts) block(p5, f.regular, e.forts, 46, 757, 8, 500, 2, 19.6);
    if (e.axes) block(p6, f.regular, e.axes, 46, 77.5, 8, 500, 2, 19.6);

    // 07 · Validation
    put(p6, f.regular, input.trainer, 173, 180, 8.6);
    put(p6, f.regular, t.name, 365, 180, 8.6);
    if (e.date) {
      put(p6, f.regular, e.date, 173, 204, 8.6);
      put(p6, f.regular, e.date, 365, 204, 8.6);
    }

    // 08 · Traçabilité de la mise en situation
    if (e.atelier) put(p6, f.regular, e.atelier, 203, 391, 8.6);
    if (e.materiel) put(p6, f.regular, e.materiel, 203, 414, 8.6);
    if (e.scenario) put(p6, f.regular, e.scenario, 203, 435, 8.6);
    CONSERVES.forEach((c, i) => e.conserves?.includes(c) && check(p6, [201.7, 296.6, 349.2, 438.3][i], 470.8));
    if (e.autreDoc) put(p6, f.regular, e.autreDoc, 476, 471.5, 7.4);
  }
  return out.save();
}
