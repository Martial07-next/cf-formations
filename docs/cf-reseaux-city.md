# CF Réseaux City 3D

Mode facultatif du tableau de bord : la journée du centre représentée en mini-ville 3D,
animée par les données réelles du planning. Accès : bouton « Activer CF Réseaux City 3D »
du tableau de bord → `/tableau-de-bord/ville`. « Revenir au tableau de bord » ramène au mode classique.

## Architecture

```
Supabase (RLS inchangé, client de l'utilisateur)
  → lib/city/load.ts      adaptateur métier → CityState (comptes, prénoms, statuts)
  → lib/city/sim.ts       plan d'animation (véhicules, trajets, horaires) + positions à l'heure T
  → lib/city/kpi.ts       indicateurs (données réelles uniquement)
  → components/city/*     scène Three.js / React Three Fiber, interface, panneaux
```

- `app/tableau-de-bord/ville/page.tsx` : état du jour, rendu côté serveur.
- `app/api/city/route.ts` : `GET ?date=AAAA-MM-JJ` (changement de date, bouton Actualiser,
  rafraîchissement toutes les 5 min en temps réel quand l'onglet est visible).
- `components/city/city-scene.tsx` : chargé uniquement à l'ouverture de la ville
  (`next/dynamic`, sans rendu serveur). Le tableau de bord classique n'embarque pas Three.js.
- Sans WebGL : `city-plan-2d.tsx` (plan 2D, mêmes informations).
- Aucune écriture dans le planning. Seule nouvelle table : `city_avatars` (migration 45).

## Données utilisées

| Donnée | Source | Représentation |
|---|---|---|
| Salles, bâtiment | `rooms` (location, sinon numéro : 1–3 BAT 1, 4–6 BAT 2) | Salles du plan |
| Formations possibles | `room_templates` + `templates.title`, `room_workshops` | Équipements par familles (mots-clés) |
| Sessions du jour | `sessions` (hors brouillon, jours ouvrés), `session_days` (horaire du jour) | Activité, arrivées, départs |
| Formateur du jour | `sessions.trainer_id`, remplaçant `session_day_trainers` | Personnage dans sa salle |
| Inscrits | `session_trainees` (validés / en attente) | Effectif, densité |
| Présents | `attendance_signatures` (stagiaire, signé, demi-journée) | KPI « Présents » |
| Congés / absences | `trainer_absences.kind` (le motif n'est jamais lu) | Congé → Beach Club ; autre → « Indisponible » |
| Formation extérieure | salle `status = 'exterieur'` | « En formation extérieure », pas dans la scène |

Statuts formateur : en formation, en formation extérieure, en congé, indisponible (sans motif),
non affecté (aucune session ce jour-là : ce n'est pas une disponibilité).

## Indicateurs (formules)

Filtrés par bâtiment quand un bâtiment ou son parking est sélectionné.

- **Sessions du jour** : sessions non brouillon dont la période couvre la date (jours ouvrés).
- **Stagiaires inscrits** : somme des stagiaires validés (+ en attente affichés à part).
- **Présents** : stagiaires distincts ayant signé la demi-journée en cours (matin avant 13h).
  « — » si l'émargement n'est pas lisible pour ce compte (droits existants) ou pas encore fait.
- **Formateurs affectés** : formateurs distincts qui animent ce jour (remplaçants compris).
- **Salles occupées** : salles disponibles avec au moins une session ce jour ÷ salles disponibles.
- **Taux d'occupation** : salles occupées ÷ salles disponibles × 100.
- **Sessions à venir (7 j)** : sessions qui commencent dans les 7 jours suivant la date.
- **Alertes planning** (bureau uniquement) : mêmes relances que le tableau de bord.

## Estimations et animations

- **Véhicules (estimation)** : arrondi(stagiaires validés × ratio) par session, ratio réglable
  (0,7 par défaut), plus un véhicule par formateur ; plafonné aux places dessinées.
- **Personnages** : densité visuelle plafonnée par session (Élevée 16, Standard 12, Économique 6).
- **Horaires d'animation** : arrivées entre 50 et 10 min avant le début, départs dans les
  20 min après la fin, pause déjeuner réglable (12h–13h par défaut, comme le calcul des heures).
- **Décoratif** : circulation sur la rocade et la D425, vagues, lumière selon l'heure.

## Modes

- **Temps réel** : date du jour, heure de Paris.
- **Exploration** : date, heure (06h–21h), session, bâtiment.
- **Simulation** : 06h → 21h en 60 s, signalée « Simulation visuelle des données du planning ».

## Plan de la scène

`lib/city/layout.ts` : BAT 1 d'après le croquis fourni (S1, S2, S3, couloir, WC, local,
cuisine, entrée, places P, bungalow Administration, parkings est et sud) ; BAT 2 d'après la vue
aérienne (toit en deux pans, 12 puits de lumière, parvis au sud), de l'autre côté de la rocade.
À confirmer : hauteurs (un niveau par défaut), plan intérieur du BAT 2 (zones indicatives),
usage du bloc au sud-ouest du BAT 1 (« annexe »).

## Confidentialité

La ville n'affiche que des prénoms (initiale du nom en cas d'homonyme), des comptes et des statuts.
Jamais : nom de stagiaire, coordonnées, documents, motif d'absence. Les personnages sont des
silhouettes stylisées créées par chaque formateur (aucun portrait).

## Performances

Chargement différé, géométries et matériaux partagés (libérés à la fermeture), instanciation
des véhicules, stagiaires, arbres et marquages, trois niveaux de qualité, option
« Réduire les mouvements » (suit aussi le réglage du système).
