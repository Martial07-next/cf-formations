'use client';

import { useRef, useState, useTransition } from 'react';
import { UserPlus, Copy, Check } from 'lucide-react';
import { createUserAccess, type CreateAccessResult } from '@/app/administration/actions';

const ACCESS_TYPES = [
  { value: 'formateur', label: 'Formateur', desc: 'Consulte le planning, ajuste les horaires de ses sessions.' },
  { value: 'referent', label: 'Référent cadre', desc: 'Modifie les sessions (sans créer ni supprimer), suit son équipe.' },
  { value: 'bureau', label: 'Bureau administratif', desc: 'Gère sessions, stagiaires, formateurs, salles et formations.' },
  { value: 'consultation', label: 'Consultation', desc: 'Voit le planning, sans rien modifier.' },
  { value: 'admin', label: 'Administrateur', desc: 'Gère la plateforme : accès, paramètres, intégrations.' },
];

export function CreateAccessPanel({ serviceReady }: { serviceReady: boolean }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<CreateAccessResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handle(fd: FormData) {
    setResult(null);
    setCopied(false);
    startTransition(async () => {
      const res = await createUserAccess(fd);
      setResult(res);
      if (res.ok) formRef.current?.reset();
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* presse-papiers indisponible : l'utilisateur copie à la main */
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2><UserPlus size={18} aria-hidden /> Créer un accès à la plateforme</h2>
        <button className={open ? '' : 'primary'} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Fermer' : 'Nouvel accès'}
        </button>
      </div>

      {!serviceReady && (
        <div role="alert" className="alert alert-warning">
          Pour créer des accès depuis ici, ajoute la variable <code>SUPABASE_SERVICE_ROLE_KEY</code> dans Vercel
          (Supabase → Settings → API → service_role), puis redéploie.
        </div>
      )}

      {result?.ok && (
        <div role="status" className="alert alert-success" style={{ flexDirection: 'column' }}>
          <span>
            Accès créé pour <strong>{result.email}</strong>
            {result.trainerLinked && ', lié à sa fiche formateur'}. Transmets-lui ces identifiants ; il pourra changer
            son mot de passe dans « Mon profil ».
          </span>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            Mot de passe provisoire : <code style={{ fontSize: 15, fontWeight: 800 }}>{result.password}</code>
            <button type="button" className="small" onClick={() => copy(`${result.email} / ${result.password}`)}>
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {copied ? 'Copié' : 'Copier'}
            </button>
          </span>
          <span className="hint">Ce mot de passe ne sera plus affiché ensuite.</span>
        </div>
      )}
      {result && !result.ok && <div role="alert" className="alert alert-error">{result.error}</div>}

      {open && (
        <form ref={formRef} action={handle}>
          <div className="form-row">
            <label>
              Nom complet
              <input name="full_name" required placeholder="Camille Martin" autoComplete="off" />
            </label>
            <label>
              Adresse e-mail (identifiant)
              <input name="email" type="email" required placeholder="prenom.nom@cf-reseau.fr" autoComplete="off" />
            </label>
            <label>
              Mot de passe provisoire
              <input name="password" type="text" minLength={8} placeholder="Laisser vide = généré" autoComplete="new-password" />
            </label>
          </div>
          <div className="form-row" style={{ gridTemplateColumns: '1fr' }}>
            <div className="field">
              Type d’accès
              <div className="access-choice" role="radiogroup" aria-label="Type d’accès">
                {ACCESS_TYPES.map((a) => (
                  <label key={a.value}>
                    <input type="radio" name="role" value={a.value} defaultChecked={a.value === 'formateur'} required />
                    <span>
                      <strong>{a.label}</strong>
                      <small>{a.desc}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <p className="hint" style={{ marginBottom: 12 }}>
            Pour un formateur, sa fiche formateur (même e-mail) est liée automatiquement, ou créée si elle n’existe pas.
          </p>
          <button type="submit" className="primary" disabled={isPending || !serviceReady}>
            {isPending ? 'Création…' : 'Créer l’accès'}
          </button>
        </form>
      )}
    </div>
  );
}
