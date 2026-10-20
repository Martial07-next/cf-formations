-- Phase 38 : demandes d'accès et mots de passe oubliés (page de connexion).
--   Les demandes sont enregistrées par le serveur (clé service) ; seul
--   l'administrateur peut les lire, les accepter ou les refuser.
-- Idempotent.

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('acces', 'mot_de_passe')),
  full_name text,
  email text not null,
  role_wanted text,
  message text,
  status text not null default 'en_attente' check (status in ('en_attente', 'acceptee', 'refusee', 'traitee')),
  decision_note text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- Une seule demande en attente par e-mail et par type (pas de doublons ni de spam).
create unique index if not exists access_requests_pending_once
  on public.access_requests (lower(email), kind) where status = 'en_attente';
create index if not exists access_requests_status on public.access_requests (status, created_at desc);

alter table public.access_requests enable row level security;
drop policy if exists "access_requests: admin read" on public.access_requests;
drop policy if exists "access_requests: admin update" on public.access_requests;
drop policy if exists "access_requests: admin delete" on public.access_requests;
create policy "access_requests: admin read" on public.access_requests for select using (public.is_admin());
create policy "access_requests: admin update" on public.access_requests for update using (public.is_admin());
create policy "access_requests: admin delete" on public.access_requests for delete using (public.is_admin());
-- Pas de politique d'insertion : seules les actions du serveur (clé service) créent des demandes.

notify pgrst, 'reload schema';
