-- ============================================================
-- CF Réseaux · Migration Phase 72 : certificats de réalisation
-- Case « Certificats de réalisation » sur la formation (catalogue) ou dans
-- les paramètres propres à la session : un certificat par stagiaire.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

alter table public.templates add column if not exists certificat_realisation boolean not null default false;

notify pgrst, 'reload schema';
