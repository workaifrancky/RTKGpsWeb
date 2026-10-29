# AGENTS.md — Instructions projet

Ce document s'adresse aux développeurs et aux assistants IA qui interviennent sur RTK Mower.
Il décrit le contexte, les règles non négociables, les conventions et les pièges connus.

## 1. Contexte du projet

RTK Mower est une application web de relevé GPS RTK pour le terrain (tonte autonome).

- **Matériel** : récepteur GNSS **Unicore UM980** + module **ESP32** exposé en BLE sous le nom
  `RTK_Mower`, avec corrections **NTRIP**.
- **Application** : page unique `index.html`, Vanilla JS + Leaflet, sans build ni framework.
- **Données** : parcelles (projets) et points stockés dans `localStorage`.
- **Export** : CSV, GPX et **GeoJSON compatible Mower Planner** (contrat inter-applications).
- **Tests sans matériel** : outils de simulation `js/simulation.js`, **désactivés par défaut**
  (`ENABLE_SIMULATION = false`) et sans bouton dans l'interface ; réactivation documentée dans
  [docs/simulation.md](docs/simulation.md).

## 2. Règles absolues (non négociables)

1. **Pas de framework UI** : Vanilla JS + CSS pur. Ne pas introduire React, Vue, Svelte,
   Tailwind, Bootstrap ni de bundler.
2. **Toutes les couleurs passent par les tokens** de `css/design-tokens.css` (ou par les
   variables RTK définies dans `css/main.css`). Pas de nouvelle couleur codée en dur.
   Exception : `color: white` pour le texte sur fond vert (le token `--color-white` devient
   une surface sombre en thème nuit).
3. **Le format d'export GeoJSON est CONTRACTUEL** avec Mower Planner : ne pas renommer les
   types de features, ni changer l'ordre [lon, lat], ni supprimer des propriétés.
   Voir [docs/format-geojson.md](docs/format-geojson.md).
4. **Coordonnées GeoJSON en `[lon, lat]`** (standard GeoJSON), éventuellement `[lon, lat, alt]`
   pour les points. Ne jamais écrire `[lat, lon]`.
5. **Polygones fermés** : la première coordonnée doit être répétée à la fin de chaque anneau.
6. **`maxNativeZoom` doit être défini** sur chaque `L.tileLayer` pour éviter les tuiles
   grises/403 (OSM bloque les usages applicatifs ; CARTO exige une clé API).

## 3. Stack technique figée

| Domaine | Choix imposé |
|---|---|
| UI | Vanilla JS, CSS pur (pas de framework, pas de Tailwind) |
| Cartographie | Leaflet 1.9.4 + `leaflet-measure-path` 1.5.0 via CDN |
| Bluetooth | Web Bluetooth API |
| Persistance | `localStorage` (`rtkProjects`, `rtkCurrentProject`, `rtkGlobalObstacles`, `rtkTheme`, `rtkShowPointNumbers`, …) |
| Build | Aucun : pas de `package.json`, pas de bundler |
| Serveur | `serve-http.cjs` (Node, sans dépendance) + `start-public.ps1` (localtunnel) |

## 4. Conventions de code

- **Scripts classiques** : les fichiers JS sont chargés par `<script src="…">` dans un ordre
  contractuel (voir `index.html`). Chaque fichier expose des fonctions globales.
  Les modules ES6 (`import`/`export`) **ne sont pas utilisés** aujourd'hui ; ne pas en
  introduire localement sans migration globale de l'ordre de chargement.
- **camelCase** pour les fonctions et variables (`recordTonte`, `renderMap`).
- **UPPER_SNAKE_CASE** pour les constantes (`BLE_CONFIG`, `FIX_META`, `PROJECT_KEY`).
- `const` / `let` uniquement, **jamais `var`**.
- Indentation 2 espaces, guillemets simples, point-virgule en fin d'instruction.
- Commentaires et libellés d'interface **en français**.
- Protéger les appels inter-fichiers optionnels : `if (typeof renderMap === 'function')`.
- CSS : sections commentées, classes plates (`action-button`, `modal-box`, `trace-fab-main`),
  variables pour toute couleur/rayon/ombre.
- Avant livraison : `node --check <fichier>.js` sur chaque JS modifié.

## 5. Modèle de données

### Projet / parcelle

```js
{
  id: 'proj_<timestamp>',        // identifiant unique
  name: 'JARDIN NORD',           // toujours en MAJUSCULES (createProject / renameProject)
  createdAt: '2026-10-23T08:00:00.000Z',
  points: [ /* Point[] */ ]
}
```

`createProject()` (`js/app.js`) et `renameProject()` (`js/projects.js`) convertissent le nom
saisi avec `toUpperCase()` : l'affichage est uniforme partout (FAB, tiroir, RELEVÉ,
HISTORIQUE, exports). `normalizeProject()` (`js/projects.js`) applique la même règle au
chargement, ce qui **migre** les parcelles créées avant cette règle. Les vues appliquent en
plus `toUpperCase()` + `text-transform: uppercase` (ceinture et bretelles).

Stockage : tableau `rtkProjects` dans `localStorage`, identifiant du projet courant dans
`rtkCurrentProject`. L'accès passe par `getPoints()` et `getCurrentProjectData()`.

### Point

```js
{
  id: 1698055200000,
  type: 'tonte' | 'interdit' | 'obstacle',
  subtype: 'Arbre' | null,       // catégorie d'obstacle
  name: 'Arbre du fond' | null,  // nom personnalisé (facultatif)
  icon: '🟢',
  index: 1,                      // numérotation par type
  zoneId: 1,                     // zone de tonte ou zone interdite (défaut 1)
  lat: 44.832223,
  lon: -0.701992,
  alt: 120,
  relX: 0, relY: 0,              // position relative à la base NTRIP (m)
  fix: 'RTK Fix',
  fixScore: 4,                   // 0 None, 1 GPS, 2 DGPS, 3 Float RTK, 4 RTK Fix
  satellites: 24,
  hdop: 0.5,
  timestamp: '2026-10-23T10:00:00.000Z'
}
```

- Seuil d'enregistrement : fix **Float RTK minimum** (`fixScore >= 3`).
- Compteurs par type dans `js/points.js`, resynchronisés par `syncCounters()`.
- La fonction « base du rover » est **supprimée** : aucun type `base` n'est créé, exporté ou
  affiché. Les anciens points `base` présents dans `localStorage` sont purgés au chargement
  par `normalizeProject()` (`js/projects.js`).
- Le projet de simulation est nommé **`Simulation`** et réutilisé à chaque activation.

## 6. Format d'export GeoJSON

Contrat complet : **[docs/format-geojson.md](docs/format-geojson.md)**.

Résumé : `FeatureCollection` dans cet ordre strict :

1. `domaine` — `Polygon` (convex hull de tous les points du projet)
2. `zone` (× N) — `Polygon` (une Feature par `zoneId`, si ≥ 3 points `tonte`)
3. `zone_interdite` — `Polygon` (une Feature par zone interdite, si ≥ 3 points `interdit`)
4. `obstacle` — un `Point` par obstacle (`name`, `categorie`, `rayon`, `index`, fix…)

Aucune Feature `base` n'est produite.

Nom du fichier : `RTK_<projet>_<YYYY-MM-DD>.geojson`.

Toutes les propriétés incluent `source: 'rtk-mower'`, `date_creation` (première capture ISO pour
le domaine et les zones ; **timestamp propre de l'obstacle** pour un obstacle) et
`version_app` (`APP.version`, actuellement `2.0.0`). Le `created_at` du domaine est toujours
égal à `date_creation`, même si l'ancien `project.createdAt` est plus ancien.

## 7. Points de vigilance

- **Tuiles** : OSM (`tile.openstreetmap.org`) bloque les apps (418/403) ; CARTO Voyager
  sans clé renvoie un filigrane « API KEY REQUIRED ». Le fond Relief utilise Esri World Topo
  par défaut (`CARTO_API_KEY` vide dans `js/map.js`). `maxNativeZoom` = 19 avec clé CARTO,
  17 avec Esri, 19 pour le satellite Esri. Toujours conserver `maxZoom: 22`.
- **Multi-zones de tonte** : chaque point `tonte` porte un `zoneId` (défaut 1) et le projet
  stocke `currentZoneId`. Utiliser `getZones()` pour grouper et ne jamais fusionner les zones
  à l'affichage ou à l'export. `startNewZone()` incrémente la zone courante ; il est appelé
  par l'option « Nouvelle zone de tonte » du menu FAB (`#traceFabMenu` /
  `beginTraceMode('tonte')`).
- **Multi-zones interdites** : chaque point `interdit` porte aussi un `zoneId` ; le projet
  stocke `currentInterditZoneId`. `getInterditZones()` groupe par zone, `startNewInterditZone()`
  (option « Nouvelle zone interdite » du menu FAB, garde-fou ≥ 3 points) incrémente la zone
  courante. `recordInterdit()` s'appuie sur `buildPoint()`, qui lit
  `getCurrentInterditZoneId()`. Carte et export produisent un polygone / une Feature
  `zone_interdite` **par zone** (`zone_id`), sans fusion. Flux d'un obstacle (point ponctuel) :
  1. option « Obstacle » du menu FAB → `chooseTraceMode('obstacle')` → `beginTraceMode()` puis
     `openObstacleMenu()` ouvre la modale « Type d'obstacle » **sans enregistrer** ;
  2. choix du type → `selectObstacleType()` mémorise `APP.pendingObstacle = { type, icon }`,
     **ferme la modale** et laisse le mode obstacle actif (croix de visée + FAB ambre) ;
  3. l'utilisateur déplace la carte, puis le clic sur le FAB appelle `recordObstacle()` avec le
     type en attente : c'est **la seule** validation. Annuler la modale — voile, **Échap**
     (`initObstacleModal()`, inactif si `#customModal` ou `#transferModal` est ouvert) ou
     `closeObstacleMenu()` — libère le mode ; le bouton « ✓ » est masqué en mode obstacle.
- **Zones vides en cours** : `currentZoneId` et `currentInterditZoneId` peuvent valoir
  `maxZone + 1` entre la création d'une zone et son premier point. `normalizeProject()` et
  les recalculs après suppression d'un point ou d'une zone conservent cette valeur ; sinon
  les points suivants repartent dans l'ancienne zone après un rechargement.
- **Convex hull** : `calculateConvexHull(pts)` reçoit tous les points du projet (il n'y a plus
  de point de référence à exclure).
- **Header et menu** : le header tient sur **deux lignes** :
  1. logo `🌾 RTK Mower` + bouton `#btnConnectionSettings` (`.header-connection-btn`,
     **icône seule** SVG Lucide `settings` (18 px) **sans cercle ni fond** — zone tactile
     invisible de 44 × 44 px, survol signalé par l'opacité ; le sens est porté par
     `title` / `aria-label` = « Connexion », **aucun libellé texte**) qui ouvre le panneau de
     connexion ;
  2. pastille GPS `#headerGpsStatus` (`.gps-status-pill`) + `.header-actions-group` contenant
     le bouton thème `#btnTheme` et le bouton BLE `#btnBle` (tous deux `.header-icon-btn`).

  Il remplace l'ancienne `#fixBar`. Le panneau `#headerMenu` — ouvert par
  `toggleConnectionPanel()` → `toggleHeaderMenu()` — ne contient plus que la station NTRIP
  avec `#saveIndicator` (ligne 1) puis le switch `#btnPointNumbers` « Numéros des points »
  (ligne 2, `role="switch"` + `aria-checked`) : le thème et le BLE sont **dans le header**, la
  parcelle courante **dans le menu FAB de TRACÉS**, ne pas les remettre dans le menu (doublons
  d'ID interdits). Le panneau est organisé en **deux blocs séparés** (`gap` 14 px,
  `.menu-row-context` avec filet supérieur) : (1) NTRIP + `#saveIndicator` ; (2) « Affichage »
  + switch `#btnPointNumbers`. **Aucune ligne Parcelle** dans ce panneau (ni bouton de repli) :
  la parcelle est uniquement dans la 1re ligne du menu FAB de TRACÉS.
  `positionHeaderMenu()` (`js/app.js`) aligne le menu sous le header mesuré
  (`getBoundingClientRect()`) : ne pas revenir à un `top` fixe, la hauteur dépend des
  breakpoints et du `safe-area`. Le bouton « Connexion » porte une **icône SVG Lucide inline**
  (`settings`) et non un emoji `⚙️` : ne pas revenir à un caractère texte ni à un libellé
  visible. Le menu et son voile
  `#headerMenuOverlay` sont **hors de `.app-wrapper`** (z-index 4000 / 3999) pour passer
  au-dessus du verrouillage écran (3000) et des FAB (1002) : ne pas les replacer dans
  `<header>` (contexte d'empilement `z-index: 200`) et les masquer explicitement en plein écran
  (`body.map-ui-fullscreen` dans `map.css`, `body.camera-ui-fullscreen` dans `theme.css`).
  `js/projects.js` rend le focus au déclencheur du tiroir (`#btnProjectDrawer` s'il est visible,
  sinon `#btnConnectionSettings`).
- **Icônes des boutons** : les icônes d'action sont des **SVG Lucide inline**, jamais des emoji
  (rendu variable selon la plateforme). Les icônes générées en JS sont centralisées dans
  `js/app.js` — `ICON_PENCIL`, `ICON_TRASH`, `ICON_MOON`, `ICON_SUN`, `ICON_CROSSHAIR`,
  `ICON_RULER`, `ICON_PLUS`, `ICON_MAXIMIZE`, `ICON_MINIMIZE`, `ICON_LOCK`, `ICON_UNLOCK`,
  `ICON_COMPASS` — fichier chargé **avant** `projects/points/map/history/camera` : ne pas
  redéclarer ces constantes ailleurs (`SyntaxError` de redéclaration dans le scope global).
  Les icônes statiques (header, contrôles de carte, menus FAB, boutons de la section POINTS,
  tiroir, verrouillage) sont écrites dans `index.html` **et** `menu-test.html`. Toujours
  `fill: none` + `stroke: currentColor` (ou `fill: currentColor` pour une pastille), conteneur
  `inline-flex` centré et `svg { display: block; pointer-events: none }`.
  Aucun emoji dans un contrôle : `map` (Relief), `satellite`, `maximize` / `minimize`
  (plein écran carte **et** caméra), `lock` / `unlock` (verrouillage), `plus` (FAB neutre,
  « Nouvelle parcelle », « Créer la parcelle »), `check` (FAB secondaire), `x` (tiroir),
  `refresh-cw` (Actualiser), `compass` (boussole du HUD), `chevron-down` (sélecteur de cible),
  `save` (indicateur de sauvegarde), `share-2` / `download` (exports et hub de transfert),
  `folder-open` (historique). Dans l'interface, le **type d'un point** est rendu par une
  pastille CSS : `.point-dot` (14 px, listes) ou `.type-dot` (10 px inline : popups carte,
  libellés RELEVÉ, historique, cible caméra), colorée par
  `--color-tonte` / `--color-interdit` / `--color-obstacle`. Le champ `point.icon` (🟢/🔴/🟡)
  **n'est pas modifié** : il reste exporté dans le GeoJSON (contrat Mower Planner) mais n'est
  plus affiché. Les **types d'obstacles** sont eux aussi rendus en SVG Lucide, indexés par
  `subtype` dans `OBSTACLE_ICON_SVG` (`js/app.js`) via `getObstacleIconMarkup()` : `trees`
  (Arbre), `map-pin` (Perso **et repli** des anciens types), `axe` (Souche), `mountain`
  (Talus), `utility-pole` (Poteau), `circle-dot-dashed` (Forage). Ils apparaissent dans la
  modale `#obstacleModal` (`.obstacle-option-icon`), la liste des points, les popups carte,
  le sélecteur d'import des parcelles et la cible caméra (`.obstacle-type-icon`). Seul le
  `<select>` natif `#targetSelect` reste en texte (un `<option>` ne peut pas contenir de SVG).
  Restent volontairement en emoji : le logo `🌾` et les textes (toasts, messages d'état) ;
  l'emoji d'un obstacle n'est plus qu'une donnée interne (`point.icon`).
- **Tiroir Parcelles** : le bandeau `#projectBar` n'existe plus. `#btnProjectDrawer` (libellé
  « Parcelle : <nom> », `.trace-fab-item.project` avec `#currentProjectName`) est la **1re
  ligne du menu FAB de TRACÉS** ; il ouvre `#projectDrawer`
  (`openProjectDrawer()` / `closeProjectDrawer()` / `toggleProjectDrawer()` dans
  `js/projects.js`). La liste (`renderProjectList()`) affiche une ligne par parcelle avec
  `switchProject(id)`, `renameProject(id)` et `deleteProject(id)` ; `saveProjects()` rafraîchit
  la liste **et** le libellé du bouton FAB. Fermeture au clic sur l'overlay, avec Échap et au
  changement d'onglet.
- **Base globale des obstacles** : `rtkGlobalObstacles` (tableau `{ id, name, subtype, icon,
  lat, lon, alt, rayon, createdAt, projectId }`) est chargée au démarrage dans
  `globalObstacles` (`js/projects.js`) et **amorcée depuis les parcelles** si la clé est
  absente. `recordObstacle()` ajoute chaque nouvel obstacle via `addGlobalObstacle()`
  (dédoublonnage par nom + coordonnées). La modale `#projectModal` liste la base
  (`renderGlobalObstaclePicker()`, bouton « Tout cocher ») ; `createProject()` transmet les IDs
  cochés à `addProject(name, true, ids)`, qui importe via `importGlobalObstacles()` **avant**
  le premier rendu. L'import crée de nouveaux IDs, conserve coordonnées/nom/sous-type/icône et
  ignore les doublons de la parcelle cible. Les obstacles importés restent des features
  `obstacle` au GeoJSON.
- **Suppression de parcelle** : `deleteProject(projectId)` (`js/projects.js`) — centralisée,
  elle autorise la suppression de la **dernière** parcelle : `currentProject` devient `null`,
  `rtkCurrentProject` est retiré, le FAB est masqué, la carte est vidée,
  le header affiche « Aucune » et le tiroir montre la liste vide avec « ＋ Nouvelle parcelle ».
  `deleteCurrentProject()` reste un raccourci. Ne pas redéfinir `deleteProject()` ailleurs
  (doublon historique supprimé de `js/history.js`).
- **Export** : GeoJSON, CSV et GPX sont trois boutons explicites de la section POINTS de
  l'onglet HISTORIQUE (`#pointsSection`), avec l'icône Lucide `download`. `buildGeoJSON()`
  centralise la construction et les métadonnées `date_creation` / `version_app` / `source`
  ajoutées à **toutes** les features. Le partage natif passe par `shareGeoJSON()` /
  `navigator.share({ files })` (fallback toast sur desktop).
- **Hub de transfert** : `#btnTransfer` (`.transfer-trigger`, icône `share-2` + « Transférer »)
  ouvre `#transferModal` (`js/export.js`), qui propose **quatre canaux redondants** :
  1. `transferViaNativeShare()` → `shareGeoJSON()` (Quick Share, Gmail…) ;
  2. `transferViaLocalServer()` → panneau `#transferLocalPanel` avec l'adresse réseau fournie
     par **`GET /api/local-info`** (`serve-http.cjs`, `os.networkInterfaces()`, IPv4 non
     internes) et un bouton « Copier » (`copyTransferLocalUrl()`) ; le **QR code** est un
     placeholder « Bientôt » ;
  3. `transferViaCloud()` → `shareGeoJSON()` (le menu Android propose Drive) ;
  4. `transferOpenDownloads()` → ferme la modale, ramène `.points-view-actions` à l'écran et
     le met en surbrillance (`is-highlight`, animation `transfer-highlight`).
  La modale se ferme au voile, avec Échap (prioritaire sur le menu d'export) et au changement
  d'onglet (`showTab()` appelle `closeTransferModal()`), avec piège de focus et retour du focus
  sur `#btnTransfer`. Sans point, `openTransferModal()` affiche « Aucun point à transférer ».
- **Section POINTS (onglet HISTORIQUE)** : la liste des points n'est plus un panneau flottant
  (`#pointsViewOverlay` supprimé). L'en-tête `.points-section-head` affiche
  `« PARCELLE : <NOM> »` (`<span class="section-title">PARCELLE :</span>` +
  `#historyProjectName`, classe `.history-project-name`, mis à jour par
  `updateHistoryProjectName()` — appelée par `loadHistory()` et `renderProjectList()`), puis
  `#btnTransfer` (hub de transfert). `#pointsSection` contient `#zoneBadge`, `#pointCount`,
  `#pointsList`, `#btnTransfer`, les exports GeoJSON/CSV/GPX et « Effacer » ;
  elle précède la section « PARCELLES / SESSIONS » (`#historyList`, `loadHistory()`).
  Accès : **uniquement** le bouton HISTORIQUE de la navigation basse
  (`showTab('tab-history')`, qui appelle `renderPointsList()` **et** `loadHistory()`).
  Le menu FAB TRACÉS ne contient plus d'option « Historique » : `openPointsView()` et ses
  alias (`closePointsView()`, `togglePointsView()`, `scrollToPointsPanel()`) sont supprimés —
  ne pas les réintroduire.
- **Verrouillage d'écran** : bouton flottant `#btnLock` (carte), voile `#lockOverlay` affiché
  par `body.locked`, glissement horizontal `.lock-swipe` (72 % du parcours) ou Entrée/Espace.
  `setMapInteractionEnabled(false)` coupe les gestes Leaflet et `canRecordPoints()` bloque
  l'enregistrement ; le FAB est sous le voile `z-index: 3000`.
- **Sauvegarde locale** : `saveProjects()` écrit via `persistProjectStorage()` ; l'indicateur
  `#saveIndicator` clignote (`flashSaveIndicator()`) et porte
  `title` / `aria-label` = « Sauvegarde locale automatique » (complété par l'heure de la
  dernière sauvegarde au moment du flash). `autosaveInterval` réécrit toutes les
  30 s, et `pagehide` / `visibilitychange` / `beforeunload` déclenchent
  `flushProjectStorage()`. Une erreur de quota affiche un toast et n'indique pas « Sauvegardé ».
- **Distances de tracés** : `leaflet-measure-path` est chargé par CDN **après Leaflet** (CSS
  dans `<head>`, JS après `leaflet.js`). Les polygones de tonte passent
  `showMeasurements: true` et `ZONE_MEASUREMENT_OPTIONS` (`showArea: false`,
  `showTotalDistance: false`, `minPixelDistance: 10`) dans `js/map.js`. À **2 points**,
  `renderMap()` crée une `L.polyline` temporaire (`tempMeasureLine`) mesurée, supprimée dès
  le 3ᵉ point par `clearTempMeasureLine()`. Ne pas retirer ces deux balises CDN.
- **Labels de zone et numéros de points** : `addZoneLabel(type, zoneId, zonePts)` pose un
  `L.tooltip` permanent au centre de chaque zone, **avec le code seul** (`ZT1`, `ZT2`, `ZI1`…,
  classe `.zone-name-label`, zoom ≥ `ZONE_LABEL_MIN_ZOOM = 18`). La **surface n'est jamais
  écrite sur la carte** : elle reste dans `zonePopup()` (`Surface : …`) et dans l'export
  (`surface_m2`). Les numéros des points (`bindPointNumberTooltip()`) ne sont affichés que si
  l'option `rtkShowPointNumbers` vaut `'1'` (`showPointNumbers`, `js/map.js`, **désactivée par
  défaut**), pilotée par le switch `#btnPointNumbers` du panneau Connexion
  (`togglePointNumbers()` → persistance + `renderMap()`).
- **Onglet CARTE supprimé** : un seul écran cartographique (TRACÉS). Les contrôles Relief /
  Satellite / Plein écran sont flottants sur la carte (`.map-floating-controls`) ; Exporter et
  Effacer sont dans la section POINTS de l'onglet HISTORIQUE (`#pointsSection`).
- **Démarrage sans parcelle** : au premier lancement, `projects` peut être vide et
  `currentProject` vaut `null` ; aucun projet « Mon jardin » n'est créé automatiquement.
  `#traceFab` reste visible sur TRACÉS : son clic principal ouvre directement `#projectDrawer`
  (création/sélection) et la 1re ligne du menu est « Parcelle : Aucune » ; `chooseTraceMode()`
  affiche « Créez d'abord une parcelle » et ouvre le tiroir. La carte reste vide tant qu'aucune
  parcelle n'est sélectionnée.
- **Modes lecture / création** : `APP.tracesMode` reste un état interne (`lecture` au
  chargement, `creation` pendant un tracé). Il n'y a plus de bouton `#btnTracesMode` :
  le FAB démarre un mode via `beginTraceMode()`, puis `finishCurrentTrace()` repasse en
  lecture. `setTracesMode()` / `syncTracesModeUI()` restent utilisés par la gestion des
  parcelles et la cible ; `canRecordPoints()` bloque tout ajout hors création.
- **FAB unique et type de tracé** : `#traceFab` (`.trace-fab`, `position: fixed`, centré en
  bas à 80 px) est visible sur TRACÉS, **avec ou sans parcelle**. Neutre, il ouvre
  `#traceFabMenu` (**4 options seulement**, dans cet ordre : « Parcelle : … » / tonte /
  interdit / obstacle) ; `beginTraceMode()` fixe `APP.currentTraceMode` et colore le FAB. Le
  clic principal ajoute un point (`recordTonte()` / `recordInterdit()`), **valide l'obstacle**
  quand `APP.pendingObstacle` est renseigné (`recordObstacle()`) ou rouvre le choix du type —
  sans parcelle il ouvre le tiroir. Le bouton secondaire `#traceFabSecondary` (icône Lucide
  `check`) termine la zone : sous 3 points, `customConfirm()` demande « Zone incomplète
  (X points). Terminer quand même ? » ; il est **masqué en mode obstacle** (un obstacle se
  valide avec le FAB). Un appui long sur le FAB ou sur « ✓ » rouvre le menu.
  Après un obstacle, le FAB redevient neutre et `currentTraceMode` / `pendingObstacle` sont
  remis à `null`. Le type actif est indiqué par la couleur/titre du FAB (« Valider l'obstacle
  « Arbre » » quand un type est en attente) et par la cible `#map-crosshair`.
  Le bouton principal porte l'icône Lucide `plus` (26 px), le secondaire `check` (24 px).
- **Toasts de création** : `recordTonte()`, `recordInterdit()` et `recordObstacle()`
  n'affichent plus de toast de succès ; seules les erreurs (position indisponible, mode
  lecture, stockage) et les actions de gestion (suppression, renommage…) en produisent.
- **Plein écran carte** : `toggleMapFullscreen()` / `exitMapFullscreen()` (`js/map.js`),
  classe `body.map-ui-fullscreen` (`#tab-points` fixé plein écran). Masquage **explicite** en
  `display: none !important` (`map.css` / `theme.css`) de `header`, de ses deux lignes
  (`.header-top-row`, `.header-bottom-row`), de `#btnConnectionSettings`, `#btnTheme`,
  `#btnBle`, `#headerGpsStatus`, `#headerMenu`, `#headerMenuOverlay`, `.tabs-wrapper` et du
  tiroir : aucun bouton du header ne doit rester visible. Le bouton `#btnMapFullscreen` passe
  d'`ICON_MAXIMIZE` à `ICON_MINIMIZE`. Fermeture au changement d'onglet.
- **Popups de points** : `pointPopup()` (`js/map.js`) affiche l'icône, le nom/sous-type et le
  numéro, la zone (`ZT1` / `ZI1`), le fix, l'altitude et les satellites, puis les actions
  (renommer / supprimer). **Pas d'horodatage** : l'heure reste dans la liste des points
  (`renderPointsList()`) et dans les exports.
- **Header non compressible** : `header { flex-shrink: 0 }` (`css/main.css`) est
  **indispensable**. Le header est un élément flex de `.app-wrapper` : sans cette règle, il
  était écrasé (110 → 85 px mesuré) quand l'écran courant est chargé (HISTORIQUE), ses deux
  lignes débordaient de sa boîte et passaient **par-dessus** le contenu — c'était la cause
  réelle du « contenu sous le header », pas un manque de padding. Ne pas retirer.
- **Décalage sous le header** : grâce à `flex-shrink: 0`, `#tab-history` et `#tab-stats`
  commencent déjà sous le header, donc `padding-top: 0` (pas de double espacement). Une ligne
  de secours reste disponible et commentée dans `css/main.css`
  (`padding-top: var(--header-height, 104px)`) avec `--header-height: 104px` dans `:root`, à
  activer **uniquement** si un appareil superpose encore le header. La mesure JS
  (`syncScreenHeaderOffset()`) a été supprimée : elle ne mesurait que la boîte du header, pas
  son contenu débordant, d'où un offset qui restait à 0. TRACÉS et CAMÉRA n'ont aucun décalage.
- **En-tête RELEVÉ** : `.stats-header` (`flex` en `flex-start`, filet commun en bas) affiche
  « **PARCELLE :** » (`.section-title`) suivi de `#statProjectName`
  (`.stat-project-name-inline`, balise `<span>` avec `font-weight: 700; margin-left: 4px`) :
  le nom est **sur la même ligne que le titre**, en majuscules (`toUpperCase()` +
  `text-transform`), ellipse si trop long, `--color-primary-deep` / `--color-primary-light`
  en nuit. Le nom est rempli par `updateStatsDisplay()` (`js/stats.js`) : rafraîchi à
  l'ouverture de l'onglet (`showTab('tab-stats')`) et à chaque changement de parcelle.
- **Zones modifiables** : popup `zonePopup()` sur chaque polygone (tonte/interdit) avec
  `renameZone(type, zoneId)` et `deleteZone(type, zoneId)` ; noms stockés dans
  `project.zoneNames` et affichés par `getZoneDisplayName()`. `deleteZone()` renumérote les
  points, recale les zones courantes et rafraîchit carte/liste/stats.
- **Renommage** : `renameProject(id)` / `renameCurrentProject()` (parcelle), `renameZone()`,
  `renamePoint(id)` utilisent `customPrompt()` (modale `#customModal`), refusent un nom vide
  sans fermer la modale et persistent via `saveProjects()`. Le nom d'un point est stocké dans
  `point.name` (indépendant de `subtype`) et exporté dans `properties.name` pour les obstacles.
  `deleteProject()`, `deleteZone()`, `renamePoint()`, `renameZone()` et `clearAllPoints()` sont
  **asynchrones** (`await customConfirm/customPrompt`) : les appels programmatiques doivent
  attendre leur promesse.
- **Modales** : ne plus utiliser `confirm()` / `prompt()` natifs. `customConfirm()` et
  `customPrompt()` (`js/app.js`, `#customModal`) retournent des promesses ; Échap et le clic
  sur le voile annulent, le focus reste dans la modale et un nom vide est refusé sans la fermer.
- **Navigation basse** : `#bottomNav` (`.tabs-wrapper.bottom-nav`) est **fixe hors de
  `.app-wrapper`**, avec `z-index: 900` (sous le tiroir 1050, les modales 1100 et les toasts
  1200). `.screen` réserve `--bottom-nav-height` + `env(safe-area-inset-bottom)` : ne pas
  retirer ce padding, sinon le FAB et la vue POINTS passent dessous. La barre est
  masquée en plein écran par `body.map-ui-fullscreen .tabs-wrapper` et
  `body.camera-ui-fullscreen .tabs-wrapper`.
- **Surfaces** : `calculateArea()` attend des objets `{ lat, lon }` (pas des tableaux GeoJSON).
- **Zones interdites** : une Feature `zone_interdite` **par zone** (`zone_id`), nommée
  `Zone interdite` pour la zone 1 et `Zone interdite #N` au-delà. Aucune fusion des zones.
- **Ordre des scripts** : `index.html` charge les JS dans un ordre précis ; une nouvelle
  dépendance doit être insérée après ses dépendances (ex. `simulation.js` après `points.js`
  et `map.js`, avant `export.js`).
- **API locale** : `serve-http.cjs` expose `GET /api/local-info` (`{ ok, port, addresses, urls }`,
  servi **avant** la résolution de fichiers, sans dépendance). Elle alimente le « mode serveur
  local » du hub de transfert ; sans elle (autre serveur), le JS retombe sur `location.origin`.
- **Pas de cache** : `serve-http.cjs` envoie `Cache-Control: no-store` ; ne pas le retirer
  pendant les phases de test terrain.
- **Outils de simulation** : `ENABLE_SIMULATION = false` dans `js/simulation.js` et boutons
  retirés d'`index.html` depuis la mise en production terrain. Ne pas réintroduire un bouton
  de simulation sans repasser le flag à `true` (sinon le bouton reste inerte) ; procédure
  complète dans [docs/simulation.md](docs/simulation.md).

## 8. Sessions validées

Historique des évolutions majeures (à compléter à chaque lot terminé) :

- **1.1 — Design system** : création de `css/design-tokens.css`, alignement des couleurs,
  rayons et ombres sur Mower Planner, alias de compatibilité dans `main.css`, mode sombre
  basé sur la surcharge des tokens.
- **1.2 — Boutons et modales** : classes `.action-button`, `.action-button-danger`,
  `.btn-secondary`, `.action-button-compact`, `.modal-box` et `.modal-title` (18 px / 700 /
  vert foncé) ; boutons terrain conservés en 64 px ronds ; overrides de lisibilité en thème nuit.
- **2.1 — Base du rover et simulation** : type de point `base` (unique, remplacé par
  `recordBase()`), bouton BASE dans la barre terrain, icône maison sur la carte, Feature
  GeoJSON `base`, exclusion de la base du domaine et des statistiques, fond Relief sans
  blocage OSM, et mode Simulation (`js/simulation.js`, 15 points fictifs : 2 zones de
  4 points de tonte, 3 points interdits, 3 obstacles, 1 base).
- **2.2 — Multi-zones de tonte** : `zoneId` sur chaque point `tonte`, `currentZoneId` stocké
  par parcelle, bouton « NOUVELLE ZONE », badge « Zone #N », un polygone coloré et numéroté
  par zone sur la carte, et une Feature `zone` par `zoneId` (`zone_id`) à l'export.
- **2.3 — Simulation multi-zones et garde-fou** : la simulation génère 15 points (2 zones de
  4, 3 interdits, 3 obstacles, 1 base) ; `startNewZone()` refuse de créer une zone tant que
  la zone courante contient moins de 3 points.
- **2.4 — Simulation de trame GPS** : bouton « Simuler une trame GPS » (`simulateGpsFrame()`)
  qui injecte une trame texte via `parseGpsFrame()` + `updateUI()` pour tester l'onglet
  DONNÉES sans BLE.
- **3.1 — Refonte de l'onglet DONNÉES** : grille `.data-grid` sur 2 colonnes, cartes
  `.data-card` / `.data-card-primary` (fond uniforme, ombre `--shadow-sm`), Latitude et
  Longitude côte à côte sur toute la largeur (`.data-primary-row` / `.data-primary-col`,
  séparateur vertical), valeurs secondaires en 2×2 (Altitude, Satellites, HDOP, Vitesse) ;
  section DONNÉES GPS et carte précision conservées en tête d'onglet.
- **3.1-bis — Bouton « Simuler une trame GPS »** : variante de bouton dédiée
  `.action-button-simulation-gps` (pleine largeur, fond `--color-teal`, texte blanc),
  placée sous « Mode Simulation » dans l'onglet DONNÉES ; elle appelle toujours
  `simulateGpsFrame()`.
- **3.1-ter — Uniformisation des valeurs DONNÉES** : `.data-card .data-value` en
  **24 px / 800 / `--color-primary-deep`**, `font-variant-numeric: tabular-nums` sur Lat/Lon ;
  neutralisation des `<span class="data-value">` injectés par `js/ui.js` (sélecteur
  `.data-card .data-value .data-value`, `font-size: inherit !important`, `color: inherit`)
  pour effacer le style inline 22 px et les couleurs Satellites/HDOP ; override de
  lisibilité en thème nuit (`--color-primary-light`).
- **3.2 — Guidage caméra « option A » et retour d'approche** : `getCorrectedBearing()` est
  remplacée par `getGuidanceBearing()` ; la flèche de cible indique le **cap géographique**
  (0° = nord en haut) et ne tourne plus avec le téléphone, la boussole restant informative
  (badge CAP). Deux styles distincts : `.cam-arrow-target` (pleine, large, vive) masquée sous
  le seuil de proximité au profit du cercle + distance en centimètres, et
  `.cam-arrow-distance` (fine, longue, semi-transparente, opacité 0.55) pilotée par le cap
  brut. Retour haptique/sonore aux seuils **10 / 5 / 2 / 1 m** avec hystérésis de **0,5 m**
  (`processApproachFeedback()`, `navigator.vibrate` + bip Web Audio), bouton on/off
  `.cam-feedback-btn` dans l'overlay cible et persistance `rtkCameraApproachFeedback`.
  Sous **50 cm** (`CAMERA_HALO_ALERT_M`), le cercle de proximité passe en
  `.cam-target-circle.halo-alert` : animation `pulse-target-alert` (0,66 s) et halo renforcé
  teinté par `getCameraColor(dist)` via `--halo-color` ; en `prefers-reduced-motion: reduce`,
  clignotement désactivé et bordure portée à 7 px.
- **3.4 — Seuil de proximité fixe** : les trois valeurs réglables (0,8 / 1,0 / 1,5 m), le menu
  « Seuil cible », `setTargetNearThreshold()` et la clé `rtkCameraTargetNearThreshold` sont
  supprimés. Seuil unique en dur `CAMERA_TARGET_NEAR_M = 1.0` (cercle + distance en cm sous
  1 m, `cam-arrow-target` masquée). Le halo `CAMERA_HALO_ALERT_M` (0,5 m) est inchangé. La clé
  localStorage obsolète est purgée au `DOMContentLoaded`.
- **3.5 — Relevé de parcelle (STATS)** : l'onglet STATS passe du tableau technique (points,
  HDOP, satellites, distance cumulée) à un résumé métier en trois blocs : surface à tondre
  (`statArea`, pleine largeur), estimations (`statTime`, `statLinear`, `statPerimeter`,
  `statZonesCount`), contraintes relevées (obstacles détaillés par catégorie, zones interdites
  avec surface), puis diagnostic discret (meilleur fix, durée du relevé). `computeStats()`
  cumule les surfaces et périmètres par `zoneId` (sans fusion) ; le linéaire vaut
  `surface / (largeur × (1 − recouvrement))` et le temps `linéaire / vitesse`, avec les
  constantes génériques `MOWING_WIDTH_M = 1.0`, `MOWING_OVERLAP_RATIO = 0.0`,
  `MOWING_SPEED_KMH = 4.0` (ordre de grandeur pour préparer le travail).
  L'interface réutilise les classes de l'onglet DONNÉES (`.data-grid`, `.data-card`,
  `.data-card-primary`, `.data-value`).
- **3.7 — Perspective 3D du guidage caméra** (commit `900b794`, message d'origine « Session »,
  conservé tel quel car déjà poussé sur `origin/main`) : `deviceBeta` / `deviceGamma` sont mémorisés par
  `handleDeviceOrientation()`, `getCameraSceneTransform()` construit
  `perspective(700px) rotateX(…) rotateZ(…)` avec `CAMERA_3D_BETA_NEUTRAL = 45`,
  `CAMERA_3D_BETA_RATIO = 0.4`, `CAMERA_3D_ROLL_RATIO = 0.4`, `CAMERA_3D_ROLL_MAX = 25` et une
  inclinaison bornée à 10–85°. Les scènes `.cam-3d-scene-arrow` (base 30°) et
  `.cam-3d-scene-circle` (base 55°) enveloppent la flèche et le cercle de proximité.
- **3.7-bis — Nettoyage pré-terrain de la simulation** : `ENABLE_SIMULATION = false` dans
  `js/simulation.js`, garde-fous `simulationDisabled()` sur `generateSimulationData()`,
  `simulateGpsFrame()` et `simulateGpsAt()`, suppression des boutons « Mode Simulation » et
  « Simuler une trame GPS » d'`index.html`, documentation de réactivation dans
  `docs/simulation.md` (classes CSS conservées).
- **3.9 — Refonte du bandeau d'onglets** : libellés `📡 GPS` (ex-DONNÉES) et `📊 RELEVÉ`
  (ex-STATS), les autres inchangés. `.tabs` passe sur `var(--green-dark)`, une seule ligne
  scrollable (`overflow-x`, scrollbar masquée). `.tab` : 44 px de haut minimum, padding
  `13px 18px`, 12 px / 700, inactifs `rgba(255,255,255,0.7)`, transitions 0,18 s.
  `.tab.active` : fond `var(--bg)`, texte `var(--green-dark)`, 800, liseré 3 px
  `--color-primary-accent` en haut et en bas ; override nuit sur `--color-bg-muted` +
  `--color-primary-accent`. Responsive ≤ 360 px ajusté. Aucun changement de `showTab()`.
- **3.9-bis — Onglets « pills » (style boutons)** : les `<div class="tab">` sont remplacés
  par `<input type="radio" class="tab-input">` + `<label class="tab-label">` dans un
  `.tabs-wrapper` ; l'état actif est géré en CSS par `.tab-input:checked + .tab-label`
  (pill vert `--green-main` + `--shadow-md`, inactifs blancs `--color-white` + `--shadow-sm`).
  `showTab()` ne manipule plus `.tab` : elle coche le radio `#<tabId>-radio` pour rester
  synchrone avec les appels de `map.js` et `history.js`. Overrides nuit dans `theme.css`
  (pill active `--color-primary-accent` / texte `--green-dark`), sélecteur plein écran caméra
  mis à jour (`.tabs-wrapper`).
- **3.10 — Boutons terrain « premium » et icônes SVG outline** : les 5 emoji des boutons
  ronds (`🟢 🔴 🟡 🏠 ➕`) sont remplacés par des SVG inline `fill: none` /
  `stroke: currentColor` (30 px, 26 px sous 360 px), colorés par `color` du bouton.
  `.terrain-btn-circle` gagne un relief (`box-shadow` double interne + ombre portée), un
  dégradé vertical et un reflet `::before` (`pointer-events: none`) ; les variantes passent
  de `background:` à `background-color:` pour ne pas écraser le dégradé. Survol réservé aux
  pointeurs fins (`@media (hover: hover) and (pointer: fine)`), clic enfoncé
  (`translateY(1px) scale(0.94)`). La propriété invalide `active-scale` est supprimée.
  Overrides nuit dans `theme.css` (reflet atténué, ombre noire renforcée).
- **3.11 — Libellés dans les boutons terrain** : les quatre premiers boutons de la barre
  terrain (Tonte, Interdit, Obstacle, Base) affichent leur texte **dans le cercle** via
  `.terrain-btn-text` (TONTE, INTERDIT, OBSTACLE, BASE — 10 px / 800, 9 px sous 360 px,
  `color: inherit` donc `--color-warning-text` pour l'obstacle, `pointer-events: none`).
  Les SVG inline correspondants sont retirés du HTML ; « Nouvelle zone » conserve son icône
  `+` en SVG et son libellé `.terrain-btn-label` sous le cercle. `.terrain-btns` passe en
  `align-items: flex-start` pour aligner parfaitement les cinq cercles sur la même ligne
  haute malgré le libellé sous le cinquième bouton. Les identifiants (`btnTonte`,
  `btnInterdit`, `btnObstacle`, `btnBase`, `btnNewZone`), les couleurs et
  `updateTerrainButtons()` sont inchangés.
- **3.12 — Suppression de la base et poubelle de parcelle** : la fonction « base du rover » est
  supprimée de bout en bout — bouton `🏠 Définir la base` (onglet POINTS), bouton BASE de la
  barre terrain, `recordBase()` / `getBase()`, compteur `base`, couche Leaflet `layerBase`,
  icône maison, Feature GeoJSON `base` et filtrage `type !== 'base'` dans `computeStats()` et
  `calculateConvexHull()`. Les anciens points `base` du `localStorage` sont purgés par
  `normalizeProject()`. La simulation génère désormais 14 points (sans base). Ajout du bouton
  `#btnDeleteProject` (`🗑`) dans la barre PARCELLE → `deleteCurrentProject()`, avec rafraîchissement
  de la zone courante, de la carte, de la liste, des statistiques et de l'historique.
- **3.12-bis — Bandeau Parcelle sur GPS et édition des noms** : `syncProjectBarVisibility()`
  masque `#projectBar` sur l'onglet GPS (`tab-data`) et l'affiche ailleurs. Bouton
  `#btnRenameProject` (`✏️`) dans la barre PARCELLE → `renameCurrentProject()` ; bouton `✏️`
  sur chaque ligne POINTS et dans la popup carte → `renamePoint(id)`. Le nom personnalisé est
  stocké dans `point.name`, affiché à la place du sous-type (`getPointDisplayName()`), exporté
  en `properties.name` pour les obstacles. La popup carte reçoit aussi un bouton `🗑` de
  suppression (`deletePoint()`). Noms vides refusés.
- **3.13 — Suppression de l'onglet GPS, onglets boutons et bandeau sous les onglets** :
  l'onglet `GPS`/`DONNÉES` (`#tab-data`) est supprimé (doublon avec POINTS) ; `APP.currentTab`
  démarre sur `'tab-points'` et l'écran POINTS porte `.active`. Les `<input type="radio">` +
  `<label>` sont remplacés par cinq `<button class="tab-label" data-tab="…">` (POINTS, CARTE,
  CAMÉRA, RELEVÉ, HISTORIQUE) ; `showTab()` pose la classe `.active` et restaure le
  `scrollLeft` de `.tabs-wrapper` pour supprimer tout retour à gauche au clic. `#projectBar`
  est déplacé sous `.tabs-wrapper` (toujours visible, `margin-bottom: 12px`) ;
  `syncProjectBarVisibility()` est supprimée. `js/ui.js` est réduit au bandeau Fix et aux
  alertes (`updateDataCards`, `updateDetailCard`, `updateRawData`, `toggleDataDetails`,
  `showEmptyState`, `colorSat`, `colorHdop` supprimés) ; le bouton « Ouvrir » de
  `history.js` cible désormais `tab-points`. CSS : `.tab-input` et les sélecteurs
  `:checked + .tab-label` remplacés par `.tab-label.active` ; styles morts de l'onglet GPS
  retirés.
- **3.14 — Onglet TRACÉS, export GeoJSON prioritaire et distances sur la carte** : l'onglet
  `tab-points` est libellé `📍 TRACÉS` (le `data-tab` reste `tab-points`). La barre d'actions
  devient `.actions-bar-export` (grille) : bouton principal `.export-primary`
  « ⬇ Exporter GeoJSON », bouton `⋮` (`#btnExportMenu`) ouvrant `#exportMenu` avec CSV/GPX,
  puis « Effacer » (remplacé en 3.30 par les boutons de la vue POINTS). `leaflet-measure-path` 1.5.0 (CDN) affiche la longueur de chaque segment
  des polygones de tonte (`showMeasurements`, `ZONE_MEASUREMENT_OPTIONS`) ; le libellé est mis
  en forme dans `css/map.css`. Le `padding-bottom` de `.screen` passe à 190 px pour que la
  barre d'export reste accessible au-dessus de la barre terrain fixe. Message de la caméra mis
  à jour (« onglet TRACÉS »).
- **3.15 — Cible fixe au centre de la carte** : `#map` est enveloppé dans `.map-wrapper`
  (`position: relative`) ; `#map-crosshair` (SVG 64 px) est centré en absolu
  (`top/left: 50%`, `translate(-50%, -50%)`), `z-index: 1000`, `pointer-events: none`, et ne
  bouge pas lors du panoramique. Couleur centralisée par `--color-crosshair` (`#16a34a`) dans
  `main.css`, appliquée en `stroke`/`fill`.
- **3.16 — Non-régression export/manuel et GPS périmé** : campagne de tests hors navigateur
  (banc Node chargeant les vrais JS avec des stubs `document`/`localStorage`) couvrant le mode
  manuel, le contrat GeoJSON, la priorité GPS, la persistance et la migration. Correction
  associée : `getGpsPositionForMap()` (`js/map.js`) renvoie `null` tant que `APP.bleConnected`
  est faux, car `onDisconnected()` (`js/ble.js`) ne purge pas `lastGpsData` / `lastMapPosition`.
  Sans ce garde-fou, `mountMapForTab()` recentrait la carte sur une position GPS périmée au
  retour sur TRACÉS (`followGps` vaut `true` par défaut) et déplaçait la cible du mode manuel.
- **3.17 — Nettoyage CARTE/TRACÉS : capsule flottante et carte plein écran** : la cible
  `#map-crosshair` n'est visible que sur TRACÉS (`.is-hidden` posée par
  `syncCrosshairVisibility()` appelée par `showTab()`). L'icône 📍 de l'état vide de la liste
  (rendue comme une épingle rouge, prise pour un marqueur POI) est supprimée et le texte renvoie
  à la barre flottante. La position live (`liveMarker`, `livePolyline`) est effacée à la
  déconnexion BLE par `clearLiveGpsPosition()` (`onDisconnected()`). `.app-wrapper` passe en
  `height: 100dvh; overflow: hidden` et chaque `.screen` défile en interne ; TRACÉS affiche la
  carte sur toute la hauteur visible (`#map-points { height: 100% }`), la liste et l'export
  restant accessibles en dessous. La barre terrain fixe (`.terrain-bar`,
  `syncTerrainBarVisibility()`, `padding-bottom: 190px`) est remplacée par `.floating-toolbar`,
  capsule `absolute` dans `#map-points` ; « Nouvelle zone » affiche son libellé
  `.terrain-btn-sub` dans le cercle.
- **3.18 — Boutons de la capsule sans effet glossy** : `.terrain-btn-circle` passe en style
  plat — plus de `background-image` (dégradé), plus d'ombres `inset`, plus de `::before`
  (reflet), plus de `text-shadow` ni de `drop-shadow` sur l'icône. Seule une ombre externe
  `--shadow-sm` détache le bouton de la capsule ; survol `brightness(0.95)`, clic
  `scale(0.95)`, état désactivé `opacity: 0.35` + `saturate(0.7)`. Les overrides nuit
  correspondants sont supprimés de `theme.css` et la capsule passe à `border-radius: 40px`.
- **3.19 — Métré dès le 2ᵉ point de tonte** : `renderMap()` crée une `L.polyline` temporaire
  (`tempMeasureLine`) entre les 2 points de la zone courante et lui applique
  `showMeasurements(ZONE_MEASUREMENT_OPTIONS)` ; `clearTempMeasureLine()` la retire dès le
  3ᵉ point (le polygone mesuré prend le relais) et à chaque rendu. `ZONE_MEASUREMENT_OPTIONS`
  reçoit `showTotalDistance: false` pour éviter la 2ᵉ étiquette « longueur totale » que le
  plugin ajoute par défaut sur les polylignes.
- **3.20 — Bandeau Parcelle remplacé par un tiroir** : `#projectBar` (bandeau sous les onglets)
  est supprimé au profit d'un bouton compact `#btnProjectDrawer` dans le header (nom de la
  parcelle courante) ouvrant le tiroir `#projectDrawer` (overlay + panneau latéral). La liste
  `#projectListContainer` propose par parcelle : sélection (`switchProject`), renommage
  (`renameProject`), suppression (`deleteProject`) et création (`＋ Nouvelle parcelle`).
  `saveProjects()` rafraîchit la liste **et** le libellé du header ; fermeture au clic sur le
  voile, avec Échap et au changement d'onglet. `renderProjectSelect()` et `initProjectBar()`
  sont supprimés (`initProjectUI()`), les identifiants `#btnNewProject` / `#btnRenameProject` /
  `#btnDeleteProject` disparaissent. Le doublon historique `deleteProject()` de `js/history.js`
  est supprimé : la suppression est centralisée dans `js/projects.js`. Z-index revus : voile
  1040, tiroir 1050, modales 1100, toasts 1200.
- **3.20-bis — Base globale des obstacles et import à la création** : nouvelle clé
  `rtkGlobalObstacles` (bibliothèque `{ id, name, subtype, icon, lat, lon, alt, rayon,
  createdAt, projectId }`), chargée dans `globalObstacles` et **amorcée depuis les parcelles**
  au premier lancement. `recordObstacle()` alimente la base via `addGlobalObstacle()`
  (dédoublonnage nom + coordonnées). La modale `#projectModal` gagne un sélecteur
  (`#globalObstacleList`, `.import-obstacle-check`, bouton « Tout cocher ») ;
  `createProject()` passe les IDs cochés à `addProject()`, qui importe via
  `importGlobalObstacles()` avant le rendu (nouveaux IDs, `importedFrom`, doublons ignorés).
  Carte, liste, badge de zone et RELEVÉ sont rafraîchis ; le contrat GeoJSON est inchangé.
- **3.21 — Zones interdites multiples et libellé Parcelle** : chaque point `interdit` porte un
  `zoneId` et le projet stocke `currentInterditZoneId` (migration par `normalizeProject()`).
  `recordInterdit()` enregistre dans la zone courante ; `startNewInterditZone()` (bouton
  « ＋ Nouvelle zone interdite » de la liste TRACÉS, garde-fou ≥ 3 points) incrémente la zone.
  Carte et export produisent un polygone / une Feature `zone_interdite` **par zone**
  (`zone_id`, nom `Zone interdite` pour la zone 1 puis `Zone interdite #N`), sans fusion ;
  `computeStats()` somme les surfaces par zone et `statInterdit` affiche le nombre de zones.
  Le bouton du header affiche « Parcelle : <nom> » (`.header-project-label`).
- **3.22 — Suppression de CARTE, modes lecture/création, zones modifiables et plein écran** :
  l'onglet CARTE et l'écran `#tab-map` sont supprimés (4 onglets restants) ; Relief/Satellite
  et le plein écran deviennent des contrôles flottants sur la carte TRACÉS
  (`.map-floating-controls`), Exporter/Effacer restant dans la barre d'actions. `APP.tracesMode`
  (`lecture` par défaut, `creation` pour une nouvelle parcelle ou via `#btnTracesMode`) masque
  la capsule et la cible en lecture et bloque `recordTonte/Interdit/Obstacle` via
  `canRecordPoints()`. Les polygones de zones ouvrent une popup `zonePopup()` avec
  `renameZone()` / `deleteZone()` (noms dans `project.zoneNames`). `toggleMapFullscreen()`
  ajoute `body.map-ui-fullscreen` (header, onglets, tiroir et panneau masqués). Le header
  affiche « Parcelle : <nom> » via `.header-project-label`.
- **3.23 — Audit responsive mobile** : header compact ≤480 px (logo 14 px sans « v2 », thème,
  BLE en icône seule via `.ble-icon` / `.ble-label`, parcelle sur la même ligne grâce à
  `display: contents` sur `.header-top` / `.header-actions`), onglets en icônes seules
  (`.tab-icon` / `.tab-text`, `title` + `aria-label`) sans débordement, capsule 48 px (44 px
  ≤360) avec gaps réduits. Cibles tactiles ≥44 px partout (`button { min-height: 44px }`, zoom
  Leaflet et contrôles flottants 44 px, actions de liste/tiroir 44 px) et textes de contrôle
  portés à 12 px. Breakpoints documentés dans `docs/design-system.md`.
- **3.24 — Contrôles carte et modales personnalisées** : `.map-floating-controls` déplacé dans
  `#map-points-slot` (`position: relative`) et calé à `top: 110px`, soit **8 px sous le zoom
  Leaflet** (la barre de mode ne décale plus le `top`). Les contrôles GPS restent en
  `bottomleft` (les trois contrôles sont au-dessus d'eux) et basculent en `bottomright` si la
  carte mesure moins de 430 px de haut (`ensureGpsControlPosition()`, paysage), pour ne jamais
  croiser le rail gauche. Ajout de la modale `#customModal` (`openCustomModal`, `customConfirm`,
  `customPrompt`) : tous les `confirm()` / `prompt()` natifs sont remplacés (parcelles, zones,
  points, effacement), validation du nom vide dans la modale, Échap / voile / Annuler, focus
  piégé et restauré.

- **3.25 — Barre de navigation basse** : les quatre onglets quittent le haut et deviennent une
  barre fixe en bas (`#bottomNav`, `.tabs-wrapper.bottom-nav`) placée hors de `.app-wrapper`.
  Quatre boutons de largeur égale, icône + **libellé visible** (12 px, 11 px ≤ 340 px), actif
  vert avec liseré supérieur `--color-primary-accent` (`aria-current="page"`). `.screen`
  réserve `--bottom-nav-height` (64 px) + `env(safe-area-inset-bottom)` ; `viewport-fit=cover`
  activé pour l'iPhone. La barre est sous le tiroir (1040/1050), les modales (1100) et les
  toasts (1200), et masquée en plein écran carte/caméra. Thème nuit : libellés vert clair,
  inactifs à `opacity: 0.65` ; badge de mode et bouton « Terminer » rendus lisibles.
- **3.26 — Fonctions pro terrain** : verrouillage anti-fausse manip (`body.locked`,
  `#lockOverlay`, bouton flottant `#btnLock`, glissement `.lock-swipe`, gestes Leaflet coupés,
  enregistrement bloqué), partage natif du GeoJSON (`shareGeoJSON()` + `buildGeoJSON()`,
  fallback toast), métadonnées `date_creation` / `version_app` / `source` sur toutes les
  features et sauvegarde locale renforcée (autosave 30 s, `pagehide`/`visibilitychange`,
  indicateur `💾` qui clignote). Le contrat GeoJSON reste inchangé (ajout de propriétés).
- **3.27 — Correction des métadonnées d'export** : le `created_at` du domaine est forcé à
  `date_creation` (première capture), et non plus à l'ancien `project.createdAt` ; le premier
  point d'une parcelle vide met aussi `project.createdAt` à son timestamp. Les obstacles
  portent `date_creation = point.timestamp` (date de leur propre capture), tandis que le
  domaine et les zones conservent la première capture du projet.
- **3.28 — Menu « + ZONE » (tonte / interdite)** : le bouton `+ ZONE` de la capsule ouvre
  `#zoneModal` (`openZoneMenu()`, `selectNewZone()`) au lieu d'appeler directement
  `startNewZone()`. Deux options pleine largeur : « Nouvelle zone de tonte » →
  `startNewZone()` et « Nouvelle zone interdite » → `startNewInterditZone()` (garde-fou
  ≥ 3 points et toast « Nouvelle zone interdite #N »). `recordInterdit()` reste rattaché à
  `getCurrentInterditZoneId()` via `buildPoint()`. Le menu se ferme au choix, au clic sur le
  voile, avec Échap et au changement d'onglet ; il est bloqué en mode lecture et écran
  verrouillé. Le toast de la dernière capture est masqué à l'ouverture pour ne pas recouvrir
  les options. Le bouton OBSTACLE conserve son menu et son flux indépendants. CSS :
  `.zone-choice-grid` / `.zone-choice` (2 × 60 px, icône 26 px, survol vert ou rouge).
- **3.29 — Correction de la création des zones de tonte et interdites** : le câblage de la
  modale était correct (`selectNewZone('tonte')` → `startNewZone()`,
  `selectNewZone('interdit')` → `startNewInterditZone()`), mais une zone nouvellement créée
  est vide. `normalizeProject()` ramenait `currentZoneId`/`currentInterditZoneId` à
  `maxZone` au rechargement, et les recalculs après suppression faisaient de même : les
  points suivants partaient dans l'ancienne zone. La normalisation et les recalculs
  acceptent désormais `maxZone + 1` (zone vide en cours) tout en recalant les valeurs
  réellement obsolètes. Tests : zones #2 tonte et interdite avec 3 points, rechargement
  d'une zone vide, export de 2 Features `zone` et 2 Features `zone_interdite` (`zone_id`
  1 et 2).
- **3.30 — Vue POINTS, verrouillage du type et toasts allégés** : `#btnPointsPanel` ouvre
  désormais `#pointsViewOverlay` (`openPointsView()`) avec la liste, le compteur, la zone
  courante, les exports GeoJSON/CSV/GPX, le partage et « Effacer » ; fermeture par bouton,
  voile, Échap et changement d'onglet. `APP.currentTraceMode` verrouille le type
  (`tonte`/`interdit`/`obstacle`) ; changer de type demande une confirmation et un obstacle
  ne peut pas être créé au milieu d'une zone. Le badge `#traceModeBadge` et l'anneau
  `.trace-active` rendent le mode visible. Les toasts de création de point sont supprimés
  (les erreurs restent). Le dialogue de type utilise `customConfirm()`.
- **3.31 — FAB unique et démarrage sans parcelle** : la capsule (`.floating-toolbar`) et la
  modale `#zoneModal` sont supprimées. `#traceFab` apparaît uniquement si une parcelle est
  sélectionnée ; neutre, il ouvre un menu vertical (tonte / interdite / obstacle) puis devient
  le bouton d'ajout coloré (vert / rouge / jaune) avec un bouton secondaire « ✓ ». Le second
  bouton termine la zone (confirmation sous 3 points) et un appui long sur l'un des deux
  boutons rouvre le menu. Un obstacle est ponctuel et remet le FAB en neutre. Le projet
  « Mon jardin » n'est plus créé automatiquement : le premier lancement reste sans parcelle,
  sans FAB, et la création passe par le header.
- **3.32 — Suppression de la dernière parcelle et FAB fixe** : `deleteProject()` accepte
  désormais la suppression de la dernière parcelle ; l'état revient à `currentProject = null`,
  carte vide, header « Aucune », tiroir vide avec création, FAB masqué. `.trace-fab` passe en
  `position: fixed`, `bottom: calc(80px + safe-area)`, `z-index: 1002` ; `syncTraceFabUI()`
  le masque hors TRACÉS et `showTab()` le resynchronise. Tests : suppression de la dernière
  parcelle, disparition du FAB, couches carte vidées et FAB visible à 56 px au-dessus de la
  navigation.
- **3.35 — FAB centré et dernière parcelle** : `.trace-fab` passe de `right: 20px` à
  `left: 50%; transform: translateX(-50%)`, avec `bottom: calc(80px + safe-area)`. Le bouton
  secondaire est en position absolue à gauche pour que le bouton principal reste exactement
  centré ; le menu vertical est centré au-dessus. La suppression de la dernière parcelle est
  confirmée sans garde `projects.length` : `currentProject = null`, stockage courant retiré,
  header « Aucune », tiroir vide, FAB masqué et carte vidée. Le bouton 🗑 reste actif et
  indique « Supprimer la parcelle (même la dernière) ».

- **3.37 — Icône BLE SVG et FAB unifiés (TRACÉS / CAMÉRA)** : l'icône Bluetooth est un SVG
  Lucide (`m7 7 10 10-5 5V2l5 5L7 17`) dans `.ble-icon-container`, entouré de trois
  `.ble-waves` animées ; état bleu `--color-ble-disconnected`, état vert
  `--color-ble-connected`. Le bandeau `.map-mode-bar` devient un **HUD flottant** sur la carte
  (`position: absolute`, `top: 10px`, `left: 62px`, `pointer-events: none`), ce qui rend ~44 px
  à la carte. L'onglet CAMÉRA perd `camera-mode-bar` et `camera-top` : la cible et les
  coordonnées passent dans le HUD `.camera-hud`, et un **FAB identique à TRACÉS**
  (`#cameraFab`) propose « Rejoindre un point » / « Mesurer une distance », avec bouton
  secondaire « ✓ » pour quitter et appui long pour rouvrir le menu. `cameraMode` démarre à
  `null`. Le plein écran caméra masque header + barre GPS comme la carte et rapproche le FAB
  du bord bas (24 px) ; `syncCameraFabUI()` est appelée par `showTab()`.

- **3.38 — Nettoyage IHM (cibles obstacles, carte plein cadre, FAB, SVG)** : le sélecteur de
  cible CAMÉRA ne liste plus que les points `obstacle` (`populateTargetSelect()`) et adapte sa
  hauteur au nombre d'obstacles (3 à 7 lignes). Le bandeau `.map-mode-bar` (MODE MANUEL /
  Cible : centre / POINTS) est supprimé, ainsi que le code mort `recordModeBadge`,
  `traceModeBadge` et `updateRecordModeBadge()`. Le bouton POINTS devient la 4ᵉ option
  « 📋 Voir les points » du menu FAB TRACÉS (`openPointsView()`) ; à la fermeture de la vue,
  le focus revient au FAB. La navigation basse utilise des **SVG Lucide inline** (map-pin,
  camera, bar-chart, clock) en `currentColor`, avec les libellés conservés.
- **3.39 — Refonte du header et menu unifié** : la barre Fix `#fixBar` (sous le header) est
  supprimée ; le header devient une **seule ligne** (`position: sticky`, `z-index: 200`,
  `min-height: 56px`) avec le logo compact `🌾 RTK Mower` (`.header-logo` / `.logo-text`), la
  pastille de statut GPS `#headerGpsStatus` (`.gps-status-pill` + `.status-dot`, alimentée par
  `updateFixBar()` / `setGpsStatusIdle()`) et le bouton `#btnHeaderMenu` (`.header-menu-btn`).
  Les contrôles secondaires (parcelle, Bluetooth, NTRIP, thème, indicateur de sauvegarde,
  diagnostics GPS) passent dans un menu déroulant `#headerMenu`. `js/app.js` gagne
  `openHeaderMenu()` / `closeHeaderMenu()` / `toggleHeaderMenu()` / `initHeaderMenu()`
  (fermeture par Échap et par clic hors du menu) ; `#btnProjectDrawer` quitte le header et
  `.header-project-label` disparaît, comme `.header-top`, `.header-actions`, `.logo` et
  `.logo-sub`.
- **3.40 — Optimisation du menu Header** : `#headerMenu` et son nouveau voile
  `#headerMenuOverlay` sont **sortis de `<header>`** (placés après `.app-wrapper`) pour échapper
  au contexte d'empilement du header : `z-index` 4000 / 3999, au-dessus du verrouillage écran
  (3000). Le menu est repositionné (`top: calc(env(safe-area-inset-top) + 62px)`, largeur
  `min(340px, 100vw - 20px)`, `--shadow-xl`, scroll interne) et restructuré en **deux lignes**
  `.menu-row` : thème `.menu-icon-btn`, BLE `.menu-ble-btn` en icône seule et NTRIP
  `.menu-ntrip-select` ; puis `Parcelle :`, `.menu-project-btn` et `#saveIndicator`. La classe
  `.header-menu-hint` (`#statusText`), les diagnostics `#fixDot` / `#fixName` / `#fixPrec` et le
  libellé « CONNECTER BLE » sont supprimés : `setBleStatus()` n'écrit plus que l'icône
  (`getBleIconMarkup()`) avec `title` / `aria-label`, `updateFixBar()` ne pilote que la pastille.
  Le bouton `#btnHeaderMenu` remplace l'emoji `☰` par une **icône SVG Lucide** (`M4 5h16`,
  `M4 12h16`, `M4 19h16`, 24 px, 22 px ≤ 360 px) et `.header-menu-btn` perd `font-size` /
  `font-family` / `line-height`. `menu-test.html` (page de démonstration versionnée) reçoit la
  même icône ; `#headerMenu` / `#headerMenuOverlay` sont explicitement masqués en plein écran
  carte (`map.css`) et caméra (`theme.css`).
- **3.41 — Icônes SVG Lucide des actions du tiroir Parcelles** : les emoji `✏️` (renommer) et
  `🗑` (supprimer) générés par `renderProjectList()` (`js/projects.js`) sont remplacés par deux
  constantes de markup SVG Lucide (`ICON_PENCIL`, `ICON_TRASH` : 18 px, `fill: none`,
  `stroke: currentColor`, `aria-hidden="true"`, `focusable="false"`).
  `.drawer-project-actions button` passe en `inline-flex` centré (les `font-size` / `line-height`
  devenus inutiles sont retirés) et `.drawer-project-actions button svg` en `display: block` /
  `pointer-events: none` : trait neutre (`--text`) pour le crayon, rouge (`--color-danger`) pour
  la corbeille. Aucun changement de comportement (`renameProject`, `deleteProject`).
- **3.42 — Icônes SVG Lucide dans tous les boutons d'action** : les emoji d'action restants sont
  remplacés par des SVG Lucide. `js/app.js` centralise `ICON_PENCIL`, `ICON_TRASH`, `ICON_MOON`,
  `ICON_SUN`, `ICON_CROSSHAIR` et `ICON_RULER` (les constantes du tiroir quittent
  `js/projects.js`). Migrés : `.btn-edit` / `.btn-del` de la liste POINTS (✏️ et ✕ → crayon /
  corbeille), `pointPopup()` et `zonePopup()` (`js/map.js`), bouton « Suppr. » de
  `js/history.js`, bouton « Effacer » de la vue POINTS, FAB CAMÉRA (`syncCameraFabUI()`),
  bascule de thème lune / soleil (`applyTheme()`), bouton Parcelle (map-pin), menus FAB TRACÉS
  (pastilles `<circle>` colorées par `.trace-fab-item-icon.tonte/interdit/obstacle` et
  `clipboard-list`) et CAMÉRA (`crosshair`, `ruler`), sélecteur de cible caméra. CSS :
  conteneurs `inline-flex` centrés, `.popup-btn` et `.btn-action-bar` en `inline-flex` avec
  `gap`, `svg { pointer-events: none }`. Les toasts « Mode lecture — ✏️ Modifier… » sont
  reformulés sans emoji. Restent volontairement en emoji : les icônes **de données**
  (`point.icon`, types d'obstacles), les libellés statistiques (🟡 obstacles, 🔴 zones
  interdites) et les boutons hors périmètre (🗺 🛰 ⛶ 🔒 de la carte, ⬇ des exports, 📤 du
  partage, 📂 / ⬇ de l'historique, ＋ ✓ ✕ ⋮).
- **3.43 — Header sur deux lignes et panneau « Connexion »** : le header passe de une à
  **deux lignes** : (1) `.header-top-row` avec le logo et `#btnConnectionSettings`
  (`.header-connection-btn`, icône `settings` + « Connexion »), (2) `.header-bottom-row` avec
  la pastille `#headerGpsStatus` et `.header-actions-group` (thème `#btnTheme` + BLE
  `#btnBle`, tous deux `.header-icon-btn`). Le bouton hamburger `#btnHeaderMenu` et les classes
  `.header-menu-btn` / `.menu-icon-btn` / `.menu-ble-btn` disparaissent. `#btnTheme` et `#btnBle`
  quittent `#headerMenu`, qui se réduit à la station NTRIP puis à `Parcelle :` +
  `#btnProjectDrawer` + `#saveIndicator` (libellé `NTRIP` réintroduit).
  `js/app.js` gagne `getHeaderMenuTrigger()` (retourne `#btnConnectionSettings`, repli sur
  l'ancien id), `positionHeaderMenu()` (aligne le panneau sous le header mesuré, recalculé au
  `resize`) et `toggleConnectionPanel()` (alias de `toggleHeaderMenu()`). `openHeaderMenu()` /
  `closeHeaderMenu()` / `initHeaderMenu()` et le focus de `js/projects.js` ciblent le nouveau
  déclencheur. CSS : `header` en `flex-direction: column` (gap 6 px), boutons translucides
  `.header-connection-btn` (36 px, rayon 999 px) et `.header-icon-btn` (40 px, 38 px ≤ 480 px),
  suppression des règles mortes du bouton menu. Vérifié à 360 / 390 / 480 px et en thème nuit,
  panneau ouvert et fermé.
- **3.44 — Bouton thème en SVG Lucide 20 px** : `ICON_MOON` / `ICON_SUN` (`js/app.js`) passent de
  18 à 20 px et `applyTheme()` injecte l'icône **directement dans `#btnTheme`**
  (`btn.innerHTML = isDark ? ICON_SUN : ICON_MOON`). Le conteneur `<span class="theme-icon">`
  et les règles CSS `.theme-icon` sont supprimés : `.header-icon-btn > svg` assure
  `display: block`, `flex-shrink: 0` et `pointer-events: none`. `index.html` et
  `menu-test.html` portent le SVG lune 20 px comme contenu initial (remplacé au chargement).
- **3.45 — Fusion de la vue POINTS dans l'onglet HISTORIQUE** : `#pointsViewOverlay` est supprimé.
  La section `#pointsSection` (zone, compteur, `#pointsList`, partage, exports GeoJSON/CSV/GPX,
  « Effacer ») ouvre l'onglet `#tab-history`, suivie de « PARCELLES / SESSIONS ». L'option du
  menu FAB TRACÉS devient « Historique » (icône `clock`) et appelle toujours
  `openPointsView()`, qui rend les listes, bascule sur l'onglet et centre la section.
  `showTab('tab-history')` rend la liste des points **et** l'historique ; `closePointsView()`
  devient un no-op (appels de compatibilité), `togglePointsView()` / `scrollToPointsPanel()`
  restent des alias. CSS : `.history-screen` / `.history-section` / `.points-section-head`
  remplacent `.points-view-box`, `.points-view-head`, `.points-view-title` et
  `.points-view-close` ; `.points-view-body` n'a plus de hauteur contrainte (c'est `.screen`
  qui défile). `index.html` et `menu-test.html` alignés.
- **3.46 — Allègement carte / caméra et parcelle dans le FAB** : le menu FAB TRACÉS perd
  l'option « Historique » (`openPointsView()` et ses alias supprimés : l'onglet HISTORIQUE
  reste le seul accès) et gagne la 4ᵉ option « Parcelle : <nom> »
  (`#btnProjectDrawer`, `.trace-fab-item.project`, `openProjectDrawer()`, libellé mis à jour
  par `renderProjectList()`). Le panneau Connexion ne contient plus la parcelle : station
  NTRIP + `#saveIndicator` puis switch `#btnPointNumbers` « Numéros des points »
  (`rtkShowPointNumbers`, désactivé par défaut, `togglePointNumbers()` / `renderMap()`), avec
  un repli `#menuEmptyProjectRow` (« ＋ Créer une parcelle ») visible seulement sans parcelle
  pour ne pas perdre l'accès à la création au premier lancement. Les labels de zone
  (`addZoneLabel()`, classe `.zone-name-label`) n'affichent plus que le code `ZT1` / `ZI1`
  (surface conservée dans `zonePopup()` et l'export). La boussole du HUD caméra
  (`.cam-compass-inline`) perd son cercle (plus de `border`, `border-radius`, `background` ni
  d'états `.ok` / `.warn` colorés). `index.html` et `menu-test.html` alignés ; banc Node de
  non-régression (17 vérifications) au vert.
- **3.47 — Hub de transfert et icônes Lucide d'export** : le bouton `📤` de la section POINTS
  devient `#btnTransfer` (« Transférer », icône Lucide `share-2`, `.transfer-trigger`) et ouvre
  la modale `#transferModal` (`js/export.js`) à quatre canaux : partage natif
  (`transferViaNativeShare()` → `shareGeoJSON()`), mode serveur local
  (`transferViaLocalServer()` : adresse LAN via `GET /api/local-info` de `serve-http.cjs`,
  bouton « Copier », QR code en placeholder « Bientôt »), cloud (`transferViaCloud()` →
  `navigator.share`, Drive proposé par Android) et téléchargement
  (`transferOpenDownloads()` → surbrillance `.points-view-actions`). Fermeture au voile, avec
  Échap (prioritaire sur le menu d'export) et au changement d'onglet, piège de focus et retour
  du focus sur `#btnTransfer` ; sans point, toast « Aucun point à transférer ». Les icônes `⬇`
  des exports GeoJSON/CSV/GPX ainsi que `⬇ CSV` / `📂` de l'historique passent en SVG Lucide
  (`download`, `folder-open`) ; `.points-view-icon` (bouton `📤` supprimé) est retiré du CSS.
  CSS : `.transfer-option` (survol `translateY(-1px)`, bordure verte, ombre), pastilles d'icône
  colorées par canal (`share`/`local`/`cloud`/`download`), overrides nuit, animation
  `transfer-highlight` (désactivée en `prefers-reduced-motion`). Banc Node : 23 vérifications
  au vert (ouverture, 4 canaux, `navigator.share`, adresses locales, presse-papiers).
- **3.48 — Lucide partout, FAB réorganisé, plein écran et popups** : derniers emoji des
  contrôles remplacés par des SVG Lucide — contrôles de carte (`map`, `satellite`,
  `maximize`/`minimize`, `lock`/`unlock`), FAB (`plus`, `check`), boussole du HUD (`compass`),
  chevron du sélecteur de cible (`chevron-down`), tiroir (`x`, `plus`), « Actualiser »
  (`refresh-cw`), « Créer la parcelle » (`plus`), cadenas du verrouillage (`lock`, `unlock`) et
  indicateur de sauvegarde (`save`). Nouvelles constantes `ICON_PLUS`, `ICON_MAXIMIZE`,
  `ICON_MINIMIZE`, `ICON_LOCK`, `ICON_UNLOCK`, `ICON_COMPASS` dans `js/app.js` ;
  `setMapFullscreen()`, `setCameraFullscreen()`, `setScreenLock()`, `syncCameraFabUI()` et
  `getCompassAndCoordsRowHtml()` les injectent (plus de `textContent` emoji). Le panneau
  Connexion perd `#menuEmptyProjectRow` : il ne contient plus que deux blocs (NTRIP +
  sauvegarde / Affichage + numéros, `gap` 14 px). `#btnProjectDrawer` passe en **1re ligne**
  du menu FAB, avant les tracés. Sans parcelle, `#traceFab` reste visible et son clic ouvre le
  tiroir (`chooseTraceMode()` affiche « Créez d'abord une parcelle »). Le plein écran carte et
  caméra masque en plus les lignes et boutons du header (`display: none !important` +
  `visibility: hidden`). `pointPopup()` ne montre plus l'horodatage. Titres des modales
  « Type d'obstacle » / « Nouvelle parcelle » sans emoji. `index.html` et `menu-test.html`
  alignés ; banc Node : 22 vérifications au vert + captures Chrome headless (contrôles, menu
  FAB, panneau Connexion, plein écran).
- **3.49 — Header non compressible et nom de parcelle dans RELEVÉ** : cause réelle du
  chevauchement identifiée par mesure Chrome headless avec le vrai JS — le header, élément
  flex de `.app-wrapper`, était **comprimé** par le contenu (`header box h=85` alors que ses
  deux lignes descendaient à 102 px) : il débordait donc de 17 px sur l'écran. Correctif :
  `header { flex-shrink: 0 }`. Après correctif, mesure `header h=110 / screen top=110 /
  padding-top=0px` (ni chevauchement ni vide). Les deux tentatives précédentes sont
  abandonnées : la mesure JS `syncScreenHeaderOffset()` (elle ne voyait que la boîte du
  header, pas le débordement) et le `padding-top` fixe de 104 px (il créait 104 px de vide
  alors que le header restait écrasé) ; la ligne de padding reste en secours commenté avec
  `--header-height: 104px`. L'onglet RELEVÉ gagne `.stats-header` (titre + `#statProjectName`
  aligné à droite, filet commun, ellipse, `--color-primary-light` en thème nuit), rempli par
  `updateStatsDisplay()` (`js/stats.js`) : `statProjectName="Jardin Repro"` vérifié en capture.
- **3.50 — Icône Connexion seule, obstacle direct, majuscules et nom dans HISTORIQUE** :
  `#btnConnectionSettings` perd son libellé « Connexion » (bouton rond de 36 px / 34 px ≤ 480 px,
  icône `settings` 18 px, `title` + `aria-label` = « Connexion »). `chooseTraceMode('obstacle')`
  ferme le menu FAB puis ouvre **directement** la modale « Type d'obstacle »
  (`beginTraceMode()` → `openObstacleMenu()`), sans second clic sur le FAB.
  `#saveIndicator` expose `title` / `aria-label` = « Sauvegarde locale automatique »
  (complété par l'heure dans `flashSaveIndicator()`). Les noms de parcelle sont stockés en
  majuscules (`createProject()` dans `js/app.js`, `renameProject()` dans `js/projects.js`).
  L'en-tête de la section POINTS de HISTORIQUE affiche `Parcelle : <NOM>`
  (`#historyProjectName` + `.history-project-name`, rempli par `updateHistoryProjectName()`
  depuis `loadHistory()` et `renderProjectList()`). `index.html` et `menu-test.html` alignés ;
  vérifié par captures Chrome headless (bouton 36×36 sans texte, modale obstacle ouverte,
  « Parcelle : JARDIN REPRO ») et banc Node (7 vérifications au vert).
- **3.51 — Flux obstacle, icône Connexion nue, majuscules et titres PARCELLE** : le choix du
  type d'obstacle **n'enregistre plus rien** : `selectObstacleType()` mémorise
  `APP.pendingObstacle`, ferme la modale et laisse le mode obstacle actif (croix de visée,
  FAB ambre, titre « Valider l'obstacle « Arbre » ») ; le clic sur le FAB appelle
  `recordObstacle()` (seule validation), le bouton `check` est masqué en mode obstacle.
  `openObstacleMenu()` ne vérifie plus la position (elle l'est dans `recordObstacle()`) ;
  `closeObstacleMenu()` libère `pendingObstacle`. `#btnConnectionSettings` perd son cercle
  (`border: none`, `border-radius: 0`, `background: transparent`, 44 × 44 px, feedback par
  opacité). Les noms de parcelle sont **migrés en majuscules au chargement** par
  `normalizeProject()`, et les vues appliquent `toUpperCase()` + `text-transform`. Les titres
  deviennent « **PARCELLE : <NOM>** » dans RELEVÉ (`.stats-header`) et HISTORIQUE
  (`.points-section-head`). Vérifié par captures Chrome headless (aucun enregistrement à la
  sélection `8 → 8`, validation FAB `8 → 9`, bouton 44 px sans bordure, titres PARCELLE) et
  banc Node (19 vérifications au vert).
- **3.52 — Échap sur la modale obstacle, pastilles de type, header sans encadrement** :
  `initObstacleModal()` (`js/app.js`, appelée au `DOMContentLoaded`) ferme `#obstacleModal`
  avec **Échap** (`preventDefault` + `closeObstacleMenu()`), sauf si `#customModal` ou
  `#transferModal` est ouvert (ces modales capturent déjà Échap) ; le type en attente et le
  mode sont libérés. Les emoji 🟢/🔴/🟡 ne sont plus affichés dans l'interface : listes
  (le nom du point n'affiche plus `p.icon`, la pastille `.point-dot` suffit), popups carte, libellés RELEVÉ
  (« ● OBSTACLES » / « ● ZONES INTERDITES »), historique des sessions et cible caméra
  utilisent `.type-dot` (pastille CSS 10 px). Le champ `point.icon` et l'export GeoJSON sont
  **inchangés**. `.header-icon-btn` (thème, Bluetooth) perd son encadrement
  (`border: none`, `border-radius: 0`, `background: transparent`), passe à 44 × 44 px et signale
  le survol par l'opacité (0,8). Vérifié par banc Node (8 vérifications Échap) et captures
  Chrome headless : `modale avant=true / après=false`, `mode=null`, `pending=null`,
  « Point 1 » sans emoji + 8 `.point-dot`, « ● OBSTACLES » (1 pastille),
  `thème/BLE : 44x44 border=0px none radius=0px bg=rgba(0,0,0,0)`.
- **3.55 — Guidage vocal caméra et types d'obstacles en SVG** : le HUD CAMÉRA gagne un bouton
  `#btnCameraVoice` (SVG Lucide `volume-2` / `volume-x`, 42 px, `.camera-voice-btn`) placé avec
  le plein écran dans `.camera-hud-actions` (aligné à droite par `margin-left: auto`).
  `js/camera.js` expose `voiceGuidanceEnabled` (persistée dans `rtkCameraVoiceGuidance`,
  **désactivée par défaut**), `speak(text)` (`speechSynthesis`, `fr-FR`, `rate` 1,05, `cancel()`
  avant chaque annonce pour que la distance la plus récente gagne), `toggleCameraVoiceGuidance()`,
  `syncVoiceGuidanceUI()`, `resetVoiceGuidanceState()`, `getVoiceDirection()` et
  `buildVoiceThresholdMessage()`. `renderTargetMode()` appelle `processVoiceGuidance(dist, bearing)`
  après le calcul de la distance, du cap géographique et du cap courant : aux **mêmes seuils que
  le retour d'approche** (`APPROACH_THRESHOLDS_M` 10/5/2/1 m, hystérésis 0,5 m) elle annonce
  « Tournez à gauche, 10 mètres », « Tournez à droite, 2 mètres » ou « Cible à 5 mètres,
  continuez tout droit » (tolérance ±20°, `VOICE_STRAIGHT_TOLERANCE_DEG` ; sans cap :
  « Cible à 10 mètres »). Sous 0,5 m (`VOICE_ARRIVAL_M = CAMERA_HALO_ALERT_M`) : « Cible
  atteinte » + `playSuccessChord()` (arpège do-mi-sol Web Audio, `VOICE_ARRIVAL_CHORD_HZ`),
  réarmé au-delà de 1,5 m ; les seuils sont réarmés à chaque changement de cible ou de mode
  (`resetApproachFeedbackState()`), et `stopCamera()` coupe la synthèse en quittant l'onglet.
  Les types d'obstacles passent des emoji aux **SVG Lucide** (`OBSTACLE_ICON_SVG`,
  `getObstacleIconMarkup()`, `js/app.js`) ; la modale ne propose plus que **6 types**
  (Arbre, Perso, Souche, Talus, Poteau, Forage — Pierre, Bordure et Autre retirés) et
  `selectObstacleType()` conserve l'emoji en 2ᵉ argument pour ne pas modifier `point.icon`
  (donnée historique, export GeoJSON inchangé). CSS : `.obstacle-option-icon` (26 px, 20 px
  ≤ 360 px), `.obstacle-type-icon` (16 px), `.import-obstacle-icon`, `.camera-hud-actions`,
  `.camera-voice-btn` (+ états `.on` / `.off`). Vérifié par banc Node (65 vérifications) et
  Chrome headless/CDP (28 vérifications : bouton 42 × 42 px, 6 icônes de 26 px, bascule
  persistée `1 → 0`, liste « Arbre #1 » / « Pierre #2 » sans emoji, aucune exception JS).

## 9. Langue et communication

- Écrire en **français** (interface, commentaires, documentation, messages de commit).
- **Expliquer les hypothèses** et les écarts par rapport à la demande : ne jamais changer
  silencieusement un comportement, un contrat d'export ou un choix de fournisseur de tuiles.
- Signaler les limites connues (Web Bluetooth Android, tuiles sans clé, précision raster).
- Valider chaque modification : `node --check` sur les JS, vérification dans le navigateur
  (thème clair/sombre, carte, modales) et test de non-régression des exports.

