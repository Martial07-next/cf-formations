-- Phase 67 : jours réels des créneaux Digiforma, gardés avec chaque module.
-- Un jour ouvré sans créneau sur Digiforma (ex. férié travaillé chez nous, mais pas de cours)
-- devient un jour sans formation pour la session créée depuis Digiforma : ni heures, ni émargement.
alter table public.digiforma_modules add column if not exists df_days jsonb;

notify pgrst, 'reload schema';
