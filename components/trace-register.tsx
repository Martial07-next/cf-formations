'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Camera, Download, History, Search, Shirt } from 'lucide-react';
import { clothesText, LOAN_STATUS_LABEL, type LoanStatus } from '@/lib/vetements';
import { TRACE_ACTION_LABEL, TRACE_CHANNEL_LABEL, TRACE_ENTITY_LABEL, deviceOf, traceActor, type TraceEntity, type TraceRow } from '@/lib/trace';

type Qty = { vestes: number; pantalons: number; baudriers: number };

export type RegisterLoan = {
  id: string;
  traineeId: string;
  trainee: string;
  company: string | null;
  sessionId: string | null;
  session: string | null;
  sessionEnd: string | null;
  createdAt: string;
  lentBy: string | null;
  vestes: number;
  pantalons: number;
  baudriers: number;
  signedAt: string | null;
  city: string | null;
  returnedAt: string | null;
  returnedBy: string | null;
  returned: Qty;
  missing: Qty;
  note: string | null;
  status: LoanStatus;
  late: boolean;
};

export type RegisterImage = {
  id: string;
  who: 'stagiaire' | 'salarie';
  personId: string;
  name: string;
  company: string | null;
  accepted: boolean;
  revokedAt: string | null;
  revokedBy: string | null;
  revokedNote: string | null;
  signedAt: string;
  city: string | null;
  session: string | null;
  collectedBy: string | null;
  /** Une signature plus récente existe pour cette personne. */
  superseded: boolean;
};

const fr = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : '');
const frTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const total = (q: Qty) => q.vestes + q.pantalons + q.baudriers;

/** Export CSV (séparateur « ; », ouvert directement par Excel). */
function downloadCsv(name: string, header: string[], rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name} ${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Tab = 'prets' | 'image' | 'journal';

export function TraceRegister({ loans, images, journal, loansError }: { loans: RegisterLoan[]; images: RegisterImage[]; journal: TraceRow[] | null; loansError: boolean }) {
  const [tab, setTab] = useState<Tab>('prets');
  const [q, setQ] = useState('');
  const [loanFilter, setLoanFilter] = useState<'dehors' | 'retard' | 'a_signer' | 'incomplet' | 'restitue' | 'tous'>('dehors');
  const [imageFilter, setImageFilter] = useState<'actuels' | 'accord' | 'refus' | 'retire' | 'tous'>('actuels');
  const [entity, setEntity] = useState<TraceEntity | ''>('');
  const match = (...parts: (string | null | undefined)[]) => !q.trim() || plain(parts.filter(Boolean).join(' ')).includes(plain(q.trim()));

  const outLoans = loans.filter((l) => l.status === 'prete' || l.status === 'incomplet' || l.status === 'a_signer');
  const outItems = outLoans.reduce((n, l) => n + total(l.missing), 0);
  const lateCount = loans.filter((l) => l.late).length;
  const toSign = loans.filter((l) => l.status === 'a_signer').length;
  const current = images.filter((i) => !i.superseded);
  const imgOk = current.filter((i) => i.accepted && !i.revokedAt).length;
  const imgNo = current.filter((i) => !i.accepted).length;
  const imgRevoked = current.filter((i) => i.revokedAt).length;

  const shownLoans = useMemo(
    () =>
      loans.filter((l) => {
        if (loanFilter === 'dehors' && !(l.status === 'prete' || l.status === 'incomplet' || l.status === 'a_signer')) return false;
        if (loanFilter === 'retard' && !l.late) return false;
        if (['a_signer', 'incomplet', 'restitue'].includes(loanFilter) && l.status !== loanFilter) return false;
        return match(l.trainee, l.company, l.session, l.lentBy);
      }),
    [loans, loanFilter, q] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const shownImages = useMemo(
    () =>
      images.filter((i) => {
        if (imageFilter !== 'tous' && i.superseded) return false;
        if (imageFilter === 'accord' && !(i.accepted && !i.revokedAt)) return false;
        if (imageFilter === 'refus' && i.accepted) return false;
        if (imageFilter === 'retire' && !i.revokedAt) return false;
        return match(i.name, i.company, i.session);
      }),
    [images, imageFilter, q] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const shownJournal = useMemo(
    () => (journal || []).filter((j) => (!entity || j.entity === entity) && match(j.person_name, j.actor_name, j.detail)),
    [journal, entity, q] // eslint-disable-line react-hooks/exhaustive-deps
  );

  function exportLoans() {
    downloadCsv(
      'Registre des prêts',
      ['Stagiaire', 'Entreprise', 'Session', 'Prêté le', 'Prêté par', 'Vestes', 'Pantalons', 'Baudriers', 'Signé le', 'Fait à', 'Rendu le', 'Reçu par', 'Vestes rendues', 'Pantalons rendus', 'Baudriers rendus', 'Manque', 'Statut', 'En retard', 'Note'],
      shownLoans.map((l) => [
        l.trainee, l.company, l.session, frTime(l.createdAt), l.lentBy, l.vestes, l.pantalons, l.baudriers, frTime(l.signedAt), l.city,
        frTime(l.returnedAt), l.returnedBy, l.returnedAt ? l.returned.vestes : '', l.returnedAt ? l.returned.pantalons : '', l.returnedAt ? l.returned.baudriers : '',
        total(l.missing) ? clothesText(l.missing.vestes, l.missing.pantalons, l.missing.baudriers) : '', LOAN_STATUS_LABEL[l.status], l.late ? 'oui' : '', l.note,
      ])
    );
  }
  function exportImages() {
    downloadCsv(
      'Registre droit à l’image',
      ['Personne', 'Type', 'Entreprise / poste', 'Décision', 'Signé le', 'Fait à', 'Session', 'Accord retiré le', 'Retrait noté par', 'Motif', 'Remplacé par une signature plus récente'],
      shownImages.map((i) => [
        i.name, i.who === 'salarie' ? 'Salarié' : 'Stagiaire', i.company, i.accepted ? 'Autorise' : 'N’autorise pas', frTime(i.signedAt), i.city, i.session,
        frTime(i.revokedAt), i.revokedBy, i.revokedNote, i.superseded ? 'oui' : '',
      ])
    );
  }
  function exportJournal() {
    downloadCsv(
      'Journal de traçabilité',
      ['Date', 'Type', 'Action', 'Personne concernée', 'Détail', 'Fait par', 'Canal', 'Appareil', 'Adresse IP', 'Empreinte de la signature (SHA-256)'],
      shownJournal.map((j) => [
        frTime(j.created_at), TRACE_ENTITY_LABEL[j.entity] || j.entity, TRACE_ACTION_LABEL[j.action] || j.action, j.person_name, j.detail, traceActor(j),
        j.channel ? TRACE_CHANNEL_LABEL[j.channel] : '', deviceOf(j.user_agent), j.ip, j.signature_hash,
      ])
    );
  }

  return (
    <>
      <div className="stats">
        <button type="button" className={`stat stat-btn${tab === 'prets' && loanFilter === 'dehors' ? ' on' : ''}`} onClick={() => { setTab('prets'); setLoanFilter('dehors'); }}>
          <span>Articles prêtés dehors</span><strong>{outItems}</strong><small>{outLoans.length} prêt{outLoans.length > 1 ? 's' : ''} en cours</small>
        </button>
        <button type="button" className={`stat stat-btn${lateCount ? ' warn' : ''}${tab === 'prets' && loanFilter === 'retard' ? ' on' : ''}`} onClick={() => { setTab('prets'); setLoanFilter('retard'); }}>
          <span>En retard</span><strong>{lateCount}</strong><small>formation terminée, pas rendu</small>
        </button>
        <button type="button" className={`stat stat-btn${tab === 'prets' && loanFilter === 'a_signer' ? ' on' : ''}`} onClick={() => { setTab('prets'); setLoanFilter('a_signer'); }}>
          <span>Prêts à signer</span><strong>{toSign}</strong><small>sans signature du stagiaire</small>
        </button>
        <button type="button" className={`stat stat-btn${tab === 'image' ? ' on' : ''}`} onClick={() => { setTab('image'); setImageFilter('actuels'); }}>
          <span>Droit à l’image</span><strong>{imgOk}</strong><small>accord{imgOk > 1 ? 's' : ''} en vigueur · {imgNo} refus · {imgRevoked} retiré{imgRevoked > 1 ? 's' : ''}</small>
        </button>
      </div>

      <div className="toolbar">
        <div className="trace-tabs" role="tablist" aria-label="Registre">
          <button type="button" role="tab" aria-selected={tab === 'prets'} className={tab === 'prets' ? 'on' : ''} onClick={() => setTab('prets')}><Shirt size={14} aria-hidden /> Prêts</button>
          <button type="button" role="tab" aria-selected={tab === 'image'} className={tab === 'image' ? 'on' : ''} onClick={() => setTab('image')}><Camera size={14} aria-hidden /> Droit à l’image</button>
          <button type="button" role="tab" aria-selected={tab === 'journal'} className={tab === 'journal' ? 'on' : ''} onClick={() => setTab('journal')}><History size={14} aria-hidden /> Journal</button>
        </div>
        <label className="search">
          <Search size={14} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, entreprise, session…" aria-label="Rechercher" />
        </label>
        {tab === 'prets' && (
          <select value={loanFilter} onChange={(e) => setLoanFilter(e.target.value as any)} aria-label="Statut des prêts">
            <option value="dehors">En cours (pas tout rendu)</option>
            <option value="retard">En retard</option>
            <option value="a_signer">À signer</option>
            <option value="incomplet">Rendus incomplets</option>
            <option value="restitue">Rendus</option>
            <option value="tous">Tous les prêts</option>
          </select>
        )}
        {tab === 'image' && (
          <select value={imageFilter} onChange={(e) => setImageFilter(e.target.value as any)} aria-label="Décision">
            <option value="actuels">Décisions en vigueur</option>
            <option value="accord">Accords</option>
            <option value="refus">Refus</option>
            <option value="retire">Accords retirés</option>
            <option value="tous">Toutes les signatures (historique)</option>
          </select>
        )}
        {tab === 'journal' && (
          <select value={entity} onChange={(e) => setEntity(e.target.value as any)} aria-label="Type">
            <option value="">Tout</option>
            {(Object.keys(TRACE_ENTITY_LABEL) as TraceEntity[]).map((k) => (
              <option key={k} value={k}>{TRACE_ENTITY_LABEL[k]}</option>
            ))}
          </select>
        )}
        <span className="spacer" />
        <button type="button" className="small" onClick={tab === 'prets' ? exportLoans : tab === 'image' ? exportImages : exportJournal}>
          <Download size={14} aria-hidden /> Exporter (Excel)
        </button>
      </div>

      {tab === 'prets' && (
        loansError ? (
          <p className="hint">Prêts indisponibles : exécute la migration 27 dans Supabase.</p>
        ) : !shownLoans.length ? (
          <p className="empty">Aucun prêt pour ce filtre.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Stagiaire</th><th>Prêté</th><th>Signature</th><th>Retour</th><th>Statut</th></tr>
              </thead>
              <tbody>
                {shownLoans.map((l) => (
                  <tr key={l.id} className={l.late ? 'trace-late' : ''}>
                    <td>
                      <Link href={`/stagiaires/${l.traineeId}`}><strong>{l.trainee}</strong></Link>
                      {l.company && <div className="hint">{l.company}</div>}
                      {l.session && <div className="hint">{l.sessionId ? <Link href={`/sessions/${l.sessionId}`}>{l.session}</Link> : l.session}</div>}
                    </td>
                    <td>
                      {clothesText(l.vestes, l.pantalons, l.baudriers)}
                      <div className="hint">le {fr(l.createdAt)}{l.lentBy ? ` par ${l.lentBy}` : ''}</div>
                    </td>
                    <td>{l.signedAt ? <>{frTime(l.signedAt)}{l.city ? <div className="hint">fait à {l.city}</div> : null}</> : <span className="badge en_attente">À signer</span>}</td>
                    <td>
                      {l.returnedAt ? (
                        <>
                          {frTime(l.returnedAt)}{l.returnedBy ? <div className="hint">reçu par {l.returnedBy}</div> : null}
                          {total(l.missing) > 0 && <div className="autor-refus">Manque : {clothesText(l.missing.vestes, l.missing.pantalons, l.missing.baudriers)}</div>}
                          {l.note && <div className="hint">{l.note}</div>}
                        </>
                      ) : (
                        <span className="hint">{l.sessionEnd ? `fin de formation le ${fr(l.sessionEnd + 'T12:00:00Z')}` : 'pas encore rendu'}</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${l.status === 'restitue' ? 'validee' : l.status === 'a_signer' ? 'en_attente' : 'indisponible'}`}>{LOAN_STATUS_LABEL[l.status]}</span>
                      {l.late && <div className="trace-late-tag"><AlertTriangle size={12} aria-hidden /> En retard</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'image' && (
        !shownImages.length ? (
          <p className="empty">Aucune signature pour ce filtre.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Personne</th><th>Décision</th><th>Signé le</th><th>Session</th></tr>
              </thead>
              <tbody>
                {shownImages.map((i) => (
                  <tr key={`${i.who}-${i.id}`} className={i.superseded ? 'trace-old' : ''}>
                    <td>
                      {i.who === 'stagiaire' ? <Link href={`/stagiaires/${i.personId}`}><strong>{i.name}</strong></Link> : <strong>{i.name}</strong>}
                      <div className="hint">{i.who === 'salarie' ? 'Salarié' : 'Stagiaire'}{i.company ? ` · ${i.company}` : ''}</div>
                    </td>
                    <td>
                      {i.revokedAt ? (
                        <span className="badge indisponible">Accord retiré</span>
                      ) : i.accepted ? (
                        <span className="badge validee">Autorise</span>
                      ) : (
                        <span className="badge indisponible">N’autorise pas</span>
                      )}
                      {i.revokedAt && <div className="hint">le {frTime(i.revokedAt)}{i.revokedBy ? ` (noté par ${i.revokedBy})` : ''}{i.revokedNote ? ` · ${i.revokedNote}` : ''}</div>}
                      {i.superseded && <div className="hint">remplacé par une signature plus récente</div>}
                    </td>
                    <td>{frTime(i.signedAt)}{i.city ? <div className="hint">fait à {i.city}</div> : null}</td>
                    <td>{i.session || <span className="hint">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'journal' && (
        journal === null ? (
          <p className="hint">Journal indisponible : exécute la migration 79 (supabase/migration_phase79.sql) dans Supabase. Les actions seront notées dès qu’elle sera passée.</p>
        ) : !shownJournal.length ? (
          <p className="empty">Aucune action notée pour l’instant.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Date</th><th>Action</th><th>Personne</th><th>Fait par</th><th>Preuve</th></tr>
              </thead>
              <tbody>
                {shownJournal.map((j) => (
                  <tr key={j.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{frTime(j.created_at)}</td>
                    <td>
                      <strong>{TRACE_ACTION_LABEL[j.action] || j.action}</strong>
                      <div className="hint">{TRACE_ENTITY_LABEL[j.entity] || j.entity}{j.detail ? ` · ${j.detail}` : ''}</div>
                    </td>
                    <td>{j.trainee_id ? <Link href={`/stagiaires/${j.trainee_id}`}>{j.person_name || 'Stagiaire'}</Link> : j.person_name || '—'}</td>
                    <td>{traceActor(j)}{j.channel ? <div className="hint">{TRACE_CHANNEL_LABEL[j.channel]}</div> : null}</td>
                    <td className="hint">
                      {deviceOf(j.user_agent) || '—'}
                      {j.ip ? <div>IP {j.ip}</div> : null}
                      {j.signature_hash ? <div title={j.signature_hash}>Signature {j.signature_hash.slice(0, 12)}…</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </>
  );
}
