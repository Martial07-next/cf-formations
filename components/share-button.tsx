'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Share2 } from 'lucide-react';
import { canShareLinks, deliverFile, isPhone, shareLink } from '@/lib/share';

/** Téléphone (après hydratation : jamais affiché sur ordinateur). */
export function usePhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const update = () => setPhone(isPhone());
    update();
    const mq = window.matchMedia('(max-width: 760px)');
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return phone;
}

/**
 * « Envoyer le lien » (téléphone uniquement) : feuille de partage du système
 * (Messages, AirDrop, WhatsApp, Mail…) pour un lien de QR code.
 */
export function ShareLinkButton({ url, title, text, label = 'Envoyer le lien', className = 'small' }: { url: string; title: string; text?: string; label?: string; className?: string }) {
  const phone = usePhone();
  const [copied, setCopied] = useState(false);
  if (!phone || !canShareLinks()) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const r = await shareLink(url, title, text);
        if (r === 'copied') {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      }}
    >
      {copied ? <Check size={14} aria-hidden /> : <Share2 size={14} aria-hidden />} {copied ? 'Lien copié' : label}
    </button>
  );
}

/**
 * Partager un fichier (téléphone uniquement) : récupéré puis envoyé à la
 * feuille de partage (AirDrop, Messages, Mail, Enregistrer dans Fichiers…).
 * Lien externe : le lien est partagé.
 */
export function ShareFileButton({ url, fileName, title, className = 'small icon ghost' }: { url: string; fileName?: string; title: string; className?: string }) {
  const phone = usePhone();
  const [busy, setBusy] = useState(false);
  if (!phone || !canShareLinks()) return null;
  return (
    <button
      type="button"
      className={className}
      aria-label={`Partager ${title}`}
      title="Partager"
      disabled={busy}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!fileName) {
          await shareLink(url.startsWith('http') ? url : new URL(url, window.location.origin).toString(), title);
          return;
        }
        setBusy(true);
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error();
          await deliverFile(await res.blob(), fileName);
        } catch {
          await shareLink(new URL(url, window.location.origin).toString(), title);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 size={15} className="spin" aria-hidden /> : <Share2 size={15} aria-hidden />}
    </button>
  );
}
