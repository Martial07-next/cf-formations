-- Phase 37 : une salle se contrôle heure par heure, jour par jour.
--   Avant : une formation était vue comme un seul bloc du premier matin au
--   dernier soir (nuits comprises) : impossible de poser 7 h–8 h le 2e jour
--   d'une formation 8 h–16 h.
--   Maintenant : une session peut se placer avant ou après une autre dans la
--   même salle, jamais pendant (horaires propres à certains jours compris).
-- Idempotent.

-- Créneaux réels d'une session : un par jour ouvré (ou le jour unique), avec
-- l'horaire propre au jour s'il existe.
create or replace function public.session_slots(p_id uuid, p_start timestamptz, p_end timestamptz)
returns table (d date, st time, en time) as $$
  select g::date,
         coalesce(o.start_time, (p_start at time zone 'UTC')::time),
         coalesce(o.end_time, (p_end at time zone 'UTC')::time)
  from generate_series((p_start at time zone 'UTC')::date, (p_end at time zone 'UTC')::date, interval '1 day') g
  left join public.session_days o on o.session_id = p_id and o.day = g::date
  where extract(isodow from g) < 6
     or (p_start at time zone 'UTC')::date = (p_end at time zone 'UTC')::date;
$$ language sql stable set search_path = public, pg_temp;

-- Première session de la salle qui chevauche vraiment (même jour, mêmes heures).
create or replace function public.room_clash(p_id uuid, p_room uuid, p_start timestamptz, p_end timestamptz)
returns table (title text, d date, st time, en time) as $$
  select s.title, a.d, greatest(a.st, b.st), least(a.en, b.en)
  from public.sessions s
  cross join lateral public.session_slots(p_id, p_start, p_end) a
  cross join lateral public.session_slots(s.id, s.start_at, s.end_at) b
  where s.room_id = p_room
    and s.id <> p_id
    -- Jours en commun (un horaire propre au jour peut dépasser l'heure de fin prévue).
    and (s.start_at at time zone 'UTC')::date <= (p_end at time zone 'UTC')::date
    and (s.end_at at time zone 'UTC')::date >= (p_start at time zone 'UTC')::date
    and a.d = b.d
    and a.st < b.en
    and a.en > b.st
  limit 1;
$$ language sql stable set search_path = public, pg_temp;

create or replace function public.check_room_overlap()
returns trigger as $$
declare clash record;
begin
  if new.room_id is null then
    return new;
  end if;
  if exists (select 1 from public.rooms where id = new.room_id and is_holding) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext(new.room_id::text));
  select * into clash from public.room_clash(new.id, new.room_id, new.start_at, new.end_at);
  if found then
    raise exception 'Conflit : la salle est déjà réservée pour "%" le % (%–%). Une session peut se placer avant ou après, pas pendant.',
      clash.title, to_char(clash.d, 'DD/MM/YYYY'), to_char(clash.st, 'HH24"h"MI'), to_char(clash.en, 'HH24"h"MI')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql set search_path = public, pg_temp;

drop trigger if exists sessions_room_overlap on public.sessions;
create trigger sessions_room_overlap
  before insert or update of room_id, start_at, end_at on public.sessions
  for each row execute procedure public.check_room_overlap();

-- Horaire propre à un jour : contrôlé aussi (après écriture, pour tenir compte du nouvel horaire).
create or replace function public.check_room_overlap_day()
returns trigger as $$
declare s record; clash record;
begin
  select id, room_id, start_at, end_at into s from public.sessions where id = new.session_id;
  if not found or s.room_id is null or exists (select 1 from public.rooms where id = s.room_id and is_holding) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext(s.room_id::text));
  select * into clash from public.room_clash(s.id, s.room_id, s.start_at, s.end_at);
  if found then
    raise exception 'Conflit : la salle est déjà réservée pour "%" le % (%–%). Une session peut se placer avant ou après, pas pendant.',
      clash.title, to_char(clash.d, 'DD/MM/YYYY'), to_char(clash.st, 'HH24"h"MI'), to_char(clash.en, 'HH24"h"MI')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql set search_path = public, pg_temp;

drop trigger if exists session_days_room_overlap on public.session_days;
create trigger session_days_room_overlap
  after insert or update of day, start_time, end_time on public.session_days
  for each row execute procedure public.check_room_overlap_day();

notify pgrst, 'reload schema';
