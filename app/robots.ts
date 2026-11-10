import type { MetadataRoute } from 'next';

/** Outil interne : aucune page ne doit apparaître dans un moteur de recherche. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] };
}
