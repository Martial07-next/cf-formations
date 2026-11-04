'use client';

/**
 * Partage natif des documents sur téléphone (AirDrop, Messages, Mail,
 * WhatsApp, « Enregistrer dans Fichiers »…) via la feuille de partage du
 * système. Sur ordinateur (et tablette) : téléchargement classique, rien ne change.
 */

/** Téléphone : petit écran tactile. */
export function isPhone(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(max-width: 760px)').matches && window.matchMedia('(pointer: coarse)').matches;
}

export function canShareFiles(file?: File): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [file || new File(['x'], 'test.pdf', { type: 'application/pdf' })] });
  } catch {
    return false;
  }
}

export function canShareLinks(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

const safeName = (n: string) => n.replace(/[\\/:*?"<>|]+/g, '-');

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName(fileName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Feuille de partage du système ; false si le navigateur refuse (geste trop ancien). */
async function nativeShare(data: ShareData): Promise<'ok' | 'refused'> {
  try {
    await navigator.share(data);
    return 'ok';
  } catch (e: any) {
    // Fermée par l'utilisateur : rien à faire.
    if (e?.name === 'AbortError') return 'ok';
    return 'refused';
  }
}

/**
 * Document prêt : partage direct sur téléphone, sinon téléchargement.
 * Si la feuille de partage ne peut pas s'ouvrir toute seule (document long à
 * préparer), un panneau « Document prêt » propose de la lancer d'un geste.
 */
export async function deliverFile(blob: Blob, fileName: string): Promise<void> {
  const name = safeName(fileName);
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  if (!isPhone() || !canShareFiles(file)) return download(blob, name);
  const r = await nativeShare({ files: [file], title: name });
  if (r === 'refused') readySheet({ title: name, onShare: () => nativeShare({ files: [file], title: name }), onOpen: () => openBlob(blob) });
}

/** Lien (QR code d'une session, page publique…) : feuille de partage, sinon copie. */
export async function shareLink(url: string, title: string, text?: string): Promise<'shared' | 'copied' | 'none'> {
  if (canShareLinks()) {
    const r = await nativeShare({ url, title, ...(text ? { text } : {}) });
    if (r === 'ok') return 'shared';
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'none';
  }
}

function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Panneau du bas « Document prêt » (téléphone). */
function readySheet({ title, onShare, onOpen }: { title: string; onShare: () => void; onOpen: () => void }) {
  document.querySelector('.share-sheet-wrap')?.remove();
  const wrap = document.createElement('div');
  wrap.className = 'share-sheet-wrap';
  wrap.innerHTML = `
    <div class="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-sheet-title">
      <span class="share-sheet-grip" aria-hidden="true"></span>
      <p class="share-sheet-kicker">Document prêt</p>
      <h2 id="share-sheet-title"></h2>
      <button type="button" class="primary share-sheet-go">Partager · AirDrop, Messages, Mail…</button>
      <button type="button" class="share-sheet-open">Ouvrir le document</button>
      <button type="button" class="ghost share-sheet-close">Fermer</button>
    </div>`;
  (wrap.querySelector('h2') as HTMLElement).textContent = title;
  const close = () => {
    wrap.classList.add('closing');
    setTimeout(() => wrap.remove(), 180);
  };
  wrap.addEventListener('click', (e) => e.target === wrap && close());
  wrap.querySelector('.share-sheet-go')!.addEventListener('click', () => {
    onShare();
    close();
  });
  wrap.querySelector('.share-sheet-open')!.addEventListener('click', () => {
    onOpen();
    close();
  });
  wrap.querySelector('.share-sheet-close')!.addEventListener('click', close);
  document.body.appendChild(wrap);
  (wrap.querySelector('.share-sheet-go') as HTMLButtonElement).focus();
}
