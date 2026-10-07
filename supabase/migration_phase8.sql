-- ============================================================
-- CF Réseau — Migration Phase 8 : bâtiments des salles
--   BAT 1 : salles 1, 2, 3   ·   BAT 2 : salles 4, 5, 6
-- À exécuter dans Supabase Dashboard > SQL Editor.
-- Ne touche qu'aux salles dont le bâtiment n'est pas encore renseigné ;
-- reconnaît les noms se terminant par 1-6 (ex. « Salle 2 ») ou A-F (ex. « Salle B »).
-- Vérifie ensuite le résultat dans la page Salles (modifiable via « Modifier »).
-- ============================================================

update rooms set location = 'BAT 1'
where coalesce(is_holding, false) = false
  and (location is null or location = '')
  and (name ~* '(^|\D)[1-3]\s*$' or name ~* '\s[A-C]\s*$');

update rooms set location = 'BAT 2'
where coalesce(is_holding, false) = false
  and (location is null or location = '')
  and (name ~* '(^|\D)[4-6]\s*$' or name ~* '\s[D-F]\s*$');

-- Contrôle : liste des salles et de leur bâtiment.
select name, location from rooms where coalesce(is_holding, false) = false order by location, name;

-- Recharge le cache de schéma de l'API Supabase (sinon : « Could not find the 'x' column … in the schema cache »).
notify pgrst, 'reload schema';
