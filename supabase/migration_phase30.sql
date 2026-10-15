-- ============================================================
-- CF Réseaux · Migration Phase 30 : facturation
--   · Accès « Facturation » à cocher sur un compte (Administration › Accès) ;
--   · factures de chaque session (nom / n° de facture, entreprise, montant) ;
--   · « Facturation faite » : cochée uniquement par un compte Facturation ;
--     le planning n'affiche « Dossier complet » qu'après la facturation.
-- À exécuter dans Supabase > SQL Editor (projet utilisé par le site),
-- nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

do $$
begin
  if to_regclass('public.sessions') is null or to_regclass('public.profiles') is null then
    raise exception 'Tables public.sessions / public.profiles introuvables : vérifie que tu es bien dans le projet Supabase du site (celui dont l''URL est dans Vercel).';
  end if;
end $$;

-- 1. Accès Facturation (case à cocher sur le compte).
alter table public.profiles add column if not exists can_invoice boolean not null default false;

create or replace function public.is_billing()
returns boolean as $$
  select exists (select 1 from public.profiles where id = auth.uid() and can_invoice);
$$ language sql security definer stable;

-- Seul l'administrateur donne ou retire l'accès Facturation (et les rôles).
create or replace function public.profiles_protect_rights()
returns trigger as $$
begin
  if (new.can_invoice is distinct from old.can_invoice or new.role is distinct from old.role)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Seul l''administrateur peut modifier les accès.';
  end if;
  return new;
end;
$$ language plpgsql;
drop trigger if exists profiles_protect_rights on public.profiles;
create trigger profiles_protect_rights before update on public.profiles
  for each row execute procedure public.profiles_protect_rights();

-- 2. Statut de facturation de la session.
alter table public.sessions add column if not exists billing_done boolean not null default false;
alter table public.sessions add column if not exists billing_done_at timestamptz;
alter table public.sessions add column if not exists billing_done_by uuid references public.profiles(id) on delete set null;
alter table public.sessions add column if not exists billing_note text;

create or replace function public.sessions_protect_billing()
returns trigger as $$
begin
  if (new.billing_done is distinct from old.billing_done
      or new.billing_done_at is distinct from old.billing_done_at
      or new.billing_done_by is distinct from old.billing_done_by
      or new.billing_note is distinct from old.billing_note)
     and auth.uid() is not null and not public.is_billing() then
    raise exception 'Seul le compte Facturation peut modifier la facturation.';
  end if;
  -- Un compte Facturation qui n'a pas les droits de session ne change que la facturation.
  if auth.uid() is not null and not public.can_edit_sessions()
     and (to_jsonb(new) - array['billing_done', 'billing_done_at', 'billing_done_by', 'billing_note'])
         is distinct from (to_jsonb(old) - array['billing_done', 'billing_done_at', 'billing_done_by', 'billing_note']) then
    raise exception 'Ce compte ne peut modifier que la facturation de la session.';
  end if;
  return new;
end;
$$ language plpgsql;
drop trigger if exists sessions_protect_billing on public.sessions;
create trigger sessions_protect_billing before update on public.sessions
  for each row execute procedure public.sessions_protect_billing();

-- 3. Factures d'une session (une ou plusieurs : par entreprise, acompte…).
create table if not exists public.session_invoices (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  label text not null,                 -- nom / n° de la facture
  company text,
  amount numeric(12, 2),
  note text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists session_invoices_session on public.session_invoices (session_id);

alter table public.session_invoices enable row level security;
drop policy if exists "session_invoices: read" on public.session_invoices;
drop policy if exists "session_invoices: billing insert" on public.session_invoices;
drop policy if exists "session_invoices: billing update" on public.session_invoices;
drop policy if exists "session_invoices: billing delete" on public.session_invoices;
create policy "session_invoices: read" on public.session_invoices for select using (public.is_billing() or public.can_manage());
create policy "session_invoices: billing insert" on public.session_invoices for insert with check (public.is_billing());
create policy "session_invoices: billing update" on public.session_invoices for update using (public.is_billing());
create policy "session_invoices: billing delete" on public.session_invoices for delete using (public.is_billing());

-- La personne de la facturation peut mettre à jour le statut d'une session
-- même sans être « bureau » (le trigger ci-dessus limite aux champs facturation
-- pour les autres comptes).
drop policy if exists "sessions: billing update" on public.sessions;
create policy "sessions: billing update" on public.sessions for update using (public.is_billing());

notify pgrst, 'reload schema';
