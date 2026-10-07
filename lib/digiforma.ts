// Client pour l'API GraphQL de Digiforma — SERVEUR UNIQUEMENT.
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

/**
 * Liste tous les stagiaires connus de Digiforma (indépendamment de toute session).
 * NOTE : requête à ajuster selon le schéma réel de votre compte (voir digiformaIntrospect).
 */
export async function digiformaListTrainees(): Promise<DigiformaTrainee[]> {
  const data = await digiformaFetch(`{ trainees { id firstName lastName email } }`);
  const trainees = data?.trainees || [];
  return trainees.map((t: any) => ({
    id: String(t.id),
    fullName: [t.firstName, t.lastName].filter(Boolean).join(' ') || t.email || 'Stagiaire Digiforma',
      firstName: t.firstName || null,
      lastName: t.lastName || (t.firstName ? '' : t.email || 'Stagiaire Digiforma'),
    email: t.email || null,
  }));
}

export type DigiformaSession = {
  id: string;
  name: string;
  startAt: string | null;
  endAt: string | null;
  trainees: DigiformaTrainee[];
};

/**
 * Liste les sessions de formation Digiforma, avec leurs stagiaires inscrits.
 * NOTE : requête à ajuster selon le schéma réel de votre compte (voir digiformaIntrospect) —
 * en particulier le nom exact des champs de dates, qui varie souvent d'une API à l'autre.
 */
export async function digiformaListTrainingSessions(): Promise<DigiformaSession[]> {
  const data = await digiformaFetch(`
    {
      trainingSessions {
        id
        name
        startDate
        endDate
        trainees { id firstName lastName email }
      }
    }
  `);
  const sessions = data?.trainingSessions || [];
  return sessions.map((s: any) => ({
    id: String(s.id),
    name: s.name || 'Session Digiforma',
    startAt: s.startDate || null,
    endAt: s.endDate || null,
    trainees: (s.trainees || []).map((t: any) => ({
      id: String(t.id),
      fullName: [t.firstName, t.lastName].filter(Boolean).join(' ') || t.email || 'Stagiaire Digiforma',
      firstName: t.firstName || null,
      lastName: t.lastName || (t.firstName ? '' : t.email || 'Stagiaire Digiforma'),
      email: t.email || null,
    })),
  }));
}

/**
 * Récupère les stagiaires inscrits à une session Digiforma donnée (par son id/référence).
 * NOTE : requête à ajuster selon le schéma réel de votre compte (voir digiformaIntrospect).
 */
export async function digiformaFetchSessionTrainees(digiformaRef: string): Promise<DigiformaTrainee[]> {
  const data = await digiformaFetch(
    `query($id: ID!) {
      trainingSession(id: $id) {
        id
        trainees { id firstName lastName email }
      }
    }`,
    { id: digiformaRef }
  );

  const trainees = data?.trainingSession?.trainees || [];
  return trainees.map((t: any) => ({
    id: String(t.id),
    fullName: [t.firstName, t.lastName].filter(Boolean).join(' ') || t.email || 'Stagiaire Digiforma',
      firstName: t.firstName || null,
      lastName: t.lastName || (t.firstName ? '' : t.email || 'Stagiaire Digiforma'),
    email: t.email || null,
  }));
}
