# AGENTS.md — Instructions projet

Ce document s'adresse aux développeurs et aux assistants IA qui interviennent sur Mower Survey.
Il décrit le contexte, les règles non négociables, les conventions et les pièges connus.

## 1. Contexte du projet

Mower Survey est l'application de terrain de l'écosystème **Mower** : relevé GPS RTK pour la
tonte autonome (téléphone). Les autres briques (Mower Planner — tablette, Mower Control,
Mower Monitor, Mower Cloud) sont réservées pour l'avenir.

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
| ZIP | JSZip 3.10.2 via CDN (partage multi-parcelles, `js/export.js`) |
| QR animé | `animated-data-qr-js` v0.1.0 **vendorisé** dans `js/vendor/animated-data-qr/` (MIT, global `AnimatedDataQR`) — le paquet npm/jsDelivr renvoie 404 |
| Bluetooth | Web Bluetooth API |
| Persistance | `localStorage` (`rtkProjects`, `rtkCurrentProject`, `rtkGlobalObstacles`, `rtkTheme`, `rtkShowPointNumbers`, `rtkOfflineQueue`, …) — **source locale** de référence |
| Synchronisation | **Firebase** (Firestore + Authentication e-mail/mot de passe), SDK « compat » 10.14.1 via CDN, projet `mower-survey` — voir [docs/firebase.md](docs/firebase.md) |
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
`rtkCurrentProject` (écrit lors d'une sélection mais **purgé à chaque démarrage** : aucune
parcelle n'est restaurée). L'accès passe par `getPoints()` et `getCurrentProjectData()`.

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

- **Écran d'accueil** : `index.html` s'ouvre **toujours** sur `#welcome-screen`
  (`.welcome-screen`, `position: fixed`, `inset: 0`, `z-index: 5000`, fond
  `var(--color-primary-deep)`), affiché à **chaque** démarrage — aucune mémorisation
  `localStorage`. Contenu **ancré à 1/3 de la hauteur depuis le HAUT**
  (`.welcome-content`, `position: absolute; left: 0; right: 0; top: 33vh; padding: 0 24px`,
  `22vh` en paysage `max-height: 520px`) :
  titre « MOWER SURVEY » (`.welcome-title`, Arial Black), sous-titre
  « RTK - ACQUISITION TERRAIN » (`.welcome-subtitle`),
  **empreinte digitale Lucide** dans un cercle de **80 × 80 px sans fond**
  (seule la bordure `2px solid currentColor`, blanche ; forme ronde ; survol = voile
  `--color-on-primary-hover`) (`#btnWelcomeEnter` / `.welcome-fingerprint-btn`,
  `aria-label="Appuyer pour continuer"`),
  puis le texte « Appuyer pour continuer » (`.welcome-hint`). Le **logo complet**
  `assets/logo-rtk-mower_tablette.svg` (viewBox `0 0 3524 500`, 1 `<path>`, 38 020 car.,
  SHA-256 `9E8A1081…79FE43`) occupe le bas de l'écran (`.welcome-logo`, absolu,
  `bottom: env(safe-area-inset-bottom) + 10px`, largeur 100 %) ; son `d` est **injecté par
  script** depuis `assets/` (même règle que le logo du header, §10). Au clic :
  `js/welcome.js` (`initWelcomeScreen()`, chargé **après** `js/app.js`) pose `.is-closing`
  (fondu **0,3 s**, `--welcome-fade`), appelle `showTab('tab-points')` puis masque l'écran
  (`hidden` + `aria-hidden="true"`). L'empreinte reçoit le focus au chargement (seule
  action possible) **sans anneau de focus** : `initWelcomeScreen()` pose la classe
  `.focus-silent` avant `focus()`, retirée au premier `keydown` (`:focus-visible` du thème
  → contour vert `--color-primary-accent`, `outline-offset: 4px`) ; sans cela le navigateur
  dessine son liseré sombre par défaut collé à la bordure blanche. Le voile porte
  `role="dialog"`, `aria-modal="true"` et
  `aria-labelledby="welcome-title"`.
  **Le splash animé (rover qui tond) n'est PAS chargé dans Mower Survey** : `#splash-screen`,
  `.splash-intro`, sa section CSS (retirée de `css/components.css`) et `js/splash.js`
  (fichier **supprimé**) n'existent plus. Il est réservé à **Mower Planner** (tablette,
  paysage) ; son prototype reste consultable dans `splash-test.html`, page autonome que
  l'application ne charge jamais.
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
  `zone_interdite` **par zone** (`zone_id`), sans fusion. Flux d'un obstacle (point ponctuel),
  en **mode boucle** (3.85) :
  1. option « Obstacle » du menu FAB → `chooseTraceMode('obstacle')` → `beginTraceMode()` puis
     `openObstacleMenu()` active `APP.obstacleLoopMode` (`startObstacleLoop()`) et ouvre la
     modale « Type d'obstacle » **sans enregistrer** ;
  2. choix du type → `selectObstacleType()` mémorise `APP.pendingObstacle = { type, icon, name }`,
     **ferme la modale** et laisse le mode obstacle actif (croix de visée + FAB ambre) ;
  3. **pointage** : tap sur la carte (`initObstacleMapTap()`, branchée par `js/map.js`, position
     `event.latlng`) **ou** clic sur le FAB (GPS / cible centrale). `recordObstacle(type, icon,
     name, pos)` enregistre ; un `dragstart` / `zoomstart` de moins de 350 ms neutralise le tap
     fantôme, et le handler ne fait rien hors du mode boucle ;
  4. la modale **se rouvre automatiquement** (`reopenObstacleLoopModal()`, différée d'un tick,
     animation `#obstacleModal.is-loop-reopen` 150 ms), le compteur `#obstacleLoopCount`
     s'incrémente et le dernier type reste pré-surligné (`.pre-selected`, via
     `rtkLastObstacleType`) → on enchaîne autant d'obstacles que nécessaire.
  **Sortie** : bouton **« Terminer »** (`#btnObstacleLoopStop` → `stopObstacleLoop()`), **Échap**,
  clic sur le voile (`closeObstacleMenu()` → `stopObstacleLoop()`), changement d'onglet ou
  verrouillage. Les obstacles déjà pointés sont conservés, le mode repasse en lecture et le
  compteur retombe à 0. Hors boucle (appel direct de `recordObstacle()`), l'ancien comportement
  ponctuel subsiste. Le bouton « ✓ » reste masqué en mode obstacle.
- **Zones vides en cours** : `currentZoneId` et `currentInterditZoneId` peuvent valoir
  `maxZone + 1` entre la création d'une zone et son premier point. `normalizeProject()` et
  les recalculs après suppression d'un point ou d'une zone conservent cette valeur ; sinon
  les points suivants repartent dans l'ancienne zone après un rechargement.
- **Convex hull** : `calculateConvexHull(pts)` reçoit tous les points du projet (il n'y a plus
  de point de référence à exclure).
- **Header et menu** : header **compact de 121 px**, dont les **quatre couches sont en
  `position: absolute`** (le header n'est plus un conteneur flex) :
  1. `.header-logo-layer` — logo vectoriel `assets/logo-rtk-mower.svg` (un seul `<path>`), bande
     de 65 px de haut sur toute la largeur, `preserveAspectRatio="xMidYMid slice"` (≈ 3 px
     rognés), en `fill="currentColor"` blanc, `aria-hidden="true"` (décoratif) ;
  2. `.header-title` — `MOWER SURVEY` + sous-titre `RTK - ACQUISITION TERRAIN`, **typographie
     harmonisée avec l'écran d'accueil** (3.99) : `.logo-text` reprend `.welcome-title`
     (Arial Black, `font-weight: 900`, `letter-spacing: 1px`, `line-height: 1`) et
     `.header-subtitle` reprend `.welcome-subtitle` (police héritée du body, 700, capitales,
     interlettrage), avec des tailles adaptées à la largeur du header. Depuis la 4.02 il est
     **blanc** (`color: #fff`, même exception que `.logo-text`), `opacity: 1` et porte
     `text-shadow: var(--text-shadow-subtitle, 0 1px 2px rgba(0,0,0,0.5))` : sans cela il héritait
     de la couleur sombre du body et restait peu lisible sur le vert.
     `.header-title` est en `text-align: center`, `line-height: 1`, `top: 24px`, centré entre le
     rover et la roue dentée (`left: min(150px, 38vw)` / `right: min(60px, 16vw)`, `z-index: 2`).
     **Replis obligatoires** (3.96) pour les navigateurs anciens et les feuilles en cache :
     `font-size: 22px` puis `clamp(16px, 5vw, 26px)` ; `left`/`right` en pixels puis en `min()` ;
     `text-shadow` littéral puis `var(--text-shadow-header, 0 2px 4px rgba(0,0,0,0.3))`
     (un token absent rendrait `var()` invalide et supprimerait l'ombre). **Plafond 26 px** et non
     40 px : le header est une colonne limitée à 480 px (`max-width` de l'app) même sur un écran
     1280 px, le titre n'y dispose donc que de ~270 px.
     **Priorité mobile (3.98)** : sous 480 px, `left: 36vw` / `right: 16.4vw` (≈ 140 / 64 px à
     390 px), `.header-title` en `display: flex` + `flex-direction: column` +
     `justify-content: center` + `align-items: center`, titre en `display: block` +
     `font-size: clamp(18px, 6.2vw, 25px)` (≈ 24 px à 390 px) et `transform: scaleX(0.8)` +
     `transform-origin: center` : l'espace libre entre le rover (≈ 138 px) et la roue (334 px)
     fait ≈ 196 px alors qu'un « MOWER SURVEY » de 25 px mesure ≈ 233 px — la condensation de
     20 % conserve la **hauteur** d'un 25 px centré sans passer sous la roue. Sous-titre mobile :
     `clamp(8px, 2.3vw, 11px)` + `letter-spacing: 1.2px`. Sous 360 px : `left: 36vw` /
     `right: 58px`, titre `clamp(16px, 5.8vw, 21px)`, sous-titre `clamp(7px, 2.1vw, 10px)`.
     Les cinq CSS locales sont référencées avec `?v=3.99` dans `index.html` (cache-busting
     GitHub Pages, `serve-http.cjs` ignore la requête) ;
  3. `#btnConnectionSettings` — roue dentée (SVG Lucide `settings` 18 px, **icône seule** sans
     cercle ni fond, zone tactile 44 × 44 px), **en haut à droite** via
     `header #btnConnectionSettings { position: absolute !important; top: 6px; right: 12px; z-index: 3 }`,
     ouvre le panneau de connexion ;
  4. `.header-bottom-band` — bandeau bas (`bottom: 6px`, `left/right: 12px`, `z-index: 2`) :
     pastille `#headerGpsStatus` **compacte** à gauche (`flex: 0 0 auto`) puis
     `.header-actions-group` à droite : `#btnHeaderCollapse` (chevron), **`#btnLock`** (cadenas,
     déplacé de la carte vers le header en 4.02, icônes `lock` / `unlock` injectées par
     `setScreenLock()`), `#btnTheme` puis `#btnBle` — tous `.header-icon-btn`, en `currentColor`.
     Conséquence : en **plein écran carte** (header masqué) le verrouillage n'est plus accessible.

  **Tout nouvel enfant direct de `<header>` doit être positionné en absolu** : sans cela il
  retombe dans le flux, en haut à gauche (c'était le bug de la roue dentée après l'intégration).
  La pastille affiche **toujours « FIX »** (`#headerGpsText`) ; le détail (type de fix +
  précision) est porté par son `title` et la couleur par sa classe d'état. Fond :
  `var(--color-primary-deep)` (aucun override en dur en thème nuit). Maintenance du logo : §10.

  Il remplace l'ancienne `#fixBar`. Le panneau `#headerMenu` — ouvert par
  `toggleConnectionPanel()` → `toggleHeaderMenu()` — est organisé en **trois cartes**
  `.menu-card` (`gap` 10 px, fond `--color-bg-subtle`, filet `--border`, titre
  `.menu-card-title` en capitales 10 px / 800) :
  1. **Connexion** : station NTRIP + `#saveIndicator`, puis la ligne `#cloudSyncRow`
     (`#cloudSyncStatus`, lien discret `#btnCloudAuth`, `#cloudSyncEmail` en 11 px `--text3`
     sous le lien) ;
  2. **Affichage** : deux interrupteurs pleine largeur `#btnPointNumbers` « Numéros des points »
     (icône Lucide `hash`) et `#btnGlovesMode` « Mode Gants/Soleil » (icône `sun`),
     `role="switch"` + `aria-checked`, piste `.menu-switch-track` de **48 × 28 px** (56 × 32 en
     mode Gants) ;
  3. **Données** : `#exportFormatSelect` (GeoJSON / CSV / GPX, `rtkExportFormat`) et,
     **uniquement si la file n'est pas vide**, `#offlineQueueIndicator`
     (« N demande(s) en attente », bouton qui appelle `processOfflineQueue()`).
  Le thème et le BLE sont **dans le header**, la parcelle courante **dans le menu FAB de
  TRACÉS**, ne pas les remettre dans le menu (doublons d'ID interdits). **Aucune ligne
  Parcelle** dans ce panneau : la parcelle est uniquement dans la 1re ligne du menu FAB de
  TRACÉS (visible même sans parcelle).
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
- **Header rétractable (4.00)** : `#btnHeaderCollapse` (`.header-icon-btn`, 44 × 44 px, chevron
  Lucide `chevron-up` / `chevron-down` via `ICON_CHEVRON_UP` / `ICON_CHEVRON_DOWN` de `js/app.js`)
  est le **1er bouton** de `.header-actions-group`. `toggleHeaderCollapse()` →
  `applyHeaderCollapsed()` pose `body.header-collapsed` (persisté dans `rtkHeaderCollapsed`,
  **déployé par défaut : aucune régression**) qui réduit `header` de **121 px à 52 px**
  (`.header-logo-layer` et `.header-title` en `opacity: 0`), fait passer la roue dentée dans le
  bandeau (`top: 4px`) et lui réserve la place (`.header-actions-group { margin-right: 52px }`).
  La carte gagne **~69 px** (mesuré à 390 px : `#map-points-slot` 659 → 728 px). `aria-expanded`
  et le libellé (« Replier / Déplier l'en-tête ») suivent l'état ; `refreshMapSize()` (`js/map.js`)
  appelle `map.invalidateSize({ animate: false })` immédiatement puis après 260 ms (transition de
  hauteur de 0,22 s, neutralisée en `prefers-reduced-motion`). `initHeaderCollapse()` restaure
  l'état au démarrage (appelée dans le `DOMContentLoaded` de `js/app.js`). Ne pas mettre le
  bouton ailleurs dans le header : le bandeau est la seule zone qui survit au repli.
- **Icônes des boutons** : les icônes d'action sont des **SVG Lucide inline**, jamais des emoji
  (rendu variable selon la plateforme). Les icônes générées en JS sont centralisées dans
  `js/app.js` — `ICON_PENCIL`, `ICON_TRASH`, `ICON_MOON`, `ICON_SUN`, `ICON_CROSSHAIR`,
  `ICON_RULER`, `ICON_PLUS`, `ICON_MAXIMIZE`, `ICON_MINIMIZE`, `ICON_LOCK`, `ICON_UNLOCK`,
  `ICON_COMPASS`, `ICON_MORE_VERTICAL`, `ICON_FOLDER_OPEN` — fichier chargé **avant**
  `projects/points/map/history/camera` : ne pas
  redéclarer ces constantes ailleurs (`SyntaxError` de redéclaration dans le scope global).
  Les icônes statiques (header, contrôles de carte, menus FAB, boutons de la section POINTS,
  tiroir, verrouillage) sont écrites dans `index.html`. Toujours
  `fill: none` + `stroke: currentColor` (ou `fill: currentColor` pour une pastille), conteneur
  `inline-flex` centré et `svg { display: block; pointer-events: none }`.
  Aucun emoji dans un contrôle : `map` (Relief), `satellite`, `maximize` / `minimize`
  (plein écran carte **et** caméra), `lock` / `unlock` (verrouillage), `plus` (FAB neutre,
  « Nouvelle parcelle », « Créer la parcelle »), `check` (FAB secondaire), `x` (tiroir),
  `compass` (boussole du HUD), `chevron-down` (sélecteur de cible),
  `save` (indicateur de sauvegarde), `share-2` / `download` (exports et hub de transfert),
  `folder-open` (historique). Dans l'interface, le **type d'un point** est rendu par une
  pastille CSS : `.point-dot` (14 px, listes) ou `.type-dot` (10 px inline : popups carte,
  libellés RELEVÉ, historique, cible caméra), colorée par
  `--color-tonte` / `--color-interdit` / `--color-obstacle`. Le champ `point.icon` (🟢/🔴/🟡)
  **n'est pas modifié** : il reste exporté dans le GeoJSON (contrat Mower Planner) mais n'est
  plus affiché. Les **types d'obstacles** sont eux aussi rendus en SVG Lucide, indexés par
  `subtype` dans `OBSTACLE_ICON_SVG` (`js/app.js`) via `getObstacleIconMarkup()` : `trees`
  (Arbre), `circle-dot-dashed` (Forage), `utility-pole` (Poteau), `axe` (Souche), `mountain`
  (Talus), `map-pin` (Divers — sous-type stocké `Perso` — **et repli** des anciens types).
  La modale les présente dans cet ordre : **Arbre, Forage, Poteau, Souche, Talus, Divers**.
  Le sous-type stocké de « Divers » reste **`Perso`** : `getObstacleTypeLabel()`
  (`OBSTACLE_TYPE_LABELS`, `js/app.js`) traduit le libellé à l'affichage (listes, popups,
  RELEVÉ, cible caméra, import, toast du FAB) sans toucher aux données ni au GeoJSON.
  Les icônes apparaissent dans la
  modale `#obstacleModal` (`.obstacle-option-icon`), la liste des points, les popups carte,
  le sélecteur d'import des parcelles et la cible caméra (`.obstacle-type-icon`). Seul le
  `<select>` natif `#targetSelect` reste en texte (un `<option>` ne peut pas contenir de SVG).
  Le bouton BLE `#btnBle` suit la même règle : `getBleIconMarkup(connected)` (`js/ble.js`)
  renvoie `bluetooth` quand la connexion est active et `bluetooth-off` sinon (état par défaut
  d'`index.html`), avec les trois ondes animées et **sans encadrement**
  (`border: none`, fond transparent). Il est en **`currentColor`** (blanc du header) : les
  règles `#btnBle.connected` / `.disconnected` de couleur bleue/verte ont été retirées.
  `setBleStatus()` transmet l'état : `connected` seul est vrai, `disconnected` / `scanning` /
  `connecting` restent sur l'icône barrée.
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
  `deleteProjects(ids)` applique la même logique à plusieurs parcelles (une confirmation) via
  `removeProjectsByIds()` ; `deleteCurrentProject()` reste un raccourci. Ne pas redéfinir
  `deleteProject()` ailleurs (doublon historique supprimé de `js/history.js`).
- **Export / transfert** : plus aucun bouton d'export dans la liste des parcelles ni dans la
  vue détail (le bouton de ligne « Exporter » a été retiré en 3.66). Le seul point d'entrée est
  le hub `#transferModal` (bouton « Transférer » de la barre de sélection) :
  - une parcelle : « Télécharger le fichier » applique le format du panneau Connexion
    (`#exportFormatSelect`, clé `rtkExportFormat`, défaut `geojson`) via
    `exportProjectDefaultFormat()` → `exportProjectGeoJSON()` / `exportCSV(projet)` /
    `exportGPX(projet)` ;
  - plusieurs parcelles : un **ZIP unique** (`buildProjectsZip()`, JSZip 3.10.2) contenant un
    GeoJSON par parcelle. Le partage natif n'envoie que ce ZIP (contourne le bug Android du
    partage multi-fichiers), avec repli en téléchargement.
  `buildGeoJSON()` centralise la construction et les métadonnées `date_creation` /
  `version_app` / `source` ajoutées à **toutes** les features (contrat GeoJSON inchangé).
- **Hub de transfert** : `#btnSelectionTransfer` (barre de sélection de PARCELLES : icône
  `share-2` + « Transférer ») ouvre `#transferModal` (`js/export.js`), qui propose **trois
  canaux**, dans cet ordre (3.92) :
  1. « Télécharger le fichier » (`transferOpenDownloads()`) → téléchargement direct : format
     choisi dans le panneau Connexion pour une parcelle, ZIP GeoJSON pour plusieurs ;
  2. « QR Code animé » (`transferViaAnimatedQr()` → `startAnimatedQrTransfer()`, icône Lucide
     `scan-line`) : **sans réseau**, séquence lue par `scan.html` sur l'autre appareil (voir le
     bullet dédié) ;
  3. « QR Code statique » (`transferViaLocalServer()`, ex-« Recevoir sur cet appareil ») →
     panneau `#transferLocalPanel` avec l'adresse réseau fournie par
     **`GET /api/local-info`** (`serve-http.cjs`, `os.networkInterfaces()`, IPv4 non internes),
     un **QR code** de cette adresse et un bouton « Copier » (`copyTransferLocalUrl()`).
  `openTransferModal({ projectIds })` ouvre le hub en mode sélection multiple (sous-titre
  « Sélection : N parcelles »). La modale se ferme au voile, avec Échap (prioritaire sur le menu
  d'export) et au changement d'onglet (`showTab()` appelle `closeTransferModal()`), avec piège
  de focus et retour du focus sur le bouton déclencheur de la barre de sélection. Sans point,
  `openTransferModal()` affiche « Aucun point à transférer ». Le focus d'ouverture se pose sur
  `getFirstTransferOption()` (première option visible). Les canaux « Partage rapide » et
  « Enregistrer sur Drive / Cloud » (ainsi que la sonde `canShareTransferFiles()` /
  `syncTransferCapabilities()` et la note `#transferUnsupportedNote`) ont été **supprimés** :
  le téléchargement couvre le besoin et Firebase synchronise déjà les parcelles entre appareils.
  `shareProjectsZip()` / `shareProjectGeoJSON()` subsistent pour la file d'attente hors-ligne.
- **QR code du mode local** : `js/qrcode.js` est un générateur **autonome** (mode octet,
  niveau M, versions 1 à 10, SVG) chargé **avant** `export.js` : aucun CDN, le mode local doit
  fonctionner sans Internet. `renderTransferLocalQr(url)` remplit `#transferLocalQr` via
  `renderQrCodeSvg(url)` (zone de silence de 4 modules, `shape-rendering="crispEdges"`) ; le
  conteneur est masqué sans adresse. Couleurs imposées par les tokens `--color-qr-surface` /
  `--color-qr-module` (fond clair même en thème nuit, sinon le QR devient illisible).
- **Note USB** : `.transfer-note` en bas de `#transferModal` rappelle le transfert par câble :
  télécharger sur le téléphone, puis copier le fichier sur la tablette via le gestionnaire de
  fichiers. Elle reste visible dans les deux vues (options et QR statique).
- **QR animé (bibliothèque vendorisée)** : `js/vendor/animated-data-qr/` contient
  `animated-data-qr-js` **v0.1.0** (MIT) — bundle UMD, worker décodeur, `zxing_reader.wasm`,
  `LICENSE` et un `README.md` de provenance. **Le paquet npm `animated-data-qr-js` n'est pas
  publié** : la balise CDN documentée en amont renvoie 404, il n'y a aucune release GitHub et
  `dist/` n'est pas committé dans le tag `v0.1.0`. Les fichiers viennent donc du GitHub Pages
  du projet amont. Ne pas réintroduire de CDN : le hub doit rester utilisable hors Internet.
  Points à ne pas casser : le global est **`AnimatedDataQR`** (le README amont écrit
  `AnimatedDataQr`, c'est une coquille) ; les trois fichiers `js`/`wasm` doivent rester dans
  le **même dossier**, car le bundle résout worker et wasm relativement à son propre `src`
  (`document.currentScript.src`) et surcharge `locateFile()` vers le wasm local. Le script est
  chargé **avant les scripts applicatifs** (après JSZip) dans `index.html`.
  `serve-http.cjs` sert `.wasm` en `application/wasm` (obligatoire pour
  `WebAssembly.instantiateStreaming`).
- **QR animé — émetteur** : l'option « QR Code animé » (`#transferOptionAnimatedQr`, icône
  Lucide `qr-code`) du hub appelle `transferViaAnimatedQr()` → `startAnimatedQrTransfer()`
  (`js/export.js`). `buildAnimatedQrPayload(projects)` transmet l'**octet exact** de
  `buildGeoJSON()` (une parcelle) ou le ZIP de `buildProjectsZip()` (sélection), puis
  `createQrSender()` monte son `<canvas>` dans `#animatedQrStage`. Preset **`compatibility`**
  (`resolveTransferPreset`, repli codé en dur) : 220 octets/bloc, 250 ms/frame, parité 4.
  `#animatedQrModal` affiche la frame et la boucle (calendrier `frameIntervalMs` rejoué), le
  nombre de blocs, la taille et la durée de boucle ; `#btnAnimatedQrToggle` alterne
  « Arrêter » / « Reprendre » et `closeAnimatedQrModal()` détruit l'émetteur. Échap ferme la
  modale (priorité après `#transferModal`), piège de focus via `trapOverlayFocus()`.
  **Contrat de la charge utile** : **toujours un ZIP** (`kind:'zip'`,
  `ANIMATED_QR_ZIP_MIME = 'application/zip'`), y compris pour **une seule parcelle** — un seul
  cas à gérer côté émetteur comme côté récepteur, et la compression DEFLATE réduit le nombre de
  frames QR à afficher. Nom : `RTK_<nom>_<date>.zip` pour une parcelle unique (dérivé de
  `archive.entries[0]`, donc identique au GeoJSON contenu), sinon `RTK_parcelles_<date>.zip`.
  Libellé : `Parcelle : <NOM>` (une parcelle) ou `Sélection : N parcelles` où N =
  `archive.count`, parcelles réellement présentes dans le ZIP. Chaque entrée reste l'octet
  exact de `buildGeoJSON()` (contrat Mower Planner inchangé). `ensureAnimatedQrBlob()` garantit le type MIME du Blob, et
  `fileName` + `mimeType` sont **toujours** passés à `loadBlob()` : un `Blob` n'a pas de `.name`,
  la bibliothèque retomberait sinon sur `transfer.bin` / `application/octet-stream` et le
  récepteur ne pourrait plus reconnaître le ZIP. `startAnimatedQrTransfer()` lit la sélection
  via `getTransferProjects()` (donc `transferSelectionIds`, renseigné par
  `openTransferModal({ projectIds })`) **avant** `closeTransferModal()`, et ne duplique plus le
  toast d'échec de `buildAnimatedQrPayload()`.
- **QR animé — récepteur `scan.html`** : page autonome qui charge **JSZip 3.10.2**, le vendor
  puis `js/scan.js`, et monte `createQrReceiver()` (la bibliothèque crée son `<video>` et
  appelle `getUserMedia` avec `facingMode: environment`). Progression par blocs
  (`onProgress`) et frames (`onDiagnostics`), puis téléchargement à partir de `result.blob` et
  de `result.fileName`. **Détection du ZIP** (`isZipPayload()`) : type MIME
  (`application/zip`, `application/x-zip-compressed`, `multipart/x-zip`), extension `.zip`,
  puis **signature binaire** `PK` (`50 4B 03/05/07`) lue par `readScanHead()` — un manifeste
  sans type MIME reste donc reconnu. L'émetteur envoyant **toujours un ZIP** (même pour une
  parcelle), c'est le cas nominal ; le GeoJSON seul reste accepté pour une séquence produite
  par une version antérieure. Si c'est un ZIP : bouton « Télécharger le ZIP » (au lieu
  de « Télécharger le GeoJSON »), comptage via `JSZip.loadAsync()` (`describeZipPayload()`) →
  « Archive ZIP — N fichier(s) · M entité(s) », liste des entrées dans `#scanFileList` et
  vérification que chaque `.geojson` est une `FeatureCollection` (sinon « N GeoJSON
  invalide ») ; sans JSZip (page hors ligne), message générique mais téléchargement inchangé.
  `normalizeScanResult()` accepte `result.blob`/`result.fileName` **et** le format
  `kind:'folder'` de la bibliothèque (`archiveBlob` / `archiveFileName`, format « SARC1 »).
  `getScanFallbackName()` donne un nom de repli cohérent (`.zip` ou `.geojson`). La caméra
  exige un **contexte sécurisé** (HTTPS ou localhost) : la page affiche un avertissement et
  `window.scanPage` expose `start/stop/restart/download` pour les tests. Le contenu reçu n'est
  jamais retraité : le contrat GeoJSON reste celui de `buildGeoJSON()`.
- **File d'attente hors-ligne** : `rtkOfflineQueue` (`localStorage`) stocke les demandes
  d'export/partage émises quand `navigator.onLine === false` :
  `{ id, type: 'export'|'share', projectId, format: 'geojson'|'csv'|'gpx', timestamp }`.
  `projectId` vaut `null` pour une sélection multiple, avec en plus
  `projectIds: [...]` pour rejouer le ZIP. `exportProjectGeoJSON()`, `exportGeoJSON()`,
  `exportCSV()`, `exportGPX()`, `shareGeoJSON()`, `shareProjectsZip()` et
  `downloadProjectsZip()` appellent `queueOfflineRequest()` si hors-ligne (toast
  « Hors connexion — demande ajoutée à la file d'attente ») au lieu d'écrire le fichier.
  `initOfflineQueue()` branche `window.addEventListener('online', processOfflineQueue)`;
  `processOfflineQueue()` rejoue chaque demande via `executeOfflineRequest()`, vide la file
  et affiche « File d'attente traitée : N export(s) ». L'indicateur du panneau Connexion
  permet aussi un traitement manuel (utile pour `navigator.share`, qui exige un geste
  utilisateur).
- **Onglet HISTORIQUE en deux vues** : la vue **racine** `#historyListView` porte le titre
  `PARCELLES` et la liste `#historyList` (`loadHistory()`) ; chaque **carte**
  (`.session-item`) est **cliquable** et ouvre le détail (`handleHistoryCardClick()` →
  `openHistoryDetail(id)`), sauf sur la case à cocher (`.session-select-label`) et sur le
  **menu ⋮** (`.session-menu-wrap`, `ICON_MORE_VERTICAL`). Il n'y a **plus de boutons
  « Ouvrir » / « Suppr. »** dans la carte : le menu contextuel `.session-menu`
  (`toggleHistoryCardMenu()`) propose « Ouvrir » et « Supprimer » (`deleteProject()`) et se
  referme au clic extérieur, avec **Échap**, au défilement ou via `closeHistoryCardMenus()`.
  La vue **détail** `#historyDetailView`
  (`hidden` par défaut) contient l'en-tête `.history-detail-header` — uniquement
  `#btnHistoryBack` (« ← Parcelles », `closeHistoryDetail()`) — puis `#pointsSection`.
  Le bouton « Transférer » a été retiré de cette vue (3.67) : le transfert est accessible par
  la barre de sélection de la vue PARCELLES.
  `syncHistoryView('list' | 'detail')` bascule les deux vues par `hidden` ;
  `showTab('tab-history')` revient **toujours** sur la racine.
  `openHistoryDetail()` sélectionne la parcelle (`switchProject()`), affiche ses points
  (ZT, ZI, obstacles) et laisse la main au hub de transfert.
  Chaque carte porte une **case à cocher** (`.session-select` dans `.session-select-label`) :
  `toggleHistorySelection()` alimente `historySelection` (Set) et `syncHistorySelectionUI()`
  affiche la **barre d'action flottante** `#historySelectionBar` (`.history-action-bar`,
  `position: fixed`, **hors de `.app-wrapper`** comme `#bottomNav`, 10 px au-dessus de la
  navigation basse, `z-index: 950`, `hidden` sans sélection, glissement
  `history-action-bar-in` désactivé en `prefers-reduced-motion`) avec `#btnSelectionBack`
  (croix Lucide, `clearHistorySelection()`), `#selectionCount` et les actions
  `transferSelectedProjects()` / `deleteSelectedProjects()` (icônes `share-2` / `trash-2`,
  libellés masqués ≤ 420 px). La classe `body.history-selection-active` réserve la hauteur de
  la barre (`#historyListView { padding-bottom: 82px }`) et remonte les toasts.
  La sélection est purgée à l'ouverture du détail (`syncHistoryView('detail')`), à l'entrée
  **et à la sortie** de l'onglet (`showTab()` : aucune barre ne reste sur TRACÉS / CAMÉRA /
  RELEVÉ) et après suppression. **Transfert** : une seule parcelle → hub
  existant sur cette parcelle ; plusieurs → `openTransferModal({ projectIds })`, le hub
  produit alors un **ZIP GeoJSON unique** (partage natif du ZIP, repli téléchargement).
  **Suppression** :
  `deleteProjects(ids)` (`js/projects.js`) demande **une seule** confirmation puis passe par
  `removeProjectsByIds()` (cœur commun avec `deleteProject()`).
  L'en-tête `.points-section-head` affiche `« PARCELLE :<NOM> »` — **aucun espace** entre le
  titre et le nom (`gap: 0` + `margin-left: 0`), sans bouton. `#pointsSection` contient
  `#pointCount` et `#pointsList`.
  **Plus de badge « Zone #N »** :
  la rangée `.points-view-meta` ne porte que `#pointCount`, aligné à droite
  (`margin-left: auto`) ; `updateZoneBadge()` subsiste mais ne fait rien (élément absent).
  Les en-têtes de groupe (`renderGroup()`) n'affichent **plus de compteur à droite** (3.67) :
  seuls le libellé (`Zone de tonte (ZT)`, `Obstacles isolés`…) et le compteur global
  `#pointCount` subsistent.
  Les obstacles sont affichés **sans numéro d'ordre** (« Arbre », « Divers ») dans la liste et
  la popup : `point.index` reste dans les données (cible CAMÉRA, exports). La réserve de la
  barre de navigation est portée par `#tab-history` (`flex: 1 1 0`, `min-height: 0`,
  `padding-bottom: 64 px + safe-area + 24 px`) : pas de padding supplémentaire dans
  `#historyDetailView`. Le menu FAB TRACÉS ne contient plus d'option « Historique » :
  `openPointsView()` et ses alias (`closePointsView()`, `togglePointsView()`,
  `scrollToPointsPanel()`) sont supprimés — ne pas les réintroduire.
- **Verrouillage d'écran** : bouton flottant `#btnLock` (carte), voile `#lockOverlay` affiché
  par `body.locked`, glissement horizontal `.lock-swipe` (72 % du parcours) ou Entrée/Espace.
  `setMapInteractionEnabled(false)` coupe les gestes Leaflet et `canRecordPoints()` bloque
  l'enregistrement ; le FAB est sous le voile `z-index: 3000`.
- **Sauvegarde locale** : `saveProjects()` écrit via `persistProjectStorage()` ; l'indicateur
  `#saveIndicator` est une **pastille verte** (`.save-indicator`) avec l'icône Lucide `save`
  16 px et le libellé `#saveIndicatorLabel` « Sauvegardé » (11 px / 800, fond
  `--color-primary-pale`). Il clignote (`flashSaveIndicator()`) et porte
  `title` / `aria-label` = « Sauvegardé localement à HH:MM:SS » (heure de la dernière
  sauvegarde au survol). `autosaveInterval` réécrit toutes les
  30 s, et `pagehide` / `visibilitychange` / `beforeunload` déclenchent
  `flushProjectStorage()`. Une erreur de quota affiche un toast et n'indique pas « Sauvegardé ».
- **Panneau Connexion — bloc « Synchronisation » (3.93 → 3.95)** : la ligne `#cloudSyncRow`
  (dans la carte `.menu-card` « Connexion ») est en `flex-wrap: wrap` ; le libellé, la pastille
  d'état (`#cloudSyncStatus`) et `#btnCloudAuth` occupent la 1re ligne, puis l'adresse du
  compte est dans un **bloc dédié** `div.cloud-account` (`display: block`, `width: 100%`,
  `flex: 1 1 100%`, `margin-top: 4px`) qui contient
  `#cloudSyncEmail.cloud-account-email` (`white-space: normal`, `overflow-wrap: anywhere`,
  11 px / 600 `--text3`, **aucune ellipse**) : l'adresse est **toujours lisible en entier**, sur
  une ou deux lignes (l'ancienne règle la réduisait à « wor… »). Le bloc et la classe sont
  volontairement **nouveaux** pour qu'un ancien CSS en cache ne puisse pas réintroduire l'ellipse.
  `#btnCloudAuth` est depuis la 3.95 un **lien discret** (`text-decoration: underline`, fond
  transparent, sans bordure, 11 px / 800, `--color-primary`) : `renderCloudUi()`
  (`js/cloud-sync.js`) y injecte `ICON_LOG_OUT` (Lucide `log-out`, 16 px, `js/app.js`) quand un
  compte est actif, avec le libellé « Se déconnecter » ; la hauteur de la cible tactile reste
  44 px (règle globale `button`).
  `openAuthModal()` ferme le panneau via `closeConnectionPanelForAuth()` (appel de
  `closeHeaderMenu()` + retrait direct de `.show` / `aria-hidden` + `aria-expanded=false`, puis
  trace console `[auth] openAuthModal — closeHeaderMenu() appelé, panneau fermé : true`), et
  `#authModal` est porté à **`z-index: 5000`** (`css/main.css`) : même si l'utilisateur rouvre la
  roue dentée (panneau 4000, voile 3999) pendant que la modale est ouverte, celle-ci reste **au
  premier plan** et ses champs restent cliquables. Le bouton « Se connecter » reste branché sur
  `toggleCloudAuth()` (déconnexion quand un compte est actif), qui appelle `openAuthModal()`
  quand personne n'est connecté.
- **Synchronisation cloud (Firestore)** : `localStorage` reste la **source locale** (terrain
  sans réseau) ; Firestore synchronise les parcelles entre appareils. `js/firebase-config.js`
  porte `FIREBASE_CONFIG` (valeurs publiques) et `CLOUD_SYNC_ENABLED` ; `js/cloud-sync.js`
  gère l'authentification e-mail/mot de passe, `onSnapshot` temps réel, l'envoi groupé différé
  (1,5 s, `scheduleCloudPush()` depuis `persistProjectStorage()`), la migration initiale
  (cloud vide + parcelles locales, une fois par compte via `rtkCloudMigrated_<uid>`) et
  l'interface (bloc « Synchronisation » du panneau Connexion + modale `#authModal`).
  Modèle : `users/{uid}/projects/{projectId}` = `{ payload, name, updatedAt }`. **Un snapshot
  vide n'écrase jamais le local** (protection contre les états transitoires). Hors-ligne :
  `enablePersistence()` (cache IndexedDB) et l'application reste utilisable sans compte.
  **Protection des modifications locales (3.88)** : `cloudBaseline` mémorise la signature de
  chaque parcelle telle que confirmée par Firestore (ou appliquée depuis le cloud) ;
  `collectDirtyProjects()` déduit les parcelles modifiées localement et pas encore poussées.
  `handleCloudSnapshot()` **fusionne** au lieu d'écraser : une parcelle « sale » garde sa
  version locale, un écho de push (contenu identique à `updatedAt` près) est ignoré, et un
  résultat identique au local ne déclenche **aucun** rendu — c'est ce qui faisait disparaître
  puis réapparaître le dernier point d'une zone. `refreshCloudBaseline()` est appelée après
  chaque push réussi et après chaque application de snapshot. Le payload poussé porte un
  `updatedAt` ISO local (horodatage logique) en plus du `updatedAt` serveur du document.
  **Synchronisation bidirectionnelle (3.89)** : `pushProjectsToCloud()` est **sélectif** —
  seules les parcelles « sales » (`collectDirtyProjects()`) sont envoyées, plus les
  suppressions ; avant, toute la liste était réécrite à chaque envoi, ce qui écrasait les
  modifications faites sur l'autre appareil (asymétrie PC → téléphone). La référence
  `cloudBaseline` n'est mise à jour que pour les parcelles réellement poussées (une parcelle
  modifiée pendant l'envoi reste « sale »). Un snapshot distant reçu **pendant** un envoi
  **ne rejoue jamais la liste brute** : `mergeRemoteProjects()` est rappelée sur le dernier état
  distant connu (`cloudLastRemote`) afin de **recalculer la fusion** sur l'état local à jour —
  c'est ce qui faisait disparaître le point ajouté pendant l'envoi (3.90). Au
  **retour au premier plan** (`visibilitychange`) et au retour du réseau (`online`),
  `refreshCloudFromServer()` force une lecture `get({ source: 'server' })` et réattache
  l'écoute `onSnapshot` si nécessaire : sans cela, le téléphone en veille ne recevait pas les
  modifications du PC. Diagnostic à chaud : `window.__MOWER_SYNC_DEBUG = true` →
  `syncLog()` (en `console.log`, pas `console.debug` : le niveau « Verbose » est masqué par
  défaut) trace `envoi planifié`, `envoi`, `snapshot reçu`, `fusion … conservée`,
  `application différée`, `rejeu de la fusion`, `application distante`.
  **Protection d'édition locale (3.91)** : `isProjectBeingEdited(project)` bloque tout snapshot
  distant pour la parcelle **en cours de tracé** (`APP.tracesMode === 'creation'` ou
  `APP.currentTraceMode` sur `currentProject`) et pendant `CLOUD_EDIT_GUARD_MS` (2 s) après une
  saisie locale (`cloudEditGuard`, alimentée par `scheduleCloudPush()`). C'est la garantie
  ultime : le dernier point d'une zone en création ne peut plus être écrasé par le cloud.
  Prérequis et règles Firestore à publier : [docs/firebase.md](docs/firebase.md) —
  notamment l'ajout des domaines (localtunnel, GitHub Pages) dans **Authentication →
  Domaines autorisés**, sinon `auth/unauthorized-domain`. La configuration web Firebase
  (`apiKey`) est publique : la sécurité repose sur les règles Firestore.
- **Distances de tracés** : `leaflet-measure-path` est chargé par CDN **après Leaflet** (CSS
  dans `<head>`, JS après `leaflet.js`). Les polygones de tonte **et des zones interdites**
  passent `showMeasurements: true` et `ZONE_MEASUREMENT_OPTIONS` (`showArea: false`,
  `showTotalDistance: false`, `minPixelDistance: 10`) dans `js/map.js`. À **2 points**,
  `renderMap()` crée une `L.polyline` temporaire mesurée par type (`tempMeasureLine` pour la
  tonte, `tempMeasureLineInterdit` pour l'interdit), supprimée dès le 3ᵉ point où le polygone
  prend le relais (`clearTempMeasureLine('tonte'|'interdit')`). **Le trait et le métré à
  2 points dépendent entièrement de `renderMap()`** : `addPointToMap()` doit donc appeler le
  rendu complet dès que la **zone courante** compte ≥ 2 points
  (`getInterditZones()[getCurrentInterditZoneId()]`), et non plus à partir de 3 points de toute
  la parcelle (ancienne règle qui privait une parcelle neuve du trait et de la mesure jusqu'au
  3ᵉ point, corrigée en 3.86). Ne pas retirer ces deux balises CDN.
- **Labels de zone et numéros de points** : `addZoneLabel(type, zoneId, zonePts)` pose un
  `L.tooltip` permanent au centre de chaque zone, **avec le code seul** (`ZT1`, `ZT2`, `ZI1`…,
  classe `.zone-name-label`, zoom ≥ `ZONE_LABEL_MIN_ZOOM = 18`). La **surface n'est jamais
  écrite sur la carte** : elle reste dans `zonePopup()` (`Surface : …`) et dans l'export
  (`surface_m2`). Les numéros des points (`bindPointNumberTooltip()`) ne sont affichés que si
  l'option `rtkShowPointNumbers` vaut `'1'` (`showPointNumbers`, `js/map.js`, **désactivée par
  défaut**), pilotée par le switch `#btnPointNumbers` du panneau Connexion
  (`togglePointNumbers()` → persistance + `renderMap()`).
- **Onglet CARTE supprimé** : un seul écran cartographique (TRACÉS). Les outils de la carte
  (zoom ±, Relief / Satellite, centrage, suivi GPS, plein écran) vivent dans le **panneau latéral
  rétractable** `#mapToolsPanel` (bord droit, 4.01) — plus aucun rail à gauche de la carte ;
  l'export reste accessible par le bouton « Exporter » de chaque ligne de PARCELLES (HISTORIQUE),
  la vue détail ne contient plus ni export ni « Effacer » (3.65).
- **Démarrage sans parcelle** : à chaque chargement, `currentProject` est forcé à `null` et
  la clé `rtkCurrentProject` est purgée, **même si une parcelle était mémorisée** : aucun
  projet « Mon jardin » n'est créé et aucune parcelle n'est restaurée automatiquement.
  `#traceFab` reste **visible** sur TRACÉS ; son clic ouvre `#traceFabMenu` dont la 1re
  option « Parcelle : Aucune » ouvre le tiroir (création/sélection). La carte et la liste
  restent vides tant que l'utilisateur n'a pas choisi une parcelle ; `switchProject()` charge
  ensuite points, zones, carte et statistiques normalement.
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
  quand `APP.pendingObstacle` est renseigné (`recordObstacle()`) ou rouvre le choix du type.
  Sans parcelle, le clic principal ouvre le menu (la 1re option mène au tiroir).
  Le bouton secondaire `#traceFabSecondary` (icône Lucide
  `check`) termine la zone : sous 3 points, `customConfirm()` demande « Zone incomplète
  (X points). Terminer quand même ? » ; il est **masqué en mode obstacle** (un obstacle se
  valide avec le FAB) et **grisé/désactivé** (`disabled` + `.is-disabled`,
  `aria-disabled="true"`, `title` « Ajoutez au moins un point — … ») tant que la zone
  courante ne contient aucun point ; `savePoint()` et `deletePoint()` rappellent
  `syncTraceFabUI()` pour l'activer/désactiver. Un appui long sur le FAB ou sur « ✓ » rouvre
  le menu. **Câblage des gestes** : `bindTraceFabPress(el, longAction, clickAction)`,
  défini dans le **module partagé `js/fab-press.js`** (chargé avant `points.js` et
  `camera.js` ; constantes `LONG_PRESS_MS = 700` et `LONG_PRESS_MOVE_TOLERANCE_PX = 12`),
  déclenche l'action courte sur **`pointerup`** et non sur `click`, et réinitialise tout
  drapeau en fin de geste (`pointerup`, `pointerleave`, `pointercancel`) : un `click` perdu
  (doigt qui sort, `pointercancel`) ou neutralisé après un appui long ne bloque plus le tap
  suivant. Tout geste de plus de 12 px est un panoramique (aucune action) ; le clavier passe
  par `click` avec `detail === 0`. Le **FAB CAMÉRA** (`#cameraFab*`, `js/camera.js`) utilise
  exactement la même fonction : ne pas recréer de `bindLongPress` local (il existait une copie
  à 550 ms, supprimée en 3.84).
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
- **Popups de points** : `pointPopup()` (`js/map.js`) affiche l'icône, le nom/sous-type,
  la zone (`ZT1` / `ZI1`), le fix, l'altitude et les satellites, puis les actions
  (renommer / supprimer). **Pas de numéro d'ordre** (conservé dans `point.index`) ni
  d'horodatage : l'heure reste dans la liste des points (`renderPointsList()`) et dans les
  exports.
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
  (`.project-name` + `.stats-header .project-name` avec `margin-left: 0`) :
  le nom est **sur la même ligne que le titre**, en majuscules (`toUpperCase()` +
  `text-transform`), **gras (800)**, 12 px, `letter-spacing: 0.3px`, ellipse si trop long,
  `--color-primary-deep` / `--color-primary-light` en nuit. Le nom est rempli par
  `updateStatsDisplay()` (`js/stats.js`) : rafraîchi à l'ouverture de l'onglet
  (`showTab('tab-stats')`) et à chaque changement de parcelle.
- **Nom de parcelle harmonisé (RELEVÉ / HISTORIQUE)** : les deux en-têtes partagent la classe
  `.project-name` (`css/components.css`) — **une seule définition** (800 / 12 px / uppercase /
  `letter-spacing: 0.3px` / `--color-primary-deep`, ellipse). Ne pas réintroduire de style
  inline sur `#statProjectName` (il écraserait la graisse) ni de règle dupliquée par onglet :
  seules les propriétés de mise en page restent contextuelles (`.stats-header .project-name` :
  `flex: 0 1 auto` ; `.points-section-head .project-name` : `flex: 1 1 auto`) et **aucune
  marge** n'est ajoutée devant le nom (`margin-left: 0` dans les deux onglets).
- **Zones modifiables** : popup `zonePopup()` sur chaque polygone (tonte/interdit) avec
  `renameZone(type, zoneId)` et `deleteZone(type, zoneId)` ; noms stockés dans
  `project.zoneNames` et affichés par `getZoneDisplayName()`. Sans nom personnalisé, le
  libellé est **« Zone de tonte (ZT) »** / **« Zone interdite (ZI) »**, **sans numéro** : le
  code complet (`ZT1`, `ZI2`…) reste dans la méta de chaque point (`getZoneCode()`) et sur la
  carte. `deleteZone()` renumérote les points, recale les zones courantes et rafraîchit
  carte/liste/stats.
- **Renommage** : `renameProject(id)` / `renameCurrentProject()` (parcelle), `renameZone()`,
  `renamePoint(id)` utilisent `customPrompt()` (modale `#customModal`), refusent un nom vide
  sans fermer la modale et persistent via `saveProjects()`. Le nom d'un point est stocké dans
  `point.name` (indépendant de `subtype`) et exporté dans `properties.name` pour les obstacles.
  `deleteProject()`, `deleteZone()`, `renamePoint()` et `renameZone()` sont
  **asynchrones** (`await customConfirm/customPrompt`) : les appels programmatiques doivent
  attendre leur promesse.
- **Modales** : ne plus utiliser `confirm()` / `prompt()` natifs. `customConfirm()` et
  `customPrompt()` (`js/app.js`, `#customModal`) retournent des promesses ; Échap et le clic
  sur le voile annulent, le focus reste dans la modale et un nom vide est refusé sans la fermer.
- **Navigation basse** : `#bottomNav` (`.tabs-wrapper.bottom-nav`) est **fixe hors de
  `.app-wrapper`**, avec `z-index: 900` (sous le tiroir 1050, les modales 1100 et les toasts
  1200). `.screen` réserve `--bottom-nav-height` + `env(safe-area-inset-bottom)` : ne pas
  retirer ce padding, sinon le FAB et la vue POINTS passent dessous. `#tab-history` et
  `#tab-stats` ajoutent **24 px** de marge et bornent leur défilement (`flex: 1 1 0`,
  `min-height: 0`, `overflow-y: auto`) pour que le dernier bandeau reste visible sur les
  écrans Android/Samsung.
  La barre est masquée en plein écran par `body.map-ui-fullscreen .tabs-wrapper` et
  `body.camera-ui-fullscreen .tabs-wrapper`.
- **Surfaces** : `calculateArea()` attend des objets `{ lat, lon }` (pas des tableaux GeoJSON).
- **Zones interdites** : une Feature `zone_interdite` **par zone** (`zone_id`), nommée
  `Zone interdite` pour la zone 1 et `Zone interdite #N` au-delà. Aucune fusion des zones.
- **Ordre des scripts** : `index.html` charge les JS dans un ordre précis ; une nouvelle
  dépendance doit être insérée après ses dépendances (ex. `simulation.js` après `points.js`
  et `map.js`, avant `export.js` ; `qrcode.js` **avant** `export.js`, qui appelle
  `renderQrCodeSvg()`). **`js/fab-press.js`** (gestuelle partagée des FAB) est chargé
  **après `js/ble.js` et avant `js/points.js`** : `points.js` et `camera.js` y trouvent
  `bindTraceFabPress()`, `LONG_PRESS_MS` et `LONG_PRESS_MOVE_TOLERANCE_PX`. Le bundle
  vendorisé `js/vendor/animated-data-qr/…umd.min.js` est
  chargé avec les bibliothèques (après JSZip), **avant** `js/parser.js`. Les SDK **Firebase
  « compat »** (10.14.1 : `firebase-app-compat.js`, `firebase-auth-compat.js`,
  `firebase-firestore-compat.js`, CDN `gstatic`) et `js/firebase-config.js` sont chargés au
  même endroit (avant `js/parser.js`) ; `js/cloud-sync.js` vient **juste après
  `js/projects.js`** (il utilise `loadProjects`, `persistProjectStorage`,
  `normalizeProject`). Sans réseau, ces scripts ne se chargent pas : l'application reste
  utilisable en local, sans erreur bloquante. `js/scan.js` n'est
  chargé que par `scan.html` (page réceptrice autonome), **après** JSZip 3.10.2 et le même
  bundle vendorisé : JSZip sert uniquement à compter et lister les GeoJSON de l'archive reçue
  (`describeZipPayload()`), son absence (CDN indisponible) ne bloque jamais le téléchargement.
  `js/welcome.js` (écran d'accueil, voir le 1er point de ce §7) est chargé **juste après**
  `js/app.js` : il n'appelle `showTab()` qu'au clic, donc aucun ordre de chargement
  contraignant au-delà de cette position.
- **API locale** : `serve-http.cjs` expose `GET /api/local-info` (`{ ok, port, addresses, urls }`,
  servi **avant** la résolution de fichiers, sans dépendance). Elle alimente le « mode serveur
  local » du hub de transfert ; sans elle (autre serveur), le JS retombe sur `location.origin`.
  Le serveur sert `.wasm` en `application/wasm` (nécessaire au décodeur QR animé).
- **Pas de cache** : `serve-http.cjs` envoie `Cache-Control: no-store` ; ne pas le retirer
  pendant les phases de test terrain.
- **Outils de simulation** : `ENABLE_SIMULATION = false` dans `js/simulation.js` et boutons
  retirés d'`index.html` depuis la mise en production terrain. Ne pas réintroduire un bouton
  de simulation sans repasser le flag à `true` (sinon le bouton reste inerte) ; procédure
  complète dans [docs/simulation.md](docs/simulation.md).

## 8. Sessions validées

> *Note : les sessions antérieures à la 3.86 mentionnent "RTK Mower", qui est l'ancien nom de "Mower Survey".*

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
  (`#historyProjectName` + `.project-name`, rempli par `updateHistoryProjectName()`
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
  (Arbre, Forage, Poteau, Souche, Talus, Divers — Pierre, Bordure et Autre retirés) et
  `selectObstacleType()` conserve l'emoji en 2ᵉ argument pour ne pas modifier `point.icon`
  (donnée historique, export GeoJSON inchangé). CSS : `.obstacle-option-icon` (26 px, 20 px
  ≤ 360 px), `.obstacle-type-icon` (16 px), `.import-obstacle-icon`, `.camera-hud-actions`,
  `.camera-voice-btn` (+ états `.on` / `.off`). Vérifié par banc Node (65 vérifications) et
  Chrome headless/CDP (28 vérifications : bouton 42 × 42 px, 6 icônes de 26 px, bascule
  persistée `1 → 0`, liste « Arbre #1 » / « Pierre #2 » sans emoji, aucune exception JS).
  **Bouton BLE** : `getBleIconMarkup(connected)` (`js/ble.js`) renvoie `bluetooth`
  (connecté) ou `bluetooth-off` (`m17 17-5 5V12l-5 5`, `m2 2 20 20`, `M14.5 9.5 17 7l-5-5v4.5`)
  hors connexion, avec les trois ondes animées ; `setBleStatus()` marque `connected` vrai
  uniquement pour l'état `connected` (`scanning` / `connecting` restent barrés) et le bouton
  n'a **ni bordure ni fond** (`border: none`, `background: transparent`, 44 × 44 px,
  `.ble-svg` 18 px). `index.html` et `menu-test.html` portent `bluetooth-off` par défaut ;
  `checkBleSupport()` force l'état barré. Vérifié par banc Node (38 vérifications) et
  Chrome/CDP (46 vérifications, captures des deux états).
- **3.56 — Libellé « Divers » et ordre des types d'obstacles** : la modale « Type d'obstacle »
  présente les six choix dans l'ordre **Arbre, Forage, Poteau, Souche, Talus, Divers**
  (`index.html` et `menu-test.html`, grille `repeat(3, 1fr)`, SVG 26 px). Le libellé affiché
  de l'ancien type « Perso » devient **« Divers »** sur tous les écrans : listes des points,
  popups carte, en-tête et sélecteur de cible CAMÉRA, titre du FAB (« Valider l'obstacle
  « Divers » »), toast de sélection, détail des obstacles du RELEVÉ et sélecteur d'import des
  parcelles — via `getObstacleTypeLabel()` (`OBSTACLE_TYPE_LABELS = { Perso: 'Divers' }`,
  `js/app.js`). **Le sous-type stocké et le contrat GeoJSON ne changent pas** :
  `point.subtype === 'Perso'`, `properties.categorie === 'Perso'` et `properties.name ===
  'Perso'` (sans nom personnalisé) restent identiques ; `getObstacleIconMarkup('Perso')`
  continue de renvoyer `map-pin`. Vérifié par banc Node (71 vérifications) et Chrome/CDP
  (51 vérifications : ordre des 6 libellés, « Arbre #1 / Pierre #2 / Divers #3 », popup
  « Divers #3 », `categorie` et `name` GeoJSON toujours « Perso »).
- **3.57 — Nom de parcelle harmonisé (RELEVÉ / HISTORIQUE)** : `#statProjectName` et
  `#historyProjectName` partagent désormais la classe **`.project-name`**
  (`css/components.css`) : `font-weight: 800`, `text-transform: uppercase`,
  `font-size: 12px`, `letter-spacing: 0.3px`, `--color-primary-deep`
  (`--color-primary-light` en thème nuit), `white-space: nowrap` + ellipse. Le nom était
  plus léger en RELEVÉ (700 porté par un **style inline**, supprimé : il écrasait toute
  règle de classe). Les sélecteurs `.stat-project-name-inline` et `.history-project-name`
  sont supprimés ; seules les propriétés de mise en page restent contextuelles
  (`.stats-header .project-name` : `flex: 0 1 auto` + `margin-left: 4px` ;
  `.points-section-head .project-name` : `flex: 1 1 auto`). Vérifié par Chrome/CDP
  (styles calculés comparés dans les deux onglets : graisse `800`, taille `12px`, casse
  `uppercase`, `letter-spacing` `0.3px`, couleur identique, aucun attribut `style`) et
  capture de l'en-tête RELEVÉ « PARCELLE : TEST VOICE ».
- **3.58 — Onglet HISTORIQUE en deux vues (parcelles → détail)** : l'onglet s'ouvre sur la vue
  racine `#historyListView` (titre **PARCELLES**, liste `#historyList`) ; `Ouvrir`
  (`openHistoryDetail(id)`) bascule sur `#historyDetailView` (points de la parcelle) et le
  bouton « ← Parcelles » (`#btnHistoryBack`, `closeHistoryDetail()`) revient à la liste.
  `syncHistoryView()` bascule les deux vues par `hidden` ; `showTab('tab-history')` revient
  toujours sur la racine ; `deleteProject()` referme le détail s'il était ouvert. Le bouton
  `CSV` de chaque ligne est remplacé par **`GeoJSON`** (`exportProjectGeoJSON(id)`), qui
  s'appuie sur `buildGeoJSON(project)` (paramètre optionnel) : les zones interdites sont
  regroupées localement à partir des points exportés, le **contrat GeoJSON est inchangé** et
  l'export d'une parcelle ne change pas la parcelle courante. `exportProjectCSV()` (devenu
  inutilisé) est supprimé. L'espace devant le nom de parcelle est supprimé : `gap: 0` et
  `margin-left: 0` dans `.points-section-head` / `.stats-header .project-name`, l'espace des
  actions étant reporté sur `.points-view-head-actions` (`margin-left: 10px`). Vérifié par
  Chrome/CDP (86 vérifications : racine/détail, retour, 3 actions de ligne, écart titre → nom
  mesuré à 0 px, GeoJSON par parcelle) et captures des deux vues.
- **3.60 — Header réorganisé (BLE en ligne 1) et en-tête du détail HISTORIQUE** : le header
  garde deux lignes en `justify-content: space-between`, mais change de contenu :
  (1) logo `🌾 RTK Mower` + `#btnBle` à droite ; (2) pastille `#headerGpsStatus` +
  `.header-actions-group` avec `#btnConnectionSettings` (Réglages) puis `#btnTheme`.
  Le bouton BLE n'a plus de couleur propre (`#btnBle.connected` / `.disconnected` retirés) :
  il garde le `color: #fff` de `.header-icon-btn` et le SVG reste en `currentColor`
  (`bluetooth` / `bluetooth-off`). Dans `#historyDetailView`, `#btnHistoryBack` et
  `#btnTransfer` sont regroupés dans `.history-detail-header` (`flex`,
  `justify-content: space-between`, `gap: 10px`) : « ← Parcelles » à gauche, « Transférer »
  à droite ; l'ancien conteneur `.points-view-head-actions` est supprimé. `#historyDetailView`
  reçoit `padding-bottom: calc(var(--bottom-nav-height, 64px) + 16px)` pour que les quatre
  boutons d'export restent entièrement visibles au-dessus de la barre de navigation (le parent
  `.screen` fournit `overflow-y: auto`). Vérifié par Chrome/CDP (105 vérifications : BLE dans
  `.header-top-row`, Réglages + Thème dans `.header-bottom-row`, couleur BLE identique au
  bouton thème, même ligne retour/transférer, dernier bouton « Effacer » au-dessus de la barre,
  `padding-bottom` 80 px) et captures.
- **3.61 — Libellés allégés de la liste des points (HISTORIQUE)** : le badge « Zone #N »
  (`#zoneBadge`, `.zone-badge`) est supprimé de la vue détail — `updateZoneBadge()` subsiste
  mais ne fait rien (élément absent), la logique de zone (`currentZoneId`) est inchangée.
  La rangée `.points-view-meta` ne porte plus que `#pointCount`, aligné à droite
  (`margin-left: auto`). `getZoneDisplayName()` renvoie **« Zone de tonte (ZT) »** /
  **« Zone interdite (ZI) »** (sans numéro) quand aucun nom personnalisé n'est défini ; le code
  complet `ZT1` / `ZI2` reste dans la méta de chaque point et sur la carte. Les obstacles sont
  numérotés **sans dièse** (« Arbre 1 », « Divers 3 ») dans la liste et la popup (le numéro
  reste `point.index`). Contrat GeoJSON inchangé (`zone_id`, `index`, `categorie`, noms
  `Zone interdite #N` de l'export). Vérifié par Chrome/CDP (112 vérifications : badge absent,
  libellés sans chiffre, « Arbre 1 / Pierre 2 / Divers 3 », compteur aligné à droite) et
  captures.
- **3.63 — Numéros masqués, format d'export par défaut, Actualiser et indicateur de
  sauvegarde** : `renderPointItem()` n'affiche plus le numéro d'ordre (`Arbre`, `Point`,
  `Point — Nom`) et `pointPopup()` non plus ; `point.index` reste dans les données et les
  exports (CSV/GPX/GeoJSON, cible CAMÉRA). Le panneau Connexion gagne un **3ᵉ bloc**
  « Format d'export » (`#exportFormatSelect`, `menu-export-select`) persisté dans
  `rtkExportFormat` (défaut `geojson`) ; `setExportFormat()` / `initExportFormat()` /
  `exportDefaultFormat()` (`js/export.js`) alignent le libellé (`#exportPrimaryLabel`) **et
  l'action** du bouton principal `#btnExportPrimary` de la section POINTS. `#tab-stats`
  reçoit `padding-bottom: calc(var(--bottom-nav-height, 64px) + safe-area + 16px)` pour que
  le bouton « Actualiser » reste entièrement au-dessus de la barre basse. `#saveIndicator`
  devient une pastille verte (`--color-primary-pale`) avec l'icône `save` 16 px et le libellé
  « Sauvegardé » (`.save-label`, 11 px / 800) ; `title` / `aria-label` portent l'heure de la
  dernière sauvegarde. `index.html` et `menu-test.html` alignés ; contrat GeoJSON inchangé ;
  `node --check` OK et vérification Chrome/CDP (16/16 : libellés sans chiffre, CSV → GPX,
  panneau sans débordement, `padding-bottom` 80 px, Actualiser au-dessus de la barre).
- **3.64 — Sélection multiple et barre d'action contextuelle (HISTORIQUE)** : chaque parcelle
  de la vue racine possède une **case à cocher** (`.session-select` / `.session-select-label`)
  et la barre `#historySelectionBar` (`.history-selection-bar`, sticky, `hidden` sans
  sélection) regroupe `#btnSelectionBack`, `#selectionCount` (« N sélectionné(s) »),
  `#btnSelectionTransfer` et `#btnSelectionDelete` (icônes Lucide, 44 px). `historySelection`
  (Set) est synchronisé par `toggleHistorySelection()` / `syncHistorySelectionUI()` ;
  `clearHistorySelection()` est appelé au retour, à l'ouverture du détail, à l'entrée dans
  l'onglet et après suppression. `transferSelectedProjects()` ouvre le hub pour une parcelle
  et partage N GeoJSON (repli téléchargement) pour plusieurs ;
  `deleteSelectedProjects()` → `deleteProjects(ids)` (une confirmation) →
  `removeProjectsByIds()` (`js/projects.js`). Vérifié par Chrome/CDP (24/24 : 3 cases,
  compteur, sélection/surlignage, sans débordement, transfert 1/N, annulation de confirmation,
  suppression de 2 parcelles puis de la dernière, sélection libérée en vue détail, zéro
  exception JS) ; `node --check` OK et contrat GeoJSON inchangé.
- **3.65 — Vue détail allégée, export depuis la liste** : le bloc `.points-view-actions`
  (GeoJSON, CSV, GPX, « Effacer ») est retiré de `#historyDetailView` dans `index.html` et
  `menu-test.html` ; `clearAllPoints()` (plus aucun appelant) est supprimé de `js/points.js`
  (`clearCurrentProjectPoints()` reste utilisé par la simulation). L'export reste accessible
  depuis chaque ligne de **PARCELLES** : bouton « Exporter » (`.btn-history-export`) →
  `exportProjectDefaultFormat(projectId)`, qui applique le format du panneau Connexion et
  appelle `exportProjectGeoJSON()`, `exportCSV(projet)` ou `exportGPX(projet)` (ces deux
  dernières acceptent désormais une parcelle en argument). L'option « Télécharger » du hub
  revient à la liste et met en évidence le bouton « Exporter » de la parcelle
  (`.session-actions.is-highlight`). Vérifié par Chrome/CDP (22/22 : aucun bouton export /
  Effacer dans le détail, GeoJSON/CSV/GPX depuis la ligne, contrat `source` + `[lon,lat]` +
  anneau fermé, retour du hub, suppression de ligne, zéro exception) ; `node --check` OK.
- **3.66 — Bouton Exporter retiré et partage multiple en ZIP** : le bouton « Exporter » de
  chaque ligne de PARCELLES est supprimé (seules les actions `Ouvrir` et `Suppr.` restent) ;
  l'export est centralisé dans le hub `#transferModal`. `exportProjectDefaultFormat()` est
  conservé pour l'option « Télécharger le fichier » (une parcelle → format du panneau Connexion,
  plusieurs → ZIP). `transferSelectedProjects()` ouvre **toujours** le hub : une parcelle
  normalement, plusieurs via `openTransferModal({ projectIds })` (« Sélection : N parcelles »).
  `buildProjectsZip()` (JSZip 3.10.2) crée `RTK_parcelles_<date>.zip` avec un GeoJSON par
  parcelle ; `transferViaNativeShare()` / `transferViaCloud()` partagent **un seul ZIP** (le
  partage natif multi-fichiers échoue sur Android) avec repli `downloadProjectsZip()`. Contrat
  GeoJSON de chaque entrée inchangé. Vérifié Chrome/CDP (14/14 : lignes sans Exporter, hub
  1/N, 1 fichier ZIP partagé, 3 entrées GeoJSON `source: rtk-mower`, téléchargement ZIP,
  format CSV pour une parcelle, zéro exception) ; `node --check` OK.
- **3.67 — Détail sans « Transférer » et groupes sans compteur** : le bouton `#btnTransfer`
  (`.transfer-trigger`) est retiré de `#historyDetailView` dans `index.html` et
  `menu-test.html` ; l'en-tête `.history-detail-header` ne garde que `#btnHistoryBack`
  (« ← Parcelles »). Le hub reste accessible par `transferSelectedProjects()` depuis la barre
  de sélection de PARCELLES. `closeTransferModal()` rend le focus au déclencheur mémorisé
  (plus de recherche de `#btnTransfer`). `renderGroup()` ne rend plus de pastille
  `.points-group-count` : les en-têtes affichent uniquement « Zone de tonte (ZT) »,
  « Zone interdite (ZI) » ou « Obstacles isolés » ; le compteur global `#pointCount` reste
  affiché. Vérifié Chrome/CDP (9/9 : un seul bouton retour, `#btnTransfer` absent, aucun
  « Transférer » dans le détail, en-têtes sans chiffre, compteur global « 6 point(s) », hub
  accessible depuis la barre de sélection, zéro exception) ; `node --check` OK.
- **3.68 — Bouton Actualiser sur Android/Samsung** : `#tab-stats` reçoit `flex: 1 1 0`,
  `min-height: 0` et `overflow-y: auto` (le parent `.app-wrapper` est un flex column) pour
  garantir un défilement interne borné sur Chrome Android. La marge de sécurité passe de
  16 à **24 px** :
  `padding-bottom: calc(var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px) + 24px)`.
  Vérifié sous Chrome headless à plusieurs hauteurs d'écran (360 × 640, 393 × 851,
  412 × 915) : défilement actif et bouton « Actualiser » entièrement au-dessus de la barre.
- **3.69 — Bouton Actualiser retiré et scroll HISTORIQUE** : le bouton « Actualiser » est
  supprimé de `#tab-stats` (`index.html` et `menu-test.html`) ; `updateStatsDisplay()` reste
  appelée automatiquement par `showTab('tab-stats')`, `switchProject()` et chaque
  ajout/suppression/renommage de point ou de zone. `#tab-history` reçoit les mêmes règles que
  `#tab-stats` (`flex: 1 1 0`, `min-height: 0`, `overflow-y: auto`, `padding-bottom: 64 px +
  safe-area + 24 px`) ; `#historyDetailView` ne porte plus de padding propre pour éviter un
  double espace. Vérifié Chrome/CDP (10/10 à 360 × 640 : aucun bouton dans RELEVÉ, stats
  rafraîchies au changement de parcelle, liste de 14 parcelles défilable jusqu'au dernier
  élément, 26 points de détail défilables jusqu'au dernier, aucun double padding, dernière
  ligne au-dessus de la barre, zéro exception).
- **3.70 — Démarrage sans parcelle et dernier bandeau HISTORIQUE** : `js/projects.js` force
  `currentProject = null` et purge `rtkCurrentProject` à **chaque** chargement (aucune
  restauration de la dernière parcelle) ; `persistProjectStorage()` retire aussi la clé quand
  aucune parcelle n'est active. `#traceFab` est masqué sans parcelle (`syncTraceFabUI()`), et
  le panneau Connexion expose `#menuChooseProjectRow` / `#btnChooseProject` « Choisir une
  parcelle » pour ouvrir le tiroir. Carte, liste et statistiques restent vides jusqu'à la
  sélection explicite. `#pointsList` perd son `max-height`/scroll interne : `#tab-history` est
  le seul conteneur défilable, avec `flex: 1 1 0`, `min-height: 0`, `overflow-y: auto` et
  `padding-bottom: 64 px + safe-area + 24 px` ; `#historyDetailView` n'a plus de padding
  propre. Vérifié Chrome/CDP (21/21 : démarrage et rechargement sans parcelle, clé purgée, FAB
  masqué, accès « Choisir une parcelle » visible puis masqué après sélection, carte vide puis
  chargée, liste de 14 parcelles et 26 points défilables jusqu'au dernier au-dessus de la
  barre, zéro exception) ; `node --check` OK.
- **3.71 — FAB accessible sans parcelle** : `syncTraceFabUI()` rend `#traceFab` visible dès
  qu'on est sur TRACÉS (`visible = onTracesTab`), même sans `currentProject` ; le menu
  `#traceFabMenu` conserve sa 1re option « Parcelle : Aucune » qui ouvre `#projectDrawer`.
  Sans parcelle, le clic principal sur le FAB ouvre désormais ce menu (au lieu d'aller
  directement au tiroir). `#menuChooseProjectRow` / `#btnChooseProject` et la classe
  `.menu-project-btn` sont supprimés du panneau Connexion (retour à trois blocs). Le démarrage
  reste sans parcelle sélectionnée (`currentProject = null`, `rtkCurrentProject` purgé) et la
  carte reste vide jusqu'à la sélection. Vérifié Chrome/CDP : FAB visible au démarrage, menu
  contenant « Parcelle : Aucune », ouverture du tiroir, absence du bouton dans Connexion,
  sélection puis chargement normal.
- **3.72 — Splash screen** : `#splashScreen` (`.splash-screen`) est ajouté au début du
  `<body>` d'`index.html` et de `menu-test.html` avec le logo `🌾 RTK Mower`. Voile plein
  écran `position: fixed`, `inset: 0`, `z-index: 5000` (au-dessus du menu Connexion 4000, du
  verrouillage 3000 et des toasts 1200), fond `--color-primary`, logo blanc centré (28 à
  42 px). Animation CSS `splash-hide` : visible 1 s puis fondu de 0,35 s
  (`visibility: hidden`), avec variante instantanée en `prefers-reduced-motion: reduce`.
  Aucun script n'est nécessaire. Vérifié Chrome/CDP (7/7 : plein écran, centré, vert,
  z-index 5000, visible au chargement, masqué après le fondu, application cliquable, zéro
  exception).
- **3.73 — File d'attente hors-ligne** : `js/export.js` gère `rtkOfflineQueue` (tableau de
  `{ id, type, projectId, format, timestamp }`, plus `projectIds` pour une sélection
  multiple). Si `navigator.onLine === false`, `exportProjectGeoJSON()`, `exportGeoJSON()`,
  `exportCSV()`, `exportGPX()`, `shareGeoJSON()`, `shareProjectsZip()` et
  `downloadProjectsZip()` mettent la demande en file au lieu d'écrire le fichier, avec le
  toast « Hors connexion — demande ajoutée à la file d'attente ». `initOfflineQueue()` branche
  `window.addEventListener('online', processOfflineQueue)` ; le traitement rejoue chaque
  demande (`executeOfflineRequest()`), vide la file et affiche « File d'attente traitée :
  N export(s) ». `#offlineQueueRow` / `#offlineQueueIndicator` dans le panneau Connexion
  affichent le nombre de demandes et permettent un traitement manuel. Vérifié Chrome/CDP
  (12/12 : 4 demandes GeoJSON/CSV/GPX/share mises en file sans export immédiat, rejeu sur
  événement `online`, 3 téléchargements + 1 partage, file vidée, indicateur masqué, toast,
  demandes multiples ZIP avec `projectIds`, zéro exception) ; `node --check` OK.

- **3.74 — Bonus terrain : valeurs par défaut, Gants/Soleil, haptique et Stakeout** : la modale
  « Type d'obstacle » gagne un champ `#obstacleNameInput` et pré-sélectionne le **dernier type
  utilisé** (`rtkLastObstacleType`, repli sur le type le plus fréquent de `globalObstacles`,
  puis `Arbre`) avec `.obstacle-option.pre-selected` ; le **dernier nom personnalisé**
  (`rtkLastObstacleName`) est reproposé. `selectObstacleType()` transmet le nom dans
  `APP.pendingObstacle.name` et `recordObstacle(type, icon, name)` le stocke dans `point.name`
  puis mémorise type + nom après l'enregistrement. Le panneau Connexion gagne
  `#btnGlovesMode` (`role="switch"`, clé `rtkGlovesMode`) : `body.gloves-mode` (tokens de
  contraste renforcés, boutons 52 px / 16 px, bordures épaisses, FAB 64 px) est appliqué par
  `applyGlovesMode()` / `toggleGlovesMode()` (`js/app.js`). Les captures émettent une vibration
  courte (`50 ms`) en RTK Fix et un motif long `[100, 50, 100]` si le récepteur est connecté
  mais sans RTK Fix (`vibratePointFeedback()`, `hasWeakGpsFix()`, `signalPointRecorded()`).
  Un bouton `#traceFabStakeout` (à droite du FAB, visible dès qu'une zone tonte/interdite a
  ≥ 1 point) lance un guidage vers le **premier sommet** de la zone courante : HUD
  `#stakeoutHud` (distance + cap), annonces vocales `fr-FR` et vibrations aux seuils
  **10 / 5 / 2 / 1 m** avec hystérésis 0,5 m, « Sommet atteint » sous 0,5 m
  (`startStakeout()` / `stopStakeout()` / `updateStakeoutGuidance()` dans `js/points.js`).
  Le tracé normal (ajout de points, ✓ Terminer) est conservé : le Stakeout est une action
  parallèle, arrêtée à l'ouverture du menu FAB ou au changement de type. `index.html` et
  `menu-test.html` alignés ; contrat GeoJSON inchangé. Vérifié Chrome/CDP (type `Perso`
  pré-sélectionné, nom pré-rempli, nom enregistré, vibrations 50 / `[100,50,100]`, Gants
  52 × 52 px / 16 px, HUD et bouton Stakeout, annonces 10/5/1 m + arrivée, zéro exception) ;
  `node --check` OK.
- **3.75 — Métré des zones interdites dès le 2ᵉ point** : `renderMap()` applique désormais aux
  zones interdites la même polyligne temporaire qu'aux zones de tonte : à **2 points**, une
  `L.polyline` (`tempMeasureLineInterdit`, couleur `COLORS.interdit.stroke`) est ajoutée à
  `layerInterdit` et reçoit `showMeasurements(ZONE_MEASUREMENT_OPTIONS)` (`showDistances`,
  sans surface ni longueur totale) ; dès le 3ᵉ point, `clearTempMeasureLine('interdit')` la
  retire et le polygone mesuré prend le relais. Le métré temporaire est séparé par type
  (`tempMeasureLine` / `tempMeasureLineInterdit`) pour qu'une zone de tonte et une zone
  interdite en cours ne s'effacent pas mutuellement. Contrat GeoJSON inchangé. Vérifié
  Chrome/CDP : à 2 points, les deux lignes existent sur leurs layers et deux étiquettes
  `22.2 m` sont rendues ; après ajout du 3ᵉ point interdit, la polyligne temporaire disparaît
  et un polygone est créé ; `node --check js/map.js` OK.
- **3.76 — Hub de transfert simplifié, QR code réel et note USB** : `canShareTransferFiles()`
  (`js/export.js`) sonde `navigator.share` puis `navigator.canShare({ files })` avec un
  `File` GeoJSON de test ; `syncTransferCapabilities()` masque `#transferOptionShare` et
  `#transferOptionCloud` (`hidden` + `aria-hidden`) et affiche `#transferUnsupportedNote`
  quand le partage de fichiers n'est pas supporté, le focus d'ouverture allant au premier
  canal visible (`getFirstTransferOption()`). Repli `downloadTransferProjects()` si l'une des
  deux fonctions est appelée malgré tout. Le placeholder « Bientôt » du mode serveur local est
  remplacé par un **vrai QR code** de l'adresse LAN : `js/qrcode.js` (nouveau, générateur
  autonome mode octet / niveau M / versions 1 à 10, chargé avant `export.js`, aucun CDN pour
  rester utilisable sans Internet) alimente `#transferLocalQr` via `renderTransferLocalQr()` ;
  badge « Sans Internet », hint mis à jour, conteneur masqué sans adresse. Nouveaux tokens
  `--color-qr-surface` / `--color-qr-module` (contraste imposé en thème nuit) et classes
  `.transfer-local-qr`, `.qr-code-svg`, `.qr-code-modules`. Une **note `.transfer-note`** en
  bas de la modale explique le transfert par câble USB (télécharger sur le téléphone puis
  copier via le gestionnaire de fichiers de la tablette) ; `index.html` et `menu-test.html`
  alignés, contrat GeoJSON inchangé. Vérifié : 112 matrices QR identiques à la bibliothèque
  de référence `python-qrcode` (versions 1 à 10 × 8 masques), banc Node (16 contrôles :
  masquage, note, focus, QR, UTF-8, charge utile hors version 10) et captures Chrome headless
  en thème clair et nuit (QR blanc/noir scannable, notes lisibles) ; `node --check` OK sur
  `js/qrcode.js` et `js/export.js`.
- **3.77 — Bibliothèque de QR animé vendorisée** : `animated-data-qr-js` **v0.1.0** (MIT) est
  copié dans `js/vendor/animated-data-qr/` (`animated-data-qr.umd.min.js` 135 Ko,
  `animated-data-qr.decoder.worker.js` 74 Ko, `zxing_reader.wasm` 989 Ko, `LICENSE`, plus un
  `README.md` de provenance avec SHA-256 et procédure de mise à jour). Motif : la balise CDN
  documentée en amont (`cdn.jsdelivr.net/npm/animated-data-qr-js@0.1.0/...`) renvoie **404**
  (paquet npm non publié), le dépôt n'a **aucune release** et `dist/` **n'est pas committé**
  dans le tag `v0.1.0` ; les fichiers n'existent que comme artefact GitHub Pages. Le bundle
  résout worker et wasm relativement à son propre `src` et surcharge `locateFile()` vers le
  wasm local : l'ensemble fonctionne **hors Internet** depuis le même dossier. Le global est
  `AnimatedDataQR` (README amont : coquille `AnimatedDataQr`). Seule modification locale : la
  ligne `//# sourceMappingURL=…` retirée (source map non publiée). `<script>` ajouté après
  JSZip dans `index.html` et `menu-test.html`. `serve-http.cjs` sert désormais `.wasm` en
  `application/wasm`. Vérifié : `node --check` sur le bundle, chargement réel sous Chrome
  headless (`global=object`, 9 fonctions exposées, preset `compatibility` =
  `{frameIntervalMs:250, chunkByteSize:220, payloadEncoding:"binary", symbolsPerFrame:1,
  parityBlockDataChunks:4, qrOptions:{errorCorrectionLevel:"M"}}`), et service HTTP local des
  trois fichiers (`text/javascript`, `text/javascript`, `application/wasm`). **L'interface
  (sender/récepteur) n'est pas encore câblée** : seule la dépendance est en place.
- **3.78 — QR animé câblé (émetteur hub + page récepteur)** : le hub gagne une 5ᵉ option
  « QR Code animé » (`#transferOptionAnimatedQr`, icône Lucide `qr-code`) →
  `transferViaAnimatedQr()` / `startAnimatedQrTransfer()` (`js/export.js`).
  `buildAnimatedQrPayload()` transmet l'octet exact de `buildGeoJSON()` (une parcelle) ou le
  ZIP `buildProjectsZip()` (sélection), avec le preset **`compatibility`**. `createQrSender()`
  monte son `<canvas>` dans `#animatedQrStage` de la nouvelle modale `#animatedQrModal`
  (lien vers `scan.html`, progression « Frame X / N — boucle L », taille, blocs, durée de
  boucle, bouton « Arrêter » / « Reprendre », Échap + piège de focus via `trapOverlayFocus()`).
  Nouvelle page **`scan.html`** + `js/scan.js` + `css/scan.css` : `createQrReceiver()` (la
  bibliothèque crée le `<video>` et appelle `getUserMedia` en `facingMode: environment`),
  progression blocs + frames, puis résultat (« Télécharger le GeoJSON » ou ZIP) à partir de
  `result.blob`. Avertissement si le contexte n'est pas sécurisé (caméra = HTTPS/localhost).
  `index.html` et `menu-test.html` alignés ; contrat GeoJSON inchangé (aucun retraitement).
  Vérifié : `node --check js/export.js` et `js/scan.js` ; **round-trip réel** sous Chrome/CDP
  avec caméra simulée par `canvas.captureStream()` — émetteur 8 frames / 5 blocs → récepteur
  `identical: true` (983 octets, même nom `RTK_JARDIN_NORD_2026-11-01.geojson`, 2 features) et
  UI « GeoJSON valide — 2 entité(s) », 100 %, « Télécharger le GeoJSON » ; ZIP multi-parcelles
  (`RTK_parcelles_2026-11-01.zip`, `application/zip`, « Sélection : 2 parcelles ») ; UI du hub
  (canvas 340×340, « Frame 4 / 14 — boucle 1 », Arrêter → « Reprendre », fermeture qui vide la
  scène) ; erreur caméra refusée → « Caméra refusée — autorisez l'accès à la caméra… » +
  « Caméra indisponible ».

- **3.79 — Transfert multi-parcelles par QR animé vérifié de bout en bout** : vérification
  complète de la chaîne `hub → buildAnimatedQrPayload() → createQrSender() → scan.html →
  createQrReceiver()`. Côté **émetteur** (`js/export.js`) : `ensureAnimatedQrBlob()` garantit
  le type MIME du Blob, `fileName` et `mimeType` sont toujours transmis à `loadBlob()` (un
  `Blob` n'a pas de `.name`, sinon la bibliothèque retombe sur `transfer.bin` /
  `application/octet-stream`), la charge utile expose `kind:'geojson' | 'zip'`, et le libellé
  utilise `archive.count` (parcelles réellement dans le ZIP). `startAnimatedQrTransfer()` ne
  duplique plus le toast d'échec. Côté **récepteur** (`js/scan.js`, `scan.html`,
  `css/scan.css`) : détection du ZIP par MIME **ou** extension **ou** signature binaire `PK`
  (`isZipPayload()`, `readScanHead()`), comptage des fichiers et des entités par
  `JSZip.loadAsync()` (`describeZipPayload()`), bouton « Télécharger le ZIP », liste
  `#scanFileList` des entrées, nom de repli cohérent (`getScanFallbackName()`) et
  normalisation du résultat (`normalizeScanResult()` gère aussi le format `kind:'folder'`
  « SARC1 » de la bibliothèque). `scan.html` charge désormais **JSZip 3.10.2** avant
  `js/scan.js` (repli propre si le CDN est indisponible : message générique, téléchargement
  inchangé). Vérifié : `node --check js/export.js` et `js/scan.js` ; banc Node (20
  vérifications : détection MIME/extension/signature, message GeoJSON, repli sans JSZip,
  comptage `loadAsync`, nom de repli, normalisation `folder`) et **test bout-en-bout réel**
  sous Chrome headless/CDP avec caméra simulée par `canvas.captureStream()` (40 vérifications) :
  1 parcelle → `application/geo+json` + `RTK_PARCHELLE A_2026-11-01.geojson` +
  « Parcelle : PARCHELLE A » ; 2 parcelles → `application/zip` +
  `RTK_parcelles_2026-11-01.zip` + « Sélection : 2 parcelles » (hub, modale et
  `getTransferProjects()`) ; séquence 9 frames / 6 blocs / 1 Ko / boucle 2,3 s ; récepteur en
  2,8 s → `application/zip`, « Archive ZIP — 2 fichier(s) · 6 entité(s) », bouton
  « Télécharger le ZIP », 2 GeoJSON (`domaine` + `zone` + `obstacle`, `source: rtk-mower`,
  anneaux fermés) et **octets identiques** à l'émission ; non-régression 1 parcelle →
  « Télécharger le GeoJSON » + « GeoJSON valide — 1 entité(s) » sans liste. Contrat GeoJSON
  inchangé. Les noms de parcelle contenant une espace la conservent dans le nom de fichier
  (comportement historique de `RTK_${nom}_${date}`, identique pour tous les exports).

- **3.80 — QR animé : charge utile toujours en ZIP** : `buildAnimatedQrPayload()`
  (`js/export.js`) n'a plus de branchement : le canal QR animé envoie **systématiquement** un
  ZIP via `buildProjectsZip()`, **même pour une seule parcelle**. Le type MIME est toujours
  `application/zip` (`ANIMATED_QR_ZIP_MIME`), la constante `ANIMATED_QR_GEOJSON_MIME` est
  supprimée, le nom devient `RTK_<nom>_<date>.zip` pour une parcelle (dérivé de
  `archive.entries[0]`, nouvellement exposé par `buildProjectsZip()`, donc strictement cohérent
  avec l'entrée GeoJSON contenue) et `RTK_parcelles_<date>.zip` au-delà. Libellé :
  `Parcelle : <NOM>` ou `Sélection : N parcelles` (`archive.count`). Bénéfices : un seul cas à
  gérer émetteur/récepteur et **compression DEFLATE** (charge utile nettement plus courte, donc
  moins de frames QR). Aucun changement de contrat : chaque entrée reste l'octet exact de
  `buildGeoJSON()`. Le récepteur `js/scan.js` est inchangé et gérait déjà le ZIP (MIME,
  extension, signature `PK` + comptage `JSZip.loadAsync()`) ; la branche GeoJSON seule ne sert
  plus qu'aux séquences produites par une version antérieure. Vérifié : `node --check
  js/export.js` ; banc Node 20/20 (récepteur) ; **deux** tests bout-en-bout Chrome/CDP avec
  caméra simulée (42/42 chacun) — 1 parcelle : GeoJSON brut 2 191 o → ZIP 587 o (**−73 %**),
  3 blocs / 5 frames, réception en 1,6 s, bouton « Télécharger le ZIP », « Archive ZIP —
  1 fichier(s) · 3 entité(s) », liste à 1 entrée, **octets identiques** (784/784 base64) ;
  2 parcelles : ZIP 1 152 o, 6 blocs / 9 frames, réception 2,8 s, « Archive ZIP —
  2 fichier(s) · 6 entité(s) », octets identiques. Hub : option « QR Code animé » visible et
  active dans les deux cas, sous-titre `Parcelle : PARCHELLE A` / `Sélection : 2 parcelles`.

- **3.81 — Écran d'accueil statique (changement de stratégie)** : le splash animé
  (rover qui tond, 8,5 s) est **retiré de RTK Mower** — trop long en usage terrain — et
  réservé au futur **Mower Planner** (tablette, paysage). `index.html` perd son overlay
  `#splash-screen` avec ses trois tracés SVG (herbe haute, herbe basse, rover) : **−61 Ko**
  (193 185 → 131 764 octets). Il est remplacé par `#welcome-screen` (`.welcome-screen`,
  `role="dialog"`, `aria-modal="true"`) : titre « RTK MOWER » + sous-titre « RELEVÉ GPS
  RTK », **empreinte digitale Lucide** de 80 × 80 px (`#btnWelcomeEnter`,
  `.welcome-fingerprint-btn`), texte « Appuyer pour continuer » (`.welcome-hint`) et **logo
  complet** `assets/logo-rtk-mower_tablette.svg` collé en bas (`.welcome-logo`, `d` injecté
  par script). `js/splash.js` est **supprimé** et remplacé par `js/welcome.js` (fondu de
  0,3 s via `.is-closing`, puis `showTab('tab-points')` et `hidden`) ; la section
  `SPLASH SCREEN` de `css/components.css` devient `ÉCRAN D'ACCUEIL` (`.welcome-*`).
  Vérifié Chrome/CDP (390 × 844) : voile plein écran `--color-primary-deep`
  (`rgb(27, 94, 32)`), empreinte 80 × 80 centrée à 26 px au-dessus du milieu, logo à 10 px
  du bas, `splashResidue = 0`, `#tab-points` actif, carte montée, zéro erreur JS.
  `splash-test.html` reste la référence du prototype animé (jamais chargé par l'app).
- **3.82 — Refonte de l'onglet HISTORIQUE (cartes cliquables et barre flottante)** : les
  boutons `Ouvrir` / `Suppr.` de chaque carte sont supprimés. La carte `.session-item` est
  **cliquable** (`onclick="handleHistoryCardClick(event, id)"`, `tabindex="0"`,
  `handleHistoryCardKeydown()` sur Entrée / Espace) et ouvre le détail
  (`openHistoryDetail()`), sauf sur la **case à cocher** (`.session-select-label`) et sur le
  **menu ⋮** (`.session-menu-wrap`) : `handleHistoryCardClick()` filtre via
  `event.target.closest()`. Le bouton **⋮** (`ICON_MORE_VERTICAL`, 44 × 44 px, sans fond,
  `aria-haspopup` / `aria-expanded`) ouvre le menu contextuel `.session-menu` (`.session-menu-item`
  de 44 px, icônes `ICON_FOLDER_OPEN` / `ICON_TRASH`) avec « Ouvrir » et « Supprimer »
  (`deleteProject()`) ; `toggleHistoryCardMenu()` garantit un seul menu ouvert et pose le
  focus sur la première option, `closeHistoryCardMenus()` le referme au clic extérieur, avec
  **Échap** (focus rendu au ⋮) et au défilement de `#tab-history` (`initHistoryCardMenus()`,
  branchée au `DOMContentLoaded` de `js/history.js`). La barre verte **sticky** insérée dans
  la liste (`#historySelectionBar`, ex-`.history-selection-bar`) est remplacée par une
  **barre d'action flottante** `.history-action-bar` (`position: fixed`, hors de
  `.app-wrapper`, juste au-dessus de `#bottomNav`, `z-index: 950`, largeur
  `min(456px, 100vw − 24 px)`, rayon 999 px, fond `--color-primary-deep`, ombre
  `--shadow-xl`) : `#btnSelectionBack` (croix Lucide), `#selectionCount`, puis
  `#btnSelectionTransfer` (`share-2`) et `#btnSelectionDelete` (`trash-2`, rouge). Elle
  glisse depuis le bas (`@keyframes history-action-bar-in`, 0,22 s, désactivée en
  `prefers-reduced-motion`) et disparaît quand la sélection est vide (`hidden` +
  `.history-action-bar[hidden] { display: none !important }`). `syncHistorySelectionUI()`
  pose `body.history-selection-active` (réserve de 82 px sous `#historyListView`, toasts
  remontés à 190 px) ; `showTab()` **purge la sélection en quittant** l'onglet pour que la
  barre ne reste jamais sur TRACÉS / CAMÉRA / RELEVÉ et la masque aussi en plein écran
  carte / caméra (`css/map.css`, `css/theme.css`). Libellés des actions masqués ≤ 420 px
  (icônes seules, `title` / `aria-label` conservés). Vérifié : `node --check js/history.js`
  et `js/app.js` ; banc Node 26/26 (cartes sans boutons, ⋮ + menu présents, clic carte →
  ouverture, clic case / menu → aucune ouverture, barre affichée « 1 / 2 sélectionné(s) »,
  masquée et classe `body` retirée après annulation, Entrée sur la carte → ouverture).



- **3.83 — Fin de zone au premier clic (FAB de tracé)** : régression terrain « il faut appuyer
  2 à 3 fois sur ✓ pour terminer une zone de tonte ou interdite ». **Cause** : dans
  `initTraceFab()`, la fonction locale `bindLongPress()` déclenchait l'action courte sur `click`
  et ne remettait le drapeau `longFired` à `false` que dans ce `click`. Tout appui de plus de
  550 ms (gants, doigt qui traîne, terrain) ouvrait le menu FAB et laissait `longFired = true` :
  le `click` correspondant était avalé, et si le navigateur n'en émettait pas (appui long
  Android), le tap suivant l'était aussi → 2 à 3 appuis avant que la zone se termine.
  **Correction** : `bindTraceFabPress(el, longAction, clickAction)` remplace la fonction
  locale — action courte sur **`pointerup`**, seuil d'appui long porté à
  `LONG_PRESS_MS = 700`, tolérance de mouvement `LONG_PRESS_MOVE_TOLERANCE_PX = 12` (un
  glissement devient un panoramique, sans action), `endGesture()` remet `pressed` / `longFired`
  à zéro sur `pointerup`, `pointerleave` et `pointercancel`, clavier géré par `click` avec
  `detail === 0`. `syncTraceFabUI()` grise le ✓ (`disabled`, `.is-disabled`,
  `aria-disabled="true"`, `title` « Ajoutez au moins un point — … ») tant que la zone courante
  est vide ; `savePoint()` et `deletePoint()` resynchronisent le FAB. CSS :
  `.trace-fab-secondary:disabled` / `.is-disabled` (opacité 0,45, `grayscale(0.5)`,
  `cursor: not-allowed`) et `:active` corrigé (`translateY(-50%) scale(0.94)` : le bouton ne
  saute plus à l'appui). Vérifié : `node --check js/points.js` ; banc Node 9/9 (ancien code :
  tap appuyé 620 ms → **0** terminaison, 3 taps appuyés → **0** terminaison ; nouveau : tap
  court et tap appuyé 620 ms → terminaison **au 1er appui**, appui long 800 ms → menu seul,
  tap après appui long sans `click` → OK, glissement → aucune action, clavier → terminaison)
  et 12/12 sur l'état du ✓ (zone vide = grisé, 1 point = actif, obstacle / sans parcelle =
  masqué). `js/camera.js` gardait sa propre copie de `bindLongPress` (550 ms) : supprimée et
  remplacée par le module partagé en 3.84.

- **3.84 — Gestuelle des FAB mutualisée (`js/fab-press.js`)** : `bindTraceFabPress()` et les
  constantes `LONG_PRESS_MS` / `LONG_PRESS_MOVE_TOLERANCE_PX` quittent `js/points.js` pour un
  **module partagé** `js/fab-press.js` (script classique, sans dépendance, chargé après
  `js/ble.js` et **avant** `js/points.js` dans `index.html`). `js/camera.js` perd sa copie
  locale `bindLongPress` (550 ms, même défaut que le FAB de tracé) : `initCameraFab()` câble
  désormais `bindTraceFabPress(main, openCameraFabMenu, onCameraFabMainClick)` et
  `bindTraceFabPress(secondary, openCameraFabMenu, exitCameraMode)` — tap court sur « ✓ » =
  quitter le mode caméra, appui long (700 ms) = menu, glissement de plus de 12 px ignoré,
  clavier via `click` avec `detail === 0`. `syncCameraFabUI()` pose en plus `disabled` /
  `.is-disabled` / `aria-disabled` sur `#cameraFabSecondary` quand `cameraMode` est nul (le
  bouton reste masqué dans ce cas : le grisage est une sécurité). Vérifié :
  `node --check js/fab-press.js js/points.js js/camera.js` ; banc Node **14/14** (gestuelle du
  module 5/5 ; câblage caméra 4/4 — `initCameraFab` câble bien `exitCameraMode` sur le ✓, tap
  court et tap appuyé 620 ms → `exitCameraMode`, appui long 800 ms → menu seul ; état du ✓
  caméra 3/3 — masqué + désactivé sans mode, visible + actif en mode ; non-régression ✓
  TRACÉS 2/2). Plus aucun `bindLongPress` dans `js/`.

- **3.85 — Mode boucle des obstacles (type → point → type)** : la modale « Type d'obstacle »
  reste ouverte/fermée en boucle au lieu d'être rouverte manuellement à chaque obstacle.
  `APP.obstacleLoopMode` + `APP.obstacleLoopCount` (`js/app.js`) : `openObstacleMenu()` appelle
  `startObstacleLoop()` (compteur à 0) ; `selectObstacleType()` ferme la boîte comme avant ;
  `recordObstacle(subtype, icon, name, posOverride)` (`js/points.js`) accepte une position
  explicite et, en boucle, **conserve** `currentTraceMode = 'obstacle'`, incrémente le compteur,
  remet `pendingObstacle` à `null` et rouvre la boîte via `reopenObstacleLoopModal()`
  (`showObstacleModal(true)` différé d'un tick, classe `.is-loop-reopen` → transition 150 ms,
  neutralisée en `prefers-reduced-motion`). **Pointage au tap** : `initObstacleMapTap(leafletMap)`
  (`js/points.js`) est branchée par `js/map.js` dans `initMap()` ; elle n'agit qu'en mode boucle
  avec un type en attente, ignore un `click` survenant dans les 350 ms après `dragstart` /
  `zoomstart`, respecte le verrouillage d'écran et enregistre à `event.latlng`
  (`source: 'manual'`). Le clic sur le FAB reste une validation possible (GPS / cible).
  **Sortie** : `#btnObstacleLoopStop` (« Terminer », icône Lucide `check`) → `stopObstacleLoop()`
  (mode false, compteur 0, `tracesMode = 'lecture'`, toast récapitulatif) ; `closeObstacleMenu()`
  (Échap, voile, changement d'onglet) délègue à `stopObstacleLoop()` en mode boucle. UI :
  `#obstacleLoopBar` / `#obstacleLoopCount` / `.obstacle-loop-stop` (`css/components.css`) avec
  tokens `--color-primary-pale-bg` / `--color-primary-deep` (`--color-primary-accent` en nuit) ;
  dernier type pré-surligné via `rtkLastObstacleType` (`.obstacle-option.pre-selected`).
  Vérifié : `node --check js/app.js js/points.js js/map.js` ; accolades CSS équilibrées
  (411/411) ; banc Node **33/33** (activation, fermeture au choix du type, enregistrement +
  compteur + réouverture + animation, changement de type, tap carte (coordonnées exactes,
  hors boucle ignoré, panoramique ignoré, binding unique), sortie « Terminer », sortie
  Échap/voile, non-régression hors boucle).

- **3.86 — Trait et métré de la zone interdite dès le 2ᵉ point** : régression « sur une
  **nouvelle parcelle**, le segment entre les 2 premiers points interdits et sa distance
  n'apparaissent qu'au 3ᵉ point ; sur une parcelle existante, tout est correct ». **Cause** :
  la polyligne temporaire (`tempMeasureLineInterdit`) et son `showMeasurements()` sont créés
  **uniquement dans `renderMap()`**, or `addPointToMap()` (`js/map.js`) ne déclenchait ce rendu
  pour un point `interdit` que si `pts.length >= 3`, où `pts` comptait les points interdits de
  **toute la parcelle**. Une parcelle neuve restait donc sous le seuil (le marqueur seul était
  ajouté) jusqu'au 3ᵉ point, alors qu'une parcelle déjà pourvue de ≥ 3 points interdits
  déclenchait le rendu à chaque ajout — d'où la différence « neuve / existante ». **Correction**
  (`addPointToMap()`) : le rendu complet est déclenché dès que la **zone courante** compte
  ≥ 2 points (`getInterditZones()[getCurrentInterditZoneId()]`, repli sur les points du type si
  les helpers ne sont pas disponibles) ; à 1 point, l'ajout direct du marqueur est conservé
  (aucun rendu inutile). Tonte (rendu dès 1 point) et obstacles (ajout direct) inchangés.
  Vérifié : `node --check js/map.js` ; banc Node 13/13 — exécution du vrai `renderMap()` sur une
  zone interdite à 2 points (une `L.polyline` créée, `showDistances: true`, aucun polygone, deux
  sommets), à 3 points (polygone `showMeasurements: true`, plus de polyligne), et décision de
  `addPointToMap()` : parcelle neuve à 2 points → `renderMap()` (correctif), zone à 1 point →
  aucun rendu, parcelle existante zone 2 à 2 points → `renderMap()`, zone courante à 1 point sur
  parcelle riche → aucun rendu, tonte → rendu, obstacle → aucun rendu ; ancienne règle
  (`pts.length >= 3` sur la parcelle) reproduite comme bug de référence.

- **3.87 — Synchronisation Firestore (comptes e-mail / mot de passe)** : les parcelles sont
  synchronisées entre le téléphone et la tablette tout en conservant `localStorage` comme
  **source locale** (terrain hors-ligne). Nouveaux fichiers : `js/firebase-config.js`
  (`FIREBASE_CONFIG` du projet `mower-survey`, `CLOUD_SYNC_ENABLED`) et `js/cloud-sync.js`
  (authentification, `onSnapshot`, envoi groupé, migration, interface). Modèle Firestore :
  `users/{uid}/projects/{projectId}` = `{ payload, name, updatedAt }`. Interface : bloc
  « Synchronisation » (`.cloud-sync-*`, pastille colorée par `data-state`) dans le panneau
  Connexion et modale `#authModal` (`.cloud-auth-*` : e-mail, mot de passe, « Créer un
  compte », « Mot de passe oublié », message d'erreur traduit). `persistProjectStorage()`
  appelle `scheduleCloudPush()` (debounce 1,5 s → `batch` : `set` par parcelle + `delete` des
  documents distants absents) ; l'init de `projects.js` appelle `initCloudSync()`. Migration
  automatique quand le cloud est vide et le local non vide (une fois par compte, clé
  `rtkCloudMigrated_<uid>`). **Un snapshot vide n'écrase jamais le local.** Cache hors-ligne
  `enablePersistence()`. SDK « compat » 10.14.1 via CDN `gstatic` (scripts classiques, global
  `firebase`), chargés avant `js/parser.js` ; `cloud-sync.js` juste après `projects.js`.
  Documentation et règles Firestore à publier : `docs/firebase.md` (dont **Authentication →
  Domaines autorisés** : localtunnel et GitHub Pages). Vérifié :
  `node --check js/cloud-sync.js js/firebase-config.js js/projects.js` ; banc Node **16/16**
  avec Firebase simulé (migration : écriture + payload + horodatage serveur + marqueur + toast ;
  snapshot vide : local préservé ; snapshot distant : 2 parcelles appliquées + `localStorage` ;
  push différé : une écriture par parcelle ; suppression locale propagée en `delete` distant ;
  3 messages d'erreur d'authentification). À valider en conditions réelles avec un compte créé
  dans la console Firebase.


- **3.88 — Dernier point qui disparaissait (course snapshot / écriture locale)** : pendant la
  création d'une zone, le point à peine ajouté apparaissait puis disparaissait (avec sa ligne et
  sa mesure), sur les deux appareils. **Cause** : `handleCloudSnapshot()` (`js/cloud-sync.js`)
  appliquait tout snapshot dont la signature différait de `cloudLastSignature` en remplaçant
  `projects` par la version Firestore — y compris un état antérieur (cache IndexedDB au
  démarrage, écho d'un push précédent) qui ne contenait pas le point en attente de push.
  **Correction** : `cloudBaseline` (Map `id → signature` via `projectSignature()`, qui ignore
  `updatedAt`) mémorise l'état confirmé ; `collectDirtyProjects()` déduit les parcelles
  modifiées localement ; `handleCloudSnapshot()` **fusionne** : (1) parcelle sale → version
  locale, (2) écho de push (contenu identique hors `updatedAt`) → version locale, (3) sinon
  version distante. Si le résultat est identique au local, **aucun rendu ni écriture**
  (fin du clignotement). `refreshCloudBaseline()` est appelée après chaque push réussi et chaque
  application de snapshot ; le payload poussé porte un `updatedAt` ISO local en plus du
  timestamp serveur. La synchronisation descendante (autre appareil, suppressions) est
  préservée. Vérifié : `node --check js/cloud-sync.js` ; banc Node **14/14** (snapshot ancien :
  dernier point conservé + aucun rendu + `localStorage` intact ; push complet + `updatedAt` ;
  écho sans rendu ; snapshot distant plus récent appliqué ; suppression distante ; parcelle
  locale non poussée conservée).

- **3.89 — Synchronisation PC → téléphone (envoi sélectif et reprise au premier plan)** : la
  synchronisation fonctionnait du téléphone vers le PC, mais les modifications du PC étaient
  écrasées. **Cause** : `pushProjectsToCloud()` renvoyait **toute** la liste locale à chaque
  envoi ; un push déclenché sur le téléphone réécrivait donc les parcelles modifiées sur le PC.
  **Corrections** (`js/cloud-sync.js`) : (1) envoi **sélectif** — seules les parcelles sales
  (`collectDirtyProjects()`) et les suppressions partent, et aucune écriture n'est faite si
  rien n'a changé ; (2) `cloudBaseline` mise à jour uniquement pour les parcelles réellement
  poussées (signature capturée à l'envoi : une modification survenue pendant l'envoi reste
  « sale ») ; (3) file d'attente `cloudPendingRemote` — un snapshot reçu pendant un envoi est
  rejoué à la fin au lieu d'être perdu ; (4) `handleCloudSnapshot()` lit l'état local en
  **mémoire** (`projects`) et non `localStorage` (retard d'autosauvegarde) ;
  (5) `refreshCloudFromServer()` sur `visibilitychange` et `online` — lecture
  `get({ source: 'server' })` + réattachement de l'écoute `onSnapshot` si elle a été perdue
  (les écoutes sont suspendues en arrière-plan sur mobile). Diagnostic à chaud :
  `window.__MOWER_SYNC_DEBUG = true`. Vérifié : `node --check js/cloud-sync.js` ; banc Node
  **13/13** (push sélectif : une seule écriture, parcelle du PC non écrasée ; aucune écriture
  inutile ; snapshot PC appliqué + rendu ; snapshot pendant envoi mis en file puis appliqué ;
  suppression locale propagée ; resynchronisation au premier plan appliquée). Le sens
  téléphone → PC et le mode hors-ligne restent inchangés.

- **3.90 — Clignotement du dernier point : rejeu de la fusion, pas de la liste brute** : le
  point ajouté pendant un envoi Firestore disparaissait encore. **Cause** : le correctif 3.89
  mettait le snapshot reçu pendant un envoi dans `cloudPendingRemote`, puis le rejouait tel quel
  via `applyProjectsFromCloud()` à la fin de l'envoi. Cette liste avait été calculée **avant** le
  point ajouté pendant l'envoi et **contournait la fusion** : `projects` et `localStorage`
  étaient réécrits sans le dernier point (clignotement), puis `renderMap()` redessinait la zone
  sans lui. **Correction** : `mergeRemoteProjects(remote, remoteIds)` est extraite de
  `handleCloudSnapshot()` ; le dernier état distant connu est mémorisé (`cloudLastRemote`) et le
  rejeu rappelle la **fusion** (recalculée sur l'état local à jour, donc une parcelle encore
  sale conserve ses points). `applyProjectsFromCloud()` ne reçoit plus jamais de liste brute ; la
  mise en file se limite au drapeau `cloudPendingMerge`. Ajout de `syncLog()`
  (`window.__MOWER_SYNC_DEBUG`) : traces `envoi planifié` / `envoi` / `snapshot reçu` /
  `fusion … conservée` / `application différée` / `rejeu de la fusion` / `application distante`.
  Vérifié : `node --check js/cloud-sync.js` ; banc Node **13/13** reproduisant un point ajouté
  **pendant** un envoi (commit non résolu) avec snapshot concurrent : 3ᵉ et 4ᵉ point conservés,
  aucun écrasement, `localStorage` à jour, puis snapshot du PC appliqué ; trace obtenue
  `fusion : p1 (4 pt) conservée (en attente de push)` → `application distante : p1 (4 pt) |
  p2 (1 pt)`.

- **3.91 — Journal de synchronisation visible et protection d'édition locale** : aucun log
  `[sync]` n'apparaissait sur le terrain. **Cause** : `syncLog()` utilisait `console.debug`,
  masqué par défaut dans la console Chrome (niveau « Verbose » inactif) — le flag
  `window.__MOWER_SYNC_DEBUG = true` fonctionnait, mais les messages étaient filtrés.
  **Corrections** : `syncLog()` passe en `console.log` (visible au niveau « Info »),
  `initCloudSync()` affiche une aide `console.info` quand le journal est désactivé, et le
  clignotement résiduel est traité par `isProjectBeingEdited(project)` : un snapshot distant ne
  peut plus remplacer la parcelle **en cours de tracé** (`APP.tracesMode === 'creation'` /
  `APP.currentTraceMode` sur `currentProject`) ni pendant `CLOUD_EDIT_GUARD_MS = 2000` ms après
  une saisie locale (`cloudEditGuard`, marquée par `scheduleCloudPush()`). Vérifié :
  `node --check js/cloud-sync.js` ; banc Node **9/9** (tracé actif : snapshot ancien ignoré,
  4 points conservés, aucun rendu ; tracé terminé : snapshot appliqué ; garde 2 s : snapshot
  retardataire ignoré ; garde expirée : appliqué ; nouvelle parcelle distante reçue) avec la
  trace `fusion : p1 (4 pt) conservée (édition locale en cours)`.

- **3.92 — Hub de partage à 3 canaux et modale de connexion (e-mail mémorisé, « œil »)** : le hub
  `#transferModal` ne propose plus que **trois options**, dans cet ordre : « Télécharger le
  fichier » (`transferOpenDownloads()`, icône `download`), « QR Code animé »
  (`transferViaAnimatedQr()`, icône Lucide `scan-line` pour le distinguer du statique) et
  « QR Code statique » (`transferViaLocalServer()`, icône `qr-code`, ex-« Recevoir sur cet
  appareil ») ; le panneau local prend le titre « QR Code statique ». « Partage rapide » et
  « Enregistrer sur Drive / Cloud » sont supprimés, avec la sonde `canShareTransferFiles()`,
  `syncTransferCapabilities()`, `transferNativeShareSupported`, `shareGeoJSON()` et la note
  `#transferUnsupportedNote` (plus le CSS `.transfer-note-warn` et `.transfer-option.cloud`) ;
  `shareProjectsZip()` / `shareProjectGeoJSON()` restent utilisés par la file d'attente
  hors-ligne. Modale `#authModal` : la dernière adresse est mémorisée après une connexion
  réussie (`localStorage.mowerSurveyLastEmail`, **jamais** le mot de passe ; également
  alimentée par `onAuthStateChanged` à la restauration de session) et pré-remplie à l'ouverture,
  sans écraser une saisie en cours ; le champ mot de passe est enveloppé dans
  `.password-wrapper` avec le bouton `.password-toggle` (44 px, sans fond, icônes `ICON_EYE` /
  `ICON_EYE_OFF` de `js/app.js`, `aria-label` / `aria-pressed` mis à jour, `type` basculé entre
  `password` et `text`, retour au masquage à la fermeture). Vérifié :
  `node --check js/app.js js/cloud-sync.js js/export.js` ; banc Node **44/44** (3 options dans
  l'ordre demandé, libellés supprimés absents du HTML, `.password-wrapper` / `.password-toggle`
  présents, accolades CSS 209/209 · 410/410 · 141/141 · 1/1 · 58/58, e-mail normalisé et
  pré-rempli, saisie préservée, bascule `password` ↔ `text` avec la bonne icône et le bon
  `aria-label`, une seule clé `localStorage`, code mort absent de `export.js`).

- **3.93 — Panneau Connexion : modale accessible, œil dans le champ, e-mail entier** : trois
  défauts d'interface corrigés, mesurés sous Chrome/CDP en viewport 390 × 844.
  1. « Se connecter » **ouvrait** bien `#authModal`, mais le panneau Connexion (z-index 4000)
     restait au-dessus des modales (1100) : la modale s'affichait **derrière** lui et ses champs
     étaient incliquables (`elementFromPoint` renvoyait `cloudSyncRow`). `openAuthModal()`
     appelle désormais `closeHeaderMenu()` avant d'afficher la modale. Le bouton reste branché
     sur `toggleCloudAuth()` (il sert aussi à « Se déconnecter ») et délègue à `openAuthModal()`
     hors connexion.
  2. Bouton « œil » : les règles `password-*` sont **portées par `.cloud-auth-form`**
     (spécificité 0,2,0) pour qu'aucune règle de bouton générique ne le ramène dans le flux ;
     `togglePasswordVisibility()` trace chaque clic dans la console
     (`[auth] affichage du mot de passe : clair|masqué`) et `setPasswordVisible()` bascule
     `type` `password` ↔ `text` + icône `ICON_EYE` / `ICON_EYE_OFF` + `aria-label` / `aria-pressed`.
  3. E-mail tronqué : `.cloud-sync-email` passe en `flex: 1 1 100%` avec
     `white-space: normal` + `overflow-wrap: anywhere` (plus d'ellipse), `#cloudSyncRow` en
     `flex-wrap: wrap`, et `#cloudSyncEmail` est déplacé **après** `#btnCloudAuth` dans le DOM
     (l'adresse occupe une ligne dédiée, lisible en entier, sur 1 ou 2 lignes).
  Vérifié : `node --check js/cloud-sync.js` OK ; accolades CSS 210/210 · 410/410 · 141/141 · 1/1 ·
  58/58 ; `div` 171/171 ; **mesures CDP** avant → après : e-mail `clientWidth` 8 → 314
  (`tronque` true → false), panneau encore ouvert après le clic `true` → `false`, champ e-mail
  cliquable `false` → `true`, œil `oeilDansLeChamp: true`, `type` `text` ↔ `password` et
  `aria-label` « Masquer / Afficher le mot de passe », traces console présentes, 2 captures
  d'écran de contrôle (e-mail sur 2 lignes, œil à droite dans le champ).

- **3.94 — Modale de compte au premier plan (z-index 5000) et e-mail sur son propre bloc** :
  deux régressions terrain après la 3.93.
  1. La modale `#authModal` restait **derrière** le panneau Connexion quand la roue dentée était
     rouverte pendant sa consultation (panneau 4000 / voile 3999 > modale 1100).
     `#authModal` passe à **`z-index: 5000`** (`css/main.css`, juste après `.modal-overlay`) et
     `openAuthModal()` ferme le panneau via le nouveau `closeConnectionPanelForAuth()`
     (`closeHeaderMenu()` + retrait direct de `.show` sur `#headerMenu` et son voile,
     `aria-hidden="true"`, `aria-expanded="false"` sur `#btnConnectionSettings`) puis trace
     `[auth] openAuthModal — closeHeaderMenu() appelé, panneau fermé : true`.
  2. L'e-mail restait affiché « wor… » : il est désormais dans un **bloc dédié**
     `div.cloud-account` (`display: block`, `width: 100%`, `flex: 1 1 100%`, `margin-top: 4px`)
     et la classe du texte devient **`.cloud-account-email`** (`white-space: normal`,
     `overflow-wrap: anywhere`, `text-overflow: clip`, 12 px / 700) : l'ancienne règle
     `.cloud-sync-email` (ellipse) n'existe plus, et un CSS en cache ne peut plus s'appliquer
     puisque le nom de classe a changé.
  Vérifié : `node --check js/cloud-sync.js` OK ; accolades CSS 212/212 · 410/410 · 141/141 ·
  58/58 · 1/1 ; `div` 172/172 ; **mesures CDP** (390 × 844) : `zIndexModale` 5000 >
  `zIndexPanneau` 4000, panneau fermé après le clic (`true`), et dans le scénario « roue dentée
  rouverte » `elementFromPoint` sur le bouton du panneau renvoie `authModalTitle` (modale
  au-dessus), champs toujours cliquables ; e-mail `workai.francky@gmail.com` :
  `clientWidth = scrollWidth = 314`, `tronque: false`, 1 ligne, `textOverflow: clip`, parent
  `cloud-account` en `block` (314 px, `margin-top: 4px`), ni la ligne ni le panneau ne
  débordent ; captures de contrôle (e-mail entier sous « Se déconnecter », modale devant le
  panneau rouvert).

- **3.95 — Panneau Paramètres en cartes, Synchronisation épurée, titre du header retravaillé** :
  trois améliorations d'IHM, mesurées sous Chrome/CDP en viewport 390 × 844.
  1. Le panneau `#headerMenu` est organisé en **trois cartes** `.menu-card` — **Connexion**
     (NTRIP + compte cloud), **Affichage** (numéros des points + mode Gants/Soleil), **Données**
     (format d'export + file hors-ligne) — séparées par `gap: 10px`, chacune avec filet
     `--border`, fond `--color-bg-subtle` et un titre `.menu-card-title` (10 px / 800,
     capitales) ; les anciens libellés « Affichage » / « Confort » disparaissent.
  2. `#btnCloudAuth` devient un **lien discret** (souligné, fond transparent, sans bordure,
     11 px / 800) avec l'icône Lucide `ICON_LOG_OUT` (`js/app.js`) injectée par `renderCloudUi()`
     quand un compte est actif ; `#cloudSyncEmail` passe en 11 px / 600 `--text3` sous le lien.
  3. Interrupteurs : `.menu-switch` occupe toute la largeur de la carte (icône
     `.menu-switch-icon` `hash` / `sun`, piste poussée à droite par `margin-left: auto`), piste
     **48 × 28 px** (56 × 32 en `body.gloves-mode`), pastille 22 px (26 px), course 20 px (24 px),
     ligne de 48 px de haut.
  4. Titre du header : `clamp(14px, 4.5vw, 24px)`, `top: 24px`, `left: min(150px, 38vw)`,
     `right: min(60px, 16vw)`, `text-align: center` et
     `text-shadow: var(--text-shadow-header)` (nouveau token `0 2px 4px rgba(0,0,0,0.3)` dans
     `css/design-tokens.css`).
  Vérifié : `node --check js/app.js js/cloud-sync.js` OK ; accolades CSS 222/222 · 410/410 ·
  141/141 · 58/58 · 1/1 ; `div` 173/173 et `section` 4/4 ; **mesures CDP** : 3 cartes (178 / 154 /
  92 px, `gap` 10 px), pistes 48 × 28, 2 icônes de switch, `#btnCloudAuth` (« Se déconnecter » +
  icône, fond `rgba(0, 0, 0, 0)`, `underline`, 107 × 44 px), e-mail
  `workai.francky@gmail.com` en 11 px / 600 / `rgb(107, 114, 128)` non tronqué ; titre
  `top: 24px`, `left: 148,2px`, `right: 60px`, 17,55 px, `text-align: center`, ombre
  `rgba(0, 0, 0, 0.3) 0px 2px 4px`, **aucun chevauchement** avec la roue dentée (texte 159 → 320,
  roue à 334) ; panneau de 470 px sans défilement ni débordement ; 2 captures (mode normal et
  mode Gants).

- **3.96 — Titre du header invisible sur téléphone : replis CSS + cache-busting** : le panneau
  Paramètres (dans `main.css`) était bien à jour sur le téléphone, mais le titre restait petit,
  sans ombre et mal placé. **Diagnostic** : aucune media query ni règle concurrente ne ciblait
  `.header-title` / `.logo-text` (vérifié dans `main.css`, `components.css`, `theme.css`, aucun JS
  ni style inline) ; deux mécanismes restaient possibles — un `design-tokens.css` **en cache**
  (token `--text-shadow-header` absent ⇒ `text-shadow: var(--…)` invalide ⇒ ombre supprimée) et un
  navigateur sans `clamp()` / `min()` (⇒ `font-size` et `left/right` invalides ⇒ taille héritée et
  position statique). L'application étant servie par **GitHub Pages** (cache par URL),
  `index.html` référence désormais les cinq CSS locales avec `?v=3.96`.
  **Correctifs** (`css/main.css`, `index.html`) : `font-size: 22px` puis
  `clamp(14px, 4.5vw, 24px)` ; `left`/`right` en pixels puis en `min()` ; `text-shadow` littéral
  puis `var(--text-shadow-header, 0 2px 4px rgba(0,0,0,0.3))` ; sur mobile (≤ 480 px)
  `clamp(16px, 4.9vw, 22px)` (au lieu de 4.5vw → 17,5 px) et, sous 360 px, `right: 56px` +
  `min(16px, 4.6vw)` pour ne pas passer sous la roue dentée.
  Vérifié sous Chrome/CDP (mobile émulé) : à **1280 px** 24 px ; **480 px** 22 px ; **390 px**
  19,11 px → texte 151→327, roue à 334 (**aucun chevauchement**) ; **360 px** 16 px → 147→294,
  roue 304 ; **320 px** 14,72 px → 125→260, roue 264 ; ombre `rgba(0,0,0,0.3) 0px 2px 4px`
  **présente à toutes les largeurs** et **toujours présente après désactivation de
  `design-tokens.css`** (simulation du cache : `tokenApresDesactivation: (absent)`), 5 liens CSS
  versionnés ; `node --check` inchangé (aucun JS modifié) ; accolades CSS 225/225 · 410/410 ·
  141/141 · 58/58 · 1/1. Captures comparatives : 19 px = titre ombré et centré, 22 px = le « Y »
  passe sous la roue dentée (d'où le plafond à 22 px seulement au-delà de 480 px).

- **3.97 — Diagnostic temporaire du titre (`?debug-title`)** : pour comprendre un rendu mobile
  différent sans câble USB, `js/app.js` expose `debugHeaderTitle()`, appelée au
  `DOMContentLoaded` **seulement** si `location.search` contient `debug-title`. Elle affiche une
  alerte (et le même contenu en `console.log` préfixé `[debug-title]`) avec : styles calculés du
  titre (`font-size`, `text-shadow`, `font-family`), `innerWidth` / `devicePixelRatio` / état des
  media queries `(max-width: 480px)` et `(max-width: 360px)`, `top`/`left`/`right`/`text-align` et
  largeur du texte, valeur du token `--text-shadow-header` (`(absent)` si la feuille de tokens est
  en cache), support de `clamp()` / `min()` via `CSS.supports`, nombre de feuilles et **règles
  réellement chargées** pour `.header-title .logo-text` (parcours de `document.styleSheets`, media
  queries incluses), URL et `userAgent`. Vérifié sous Chrome/CDP : à **390 px** l'alerte renvoie
  `19.11px` / `rgba(0, 0, 0, 0.3) 0px 2px 4px` / 3 règles (base + 480 + 360) / `clamp oui | min oui` ;
  à **1280 px** `24px` ; **sans le paramètre, aucune alerte** (`window.__alerts` vide).
  `node --check js/app.js` OK.

- **3.98 — Titre du header : priorité mobile, grand et centré (+ retrait du diagnostic)** : le bloc
  temporaire `debugHeaderTitle()` et son appel `?debug-title` sont **supprimés** de `js/app.js`
  (aucune référence restante : `git grep 'debug-title|debugHeaderTitle'` → 0). Mesures de
  référence du header (analyse pixel du logo, Canvas) : à 390 px le rover s'arrête à **138 px** et
  la roue dentée commence à **334 px** → **196 px** d'espace libre, alors qu'un « MOWER SURVEY »
  de 25 px mesure ≈ 233 px. **Règle de base** : `clamp(16px, 5vw, 26px)` — plafond 26 px et non
  40 px, car le header reste une **colonne de 480 px** même sur un écran 1280 px (~270 px pour le
  titre). **Mobile ≤ 480 px** : `left: 36vw` / `right: 16.4vw`, `.header-title` en `display: flex`
  + `justify-content: center`, texte en `display: block` + `clamp(18px, 6.5vw, 26px)` (≈ 25 px à
  390 px) + `transform: scaleX(0.8)` / `transform-origin: center center` : la **hauteur** d'un
  25 px est conservée, la largeur condensée de 20 % tient dans les 196 px libres. **≤ 360 px** :
  `left: 36vw` / `right: 58px` + `clamp(16px, 6.2vw, 22px)`. Les cinq CSS passent à `?v=3.98`.
  Vérifié sous Chrome/CDP : 1280 px → 26 px (marges 174/20) ; 900 px → 26 px ; 480 px → 26 px
  (10/41) ; 420 px → 26 px (3/17) ; **390 px → 25,35 px** (texte 140→326, centre 233 = centre du
  bloc, marges 2/8, **aucun chevauchement** rover/roue) ; 360 px → 22 px (12/7) ; 320 px →
  19,84 px (13/2) ; ombre `rgba(0, 0, 0, 0.3) 0px 2px 4px` à toutes les largeurs. Captures :
  390 px = titre grand, ombré, centré ; 1280 px = titre entier et dégagé de la roue.
  `node --check js/app.js` OK ; accolades CSS 226/226 · 410/410 · 141/141 · 58/58 · 1/1.

- **3.99 — Titre et sous-titre du header harmonisés avec l'écran d'accueil** : `.logo-text`
  reprend la typographie de `.welcome-title` (`components.css` : Arial Black,
  `font-weight: 900`, `letter-spacing: 1px`, `line-height: 1`) et le nouveau
  `.header-subtitle` (« RTK - ACQUISITION TERRAIN », `index.html`) reprend celle de
  `.welcome-subtitle` (police héritée du body, 700, capitales, interlettrage, `opacity: 0.75`),
  avec des tailles adaptées à la largeur du header : titre `clamp(16px, 5vw, 26px)` (24,2 px à
  390 px contre 27,3 px sur l'accueil), sous-titre `clamp(9px, 2.5vw, 12px)` +
  `letter-spacing: 1.5px` ; en mobile titre `clamp(18px, 6.2vw, 25px)` (avec `scaleX(0.8)`) et
  sous-titre `clamp(8px, 2.3vw, 11px)` + `1.2px` ; ≤ 360 px : `clamp(16px, 5.8vw, 21px)` /
  `clamp(7px, 2.1vw, 10px)`. `.header-title` passe en `line-height: 1` et, sous 480 px, en
  `display: flex` + `flex-direction: column` + `align-items: center` (titre au-dessus du
  sous-titre, tous deux centrés). Les cinq CSS passent à `?v=3.99`.
  Vérifié sous Chrome/CDP : **police, graisse, interlettrage et interligne identiques** entre
  accueil et header (`"Arial Black", Impact, sans-serif` / 900 / 1px / 1) et sous-titre identique
  (police, 700, uppercase, 0.75) ; à 390 px le titre mesure 187 px (marges 2 / 7) et le
  sous-titre 153 px (19 / 24), **centres confondus avec le centre du bloc (233)**, aucun
  chevauchement de la roue (334) et bas du sous-titre à 59 px pour un bandeau bas à 71 px ; à
  1280 px titre 251 px / sous-titre 270 px, centrés (685), aucun chevauchement. Accolades CSS
  229/229 · 410/410 · 141/141 · 58/58 · 1/1 ; `div` 173/173 et `span` 78/78 ; aucun JS modifié.
  Captures de contrôle aux deux largeurs.

- **4.00 — Header rétractable pour dégager la carte** : `#btnHeaderCollapse` (chevron Lucide
  `chevron-up` / `chevron-down`, 44 × 44 px) est ajouté en **1re position** de
  `.header-actions-group` (`index.html`, `header` reçoit aussi `id="appHeader"` et
  `aria-label`). `applyHeaderCollapsed()` / `toggleHeaderCollapse()` / `initHeaderCollapse()`
  (`js/app.js`) posent `body.header-collapsed`, persisté dans `rtkHeaderCollapsed` et **déployé
  par défaut** ; `js/map.js` expose `refreshMapSize()` (`map.invalidateSize()`). CSS
  (`css/main.css`) : `header` passe de **121 px à 52 px** (transition 0,22 s), logo et titre en
  `opacity: 0`, `.header-bottom-band` à `bottom: 4px`, roue dentée ramenée dans le bandeau
  (`top: 4px`) avec `margin-right: 52px` pour le groupe d'actions. `aria-expanded` + libellé
  (« Replier / Déplier l'en-tête ») suivent l'état. **Cache-busting étendu aux JS locaux** :
  les `<script src="js/…">` sont appelés avec `?v=4.00` (le bundle vendorisé et les CDN restent
  intacts), en plus des cinq CSS.
  Vérifié sous Chrome/CDP (390 × 844, DPR 2) : état déployé 121 px / carte 659 px / titre
  `opacity: 1` / chevron haut / `aria-expanded="true"` ; après clic **52 px / carte 728 px
  (+69 px)** / titre `opacity: 0` / chevron bas / `aria-expanded="false"` / `rtkHeaderCollapsed
  = "1"` ; retour à 121 / 659 / chevron haut ; **persistance après rechargement** (démarre
  replié, 52 / 728) ; aucun chevauchement roue / groupe d'actions dans le bandeau (groupe
  178→326, roue à 334) ; captures des deux états. `node --check js/app.js js/map.js` OK ;
  accolades CSS 238/238 · 410/410 · 141/141 · 58/58 · 1/1 ; `div` 173/173, `span` 78/78,
  `button` 58/58.

- **Panneau latéral des outils de la carte (4.01, déplacé à GAUCHE en 4.02)** : la carte n'a
  **aucun contrôle sur ses bords**. `#mapToolsPanel` (`.map-tools-panel`, `top: 164px`,
  **`left: 10px`**, 60 px de large, fond `--color-white`, `--shadow-lg`, rayon `--radius-lg`,
  `z-index: 1001`) contient sept boutons `.map-float-btn` (44 px) : `#btnMapZoomIn` /
  `#btnMapZoomOut` (le **contrôle zoom de Leaflet est retiré** : `L.map(…, { zoomControl: false })`
  + `mapZoomIn()` / `mapZoomOut()`), `#btnBaseRelief` / `#btnBaseSatellite`, `#btnMapCenter`
  (`centerMapOnGps()`), `#btnFollowGps` (`toggleGpsFollow()`, état tenu par
  `updateGpsFollowControl()` via l'id) et `#btnMapFullscreen`. Replié :
  `transform: translateX(calc(-100% - 20px))` (hors écran à gauche), `opacity: 0`,
  `pointer-events: none` ; `.is-open` le ramène (`translateX(0)`), transition 0,18 s neutralisée
  en `prefers-reduced-motion`.
  Il est ouvert/fermé par la **languette** `#mapToolsGrabber` (`.map-tools-grabber`, 16 × 46 px,
  `rgba(255,255,255,0.8)`, `--shadow-sm`, collée au **bord gauche** et centrée verticalement,
  `z-index: 1002`, arrondie à droite) : `toggleMapToolsPanel()` → `openMapToolsPanel()` /
  `closeMapToolsPanel()` posent `.is-open` sur le panneau et `body.map-tools-open` (qui fait
  glisser la languette à `left: 70px`, sur le bord droit du panneau). **Chevrons inversés** :
  `ICON_CHEVRON_RIGHT` fermé (on ouvre vers la droite), `ICON_CHEVRON_LEFT` ouvert (on referme
  vers la gauche). `refreshMapSize()` recale Leaflet. Fermeture aussi au **clic sur la carte**
  (`map.on('click', closeMapToolsPanel)`) et par **Échap**. Le contrôle GPS Leaflet
  (`bottomleft`/`bottomright`) et `ensureGpsControlPosition()` sont **supprimés** ; le
  verrouillage est dans le header (voir couche 4) et le FAB d'enregistrement reste centré en bas.
  Vérifié sous Chrome/CDP (390 × 844) : fermé → panneau `opacity: 0` / `pointer-events: none` /
  `translateX(-80px)`, languette 16 × 46 à **`x = 0`** (bord gauche), chevron **droite**,
  `aria-expanded="false"` ; ouvert → panneau 60 × 360 à **`x = 10`**, languette à **`x = 70`**,
  chevron **gauche**, `aria-expanded="true"` ; zoom `17 → 18` ; `#btnBaseSatellite` devient
  `.active` ; **cadenas dans le header** : `body.locked` + icône `unlock` + `aria-pressed="true"`
  au clic, retour à `lock` au déverrouillage ; **header rétractable toujours fonctionnel**
  (121 → 52 px, cadenas visible) ; aucun `.leaflet-control-zoom`, `.map-floating-controls`,
  `.map-gps-control` ni `.map-lock-control` dans le DOM ; captures des deux états.
  `node --check js/app.js js/map.js` OK ; accolades CSS 58/58 (map) · 238/238 (main) · 410/410 ·
  141/141 · 1/1 ; `div` 172/172, `button` 63/63.

- **4.02 — Panneau d'outils à gauche, sous-titre lisible, cadenas dans le header** : trois
  ajustements d'ergonomie.
  1. Le panneau latéral passe du bord **droit** au bord **gauche** : `.map-tools-panel` en
     `left: 10px` avec `transform: translateX(calc(-100% - 20px))` replié (ouverture de gauche à
     droite), `.map-tools-grabber` en `left: 0` (arrondi à droite, `border-left: none`) qui glisse
     à `left: 70px` panneau ouvert, et **chevrons inversés** (`ICON_CHEVRON_RIGHT` fermé,
     `ICON_CHEVRON_LEFT` ouvert).
  2. `.header-subtitle` : `opacity: 1`, `color: #fff` (il héritait de la couleur sombre du body)
     et `text-shadow: var(--text-shadow-subtitle, 0 1px 2px rgba(0,0,0,0.5))` (nouveau token dans
     `css/design-tokens.css`) — lisible sur le vert du header.
  3. `#btnLock` quitte la carte (`.map-lock-control` supprimé) et rejoint `.header-actions-group`
     **avant `#btnTheme`**, en `.header-icon-btn` (44 × 44, icônes `lock` / `unlock` toujours
     injectées par `setScreenLock()`). Le groupe fait 200 px, aucun débordement du header.
  Vérifié sous Chrome/CDP (390 × 844) : fermé → panneau `translateX(-80px)` / `opacity: 0`,
  languette à `x = 0` (chevron droite) ; ouvert → panneau à `x = 10`, languette à `x = 70`
  (chevron gauche) ; sous-titre `opacity: 1` + ombre `rgba(0, 0, 0, 0.5) 0px 1px 2px` ; cadenas
  44 × 44 dans `.header-actions-group` (boutons : collapse, lock, theme, ble) ; verrouillage
  `body.locked` + icône `unlock` + `aria-pressed="true"`, déverrouillage inverse ; zoom
  `17 → 18`, satellite `.active` ; header rétractable toujours OK (52 px, cadenas visible) ;
  captures (panneau ouvert à gauche, header zoomé). `node --check js/app.js js/map.js` OK ;
  accolades CSS 58/58 (map) · 238/238 (main) · 410/410 · 141/141 · 1/1 ; `div` 172/172,
  `button` 63/63. **Limite connue** : le cadenas étant dans le header, il n'est plus accessible
  en plein écran carte (header masqué).

## 9. Langue et communication

- Écrire en **français** (interface, commentaires, documentation, messages de commit).
- **Expliquer les hypothèses** et les écarts par rapport à la demande : ne jamais changer
  silencieusement un comportement, un contrat d'export ou un choix de fournisseur de tuiles.
- Signaler les limites connues (Web Bluetooth Android, tuiles sans clé, précision raster).
- Valider chaque modification : `node --check` sur les JS, vérification dans le navigateur
  (thème clair/sombre, carte, modales) et test de non-régression des exports.

## 10. Maintenance du logo vectoriel (header)

Le logo du header est un SVG unique (un seul `<path>`) stocké dans `assets/logo-rtk-mower.svg` et
injecté dans `index.html` (bloc `.header-logo-layer`). Le CSS le contraint à une boîte de
`480 × 65 px` (`.header-logo-layer` et `.header-logo-layer svg` dans `css/main.css`).

### Règle : ne jamais recopier le `<path>` à la main

La valeur de l'attribut `d` ne doit jamais être copiée-collée manuellement. Elle doit toujours
être extraite du fichier source **par script** (lecture de fichier, puis remplacement
programmatique) pour éviter les décalages de coordonnées : les sous-tracés commencent par des
`m` **relatifs**, donc une seule valeur erronée décale une partie du dessin (le rover par
rapport à l'herbe).

### Procédure selon le type de modification

**Cas 1 — Modification du SVG à l'identique (même dimensions, même `viewBox`, seules les formes
changent)**

1. Remplacer le fichier `assets/logo-rtk-mower.svg`.
2. Demander à Cline de relire le fichier et de mettre à jour le `<path>` dans `index.html` (via
   script, jamais à la main).
3. Vérifier que la longueur et le SHA-256 du `d` correspondent exactement entre le fichier
   source et `index.html`.

**Cas 2 — Changement complet de logo (dimensions ou `viewBox` différents)**

1. Remplacer le fichier `assets/logo-rtk-mower.svg`.
2. Mettre à jour le `<path>` dans `index.html` (via script, jamais à la main).
3. Mettre à jour le `viewBox` dans `index.html` **ET** les contraintes de taille dans
   `css/main.css` (règle `.header-logo-layer svg`).
4. Vérifier visuellement le rendu du header (le logo ne doit pas être écrasé ni rogné de
   manière inattendue).

### Vérification de référence (état actuel du logo)

- **Fichier source** : `assets/logo-rtk-mower.svg`
- **Nombre de `<path>`** : 1
- **`viewBox`** : `0 0 3524 500`
- **Longueur du `d`** : 26 278 caractères
- **SHA-256 du `d`** : `4B5C8E4B6005A23862A112E5875E5BCF02DB253A9830340EE59EE008F423010E`
- **Date de référence** : 2026-11-04

Script de contrôle en lecture seule (PowerShell), à exécuter depuis la racine du dépôt :

```powershell
$svg  = Get-Content -Raw 'assets\logo-rtk-mower.svg'
$html = Get-Content -Raw 'index.html'

# Extraire tous les d du SVG source
$dSvg = @([regex]::Matches($svg, '<path\b[^>]*?\bd="([^"]*)"') | ForEach-Object { $_.Groups[1].Value })

# Extraire tous les d du bloc .header-logo-layer dans index.html
$layerMatch = [regex]::Match($html, '(?s)<div class="header-logo-layer".*?</div>')
$dHtml = @([regex]::Matches($layerMatch.Value, '<path\b[^>]*?\bd="([^"]*)"') | ForEach-Object { $_.Groups[1].Value })

if ($dSvg.Count -ne $dHtml.Count) { throw "Nombre de <path> différent : SVG=$($dSvg.Count) HTML=$($dHtml.Count)" }

$ok = $true
for ($i = 0; $i -lt $dSvg.Count; $i++) {
  $hashSvg  = (Get-FileHash -InputStream ([IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes($dSvg[$i])))  -Algorithm SHA256).Hash
  $hashHtml = (Get-FileHash -InputStream ([IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes($dHtml[$i]))) -Algorithm SHA256).Hash
  if ($hashSvg -ne $hashHtml) { $ok = $false }
  "Path #$($i+1) : longueur SVG=$($dSvg[$i].Length) HTML=$($dHtml[$i].Length) | SHA SVG=$hashSvg HTML=$hashHtml | identiques=$($hashSvg -eq $hashHtml)"
}

# Vérifier le viewBox
$vb = [regex]::Match($layerMatch.Value, 'viewBox="([^"]*)"').Groups[1].Value
"viewBox = $vb (attendu 0 0 3524 500 : $($vb -eq '0 0 3524 500'))"
"Logo synchronisé : $ok"
```

## 11. Convention des messages de commit

- Langue : français.
- Format : une seule phrase courte, à l'impératif ou au passé composé.
- Pas de préfixe technique (feat, fix, chore, etc.).
- Pas de corps de message (pas de liste à puces).
- Décrire l'action de façon neutre et lisible.

Exemples :

- "Ajout du guidage caméra"
- "Correction du calcul de surface"
- "Mise à jour des styles du menu"
- "Nettoyage des prototypes"

