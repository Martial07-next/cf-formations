-- ============================================================
-- CF Réseaux · Migration Phase 29 : initial / recyclage par stagiaire
--   Dans une même session, certains stagiaires suivent la formation
--   initiale, d'autres le recyclage : repère sur chaque inscription.
-- À exécuter dans Supabase > SQL Editor (projet utilisé par le site),
-- nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

do $$
begin
  if to_regclass('public.session_trainees') is null then
    raise exception 'Table public.session_trainees introuvable : vérifie que tu es bien dans le projet Supabase du site (celui dont l''URL est dans Vercel), et que le schéma est « public ».';
  end if;
end $$;

alter table public.session_trainees add column if not exists cursus text;
alter table public.session_trainees drop constraint if exists session_trainees_cursus_check;
alter table public.session_trainees add constraint session_trainees_cursus_check check (cursus in ('initial', 'recyclage'));

notify pgrst, 'reload schema';
