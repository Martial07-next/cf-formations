import { CalendarOff, ExternalLink } from 'lucide-react';
import { ABSENCE_LABEL, frDate, type Absence } from '@/lib/absences';

/**
 * Congés et absences du formateur, en lecture seule : ils viennent de la
 * plateforme CF Réseaux Congés (demandes validées), synchronisée avec le
 * planning (Administration › Intégrations).
 */
export function AbsencesPanel({ absences }: { absences: (Absence & { source?: string | null })[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = absences.filter((a) => a.end_date >= today);
  const past = absences.filter((a) => a.end_date < today).reverse().slice(0, 10);
  const congesUrl = process.env.NEXT_PUBLIC_CONGES_URL;

  const Row = ({ a }: { a: Absence & { source?: string | null } }) => (
    <tr>
      <td><span className="badge en_attente">{ABSENCE_LABEL[a.kind]}</span></td>
      <td>{a.start_date === a.end_date ? `le ${frDate(a.start_date)}` : `du ${frDate(a.start_date)} au ${frDate(a.end_date)}`}</td>
      <td>{a.note || <span className="hint">-</span>}</td>
    </tr>
  );

  return (
    <div className="panel">
      <div className="panel-head">
        <h2><CalendarOff size={18} aria-hidden /> Congés et absences</h2>
        {congesUrl && (
          <a className="btn small" href={congesUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} aria-hidden /> Plateforme de congés
          </a>
        )}
      </div>
      <p className="panel-intro">
        Repris automatiquement des congés <strong>validés</strong> dans la plateforme de congés. Pendant un congé, le
        formateur ne peut pas être affecté à une session : le planning le bloque et l’indique. Pour ajouter ou modifier
        un congé, passe par la plateforme de congés.
      </p>

      {upcoming.length === 0 ? (
        <p className="hint">Aucun congé ni absence à venir.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <tbody>{upcoming.map((a) => <Row key={a.id} a={a} />)}</tbody>
          </table>
        </div>
      )}
      {past.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary className="hint" style={{ cursor: 'pointer' }}>Absences passées ({past.length})</summary>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="data">
              <tbody>{past.map((a) => <Row key={a.id} a={a} />)}</tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
