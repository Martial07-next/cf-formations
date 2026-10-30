'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Loader2, RefreshCcw, Trash2 } from 'lucide-react';
import { syncCongesNow, deleteManualAbsences } from '@/app/administration/conges-actions';
import { askConfirm } from '@/lib/confirm-dialog';

/** Script à exécuter dans le Supabase de la plateforme de congés (cf-conges). */
export const CONGES_SQL = `-- Compte en LECTURE SEULE pour le planning CF Formations :
-- uniquement les colonnes utiles aux congés (jamais les mots de passe ni les soldes).
-- Remplace le mot de passe ci-dessous par une longue chaîne aléatoire.
create role planning_lecture with login password 'REMPLACE-MOI-PAR-UN-LONG-MOT-DE-PASSE';
grant usage on schema public to planning_lecture;
grant select (id, nom, prenom, email) on public."User" to planning_lecture;
grant select (id, code, libelle) on public."LeaveType" to planning_lecture;
grant select (id, "userId", "leaveTypeId", "dateDebut", "dateFin", "demiJournee",
              "demiJourneePeriode", statut, "supprimeParAdmin")
  on public."LeaveRequest" to planning_lecture;
-- Jours fériés travaillés (décision de la direction) : à exécuter aussi si le
-- compte existe déjà.
grant select ("date", ouvert) on public."JourFerieOuverture" to planning_lecture;`;

export function CongesSyncPanel({ configured, manualCount }: { configured: boolean; manualCount: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string; unmatched?: string[] } | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <>
      <div className="sql-box">
        <pre>{CONGES_SQL}</pre>
        <button
          type="button"
          className="small"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(CONGES_SQL);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            } catch {}
          }}
        >
          {copied ? <><Check size={14} aria-hidden /> Copié</> : <><Copy size={14} aria-hidden /> Copier le script</>}
        </button>
      </div>

      <div className="row-actions" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="primary"
          disabled={!configured || isPending}
          title={configured ? undefined : 'Ajoute d’abord CONGES_DATABASE_URL dans Vercel'}
          onClick={() =>
            startTransition(async () => {
              const r: any = await syncCongesNow();
              setMsg({ ok: Boolean(r.ok), text: r.detail || r.error || '', unmatched: r.unmatched });
              router.refresh();
            })
          }
        >
          {isPending ? <Loader2 size={15} className="spin" aria-hidden /> : <RefreshCcw size={15} aria-hidden />} Synchroniser maintenant
        </button>
        {manualCount > 0 && (
          <button
            type="button"
            className="danger"
            disabled={isPending}
            onClick={async () => {
              if (
                !(await askConfirm(
                  `Supprimer les ${manualCount} congé(s) saisi(s) à la main ?\n\nÀ faire une fois la synchronisation vérifiée : seuls les congés de la plateforme de congés resteront sur le planning.`
                ))
              )
                return;
              startTransition(async () => {
                const r = await deleteManualAbsences();
                setMsg(r.ok ? { ok: true, text: `${r.count} congé(s) saisi(s) à la main supprimé(s).` } : { ok: false, text: r.error });
                router.refresh();
              });
            }}
          >
            <Trash2 size={15} aria-hidden /> Supprimer les {manualCount} congé(s) saisi(s) à la main
          </button>
        )}
      </div>
      {msg && (
        <div role="status" className={`alert ${msg.ok ? 'alert-success' : 'alert-error'}`} style={{ marginTop: 12 }}>
          {msg.text}
          {msg.unmatched && msg.unmatched.length > 0 && (
            <div className="hint" style={{ marginTop: 6 }}>
              Sans fiche formateur correspondante : {msg.unmatched.join(', ')}. Si l’un d’eux est formateur, mets le même e-mail
              sur sa fiche formateur que dans la plateforme de congés.
            </div>
          )}
        </div>
      )}
    </>
  );
}
