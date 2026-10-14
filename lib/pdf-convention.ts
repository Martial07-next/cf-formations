'use client';

import { PDFDocument, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib';
import { C, LOGO_RATIO, clean, wrap, loadBrand, legalLine, type Brand, type Legal } from '@/lib/pdf-brand';
import { frShort, type Convention } from '@/lib/poec';

/**
 * Convention de stage tripartite POEC, à la charte CF Réseaux (même mise en
 * page que le modèle Word : bandeau vert nuit, cartes A / B / C, articles
 * numérotés, page de signatures), remplie avec les informations saisies en
 * ligne et les signatures de chaque partie.
 */

export type ConventionInput = {
  convention: Convention;
  traineeName: string;
  periodStart: string;
  periodEnd: string;
  programTitle: string;
  director: { name: string; title: string };
  legal: Legal | null;
};

const W = 595.32;
const H = 841.92;
const X = 51;
const R = 544.5;
const ADDRESS = '20 rue du Champ de Tir, 59553 Cuincy';
const LABEL = 'Convention de stage tripartite · POEC';

/** Paragraphe justifié (dernière ligne alignée à gauche). Renvoie le y suivant. */
function para(page: PDFPage, font: PDFFont, text: string, x: number, y: number, width: number, size = 9.5, lead = 14.5) {
  for (const p of clean(font, text).split('\n')) {
    const lines = wrap(font, p, size, width);
    lines.forEach((line, i) => {
      const words = line.split(' ');
      const last = i === lines.length - 1;
      if (last || words.length < 2) {
        page.drawText(line, { x, y, size, font, color: C.night });
      } else {
        const gap = (width - words.reduce((n, w) => n + font.widthOfTextAtSize(w, size), 0)) / (words.length - 1);
        let cx = x;
        for (const w of words) {
          page.drawText(w, { x: cx, y, size, font, color: C.night });
          cx += font.widthOfTextAtSize(w, size) + gap;
        }
      }
      y -= lead;
    });
  }
  return y;
}

/** « Libellé : valeur » sur une ligne pointillée (valeur vide = ligne à remplir). Renvoie le y suivant. */
function field(page: PDFPage, b: Brand, label: string, value: string | null | undefined, x: number, y: number, right: number, size = 9.5, lead = 19.6, minLines = 1, maxLines = 3) {
  const l = clean(b.bold, label.endsWith(' le') ? `${label} ` : `${label} : `);
  page.drawText(l, { x, y, size, font: b.bold, color: C.night });
  const vx = x + b.bold.widthOfTextAtSize(l, size);
  const lines = (value?.trim() ? wrap(b.regular, value.trim().replace(/\s*\n\s*/g, ', '), size, right - vx) : ['']).slice(0, maxLines);
  while (lines.length < minLines) lines.push('');
  lines.forEach((line, i) => {
    const lx = i === 0 ? vx : x;
    if (line) page.drawText(line, { x: i === 0 ? vx + 2 : x, y: y - i * lead, size, font: b.regular, color: C.night });
    page.drawLine({ start: { x: lx, y: y - i * lead - 3 }, end: { x: right, y: y - i * lead - 3 }, thickness: 0.4, color: C.muted, dashArray: [1, 1.6] });
  });
  return y - lines.length * lead;
}

/** Petite étiquette à fond coloré (« ENTRE LES SOUSSIGNÉS »). */
function tag(page: PDFPage, b: Brand, text: string, x: number, y: number, color = C.green) {
  const t = clean(b.bold, text).split('').join(' ');
  const w = b.bold.widthOfTextAtSize(t, 7.2);
  page.drawRectangle({ x, y: y - 2.2, width: w + 4, height: 10.2, color });
  page.drawText(t, { x: x + 2, y, size: 7.2, font: b.bold, color: C.night });
}

/** Carte partie (A, B, C) : fond crème + barre latérale. */
function partyCard(page: PDFPage, b: Brand, letter: string, title: string, top: number, height: number, accent = C.green) {
  page.drawRectangle({ x: X, y: top - height, width: R - X, height, color: C.cream });
  page.drawRectangle({ x: X, y: top - height, width: 5.5, height, color: accent });
  page.drawText(letter, { x: 71.5, y: top - 22, size: 9, font: b.title, color: accent === C.yellow ? C.night : C.green });
  page.drawText(clean(b.title, title), { x: 71.5 + b.title.widthOfTextAtSize(`${letter} `, 9), y: top - 22, size: 9, font: b.title, color: C.night });
  return top - 39;
}

/** Article numéroté (« 01  Objet de la convention »). */
function article(page: PDFPage, b: Brand, num: string, title: string, y: number) {
  page.drawRectangle({ x: X, y: y - 2.7, width: 19.7, height: 11.5, color: C.night });
  page.drawText(num, { x: X + (19.7 - b.title.widthOfTextAtSize(num, 7.5)) / 2, y: y - 0.3, size: 7.5, font: b.title, color: C.green });
  page.drawText(clean(b.bold, title), { x: X + 28, y: y - 0.5, size: 11, font: b.bold, color: C.night });
  return y - 18.3;
}

function footer(page: PDFPage, b: Brand, n: number, total: number, legal: string) {
  page.drawRectangle({ x: 49.6, y: 38.9, width: 496.3, height: 1.4, color: C.green });
  if (b.logoDark) page.drawImage(b.logoDark, { x: X, y: 23.2, width: 60.3, height: 60.3 / LOGO_RATIO });
  page.drawText(ADDRESS, { x: 116, y: 24.5, size: 7.6, font: b.regular, color: C.muted });
  const num = `${n} / ${total}`;
  const nw = b.bold.widthOfTextAtSize(num, 7.6);
  page.drawText(num, { x: R - nw, y: 24.5, size: 7.6, font: b.bold, color: C.night });
  page.drawText(LABEL, { x: R - nw - 8 - b.regular.widthOfTextAtSize(LABEL, 7.6), y: 24.5, size: 7.6, font: b.regular, color: C.muted });
  if (legal) {
    wrap(b.regular, legal, 5.8, R - X)
      .slice(0, 2)
      .forEach((l, i) => page.drawText(l, { x: (W - b.regular.widthOfTextAtSize(l, 5.8)) / 2, y: 13 - i * 7, size: 5.8, font: b.regular, color: C.muted }));
  }
}

/** Fond de page légèrement crème, comme le modèle (le blanc reste dominant). */
function newPage(doc: PDFDocument) {
  return doc.addPage([W, H]);
}

async function embedSig(doc: PDFDocument, data: string | null): Promise<PDFImage | null> {
  if (!data) return null;
  try {
    return await doc.embedPng(data);
  } catch {
    return null;
  }
}

/** Signature posée juste sous « Signature : » (top = haut de la zone). */
function drawSig(page: PDFPage, img: PDFImage | null, x: number, top: number, maxW: number, maxH: number) {
  if (!img) return;
  const k = Math.min(maxW / img.width, maxH / img.height, 0.75);
  page.drawImage(img, { x, y: top - img.height * k, width: img.width * k, height: img.height * k });
}

const dateOf = (iso: string | null) => (iso ? frShort(new Date(iso).toISOString().slice(0, 10)) : '');

async function drawConvention(doc: PDFDocument, b: Brand, input: ConventionInput) {
  const c = input.convention;
  const legal = legalLine(input.legal);

  // ---------- Page 1 : en-tête + parties ----------
  const p1 = newPage(doc);
  p1.drawRectangle({ x: X, y: 607.8, width: R - X, height: 186.6, color: C.night });
  if (b.logo) p1.drawImage(b.logo, { x: 74, y: 752.4, width: 130, height: 130 / LOGO_RATIO });
  p1.drawText('CONVENTION', { x: 74.1, y: 706.4, size: 23, font: b.title, color: C.cream });
  p1.drawText('DE STAGE', { x: 74.1, y: 679.4, size: 23, font: b.title, color: C.cream });
  p1.drawText('TRIPARTITE', { x: 74.1, y: 652.3, size: 23, font: b.title, color: C.green });
  p1.drawText(clean(b.regular, 'POEC · Période d’application en entreprise · Financement France Travail'), {
    x: 74.1, y: 627.8, size: 9, font: b.regular, color: C.grey,
  });
  if (input.programTitle) {
    const t = wrap(b.bold, input.programTitle, 8, 150).slice(0, 3);
    t.forEach((l, i) => p1.drawText(l, { x: R - 16 - b.bold.widthOfTextAtSize(l, 8), y: 772 - i * 10.5, size: 8, font: b.bold, color: C.green }));
  }
  // Filet dégradé jaune → vert sous le bandeau
  for (let i = 0; i < 60; i++) {
    const t = i / 59;
    p1.drawRectangle({
      x: X + ((R - X) * i) / 60, y: 595.7, width: (R - X) / 60 + 0.4, height: 3,
      color: { type: 'RGB', red: 1 + (8 / 255 - 1) * t, green: 242 / 255 + (250 / 255 - 242 / 255) * t, blue: 0 + (100 / 255) * t } as any,
    });
  }

  tag(p1, b, 'ENTRE LES SOUSSIGNÉS', X, 572.6);

  // A — organisme de formation
  let y = partyCard(p1, b, 'A', 'L’ORGANISME DE FORMATION', 562.7, 101);
  p1.drawText(clean(b.bold, 'Organisme : '), { x: 71.5, y: 525.8, size: 9.5, font: b.bold, color: C.night });
  p1.drawText('CF Réseaux', { x: 71.5 + b.bold.widthOfTextAtSize('Organisme : ', 9.5), y: 525.8, size: 9.5, font: b.regular, color: C.night });
  p1.drawText('Adresse : ', { x: 71.5, y: 507.7, size: 9.5, font: b.bold, color: C.night });
  p1.drawText(ADDRESS, { x: 71.5 + b.bold.widthOfTextAtSize('Adresse : ', 9.5), y: 507.7, size: 9.5, font: b.regular, color: C.night });
  const rep = clean(b.regular, `${input.director.name}, ${input.director.title}`);
  p1.drawText(clean(b.bold, 'Représenté par : '), { x: 71.5, y: 489.5, size: 9.5, font: b.bold, color: C.night });
  p1.drawText(rep, { x: 71.5 + b.bold.widthOfTextAtSize(clean(b.bold, 'Représenté par : '), 9.5), y: 489.5, size: 9.5, font: b.regular, color: C.night });
  p1.drawText(clean(b.regular, 'Ci-après dénommé « l’organisme de formation »,'), { x: 70.7, y: 471.7, size: 8.5, font: b.regular, color: C.muted });
  void y;

  // B — entreprise d'accueil
  y = partyCard(p1, b, 'B', 'L’ENTREPRISE D’ACCUEIL', 439.9, 143.9);
  y = field(p1, b, 'Raison sociale', c.company_name, 71.5, 403, 528, 9.5, 19.6, 1, 1);
  // Adresse sur deux lignes, comme le modèle.
  y = field(p1, b, 'Adresse', c.company_address, 71.5, y, 528, 9.5, 19.6, 2, 2);
  y = field(p1, b, 'Représentée par', c.company_rep, 71.5, y, 528, 9.5, 19.6, 1, 1);
  y = field(p1, b, 'Fonction', c.company_rep_role, 71.5, y, 528, 9.5, 19.6, 1, 1);
  p1.drawText(clean(b.regular, 'Ci-après dénommée « l’entreprise d’accueil »,'), { x: 70.7, y: 306.1, size: 8.5, font: b.regular, color: C.muted });

  // C — stagiaire
  partyCard(p1, b, 'C', 'LE STAGIAIRE', 274.3, 120.6, C.yellow);
  y = field(p1, b, 'Nom et prénom', input.traineeName, 71.5, 237.5, 528, 9.5, 19.6, 1, 1);
  field(p1, b, 'Adresse', c.trainee_address, 71.5, y, 528, 9.5, 19.6, 2, 2);
  p1.drawText(clean(b.regular, 'Inscrit dans le cadre d’une POEC financée par France Travail'), { x: 71.5, y: 178.6, size: 9.5, font: b.regular, color: C.night });
  p1.drawText(clean(b.regular, 'Ci-après dénommé « le stagiaire »,'), { x: 70.7, y: 163.7, size: 8.5, font: b.regular, color: C.muted });

  y = article(p1, b, '01', 'Objet de la convention', 126.8);
  para(p1, b.regular,
    'La présente convention a pour objet de définir les conditions dans lesquelles le stagiaire effectue une période d’application en entreprise dans le cadre d’une Préparation Opérationnelle à l’Emploi Collective (POEC) suivie auprès de CF Réseaux et financée par France Travail.',
    X, y, R - X);

  // ---------- Page 2 : articles 02 à 10 ----------
  const p2 = newPage(doc);
  y = article(p2, b, '02', 'Période et durée du stage', 783.1);
  y = para(p2, b.regular,
    `Le stage se déroule du ${frShort(input.periodStart)} au ${frShort(input.periodEnd)}, hors week-ends. La durée hebdomadaire est de 35 heures, réparties selon les horaires de l’entreprise d’accueil. Le stage est non rémunéré.`,
    X, y, R - X);
  y = article(p2, b, '03', 'Objectifs et missions du stage', y - 14);
  y = para(p2, b.regular,
    'Le stage vise à permettre au stagiaire de mettre en pratique les compétences acquises lors de la formation CF Réseaux. Les missions confiées au stagiaire seront conformes au projet pédagogique de la formation et ne devront pas correspondre à un poste permanent de l’entreprise.',
    X, y, R - X);
  if (c.missions?.trim()) {
    p2.drawText('Missions prévues :', { x: X, y: y - 2, size: 9.5, font: b.bold, color: C.night });
    y = para(p2, b.regular, c.missions.trim(), X, y - 16.5, R - X);
  }
  y = article(p2, b, '04', 'Encadrement du stage', y - 14);
  p2.drawText('Le stagiaire est suivi par :', { x: X, y, size: 9.5, font: b.regular, color: C.night });
  y -= 18.9;
  const tutor = [c.company_tutor, c.company_tutor_contact].filter((v) => v?.trim()).join(' · ');
  for (const [label, value] of [
    ['Un tuteur au sein de l’entreprise d’accueil', tutor],
    ['Un tuteur pédagogique désigné par CF Réseaux', c.pedagogical_tutor || ''],
  ] as const) {
    p2.drawRectangle({ x: 63, y: y + 1.5, width: 4, height: 4, color: C.green });
    y = field(p2, b, label, value, 72, y, R, 9.5, 18.2);
  }
  const articles: [string, string, string][] = [
    ['05', 'Statut et protection du stagiaire', 'Le stagiaire conserve son statut de stagiaire de la formation professionnelle tout au long du stage. Il ne perçoit pas de gratification. Le stagiaire reste couvert par la protection sociale liée à sa formation et par l’assurance responsabilité civile souscrite par CF Réseaux.'],
    ['06', 'Références légales', 'La présente convention est établie conformément aux articles L124-1 à L124-20 du Code de l’éducation, ainsi qu’aux dispositions relatives aux stages en milieu professionnel prévues par le Code du travail. Le stage ne peut avoir pour objet l’exécution d’une tâche régulière correspondant à un emploi permanent.'],
    ['07', 'Confidentialité', 'Le stagiaire est tenu à la plus stricte confidentialité sur toutes les informations dont il pourrait avoir connaissance au sein de l’entreprise. Cette obligation demeure après la fin du stage.'],
    ['08', 'Assurance et responsabilité', 'CF Réseaux atteste avoir souscrit une assurance couvrant la responsabilité civile de ses stagiaires. L’entreprise d’accueil s’engage également à garantir les conditions de sécurité et d’hygiène prévues par la législation en vigueur.'],
    ['09', 'Absences, discipline et sécurité', 'En cas d’absence, le stagiaire en informe immédiatement l’entreprise et CF Réseaux. Le stagiaire est soumis au règlement intérieur de l’entreprise d’accueil pour tout ce qui concerne la discipline et la sécurité.'],
    ['10', 'Fin du stage', 'À l’issue du stage, une attestation de stage est remise au stagiaire. Le tuteur en entreprise transmet une évaluation des compétences acquises à CF Réseaux.'],
  ];
  let page2 = p2;
  const extraPages: PDFPage[] = [];
  for (const [num, title, text] of articles) {
    const need = 18.3 + wrap(b.regular, text, 9.5, R - X).length * 14.5 + 14;
    if (y - need < 60) {
      page2 = newPage(doc);
      extraPages.push(page2);
      y = 783.1 + 14;
    }
    y = article(page2, b, num, title, y - 14);
    y = para(page2, b.regular, text, X, y, R - X);
  }

  // ---------- Page 3 : signatures ----------
  const p3 = newPage(doc);
  tag(p3, b, 'ENGAGEMENT DES PARTIES', X, 772, C.yellow);
  p3.drawText('Signatures', { x: X, y: 748.8, size: 15, font: b.title, color: C.night });
  para(p3, b.regular, 'Convention établie en quatre exemplaires originaux : CF Réseaux, entreprise d’accueil, stagiaire, France Travail.', X, 732.6, R - X, 9.5, 12.1);

  const [cfSig, coSig, trSig, ftSig] = await Promise.all([
    embedSig(doc, c.cf_signature), embedSig(doc, c.company_signature), embedSig(doc, c.trainee_signature), embedSig(doc, c.ft_signature),
  ]);
  const boxW = 243;
  const boxes = [
    { x: X, top: 702, h: 302, title: 'POUR CF RÉSEAUX', accent: true },
    { x: R - boxW, top: 702, h: 302, title: 'POUR L’ENTREPRISE D’ACCUEIL', accent: false },
    { x: X, top: 388, h: 290, title: 'POUR LE STAGIAIRE', accent: false },
    { x: R - boxW, top: 388, h: 290, title: 'POUR FRANCE TRAVAIL (le cas échéant)', accent: false },
  ];
  for (const bx of boxes) {
    p3.drawRectangle({ x: bx.x, y: bx.top - bx.h, width: boxW, height: bx.h, color: C.cream, borderColor: C.grey, borderWidth: 0.8 });
    if (bx.accent) p3.drawRectangle({ x: bx.x, y: bx.top - 4, width: boxW, height: 4, color: C.green });
    wrap(b.title, bx.title, 8.5, boxW - 28).forEach((l, i) =>
      p3.drawText(l, { x: bx.x + 13.5, y: bx.top - 19.2 - i * 10, size: 8.5, font: b.title, color: C.night })
    );
  }
  const right = (bx: (typeof boxes)[number]) => bx.x + boxW - 13;
  // CF Réseaux
  let bx = boxes[0];
  const dirName = input.director.name;
  p3.drawText(clean(b.bold, c.cf_signer || dirName), { x: bx.x + 13.5, y: 664.7, size: 9.5, font: b.bold, color: C.night });
  p3.drawText(clean(b.regular, input.director.title.replace(/ de CF Réseaux$/i, '')), { x: bx.x + 13.5, y: 651.5, size: 9.5, font: b.regular, color: C.muted });
  field(p3, b, `Fait à ${input.legal?.city || 'Cuincy'}, le`, dateOf(c.cf_signed_at), bx.x + 13.5, 634.8, right(bx));
  p3.drawText('Signature :', { x: bx.x + 13.5, y: 613.7, size: 9.5, font: b.bold, color: C.night });
  drawSig(p3, cfSig, bx.x + 18, 605, boxW - 36, 120);
  // Entreprise
  bx = boxes[1];
  y = field(p3, b, 'Nom', c.company_signer || c.company_rep, bx.x + 13.5, 664.7, right(bx));
  y = field(p3, b, 'Fonction', c.company_signer_role || c.company_rep_role, bx.x + 13.5, y, right(bx));
  y = field(p3, b, 'Fait à', c.company_signed_at ? c.company_city : '', bx.x + 13.5, y, right(bx));
  y = field(p3, b, 'Le', dateOf(c.company_signed_at), bx.x + 13.5, y, right(bx));
  p3.drawText('Signature :', { x: bx.x + 13.5, y: y - 1.5, size: 9.5, font: b.bold, color: C.night });
  drawSig(p3, coSig, bx.x + 18, y - 10, boxW - 36, 120);
  // Stagiaire
  bx = boxes[2];
  y = field(p3, b, 'Nom', input.traineeName, bx.x + 13.5, 350.7, right(bx));
  y = field(p3, b, 'Fait à', c.trainee_signed_at ? c.trainee_city : '', bx.x + 13.5, y, right(bx));
  y = field(p3, b, 'Le', dateOf(c.trainee_signed_at), bx.x + 13.5, y, right(bx));
  p3.drawText('Signature :', { x: bx.x + 13.5, y: y - 1.5, size: 9.5, font: b.bold, color: C.night });
  drawSig(p3, trSig, bx.x + 18, y - 10, boxW - 36, 120);
  // France Travail
  bx = boxes[3];
  y = field(p3, b, 'Nom et cachet', c.ft_signer, bx.x + 13.5, 340.7, right(bx));
  if (c.ft_signed_at) y = field(p3, b, 'Le', dateOf(c.ft_signed_at), bx.x + 13.5, y, right(bx));
  p3.drawText('Signature :', { x: bx.x + 13.5, y: y - 1.5, size: 9.5, font: b.bold, color: C.night });
  drawSig(p3, ftSig, bx.x + 18, y - 10, boxW - 36, 120);

  const pages = [p1, p2, ...extraPages, p3];
  pages.forEach((p, i) => footer(p, b, i + 1, pages.length, legal));
}

/** Une ou plusieurs conventions dans un même PDF. */
export async function buildConventionsPdf(inputs: ConventionInput[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(inputs.length === 1 ? `Convention de stage – ${inputs[0].traineeName}` : 'Conventions de stage POEC');
  doc.setAuthor('CF Réseaux');
  const b = await loadBrand(doc);
  for (const input of inputs) await drawConvention(doc, b, input);
  return doc.save();
}
