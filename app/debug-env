import { getSupabaseUrl, getSupabaseKey } from '@/lib/supabase-env';
import { createClient } from '@/lib/supabase/server';

function mask(key: string) {
  if (key.length < 20) return `(clé très courte : ${key.length} caractères) ${key}`;
  return `${key.slice(0, 18)}…${key.slice(-6)} (${key.length} caractères)`;
}

export default async function DebugEnvPage() {
  let url = '(erreur)';
  let key = '(erreur)';
  let envError: string | null = null;
  try {
    url = getSupabaseUrl();
    key = mask(getSupabaseKey());
  } catch (e: any) {
    envError = e.message;
  }

  let authTestResult = '(non testé)';
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: 'diagnostic-inexistant@cf-reseau.fr',
      password: 'motdepassebidon123',
    });
    authTestResult = error ? `Erreur reçue : "${error.message}" (code: ${error.status ?? 'n/a'})` : 'Connexion réussie (inattendu !)';
  } catch (e: any) {
    authTestResult = `Exception : ${e.message}`;
  }

  return (
    <main style={{ padding: 40, fontFamily: 'monospace', fontSize: 14, lineHeight: 1.8 }}>
      <h1 style={{ fontFamily: 'sans-serif' }}>Diagnostic Supabase</h1>
      <p><strong>NEXT_PUBLIC_SUPABASE_URL vue par le serveur :</strong><br />{url}</p>
      <p><strong>Clé vue par le serveur (masquée) :</strong><br />{key}</p>
      {envError && <p style={{ color: 'red' }}><strong>Erreur env :</strong> {envError}</p>}
      <hr />
      <p><strong>Test réel d'appel à supabase.auth.signInWithPassword (avec des identifiants bidon, volontairement) :</strong></p>
      <p style={{ background: '#f0f0f0', padding: 12 }}>{authTestResult}</p>
      <p style={{ marginTop: 20, color: '#888' }}>
        Si le message ci-dessus contient "Invalid login credentials" → la clé API fonctionne, le problème est ailleurs.<br />
        Si le message contient "Invalid API key" → la clé elle-même est rejetée par Supabase.
      </p>
    </main>
  );
}
