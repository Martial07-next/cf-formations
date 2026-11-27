-- ============================================================
-- CF Réseaux · Migration Phase 79
--   Registre de traçabilité : droits à l'image, prêts (vêtements TST,
--   baudriers), livrets, documents signés, matériel des salariés.
--   Chaque action (prêt, signature, retour, retrait d'accord, suppression)
--   est notée avec qui, quand, comment (tablette, QR code, lien), l'adresse
--   IP, l'appareil et l'empreinte de la signature. Le journal ne se modifie
--   pas et ne se supprime pas depuis la plateforme.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

create table if not exists public.trace_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,                       -- nom au moment de l'action (gardé si le compte disparaît)
  entity text not null,                  -- image, livret, pret, document, salarie_image, salarie_materiel
  action text not null,                  -- cree, signe, restitue, retire, supprime, qr…
  record_id uuid,
  trainee_id uuid references public.trainees(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  person_name text,                      -- stagiaire / salarié concerné (gardé après suppression)
  channel text,                          -- tablette, qr, lien, bureau
  detail text,
  ip text,
  user_agent text,
  signature_hash text,                   -- SHA-256 de la signature (preuve d'intégrité)
  snapshot jsonb                         -- état de la ligne (sans l'image de la signature)
);
create index if not exists trace_log_created on public.trace_log (created_at desc);
create index if not exists trace_log_trainee on public.trace_log (trainee_id, created_at desc);
create index if not exists trace_log_employee on public.trace_log (employee_id, created_at desc);

alter table public.trace_log enable row level security;
drop policy if exists "trace_log: read" on public.trace_log;
create policy "trace_log: read" on public.trace_log for select using (public.can_manage());
-- Aucune politique d'écriture : seul le serveur (clé de service) écrit ; rien n'est modifiable.

notify pgrst, 'reload schema';
