/**
 * Matthias bot (gratuit, sans service extérieur) : base de questions /
 * réponses sur la plateforme et Digiforma, cherchée directement dans le
 * navigateur. Les mots-clés tolèrent les fautes (voir lib/matthias-match.ts).
 * Pour ajouter une réponse : une entrée de plus dans FAQ.
 */

export type FaqEntry = {
  id: string;
  /** Question type, affichée dans « Questions proches ». */
  q: string;
  /** Mots-clés et expressions (un mot-clé de plusieurs mots compte si tous ses mots sont présents). */
  keys: string[];
  /** Réponse (gras **…**, listes « - » ou « 1. »). */
  a: string;
  /** Réservé au bureau (indiqué au formateur qui pose la question). */
  bureau?: boolean;
};

export const FAQ: FaqEntry[] = [
  // ---------------------------------------------------------------- Digiforma
  {
    id: 'df-qr',
    q: 'Lien formateur et QR codes d’émargement Digiforma : je fais comment ?',
    keys: ['qr code', 'qrcode', 'qr', 'emargement', 'emarger', 'signature', 'signer', 'faire signer', 'signer stagiaires', 'feuille emargement', 'lien intervenant', 'lien formateur', 'lien formateur digiforma', 'recuperer lien', 'lien digiforma', 'ajouter intervenant', 'acces', 'qr codes emargement', 'liste qr'],
    bureau: true,
    a: `Il y a **deux choses** à mettre sur la plateforme pour chaque session :

**1. Le lien de l'intervenant** (le formateur signe et voit qui a signé)
1. Sur Digiforma, **ajoute l'intervenant (le formateur) sur la session Digiforma**. Indispensable : sans lui, pas de lien formateur. Vérifie bien la session et le formateur.
2. Dans la session Digiforma, rubrique **« Accès »** (la première fenêtre) : copie le **lien de l'intervenant**.
3. Sur la plateforme, colle-le comme **lien Digiforma** de la session : à la création (étape « Finaliser »), ou fiche de la session > « Dossier de formation » > **« Ajouter le lien Digiforma »**.

Le formateur clique ensuite **« Accès formateur Digiforma »** : il signe ses émargements, voit qui a signé, puis coche « C'est fait sur Digiforma ».

**2. La fiche des QR codes d'émargement** (les stagiaires émargent)
1. Sur Digiforma, dans la session : **« Suivi » > « Émargement »**, télécharge la fiche des QR codes.
2. Sur la plateforme, fiche de la session > « Dossier de formation » > **« Documents propres à cette session »** : « Fichier PDF » = la fiche, « Nom du document » = « QR codes émargement », « Qui le remplit ? » = **« Personne : document à consulter »**, puis **« Ajouter au dossier »**.

Elle n'arrive pas toute seule : c'est à faire **à la main** pour chaque session.`,
  },
  {
    id: 'df-what',
    q: 'Qu’est-ce que la plateforme prend en compte depuis Digiforma ?',
    keys: ['prend en compte', 'vient digiforma', 'quoi digiforma', 'repris', 'reprend', 'importe', 'import', 'recupere', 'synchro', 'synchronisation', 'qu est ce qui vient', 'depuis digiforma', 'lien digiforma planning'],
    a: `**Repris automatiquement de Digiforma :**
- les sessions **planifiées / en cours** et leurs **modules** (nom du module de chaque créneau), semaine par semaine ;
- les **dates et horaires réels** de chaque jour (un jour sans créneau n'est pas compté, aucun décalage pour un férié) ;
- les **stagiaires**, créneau par créneau (un stagiaire qui fait P1 et P2 mais pas P3 n'est inscrit qu'à ses modules) ; confirmé = validé, indécis = en attente ; les « Apprenant A » fictifs et la corbeille sont ignorés ; un nouvel inscrit rejoint la session déjà placée ;
- la **salle** et l'**intervenant** s'ils existent aussi sur la plateforme (même nom) ;
- les **parcours** GEIQ / POEC / alternance et les **stages en entreprise**.

**Pas repris (à faire à la main) :** le **lien de l'intervenant** et la **fiche des QR codes d'émargement** (demande-moi « QR code »).

**Restent dans Digiforma :** les émargements et la satisfaction à chaud.

La plateforme **ne modifie jamais Digiforma** : une session créée à la main ici doit aussi être créée sur Digiforma.`,
  },
  {
    id: 'df-planning',
    q: 'Comment les sessions Digiforma arrivent sur le planning ?',
    keys: ['modules a placer', 'placer module', 'placer digiforma', 'sessions digiforma planning', 'arrive planning', 'digiforma planning', 'section digiforma', 'carte digiforma', 'retirer module'],
    bureau: true,
    a: `Rien n'est posé tout seul en salle : tout passe par la section **« Modules Digiforma à placer »**, **sous le planning**, semaine par semaine.

1. Chaque carte = un module (ou une session à plusieurs modules la même semaine, ex. IRVE P1/P2/P3 → **une seule session avec ses modules**).
2. Vérifie la **formation** reconnue (« Reconnue » ou « À vérifier » ; bouton **« Changer »** pour chercher dans le catalogue) et le **parcours**.
3. Clique **« Placer »** : la session est créée (dates, horaires, stagiaires de Digiforma, salle et formateur s'ils sont reconnus, sinon « À affecter ») et sa fiche s'ouvre.
4. **« Retirer »** fait disparaître une carte inutile (on peut la remettre).

Ce qui est déjà sur le planning (mêmes jours, mêmes stagiaires, ou parcours déjà posé) n'est pas reproposé. Les parcours créés automatiquement ont leurs modules posés dans « À affecter ».`,
  },
  {
    id: 'df-when',
    q: 'Quand la synchronisation Digiforma se fait-elle ?',
    keys: ['quand synchro', 'synchroniser maintenant', 'mise a jour digiforma', 'actualiser', 'rafraichir', 'compte rendu', 'integrations'],
    a: `La plateforme relit Digiforma :
- **à chaque ouverture ou actualisation du planning** (en arrière-plan, au plus toutes les 2 minutes, une seule fois pour toute l'équipe) ;
- **chaque nuit** ;
- avec le bouton **« Synchroniser maintenant »** (Administration > Intégrations, administrateur), qui montre aussi le **compte rendu** détaillé.

Un changement fait sur Digiforma apparaît donc en quelques minutes.`,
  },
  {
    id: 'df-missing',
    q: 'Un module Digiforma n’apparaît pas, pourquoi ?',
    keys: ['apparait pas', 'n apparait pas', 'manque module', 'module absent', 'pas dans a placer', 'introuvable', 'pas importe'],
    bureau: true,
    a: `Raisons possibles :
- la session Digiforma n'est pas au statut **planifiée / en cours** ;
- le module est **déjà passé** ou dans plus de 6 mois ;
- il n'a **aucun vrai stagiaire** sur ses créneaux (fictifs ou corbeille) ;
- il est **déjà sur le planning** (mêmes jours et mêmes stagiaires) ou couvert par un **parcours** déjà posé ;
- c'est un **stage** ou une période de vacances (pas de salle à prévoir) ;
- la synchro n'est pas encore passée : actualise le planning, attends une minute.

Le compte rendu (Administration > Intégrations) dit ce qui a été lu.`,
  },
  {
    id: 'df-room',
    q: 'La salle ou le formateur de Digiforma ne sont pas repris',
    keys: ['salle digiforma', 'salle pas reprise', 'salle reprise', 'formateur pas repris', 'intervenant pas repris', 'a affecter', 'salle reconnue'],
    bureau: true,
    a: `La salle et l'intervenant sont repris **seulement s'ils correspondent** à une salle / un formateur de la plateforme :
- salle : même nom (« Salle Ampère » = « Ampère ») ; un nom ambigu n'est pas deviné ;
- formateur : même e-mail, ou même nom et prénom.

Sinon (ou si la salle est déjà réservée, ou le formateur absent), la session reste dans **« À affecter »** : choisis sur sa fiche. Un choix fait sur le planning est gardé tant que Digiforma ne change pas.`,
  },
  {
    id: 'df-several',
    q: 'Plusieurs liens Digiforma sur une session (GEIQ, deux formateurs)',
    keys: ['plusieurs liens', 'deux liens', 'deux formateurs', 'geiq lien', 'reprendre le lien', 'autre session lien', 'aer branchement'],
    bureau: true,
    a: `Dans « Dossier de formation » > « Ajouter / Modifier le lien Digiforma » :
- **Plusieurs liens** : quand les stagiaires sont dans des sessions Digiforma différentes (groupe GEIQ + stagiaires ajoutés), un lien par groupe : « Tous les stagiaires », « Groupe du parcours », « Stagiaires ajoutés (hors groupe) » ou « Stagiaires choisis ».
- **Une session Digiforma pour deux formations** qui s'enchaînent avec deux formateurs (ex. branchement puis AER) : **« Reprendre le lien d'une autre session »**, chaque formateur a son accès et coche « fait » pour son lien.`,
  },
  {
    id: 'df-trainer',
    q: 'Formateur : comment faire émarger et remplir la satisfaction sur Digiforma ?',
    keys: ['acces formateur digiforma', 'satisfaction', 'questionnaire', 'a chaud', 'c est fait sur digiforma', 'emargement formateur'],
    a: `1. Ouvre ta session (planning > clic sur la carte) > **« Dossier de formation »**.
2. Clique **« Accès formateur Digiforma »** : tu arrives sur Digiforma.
3. Fais émarger les stagiaires (la **fiche des QR codes** est dans les documents de la session), **signe** tes émargements et vérifie **qui a signé** ; lance la **satisfaction à chaud**.
4. De retour sur la plateforme, coche **« C'est fait sur Digiforma »**.

Pas de bouton « Accès formateur Digiforma » ? Le lien n'est pas encore renseigné : préviens le bureau.`,
  },
  {
    id: 'df-trash',
    q: 'Les stagiaires fictifs « Apprenant A » : la corbeille',
    keys: ['apprenant a', 'fictif', 'corbeille', 'faux stagiaire', 'stagiaire test'],
    bureau: true,
    a: `Les places fictives de Digiforma (« Apprenant A », « Stagiaire 1 »…) sont **ignorées** automatiquement.
Pour un stagiaire hors sujet : page **« Stagiaires »** > **corbeille** : il n'est plus jamais importé depuis Digiforma.`,
  },

  // ---------------------------------------------------------------- Planning
  {
    id: 'pl-session',
    q: 'Comment positionner une session sur le planning ?',
    keys: ['positionner', 'creer session', 'nouvelle session', 'ajouter session', 'mettre session', 'poser session', 'placer session', 'session planning', 'programmer'],
    bureau: true,
    a: `Bouton **« Nouvelle session »** du planning, 4 étapes :
1. **Informations** : formation du catalogue, dates, heures, salle, formateur, capacité, statut. La durée se calcule seule (7 h par jour, pause 12h–13h, sans week-ends ni fériés).
2. **Modules** (si la formation en a, ex. P1/P2/P3) : posés sur les jours.
3. **Stagiaires** : recherche, liste collée, places réservées pour une entreprise, module de chacun.
4. **Finaliser** : colle le **lien de l'intervenant** Digiforma, vérifie le récapitulatif.

La fiche de la session s'ouvre ensuite. La salle et le formateur sont vérifiés jour par jour (pas de chevauchement).`,
  },
  {
    id: 'pl-move',
    q: 'Déplacer une session, changer la salle, le formateur ou les horaires',
    keys: ['deplacer', 'changer salle', 'changer formateur', 'modifier session', 'changer date', 'horaire', 'horaires par jour', 'remplacant', 'heure de debut'],
    a: `Ouvre la fiche (clic sur la carte du planning) :
- panneau **« Informations, horaires et modules »** : dates, salle, formateur ;
- **« Horaires par jour »** : un horaire différent un jour précis (formateur et référent : l'heure de début de leurs sessions) ;
- **remplaçant** : formateur choisi jour par jour.

Un conflit de salle est refusé avec les créneaux libres proposés.`,
  },
  {
    id: 'pl-event',
    q: 'À quoi sert un évènement ?',
    keys: ['evenement', 'event', 'repas', 'forum', 'caces', 'sst', 'recrutement', 'evenement exterieur'],
    a: `Un **évènement** met sur le planning ce qui n'est pas une session en salle, **sans bloquer de salle** :
- Évènement extérieur, Repas de groupe, Passage CACES / SST, Session de recrutement, Forum, Autre ;
- les stages POEC en entreprise apparaissent aussi comme évènements ;
- **une formation un samedi** se crée en évènement.

Bouton **« Évènement »** du planning > **« Nouvel évènement »** : type, titre, dates, heures (sinon « Journée »), lieu, participants, formateurs / salariés concernés. Il s'affiche en tête de la journée ; clic sur le jour pour le détail.`,
  },
  {
    id: 'pl-intra',
    q: 'Où s’affiche une formation INTRA (chez le client) ?',
    keys: ['intra', 'exterieur', 'chez le client', 'en entreprise formation', 'formation exterieure', 'entreprise cliente'],
    bureau: true,
    a: `Création : bouton **« Évènement »** du planning > **« Formation extérieure (INTRA) »** (« le formateur part en entreprise ») : entreprise, adresse, dates, formateur, stagiaires.

Sur le planning, elle a **sa propre colonne « INTRA · nom de l'entreprise »**, seulement les semaines où elle a lieu. C'est une vraie session : même dossier et mêmes documents qu'en centre. Les stagiaires connus de l'entreprise sont proposés en priorité.`,
  },
  {
    id: 'pl-saturday',
    q: 'Une formation le samedi, comment ça s’affiche ?',
    keys: ['samedi', 'week end', 'weekend', 'dimanche'],
    a: `Les sessions **sautent toujours le week-end** (une session sur deux semaines ne compte pas les samedis).

Une formation un **samedi** se crée comme un **évènement** (bouton « Évènement » > « Nouvel évènement ») à cette date. La **colonne Samedi** n'apparaît sur le planning (semaine et mois) **que s'il y a un évènement ce samedi-là**.`,
  },
  {
    id: 'pl-holiday',
    q: 'Jours fériés : comment le planning les gère ?',
    keys: ['ferie', 'feries', '11 novembre', 'jour ferie', 'decale', 'decalage', 'pont'],
    a: `Les fériés viennent de **CF Congés** :
- férié **non travaillé** : pas de formation ce jour-là (case rose) ; une session créée à la main qui tombe dessus est **décalée d'un jour ouvré** ; les heures ne comptent pas ce jour ;
- si la direction le déclare **travaillé** dans CF Congés, le décalage est annulé ;
- les sessions venues de **Digiforma ne sont jamais décalées** : leurs jours sont ceux des créneaux Digiforma.

Ex. lundi → jeudi avec le 11 novembre = **3 jours, 21 h**.`,
  },
  {
    id: 'pl-read',
    q: 'Comment lire une carte du planning ?',
    keys: ['carte', 'pastille', 'couleur', 'en attente planning', 'lien digiforma manquant', 'dossier complet', 'fleche', 'statut', '4/8'],
    a: `Sur chaque carte :
- **statut** : Confirmée / En attente / Brouillon (et « En cours » / « Terminée » le jour même) ;
- titre, horaire, **formateur** (une couleur par formateur) ;
- **4/8** = stagiaires validés / capacité ; « 1 en attente » = stagiaire à valider ;
- pastilles du **dossier** (documents à compléter, facturation) puis « Dossier complet » ;
- **« Lien Digiforma manquant »** : le lien de l'intervenant n'est pas renseigné ;
- **↳** = suite d'une formation sur plusieurs jours.
La colonne **« À affecter »** = sessions sans salle choisie.`,
  },
  {
    id: 'pl-views',
    q: 'Vues du planning, filtres et recherche',
    keys: ['vue', 'mois', 'semaine', 'jour', 'filtre', 'rechercher formation', 'liens utiles', 'ctrl k', 'aller a'],
    a: `- Vues **Jour / Semaine / Mois**, flèches pour changer de période, retour à aujourd'hui.
- Filtres par **formateur** et **statut**, recherche d'une formation.
- **« Liens utiles »** : CF Congés, supports de cours, documents utiles.
- **Ctrl + K** (ou Cmd + K) : « Aller à… » n'importe quelle page ou session.`,
  },
  {
    id: 'pl-parcours',
    q: 'Où s’affiche un parcours (POEC, GEIQ, personnalisé) ?',
    keys: ['parcours', 'poec', 'geiq', 'personnalise', 'alternance', 'stage entreprise', 'groupe'],
    a: `Les parcours se créent et s'ouvrent depuis le **Tableau de bord** (page « Parcours POEC et personnalisés »).
Sur le planning, leurs sessions portent un **badge** avec le nom du parcours, semaine par semaine, et les **stages en entreprise** apparaissent comme évènements. Les stagiaires du groupe sont inscrits d'office ; une personne hors groupe peut être **greffée**. Les GEIQ venus de Digiforma sont rattachés au parcours existant ou créés en parcours personnalisé.`,
  },

  // ---------------------------------------------------------------- Dossier / formateur
  {
    id: 'do-tdt',
    q: 'Comment je remplis le tour de table ?',
    keys: ['tour de table', 'tdt', 'remplir tdt', 'remplir tour de table', 'debut de formation', 'attentes', 'epi', 'habilitations stagiaire'],
    a: `Fiche de la session > « Dossier de formation » > **Tour de table** > **« Remplir »**.
1. Une ligne par stagiaire (nom et société déjà remplis) : formations déjà suivies, poste, habilitations, EPI apportés / manquants, attentes, incidents.
2. « Incidents et remarques générales » en bas.
3. Tout s'enregistre **seul**, même à plusieurs en même temps.
4. Clique **« Terminé »** à la fin (« Aperçu PDF » pour voir le document).

Recyclage d'habilitation : le **titre d'habilitation** précédent est demandé (case « fourni », fichier ou QR code pour que le stagiaire le photographie). Sans titre, son attestation reste bloquée.`,
  },
  {
    id: 'do-fai',
    q: 'Comment remplir les fiches d’appréciation ?',
    keys: ['fiche appreciation', 'appreciation', 'avis favorable', 'defavorable', 'ras', 'ecarts constates', 'fai', 'serect'],
    a: `Dossier > **Fiches d'appréciation individuelle** > « Remplir ».
1. Choisis le stagiaire à gauche (tu vois qui reste à faire).
2. Tout est pré-rempli : clique **« Avis favorable »** ou **« Avis défavorable »** (+ « Avec recommandations » si besoin).
3. « Écarts constatés » : seulement ce qui a été constaté pendant la formation ; « Autres informations » (sur les attestations) et internes.
4. **« RAS dans les cases vides »** pour aller vite, puis **« Stagiaire suivant »**.
PDF d'une fiche ou de toutes. Ces avis débloquent les attestations de fin de formation.`,
  },
  {
    id: 'do-irve',
    q: 'Comment remplir la grille IRVE ou Maintenance rapidement ?',
    keys: ['grille', 'irve', 'maintenance', 'ma1', 'ma2', 'ma3', 'p1', 'p2', 'p3', 'grille evaluation', 'note sur 20', 'tout a 3', 'n o', 'critere'],
    a: `Dossier > **Grille d'évaluation pratique IRVE** (ou **Maintenance IRVE**) > « Remplir ».
1. Stagiaire à gauche ; coche la **qualification** (P1/P2/P3) ou le **module** (MA1/MA2/MA3) et la **mise en situation**.
2. Clique **« Tout à 3 »** (famille ou stagiaire entier), puis corrige les écarts : **0** non réalisé, **1** aide importante, **2** quelques indications, **3** maîtrisé, **N/O** non observé (ne compte pas).
3. Remarque sur un critère : icône bulle ; observations par famille.
4. **Erreurs critiques / sécurité** à cocher à part (jamais compensées par la note).
5. **Appréciation** (une suggestion d'après la note est proposée), points forts, axes de progression, traçabilité.
Note par famille et **total sur 20** automatiques. PDF par stagiaire ou toutes les grilles.

La grille n'apparaît que si sa case est cochée dans la formation (ou les paramètres de la session).`,
  },
  {
    id: 'do-hab',
    q: 'Certificats d’habilitation et attestations de réussite',
    keys: ['certificat', 'habilitation', 'symbole', 'b1v', 'h0b0', 'br', 'attestation reussite', 'reussite', 'titre'],
    a: `- **Certificats d'habilitation** : pour chaque stagiaire, ton avis et les **symboles attribués** (tous cochés par défaut, décoche ceux non obtenus). Bloqué si le titre précédent manque pour un recyclage.
- **Attestations de réussite** (ex. IRVE P1, P2, P3) : une par stagiaire et par module suivi, avis et **signature** du formateur.
Tout s'enregistre seul ; les PDF sont prêts au format CF Réseaux.`,
  },
  {
    id: 'do-write',
    q: 'Conseils pour rédiger une observation ou une appréciation',
    keys: ['rediger', 'ecrire', 'formulation', 'observation', 'points forts', 'axes de progression', 'commentaire', 'que mettre'],
    a: `Quelques règles simples :
- **factuel** : ce que tu as vu (« a vérifié l'absence de tension avec un VAT contrôlé avant et après ») ;
- phrases **courtes**, pas de jugement sur la personne, rien de médical ou personnel ;
- **axes de progression concrets** (« refaire la mesure de terre avec la méthode des piquets ») ;
- **points forts** précis (« rigueur dans la consignation, communication claire avec le client »).
Exemples : « Bonne maîtrise des gestes, à consolider sur le choix des protections. » / « Autonome sur la mise en sécurité, accompagnement nécessaire sur le diagnostic. »`,
  },
  {
    id: 'do-depart',
    q: 'Un stagiaire doit partir plus tôt, je fais quoi ?',
    keys: ['partir plus tot', 'depart anticipe', 'depart', 'decharge', 'quitte', 'part avant'],
    a: `Fiche de la session > encart **« Papiers stagiaires »** > onglet **Départs anticipés** > **« QR code départ anticipé »** (affichable en grand sur l'écran de la salle).
Le stagiaire scanne, choisit son nom et la raison, et **signe l'attestation et la décharge** ; date, heure et formation sont remplies seules. Pas proposé pour l'IRVE.`,
  },
  {
    id: 'do-papers',
    q: 'Droit à l’image, livret, vêtements TST : papiers stagiaires',
    keys: ['droit a l image', 'image', 'livret', 'reglement', 'vetement', 'veste', 'pantalon', 'papiers stagiaires', 'autorisation'],
    a: `Encart **« Papiers stagiaires »** de la fiche (sous la facturation), à onglets :
- **Droit à l'image** et **livret / règlement** : signés **une seule fois** par QR code avec le téléphone du stagiaire ;
- **Départs anticipés** ;
- **Prêt de vêtements TST** (vestes / pantalons) : signature au prêt et au retour.
Un stagiaire sans téléphone peut signer sur l'appareil du formateur.`,
  },
  {
    id: 'do-dossier',
    q: 'Le dossier de formation : comment ça marche ?',
    keys: ['dossier', 'dossier complet', 'documents a remplir', 'dossier formation', 'en cours', 'termine', 'pdf dossier'],
    a: `Fiche de la session > **« Dossier de formation »** : la liste des documents de la session, avec un badge **À remplir / En cours / Terminé** et un bouton **« Remplir »** ou **« Ouvrir »**.
- Tout s'enregistre **automatiquement**, même à plusieurs (on voit qui est sur la fiche).
- Quand tout est fait, la session affiche **« Dossier complet »** sur le planning.
- **« Dossier complet (PDF) »** : tout le dossier en un fichier.
- « Documents propres à cette session » : les PDF ajoutés par le bureau (ex. QR codes d'émargement).`,
  },
  {
    id: 'do-adddoc',
    q: 'Ajouter un document à une session',
    keys: ['ajouter document', 'deposer', 'pdf session', 'document propre', 'joindre', 'ajouter au dossier'],
    bureau: true,
    a: `Fiche de la session > « Dossier de formation » > **« Documents propres à cette session »** :
1. « Fichier PDF » ;
2. « Nom du document » ;
3. « Qui le remplit ? » : le formateur, le bureau, ou **« Personne : document à consulter »** ;
4. « Obligatoire pour que le dossier soit complet » si besoin ;
5. **« Ajouter au dossier »**.
Pour toutes les sessions d'une formation : dans le catalogue (Formations > la formation > Dossier).`,
  },
  {
    id: 'do-supports',
    q: 'Les supports de cours',
    keys: ['support', 'supports de cours', 'powerpoint', 'ppt', 'diaporama', 'telecharger support', 'police'],
    a: `Les supports sont déposés **une fois** sur la formation (catalogue) et apparaissent sur **chaque session** et dans « Liens utiles ».
Un clic ouvre le PowerPoint / Word **sans le télécharger** (plein écran possible) ; un bouton à côté permet de le **télécharger**. Les polices CF Réseaux (Archivo Expanded, Space Grotesk) sont téléchargeables dans l'application.`,
  },

  // ---------------------------------------------------------------- Bureau / catalogue
  {
    id: 'bu-settings',
    q: 'Paramétrer une session à part (roue crantée)',
    keys: ['roue crantee', 'parametrer', 'parametres de la session', 'sur mesure', 'personnalisee', 'catalogue modifie'],
    bureau: true,
    a: `Sur la fiche, panneau Informations : **roue crantée « Paramétrer »** (ou « Paramètres de la session »).
Tous les réglages d'une formation du catalogue (durée, modules, documents, objectifs, fiche d'appréciation, habilitation, recyclage, autorisations, supports, **grilles IRVE / Maintenance**, départ anticipé…) **pour cette session uniquement** : le **catalogue n'est jamais modifié**.`,
  },
  {
    id: 'bu-catalog',
    q: 'Configurer une formation dans le catalogue',
    keys: ['catalogue', 'formation catalogue', 'formations disponibles', 'configuration intelligente', 'modeles', 'duree recyclage', 'cocher grille'],
    bureau: true,
    a: `Menu **Catalogue > Formations** > la formation > Modifier :
- durée (et durée du recyclage), modules, formateurs habilités, supports, documents du dossier ;
- objectifs et compétences (attestations), fiche d'appréciation et codification, titre d'habilitation exigé, symboles, attestations de réussite, recyclage ;
- autorisations stagiaire, départ anticipé, **cases des grilles IRVE / Maintenance**.
La **configuration intelligente** lit l'intitulé et propose les réglages (« Appliquer » / « Tout appliquer »).`,
  },
  {
    id: 'bu-trainees',
    q: 'Inscrire des stagiaires, valider ou mettre en attente',
    keys: ['inscrire', 'ajouter stagiaire', 'valider', 'en attente', 'liste collee', 'places entreprise', 'reservees', 'greffe'],
    bureau: true,
    a: `Sur la fiche de la session (ou à l'étape « Stagiaires » de la création) :
- **recherche** dans la base, **liste collée** (copier-coller de noms), **places réservées** pour une entreprise (même sans les noms) ;
- **valider / mettre en attente** d'un clic ; les stagiaires en attente sont signalés sur le planning et dans « Suivi interne » ;
- module suivi par chaque stagiaire ; **greffe** d'une personne hors groupe d'un parcours.`,
  },
  {
    id: 'bu-prepare',
    q: 'L’encart « À préparer » du tableau de bord',
    keys: ['a preparer', 'tableau de bord', 'j 3', 'jours restants', 'preparer'],
    a: `Sur le **Tableau de bord** : les sessions **jusqu'à la fin de la semaine prochaine**, avec une pastille **« J-3 », « J-5 »…**, les **liens Digiforma manquants**, les dossiers incomplets et les facturations à faire. Le formateur y voit sa formation du jour, ses prochaines sessions et ses documents à remplir.`,
  },
  {
    id: 'bu-docs',
    q: 'Attestations et documents générés',
    keys: ['attestation', 'attestation fin', 'fin de formation', 'competences', 'generer', 'telecharger attestation', 'cachet'],
    bureau: true,
    a: `Générés automatiquement à partir de ce qui est saisi : attestations de fin de formation (initiale / recyclage), appréciation des compétences, certificats d'habilitation, fiches d'appréciation, attestations de réussite, grilles IRVE / Maintenance, départs anticipés, autorisations, dossier complet.
L'attestation d'un stagiaire est prête quand le formateur a donné son **avis** (fiche d'appréciation) et que le **titre** est fourni (recyclage). Cachet, signature, SIRET et NDA : Administration > Paramètres.`,
  },
  {
    id: 'bu-sessions',
    q: 'La liste des sessions et le suivi des dossiers',
    keys: ['liste des sessions', 'sessions', 'dossier incomplet', 'facturation', 'export', 'suivi interne', 'relance'],
    a: `Menu **Sessions** : onglets En cours / À venir / Terminées, case **« Dossier incomplet »**, et « N documents à compléter · facturation à faire » sur chaque ligne ; export en tableur.
**Suivi interne** : relances des stagiaires en attente et sessions à venir, par personne de l'équipe. **Facturation** : si l'accès est coché sur ton compte.`,
  },

  // ---------------------------------------------------------------- Comptes, divers
  {
    id: 'ac-roles',
    q: 'Qui peut faire quoi (rôles) ?',
    keys: ['role', 'droits', 'acces', 'qui peut', 'bureau', 'formateur role', 'referent', 'administrateur', 'consultation'],
    a: `- **Administrateur** : tout, plus comptes, paramètres, intégrations, suppressions.
- **Bureau administratif** : sessions, stagiaires, catalogue, parcours, évènements (facturation si cochée).
- **Référent cadre** : consulte, change l'heure de début, suit son équipe.
- **Formateur** : planning, ses sessions, remplit les documents de ses dossiers, change l'heure de début.
- **Consultation** : lecture seule du planning.`,
  },
  {
    id: 'ac-password',
    q: 'Mot de passe, connexion, demande d’accès',
    keys: ['mot de passe', 'mdp', 'connexion', 'connecter', 'oublie', 'compte', 'demander un acces', 'profil'],
    a: `- Première connexion : mot de passe provisoire à **changer**.
- Oublié : **« Mot de passe oublié »** sur la page de connexion.
- Nouveau collaborateur : **« Demander un accès »** sur la page de connexion ; un administrateur valide et choisit le rôle.
- Tes infos : **« Mon profil »** en bas du menu.`,
  },
  {
    id: 'ac-phone',
    q: 'Utiliser la plateforme sur téléphone',
    keys: ['telephone', 'portable', 'mobile', 'iphone', 'android', 'partager', 'airdrop'],
    a: `Tout fonctionne sur téléphone : bouton du **menu en haut**, boutons larges, fiches et grilles remplissables à une main. Un document se **partage** directement (AirDrop, Messages, mail). La version ordinateur est la même.`,
  },
  {
    id: 'ac-conges',
    q: 'CF Congés et les autres plateformes',
    keys: ['conges', 'cf conges', 'absence', 'vacances', 'ticket restaurant', 'autres plateformes', 'ou trouver'],
    a: `- **CF Formations** : cf-formations.vercel.app (sessions, dossiers, documents).
- **CF Congés** : cf-conges.vercel.app (demandes de congé, soldes, tickets restaurant, planning d'équipe). Les congés des formateurs et les fériés apparaissent sur le planning des formations.
- **Digiforma** : par le lien de chaque session (« Accès formateur Digiforma »).
Tous les liens : bouton **« Liens utiles »** du planning.`,
  },
  {
    id: 'ac-missing',
    q: 'Il manque un document ou une fonction',
    keys: ['manque', 'il manque', 'pas trouve', 'ajouter fonction', 'idee', 'amelioration', 'bug', 'probleme'],
    a: `Un document habituel, un modèle, une autorisation ou une formation pas encore configurés : **va voir Martial**, il l'ajoute à la plateforme. Les idées et les soucis : à Martial directement (ou page « Améliorations »).`,
  },
  {
    id: 'ac-data',
    q: 'Les données sont-elles sauvegardées ?',
    keys: ['sauvegarde', 'stocke', 'stockage', 'donnees', 'perdu', 'supprimer', 'effacer'],
    a: `Tout est enregistré **en ligne** au fur et à mesure (rien sur l'ordinateur). Les PDF sont recréés à chaque téléchargement à partir des données. Les suppressions (session, stagiaire, document, purge) sont **définitives** et réservées au bureau / à l'administrateur.`,
  },
];

/** Réponses de politesse (sans recherche). */
export const SMALL_TALK: { keys: string[]; a: string }[] = [
  { keys: ['bonjour', 'salut', 'hello', 'coucou', 'bonsoir', 'yo'], a: 'Salut 👋 Pose-moi ta question : planning, Digiforma, dossier, documents à remplir…' },
  { keys: ['merci', 'super', 'parfait', 'top', 'genial', 'nickel', 'ok merci'], a: 'Avec plaisir 🙂 Autre chose ?' },
];

/** Questions proposées au premier écran, selon le rôle. */
export function matthiasSuggestions(role: string | null | undefined): string[] {
  const formateur = role === 'formateur' || role === 'referent' || role === 'consultation';
  const ids = formateur
    ? ['do-tdt', 'df-trainer', 'do-irve', 'do-depart', 'df-what']
    : ['df-qr', 'df-planning', 'df-what', 'pl-session', 'pl-event', 'pl-intra', 'pl-saturday'];
  return ids.map((id) => FAQ.find((f) => f.id === id)!.q);
}
