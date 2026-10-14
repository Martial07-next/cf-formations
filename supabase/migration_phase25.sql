-- ============================================================
-- CF Réseaux · Migration Phase 25 : documents des salariés
--   · Droit à l'image et attestation de remise de matériel signés en
--     ligne par les salariés (lien personnel, sans compte, ou depuis leur
--     profil), avec le cachet de CF Réseaux ;
--   · restitution du matériel au départ (date + signature).
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  job text,                       -- poste
  address text,
  profile_id uuid references profiles(id) on delete set null,   -- compte de la plateforme (facultatif)
  token text unique not null,     -- lien personnel de signature
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  kind text not null check (kind in ('image', 'materiel')),
  data jsonb not null default '{}'::jsonb,   -- matériel remis (quantités), adresse…
  accepted boolean not null default true,    -- droit à l'image : accord ou refus
  signature text,                            -- vide = en attente de signature
  city text,
  signed_at timestamptz,
  returned_at timestamptz,                   -- matériel restitué (départ)
  return_signature text,
  returned_by uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists employee_documents_employee on employee_documents (employee_id, kind);

-- Lecture : bureau / admin, et le salarié lui-même (son compte). Écriture : bureau / admin.
create or replace function is_employee_self(eid uuid)
returns boolean as $$
  select exists (select 1 from employees where id = eid and profile_id = auth.uid());
$$ language sql security definer stable;

alter table employees enable row level security;
drop policy if exists "employees: read" on employees;
drop policy if exists "employees: manage insert" on employees;
drop policy if exists "employees: manage update" on employees;
drop policy if exists "employees: manage delete" on employees;
create policy "employees: read" on employees for select using (can_manage() or profile_id = auth.uid());
create policy "employees: manage insert" on employees for insert with check (can_manage());
create policy "employees: manage update" on employees for update using (can_manage());
create policy "employees: manage delete" on employees for delete using (can_manage());

alter table employee_documents enable row level security;
drop policy if exists "employee_documents: read" on employee_documents;
drop policy if exists "employee_documents: manage insert" on employee_documents;
drop policy if exists "employee_documents: manage update" on employee_documents;
drop policy if exists "employee_documents: manage delete" on employee_documents;
create policy "employee_documents: read" on employee_documents for select using (can_manage() or is_employee_self(employee_id));
create policy "employee_documents: manage insert" on employee_documents for insert with check (can_manage());
create policy "employee_documents: manage update" on employee_documents for update using (can_manage());
create policy "employee_documents: manage delete" on employee_documents for delete using (can_manage());

notify pgrst, 'reload schema';
