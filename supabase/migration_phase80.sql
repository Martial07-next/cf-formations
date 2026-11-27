-- ============================================================
-- CF Réseaux · Migration Phase 80
--   Planning prévisionnel (bureau uniquement) : formations estimées à
--   l'avance (proposées par l'IA à partir de l'historique, ou ajoutées à la
--   main), à positionner ensuite sur le vrai planning.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

create table if not exists public.forecast_sessions (
  id uuid primary key default gen_random_uuid(),
  ai_key text,                                   -- formation + date proposée (évite de reproposer une prévision ignorée)
  source text not null default 'manuel' check (source in ('ia', 'manuel')),
  status text not null default 'prevu' check (status in ('prevu', 'place', 'ignore')),
  template_id uuid references public.templates(id) on delete set null,
  title text not null,
  room_id uuid references public.rooms(id) on delete set null,
  trainer_id uuid references public.trainers(id) on delete set null,
  start_date date not null,
  end_date date not null,
  start_time text not null default '08:00',
  end_time text not null default '16:00',
  confidence int,                                -- 0 à 100 (prévisions de l'IA)
  reason text,                                   -- pourquoi l'IA la propose
  placed_session_id uuid references public.sessions(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forecast_sessions_dates check (end_date >= start_date)
);
create index if not exists forecast_sessions_dates on public.forecast_sessions (start_date, end_date);

alter table public.forecast_sessions enable row level security;
drop policy if exists "forecast_sessions: read" on public.forecast_sessions;
drop policy if exists "forecast_sessions: insert" on public.forecast_sessions;
drop policy if exists "forecast_sessions: update" on public.forecast_sessions;
drop policy if exists "forecast_sessions: delete" on public.forecast_sessions;
-- Bureau et administrateur seulement : les formateurs ne voient pas le prévisionnel.
create policy "forecast_sessions: read" on public.forecast_sessions for select using (public.can_manage());
create policy "forecast_sessions: insert" on public.forecast_sessions for insert with check (public.can_manage());
create policy "forecast_sessions: update" on public.forecast_sessions for update using (public.can_manage());
create policy "forecast_sessions: delete" on public.forecast_sessions for delete using (public.can_manage());

notify pgrst, 'reload schema';
