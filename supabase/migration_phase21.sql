-- ============================================================
-- CF Réseaux · Migration Phase 21 : fiches d'appréciation individuelle
-- Une fiche par stagiaire, remplie en ligne par le formateur (avis favorable /
-- défavorable, écarts constatés, autres informations).
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- (Nécessite la migration 17.)
-- ============================================================

-- Nouveau type de formulaire de session.
alter table session_forms drop constraint if exists session_forms_kind_check;
alter table session_forms add constraint session_forms_kind_check check (kind in ('tour_de_table', 'appreciation'));

-- Par formation : fiche nécessaire ou non, et codification SERECT.
alter table templates add column if not exists fiche_appreciation boolean not null default false;
alter table templates add column if not exists codification text;

-- Par session : vide = comme la formation, sinon oui / non pour cette session.
alter table sessions add column if not exists fiche_appreciation boolean;

notify pgrst, 'reload schema';
