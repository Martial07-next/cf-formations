-- ============================================================
-- CF Réseaux · Migration Phase 16 : dossier de formation dématérialisé
-- 1. Émargement électronique (QR code, signature matin / après-midi)
-- 2. Documents du dossier (déposés sur la formation ou sur la session)
-- 3. Remplissage en ligne des documents par le formateur
-- 4. Espace de stockage des fichiers (bucket privé « dossiers »)
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

-- Peut remplir le dossier d'une session : bureau / admin / référent cadre, ou son formateur.
create or replace function can_fill_dossier(sid uuid)
returns boolean as $$
  select can_edit_sessions() or is_session_trainer(sid);
$$ language sql security definer stable;

-- 1. Émargement ------------------------------------------------------------
alter table sessions add column if not exists sign_token text;
create unique index if not exists sessions_sign_token on sessions (sign_token);

create table if not exists attendance_signatures (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  signer text not null default 'stagiaire' check (signer in ('stagiaire', 'formateur')),
  trainee_id uuid references trainees(id) on delete cascade,
  day date not null,
  half text not null check (half in ('am', 'pm')),
  status text not null default 'signe' check (status in ('signe', 'absent')),
  signature text,            -- image PNG (data URL) de la signature
  signer_name text,          -- nom du formateur signataire
  signed_at timestamptz not null default now(),
  signed_by uuid references profiles(id) on delete set null
);
create unique index if not exists attendance_one_per_slot
  on attendance_signatures (session_id, signer, coalesce(trainee_id, '00000000-0000-0000-0000-000000000000'::uuid), day, half);
create index if not exists attendance_session on attendance_signatures (session_id);

alter table attendance_signatures enable row level security;
drop policy if exists "attendance: read" on attendance_signatures;
drop policy if exists "attendance: fill insert" on attendance_signatures;
drop policy if exists "attendance: fill update" on attendance_signatures;
drop policy if exists "attendance: fill delete" on attendance_signatures;
create policy "attendance: read" on attendance_signatures for select using (auth.role() = 'authenticated');
create policy "attendance: fill insert" on attendance_signatures for insert with check (can_fill_dossier(session_id));
create policy "attendance: fill update" on attendance_signatures for update using (can_fill_dossier(session_id));
create policy "attendance: fill delete" on attendance_signatures for delete using (can_fill_dossier(session_id));

-- 2. Documents du dossier --------------------------------------------------
create table if not exists dossier_documents (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references templates(id) on delete cascade,  -- pour toutes les sessions de la formation
  session_id uuid references sessions(id) on delete cascade,    -- ou pour une seule session
  title text not null,
  storage_path text not null,
  file_name text,
  filled_by text not null default 'formateur' check (filled_by in ('formateur', 'bureau', 'aucun')),
  required boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  constraint dossier_documents_owner check (template_id is not null or session_id is not null)
);
create index if not exists dossier_documents_template on dossier_documents (template_id);
create index if not exists dossier_documents_session on dossier_documents (session_id);

alter table dossier_documents enable row level security;
drop policy if exists "dossier_documents: read" on dossier_documents;
drop policy if exists "dossier_documents: manage insert" on dossier_documents;
drop policy if exists "dossier_documents: manage update" on dossier_documents;
drop policy if exists "dossier_documents: manage delete" on dossier_documents;
create policy "dossier_documents: read" on dossier_documents for select using (auth.role() = 'authenticated');
create policy "dossier_documents: manage insert" on dossier_documents for insert with check (can_manage());
create policy "dossier_documents: manage update" on dossier_documents for update using (can_manage());
create policy "dossier_documents: manage delete" on dossier_documents for delete using (can_manage());

-- 3. Remplissage d'un document pour une session ------------------------------
create table if not exists dossier_entries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  document_id uuid not null references dossier_documents(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,   -- champs remplis, textes et signatures posés sur le PDF
  completed boolean not null default false,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (session_id, document_id)
);

alter table dossier_entries enable row level security;
drop policy if exists "dossier_entries: read" on dossier_entries;
drop policy if exists "dossier_entries: fill insert" on dossier_entries;
drop policy if exists "dossier_entries: fill update" on dossier_entries;
drop policy if exists "dossier_entries: manage delete" on dossier_entries;
create policy "dossier_entries: read" on dossier_entries for select using (auth.role() = 'authenticated');
create policy "dossier_entries: fill insert" on dossier_entries for insert with check (can_fill_dossier(session_id));
create policy "dossier_entries: fill update" on dossier_entries for update using (can_fill_dossier(session_id));
create policy "dossier_entries: manage delete" on dossier_entries for delete using (can_manage());

-- 4. Fichiers (bucket privé) ------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dossiers', 'dossiers', false, 26214400, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "dossiers: read" on storage.objects;
drop policy if exists "dossiers: manage insert" on storage.objects;
drop policy if exists "dossiers: manage update" on storage.objects;
drop policy if exists "dossiers: manage delete" on storage.objects;
create policy "dossiers: read" on storage.objects for select using (bucket_id = 'dossiers' and auth.role() = 'authenticated');
create policy "dossiers: manage insert" on storage.objects for insert with check (bucket_id = 'dossiers' and can_manage());
create policy "dossiers: manage update" on storage.objects for update using (bucket_id = 'dossiers' and can_manage());
create policy "dossiers: manage delete" on storage.objects for delete using (bucket_id = 'dossiers' and can_manage());

notify pgrst, 'reload schema';
