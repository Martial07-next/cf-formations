-- Phase 35 : sécurité des données.
--
--   1. Un compte créé hors de l'administration (inscription directe sur
--      Supabase) n'a AUCUN accès : rôle « aucun » tant que l'administrateur
--      ne lui a pas donné de type d'accès.
--   2. Les lectures « tout compte connecté » deviennent « membre de l'équipe »
--      (rôle autre que « aucun »).
--   3. Données personnelles des stagiaires : visibles par l'équipe
--      (administrateur, bureau, référent cadre), le compte Facturation et,
--      pour un formateur, uniquement les stagiaires de SES sessions.
--      Signatures, autorisations, prêts de vêtements, tour de table,
--      appréciations : idem (formateur de la session seulement).
--   4. Historique interne et conventions POEC : équipe seulement.
--   5. Fonctions « security definer » : search_path fixé.
--
-- Idempotent : peut être exécuté plusieurs fois.

-- 1. Rôle « aucun » pour les comptes non validés ------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'bureau', 'referent', 'formateur', 'consultation', 'aucun'));

create or replace function public.handle_new_user()
returns trigger as $$
begin
  -- L'administration applique ensuite le type d'accès choisi.
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'aucun')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 2. Membre de l'équipe -------------------------------------------------------
create or replace function public.is_member()
returns boolean as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role <> 'aucun');
$$ language sql security definer stable set search_path = public, pg_temp;

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

-- Fichiers du dossier (modèles PDF, documents à signer).
do $$
begin
  alter policy "dossiers: read" on storage.objects using (bucket_id = 'dossiers' and public.is_member());
exception when others then
  raise notice 'Politique de stockage non modifiée : %', sqlerrm;
end $$;

-- 3. Stagiaires : équipe, Facturation, formateur de leurs sessions --------------
create or replace function public.can_see_trainee(tid uuid)
returns boolean as $$
  select public.can_edit_sessions() or public.is_billing() or exists (
    select 1 from public.session_trainees st
    where st.trainee_id = tid and public.is_session_trainer(st.session_id)
  );
$$ language sql security definer stable set search_path = public, pg_temp;

drop policy if exists "trainees: read all" on public.trainees;
drop policy if exists "trainees: read" on public.trainees;
create policy "trainees: read" on public.trainees for select using (public.can_see_trainee(id));

drop policy if exists "trainee_authorizations: read" on public.trainee_authorizations;
create policy "trainee_authorizations: read" on public.trainee_authorizations
  for select using (public.can_see_trainee(trainee_id));

drop policy if exists "document_signatures: read" on public.document_signatures;
create policy "document_signatures: read" on public.document_signatures for select using (
  public.is_admin()
  or (trainee_id is not null and public.can_see_trainee(trainee_id))
  or (employee_id is not null and public.is_employee_self(employee_id))
);

drop policy if exists "clothing_loans: read" on public.clothing_loans;
create policy "clothing_loans: read" on public.clothing_loans
  for select using (public.can_fill_dossier(session_id));

drop policy if exists "attendance: read" on public.attendance_signatures;
create policy "attendance: read" on public.attendance_signatures
  for select using (public.can_fill_dossier(session_id) or public.is_billing());

drop policy if exists "dossier_entries: read" on public.dossier_entries;
create policy "dossier_entries: read" on public.dossier_entries
  for select using (public.can_fill_dossier(session_id) or public.is_billing());

drop policy if exists "session_forms: read" on public.session_forms;
create policy "session_forms: read" on public.session_forms
  for select using (public.can_fill_dossier(session_id) or public.is_billing());

-- 4. Historique interne, conventions et groupes POEC : équipe -----------------
drop policy if exists "session_activity: read" on public.session_activity;
create policy "session_activity: read" on public.session_activity
  for select using (public.can_edit_sessions());

drop policy if exists "poec_conventions: read" on public.poec_conventions;
create policy "poec_conventions: read" on public.poec_conventions
  for select using (public.can_manage());

drop policy if exists "poec_trainees: read" on public.poec_trainees;
create policy "poec_trainees: read" on public.poec_trainees
  for select using (public.can_manage());

-- 5. search_path des fonctions « security definer » ----------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end $$;
