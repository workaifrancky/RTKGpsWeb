# Journal des modifications — RTK Mower

Historique des évolutions notables de l'application. Format inspiré de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ; dates au format ISO
(`AAAA-MM-JJ`), entrées les plus récentes en premier.

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
