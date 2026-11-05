-- Phase 57 : modules Digiforma à placer, semaine par semaine.
-- Une session Digiforma peut s'étaler sur un an : on importe ses MODULES
-- (dates réelles, stagiaires à jour), et le bureau place sur le planning ceux
-- de la semaine. Rafraîchi à chaque synchronisation.
create table if not exists public.digiforma_modules (
  key text primary key,                 -- « <session Digiforma>:<module> »
  df_session_id text not null,
  df_session_name text,
  name text,
  start_at timestamp not null,          -- heure locale (comme sessions.start_at)
  end_at timestamp not null,
  trainees jsonb not null default '[]', -- stagiaires du module (ou de la session), au dernier passage
  whole_session boolean not null default false, -- pas de module trouvé : session entière
  placed_session_id uuid references public.sessions(id) on delete set null,
  synced_at timestamptz not null default now()
);
create index if not exists digiforma_modules_dates_idx on public.digiforma_modules(start_at, end_at);
create index if not exists digiforma_modules_session_idx on public.digiforma_modules(df_session_id);

alter table public.digiforma_modules enable row level security;
drop policy if exists "digiforma_modules: read" on public.digiforma_modules;
drop policy if exists "digiforma_modules: write" on public.digiforma_modules;
create policy "digiforma_modules: read" on public.digiforma_modules for select using (auth.role() = 'authenticated');
create policy "digiforma_modules: write" on public.digiforma_modules for all using (can_manage()) with check (can_manage());
