-- Phase 50 : places réservées par entreprise « en attente ».
--   Des places peuvent être notées en attente (pas encore confirmées par
--   l'entreprise) : elles ne prennent pas les places validées ni la capacité
--   de la session, et s'ajoutent aux stagiaires en attente sur le planning.
-- Idempotent.

alter table public.session_reservations add column if not exists status text not null default 'validee';
alter table public.session_reservations drop constraint if exists session_reservations_status_check;
alter table public.session_reservations add constraint session_reservations_status_check check (status in ('validee', 'en_attente'));

notify pgrst, 'reload schema';
