-- ============================================================
-- CF Réseaux · Migration Phase 31 : suppression des sessions
--   Corrige « session_activity_session_id_fkey » : en supprimant une
--   session, ses inscriptions partent aussi et l'historique essayait de
--   noter « stagiaire retiré » pour une session qui n'existe plus.
-- À exécuter dans Supabase > SQL Editor (projet utilisé par le site),
-- nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

create or replace function public.session_trainees_log()
returns trigger as $$
declare who text;
begin
  if tg_op = 'DELETE' then
    -- Session elle-même supprimée : rien à noter (son historique part avec elle).
    if not exists (select 1 from public.sessions where id = old.session_id) then
      return old;
    end if;
    select full_name into who from public.trainees where id = old.trainee_id;
    insert into public.session_activity (session_id, trainee_id, action, detail)
      values (old.session_id, old.trainee_id, 'stagiaire_retire', who);
    return old;
  end if;
  select full_name into who from public.trainees where id = new.trainee_id;
  if tg_op = 'INSERT' then
    insert into public.session_activity (session_id, trainee_id, action, detail)
      values (new.session_id, new.trainee_id, case when new.status = 'validee' then 'stagiaire_valide' else 'stagiaire_attente' end, who);
  elsif new.status is distinct from old.status then
    insert into public.session_activity (session_id, trainee_id, action, detail)
      values (new.session_id, new.trainee_id, case when new.status = 'validee' then 'statut_valide' else 'statut_attente' end, who);
  elsif new.followup_count > old.followup_count then
    insert into public.session_activity (session_id, trainee_id, action, detail)
      values (new.session_id, new.trainee_id, 'relance', who || coalesce(' · ' || nullif(new.followup_note, ''), ''));
  elsif new.followup_by is distinct from old.followup_by then
    insert into public.session_activity (session_id, trainee_id, action, detail)
      values (new.session_id, new.trainee_id, 'suivi_attribue', who);
  end if;
  return new;
end;
$$ language plpgsql security definer;

notify pgrst, 'reload schema';
