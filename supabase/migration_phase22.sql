-- ============================================================
-- CF Réseaux · Migration Phase 22 : attestation de fin de formation et
-- appréciation des compétences (générées depuis la fiche d'appréciation)
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

-- Par formation : objectifs (attestation) et compétences évaluées (appréciation).
alter table templates add column if not exists objectifs text;
alter table templates add column if not exists competences text;

-- Paramètres : signataire, n° d'agrément, image du cachet et de la signature.
alter table app_settings add column if not exists signataire text not null default 'GRÉBERT MATTHIEU';
alter table app_settings add column if not exists agrement text not null default 'CTST-2026-27/1/P';
alter table app_settings add column if not exists cachet_image text;   -- image (data URL PNG/JPEG)

notify pgrst, 'reload schema';
