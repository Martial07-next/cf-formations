-- ============================================================
-- CF Réseaux · Migration Phase 23 : parcours POEC
--   · Un parcours POEC (≈ 3 mois) regroupe un groupe fixe de stagiaires et
--     les formations construites pour eux (sessions du planning rattachées).
--   · Périodes de stage en entreprise (souvent 2 × 1 semaine).
--   · Conventions de stage tripartites dématérialisées : remplies et signées
--     en ligne par CF Réseaux, l'entreprise d'accueil, le stagiaire et
--     France Travail (liens sécurisés, sans compte).
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

create table if not exists poec_programs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  reference text,
  start_date date not null,
  end_date date not null,
  objectives text,
  recruiter text,               -- chargée de recrutement
  ft_agency text,               -- agence France Travail
  ft_advisor text,              -- conseiller France Travail
  ft_email text,
  ft_token text unique,         -- lien de suivi / signature France Travail
  pedagogical_tutor text,       -- tuteur pédagogique CF Réseaux par défaut
  notes text,
  created_at timestamptz not null default now(),
  constraint poec_programs_range check (end_date >= start_date)
);

create table if not exists poec_trainees (
  program_id uuid not null references poec_programs(id) on delete cascade,
  trainee_id uuid not null references trainees(id) on delete cascade,
  address text,
  ft_id text,                   -- identifiant France Travail
  primary key (program_id, trainee_id)
);

create table if not exists poec_periods (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references poec_programs(id) on delete cascade,
  label text not null default 'Stage en entreprise',
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  constraint poec_periods_range check (end_date >= start_date)
);
create index if not exists poec_periods_program on poec_periods (program_id);
create index if not exists poec_periods_dates on poec_periods (start_date, end_date);

create table if not exists poec_conventions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references poec_programs(id) on delete cascade,
  period_id uuid not null references poec_periods(id) on delete cascade,
  trainee_id uuid not null references trainees(id) on delete cascade,
  -- Entreprise d'accueil
  company_name text,
  company_address text,
  company_rep text,
  company_rep_role text,
  company_email text,
  company_tutor text,
  company_tutor_contact text,
  missions text,
  -- Stagiaire
  trainee_address text,
  pedagogical_tutor text,
  -- Liens de remplissage / signature
  company_token text unique not null,
  trainee_token text unique not null,
  -- Signatures
  cf_signature text,
  cf_signer text,
  cf_signed_at timestamptz,
  company_signature text,
  company_signer text,
  company_signer_role text,
  company_city text,
  company_signed_at timestamptz,
  trainee_signature text,
  trainee_city text,
  trainee_signed_at timestamptz,
  ft_signature text,
  ft_signer text,
  ft_signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, trainee_id)
);
create index if not exists poec_conventions_program on poec_conventions (program_id);

-- Sessions du planning rattachées à un parcours POEC.
alter table sessions add column if not exists poec_id uuid references poec_programs(id) on delete set null;
create index if not exists sessions_poec on sessions (poec_id);

-- Représentant de CF Réseaux sur les conventions.
alter table app_settings add column if not exists director_name text not null default 'Madame Aurélie Lancelle';
alter table app_settings add column if not exists director_title text not null default 'Directrice de CF Réseaux';

-- Droits : lecture pour les comptes connectés, écriture admin + bureau.
-- (Les pages publiques de l'entreprise, du stagiaire et de France Travail
-- passent par le serveur avec la clé service_role, après contrôle du lien.)
do $$
declare t text;
begin
  foreach t in array array['poec_programs', 'poec_trainees', 'poec_periods', 'poec_conventions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%s: read" on %I', t, t);
    execute format('drop policy if exists "%s: manage insert" on %I', t, t);
    execute format('drop policy if exists "%s: manage update" on %I', t, t);
    execute format('drop policy if exists "%s: manage delete" on %I', t, t);
    execute format('create policy "%s: read" on %I for select using (auth.role() = ''authenticated'')', t, t);
    execute format('create policy "%s: manage insert" on %I for insert with check (can_manage())', t, t);
    execute format('create policy "%s: manage update" on %I for update using (can_manage())', t, t);
    execute format('create policy "%s: manage delete" on %I for delete using (can_manage())', t, t);
  end loop;
end $$;

notify pgrst, 'reload schema';
