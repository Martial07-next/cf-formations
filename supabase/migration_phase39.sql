-- Phase 39 : attestations de réussite (IRVE P1, P2, MA1, MA2, MA3…).
--   La formation indique quel modèle utiliser ; le formateur remplit les
--   attestations dans le dossier de la session (avis, note, observations,
--   signature). Idempotent.

alter table public.templates add column if not exists attestation_reussite text;

alter table public.session_forms drop constraint if exists session_forms_kind_check;
alter table public.session_forms add constraint session_forms_kind_check
  check (kind in ('tour_de_table', 'appreciation', 'digiforma', 'reussite'));

notify pgrst, 'reload schema';
