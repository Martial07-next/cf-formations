-- ============================================================
-- CF Réseau — Migration Phase 1b (horaires par jour)
-- À exécuter dans Supabase Dashboard > SQL Editor.
-- Purement additif.
-- ============================================================

-- Un jour d'une session peut avoir un horaire spécifique (différent des
-- autres jours). S'il n'y a pas de ligne ici pour un jour donné, l'horaire
-- par défaut affiché est celui du time-of-day de start_at / end_at de la
-- session (même heure de début/fin tous les jours).
create table if not exists session_days (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  day date not null,
  start_time time not null,
  end_time time not null,
  unique (session_id, day)
);

alter table session_days enable row level security;

create policy "session_days: read all" on session_days for select using (auth.role() = 'authenticated');
create policy "session_days: admin insert" on session_days for insert with check (is_admin());
create policy "session_days: admin update" on session_days for update using (is_admin());
create policy "session_days: admin delete" on session_days for delete using (is_admin());
