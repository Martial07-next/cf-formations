# API LMS : inscriptions (lecture seule)

Route destinée à la plateforme E-learning **CF Réseaux LMS**. Elle permet au LMS
de connaître les stagiaires réellement inscrits, leurs émargements et leurs
départs anticipés, pour calculer les dates d'ouverture des cours.

**Lecture seule** : la route n'écrit rien en base et ne modifie aucune table.

## Appel

```
GET /api/hooks/lms/enrollments?du=AAAA-MM-JJ&au=AAAA-MM-JJ&page=1
Authorization: Bearer <LMS_API_SECRET>
```

| Paramètre | Obligatoire | Règle |
| --- | --- | --- |
| `du`, `au` | oui | Sessions dont la **fin** (`end_at`) tombe dans la période ; 400 jours au plus |
| `page` | non | 1 par défaut ; 50 sessions par page, `hasMore` indique s'il y a une page suivante |

Codes : `200` OK · `400` paramètres invalides · `401` secret absent ou faux ·
`503` `LMS_API_SECRET` non configuré · `500` lecture impossible (message générique).

## Réponse

```json
{
  "ok": true, "du": "2026-04-01", "au": "2026-04-30", "page": 1, "pageSize": 50,
  "sessions": 50, "hasMore": true, "generatedAt": "2026-11-13T20:00:00.000Z",
  "enrollments": [{
    "session": { "id": "…", "title": "…", "reference": null, "digiformaRef": "…", "status": "confirmee",
                 "startAt": "…", "endAt": "…",
                 "formation": { "id": "…", "title": "…", "codification": "…", "category": "…" } },
    "trainee": { "id": "…", "firstName": "…", "lastName": "…", "fullName": "…", "email": "…", "company": "…" },
    "enrollment": { "status": "validee", "cursus": null, "addedAt": "…", "statusAt": null },
    "attendance": { "halfDaysSigned": 10, "halfDaysAbsent": 1, "firstSignedDay": "…", "lastSignedDay": "…",
                    "records": [{ "day": "2026-04-01", "half": "am", "status": "signe" }] },
    "earlyDeparture": { "departedAt": "…", "reason": "…" }
  }]
}
```

## Exclusions et protection des données

- Sessions au statut `brouillon` exclues ; stagiaires à la corbeille exclus.
- Seules les signatures des **stagiaires** sont comptées (pas celles des formateurs).
- Jamais exportés : images de signature, adresse, notes et relances de suivi,
  détail libre d'un départ anticipé, jetons de signature.
- E-mail transmis en minuscules, sans espaces.

## Limites connues

- Le planning ne garde pas l'identifiant Digiforma du stagiaire : le LMS
  rapproche lui-même par identifiant de session Digiforma (`digiformaRef`) puis par e-mail.
- Pas de date de modification sur les tables : le LMS relit une période complète
  et compare (pas de synchronisation « depuis telle date »).
- Une inscription retirée d'une session disparaît de la réponse : le LMS doit
  traiter cette disparition comme une anomalie à vérifier, jamais comme une suppression automatique.

## Mise en service

1. Générer un secret long (ex. `openssl rand -hex 32`).
2. L'ajouter dans Vercel → Settings → Environment Variables : `LMS_API_SECRET`
   (Production uniquement), puis redéployer.
3. Le copier côté LMS dans `wp-config.php`, jamais dans la base ni dans le navigateur.

Retour arrière : supprimer la variable `LMS_API_SECRET` coupe la route (503)
sans redéploiement de code ; supprimer le dossier `app/api/hooks/lms` la retire.

Fichiers : `app/api/hooks/lms/enrollments/route.ts`, `lib/lms-export.ts`.
