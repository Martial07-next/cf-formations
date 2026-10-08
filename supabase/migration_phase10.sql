-- ============================================================
-- CF Réseau — Migration Phase 10
--   1. Stagiaires : fusion des doublons existants + interdiction en base
--   2. Ateliers des salles (équipements / modules possibles)
--   3. Congés et absences des formateurs (blocage du planning)
--   4. Un formateur peut modifier les horaires de SES sessions
-- À exécuter dans Supabase Dashboard > SQL Editor :
-- coller TOUT le fichier, appuyer sur Ctrl+A (tout sélectionner), puis Run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. STAGIAIRES SANS DOUBLON
-- Deux fiches sont des doublons si leur nom complet est identique
-- (majuscules/minuscules et espaces multiples ignorés).
-- ------------------------------------------------------------
create or replace function trainee_name_key(name text)
returns text as $$
  select lower(regexp_replace(btrim(coalesce(name, '')), '\s+', ' ', 'g'));
$$ language sql immutable;

-- 1a. Fusion des doublons déjà présents : on garde la fiche la plus ancienne,
--     on y rattache les inscriptions des autres (sans perdre un statut
--     « validé »), on complète e-mail/entreprise/prénom/nom manquants, puis
--     on supprime les fiches en double. (Instructions simples, sans boucle,
--     pour fonctionner dans l'éditeur SQL de Supabase.)
drop table if exists trainee_dups;
create temporary table trainee_dups as
select id, keep_id from (
  select id,
         first_value(id) over (partition by trainee_name_key(full_name) order by created_at, id) as keep_id
  from trainees
) x
where id <> keep_id;

insert into session_trainees (session_id, trainee_id, status)
select st.session_id, d.keep_id,
       case when bool_or(st.status = 'validee') then 'validee' else 'en_attente' end
from session_trainees st
join trainee_dups d on d.id = st.trainee_id
group by st.session_id, d.keep_id
on conflict (session_id, trainee_id) do update
  set status = case when session_trainees.status = 'validee' or excluded.status = 'validee'
                    then 'validee' else session_trainees.status end;

update trainees k set
  email = coalesce(k.email, x.email),
  company = coalesce(k.company, x.company),
  first_name = coalesce(k.first_name, x.first_name),
  last_name = coalesce(k.last_name, x.last_name)
from (
  select d.keep_id, max(t.email) as email, max(t.company) as company,
         max(t.first_name) as first_name, max(t.last_name) as last_name
  from trainee_dups d join trainees t on t.id = d.id
  group by d.keep_id
) x
where k.id = x.keep_id;

delete from trainees where id in (select id from trainee_dups);
drop table trainee_dups;

-- 1b. Interdiction définitive : la base refuse tout nouveau doublon.
create unique index if not exists trainees_name_key on trainees (trainee_name_key(full_name));

-- ------------------------------------------------------------
-- 2. ATELIERS DES SALLES
-- ------------------------------------------------------------
create table if not exists room_workshops (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null,
  equipment text,   -- équipements de l'atelier
  modules text,     -- modules / formations réalisables
  created_at timestamptz not null default now()
);
create index if not exists room_workshops_room on room_workshops (room_id);

alter table room_workshops enable row level security;
drop policy if exists "room_workshops: read" on room_workshops;
drop policy if exists "room_workshops: manage insert" on room_workshops;
drop policy if exists "room_workshops: manage update" on room_workshops;
drop policy if exists "room_workshops: manage delete" on room_workshops;
create policy "room_workshops: read" on room_workshops for select using (auth.role() = 'authenticated');
create policy "room_workshops: manage insert" on room_workshops for insert with check (can_manage());
create policy "room_workshops: manage update" on room_workshops for update using (can_manage());
create policy "room_workshops: manage delete" on room_workshops for delete using (can_manage());

-- ------------------------------------------------------------
-- 3. CONGÉS ET ABSENCES DES FORMATEURS
-- ------------------------------------------------------------
create table if not exists trainer_absences (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainers(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  kind text not null default 'conge' check (kind in ('conge', 'absence', 'maladie', 'autre')),
  note text,
  source text not null default 'manuel',   -- 'manuel' ou nom de l'outil de congés synchronisé
  external_id text,                        -- identifiant côté outil de congés (synchronisation future)
  created_at timestamptz not null default now(),
  constraint trainer_absences_range check (end_date >= start_date)
);
create index if not exists trainer_absences_trainer on trainer_absences (trainer_id, start_date, end_date);
create unique index if not exists trainer_absences_external on trainer_absences (source, external_id) where external_id is not null;

alter table trainer_absences enable row level security;
drop policy if exists "trainer_absences: read" on trainer_absences;
drop policy if exists "trainer_absences: manage insert" on trainer_absences;
drop policy if exists "trainer_absences: manage update" on trainer_absences;
drop policy if exists "trainer_absences: manage delete" on trainer_absences;
create policy "trainer_absences: read" on trainer_absences for select using (auth.role() = 'authenticated');
create policy "trainer_absences: manage insert" on trainer_absences for insert with check (can_manage());
create policy "trainer_absences: manage update" on trainer_absences for update using (can_manage());
create policy "trainer_absences: manage delete" on trainer_absences for delete using (can_manage());

-- Blocage en base : impossible d'affecter un formateur à une session
-- pendant un de ses congés / absences.
create or replace function check_trainer_absence()
returns trigger as $$
declare a record;
begin
  if new.trainer_id is null then
    return new;
  end if;
  select start_date, end_date, kind into a
  from trainer_absences
  where trainer_id = new.trainer_id
    and start_date <= (new.end_at at time zone 'UTC')::date
    and end_date >= (new.start_at at time zone 'UTC')::date
  order by start_date
  limit 1;
  if found then
    raise exception 'Formateur indisponible : % du % au %.',
      case a.kind when 'conge' then 'en congé' when 'maladie' then 'en arrêt maladie' else 'absent' end,
      to_char(a.start_date, 'DD/MM/YYYY'), to_char(a.end_date, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists sessions_trainer_absence on sessions;
create trigger sessions_trainer_absence
  before insert or update of trainer_id, start_at, end_at on sessions
  for each row execute procedure check_trainer_absence();

-- ------------------------------------------------------------
-- 4. HORAIRES : un formateur peut ajuster les horaires de ses sessions
-- (pas les dates, la salle ni les stagiaires).
-- ------------------------------------------------------------
create or replace function is_session_trainer(sid uuid)
returns boolean as $$
  select exists (
    select 1 from sessions s join trainers t on t.id = s.trainer_id
    where s.id = sid and t.profile_id = auth.uid()
  );
$$ language sql security definer stable;

drop policy if exists "session_days: trainer insert" on session_days;
drop policy if exists "session_days: trainer update" on session_days;
drop policy if exists "session_days: trainer delete" on session_days;
create policy "session_days: trainer insert" on session_days for insert with check (is_session_trainer(session_id));
create policy "session_days: trainer update" on session_days for update using (is_session_trainer(session_id));
create policy "session_days: trainer delete" on session_days for delete using (is_session_trainer(session_id));

notify pgrst, 'reload schema';
