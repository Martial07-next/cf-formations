'use client';

import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { APPRECIATIONS, LEVELS, familyNote, fmtNote, totalNote, type GridDef, type IrveEntry } from '@/lib/irve-grid';

/**
 * Grilles d'évaluation pratique (IRVE, Maintenance IRVE) : le document de
 * CF Réseaux rempli à l'identique (cases cochées, notes, remarques,
 * appréciation), un exemplaire complet par stagiaire.
 */

export type IrvePdfInput = {
  sessionTitle: string;
  dates: string; // « Du 16/11/2026 au 18/11/2026 »
  trainer: string;
  /** Date de l'évaluation si le formateur ne l'a pas changée (dernier jour). */
  defaultDate?: string;
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

/**
 * Positions relevées sur chaque modèle (origine en haut à gauche, en points).
 * Pages : index dans le modèle.
 */
type Layout = {
  file: string;
  qualifX: number[];
  situationX: number[];
  rows: Record<string, { page: number; ys: number[]; note: number; obs: number; noteX?: number }>;
  synth: { page: number; ys: number[]; total: number };
  crit: { page: number; ys: number[]; text: number };
  appr: { page: number; ys: number[]; forts: number };
  axes: { page: number; top: number };
  valid: { page: number; name: number; date: number };
  trace: { page: number; atelier: number; materiel: number; scenario: number; box: number; boxX: number[]; autreX: number; autreTop: number };
};

const LAYOUTS: Record<GridDef['kind'], Layout> = {
  irve_grille: {
    file: '/templates/grille-irve.pdf',
    qualifX: [201.7, 240.2, 280.4],
    situationX: [201.7, 273.3, 361.9, 441.3],
    rows: {
      A: { page: 1, ys: [188.0, 223.8, 259.7, 289.8], note: 317.3, obs: 312.7 },
      B: { page: 1, ys: [398.9, 434.7, 476.2, 512.0, 542.2], note: 569.7, obs: 565.1 },
      C: { page: 2, ys: [108.7, 138.9, 169.0, 199.2, 229.3], note: 256.8, obs: 252.2 },
      D: { page: 2, ys: [338.4, 368.5, 398.7, 428.8, 459.0], note: 486.5, obs: 481.9 },
      E: { page: 2, ys: [568.0, 598.2, 634.0, 669.8, 700.0], note: 727.5, obs: 722.9 },
      F: { page: 3, ys: [108.7, 138.9, 169.0, 199.2, 229.3], note: 256.8, obs: 252.2 },
      G: { page: 3, ys: [338.4, 368.5, 404.3, 440.2, 476.0, 511.8], note: 539.3, obs: 534.7 },
      H: { page: 3, ys: [620.9, 656.7, 692.5, 722.7], note: 750.2, obs: 745.6, noteX: 320.1 },
    },
    synth: { page: 4, ys: [104.3, 124.3, 144.3, 164.3, 184.3, 204.3, 224.3, 244.3], total: 266.7 },
    crit: { page: 4, ys: [405.6, 426.6, 447.6, 468.6, 489.6], text: 532 },
    appr: { page: 4, ys: [651.7, 672.7, 693.7, 714.7], forts: 757 },
    axes: { page: 5, top: 77.5 },
    valid: { page: 5, name: 180, date: 204 },
    trace: { page: 5, atelier: 391, materiel: 414, scenario: 435, box: 470.8, boxX: [201.7, 296.6, 349.2, 438.3], autreX: 479.9, autreTop: 470.2 },
  },
  maint_grille: {
    file: '/templates/grille-maintenance-irve.pdf',
    qualifX: [201.7, 247.8, 295.6],
    situationX: [201.7, 320.9, 438.4],
    rows: {
      A: { page: 1, ys: [193.7, 235.2, 276.7, 318.2, 351.9], note: 377.4, obs: 372.8 },
      B: { page: 1, ys: [464.6, 500.4, 536.2, 572.1, 602.2], note: 629.7, obs: 625.1 },
      C: { page: 2, ys: [108.7, 138.9, 169.0, 199.2, 229.3], note: 256.8, obs: 252.2 },
      D: { page: 2, ys: [338.4, 368.5, 404.3, 440.2, 476.0], note: 509.2, obs: 504.6 },
      E: { page: 2, ys: [590.7, 626.5, 662.4, 692.5], note: 720.0, obs: 715.4 },
    },
    synth: { page: 3, ys: [104.3, 124.3, 144.3, 164.3, 184.3], total: 206.7 },
    crit: { page: 3, ys: [345.6, 366.6, 387.6, 408.6, 429.6], text: 472 },
    appr: { page: 3, ys: [591.7, 612.7, 633.7, 654.7], forts: 697 },
    axes: { page: 3, top: 758.5 },
    valid: { page: 4, name: 108.6, date: 132.6 },
    trace: { page: 4, atelier: 319.5, materiel: 342.5, scenario: 363.4, box: 399.3, boxX: [201.7, 282.2, 334.8, 452.2], autreX: 493.8, autreTop: 398.7 },
  },
};

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

export async function buildIrvePdf(def: GridDef, input: IrvePdfInput): Promise<Uint8Array> {
  const L = LAYOUTS[def.kind];
  const get = (p: string) => fetch(p).then((r) => {
    if (!r.ok) throw new Error('Modèle de la grille introuvable.');
    return r.arrayBuffer();
  });
  const [tplBytes, reg, bold] = await Promise.all([get(L.file), get('/fonts/SpaceGrotesk-Regular.ttf'), get('/fonts/SpaceGrotesk-Bold.ttf')]);
  const out = await PDFDocument.create();
  out.registerFontkit(fontkit);
  out.setTitle(`${def.name.replace('’', "'")} - ${input.sessionTitle}`);
  out.setAuthor('CF Réseaux');
  const f: Fonts = { regular: await out.embedFont(reg, { subset: true }), bold: await out.embedFont(bold, { subset: true }) };
  const tpl = await PDFDocument.load(tplBytes);

  for (const t of input.trainees) {
    const e = input.entries[t.id] || {};
    const pages = await out.copyPages(tpl, tpl.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    const p1 = pages[0];

    // 01 · Identification
    put(p1, f.bold, t.name, 203, 227.5, 9);
    put(p1, f.regular, t.company || '', 203, 250.5, 9);
    put(p1, f.regular, input.dates, 203, 273.5, 9);
    put(p1, f.regular, input.trainer, 203, 296.5, 9);
    def.qualifs.forEach((q, i) => e.qualif?.includes(q) && check(p1, L.qualifX[i], 319.4));
    def.situations.forEach((s, i) => e.situations?.includes(s) && check(p1, L.situationX[i], 342.4));

    // 03 · Critères : niveau coché, remarque, note de la famille, observations
    for (const fam of def.families) {
      const r = L.rows[fam.key];
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
    const ps = pages[L.synth.page];
    def.families.forEach((fam, i) => overDots(ps, f, fmtNote(familyNote(fam, e)), 494.5, L.synth.ys[i]));
    overDots(ps, f, fmtNote(totalNote(def, e)), 482.9, L.synth.total, 16, true);

    // 05 · Erreurs critiques
    const pc = pages[L.crit.page];
    def.critical.forEach((c, i) => check(pc, e.critical?.[c.key] ? 511.3 : 441.3, L.crit.ys[i]));
    if (e.criticalText) block(pc, f.regular, e.criticalText, 46, L.crit.text, 8, 500, 3, 19.5);

    // 06 · Appréciation
    const pa = pages[L.appr.page];
    APPRECIATIONS.forEach((a, i) => e.appreciation === a.key && check(pa, 511.3, L.appr.ys[i]));
    if (e.forts) block(pa, f.regular, e.forts, 46, L.appr.forts, 8, 500, 2, 19.6);
    if (e.axes) block(pages[L.axes.page], f.regular, e.axes, 46, L.axes.top, 8, 500, 2, 19.6);

    // 07 · Validation
    const pv = pages[L.valid.page];
    put(pv, f.regular, input.trainer, 173, L.valid.name, 8.6);
    put(pv, f.regular, t.name, 365, L.valid.name, 8.6);
    const date = e.date ?? input.defaultDate;
    if (date) {
      put(pv, f.regular, date, 173, L.valid.date, 8.6);
      put(pv, f.regular, date, 365, L.valid.date, 8.6);
    }

    // 08 · Traçabilité de la mise en situation
    const T = L.trace;
    const pt = pages[T.page];
    if (e.atelier) put(pt, f.regular, e.atelier, 203, T.atelier, 8.6);
    if (e.materiel) put(pt, f.regular, e.materiel, 203, T.materiel, 8.6);
    if (e.scenario) put(pt, f.regular, e.scenario, 203, T.scenario, 8.6);
    def.conserves.forEach((c, i) => e.conserves?.includes(c) && check(pt, T.boxX[i], T.box));
    if (e.autreDoc) {
      // À la place des pointillés « ………… ».
      pt.drawRectangle({ x: T.autreX - 0.5, y: H - T.autreTop - 10, width: 548 - T.autreX, height: 9.5, color: WHITE });
      block(pt, f.regular, e.autreDoc, T.autreX, T.autreTop + 1.2, 7.4, 546 - T.autreX, 1);
    }
  }
  return out.save();
}
