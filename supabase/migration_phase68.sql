-- Phase 68 : sécurité des données (suite de la migration 35).
--
--   1. Départs anticipés (migration 56) : lisibles seulement par le bureau, la
--      facturation et le formateur de la session (et non par tout compte connecté).
--   2. Modules Digiforma (migration 57) : ils contiennent les noms et e-mails
--      des stagiaires de Digiforma → bureau administratif uniquement.
--   3. Filet de sécurité : toute lecture restée « tout compte connecté »
--      (même un compte non validé) devient « membre de l'équipe ».
--   4. Fonctions « security definer » : search_path fixé (celles créées depuis).
--
-- Idempotent : peut être exécuté plusieurs fois. Ne supprime aucune donnée.

-- 1. Départs anticipés --------------------------------------------------------
drop policy if exists "early_departures: read" on public.early_departures;
create policy "early_departures: read" on public.early_departures
  for select using (public.can_fill_dossier(session_id) or public.is_billing());

-- 2. Modules Digiforma --------------------------------------------------------
drop policy if exists "digiforma_modules: read" on public.digiforma_modules;
create policy "digiforma_modules: read" on public.digiforma_modules
  for select using (public.can_manage());

-- 3. Lectures « tout compte connecté » restantes → membres de l'équipe ---------
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and cmd = 'SELECT'
      and replace(qual, ' ', '') in ('(auth.role()=''authenticated''::text)', 'auth.role()=''authenticated''::text')
  loop
    execute format('alter policy %I on %I.%I using (public.is_member())', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- 4. search_path des fonctions « security definer » ----------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end $$;

-- 5. Tables publiques sans protection (RLS) : signalées, pour vérification -----
do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    raise notice 'Table sans RLS : % (à signaler)', t.relname;
  end loop;
end $$;

notify pgrst, 'reload schema';
