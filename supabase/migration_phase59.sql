-- Phase 59 : corbeille des modules et stagiaires Digiforma.
-- « Apprenant A », « Stagiaire 1 »… (fictifs) et ce que le bureau met de côté :
-- jamais importés ni proposés, restaurables d'un clic.
create table if not exists public.digiforma_ignored (
  kind text not null check (kind in ('module', 'trainee')),
  value text not null,          -- clé du module, ou nom normalisé du stagiaire
  label text,                   -- affiché dans la corbeille
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (kind, value)
);
alter table public.digiforma_ignored enable row level security;
drop policy if exists "digiforma_ignored: read" on public.digiforma_ignored;
drop policy if exists "digiforma_ignored: write" on public.digiforma_ignored;
create policy "digiforma_ignored: read" on public.digiforma_ignored for select using (auth.role() = 'authenticated');
create policy "digiforma_ignored: write" on public.digiforma_ignored for all using (can_manage()) with check (can_manage());
