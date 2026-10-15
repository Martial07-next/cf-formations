-- ============================================================
-- CF Réseaux · Migration Phase 33 : formations disponibles en recyclage
--   · Case « Formation disponible en recyclage » sur la formation : les
--     boutons Initial / Recyclage n'apparaissent que pour ces formations ;
--   · objectifs et compétences évaluées propres au recyclage (attestation
--     de fin de formation, appréciation des compétences).
-- À exécuter dans Supabase > SQL Editor (projet utilisé par le site),
-- nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

alter table public.templates add column if not exists recyclage_available boolean not null default false;
alter table public.templates add column if not exists objectifs_recyclage text;
alter table public.templates add column if not exists competences_recyclage text;

notify pgrst, 'reload schema';
