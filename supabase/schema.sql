-- ============================================================
-- CF Réseau — Schéma Supabase
-- À exécuter dans Supabase Dashboard > SQL Editor
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- PROFILES (rôles applicatifs, liés à auth.users)
-- ------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'formateur' check (role in ('admin', 'formateur')),
  created_at timestamptz not null default now()
);

-- Crée automatiquement un profil (rôle "formateur" par défaut) à l'inscription
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'formateur');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Fonction utilitaire pour les policies : l'utilisateur courant est-il admin ?
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- ------------------------------------------------------------
-- SALLES
-- ------------------------------------------------------------
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  capacity int not null check (capacity > 0),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- FORMATEURS
-- ------------------------------------------------------------
create table if not exists trainers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  specialty text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- STAGIAIRES
-- ------------------------------------------------------------
create table if not exists trainees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  company text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- MODÈLES DE FORMATION
-- ------------------------------------------------------------
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  duration_hours numeric not null default 7,
  description text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- SESSIONS
-- ------------------------------------------------------------
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  room_id uuid references rooms(id) on delete set null,
  trainer_id uuid references trainers(id) on delete set null,
  template_id uuid references templates(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'planifiee' check (status in ('confirmee', 'planifiee', 'brouillon')),
  created_at timestamptz not null default now(),
  constraint valid_range check (end_at > start_at)
);

create table if not exists session_trainees (
  session_id uuid references sessions(id) on delete cascade,
  trainee_id uuid references trainees(id) on delete cascade,
  primary key (session_id, trainee_id)
);

create index if not exists idx_sessions_room_time on sessions (room_id, start_at, end_at);
create index if not exists idx_sessions_trainer_time on sessions (trainer_id, start_at, end_at);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Lecture : tout utilisateur connecté. Écriture : admin uniquement.
-- ------------------------------------------------------------
alter table profiles enable row level security;
alter table rooms enable row level security;
alter table trainers enable row level security;
alter table trainees enable row level security;
alter table templates enable row level security;
alter table sessions enable row level security;
alter table session_trainees enable row level security;

create policy "profiles: self read" on profiles for select using (auth.uid() = id or is_admin());
create policy "profiles: admin update" on profiles for update using (is_admin());

create policy "rooms: read all" on rooms for select using (auth.role() = 'authenticated');
create policy "rooms: admin write" on rooms for insert with check (is_admin());
create policy "rooms: admin update" on rooms for update using (is_admin());
create policy "rooms: admin delete" on rooms for delete using (is_admin());

create policy "trainers: read all" on trainers for select using (auth.role() = 'authenticated');
create policy "trainers: admin write" on trainers for insert with check (is_admin());
create policy "trainers: admin update" on trainers for update using (is_admin());
create policy "trainers: admin delete" on trainers for delete using (is_admin());

create policy "trainees: read all" on trainees for select using (auth.role() = 'authenticated');
create policy "trainees: admin write" on trainees for insert with check (is_admin());
create policy "trainees: admin update" on trainees for update using (is_admin());
create policy "trainees: admin delete" on trainees for delete using (is_admin());

create policy "templates: read all" on templates for select using (auth.role() = 'authenticated');
create policy "templates: admin write" on templates for insert with check (is_admin());
create policy "templates: admin update" on templates for update using (is_admin());
create policy "templates: admin delete" on templates for delete using (is_admin());

create policy "sessions: read all" on sessions for select using (auth.role() = 'authenticated');
create policy "sessions: admin write" on sessions for insert with check (is_admin());
create policy "sessions: admin update" on sessions for update using (is_admin());
create policy "sessions: admin delete" on sessions for delete using (is_admin());

create policy "session_trainees: read all" on session_trainees for select using (auth.role() = 'authenticated');
create policy "session_trainees: admin write" on session_trainees for insert with check (is_admin());
create policy "session_trainees: admin delete" on session_trainees for delete using (is_admin());

-- ------------------------------------------------------------
-- DONNÉES DE DÉPART (reprend les données de démo du mockup)
-- ------------------------------------------------------------
insert into rooms (name, capacity) values
  ('Salle A', 18), ('Salle B', 12), ('Salle C', 20),
  ('Salle D', 10), ('Salle E', 16), ('Salle F', 8)
on conflict do nothing;

insert into trainers (full_name, email, specialty) values
  ('Camille Martin', 'camille.martin@cf-reseau.fr', 'Habilitation électrique'),
  ('Alex Durand', 'alex.durand@cf-reseau.fr', 'Prévention & sécurité'),
  ('Morgan Leroy', 'morgan.leroy@cf-reseau.fr', 'Intégration')
on conflict do nothing;

insert into templates (title, duration_hours, description) values
  ('Habilitation électrique B0', 7, 'Formation initiale habilitation électrique niveau B0'),
  ('Prévention & sécurité', 3.5, 'Sensibilisation sécurité au poste de travail'),
  ('Travail en hauteur', 3.5, 'Formation travail en hauteur et port du harnais'),
  ('Accueil nouveaux collaborateurs', 3, 'Session d''intégration')
on conflict do nothing;

-- ============================================================
-- IMPORTANT : après ta première inscription sur /login (Créer un compte),
-- passe ton compte en admin avec la requête suivante (remplace l'email) :
--
--   update profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'ton-email@exemple.fr');
-- ============================================================
