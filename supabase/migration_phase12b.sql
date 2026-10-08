-- ============================================================
-- CF Réseaux · Migration Phase 12b (à lancer APRÈS migration_phase12.sql)
-- Crée un dossier pour chaque « dossier » texte existant des formations et
-- y range les formations, par ordre alphabétique. Peut être relancée.
-- ============================================================

insert into template_folders (name, position)
select c.name, (row_number() over (order by c.name))::int - 1
from (
  select distinct btrim(category) as name
  from templates
  where category is not null and btrim(category) <> ''
) c
where not exists (
  select 1 from template_folders f where f.parent_id is null and f.name = c.name
);

update templates t
set folder_id = f.id
from template_folders f
where t.folder_id is null
  and f.parent_id is null
  and f.name = btrim(t.category);

-- Ordre initial alphabétique dans chaque dossier (seulement si aucun ordre n'a encore été défini).
update templates t
set position = x.rn
from (
  select id, (row_number() over (partition by folder_id order by title))::int - 1 as rn
  from templates
) x
where t.id = x.id
  and not exists (select 1 from templates t2 where t2.position <> 0);
