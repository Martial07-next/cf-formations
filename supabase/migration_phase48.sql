-- Phase 48 : jours fériés dans le planning des formations.
--   · worked_holidays : fériés « travaillés » (réponse « Oui » de la direction
--     dans CF Congés), synchronisés avec les congés. Un férié absent de cette
--     table reste férié : pas de formation ce jour-là.
--   · session_holiday_shifts : décalages automatiques d'une session tombant sur
--     un férié (un jour ouvré plus loin), pour ne décaler qu'une fois et
--     annuler le décalage si le férié devient travaillé. « prevu » : session
--     créée en tenant déjà compte du férié ; « conflit » : décalage impossible.
-- Lecture : l'équipe ; écriture : le serveur uniquement (synchronisation).
-- Idempotent.

create table if not exists public.worked_holidays (
  day date primary key,
  label text,
  synced_at timestamptz not null default now()
);
alter table public.worked_holidays enable row level security;
drop policy if exists "worked_holidays: read" on public.worked_holidays;
create policy "worked_holidays: read" on public.worked_holidays for select using (public.is_member());

create table if not exists public.session_holiday_shifts (
  session_id uuid not null references public.sessions(id) on delete cascade,
  holiday date not null,
  label text,
  status text not null default 'decale' check (status in ('decale', 'prevu', 'conflit')),
  moved_start boolean not null default false,
  detail text,
  created_at timestamptz not null default now(),
  primary key (session_id, holiday)
);
alter table public.session_holiday_shifts enable row level security;
drop policy if exists "session_holiday_shifts: read" on public.session_holiday_shifts;
create policy "session_holiday_shifts: read" on public.session_holiday_shifts for select using (public.is_member());

notify pgrst, 'reload schema';
