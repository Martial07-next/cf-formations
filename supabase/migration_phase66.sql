-- Phase 66 : salle et intervenants indiqués sur Digiforma, gardés avec chaque module.
-- Ils sont repris sur le planning quand la salle / le formateur existe sur la plateforme.
alter table public.digiforma_modules add column if not exists df_room text;
alter table public.digiforma_modules add column if not exists df_trainers jsonb;

notify pgrst, 'reload schema';
