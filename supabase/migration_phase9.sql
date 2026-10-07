-- ============================================================
-- CF Réseau — Migration Phase 9 : prénom et nom des stagiaires
-- À exécuter dans Supabase Dashboard > SQL Editor. Ne supprime aucune donnée.
--
-- full_name est conservé (« Prénom Nom ») : il reste utilisé partout pour
-- l'affichage et la recherche, et l'application le recalcule à chaque
-- enregistrement. Les stagiaires déjà saisis gardent leur nom complet ;
-- il suffit d'ouvrir « Modifier » pour répartir prénom et nom.
-- ============================================================

alter table trainees add column if not exists first_name text;
alter table trainees add column if not exists last_name text;

notify pgrst, 'reload schema';
