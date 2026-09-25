-- ============================================================
-- CF Réseau — Migration Phase 3 (Administration)
-- À exécuter dans Supabase Dashboard > SQL Editor.
-- Purement additif : n'écrase ni ne supprime aucune donnée existante.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Rôles étendus : admin, responsable_formation, formateur, consultation.
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'profiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table profiles drop constraint %I', r.conname);
  end loop;
end $$;

alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'responsable_formation', 'formateur', 'consultation'));

-- Un responsable formation peut gérer le contenu (salles, formateurs, sessions...)
-- au même titre qu'un admin, mais seul un admin gère les comptes utilisateurs.
create or replace function can_manage()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('admin', 'responsable_formation')
  );
$$ language sql security definer stable;

-- On remplace les policies d'écriture "admin uniquement" par "can_manage()"
-- sur les tables de contenu (sans toucher aux policies liées aux comptes/rôles).
drop policy if exists "rooms: admin write" on rooms;
drop policy if exists "rooms: admin update" on rooms;
drop policy if exists "rooms: admin delete" on rooms;
create policy "rooms: manage write" on rooms for insert with check (can_manage());
create policy "rooms: manage update" on rooms for update using (can_manage());
create policy "rooms: manage delete" on rooms for delete using (can_manage());

drop policy if exists "trainers: admin write" on trainers;
drop policy if exists "trainers: admin update" on trainers;
drop policy if exists "trainers: admin delete" on trainers;
create policy "trainers: manage write" on trainers for insert with check (can_manage());
create policy "trainers: manage update" on trainers for update using (can_manage());
create policy "trainers: manage delete" on trainers for delete using (can_manage());

drop policy if exists "trainees: admin write" on trainees;
drop policy if exists "trainees: admin update" on trainees;
drop policy if exists "trainees: admin delete" on trainees;
create policy "trainees: manage write" on trainees for insert with check (can_manage());
create policy "trainees: manage update" on trainees for update using (can_manage());
create policy "trainees: manage delete" on trainees for delete using (can_manage());

drop policy if exists "templates: admin write" on templates;
drop policy if exists "templates: admin update" on templates;
drop policy if exists "templates: admin delete" on templates;
create policy "templates: manage write" on templates for insert with check (can_manage());
create policy "templates: manage update" on templates for update using (can_manage());
create policy "templates: manage delete" on templates for delete using (can_manage());

drop policy if exists "sessions: admin write" on sessions;
drop policy if exists "sessions: admin update" on sessions;
drop policy if exists "sessions: admin delete" on sessions;
create policy "sessions: manage write" on sessions for insert with check (can_manage());
create policy "sessions: manage update" on sessions for update using (can_manage());
create policy "sessions: manage delete" on sessions for delete using (can_manage());

drop policy if exists "session_trainees: admin write" on session_trainees;
drop policy if exists "session_trainees: admin update" on session_trainees;
drop policy if exists "session_trainees: admin delete" on session_trainees;
create policy "session_trainees: manage write" on session_trainees for insert with check (can_manage());
create policy "session_trainees: manage update" on session_trainees for update using (can_manage());
create policy "session_trainees: manage delete" on session_trainees for delete using (can_manage());

drop policy if exists "session_days: admin insert" on session_days;
drop policy if exists "session_days: admin update" on session_days;
drop policy if exists "session_days: admin delete" on session_days;
create policy "session_days: manage insert" on session_days for insert with check (can_manage());
create policy "session_days: manage update" on session_days for update using (can_manage());
create policy "session_days: manage delete" on session_days for delete using (can_manage());

-- ------------------------------------------------------------
-- 2. Salles enrichies
-- ------------------------------------------------------------
alter table rooms add column if not exists location text;
alter table rooms add column if not exists equipment text;
alter table rooms add column if not exists status text not null default 'disponible'
  check (status in ('disponible', 'indisponible'));

-- ------------------------------------------------------------
-- 3. Formateurs enrichis
-- ------------------------------------------------------------
alter table trainers add column if not exists phone text;
alter table trainers add column if not exists availability text;
alter table trainers add column if not exists status text not null default 'actif'
  check (status in ('actif', 'inactif'));

-- ------------------------------------------------------------
-- 4. Formations (modèles) enrichies
-- ------------------------------------------------------------
alter table templates add column if not exists reference text;
alter table templates add column if not exists category text;
alter table templates add column if not exists max_trainees int;

-- ------------------------------------------------------------
-- 5. Paramètres généraux (une seule ligne)
-- ------------------------------------------------------------
create table if not exists app_settings (
  id boolean primary key default true check (id = true), -- garantit une seule ligne
  company_name text not null default 'CF Réseau',
  company_address text,
  default_session_duration_hours numeric not null default 7,
  notify_on_conflict boolean not null default true,
  digiforma_enabled boolean not null default false,
  digiforma_notes text,
  updated_at timestamptz not null default now()
);
insert into app_settings (id) values (true) on conflict do nothing;

alter table app_settings enable row level security;
create policy "app_settings: read all" on app_settings for select using (auth.role() = 'authenticated');
create policy "app_settings: admin update" on app_settings for update using (is_admin());
