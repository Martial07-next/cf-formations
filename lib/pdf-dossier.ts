'use client';

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { HALF_LABEL, type Slot, type SignatureRow } from '@/lib/dossier';

/**
 * Génération des PDF du dossier, dans le navigateur (aucune limite de taille
 * côté serveur) : feuille d'émargement, documents remplis, dossier complet.
 */

/** Marque posée sur un PDF : coordonnées en fraction de la page (origine en haut à gauche). */
export type Mark =
  | { id: string; kind: 'text'; page: number; x: number; y: number; text: string; size: number }
  | { id: string; kind: 'check'; page: number; x: number; y: number; size: number }
  | { id: string; kind: 'signature'; page: number; x: number; y: number; w: number; h: number; image: string };

export type EntryData = { fields?: Record<string, string | boolean>; marks?: Mark[] };

/** Texte compatible avec la police standard (caractères inconnus remplacés). */
function safe(font: PDFFont, text: string) {
  const map: Record<string, string> = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', ' ': ' ', ' ': ' ', '…': '...', 'œ': 'oe', 'Œ': 'OE' };
  let out = '';
  for (const ch of text) {
    const c = map[ch] ?? ch;
    if (c === '\n') {
      out += c;
      continue;
    }
    if (c === '\r') continue;
    try {
      font.encodeText(c);
      out += c;
    } catch {
      out += '?';
    }
  }
  return out;
}

/** 08:00 → 8h, 12:30 → 12h30 (en-têtes compacts). */
const hh = (t: string) => t.replace(/^0/, '').replace(':00', 'h').replace(':', 'h');
const frDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const dayName = (iso: string) => ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'][new Date(iso + 'T00:00:00Z').getUTCDay()];

async function embedSignature(doc: PDFDocument, dataUrl: string) {
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1] || ''), (c) => c.charCodeAt(0));
  return doc.embedPng(bytes);
}

export type EmargementInput = {
  title: string;
  period: string;
  room: string | null;
  trainerName: string | null;
  slots: Slot[];
  trainees: { id: string; name: string; company: string | null }[];
  /** Stagiaires attendus par demi-journée (modules), clé « jour|demi ». */
  expected: Record<string, string[]>;
  signatures: SignatureRow[];
  /** Lieu de formation complet (salle, bâtiment, adresse). */
  place?: string | null;
  /** Mentions légales et « Fait à … le … ». */
  legal?: { siret: string | null; nda: string | null; city: string | null } | null;
};

/**
 * Feuille d'émargement à la charte CF Réseaux (A4 paysage) : une colonne par
 * demi-journée (6 par page), signatures intégrées, ligne du formateur en bas
 * de chaque page. Un stagiaire n'est jamais coupé entre deux pages.
 */
export async function buildEmargementPdf(input: EmargementInput): Promise<Uint8Array> {
  const { loadBrand, brandPage, brandFooters, headerRow, wrap: wrapText, C, PAGE } = await import('@/lib/pdf-brand');
  const doc = await PDFDocument.create();
  doc.setTitle(`Feuille d'émargement - ${input.title}`);
  doc.setAuthor('CF Réseaux');
  const b = await loadBrand(doc);
  const numW = 24;
  const nameW = 140;
  const companyW = 100;
  const ROW = 38;
  const BOTTOM = 58;
  const slotsPerPage = 6;
  const tableW = PAGE.W - 2 * PAGE.M;
  const x0 = PAGE.M;
  const pages: PDFPage[] = [];
  const sigCache = new Map<string, any>();
  const find = (signer: string, traineeId: string | null, slot: Slot) =>
    input.signatures.find((x) => x.signer === signer && (x.trainee_id || null) === traineeId && x.day === slot.day && x.half === slot.half);

  const slotChunks: Slot[][] = [];
  for (let i = 0; i < Math.max(input.slots.length, 1); i += slotsPerPage) slotChunks.push(input.slots.slice(i, i + slotsPerPage));

  let lastPage: PDFPage | null = null;
  let lastY = 0;
  for (const slots of slotChunks) {
    const slotW = (tableW - numW - nameW - companyW) / Math.max(slots.length, 1);
    const cols = [
      { label: 'N°', width: numW },
      { label: 'Stagiaire (NOM Prénom)', width: nameW },
      { label: 'Entreprise', width: companyW },
      ...slots.map((s) => ({
        label: `${dayName(s.day)} ${frDate(s.day).slice(0, 5)}`,
        sub: `${HALF_LABEL[s.half]} · ${hh(s.start)}-${hh(s.end)}`,
        width: slotW,
      })),
    ];

    const open = (withTable = true) => {
      const { page, top } = brandPage(doc, b, "FEUILLE D'ÉMARGEMENT", 'Signature des stagiaires par demi-journée', input);
      pages.push(page);
      let y = top;
      // Lieu de formation (bâtiment et adresse).
      if (input.place) {
        page.drawText('LIEU DE FORMATION', { x: x0, y: y - 8, size: 7, font: b.bold, color: C.muted });
        page.drawText(wrapText(b.bold, input.place, 9, tableW - 90)[0] || '', { x: x0 + 86, y: y - 8.5, size: 9, font: b.bold, color: C.night });
        y -= 18;
      }
      return { page, y: withTable ? headerRow(page, b, x0, y, cols) : y };
    };

    const drawRow = async (page: PDFPage, y: number, index: string, label: string, company: string, cell: (s: Slot) => SignatureRow | undefined | 'na', shade: any, bold = false) => {
      page.drawRectangle({ x: x0, y: y - ROW, width: tableW, height: ROW, color: shade, borderColor: C.grey, borderWidth: 0.6 });
      const mid = y - ROW / 2;
      page.drawText(index, { x: x0 + 7, y: mid - 3, size: 8.5, font: b.bold, color: C.night });
      const nameLines = wrapText(b.bold, label, 8.6, nameW - 12).slice(0, 2);
      nameLines.forEach((l, k) => page.drawText(l, { x: x0 + numW + 6, y: mid - 3 + (nameLines.length - 1) * 5.5 - k * 11, size: 8.6, font: b.bold, color: bold ? C.night : C.night }));
      const compLines = wrapText(b.regular, company, 8, companyW - 12).slice(0, 2);
      compLines.forEach((l, k) => page.drawText(l, { x: x0 + numW + nameW + 6, y: mid - 3 + (compLines.length - 1) * 5 - k * 10, size: 8, font: b.regular, color: C.muted }));
      let x = x0 + numW + nameW + companyW;
      for (const s of slots) {
        page.drawLine({ start: { x, y }, end: { x, y: y - ROW }, thickness: 0.6, color: C.grey });
        const c = cell(s);
        if (c === 'na') {
          page.drawText('-', { x: x + slotW / 2 - 2, y: mid - 3, size: 9, font: b.regular, color: C.muted });
        } else if (c?.status === 'absent') {
          const t = 'ABSENT';
          page.drawText(t, { x: x + (slotW - b.bold.widthOfTextAtSize(t, 8)) / 2, y: mid - 3, size: 8, font: b.bold, color: C.red });
        } else if (c?.signature) {
          let img = sigCache.get(c.signature);
          if (img === undefined) {
            try {
              img = await embedSignature(doc, c.signature);
            } catch {
              img = null;
            }
            sigCache.set(c.signature, img);
          }
          if (img) {
            const scale = Math.min((slotW - 10) / img.width, (ROW - 8) / img.height);
            page.drawImage(img, { x: x + (slotW - img.width * scale) / 2, y: y - ROW + (ROW - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
          }
        }
        x += slotW;
      }
      page.drawLine({ start: { x: x0 + numW, y }, end: { x: x0 + numW, y: y - ROW }, thickness: 0.6, color: C.grey });
      page.drawLine({ start: { x: x0 + numW + nameW, y }, end: { x: x0 + numW + nameW, y: y - ROW }, thickness: 0.6, color: C.grey });
      return y - ROW;
    };

    let { page, y } = open();
    const trainerRow = async () => {
      y -= 4;
      y = await drawRow(page, y, '', `Formateur : ${input.trainerName || ''}`, 'Signature du formateur', (s) => find('formateur', null, s), C.grey, true);
    };
    for (let i = 0; i < input.trainees.length; i++) {
      // Place pour ce stagiaire ET la ligne formateur ; sinon page suivante.
      if (y - ROW - (ROW + 4) < BOTTOM) {
        await trainerRow();
        ({ page, y } = open());
      }
      const t = input.trainees[i];
      y = await drawRow(
        page,
        y,
        String(i + 1),
        t.name,
        t.company || '',
        (slot) => {
          const exp = input.expected[`${slot.day}|${slot.half}`];
          if (exp && !exp.includes(t.id)) return 'na';
          return find('stagiaire', t.id, slot);
        },
        i % 2 ? C.cream : C.white
      );
    }
    await trainerRow();
    lastPage = page;
    lastY = y;
  }

  // « Fait à …, le … » (dernier jour de la session), en bas du tableau.
  if (lastPage) {
    let page: PDFPage = lastPage;
    let y = lastY;
    if (y - 34 < BOTTOM) ({ page, y } = (() => {
      const { page: p, top } = brandPage(doc, b, "FEUILLE D'ÉMARGEMENT", 'Signature des stagiaires par demi-journée', input);
      pages.push(p);
      return { page: p, y: top };
    })());
    const lastDay = input.slots.length ? input.slots[input.slots.length - 1].day : null;
    const fait = `Fait à ${input.legal?.city || 'Cuincy'}, le ${lastDay ? frDate(lastDay) : new Date().toLocaleDateString('fr-FR')}`;
    page.drawText(fait, { x: x0 + tableW - b.bold.widthOfTextAtSize(fait, 9.5), y: y - 22, size: 9.5, font: b.bold, color: C.night });
  }

  const legal = [
    'CF RÉSEAUX',
    input.legal?.siret && `SIRET ${input.legal.siret}`,
    input.legal?.nda &&
      `Déclaration d'activité enregistrée sous le n° ${input.legal.nda} auprès du préfet de région Hauts-de-France (cet enregistrement ne vaut pas agrément de l'État)`,
  ]
    .filter(Boolean)
    .join(' · ');
  brandFooters(
    pages,
    b,
    `CF Réseaux · Émargement · ${input.title}`,
    `Signatures électroniques horodatées · généré le ${new Date().toLocaleDateString('fr-FR')}`,
    legal
  );
  return doc.save();
}

/** Applique les champs remplis et les marques (textes, coches, signatures) sur un PDF. */
export async function fillDocumentPdf(source: ArrayBuffer | Uint8Array, data: EntryData | null | undefined): Promise<Uint8Array> {
  const doc = await PDFDocument.load(source, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fields = data?.fields || {};
  if (Object.keys(fields).length) {
    try {
      const form = doc.getForm();
      for (const f of form.getFields()) {
        const v = fields[f.getName()];
        if (v === undefined) continue;
        const type = f.constructor.name;
        try {
          if (type === 'PDFTextField') {
            const tf = f as any;
            // Taille lisible : la taille « auto » des PDF grossit le texte à l'extrême.
            const h = tf.acroField.getWidgets()[0]?.getRectangle().height || 14;
            tf.setFontSize(tf.isMultiline() ? Math.min(10, Math.max(7, h / 4)) : Math.min(11, Math.max(6, h * 0.62)));
            tf.setText(safe(font, String(v)));
          }
          else if (type === 'PDFCheckBox') (v === true || v === 'true' ? (f as any).check() : (f as any).uncheck());
          else if (type === 'PDFRadioGroup' && v) (f as any).select(String(v));
          else if ((type === 'PDFDropdown' || type === 'PDFOptionList') && v) (f as any).select(String(v));
        } catch {
          /* champ non modifiable : ignoré */
        }
      }
      try {
        form.updateFieldAppearances(font);
        form.flatten();
      } catch {
        /* formulaire atypique : les valeurs restent dans les champs */
      }
    } catch {
      /* pas de formulaire */
    }
  }
  const pages = doc.getPages();
  for (const m of data?.marks || []) {
    const page: PDFPage | undefined = pages[m.page];
    if (!page) continue;
    const { width, height } = page.getSize();
    if (m.kind === 'text' && m.text.trim()) {
      const lines = m.text.split('\n');
      // Mêmes repères que l'éditeur : interligne 1,15 et ligne de base à 0,9 × la taille.
      lines.forEach((l, i) =>
        page.drawText(safe(font, l), {
          x: m.x * width,
          y: height - m.y * height - m.size * 0.9 - i * m.size * 1.15,
          size: m.size,
          font,
          color: rgb(0.05, 0.12, 0.35),
        })
      );
    } else if (m.kind === 'check') {
      const s = m.size;
      const x = m.x * width;
      const y = height - m.y * height - s;
      page.drawLine({ start: { x, y: y + s * 0.5 }, end: { x: x + s * 0.38, y: y + s * 0.1 }, thickness: 1.6, color: rgb(0.05, 0.12, 0.35) });
      page.drawLine({ start: { x: x + s * 0.38, y: y + s * 0.1 }, end: { x: x + s, y: y + s * 0.95 }, thickness: 1.6, color: rgb(0.05, 0.12, 0.35) });
    } else if (m.kind === 'signature') {
      try {
        const img = await embedSignature(doc, m.image);
        page.drawImage(img, { x: m.x * width, y: height - (m.y + m.h) * height, width: m.w * width, height: m.h * height });
      } catch {
        /* image illisible */
      }
    }
  }
  return doc.save();
}

/** Assemble plusieurs PDF en un seul (dossier complet). */
export async function mergePdfs(parts: (ArrayBuffer | Uint8Array)[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const p of parts) {
    try {
      const src = await PDFDocument.load(p, { ignoreEncryption: true });
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((pg) => out.addPage(pg));
    } catch {
      /* fichier illisible : ignoré */
    }
  }
  return out.save();
}

/** Téléchargement d'un PDF généré. */
export function downloadPdf(bytes: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.replace(/[\\/:*?"<>|]+/g, '-');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
