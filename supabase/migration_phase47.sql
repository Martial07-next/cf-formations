-- Phase 47 : fiches du dossier à plusieurs, en direct, et titre d'habilitation
-- exigé par formation.
--   1. patch_session_form : chaque modification (une case, un texte) est fusionnée
--      dans la fiche côté base, sans écraser ce que les autres saisissent en même temps.
--   2. Diffusion en direct des fiches (Supabase Realtime) : les autres personnes
--      ouvertes sur la fiche voient les modifications aussitôt (droits de lecture inchangés).
--   3. templates.titre_habilitation : titre d'habilitation exigé pour cette formation
--      (case au tour de table, dépôt par QR code, attestation bloquée sans titre).
-- Idempotent.

-- 1. Fusion de modifications -------------------------------------------------
create or replace function public.jsonb_set_deep(target jsonb, path text[], val jsonb)
returns jsonb as $$
declare
  k text := path[1];
begin
  if target is null or jsonb_typeof(target) <> 'object' then target := '{}'::jsonb; end if;
  if coalesce(array_length(path, 1), 0) = 0 then return target; end if;
  if array_length(path, 1) = 1 then
    if val is null or val = 'null'::jsonb then return target - k; end if;
    return target || jsonb_build_object(k, val);
  end if;
  return target || jsonb_build_object(k, public.jsonb_set_deep(target -> k, path[2:array_length(path, 1)], val));
end;
$$ language plpgsql immutable set search_path = public, pg_temp;

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
  if p_kind not in ('tour_de_table', 'appreciation', 'reussite') then
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

-- 2. Diffusion en direct --------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_forms') then
    alter publication supabase_realtime add table public.session_forms;
  end if;
end $$;

-- 3. Titre d'habilitation exigé par formation ------------------------------------
alter table public.templates add column if not exists titre_habilitation boolean not null default false;

notify pgrst, 'reload schema';
