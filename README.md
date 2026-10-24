# RTK Mower

Application web de relevé GPS RTK pour le terrain.

## Description

RTK Mower est une application web mobile (téléphone / tablette) destinée au relevé de
parcelles et d'obstacles pour la tonte autonome. Elle se connecte en **Bluetooth Low
Energy (BLE)** à un module **ESP32** relié à un récepteur GNSS **Unicore UM980**, reçoit
les corrections **NTRIP**, affiche la position en temps réel et enregistre des points
géolocalisés.

Fonctionnalités principales :

- connexion BLE à l'ESP32 (`RTK_Mower`) et affichage du fix (RTK Fix / Float RTK / DGPS / GPS) ;
- choix d'une parcelle (projet) et d'une station NTRIP de référence ;
- enregistrement de points `tonte`, `interdit`, `obstacle` et d'une **base du rover** unique ;
- **plusieurs zones de tonte** distinctes par parcelle (identifiant `zoneId`) ;
- carte Leaflet (Relief / Satellite), polygones et surfaces calculées en direct ;
- **relevé de parcelle** (onglet STATS) : surface à tondre, temps et linéaire estimés, contraintes relevées ;
- caméra de visée (cap géographique fixe à l'écran, distance, retour d'approche) pour rejoindre un point ou mesurer une distance ;
- export **CSV**, **GPX** et **GeoJSON** compatible Mower Planner ;
- outils de **simulation** (parcelle fictive, trame GPS) **désactivés par défaut** pour les
  tests terrain, réactivables via `ENABLE_SIMULATION` (voir [docs/simulation.md](docs/simulation.md)).

## Stack technique

| Élément | Choix |
|---|---|
| Langage | Vanilla JavaScript (ES2020+, scripts classiques) |
| Cartographie | Leaflet **1.9.4** (CDN) |
| Communication | Web Bluetooth API (BLE) |
| Styles | CSS pur (aucun framework, aucun Tailwind) |
| Données | `localStorage` (projets + points) |
| Build | Aucun (pas de bundler, pas de `package.json`) |

> Web Bluetooth nécessite **Chrome / Edge sur Android** (ou Chrome desktop) et un contexte
> sécurisé : `https://` ou `http://localhost`. iOS Safari n'est pas supporté.

## Installation et lancement

Prérequis : **Node.js 18+** (uniquement pour le serveur local et le tunnel).

### 1. Serveur local (recommandé en développement)

```bash
node serve-http.cjs
```

Le site est servi sur <http://localhost:8000> (port/hôte configurables via `PORT` et `HOST`).
Le serveur désactive le cache pour faciliter les itérations.

### 2. Accès public HTTPS (nécessaire pour le BLE sur téléphone)

```powershell
.\start-public.ps1
```

Le script démarre `serve-http.cjs` sur le port 8000 s'il ne tourne pas déjà, puis ouvre un
tunnel [localtunnel](https://localtunnel.github.io/www/) vers
`https://rtkgpsweb.loca.lt` (sous-domaine souhaité, dépend de la disponibilité).

Sous Windows, il est aussi possible de double-cliquer sur `Start-RTKGpsWeb.bat`, qui lance
`start-public.ps1` via PowerShell.

### 3. Servir autrement

N'importe quel serveur statique fonctionne (Live Server, `python -m http.server`, etc.).
Éviter l'ouverture directe en `file://` : Web Bluetooth y est bloqué et `localStorage`
peut être isolé.

## Utilisation

1. **Connecter le BLE** : bouton `⬡ CONNECTER BLE` dans l'en-tête, sélectionner l'appareil
   `RTK_Mower`. Attendre un fix **Float RTK** minimum pour pouvoir enregistrer.
2. **Choisir une parcelle** dans la liste `PARCELLE` (bouton `＋` pour en créer une).
   Sélectionner éventuellement une station NTRIP de référence, dans le bandeau Fix (à droite).
3. **Enregistrer des points** :
   - onglet **POINTS** ou barre terrain en bas : `ZONE TONTE`, `ZONE INTERDITE`, `OBSTACLE ISOLÉ` ;
   - `BASE` (🏠) : définit la base du rover (une seule par parcelle, remplace l'ancienne) ;
   - `NOUVELLE ZONE` (➕) : démarre une nouvelle zone de tonte (badge `Zone #N` dans POINTS).
4. **Consulter** la carte (onglet CARTE), les statistiques (STATS) et l'historique.
5. **Exporter** depuis l'onglet POINTS : CSV, GPX ou GeoJSON. Le GeoJSON suit le contrat
   décrit dans [docs/format-geojson.md](docs/format-geojson.md).

## Structure du projet

```text
RTKGpsWeb/
├── index.html              # Application mono-page : header, onglets, modales, barre terrain
├── css/
│   ├── design-tokens.css   # Tokens du design system (couleurs, rayons, ombres, espacements)
│   ├── main.css            # Reset, layout, header, onglets, toasts, modales, thème nuit
│   ├── components.css      # Cartes, boutons, listes de points, barre terrain, simulation
│   ├── map.css             # Styles Leaflet (popups, contrôles, overlay de surface)
│   └── theme.css           # Overrides du mode nuit + écran caméra
├── js/
│   ├── app.js              # État global APP, navigation, thème, toasts, alertes, modales
│   ├── projects.js         # Projets/parcelles + persistance localStorage
│   ├── points.js           # Enregistrement tonte/interdit/obstacle/base, liste des points
│   ├── ble.js              # Connexion Web Bluetooth, reconnexion, réception des trames
│   ├── parser.js           # Parsing des trames GPS ESP32, normalisation du fix, validation
│   ├── ntrip.js            # Stations NTRIP de référence et sélection persistée
│   ├── map.js              # Carte Leaflet, couches Relief/Satellite, polygones, base, live
│   ├── camera.js           # Caméra, boussole, visée cible et mesure de distance
│   ├── stats.js            # Relevé de parcelle (surface, temps, linéaire, contraintes)
│   ├── export.js           # Exports CSV / GPX / GeoJSON (+ convex hull)
│   ├── simulation.js       # Outils de simulation (désactivés : ENABLE_SIMULATION = false)
│   ├── history.js          # Historique des parcelles/sessions
│   └── ui.js               # Mise à jour de l'interface (fix bar, cartes de données)
├── docs/
│   ├── architecture.md     # Architecture, flux de données, modules
│   ├── design-system.md    # Tokens et composants UI
│   ├── simulation.md       # Outils de simulation et procédure de réactivation
│   └── format-geojson.md   # Contrat d'export GeoJSON Mower Planner
├── assets/                 # Ressources statiques (icônes, images)
├── serve-http.cjs          # Serveur statique Node (sans dépendance)
├── start-public.ps1        # Serveur local + tunnel public HTTPS (localtunnel)
├── Start-RTKGpsWeb.bat     # Lanceur Windows de start-public.ps1
├── README.md               # Ce fichier
└── AGENTS.md               # Instructions pour les développeurs et assistants IA
```

## Format d'export GeoJSON

Le fichier est nommé `RTK_<projet>_<YYYY-MM-DD>.geojson` et contient une `FeatureCollection`
ordonnée : domaine (enveloppe convexe), zone de tonte, zone interdite, obstacles, puis base
du rover. Les coordonnées sont en `[longitude, latitude]` et les polygones sont fermés.

Spécification complète : **[docs/format-geojson.md](docs/format-geojson.md)**.

## Documentation

- [AGENTS.md](AGENTS.md) — contexte, règles absolues et conventions du projet.
- [docs/architecture.md](docs/architecture.md) — architecture et flux de données.
- [docs/design-system.md](docs/design-system.md) — tokens et composants UI.
- [docs/format-geojson.md](docs/format-geojson.md) — contrat d'export GeoJSON.

## Limites connues

- Web Bluetooth : Chrome/Edge Android uniquement, contexte HTTPS ou localhost requis.
- Le fond « Relief » utilise Esri World Topo Map par défaut (sans clé). CARTO Voyager peut
  être activé via `CARTO_API_KEY` dans `js/map.js` ; sans clé, CARTO renvoie un filigrane.
- Les tuiles raster n'ont pas de détail au-delà de leur zoom natif : Leaflet agrandit la
  dernière tuile disponible (`maxNativeZoom`). Utiliser le fond Satellite pour le détail fin.
- Les données sont stockées localement (`localStorage`), sans synchronisation serveur.

