-- Phase 36 : lien vers les documents à remplir sur Digiforma, par session.
-- Le formateur le retrouve en un clic dans le dossier de formation.
alter table public.sessions add column if not exists digiforma_docs_url text;

-- « Fait sur Digiforma » coché par le formateur : compte dans le suivi du dossier.
alter table public.session_forms drop constraint if exists session_forms_kind_check;
alter table public.session_forms add constraint session_forms_kind_check
  check (kind in ('tour_de_table', 'appreciation', 'digiforma'));
