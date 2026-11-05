-- Phase 60 : corbeille des stagiaires (page Stagiaires).
-- Fiches fictives importées (« Apprenant A », « Stagiaire 1 »…) ou sans rapport :
-- mises de côté, absentes des listes et des recherches, restaurables ou supprimées
-- définitivement. Elles ne sont jamais réimportées depuis Digiforma.
alter table public.trainees add column if not exists trashed_at timestamptz;
alter table public.trainees add column if not exists trashed_reason text;
create index if not exists trainees_trashed_idx on public.trainees(trashed_at) where trashed_at is not null;
