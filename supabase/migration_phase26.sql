-- ============================================================
-- CF Réseaux · Migration Phase 26 : droits administrateur
--   · Documents des salariés : visibles et gérés par l'administrateur
--     seulement (le salarié voit toujours les siens) ;
--   · « Créée par » d'une session : modifiable par l'administrateur seul ;
--   · Historique des sessions : effaçable par l'administrateur seul.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

-- 1. Salariés : administrateur uniquement.
drop policy if exists "employees: read" on employees;
drop policy if exists "employees: manage insert" on employees;
drop policy if exists "employees: manage update" on employees;
drop policy if exists "employees: manage delete" on employees;
create policy "employees: read" on employees for select using (is_admin() or profile_id = auth.uid());
create policy "employees: manage insert" on employees for insert with check (is_admin());
create policy "employees: manage update" on employees for update using (is_admin());
create policy "employees: manage delete" on employees for delete using (is_admin());

drop policy if exists "employee_documents: read" on employee_documents;
drop policy if exists "employee_documents: manage insert" on employee_documents;
drop policy if exists "employee_documents: manage update" on employee_documents;
drop policy if exists "employee_documents: manage delete" on employee_documents;
create policy "employee_documents: read" on employee_documents for select using (is_admin() or is_employee_self(employee_id));
create policy "employee_documents: manage insert" on employee_documents for insert with check (is_admin());
create policy "employee_documents: manage update" on employee_documents for update using (is_admin());
create policy "employee_documents: manage delete" on employee_documents for delete using (is_admin());

-- 2. « Créée par » : seul l'administrateur peut le changer (protégé dans la base).
create or replace function sessions_protect_creator()
returns trigger as $$
begin
  if new.created_by is distinct from old.created_by and auth.uid() is not null and not is_admin() then
    raise exception 'Seul l''administrateur peut modifier le créateur de la session.';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists sessions_protect_creator on sessions;
create trigger sessions_protect_creator before update on sessions
  for each row execute procedure sessions_protect_creator();

-- Le changement de créateur apparaît dans l'historique.
create or replace function sessions_log()
returns trigger as $$
declare changes text[] := '{}';
begin
  if tg_op = 'INSERT' then
    insert into session_activity (session_id, action, detail) values (new.id, 'session_creee', new.title);
    return new;
  end if;
  if new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at then changes := changes || 'dates'; end if;
  if new.trainer_id is distinct from old.trainer_id then changes := changes || 'formateur'; end if;
  if new.room_id is distinct from old.room_id then changes := changes || 'salle'; end if;
  if new.status is distinct from old.status then changes := changes || ('statut : ' || new.status); end if;
  if new.title is distinct from old.title then changes := changes || 'intitulé'; end if;
  if new.manager_id is distinct from old.manager_id then
    insert into session_activity (session_id, action, detail)
      values (new.id, 'gestionnaire', (select full_name from profiles where id = new.manager_id));
  end if;
  if new.created_by is distinct from old.created_by then
    insert into session_activity (session_id, action, detail)
      values (new.id, 'createur', (select full_name from profiles where id = new.created_by));
  end if;
  if array_length(changes, 1) > 0 then
    insert into session_activity (session_id, action, detail) values (new.id, 'session_modifiee', array_to_string(changes, ', '));
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- 3. Historique : effacement par l'administrateur seul.
drop policy if exists "session_activity: admin delete" on session_activity;
create policy "session_activity: admin delete" on session_activity for delete using (is_admin());

notify pgrst, 'reload schema';
