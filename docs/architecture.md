# Architecture — RTK Mower

## Vue d'ensemble

RTK Mower est une **application web statique mono-page** : aucun serveur applicatif, aucune
base de données, aucun build. `index.html` est servi tel quel et charge les styles puis les
scripts dans un ordre contractuel.

```text
ESP32 (UM980 + NTRIP)
        │  BLE — notifications texte
        ▼
   js/ble.js  ──►  js/parser.js  ──►  js/ui.js (fix bar, cartes données)
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
| `js/projects.js` | CRUD des parcelles, persistance `localStorage`, `getPoints()`, `getCurrentProjectData()` |
| `js/points.js` | Construction/enregistrement des points, compteurs, zones de tonte (`getZones()`, `startNewZone()`), `recordBase()`, `getBase()`, liste des points |
| `js/ble.js` | Web Bluetooth, connexion/reconnexion, réception des notifications, état des boutons terrain |
| `js/parser.js` | Décodage des trames ESP32, normalisation du fix, validation de position |
| `js/ntrip.js` | Catalogue de stations NTRIP et sélection persistée |
| `js/map.js` | Carte Leaflet, fonds Relief/Satellite, polygones, marqueurs, base, position live, overlay de surfaces |
| `js/camera.js` | Flux caméra, boussole informative, guidage vers une cible (cap géographique fixe), retour d'approche, mesure de distance, plein écran |
| `js/stats.js` | Statistiques de session (base exclue) |
| `js/export.js` | Exports CSV, GPX, GeoJSON + calcul d'enveloppe convexe |
| `js/simulation.js` | Génération d'un projet fictif complet pour tester sans GPS |
| `js/history.js` | Historique des parcelles/sessions |
| `js/ui.js` | Mise à jour des éléments d'interface à partir des données GPS |

### Ordre de chargement (`index.html`)

```text
Leaflet (CDN) → parser → ntrip → app → projects → ble → points → map
             → stats → simulation → export → camera → history → ui
```

Cet ordre fait office de graphe de dépendances. `ui.js` doit rester en dernier. Une nouvelle
brique doit être insérée **après ses dépendances**.

## État et persistance

- `APP` (`js/app.js`) : `theme`, `bleConnected`, `hasGpsData`, `currentTab`, `lastUpdate`.
- `lastGpsData` (`js/ui.js`) : dernière trame GPS valide ou rejetée.
- Globals projet (`js/projects.js`) : `projects`, `currentProject`.
- `localStorage` :
  - `rtkProjects` : tableau de projets sérialisés ;
  - `rtkCurrentProject` : identifiant du projet courant ;
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
- Couches dédiées : `layerTonte`, `layerInterdit`, `layerObstacle`, `layerBase`.
- Les points `tonte` sont groupés par `zoneId` : un polygone coloré (palette `ZONE_PALETTE`)
  et un médaillon `ZN` par zone de ≥ 3 points.
- La base est toujours affichée au-dessus des autres couches (`zIndexOffset: 1000`).
- `L.circleMarker` pour tonte/interdit, `L.divIcon` pour obstacles et base.

## Cycle de vie d'un point

1. `recordXxx()` vérifie le GPS (`checkGps()`), puis `buildPoint(type, subtype, icon)`.
   Pour la tonte, `zoneId` est renseigné avec `currentZoneId` (projet courant).
2. `savePoint()` → `addPointToCurrentProject()` (persistance), `renderPointsList()`,
   `addPointToMap()`, `updateStatsDisplay()`.
3. La suppression passe par `deletePoint(id)` qui renumérote les points par type.

La base suit le même flux mais `recordBase()` supprime d'abord l'ancienne base de la parcelle.

## Statistiques et export

- `computeStats()` filtre `type !== 'base'` : la base n'est ni comptée ni incluse dans la
  distance.
- `exportGeoJSON()` construit les features dans l'ordre domaine → zone 1..N (une par `zoneId`)
  → zone interdite → obstacles → base ; le domaine est calculé sur les points hors base.
- Voir [format-geojson.md](format-geojson.md).

## Mode simulation

> **Désactivé en production terrain.** `js/simulation.js` déclare `ENABLE_SIMULATION = false`
> et les boutons ont été retirés d'`index.html`. Procédure de réactivation :
> [simulation.md](simulation.md).

`generateSimulationData()` crée ou réutilise le projet `Simulation`, le vide, puis injecte
15 points (1 base, 2 zones de 4 points de tonte, 3 points interdits, 3 obstacles) via
`addPointToCurrentProject()`. `currentZoneId` passe à 2 avant l'injection de la seconde zone.

`simulateGpsFrame()` injecte une trame texte fixe dans le pipeline `parseGpsFrame()` →
`updateUI()` pour remplir l'onglet DONNÉES sans BLE (fix RTK, Lat/Lon, altitude, satellites,
HDOP, vitesse). `simulateGpsAt(lat, lon, course, fix)` fait de même avec une position et un cap
paramétrables (test du guidage caméra), uniquement depuis la console.

Les trois fonctions retournent `null` et émettent un `console.warn` quand le flag est `false` :
elles ne touchent ni `localStorage`, ni l'interface, ni la caméra.

## Tester sans matériel

1. Ouvrir l'application via `node serve-http.cjs` (ou le tunnel HTTPS).
2. Passer `ENABLE_SIMULATION` à `true` et restaurer les boutons (voir
   [simulation.md](simulation.md)), puis recharger la page.
3. Onglet DONNÉES → `🎮 Mode Simulation`.
4. Vérifier la carte, les statistiques et l'export GeoJSON.
5. Pour un contrôle statique : `node --check js/<fichier>.js`.
