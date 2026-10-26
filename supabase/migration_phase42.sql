-- Phase 42 : accès Dev et suggestions d'amélioration.
--   • profiles.can_dev : case « Accès dev » sur le compte (donnée par
--     l'administrateur, comme l'accès Facturation).
--   • dev_feedback : remarque épinglée à un endroit d'une page (bug,
--     amélioration, suggestion), avec statut suivi par l'administrateur.
--   • dev_feedback_replies : échanges sous chaque remarque.
--   Visible et modifiable par les comptes dev et l'administrateur uniquement.
-- Idempotent.

alter table public.profiles add column if not exists can_dev boolean not null default false;

create or replace function public.is_dev()
returns boolean as $$
  select exists (select 1 from public.profiles where id = auth.uid() and can_dev and role <> 'aucun');
$$ language sql security definer stable set search_path = public, pg_temp;

-- Seul l'administrateur donne ou retire les accès (rôle, Facturation, Dev).
create or replace function public.profiles_protect_rights()
returns trigger as $$
begin
  if (new.can_invoice is distinct from old.can_invoice
      or new.can_dev is distinct from old.can_dev
      or new.role is distinct from old.role)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Seul l''administrateur peut modifier les accès.';
  end if;
  return new;
end;
$$ language plpgsql set search_path = public, pg_temp;

create table if not exists public.dev_feedback (
  id uuid primary key default gen_random_uuid(),
  path text not null,                         -- page (ex. /sessions/…)
  page_title text,
  selector text,                              -- élément visé
  rel_x real,                                 -- position dans l'élément (0 à 1)
  rel_y real,
  page_x real,                                -- position de secours : % de la largeur
  page_y real,                                -- et pixels depuis le haut
  viewport_w integer,
  kind text not null default 'amelioration' check (kind in ('bug', 'amelioration', 'suggestion')),
  priority text not null default 'normale' check (priority in ('basse', 'normale', 'haute')),
  body text not null check (length(body) between 1 and 4000),
  status text not null default 'a_faire' check (status in ('a_faire', 'en_cours', 'fait', 'refuse')),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);
create index if not exists dev_feedback_path on public.dev_feedback (path, status);

create table if not exists public.dev_feedback_replies (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.dev_feedback(id) on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists dev_feedback_replies_fb on public.dev_feedback_replies (feedback_id, created_at);

alter table public.dev_feedback enable row level security;
alter table public.dev_feedback_replies enable row level security;

drop policy if exists "dev_feedback: read" on public.dev_feedback;
drop policy if exists "dev_feedback: insert" on public.dev_feedback;
drop policy if exists "dev_feedback: update" on public.dev_feedback;
drop policy if exists "dev_feedback: delete" on public.dev_feedback;
create policy "dev_feedback: read" on public.dev_feedback for select using (public.is_admin() or public.is_dev());
create policy "dev_feedback: insert" on public.dev_feedback for insert
  with check ((public.is_admin() or public.is_dev()) and created_by = auth.uid());
-- L'administrateur modifie tout (statut…) ; l'auteur, sa remarque tant qu'elle est « à faire ».
create policy "dev_feedback: update" on public.dev_feedback for update using (
  public.is_admin() or (public.is_dev() and created_by = auth.uid() and status = 'a_faire')
);
create policy "dev_feedback: delete" on public.dev_feedback for delete using (
  public.is_admin() or (public.is_dev() and created_by = auth.uid() and status = 'a_faire')
);

drop policy if exists "dev_feedback_replies: read" on public.dev_feedback_replies;
drop policy if exists "dev_feedback_replies: insert" on public.dev_feedback_replies;
drop policy if exists "dev_feedback_replies: delete" on public.dev_feedback_replies;
create policy "dev_feedback_replies: read" on public.dev_feedback_replies for select using (public.is_admin() or public.is_dev());
create policy "dev_feedback_replies: insert" on public.dev_feedback_replies for insert
  with check ((public.is_admin() or public.is_dev()) and created_by = auth.uid());
create policy "dev_feedback_replies: delete" on public.dev_feedback_replies for delete using (
  public.is_admin() or created_by = auth.uid()
);

notify pgrst, 'reload schema';
