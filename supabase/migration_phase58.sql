-- Phase 58 : module Digiforma déjà couvert sur le planning par un parcours
-- (évènement ou session du parcours POEC / GEIQ / personnalisé, cette semaine-là) :
-- il n'est plus proposé dans « Modules Digiforma à placer ».
alter table public.digiforma_modules add column if not exists covered_by text;
