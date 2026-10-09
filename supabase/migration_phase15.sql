-- ============================================================
-- CF Réseaux · Migration Phase 15 : liens utiles et formateurs externes
-- 1. Liens rattachés à une formation (supports de cours, documents…)
-- 2. Liens utiles du planning (congés, attestations, autorisations…)
-- 3. Formateurs externes avec une période d'intervention
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

-- 1. Liens d'une formation
create table if not exists template_links (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete cascade,
  label text not null,
  url text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists template_links_template on template_links (template_id, position);

alter table template_links enable row level security;
drop policy if exists "template_links: read" on template_links;
drop policy if exists "template_links: manage insert" on template_links;
drop policy if exists "template_links: manage update" on template_links;
drop policy if exists "template_links: manage delete" on template_links;
create policy "template_links: read" on template_links for select using (auth.role() = 'authenticated');
create policy "template_links: manage insert" on template_links for insert with check (can_manage());
create policy "template_links: manage update" on template_links for update using (can_manage());
create policy "template_links: manage delete" on template_links for delete using (can_manage());

-- 2. Liens utiles (bouton « Liens utiles » du planning)
create table if not exists useful_links (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'Documents utiles',
  label text not null,
  url text not null,
  description text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table useful_links enable row level security;
drop policy if exists "useful_links: read" on useful_links;
drop policy if exists "useful_links: manage insert" on useful_links;
drop policy if exists "useful_links: manage update" on useful_links;
drop policy if exists "useful_links: manage delete" on useful_links;
create policy "useful_links: read" on useful_links for select using (auth.role() = 'authenticated');
create policy "useful_links: manage insert" on useful_links for insert with check (can_manage());
create policy "useful_links: manage update" on useful_links for update using (can_manage());
create policy "useful_links: manage delete" on useful_links for delete using (can_manage());

-- 3. Formateurs externes : proposés seulement pendant leur période d'intervention
alter table trainers add column if not exists is_external boolean not null default false;
alter table trainers add column if not exists mission_start date;
alter table trainers add column if not exists mission_end date;

notify pgrst, 'reload schema';
