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

function fit(font: PDFFont, text: string, size: number, width: number) {
  const t = safe(font, text);
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  let cut = t;
  while (cut.length > 1 && font.widthOfTextAtSize(cut + '...', size) > width) cut = cut.slice(0, -1);
  return cut + '...';
}

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
};

/** Feuille d'émargement (A4 paysage) : une colonne par demi-journée, signatures intégrées. */
export async function buildEmargementPdf(input: EmargementInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Feuille d'émargement - ${input.title}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 842;
  const H = 595;
  const M = 28;
  const nameW = 170;
  const companyW = 110;
  const rowH = 34;
  const slotsPerPage = 6;
  const rowsPerPage = 11;
  const ink = rgb(0.06, 0.12, 0.2);
  const grey = rgb(0.45, 0.5, 0.55);
  const line = rgb(0.75, 0.79, 0.83);
  const mint = rgb(0.89, 0.97, 0.92);

  const sigCache = new Map<string, any>();
  const find = (signer: string, traineeId: string | null, slot: Slot) =>
    input.signatures.find((x) => x.signer === signer && (x.trainee_id || null) === traineeId && x.day === slot.day && x.half === slot.half);

  const slotChunks: Slot[][] = [];
  for (let i = 0; i < Math.max(input.slots.length, 1); i += slotsPerPage) slotChunks.push(input.slots.slice(i, i + slotsPerPage));
  const rowChunks: (typeof input.trainees)[] = [];
  for (let i = 0; i < Math.max(input.trainees.length, 1); i += rowsPerPage) rowChunks.push(input.trainees.slice(i, i + rowsPerPage));
  const total = slotChunks.length * rowChunks.length;
  let pageNo = 0;

  for (const slots of slotChunks) {
    for (const rows of rowChunks) {
      pageNo++;
      const page = doc.addPage([W, H]);
      // En-tête
      page.drawText('FEUILLE D\'ÉMARGEMENT', { x: M, y: H - M - 14, size: 15, font: bold, color: ink });
      page.drawText('CF Réseaux', { x: W - M - bold.widthOfTextAtSize('CF Réseaux', 11), y: H - M - 12, size: 11, font: bold, color: grey });
      page.drawText(fit(bold, `Formation : ${input.title}`, 11, W - 2 * M), { x: M, y: H - M - 34, size: 11, font: bold, color: ink });
      const meta = [input.period, input.room && `Lieu : ${input.room}`, input.trainerName && `Formateur : ${input.trainerName}`].filter(Boolean).join('   ·   ');
      page.drawText(fit(font, meta, 9.5, W - 2 * M), { x: M, y: H - M - 50, size: 9.5, font, color: grey });

      const slotW = (W - 2 * M - nameW - companyW) / slotsPerPage;
      let y = H - M - 72;
      const headH = 30;
      // Ligne d'en-tête du tableau
      page.drawRectangle({ x: M, y: y - headH, width: nameW + companyW + slotW * slots.length, height: headH, color: mint });
      page.drawText('Stagiaire (NOM Prénom)', { x: M + 6, y: y - 19, size: 9, font: bold, color: ink });
      page.drawText('Entreprise', { x: M + nameW + 6, y: y - 19, size: 9, font: bold, color: ink });
      slots.forEach((s, i) => {
        const x = M + nameW + companyW + i * slotW;
        page.drawText(`${dayName(s.day)} ${frDate(s.day).slice(0, 5)}`, { x: x + 5, y: y - 12, size: 8.5, font: bold, color: ink });
        page.drawText(`${HALF_LABEL[s.half]} ${s.start.replace(':', 'h')}-${s.end.replace(':', 'h')}`, { x: x + 5, y: y - 24, size: 7, font, color: grey });
      });
      y -= headH;

      const drawRow = async (label: string, company: string, cell: (slot: Slot) => SignatureRow | undefined | 'na', isTrainer = false) => {
        const rowWidth = nameW + companyW + slotW * slots.length;
        if (isTrainer) page.drawRectangle({ x: M, y: y - rowH, width: rowWidth, height: rowH, color: rgb(0.96, 0.97, 0.98) });
        page.drawText(fit(isTrainer ? bold : font, label, 9, nameW - 10), { x: M + 6, y: y - rowH / 2 - 3, size: 9, font: isTrainer ? bold : font, color: ink });
        page.drawText(fit(font, company, 8, companyW - 10), { x: M + nameW + 6, y: y - rowH / 2 - 3, size: 8, font, color: grey });
        for (let i = 0; i < slots.length; i++) {
          const x = M + nameW + companyW + i * slotW;
          const c = cell(slots[i]);
          if (c === 'na') {
            page.drawText('-', { x: x + slotW / 2 - 2, y: y - rowH / 2 - 3, size: 9, font, color: line });
          } else if (c?.status === 'absent') {
            page.drawText('Absent', { x: x + 6, y: y - rowH / 2 - 3, size: 8.5, font: bold, color: rgb(0.7, 0.2, 0.2) });
          } else if (c?.signature) {
            let img = sigCache.get(c.signature);
            if (!img) {
              try {
                img = await embedSignature(doc, c.signature);
                sigCache.set(c.signature, img);
              } catch {
                img = null;
              }
            }
            if (img) {
              const scale = Math.min((slotW - 8) / img.width, (rowH - 6) / img.height);
              page.drawImage(img, { x: x + (slotW - img.width * scale) / 2, y: y - rowH + (rowH - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
            }
          }
        }
        // Grille
        page.drawLine({ start: { x: M, y: y - rowH }, end: { x: M + rowWidth, y: y - rowH }, thickness: 0.6, color: line });
        y -= rowH;
      };

      for (const t of rows) {
        await drawRow(t.name, t.company || '', (slot) => {
          const exp = input.expected[`${slot.day}|${slot.half}`];
          if (exp && !exp.includes(t.id)) return 'na';
          return find('stagiaire', t.id, slot);
        });
      }
      await drawRow(`Formateur : ${input.trainerName || ''}`, '', (slot) => find('formateur', null, slot), true);

      // Traits verticaux
      const top = H - M - 72;
      const xs = [M, M + nameW, M + nameW + companyW, ...slots.map((_, i) => M + nameW + companyW + (i + 1) * slotW)];
      for (const x of xs) page.drawLine({ start: { x, y: top }, end: { x, y }, thickness: 0.6, color: line });
      page.drawLine({ start: { x: M, y: top }, end: { x: xs[xs.length - 1], y: top }, thickness: 0.6, color: line });

      const foot = `Émargement électronique · document généré le ${new Date().toLocaleString('fr-FR')} · page ${pageNo}/${total}`;
      page.drawText(safe(font, foot), { x: M, y: 16, size: 7.5, font, color: grey });
    }
  }
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
