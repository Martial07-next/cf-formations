-- ============================================================
-- CF Réseaux · Migration Phase 24
--   1. Organisation interne / traçabilité (« qui a fait quoi ») :
--      · sessions : créée par, gestionnaire (renseignés automatiquement
--        avec le compte connecté) ;
--      · inscriptions : ajoutée par, statut changé par, suivi des relances
--        des stagiaires en attente (qui relance, combien de fois, quand) ;
--      · historique automatique de chaque session (triggers).
--   2. Autorisations stagiaire dématérialisées (droit à l'image, remise
--      des livrets, vêtements TST) : signées une fois, rangées dans la
--      fiche du stagiaire et reprises sur ses formations suivantes.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TRAÇABILITÉ
-- ------------------------------------------------------------
alter table sessions add column if not exists created_by uuid references profiles(id) on delete set null default auth.uid();
alter table sessions add column if not exists manager_id uuid references profiles(id) on delete set null default auth.uid();
alter table sessions add column if not exists created_at timestamptz not null default now();

alter table session_trainees add column if not exists added_by uuid references profiles(id) on delete set null default auth.uid();
alter table session_trainees add column if not exists added_at timestamptz default now();
alter table session_trainees add column if not exists status_by uuid references profiles(id) on delete set null;
alter table session_trainees add column if not exists status_at timestamptz;
alter table session_trainees add column if not exists followup_by uuid references profiles(id) on delete set null;
alter table session_trainees add column if not exists followup_count int not null default 0;
alter table session_trainees add column if not exists last_followup_at timestamptz;
alter table session_trainees add column if not exists last_followup_by uuid references profiles(id) on delete set null;
alter table session_trainees add column if not exists followup_note text;

create table if not exists session_activity (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  trainee_id uuid references trainees(id) on delete set null,
  actor_id uuid references profiles(id) on delete set null default auth.uid(),
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists session_activity_session on session_activity (session_id, created_at desc);

alter table session_activity enable row level security;
drop policy if exists "session_activity: read" on session_activity;
drop policy if exists "session_activity: insert" on session_activity;
create policy "session_activity: read" on session_activity for select using (auth.role() = 'authenticated');
create policy "session_activity: insert" on session_activity for insert with check (can_edit_sessions());

-- Statut changé : on note qui et quand ; mise en attente : la personne qui
-- s'en occupe devient responsable des relances (si personne ne l'est déjà).
create or replace function session_trainees_track()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    new.status_by := coalesce(new.status_by, auth.uid());
    new.status_at := coalesce(new.status_at, now());
    if new.status = 'en_attente' then new.followup_by := coalesce(new.followup_by, auth.uid()); end if;
  elsif new.status is distinct from old.status then
    new.status_by := auth.uid();
    new.status_at := now();
    if new.status = 'en_attente' then new.followup_by := coalesce(new.followup_by, auth.uid()); end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists session_trainees_track on session_trainees;
create trigger session_trainees_track before insert or update on session_trainees
  for each row execute procedure session_trainees_track();

-- Historique automatique (inscriptions).
create or replace function session_trainees_log()
returns trigger as $$
declare who text;
begin
  if tg_op = 'DELETE' then
    select full_name into who from trainees where id = old.trainee_id;
    insert into session_activity (session_id, trainee_id, action, detail)
      values (old.session_id, old.trainee_id, 'stagiaire_retire', who);
    return old;
  end if;
  select full_name into who from trainees where id = new.trainee_id;
  if tg_op = 'INSERT' then
    insert into session_activity (session_id, trainee_id, action, detail)
      values (new.session_id, new.trainee_id, case when new.status = 'validee' then 'stagiaire_valide' else 'stagiaire_attente' end, who);
  elsif new.status is distinct from old.status then
    insert into session_activity (session_id, trainee_id, action, detail)
      values (new.session_id, new.trainee_id, case when new.status = 'validee' then 'statut_valide' else 'statut_attente' end, who);
  elsif new.followup_count > old.followup_count then
    insert into session_activity (session_id, trainee_id, action, detail)
      values (new.session_id, new.trainee_id, 'relance', who || coalesce(' · ' || nullif(new.followup_note, ''), ''));
  elsif new.followup_by is distinct from old.followup_by then
    insert into session_activity (session_id, trainee_id, action, detail)
      values (new.session_id, new.trainee_id, 'suivi_attribue', who);
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists session_trainees_log on session_trainees;
create trigger session_trainees_log after insert or update or delete on session_trainees
  for each row execute procedure session_trainees_log();

-- Historique automatique (session).
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
  if array_length(changes, 1) > 0 then
    insert into session_activity (session_id, action, detail) values (new.id, 'session_modifiee', array_to_string(changes, ', '));
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists sessions_log on sessions;
create trigger sessions_log after insert or update on sessions
  for each row execute procedure sessions_log();

-- ------------------------------------------------------------
-- 2. AUTORISATIONS STAGIAIRE
-- ------------------------------------------------------------
alter table trainees add column if not exists address text;

-- Autorisations demandées par formation (droit à l'image par défaut) ;
-- la session peut les ajuster (vide = celles de la formation).
alter table templates add column if not exists authorizations text[] not null default '{image}';
alter table sessions add column if not exists authorizations text[];
alter table sessions add column if not exists autor_token text unique;

create table if not exists trainee_authorizations (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references trainees(id) on delete cascade,
  kind text not null check (kind in ('image', 'livret', 'vetements')),
  data jsonb not null default '{}'::jsonb,   -- champs remplis (adresse, entreprise, cases, quantités…)
  accepted boolean not null default true,    -- droit à l'image : accord ou refus
  signature text,
  city text,
  signed_at timestamptz not null default now(),
  session_id uuid references sessions(id) on delete set null,
  collected_by uuid references profiles(id) on delete set null default auth.uid(),
  returned_at timestamptz,                   -- vêtements / livrets restitués
  returned_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists trainee_authorizations_trainee on trainee_authorizations (trainee_id, kind, signed_at desc);

alter table trainee_authorizations enable row level security;
drop policy if exists "trainee_authorizations: read" on trainee_authorizations;
drop policy if exists "trainee_authorizations: manage insert" on trainee_authorizations;
drop policy if exists "trainee_authorizations: manage update" on trainee_authorizations;
drop policy if exists "trainee_authorizations: manage delete" on trainee_authorizations;
create policy "trainee_authorizations: read" on trainee_authorizations for select using (auth.role() = 'authenticated');
create policy "trainee_authorizations: manage insert" on trainee_authorizations for insert with check (can_edit_sessions());
create policy "trainee_authorizations: manage update" on trainee_authorizations for update using (can_manage());
create policy "trainee_authorizations: manage delete" on trainee_authorizations for delete using (can_manage());

notify pgrst, 'reload schema';
