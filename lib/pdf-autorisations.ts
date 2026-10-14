'use client';

import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { INK, RED, keep, fitSize } from '@/lib/pdf-appreciation';
import { AUTH_KIND, type Authorization } from '@/lib/autorisations';

/**
 * Autorisations remplies sur les modèles Canva d'origine (droit à l'image,
 * remise des livrets, vêtements TST) : les valeurs saisies en ligne sont
 * posées sur les pointillés, avec la signature du stagiaire et le cachet
 * de CF Réseaux.
 */

/** Document à imprimer : autorisation stagiaire ou document salarié (droit à l'image, remise de matériel). */
export type PdfAuth = Pick<Authorization, 'accepted' | 'signature' | 'city' | 'returned_at'> & {
  kind: Authorization['kind'] | 'materiel';
  data: Record<string, any>;
  signed_at: string;
  return_signature?: string | null;
};
export type AuthPdfItem = { auth: PdfAuth; traineeName: string };

const MATERIEL_TEMPLATE = '/templates/remise-materiel.pdf';
const templateOf = (k: PdfAuth['kind']) => (k === 'materiel' ? MATERIEL_TEMPLATE : AUTH_KIND[k].template);
const labelOf = (k: PdfAuth['kind']) => (k === 'materiel' ? 'Attestation de remise de matériel' : AUTH_KIND[k].label);

type Ctx = { doc: PDFDocument; value: PDFFont; cachet: PDFImage | null };

const WHITE = rgb(1, 1, 1);
const SIZE = 15;
/** Décalage mesuré entre les coordonnées relevées et le rendu réel des modèles Canva. */
const DY = 0;

async function embedDataUrl(doc: PDFDocument, dataUrl: string | null | undefined): Promise<PDFImage | null> {
  if (!dataUrl) return null;
  try {
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1] || ''), (c) => c.charCodeAt(0));
    return dataUrl.startsWith('data:image/png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

/** Valeur posée sur une ligne pointillée (x, ligne de base des pointillés, largeur dispo). */
function put(page: PDFPage, ctx: Ctx, text: string | null | undefined, x: number, base: number, width: number, size = SIZE) {
  const t = keep(ctx.value, (text || '').replace(/\s*\n\s*/g, ', ').trim());
  if (!t) return;
  const s = fitSize(ctx.value, t, size, width, 7.5);
  page.drawText(t, { x, y: base + DY + 4, size: s, font: ctx.value, color: INK });
}

/** Efface des pointillés courts (« ... veste ») puis écrit la valeur. */
function over(page: PDFPage, ctx: Ctx, text: string, x: number, base: number, w: number, size = SIZE) {
  page.drawRectangle({ x: x - 1, y: base + DY - 4, width: w + 2, height: size + 5, color: WHITE });
  page.drawText(keep(ctx.value, text), { x, y: base + DY, size, font: ctx.value, color: INK });
}

/** Coche rouge dans une case ☐ (coin bas gauche de la case). */
function check(page: PDFPage, x: number, y0: number) {
  const y = y0 + DY;
  page.drawLine({ start: { x: x + 1.5, y: y + 5 }, end: { x: x + 4.5, y: y + 1.5 }, thickness: 1.8, color: RED });
  page.drawLine({ start: { x: x + 4.5, y: y + 1.5 }, end: { x: x + 10.5, y: y + 10.5 }, thickness: 1.8, color: RED });
}

function image(page: PDFPage, img: PDFImage | null, x: number, top: number, maxW: number, maxH: number) {
  if (!img) return;
  const k = Math.min(maxW / img.width, maxH / img.height);
  page.drawImage(img, { x, y: top + DY - img.height * k, width: img.width * k, height: img.height * k });
}

const parts = (iso: string) => {
  const d = new Date(iso);
  const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', ...o });
  return { full: f({ day: '2-digit', month: '2-digit', year: 'numeric' }), d: f({ day: '2-digit' }), m: f({ month: '2-digit' }), y: f({ year: 'numeric' }) };
};

/** Ligne de base réelle d'une ligne du modèle (y bas relevé + 0,74 × taille relevée). */
const L = (y0: number, size: number) => y0 + 0.74 * size;

async function fill(page: PDFPage, ctx: Ctx, item: AuthPdfItem) {
  const a = item.auth;
  const d = a.data || {};
  const sig = await embedDataUrl(ctx.doc, a.signature);
  const date = parts(a.signed_at);
  const city = a.city || 'Cuincy';

  if (a.kind === 'image') {
    put(page, ctx, item.traineeName, 181, L(560.5, 18.8), 338);
    put(page, ctx, d.address, 142, L(528.2, 18.8), 377);
    put(page, ctx, city, 74, L(130.6, 16), 242, 13);
    put(page, ctx, date.full, 45, L(108.9, 16), 176, 13);
    if (!a.accepted) {
      // Refus : encadré rouge bien visible à côté de la signature.
      page.drawRectangle({ x: 330, y: 104, width: 241, height: 40, color: RED });
      page.drawText(keep(ctx.value, 'REFUS DU STAGIAIRE'), { x: 340, y: 128, size: 11, font: ctx.value, color: WHITE });
      page.drawText(keep(ctx.value, 'n’autorise pas l’utilisation de son image'), { x: 340, y: 113, size: 9.5, font: ctx.value, color: WHITE });
    }
    image(page, sig, 26, L(78.3, 15.8) - 8, 220, 68);
    return;
  }

  if (a.kind === 'livret') {
    put(page, ctx, item.traineeName, 172, L(560.5, 18.8), 395);
    put(page, ctx, d.company, 136, L(528.2, 18.8), 432);
    if (d.memoformat) check(page, 24.5, L(445.8, 17) - 1);
    if (d.livret_pv) check(page, 24.5, L(425.5, 17) - 1);
    if (d.autres) {
      check(page, 24.5, L(405.3, 17) - 1);
      put(page, ctx, d.autres, 233, L(403.7, 17), 344, 12);
    }
    put(page, ctx, city, 74, L(292.1, 16), 230, 13);
    over(page, ctx, `${date.d}  /  ${date.m}  /  ${date.y}`, 41.5, L(270.3, 16), 128, 13);
    image(page, sig, 26, L(242.1, 15.8) - 8, 230, 72);
    image(page, ctx.cachet, 26, L(149, 15.8) - 8, 240, 118);
    if (a.returned_at) {
      const r = parts(a.returned_at);
      over(page, ctx, `${r.d} / ${r.m} / ${r.y}`, 380, L(93, 8.3), 70, 7.5);
    }
    return;
  }

  if (a.kind === 'materiel') {
    put(page, ctx, item.traineeName, 181, L(560.5, 18.8), 338);
    put(page, ctx, d.address, 142, L(528.2, 18.8), 377);
    // Colonne gauche puis droite : case cochée, quantité sur les « ... ».
    const rows: [string, number, number, boolean][] = [
      ['ordinateur', 24, 447.3, true], ['clavier', 24, 429.3, true], ['souris', 24, 411.3, true], ['ecran', 24, 393.3, false],
      ['chaussures', 251.4, 447, false], ['casque', 251.4, 429, false], ['manteau', 251.4, 411, false], ['telephone', 251.4, 393, true],
    ];
    for (const [key, x, y0, fixed] of rows) {
      const n = Number(d[key]) || 0;
      if (!n) continue;
      check(page, x + 0.5, L(y0, 17) - 1);
      if (!fixed) over(page, ctx, String(n), x + 14.5, L(y0, 17) - 0.3, 12, 13);
    }
    put(page, ctx, city, 74, L(219.4, 16), 230, 13);
    over(page, ctx, `${date.d}  /  ${date.m}  /  ${date.y}`, 41.5, L(197.6, 16), 128, 13);
    image(page, sig, 26, L(169.3, 15.8) - 8, 230, 50);
    image(page, ctx.cachet, 26, L(90.7, 15.8) - 8, 240, 74);
    if (a.returned_at) {
      const r = parts(a.returned_at);
      over(page, ctx, `${r.d} / ${r.m} / ${r.y}`, 409, L(80.9, 7), 60, 7);
      image(page, await embedDataUrl(ctx.doc, a.return_signature), 420, L(52.8, 7) + 14, 120, 22);
      image(page, ctx.cachet, 430, L(24.6, 7) + 14, 110, 22);
    }
    return;
  }

  // Vêtements TST
  put(page, ctx, item.traineeName, 181, L(560.5, 18.8), 338);
  put(page, ctx, d.address, 142, L(528.2, 18.8), 377);
  over(page, ctx, String(d.vestes ?? 0), 53, L(445.7, 17), 13, 15);
  over(page, ctx, String(d.pantalons ?? 0), 53, L(427.7, 17), 13, 15);
  put(page, ctx, city, 74, L(211, 16), 242, 13);
  put(page, ctx, date.full, 45, L(189.2, 16), 176, 13);
  image(page, sig, 26, L(160.9, 15.8) - 8, 230, 54);
  image(page, ctx.cachet, 26, L(85.4, 15.8) - 8, 200, 74);
  if (a.returned_at) {
    page.drawText(keep(ctx.value, `Vêtements restitués le ${parts(a.returned_at).full}`), { x: 330, y: 100, size: 10, font: ctx.value, color: INK });
  }
}

/** Une ou plusieurs autorisations (une page chacune) dans un même PDF. */
export async function buildAuthorizationsPdf(items: AuthPdfItem[], cachetDataUrl: string | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(items.length === 1 ? `${labelOf(items[0].auth.kind)} – ${items[0].traineeName}` : 'Autorisations');
  doc.setAuthor('CF Réseaux');
  const fontBytes = await fetch('/fonts/SpaceGrotesk-SemiBold.ttf').then((r) => {
    if (!r.ok) throw new Error('Police introuvable.');
    return r.arrayBuffer();
  });
  const ctx: Ctx = { doc, value: await doc.embedFont(fontBytes, { subset: true }), cachet: await embedDataUrl(doc, cachetDataUrl) };
  const templates = new Map<string, PDFDocument>();
  for (const item of items) {
    const path = templateOf(item.auth.kind);
    if (!templates.has(path)) {
      const bytes = await fetch(path).then((r) => {
        if (!r.ok) throw new Error('Modèle introuvable.');
        return r.arrayBuffer();
      });
      templates.set(path, await PDFDocument.load(bytes));
    }
    // Modèle posé en fond (embedPage isole son état graphique : nos coordonnées restent exactes).
    const src = templates.get(path)!.getPage(0);
    const { width, height } = src.getSize();
    const bg = await doc.embedPage(src);
    const page = doc.addPage([width, height]);
    page.drawPage(bg, { x: 0, y: 0, width, height });
    await fill(page, ctx, item);
  }
  return doc.save();
}
