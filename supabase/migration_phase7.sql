-- ============================================================
-- CF Réseau — Migration Phase 7
--   · rôle "Référent cadre" (remplace "Responsable formation")
--   · équipes : chaque formateur a un référent + un compte utilisateur lié
--   · une couleur par formateur pour le planning
--   · interdiction en base du chevauchement de deux sessions dans une salle
-- À exécuter dans Supabase Dashboard > SQL Editor.
-- Ne supprime aucune donnée.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Rôles : admin (bureau administratif), referent (référent cadre),
--    formateur (consultation du planning), consultation.
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'profiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table profiles drop constraint %I', r.conname);
  end loop;
end $$;

update profiles set role = 'referent' where role = 'responsable_formation';

alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'referent', 'formateur', 'consultation'));

-- Admin et référents peuvent modifier le contenu (sessions, formateurs, salles...).
-- La gestion des comptes reste réservée à l'admin (is_admin()).
create or replace function can_manage()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('admin', 'referent')
  );
$$ language sql security definer stable;

-- Les noms/rôles des comptes sont lisibles par tout utilisateur connecté
-- (nécessaire pour afficher le référent d'un formateur). Les mises à jour
-- restent réservées à l'admin (policy existante "profiles: admin update").
drop policy if exists "profiles: read authenticated" on profiles;
create policy "profiles: read authenticated" on profiles for select using (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- 2. Formateurs : couleur, référent, compte utilisateur lié
-- ------------------------------------------------------------
alter table trainers add column if not exists color text;
alter table trainers add column if not exists referent_id uuid references profiles(id) on delete set null;
alter table trainers add column if not exists profile_id uuid references profiles(id) on delete set null;
create unique index if not exists trainers_profile_id_key on trainers (profile_id) where profile_id is not null;

-- Attribue une couleur distincte aux formateurs qui n'en ont pas encore.
with palette as (
  select array['#2563eb','#db2777','#ea580c','#7c3aed','#0d9488','#ca8a04',
               '#dc2626','#0891b2','#65a30d','#9333ea','#c2410c','#4f46e5'] as colors
), numbered as (
  select id, row_number() over (order by full_name) - 1 as n from trainers where color is null
)
update trainers t
set color = palette.colors[(numbered.n % 12) + 1]
from numbered, palette
where t.id = numbered.id;

-- ------------------------------------------------------------
-- 3. Une salle ne peut pas accueillir deux sessions qui se chevauchent.
--    La salle virtuelle "À affecter" (is_holding) n'est pas concernée.
--    Trigger (plutôt qu'une contrainte d'exclusion) pour ne pas bloquer la
--    migration si des chevauchements existent déjà : seules les nouvelles
--    écritures sont contrôlées.
-- ------------------------------------------------------------
create or replace function check_room_overlap()
returns trigger as $$
declare clash record;
begin
  if new.room_id is null then
    return new;
  end if;
  if exists (select 1 from rooms where id = new.room_id and is_holding) then
    return new;
  end if;

  -- Sérialise les écritures concurrentes sur une même salle.
  perform pg_advisory_xact_lock(hashtext(new.room_id::text));

  select id, title into clash
  from sessions
  where room_id = new.room_id
    and id <> new.id
    and start_at < new.end_at
    and end_at > new.start_at
  limit 1;

  if found then
    raise exception 'Conflit : la salle est déjà réservée pour "%" sur ce créneau.', clash.title
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists sessions_room_overlap on sessions;
create trigger sessions_room_overlap
  before insert or update of room_id, start_at, end_at on sessions
  for each row execute procedure check_room_overlap();

-- Recharge le cache de schéma de l'API Supabase (sinon : « Could not find the 'x' column … in the schema cache »).
notify pgrst, 'reload schema';
