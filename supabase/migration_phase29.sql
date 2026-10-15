-- ============================================================
-- CF Réseaux · Migration Phase 29 : initial / recyclage par stagiaire
--   Dans une même session, certains stagiaires suivent la formation
--   initiale, d'autres le recyclage : repère sur chaque inscription.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

alter table session_trainees add column if not exists cursus text;
alter table session_trainees drop constraint if exists session_trainees_cursus_check;
alter table session_trainees add constraint session_trainees_cursus_check check (cursus in ('initial', 'recyclage'));

notify pgrst, 'reload schema';
