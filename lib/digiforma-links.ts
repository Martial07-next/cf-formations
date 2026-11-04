/**
 * Liens Digiforma d'une session (migration 55). Une session du planning peut
 * en avoir plusieurs (ex. groupe GEIQ + stagiaires ajoutés), et un même lien
 * peut servir à plusieurs sessions (deux formations, une session Digiforma).
 */

export type DfAudience = 'all' | 'group' | 'others' | 'custom';
export type DfLink = { id: string; label: string; url: string; audience: DfAudience; trainee_ids?: string[] };

export const DF_AUDIENCES: { value: DfAudience; label: string; poecOnly?: boolean }[] = [
  { value: 'all', label: 'Tous les stagiaires' },
  { value: 'group', label: 'Groupe du parcours', poecOnly: true },
  { value: 'others', label: 'Stagiaires ajoutés (hors groupe)', poecOnly: true },
  { value: 'custom', label: 'Stagiaires choisis' },
];

/** Liens enregistrés, sinon l'ancien lien unique (migration 55 absente ou ancienne session). */
export function readDfLinks(row: { digiforma_links?: unknown; digiforma_docs_url?: string | null } | null | undefined): DfLink[] {
  const raw = row?.digiforma_links;
  if (Array.isArray(raw)) {
    return raw
      .filter((l: any) => l && typeof l.url === 'string' && l.url.trim())
      .map((l: any, i: number) => ({
        id: String(l.id || `l${i}`),
        label: String(l.label || 'Session Digiforma'),
        url: String(l.url),
        audience: (['all', 'group', 'others', 'custom'].includes(l.audience) ? l.audience : 'all') as DfAudience,
        trainee_ids: Array.isArray(l.trainee_ids) ? l.trainee_ids.map(String) : undefined,
      }));
  }
  const url = String(row?.digiforma_docs_url || '').trim();
  return url ? [{ id: 'main', label: 'Session Digiforma', url, audience: 'all' }] : [];
}

/** Stagiaires concernés par un lien. `group` : membres du groupe du parcours. */
export function linkTrainees(link: DfLink, validatedIds: string[], group: Set<string> | null): string[] {
  if (link.audience === 'group') return group ? validatedIds.filter((id) => group.has(id)) : validatedIds;
  if (link.audience === 'others') return group ? validatedIds.filter((id) => !group.has(id)) : [];
  if (link.audience === 'custom') return validatedIds.filter((id) => (link.trainee_ids || []).includes(id));
  return validatedIds;
}

/** Stagiaires validés couverts par aucun lien. */
export function uncoveredTrainees(links: DfLink[], validatedIds: string[], group: Set<string> | null): string[] {
  if (!links.length) return validatedIds;
  const covered = new Set(links.flatMap((l) => linkTrainees(l, validatedIds, group)));
  return validatedIds.filter((id) => !covered.has(id));
}

/** Même session Digiforma : adresse sans paramètres ni barre finale. */
export function sameDfUrl(a: string, b: string) {
  const n = (u: string) => u.trim().replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  return n(a) === n(b);
}

/** « Fait » lien par lien (session_forms, kind digiforma) ; ancien format : tout ou rien. */
export function dfDoneMap(links: DfLink[], form: { data?: any; completed?: boolean } | null): Record<string, boolean> {
  const done = (form?.data && typeof form.data === 'object' && form.data.done) || null;
  if (done && typeof done === 'object') return Object.fromEntries(links.map((l) => [l.id, Boolean(done[l.id])]));
  return Object.fromEntries(links.map((l) => [l.id, Boolean(form?.completed)]));
}
