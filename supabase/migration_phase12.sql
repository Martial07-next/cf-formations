-- ============================================================
-- CF Réseaux · Migration Phase 12
--   1. Rôles : « Bureau administratif » (gère le contenu) et nouveau
--      « Référent cadre » (modifie les sessions, suit son équipe) ;
--      l'administrateur gère la plateforme (comptes, paramètres…).
--   2. Formations réalisables par salle.
--   3. Dossiers et sous-dossiers de formations, ordre libre.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller tout
-- le fichier, Ctrl+A, Run. Puis exécuter migration_phase12b.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1. RÔLES
-- Les comptes « Référent cadre » actuels deviennent « Bureau administratif »
-- (ils gardaient tous les droits de gestion).
-- ------------------------------------------------------------
alter table profiles drop constraint if exists profiles_role_check;
-- (Ne s'applique qu'une fois : tant qu'aucun compte « bureau » n'existe.)
update profiles set role = 'bureau'
where role = 'referent' and not exists (select 1 from profiles where role = 'bureau');
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'bureau', 'referent', 'formateur', 'consultation'));

-- Gestion du contenu (stagiaires, formateurs, salles, formations, création
-- et suppression de sessions…) : administrateur + bureau administratif.
create or replace function can_manage()
returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'bureau'));
$$ language sql security definer stable;

-- Modification des sessions existantes : + référent cadre.
create or replace function can_edit_sessions()
returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'bureau', 'referent'));
$$ language sql security definer stable;

-- Le formateur fait-il partie de l'équipe du référent connecté ?
create or replace function is_team_referent(tid uuid)
returns boolean as $$
  select exists (
    select 1 from trainers t join profiles p on p.id = auth.uid()
    where t.id = tid and t.referent_id = auth.uid() and p.role = 'referent'
  );
$$ language sql security definer stable;

-- Sessions : modification ouverte au référent ; création / suppression non.
drop policy if exists "sessions: manage update" on sessions;
create policy "sessions: manage update" on sessions for update using (can_edit_sessions());

-- Horaires par jour : référent aussi.
drop policy if exists "session_days: manage insert" on session_days;
drop policy if exists "session_days: manage update" on session_days;
drop policy if exists "session_days: manage delete" on session_days;
create policy "session_days: manage insert" on session_days for insert with check (can_edit_sessions());
create policy "session_days: manage update" on session_days for update using (can_edit_sessions());
create policy "session_days: manage delete" on session_days for delete using (can_edit_sessions());

-- Congés : le référent gère ceux des formateurs de son équipe.
drop policy if exists "trainer_absences: manage insert" on trainer_absences;
drop policy if exists "trainer_absences: manage update" on trainer_absences;
drop policy if exists "trainer_absences: manage delete" on trainer_absences;
create policy "trainer_absences: manage insert" on trainer_absences for insert with check (can_manage() or is_team_referent(trainer_id));
create policy "trainer_absences: manage update" on trainer_absences for update using (can_manage() or is_team_referent(trainer_id));
create policy "trainer_absences: manage delete" on trainer_absences for delete using (can_manage() or is_team_referent(trainer_id));

-- ------------------------------------------------------------
-- 2. FORMATIONS RÉALISABLES PAR SALLE
-- Une salle sans formation cochée accepte toutes les formations.
-- ------------------------------------------------------------
create table if not exists room_templates (
  room_id uuid not null references rooms(id) on delete cascade,
  template_id uuid not null references templates(id) on delete cascade,
  primary key (room_id, template_id)
);
alter table room_templates enable row level security;
drop policy if exists "room_templates: read" on room_templates;
drop policy if exists "room_templates: manage insert" on room_templates;
drop policy if exists "room_templates: manage delete" on room_templates;
create policy "room_templates: read" on room_templates for select using (auth.role() = 'authenticated');
create policy "room_templates: manage insert" on room_templates for insert with check (can_manage());
create policy "room_templates: manage delete" on room_templates for delete using (can_manage());

-- ------------------------------------------------------------
-- 3. DOSSIERS / SOUS-DOSSIERS DE FORMATIONS (un seul niveau de sous-dossier)
-- ------------------------------------------------------------
create table if not exists template_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references template_folders(id) on delete cascade,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists template_folders_parent on template_folders (parent_id, position);

-- Un sous-dossier ne peut pas lui-même contenir de sous-dossier.
create or replace function check_folder_depth()
returns trigger as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'Un dossier ne peut pas être son propre parent.';
    end if;
    if exists (select 1 from template_folders where id = new.parent_id and parent_id is not null) then
      raise exception 'Un sous-dossier ne peut pas contenir d''autre sous-dossier.';
    end if;
    if exists (select 1 from template_folders where parent_id = new.id) then
      raise exception 'Ce dossier contient des sous-dossiers : il ne peut pas devenir un sous-dossier.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists template_folders_depth on template_folders;
create trigger template_folders_depth
  before insert or update of parent_id on template_folders
  for each row execute procedure check_folder_depth();

alter table template_folders enable row level security;
drop policy if exists "template_folders: read" on template_folders;
drop policy if exists "template_folders: manage insert" on template_folders;
drop policy if exists "template_folders: manage update" on template_folders;
drop policy if exists "template_folders: manage delete" on template_folders;
create policy "template_folders: read" on template_folders for select using (auth.role() = 'authenticated');
create policy "template_folders: manage insert" on template_folders for insert with check (can_manage());
create policy "template_folders: manage update" on template_folders for update using (can_manage());
create policy "template_folders: manage delete" on template_folders for delete using (can_manage());

-- Rattachement et ordre des formations.
alter table templates add column if not exists folder_id uuid references template_folders(id) on delete set null;
alter table templates add column if not exists position int not null default 0;

notify pgrst, 'reload schema';
