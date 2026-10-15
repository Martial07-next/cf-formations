-- ============================================================
-- CF Réseaux · Migration Phase 32 : liste des stagiaires figée
--   Dès l'heure de début de la session, plus d'ajout, de retrait ni de
--   changement de statut / initial-recyclage des stagiaires (sauf
--   administrateur, pour corriger une erreur). Les synchronisations
--   automatiques (Digiforma) ne sont pas concernées.
-- À exécuter dans Supabase > SQL Editor (projet utilisé par le site),
-- nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

create or replace function public.session_trainees_freeze()
returns trigger as $$
declare sid uuid; started boolean;
begin
  if auth.uid() is null or public.is_admin() then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
     and to_jsonb(new) ->> 'cursus' is not distinct from to_jsonb(old) ->> 'cursus' then
    return new;  -- relances, suivi… : autorisés
  end if;
  sid := coalesce(new.session_id, old.session_id);
  -- Heures de session enregistrées « à l'heure affichée » : comparées à l'heure de Paris.
  select (s.start_at at time zone 'UTC') <= (now() at time zone 'Europe/Paris') into started
  from public.sessions s where s.id = sid;
  if started then
    raise exception 'La session a commencé : la liste des stagiaires est figée. Seul l''administrateur peut la corriger.';
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists session_trainees_freeze on public.session_trainees;
create trigger session_trainees_freeze before insert or update or delete on public.session_trainees
  for each row execute procedure public.session_trainees_freeze();

notify pgrst, 'reload schema';
