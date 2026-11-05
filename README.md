# Mower Survey

Application web de relevé GPS RTK pour le terrain.

## Description

Mower Survey est une application web mobile (téléphone / tablette) destinée au relevé de
parcelles et d'obstacles pour la tonte autonome. Elle se connecte en **Bluetooth Low
Energy (BLE)** à un module **ESP32** relié à un récepteur GNSS **Unicore UM980**, reçoit
les corrections **NTRIP**, affiche la position en temps réel et enregistre des points
géolocalisés.

Fonctionnalités principales :

- connexion BLE à l'ESP32 (`RTK_Mower`) et affichage du fix (RTK Fix / Float RTK / DGPS / GPS) ;
- **verrouillage d'écran** anti-fausse manip (glissement horizontal pour déverrouiller) ;
- **file d'attente hors-ligne** des exports/partages, rejouée automatiquement au retour du
  réseau (`rtkOfflineQueue`) ;
- **écran d'accueil statique** : titre « MOWER SURVEY / RTK - ACQUISITION TERRAIN », bouton empreinte digitale dans un cercle (80 × 80 px) avec le texte « Appuyer pour continuer », logo `logo-rtk-mower_tablette.svg` en bas de l'écran. Fermeture en fondu (0,3 s) et ouverture de l'onglet Tracés au clic ;
- **partage natif** sur mobile (`navigator.share`) : un GeoJSON pour une parcelle, un ZIP unique
  pour plusieurs (contourne le bug Android du multi-fichiers) ;
- **sauvegarde locale automatique** (30 s, fermeture d'onglet) avec indicateur 💾 ;
- **synchronisation cloud** (facultative) : compte e-mail / mot de passe Firebase et
  synchronisation temps réel des parcelles entre le téléphone et la tablette (Firestore),
  `localStorage` restant la source locale pour le terrain hors-ligne — voir
  [docs/firebase.md](docs/firebase.md) ;
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
- caméra de visée (cap géographique fixe à l'écran, distance, retour d'approche) pour rejoindre
  un point ou mesurer une distance, avec **guidage vocal** optionnel (annonces en français aux
  seuils 10 / 5 / 2 / 1 m, « Cible atteinte » et accord de réussite sous 50 cm) ;
- six types d'obstacles dans l'ordre **Arbre, Forage, Poteau, Souche, Talus et Divers**
  (sous-type stocké `Perso`), illustrés par des icônes SVG (modale, listes, popups, cible
  caméra) ;
- export **GeoJSON** (format principal, contrat Mower Planner) et **ZIP multi-parcelles**, plus
  **CSV** / **GPX** pour une parcelle, via le hub **Transférer** (mode serveur local avec
  **QR code** généré dans la page, sans Internet ; canaux de partage masqués si l'appareil ne
  les supporte pas ; note de transfert par câble USB) ;
- **QR code animé** (sans réseau) : le hub affiche une séquence de QR codes et la page
  **`scan.html`** la scanne avec la caméra d'un autre appareil pour reconstruire le fichier
  (GeoJSON d'une parcelle ou ZIP), avec progression et téléchargement ;
- outils de **simulation** (parcelle fictive, trame GPS) **désactivés par défaut** pour les
  tests terrain, réactivables via `ENABLE_SIMULATION` (voir [docs/simulation.md](docs/simulation.md)).

## Stack technique

| Élément | Choix |
|---|---|
| Langage | Vanilla JavaScript (ES2020+, scripts classiques) |
| Cartographie | Leaflet **1.9.4** + **leaflet-measure-path 1.5.0** (CDN) |
| ZIP | JSZip **3.10.2** (CDN) |
| QR animé | **animated-data-qr-js 0.1.0** (vendorisé, MIT, `js/vendor/animated-data-qr/`) |
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

1. **Connecter le BLE** : icône Bluetooth de la 1re ligne du header (à droite du logo), puis
   sélectionner l'appareil `RTK_Mower`. Attendre un fix **Float RTK** minimum pour pouvoir
   enregistrer.
2. **Choisir une parcelle** : à chaque lancement, aucune parcelle n'est restaurée. Le **FAB**
   reste visible au centre de la carte ; un appui ouvre son menu dont la 1re option
   « Parcelle : Aucune » mène au tiroir « Parcelles ».
   Chaque ligne permet de changer de parcelle (`clic`), la renommer (icône crayon) ou la
   supprimer (icône corbeille). Le bouton `＋ Nouvelle parcelle` ouvre la modale de création.
3. **Enregistrer des points** : dès qu'une parcelle est sélectionnée, le **FAB** `＋` propose
   les tracés au centre en bas de la carte :
   - `Nouvelle zone de tonte` (pastille verte) : FAB vert, chaque clic ajoute un point de tonte ;
   - `Nouvelle zone interdite` (pastille rouge) : FAB rouge, chaque clic ajoute un point interdit ;
   - `Obstacle` (pastille ambre) : FAB jaune, un clic ouvre le choix du type d'obstacle et crée
     un point ponctuel.
   Le bouton `✓` à gauche du FAB termine la zone (confirmation si elle a moins de 3 points).
   Un appui long sur le FAB ou sur `✓` rouvre le menu. L'icône crayon d'une ligne de la
   vue détail (onglet HISTORIQUE) ou d'une popup carte permet de renommer un point.
4. **Consulter** : l'onglet **HISTORIQUE** s'ouvre sur la liste **PARCELLES** (nom, compteur,
   date, actions `Ouvrir` / `Suppr.`, case à cocher pour la sélection multiple). `Ouvrir`
   affiche la vue détail avec les points de la parcelle (zone, compteur, liste) ; le bouton
   « ← Parcelles » revient à la liste. `⛶` affiche la carte en plein écran. Cliquer sur
   une zone (tonte ou interdite) permet de la renommer ou de la supprimer. Le relevé est dans
   l'onglet RELEVÉ. Les polygones de tonte affichent la longueur de chaque segment.
5. **Transférer / exporter** avec le bouton **Transférer** de la barre de sélection
   (vue PARCELLES) : partage natif, serveur local (adresse LAN + **QR code**), cloud,
   téléchargement ou **QR code animé**. Les canaux de partage natif sont **masqués** si
   l'appareil ne sait pas partager de fichier (`navigator.canShare({ files })`), et une note
   rappelle le transfert par **câble USB** (télécharger sur le téléphone, puis copier via le
   gestionnaire de fichiers de la tablette). Une parcelle utilise le format choisi dans
   Connexion (GeoJSON / CSV / GPX), plusieurs parcelles produisent un **ZIP** contenant un
   GeoJSON par parcelle. Le GeoJSON suit le contrat décrit dans
   [docs/format-geojson.md](docs/format-geojson.md).
6. **QR code animé (sans réseau)** : dans le hub, « QR Code animé » affiche la séquence ;
   sur l'autre appareil, ouvrez `scan.html` (HTTPS ou localhost, requis par la caméra),
   démarrez la caméra puis scannez. Le fichier reconstruit se télécharge tel quel.

## Structure du projet

```text
RTKGpsWeb/
├── index.html              # Application mono-page : header, onglets, modales, barre flottante
├── scan.html               # Récepteur du QR code animé (page autonome, caméra)
├── splash-test.html        # Prototype du splash animé (réservé à Mower Planner)
├── css/
│   ├── design-tokens.css   # Tokens du design system (couleurs, rayons, ombres, espacements)
│   ├── main.css            # Reset, layout, header, onglets, toasts, modales, thème nuit
│   ├── components.css      # Cartes, boutons, listes de points, barre flottante
│   ├── map.css             # Styles Leaflet (popups, contrôles, overlay de surface)
│   ├── theme.css           # Overrides du mode nuit + écran caméra
│   └── scan.css            # Mise en page du récepteur QR animé (scan.html)
├── js/
│   ├── app.js              # État global APP, navigation, thème, toasts, alertes, modales
│   ├── projects.js         # Projets/parcelles + persistance localStorage
│   ├── points.js           # FAB de tracé, enregistrement tonte/interdit/obstacle, liste des points
│   ├── ble.js              # Connexion Web Bluetooth, reconnexion, réception des trames
│   ├── parser.js           # Parsing des trames GPS ESP32, normalisation du fix, validation
│   ├── ntrip.js            # Stations NTRIP de référence et sélection persistée
│   ├── map.js              # Carte Leaflet, couches Relief/Satellite, polygones, position live
│   ├── camera.js           # Caméra, boussole, visée cible et mesure de distance
│   ├── stats.js            # Relevé de parcelle (surface, temps, linéaire, contraintes)
│   ├── export.js           # Exports CSV / GPX / GeoJSON (+ convex hull), hub de transfert
│   ├── qrcode.js           # Générateur de QR code autonome (adresse du mode serveur local)
│   ├── scan.js             # Récepteur du QR code animé (page scan.html)
│   ├── simulation.js       # Outils de simulation (désactivés : ENABLE_SIMULATION = false)
│   ├── history.js          # Historique des parcelles/sessions
│   ├── ui.js               # Pastille GPS du header et alertes
│   └── vendor/
│       └── animated-data-qr/  # QR animé (bundle UMD + worker + wasm, MIT, vendorisé)
├── docs/
│   ├── architecture.md     # Architecture, flux de données, modules
│   ├── design-system.md    # Tokens et composants UI
│   ├── simulation.md       # Outils de simulation et procédure de réactivation
│   ├── format-geojson.md   # Contrat d'export GeoJSON Mower Planner
│   └── CHANGELOG.md        # Journal des modifications (entrées datées)
├── assets/                 # Logos (header, tablette) + sources SVG du splash (Mower Planner)
├── serve-http.cjs          # Serveur statique Node (sans dépendance)
├── start-public.ps1        # Serveur local + tunnel public HTTPS (localtunnel)
├── Start-RTKGpsWeb.bat     # Lanceur Windows de start-public.ps1
├── README.md               # Ce fichier
└── AGENTS.md               # Instructions pour les développeurs et assistants IA
```

> **Page de test, non chargée par l'application.** `splash-test.html` contient le prototype du
> splash animé (rover qui tond) : il est réservé à **Mower Planner** (tablette) et n'est jamais
> chargé par Mower Survey. Les anciennes pages de test `header-test.html` et `menu-test.html` ont été
> **supprimées** le 2026-11-04 (voir `docs/CHANGELOG.md`).

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
- [docs/CHANGELOG.md](docs/CHANGELOG.md) — journal des modifications (entrées datées).

## Limites connues

- Web Bluetooth : Chrome/Edge Android uniquement, contexte HTTPS ou localhost requis.
- Le fond « Relief » utilise Esri World Topo Map par défaut (sans clé). CARTO Voyager peut
  être activé via `CARTO_API_KEY` dans `js/map.js` ; sans clé, CARTO renvoie un filigrane.
- Les tuiles raster n'ont pas de détail au-delà de leur zoom natif : Leaflet agrandit la
  dernière tuile disponible (`maxNativeZoom`). Utiliser le fond Satellite pour le détail fin.
- Les données sont stockées localement (`localStorage`), sans synchronisation serveur.

