-- ============================================================
-- CF Réseaux · Migration Phase 78 : certificateur externe
-- Un jour de session peut être confié à un certificateur externe (évaluation
-- des stagiaires) : le formateur est libre ce jour-là, le nom du certificateur
-- s'affiche sur le planning mais jamais sur les documents (formateur principal).
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

alter table public.session_day_trainers alter column trainer_id drop not null;
alter table public.session_day_trainers add column if not exists external_name text;
alter table public.session_day_trainers drop constraint if exists session_day_trainers_who;
alter table public.session_day_trainers add constraint session_day_trainers_who check (trainer_id is not null or coalesce(trim(external_name), '') <> '');

notify pgrst, 'reload schema';
