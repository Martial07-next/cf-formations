-- ============================================================
-- CF Réseaux · Migration Phase 70 : suivi des stagiaires Digiforma
-- trainees.digiforma_id : la fiche du stagiaire sur Digiforma (nom ou e-mail
--   modifié sur Digiforma → même stagiaire mis à jour, pas un doublon).
-- session_trainees.from_digiforma : inscription venue de Digiforma ; retirée
--   automatiquement si le stagiaire n'est plus sur la session Digiforma
--   (déplacé sur une autre session, client annulé…), tant que la session n'a
--   pas commencé. Les stagiaires ajoutés à la main ne sont jamais retirés.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

alter table public.trainees add column if not exists digiforma_id text;
create index if not exists trainees_digiforma_id on public.trainees (digiforma_id);
alter table public.session_trainees add column if not exists from_digiforma boolean not null default false;

notify pgrst, 'reload schema';
