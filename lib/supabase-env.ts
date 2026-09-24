/**
 * Supabase fait migrer les clés `anon` vers de nouvelles clés `publishable`
 * (https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).
 * On accepte les deux noms de variable pour ne pas casser le déploiement
 * selon la version du dashboard utilisée pour copier la clé.
 */
export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL manquant dans les variables d\'environnement.');
  return url;
}

export function getSupabaseKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || // nouveau nom Supabase
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // ancien nom (compatibilité)
  if (!key) {
    throw new Error(
      'Clé Supabase manquante : définis NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ou NEXT_PUBLIC_SUPABASE_ANON_KEY) dans les variables d\'environnement.'
    );
  }
  return key;
}
