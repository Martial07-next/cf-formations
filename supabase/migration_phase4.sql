-- ============================================================
-- CF Réseau — Migration Phase 4 (CSV + Digiforma)
-- À exécuter dans Supabase Dashboard > SQL Editor.
-- Purement additif.
-- ============================================================

alter table sessions add column if not exists digiforma_ref text;
