-- ============================================================
-- CF Réseaux · Migration Phase 77 : avis clients présentés aux stagiaires
-- Notes et derniers avis Google / Plus que pro affichés dans la présentation
-- « Votre avis compte ! » du dossier de chaque session (Administration › Paramètres).
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

alter table public.app_settings add column if not exists avis jsonb;

notify pgrst, 'reload schema';
