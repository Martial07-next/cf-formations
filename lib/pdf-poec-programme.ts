'use client';

import { PDFDocument } from 'pdf-lib';
import { C, PAGE, clean, wrap, loadBrand, brandPage, brandFooters, headerRow, legalLine, type Legal } from '@/lib/pdf-brand';
import { frShort, mondaysBetween } from '@/lib/poec';
import { formatHours } from '@/lib/week';

/** Programme d'un parcours POEC (à remettre aux stagiaires et à France Travail). */
export type ProgrammeInput = {
  title: string;
  reference: string | null;
  start: string;
  end: string;
  objectives: string | null;
  sessions: { title: string; start_at: string; end_at: string; hours: number; trainer: string | null; room: string | null }[];
  periods: { label: string; start_date: string; end_date: string }[];
  trainees: string[];
  legal: Legal | null;
};

export async function buildProgrammePdf(input: ProgrammeInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Programme POEC – ${input.title}`);
  doc.setAuthor('CF Réseaux');
  const b = await loadBrand(doc);
  const { W, M } = PAGE;
  const card = {
    title: input.title,
    period: `Du ${frShort(input.start)} au ${frShort(input.end)}`,
    room: input.reference ? `Réf. ${input.reference}` : null,
    trainerName: null,
  };
  const pages = [];
  let { page, top } = brandPage(doc, b, 'PROGRAMME POEC', 'Préparation Opérationnelle à l’Emploi Collective · Financement France Travail', card);
  pages.push(page);
  let y = top;

  const next = () => {
    const p = brandPage(doc, b, 'PROGRAMME POEC', 'Suite du programme', card);
    pages.push(p.page);
    page = p.page;
    y = p.top;
  };

  // Objectifs
  if (input.objectives?.trim()) {
    page.drawText('OBJECTIFS DU PARCOURS', { x: M, y: y - 8, size: 7.5, font: b.bold, color: C.muted });
    y -= 20;
    for (const line of wrap(b.regular, input.objectives.trim(), 9.5, W - 2 * M)) {
      if (y < 80) next();
      page.drawText(line, { x: M, y, size: 9.5, font: b.regular, color: C.night });
      y -= 13;
    }
    y -= 8;
  }

  // Tableau semaine par semaine
  const cols = [
    { label: 'SEMAINE', width: 70 },
    { label: 'DATES', width: 130 },
    { label: 'FORMATION / STAGE', width: 330 },
    { label: 'DURÉE', width: 70 },
    { label: 'FORMATEUR', width: 120 },
    { label: 'SALLE', width: W - 2 * M - 720 },
  ];
  const head = () => {
    y = headerRow(page, b, M, y, cols);
  };
  head();
  const rows: { week: string; dates: string; what: string; hours: string; trainer: string; room: string; stage: boolean }[] = [];
  mondaysBetween(input.start, input.end).forEach((monday, i) => {
    const friday = new Date(new Date(monday + 'T00:00:00Z').getTime() + 4 * 86400000).toISOString().slice(0, 10);
    const items = [
      ...input.periods
        .filter((p) => p.start_date <= friday && p.end_date >= monday)
        .map((p) => ({ key: p.start_date, week: `S${i + 1}`, dates: `${frShort(p.start_date)} → ${frShort(p.end_date)}`, what: /entreprise/i.test(p.label) ? p.label : `${p.label} (en entreprise)`, hours: '35 h / sem.', trainer: 'Tuteur entreprise', room: '—', stage: true })),
      ...input.sessions
        .filter((s) => s.start_at.slice(0, 10) >= monday && s.start_at.slice(0, 10) <= friday)
        .map((s) => ({
          key: s.start_at,
          week: `S${i + 1}`,
          dates: s.start_at.slice(0, 10) === s.end_at.slice(0, 10) ? frShort(s.start_at) : `${frShort(s.start_at)} → ${frShort(s.end_at)}`,
          what: s.title,
          hours: formatHours(s.hours),
          trainer: s.trainer || '—',
          room: s.room || '—',
          stage: false,
        })),
    ].sort((a, b2) => a.key.localeCompare(b2.key));
    rows.push(...items);
  });
  rows.forEach((r, i) => {
    const lines = wrap(b.regular, r.what, 9, cols[2].width - 12).slice(0, 3);
    const h = Math.max(22, lines.length * 11 + 10);
    if (y - h < 70) {
      next();
      head();
    }
    page.drawRectangle({ x: M, y: y - h, width: W - 2 * M, height: h, color: r.stage ? C.yellow : i % 2 ? C.white : C.cream, opacity: r.stage ? 0.35 : 1 });
    let x = M;
    const cells = [r.week, r.dates, '', r.hours, r.trainer, r.room];
    cells.forEach((v, k) => {
      if (k === 2) lines.forEach((l, j) => page.drawText(l, { x: x + 6, y: y - 14 - j * 11, size: 9, font: r.stage ? b.bold : b.bold, color: C.night }));
      else page.drawText(wrap(b.regular, v, 8.5, cols[k].width - 10)[0] || '', { x: x + 6, y: y - 14, size: 8.5, font: k === 0 ? b.bold : b.regular, color: C.night });
      x += cols[k].width;
    });
    page.drawRectangle({ x: M, y: y - h, width: W - 2 * M, height: 0.4, color: C.grey });
    y -= h;
  });
  const total = input.sessions.reduce((n, s) => n + s.hours, 0);
  y -= 16;
  if (y < 90) next();
  page.drawText(clean(b.bold, `Total en centre de formation : ${formatHours(Math.round(total * 10) / 10)}  ·  ${input.sessions.length} formation${input.sessions.length > 1 ? 's' : ''}  ·  ${input.periods.length} période${input.periods.length > 1 ? 's' : ''} de stage`), {
    x: M, y, size: 10, font: b.bold, color: C.night,
  });
  if (input.trainees.length) {
    y -= 22;
    if (y < 90) next();
    page.drawText('STAGIAIRES DU GROUPE', { x: M, y, size: 7.5, font: b.bold, color: C.muted });
    y -= 14;
    for (const line of wrap(b.regular, input.trainees.join('  ·  '), 9, W - 2 * M)) {
      if (y < 70) next();
      page.drawText(line, { x: M, y, size: 9, font: b.regular, color: C.night });
      y -= 12;
    }
  }
  brandFooters(pages, b, 'Programme POEC · CF Réseaux', input.title, legalLine(input.legal));
  return doc.save();
}
