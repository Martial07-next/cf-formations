-- Phase 54 : durée propre au recyclage (optionnelle).
-- Vide = même durée que la formation initiale.
alter table public.templates add column if not exists duration_hours_recyclage numeric;
