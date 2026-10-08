-- ============================================================
-- CF Réseaux · Migration Phase 13
-- Référent cadre et formateur ne modifient plus une session (salle, nom,
-- formateur, places, dates, statut) : seul l'horaire de début, jour par
-- jour, reste modifiable (table session_days, déjà autorisée).
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

drop policy if exists "sessions: manage update" on sessions;
create policy "sessions: manage update" on sessions for update using (can_manage());

notify pgrst, 'reload schema';
