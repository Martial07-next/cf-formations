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
    schemaCache = digiformaFetch(`{ __schema { queryType { name } types { name fields { name type { kind name ofType { kind name ofType { kind name } } } } } } }`)
      .then((data) => {
        const out: Record<string, string[]> = {};
        const leafKind = (ty: any): boolean => (ty?.kind === 'NON_NULL' || ty?.kind === 'LIST' ? leafKind(ty.ofType) : ty?.kind === 'SCALAR' || ty?.kind === 'ENUM');
        for (const t of data.__schema.types as { name: string; fields: { name: string; type: any }[] | null }[]) {
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
  return /planifi|planned|scheduled|confirm/.test(t);
}


/* ------------------------------------------------------------------------
 * Modules d'une session Digiforma (une session peut durer un an : ce sont
 * les modules, avec leurs propres dates, qui se placent sur le planning).
 * ---------------------------------------------------------------------- */

export type DigiformaModule = { key: string; name: string | null; start: string; end: string; startTime: string | null; endTime: string | null };
export type DigiformaSessionModules = { id: string; name: string; status: string | null; startAt: string | null; endAt: string | null; modules: DigiformaModule[] };

async function moduleShape() {
  const f = await schemaFields();
  const sessT = f.TrainingSession ? 'TrainingSession' : 'Session';
  const leaf = f[`${sessT}#leaf`] || [];
  const objFields = (f[sessT] || []).filter((n) => !leaf.includes(n));
  const field =
    pick(objFields, ['modules', 'trainingModules', 'sessionModules', 'subsessions', 'subSessions', 'steps', 'sequences', 'slots', 'trainingSessionSlots', 'dates', 'sessionDates', 'days']) ||
    objFields.find((n) => /modul|sub.?session|slot|creneau|sequence|step|date/i.test(n)) ||
    null;
  const modT = field ? f[`${sessT}.${field}#type`]?.[0] || null : null;
  const ml = modT ? f[`${modT}#leaf`] : undefined;
  const mf = modT ? f[modT] : undefined;
  return {
    field,
    type: modT,
    id: pick(ml, ['id', 'uuid']),
    name: sel('name', pick(ml, ['name', 'title', 'label'])),
    start: sel('startDate', pick(ml, ['startDate', 'startAt', 'start', 'beginDate', 'dateStart', 'date', 'day'])),
    end: sel('endDate', pick(ml, ['endDate', 'endAt', 'end', 'finishDate', 'dateEnd', 'date', 'day'])),
    startTime: sel('startTime', pick(ml, ['startTime', 'startHour', 'from', 'beginTime'])),
    endTime: sel('endTime', pick(ml, ['endTime', 'endHour', 'to', 'finishTime'])),
    trainees: pick(mf, ['trainees', 'students', 'participants']),
  };
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
    `Modules : ${ms.field ? `${ms.field} (${ms.type})` : 'aucun champ trouvé'}`,
  ];
  if (ms.type) lines.push(`${ms.type} : ${(f[ms.type] || []).join(', ')}`);
  return lines.join('\n');
}

/** Sessions Digiforma avec leurs modules (sans stagiaires : requête légère). */
export async function digiformaListModules(): Promise<{ hasStatus: boolean; hasModules: boolean; sessions: DigiformaSessionModules[] }> {
  const sh = await sessionShape();
  const ms = await moduleShape();
  if (!sh.listField) throw new Error('Digiforma : liste des sessions introuvable dans l’API de ce compte.');
  const mods = ms.field ? `modules: ${ms.field} { ${[ms.id ? sel('id', ms.id) : '', ms.name, ms.start, ms.end, ms.startTime, ms.endTime].filter(Boolean).join(' ')} }` : '';
  const data = await digiformaFetch(`{ sessions: ${sh.listField} { id ${sh.name} ${sh.start} ${sh.end} ${sh.status} ${mods} } }`);
  return {
    hasStatus: Boolean(sh.status),
    hasModules: Boolean(ms.field),
    sessions: (data?.sessions || []).map((s: any) => ({
      id: String(s.id),
      name: s.name || 'Session Digiforma',
      status: s.status == null ? null : String(typeof s.status === 'object' ? s.status.name ?? s.status.label ?? '' : s.status),
      startAt: s.startDate || null,
      endAt: s.endDate || null,
      modules: (s.modules || [])
        .map((m: any, i: number) => ({
          key: String(m.id ?? `${i}-${m.startDate || ''}`),
          name: m.name || null,
          start: m.startDate || null,
          end: m.endDate || m.startDate || null,
          startTime: m.startTime || null,
          endTime: m.endTime || null,
        }))
        .filter((m: any) => m.start),
    })),
  };
}

/** Stagiaires d'une session Digiforma, et par module quand l'API les donne. */
export async function digiformaSessionDetail(id: string): Promise<{ trainees: DigiformaTrainee[]; byModule: Record<string, DigiformaTrainee[]> }> {
  const sh = await sessionShape();
  const ms = await moduleShape();
  if (!sh.oneField) throw new Error('Digiforma : session introuvable dans l’API de ce compte.');
  const tSel = await traineeSelection();
  const modPart = ms.field && ms.trainees ? `modules: ${ms.field} { ${ms.id ? sel('id', ms.id) : ''} ${ms.start} trainees: ${ms.trainees} { ${tSel} } }` : '';
  const sessT = sh.trainees ? `trainees: ${sh.trainees} { ${tSel} }` : '';
  const data = await digiformaFetch(`query($id: ID!) { session: ${sh.oneField}(id: $id) { id ${sessT} ${modPart} } }`, { id });
  const byModule: Record<string, DigiformaTrainee[]> = {};
  (data?.session?.modules || []).forEach((m: any, i: number) => {
    byModule[String(m.id ?? `${i}-${m.startDate || ''}`)] = (m.trainees || []).map(mapTrainee);
  });
  return { trainees: (data?.session?.trainees || []).map(mapTrainee), byModule };
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
