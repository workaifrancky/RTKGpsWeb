# Journal des modifications — Mower Survey

Historique des évolutions notables de l'application. Format inspiré de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ; dates au format ISO
(`AAAA-MM-JJ`), entrées les plus récentes en premier.

> *Note : les entrées antérieures au 2026-11-05 mentionnent "RTK Mower", qui est l'ancien nom de "Mower Survey" (renommé le 2026-11-05).*

## [2026-11-06] — Titre du header corrigé sur téléphone (replis CSS + cache-busting)

### Corrigé

- **Titre « MOWER SURVEY » petit, sans ombre et mal placé sur téléphone** : aucune media query ni règle concurrente ne ciblait `.header-title` / `.logo-text` (vérifié dans les trois feuilles, aucun JS ni style inline). Deux causes possibles côté appareil : un `design-tokens.css` **en cache** (token `--text-shadow-header` absent → `text-shadow: var(--…)` invalide → ombre supprimée) et un navigateur sans `clamp()` / `min()` (→ `font-size` et `left`/`right` invalides, taille héritée et position statique).
- `css/main.css` : **replis en cascade** — `font-size: 22px` puis `clamp(14px, 4.5vw, 24px)` ; `left`/`right` en pixels puis en `min()` ; `text-shadow` littéral puis `var(--text-shadow-header, 0 2px 4px rgba(0,0,0,0.3))`.
- Sur mobile (≤ 480 px) le titre passe à `clamp(16px, 4.9vw, 22px)` (19,1 px à 390 px au lieu de 17,55 px) ; sous 360 px, `right: 56px` + `min(16px, 4.6vw)` pour ne jamais passer sous la roue dentée.
- `index.html` : les cinq CSS locales sont appelées avec `?v=3.96` (cache-busting ; `serve-http.cjs` ignore la query, GitHub Pages la traite comme une nouvelle URL).

### Notes

- Mesures Chrome/CDP (mobile émulé) : 1280 px → 24 px ; 480 px → 22 px ; 390 px → 19,11 px (texte 151→327, roue 334 : aucun chevauchement) ; 360 px → 16 px ; 320 px → 14,72 px ; ombre `rgba(0,0,0,0.3) 0px 2px 4px` présente partout, **y compris après désactivation de `design-tokens.css`** (token absent).
- Accolades CSS 225/225 · 410/410 · 141/141 · 58/58 · 1/1 ; aucun JS modifié (`node --check` OK) ; captures comparatives : 19 px = titre ombré et centré, 22 px = le « Y » passe sous la roue dentée.
- Aucun autre élément du header touché (logo, pastille FIX, roue dentée). Aucun commit ni push effectué.

## [2026-11-06] — Panneau Paramètres en cartes et titre du header retravaillé

### Modifié

- **Panneau Paramètres (roue dentée)** : les blocs sont regroupés en **trois cartes** `.menu-card` — **Connexion** (NTRIP + compte cloud), **Affichage** (numéros des points, mode Gants/Soleil), **Données** (format d'export, file hors-ligne) — avec titre `.menu-card-title` en capitales, filet, fond `--color-bg-subtle` et 10 px d'espacement entre les cartes.
- **Ligne « Synchronisation »** : `#btnCloudAuth` devient un lien discret (souligné, sans fond ni bordure, 11 px / 800) avec l'icône Lucide `log-out` (`ICON_LOG_OUT`) quand un compte est actif ; l'adresse du compte s'affiche en 11 px / 600 `--text3` sous le lien, jamais tronquée.
- **Interrupteurs** : piste agrandie à **48 × 28 px** (pastille 22 px, course 20 px ; 56 × 32 / 26 px / 24 px en mode Gants), ligne pleine largeur de 48 px avec icône Lucide (`hash` pour « Numéros des points », `sun` pour « Mode Gants/Soleil »).
- **Titre « MOWER SURVEY »** : `clamp(14px, 4.5vw, 24px)` (au lieu de 12–20 px), `top: 24px` (au lieu de 20 px), `left: min(150px, 38vw)` (au lieu de 180 px), `right: min(60px, 16vw)`, `text-align: center` et `text-shadow` via le nouveau token `--text-shadow-header` (`css/design-tokens.css`).

### Notes

- Vérifications : `node --check js/app.js js/cloud-sync.js` OK ; accolades CSS 222/222 · 410/410 · 141/141 · 58/58 · 1/1 ; `div` 173/173 et `section` 4/4 ; mesures Chrome/CDP en 390 × 844 (3 cartes de 178 / 154 / 92 px, pistes 48 × 28, lien 107 × 44 px souligné, e-mail 11 px non tronqué, titre 17,55 px centré sans chevauchement de la roue dentée) et 2 captures (mode normal, mode Gants).
- Aucun autre écran modifié (carte, FAB, menu de partage, contrat GeoJSON). Aucun commit ni push effectué.

## [2026-11-06] — Modale de compte au premier plan et e-mail sur son propre bloc

### Corrigé

- **Modale derrière le panneau Connexion** : `#authModal` passe à **`z-index: 5000`** (au-dessus du panneau `#headerMenu` à 4000 et de son voile à 3999), et `openAuthModal()` ferme le panneau via `closeConnectionPanelForAuth()` (`closeHeaderMenu()` + retrait direct de `.show` / `aria-hidden` / `aria-expanded`) avec une trace console `[auth] openAuthModal — closeHeaderMenu() appelé, panneau fermé : true`. La modale reste donc au premier plan même si la roue dentée est rouverte.
- **E-mail réduit à « wor… »** : l'adresse est déplacée dans un bloc dédié `div.cloud-account` (`display: block`, `width: 100%`, `margin-top: 4px`) et la classe du texte devient `.cloud-account-email` (`white-space: normal`, `overflow-wrap: anywhere`, `text-overflow: clip`). L'ancienne règle `.cloud-sync-email` (ellipse) est supprimée ; le nom de classe change, donc un ancien CSS en cache ne peut plus tronquer l'adresse.

### Notes

- Vérifications : `node --check js/cloud-sync.js` OK ; accolades CSS 212/212 · 410/410 · 141/141 · 58/58 · 1/1 ; `div` 172/172 ; mesures Chrome/CDP en 390 × 844 (`zIndexModale` 5000 > `zIndexPanneau` 4000, panneau fermé après le clic, modale devant le panneau rouvert, e-mail `clientWidth = scrollWidth = 314`, `tronque: false`) et captures de contrôle.
- Reste de l'application inchangé (header, carte, menu de partage, contrat GeoJSON). Aucun commit ni push effectué.

## [2026-11-06] — Panneau Connexion : modale accessible, œil dans le champ, e-mail entier

### Corrigé

- **« Se connecter » sans effet apparent** : le clic ouvrait bien `#authModal`, mais le panneau Connexion (`#headerMenu`, `z-index: 4000`) restait par-dessus les modales (`z-index: 1100`) — la modale s'affichait derrière lui et ses champs étaient incliquables. `openAuthModal()` ferme désormais le panneau (`closeHeaderMenu()`) avant d'afficher la modale.
- **Bouton « œil » sous le champ / sans effet** : les règles CSS `password-*` sont portées par `.cloud-auth-form` (spécificité 0,2,0) pour qu'aucune règle de bouton générique ne puisse le ramener dans le flux ; `togglePasswordVisibility()` trace chaque clic dans la console (`[auth] affichage du mot de passe : clair|masqué`) et bascule bien `type` `password` ↔ `text` avec l'icône `eye` / `eye-off`.
- **E-mail tronqué à côté de « Synchronisation »** : `.cloud-sync-email` passe en ligne dédiée (`flex: 1 1 100%`, `white-space: normal`, `overflow-wrap: anywhere`, plus d'ellipse) et `#cloudSyncRow` en `flex-wrap: wrap` ; l'élément est déplacé **après** le bouton dans le DOM. Mesure CDP : largeur utile 8 px → 314 px, `tronque` true → false.

### Notes

- Vérifications : `node --check js/cloud-sync.js` OK ; accolades CSS 210/210 · 410/410 · 141/141 · 1/1 · 58/58 ; `div` 171/171 ; mesures et captures Chrome/CDP en viewport 390 × 844 (panneau fermé après le clic, champ e-mail cliquable, œil dans le champ, e-mail sur deux lignes).
- Contrat GeoJSON, carte, header et menu de partage inchangés. Aucun commit ni push effectué.

## [2026-11-06] — Hub de partage simplifié et modale de connexion améliorée

### Modifié

- **Hub de transfert ramené à trois options** (`index.html`, `js/export.js`), dans cet ordre : « Télécharger le fichier » (icône Lucide `download`), « QR Code animé » (icône `scan-line`) et « QR Code statique » (renommée depuis « Recevoir sur cet appareil », icône `qr-code` ; le panneau de destination s'appelle désormais « QR Code statique »).
- **Modale « Compte cloud »** (`index.html`, `js/cloud-sync.js`, `css/main.css`) : le champ mot de passe est enveloppé dans `.password-wrapper` avec le bouton `.password-toggle` en absolu à droite (44 × 44 px, icône Lucide `eye` / `eye-off`, `aria-label` « Afficher / Masquer le mot de passe », `aria-pressed`). Le mot de passe repart masqué à chaque ouverture et fermeture.
- La dernière adresse utilisée est mémorisée après une connexion réussie dans `localStorage` (`mowerSurveyLastEmail`) et pré-remplie à l'ouverture (sans écraser une saisie en cours). **Le mot de passe n'est jamais stocké.**

### Supprimé

- Options « Partage rapide » et « Enregistrer sur Drive / Cloud », fonctions `transferViaNativeShare()`, `transferViaCloud()`, `shareGeoJSON()`, `canShareTransferFiles()`, `syncTransferCapabilities()`, note `#transferUnsupportedNote`, styles `.transfer-note-warn` et `.transfer-option.cloud`.
- `shareProjectsZip()` / `shareProjectGeoJSON()` sont conservés : la file d'attente hors-ligne s'en sert pour rejouer un partage. Contrat GeoJSON inchangé.

### Notes

- Vérifications : `node --check js/app.js js/cloud-sync.js js/export.js` OK ; banc Node 44/44 (ordre des options, libellés supprimés absents, e-mail normalisé/pré-rempli, bascule `password` ↔ `text`, `aria-label` + icône, une seule clé `localStorage`) ; accolades CSS équilibrées (209/410/141/1/58) ; `div` équilibrés (171/171).
- Aucun commit ni push effectué.

## [2026-11-05] — Journal de synchronisation visible et protection de la zone en cours de tracé

### Corrigé

- **Aucun log `[sync]` visible** : `syncLog()` utilisait `console.debug`, masqué par défaut dans la console Chrome (niveau « Verbose » inactif). Le flag `window.__MOWER_SYNC_DEBUG = true` fonctionnait, mais les messages étaient filtrés.
- `syncLog()` utilise désormais `console.log` (visible au niveau « Info ») ; `initCloudSync()` affiche une aide `console.info` (« journal désactivé — tapez window.__MOWER_SYNC_DEBUG = true ») quand le journal est coupé.
- **Clignotement résiduel** : ajout de `isProjectBeingEdited(project)`. Un snapshot distant ne peut plus remplacer la parcelle **en cours de tracé** (`APP.tracesMode === 'creation'` ou `APP.currentTraceMode` sur `currentProject`) ni pendant `CLOUD_EDIT_GUARD_MS` (2 s) après une saisie locale (`cloudEditGuard`, alimentée par `scheduleCloudPush()`).
- La fusion conserve alors la version locale (`fusion : … conservée (édition locale en cours)`) et ne déclenche aucun rendu.

### Notes

- La synchronisation descendante reste active : après la fin du tracé (ou 2 s après la dernière saisie), les snapshots distants s'appliquent normalement, et les parcelles non éditées sont mises à jour immédiatement.
- Mode hors-ligne et envoi sélectif inchangés.
- Vérifications : `node --check js/cloud-sync.js` OK ; banc Node 9/9 (tracé actif : snapshot ancien ignoré + 4 points conservés + aucun rendu ; tracé terminé : snapshot appliqué ; garde 2 s : ignoré ; garde expirée : appliqué ; nouvelle parcelle distante reçue).

## [2026-11-05] — Clignotement du dernier point : rejeu de la fusion (et non de la liste brute)

### Corrigé

- **Cause** : le correctif précédent mettait le snapshot reçu pendant un envoi dans `cloudPendingRemote`, puis le rejouait via `applyProjectsFromCloud(liste)` à la fin de l'envoi. Cette liste avait été calculée **avant** le point ajouté pendant l'envoi et **court-circuitait la fusion protectrice** : `projects` et `localStorage` étaient réécrits sans le dernier point (clignotement), puis `renderMap()` redessinait la zone sans lui.
- Le rejeu passe désormais par `mergeRemoteProjects()` sur le dernier état distant connu (`cloudLastRemote`) : la fusion est **recalculée** sur l'état local à jour, donc une parcelle encore « sale » conserve ses points.
- `applyProjectsFromCloud()` n'est plus jamais appelée avec une liste brute : elle reçoit uniquement le résultat d'une fusion.
- Ajout de `syncLog()` (activable par `window.__MOWER_SYNC_DEBUG = true`) : trace `envoi planifié`, `envoi`, `snapshot reçu`, `fusion … conservée`, `application différée`, `rejeu de la fusion`, `application distante`.

### Notes

- La synchronisation descendante (PC → téléphone) et le mode hors-ligne restent inchangés.
- Vérifications : `node --check js/cloud-sync.js` OK ; banc Node 13/13 reproduisant un point ajouté **pendant** un envoi (commit non résolu) + snapshot distant concurrent : le 3ᵉ et le 4ᵉ point restent en place, aucun écrasement, `localStorage` à jour, puis un snapshot du PC (5 points, local non modifié) est bien appliqué. Trace `[sync]` obtenue : `fusion : p1 (4 pt) conservée (en attente de push)` puis `application distante : p1 (4 pt) | p2 (1 pt)`.

## [2026-11-05] — Synchronisation PC → téléphone (envoi sélectif et reprise au premier plan)

### Corrigé

- **Cause principale** : `pushProjectsToCloud()` renvoyait **toute** la liste locale à chaque envoi. Un envoi déclenché sur le téléphone réécrivait donc les parcelles modifiées sur le PC, écrasant ces modifications (asymétrie PC → téléphone).
- L'envoi est désormais **sélectif** : seules les parcelles modifiées localement (`collectDirtyProjects()`) et les suppressions partent ; aucune écriture n'est faite quand tout est à jour.
- `cloudBaseline` n'est mise à jour que pour les parcelles réellement poussées (signature capturée à l'envoi) : une parcelle modifiée pendant l'envoi reste « en attente » et repart au push suivant.
- Un snapshot distant reçu **pendant** un envoi est mis en file (`cloudPendingRemote`) et appliqué à la fin de l'envoi, au lieu d'être ignoré.
- `handleCloudSnapshot()` lit l'état local en **mémoire** (`projects`) plutôt que `localStorage`, qui peut être en retard sur l'autosauvegarde.
- Ajout de `refreshCloudFromServer()` déclenché par `visibilitychange` (retour au premier plan) et `online` : lecture `get({ source: 'server' })` et réattachement de l'écoute `onSnapshot` si elle a été perdue (le navigateur mobile suspend les écoutes en arrière-plan).

### Notes

- La synchronisation téléphone → PC reste inchangée et fonctionne.
- Le mode hors-ligne est préservé : cache IndexedDB conservé, `refreshCloudFromServer()` ne fait rien sans réseau.
- Diagnostic : `window.__MOWER_SYNC_DEBUG = true` puis la console affiche chaque snapshot reçu.
- Vérifications : `node --check js/cloud-sync.js` OK ; banc Node 13/13 (push sélectif : une écriture, parcelle du PC non écrasée ; aucune écriture inutile ; snapshot PC appliqué + rendu ; snapshot pendant envoi mis en file puis appliqué ; suppression propagée ; resynchronisation au premier plan appliquée).

## [2026-11-05] — Correction du dernier point qui disparaissait (course snapshot / écriture locale)

### Corrigé

- Pendant la création d'une zone, un snapshot Firestore encore basé sur l'état précédent (cache, écho d'un push antérieur) remplaçait `projects` par une version sans le dernier point : le point, sa ligne et sa mesure disparaissaient jusqu'à revalidation.
- `handleCloudSnapshot()` **fusionne** désormais au lieu d'écraser : une parcelle modifiée localement et pas encore poussée conserve sa version locale (`cloudBaseline` + `collectDirtyProjects()`), et un écho de push (contenu identique à `updatedAt` près) est ignoré.
- Un résultat identique au local ne déclenche **aucun rendu** (ni écriture `localStorage`) : plus de clignotement.
- `refreshCloudBaseline()` est appelée après chaque push réussi et après chaque application de snapshot ; le payload poussé porte un `updatedAt` ISO local (horodatage logique) en plus du timestamp serveur.

### Notes

- La synchronisation descendante reste active : un snapshot plus récent venu d'un autre appareil (parcelle non modifiée localement) est appliqué normalement, et les suppressions distantes sont propagées.
- Vérifications : `node --check js/cloud-sync.js` OK ; banc Node 14/14 (snapshot ancien : dernier point conservé + aucun rendu + `localStorage` intact ; push complet avec `updatedAt` ; écho de push sans rendu ; snapshot distant plus récent appliqué ; suppression distante ; parcelle locale non poussée conservée).

## [2026-11-05] — Synchronisation Firestore (comptes e-mail / mot de passe)

### Ajouté

- `js/firebase-config.js` : configuration publique du projet Firebase `mower-survey` (`FIREBASE_CONFIG`) et interrupteur `CLOUD_SYNC_ENABLED`.
- `js/cloud-sync.js` : authentification e-mail / mot de passe, écoute temps réel (`onSnapshot`), envoi groupé différé (1,5 s), migration initiale des parcelles locales, cache hors-ligne (`enablePersistence`), interface (bloc « Synchronisation » du panneau Connexion + modale `#authModal`).
- `index.html` : SDK Firebase « compat » 10.14.1 (CDN `gstatic`), bloc « Synchronisation » dans le panneau Connexion, modale « Compte cloud ».
- `css/main.css` : styles `.cloud-sync-*` et `.cloud-auth-*` (tokens uniquement, pastille d'état par `data-state`).
- `docs/firebase.md` : modèle de données, prérequis console (domaines autorisés, règles Firestore), fonctionnement et limites.

### Modifié

- `js/projects.js` : `persistProjectStorage()` déclenche `scheduleCloudPush()` ; l'initialisation appelle `initCloudSync()`.

### Notes

- `localStorage` reste la **source locale** : l'application fonctionne sans compte et sans réseau.
- Migration automatique une seule fois par compte (cloud vide + parcelles locales, clé `rtkCloudMigrated_<uid>`) ; un snapshot vide n'écrase jamais le local.
- La configuration Firebase web (`apiKey`) est publique par nature ; la sécurité repose sur les règles Firestore (`users/{uid}/projects/{projectId}`) et les domaines autorisés à déclarer dans la console.
- Vérifications : `node --check` OK (`cloud-sync.js`, `firebase-config.js`, `projects.js`) ; banc Node 16/16 avec Firebase simulé (migration, snapshot vide, snapshot distant, push différé, suppression propagée, messages d'erreur).
- Limites : dernier écrivain gagne (pas de fusion champ par champ), 1 document par parcelle (limite 1 Mio), `rtkGlobalObstacles` non synchronisée.

## [2026-11-05] — Renommage de l'application en Mower Survey

### Modifié

- `index.html` : titre, header et écran d'accueil mis à jour (titre `Mower Survey`, header et écran d'accueil « MOWER SURVEY », sous-titre « ACQUISITION TERRAIN »).
- `scan.html` : titre et en-tête (« Mower Survey — Récepteur QR animé »).
- `css/main.css` : `.header-title` adapté au libellé plus long (`left: min(180px, 44vw)`, `right: min(60px, 14vw)`, `font-size: clamp(12px, 4.3vw, 20px)`, `white-space: nowrap`).
- `js/export.js` : textes du menu de partage (« Export Mower Survey — … »).
- Commentaires d'en-tête des fichiers `js/` et `css/` mis à jour.
- `README.md`, `AGENTS.md` (§1 et §7) et `docs/*.md` : renommage de « RTK Mower » en « Mower Survey » dans les descriptions actuelles (les entrées historiques du CHANGELOG et du §8 d'AGENTS.md sont conservées telles quelles).

### Notes

- Le nom du dépôt (`RTKGpsWeb`), les URLs (GitHub Pages) et les noms de fichiers (`Start-RTKGpsWeb.bat`, `serve-http.cjs`, `start-public.ps1`) restent inchangés pour ne pas casser les liens.
- Les assets (`logo-rtk-mower.svg`, `logo-rtk-mower_tablette.svg`) gardent leur nom (noms techniques).
- **Contrat GeoJSON préservé** : `source: 'rtk-mower'` reste inchangé (clé lue par Mower Planner).
- **Matériel** : le nom BLE du module ESP32 (`RTK_Mower`, `BLE_CONFIG.deviceName`) reste inchangé.
- La nomenclature de l'écosystème est actée : Mower Survey (téléphone), Mower Planner (tablette), Mower Control, Mower Monitor, Mower Cloud (futurs).

## [2026-11-05] — Trait et métré de la zone interdite dès le 2ᵉ point

### Corrigé

- Sur une **nouvelle parcelle**, le segment entre les 2 premiers points d'une zone interdite et sa distance n'apparaissaient qu'à partir du 3ᵉ point : `addPointToMap()` (`js/map.js`) ne déclenchait `renderMap()` (seul créateur de la polyligne temporaire et de son métré) que si la **parcelle** comptait déjà ≥ 3 points interdits.
- Le rendu complet est désormais déclenché dès que la **zone courante** compte ≥ 2 points (`getInterditZones()[getCurrentInterditZoneId()]`). À 1 point, l'ajout direct du marqueur est conservé (pas de rendu inutile).

### Notes

- Comportements inchangés : zones de tonte (rendu complet dès le 1ᵉʳ point), obstacles (ajout direct), polygone mesuré à 3 points, suppression de la polyligne temporaire au 3ᵉ point.
- Vérifications : `node --check js/map.js` OK ; banc Node 13/13 (vrai `renderMap()` : polyligne `showDistances` à 2 points, polygone `showMeasurements` à 3 points ; décisions de `addPointToMap()` neuve/existante/tonte/obstacle) ; contrat GeoJSON inchangé.

## [2026-11-05] — Mode boucle des obstacles (type → point → type)

### Ajouté

- Boucle d'enregistrement des obstacles : choix du type → fermeture de la boîte → pointage sur la carte (ou FAB) → réouverture automatique de la boîte pour l'obstacle suivant.
- État `APP.obstacleLoopMode` / `APP.obstacleLoopCount` (`js/app.js`) et fonctions `startObstacleLoop()`, `stopObstacleLoop()`, `updateObstacleLoopUI()`, `reopenObstacleLoopModal()`.
- `initObstacleMapTap()` (`js/points.js`, branchée par `js/map.js`) : un tap sur la carte enregistre l'obstacle du type en attente à l'endroit pointé, uniquement en mode boucle ; `dragstart` / `zoomstart` neutralisent le tap fantôme pendant 350 ms.
- `recordObstacle(subtype, icon, name, posOverride)` accepte une position explicite (`{ lat, lon, source: 'manual' }`).
- Barre `#obstacleLoopBar` dans `#obstacleModal` : compteur « X obstacle(s) enregistré(s) » et bouton **« Terminer »** (Lucide `check`).
- Animation de réouverture courte (`.is-loop-reopen`, 150 ms) désactivée en `prefers-reduced-motion`.

### Notes

- Sortie du mode : « Terminer », Échap, clic sur le voile ou changement d'onglet ; les obstacles déjà pointés sont conservés et le compteur est remis à 0.
- Le dernier type reste pré-surligné (`.obstacle-option.pre-selected` via `rtkLastObstacleType`) pour enchaîner plusieurs obstacles identiques.
- Vérifications : `node --check` OK (`app.js`, `points.js`, `map.js`) ; banc Node 33/33 ; contrat GeoJSON inchangé.

## [2026-11-05] — Gestuelle des FAB mutualisée (`js/fab-press.js`)

### Modifié

- Nouveau module partagé `js/fab-press.js` : `bindTraceFabPress()`, `LONG_PRESS_MS` (700 ms) et `LONG_PRESS_MOVE_TOLERANCE_PX` (12 px), chargé dans `index.html` après `js/ble.js` et avant `js/points.js`.
- `js/points.js` : la fonction et les constantes de gestuelle sont retirées (elles viennent du module partagé) ; `initTraceFab()` appelle `bindTraceFabPress()`.
- `js/camera.js` : suppression de la copie locale `bindLongPress` (550 ms) ; `initCameraFab()` câble `bindTraceFabPress()` sur `#cameraFabMain` et `#cameraFabSecondary` (tap court = action, appui long = menu).
- `syncCameraFabUI()` : `#cameraFabSecondary` est aussi `disabled` + `.is-disabled` + `aria-disabled` quand `cameraMode` est nul (il reste masqué dans ce cas).

### Notes

- Tap court sur le « ✓ » caméra = `exitCameraMode()` au premier appui, comme le « ✓ » de TRACÉS.
- Vérifications : `node --check` OK sur les trois fichiers ; banc Node 14/14 (gestuelle 5/5, câblage caméra 4/4, état du ✓ caméra 3/3, non-régression du ✓ TRACÉS 2/2) ; plus aucun `bindLongPress` dans `js/`.

## [2026-11-05] — Fin de zone au premier clic (FAB de tracé)

### Corrigé

- Le bouton « ✓ » (`#traceFabSecondary`) terminait la zone après 2 à 3 appuis : un appui de plus de 550 ms ouvrait le menu FAB et le drapeau `longFired`, jamais réinitialisé, avalait le clic suivant.
- Nouvelle fonction `bindTraceFabPress()` (`js/points.js`) : action courte déclenchée sur `pointerup` (plus de dépendance au `click`), seuil d'appui long porté à 700 ms, tolérance de mouvement de 12 px (un glissement est un panoramique), remise à zéro de l'état sur `pointerup` / `pointerleave` / `pointercancel`, clavier conservé (`click` avec `detail === 0`).
- `syncTraceFabUI()` grise et désactive le « ✓ » (`.trace-fab-secondary:disabled` / `.is-disabled`, `aria-disabled`) tant que la zone courante ne contient aucun point ; `savePoint()` et `deletePoint()` resynchronisent le bouton.
- CSS : `:active` du « ✓ » conserve son centrage vertical (`translateY(-50%) scale(0.94)`).

### Notes

- `js/camera.js` conserve sa propre copie de l'ancien `bindLongPress` (550 ms) : à aligner sur `bindTraceFabPress()` lors d'une intervention sur le FAB caméra.
- Banc Node : 9/9 sur les gestes (l'ancien code ne terminait aucune zone après trois taps appuyés de 620 ms) et 12/12 sur l'état du bouton ; `node --check js/points.js` OK.

## [2026-11-05] — Refonte de l'onglet HISTORIQUE

### Modifié

- Cartes de parcelles (`.session-item`) : suppression des boutons `Ouvrir` et `Suppr.` ; la carte entière est cliquable et ouvre le détail (hors case à cocher et menu ⋮).
- Ajout d'un menu contextuel **⋮** (`.session-menu-btn`, icône Lucide `more-vertical`) par carte, avec « Ouvrir » et « Supprimer » ; fermeture au clic extérieur, avec Échap et au défilement.
- Nouvelle **barre d'action flottante** `#historySelectionBar` (`.history-action-bar`) : fixée au-dessus de la navigation basse, hors de `.app-wrapper`, animation de glissement depuis le bas, bouton « Annuler » (croix), compteur, « Transférer » (`share-2`) et « Supprimer » (`trash-2`).
- `js/app.js` : nouvelles constantes `ICON_MORE_VERTICAL` et `ICON_FOLDER_OPEN` ; `showTab()` purge la sélection en quittant l'onglet HISTORIQUE.
- `js/history.js` : `handleHistoryCardClick()`, `handleHistoryCardKeydown()`, `toggleHistoryCardMenu()`, `closeHistoryCardMenus()`, `initHistoryCardMenus()` ; `syncHistorySelectionUI()` pilote la classe `body.history-selection-active`.

### Notes

- Les actions existantes sont conservées (`openHistoryDetail`, `deleteProject`, `transferSelectedProjects`, `deleteSelectedProjects`) et le contrat GeoJSON est inchangé.
- La barre flottante est masquée en plein écran carte / caméra (`css/map.css`, `css/theme.css`).

## [2026-11-04] — Nettoyage des fichiers de test obsolètes

### Supprimé

- `header-test.html` : prototype du header (remplacé par le header intégré dans `index.html`).
- `menu-test.html` : prototype du menu (cassé depuis la refonte du header, non maintenu).
- `assets/logo-rtk-mower_ancien.svg` : ancien logo vectoriel (remplacé par `logo-rtk-mower.svg` et `logo-rtk-mower_tablette.svg`).

### Conservé (pour Mower Planner)

- `splash-test.html` : prototype du splash animé (rover qui tond), en attente d'intégration dans Mower Planner.
- `assets/Rover_original.svg`, `assets/Herbe haute_original.svg`, `assets/Herbe basse_original.svg` : sources SVG de l'animation.

## [2026-11-04] — Écran d'accueil statique (RTK Mower)

### Modifié

- Suppression de l'overlay splash animé (`#splash-screen`, `js/splash.js`, section CSS `SPLASH SCREEN`).
- Ajout d'un écran d'accueil statique `#welcome-screen` : titre "RTK MOWER / RELEVÉ GPS RTK", empreinte digitale dans un cercle, texte "Appuyer pour continuer", logo `logo-rtk-mower_tablette.svg` en bas.
- Au clic sur l'empreinte : fermeture en fondu (0,3 s) et activation de l'onglet "Tracés" (`showTab('tab-points')`).
- Nouveau script `js/welcome.js` (chargé après `js/app.js`).
- `index.html` : −61 Ko (suppression des 3 tracés SVG d'herbe/rover).

### Notes

- Le splash animé (rover qui tond) est réservé à **Mower Planner** (tablette, mode paysage), à intégrer plus tard. Le prototype `splash-test.html` reste dans le dépôt comme référence.
- `menu-test.html` contient encore un `#splashScreen`/`.splash-logo` orphelin (page de démo à aligner).
- `assets/logo-rtk-mower_ancien.svg` supprimé, `assets/logo-rtk-mower_tablette.svg` ajouté (renommage manuel).

## [2026-11-04] — Réexport vectoriel du logo

### Modifié

- `assets/logo-rtk-mower.svg` : nouveau logo vectoriel (1 path, 26 278 car., SHA-256 `4B5C8E…010E`, viewBox `0 0 3524 500`). Remplace la version précédente (1 path, 38 020 car., SHA-256 `9E8A1081…79FE43`) qui était un SVG valide mais avec une syntaxe Inkscape plus ancienne.
- `index.html` : mise à jour du `<path>` dans `.header-logo-layer` (injecté par script, SHA-256 vérifié, géométrie identique).

### Notes

- `AGENTS.md §10` : bloc de vérification de référence mis à jour (regex robuste, valeurs 26 278 / `4B5C8E…010E`).
- `header-test.html` utilise encore l'ancien `<path>` en dur — sera aligné dans une passe ultérieure.
- Le logo reste `fill="currentColor"` (blanc sur fond vert, inversion en thème nuit).

## [2026-11-03] — Refonte du header et intégration

### Ajouté

- Logo vectoriel `assets/logo-rtk-mower.svg` (SVG unique de 38 020 caractères,
  `viewBox="0 0 3524 500"`).
- Page de test `header-test.html` pour valider le design avant intégration.
- Pastille FIX compacte (texte « FIX », libellé complet dans l'attribut `title`).

### Modifié

- `index.html` : nouveau bloc `<header>` (structure en couches absolues, hauteur 121 px,
  fond `--color-primary-deep`).
- `js/ui.js` : `updateFixBar()` et `setGpsStatusIdle()` n'écrasent plus le texte de la pastille,
  qui reste « FIX » (constante `GPS_PILL_LABEL` ; le détail passe par `title`).
- `css/main.css` : surcharge du header (`.header-logo-layer`, `.header-title`,
  `.header-bottom-band`, pastille `flex: 0 0 auto`), positionnement absolu de la roue dentée
  (`header #btnConnectionSettings`), suppression des sélecteurs `.header-top-row` /
  `.header-bottom-row`.
- `css/map.css` et `css/theme.css` : nettoyage des sélecteurs obsolètes `.header-top-row` /
  `.header-bottom-row` (masquage en plein écran carte et caméra) et suppression de l'override
  nuit codé en dur `[data-theme="dark"] header { background: #14532d }` (le token
  `--color-primary-deep` couvre les deux thèmes).

### À noter

- `menu-test.html` utilise encore l'ancienne structure de header (non aligné pour l'instant).
- Le header passe de **110 à 121 px** : les écrans de contenu perdent 11 px de hauteur utile
  (aucun ajustement nécessaire, `.app-wrapper` est en `100dvh` + `flex`).
- En thème nuit, le fond du header passe de `#14532d` à `#052e16` (`--color-primary-deep`),
  et en thème clair de `#2e7d32` à `#1b5e20`.
- Procédure de maintenance du logo (ne jamais recopier le `<path>` à la main) : `AGENTS.md` §10.
