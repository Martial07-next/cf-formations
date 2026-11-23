-- ============================================================
-- CF Réseaux · Migration Phase 74 : baudriers prêtés
-- Les prêts de vêtements TST peuvent aussi comporter des baudriers.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

alter table public.clothing_loans add column if not exists baudriers int not null default 0;
alter table public.clothing_loans add column if not exists returned_baudriers int;
alter table public.clothing_loans drop constraint if exists clothing_loans_baudriers_check;
alter table public.clothing_loans add constraint clothing_loans_baudriers_check check (baudriers between 0 and 20 and (returned_baudriers is null or returned_baudriers between 0 and 20));
alter table public.clothing_loans drop constraint if exists clothing_loans_some;
alter table public.clothing_loans add constraint clothing_loans_some check (vestes + pantalons + baudriers > 0);

notify pgrst, 'reload schema';
