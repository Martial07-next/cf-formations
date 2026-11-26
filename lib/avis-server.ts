import { unstable_cache } from 'next/cache';
import { mergeAvis, type AvisData, type Review } from '@/lib/avis';

/**
 * Derniers avis Plus que pro lus sur la page avis de cf-reseaux.fr (données
 * structurées « Review » / « AggregateRating » de la page), gardés 6 heures.
 * Page illisible ou changée : null (les avis enregistrés restent affichés).
 */
const fetchSiteReviews = unstable_cache(
  async (): Promise<{ note: number | null; count: number | null; reviews: Review[] } | null> => {
    try {
      const res = await fetch('https://www.cf-reseaux.fr/avis-clients/', { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CF-Formations)' } });
      if (!res.ok) return null;
      const html = await res.text();
      const reviews: Review[] = [];
      let note: number | null = null;
      let count: number | null = null;
      const visit = (o: any) => {
        if (!o || typeof o !== 'object') return;
        if (Array.isArray(o)) return o.forEach(visit);
        const type = String(o['@type'] || '');
        if (/^Review$/i.test(type) && (o.reviewBody || o.description)) {
          const rating = Number(o.reviewRating?.ratingValue ?? o.ratingValue ?? 5);
          const date = String(o.datePublished || '').slice(0, 10);
          reviews.push({
            title: String(o.name || o.itemReviewed?.name || 'Avis client').trim(),
            text: String(o.reviewBody || o.description).trim(),
            rating: Number.isFinite(rating) ? rating : 5,
            date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('/') : date || null,
            author: o.author?.name ? String(o.author.name) : null,
          });
        }
        if (/AggregateRating/i.test(type)) {
          note = Number(o.ratingValue) || note;
          count = Number(o.reviewCount || o.ratingCount) || count;
        }
        for (const v of Object.values(o)) if (v && typeof v === 'object') visit(v);
      };
      for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
        try {
          visit(JSON.parse(m[1]));
        } catch {
          /* bloc illisible : ignoré */
        }
      }
      if (!reviews.length && note == null) return null;
      // Les plus récents d'abord (date JJ/MM/AAAA).
      const key = (r: Review) => String(r.date || '').split('/').reverse().join('');
      reviews.sort((a, b) => key(b).localeCompare(key(a)));
      return { note, count, reviews: reviews.slice(0, 5) };
    } catch {
      return null;
    }
  },
  ['avis-cf-reseaux-site'],
  { revalidate: 6 * 3600 }
);

/** Avis à présenter : enregistrés (Administration), puis ceux du site s'ils sont lisibles. */
export async function loadAvis(supabase: any): Promise<AvisData> {
  let saved: any = null;
  try {
    const { data, error } = await supabase.from('app_settings').select('avis').eq('id', true).maybeSingle();
    if (!error) saved = (data as any)?.avis || null;
  } catch {
    /* migration 77 absente */
  }
  const avis = mergeAvis(saved);
  const site = await fetchSiteReviews();
  if (site) {
    if (site.reviews.length) avis.pqp.reviews = site.reviews;
    if (site.note) avis.pqp.note = site.note;
    if (site.count) avis.pqp.count = site.count;
  }
  return avis;
}
