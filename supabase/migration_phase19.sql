-- ============================================================
-- CF Réseaux · Migration Phase 19 : remplacement du formateur certains jours
-- Ex. formation sur 5 jours, le formateur principal est absent les jours 3 et 4 :
-- un autre formateur est affecté à ces jours-là seulement.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

create table if not exists session_day_trainers (
  session_id uuid not null references sessions(id) on delete cascade,
  day date not null,
  trainer_id uuid not null references trainers(id) on delete cascade,
  note text,                                    -- motif (facultatif)
  created_at timestamptz not null default now(),
  primary key (session_id, day)
);
create index if not exists session_day_trainers_trainer on session_day_trainers (trainer_id, day);

alter table session_day_trainers enable row level security;
drop policy if exists "session_day_trainers: read" on session_day_trainers;
drop policy if exists "session_day_trainers: manage insert" on session_day_trainers;
drop policy if exists "session_day_trainers: manage update" on session_day_trainers;
drop policy if exists "session_day_trainers: manage delete" on session_day_trainers;
create policy "session_day_trainers: read" on session_day_trainers for select using (auth.role() = 'authenticated');
create policy "session_day_trainers: manage insert" on session_day_trainers for insert with check (can_manage());
create policy "session_day_trainers: manage update" on session_day_trainers for update using (can_manage());
create policy "session_day_trainers: manage delete" on session_day_trainers for delete using (can_manage());

-- Le formateur remplaçant a les mêmes droits sur la session que le formateur
-- principal (horaires, émargement, documents du dossier).
create or replace function is_session_trainer(sid uuid)
returns boolean as $$
  select exists (
    select 1 from sessions s join trainers t on t.id = s.trainer_id
    where s.id = sid and t.profile_id = auth.uid()
  ) or exists (
    select 1 from session_day_trainers d join trainers t on t.id = d.trainer_id
    where d.session_id = sid and t.profile_id = auth.uid()
  );
$$ language sql security definer stable;

-- Congé du formateur principal : n'empêche plus la session si les jours
-- concernés sont assurés par un remplaçant (week-ends ignorés).
create or replace function check_trainer_absence()
returns trigger as $$
declare r record;
begin
  if new.trainer_id is null then
    return new;
  end if;
  select ab.start_date, ab.end_date, ab.kind into r
  from trainer_absences ab
  where ab.trainer_id = new.trainer_id
    and ab.start_date <= (new.end_at at time zone 'UTC')::date
    and ab.end_date >= (new.start_at at time zone 'UTC')::date
    and exists (
      select 1
      from generate_series(
        greatest(ab.start_date, (new.start_at at time zone 'UTC')::date)::timestamp,
        least(ab.end_date, (new.end_at at time zone 'UTC')::date)::timestamp,
        interval '1 day'
      ) as g(d)
      where extract(isodow from g.d) < 6
        and not exists (
          select 1 from session_day_trainers x where x.session_id = new.id and x.day = g.d::date
        )
    )
  order by ab.start_date
  limit 1;
  if found then
    raise exception 'Formateur indisponible : % du % au %.',
      case r.kind when 'conge' then 'en congé' when 'maladie' then 'en arrêt maladie' else 'absent' end,
      to_char(r.start_date, 'DD/MM/YYYY'), to_char(r.end_date, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql;

notify pgrst, 'reload schema';
