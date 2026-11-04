-- Phase 53 : prénom et nom séparés sur les comptes.
--   Le « Bonjour … » du tableau de bord utilise le prénom ; le nom complet
--   (« Prénom NOM ») reste utilisé partout ailleurs.
--   Comptes existants : découpage proposé (mot en MAJUSCULES = nom), à
--   corriger si besoin dans Administration › Modifier l'accès.
-- Idempotent.

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;

-- Pré-remplissage des comptes existants (seulement s'ils n'ont rien) :
-- « DUPONT Martial » → Martial / DUPONT ; « Martial Dupont » → Martial / Dupont.
update public.profiles p set
  first_name = case
    when p.full_name ~ '\m[[:upper:]''-]{2,}\M' and p.full_name ~ '[[:lower:]]'
      then nullif(trim(regexp_replace(p.full_name, '\m[[:upper:]''-]{2,}\M', '', 'g')), '')
    else split_part(trim(p.full_name), ' ', 1)
  end,
  last_name = case
    when p.full_name ~ '\m[[:upper:]''-]{2,}\M' and p.full_name ~ '[[:lower:]]'
      then nullif(trim(array_to_string(array(select w from regexp_split_to_table(trim(p.full_name), '\s+') w where w ~ '^[[:upper:]''-]{2,}$'), ' ')), '')
    else nullif(trim(substr(trim(p.full_name), length(split_part(trim(p.full_name), ' ', 1)) + 1)), '')
  end
where p.first_name is null and p.last_name is null and coalesce(p.full_name, '') <> '';

notify pgrst, 'reload schema';
