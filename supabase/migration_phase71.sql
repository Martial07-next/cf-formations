-- ============================================================
-- CF Réseaux · Migration Phase 71 : périmètre d'habilitation
-- Schéma du périmètre habilitable (comité) choisi sur la formation ou dans
-- les paramètres propres à la session : 3e page de l'appréciation des compétences.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

alter table public.templates add column if not exists perimetre_habilitation text;

notify pgrst, 'reload schema';
