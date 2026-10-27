-- Phase 45 : CF Réseaux City 3D, personnages des formateurs.
--   Chaque formateur crée lui-même son personnage stylisé (couleurs, coiffure,
--   accessoire, chemise du Beach Club). Aucune photo, aucun trait réaliste.
--   Seule nouvelle table de la fonctionnalité : la ville lit le planning
--   existant sans rien dupliquer.
-- Lecture : l'équipe (is_member). Écriture : le formateur pour son propre
-- personnage (fiche formateur liée à son compte), ou le bureau / l'administrateur.
-- Idempotent.

create table if not exists public.city_avatars (
  trainer_id uuid primary key references public.trainers(id) on delete cascade,
  skin text not null default '#e3b48f' check (skin ~* '^#[0-9a-f]{6}$'),
  hair text not null default 'court' check (hair in ('court', 'long', 'chignon', 'rase', 'boucle')),
  hair_color text not null default '#3b2a20' check (hair_color ~* '^#[0-9a-f]{6}$'),
  top_color text not null default '#2f6fb0' check (top_color ~* '^#[0-9a-f]{6}$'),
  bottom_color text not null default '#2b2f36' check (bottom_color ~* '^#[0-9a-f]{6}$'),
  accessory text not null default 'aucun' check (accessory in ('aucun', 'casque', 'casquette', 'lunettes', 'gilet')),
  vacation text not null default '#ff7a59' check (vacation ~* '^#[0-9a-f]{6}$'),
  updated_at timestamptz not null default now()
);

create or replace function public.is_own_trainer(tid uuid)
returns boolean as $$
  select exists (select 1 from public.trainers t where t.id = tid and t.profile_id = auth.uid());
$$ language sql security definer stable set search_path = public, pg_temp;

alter table public.city_avatars enable row level security;
drop policy if exists "city_avatars: read" on public.city_avatars;
drop policy if exists "city_avatars: insert" on public.city_avatars;
drop policy if exists "city_avatars: update" on public.city_avatars;
drop policy if exists "city_avatars: delete" on public.city_avatars;
create policy "city_avatars: read" on public.city_avatars for select using (public.is_member());
create policy "city_avatars: insert" on public.city_avatars for insert with check (public.is_own_trainer(trainer_id) or public.can_manage());
create policy "city_avatars: update" on public.city_avatars for update using (public.is_own_trainer(trainer_id) or public.can_manage()) with check (public.is_own_trainer(trainer_id) or public.can_manage());
create policy "city_avatars: delete" on public.city_avatars for delete using (public.is_own_trainer(trainer_id) or public.can_manage());

notify pgrst, 'reload schema';
