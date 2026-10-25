# Architecture — RTK Mower

## Vue d'ensemble

RTK Mower est une **application web statique mono-page** : aucun serveur applicatif, aucune
base de données, aucun build. `index.html` est servi tel quel et charge les styles puis les
scripts dans un ordre contractuel.

```text
ESP32 (UM980 + NTRIP)
        │  BLE — notifications texte
        ▼
   js/ble.js  ──►  js/parser.js  ──►  js/ui.js (bandeau Fix, alertes)
                                   ├─► js/map.js (position live, trail)
                                   └─► js/camera.js (boussole, visée, distance)

Boutons terrain ──► js/points.js ──► js/projects.js (localStorage)
                                   ├─► js/map.js (marqueurs/polygones)
                                   ├─► js/stats.js (statistiques)
                                   └─► js/export.js (CSV / GPX / GeoJSON)
```

## Modules

| Fichier | Responsabilité |
|---|---|
| `js/app.js` | État global `APP`, navigation par onglets, thème, toasts, alertes, ouverture/fermeture des modales |
| `js/projects.js` | CRUD des parcelles (`switchProject()`, `renameProject()`, `deleteProject()`), tiroir Parcelles, base globale des obstacles (`rtkGlobalObstacles`, import), persistance `localStorage`, `getPoints()`, `getCurrentProjectData()` |
| `js/points.js` | Construction/enregistrement des points, compteurs, zones de tonte (`getZones()`, `startNewZone()`), zones interdites (`getInterditZones()`, `startNewInterditZone()`), renommage (`renamePoint()`), liste des points |
| `js/ble.js` | Web Bluetooth, connexion/reconnexion, réception des notifications, état des boutons terrain |
| `js/parser.js` | Décodage des trames ESP32, normalisation du fix, validation de position |
| `js/ntrip.js` | Catalogue de stations NTRIP et sélection persistée |
| `js/map.js` | Carte Leaflet, fonds Relief/Satellite, polygones (distances de segments via `leaflet-measure-path`), marqueurs, position live, overlay de surfaces, actions de popup (renommer/supprimer) |
| `js/camera.js` | Flux caméra, boussole informative, guidage vers une cible (cap géographique fixe), retour d'approche, mesure de distance, plein écran |
| `js/stats.js` | Statistiques de session (surfaces, contraintes, estimations) |
| `js/export.js` | Export GeoJSON principal (une Feature `zone`/`zone_interdite` par `zoneId`), menu CSV/GPX (`toggleExportMenu()`), calcul d'enveloppe convexe |
| `js/simulation.js` | Génération d'un projet fictif complet pour tester sans GPS |
| `js/history.js` | Historique des parcelles/sessions |
| `js/ui.js` | Bandeau Fix (fix, précision) et alertes GPS à partir des trames |

### Ordre de chargement (`index.html`)

```text
Leaflet + leaflet-measure-path (CDN) → parser → ntrip → app → projects → ble
             → points → map → stats → simulation → export → camera → history → ui
```

Cet ordre fait office de graphe de dépendances. `ui.js` doit rester en dernier. Une nouvelle
brique doit être insérée **après ses dépendances**.

### Navigation et tiroir Parcelles

- Quatre onglets en `<button class="tab-label" data-tab="…">` : TRACÉS, CAMÉRA, RELEVÉ,
  HISTORIQUE. Les onglets GPS / DONNÉES et CARTE ont été supprimés (doublons avec TRACÉS) ;
  le `data-tab` de TRACÉS reste `tab-points`.
- La navigation est une **barre fixe en bas** (`#bottomNav`, `.tabs-wrapper.bottom-nav`),
  placée hors de `.app-wrapper`, avec icône + libellé et quatre boutons de largeur égale.
  `.screen` réserve sa hauteur (+ safe-area iPhone) pour que la carte et la capsule restent
  au-dessus.
- `showTab(tabId)` (`js/app.js`) active l'écran correspondant, pose `.active` et
  `aria-current="page"` sur le bouton portant le même `data-tab`. Aucun radio.
- La barre est masquée en plein écran carte et caméra.
- Verrouillage : `#btnLock` sur la carte, voile `#lockOverlay` (`body.locked`) et glissement
  horizontal ; `setMapInteractionEnabled()` coupe les gestes Leaflet et l'enregistrement.
- Partages et exports : `buildGeoJSON()` est la source unique (export fichier ou
  `navigator.share({ files })`) ; les propriétés portent `date_creation`, `version_app` et
  `source`.
- Le bandeau `#projectBar` a été supprimé : le header contient `#btnProjectDrawer` (nom de la
  parcelle courante) qui ouvre le tiroir `#projectDrawer` (overlay + panneau latéral). Le
  tiroir liste les parcelles (`#projectListContainer`), permet de changer, renommer,
  supprimer et d'en créer une. `saveProjects()` met à jour la liste et le libellé du header.

## État et persistance

- `APP` (`js/app.js`) : `theme`, `bleConnected`, `hasGpsData`, `currentTab`, `tracesMode`
  (`lecture` | `creation`), `lastUpdate`.
- `lastGpsData` (`js/ui.js`) : dernière trame GPS valide ou rejetée.
- Globals projet (`js/projects.js`) : `projects`, `currentProject`, `globalObstacles`.
- `localStorage` :
  - `rtkProjects` : tableau de projets sérialisés ;
  - `rtkCurrentProject` : identifiant du projet courant ;
  - `rtkGlobalObstacles` : bibliothèque d'obstacles réutilisables (`{ id, name, subtype,
    icon, lat, lon, alt, rayon, createdAt, projectId }`) ;
  - `rtkTheme` : `light` ou `dark` ;
  - `rtkMapBaseLayer` : `relief` ou `satellite` ;
  - `rtkSelectedNtripStation` : station NTRIP sélectionnée.

## Flux BLE et trame GPS

- Appareil attendu : `RTK_Mower`.
- Service : `4fafc201-1fb5-459e-8fcc-c5c9c331914b`.
- Caractéristique : `beb5483e-36e1-4688-b7f5-ea07361b26a8` (notifications).
- La trame est du texte clé/valeur, parsée par `parseGpsFrame()` :
  `Fix:`, `Lat:`, `Lon:`, `Alt:`, `Rel_X:`, `Rel_Y:`, `Sat:`, `HDOP:`, `Speed:`, `Cap:`, `Date:`.
- Fix normalisés : `RTK Fix` (4), `Float RTK` (3), `DGPS` (2), `GPS` (1), `None` (0).
- Une position est enregistrable à partir de **Float RTK** (`score >= 3`).

## Carte

- Fonds : Relief (Esri World Topo sans clé, ou CARTO Voyager si `CARTO_API_KEY` est renseignée)
  et Satellite (Esri World Imagery).
- `maxZoom: 22`, `maxNativeZoom` explicite (19 satellite/CARTO, 17 Esri Topo) pour éviter
  les tuiles manquantes.
- Couches dédiées : `layerTonte`, `layerInterdit`, `layerObstacle`.
- `#map-crosshair` : cible de visée fixe (overlay HTML hors panes Leaflet) centrée sur
  `.map-wrapper`, `pointer-events: none` ; elle ne suit pas le panoramique. Elle n'est
  visible qu'en **mode création** : `syncCrosshairVisibility()` (`js/map.js`) pose
  `.is-hidden` en lecture et sur les autres onglets.
- **Modes lecture / création** : `APP.tracesMode` vaut `lecture` au chargement, à l'ouverture
  d'une parcelle (`switchProject()`) et après suppression ; il passe à `creation` via
  `createProject()` ou le bouton `#btnTracesMode` (`setTracesMode()` / `toggleTracesMode()`).
  En lecture, `.floating-toolbar` est masquée et `canRecordPoints()` bloque tout ajout de point.
- **Plein écran carte** : `toggleMapFullscreen()` ajoute `body.map-ui-fullscreen` (header,
  onglets, tiroir et panneau des points masqués, `#tab-points` en `position: fixed`) ; la
  capsule et les contrôles restent visibles. `exitMapFullscreen()` est appelé au changement
  d'onglet.
- **Zones** : les polygones de tonte et interdits ouvrent une popup (`zonePopup()`) avec
  « ✏️ Renommer » (`renameZone()`) et « 🗑 Supprimer » (`deleteZone()`). Les noms personnalisés
  sont stockés dans `project.zoneNames = { tonte: { N: nom }, interdit: { N: nom } }` et
  affichés par `getZoneDisplayName()` ; ils ne modifient pas le contrat GeoJSON.
- Position live : `liveMarker` / `livePolyline` sont supprimés à la déconnexion BLE par
  `clearLiveGpsPosition()` (`js/map.js`, appelée depuis `onDisconnected()`), pour qu'aucun
  point GPS périmé ne reste affiché en mode manuel.
- Les points `tonte` sont groupés par `zoneId` : un polygone coloré (palette `ZONE_PALETTE`)
  et un médaillon `ZN` par zone de ≥ 3 points.
- Métré en cours de tracé : à **2 points** dans une zone de tonte, `renderMap()` crée une
  `L.polyline` temporaire (`tempMeasureLine`) mesurée par `showMeasurements()`
  (`ZONE_MEASUREMENT_OPTIONS`) ; elle est supprimée dès le 3ᵉ point (le polygone prend le
  relais) par `clearTempMeasureLine()`.
- La base est toujours affichée au-dessus des autres couches (`zIndexOffset: 1000`).
- `L.circleMarker` pour tonte/interdit, `L.divIcon` pour obstacles et base.

## Cycle de vie d'un point

1. `recordXxx()` vérifie le GPS (`checkGps()`), puis `buildPoint(type, subtype, icon)`.
   Pour la tonte, `zoneId` est renseigné avec `currentZoneId` (projet courant).
2. `savePoint()` → `addPointToCurrentProject()` (persistance), `renderPointsList()`,
   `addPointToMap()`, `updateStatsDisplay()`.
3. La suppression passe par `deletePoint(id)` qui renumérote les points par type.
4. Le renommage passe par `renamePoint(id)` : le nom personnalisé est stocké dans `point.name`,
   persisté, puis la liste et la carte sont rafraîchies.

Il n'existe plus de point de référence « base du rover » : les trois types enregistrables sont
`tonte`, `interdit` et `obstacle`.

## Statistiques et export

- `computeStats()` travaille sur tous les points du projet.
- `exportGeoJSON()` construit les features dans l'ordre domaine → zone 1..N (une par `zoneId`)
  → zone interdite → obstacles ; le domaine est l'enveloppe convexe de tous les points.
- Voir [format-geojson.md](format-geojson.md).

## Mode simulation

> **Désactivé en production terrain.** `js/simulation.js` déclare `ENABLE_SIMULATION = false`
> et les boutons ont été retirés d'`index.html`. Procédure de réactivation :
> [simulation.md](simulation.md).

`generateSimulationData()` crée ou réutilise le projet `Simulation`, le vide, puis injecte
14 points (2 zones de 4 points de tonte, 3 points interdits, 3 obstacles) via
`addPointToCurrentProject()`. `currentZoneId` passe à 2 avant l'injection de la seconde zone.

`simulateGpsFrame()` injecte une trame texte fixe dans le pipeline `parseGpsFrame()` →
`updateUI()` pour alimenter le bandeau Fix sans BLE (fix RTK). `simulateGpsAt(lat, lon, course,
fix)` fait de même avec une position et un cap paramétrables (test du guidage caméra),
uniquement depuis la console.

Les trois fonctions retournent `null` et émettent un `console.warn` quand le flag est `false` :
elles ne touchent ni `localStorage`, ni l'interface, ni la caméra.

## Tester sans matériel

1. Ouvrir l'application via `node serve-http.cjs` (ou le tunnel HTTPS).
2. Passer `ENABLE_SIMULATION` à `true` et restaurer les boutons (voir
   [simulation.md](simulation.md)), puis recharger la page.
3. Onglet TRACÉS → `🎮 Mode Simulation`.
4. Vérifier la carte, les statistiques (RELEVÉ) et l'export GeoJSON.
5. Pour un contrôle statique : `node --check js/<fichier>.js`.
