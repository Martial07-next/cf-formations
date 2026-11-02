-- Phase 52 : objectifs propres au certificat d'habilitation électrique.
--   Vide = objectifs de l'attestation de fin de formation.
-- Idempotent.

alter table public.templates add column if not exists objectifs_habilitation text;

notify pgrst, 'reload schema';
