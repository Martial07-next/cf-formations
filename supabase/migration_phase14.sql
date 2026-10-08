-- ============================================================
-- CF Réseaux · Migration Phase 14 : évènements du planning
-- Évènements externes, repas de groupe, passages CACES / SST, sessions de
-- recrutement, forums… Affichés en aperçu sur le planning, sans aucun
-- blocage des sessions de formation.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

create table if not exists planning_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'externe'
    check (kind in ('externe', 'repas', 'examen', 'recrutement', 'forum', 'autre')),
  title text not null,
  start_date date not null,
  end_date date not null,
  start_time time,            -- vide = journée entière
  end_time time,
  location text,
  participants text,          -- autres personnes concernées (texte libre)
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint planning_events_range check (end_date >= start_date)
);
create index if not exists planning_events_dates on planning_events (start_date, end_date);

-- Formateurs concernés par un évènement (facultatif).
create table if not exists planning_event_trainers (
  event_id uuid not null references planning_events(id) on delete cascade,
  trainer_id uuid not null references trainers(id) on delete cascade,
  primary key (event_id, trainer_id)
);

alter table planning_events enable row level security;
drop policy if exists "planning_events: read" on planning_events;
drop policy if exists "planning_events: manage insert" on planning_events;
drop policy if exists "planning_events: manage update" on planning_events;
drop policy if exists "planning_events: manage delete" on planning_events;
create policy "planning_events: read" on planning_events for select using (auth.role() = 'authenticated');
create policy "planning_events: manage insert" on planning_events for insert with check (can_manage());
create policy "planning_events: manage update" on planning_events for update using (can_manage());
create policy "planning_events: manage delete" on planning_events for delete using (can_manage());

alter table planning_event_trainers enable row level security;
drop policy if exists "planning_event_trainers: read" on planning_event_trainers;
drop policy if exists "planning_event_trainers: manage insert" on planning_event_trainers;
drop policy if exists "planning_event_trainers: manage delete" on planning_event_trainers;
create policy "planning_event_trainers: read" on planning_event_trainers for select using (auth.role() = 'authenticated');
create policy "planning_event_trainers: manage insert" on planning_event_trainers for insert with check (can_manage());
create policy "planning_event_trainers: manage delete" on planning_event_trainers for delete using (can_manage());

notify pgrst, 'reload schema';
