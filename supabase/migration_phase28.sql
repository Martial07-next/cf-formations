-- ============================================================
-- CF Réseaux · Migration Phase 28 : documents à signer (espace administrateur)
--   · L'administrateur ajoute, modifie ou supprime les documents que les
--     stagiaires ou les salariés signent en ligne (ex. règlement intérieur) ;
--   · les documents intégrés (droit à l'image, livrets, vêtements TST,
--     matériel) peuvent être activés / désactivés et décrits.
--   · Un document remplacé par une nouvelle version peut être re-signé.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

create table if not exists signable_documents (
  id uuid primary key default gen_random_uuid(),
  builtin text unique,              -- document intégré (modèle fixe) ; vide = document ajouté
  audience text not null check (audience in ('stagiaire', 'salarie')),
  title text not null,
  description text,
  storage_path text,                -- PDF déposé (bucket « dossiers »), documents ajoutés
  version int not null default 1,
  scope text not null default 'once' check (scope in ('once', 'session')),  -- stagiaires : une seule fois / à chaque formation
  active boolean not null default true,
  position int not null default 0,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_signatures (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references signable_documents(id) on delete cascade,
  version int not null default 1,
  trainee_id uuid references trainees(id) on delete cascade,
  employee_id uuid references employees(id) on delete cascade,
  session_id uuid references sessions(id) on delete set null,
  signature text not null,
  city text,
  signed_at timestamptz not null default now(),
  collected_by uuid references profiles(id) on delete set null default auth.uid(),
  constraint document_signatures_who check (trainee_id is not null or employee_id is not null)
);
create index if not exists document_signatures_trainee on document_signatures (trainee_id);
create index if not exists document_signatures_employee on document_signatures (employee_id);

alter table signable_documents enable row level security;
drop policy if exists "signable_documents: read" on signable_documents;
drop policy if exists "signable_documents: admin insert" on signable_documents;
drop policy if exists "signable_documents: admin update" on signable_documents;
drop policy if exists "signable_documents: admin delete" on signable_documents;
create policy "signable_documents: read" on signable_documents for select using (auth.role() = 'authenticated');
create policy "signable_documents: admin insert" on signable_documents for insert with check (is_admin());
create policy "signable_documents: admin update" on signable_documents for update using (is_admin());
create policy "signable_documents: admin delete" on signable_documents for delete using (is_admin() and builtin is null);

alter table document_signatures enable row level security;
drop policy if exists "document_signatures: read" on document_signatures;
drop policy if exists "document_signatures: insert" on document_signatures;
drop policy if exists "document_signatures: admin delete" on document_signatures;
create policy "document_signatures: read" on document_signatures for select
  using ((trainee_id is not null and auth.role() = 'authenticated') or is_admin() or (employee_id is not null and is_employee_self(employee_id)));
create policy "document_signatures: insert" on document_signatures for insert with check (can_edit_sessions());
create policy "document_signatures: admin delete" on document_signatures for delete using (is_admin());

-- Documents intégrés (modèles fixes) : activables / désactivables.
insert into signable_documents (builtin, audience, title, description, position) values
  ('image', 'stagiaire', 'Autorisation de droit à l’image', 'Photos et vidéos réalisées pendant la formation. Le stagiaire peut accepter ou refuser.', 1),
  ('livret', 'stagiaire', 'Attestation de remise des livrets de formation', 'Documents pédagogiques remis au début de la formation.', 2),
  ('vetements', 'stagiaire', 'Attestation de vêtements de travail TST', 'Prêt au cas par cas, signé au prêt et au retour.', 3),
  ('image_salarie', 'salarie', 'Autorisation de droit à l’image (salariés)', 'Demandée à chaque nouveau salarié.', 1),
  ('materiel', 'salarie', 'Attestation de remise de matériel', 'Matériel confié au salarié, restitué à son départ.', 2)
on conflict (builtin) do nothing;

-- Règlement intérieur : prêt à recevoir le PDF (désactivé tant qu'il n'est pas déposé).
insert into signable_documents (audience, title, description, scope, active, position)
select 'stagiaire', 'Règlement intérieur', 'Règlement intérieur de CF Réseaux, à lire et signer par chaque stagiaire.', 'once', false, 0
where not exists (select 1 from signable_documents where builtin is null and title = 'Règlement intérieur');

notify pgrst, 'reload schema';
