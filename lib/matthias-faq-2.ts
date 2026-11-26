import type { FaqEntry } from '@/lib/matthias-faq';

/**
 * Matthias, deuxième partie : réponses mises à jour (même id = remplace la
 * réponse d'origine) et nouveaux sujets (Digiforma avancé, dossier, prêts,
 * facturation, administration, questions techniques).
 */

export const FAQ_UPDATES: FaqEntry[] = [
  {
    id: 'do-hab',
    q: 'Certificats d’habilitation et attestations de réussite',
    keys: ['certificat', 'habilitation', 'symbole', 'symboles', 'b1v', 'h0b0', 'br', 'attestation reussite', 'reussite', 'certificat habilitation', 'choisir symboles'],
    a: `**Certificats d'habilitation** (dossier > « Remplir ») :
1. **Symboles de la session** : ceux de l'intitulé sont proposés ; « Modifier » pour ajuster, puis **« Appliquer à tous »**.
2. Pour chaque stagiaire : **Favorable / Défavorable** (favorable = il reçoit les symboles de la session).
3. S'il n'obtient pas tout : bouton **« Symboles »** sous son nom → coche / décoche par catégorie (non électricien, exécutant BT, chargé BT, HT, lignes) ; « Comme la session » pour revenir.
« Tous favorables » remplit tout d'un clic. Un certificat est prêt avec un avis (et au moins un symbole si favorable). Bloqué si le titre précédent manque (recyclage).
Dans les paramètres de la formation, il n'y a plus qu'une case **« Délivrer un certificat d'habilitation »**.

**Attestations de réussite** (ex. IRVE P1, P2, P3) : une par stagiaire et par module suivi, avis et **signature** du formateur.`,
  },
  {
    id: 'df-what',
    q: 'Qu’est-ce que la plateforme prend en compte depuis Digiforma ?',
    keys: ['prend en compte', 'vient digiforma', 'quoi digiforma', 'repris', 'reprend', 'importe', 'import', 'recupere', 'synchro', 'synchronisation', 'qu est ce qui vient', 'depuis digiforma', 'lien digiforma planning', 'automatique digiforma', 'synchronise quoi'],
    a: `**Repris automatiquement de Digiforma :**
- les sessions **planifiées / en cours** et leurs **modules** avec leur vrai nom (ex. « INITIAL ACC BT », « RECYCLAGE »), semaine par semaine ;
- les **jours et horaires réels** de chaque jour, **demi-journées comprises** (un recyclage d'1,5 jour = 7 h + 3 h 30) ;
- les **stagiaires** : ceux des entreprises, les **clients particuliers** et les **prospects en attente** (en « en attente ») ; confirmé sur Digiforma = validé ici ;
- **qui suit quel module** (les modules cochés en couleur sous le nom de l'apprenant) et **quels jours** (émargement Digiforma) ;
- les **entreprises** des stagiaires (ou « Particulier ») et les **places prévues sans nom** (ex. « CTI ELEC · 1 ») → places réservées par entreprise ;
- un stagiaire **déplacé, annulé ou renommé** sur Digiforma suit ici aussi (avant le début de la session) ;
- la **salle** et l'**intervenant** s'ils existent aussi sur la plateforme ;
- les **parcours** GEIQ / POEC / alternance et les **stages en entreprise**.

**Pas repris (à faire à la main) :** le **lien de l'intervenant** et la **liste des QR codes d'émargement** (demande-moi « QR code »).

La plateforme **ne modifie jamais Digiforma** : elle le lit seulement.`,
  },
  {
    id: 'df-planning',
    q: 'Comment les sessions Digiforma arrivent sur le planning ?',
    keys: ['modules a placer', 'placer module', 'placer digiforma', 'sessions digiforma planning', 'arrive planning', 'digiforma planning', 'section digiforma', 'carte digiforma', 'retirer module', 'placer la session', 'popup placer', 'assistant placer'],
    bureau: true,
    a: `Section **« Modules Digiforma à placer »**, **sous le planning** : chaque carte garde le **nom Digiforma**. Clique **« Placer »** : un assistant en 4 étapes s'ouvre.
1. **Formation** : les formations du catalogue qui ressemblent le plus au nom (Très proche / Proche / Possible), une recherche, ou **« Aucune : session personnalisée »**.
2. **Session** : nom (Digiforma par défaut, ou celui du catalogue, ou un autre), salle, formateur, parcours.
3. **Documents** : tour de table, fiches d'appréciation et périmètre, certificats d'habilitation / de réalisation, titre exigé, initial / recyclage, grilles IRVE / Maintenance, attestations P1… MA3, départ anticipé, autorisations. Ce qui est **détecté d'après les noms** est déjà coché, avec la raison.
4. **Récapitulatif** → « Placer la session ».
Les réglages s'appliquent **à cette session seulement** (le catalogue n'est pas modifié). Formateur ou salle déjà pris : le message s'affiche avant la création.`,
  },
  {
    id: 'do-papers',
    q: 'Droit à l’image, livret, vêtements TST : papiers stagiaires',
    keys: ['droit a l image', 'image', 'livret', 'reglement', 'papiers stagiaires', 'autorisation', 'autorisations', 'qr code autorisations'],
    a: `Encart **« Papiers stagiaires »** de la fiche session, à onglets :
- **Droit à l'image** et **livret / règlement** : signés **une seule fois** par QR code avec le téléphone du stagiaire (ou sur l'appareil du formateur) ; le stagiaire peut **refuser** le droit à l'image sans conséquence ;
- **Départs anticipés** ;
- **Vêtements TST et baudriers prêtés** (demande-moi « prêter des baudriers »).
Tout ce qui est signé rejoint la **fiche du stagiaire**.`,
  },
  {
    id: 'bu-docs',
    q: 'Attestations et documents générés',
    keys: ['attestation', 'attestation fin', 'fin de formation', 'generer', 'telecharger attestation', 'cachet', 'documents generes', 'pdf'],
    bureau: true,
    a: `Générés automatiquement à partir de ce qui est saisi :
- **attestations de fin de formation** (initiale / recyclage) et **appréciation des compétences** (avec la 3e page **périmètre d'habilitation** si choisi) ;
- **certificats de réalisation**, **certificats d'habilitation**, **attestations de réussite** (P1, P2, P3…) ;
- fiches d'appréciation, grilles IRVE / Maintenance, départs anticipés, autorisations, prêts de matériel, **dossier complet** en un PDF.

L'attestation d'un stagiaire est prête quand le formateur a donné son **avis** et que le **titre** est fourni (recyclage). Cachet, signature, SIRET, NDA, agrément : Administration › Paramètres généraux.`,
  },
  {
    id: 'bu-trainees',
    q: 'Inscrire des stagiaires, valider ou mettre en attente',
    keys: ['inscrire', 'ajouter stagiaire', 'valider', 'en attente', 'liste collee', 'greffe', 'ajouter un stagiaire', 'mettre en attente'],
    bureau: true,
    a: `Sur la fiche de la session (cadre **Stagiaires**) ou à l'étape « Stagiaires » de la création :
- **recherche** dans la base (Entrée = ajoute le premier), **liste collée** depuis Excel, **places réservées** pour une entreprise sans les noms ;
- **valider / mettre en attente** d'un clic ; les stagiaires en attente sont signalés sur le planning et dans « Suivi interne » ;
- choix des **modules suivis** par chaque stagiaire ; **greffe** d'une personne hors groupe d'un parcours.
Les stagiaires de Digiforma arrivent tout seuls (prospects en attente compris).
Une fois la session commencée, la liste est **figée** (le bureau peut encore la modifier le **premier jour**, l'administrateur toujours).`,
  },
  {
    id: 'pl-read',
    q: 'Comment lire une carte du planning ?',
    keys: ['carte', 'pastille', 'couleur', 'en attente planning', 'lien digiforma manquant', 'dossier complet', 'fleche', 'statut', '4/8', 'etiquette module'],
    a: `Sur chaque carte :
- **statut** : Confirmée / En attente / Brouillon (et « En cours » / « Terminée ») ;
- **2/8** = stagiaires validés (+ places réservées) / capacité ; **« ⏳ 2 en attente »** = stagiaires ou places d'entreprise à confirmer ;
- titre, puis les **modules du jour** en petites étiquettes ;
- horaire, **formateur** (une couleur par formateur) ;
- pastilles du **dossier** puis « Dossier complet » ;
- **« Lien Digiforma manquant »** : le lien de l'intervenant n'est pas renseigné ;
- **↳** = suite d'une formation sur plusieurs jours.
La colonne **« À affecter »** = sessions sans salle choisie.`,
  },
  {
    id: 'ac-data',
    q: 'Les données sont-elles sauvegardées ?',
    keys: ['sauvegarde', 'stocke', 'stockage', 'donnees', 'perdu', 'supprimer', 'effacer', 'ou sont les donnees', 'base de donnees'],
    a: `Tout est enregistré **en ligne**, au fur et à mesure (rien sur l'ordinateur) : base de données Supabase, application hébergée chez Vercel (serveurs à Francfort). Les PDF sont recréés à chaque téléchargement à partir des données.
Les suppressions (session, stagiaire, document, purge) sont **définitives** et réservées au bureau / à l'administrateur. Les exports CSV (sessions, stagiaires) permettent d'en garder une copie.`,
  },
];

export const FAQ_PLUS: FaqEntry[] = [
  // ---------------------------------------------------------------- Digiforma avancé
  {
    id: 'df-prospects',
    q: 'Les prospects en attente et les entreprises de Digiforma',
    keys: ['prospect', 'prospects', 'prospects en attente', 'entreprise en attente', 'client en attente', 'indecis', 'undecided', 'devis', 'pas encore confirme', 'places entreprise digiforma'],
    bureau: true,
    a: `Sur Digiforma, un client **prospect / indécis** :
- ses **apprenants nommés** arrivent dans la session avec le statut **« en attente »** ;
- s'il a des apprenants **prévus mais pas encore nommés** (ex. « CTI ELEC · 1 »), une **place réservée par entreprise en attente** est créée ;
- dès que le client est **confirmé** sur Digiforma, ses stagiaires passent en **validé** (sauf s'ils sont déjà pris ailleurs à ces dates) ;
- quand l'apprenant est nommé, il remplace la place réservée.
Un client **annulé / perdu** n'est pas repris.`,
  },
  {
    id: 'df-particulier',
    q: 'Les clients particuliers de Digiforma',
    keys: ['particulier', 'particuliers', 'client particulier', 'sans entreprise', 'personne seule', 'financement perso', 'cpf'],
    a: `Un **client particulier** sur Digiforma (le client est la personne elle-même) est un stagiaire comme les autres :
- il est **compté** dans la session, apparaît au **tour de table**, dans les fiches, attestations, émargement ;
- son entreprise affiche **« Particulier »** (fiche stagiaire, listes, documents) ;
- s'il passe ensuite par une entreprise (ou l'inverse), ça se met à jour à la synchro.`,
  },
  {
    id: 'df-modules-trainee',
    q: 'Initial / recyclage : chaque stagiaire n’a pas les mêmes modules',
    keys: ['initial', 'recyclage', 'modules coches', 'module coche', 'pas les memes modules', 'vient mercredi', 'juste p1', 'p1 p2 pas p3', 'quel module', 'modules par stagiaire', 'qui suit quoi'],
    a: `Sur Digiforma, sous le nom de chaque apprenant, les **modules cochés (en couleur)** disent ce qu'il suit. La plateforme les reprend :
- chaque stagiaire est rattaché à **ses** modules (ex. Théo en INITIAL toute la semaine, les recyclages seulement mercredi) ;
- les **jours de présence** viennent de l'**émargement Digiforma** : si un stagiaire n'est prévu que lundi et mardi, le module est découpé (« INITIAL · Lun. 16/11 → Mar. 17/11 ») ;
- le planning compte les présents **jour par jour**, et les fiches (attestations P1/P2/P3…) ne listent que les stagiaires du module.
Sur la fiche session, cadre **Modules** : tu peux cocher / décocher les modules d'un stagiaire (cumul possible), même après le début.`,
  },
  {
    id: 'df-moved',
    q: 'Un stagiaire est déplacé, annulé ou renommé sur Digiforma',
    keys: ['deplace', 'deplacer stagiaire', 'change de session', 'annule', 'retire digiforma', 'renomme', 'nom change', 'email change', 'modifie sur digiforma', 'desynchro', 'pas a jour'],
    a: `La plateforme suit Digiforma (synchro du planning, ou bouton **« Mettre à jour depuis Digiforma »** sur la fiche) :
- **déplacé** sur une autre session Digiforma : ajouté à la nouvelle session, **retiré de l'ancienne** ;
- **client annulé / abandon** : retiré de la session ;
- **nom, e-mail ou entreprise corrigés** : sa fiche est mise à jour, sans doublon.
Sécurités : un stagiaire **ajouté à la main** n'est jamais retiré ; rien n'est retiré **après le début** de la session (liste figée).`,
  },
  {
    id: 'df-halfday',
    q: 'Demi-journées et horaires venus de Digiforma',
    keys: ['demi journee', 'demi-journee', 'journee et demi', '1,5 jour', 'matin seulement', 'apres midi seulement', 'heures fausses', '28h', '21h', 'nombre heures', 'duree fausse'],
    a: `Les horaires de **chaque jour** viennent des créneaux Digiforma :
- un jour avec seulement le matin compte **3 h 30** (ex. recyclage d'1,5 jour = **10 h 30**) ;
- un jour **sans créneau** sur Digiforma n'est pas un jour de formation (ni heures, ni émargement) ;
- les fériés ne décalent jamais une session Digiforma.
Une durée qui te paraît fausse : clique **« Mettre à jour depuis Digiforma »** sur la fiche, puis regarde les horaires par jour.`,
  },
  {
    id: 'df-refresh',
    q: 'Mettre à jour une session depuis Digiforma tout de suite',
    keys: ['mettre a jour depuis digiforma', 'bouton digiforma', 'forcer synchro', 'relire digiforma', 'tout de suite', 'modules de digiforma', 'recharger digiforma', 'mise a jour immediate'],
    bureau: true,
    a: `Sur la fiche de la session (cadre **Stagiaires**) : **« Mettre à jour depuis Digiforma »** relit immédiatement la session Digiforma : stagiaires (particuliers et prospects compris), modules et qui suit quoi, jours, places réservées par entreprise.
Cadre **Modules** : **« Modules de Digiforma »** remplace les modules de la session par les vrais modules Digiforma.
Sinon tout se fait seul à l'ouverture du planning (quelques minutes).`,
  },
  {
    id: 'df-id',
    q: 'L’identifiant Digiforma d’une session',
    keys: ['identifiant digiforma', 'id digiforma', 'reference digiforma', 'numero digiforma', 'relier session digiforma', 'lier digiforma'],
    bureau: true,
    a: `En bas de la fiche, panneau replié **« Identifiant Digiforma »** : il relie la session à sa session Digiforma.
- Session créée depuis la liste « Modules Digiforma à placer » : il est rempli tout seul et **ne se modifie pas**.
- Session créée à la main : tu peux y coller le numéro de la session Digiforma pour que ses stagiaires, modules et places se mettent à jour.`,
  },
  {
    id: 'df-errors',
    q: 'Message d’erreur de la synchronisation Digiforma',
    keys: ['erreur digiforma', 'cle refusee', 'cle api', 'digiforma ne repond pas', 'delai depasse', 'injoignable', 'synchro erreur', 'echec synchro', 'compte rendu erreur'],
    a: `Les messages possibles :
- **« Clé API Digiforma refusée »** : la clé a changé ou expiré → l'administrateur la remplace (variable DIGIFORMA_API_TOKEN dans Vercel) ;
- **« Digiforma ne répond pas / injoignable »** : Digiforma est lent ou en panne → réessaie plus tard, rien n'est perdu ;
- **« N session(s) restante(s) »** : normal, la suite est lue à la prochaine synchro (actualise le planning).
Le compte rendu complet : Administration › Intégrations.`,
  },
  {
    id: 'df-write',
    q: 'Est-ce que la plateforme modifie Digiforma ?',
    keys: ['modifie digiforma', 'ecrit digiforma', 'envoie digiforma', 'creer sur digiforma', 'digiforma sens inverse', 'remonte digiforma'],
    a: `**Non.** La plateforme **lit** Digiforma, elle n'y écrit jamais. Une session, un stagiaire ou un module créé ici n'apparaît pas sur Digiforma : crée-le aussi là-bas si besoin. L'émargement et la satisfaction restent faits sur Digiforma.`,
  },

  // ---------------------------------------------------------------- Planning avancé
  {
    id: 'pl-conflict',
    q: 'Message « formateur déjà pris » ou « salle occupée »',
    keys: ['conflit', 'deja pris', 'deja attribue', 'salle occupee', 'chevauchement', 'formateur occupe', 'double reservation', 'impossible placer'],
    a: `La plateforme vérifie **jour par jour** qu'une salle ou un formateur n'est pas sur deux sessions en même temps :
- à la création, au déplacement, et au **placement** d'un module Digiforma (le message s'affiche avant de créer) ;
- un formateur **absent** (congé CF Congés) est aussi signalé.
Choisis un autre créneau, une autre salle ou un remplaçant (horaires par jour). En cas de doute, la session peut rester dans **« À affecter »**.`,
  },
  {
    id: 'pl-modules',
    q: 'Les modules d’une session (P1, P2, P3…)',
    keys: ['module', 'modules', 'ajouter module', 'modules session', 'cumuler', 'jour 1', 'jour 2', 'modules suivis', 'cocher module'],
    a: `Cadre **Modules** de la fiche session :
- chaque module a ses jours et sa durée ; noms repris de Digiforma (sinon un module par jour, nommé « Lun. 16/11 ») ;
- pour chaque stagiaire, **coche les modules suivis** : chaque clic ajoute ou retire un module (cumul possible) ; aucun coché = toute la session ;
- le bureau peut changer les modules suivis **même après le début**.
Les modules suivis décident des présences attendues par jour, des attestations par module et des heures sur la fiche du stagiaire.`,
  },
  {
    id: 'pl-delete',
    q: 'Supprimer ou annuler une session',
    keys: ['supprimer session', 'annuler session', 'effacer session', 'session annulee', 'enlever session', 'brouillon'],
    bureau: true,
    a: `Fiche de la session > **Informations** : passe-la en **Brouillon** pour la garder hors des comptes, ou **« Supprimer la session »** (définitif : dossier et documents saisis disparaissent). Aussi possible depuis la carte du planning.
Une session venue de Digiforma supprimée ici **n'est pas recréée** par la synchronisation.`,
  },
  {
    id: 'pl-status',
    q: 'Statuts : confirmée, en attente, brouillon',
    keys: ['confirmee', 'brouillon', 'statut session', 'planifiee', 'en cours', 'terminee', 'changer statut'],
    a: `- **Brouillon** : en préparation, pas comptée (heures, tableaux).
- **En attente / planifiée** : prévue, pas encore confirmée.
- **Confirmée** : validée.
Le jour même, la carte affiche aussi « En cours », puis « Terminée ». Le statut se change dans le panneau Informations de la fiche.`,
  },
  {
    id: 'pl-absence',
    q: 'Formateur absent ou en congé : remplaçant',
    keys: ['absent', 'malade', 'formateur absent', 'remplacer formateur', 'remplacant', 'conge formateur', 'indisponible', 'beach club'],
    a: `Les congés validés dans **CF Congés** apparaissent sur le planning (formateur « absent » sur les jours concernés).
Pour remplacer : fiche de la session > **Informations** > Formateur : choisis le remplaçant, puis dans **« Pour »** le jour concerné (**le 1er jour compris**, ex. « le lun. 23/11 uniquement ») > Enregistrer. « Toute la formation » change le formateur principal. La carte indique « Remplacé certains jours par … », et ses documents peuvent être remplis par le remplaçant.`,
  },
  {
    id: 'pl-capacity',
    q: 'Capacité dépassée, nombre de places',
    keys: ['capacite', 'places', 'trop de stagiaires', 'capacite depassee', 'nombre max', 'complet', 'max stagiaires'],
    a: `La capacité se règle dans les Informations de la session. Les **stagiaires validés + places réservées sans nom** comptent ; les « en attente » non. Si c'est dépassé, la fiche affiche **« Capacité dépassée »** avec le détail.`,
  },
  {
    id: 'pl-city',
    q: 'CF Réseaux City (la ville en 3D)',
    keys: ['ville', 'city', '3d', 'cf reseaux city', 'batiments', 'vue ville'],
    a: `**Tableau de bord > Ville** : une vue 3D facultative du centre du jour (salles, sessions en cours, formateurs). Purement visuel : le tableau de bord classique reste la référence.`,
  },

  // ---------------------------------------------------------------- Dossier avancé
  {
    id: 'do-erase',
    q: 'J’ai rempli une fiche par erreur, comment l’effacer ?',
    keys: ['effacer', 'erreur fiche', 'rempli par erreur', 'annuler avis', 'retirer avis', 'tout effacer', 'enlever', 'termine par erreur', 'reset', 'remettre a zero'],
    a: `Dans les fiches (appréciation, réussite, habilitation, grilles IRVE / Maintenance) :
- **« Effacer cette fiche »** vide le stagiaire affiché ;
- **« Tout effacer »** vide toutes les fiches de la session (confirmation demandée) ;
- un **second clic** sur un choix coché (avis, symbole, note) le retire.
Le tour de table et les PDF à remplir ont aussi **« Tout effacer »**. Le document repasse alors en « À remplir ».`,
  },
  {
    id: 'do-titre',
    q: 'Le titre d’habilitation du stagiaire (recyclage)',
    keys: ['titre habilitation', 'titre', 'photo titre', 'carte habilitation', 'deposer titre', 'titre manquant', 'attestation bloquee', 'scan titre'],
    a: `Pour un **recyclage**, le titre d'habilitation précédent est demandé (si la formation l'exige) :
- au **tour de table** : case « fourni », ou dépôt du **fichier / photo** ;
- par **QR code** : le stagiaire photographie son titre avec son téléphone ; le fichier est rangé dans un espace privé ;
- « Pas de titre » si le stagiaire n'en a pas.
Sans titre, son **attestation de fin de formation** et son certificat restent **bloqués** (indiqué « titre manquant »).`,
  },
  {
    id: 'do-perimetre',
    q: 'Le périmètre d’habilitation (3e page de l’appréciation des compétences)',
    keys: ['perimetre', 'perimetre habilitation', 'perimetre habilitable', 'schema comite', 'brt aer', 'aero sou', 'emergence', 'eme', 'aer ep', 'aer res', 'souterrain', 'terminal', 'ter', 'page 3'],
    bureau: true,
    a: `Dans la formation (catalogue) ou les paramètres de la session, avec **« Fiche d'appréciation »** cochée : liste **« Périmètre d'habilitation »** : Brt Aer / Aéro_Sou, Emergence (EME), Aérien Éclairage Public (Aer-EP), Aérien Réseau (Aer-Res), Souterrain (SOU), Terminal (TER).
Le schéma du comité s'ajoute en **3e page** de l'appréciation des compétences de chaque stagiaire (pages 1 et 2 inchangées). « Aucun périmètre » = 2 pages.`,
  },
  {
    id: 'do-certif',
    q: 'Les certificats de réalisation',
    keys: ['certificat de realisation', 'certificats de realisation', 'realisation', 'nature de l action', 'action de formation', 'bilan de competences', 'vae', 'apprentissage', 'certificat realisation', 'erreur certificat', 'erreur constatee', 'corriger certificat', 'modifier action suivie'],
    a: `Si la case **« Certificats de réalisation »** est cochée (formation ou paramètres de la session), un cadre apparaît dans le dossier :
- le **formateur choisit la nature de l'action** pour chaque stagiaire (action de formation, bilan de compétences, VAE, apprentissage) ; « Tous : action de formation » en un clic ;
- le reste est rempli seul : stagiaire, entreprise (ou Particulier), action, dates, durée ;
- **« Voir »** : le formateur (et le bureau) voit le certificat tel qu'il sera imprimé ;
- **« Erreur constatée »** (formateur) : corrige l'**action suivie**, les **dates** et la **durée** d'un stagiaire (avec la raison) ; la correction est imprimée et signalée « Corrigé par … » ; « Revenir au calcul automatique » l'annule ;
- le **bureau** télécharge les certificats (un ou tous), signés « Aurélie LANCELLE » avec le cachet.
Ils comptent dans l'avancement du dossier.`,
  },
  {
    id: 'do-competences',
    q: 'L’appréciation des compétences',
    keys: ['appreciation des competences', 'competences', 'fiche competences', 'observations formateur', 'avis du formateur'],
    bureau: true,
    a: `Document de 2 pages par stagiaire (3 avec le périmètre d'habilitation) généré depuis la **fiche d'appréciation** : objectifs et compétences de la formation, observations, avis (favorable / avec recommandations / défavorable), signature et cachet.
Dossier > « Documents de fin de formation » : **« Toutes les appréciations des compétences »** ou par stagiaire, dès que l'avis est donné.`,
  },
  {
    id: 'do-lock',
    q: 'La liste des stagiaires est figée, je ne peux plus modifier',
    keys: ['fige', 'figee', 'liste figee', 'bloque', 'modifier stagiaire', 'premier jour', 'le jour meme', 'corriger la liste', 'ne peux plus ajouter', 'verrouille'],
    a: `Dès que la session commence, la liste des stagiaires est **figée** (émargement et documents s'appuient dessus).
- Le **bureau** peut encore ajouter, retirer ou modifier des stagiaires **le premier jour** (« Modifiable aujourd'hui ») ;
- ensuite seul l'**administrateur** peut corriger avec **« Corriger la liste »** (noté dans l'historique) ;
- les **modules suivis** restent modifiables.`,
  },
  {
    id: 'do-recyclage',
    q: 'Stagiaire en initial ou en recyclage',
    keys: ['initiale', 'cursus', 'recyclage stagiaire', 'marquer recyclage', 'duree recyclage', 'objectifs recyclage'],
    a: `Si la formation existe en recyclage, chaque stagiaire est marqué **INITIALE** ou **RECYCLAGE** sur la fiche session.
Les attestations l'écrivent devant l'intitulé, prennent la **durée** et les **objectifs du recyclage** (catalogue), et le recyclage demande le **titre d'habilitation** précédent.`,
  },
  {
    id: 'do-loan',
    q: 'Prêter des baudriers ou des vêtements TST à un stagiaire',
    keys: ['baudrier', 'baudriers', 'pret', 'preter', 'pret materiel', 'materiel', 'vetement', 'vetements', 'veste', 'pantalon', 'rendre materiel', 'retour materiel', 'restitution', 'manque'],
    a: `**Depuis la fiche du stagiaire** (cadre « Vêtements TST et baudriers prêtés ») : **« Prêter du matériel »** → formation concernée, quantités (vestes, pantalons, **baudriers**), puis :
- **« Remplir sur cette tablette »** : adresse, ville, signature du stagiaire ;
- **« Faire scanner un QR Code »** : il signe sur **son téléphone**, la tablette se met à jour toute seule.

**Depuis la fiche session** (Papiers stagiaires) : « Prêter du matériel » → « Faire signer maintenant » ou « Signer plus tard ».

**Retour** : bouton « Retour » du prêt, quantités rendues + signature ; ce qui manque est signalé (fiche du stagiaire, attestation PDF).`,
  },
  {
    id: 'do-emarg',
    q: 'Où se fait l’émargement ?',
    keys: ['ou emarger', 'emargement plateforme', 'feuille de presence', 'presence', 'signer presence', 'absent stagiaire', 'qui a signe'],
    a: `L'émargement se fait sur **Digiforma** (QR codes des stagiaires + lien de l'intervenant pour le formateur). La plateforme n'a plus sa propre feuille d'émargement.
Le formateur ouvre **« Accès formateur Digiforma »** depuis le dossier, signe ses émargements et voit **qui a signé**, puis coche « C'est fait sur Digiforma ». (Demande-moi « QR code » pour la mise en place.)`,
  },
  {
    id: 'do-who-fills',
    q: 'Qui remplit quel document : formateur ou bureau ?',
    keys: ['qui remplit', 'formateur remplit', 'bureau remplit', 'a moi de remplir', 'documents formateur', 'documents bureau'],
    a: `- **Formateur** : tour de table, fiches d'appréciation, grilles IRVE / Maintenance, attestations de réussite, certificats d'habilitation (avis), nature de l'action des certificats de réalisation, documents marqués « formateur », émargement Digiforma.
- **Bureau** : documents marqués « bureau », lien Digiforma et QR codes, facturation, téléchargement des attestations et certificats.
- « Personne » : document à consulter seulement.
Le badge de chaque document dit qui le remplit.`,
  },

  // ---------------------------------------------------------------- Bureau / gestion
  {
    id: 'bu-billing',
    q: 'Facturation : pourquoi la session reste « À facturer » ?',
    keys: ['facturer', 'a facturer', 'facturation faite', 'facture', 'pret a facturer', 'reste a facturer', 'facturation', 'nom facture'],
    bureau: true,
    a: `Une session reste dans **« À facturer »** (tableau de bord) tant que **« Facturation faite »** n'est pas cochée, même si les documents sont finis :
- **« Prêt à facturer »** (vert) = documents complets, il ne reste que la facture ;
- **« Documents en cours »** = il manque encore des documents.
La facture se fait dans Digiforma, puis : fiche session > **Facturation** (ou page Facturation) > nom de la facture + entreprise > coche **« Facturation faite »**. Seuls les comptes avec l'accès Facturation voient cette case.`,
  },
  {
    id: 'bu-reservations',
    q: 'Places réservées par entreprise (sans les noms)',
    keys: ['places reservees', 'reservation', 'reserver places', '3 personnes', 'sans les noms', 'places par entreprise', 'places en attente', 'reservees en attente'],
    bureau: true,
    a: `Fiche session > Stagiaires > **« Places réservées par entreprise »** : « 3 personnes de l'entreprise X » sans connaître les noms.
- **Validées** : comptées dans la capacité ; chaque stagiaire validé de cette entreprise prend une place.
- **En attente** : hors capacité, affichées dans « en attente ».
Venues de Digiforma, elles se créent et disparaissent seules (apprenants prévus non nommés) ; celles faites à la main ne sont jamais touchées.`,
  },
  {
    id: 'bu-import',
    q: 'Importer des stagiaires (Excel, CSV, copier-coller)',
    keys: ['importer', 'import stagiaires', 'excel', 'csv', 'copier coller', 'coller noms', 'liste de noms', 'import rapide', 'fichier stagiaires'],
    bureau: true,
    a: `- **Sur une session** : « Coller une liste » : copie les colonnes Nom et Prénom dans Excel et colle-les ; les stagiaires connus sont retrouvés, les nouveaux créés.
- **Page Stagiaires > Import rapide** : depuis un fichier **Excel ou CSV**, ou **depuis Digiforma**.
Les doublons (même nom ou même e-mail) sont reconnus automatiquement, accents et ordre prénom / nom compris.`,
  },
  {
    id: 'bu-trainee-page',
    q: 'La fiche d’un stagiaire',
    keys: ['fiche stagiaire', 'historique stagiaire', 'page stagiaire', 'infos stagiaire', 'adresse stagiaire', 'heures stagiaire', 'formations suivies'],
    a: `Menu **Stagiaires** > clic sur un nom :
- formations **suivies et à venir** avec les heures (modules suivis seulement) ;
- **autorisations** signées (droit à l'image, livret), **documents signés**, **prêts de matériel** (et « Prêter du matériel ») ;
- coordonnées (entreprise ou Particulier, e-mail, adresse) modifiables par le bureau.`,
  },
  {
    id: 'bu-duplicate',
    q: 'Un stagiaire en double ou mal orthographié',
    keys: ['doublon', 'en double', 'deux fois', 'mal ecrit', 'orthographe nom', 'corriger nom', 'fusionner'],
    bureau: true,
    a: `- **Corriger un nom** : fiche du stagiaire > ses informations (si le stagiaire vient de Digiforma, corrige-le plutôt sur Digiforma : la plateforme suit).
- **Doublon** : garde la bonne fiche, mets l'autre à la **corbeille** (page Stagiaires) après l'avoir retirée de ses sessions.
La plateforme évite déjà les doublons (même e-mail, même nom sans accents, identifiant Digiforma).`,
  },
  {
    id: 'bu-suivi',
    q: 'Suivi interne et relances',
    keys: ['suivi interne', 'relance', 'relancer', 'relances', 'qui relance', 'stagiaires en attente relance', 'gestionnaire'],
    bureau: true,
    a: `Menu **Suivi interne** : les **stagiaires en attente** à relancer (qui relance, combien de fois, quand) et les **sessions à venir**, par personne de l'équipe (toi par défaut). Sous chaque session : « Créée par … · Gestionnaire : … ».`,
  },
  {
    id: 'bu-equipe',
    q: 'Équipes & suivi (référent cadre)',
    keys: ['equipe', 'mon equipe', 'equipes et suivi', 'referent cadre', 'heures du mois', 'formateurs suivis'],
    a: `Menu **Équipes & suivi** (bureau) ou **Mon équipe** (référent cadre) : les formateurs suivis, leurs **heures du mois** (hors brouillons), leurs **sessions à venir** et celles **en attente de confirmation**.`,
  },
  {
    id: 'bu-poec',
    q: 'Créer un parcours POEC et les conventions France Travail',
    keys: ['creer parcours', 'poec convention', 'convention', 'france travail', 'conventions de stage', 'signature groupee', 'parcours personnalise', 'stage poec'],
    bureau: true,
    a: `**Tableau de bord > Parcours POEC et personnalisés** : crée le parcours (dates, stagiaires du groupe, formations, périodes de stage).
- Les sessions du parcours portent son badge sur le planning ; les stages apparaissent en évènements.
- **Conventions de stage** : à faire signer ; l'**espace France Travail** (lien unique, sans compte) montre programme, stagiaires, conventions et permet la **signature groupée**.`,
  },
  {
    id: 'bu-intra-trainees',
    q: 'INTRA : ajouter des stagiaires d’une autre entreprise',
    keys: ['intra autre entreprise', 'chercher dans toute la base', 'stagiaires autre entreprise', 'intra stagiaires', 'seulement ses stagiaires'],
    bureau: true,
    a: `Sur une formation INTRA, la recherche ne propose d'abord que les stagiaires de l'entreprise. Clique **« Chercher dans toute la base »** (cadre Stagiaires) pour ajouter n'importe qui ; « Seulement [entreprise] » pour revenir.`,
  },
  {
    id: 'bu-params',
    q: 'Cachet, signature, SIRET, NDA, agrément (paramètres)',
    keys: ['cachet', 'signature organisme', 'siret', 'nda', 'agrement', 'numero declaration', 'parametres generaux', 'signataire', 'directeur'],
    bureau: true,
    a: `**Administration > Paramètres généraux** (administrateur) : image du **cachet et signature**, **SIRET**, **N° de déclaration d'activité (NDA)**, **agrément CTST**, signataire et ville. Ils sont repris sur toutes les attestations et tous les certificats. Sans cachet, les documents l'indiquent (« Cachet et signature non ajoutés »).`,
  },
  {
    id: 'bu-users',
    q: 'Créer un compte, changer un rôle, donner l’accès facturation',
    keys: ['creer compte', 'nouveau compte', 'ajouter utilisateur', 'changer role', 'acces facturation', 'utilisateurs', 'desactiver compte', 'nouvel employe'],
    a: `**Administration > Utilisateurs** (administrateur) :
- valider une **demande d'accès** ou **créer un accès** (mot de passe provisoire affiché une seule fois) ;
- choisir le **rôle** (administrateur, bureau, référent, formateur, consultation) et le formateur lié ;
- cocher **Facturation** (page Facturation et case « Facturation faite ») et **Dev** (page Améliorations).`,
  },
  {
    id: 'bu-salaries',
    q: 'Documents des salariés (droit à l’image, matériel)',
    keys: ['salaries', 'salarie', 'employe', 'documents salaries', 'materiel salarie', 'image salarie', 'remise materiel'],
    a: `Menu **Salariés** (administrateur) : pour chaque salarié de CF Réseaux, **droit à l'image** et **remise de matériel**, signés en ligne par un lien / QR code, avec le **retour** du matériel signé. Administration > **Documents à signer** regroupe tous les documents signés (stagiaires et salariés).`,
  },
  {
    id: 'bu-export',
    q: 'Exporter les sessions ou les stagiaires (Excel / CSV)',
    keys: ['exporter', 'export', 'csv sessions', 'csv stagiaires', 'tableur', 'excel sessions', 'liste excel', 'telecharger liste'],
    a: `- Page **Sessions** : bouton **« Export CSV »**.
- **Administration > Intégrations** : « Exporter les sessions (CSV) » et « Exporter les stagiaires (CSV) ».
Le fichier s'ouvre dans Excel.`,
  },
  {
    id: 'bu-dashboard',
    q: 'Que montre le tableau de bord ?',
    keys: ['tableau de bord', 'accueil', 'dashboard', 'page d accueil', 'cartes tableau', 'a facturer tableau'],
    a: `Selon ton rôle :
- **formateur** : sa formation du jour, ses prochaines sessions, ses documents à remplir ;
- **bureau** : **À préparer** (J-3, J-5…), liens Digiforma manquants, dossiers incomplets, **À facturer** (« Prêt à facturer » en tête), parcours POEC ;
- **administrateur** : en plus, demandes d'accès et état des synchronisations.
Un clic sur une ligne ouvre la session au bon endroit.`,
  },
  {
    id: 'bu-ameliorations',
    q: 'La page Améliorations',
    keys: ['ameliorations', 'page ameliorations', 'suggestion', 'remarque', 'signaler', 'retour utilisateur'],
    a: `Menu **Améliorations** (administrateur et accès Dev) : les remarques et idées d'amélioration de la plateforme, avec leur suivi. Pour un souci urgent : préviens **Martial** directement.`,
  },
  {
    id: 'bu-lieu',
    q: 'La formation a lieu ailleurs (open space, autre site)',
    keys: ['lieu de dispense', 'lieu de formation', 'ou a lieu', 'open space', 'a lieu dans', 'adresse formation', 'autre lieu', 'ailleurs', 'autre site', 'adresse documents', 'lieu documents'],
    bureau: true,
    a: `Le **lieu de dispense** imprimé sur les documents est celui de la salle (centre CF Réseaux) ou de l'entreprise pour une **INTRA** (adresse de la colonne INTRA).
Pour un autre endroit (open space, autre site du client) : crée la formation en **INTRA** avec l'adresse réelle comme lieu. Un champ « lieu de dispense » modifiable sur chaque session est en préparation : demande à Martial.`,
  },

  {
    id: 'ad-rooms',
    q: 'Ajouter ou modifier une salle, un formateur',
    keys: ['ajouter une salle', 'modifier une salle', 'nouvelle salle', 'page salles', 'capacite salle', 'equipement salle', 'atelier', 'ajouter un formateur', 'fiche formateur', 'couleur formateur', 'specialites'],
    a: `Menu **Catalogue > Salles** et **Catalogue > Formateurs** (administrateur) :
- **salle** : nom, capacité, bâtiment / adresse, équipements, ateliers, formations qu'on y fait, disponibilité (« indisponible » = pas proposée) ;
- **formateur** : coordonnées, couleur sur le planning, spécialités, statut ; les **formations qu'il peut animer** se règlent dans le catalogue (formateurs habilités) ;
- pour qu'un formateur se connecte : **Administration > Utilisateurs** (compte lié au formateur).
Le nom de la salle / du formateur doit correspondre à Digiforma pour être repris automatiquement.`,
  },

  {
    id: 'avis-clients',
    q: 'Les avis clients : QR codes Google et Plus que pro',
    keys: ['avis', 'avis clients', 'avis google', 'plus que pro', 'plusquepro', 'votre avis compte', 'qr code avis', 'laisser un avis', 'notation', 'etoiles', 'presentation avis', 'avis a chaud', 'avis a froid'],
    a: `Dans le dossier de **chaque session**, au-dessus du tour de table : **« Avis clients · Votre avis compte ! »**.
- **« Présenter aux stagiaires »** : présentation animée en plein écran à montrer **au début de la session** (flèches du clavier, balayage sur tablette) : pourquoi c'est important, comment faire, les derniers avis Plus que pro et Google, puis les deux QR codes.
- **Plus que pro = le plus important** : le stagiaire scanne le QR code et **remplit le petit formulaire tout de suite** ; **2 semaines après**, il reçoit **un e-mail de Plus que pro** pour donner son avis **certifié** sur la formation et son contenu (à froid).
- **Google = en plus** : avis plus général sur CF Réseaux, à la fin de la formation (à chaud).
- Boutons **Google / Plus que pro** : les affiches QR à imprimer ou afficher ; **Attestation** : le PDF Plus que pro.
Les avis Plus que pro sont repris de cf-reseaux.fr quand c'est possible ; les avis Google se mettent à jour dans **Administration › Paramètres › Avis clients** (bouton « Voir la présentation » pour vérifier).`,
  },

  // ---------------------------------------------------------------- Technique
  {
    id: 'te-rgpd',
    q: 'RGPD : les données des stagiaires sont-elles protégées ?',
    keys: ['rgpd', 'protection des donnees', 'donnees personnelles', 'confidentialite', 'cnil', 'loi', 'legal', 'droit des donnees', 'document rgpd'],
    a: `Oui. Chaque page ouverte par QR code a un lien **« Protection de vos données et droit à l'image »** (page /confidentialite, PDF aux couleurs de CF Réseaux) qui explique : données recueillies, pourquoi, qui y a accès, durées de conservation, sécurité et droits (accès, rectification, effacement, retrait du consentement, CNIL).
Contact pour les demandes : **contact@cf-reseaux.fr**.`,
  },
  {
    id: 'te-security',
    q: 'La plateforme est-elle sécurisée ?',
    keys: ['securite', 'securise', 'pirate', 'hack', 'piratage', 'mot de passe securite', 'chiffre', 'https', 'acces non autorise', 'fuite'],
    a: `Oui :
- connexion **chiffrée (HTTPS)** imposée, en-têtes de sécurité, pages internes jamais indexées par Google ;
- **compte personnel** pour chaque collaborateur ; droits vérifiés **dans la base de données elle-même** (un formateur ne voit que ce que son rôle permet) ;
- QR codes = **liens secrets aléatoires**, renouvelables, limités à une session ou un prêt ;
- fichiers sensibles (titres) dans un **espace privé** avec liens temporaires ;
- clé Digiforma stockée seulement sur le serveur, jamais dans le navigateur ; dépendances sans faille connue.`,
  },
  {
    id: 'te-hosting',
    q: 'Où est hébergée la plateforme ? Comment elle marche techniquement ?',
    keys: ['heberge', 'hebergement', 'serveur', 'vercel', 'supabase', 'technique', 'technologie', 'nextjs', 'next js', 'code', 'comment c est fait', 'architecture', 'github'],
    a: `- **Application** : Next.js (React), hébergée chez **Vercel** (serveurs à Francfort), mise à jour automatiquement à chaque modification du code (GitHub).
- **Données et fichiers** : **Supabase** (base PostgreSQL avec règles d'accès par rôle, stockage de fichiers).
- **Digiforma** : lu par son API (GraphQL) avec une clé côté serveur, en lecture seule.
- **PDF** : générés dans le navigateur à partir des modèles CF Réseaux.
- **Matthias** : base de réponses dans le navigateur, sans IA payante ni service extérieur.`,
  },
  {
    id: 'te-migration',
    q: 'Message « Exécute d’abord la migration … dans Supabase »',
    keys: ['migration', 'executer migration', 'supabase sql', 'sql editor', 'migration phase', 'schema cache', 'colonne manquante'],
    a: `Une nouvelle fonction a besoin d'un ajout dans la base de données. L'administrateur :
1. ouvre **Supabase > SQL Editor > New query** ;
2. colle le contenu du fichier indiqué (ex. supabase/migration_phase74.sql) ;
3. **Run**.
Une migration peut être relancée sans risque. Ensuite, recharge la page.`,
  },
  {
    id: 'te-refresh',
    q: 'La page n’est pas à jour ou affiche une erreur',
    keys: ['pas a jour', 'page blanche', 'erreur page', 'bug', 'plante', 'ne charge pas', 'ne marche pas', 'ca marche pas', 'recharger', 'vider cache', 'ctrl f5', 'bloque', 'ecran blanc'],
    a: `Dans l'ordre :
1. **Recharge la page** (F5, ou tirer vers le bas sur téléphone) ;
2. rechargement complet : **Ctrl + F5** (Cmd + Maj + R sur Mac) ;
3. vérifie ta connexion internet ;
4. déconnecte-toi / reconnecte-toi.
Si ça persiste : fais une **capture d'écran** avec le message et envoie-la à **Martial**.`,
  },
  {
    id: 'te-browser',
    q: 'Quel navigateur utiliser ? Installer l’application',
    keys: ['navigateur', 'chrome', 'safari', 'edge', 'firefox', 'installer application', 'application telephone', 'ecran d accueil', 'raccourci', 'appli'],
    a: `Tous les navigateurs récents marchent : **Chrome, Edge, Safari, Firefox**.
Pour l'avoir comme une application : sur téléphone, menu du navigateur > **« Ajouter à l'écran d'accueil »** ; sur ordinateur (Chrome / Edge), icône **« Installer »** dans la barre d'adresse.`,
  },
  {
    id: 'te-slow',
    q: 'La plateforme est lente',
    keys: ['lent', 'lente', 'lenteur', 'rame', 'long a charger', 'chargement long', 'temps de chargement'],
    a: `Le planning et les fiches se chargent en général en une ou deux secondes. Plus lent :
- **connexion internet** faible (wifi de salle, 4G) ;
- la **synchro Digiforma** tourne en arrière-plan à l'ouverture du planning (elle ne bloque pas la page) ;
- les gros **PDF** (dossier complet) prennent quelques secondes à se générer.
Si une page reste bloquée : recharge-la, puis préviens Martial si ça continue.`,
  },
  {
    id: 'te-pdf',
    q: 'Le PDF ne se télécharge pas ou ne s’ouvre pas',
    keys: ['pdf ne marche pas', 'telechargement', 'ne s ouvre pas', 'pdf bloque', 'imprimer', 'impression', 'pdf vide', 'fichier pdf'],
    a: `- Attends quelques secondes : le PDF est **créé sur ton appareil** (un dossier complet est plus long).
- Le navigateur peut bloquer le téléchargement : autorise-le (icône en haut à droite).
- Sur iPhone, le PDF s'ouvre dans un aperçu : bouton **Partager** pour l'enregistrer, l'envoyer ou l'**imprimer**.
- Pour imprimer : ouvre le PDF puis Ctrl + P.`,
  },
  {
    id: 'te-qr',
    q: 'Le QR code ne marche pas sur le téléphone du stagiaire',
    keys: ['qr code ne marche pas', 'scanner', 'scan', 'appareil photo', 'qr invalide', 'plus valable', 'qr code expire', 'renouveler qr'],
    a: `- Scanne avec l'**appareil photo** du téléphone (ou Google Lens), écran du formateur en grand, sans reflet.
- « Ce QR code n'est plus valable » : il a été **renouvelé** → réaffiche le QR code actuel.
- Pas de réseau sur le téléphone : le stagiaire signe sur l'appareil du formateur.
- Un lien s'affiche aussi sous le QR code : on peut le taper ou l'envoyer.`,
  },
  {
    id: 'te-signature',
    q: 'La signature ne s’enregistre pas',
    keys: ['signature ne marche pas', 'signer impossible', 'cadre signature', 'bouton grise', 'valider grise', 'lu et approuve'],
    a: `Le bouton reste grisé tant que tout n'est pas rempli : **signature dans le cadre**, **adresse** et **ville** si demandées, case **« Lu et approuvé »** cochée. Signe avec le doigt ou la souris d'un trait continu. Si une erreur s'affiche, recharge la page et recommence.`,
  },
  {
    id: 'te-offline',
    q: 'Sans internet, est-ce que ça marche ?',
    keys: ['sans internet', 'hors ligne', 'pas de reseau', 'connexion coupee', 'wifi', 'offline'],
    a: `Non : tout est enregistré en ligne. Sans réseau, ce qui est saisi ne peut pas être enregistré. Utilise le partage de connexion d'un téléphone ; dès que la connexion revient, recharge la page. Les fiches s'enregistrent au fur et à mesure, donc rien de ce qui était déjà enregistré n'est perdu.`,
  },
  {
    id: 'te-auto',
    q: 'Les tâches automatiques de la plateforme',
    keys: ['automatique', 'tous les jours', 'chaque nuit', 'cron', 'tache automatique', 'tout seul', 'synchro nuit'],
    a: `Sans rien faire :
- **Digiforma** relu à chaque ouverture du planning (au plus toutes les 2 min) et **chaque nuit** ;
- **CF Congés** (congés, fériés) synchronisé **chaque nuit** ;
- dossiers, avancement et « Dossier complet » recalculés à chaque modification ;
- les fiches s'enregistrent pendant la saisie.`,
  },
  {
    id: 'te-api',
    q: 'La clé API Digiforma : où la mettre, comment la changer ?',
    keys: ['cle digiforma', 'api digiforma', 'token digiforma', 'digiforma_api_token', 'changer cle', 'nouvelle cle', 'cle api'],
    a: `La clé se crée dans **Digiforma (Paramètres > API)**. Elle est rangée **uniquement** dans **Vercel** (projet cf-formations > Settings > Environment Variables > **DIGIFORMA_API_TOKEN**), jamais dans le code ni sur une page. Après un changement : redéployer le projet. Ne l'envoie jamais par mail ou message.`,
  },
  {
    id: 'te-matthias',
    q: 'Qui est Matthias ? Il est payant ?',
    keys: ['matthias', 'qui es tu', 'robot', 'bot', 'ia', 'intelligence artificielle', 'chatgpt', 'gratuit', 'payant', 'tu sers a quoi'],
    a: `Je suis **Matthias**, le robot d'aide de la plateforme 🤖 Je réponds à partir d'une base de questions / réponses **dans ton navigateur** : **gratuit**, sans IA payante, et rien de ce que tu écris ne part ailleurs. L'orthographe on s'en fiche. Une réponse manque ? Dis-le à Martial, il me l'apprend.`,
  },
];

/** Mots-clés ajoutés / retirés aux réponses (trop larges, ou formulations fréquentes). */
export const KEY_PATCH: Record<string, { add?: string[]; remove?: string[] }> = {
  'bu-users': { add: ['creer un compte', 'compte pour un formateur', 'compte formateur', 'compte pour un nouveau formateur'] },
  'te-offline': { add: ['pas de wifi', 'wifi salle', 'pas de connexion'] },
  'bu-equipe': { add: ['combien de stagiaires', 'statistiques', 'chiffres', 'stats'] },
  'pl-holiday': { add: ['fermeture', 'jours de fermeture', 'centre ferme'] },
  'ac-password': { add: ['compte bloque', 'changer mon email', 'changer email', 'photo de profil', 'se connecter', 'arrive pas a me connecter', 'identifiant'] },
  'te-api': { add: ['variable d environnement', 'environment variables', 'variable'] },
  'te-hosting': { add: ['graphql', 'deployer', 'deploiement', 'mise en ligne', 'mise a jour du site', 'postgres', 'postgresql', 'api', 'react'] },
  'te-security': { add: ['google', 'moteur de recherche', 'indexe', 'trouver le site'] },
  'te-rgpd': { add: ['consentement', 'retirer consentement', 'combien de temps on garde', 'conservation', 'qui a acces aux signatures', 'duree de conservation'] },
  'do-emarg': { add: ['emarger', 'emargent', 'faire emarger', 'emargement stagiaires'] },
  'do-erase': { add: ['mauvais avis', 'coche le mauvais', 'mauvais choix', 'je me suis trompe', 'marque termine', 'termine alors que', 'affiche termine'] },
  'te-auto': { add: ['synchro de nuit', 'nuit', 'la nuit'] },
  'df-id': { add: ['relier une session', 'relier a digiforma', 'numero de session digiforma', 'numero session', 'numero digiforma'] },
  'pl-status': { add: ['changer le statut', 'mettre confirmee', 'passer en confirmee'] },
  'bu-export': { add: ['telecharger la liste', 'liste des sessions telecharger'] },
  'bu-settings': { add: ['sans toucher le catalogue', 'reglages session', 'reglage une session'] },
  'do-titre': { add: ['carte d habilitation', 'carte habilitation photo'] },
  'pl-capacity': { add: ['trop de monde', 'capacite session'] },
  'pl-absence': { add: ['remplace le formateur', 'quelqu un remplace', 'remplace'] },
  'pl-conflict': { add: ['pas dispo', 'formateur pas dispo', 'impossible de placer', 'formateur dispo'] },
  'df-several': { add: ['deux intervenants', 'deux formateur digiforma'] },
  'df-halfday': { add: ['au lieu de', 'heures au lieu', 'au lieu de heures', 'mauvais nombre d heures'] },
  'df-modules-trainee': { add: ['vient que', 'ne vient que', 'que deux jours', 'certains jours'] },
  'df-particulier': { add: ['paye lui meme', 'finance lui meme', 'lui meme'] },
  'df-trainer': { add: ['apres l emargement', 'je coche quoi', 'coche quoi'] },
  'df-room': { add: ['formateur de digiforma', 'pas mis', 'formateur digiforma pas mis'] },
  'df-what': { add: ['repris de digiforma', 'digiforma repris quoi'] },
  'df-qr': { remove: ['qr', 'signature', 'signer', 'faire signer', 'signer stagiaires', 'acces', 'emargement', 'emarger'], add: ['qr code emargement', 'qr codes stagiaires', 'mettre en place emargement'] },
  'df-when': { add: ['apparait quand', 'il apparait quand', 'combien de temps synchro', 'a quelle heure', 'quand synchro', 'frequence synchro', 'tous les combien'] },
  'df-missing': { add: ['manque session digiforma', 'session digiforma absente', 'pas dans a placer', 'manque dans a placer'] },
  'df-prospects': { add: ['apprenant sans nom', 'sans nom', 'apprenant prevu', 'cti elec'] },
  'df-moved': { remove: ['deplacer stagiaire'], add: ['abandon', 'stagiaire abandon', 'corrige sur digiforma', 'corrige le nom sur digiforma', 'stagiaire change de session', 'annule sur digiforma'] },
  'df-refresh': { add: ['relire', 'relire la session', 'forcer la mise a jour', 'forcer'] },
  'df-planning': { add: ['modules arrivent', 'arrivent ou', 'modules digi', 'session digiforma sur le planning', 'poser une session digiforma', 'mettre session digiforma'] },
  'te-qr': { add: ['qr code plus valable', 'plus valable', 'qr ne marche pas'] },
  'df-errors': { add: ['sessions restantes', 'relance la synchronisation', 'restantes'] },
  'df-write': { add: ['cree ici', 'va sur digiforma', 'session ici digiforma', 'apparait sur digiforma'] },
  'bu-sessions': { remove: ['sessions', 'facturation', 'relance', 'suivi interne'], add: ['onglets', 'en cours a venir terminees', 'a venir terminees', 'page sessions', 'menu sessions', 'onglets sessions', 'sessions terminees'] },
  'ac-data': { remove: ['supprimer', 'effacer'] },
  'ac-missing': { remove: ['manque', 'il manque', 'bug', 'probleme', 'pas trouve'], add: ['il manque un document', 'il manque une fonction', 'ajouter un document type', 'nouvelle fonction'] },
  'pl-delete': { add: ['supprimer session', 'session du planning supprimer', 'enlever du planning', 'annuler formation', 'supprimer formation'] },
  'pl-move': { add: ['autre salle', 'dans une autre salle', 'changer de salle', 'changer le formateur', 'autre date', 'deplacer formation'] },
  'pl-session': { add: ['pause dejeuner', 'pause', '7h par jour', 'heures par jour', 'duree journee', 'creer une session', 'creer session', 'faire une session'] },
  'do-write': { add: ['exemple', 'exemple appreciation', 'exemples'] },
  'do-papers': { add: ['signer le livret', 'faire signer livret', 'faire signer le livret'] },
  'do-adddoc': { add: ['document a consulter', 'ajouter un pdf', 'ajouter pdf', 'mettre un pdf'] },
  'do-recyclage': { add: ['recyclage ou initial', 'initial ou recyclage'] },
  'do-loan': { add: ['pantalon au retour', 'manque au retour', 'signer le pret', 'pret qr code', 'pret avec un qr code'] },
  'bu-trainee-page': { add: ['formations d un stagiaire', 'formations stagiaire', 'voir un stagiaire'] },
  'bu-poec': { add: ['creer un parcours', 'nouveau parcours'] },
  'te-refresh': { add: ['down', 'site down', 'hors service', 'ne fonctionne plus', 'plante', 'bug', 'ca bug', 'probleme', 'erreur'] },
  'te-pdf': { add: ['imprimer'] },
  'te-signature': { add: ['signature ne s enregistre pas', 'signature marche pas'] },
};
