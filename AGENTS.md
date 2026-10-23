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
- **Tests sans matériel** : mode Simulation (`js/simulation.js`).

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
6. **Base du rover unique par parcelle** : `recordBase()` supprime l'ancienne base avant
   d'enregistrer la nouvelle. Ne pas permettre plusieurs points `base`.
7. **La base est exclue du convex hull (domaine) et des statistiques** :
   `pts.filter(p => p.type !== 'base')`. Elle reste exportée comme Feature `base`.
8. **`maxNativeZoom` doit être défini** sur chaque `L.tileLayer` pour éviter les tuiles
   grises/403 (OSM bloque les usages applicatifs ; CARTO exige une clé API).

## 3. Stack technique figée

| Domaine | Choix imposé |
|---|---|
| UI | Vanilla JS, CSS pur (pas de framework, pas de Tailwind) |
| Cartographie | Leaflet 1.9.4 via CDN |
| Bluetooth | Web Bluetooth API |
| Persistance | `localStorage` (`rtkProjects`, `rtkCurrentProject`, `rtkTheme`, …) |
| Build | Aucun : pas de `package.json`, pas de bundler |
| Serveur | `serve-http.cjs` (Node, sans dépendance) + `start-public.ps1` (localtunnel) |

## 4. Conventions de code

- **Scripts classiques** : les fichiers JS sont chargés par `<script src="…">` dans un ordre
  contractuel (voir `index.html`). Chaque fichier expose des fonctions globales.
  Les modules ES6 (`import`/`export`) **ne sont pas utilisés** aujourd'hui ; ne pas en
  introduire localement sans migration globale de l'ordre de chargement.
- **camelCase** pour les fonctions et variables (`recordBase`, `renderMap`).
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
  type: 'tonte' | 'interdit' | 'obstacle' | 'base',
  subtype: 'Arbre' | null,       // catégorie d'obstacle
  icon: '🟢',
  index: 1,                      // numérotation par type
  zoneId: 1,                     // zones de tonte uniquement (défaut 1)
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
- Le projet de simulation est nommé **`Simulation`** et réutilisé à chaque activation.

## 6. Format d'export GeoJSON

Contrat complet : **[docs/format-geojson.md](docs/format-geojson.md)**.

Résumé : `FeatureCollection` dans cet ordre strict :

1. `domaine` — `Polygon` (convex hull des points hors base)
2. `zone` (× N) — `Polygon` (une Feature par `zoneId`, si ≥ 3 points `tonte`)
3. `zone_interdite` — `Polygon` (points `interdit`, si ≥ 3)
4. `obstacle` — un `Point` par obstacle (`categorie`, `rayon`, `index`, fix…)
5. `base` — `Point` unique (`name: 'Base du rover'`)

Nom du fichier : `RTK_<projet>_<YYYY-MM-DD>.geojson`.

Toutes les propriétés incluent `source: 'rtk-mower'`.

## 7. Points de vigilance

- **Tuiles** : OSM (`tile.openstreetmap.org`) bloque les apps (418/403) ; CARTO Voyager
  sans clé renvoie un filigrane « API KEY REQUIRED ». Le fond Relief utilise Esri World Topo
  par défaut (`CARTO_API_KEY` vide dans `js/map.js`). `maxNativeZoom` = 19 avec clé CARTO,
  17 avec Esri, 19 pour le satellite Esri. Toujours conserver `maxZoom: 22`.
- **Base unique** : toute nouvelle implémentation doit passer par `recordBase()` / `getBase()`.
- **Multi-zones de tonte** : chaque point `tonte` porte un `zoneId` (défaut 1) et le projet
  stocke `currentZoneId`. Utiliser `getZones()` pour grouper et ne jamais fusionner les zones
  à l'affichage ou à l'export. `startNewZone()` incrémente la zone courante.
- **Convex hull** : exclure la base (`pts.filter(p => p.type !== 'base')`) avant
  `calculateConvexHull()`.
- **Bouton BASE** : `btnBase` doit rester dans la liste de `updateTerrainButtons()`
  (`js/ble.js`) et démarrer avec la classe `disabled` dans `index.html`.
- **Surfaces** : `calculateArea()` attend des objets `{ lat, lon }` (pas des tableaux GeoJSON).
- **Zones interdites** : un seul Feature regroupant les points `interdit` (pas de notion de
  zones multiples dans le modèle actuel).
- **Ordre des scripts** : `index.html` charge les JS dans un ordre précis ; une nouvelle
  dépendance doit être insérée après ses dépendances (ex. `simulation.js` après `points.js`
  et `map.js`, avant `export.js`).
- **Pas de cache** : `serve-http.cjs` envoie `Cache-Control: no-store` ; ne pas le retirer
  pendant les phases de test terrain.

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

## 9. Langue et communication

- Écrire en **français** (interface, commentaires, documentation, messages de commit).
- **Expliquer les hypothèses** et les écarts par rapport à la demande : ne jamais changer
  silencieusement un comportement, un contrat d'export ou un choix de fournisseur de tuiles.
- Signaler les limites connues (Web Bluetooth Android, tuiles sans clé, précision raster).
- Valider chaque modification : `node --check` sur les JS, vérification dans le navigateur
  (thème clair/sombre, carte, modales) et test de non-régression des exports.

