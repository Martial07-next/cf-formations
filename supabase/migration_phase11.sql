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
-- (Instructions explicites, sans boucle, pour l'éditeur SQL de Supabase.)

alter table template_modules enable row level security;
drop policy if exists "template_modules: read" on template_modules;
drop policy if exists "template_modules: manage insert" on template_modules;
drop policy if exists "template_modules: manage update" on template_modules;
drop policy if exists "template_modules: manage delete" on template_modules;
create policy "template_modules: read" on template_modules for select using (auth.role() = 'authenticated');
create policy "template_modules: manage insert" on template_modules for insert with check (can_manage());
create policy "template_modules: manage update" on template_modules for update using (can_manage());
create policy "template_modules: manage delete" on template_modules for delete using (can_manage());

alter table session_modules enable row level security;
drop policy if exists "session_modules: read" on session_modules;
drop policy if exists "session_modules: manage insert" on session_modules;
drop policy if exists "session_modules: manage update" on session_modules;
drop policy if exists "session_modules: manage delete" on session_modules;
create policy "session_modules: read" on session_modules for select using (auth.role() = 'authenticated');
create policy "session_modules: manage insert" on session_modules for insert with check (can_manage());
create policy "session_modules: manage update" on session_modules for update using (can_manage());
create policy "session_modules: manage delete" on session_modules for delete using (can_manage());

alter table session_trainee_modules enable row level security;
drop policy if exists "session_trainee_modules: read" on session_trainee_modules;
drop policy if exists "session_trainee_modules: manage insert" on session_trainee_modules;
drop policy if exists "session_trainee_modules: manage update" on session_trainee_modules;
drop policy if exists "session_trainee_modules: manage delete" on session_trainee_modules;
create policy "session_trainee_modules: read" on session_trainee_modules for select using (auth.role() = 'authenticated');
create policy "session_trainee_modules: manage insert" on session_trainee_modules for insert with check (can_manage());
create policy "session_trainee_modules: manage update" on session_trainee_modules for update using (can_manage());
create policy "session_trainee_modules: manage delete" on session_trainee_modules for delete using (can_manage());

alter table template_trainers enable row level security;
drop policy if exists "template_trainers: read" on template_trainers;
drop policy if exists "template_trainers: manage insert" on template_trainers;
drop policy if exists "template_trainers: manage update" on template_trainers;
drop policy if exists "template_trainers: manage delete" on template_trainers;
create policy "template_trainers: read" on template_trainers for select using (auth.role() = 'authenticated');
create policy "template_trainers: manage insert" on template_trainers for insert with check (can_manage());
create policy "template_trainers: manage update" on template_trainers for update using (can_manage());
create policy "template_trainers: manage delete" on template_trainers for delete using (can_manage());

-- ------------------------------------------------------------
-- 3. Synchronisation des congés (dernière réception, affichée dans
--    Administration → Intégrations)
-- ------------------------------------------------------------
alter table app_settings add column if not exists absences_last_sync timestamptz;
alter table app_settings add column if not exists absences_last_log text;

notify pgrst, 'reload schema';
