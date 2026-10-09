import type { TraineeName } from '@/lib/trainee-name';

/**
 * Lecture d'un fichier de stagiaires (Excel .xlsx ou CSV).
 * Colonnes attendues : NOM, PRENOM, ENTREPRISE, EMAIL (dans n'importe quel
 * ordre, majuscules/accents indifférents ; STATUT facultatif). Sans ligne
 * d'en-tête reconnue, l'ordre NOM, PRENOM, ENTREPRISE, EMAIL est utilisé.
 * Les doublons du fichier (même e-mail, ou même nom + prénom) sont retirés.
 */
export type TraineeRow = {
  line: number;
  name: TraineeName;
  email: string | null;
  company: string | null;
  status: 'validee' | 'en_attente' | null;
};

const key = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const HEADERS: Record<'nom' | 'prenom' | 'nomprenom' | 'entreprise' | 'email' | 'statut', string[]> = {
  nom: ['nom', 'nomdefamille', 'lastname', 'name', 'nomstagiaire'],
  prenom: ['prenom', 'firstname', 'prenomstagiaire'],
  nomprenom: ['nomprenom', 'nomcomplet', 'fullname', 'stagiaire', 'nometprenom'],
  entreprise: ['entreprise', 'societe', 'company', 'employeur', 'raisonsociale', 'client'],
  email: ['email', 'mail', 'courriel', 'adressemail', 'adresseemail', 'emailaddress', 'adressemaildustagiaire'],
  statut: ['statut', 'status'],
};

function cellText(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\s+/g, ' ').trim();
}

async function readMatrix(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/node');
    const data = await readSheet(Buffer.from(await file.arrayBuffer()));
    return (data as unknown[][]).map((row) => row.map(cellText));
  }
  if (name.endsWith('.xls')) {
    throw new Error('Ancien format Excel (.xls) : enregistre le fichier en .xlsx ou en .csv, puis réessaie.');
  }
  const Papa = (await import('papaparse')).default;
  const parsed = Papa.parse<string[]>((await file.text()).replace(/^﻿/, ''), { skipEmptyLines: true });
  return parsed.data.map((row) => row.map(cellText));
}

/** Clé d'identité d'une personne : indépendante de l'ordre nom / prénom, des accents et des majuscules. */
export function personKey(n: TraineeName) {
  return [n.first_name || '', n.last_name]
    .join(' ')
    .split(/\s+/)
    .map(key)
    .filter(Boolean)
    .sort()
    .join(' ');
}

export async function parseTraineeFile(file: File): Promise<{ rows: TraineeRow[]; duplicates: number; errors: string[] }> {
  // Numéro de ligne réel du fichier conservé (les lignes vides sont ignorées).
  const matrix = (await readMatrix(file)).map((cells, i) => Object.assign(cells, { lineNo: i + 1 })).filter((r) => r.some((c) => c));
  const errors: string[] = [];
  if (!matrix.length) return { rows: [], duplicates: 0, errors: ['Le fichier est vide.'] };

  // Ligne d'en-tête : parmi les 10 premières, celle qui contient « NOM ».
  let headerIndex = -1;
  const col: Partial<Record<keyof typeof HEADERS, number>> = {};
  for (let i = 0; i < Math.min(10, matrix.length) && headerIndex < 0; i++) {
    const keys = matrix[i].map(key);
    if (keys.some((k) => HEADERS.nom.includes(k) || HEADERS.nomprenom.includes(k))) {
      headerIndex = i;
      (Object.keys(HEADERS) as (keyof typeof HEADERS)[]).forEach((field) => {
        const idx = keys.findIndex((k) => HEADERS[field].includes(k));
        if (idx >= 0) col[field] = idx;
      });
    }
  }
  if (headerIndex < 0) {
    // Pas d'en-tête : ordre du fichier type NOM, PRENOM, ENTREPRISE, EMAIL.
    Object.assign(col, { nom: 0, prenom: 1, entreprise: 2, email: 3 });
  }

  const get = (row: string[], field: keyof typeof HEADERS) => (col[field] != null ? row[col[field]!] || '' : '');
  const byKey = new Map<string, TraineeRow>();
  let duplicates = 0;

  matrix.slice(headerIndex + 1).forEach((row) => {
    const line = (row as any).lineNo as number;
    let last = get(row, 'nom');
    let first = get(row, 'prenom');
    if (!last && !first && col.nomprenom != null) {
      // Une seule colonne « NOM PRENOM » : premier mot = nom, le reste = prénom.
      const parts = get(row, 'nomprenom').split(' ');
      last = parts[0] || '';
      first = parts.slice(1).join(' ');
    }
    if (!last && first) [last, first] = [first, ''];
    if (!last) {
      errors.push(`Ligne ${line} : nom manquant, ignorée.`);
      return;
    }
    const emailRaw = get(row, 'email').toLowerCase();
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : null;
    if (emailRaw && !email) errors.push(`Ligne ${line} : e-mail « ${emailRaw} » invalide, ignoré.`);
    const statusRaw = key(get(row, 'statut'));
    const entry: TraineeRow = {
      line,
      name: { first_name: first || null, last_name: last },
      email,
      company: get(row, 'entreprise') || null,
      status: statusRaw.startsWith('valid') ? 'validee' : statusRaw ? 'en_attente' : null,
    };

    // Doublon dans le fichier : même nom + prénom (dans n'importe quel ordre) → une seule ligne, complétée.
    const k = personKey(entry.name);
    const existing = byKey.get(k);
    // Même e-mail pour deux personnes différentes : on garde les deux, sans l'e-mail en double.
    if (!existing && email && [...byKey.values()].some((r) => r.email === email)) {
      errors.push(`Ligne ${line} : l’e-mail ${email} est déjà utilisé par une autre personne du fichier, ignoré.`);
      entry.email = null;
    }
    if (existing) {
      duplicates++;
      if (!existing.email && entry.email && ![...byKey.values()].some((r) => r.email === entry.email)) existing.email = entry.email;
      existing.company ||= entry.company;
      existing.name.first_name ||= entry.name.first_name;
      if (entry.status === 'validee') existing.status = 'validee';
      return;
    }
    byKey.set(k, entry);
  });

  return { rows: [...byKey.values()], duplicates, errors };
}
