-- Phase 44 : formations extérieures (INTRA, dans les locaux d'une entreprise).
--   Chaque formation extérieure a sa propre « salle » (status = 'exterieur') :
--   nom de l'entreprise / du lieu et adresse. Elle n'apparaît pas dans la
--   liste des salles ; sur le planning, sa colonne n'est affichée que les
--   semaines où elle a des sessions.
--   La salle extérieure est supprimée avec sa dernière session.
-- Idempotent.

alter table public.rooms drop constraint if exists rooms_status_check;
alter table public.rooms add constraint rooms_status_check check (status in ('disponible', 'indisponible', 'exterieur'));

create or replace function public.cleanup_external_room()
returns trigger as $$
begin
  if old.room_id is not null and (tg_op = 'DELETE' or new.room_id is distinct from old.room_id) then
    delete from public.rooms r
    where r.id = old.room_id
      and r.status = 'exterieur'
      and not exists (select 1 from public.sessions s where s.room_id = old.room_id);
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists sessions_cleanup_external_room on public.sessions;
create trigger sessions_cleanup_external_room
  after delete or update of room_id on public.sessions
  for each row execute procedure public.cleanup_external_room();

notify pgrst, 'reload schema';
