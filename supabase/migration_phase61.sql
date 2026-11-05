-- Phase 61 : GEIQ / parcours Digiforma reliés aux parcours de la plateforme.
--  · chaque module Digiforma connaît son parcours (existant, ou créé automatiquement) ;
--  · un parcours créé depuis Digiforma garde la référence de sa session Digiforma.
alter table public.digiforma_modules add column if not exists program_id uuid references public.poec_programs(id) on delete set null;
alter table public.poec_programs add column if not exists digiforma_ref text;
create index if not exists poec_programs_digiforma_ref_idx on public.poec_programs(digiforma_ref) where digiforma_ref is not null;
