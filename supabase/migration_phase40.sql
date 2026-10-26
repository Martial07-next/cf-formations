-- Phase 40 : salariés concernés par un évènement du planning (ex. session de
-- recrutement animée par un salarié dans une salle).
--   • planning_event_employees : salarié + nom (copie) pour l'affichage, sans
--     ouvrir la fiche des salariés (réservée à l'administrateur).
--   • event_employee_choices() : liste des salariés actifs (id, nom) proposée
--     à l'équipe dans le formulaire d'évènement.
-- Idempotent.

create table if not exists public.planning_event_employees (
  event_id uuid not null references public.planning_events(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  employee_name text not null,
  primary key (event_id, employee_id)
);

alter table public.planning_event_employees enable row level security;
drop policy if exists "planning_event_employees: read" on public.planning_event_employees;
drop policy if exists "planning_event_employees: manage insert" on public.planning_event_employees;
drop policy if exists "planning_event_employees: manage delete" on public.planning_event_employees;
create policy "planning_event_employees: read" on public.planning_event_employees for select using (public.is_member());
create policy "planning_event_employees: manage insert" on public.planning_event_employees for insert with check (public.can_manage());
create policy "planning_event_employees: manage delete" on public.planning_event_employees for delete using (public.can_manage());

create or replace function public.event_employee_choices()
returns table (id uuid, full_name text) as $$
  select e.id, e.full_name from public.employees e
  where e.active and public.can_manage()
  order by e.full_name;
$$ language sql security definer stable set search_path = public, pg_temp;

revoke all on function public.event_employee_choices() from public;
grant execute on function public.event_employee_choices() to authenticated;

notify pgrst, 'reload schema';
