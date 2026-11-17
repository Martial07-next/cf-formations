import { isPlaceholder } from '@/lib/digiforma-people';
// Client pour l'API GraphQL de Digiforma : SERVEUR UNIQUEMENT.
// La clé DIGIFORMA_API_TOKEN est lue ici depuis les variables d'environnement
// du serveur (Vercel) : elle n'est jamais envoyée au navigateur ni stockée en base.
// Endpoint et authentification confirmés par leur documentation publique ;
// les noms de champs des requêtes ci-dessous sont une meilleure estimation
// basée sur les conventions habituelles et devront être confirmés/ajustés
// via digiformaIntrospect() une fois un vrai token disponible.

const DIGIFORMA_URL = 'https://app.digiforma.com/api/v1/graphql';

async function digiformaFetch(query: string, variables?: Record<string, unknown>) {
  const token = process.env.DIGIFORMA_API_TOKEN;
  if (!token) {
    throw new Error(
      "DIGIFORMA_API_TOKEN n'est pas configuré côté serveur (variable d'environnement, jamais NEXT_PUBLIC_)."
    );
  }

  let res: Response;
  try {
    res = await fetch(DIGIFORMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e: any) {
    // Message générique : ne jamais renvoyer d'en-têtes ni de token dans une erreur.
    throw new Error(e?.name === 'TimeoutError' ? 'Digiforma ne répond pas (délai dépassé).' : 'Digiforma injoignable.');
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error('Clé API Digiforma refusée (vérifie DIGIFORMA_API_TOKEN).');
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Réponse Digiforma illisible (HTTP ${res.status}).`);
  }

  if (json.errors?.length) {
    throw new Error(json.errors.map((e: any) => e.message).join(' ; '));
  }
  if (!res.ok) {
    throw new Error(`Digiforma a répondu HTTP ${res.status}.`);
  }
  return json.data;
}

/** Test de connexion : liste les types du schéma GraphQL (requête d'introspection, sans effet). */
export async function digiformaIntrospect(): Promise<string[]> {
  const data = await digiformaFetch(`{ __schema { types { name } } }`);
  return (data.__schema.types as { name: string }[]).map((t) => t.name).sort();
}

export type DigiformaTrainee = {
  id: string;
  fullName: string;
  firstName: string | null;
  lastName: string;
  email: string | null;
  /** Inscription sur Digiforma : confirmée → validée ; indécise ou autre → en attente. */
  status?: 'validee' | 'en_attente';
  /** Client particulier sur Digiforma (le client est le stagiaire). */
  particulier?: boolean;
  /** Entreprise cliente sur Digiforma. */
  company?: string;
};

export type DigiformaSession = {
  id: string;
  name: string;
  startAt: string | null;
  endAt: string | null;
  trainees: DigiformaTrainee[];
};

/*
 * Les noms de champs varient selon les comptes Digiforma (ex. « firstname »
 * et non « firstName ») : on lit le schéma une fois, puis on construit les
 * requêtes avec les noms réels, renommés (alias GraphQL) vers nos noms à nous.
 */
let schemaCache: Promise<Record<string, string[]>> | null = null;

async function schemaFields(): Promise<Record<string, string[]>> {
  if (!schemaCache) {
    schemaCache = digiformaFetch(`{ __schema { queryType { name } types { name kind possibleTypes { name } fields { name type { kind name ofType { kind name ofType { kind name } } } } } } }`)
      .then((data) => {
        const out: Record<string, string[]> = {};
        const leafKind = (ty: any): boolean => (ty?.kind === 'NON_NULL' || ty?.kind === 'LIST' ? leafKind(ty.ofType) : ty?.kind === 'SCALAR' || ty?.kind === 'ENUM');
        for (const t of data.__schema.types as { name: string; kind?: string; possibleTypes?: { name: string }[] | null; fields: { name: string; type: any }[] | null }[]) {
          // Union / interface (ex. Customer.entity : entreprise OU particulier) : ses types possibles.
          if (t.kind) out[`${t.name}#kind`] = [t.kind];
          if (t.possibleTypes?.length) out[`${t.name}#possible`] = t.possibleTypes.map((x) => x.name);
          if (!t.fields) continue;
          out[t.name] = t.fields.map((f) => f.name);
          // Champs simples (texte, nombre, énumération) : sélectionnables sans sous-champs.
          out[`${t.name}#leaf`] = t.fields.filter((f) => leafKind(f.type)).map((f) => f.name);
          // Type nommé de chaque champ (ex. TrainingSession.modules → Module).
          const named = (ty: any): string | null => (ty?.name ? ty.name : ty?.ofType ? named(ty.ofType) : null);
          for (const fl of t.fields) out[`${t.name}.${fl.name}#type`] = [named(fl.type) || ''];
        }
        out.__query = out[data.__schema.queryType?.name || 'Query'] || out.Query || out.RootQueryType || [];
        return out;
      })
      .catch((e) => {
        schemaCache = null;
        throw e;
      });
  }
  return schemaCache;
}

/** Premier nom présent dans le schéma parmi les candidats. */
const pick = (fields: string[] | undefined, candidates: string[]) => candidates.find((c) => (fields || []).includes(c)) || null;
/** « alias: champ » si le champ existe, sinon rien. */
const sel = (alias: string, field: string | null) => (field ? (field === alias ? alias : `${alias}: ${field}`) : '');

async function traineeSelection(): Promise<string> {
  const f = await schemaFields();
  const tf = f.Trainee || f.Student || f.Participant;
  return [
    'id',
    sel('firstName', pick(tf, ['firstname', 'firstName', 'first_name'])),
    sel('lastName', pick(tf, ['lastname', 'lastName', 'last_name', 'birthName'])),
    sel('email', pick(tf, ['email', 'mail'])),
  ]
    .filter(Boolean)
    .join(' ');
}

async function sessionShape() {
  const f = await schemaFields();
  const listField = pick(f.__query, ['trainingSessions', 'sessions', 'trainingSessionList']);
  const oneField = pick(f.__query, ['trainingSession', 'session']);
  const sf = f.TrainingSession || f.Session;
  return {
    listField,
    oneField,
    name: sel('name', pick(sf, ['name', 'title', 'label'])),
    start: sel('startDate', pick(sf, ['startDate', 'startAt', 'start', 'beginDate', 'dateStart', 'firstDate'])),
    end: sel('endDate', pick(sf, ['endDate', 'endAt', 'end', 'finishDate', 'dateEnd', 'lastDate'])),
    trainees: pick(sf, ['trainees', 'students', 'participants']),
    status: sel('status', pick(f[`${f.TrainingSession ? 'TrainingSession' : 'Session'}#leaf`], ['status', 'state', 'stage', 'pipelineState', 'sessionStatus', 'planningStatus'])),
  };
}

function mapTrainee(t: any): DigiformaTrainee {
  return {
    id: String(t.id),
    fullName: [t.firstName, t.lastName].filter(Boolean).join(' ') || t.email || 'Stagiaire Digiforma',
    firstName: t.firstName || null,
    lastName: t.lastName || (t.firstName ? '' : t.email || 'Stagiaire Digiforma'),
    email: t.email || null,
  };
}

/** Liste tous les stagiaires connus de Digiforma (indépendamment de toute session). */
export async function digiformaListTrainees(): Promise<DigiformaTrainee[]> {
  const f = await schemaFields();
  const root = pick(f.__query, ['trainees', 'students']);
  if (!root) throw new Error('Digiforma : liste des stagiaires introuvable dans l’API de ce compte.');
  const data = await digiformaFetch(`{ trainees: ${root} { ${await traineeSelection()} } }`);
  return (data?.trainees || []).map(mapTrainee);
}

/** Liste les sessions de formation Digiforma, avec leurs stagiaires inscrits. */
export async function digiformaListTrainingSessions(): Promise<DigiformaSession[]> {
  const sh = await sessionShape();
  if (!sh.listField) throw new Error('Digiforma : liste des sessions introuvable dans l’API de ce compte.');
  const trainees = sh.trainees ? `trainees: ${sh.trainees} { ${await traineeSelection()} }` : '';
  const data = await digiformaFetch(`{ sessions: ${sh.listField} { id ${sh.name} ${sh.start} ${sh.end} ${trainees} } }`);
  return (data?.sessions || []).map((s: any) => ({
    id: String(s.id),
    name: s.name || 'Session Digiforma',
    startAt: s.startDate || null,
    endAt: s.endDate || null,
    trainees: (s.trainees || []).map(mapTrainee),
  }));
}

/** Récupère les stagiaires inscrits à une session Digiforma donnée (par son id/référence). */
export async function digiformaFetchSessionTrainees(digiformaRef: string): Promise<DigiformaTrainee[]> {
  const sh = await sessionShape();
  if (!sh.oneField || !sh.trainees) throw new Error('Digiforma : stagiaires d’une session introuvables dans l’API de ce compte.');
  const data = await digiformaFetch(
    `query($id: ID!) { session: ${sh.oneField}(id: $id) { id trainees: ${sh.trainees} { ${await traineeSelection()} } } }`,
    { id: digiformaRef }
  );
  return (data?.session?.trainees || []).map(mapTrainee);
}

/** Sessions Digiforma sans leurs stagiaires (requête légère, pour trier avant d'importer). */
export async function digiformaListSessionDates(): Promise<{ hasStatus: boolean; sessions: (Omit<DigiformaSession, 'trainees'> & { status: string | null })[] }> {
  const sh = await sessionShape();
  if (!sh.listField) throw new Error('Digiforma : liste des sessions introuvable dans l’API de ce compte.');
  const data = await digiformaFetch(`{ sessions: ${sh.listField} { id ${sh.name} ${sh.start} ${sh.end} ${sh.status} } }`);
  return {
    hasStatus: Boolean(sh.status),
    sessions: (data?.sessions || []).map((s: any) => ({
      id: String(s.id),
      name: s.name || 'Session Digiforma',
      startAt: s.startDate || null,
      endAt: s.endDate || null,
      status: s.status == null ? null : String(typeof s.status === 'object' ? s.status.name ?? s.status.label ?? JSON.stringify(s.status) : s.status),
    })),
  };
}

/** Session « planifiée » sur Digiforma (statut planifié / confirmé). */
export function isPlannedStatus(v: string | null): boolean {
  const t = (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // Planifiée, ou déjà en cours (parcours d'un an commencé, avec des modules à venir).
  if (/annul|cancel|abandon|termin|finish|done|archiv|draft|brouillon|lost|perdu|prospect|devis|quote/.test(t)) return false;
  return /planifi|planned|scheduled|confirm|en.?cours|ongoing|in.?progress|started|running|current|open/.test(t);
}


/* ------------------------------------------------------------------------
 * Modules d'une session Digiforma (une session peut durer un an : ce sont
 * les modules, avec leurs propres dates, qui se placent sur le planning).
 * ---------------------------------------------------------------------- */

export type DigiformaModule = {
  key: string;
  name: string | null;
  start: string;
  end: string;
  startTime: string | null;
  endTime: string | null;
  slotIds?: string[];
  /** Pas de stagiaire en salle ce jour-là (entreprise, stage) d'après Digiforma. */
  offsite?: boolean;
  /** À distance (e-learning, distanciel) : pas de salle. */
  remote?: boolean;
  /** Salle indiquée sur Digiforma (la plus fréquente des créneaux), sinon celle de la session. */
  room?: string | null;
  /** Intervenants indiqués sur Digiforma (créneaux, sinon session), du plus présent au moins présent. */
  trainers?: DigiformaPerson[];
  /** Jours qui ont vraiment un créneau sur Digiforma (« AAAA-MM-JJ ») : les autres jours ouvrés ne sont pas des jours de formation. */
  days?: string[];
  /** Horaire réel de chaque jour (demi-journées comprises : 08:30–12:00 le dernier jour d'un recyclage d'1,5 jour). */
  dayTimes?: DayTime[];
};
/** slots : créneaux Digiforma du jour ; who : stagiaires prévus ce jour-là d'après l'émargement Digiforma. */
export type DayTime = { day: string; start: string | null; end: string | null; slots?: string[]; who?: string[] };

/** Créneaux → horaire de chaque jour (du début du premier au fin du dernier créneau de la journée). */
function dayTimesOf(list: { key?: string; start: string; startTime?: string | null; endTime?: string | null }[]): DayTime[] {
  const by = new Map<string, DayTime>();
  for (const x of list) {
    const day = String(x.start).slice(0, 10);
    const st = x.startTime ? String(x.startTime).slice(0, 5) : null;
    const en = x.endTime ? String(x.endTime).slice(0, 5) : null;
    const e = by.get(day);
    if (!e) by.set(day, { day, start: st, end: en, slots: x.key ? [String(x.key)] : [] });
    else {
      if (x.key) (e.slots ||= []).push(String(x.key));
      if (st && (!e.start || st < e.start)) e.start = st;
      if (en && (!e.end || en > e.end)) e.end = en;
    }
  }
  return [...by.values()].sort((a, b) => a.day.localeCompare(b.day));
}
export type DigiformaPerson = { name: string; email: string | null };
export type DigiformaSessionModules = { id: string; name: string; status: string | null; startAt: string | null; endAt: string | null; modules: DigiformaModule[]; fromSubsessions?: boolean };

/** Champs d'un type « daté » (sous-session, créneau) : nom, début, fin, heures, stagiaires. */
function datedShape(f: Record<string, string[]>, type: string | null) {
  const ml = type ? f[`${type}#leaf`] : undefined;
  const mf = type ? f[type] : undefined;
  const startF = pick(ml, ['startDate', 'startAt', 'start', 'beginDate', 'dateStart', 'date', 'day']);
  return {
    type,
    dated: Boolean(startF),
    id: pick(ml, ['id', 'uuid']),
    name: sel('name', pick(ml, ['name', 'customName', 'title', 'label'])),
    start: sel('startDate', startF),
    end: sel('endDate', pick(ml, ['endDate', 'endAt', 'end', 'finishDate', 'dateEnd', 'date', 'day'])),
    startTime: sel('startTime', pick(ml, ['startTime', 'startHour', 'from', 'beginTime'])),
    endTime: sel('endTime', pick(ml, ['endTime', 'endHour', 'to', 'finishTime'])),
    trainees: pick(mf, ['trainees', 'students', 'participants']),
  };
}

/**
 * Où sont les « modules » datés d'une session Digiforma :
 *  · sous-sessions (parcours, GEIQ…) : un module = une sous-session ;
 *  · sinon créneaux (dates) : regroupés en blocs de jours qui se suivent.
 * Le champ « modules » de Digiforma (e-learning, sans dates) est ignoré.
 */
async function moduleShape() {
  const f = await schemaFields();
  const sessT = f.TrainingSession ? 'TrainingSession' : 'Session';
  const leaf = f[`${sessT}#leaf`] || [];
  const objFields = (f[sessT] || []).filter((n) => !leaf.includes(n));
  const typeOf = (field: string | null) => (field ? f[`${sessT}.${field}#type`]?.[0] || null : null);
  const firstDated = (cands: string[]) => {
    for (const c of cands) {
      if (!objFields.includes(c)) continue;
      const sh = datedShape(f, typeOf(c));
      if (sh.dated) return { field: c, ...sh };
    }
    return null;
  };
  const sub = firstDated(['subsessions', 'subSessions', 'childSessions', 'trainingModules', 'sessionModules', 'modules']);
  const slots = firstDated(['trainingSessionSlots', 'slots', 'dates', 'sessionDates', 'days']);
  // Module du créneau (Digiforma : TrainingSessionSlot.subsession) : nom du module de chaque jour.
  let slotModule: { field: string; id: string | null; name: string | null; off: string | null; modality: string | null } | null = null;
  if (slots?.type) {
    const sf = f[slots.type] || [];
    const sl = f[`${slots.type}#leaf`] || [];
    const field = ['subsession', 'subSession', 'module', 'trainingModule'].find((n) => sf.includes(n) && !sl.includes(n)) || null;
    const t = field ? f[`${slots.type}.${field}#type`]?.[0] || null : null;
    if (field && t)
      slotModule = {
        field,
        id: pick(f[`${t}#leaf`], ['id']),
        name: pick(f[`${t}#leaf`], ['name', 'customName', 'title', 'label']),
        off: pick(f[`${t}#leaf`], ['noTraineeOnClassroom']),
        modality: pick(f[`${t}#leaf`], ['modality']),
      };
  }
  // Sous-sessions sans dates propres (GEIQ) : leur nom + la liste de leurs créneaux → module de chaque jour.
  let subNames: { field: string; type: string; id: string | null; name: string | null; slotList: string | null; off: string | null; modality: string | null } | null = null;
  const subField = ['subsessions', 'subSessions', 'childSessions'].find((n) => objFields.includes(n)) || null;
  const subT = typeOf(subField);
  if (subField && subT) {
    const lf = f[`${subT}#leaf`] || [];
    const slotList = slots?.type ? (f[subT] || []).find((n) => f[`${subT}.${n}#type`]?.[0] === slots.type) || null : null;
    subNames = {
      field: subField,
      type: subT,
      id: pick(lf, ['id']),
      name: pick(lf, ['name', 'customName', 'title', 'label', 'code']),
      slotList,
      off: pick(lf, ['noTraineeOnClassroom']),
      modality: pick(lf, ['modality']),
    };
  }
  return { sub, slots, slotModule, subNames };
}

/*
 * Salle et intervenants : sur chaque créneau (TrainingSessionSlot.room,
 * .trainingSessionInstructors) et sur la session. Les champs sont lus dans le
 * schéma ; si l'API les refuse, la synchronisation continue sans eux.
 */
let placeFieldsBroken = false;

async function placeParts(type: string | null): Promise<string> {
  if (!type || placeFieldsBroken) return '';
  const f = await schemaFields();
  const fields = f[type] || [];
  const leaf = f[`${type}#leaf`] || [];
  const typeOf = (field: string) => f[`${type}.${field}#type`]?.[0] || null;
  const parts: string[] = [];
  const roomF = pick(fields, ['room', 'classroom', 'trainingRoom']);
  if (roomF) {
    if (leaf.includes(roomF)) parts.push(`rm: ${roomF}`);
    else {
      const rt = typeOf(roomF);
      const n = rt ? pick(f[`${rt}#leaf`], ['name', 'label', 'title', 'code']) : null;
      if (n) parts.push(`rm: ${roomF} { n: ${n} }`);
    }
  }
  const insF = pick(fields, ['trainingSessionInstructors', 'instructors', 'trainers']);
  const it = insF && !leaf.includes(insF) ? typeOf(insF) : null;
  if (insF && it) {
    const who = (t: string) => {
      const l = f[`${t}#leaf`] || [];
      const fn = pick(l, ['firstname', 'firstName', 'first_name']);
      const ln = pick(l, ['lastname', 'lastName', 'last_name']);
      const full = !fn && !ln ? pick(l, ['fullName', 'name']) : null;
      const em = pick(l, ['email', 'mail']);
      const sub = [fn ? `fn: ${fn}` : '', ln ? `ln: ${ln}` : '', full ? `full: ${full}` : '', em ? `em: ${em}` : ''].filter(Boolean).join(' ');
      return sub;
    };
    const direct = who(it);
    if (/fn:|ln:|full:/.test(direct)) parts.push(`ins: ${insF} { ${direct} }`);
    else {
      const inner = ['instructor', 'trainer', 'user', 'person'].find((n) => (f[it] || []).includes(n) && !(f[`${it}#leaf`] || []).includes(n));
      const jt = inner ? f[`${it}.${inner}#type`]?.[0] : null;
      const nested = jt ? who(jt) : '';
      if (inner && /fn:|ln:|full:/.test(nested)) parts.push(`ins: ${insF} { one: ${inner} { ${nested} } }`);
    }
  }
  return parts.join(' ');
}

const roomOf = (x: any): string | null => {
  const v = typeof x?.rm === 'string' ? x.rm : x?.rm?.n;
  return v && String(v).trim() ? String(v).trim() : null;
};
const peopleOf = (x: any): DigiformaPerson[] =>
  ((x?.ins as any[]) || [])
    .map((i) => i?.one || i)
    .map((p) => ({ name: String(p?.full || [p?.fn, p?.ln].filter(Boolean).join(' ') || '').trim(), email: p?.em ? String(p.em).trim() : null }))
    .filter((p) => p.name || p.email);

/** Salle la plus fréquente et intervenants (du plus présent au moins présent) d'une liste de créneaux. */
function placeOf(list: { room?: string | null; trainers?: DigiformaPerson[] }[]): { room: string | null; trainers: DigiformaPerson[] } {
  const rooms = new Map<string, number>();
  const ppl = new Map<string, { p: DigiformaPerson; n: number }>();
  for (const x of list) {
    if (x.room) rooms.set(x.room, (rooms.get(x.room) || 0) + 1);
    for (const t of x.trainers || []) {
      const k = (t.email || t.name).toLowerCase();
      const e = ppl.get(k);
      if (e) e.n++;
      else ppl.set(k, { p: t, n: 1 });
    }
  }
  const room = [...rooms].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { room, trainers: [...ppl.values()].sort((a, b) => b.n - a.n).map((e) => e.p) };
}

/** Structure Digiforma détectée (diagnostic, Administration → Intégrations). */
export async function digiformaStructure(): Promise<string> {
  const f = await schemaFields();
  const sh = await sessionShape();
  const ms = await moduleShape();
  const sessT = f.TrainingSession ? 'TrainingSession' : 'Session';
  const lines = [
    `Requêtes : sessions = ${sh.listField || '?'}, session = ${sh.oneField || '?'}`,
    `${sessT} : ${(f[sessT] || []).join(', ')}`,
    `Statut utilisé : ${sh.status || 'aucun'} · dates : ${sh.start || '?'} / ${sh.end || '?'}`,
    `Modules (sous-sessions) : ${ms.sub ? `${ms.sub.field} (${ms.sub.type}) · ${ms.sub.name || '-'} ${ms.sub.start} ${ms.sub.end} ${ms.sub.trainees ? '· stagiaires' : ''}` : 'aucun'}`,
    `Créneaux : ${ms.slots ? `${ms.slots.field} (${ms.slots.type}) · ${ms.slots.start} ${ms.slots.startTime} ${ms.slots.endTime} · module du créneau : ${ms.slotModule ? `${ms.slotModule.field} (${ms.slotModule.name || 'sans nom'})` : 'aucun'}` : 'aucun'}`,
  ];
  const st = await statusShape();
  lines.push(
    `Inscriptions : ${st.custField ? `${st.custField} (${st.custT}) statut ${st.custStatus || 'aucun'}${st.custStatus2 ? ` + ${st.custStatus2}` : ''}, stagiaires ${st.custTrainees || (st.ctField ? `${st.ctField}.${st.ctTrainee}` : st.custTrainee) || 'aucun'}` : 'aucune'} · abandons : ${st.abField ? `${st.abField} (${st.abT}${st.abFlag ? `, ${st.abFlag}` : ''}${st.abBack ? `, ${st.abBack}` : ''})` : 'aucun'}`
  );
  lines.push(`${st.traineeT} : ${(f[st.traineeT] || []).join(', ')}`);
  if (st.custT) lines.push(`${st.custT} : ${(f[st.custT] || []).join(', ')}`);
  if (st.abT && !st.abDirect) lines.push(`${st.abT} : ${(f[st.abT] || []).join(', ')}`);
  if (ms.sub?.type) lines.push(`${ms.sub.type} : ${(f[ms.sub.type] || []).join(', ')}`);
  if (ms.subNames) lines.push(`Sous-sessions ${ms.subNames.field} (${ms.subNames.type}) : nom ${ms.subNames.name || 'aucun'}, créneaux ${ms.subNames.slotList || 'aucun'} · champs : ${(f[ms.subNames.type] || []).join(', ')}`);
  const ds = await datesShape();
  if (ds) lines.push(`Dates et prix (dates → ${ds.type}) : ${ds.usable ? 'module lu ici' : 'pas de module'} · champs : ${(f[ds.type] || []).join(', ')}`);
  const progT = f[`${sessT}.program#type`]?.[0];
  if (progT) lines.push(`Programme (${progT}) : ${(f[progT] || []).join(', ')}`);
  if (ms.slots?.type) lines.push(`${ms.slots.type} : ${(f[ms.slots.type] || []).join(', ')}`);
  lines.push(`Salle / intervenants lus : créneau « ${(await placeParts(ms.slots?.type || null)) || 'rien'} » · session « ${(await placeParts(sessT)) || 'rien'} »${placeFieldsBroken ? ' (refusés par l’API : ignorés)' : ''}`);
  return lines.join('\n');
}

/** Sessions Digiforma avec leurs modules datés (sans stagiaires : requête légère). */
/** Morceaux de requête : créneaux (avec leur module) et sous-sessions d'une session. */
async function moduleQueryParts(): Promise<string> {
  const ms = await moduleShape();
  const part = (alias: string, d: NonNullable<typeof ms.sub>, withName: boolean) =>
    `${alias}: ${d.field} { ${[d.id ? sel('id', d.id) : '', withName ? d.name : '', d.start, d.end, d.startTime, d.endTime].filter(Boolean).join(' ')} }`;
  const smd = ms.slotModule;
  const slotMod =
    smd && (smd.id || smd.name)
      ? `mod: ${smd.field} { ${[smd.id ? sel('id', smd.id) : '', smd.name ? sel('name', smd.name) : '', smd.off ? `off: ${smd.off}` : '', smd.modality ? `modality: ${smd.modality}` : ''].join(' ')} }`
      : '';
  const slotPlace = ms.slots ? await placeParts(ms.slots.type) : '';
  const slots = ms.slots
    ? `slots: ${ms.slots.field} { ${[ms.slots.id ? sel('id', ms.slots.id) : '', ms.slots.name, ms.slots.start, ms.slots.end, ms.slots.startTime, ms.slots.endTime, slotMod, slotPlace].filter(Boolean).join(' ')} }`
    : '';
  // Sous-session du même type qu'une session : ses créneaux aussi (découpage par semaine).
  const sessTypeName = (await schemaFields()).TrainingSession ? 'TrainingSession' : 'Session';
  const subs = ms.sub
    ? `subs: ${ms.sub.field} { ${[ms.sub.id ? sel('id', ms.sub.id) : '', ms.sub.name, ms.sub.start, ms.sub.end, ms.sub.startTime, ms.sub.endTime].filter(Boolean).join(' ')} ${ms.sub.type === sessTypeName && slots ? slots : ''} }`
    : '';
  const sn = ms.subNames && ms.subNames.name && ms.subNames.slotList ? ms.subNames : null;
  const subNamesPart = sn
    ? `subn: ${sn.field} { ${sn.id ? sel('id', sn.id) : ''} name: ${sn.name} ${sn.off ? `off: ${sn.off}` : ''} ${sn.modality ? `modality: ${sn.modality}` : ''} sl: ${sn.slotList} { id } }`
    : '';
  return `${subs} ${slots} ${subNamesPart}`;
}

/** Session Digiforma brute (avec créneaux / sous-sessions) → modules datés et nommés. */
function toSessionModules(s: any): DigiformaSessionModules {
  const mapDated = (m: any, i: number) => ({
    key: String(m.id ?? `${i}-${m.startDate || ''}`),
    // Créneau : nom de son module (sous-session) ; sinon son propre nom.
    name: String(m.mod?.name || m.name || '').trim() || null,
    start: m.startDate || null,
    end: m.endDate || m.startDate || null,
    startTime: m.startTime || null,
    endTime: m.endTime || null,
    room: roomOf(m),
    trainers: peopleOf(m),
  });

      // Sous-sessions (modules d'un parcours GEIQ…) : une longue sous-session est découpée par semaine
      // d'après ses créneaux ; chaque bloc garde le nom du module.
      const subsList: DigiformaModule[] = (s.subs || []).flatMap((sub: any, i: number) => {
        const m = mapDated(sub, i);
        if (!m.start) return [];
        const subSlots = (sub.slots || []).map(mapDated).filter((x: any) => x.start);
        const long = m.end && day(m.end) - day(m.start) > 6 * 86400000;
        if (!long || !subSlots.length)
          return long ? [] : [{ ...m, ...(subSlots.length ? { ...placeOf(subSlots), days: [...new Set(subSlots.map((x: any) => String(x.start).slice(0, 10)))].sort(), dayTimes: dayTimesOf(subSlots) } : {}) }];
        return slotBlocks(subSlots.map((x: any) => ({ ...x, name: x.name || m.name }))).map((b) => ({ ...b, key: `${m.key}~${b.start.slice(0, 10)}` }));
      });
      // Sans sous-session : créneaux en blocs par semaine (et par module si le créneau en porte le nom).
      // Créneau → module : par sa sous-session, sinon par la liste des créneaux de chaque sous-session.
      const bySlot = new Map<string, { name: string | null; off: boolean; remote: boolean }>();
      for (const sub of s.subn || []) {
        const info = {
          name: sub.name ? String(sub.name) : null,
          off: sub.off === true || /entreprise|company|stage|work|alternance|terrain/i.test(String(sub.modality ?? '')),
          remote: /distan|remote|e.?learning|foad|online|virtual|visio/i.test(String(sub.modality ?? '')),
        };
        for (const sl of sub.sl || []) bySlot.set(String(sl.id), info);
      }
      const slotsList = (s.slots || [])
        .map((x: any, i: number) => {
          const info = bySlot.get(String(x.id));
          const modOff = x.mod ? x.mod.off === true || /entreprise|company|stage|work|alternance|terrain/i.test(String(x.mod.modality ?? '')) : false;
          const modRemote = x.mod ? /distan|remote|e.?learning|foad|online|virtual|visio/i.test(String(x.mod.modality ?? '')) : false;
          return { ...mapDated(x, i), name: String(x.mod?.name || info?.name || x.name || '').trim() || null, offsite: modOff || Boolean(info?.off), remote: modRemote || Boolean(info?.remote) };
        })
        .filter((m: any) => m.start);
      // Salle / intervenants : ceux des créneaux du module, sinon ceux de la session.
      const sessRoom = roomOf(s);
      const sessPeople = peopleOf(s);
      const modules = (subsList.length ? subsList : slotBlocks(slotsList)).map((m) => ({
        ...m,
        room: m.room || sessRoom,
        trainers: m.trainers?.length ? m.trainers : sessPeople,
      }));
      return {
        fromSubsessions: subsList.length > 0,
        id: String(s.id),
        name: s.name || 'Session Digiforma',
        status: s.status == null ? null : String(typeof s.status === 'object' ? s.status.name ?? s.status.label ?? '' : s.status),
        startAt: s.startDate || null,
        endAt: s.endDate || null,
        modules,
      };

}

/** Liste légère des sessions (nom, dates, statut) : rapide même avec des milliers de sessions. */
export async function digiformaListSessionsLight(): Promise<{ hasStatus: boolean; sessions: { id: string; name: string; status: string | null; startAt: string | null; endAt: string | null }[] }> {
  const sh = await sessionShape();
  if (!sh.listField) throw new Error('Digiforma : liste des sessions introuvable dans l’API de ce compte.');
  const data = await digiformaFetch(`{ sessions: ${sh.listField} { id ${sh.name} ${sh.start} ${sh.end} ${sh.status} } }`);
  return {
    hasStatus: Boolean(sh.status),
    sessions: (data?.sessions || []).map((s: any) => ({
      id: String(s.id),
      name: s.name || 'Session Digiforma',
      status: s.status == null ? null : String(typeof s.status === 'object' ? s.status.name ?? s.status.label ?? '' : s.status),
      startAt: s.startDate || null,
      endAt: s.endDate || null,
    })),
  };
}

/** Modules d'une seule session (créneaux, sous-sessions) : une requête par session. */
export async function digiformaSessionModules(id: string): Promise<DigiformaSessionModules> {
  const sh = await sessionShape();
  if (!sh.oneField) throw new Error('Digiforma : session introuvable dans l’API de ce compte.');
  const f = await schemaFields();
  const ask = async () =>
    digiformaFetch(
      `query($id: ID!) { s: ${sh.oneField}(id: $id) { id ${sh.name} ${sh.start} ${sh.end} ${sh.status} ${await placeParts(f.TrainingSession ? 'TrainingSession' : 'Session')} ${await moduleQueryParts()} } }`,
      { id }
    );
  let data;
  try {
    data = await ask();
  } catch (e: any) {
    // Salle / intervenants refusés par l'API de ce compte : on continue sans eux.
    if (placeFieldsBroken || /délai|injoignable|refusée/.test(String(e?.message))) throw e;
    placeFieldsBroken = true;
    data = await ask();
  }
  return toSessionModules(data?.s || { id });
}

/** Ancienne liste complète (toutes les sessions avec leurs créneaux) : trop lourde, gardée pour compatibilité. */
export async function digiformaListModules(): Promise<{ hasStatus: boolean; hasModules: boolean; sessions: DigiformaSessionModules[] }> {
  const sh = await sessionShape();
  const ms = await moduleShape();
  if (!sh.listField) throw new Error('Digiforma : liste des sessions introuvable dans l’API de ce compte.');
  const data = await digiformaFetch(`{ sessions: ${sh.listField} { id ${sh.name} ${sh.start} ${sh.end} ${sh.status} ${await moduleQueryParts()} } }`);
  return { hasStatus: Boolean(sh.status), hasModules: Boolean(ms.sub || ms.slots), sessions: (data?.sessions || []).map(toSessionModules) };
}

const day = (v: string) => new Date(v.slice(0, 10) + 'T12:00:00Z').getTime();
const mondayOfIso = (v: string) => {
  const d = new Date(v.slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

/**
 * Créneaux → modules : un bloc par semaine (lundi → dimanche) et par module
 * (nom du créneau). Les parcours longs (GEIQ…) donnent ainsi les jours
 * réellement prévus chaque semaine, avec le module de la semaine.
 */
function slotBlocks(slots: DigiformaModule[]): DigiformaModule[] {
  const sorted = [...slots].sort((a, b) => `${a.start}${a.startTime || ''}`.localeCompare(`${b.start}${b.startTime || ''}`));
  const out: DigiformaModule[] = [];
  const members = new Map<DigiformaModule, DigiformaModule[]>();
  for (const sl of sorted) {
    const last = out[out.length - 1];
    const sameWeek = last && mondayOfIso(sl.start) === mondayOfIso(last.start);
    const sameModule = last && (last.name || '') === (sl.name || '');
    if (last && sameWeek && sameModule && day(sl.start) - day(last.end) <= 3 * 86400000) {
      if (day(sl.end || sl.start) >= day(last.end)) {
        last.end = sl.end || sl.start;
        last.endTime = sl.endTime;
      }
      last.slotIds!.push(sl.key);
      members.get(last)!.push(sl);
    } else {
      out.push({
        key: `bloc-${sl.start.slice(0, 10)}${sl.name ? `-${sl.name.slice(0, 40)}` : ''}`,
        name: sl.name,
        start: sl.start,
        end: sl.end || sl.start,
        startTime: sl.startTime,
        endTime: sl.endTime,
        slotIds: [sl.key],
        offsite: sl.offsite,
        remote: sl.remote,
      });
      members.set(out[out.length - 1], [sl]);
    }
  }
  return out.map((b) => ({
    ...b,
    ...placeOf(members.get(b) || []),
    days: [...new Set((members.get(b) || []).map((x) => x.start.slice(0, 10)))].sort(),
    dayTimes: dayTimesOf(members.get(b) || []),
  }));
}

/** Stagiaires d'une session Digiforma, et par module quand l'API les donne. */
export async function digiformaSessionDetail(id: string): Promise<{
  trainees: DigiformaTrainee[];
  byModule: Record<string, DigiformaTrainee[]>;
  bySlot: Record<string, string[]>;
  /** Modules (sous-sessions) cochés pour chaque stagiaire sur Digiforma. */
  subsOf: Record<string, string[]>;
  /** Clients entreprise (places réservées par entreprise). */
  companies: DigiformaCompany[];
}> {
  const sh = await sessionShape();
  const ms = await moduleShape();
  if (!sh.oneField) throw new Error('Digiforma : session introuvable dans l’API de ce compte.');
  const tSel = await traineeSelection();
  const sessTypeName = (await schemaFields()).TrainingSession ? 'TrainingSession' : 'Session';
  const ask = async () => {
    const stPart = await statusPart();
    const stNamed = await statusPart(true); // session : nom des clients particuliers, pour les ajouter s'ils manquent
    const modPart = ms.sub && ms.sub.trainees ? `subs: ${ms.sub.field} { ${ms.sub.id ? sel('id', ms.sub.id) : ''} ${ms.sub.start} trainees: ${ms.sub.trainees} { ${tSel} } ${ms.sub.type === sessTypeName ? stPart : ''} }` : '';
    const sessT = sh.trainees ? `trainees: ${sh.trainees} { ${tSel} }` : '';
    const att = await slotAttendancePart();
    return digiformaFetch(`query($id: ID!) { session: ${sh.oneField}(id: $id) { id ${sessT} ${stNamed} ${modPart} ${att} } }`, { id });
  };
  let data;
  try {
    data = await ask();
  } catch (e: any) {
    // Champ « entité du client » refusé par l'API de ce compte : on continue sans (comme avant).
    if ((entityBroken && subsBroken) || /délai|injoignable|refusée/.test(String(e?.message))) throw e;
    // D'abord sans les modules cochés, puis sans les clients particuliers.
    if (!subsBroken) subsBroken = true;
    else entityBroken = true;
    try {
      data = await ask();
    } catch (e2: any) {
      if (entityBroken || /délai|injoignable|refusée/.test(String(e2?.message))) throw e2;
      entityBroken = true;
      data = await ask();
    }
  }
  // Présence par créneau : stagiaires réellement prévus ce jour-là (inscrits d'une entreprise + clients particuliers).
  const bySlot: Record<string, string[]> = {};
  for (const sl of data?.session?.att || [])
    bySlot[String(sl.id)] = [
      ...(sl.ct || []).map((c: any) => String(c.one?.id ?? c.id ?? '')),
      ...(sl.cu || []).map((c: any) => String(particulierOf(c)?.id ?? '')),
    ].filter(Boolean);
  const byModule: Record<string, DigiformaTrainee[]> = {};
  (data?.session?.subs || []).forEach((m: any, i: number) => {
    const raw = m.trainees || [];
    byModule[String(m.id ?? `${i}-${m.startDate || ''}`)] = applyStatus(raw.map(mapTrainee), m, raw);
  });
  const raw = [...(data?.session?.trainees || [])];
  // Clients particuliers absents de la liste des stagiaires de la session : ajoutés.
  const known = new Set(raw.map((t: any) => String(t.id)));
  const partIds = new Set<string>();
  for (const r of data?.session?.regs || []) {
    const p = particulierOf(r);
    if (p) {
      partIds.add(String(p.id));
      seenParticuliers.add(String(p.id));
    }
    // Stagiaires de chaque client (entreprise ou particulier), prospects en attente compris : ajoutés s'ils manquent.
    for (const w of [...(r.who || []), ...((r.ct || []).map((c: any) => c?.one).filter(Boolean)), ...(r.one ? [r.one] : []), ...(p ? [p] : [])]) {
      if (w?.id == null || known.has(String(w.id)) || !(w.firstName || w.lastName || w.email)) continue;
      raw.push(w);
      known.add(String(w.id));
    }
  }
  // Entreprise de chaque apprenant (client entreprise) et places prévues par entreprise.
  const companyOf = new Map<string, string>();
  const companies: DigiformaCompany[] = [];
  for (const r of data?.session?.regs || []) {
    if (particulierOf(r)) continue;
    const name = String(r.co?.cn || '').trim();
    const pick2 = (v: unknown) => (v == null || /^\s*\d*\s*$/.test(String(v)) ? null : v);
    const st = registrationOf(pick2(r.regStatus2) ?? pick2(r.regStatus));
    if (st === 'exclu') continue;
    const people = [...(r.who || []), ...((r.ct || []).map((c: any) => c?.one).filter(Boolean)), ...(r.one ? [r.one] : [])].filter((w: any) => w?.id != null);
    const real = people.filter((w: any) => !isPlaceholder(mapTrainee(w)));
    if (name) for (const w of real) companyOf.set(String(w.id), name);
    const cnt = Number(r.cnt);
    const total = Math.max(Number.isFinite(cnt) ? cnt : 0, people.length);
    if (!name || !total) continue;
    companies.push({ name, status: st, total, named: real.map((w: any) => String(w.id)), subs: ((r.css as any[]) || []).map((x) => String(x?.n || '')).filter(Boolean) });
  }
  const trainees = applyStatus(raw.map(mapTrainee), data?.session, raw).map((t) => ({ ...t, ...(partIds.has(t.id) ? { particulier: true } : {}), ...(companyOf.has(t.id) ? { company: companyOf.get(t.id) } : {}) }));
  // Modules cochés par stagiaire (inscription du stagiaire, sinon celles du client).
  const subsOf: Record<string, string[]> = {};
  for (const r of data?.session?.regs || []) {
    const cust = ((r.css as any[]) || []).map((x) => String(x?.n || '')).filter(Boolean);
    for (const c of (r.ct as any[]) || []) {
      const tid = c?.one?.id != null ? String(c.one.id) : null;
      if (!tid) continue;
      const own = ((c.ss as any[]) || []).map((x) => String(x?.n || '')).filter(Boolean);
      if (own.length) subsOf[tid] = own;
      else if (cust.length) subsOf[tid] = cust;
    }
    const p = particulierOf(r);
    if (p && cust.length) subsOf[String(p.id)] = cust;
  }
  return { trainees, byModule, bySlot, subsOf, companies };
}

/**
 * Émargement Digiforma : pour chaque jour, les stagiaires prévus sur ses créneaux
 * (seulement si tous les créneaux du jour sont connus). Les numéros de créneaux ne sont pas gardés.
 */
export function withAttendance(days: DayTime[] | undefined, bySlot: Record<string, string[]> | undefined): DayTime[] | undefined {
  if (!days) return days;
  return days.map(({ slots, who: _w, ...d }) => {
    const known = (slots || []).length > 0 && (slots || []).every((id) => bySlot && id in bySlot);
    return known ? { ...d, who: [...new Set((slots || []).flatMap((id) => bySlot![id]))] } : d;
  });
}

/** Date / heure Digiforma → heure locale du planning (« AAAA-MM-JJTHH:MM:00 »). */
export function toWallClock(v: string, time: string | null, fallback: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const t = (time || '').match(/^(\d{1,2}):(\d{2})/);
    return `${v}T${t ? `${t[1].padStart(2, '0')}:${t[2]}` : fallback}:00`;
  }
  const d = new Date(v);
  if (isNaN(d.getTime())) return `${v.slice(0, 10)}T${fallback}:00`;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  // Date sans heure (minuit) : horaires par défaut de la journée.
  const hm = `${p.hour}:${p.minute}`;
  return `${p.year}-${p.month}-${p.day}T${hm === '00:00' && !time ? fallback : hm}:00`;
}


/* ------------------------------------------------------------------------
 * Statut d'inscription des stagiaires (indécis, confirmé, annulé…) :
 * sur le stagiaire, ou sur l'inscription du client de la session
 * (« customers »), et départs (« abandons »). Détecté dans le schéma.
 * ---------------------------------------------------------------------- */

const STATUS_RE = /status|state|pipeline|stage|registration|inscription|crm/i;

async function statusShape() {
  const f = await schemaFields();
  const sessT = f.TrainingSession ? 'TrainingSession' : 'Session';
  const traineeT = f.Trainee ? 'Trainee' : f.Student ? 'Student' : 'Participant';
  const typeOf = (t: string, field: string) => f[`${t}.${field}#type`]?.[0] || null;
  // Le statut du stagiaire lui-même (fiche globale, DPC…) ne dit rien de son inscription à la session : ignoré.
  const traineeStatus = null as string | null;
  const custField = pick(f[sessT], ['customers', 'clients', 'registrations', 'inscriptions']);
  const custT = custField ? typeOf(sessT, custField) : null;
  const custLeaf = custT ? f[`${custT}#leaf`] || [] : [];
  const custStatus = pick(custLeaf, ['pipelineState', 'crmStatus', 'status', 'state']);
  const custStatus2 = custStatus === 'pipelineState' ? pick(custLeaf, ['crmStatus']) : null;
  const custTrainees = custT ? pick(f[custT], ['trainees', 'students', 'participants']) : null;
  // Digiforma : Customer.customerTrainees → { trainee }.
  const ctField = custT && !custTrainees ? pick(f[custT], ['customerTrainees', 'registrations']) : null;
  const ctT = ctField ? typeOf(custT!, ctField) : null;
  const ctTrainee = ctT ? pick(f[ctT], ['trainee', 'student', 'participant']) : null;
  const custTrainee = custT && !custTrainees && !ctTrainee ? pick(f[custT], ['trainee', 'student', 'participant']) : null;
  const abField = pick(f[sessT], ['abandons', 'withdrawals', 'dropouts']);
  const abT = abField ? typeOf(sessT, abField) : null;
  const abDirect = abT === traineeT;
  const abTrainee = abT && !abDirect ? pick(f[abT], ['trainee', 'student', 'participant']) : null;
  const abLeaf = abT ? f[`${abT}#leaf`] || [] : [];
  const abFlag = pick(abLeaf, ['isAbandon']);
  const abBack = pick(abLeaf, ['isBack']);
  return { traineeT, traineeStatus, custField, custT, custStatus, custStatus2, custTrainees, ctField, ctTrainee, custTrainee, abField, abT, abDirect, abTrainee, abFlag, abBack };
}

/*
 * Client particulier : sur Digiforma, le client EST le stagiaire (Customer.entity
 * = un stagiaire, sans « customerTrainees »). Sans ce champ, ces stagiaires
 * manquaient (6 apprenants sur Digiforma, 4 sur la plateforme).
 */
let entityBroken = false;
async function particulierPart(custT: string | null, sub: string): Promise<string> {
  if (!custT || entityBroken) return '';
  const f = await schemaFields();
  const traineeT = f.Trainee ? 'Trainee' : f.Student ? 'Student' : 'Participant';
  const entF = pick(f[custT], ['entity', 'client', 'customerEntity']);
  if (!entF || (f[`${custT}#leaf`] || []).includes(entF)) return '';
  const et = f[`${custT}.${entF}#type`]?.[0];
  if (!et) return '';
  if (et === traineeT) return `pt: ${entF} { ${sub} }`;
  const kind = f[`${et}#kind`]?.[0];
  if ((kind === 'UNION' || kind === 'INTERFACE') && (f[`${et}#possible`] || []).includes(traineeT)) return `pt: ${entF} { __typename ... on ${traineeT} { ${sub} } }`;
  return '';
}
/*
 * Modules suivis : sur Digiforma, chaque stagiaire d'un client est coché sur
 * les sous-sessions qu'il suit (ex. « INITIAL ACC BT » toute la semaine,
 * « RECYCLAGE ACC BT » le mercredi). Lu sur l'inscription du stagiaire
 * (CustomerTrainee.subsessions), sinon sur le client (Customer.subsessions).
 */
let subsBroken = false;
async function subsessionsOfRegistration(custT: string | null, ctField: string | null): Promise<{ ct: string; cust: string }> {
  const none = { ct: '', cust: '' };
  if (!custT || subsBroken) return none;
  const f = await schemaFields();
  const sessT = f.TrainingSession ? 'TrainingSession' : 'Session';
  const subT = f[`${sessT}.subsessions#type`]?.[0] || f[`${sessT}.subSessions#type`]?.[0] || (f.Subsession ? 'Subsession' : null);
  if (!subT) return none;
  const nameF = pick(f[`${subT}#leaf`], ['name', 'customName', 'title', 'label']);
  if (!nameF) return none;
  const listOf = (t: string | null) => (t ? (f[t] || []).find((n) => f[`${t}.${n}#type`]?.[0] === subT) || null : null);
  const ctT = ctField ? f[`${custT}.${ctField}#type`]?.[0] || null : null;
  const ctSub = listOf(ctT);
  const custSub = listOf(custT);
  return {
    ct: ctSub ? `ss: ${ctSub} { id n: ${nameF} }` : '',
    cust: custSub ? `css: ${custSub} { id n: ${nameF} }` : '',
  };
}
/** Entreprise cliente (entité du client = une entreprise) : son nom ; et le nombre d'apprenants prévus s'il existe. */
async function companyPart(custT: string | null): Promise<string> {
  if (!custT || entityBroken) return '';
  const f = await schemaFields();
  const traineeT = f.Trainee ? 'Trainee' : f.Student ? 'Student' : 'Participant';
  const entF = pick(f[custT], ['entity', 'client', 'customerEntity', 'company']);
  const parts: string[] = [];
  const cnt = pick(f[`${custT}#leaf`] || [], ['traineesCount', 'traineeCount', 'nbTrainees', 'numberOfTrainees', 'traineesNumber', 'nbLearners', 'quantity', 'headcount']);
  if (cnt) parts.push(`cnt: ${cnt}`);
  if (entF && !(f[`${custT}#leaf`] || []).includes(entF)) {
    const et = f[`${custT}.${entF}#type`]?.[0];
    const kind = et ? f[`${et}#kind`]?.[0] : null;
    if (et && (kind === 'UNION' || kind === 'INTERFACE')) {
      const comp = (f[`${et}#possible`] || []).filter((t) => t !== traineeT && (f[`${t}#leaf`] || []).includes('name'));
      if (comp.length) parts.push(`co: ${entF} { __typename ${comp.map((t) => `... on ${t} { cn: name }`).join(' ')} }`);
    } else if (et && et !== traineeT && (f[`${et}#leaf`] || []).includes('name')) parts.push(`co: ${entF} { cn: name }`);
  }
  return parts.join(' ');
}

/** Client entreprise d'une session Digiforma : places prévues, apprenants nommés, modules cochés. */
export type DigiformaCompany = { name: string; status: 'validee' | 'en_attente'; total: number; named: string[]; subs: string[] };

const plain = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Le stagiaire suit ce module d'après Digiforma (aucune case connue : oui). */
export function followsModule(subsOf: Record<string, string[]> | undefined, traineeId: string, moduleName: string | null | undefined): boolean {
  const list = subsOf?.[traineeId];
  if (!list?.length || !moduleName) return true;
  const n = plain(moduleName);
  return list.some((x) => plain(x) === n);
}

/** Stagiaire « particulier » d'un client (entité = stagiaire), sinon null. */
const particulierOf = (c: any) => (c?.pt && c.pt.id != null && (!c.pt.__typename || /trainee|student|participant/i.test(c.pt.__typename)) ? c.pt : null);

/** Morceau de requête (session ou sous-session) : statuts d'inscription et abandons. */
async function statusPart(withNames = false): Promise<string> {
  const st = await statusShape();
  const parts: string[] = [];
  // Modules (sous-sessions) cochés pour chaque stagiaire sur Digiforma (ex. INITIAL / RECYCLAGE) : session seulement.
  const ss = withNames ? await subsessionsOfRegistration(st.custT, st.ctField) : { ct: '', cust: '' };
  // Session : fiche complète des stagiaires de chaque client (prospects en attente compris, absents de la liste des stagiaires).
  const tw = withNames ? await traineeSelection() : 'id';
  const whoBase = st.custTrainees ? `who: ${st.custTrainees} { ${tw} }` : st.ctField && st.ctTrainee ? `ct: ${st.ctField} { one: ${st.ctTrainee} { ${tw} } ${ss.ct} }` : st.custTrainee ? `one: ${st.custTrainee} { ${tw} }` : '';
  const pt = await particulierPart(st.custT, tw);
  const co = withNames ? await companyPart(st.custT) : '';
  const who = [whoBase, pt, ss.cust, co].filter(Boolean).join(' ');
  if (st.custField && st.custStatus && who) parts.push(`regs: ${st.custField} { regStatus: ${st.custStatus} ${st.custStatus2 ? `regStatus2: ${st.custStatus2}` : ''} ${who} }`);
  if (st.abField && (st.abDirect || st.abTrainee)) {
    const flags = [st.abFlag ? `isAbandon: ${st.abFlag}` : '', st.abBack ? `isBack: ${st.abBack}` : ''].join(' ');
    parts.push(st.abDirect ? `gone: ${st.abField} { id }` : `gone: ${st.abField} { ${flags} one: ${st.abTrainee} { id } }`);
  }
  return parts.join(' ');
}

/** Valeur de statut → validée / en attente / exclu (annulé, abandon). */
export function registrationOf(v: unknown): 'validee' | 'en_attente' | 'exclu' {
  const t = String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!t) return 'validee';
  if (/annul|cancel|abandon|withdraw|lost|perdu|refus|declin/.test(t)) return 'exclu';
  if (/confirm|valid|accept|won|gagn|inscrit|registered|enrolled|ongoing|finished|termin|complet/.test(t)) return 'validee';
  return 'en_attente'; // indécis, en attente, à confirmer, devis…
}

/** Clients particuliers rencontrés (compte-rendu de synchronisation). */
export const seenParticuliers = new Set<string>();
/** Le champ « entité du client » (clients particuliers) est-il lu ? (diagnostic) */
export const particuliersReadable = () => !entityBroken;

/** Statuts d'inscription rencontrés (compte-rendu de synchronisation). */
export const seenRegStatus = new Map<string, number>();

/** Applique statuts d'inscription et abandons à une liste de stagiaires (bloc renvoyé par statusPart). */
function applyStatus(trainees: DigiformaTrainee[], block: any, rawTrainees: any[]): DigiformaTrainee[] {
  const byId = new Map<string, 'validee' | 'en_attente' | 'exclu'>();
  for (const r of block?.regs || []) {
    // Digiforma : « pipelineState » du client vaut 0 ; le statut réel est « crmStatus » (WON, UNDECIDED, CANCELLED, COMPLETED).
    const pick2 = (v: unknown) => (v == null || /^\s*\d*\s*$/.test(String(v)) ? null : v);
    const st = registrationOf(pick2(r.regStatus2) ?? pick2(r.regStatus));
    seenRegStatus.set(`${r.regStatus ?? '(vide)'}${r.regStatus2 != null ? ` / ${r.regStatus2}` : ''}`, (seenRegStatus.get(`${r.regStatus ?? '(vide)'}${r.regStatus2 != null ? ` / ${r.regStatus2}` : ''}`) || 0) + 1);
    for (const w of [...(r.who || []), ...((r.ct || []).map((c: any) => c.one).filter(Boolean)), ...(r.one ? [r.one] : []), ...(particulierOf(r) ? [particulierOf(r)] : [])]) {
      const prev = byId.get(String(w.id));
      // Le plus restrictif l'emporte (exclu > en attente > validée).
      if (!prev || st === 'exclu' || (st === 'en_attente' && prev === 'validee')) byId.set(String(w.id), st);
    }
  }
  // Abandons : seulement un vrai abandon, sans retour (les absences maladie / justifiées ne comptent pas).
  for (const g of block?.gone || []) {
    if (g.isAbandon === false || g.isBack === true) continue;
    byId.set(String(g.one?.id ?? g.id), 'exclu');
  }
  return trainees
    .map((t, i) => {
      const own = rawTrainees[i]?.regStatus;
      const st = byId.get(t.id) ?? (own !== undefined ? registrationOf(own) : 'validee');
      return st === 'exclu' ? null : { ...t, status: st };
    })
    .filter(Boolean) as DigiformaTrainee[];
}

/** Morceau de requête : stagiaires prévus sur chaque créneau (si l'API le permet). */
async function slotAttendancePart(): Promise<string> {
  const f = await schemaFields();
  const ms = await moduleShape();
  if (!ms.slots?.type) return '';
  const slotT = ms.slots.type;
  const ctField = ['customerTrainees', 'trainees', 'attendees'].find((n) => (f[slotT] || []).includes(n) && !(f[`${slotT}#leaf`] || []).includes(n)) || null;
  if (!ctField) return '';
  const ctT = f[`${slotT}.${ctField}#type`]?.[0] || null;
  if (!ctT) return '';
  // Clients particuliers prévus sur le créneau (Slot.customers → entité = stagiaire).
  const cuField = (f[slotT] || []).includes('customers') ? 'customers' : null;
  const cuT = cuField ? f[`${slotT}.${cuField}#type`]?.[0] || null : null;
  const pt = cuT ? await particulierPart(cuT, 'id') : '';
  const cu = pt ? `cu: ${cuField} { ${pt} }` : '';
  // Directement des stagiaires, ou des inscriptions qui portent un stagiaire.
  if (ctT === (f.Trainee ? 'Trainee' : 'Student')) return `att: ${ms.slots.field} { id ct: ${ctField} { id } ${cu} }`;
  const tr = pick(f[ctT], ['trainee', 'student', 'participant']);
  return tr ? `att: ${ms.slots.field} { id ct: ${ctField} { one: ${tr} { id } } ${cu} }` : '';
}


/* ------------------------------------------------------------------------
 * « Dates et prix » de Digiforma (TrainingSession.dates) : chaque ligne de
 * date peut porter le module de formation. Détecté dans le schéma.
 * ---------------------------------------------------------------------- */

async function datesShape() {
  const f = await schemaFields();
  const sessT = f.TrainingSession ? 'TrainingSession' : 'Session';
  if (!(f[sessT] || []).includes('dates')) return null;
  const t = f[`${sessT}.dates#type`]?.[0] || null;
  if (!t) return null;
  const leaf = f[`${t}#leaf`] || [];
  const obj = (f[t] || []).filter((n) => !leaf.includes(n));
  const startF = pick(leaf, ['startDate', 'date', 'start', 'day', 'from', 'beginDate']);
  if (!startF) return { type: t, leaf, obj, usable: false as const };
  // Nom du module : champ texte, ou objet lié (sous-session, module, programme) qui a un nom.
  const nameLeaf = pick(leaf, ['name', 'title', 'label', 'moduleName', 'subsessionName', 'description']);
  const nameObj = nameLeaf ? null : ['subsession', 'module', 'subProgram', 'program', 'trainingModule'].find((n) => obj.includes(n) && (f[`${f[`${t}.${n}#type`]?.[0]}#leaf`] || []).includes('name')) || null;
  return {
    type: t,
    leaf,
    obj,
    usable: Boolean(nameLeaf || nameObj),
    start: sel('startDate', startF),
    end: sel('endDate', pick(leaf, ['endDate', 'end', 'to', 'date', 'day'])),
    startTime: sel('startTime', pick(leaf, ['startTime', 'startHour', 'fromTime'])),
    endTime: sel('endTime', pick(leaf, ['endTime', 'endHour', 'toTime'])),
    name: nameLeaf ? sel('name', nameLeaf) : nameObj ? `nm: ${nameObj} { name }` : '',
    id: pick(leaf, ['id']),
  };
}

/** Lignes « Dates et prix » d'une session → modules (si elles portent le module). */
export async function digiformaDateModules(sessionId: string): Promise<DigiformaModule[] | null> {
  const ds = await datesShape();
  const sh = await sessionShape();
  if (!ds || !ds.usable || !sh.oneField) return null;
  const data = await digiformaFetch(
    `query($id: ID!) { session: ${sh.oneField}(id: $id) { dts: dates { ${[ds.id ? sel('id', ds.id) : '', ds.start, ds.end, ds.startTime, ds.endTime, ds.name].filter(Boolean).join(' ')} } } }`,
    { id: sessionId }
  );
  const rows = ((data?.session?.dts || []) as any[])
    .map((d, i) => ({
      key: String(d.id ?? `d${i}-${d.startDate || ''}`),
      name: (String(d.name ?? d.nm?.name ?? '').trim() || null) as string | null,
      start: d.startDate || null,
      end: d.endDate || d.startDate || null,
      startTime: d.startTime || null,
      endTime: d.endTime || null,
    }))
    .filter((d) => d.start);
  if (!rows.some((r) => r.name)) return null;
  return slotBlocks(rows as DigiformaModule[]);
}

/** Diagnostic : exemple réel d'un parcours (GEIQ…) en cours, pour voir où Digiforma range ses modules. */
export async function digiformaSample(): Promise<string> {
  const f = await schemaFields();
  const sh = await sessionShape();
  if (!sh.listField || !sh.oneField) return '';
  const list = await digiformaFetch(`{ sessions: ${sh.listField} { id ${sh.name} ${sh.status} } }`);
  const pickOne =
    (list?.sessions || []).find((x: any) => /geiq/i.test(x.name || '') && /ongoing|en cours/i.test(String(x.status || ''))) ||
    (list?.sessions || []).find((x: any) => /geiq|poec|parcours/i.test(x.name || ''));
  if (!pickOne) return 'Exemple : aucune session GEIQ trouvée.';
  const sessT = f.TrainingSession ? 'TrainingSession' : 'Session';
  const part = (field: string) => {
    const t = f[`${sessT}.${field}#type`]?.[0];
    if (!t) return '';
    const leaf = (f[`${t}#leaf`] || []).filter((n) => !/html|url|signature|image|logo/i.test(n)).slice(0, 25);
    const objs = (f[t] || []).filter((n) => !(f[`${t}#leaf`] || []).includes(n)).filter((n) => (f[`${f[`${t}.${n}#type`]?.[0]}#leaf`] || []).includes('name')).slice(0, 6);
    return `${field} { ${leaf.join(' ')} ${objs.map((o) => `${o} { name }`).join(' ')} }`;
  };
  const data = await digiformaFetch(
    `query($id: ID!) { session: ${sh.oneField}(id: $id) { id name ${part('dates')} ${part('trainingSessionSlots')} ${part('subsessions')} } }`,
    { id: pickOne.id }
  );
  const sx = data?.session || {};
  const cut = (v: any) => JSON.stringify((v || []).slice(0, 4));
  return [
    `Exemple : ${sx.name} (${pickOne.status || '?'})`,
    `dates (${(sx.dates || []).length}) : ${cut(sx.dates)}`,
    `créneaux (${(sx.trainingSessionSlots || []).length}) : ${cut(sx.trainingSessionSlots)}`,
    `sous-sessions (${(sx.subsessions || []).length}) : ${cut(sx.subsessions)}`,
  ].join('\n');
}

/**
 * Diagnostic d'une session (fiche session, administrateur) : ce que Digiforma
 * renvoie vraiment (clients, apprenants, entreprises, modules cochés) et ce que
 * la plateforme en tire. Lecture seule ; aucune clé ni en-tête dans le texte.
 */
export async function digiformaDebugSession(id: string): Promise<string> {
  const out: string[] = [];
  const short = (v: unknown, n = 1800) => {
    const s = JSON.stringify(v);
    return s && s.length > n ? `${s.slice(0, n)}…` : s;
  };
  const f = await schemaFields();
  const sh = await sessionShape();
  const st = await statusShape();
  const sessT = f.TrainingSession ? 'TrainingSession' : 'Session';
  out.push(`Session ${id} · type ${sessT} · requête ${sh.oneField}`);
  out.push(`Clients : champ ${st.custField} → type ${st.custT} · statut ${st.custStatus}/${st.custStatus2} · apprenants ${st.custTrainees || st.ctField} → ${st.ctTrainee}`);
  if (st.custT) out.push(`Champs ${st.custT} : ${(f[st.custT] || []).join(', ')}`);
  const ctT = st.custT && st.ctField ? f[`${st.custT}.${st.ctField}#type`]?.[0] : null;
  if (ctT) out.push(`Champs ${ctT} : ${(f[ctT] || []).join(', ')}`);
  const entF = st.custT ? pick(f[st.custT], ['entity', 'client', 'customerEntity', 'company']) : null;
  const et = entF ? f[`${st.custT}.${entF}#type`]?.[0] : null;
  out.push(`Entité : ${entF} → ${et} (${et ? f[`${et}#kind`]?.[0] : '-'}) possibles : ${et ? (f[`${et}#possible`] || []).join(', ') : '-'}`);
  out.push(`Champs session : ${(f[sessT] || []).join(', ')}`);
  out.push(`Drapeaux : sous-sessions ${subsBroken ? 'REFUSÉES' : 'ok'} · entité ${entityBroken ? 'REFUSÉE' : 'ok'}`);

  const tryQ = async (label: string, body: string) => {
    try {
      const d = await digiformaFetch(`query($id: ID!) { session: ${sh.oneField}(id: $id) { ${body} } }`, { id });
      out.push(`\n# ${label} : OK\n${short(d?.session)}`);
    } catch (e: any) {
      out.push(`\n# ${label} : ERREUR ${e?.message || e}`);
    }
  };
  const tSel = await traineeSelection();
  if (st.custField && st.custT) {
    const leaf = (f[`${st.custT}#leaf`] || []).filter((n) => !/html|url|signature|image|logo|token/i.test(n)).slice(0, 30);
    await tryQ('Clients (champs simples)', `${st.custField} { ${leaf.join(' ')} }`);
    if (st.ctField && st.ctTrainee && ctT) {
      const ctLeaf = (f[`${ctT}#leaf`] || []).filter((n) => !/html|url|signature|image|logo|token/i.test(n)).slice(0, 20);
      await tryQ('Apprenants des clients', `${st.custField} { ${st.ctField} { ${ctLeaf.join(' ')} ${st.ctTrainee} { ${tSel} } } }`);
      const ctSubs = (f[ctT] || []).filter((n) => !(f[`${ctT}#leaf`] || []).includes(n) && n !== st.ctTrainee);
      for (const n of ctSubs.slice(0, 6)) {
        const t = f[`${ctT}.${n}#type`]?.[0];
        const nm = t ? pick(f[`${t}#leaf`], ['name', 'customName', 'title', 'label']) : null;
        if (t && (f[`${t}#leaf`] || []).includes('id')) await tryQ(`Apprenant.${n} (${t})`, `${st.custField} { ${st.ctField} { ${n} { id ${nm || ''} } } }`);
      }
    }
    const custObj = (f[st.custT] || []).filter((n) => !(f[`${st.custT}#leaf`] || []).includes(n) && n !== st.ctField && n !== entF);
    for (const n of custObj.slice(0, 8)) {
      const t = f[`${st.custT}.${n}#type`]?.[0];
      const nm = t ? pick(f[`${t}#leaf`], ['name', 'customName', 'title', 'label']) : null;
      if (t && (f[`${t}#leaf`] || []).includes('id')) await tryQ(`Client.${n} (${t})`, `${st.custField} { ${n} { id ${nm || ''} } }`);
    }
    if (entF && et) {
      const kind = f[`${et}#kind`]?.[0];
      const frags = kind === 'UNION' || kind === 'INTERFACE' ? (f[`${et}#possible`] || []).map((t) => `... on ${t} { ${(f[`${t}#leaf`] || []).filter((n) => /^(id|name|firstname|lastname|firstName|lastName)$/.test(n)).join(' ') || 'id'} }`).join(' ') : (f[`${et}#leaf`] || []).filter((n) => /^(id|name)$/.test(n)).join(' ');
      await tryQ('Entité des clients', `${st.custField} { ${entF} { __typename ${frags} } }`);
    }
  }
  for (const n of ['subsessions', 'subSessions']) if ((f[sessT] || []).includes(n)) await tryQ(`Sous-sessions (${n})`, `${n} { id ${pick(f[`${f[`${sessT}.${n}#type`]?.[0]}#leaf`], ['name', 'customName', 'title']) || ''} }`);
  try {
    await tryQ('Requête complète de la plateforme', `id ${await statusPart(true)}`);
  } catch (e: any) {
    out.push(`statusPart : ${e?.message}`);
  }
  try {
    const d = await digiformaSessionDetail(id);
    out.push(`\n# Résultat plateforme`);
    out.push(`Stagiaires (${d.trainees.length}) : ${d.trainees.map((t) => `${t.fullName} [${t.status || '?'}${t.company ? ` · ${t.company}` : ''}${t.particulier ? ' · particulier' : ''}]`).join(' ; ')}`);
    out.push(`Modules cochés : ${short(d.subsOf, 1200)}`);
    out.push(`Entreprises : ${short(d.companies, 1200)}`);
    out.push(`Émargement : ${Object.keys(d.bySlot).length} créneau(x) connus`);
  } catch (e: any) {
    out.push(`Résultat plateforme : ERREUR ${e?.message}`);
  }
  try {
    const sm = await digiformaSessionModules(id);
    out.push(`Modules (${sm.modules.length}) : ${sm.modules.map((m) => `${m.name || '(sans nom)'} ${m.start.slice(0, 10)}→${(m.end || m.start).slice(0, 10)} ${m.startTime || ''}-${m.endTime || ''}`).join(' ; ')}`);
  } catch (e: any) {
    out.push(`Modules : ERREUR ${e?.message}`);
  }
  out.push(`Drapeaux après lecture : sous-sessions ${subsBroken ? 'REFUSÉES' : 'ok'} · entité ${entityBroken ? 'REFUSÉE' : 'ok'}`);
  return out.join('\n');
}
