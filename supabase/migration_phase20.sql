-- ============================================================
-- CF Réseaux · Migration Phase 20 : places réservées par entreprise
-- Ex. « 3 personnes de l'entreprise X » sans connaître encore leurs noms.
-- Dès qu'un stagiaire de cette entreprise est inscrit, il prend une des places.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

create table if not exists session_reservations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  company text not null,
  seats int not null check (seats > 0 and seats <= 200),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists session_reservations_session on session_reservations (session_id);

alter table session_reservations enable row level security;
drop policy if exists "session_reservations: read" on session_reservations;
drop policy if exists "session_reservations: manage insert" on session_reservations;
drop policy if exists "session_reservations: manage update" on session_reservations;
drop policy if exists "session_reservations: manage delete" on session_reservations;
create policy "session_reservations: read" on session_reservations for select using (auth.role() = 'authenticated');
create policy "session_reservations: manage insert" on session_reservations for insert with check (can_manage());
create policy "session_reservations: manage update" on session_reservations for update using (can_manage());
create policy "session_reservations: manage delete" on session_reservations for delete using (can_manage());

notify pgrst, 'reload schema';
