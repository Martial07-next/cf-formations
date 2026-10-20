'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

const DOMAIN = 'cf-reseaux.fr';

/** E-mail : on tape « pnom », « @cf-reseaux.fr » s'ajoute tout seul (une adresse complète reste possible). */
export function EmailField({ label = 'Identifiant', autoFocus = false }: { label?: string; autoFocus?: boolean }) {
  const [value, setValue] = useState('');
  const full = value.includes('@');
  return (
    <label>
      {label}
      <span className={`email-field${full ? ' full' : ''}`}>
        <input
          name="email"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus={autoFocus}
          placeholder="pnom"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\s+/g, ''))}
        />
        {!full && <span className="email-domain" aria-hidden>@{DOMAIN}</span>}
      </span>
    </label>
  );
}

/** Choix sous forme de boutons (remplace une liste déroulante). */
export function ChoiceField({ name, label, options, defaultValue }: { name: string; label: string; options: { value: string; label: string }[]; defaultValue: string }) {
  const [v, setV] = useState(defaultValue);
  return (
    <fieldset className="choice-field">
      <legend>{label}</legend>
      <div className="choice-grid">
        {options.map((o) => (
          <label key={o.value} className={`choice${v === o.value ? ' on' : ''}`}>
            <input type="radio" name={name} value={o.value} checked={v === o.value} onChange={() => setV(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Vérification Cloudflare Turnstile (si configurée) + mention « Protégé par ». */
export function TurnstileBox({ siteKey }: { siteKey: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!siteKey) return;
    let id: string | undefined;
    let stop = false;
    const mount = () => {
      const ts = (window as any).turnstile;
      if (stop || !ref.current) return;
      if (!ts) return void setTimeout(mount, 150);
      // Petit écran : version compacte (la normale fait 300 px de large minimum).
      const size = ref.current.clientWidth < 300 ? 'compact' : 'flexible';
      id = ts.render(ref.current, { sitekey: siteKey, theme: 'dark', language: 'fr', size });
    };
    mount();
    return () => {
      stop = true;
      if (id) (window as any).turnstile?.remove(id);
    };
  }, [siteKey]);
  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />
      <div ref={ref} className="cf-turnstile" />
    </>
  );
}

export function ProtectedBy({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <p className="auth-protected">
      <ShieldCheck size={14} aria-hidden /> Protégé par <a href="https://developers.cloudflare.com/turnstile/" target="_blank" rel="noreferrer">Cloudflare Turnstile</a>
    </p>
  );
}
