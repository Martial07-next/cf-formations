-- ============================================================
-- CF Réseaux · Migration Phase 34 : correctif de l'historique des sessions
--   Corrige « malformed array literal: "salle" / "formateur" / "dates" »
--   au changement de salle, de formateur, de dates ou d'intitulé.
-- À exécuter dans Supabase > SQL Editor (projet utilisé par le site),
-- nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

create or replace function public.sessions_log()
returns trigger as $$
declare changes text[] := '{}';
begin
  if tg_op = 'INSERT' then
    insert into public.session_activity (session_id, action, detail) values (new.id, 'session_creee', new.title);
    return new;
  end if;
  if new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at then changes := array_append(changes, 'dates'); end if;
  if new.trainer_id is distinct from old.trainer_id then changes := array_append(changes, 'formateur'); end if;
  if new.room_id is distinct from old.room_id then changes := array_append(changes, 'salle'); end if;
  if new.status is distinct from old.status then changes := array_append(changes, 'statut : ' || new.status); end if;
  if new.title is distinct from old.title then changes := array_append(changes, 'intitulé'); end if;
  if new.manager_id is distinct from old.manager_id then
    insert into public.session_activity (session_id, action, detail)
      values (new.id, 'gestionnaire', (select full_name from public.profiles where id = new.manager_id));
  end if;
  if new.created_by is distinct from old.created_by then
    insert into public.session_activity (session_id, action, detail)
      values (new.id, 'createur', (select full_name from public.profiles where id = new.created_by));
  end if;
  if array_length(changes, 1) > 0 then
    insert into public.session_activity (session_id, action, detail) values (new.id, 'session_modifiee', array_to_string(changes, ', '));
  end if;
  return new;
end;
$$ language plpgsql security definer;

notify pgrst, 'reload schema';
