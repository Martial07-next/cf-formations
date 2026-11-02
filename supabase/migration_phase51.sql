-- Phase 51 : certificats d'habilitation électrique.
--   · templates.habilitation_symbols : symboles possibles de la formation
--     (« B0,B2V Essais,BR… »). Vide = pas de certificat ; non renseigné = symboles
--     détectés dans l'intitulé de la formation.
--   · Fiche « habilitation » du dossier : pour chaque stagiaire, avis et symboles
--     attribués par le formateur (à plusieurs, en direct, comme les autres fiches).
-- Idempotent.

alter table public.templates add column if not exists habilitation_symbols text;

alter table public.session_forms drop constraint if exists session_forms_kind_check;
alter table public.session_forms add constraint session_forms_kind_check
  check (kind in ('tour_de_table', 'appreciation', 'digiforma', 'reussite', 'habilitation'));

create or replace function public.patch_session_form(p_session uuid, p_kind text, p_patches jsonb, p_completed boolean default null)
returns jsonb as $$
declare
  d jsonb;
  was boolean;
  p jsonb;
begin
  if not public.can_fill_dossier(p_session) then
    raise exception 'Action non autorisée' using errcode = '42501';
  end if;
  if p_kind not in ('tour_de_table', 'appreciation', 'reussite', 'habilitation') then
    raise exception 'Fiche inconnue';
  end if;
  insert into public.session_forms (session_id, kind, data)
  values (p_session, p_kind, '{}'::jsonb)
  on conflict (session_id, kind) do nothing;
  select data, completed into d, was from public.session_forms
  where session_id = p_session and kind = p_kind
  for update;
  d := coalesce(d, '{}'::jsonb);
  for p in select value from jsonb_array_elements(coalesce(p_patches, '[]'::jsonb)) loop
    d := public.jsonb_set_deep(d, array(select jsonb_array_elements_text(p -> 'path')), p -> 'value');
  end loop;
  update public.session_forms set
    data = d,
    updated_by = auth.uid(),
    updated_at = now(),
    completed = coalesce(p_completed, completed),
    completed_at = case
      when p_completed is null then completed_at
      when p_completed and was then completed_at
      when p_completed then now()
      else null
    end
  where session_id = p_session and kind = p_kind;
  return d;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke all on function public.patch_session_form(uuid, text, jsonb, boolean) from public, anon;
grant execute on function public.patch_session_form(uuid, text, jsonb, boolean) to authenticated;

notify pgrst, 'reload schema';
