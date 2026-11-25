import { parseSymbols } from '@/lib/habilitation';
import { REUSSITE_MODELS } from '@/lib/reussite';

/**
 * Réglages d'une session détectés d'après les noms (module Digiforma, session
 * Digiforma, formation du catalogue choisie). Chaque réglage dit pourquoi il
 * est proposé ; rien n'est imposé : le collaborateur coche ou décoche.
 */

export type SmartSettings = {
  tour_de_table: boolean;
  fiche_appreciation: boolean;
  codification: string;
  certificat_realisation: boolean;
  /** Certificat d'habilitation : '*' (délivré) ou '' (non). */
  habilitation_symbols: string;
  titre_habilitation: boolean;
  recyclage_available: boolean;
  /** Attestations de réussite (clés des modèles, ex. irve_p1). */
  attestation_reussite: string[];
  grille_irve: boolean;
  grille_maintenance: boolean;
  perimetre_habilitation: string;
  early_departure: boolean;
  /** Autorisations demandées au stagiaire. */
  authorizations: string[];
};

export type SmartField = keyof SmartSettings;
/** Raison de chaque proposition (affichée « Détecté : … »). */
export type SmartReasons = Partial<Record<SmartField, string>>;

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Valeurs de départ : celles de la formation du catalogue, sinon des valeurs neutres. */
export function settingsFromTemplate(t: any | null): SmartSettings {
  const csv = (v: any) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
  return {
    tour_de_table: t ? t.tour_de_table !== false : true,
    fiche_appreciation: Boolean(t?.fiche_appreciation),
    codification: String(t?.codification || ''),
    certificat_realisation: Boolean(t?.certificat_realisation),
    habilitation_symbols: t?.habilitation_symbols === '' ? '' : t?.habilitation_symbols ? '*' : t && parseSymbols(t.title || '').symbols.length ? '*' : '',
    titre_habilitation: Boolean(t?.titre_habilitation),
    recyclage_available: Boolean(t?.recyclage_available),
    attestation_reussite: csv(t?.attestation_reussite),
    grille_irve: t?.grille_irve === true,
    grille_maintenance: t?.grille_maintenance === true,
    perimetre_habilitation: String(t?.perimetre_habilitation || ''),
    early_departure: t?.early_departure !== false,
    authorizations: Array.isArray(t?.authorizations) ? t.authorizations : ['image'],
  };
}

/** Périmètre d'habilitation (TST) d'après le nom du module. */
function perimetreOf(t: string): { key: string; why: string } | null {
  if (/\baer\s*res\b|aerien reseau/.test(t)) return { key: 'aer-res', why: '« AER-RES » / aérien réseau' };
  if (/\baer\s*ep\b|eclairage public/.test(t)) return { key: 'aer-ep', why: '« AER-EP » / éclairage public' };
  if (/\bbrt\b|branchement/.test(t)) return { key: 'brt-aer-aerosou', why: '« BRT » / branchement' };
  if (/\beme\b|emergence/.test(t)) return { key: 'emergence', why: '« EME » / émergence' };
  if (/\bsou\b|souterrain/.test(t)) return { key: 'souterrain', why: '« SOU » / souterrain' };
  if (/\bter\b|terminal/.test(t)) return { key: 'terminal', why: '« TER » / terminal' };
  return null;
}

/**
 * Propositions d'après les noms : on part des réglages de la formation choisie
 * et on ajoute ce que les noms révèlent (sans jamais retirer un réglage de la formation).
 */
export function detectSettings(names: string[], base: SmartSettings, context: string[] = []): { settings: SmartSettings; reasons: SmartReasons } {
  // names : module(s) Digiforma (décident des attestations P1, MA2…) ; context : session Digiforma, formation choisie.
  const raw = [...names, ...context].filter(Boolean).join(' · ');
  const t = norm(raw);
  const own0 = norm(names.filter(Boolean).join(' · '));
  // Niveaux (P1, MA2…) : ceux du module ; s'il n'en nomme aucun, ceux de la session / formation.
  const own = /\b(p[123]|ma[123])\b/.test(own0) ? own0 : t;
  const s: SmartSettings = { ...base, attestation_reussite: [...base.attestation_reussite], authorizations: [...base.authorizations] };
  const why: SmartReasons = {};
  const symbols = parseSymbols(raw).symbols;
  const habilitation = symbols.length > 0 || /habilitation|nf c18|c18 510/.test(t);
  const recyclage = /recyclage|\brecy\b|maintien/.test(t);
  const initial = /\binitial(e)?\b/.test(t);
  const irve = /\birve\b|borne|recharge vehicule/.test(t);
  const maintenance = irve && /maintenance|\bma[123]\b/.test(t);
  const tst = /\btst\b|sous tension|\bacc\b|accessoire|\baer\b|\bsou\b|\beme\b|\bbrt\b|\bter\b|\bcis\b|\bcpi\b/.test(t);

  if (habilitation && !s.habilitation_symbols) {
    s.habilitation_symbols = '*';
    why.habilitation_symbols = symbols.length ? `symboles dans le nom : ${symbols.join(' ')}` : '« habilitation » dans le nom';
  }
  if (habilitation && recyclage && !s.titre_habilitation) {
    s.titre_habilitation = true;
    why.titre_habilitation = 'recyclage d’habilitation : le titre actuel est demandé';
  }
  if ((recyclage || initial) && !s.recyclage_available) {
    s.recyclage_available = true;
    why.recyclage_available = recyclage && initial ? 'initial et recyclage dans le nom' : recyclage ? '« recyclage » dans le nom' : '« initial » dans le nom';
  }
  if (irve && !maintenance) {
    if (!s.grille_irve) {
      s.grille_irve = true;
      why.grille_irve = '« IRVE » dans le nom';
    }
    for (const m of REUSSITE_MODELS) {
      const code = m.label.replace(/^IRVE\s+/i, '').toLowerCase();
      if (new RegExp(`\\b${code}\\b`).test(own) && !s.attestation_reussite.includes(m.key)) {
        s.attestation_reussite.push(m.key);
        why.attestation_reussite = `${why.attestation_reussite ? `${why.attestation_reussite}, ` : ''}« ${m.label} » dans le nom`;
      }
    }
  }
  if (maintenance) {
    if (!s.grille_maintenance) {
      s.grille_maintenance = true;
      why.grille_maintenance = 'maintenance IRVE (MA1 / MA2 / MA3)';
    }
    for (const m of REUSSITE_MODELS) {
      const code = m.label.replace(/^IRVE\s+/i, '').toLowerCase();
      if (/^ma\d/.test(code) && new RegExp(`\\b${code}\\b`).test(own) && !s.attestation_reussite.includes(m.key)) {
        s.attestation_reussite.push(m.key);
        why.attestation_reussite = `${why.attestation_reussite ? `${why.attestation_reussite}, ` : ''}« ${m.label} » dans le nom`;
      }
    }
  }
  if (tst && !s.fiche_appreciation) {
    s.fiche_appreciation = true;
    why.fiche_appreciation = 'formation TST : fiche d’appréciation et appréciation des compétences';
  }
  const peri = tst || /\baer\b/.test(t) ? perimetreOf(t) : null;
  if (peri && !s.perimetre_habilitation) {
    s.perimetre_habilitation = peri.key;
    why.perimetre_habilitation = `${peri.why} dans le nom`;
    if (!s.fiche_appreciation) s.fiche_appreciation = true;
  }
  // Départ anticipé : pas pour l'IRVE (règle habituelle de CF Réseaux).
  if (irve && s.early_departure) {
    s.early_departure = false;
    why.early_departure = 'IRVE : départ anticipé non proposé';
  }
  if (/\bcpf\b|certificat de realisation|financement/.test(t) && !s.certificat_realisation) {
    s.certificat_realisation = true;
    why.certificat_realisation = 'financement (CPF…) : certificat de réalisation';
  }
  return { settings: s, reasons: why };
}

/** Réglages modifiés par rapport à la formation choisie (rien = pas de réglages propres). */
export function settingsDiff(a: SmartSettings, b: SmartSettings): Partial<SmartSettings> {
  const out: Partial<SmartSettings> = {};
  for (const k of Object.keys(a) as SmartField[]) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) (out as any)[k] = a[k];
  }
  return out;
}

/** Réglages → colonnes de la formation (enregistrées pour la session seulement). */
export function settingsToColumns(s: Partial<SmartSettings>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'attestation_reussite') out[k] = (v as string[]).length ? (v as string[]).join(',') : null;
    else if (k === 'codification' || k === 'perimetre_habilitation') out[k] = (v as string) || null;
    else out[k] = v;
  }
  return out;
}
