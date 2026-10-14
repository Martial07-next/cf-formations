-- ============================================================
-- CF Réseaux · Migration Phase 27 : prêts de vêtements TST
--   Les vêtements ne sont plus demandés à tous les stagiaires : on choisit
--   le stagiaire à qui on les prête (certains ont leurs propres EPI).
--   · prêt : quantités, signature du stagiaire ;
--   · retour : quantités rendues, signature du stagiaire, vêtements
--     manquants signalés automatiquement.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

create table if not exists clothing_loans (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references trainees(id) on delete cascade,
  session_id uuid references sessions(id) on delete set null,
  vestes int not null default 0 check (vestes between 0 and 20),
  pantalons int not null default 0 check (pantalons between 0 and 20),
  address text,
  city text,
  signature text,                 -- signature au prêt (vide = à signer)
  signed_at timestamptz,
  lent_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  returned_vestes int check (returned_vestes between 0 and 20),
  returned_pantalons int check (returned_pantalons between 0 and 20),
  return_signature text,          -- signature au retour
  returned_at timestamptz,
  returned_by uuid references profiles(id) on delete set null,
  return_note text,
  constraint clothing_loans_some check (vestes + pantalons > 0)
);
create index if not exists clothing_loans_trainee on clothing_loans (trainee_id);
create index if not exists clothing_loans_session on clothing_loans (session_id);

alter table clothing_loans enable row level security;
drop policy if exists "clothing_loans: read" on clothing_loans;
drop policy if exists "clothing_loans: manage insert" on clothing_loans;
drop policy if exists "clothing_loans: manage update" on clothing_loans;
drop policy if exists "clothing_loans: manage delete" on clothing_loans;
create policy "clothing_loans: read" on clothing_loans for select using (auth.role() = 'authenticated');
create policy "clothing_loans: manage insert" on clothing_loans for insert with check (can_edit_sessions());
create policy "clothing_loans: manage update" on clothing_loans for update using (can_edit_sessions());
create policy "clothing_loans: manage delete" on clothing_loans for delete using (can_manage());

-- Reprise des attestations « vêtements » déjà signées (migration 24), puis retrait
-- des vêtements de la liste des autorisations demandées à tous.
insert into clothing_loans (trainee_id, session_id, vestes, pantalons, address, city, signature, signed_at, created_at, returned_vestes, returned_pantalons, returned_at, returned_by)
select a.trainee_id, a.session_id,
       coalesce((a.data->>'vestes')::int, 0), coalesce((a.data->>'pantalons')::int, 0),
       a.data->>'address', a.city, a.signature, a.signed_at, a.created_at,
       case when a.returned_at is not null then coalesce((a.data->>'vestes')::int, 0) end,
       case when a.returned_at is not null then coalesce((a.data->>'pantalons')::int, 0) end,
       a.returned_at, a.returned_by
from trainee_authorizations a
where a.kind = 'vetements'
  and coalesce((a.data->>'vestes')::int, 0) + coalesce((a.data->>'pantalons')::int, 0) > 0;
delete from trainee_authorizations where kind = 'vetements';

update templates set authorizations = array_remove(authorizations, 'vetements') where 'vetements' = any(authorizations);
update sessions set authorizations = array_remove(authorizations, 'vetements') where 'vetements' = any(authorizations);

notify pgrst, 'reload schema';
