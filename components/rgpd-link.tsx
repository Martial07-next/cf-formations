import { ShieldCheck } from 'lucide-react';

/** Lien « Protection de vos données » en bas des pages ouvertes par QR code. */
export function RgpdLink() {
  return (
    <p className="rgpd-link">
      <ShieldCheck size={14} aria-hidden />
      <a href="/confidentialite" target="_blank" rel="noopener">
        Protection de vos données et droit à l’image
      </a>
    </p>
  );
}
