'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import type { ProgrammeInput } from '@/lib/pdf-poec-programme';

/** Programme du parcours en PDF (charte CF Réseaux). */
export function ProgrammePdfButton({ input, className = '' }: { input: ProgrammeInput; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const [{ buildProgrammePdf }, { downloadPdf }] = await Promise.all([import('@/lib/pdf-poec-programme'), import('@/lib/pdf-dossier')]);
            downloadPdf(await buildProgrammePdf(input), `Programme POEC - ${input.title}.pdf`);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'PDF impossible à générer.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <FileText size={15} aria-hidden /> {busy ? 'Préparation…' : 'Programme (PDF)'}
      </button>
      {error && <span className="field-error">{error}</span>}
    </>
  );
}
