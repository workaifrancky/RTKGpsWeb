# Design system — RTK Mower

Le design system est aligné sur **Mower Planner**. Il repose sur un fichier de tokens chargé
avant tous les autres styles.

## Ordre de chargement

```html
<link rel="stylesheet" href="css/design-tokens.css">
<link rel="stylesheet" href="css/main.css">
<link rel="stylesheet" href="css/components.css">
<link rel="stylesheet" href="css/map.css">
<link rel="stylesheet" href="css/theme.css">
```

| Fichier | Rôle |
|---|---|
| `design-tokens.css` | Tokens de base (couleurs, rayons, ombres, espacements) |
| `main.css` | Reset, layout, header, onglets, toasts, modales, thème nuit, alias |
| `components.css` | Cartes, boutons, listes de points, barre d'enregistrement flottante |
| `map.css` | Styles Leaflet (popups, zoom, attribution, overlay) |
| `theme.css` | Overrides du mode nuit et styles de l'écran caméra |

## Tokens (`css/design-tokens.css`)

### Couleurs

| Token | Valeur | Usage |
|---|---|---|
| `--color-primary-deep` | `#1b5e20` | Titres, hover des boutons, texte sur fond pâle |
| `--color-primary` | `#2e7d32` | Boutons principaux, header |
| `--color-primary-light` | `#4caf50` | Bordures gauche, accents, tonte |
| `--color-primary-pale` | `#c8e6c9` | Fonds pâles, hover secondaire |
| `--color-warning` | `#f59e0b` | Obstacles, fix Float |
| `--color-danger` | `#d32f2f` | Zone interdite, actions destructives |
| `--color-info` | `#1976d2` | DGPS, informations |
| `--color-teal` | `#00897b` | Accent complémentaire |
| `--color-white` | `#ffffff` | Surfaces (devient `#1a1d27` en thème nuit) |
| `--color-bg-subtle` | `#f5f7f5` | Fond général |
| `--color-bg-muted` | `#e0e4e0` | Champs, blocs secondaires |
| `--color-text-primary` | `#333333` | Texte principal |
| `--color-text-secondary` | `#9e9e9e` | Texte secondaire |

### Rayons, ombres, espacements

- Rayons : `--radius-sm` 6 px, `--radius-md` 8 px, `--radius-lg` 10 px, `--radius-xl` 12 px.
- Ombres : `--shadow-sm`, `--shadow-md`, `--shadow-lg` (+ `--shadow-xl` défini dans `main.css`).
- Espacements : `--spacing-xs` 4 px, `--spacing-sm` 8 px, `--spacing-md` 12 px,
  `--spacing-lg` 16 px, `--spacing-xl` 24 px.

## Variables spécifiques RTK Mower (`main.css`)

Elles pointent vers les tokens quand c'est possible :

- Types de points : `--color-tonte` → `--color-primary-light`, `--color-interdit` → `--color-danger`,
  `--color-obstacle` → `--color-warning`.
- Fix GPS : `--color-rtk`, `--color-float`, `--color-dgps`, `--color-gps`, `--color-none`.
- Variantes pâles (absentes de la palette Mower Planner) : `--color-primary-pale-bg`,
  `--color-primary-accent`, `--color-warning-pale/strong/text`, `--color-danger-pale/strong/text`,
  `--color-info-pale/strong/text`, `--color-neutral-pale/text`.
- `--button-bg-disabled`, `--shadow-xl`.
- Alias de compatibilité utilisés par `theme.css` et `map.css` : `--green-dark/main/mid/light`,
  `--bg`, `--bg2`, `--bg3`, `--text`, `--text2..4`, `--radius`, `--shadow`.

## Mode sombre

Activé par `data-theme="dark"` sur `<html>` (`applyTheme()` dans `app.js`). Le thème nuit
**surcharge les tokens** dans `main.css` : surfaces, textes, verts et bordures. Les alias et
les composants suivent automatiquement.

Overrides de lisibilité :

- `.btn-secondary` et `.modal-title` passent en `--color-primary-light` ;
- les badges et alertes conservent leurs fonds pâles (texte foncé) ;
- les ombres des cartes sont supprimées dans `theme.css`.

## Composants clés

### Boutons standards (`components.css`)

- `.action-button` : fond `--color-primary`, texte `white`, rayon 8 px, padding 10 px, 14 px.
- `.action-button-danger` : fond `--color-danger`, hover `#b71c1c`.
- `.btn-secondary` : bordure `--color-primary`, fond `--color-white`, texte `--color-primary-deep`.
- `.action-button-compact` : variante barre d'actions (padding 8 px, 12 px, `flex: 1`).
- `.points-view-actions` : grille 2 × 2 des actions de la vue POINTS (GeoJSON, CSV, GPX,
  Effacer), boutons pleine largeur.
- `.export-primary` : bouton principal plein (`--color-primary`, texte blanc, 14 px / 800),
  hover `--color-primary-deep`, utilisé pour GeoJSON.
- `.transfer-trigger` (`#btnTransfer`) : bouton pleine pastille de l'en-tête de la vue POINTS
  (44 px, fond `--color-primary`, texte blanc, 13 px / 800) avec l'icône Lucide `share-2` et le
  libellé « Transférer » ; hover `--color-primary-deep`, `active` à 0,98. Il ouvre le hub de
  transfert (voir plus bas).
- `.action-button-simulation` : violet `#7c3aed`, pleine largeur, visible sans BLE.
  **Inutilisé** : les boutons de simulation sont retirés de l'interface terrain, la classe est
  conservée pour une réactivation (voir [simulation.md](simulation.md)).
- `.action-button-simulation-gps` : variante teal (`--color-teal`), injecte une trame GPS
  fictive dans le pipeline (bandeau Fix). **Inutilisé** pour la même raison.
- `.btn-action-bar` : conservé pour les boutons générés par `history.js` (style blanc bordé).

### Indicateur de sauvegarde et verrouillage

- `#saveIndicator` (`.save-indicator`) : indicateur discret de la 2ᵉ ligne du menu du header
  (à droite du bouton Parcelle), icône `💾` ; `flashSaveIndicator()` relance
  l'animation `saveFlash` (0,9 s) à chaque écriture locale et met le `title` à l'heure de
  sauvegarde. L'écriture réelle est centralisée par `persistProjectStorage()` /
  `flushProjectStorage()`.
- `#lockOverlay` (`.lock-overlay`) : voile plein écran `z-index: 3000` (au-dessus de la barre
  basse, du tiroir, des modales et des toasts), fond sombre + `backdrop-filter`. Affiché par
  `body.locked`.
- `.lock-banner` : icône 52 px, titre 22 px / 800 et message « Glissez pour déverrouiller ».
- `.lock-swipe` : piste de 60 px (`min(320px, 82vw)`) ; `.lock-swipe-knob` (50 × 48 px) suit
  le doigt, passe en `--color-primary-accent` au-delà de 72 % du parcours. Le relâchement
  déclenche `setScreenLock(false)` ; un glissement court revient à zéro. Entrée / Espace
  déverrouillent au clavier (piste focusable).
- `#btnLock` : bouton flottant 44 px à droite de la carte (`top: 110px`, `right: 10px`),
  `aria-pressed` synchronisé, icône 🔒 / 🔓. Pendant le verrouillage, les gestes Leaflet sont
  désactivés (`setMapInteractionEnabled`) et les boutons d'enregistrement sont bloqués par
  `canRecordPoints()` + `updateTerrainButtons()`.

### Header et menu du header (`main.css`)

- `header` : **deux lignes** collantes (`position: sticky`, `z-index: 200`,
  `flex-direction: column`, `gap: 6px`, fond `--color-primary`) :
  - `.header-top-row` : logo (🌾 + « RTK Mower ») + bouton `#btnConnectionSettings` ;
  - `.header-bottom-row` : pastille `#headerGpsStatus` (`.gps-status-pill`,
    `flex: 1 1 auto`) + `.header-actions-group` (thème `#btnTheme`, BLE `#btnBle`).
- `.header-connection-btn` : pastille translucide de 36 px (rayon 999 px, bordure et fond
  `rgba(255,255,255,0.35)` / `rgba(255,255,255,0.12)`, survol `0.22`), icône **SVG Lucide
  `settings`** de 16 px + libellé « Connexion » (12 px / 800, 11 px ≤ 360 px). L'état ouvert
  est porté par `aria-expanded` ; l'emoji `⚙️` n'est pas utilisé.
- `.header-icon-btn` : carrés de 40 px (38 px ≤ 480 px), translucides et centrés
  (`inline-flex`). Le thème affiche **20 px** `ICON_MOON` / `ICON_SUN`, injectés directement dans
  `#btnTheme` par `applyTheme()` (lune en clair, soleil en sombre) ; le BLE affiche
  `getBleIconMarkup()` (SVG + trois ondes). Couleurs d'état `#btnBle.connected` /
  `.disconnected` dans `components.css`.
- `#headerMenuOverlay` (`.header-menu-overlay`) et `#headerMenu` (`.header-menu`) sont placés
  **hors de `.app-wrapper`** pour que leur `z-index` (3999 / 4000) passe au-dessus du
  verrouillage d'écran (3000) et des FAB (1002). Le menu est fixé **sous le header mesuré**
  par `positionHeaderMenu()` (`getBoundingClientRect()`, recalculé au `resize`) ; le `top` CSS
  de 108 px n'est qu'un secours. Largeur `min(340px, 100vw - 20px)`, fond `--color-white`,
  `--shadow-xl`, `max-height` calculée sur `100dvh` avec scroll interne.
- **Deux blocs distincts** `.menu-row` séparés par 14 px (`.header-menu-content` en colonne,
  filet supérieur `.menu-row-context`) : (1) libellé `NTRIP` + station `.menu-ntrip-select` +
  `#saveIndicator` (icône Lucide `save`) ; (2) libellé `Affichage` + switch
  `#btnPointNumbers` (`.menu-switch[role="switch"]` : piste `.menu-switch-track` de 40 × 22 px,
  pastille `.menu-switch-knob`, état porté par `aria-checked`). La parcelle n'est **pas** dans
  ce panneau (elle est en 1re ligne du menu FAB de TRACÉS) : aucune ligne de repli.
- `openHeaderMenu()` / `closeHeaderMenu()` / `toggleHeaderMenu()` / `toggleConnectionPanel()`
  (`js/app.js`) : le déclencheur est `#btnConnectionSettings` (`getHeaderMenuTrigger()`).
  Échap, clic hors du menu (délégation sur `document`) ou sur le voile referment et rendent le
  focus au bouton ; l'ouverture est refusée pendant le verrouillage d'écran.

### Barre de navigation basse (`main.css`, overrides dans `theme.css`)

Structure : un conteneur `#bottomNav` avec les classes `.tabs-wrapper.bottom-nav`, placé **hors
de `.app-wrapper`** (après sa fermeture) et fixé en bas de l'écran. Chaque onglet reste un
`<button type="button" class="tab-label" data-tab="tab-…">` (TRACÉS, CAMÉRA, RELEVÉ,
HISTORIQUE — CARTE a été supprimé en 3.22). L'état actif est porté par `.active` et
`aria-current="page"`, posés par `showTab()` (`js/app.js`).

- `.tabs-wrapper.bottom-nav` : `position: fixed`, `bottom: 0`, centrée (`left: 50%`,
  `translateX(-50%)`), largeur 100 % plafonnée à 480 px (comme `.app-wrapper`),
  `min-height: var(--bottom-nav-height)` (64 px), fond `--color-white`, bordure supérieure
  `1px solid var(--border)`, ombre `0 -2px 10px rgba(0,0,0,0.05)`, `z-index: 900`.
  `padding-bottom: calc(5px + env(safe-area-inset-bottom, 0px))` pour l'iPhone
  (`viewport-fit=cover` activé dans `index.html`).
- `.screen` réserve `calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))` en
  `padding-bottom` : la carte, le FAB, la vue POINTS et le contenu des autres onglets
  restent au-dessus de la barre.
- `.bottom-nav .tab-label` : quatre boutons de largeur égale (`flex: 1 1 0`), en colonne
  (icône 20 px au-dessus du libellé), `min-height: 52px`, libellés **visibles** à toutes les
  largeurs (12 px, 11 px ≤ 340 px), couleur inactive `--text3`, fond transparent, sans bordure
  ni ombre. Les icônes sont des **SVG Lucide inline** (20 px, `stroke: currentColor`) :
  map-pin, camera, bar-chart et clock.
- `.bottom-nav .tab-label.active` : texte/icône `--green-dark` et liseré supérieur de 34 × 3 px
  `--color-primary-accent` (`::after`) ; survol sur `--color-primary-pale-bg`.
- `.tab-label:focus-visible` : contour 3 px `--color-primary-accent`.
- Thème nuit : surface `--color-white` (sombre), libellés `--color-primary-accent` avec
  `opacity: 0.65` pour les inactifs (1 pour l'actif), liseré actif `--color-primary-accent`.
- `showTab()` pose `.active` et `aria-current="page"` ; la barre est masquée en plein écran
  carte (`body.map-ui-fullscreen .tabs-wrapper`) et caméra
  (`body.camera-ui-fullscreen .tabs-wrapper`).
- Hiérarchie : barre basse 900 < voile du tiroir 1040 < tiroir 1050 < modales 1100 < toasts
  1200. Le tiroir et les modales recouvrent donc la barre.

### Modales (`main.css`)

- `.modal-overlay` : fond `rgba(0,0,0,0.5)`, `opacity: 0` → `.show` pour l'ouverture.
- `.modal-box` : fond `--color-white`, rayon 10 px, padding 16 px, `--shadow-xl`, max 480 px.
- `.modal-title` : 18 px, 700, `--color-primary-deep`.
- `.modal-handle` : poignée grise centrée.
- **Modale générique** `#customModal` (`app.js`) : remplace `confirm()` / `prompt()` natifs via
  `customConfirm(message, options)` et `customPrompt(message, valeur, options)`. Utilise
  `.modal-message` (14 px), `.modal-error` (13 px, `--color-danger-text`) et `.modal-actions`
  (deux boutons de largeur égale, 44 px min). Fermeture par Annuler, Échap ou clic sur le
  voile ; focus piégé et restauré, nom vide refusé sans fermer la modale.

### Hub de transfert (`components.css`)

- `#transferModal` réutilise `.modal-overlay` / `.modal-box` (z-index 1100) avec
  `.transfer-box` en colonne. En-tête `.transfer-head` : titre + `.transfer-subtitle`
  (« Parcelle : … ») et `.transfer-close` (38 px, rond, icône Lucide `x`).
- `.transfer-options` : quatre `.transfer-option` (min-height 66 px) composées de
  `.transfer-option-icon` (42 px, `--color-white`, couleur par canal : `share` vert,
  `local` teal, `cloud` bleu info, `download` vert foncé), `.transfer-option-text`
  (titre 13 px / 800 + description 11 px `--text3`) et `.transfer-option-chevron`
  (Lucide `chevron-right`).
- Survol « pro » : `translateY(-1px)`, bordure `--color-primary-light`, fond
  `--color-primary-pale-bg`, ombre `--shadow-md` et chevron décalé de 3 px ; `active` à 0,99.
  Thème nuit : fond `--color-bg-muted`, pastilles `--color-bg-subtle` + `--border2`.
- `.transfer-local` (vue « mode serveur local ») : `.transfer-badge` (« Bientôt », ambre),
  `.transfer-local-url` (encadré pointillé, URL en 13 px / 800), `.transfer-local-hint` et
  deux `.btn-secondary` de largeur égale (« Copier », « Retour »).
- `.points-view-actions.is-highlight` : animation `transfer-highlight` (halo
  `--color-primary-accent`, 2 × 0,9 s) déclenchée par l'option « Télécharger » du hub ;
  remplacée par un contour fixe en `prefers-reduced-motion: reduce`.

### Tiroir Parcelles

- `#btnProjectDrawer` (`components.css`) : **1re option** `.trace-fab-item.project` du menu FAB
  de TRACÉS, libellé `Parcelle : <nom>` (`#currentProjectName`) avec ellipse
  (`.trace-fab-item-text` et icône map-pin `--color-primary`). Il ouvre le tiroir et reçoit
  `aria-expanded` (`aria-controls="projectDrawer"`). La fermeture du tiroir utilise l'icône
  Lucide `x` (`.drawer-close`), la création `plus` (`.drawer-new`).
- `.drawer-overlay` : voile `rgba(0,0,0,0.5)` en position absolue dans `.app-wrapper`,
  `opacity` 0 → 1 via `.show`, `z-index: 1040`.
- `.drawer` : panneau latéral droit `min(320px, 86%)`, fond `--color-white`, bordure
  `--border`, `--shadow-xl`, glissement `translateX(100%)` → 0 (`visibility` masquée au
  repos), `z-index: 1050` — au-dessus du FAB carte (1002), sous les modales (1100)
  et les toasts (1200).
- `.drawer-header` : bandeau `--color-primary`, titre 15 px / 800, bouton `✕` blanc.
- `.drawer-project` : ligne = bouton principal (nom 13 px / 800, méta `N point(s) · Zone #N`)
  + deux actions rondes 44 px avec **icônes SVG Lucide** (pencil pour renommer, trash pour
  supprimer, 18 px, `stroke: currentColor`, centrées en `inline-flex`) — plus d'emoji.
  Ligne active : fond `--color-primary-pale` et nom
  `--color-primary-deep` ; en nuit, fond `--color-bg-muted` et nom `--color-primary-accent`.
- `.drawer-new` : bouton plein `--color-primary` en bas du panneau.
- Accessibilité : `role="dialog"`, `aria-modal="true"`, `aria-expanded` sur le bouton du
  header, focalisation du bouton de fermeture à l'ouverture, fermeture à Échap / clic voile.

### Import d'obstacles (modale parcelle)

- `.import-obstacles` : bloc sous le champ nom, titre `.import-obstacles-title` (10 px / 800,
  majuscules, `--text3`) et bouton `.import-obstacles-toggle` (« Tout cocher » / « Tout
  décocher », vert `--color-primary`, accent en nuit).
- `.import-obstacles-list` : liste scrollable (`max-height: 190px`) sur `--color-bg-muted`,
  bordure `--border`, rayon `--radius-md`.
- `.import-obstacle-item` : ligne cochable (`label` + `input[type=checkbox]`), icône, nom
  ellipsé et coordonnées à 5 décimales (`font-variant-numeric: tabular-nums`) ; fond
  `--color-white`, survol `--color-primary-pale`.
- `.import-obstacles-empty` : message « Aucun obstacle enregistré pour le moment. ».
- `.modal-box` reçoit `max-height: 90dvh` + `overflow-y: auto` pour les longues listes.

### Breakpoints responsive

| Plage | Comportement |
|---|---|
| Toutes largeurs | Cibles tactiles ≥ 44 px : `button { min-height: 44px }`, zoom Leaflet 44 px, contrôles flottants 44 px. |
| ≥ 481 px | Header sur deux lignes (logo + « Connexion », puis pastille GPS + thème + BLE) ; le panneau Connexion porte la station NTRIP, la parcelle et la sauvegarde ; onglets avec libellés, FAB 56 px. |
| ≤ 480 px | Header sur deux lignes : logo 15 px sans « v2 », bouton Connexion 34 px (11 px), pastille GPS 30 px, boutons icône 38 px ; libellés d'onglets masqués (`.tab-text`), **barre de navigation basse** avec libellés visibles (12 px), FAB à 12 px des bords (bas 14 px), menu 220 px. Badge/POINTS à 12 px, hint masqué. |
| ≤ 360 px | Logo 14 px, bouton Connexion 34 px, boutons icône 38 px, **libellés de la barre basse à 12 px** (11 px ≤ 340 px), FAB et menu toujours accessibles. |

Notes : la barre d'onglets conserve `overflow-x: auto` par sécurité, mais ne déborde plus à
320/360/390 px. Les libellés du menu FAB font 13 px et restent sur une seule ligne.

### Modes et plein écran carte

- `.map-floating-controls` : colonne de trois boutons **44 px** à `top: 110px` **dans
  `#map-points-slot`** (`position: relative`, hauteur de la carte seule) — Relief, Satellite,
  Plein écran (`#btnBaseRelief`, `#btnBaseSatellite`, `#btnMapFullscreen`). Les boutons sont
  8 px sous le zoom Leaflet (44 px chacun). `.map-float-btn.active` = fond `--color-primary`,
  texte blanc. Icônes **Lucide** : `map`, `satellite`, `maximize` (puis `minimize` en plein
  écran) ; le verrou `#btnLock` utilise `lock` / `unlock` (`inline-flex` centré,
  `svg { display: block; pointer-events: none }`).
- `.map-gps-control` (Leaflet `bottomleft`) : recentrer `⌖` et suivi `➤`, 44 px. Si la carte
  mesure moins de 430 px de haut (paysage), `ensureGpsControlPosition()` le bascule en
  `bottomright` : les deux icônes restent accessibles sans croiser la colonne zoom + contrôles.
- `body.map-ui-fullscreen` : `#tab-points` passe en `position: fixed; inset: 0;
  width: 100vw; height: 100dvh; z-index: 900`. Sont masqués en `display: none !important` +
  `visibility: hidden` : `header`, `.header-top-row`, `.header-bottom-row`,
  `#btnConnectionSettings`, `#btnTheme`, `#btnBle`, `#headerGpsStatus`, `#headerMenu`,
  `#headerMenuOverlay`, `.tabs-wrapper` et le tiroir (idem `body.camera-ui-fullscreen` dans
  `theme.css`). Le FAB et les contrôles de carte restent visibles ; le bouton plein écran
  affiche l'icône Lucide `minimize`.
- La cible `#map-crosshair` n'est visible que lorsqu'un mode de tracé est actif
  (`APP.currentTraceMode` non nul), sur l'onglet TRACÉS.
- La popup d'une zone (`.leaflet-popup-content .popup-actions`) expose l'icône crayon +
  « Renommer » et l'icône corbeille (`renameZone()`, `deleteZone()`) ; le nom personnalisé est
  affiché par `getZoneDisplayName()` (stocké dans `project.zoneNames`).
- `.leaflet-popup-content .popup-btn` est en `inline-flex` (gap 4 px) pour aligner l'icône SVG
  et le libellé ; `svg { pointer-events: none }` pour que le clic atteigne toujours le bouton.

### FAB de tracé et FAB caméra

- `.trace-fab` : conteneur **`position: fixed`**, centré en bas (`left: 50%`,
  `transform: translateX(-50%)`, `bottom: calc(80px + env(safe-area-inset-bottom, 0px))`,
  `z-index: 1002`), masqué avec `[hidden]` tant qu'aucune parcelle n'est sélectionnée ou
  hors TRACÉS. Il contient `#traceFabMenu`, `#traceFabSecondary` et `#traceFabMain`.
  `#traceFabSecondary` est en position absolue à gauche (`right: calc(100% + 10px)`) afin
  de laisser le bouton principal exactement centré.
- `.trace-fab-main` : cercle de **56 px**, fond neutre `--color-bg-muted`, texte `--text`,
  ombre `--shadow-lg`. Les variantes `.tonte`, `.interdit`, `.obstacle` prennent
  `--color-primary-light`, `--color-danger` et `--color-warning` (`--color-warning-text`
  pour l'icône sur ambre), avec texte blanc sauf obstacle.
- `.trace-fab-secondary` : cercle de **48 px** à gauche du FAB, « ✓ », fond
  `--color-white`, bordure `--border`, ombre `--shadow-md` ; masqué sans mode actif.
- `.trace-fab-menu` : panneau vertical au-dessus du FAB (`left: 50%`,
  `transform: translateX(-50%)`, `bottom: calc(100% + 12px)`), fond `--color-white`,
  rayon `--radius-lg`, ombre `--shadow-xl`, largeur minimale 232 px ; options
  `.trace-fab-item` de 48 px avec icône et libellé. Survol vert / rouge / ambre selon le type.
- `.trace-fab-item-icon` : conteneur de 18 px avec **SVG Lucide** — pastille pleine `<circle>`
  pour les types de tracé (couleur portée par `.tonte` / `.interdit` / `.obstacle`), et icônes
  en trait pour les actions (`map-pin` pour la parcelle, `crosshair` pour la cible,
  `ruler` pour la mesure), toujours en `stroke: currentColor`.
- Appui long (550 ms) sur le FAB ou sur l'icône `check` : ouverture du menu. Le clic court du
  FAB ajoute un point (ou ouvre le menu obstacle) ; le clic court de `check` termine la zone.
- **1re option** « Parcelle : <nom> » (icône `map-pin`, `openProjectDrawer()`) : elle ouvre le
  tiroir des parcelles, avant les trois options de tracé. Le menu ne contient **que** les
  tracés et la parcelle ; l'accès aux points se fait par l'onglet HISTORIQUE de la navigation
  basse. Le bouton principal porte l'icône Lucide `plus` (26 px) et le secondaire `check`
  (24 px) ; sans parcelle, le FAB reste visible et son clic ouvre le tiroir.
- Responsive ≤ 480 px : FAB conservé centré avec `bottom: 80px`, menu min-width 220 px.
- Thème nuit : FAB neutre et bouton secondaire passent en surfaces sombres avec accents
  verts ; les fonds pâles des options sont remplacés par `--color-bg-subtle`.
- **FAB CAMÉRA** (`#cameraFab`, même composant `.trace-fab`) : menu « Rejoindre un point »
  (icône `crosshair`) / « Mesurer une distance » (icône `ruler`), variantes
  `.trace-fab-main.target` (`--color-primary-light`) et `.distance` (`--color-teal`) ;
  `syncCameraFabUI()` injecte `ICON_CROSSHAIR` / `ICON_RULER` (26 px) dans le bouton principal,
  « ＋ » au repos. En mode actif, le clic principal
  ouvre le sélecteur de cible ou relance la mesure, « ✓ » quitte le mode et l'appui long
  rouvre le menu. Masqué hors onglet CAMÉRA par `syncCameraFabUI()`.
  Le sélecteur de cible (`#targetSelect`) ne liste **que les points de type `obstacle`**,
  seuls lieux physiques à rejoindre.
- **HUD caméra** : `.camera-hud` est une surimpression absolue (`inset: 0`, `z-index: 60`,
  `pointer-events: none`) qui ne consomme aucune hauteur. Elle contient la pastille cible
  `.camera-hud-chip`, les coordonnées/réglages `.camera-hud-settings` et le bouton plein
  écran. Le conteneur vidéo occupe toute la hauteur restante (`flex: 1 1 auto`).

### Indicateur de type de tracé

- Il n'y a plus de badge flottant ni de bandeau « MODE MANUEL » : le type actif est porté par
  la couleur et le titre du FAB, le bouton « ✓ » et la cible `#map-crosshair`.

### Cartes et listes

- `.prec-card`, `.data-card`, `.card-full`, `.point-item`, `.stat-card`, `.session-item` :
  fond `--color-white`, rayon `--radius-xl`, ombre `--shadow-sm`.
- `.data-card` (onglet RELEVÉ) : rayon `--radius-lg`, padding 12 px, sans bordure gauche ;
  toutes les valeurs (surface, temps, linéaire, périmètre, zones) sont **uniformes :
  24 px / 800 en `--color-primary-deep`** (override `--color-primary-light` en nuit).
- `.data-card-primary` : bloc pleine largeur (Surface à tondre), mêmes valeurs 24 px / 800,
  labels 10 px (9 px pour les secondaires).
- `.badge-rtk/float/dgps/gps/none` : badges de fix.
- `.point-dot` : pastille de type (`tonte`, `interdit`, `obstacle`).
- **Onglet HISTORIQUE** : `.history-screen` (padding 12 px) contient deux `.history-section`
  (marge basse 18 px) :
  1. `#pointsSection` — en-tête `.points-section-head` (titre + `#btnTransfer`),
     `.points-view-meta` (`#zoneBadge`, `#pointCount`), `#pointsList` dans `.points-view-body`
     (plus de hauteur contrainte : c'est `.screen` qui défile) et `.points-view-actions` en
     grille 2 × 2 (GeoJSON, CSV, GPX, Effacer) ;
  2. liste « PARCELLES / SESSIONS » (`#historyList`).
  L'ancien panneau `#pointsViewOverlay` (`.points-view-box`, `.points-view-head`,
  `.points-view-title`, `.points-view-close`) a été supprimé en 3.45 ; les boutons d'action
  conservent leur `focus-visible` vert.
- `.btn-edit` / `.btn-del` : boutons ronds de 44 px de la liste POINTS (renommer / supprimer),
  icônes SVG Lucide crayon / corbeille (18 px, `stroke: currentColor`).
- `.leaflet-popup-content .popup-btn` : actions compactes de la popup carte (renommer /
  supprimer), couleurs `--color-primary` et `--color-danger`, fond pâle au survol.
- `.zone-badge` : badge « Zone #N » de l'onglet TRACÉS (fond pâle, bordure verte, override nuit).
- `.zone-label` : médaillon circulaire `ZN` centré sur chaque polygone de tonte.
- `.leaflet-measure-path-measurement` : longueurs de segments affichées sur les polygones de
  tonte par `leaflet-measure-path` (11 px / 800, `--font` ; halo blanc/texte noir du plugin,
  lisible en thème clair et nuit).
- `#map-crosshair` : cible fixe de 64 px centrée sur `.map-wrapper` (`position: absolute`,
  `translate(-50%, -50%)`, `pointer-events: none`, `z-index: 1000`), `stroke`/`fill`
  `--color-crosshair` ; elle reste immobile quand la carte se déplace.

## Règles

1. Ne jamais coder une couleur en dur dans un composant : utiliser un token ou une variable RTK.
   Exception documentée : `color: white` sur fond vert (le token `--color-white` devient une
   surface sombre en thème nuit).
2. Un nouveau composant doit être ajouté dans `components.css` (ou `main.css` s'il est
   structurel), avec une section commentée.
3. Toute nouvelle teinte doit être ajoutée comme variable, pas répétée dans les règles.
4. Vérifier systématiquement le rendu en clair **et** en sombre.
5. Ne pas modifier l'ordre des feuilles de style : `design-tokens.css` doit rester en premier.
