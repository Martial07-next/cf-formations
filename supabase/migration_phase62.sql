-- Phase 62 : paramètres propres à une session (roue crantée de la fiche session).
-- Une session personnalisée (hors catalogue, ou catalogue adapté) reçoit sa propre
-- « formation » : mêmes options que le catalogue, mais invisible dans le catalogue.
alter table public.templates add column if not exists session_only boolean not null default false;
create index if not exists templates_session_only_idx on public.templates(session_only) where session_only;
