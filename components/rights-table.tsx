import { Fragment } from 'react';
import { Check, Minus } from 'lucide-react';
import { RIGHTS } from '@/lib/rights';
import { ROLE_LABELS, ROLE_OPTIONS } from '@/lib/roles';

/** Ce que chaque type d'accès peut faire et ne pas faire. */
export function RightsTable() {
  return (
    <div className="panel">
      <h2>Ce que chaque accès peut faire</h2>
      <p className="panel-intro">✓ oui · <strong>les siennes</strong> = uniquement ses propres sessions (formateur) ou son équipe (référent) · — non. Chaque compte peut aussi changer son nom et son mot de passe dans « Mon profil ».</p>
      <p className="panel-intro"><strong>Accès Facturation</strong> (case à cocher sur le compte, en plus de son type d’accès) : page Facturation, noms des factures et case « Facturation faite », qui complète le dossier. Seuls les comptes cochés peuvent le faire ; l’administrateur consulte et donne ou retire l’accès.</p>
      <div className="table-wrap">
        <table className="data rights-table">
          <thead>
            <tr>
              <th>Action</th>
              {ROLE_OPTIONS.map((r) => <th key={r}><span className={`badge ${r}`}>{ROLE_LABELS[r]}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {RIGHTS.map((g) => (
              <Fragment key={g.group}>
                <tr className="rights-group"><td colSpan={ROLE_OPTIONS.length + 1}>{g.group}</td></tr>
                {g.items.map((it) => (
                  <tr key={it.label}>
                    <td>{it.label}</td>
                    {ROLE_OPTIONS.map((r) => {
                      const v = it.roles[r];
                      return (
                        <td key={r} className={`right ${v === true ? 'yes' : v === 'own' ? 'own' : 'no'}`}>
                          {v === true ? <Check size={16} aria-label="oui" /> : v === 'own' ? 'les siennes' : <Minus size={16} aria-label="non" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
