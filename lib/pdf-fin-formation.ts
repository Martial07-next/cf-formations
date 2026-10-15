'use client';

import { PDFDocument, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { COMPANY, type Legal } from '@/lib/pdf-brand';
import { CREAM, INK, RED, gradientText, keep, wrapText } from '@/lib/pdf-appreciation';
import type { AppreciationEntry } from '@/lib/appreciation';
import { formatDays } from '@/lib/schedule';

/**
 * Attestation de fin de formation et appréciation des compétences : reprise
 * des modèles Canva de CF Réseaux. Décor (logo, formes, bandeau) issu des
 * modèles eux-mêmes, sans texte ; les textes sont posés aux mêmes endroits,
 * mêmes polices et tailles. Les sections suivent la longueur du contenu.
 */

export type FinFormationInput = {
  trainees: { id: string; name: string; company: string | null; cursus?: 'initial' | 'recyclage' | null }[];
  entries: Record<string, AppreciationEntry>;
  actionTitle: string; // action de formation suivie (intitulé de la session)
  formationTitle: string; // intitulé de la formation (catalogue)
  objectifs: string | null;
  competences: string | null;
  /** Objectifs / compétences des stagiaires en recyclage (vide = ceux de l'initiale). */
  objectifsRecyclage?: string | null;
  competencesRecyclage?: string | null;
  startDate: string; // AAAA-MM-JJ
  endDate: string;
  days: number; // jours précis à la demi-journée (ex. 3.5)
  hours: number;
  address: string | null; // ex. 20 rue du Champ de Tir, 59553 Cuincy
  legal?: Legal | null;
  signataire: string;
  agrement: string;
  cachet: string | null; // data URL
};

type Fonts = { title: PDFFont; regular: PDFFont; semibold: PDFFont; bold: PDFFont };
type Ctx = { doc: PDFDocument; f: Fonts; bolt: PDFImage; cachet: PDFImage | null };

const W = 595.5;
const H = 842.25;
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const parts = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { y, m, d };
};
const dd = (n: number) => String(n).padStart(2, '0');
/** « Du 08 au 09 octobre 2026 », « Du 30 septembre au 02 octobre 2026 », « Le 08 octobre 2026 ». */
export function longPeriod(start: string, end: string) {
  const a = parts(start);
  const b = parts(end);
  if (start.slice(0, 10) === end.slice(0, 10)) return `Le ${dd(a.d)} ${MONTHS[a.m - 1]} ${a.y}`;
  if (a.y === b.y && a.m === b.m) return `Du ${dd(a.d)} au ${dd(b.d)} ${MONTHS[b.m - 1]} ${b.y}`;
  if (a.y === b.y) return `Du ${dd(a.d)} ${MONTHS[a.m - 1]} au ${dd(b.d)} ${MONTHS[b.m - 1]} ${b.y}`;
  return `Du ${dd(a.d)} ${MONTHS[a.m - 1]} ${a.y} au ${dd(b.d)} ${MONTHS[b.m - 1]} ${b.y}`;
}
const longDate = (iso: string) => {
  const a = parts(iso);
  return `${a.d} ${MONTHS[a.m - 1]} ${a.y}`;
};
const frDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const hoursText = (h: number) => {
  const total = Math.round(h * 60);
  return total % 60 ? `${Math.floor(total / 60)}h${dd(total % 60)}` : `${total / 60}h`;
};
/** Date du « Fait à » : aujourd'hui, mais jamais avant la fin de la session. */
function faitLe(endDate: string) {
  const today = new Date().toISOString().slice(0, 10);
  return longDate(today > endDate ? today : endDate);
}
const isRas = (v?: string) => !v || /^\s*(ras|rien à signaler|néant|-)\s*\.?\s*$/i.test(v);

async function setup(templatePath: string): Promise<{ ctx: Ctx; tpl: ArrayBuffer }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const get = (path: string) =>
    fetch(path).then((r) => {
      if (!r.ok) throw new Error('Modèle de document introuvable.');
      return r.arrayBuffer();
    });
  const [tpl, title, regular, semibold, bold, bolt] = await Promise.all([
    get(templatePath),
    get('/fonts/ArchivoExpanded-Bold.ttf'),
    get('/fonts/SpaceGrotesk-Regular.ttf'),
    get('/fonts/SpaceGrotesk-SemiBold.ttf'),
    get('/fonts/SpaceGrotesk-Bold.ttf'),
    get('/templates/eclair.png'),
  ]);
  const f: Fonts = {
    title: await doc.embedFont(title, { subset: true }),
    regular: await doc.embedFont(regular, { subset: true }),
    semibold: await doc.embedFont(semibold, { subset: true }),
    bold: await doc.embedFont(bold, { subset: true }),
  };
  return { ctx: { doc, f, bolt: await doc.embedPng(bolt), cachet: null }, tpl };
}

async function embedCachet(doc: PDFDocument, dataUrl: string | null) {
  if (!dataUrl) return null;
  try {
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1] || ''), (c) => c.charCodeAt(0));
    return dataUrl.startsWith('data:image/png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

function text(page: PDFPage | null, s: string, x: number, y: number, size: number, font: PDFFont, color = INK) {
  if (page) page.drawText(keep(font, s), { x, y, size, font, color });
}

/** Titre de section avec l'éclair vert du modèle. */
function heading(page: PDFPage | null, ctx: Ctx, label: string, y: number) {
  if (!page) return;
  page.drawImage(ctx.bolt, { x: 22.9, y: y - 3.2, width: 19.5, height: 19.5 });
  text(page, label, 47.2, y, 13.65, ctx.f.semibold);
}

/**
 * Texte « libellé → valeur » sur plusieurs lignes : la valeur commence après
 * le libellé et les lignes suivantes repartent à gauche. Renvoie la dernière ligne.
 */
function labelValue(
  page: PDFPage | null,
  label: { text: string; font: PDFFont },
  value: { text: string; font: PDFFont },
  size: number,
  y: number,
  step: number,
  x0 = 23.1,
  right = 572
) {
  const lt = keep(label.font, label.text);
  text(page, lt, x0, y, size, label.font);
  let x = x0 + label.font.widthOfTextAtSize(lt, size);
  let line = '';
  let cy = y;
  const flush = () => {
    if (line) text(page, line, x, cy, size, value.font);
  };
  for (const word of keep(value.font, value.text).split(/\s+/).filter(Boolean)) {
    const t = line ? `${line} ${word}` : word;
    if (x + value.font.widthOfTextAtSize(t, size) <= right) line = t;
    else {
      flush();
      cy -= step;
      x = x0;
      line = word;
    }
  }
  flush();
  return cy;
}

/** Lignes d'objectifs : « - » / « • » / « · » en tête de ligne = puce. */
function objectiveLines(text: string) {
  return (text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/^[-•·*]\s*/.test(l) ? { bullet: true, text: l.replace(/^[-•·*]\s*/, '') } : { bullet: false, text: l }));
}

function checkbox(page: PDFPage | null, x: number, base: number, checked: boolean) {
  if (!page) return;
  const s = 7.6;
  page.drawRectangle({ x, y: base - 0.4, width: s, height: s, borderColor: INK, borderWidth: 0.7 });
  if (checked) {
    page.drawLine({ start: { x: x + 1, y: base + 3.4 }, end: { x: x + 3.2, y: base + 0.6 }, thickness: 1.6, color: RED });
    page.drawLine({ start: { x: x + 3.2, y: base + 0.6 }, end: { x: x + 8.8, y: base + 8.6 }, thickness: 1.6, color: RED });
  }
}

function footer(page: PDFPage, f: Fonts, line1: string, line2: string, line2x: number, input: FinFormationInput) {
  const w2 = f.title.widthOfTextAtSize(keep(f.title, line2), 10.1);
  const cx = line2x + w2 / 2;
  const l1 = keep(f.title, line1);
  gradientText(page, f.title, l1, cx - f.title.widthOfTextAtSize(l1, 10.1) / 2, 30.6, 10.1);
  text(page, line2, line2x, 20.5, 10.1, f.title, CREAM);
  const ag = keep(f.bold, `Agrément N° ${input.agrement}`);
  text(page, ag, cx - f.bold.widthOfTextAtSize(ag, 7.89) / 2, 10.4, 7.89, f.bold, CREAM);
  const right = [COMPANY.name, `SIRET ${input.legal?.siret || COMPANY.siret}`, `TVA intra ${COMPANY.tva}`, COMPANY.email];
  [42.0, 31.4, 20.9, 10.4].forEach((y, i) => text(page, right[i], 468.2, y, 7.89, f.bold, CREAM));
}

function stamp(page: PDFPage, img: PDFImage | null, box: { x: number; y: number; w: number; h: number }) {
  if (!img) return;
  const scale = Math.min(box.w / img.width, box.h / img.height);
  page.drawImage(img, { x: box.x, y: box.y + (box.h - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
}

// ---------------------------------------------------------------------------
// Attestation de fin de formation (1 page par stagiaire)
// ---------------------------------------------------------------------------

function attestationBody(page: PDFPage | null, ctx: Ctx, input: FinFormationInput, t: { name: string; cursus?: 'initial' | 'recyclage' | null }, e: AppreciationEntry, k: number) {
  const { f } = ctx;
  const B = 12.5 * k;
  const step = 17.27 * k;
  let y = 576.2;
  text(page, `M./Mme → ${t.name}`, 23.1, y, 13.88, f.bold);
  y = labelValue(page, { text: 'a suivi l’action de formation suivante → ', font: f.semibold }, { text: input.actionTitle, font: f.regular }, 12.88, y - 18, 18);
  y = labelValue(page, { text: 'Intitulé de formation → ', font: f.semibold }, { text: input.formationTitle, font: f.regular }, 12.88, y - 18, 18);

  // Objectifs
  y -= 25.1;
  heading(page, ctx, 'OBJECTIFS DE LA FORMATION', y);
  y -= 22.6 * Math.min(1, k + 0.1) - step;
  const recyc = t.cursus === 'recyclage';
  const objs = objectiveLines((recyc && input.objectifsRecyclage) || input.objectifs || '');
  if (!objs.length) objs.push({ bullet: false, text: 'Objectifs de la formation à renseigner dans la fiche de la formation.' });
  for (const o of objs) {
    const x = o.bullet ? 44.4 : 23.1;
    const lines = wrapText(f.regular, o.text, B, 572 - x);
    lines.forEach((l, i) => {
      y -= step;
      if (o.bullet && i === 0 && page) page.drawCircle({ x: 32.6, y: y + B * 0.3, size: 2.1 * k, color: INK });
      text(page, l, x, y, B, f.regular);
    });
  }

  // Déroulement
  y -= 32.1 * k;
  heading(page, ctx, 'DÉROULEMENT DE LA FORMATION', y);
  y -= 18.1 * k;
  text(page, `Date de réalisation →  ${longPeriod(input.startDate, input.endDate)}`, 23.1, y, B, f.bold);
  y -= 17.25 * k;
  text(page, `Durée prévue → ${formatDays(input.days)} (${hoursText(input.hours)})`, 23.1, y, B, f.bold);
  y -= 17.25 * k;
  y = labelValue(page, { text: 'Lieu de réalisation → ', font: f.bold }, { text: input.address || 'CF Réseaux', font: f.regular }, B, y, step);

  // Validation
  y -= 39.6 * k;
  heading(page, ctx, 'VALIDATION DE LA FORMATION', y);
  y -= 16.6 * k;
  const acquired =
    e.avis === 'defavorable'
      ? 'a suivi la formation ; l’ensemble des connaissances et des savoir-faire définis dans les objectifs n’a pas pu être validé.'
      : 'a acquis les connaissances et les savoir-faire définis dans les objectifs.';
  y = richLine(page, f, [
    { t: 'Au cours de ce stage, M./Mme ', font: f.regular },
    { t: t.name + ' ', font: f.bold },
    { t: acquired, font: f.regular },
  ], B, y, step);

  // Observation du formateur
  y -= 38.6 * k;
  heading(page, ctx, 'OBSERVATION DU FORMATEUR', y);
  const obs = isRas(e.autres_attestation) ? 'Rien à signaler' : e.autres_attestation!.trim();
  for (const l of wrapText(f.regular, obs, B, 572 - 23.1)) {
    y -= 18.1 * k;
    text(page, l, 23.1, y, B, f.regular);
    y += (18.1 - 17.3) * k;
  }
  return y;
}

/** Phrase composée de plusieurs polices, avec retour à la ligne. */
function richLine(page: PDFPage | null, f: Fonts, runs: { t: string; font: PDFFont }[], size: number, y: number, step: number) {
  let x = 23.1;
  let cy = y;
  for (const run of runs) {
    const words = keep(run.font, run.t).split(/(\s+)/).filter((w) => w !== '');
    for (const w of words) {
      const width = run.font.widthOfTextAtSize(w, size);
      if (!/^\s+$/.test(w) && x + width > 572) {
        cy -= step;
        x = 23.1;
      }
      if (/^\s+$/.test(w) && x === 23.1) continue;
      text(page, w, x, cy, size, run.font);
      x += width;
    }
  }
  return cy;
}

export async function buildAttestationsPdf(input: FinFormationInput): Promise<Uint8Array> {
  const { ctx, tpl } = await setup('/templates/attestation-fin-formation.pdf');
  ctx.doc.setTitle(`Attestations de fin de formation - ${input.actionTitle}`);
  ctx.doc.setAuthor('CF Réseaux');
  ctx.cachet = await embedCachet(ctx.doc, input.cachet);
  const [bg] = await ctx.doc.embedPdf(tpl, [0]);
  const { f } = ctx;
  for (const t of input.trainees) {
    const e = input.entries[t.id] || {};
    // Taille ajustée si les objectifs sont longs (le bas de page reste fixe).
    let k = 1;
    while (k > 0.72 && attestationBody(null, ctx, input, t, e, k) < 162) k -= 0.04;
    const page = ctx.doc.addPage([W, H]);
    page.drawPage(bg, { x: 0, y: -7.83, width: W, height: H });
    text(page, 'ATTESTATION DE', 18.7, 726.3, 38.7, f.title);
    text(page, 'FIN DE FORMATION', 18.7, 685.9, 38.7, f.title);
    text(page, 'Conformément aux dispositions relatives à la formation professionnelle,', 23.1, 632.5, 16, f.regular);
    text(page, 'il est attesté que :', 23.1, 610.7, 16, f.regular);
    attestationBody(page, ctx, input, t, e, k);
    stamp(page, ctx.cachet, { x: 376.5, y: 58, w: 150, h: 80 });
    text(page, 'SIGNATURE ET CACHET', 395.6, 143.8, 13.65, f.semibold);
    text(page, `Fait à ${input.legal?.city || 'Cuincy'}, le ${faitLe(input.endDate)}`, 23.1, 128.6, 13.88, f.bold);
    text(page, `Par ${input.signataire}`, 23.1, 109.9, 13.88, f.bold);
    text(page, 'Responsable de l’organisme de formation', 23.1, 91.9, 12.88, f.regular);
    footer(page, f, 'ATTESTATION DE RÉALISATION', 'DE L’ACTION DE FORMATION', 206.8, input);
  }
  return ctx.doc.save();
}

// ---------------------------------------------------------------------------
// Appréciation des compétences (2 pages par stagiaire)
// ---------------------------------------------------------------------------

function competencesPage1(page: PDFPage | null, ctx: Ctx, input: FinFormationInput, t: { name: string; cursus?: 'initial' | 'recyclage' | null }, e: AppreciationEntry, k: number) {
  const { f } = ctx;
  const B = 12.5;
  let y = 574.8;
  heading(page, ctx, 'INFORMATIONS RELATIVES À LA FORMATION', y);
  y -= 26.4;
  y = labelValue(page, { text: 'Intitulé de la formation → ', font: f.regular }, { text: input.formationTitle, font: f.regular }, B, y, 17.25);
  y -= 17.25;
  text(page, `Période de réalisation → ${frDate(input.startDate)} au ${frDate(input.endDate)}`, 23.1, y, B, f.regular);
  y -= 17.25;
  y = labelValue(page, { text: 'Lieu de réalisation → ', font: f.regular }, { text: `CF Réseaux - ${input.address || ''}`.replace(/ - $/, ''), font: f.regular }, B, y, 17.25);

  y -= 34.8 * k;
  heading(page, ctx, 'STAGIAIRE', y);
  y -= 26.3 * k;
  text(page, `Nom et Prénom du Stagiaire → ${t.name}`, 23.1, y, B, f.bold);

  y -= 34.8 * k;
  heading(page, ctx, 'ÉVALUATION DES COMPÉTENCES', y);
  y -= 26.4 * k;
  const intro = [
    'Au cours de cette action de formation, le participant a été évalué au travers de mises en',
    'situation, d’exercices pratiques et, le cas échéant, d’apports théoriques, conformément',
    'aux objectifs pédagogiques de la formation.',
  ];
  intro.forEach((l, i) => text(page, l, 23.1, y - i * 17.25 * k, B * Math.min(1, k + 0.08), f.regular));
  y -= 2 * 17.25 * k + 34.5 * k;
  text(page, 'L’évaluation a porté notamment sur :', 23.1, y, B, f.bold);
  const LS = 11.5 * k;
  const items = objectiveLines(
    (t.cursus === 'recyclage' && (input.competencesRecyclage || input.objectifsRecyclage)) || input.competences || input.objectifs || ''
  ).map((o) => o.text);
  if (!items.length) items.push('Compétences à renseigner dans la fiche de la formation.');
  y -= 15.8 * k;
  items.forEach((it, idx) => {
    wrapText(f.regular, `· ${it}`, LS, 572 - 23.1).forEach((l, i) => {
      if (idx || i) y -= 15.75 * k;
      text(page, l, 23.1, y, LS, f.regular);
    });
  });

  y -= 24.4 * k;
  heading(page, ctx, 'CONCLUSION DE L’ÉVALUATION', y);
  y -= 26.4 * k;
  const ok = e.avis === 'favorable' && !e.recommandations;
  checkbox(page, 23.6, y, ok);
  text(page, ' Les compétences attendues ont été démontrées et permettent de considérer que les', 30.6, y, B * Math.min(1, k + 0.06), f.regular);
  y -= 17.2 * k;
  text(page, 'objectifs de la formation sont atteints.', 23.1, y, B * Math.min(1, k + 0.06), f.regular);
  y -= 34.5 * k;
  checkbox(page, 23.6, y, !ok && Boolean(e.avis));
  text(page, ' Des points de vigilance ou des compléments de formation sont recommandés (à', 30.6, y, B * Math.min(1, k + 0.06), f.regular);
  y -= 17.3 * k;
  text(page, 'préciser ci-dessous).', 23.1, y, B * Math.min(1, k + 0.06), f.regular);
  return y;
}

function competencesPage2(page: PDFPage, ctx: Ctx, input: FinFormationInput, e: AppreciationEntry) {
  const { f } = ctx;
  heading(page, ctx, 'OBSERVATIONS DU FORMATEUR', 748.2);
  const obs = [
    !isRas(e.autres_attestation) ? e.autres_attestation!.trim() : '',
    e.avis === 'defavorable' && !isRas(e.ecarts) ? `Écarts constatés : ${e.ecarts!.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n') || 'Rien à signaler';
  let size = 12.5;
  let lines = wrapText(f.regular, obs, size, 572 - 23.1);
  while (size > 8 && lines.length * size * 1.38 > 72) {
    size -= 0.5;
    lines = wrapText(f.regular, obs, size, 572 - 23.1);
  }
  lines.slice(0, Math.floor(72 / (size * 1.38)) || 1).forEach((l, i) => text(page, l, 23.1, 724 - i * size * 1.38, size, f.regular));

  heading(page, ctx, 'AVIS DU FORMATEUR', 652.5);
  text(page, 'À l’issue de l’évaluation réalisée pendant la formation, l’organisme de formation émet l’avis', 23.1, 626.1, 12.5, f.regular);
  text(page, 'suivant :', 23.1, 608.9, 12.5, f.regular);
  const opts: [string, boolean, number][] = [
    [' Avis favorable.', e.avis === 'favorable' && !e.recommandations, 574.4],
    [' Avis favorable avec recommandations.', e.avis === 'favorable' && Boolean(e.recommandations), 539.9],
    [' Avis défavorable.', e.avis === 'defavorable', 505.3],
  ];
  for (const [label, on, y] of opts) {
    checkbox(page, 23.6, y, on);
    text(page, label, 30.6, y, 12.5, f.bold);
  }
  text(page, 'Le présent avis est formulé au regard des compétences observées au cours de la', 23.1, 470.8, 12.5, f.regular);
  text(page, 'formation. Il appartient à l’employeur de prendre les décisions relevant de l’autorisation', 23.1, 453.6, 12.5, f.regular);
  text(page, 'd’exercice, de l’habilitation ou de toute autre disposition applicable.', 23.1, 436.3, 12.5, f.regular);

  stamp(page, ctx.cachet, { x: 378.6, y: 266.5, w: 157, h: 105 });
  text(page, 'SIGNATURE ET CACHET', 384.6, 383.0, 12.88, f.bold);
  text(page, `Fait à ${input.legal?.city || 'Cuincy'}, le ${faitLe(input.endDate)}`, 23.1, 382.3, 13.88, f.bold);
  text(page, `Par ${input.signataire}`, 23.1, 363.6, 13.88, f.bold);
  text(page, 'Responsable de l’organisme de formation', 23.1, 345.6, 12.88, f.regular);
}

export async function buildCompetencesPdf(input: FinFormationInput): Promise<Uint8Array> {
  const { ctx, tpl } = await setup('/templates/appreciation-competences.pdf');
  ctx.doc.setTitle(`Appréciations des compétences - ${input.actionTitle}`);
  ctx.doc.setAuthor('CF Réseaux');
  ctx.cachet = await embedCachet(ctx.doc, input.cachet);
  const [bg1, bg2] = await ctx.doc.embedPdf(tpl, [0, 1]);
  const { f } = ctx;
  for (const t of input.trainees) {
    const e = input.entries[t.id] || {};
    let k = 1;
    while (k > 0.7 && competencesPage1(null, ctx, input, t, e, k) < 70) k -= 0.03;

    const p1 = ctx.doc.addPage([W, H]);
    p1.drawPage(bg1, { x: 0, y: -7.83, width: W, height: H });
    text(p1, 'PAGE 1', 546.7, 803.7, 7.89, f.bold);
    text(p1, 'APPRÉCIATION DES', 18.7, 726.3, 38.7, f.title);
    text(p1, 'COMPÉTENCES', 18.7, 685.9, 38.7, f.title);
    text(p1, 'CF Réseaux est agréé par le Comité des Travaux Sous Tension sous les', 23.1, 632.5, 16, f.regular);
    text(p1, `N° d’agréments → Agrément N° ${input.agrement}`, 23.1, 610.7, 16, f.regular);
    competencesPage1(p1, ctx, input, t, e, k);
    footer(p1, f, 'FICHE D’APPRÉCIATION DES', 'COMPÉTENCES PROFESSIONNELLES', 176.8, input);

    const p2 = ctx.doc.addPage([W, H]);
    p2.drawPage(bg2, { x: 0, y: -7.83, width: W, height: H });
    text(p2, 'PAGE 2', 546.7, 803.7, 7.89, f.bold);
    competencesPage2(p2, ctx, input, e);
    footer(p2, f, 'FICHE D’APPRÉCIATION DES', 'COMPÉTENCES PROFESSIONNELLES', 176.8, input);
  }
  return ctx.doc.save();
}
