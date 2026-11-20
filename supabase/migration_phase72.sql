-- ============================================================
-- CF Réseaux · Migration Phase 72 : certificats de réalisation
-- Case « Certificats de réalisation » sur la formation (catalogue) ou dans
-- les paramètres propres à la session. Le formateur choisit la nature de
-- l'action pour chaque stagiaire (fiche « certificat ») ; un certificat par stagiaire.
-- (Peut être relancée sans risque.)
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

alter table public.templates add column if not exists certificat_realisation boolean not null default false;

alter table public.session_forms drop constraint if exists session_forms_kind_check;
alter table public.session_forms add constraint session_forms_kind_check
  check (kind in ('tour_de_table', 'appreciation', 'digiforma', 'reussite', 'habilitation', 'irve_grille', 'maint_grille', 'certificat'));

notify pgrst, 'reload schema';
