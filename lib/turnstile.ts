/**
 * Cloudflare Turnstile : vérification anti-robot des formulaires publics
 * (connexion, mot de passe oublié, demande d'accès).
 * Actif dès que NEXT_PUBLIC_TURNSTILE_SITE_KEY et TURNSTILE_SECRET_KEY sont
 * configurées (Vercel). Serveur uniquement.
 */
export const turnstileEnabled = () => Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);

export async function verifyTurnstile(formData: FormData, ip?: string | null): Promise<boolean> {
  if (!turnstileEnabled()) return true;
  const token = String(formData.get('cf-turnstile-response') || '');
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, cache: 'no-store' });
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return false;
  }
}

/** Domaine ajouté automatiquement quand on tape seulement l'identifiant (ex. « pnom »). */
export const EMAIL_DOMAIN = 'cf-reseaux.fr';
export function normalizeEmail(raw: FormDataEntryValue | null): string {
  const v = String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!v) return '';
  return v.includes('@') ? v : `${v}@${EMAIL_DOMAIN}`;
}
