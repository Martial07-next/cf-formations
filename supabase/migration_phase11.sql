-- ============================================================
-- CF Réseau — Migration Phase 11
--   1. Modules de formation (ex. MA1, MA2, MA3) dans le catalogue et dans
--      les sessions ; chaque stagiaire suit tout ou partie des modules.
--   2. Formateurs habilités par formation.
--   3. Journal de la synchronisation avec la plateforme de congés.
-- À exécuter dans Supabase Dashboard > SQL Editor. Ne supprime aucune donnée.
-- ============================================================

-- ------------------------------------------------------------
-- 1a. Modules d'une formation du catalogue
-- ------------------------------------------------------------
create table if not exists template_modules (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete cascade,
  position int not null default 0,
  name text not null,
  duration_hours numeric not null check (duration_hours > 0),
  created_at timestamptz not null default now()
);
create index if not exists template_modules_template on template_modules (template_id, position);

-- ------------------------------------------------------------
-- 1b. Modules d'une session (copiés du catalogue à la création,
--     placés sur les jours de la session)
-- ------------------------------------------------------------
create table if not exists session_modules (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  position int not null default 0,
  name text not null,
  start_day date not null,
  end_day date not null,
  duration_hours numeric,
  created_at timestamptz not null default now(),
  constraint session_modules_range check (end_day >= start_day)
);
create index if not exists session_modules_session on session_modules (session_id, position);

-- ------------------------------------------------------------
-- 1c. Modules suivis par chaque stagiaire inscrit.
--     Aucune ligne pour un stagiaire = il suit la session complète.
-- ------------------------------------------------------------
create table if not exists session_trainee_modules (
  session_id uuid not null,
  trainee_id uuid not null,
  module_id uuid not null references session_modules(id) on delete cascade,
  primary key (trainee_id, module_id),
  foreign key (session_id, trainee_id) references session_trainees(session_id, trainee_id) on delete cascade
);
create index if not exists session_trainee_modules_session on session_trainee_modules (session_id);

-- ------------------------------------------------------------
-- 2. Formateurs habilités à animer une formation
-- ------------------------------------------------------------
create table if not exists template_trainers (
  template_id uuid not null references templates(id) on delete cascade,
  trainer_id uuid not null references trainers(id) on delete cascade,
  primary key (template_id, trainer_id)
);

-- RLS : lecture pour tout utilisateur connecté, écriture admin / référents.
do $$
declare t text;
begin
  foreach t in array array['template_modules', 'session_modules', 'session_trainee_modules', 'template_trainers'] loop
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

-- ------------------------------------------------------------
-- 3. Synchronisation des congés (dernière réception, affichée dans
--    Administration → Intégrations)
-- ------------------------------------------------------------
alter table app_settings add column if not exists absences_last_sync timestamptz;
alter table app_settings add column if not exists absences_last_log text;

notify pgrst, 'reload schema';
