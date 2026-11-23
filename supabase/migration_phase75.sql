-- ============================================================
-- CF Réseaux · Migration Phase 75 : signature d'un prêt par QR code
-- Chaque prêt (vêtements TST, baudriers) peut être signé par le stagiaire sur
-- son téléphone : lien unique et secret, valable seulement pour ce prêt.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

alter table public.clothing_loans add column if not exists sign_token text;
create unique index if not exists clothing_loans_sign_token on public.clothing_loans (sign_token) where sign_token is not null;

notify pgrst, 'reload schema';
