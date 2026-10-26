'use client';

import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { COMPANY, type Legal } from '@/lib/pdf-brand';
import { CREAM, INK, RED, fitSize, gradientText, keep, wrapText } from '@/lib/pdf-appreciation';
import { REUSSITE_SIGNATAIRE, type ReussiteEntry, type ReussiteModel } from '@/lib/reussite';

/**
 * Attestation de réussite, dans la direction artistique des fiches
 * d'appréciation individuelle : logo et bandeau du modèle Canva CF Réseaux
 * (public/templates/fiche-appreciation.pdf), formes de fond claires, titre
 * Archivo Expanded, textes Space Grotesk, éclairs verts devant les rubriques.
 */

export type ReussiteInput = {
  model: ReussiteModel;
  trainees: { id: string; name: string; company: string | null }[];
  entries: Record<string, ReussiteEntry>;
  startDate: string; // AAAA-MM-JJ
  endDate: string;
  /** « 7 h (1 jour) » */
  duration: string;
  lieu: string | null;
  trainerName: string | null;
  signature?: string | null;
  legal?: Legal | null;
};

const W = 595.5;
const H = 842.25;
const SHAPE = rgb(252 / 255, 251 / 255, 250 / 255);
const GREEN = rgb(8 / 255, 250 / 255, 100 / 255);
const MUTED = rgb(0.38, 0.42, 0.4);
const LEFT = 23.1;
const RIGHT = 572;

type Fonts = { title: PDFFont; light: PDFFont; regular: PDFFont; semibold: PDFFont; bold: PDFFont };

const fr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

export async function buildReussitePdf(input: ReussiteInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Attestations de réussite - ${input.model.label}`);
  doc.setAuthor('CF Réseaux');
  doc.registerFontkit(fontkit);
  const get = (path: string) =>
    fetch(path).then((r) => {
      if (!r.ok) throw new Error('Modèle introuvable.');
      return r.arrayBuffer();
    });
  const [tpl, bolt, title, light, regular, semibold, bold] = await Promise.all([
    get('/templates/fiche-appreciation.pdf'),
    get('/templates/eclair.png'),
    get('/fonts/ArchivoExpanded-Bold.ttf'),
    get('/fonts/SpaceGrotesk-Light.ttf'),
    get('/fonts/SpaceGrotesk-Regular.ttf'),
    get('/fonts/SpaceGrotesk-SemiBold.ttf'),
    get('/fonts/SpaceGrotesk-Bold.ttf'),
  ]);
  const src = await PDFDocument.load(tpl);
  const page0 = src.getPage(0);
  // Logo (haut gauche) et bandeau du bas, découpés dans le modèle Canva (repère du modèle : y de 7,83 à 850,08).
  const logo = await doc.embedPage(page0, { left: 20, right: 205, bottom: 787, top: 823 });
  const band = await doc.embedPage(page0, { left: 0, right: 595.5, bottom: 7.83, top: 65.5 });
  const icon = await doc.embedPng(bolt);
  const f: Fonts = {
    title: await doc.embedFont(title, { subset: true }),
    light: await doc.embedFont(light, { subset: true }),
    regular: await doc.embedFont(regular, { subset: true }),
    semibold: await doc.embedFont(semibold, { subset: true }),
    bold: await doc.embedFont(bold, { subset: true }),
  };
  let sign: PDFImage | null = null;
  if (input.signature?.startsWith('data:image/png;base64,')) {
    try {
      sign = await doc.embedPng(Uint8Array.from(atob(input.signature.split(',')[1]), (c) => c.charCodeAt(0)));
    } catch {
      sign = null;
    }
  }

  for (const t of input.trainees) {
    const page = doc.addPage([W, H]);
    drawDecor(page, logo, band);
    drawSheet(page, f, icon, sign, input, t, input.entries[t.id] || {});
  }
  return doc.save();
}

function drawDecor(page: PDFPage, logo: Parameters<PDFPage['drawPage']>[0], band: Parameters<PDFPage['drawPage']>[0]) {
  // Formes claires du modèle (bande diagonale et bloc en bas à droite).
  page.drawSvgPath('M298 77 L595.5 77 L595.5 236 L46 785 L0 785 L0 375 Z', { x: 0, y: H, color: SHAPE });
  page.drawSvgPath('M320 533 L595.5 533 L595.5 661 L471 785 L300 785 L300 553 Q300 533 320 533 Z', { x: 0, y: H, color: SHAPE });
  page.drawPage(logo, { x: 20, y: 787 - 7.83 });
  page.drawPage(band, { x: 0, y: 0 });
}

function checkbox(page: PDFPage, x: number, baseline: number, checked: boolean) {
  const s = 9.5;
  page.drawRectangle({ x, y: baseline - 1, width: s, height: s, borderColor: INK, borderWidth: 0.9 });
  if (checked) {
    page.drawLine({ start: { x: x + 1.4, y: baseline + 4.1 }, end: { x: x + 4, y: baseline + 0.9 }, thickness: 1.8, color: RED });
    page.drawLine({ start: { x: x + 4, y: baseline + 0.9 }, end: { x: x + 10.6, y: baseline + 10.3 }, thickness: 1.8, color: RED });
  }
}

/** Cadre arrondi au trait fin, comme les zones de saisie du modèle. `top` : distance depuis le haut de la page. */
function frame(page: PDFPage, x: number, top: number, w: number, h: number) {
  const r = 9;
  const T = top;
  const B = top + h;
  const path = `M${x + r} ${T} L${x + w - r} ${T} Q${x + w} ${T} ${x + w} ${T + r} L${x + w} ${B - r} Q${x + w} ${B} ${x + w - r} ${B} L${x + r} ${B} Q${x} ${B} ${x} ${B - r} L${x} ${T + r} Q${x} ${T} ${x + r} ${T} Z`;
  page.drawSvgPath(path, { x: 0, y: H, color: rgb(1, 1, 1), borderColor: INK, borderWidth: 1 });
}

function drawSheet(
  page: PDFPage,
  f: Fonts,
  icon: PDFImage,
  sign: PDFImage | null,
  input: ReussiteInput,
  t: { name: string; company: string | null },
  e: ReussiteEntry
) {
  const text = (s: string, x: number, y: number, size: number, font: PDFFont, color = INK) =>
    page.drawText(keep(font, s), { x, y, size, font, color });
  const heading = (label: string, y: number) => {
    page.drawImage(icon, { x: LEFT + 0.5, y: y - 2.5, width: 16, height: 17 });
    text(label, 47.2, y, 13.65, f.semibold);
  };
  /** « Libellé : valeur » (valeur en gras), réduit si trop long. */
  const pair = (label: string, value: string, x: number, y: number, size: number, max = RIGHT) => {
    text(label, x, y, size, f.regular);
    const vx = x + f.regular.widthOfTextAtSize(keep(f.regular, label), size);
    const v = keep(f.semibold, value);
    text(v, vx, y, fitSize(f.semibold, v, size, max - vx, 7), f.semibold);
  };

  // Titre (mêmes position et police que la fiche d'appréciation) + intitulé de la formation.
  text('ATTESTATION', 21, H - 114.85, 38.7, f.title);
  text('DE RÉUSSITE', 21, H - 155.15, 38.7, f.title);
  page.drawRectangle({ x: 23, y: H - 189, width: 77, height: 2.6, color: GREEN });
  const label = keep(f.title, input.model.label);
  const ls = fitSize(f.title, label, 26, 200, 14);
  gradientText(page, f.title, label, RIGHT - f.title.widthOfTextAtSize(label, ls), H - 155.15, ls);

  // Déclaration
  let y = H - 222;
  const intro = `Je, soussignée ${REUSSITE_SIGNATAIRE}, représentant de l’organisme de formation CF RÉSEAUX, atteste que :`;
  wrapText(f.regular, intro, 11.5, RIGHT - LEFT).forEach((l) => {
    text(l, LEFT, y, 11.5, f.regular);
    y -= 15;
  });
  y -= 6;
  const who = keep(f.bold, t.name.toUpperCase());
  const ws = fitSize(f.bold, who, 17, RIGHT - LEFT - 40, 11);
  text(who, LEFT, y, ws, f.bold);
  y -= 17;
  if (t.company) {
    pair('de la société ', t.company.toUpperCase(), LEFT, y, 11.5);
    y -= 16;
  }
  text('a réalisé la formation :', LEFT, y, 11.5, f.regular);
  const fx = LEFT + f.regular.widthOfTextAtSize('a réalisé la formation : ', 11.5);
  text(input.model.label, fx, y, 11.5, f.bold);
  y -= 14;

  // Informations
  const single = input.startDate.slice(0, 10) === input.endDate.slice(0, 10);
  const rows: [string, string][] = [
    ['Lieu de la formation : ', input.lieu || 'Centre CF RÉSEAUX'],
    ['Dates de la formation : ', single ? `le ${fr(input.startDate)}` : `du ${fr(input.startDate)} au ${fr(input.endDate)}`],
    ['Durée de la formation : ', input.duration],
    ['Formation animée par : ', input.trainerName || '-'],
    ['Nature de l’action de formation : ', 'Action de formation'],
  ];
  const infoH = rows.length * 16 + 14;
  frame(page, LEFT, H - y, RIGHT - LEFT, infoH);
  let iy = y - 19;
  for (const [a, b] of rows) {
    pair(a, b, LEFT + 12, iy, 10.5, RIGHT - 12);
    iy -= 16;
  }
  y -= infoH + 26;

  // Objectifs : taille ajustée pour que tout tienne sur la page.
  heading('OBJECTIFS DE LA FORMATION', y);
  y -= 18;
  const bottomLimit = 268; // place pour l'avis, les observations et la signature
  let size = 10.5;
  let blocks: string[][] = [];
  let mention: string[] = [];
  const measure = () => {
    blocks = input.model.objectives.map((o) => wrapText(f.regular, o, size, RIGHT - LEFT - 16));
    mention = wrapText(f.light, input.model.mention, size, RIGHT - LEFT);
    return blocks.reduce((n, b) => n + b.length * size * 1.3 + 3, 0) + mention.length * size * 1.3 + 6;
  };
  while (size > 7.5 && y - measure() < bottomLimit) size -= 0.25;
  measure();
  for (const b of blocks) {
    page.drawCircle({ x: LEFT + 4, y: y + size * 0.32, size: 2, color: GREEN });
    b.forEach((l) => {
      text(l, LEFT + 13, y, size, f.regular);
      y -= size * 1.3;
    });
    y -= 3;
  }
  y -= 3;
  mention.forEach((l) => {
    text(l, LEFT, y, size, f.light, MUTED);
    y -= size * 1.3;
  });

  // Avis après formation
  y = Math.min(y - 14, 252);
  heading('AVIS APRÈS FORMATION', y);
  const ay = y - 24;
  checkbox(page, LEFT + 2, ay, e.avis === 'favorable');
  text('FAVORABLE', LEFT + 18, ay, 11.5, f.semibold);
  checkbox(page, LEFT + 112, ay, e.avis === 'defavorable');
  text('DÉFAVORABLE', LEFT + 128, ay, 11.5, f.semibold);
  // Note obtenue dans un petit cadre
  frame(page, 372, H - (ay + 15), RIGHT - 372, 26);
  pair('Note obtenue : ', (e.note || '').trim() || '—', 382, ay, 11.5, RIGHT - 8);

  // Observations
  const oy = ay - 22;
  text('Observations :', LEFT, oy, 11, f.semibold);
  const boxTop = oy - 7;
  const boxH = 54;
  frame(page, LEFT, H - boxTop, RIGHT - LEFT, boxH);
  const obs = (e.observations || '').trim();
  if (obs) {
    let s = 10.5;
    let lines = wrapText(f.regular, obs, s, RIGHT - LEFT - 24);
    while (s > 7.5 && lines.length * s * 1.25 > boxH - 12) {
      s -= 0.5;
      lines = wrapText(f.regular, obs, s, RIGHT - LEFT - 24);
    }
    lines.slice(0, Math.floor((boxH - 10) / (s * 1.25))).forEach((l, i) => text(l, LEFT + 12, boxTop - 8 - s - i * s * 1.25, s, f.regular));
  }

  // Fait à … / signature du formateur
  const sy = boxTop - boxH - 20;
  text(`Fait à ${(input.legal?.city || 'Cuincy').toUpperCase()}, le ${fr(input.endDate)}`, LEFT, sy, 11, f.regular);
  text('Nom, prénom et signature du formateur :', 318, sy, 10.5, f.regular);
  const tn = keep(f.bold, input.trainerName || '');
  text(tn, 318, sy - 14, fitSize(f.bold, tn, 11, RIGHT - 318, 7), f.bold);
  if (sign) {
    const maxW = 150;
    const maxH = Math.max(20, sy - 14 - 8 - 70);
    const k = Math.min(maxW / sign.width, maxH / sign.height);
    page.drawImage(sign, { x: 318, y: sy - 22 - sign.height * k, width: sign.width * k, height: sign.height * k });
  }

  // Bandeau du bas : titre du document et mentions de l'organisme.
  gradientText(page, f.title, 'ATTESTATION', 238.5, 30.6, 10.08);
  text('DE RÉUSSITE', 245.5, 20.5, 9.97, f.title, CREAM);
  text(`Formation ${input.model.label}`, 248.5, 10.4, 7.89, f.bold, CREAM);
  const right = [COMPANY.name, `SIRET ${input.legal?.siret || COMPANY.siret}`, `NDA ${input.legal?.nda || '-'}`, COMPANY.email];
  [42.0, 31.4, 20.9, 10.4].forEach((yy, i) => text(right[i], 468.2, yy, 7.89, f.bold, CREAM));
}
