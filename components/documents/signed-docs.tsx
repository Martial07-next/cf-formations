'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, Download, Trash2, Clock } from 'lucide-react';
import { docVersionUrl, deleteDocSignature } from '@/app/administration/documents/actions';
import { signatureFor, type DocSignature, type SignableDoc } from '@/lib/documents';
import type { Legal } from '@/lib/pdf-brand';

/** Téléchargement d'un document ajouté signé (PDF d'origine + page de signature). */
export function SignedDocButton({
  doc,
  sig,
  signerName,
  signerRole,
  sessionTitle,
  legal,
  getUrl,
}: {
  doc: Pick<SignableDoc, 'id' | 'title'>;
  sig: DocSignature;
  signerName: string;
  signerRole: 'stagiaire' | 'salarie';
  sessionTitle?: string | null;
  legal?: Legal | null;
  /** Lien fourni par la page (pages publiques) ; sinon demandé au serveur. */
  getUrl?: () => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="small"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          let url = getUrl ? await getUrl() : null;
          if (!url) {
            const r = await docVersionUrl(doc.id, sig.version);
            if (!r.ok) throw new Error(r.error);
            url = r.url;
          }
          const [{ buildSignedDocPdf }, { downloadPdf }] = await Promise.all([import('@/lib/pdf-signed-doc'), import('@/lib/pdf-dossier')]);
          const bytes = await buildSignedDocPdf([
            { fileUrl: url, title: doc.title, version: sig.version, signerName, signerRole, sessionTitle, city: sig.city, signedAt: sig.signed_at, signature: sig.signature, legal },
          ]);
          downloadPdf(bytes, `${doc.title} - ${signerName}.pdf`);
        } catch (e) {
          alert(e instanceof Error ? e.message : 'PDF impossible à générer.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download size={14} aria-hidden /> {busy ? '…' : 'PDF'}
    </button>
  );
}

/** Fiche stagiaire : documents ajoutés par l'administrateur (signés / à signer). */
export function TraineeSignedDocs({
  docs,
  sigs,
  traineeName,
  sessionTitles,
  isAdmin,
}: {
  docs: SignableDoc[];
  sigs: DocSignature[];
  traineeName: string;
  sessionTitles: Record<string, string>;
  isAdmin: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!docs.length) return null;
  return (
    <section className="panel">
      <h2>Documents signés</h2>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      <ul className="employee-docs">
        {docs.map((d) => {
          const sig = signatureFor(d, sigs);
          return (
            <li key={d.id}>
              <span>
                <strong>{d.title}</strong>
                <br />
                <span className="hint">
                  {sig ? (
                    <><CheckCircle2 size={12} aria-hidden /> Signé le {new Date(sig.signed_at).toLocaleDateString('fr-FR')}{sig.session_id && sessionTitles[sig.session_id] ? ` · ${sessionTitles[sig.session_id]}` : ''}</>
                  ) : (
                    <><Clock size={12} aria-hidden /> À signer (QR code de sa prochaine formation)</>
                  )}
                </span>
              </span>
              {sig && (
                <span className="row-actions">
                  <SignedDocButton doc={d} sig={sig} signerName={traineeName} signerRole="stagiaire" sessionTitle={sig.session_id ? sessionTitles[sig.session_id] : null} />
                  {isAdmin && (
                    <button
                      type="button"
                      className="small icon ghost"
                      aria-label="Supprimer la signature"
                      disabled={isPending}
                      onClick={() =>
                        confirm('Supprimer cette signature ? Le document sera redemandé.') &&
                        startTransition(async () => {
                          const r = await deleteDocSignature(sig.id);
                          setError(r.ok ? null : r.error);
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
