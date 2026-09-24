-- ============================================================
-- CF Réseau — Migration Phase 1 (Planning + fiche session)
-- À exécuter dans Supabase Dashboard > SQL Editor.
-- Purement additif : n'écrase ni ne supprime aucune donnée existante.
-- ============================================================

-- Champs supplémentaires sur les sessions, pour la fiche détaillée.
alter table sessions add column if not exists reference text;
alter table sessions add column if not exists max_trainees int;
alter table sessions add column if not exists notes text;

-- Statut de chaque stagiaire inscrit à une session : validé ou en attente.
alter table session_trainees add column if not exists status text not null default 'en_attente'
  check (status in ('validee', 'en_attente'));

-- Politique d'écriture sur session_trainees pour les admins (l'ancienne policy
-- ne couvrait que insert/select ; on ajoute update pour changer le statut).
drop policy if exists "session_trainees: admin update" on session_trainees;
create policy "session_trainees: admin update" on session_trainees for update using (is_admin());
