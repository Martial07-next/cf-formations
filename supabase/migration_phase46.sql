-- Phase 46 : titres d'habilitation des stagiaires.
--   · Tour de table : case « Titre d'habilitation » par stagiaire ; sans titre,
--     les attestations du stagiaire ne peuvent pas être remises.
--   · Dépôt du titre : par le stagiaire (QR code de la session, sans compte)
--     ou par le formateur / le bureau (scan d'un titre papier).
--   · Le bureau télécharge les titres pour les déposer sur Digiforma.
-- Fichiers : bucket privé « titres » (photos et PDF, 10 Mo), <session>/<stagiaire>/.
-- Écritures uniquement par le serveur (contrôle des droits) ; lecture : équipe
-- du dossier de la session et facturation.
-- Idempotent.

alter table public.sessions add column if not exists title_token text;
create unique index if not exists sessions_title_token on public.sessions (title_token);

create table if not exists public.habilitation_titles (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  trainee_id uuid not null references public.trainees(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime text not null,
  size int not null default 0,
  source text not null default 'formateur' check (source in ('stagiaire', 'formateur', 'bureau')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists habilitation_titles_session on public.habilitation_titles (session_id, trainee_id);

alter table public.habilitation_titles enable row level security;
drop policy if exists "habilitation_titles: read" on public.habilitation_titles;
create policy "habilitation_titles: read" on public.habilitation_titles
  for select using (public.can_fill_dossier(session_id) or public.is_billing());

-- Bucket privé : aucun accès direct, envoi par URL signée délivrée par le serveur.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('titres', 'titres', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
