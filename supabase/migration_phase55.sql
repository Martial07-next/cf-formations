-- Phase 55 : plusieurs liens Digiforma par session.
--  · Session GEIQ / parcours : le groupe dans une session Digiforma, les
--    stagiaires ajoutés dans une autre (un lien chacun, avec ses stagiaires).
--  · Deux sessions du planning (formateurs différents) qui partagent la même
--    session Digiforma : le même lien sur les deux.
-- sessions.digiforma_docs_url reste rempli avec le premier lien (compatibilité).
alter table public.sessions add column if not exists digiforma_links jsonb;

update public.sessions
set digiforma_links = jsonb_build_array(jsonb_build_object(
  'id', 'main', 'label', 'Session Digiforma', 'url', digiforma_docs_url, 'audience', 'all'))
where digiforma_docs_url is not null and btrim(digiforma_docs_url) <> '' and digiforma_links is null;
