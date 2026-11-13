-- Phase 69 : liste des stagiaires modifiable par le bureau le jour même.
--   Dès l'heure de début de la session, la liste reste figée (ajout, retrait,
--   changement de statut / initial-recyclage), SAUF :
--     · l'administrateur, toujours (correction d'une erreur) ;
--     · le bureau administratif, pendant tout le premier jour de la session
--       (retardataire, absent, client particulier ajouté sur Digiforma…).
--   Les synchronisations automatiques (Digiforma) ne sont pas concernées.
-- Idempotent : peut être exécuté plusieurs fois.

create or replace function public.session_trainees_freeze()
returns trigger as $$
declare sid uuid; s_start timestamp; started boolean; first_day boolean;
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
  select (s.start_at at time zone 'UTC') into s_start from public.sessions s where s.id = sid;
  started := s_start <= (now() at time zone 'Europe/Paris');
  first_day := (now() at time zone 'Europe/Paris')::date <= s_start::date;
  if started and not (public.can_manage() and first_day) then
    raise exception 'La session a commencé : la liste des stagiaires est figée. Le bureau peut la modifier le premier jour ; ensuite, seul l''administrateur peut la corriger.';
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql set search_path = public, pg_temp;

drop trigger if exists session_trainees_freeze on public.session_trainees;
create trigger session_trainees_freeze before insert or update or delete on public.session_trainees
  for each row execute procedure public.session_trainees_freeze();

notify pgrst, 'reload schema';
