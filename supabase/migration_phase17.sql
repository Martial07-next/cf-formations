-- ============================================================
-- CF Réseaux · Migration Phase 17 : tour de table intégré
-- Formulaire « Tour de table / recueil des incidents » rempli en ligne par le
-- formateur (une fiche par session), et option par formation.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- (Nécessite la migration 16.)
-- ============================================================

create table if not exists session_forms (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  kind text not null check (kind in ('tour_de_table')),
  data jsonb not null default '{}'::jsonb,
  completed boolean not null default false,
  completed_at timestamptz,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (session_id, kind)
);

alter table session_forms enable row level security;
drop policy if exists "session_forms: read" on session_forms;
drop policy if exists "session_forms: fill insert" on session_forms;
drop policy if exists "session_forms: fill update" on session_forms;
drop policy if exists "session_forms: manage delete" on session_forms;
create policy "session_forms: read" on session_forms for select using (auth.role() = 'authenticated');
create policy "session_forms: fill insert" on session_forms for insert with check (can_fill_dossier(session_id));
create policy "session_forms: fill update" on session_forms for update using (can_fill_dossier(session_id));
create policy "session_forms: manage delete" on session_forms for delete using (can_manage());

-- Tour de table demandé dans le dossier de cette formation (oui par défaut).
alter table templates add column if not exists tour_de_table boolean not null default true;

notify pgrst, 'reload schema';
