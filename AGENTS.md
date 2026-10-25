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
| Persistance | `localStorage` (`rtkProjects`, `rtkCurrentProject`, `rtkGlobalObstacles`, `rtkTheme`, …) |
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
- CSS : sections commentées, classes plates (`action-button`, `modal-box`, `terrain-btn-circle`),
  variables pour toute couleur/rayon/ombre.
- Avant livraison : `node --check <fichier>.js` sur chaque JS modifié.

## 5. Modèle de données

### Projet / parcelle

```js
{
  id: 'proj_<timestamp>',        // identifiant unique
  name: 'Jardin Nord',
  createdAt: '2026-10-23T08:00:00.000Z',
  points: [ /* Point[] */ ]
}
```

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

Toutes les propriétés incluent `source: 'rtk-mower'`.

## 7. Points de vigilance

- **Tuiles** : OSM (`tile.openstreetmap.org`) bloque les apps (418/403) ; CARTO Voyager
  sans clé renvoie un filigrane « API KEY REQUIRED ». Le fond Relief utilise Esri World Topo
  par défaut (`CARTO_API_KEY` vide dans `js/map.js`). `maxNativeZoom` = 19 avec clé CARTO,
  17 avec Esri, 19 pour le satellite Esri. Toujours conserver `maxZoom: 22`.
- **Multi-zones de tonte** : chaque point `tonte` porte un `zoneId` (défaut 1) et le projet
  stocke `currentZoneId`. Utiliser `getZones()` pour grouper et ne jamais fusionner les zones
  à l'affichage ou à l'export. `startNewZone()` incrémente la zone courante.
- **Multi-zones interdites** : chaque point `interdit` porte aussi un `zoneId` ; le projet
  stocke `currentInterditZoneId`. `getInterditZones()` groupe par zone, `startNewInterditZone()`
  (bouton « ＋ Nouvelle zone interdite » de la liste TRACÉS, garde-fou ≥ 3 points) incrémente
  la zone courante. Carte et export produisent un polygone / une Feature `zone_interdite`
  **par zone** (`zone_id`), sans fusion.
- **Convex hull** : `calculateConvexHull(pts)` reçoit tous les points du projet (il n'y a plus
  de point de référence à exclure).
- **Tiroir Parcelles** : le bandeau `#projectBar` n'existe plus. Le header contient
  `#btnProjectDrawer` (nom de la parcelle courante) qui ouvre `#projectDrawer`
  (`openProjectDrawer()` / `closeProjectDrawer()` / `toggleProjectDrawer()` dans
  `js/projects.js`). La liste (`renderProjectList()`) affiche une ligne par parcelle avec
  `switchProject(id)`, `renameProject(id)` et `deleteProject(id)` ; `saveProjects()` rafraîchit
  la liste **et** le libellé du header. Fermeture au clic sur l'overlay, avec Échap et au
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
  elle refuse de supprimer la dernière parcelle et rafraîchit carte, liste, statistiques,
  tiroir et historique. `deleteCurrentProject()` reste un raccourci. Ne pas redéfinir
  `deleteProject()` ailleurs (doublon historique supprimé de `js/history.js`).
- **Export** : GeoJSON est le format principal (bouton `.export-primary`). CSV et GPX sont
  dans le menu `#exportMenu`, piloté par `toggleExportMenu()` / `closeExportMenu()`
  (`js/export.js`) ; le menu se ferme au clic extérieur, avec Échap et au changement d'onglet.
- **Distances de tracés** : `leaflet-measure-path` est chargé par CDN **après Leaflet** (CSS
  dans `<head>`, JS après `leaflet.js`). Les polygones de tonte passent
  `showMeasurements: true` et `ZONE_MEASUREMENT_OPTIONS` (`showArea: false`,
  `showTotalDistance: false`, `minPixelDistance: 10`) dans `js/map.js`. À **2 points**,
  `renderMap()` crée une `L.polyline` temporaire (`tempMeasureLine`) mesurée, supprimée dès
  le 3ᵉ point par `clearTempMeasureLine()`. Ne pas retirer ces deux balises CDN.
- **Renommage** : `renameProject(id)` / `renameCurrentProject()` (parcelle) et
  `renamePoint(id)` (points) utilisent `prompt()`, refusent un nom vide et persistent via
  `saveProjects()`. Le nom d'un point est stocké dans `point.name` (indépendant de `subtype`)
  et exporté dans `properties.name` pour les obstacles.
- **Surfaces** : `calculateArea()` attend des objets `{ lat, lon }` (pas des tableaux GeoJSON).
- **Zones interdites** : une Feature `zone_interdite` **par zone** (`zone_id`), nommée
  `Zone interdite` pour la zone 1 et `Zone interdite #N` au-delà. Aucune fusion des zones.
- **Ordre des scripts** : `index.html` charge les JS dans un ordre précis ; une nouvelle
  dépendance doit être insérée après ses dépendances (ex. `simulation.js` après `points.js`
  et `map.js`, avant `export.js`).
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
  puis « Effacer ». `leaflet-measure-path` 1.5.0 (CDN) affiche la longueur de chaque segment
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

## 9. Langue et communication

- Écrire en **français** (interface, commentaires, documentation, messages de commit).
- **Expliquer les hypothèses** et les écarts par rapport à la demande : ne jamais changer
  silencieusement un comportement, un contrat d'export ou un choix de fournisseur de tuiles.
- Signaler les limites connues (Web Bluetooth Android, tuiles sans clé, précision raster).
- Valider chaque modification : `node --check` sur les JS, vérification dans le navigateur
  (thème clair/sombre, carte, modales) et test de non-régression des exports.

