-- Phase 49 : évènements rattachés à un parcours (ex. parcours personnalisé).
--   L'évènement reste un évènement du planning (affiché comme avant) et
--   apparaît aussi dans « Semaine par semaine » du parcours.
-- Idempotent.

alter table public.planning_events add column if not exists poec_id uuid references public.poec_programs(id) on delete set null;
create index if not exists planning_events_poec on public.planning_events (poec_id);

notify pgrst, 'reload schema';
