-- ============================================================
-- CF Réseaux · Migration Phase 18 : mentions légales des documents
-- N° SIRET, n° de déclaration d'activité et ville du « Fait à »,
-- imprimés sur la feuille d'émargement.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================
alter table app_settings add column if not exists siret text;
alter table app_settings add column if not exists nda text;
alter table app_settings add column if not exists signature_city text not null default 'Cuincy';
notify pgrst, 'reload schema';
