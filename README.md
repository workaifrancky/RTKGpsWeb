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
- **verrouillage d'écran** anti-fausse manip (glissement horizontal pour déverrouiller) ;
- **partage natif** du GeoJSON sur mobile (`navigator.share`) ;
- **sauvegarde locale automatique** (30 s, fermeture d'onglet) avec indicateur 💾 ;
- choix d'une parcelle (projet) et d'une station NTRIP de référence ;
- enregistrement de points `tonte`, `interdit` et `obstacle` ;
- **bibliothèque globale d'obstacles** (`rtkGlobalObstacles`) : import par cases à cocher
  lors de la création d'une parcelle, sans doublons (nom + coordonnées) ;
- **plusieurs zones de tonte** distinctes par parcelle (identifiant `zoneId`) ;
- **plusieurs zones interdites** distinctes par parcelle (même principe, `zoneId` dédié) ;
- carte Leaflet (Relief / Satellite), polygones, surfaces et **distances de segments**
  (`leaflet-measure-path`) calculées en direct, **plein écran** et modes lecture / création ;
- interface **responsive** (320 → desktop) : header compact, **barre de navigation fixe en
  bas** avec libellés, cibles tactiles ≥ 44 px ;
- **relevé de parcelle** (onglet RELEVÉ) : surface à tondre, temps et linéaire estimés, contraintes relevées ;
- caméra de visée (cap géographique fixe à l'écran, distance, retour d'approche) pour rejoindre un point ou mesurer une distance ;
- export **GeoJSON** (format principal, contrat Mower Planner), **CSV** et **GPX** via le menu
  secondaire de l'onglet TRACÉS ;
- outils de **simulation** (parcelle fictive, trame GPS) **désactivés par défaut** pour les
  tests terrain, réactivables via `ENABLE_SIMULATION` (voir [docs/simulation.md](docs/simulation.md)).

## Stack technique

| Élément | Choix |
|---|---|
| Langage | Vanilla JavaScript (ES2020+, scripts classiques) |
| Cartographie | Leaflet **1.9.4** + **leaflet-measure-path 1.5.0** (CDN) |
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
2. **Choisir une parcelle** : bouton `📍 <nom> ▾` dans le header, qui ouvre le tiroir
   « Parcelles ». Chaque ligne permet de changer de parcelle (`clic`), la renommer (`✏️`) ou
   la supprimer (`🗑`) ; le bouton `＋ Nouvelle parcelle` ouvre la modale de création.
   Sélectionner éventuellement une station NTRIP de référence, dans le bandeau Fix (à droite).
3. **Enregistrer des points** :
   - onglet **TRACÉS** : barre flottante sur la carte — `TONTE`, `INTERDIT`, `OBSTACLE` ;
   - `NOUVELLE ZONE` (➕) : démarre une nouvelle zone de tonte (badge `Zone #N` dans TRACÉS) ;
   - `＋ Nouvelle zone interdite` (sous la liste TRACÉS) : démarre une nouvelle zone interdite ;
   - `✏️` sur une ligne TRACÉS ou dans la popup carte : renommer un point (nom exporté dans
     `properties.name` pour les obstacles).
4. **Consulter** : TRACÉS s'ouvre en mode **lecture** (carte déplaçable, aucun point ajouté).
   Bouton `✏️ Modifier` pour repasser en création, `✓ Terminer` pour revenir en lecture ;
   `⛶` affiche la carte en plein écran. Cliquer sur une zone (tonte ou interdite) permet de la
   renommer ou de la supprimer. Le relevé est dans l'onglet RELEVÉ, l'historique dans
   HISTORIQUE. Les polygones de tonte affichent la longueur de chaque segment.
5. **Exporter** depuis l'onglet TRACÉS avec `⬇ Exporter GeoJSON` (format principal) ; CSV et
   GPX sont dans le menu `⋮`. Le GeoJSON suit le contrat décrit dans
   [docs/format-geojson.md](docs/format-geojson.md).

## Structure du projet

```text
RTKGpsWeb/
├── index.html              # Application mono-page : header, onglets, modales, barre flottante
├── css/
│   ├── design-tokens.css   # Tokens du design system (couleurs, rayons, ombres, espacements)
│   ├── main.css            # Reset, layout, header, onglets, toasts, modales, thème nuit
│   ├── components.css      # Cartes, boutons, listes de points, barre flottante
│   ├── map.css             # Styles Leaflet (popups, contrôles, overlay de surface)
│   └── theme.css           # Overrides du mode nuit + écran caméra
├── js/
│   ├── app.js              # État global APP, navigation, thème, toasts, alertes, modales
│   ├── projects.js         # Projets/parcelles + persistance localStorage
│   ├── points.js           # Enregistrement tonte/interdit/obstacle/base, liste des points
│   ├── ble.js              # Connexion Web Bluetooth, reconnexion, réception des trames
│   ├── parser.js           # Parsing des trames GPS ESP32, normalisation du fix, validation
│   ├── ntrip.js            # Stations NTRIP de référence et sélection persistée
│   ├── map.js              # Carte Leaflet, couches Relief/Satellite, polygones, position live
│   ├── camera.js           # Caméra, boussole, visée cible et mesure de distance
│   ├── stats.js            # Relevé de parcelle (surface, temps, linéaire, contraintes)
│   ├── export.js           # Exports CSV / GPX / GeoJSON (+ convex hull)
│   ├── simulation.js       # Outils de simulation (désactivés : ENABLE_SIMULATION = false)
│   ├── history.js          # Historique des parcelles/sessions
│   └── ui.js               # Bandeau Fix et alertes GPS
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
ordonnée : domaine (enveloppe convexe), zones de tonte, zone interdite puis obstacles. Les
coordonnées sont en `[longitude, latitude]` et les polygones sont fermés.

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

