'use client';

import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { COMPANY, type Legal } from '@/lib/pdf-brand';
import type { AppreciationEntry } from '@/lib/appreciation';

/**
 * Fiche d'appréciation individuelle : reprise exacte du modèle Canva de
 * CF Réseaux. Le décor (logo, éclairs verts, cadres, formes de fond, bandeau)
 * vient du modèle lui-même (public/templates/fiche-appreciation.pdf, sans
 * texte) ; les textes sont posés aux mêmes endroits, mêmes polices et tailles.
 */

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

const INK = rgb(23 / 255, 36 / 255, 27 / 255); // #17241B
const CREAM = rgb(1, 253 / 255, 243 / 255); // #FFFDF3
const RED = rgb(0.906, 0.098, 0.122); // coche rouge du modèle
const W = 595.5;
const H = 842.25;

type Fonts = { title: PDFFont; light: PDFFont; regular: PDFFont; semibold: PDFFont; bold: PDFFont };

const short = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y.slice(2)}`;
};

function keep(font: PDFFont, text: string) {
  const chars = new Set(font.getCharacterSet());
  return Array.from(text || '')
    .map((ch) => (ch === '\n' || chars.has(ch.codePointAt(0)!) ? ch : '?'))
    .join('');
}

function wrapText(font: PDFFont, text: string, size: number, width: number) {
  const out: string[] = [];
  for (const para of keep(font, text).replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(t, size) <= width) line = t;
      else {
        if (line) out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  while (out.length > 1 && out[out.length - 1] === '') out.pop();
  return out;
}

/** Texte qui tient sur une largeur donnée (taille réduite si besoin). */
function fitSize(font: PDFFont, text: string, size: number, width: number, min = 8) {
  let s = size;
  while (s > min && font.widthOfTextAtSize(text, s) > width) s -= 0.25;
  return s;
}

/** Texte en dégradé jaune → vert, lettre par lettre (comme « COMPTE RENDU » du modèle). */
function gradientText(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size: number) {
  const total = font.widthOfTextAtSize(text, size);
  let cx = x;
  for (const ch of text) {
    const w = font.widthOfTextAtSize(ch, size);
    const t = Math.min(1, Math.max(0, (cx - x + w / 2) / total));
    page.drawText(ch, { x: cx, y, size, font, color: rgb((255 + (8 - 255) * t) / 255, (242 + (250 - 242) * t) / 255, (0 + 100 * t) / 255) });
    cx += w;
  }
}

function checkbox(page: PDFPage, x: number, baseline: number, checked: boolean) {
  const s = 8.6;
  page.drawRectangle({ x, y: baseline - 0.6, width: s, height: s, borderColor: INK, borderWidth: 0.8 });
  if (checked) {
    page.drawLine({ start: { x: x + 1.2, y: baseline + 3.8 }, end: { x: x + 3.6, y: baseline + 0.8 }, thickness: 1.7, color: RED });
    page.drawLine({ start: { x: x + 3.6, y: baseline + 0.8 }, end: { x: x + 9.6, y: baseline + 9.4 }, thickness: 1.7, color: RED });
  }
}

/** Contenu d'un cadre : texte en Space Grotesk, taille réduite si le texte est long. */
function boxText(page: PDFPage, f: Fonts, text: string, top: number, bottom: number) {
  const value = (text || '').trim();
  if (!value) return;
  const width = 572 - 22.5 - 30;
  let size = 11;
  let lines = wrapText(f.regular, value, size, width);
  while (size > 7.5 && lines.length * size * 1.25 > top - bottom - 16) {
    size -= 0.5;
    lines = wrapText(f.regular, value, size, width);
  }
  const max = Math.floor((top - bottom - 14) / (size * 1.25));
  lines.slice(0, Math.max(1, max)).forEach((l, i) =>
    page.drawText(l, { x: 37, y: top - 9 - size - i * size * 1.25, size, font: f.regular, color: INK })
  );
}

export async function buildAppreciationPdf(input: AppreciationInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Fiches d'appréciation individuelle - ${input.codification}`);
  doc.setAuthor('CF Réseaux');
  doc.registerFontkit(fontkit);
  const get = (path: string) =>
    fetch(path).then((r) => {
      if (!r.ok) throw new Error('Modèle de fiche introuvable.');
      return r.arrayBuffer();
    });
  const [tpl, title, light, regular, semibold, bold] = await Promise.all([
    get('/templates/fiche-appreciation.pdf'),
    get('/fonts/ArchivoExpanded-Bold.ttf'),
    get('/fonts/SpaceGrotesk-Light.ttf'),
    get('/fonts/SpaceGrotesk-Regular.ttf'),
    get('/fonts/SpaceGrotesk-SemiBold.ttf'),
    get('/fonts/SpaceGrotesk-Bold.ttf'),
  ]);
  const [background] = await doc.embedPdf(tpl, [0]);
  const f: Fonts = {
    title: await doc.embedFont(title, { subset: true }),
    light: await doc.embedFont(light, { subset: true }),
    regular: await doc.embedFont(regular, { subset: true }),
    semibold: await doc.embedFont(semibold, { subset: true }),
    bold: await doc.embedFont(bold, { subset: true }),
  };

  for (const t of input.trainees) {
    const page = doc.addPage([W, H]);
    // Le modèle Canva a une page qui commence à y = 7,83 : on recale le décor.
    page.drawPage(background, { x: 0, y: -7.83, width: W, height: H });
    drawTexts(page, f, input, t, input.entries[t.id] || {});
  }
  return doc.save();
}

function drawTexts(page: PDFPage, f: Fonts, input: AppreciationInput, t: { name: string; company: string | null }, e: AppreciationEntry) {
  const text = (s: string, x: number, y: number, size: number, font: PDFFont, color = INK) =>
    page.drawText(keep(font, s), { x, y, size, font, color });

  // Titre
  text('FICHE APPRÉCIATION', 21, 727.4, 38.7, f.title);
  text('INDIVIDUELLE', 21, 687.1, 38.7, f.title);

  // Informations (même police que le modèle ; lieu en Light)
  const S = 13.73;
  const line = (label: string, value: string, y: number, valueFont: PDFFont = f.regular) => {
    text(label, 23.1, y, S, f.regular);
    const x = 23.1 + f.regular.widthOfTextAtSize(keep(f.regular, label), S);
    const v = keep(valueFont, value);
    text(v, x, y, fitSize(valueFont, v, S, 572 - x), valueFont);
  };
  // Lieu sur la ligne des dates s'il y tient (comme le modèle), sinon sur sa propre ligne.
  const dates = `Dates du stage : du ${short(input.startDate)} au ${short(input.endDate)} `;
  const lieu = keep(f.light, input.lieu || 'CF RÉSEAUX');
  const inline =
    23.1 + f.regular.widthOfTextAtSize(keep(f.regular, dates + 'Lieu de dispense : '), S) + f.light.widthOfTextAtSize(lieu, S) <= 572;
  const ys = inline ? [632.9, 614.2, 595.6, 576.9] : [632.9, 615.9, 598.9, 581.9, 564.9];
  line('Nom & Prénom du participant :   ', t.name.toUpperCase(), ys[0]);
  line('Entreprise : ', (t.company || '').toUpperCase(), ys[1]);
  line('Codification SERECT : ', input.codification, ys[2]);
  if (inline) {
    line(dates + 'Lieu de dispense : ', lieu, ys[3], f.light);
  } else {
    line('Dates du stage : ', `du ${short(input.startDate)} au ${short(input.endDate)}`, ys[3]);
    line('Lieu de dispense : ', lieu, ys[4], f.light);
  }

  // Avis du formateur
  text('AVIS DU FORMATEUR (À REPORTER SUR LES ATTESTATIONS)', 47.2, 540.2, 13.65, f.semibold);
  const B = 12.5;
  checkbox(page, 23.6, 516.1, e.avis === 'defavorable');
  text(' AVIS DÉFAVORABLE = Réserves, car les exercices n’ont pas été réalisés de façon', 35.6, 516.1, B, f.regular);
  text('satisfaisante.', 23.1, 498.8, B, f.regular);
  text('Écarts constatés :', 39.2, 481.6, B, f.bold);
  text('(', 23.1, 464.3, B, f.regular);
  text('Attention', 27.9, 464.3, B, f.bold);
  text(' → Se limiter aux constats faits pendant la formation, ne pas proposer de', 84.1, 464.3, B, f.regular);
  text('restriction d’habilitation).', 23.1, 447.0, B, f.regular);
  boxText(page, f, e.ecarts || '', 441.8, 395.9);

  checkbox(page, 23.6, 378.0, e.avis === 'favorable');
  text(' AVIS FAVORABLE = Exercices réalisés de façon satisfaisante, objectifs atteints.', 35.6, 378.0, B, f.regular);
  text('→ Pas de réserve quant à la délivrance (ou maintien) d’une habilitation.', 39.2, 360.8, B, f.bold);

  text('AUTRES INFORMATIONS (À REPORTER SUR LES ATTESTATIONS)', 47.2, 336.5, 13.65, f.semibold);
  boxText(page, f, e.autres_attestation || '', 323.0, 225.0);
  text('AUTRES INFORMATIONS (INTERNES, NON DESTINÉES AU CLIENT)', 47.2, 201.0, 13.65, f.semibold);
  boxText(page, f, e.autres_internes || '', 187.2, 90.0);

  const trainer = `Nom du formateur : ${input.trainerName || ''}`;
  text(trainer, 23.1, 70.5, fitSize(f.bold, keep(f.bold, trainer), 13.88, 540), f.bold);

  // Bandeau du bas
  gradientText(page, f.title, 'COMPTE RENDU', 242.9, 30.6, 10.08);
  text('D’ÉVALUATION INDIVIDUELLE', 203.7, 20.5, 9.97, f.title, CREAM);
  text('Document à joindre au RAPPORT DE L’INTERVENANT', 200.6, 10.4, 7.89, f.bold, CREAM);
  const right = [COMPANY.name, `SIRET ${input.legal?.siret || COMPANY.siret}`, `TVA intra ${COMPANY.tva}`, COMPANY.email];
  [42.0, 31.4, 20.9, 10.4].forEach((y, i) => text(right[i], 468.2, y, 7.89, f.bold, CREAM));
}
