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
    schemaCache = digiformaFetch(`{ __schema { queryType { name } types { name fields { name type { kind ofType { kind ofType { kind } } } } } } }`)
      .then((data) => {
        const out: Record<string, string[]> = {};
        const leafKind = (ty: any): boolean => (ty?.kind === 'NON_NULL' || ty?.kind === 'LIST' ? leafKind(ty.ofType) : ty?.kind === 'SCALAR' || ty?.kind === 'ENUM');
        for (const t of data.__schema.types as { name: string; fields: { name: string; type: any }[] | null }[]) {
          if (!t.fields) continue;
          out[t.name] = t.fields.map((f) => f.name);
          // Champs simples (texte, nombre, énumération) : sélectionnables sans sous-champs.
          out[`${t.name}#leaf`] = t.fields.filter((f) => leafKind(f.type)).map((f) => f.name);
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
