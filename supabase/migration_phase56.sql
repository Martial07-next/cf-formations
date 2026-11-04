-- Phase 56 : attestations de départ anticipé et décharge de responsabilité.
-- Le stagiaire remplit l'attestation par QR code (page sans compte, même jeton
-- que les autorisations) : date et heure de départ enregistrées automatiquement.
create table if not exists public.early_departures (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  trainee_id uuid not null references public.trainees(id) on delete cascade,
  departed_at timestamptz not null default now(),
  reason text not null,
  details text,
  formation_title text,
  city text,
  signature text not null,
  created_at timestamptz not null default now()
);
create index if not exists early_departures_session_idx on public.early_departures(session_id);
create index if not exists early_departures_trainee_idx on public.early_departures(trainee_id);

alter table public.early_departures enable row level security;
drop policy if exists "early_departures: read" on public.early_departures;
drop policy if exists "early_departures: delete" on public.early_departures;
-- Lecture : comptes de l'équipe. Écriture : page du QR code (clé service). Suppression : bureau / admin.
create policy "early_departures: read" on public.early_departures for select using (auth.role() = 'authenticated');
create policy "early_departures: delete" on public.early_departures for delete using (can_manage());

-- Départ anticipé possible sur la formation (null = automatique : pas pour l'IRVE).
alter table public.templates add column if not exists early_departure boolean;
