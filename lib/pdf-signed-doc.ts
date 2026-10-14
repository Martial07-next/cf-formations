'use client';

import { PDFDocument } from 'pdf-lib';
import { C, LOGO_RATIO, clean, wrap, loadBrand, legalLine, type Legal } from '@/lib/pdf-brand';

/**
 * Document ajouté par l'administrateur (ex. règlement intérieur) signé en
 * ligne : le PDF d'origine, suivi d'une page de signature à la charte
 * CF Réseaux (nom, « Lu et approuvé », lieu, date, signature).
 */
export type SignedDocInput = {
  fileUrl: string;
  title: string;
  version: number;
  signerName: string;
  signerRole: 'stagiaire' | 'salarie';
  sessionTitle?: string | null;
  city: string | null;
  signedAt: string;
  signature: string;
  legal?: Legal | null;
};

async function embedSig(doc: PDFDocument, dataUrl: string) {
  try {
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1] || ''), (c) => c.charCodeAt(0));
    return await doc.embedPng(bytes);
  } catch {
    return null;
  }
}

export async function buildSignedDocPdf(items: SignedDocInput[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.setTitle(items.length === 1 ? `${items[0].title} – ${items[0].signerName}` : 'Documents signés');
  out.setAuthor('CF Réseaux');
  const b = await loadBrand(out);
  const cache = new Map<string, PDFDocument>();
  for (const it of items) {
    if (!cache.has(it.fileUrl)) {
      const bytes = await fetch(it.fileUrl).then((r) => {
        if (!r.ok) throw new Error('Document introuvable.');
        return r.arrayBuffer();
      });
      cache.set(it.fileUrl, await PDFDocument.load(bytes, { ignoreEncryption: true }));
    }
    const src = cache.get(it.fileUrl)!;
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));

    // Page de signature (A4 portrait)
    const W = 595.28, H = 841.89, M = 50;
    const page = out.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 120, width: W, height: 120, color: C.night });
    if (b.logo) page.drawImage(b.logo, { x: M, y: H - 52, width: 130, height: 130 / LOGO_RATIO });
    page.drawText('ATTESTATION DE LECTURE', { x: M, y: H - 86, size: 18, font: b.title, color: C.cream });
    page.drawRectangle({ x: M, y: H - 100, width: 34, height: 3, color: C.green });
    let y = H - 165;
    const line = (text: string, size = 11, font = b.regular, color = C.night, lead = 16) => {
      for (const l of wrap(font, text, size, W - 2 * M)) {
        page.drawText(l, { x: M, y, size, font, color });
        y -= lead;
      }
    };
    line(it.title, 16, b.bold, C.night, 22);
    page.drawText(clean(b.regular, `Version ${it.version}`), { x: M, y, size: 9, font: b.regular, color: C.muted });
    y -= 30;
    line(`Je soussigné(e) ${it.signerName}, ${it.signerRole === 'salarie' ? 'salarié(e)' : 'stagiaire'} de CF Réseaux${it.sessionTitle ? ` (formation : ${it.sessionTitle})` : ''}, atteste avoir lu le document « ${it.title} » et m’engage à le respecter.`);
    y -= 14;
    line('Lu et approuvé.', 11, b.bold);
    y -= 14;
    const date = new Date(it.signedAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
    line(`Fait à ${it.city || 'Cuincy'}, le ${date}`, 11, b.bold);
    y -= 10;
    page.drawText('Signature :', { x: M, y, size: 11, font: b.bold, color: C.night });
    const sig = await embedSig(out, it.signature);
    if (sig) {
      const k = Math.min(240 / sig.width, 110 / sig.height);
      page.drawImage(sig, { x: M + 10, y: y - 14 - sig.height * k, width: sig.width * k, height: sig.height * k });
    }
    // Pied de page
    page.drawRectangle({ x: M, y: 46, width: W - 2 * M, height: 1.2, color: C.green });
    if (b.logoDark) page.drawImage(b.logoDark, { x: M, y: 28, width: 60, height: 60 / LOGO_RATIO });
    page.drawText('20 rue du Champ de Tir, 59553 Cuincy', { x: M + 68, y: 30, size: 7.5, font: b.regular, color: C.muted });
    const legal = legalLine(it.legal);
    if (legal) {
      const l = wrap(b.regular, legal, 6, W - 2 * M)[0] || '';
      page.drawText(l, { x: (W - b.regular.widthOfTextAtSize(l, 6)) / 2, y: 14, size: 6, font: b.regular, color: C.muted });
    }
  }
  return out.save();
}
