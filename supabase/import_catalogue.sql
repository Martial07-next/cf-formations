-- ============================================================
-- CF Réseaux · Import du catalogue de formations (55 formations)
-- Relevé d'après les captures du catalogue (titre, durée, description).
-- Les formations sont rangées dans le dossier « À affecter ».
-- Sans doublon : une formation déjà présente (même nom, majuscules et
-- espaces ignorés) n'est pas recréée. Nombre de places : à compléter.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- (Nécessite la migration 12 : dossiers de formations.)
-- ============================================================

-- 1. Dossier « À affecter » (créé une seule fois)
insert into template_folders (name, parent_id, position)
select 'À affecter', null, coalesce((select max(position) + 1 from template_folders where parent_id is null), 0)
where not exists (select 1 from template_folders where name = 'À affecter' and parent_id is null);

-- 2. Formations
insert into templates (title, duration_hours, description, max_trainees, folder_id, category, position)
select c.title, c.hours, c.description, null,
       (select id from template_folders where name = 'À affecter' and parent_id is null limit 1),
       'À affecter',
       c.pos
from (values
  (0, 'Accessoire souterrain BT CIS', 14, 'Formation en présentiel · 14 h (2 jours) · accessible aux personnes en situation de handicap.'),
  (1, 'Accessoire souterrain BT CIS-CPI', 31.5, 'Formation en présentiel · 31 h 30 (4 jours et demi) · accessible aux personnes en situation de handicap.'),
  (2, 'Accessoire souterrain BT CPI', 17.5, 'Formation en présentiel · 17 h 30 (2 jours et demi) · accessible aux personnes en situation de handicap.'),
  (3, 'Accessoire souterrain HTA CIS', 28, 'Formation en présentiel · 28 h (4 jours) · accessible aux personnes en situation de handicap.'),
  (4, 'Accessoire souterrain HTA CIS-CPI', 42, 'Formation en présentiel · 42 h (6 jours) · accessible aux personnes en situation de handicap.'),
  (5, 'Accessoire souterrain HTA CPI', 21, 'Formation en présentiel · 21 h (3 jours) · accessible aux personnes en situation de handicap.'),
  (6, 'Aérien hors tension', 35, 'Formation en présentiel · 35 h (5 jours) · accessible aux personnes en situation de handicap.'),
  (7, 'AIPR Concepteur', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (8, 'AIPR Encadrant/Concepteur', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (9, 'AIPR Opérateur', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (10, 'Audit TST', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (11, 'BF HF Exécutant', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (12, 'Émergence hors tension', 21, 'Formation en présentiel · 21 h (3 jours) · accessible aux personnes en situation de handicap.'),
  (13, 'Habilitation électrique B0L', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (14, 'Habilitation électrique B1L-B2L-B1VL-B2VL-BCL', 14, 'Formation en présentiel · 14 h (2 jours) · accessible aux personnes en situation de handicap.'),
  (15, 'Habilitation électrique B1V-B2V-B2V Essai', 21, 'Formation en présentiel · 21 h (3 jours) · accessible aux personnes en situation de handicap.'),
  (16, 'Habilitation électrique B1(V)-B2(V)-BR-BC-H1(V)-H2(V)-HC', 21, 'Formation en présentiel · 21 h (3 jours) · accessible aux personnes en situation de handicap.'),
  (17, 'Habilitation électrique B2(V) BR BC H0V', 14, 'Formation en présentiel · 14 h (2 jours) · accessible aux personnes en situation de handicap.'),
  (18, 'Habilitation électrique BP', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (19, 'Habilitation électrique BR', 21, 'Formation en présentiel · 21 h (3 jours) · accessible aux personnes en situation de handicap.'),
  (20, 'Habilitation électrique BR PV', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (21, 'Habilitation électrique H0(V)-B0 Chargé de Chantier', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (22, 'Habilitation électrique H0(V)-B0 Exécutant', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (23, 'Habilitation électrique initiale BS-BE Manœuvre', 14, 'Formation en présentiel · 14 h (2 jours) · accessible aux personnes en situation de handicap.'),
  (24, 'Habilitation H1(V)-H2(V) HTA-HTB', 14, 'Formation en présentiel · 14 h (2 jours) · accessible aux personnes en situation de handicap.'),
  (25, 'Habilitation initiale BE Mesurage et Vérification', 14, 'Formation en présentiel · 14 h (2 jours) · accessible aux personnes en situation de handicap.'),
  (26, 'IRVE MA1', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (27, 'IRVE MA2', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (28, 'IRVE P2', 14, 'Formation en présentiel · 14 h (2 jours) · accessible aux personnes en situation de handicap.'),
  (29, 'IRVE P3', 14, 'Formation en présentiel · 14 h (2 jours) · accessible aux personnes en situation de handicap.'),
  (30, 'Les fondamentaux de l''électricité', 35, 'Formation en présentiel · 35 h (5 jours) · accessible aux personnes en situation de handicap.'),
  (31, 'Mesure et amélioration des mises à la terre des réseaux HTA-BT', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (32, 'PASS HTB encadrant', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (33, 'PASS HTB opérateur', 4, 'Formation en présentiel · 4 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (34, 'QUALI PV 36 + BRPV', 35, 'Formation en présentiel · 35 h (5 jours) · accessible aux personnes en situation de handicap.'),
  (35, 'QUALI PV 36 - Générateur photovoltaïque raccordé au réseau P<36kWc - module électricité', 28, 'Formation en présentiel · 28 h (4 jours) · accessible aux personnes en situation de handicap. Formation certifiante.'),
  (36, 'QUALI PV HP - Générateur photovoltaïque raccordé au réseau, Haute Puissance P>36kWc', 28, 'Formation en présentiel · 28 h (4 jours) · accessible aux personnes en situation de handicap.'),
  (37, 'Recyclage accessoire souterrain BT CIS', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (38, 'Recyclage accessoire souterrain BT CIS-CPI', 11, 'Formation en présentiel · 11 h (1 jour et demi) · accessible aux personnes en situation de handicap.'),
  (39, 'Recyclage accessoire souterrain HTA CIS', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (40, 'Recyclage accessoire souterrain HTA CIS-CPI', 14, 'Formation en présentiel · 14 h (2 jours) · accessible aux personnes en situation de handicap.'),
  (41, 'Recyclage habilitation B1V-B2V-B2V Essai', 10.5, 'Formation en présentiel · 10 h 30 (1 jour et demi) · accessible aux personnes en situation de handicap.'),
  (42, 'Recyclage habilitation B2(V) BR BC H0(V)', 10.5, 'Formation en présentiel · 10 h 30 (1 jour et demi) · accessible aux personnes en situation de handicap.'),
  (43, 'Recyclage habilitation BR', 10.5, 'Formation en présentiel · 10 h 30 (1 jour et demi) · accessible aux personnes en situation de handicap.'),
  (44, 'Recyclage habilitation électrique B1(V)-B2(V)-BC-H1(V)-H2(V)-HC', 14, 'Formation en présentiel · 14 h (2 jours) · accessible aux personnes en situation de handicap.'),
  (45, 'Recyclage habilitation électrique BP', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (46, 'Recyclage habilitation électrique BR PV', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (47, 'Recyclage habilitation électrique BS-BE Manœuvre', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (48, 'Recyclage habilitation électrique H0(V)-B0 Chargé de Chantier', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (49, 'Recyclage habilitation électrique H0(V)-B0 Exécutant', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (50, 'Recyclage habilitation électrique H1(V)-H2(V)-H2(V) essai', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (51, 'Technicien maintenance photovoltaïque', 14, 'Formation en présentiel · 14 h (2 jours) · accessible aux personnes en situation de handicap.'),
  (52, 'Travaux en hauteur sur les réseaux de distribution', 7, 'Formation en présentiel · 7 h (1 jour) · accessible aux personnes en situation de handicap.'),
  (53, 'TST Batteries stationnaires IEBAT recyclage', 14, 'Formation en présentiel · 14 h (2 jours) · accessible aux personnes en situation de handicap.'),
  (54, 'TST Batteries stationnaires IEBAT', 21, 'Formation en présentiel · 21 h (3 jours) · accessible aux personnes en situation de handicap.')
) as c(pos, title, hours, description)
where not exists (
  select 1 from templates t
  where lower(regexp_replace(btrim(t.title), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(c.title), '\s+', ' ', 'g'))
);

-- 3. Vérification : formations du dossier « À affecter »
select title, duration_hours as heures
from templates
where folder_id = (select id from template_folders where name = 'À affecter' and parent_id is null limit 1)
order by position, title;
