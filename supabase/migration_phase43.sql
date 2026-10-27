-- Phase 43 : parcours personnalisés à côté des parcours POEC.
--   poec_programs.kind : 'poec' (France Travail, conventions tripartites)
--   ou 'personnalise' (groupe ou entreprise, sans France Travail).
--   Les parcours existants restent des POEC.
-- Idempotent.

alter table public.poec_programs add column if not exists kind text not null default 'poec';
alter table public.poec_programs drop constraint if exists poec_programs_kind_check;
alter table public.poec_programs add constraint poec_programs_kind_check check (kind in ('poec', 'personnalise'));

notify pgrst, 'reload schema';
