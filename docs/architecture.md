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
| `js/points.js` | Construction/enregistrement des points, compteurs, `recordBase()`, `getBase()`, liste des points |
| `js/ble.js` | Web Bluetooth, connexion/reconnexion, réception des notifications, état des boutons terrain |
| `js/parser.js` | Décodage des trames ESP32, normalisation du fix, validation de position |
| `js/ntrip.js` | Catalogue de stations NTRIP et sélection persistée |
| `js/map.js` | Carte Leaflet, fonds Relief/Satellite, polygones, marqueurs, base, position live, overlay de surfaces |
| `js/camera.js` | Flux caméra, boussole, cible à rejoindre, mesure de distance, plein écran |
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
- La base est toujours affichée au-dessus des autres couches (`zIndexOffset: 1000`).
- `L.circleMarker` pour tonte/interdit, `L.divIcon` pour obstacles et base.

## Cycle de vie d'un point

1. `recordXxx()` vérifie le GPS (`checkGps()`), puis `buildPoint(type, subtype, icon)`.
2. `savePoint()` → `addPointToCurrentProject()` (persistance), `renderPointsList()`,
   `addPointToMap()`, `updateStatsDisplay()`.
3. La suppression passe par `deletePoint(id)` qui renumérote les points par type.

La base suit le même flux mais `recordBase()` supprime d'abord l'ancienne base de la parcelle.

## Statistiques et export

- `computeStats()` filtre `type !== 'base'` : la base n'est ni comptée ni incluse dans la
  distance.
- `exportGeoJSON()` construit les features dans l'ordre domaine → zone → zone interdite →
  obstacles → base ; le domaine est calculé sur les points hors base.
- Voir [format-geojson.md](format-geojson.md).

## Mode simulation

`generateSimulationData()` crée ou réutilise le projet `Simulation`, le vide, puis injecte
11 points (1 base, 4 tonte, 3 interdits, 3 obstacles) via `addPointToCurrentProject()`.
Aucun matériel GPS n'est requis ; le bouton est disponible dans l'onglet DONNÉES.

## Tester sans matériel

1. Ouvrir l'application via `node serve-http.cjs` (ou le tunnel HTTPS).
2. Onglet DONNÉES → `🎮 Mode Simulation`.
3. Vérifier la carte, les statistiques et l'export GeoJSON.
4. Pour un contrôle statique : `node --check js/<fichier>.js`.
