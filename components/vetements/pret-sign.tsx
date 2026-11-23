'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { signLoanByToken } from '@/app/vetements/actions';
import { SignStep } from '@/components/vetements/loans-panel';

/** Signature du prêt sur le téléphone du stagiaire (page du QR code). */
export function PretSign({ token, address }: { token: string; address: string | null }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();
  if (done)
    return (
      <div role="status" className="alert alert-success">
        <CheckCircle2 size={16} aria-hidden style={{ verticalAlign: '-3px' }} /> C’est signé, merci ! Tu peux rendre le téléphone ou fermer cette page.
      </div>
    );
  return (
    <>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      <SignStep
        address={address}
        isPending={isPending}
        label="Signer le prêt"
        onSign={(s) =>
          start(async () => {
            const r = await signLoanByToken(token, s);
            if (!r.ok) setError(r.error);
            else setDone(true);
          })
        }
      />
    </>
  );
}
