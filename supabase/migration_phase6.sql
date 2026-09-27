-- ============================================================
-- CF Réseau — Migration Phase 6 (synchronisation automatique Digiforma)
-- À exécuter dans Supabase Dashboard > SQL Editor.
-- Purement additif.
-- ============================================================

-- Marque une salle comme "virtuelle" (file d'attente), pas un vrai lieu physique.
alter table rooms add column if not exists is_holding boolean not null default false;

-- Salle spéciale "À affecter" pour les sessions importées automatiquement de
-- Digiforma, en attendant qu'un admin leur choisisse une vraie salle.
insert into rooms (name, capacity, status, is_holding)
select 'À affecter (import Digiforma)', 999, 'disponible', true
where not exists (select 1 from rooms where is_holding = true);

-- Empêche d'importer deux fois la même session Digiforma (le cron peut
-- s'exécuter plus d'une fois pour la même journée dans de rares cas).
create unique index if not exists sessions_digiforma_ref_key
  on sessions (digiforma_ref) where digiforma_ref is not null;

-- Journal de la dernière synchronisation, affiché dans Administration > Intégrations.
alter table app_settings add column if not exists digiforma_last_sync timestamptz;
alter table app_settings add column if not exists digiforma_last_sync_status text;
alter table app_settings add column if not exists digiforma_last_sync_log text;
