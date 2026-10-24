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
| `components.css` | Cartes, boutons, listes de points, barre terrain, mode simulation |
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
- `.action-button-simulation` : violet `#7c3aed`, pleine largeur, visible sans BLE.
  **Inutilisé** : les boutons de simulation sont retirés de l'interface terrain, la classe est
  conservée pour une réactivation (voir [simulation.md](simulation.md)).
- `.action-button-simulation-gps` : variante teal (`--color-teal`), injecte une trame GPS
  fictive dans l'onglet DONNÉES. **Inutilisé** pour la même raison.
- `.btn-action-bar` : conservé pour les boutons générés par `history.js` (style blanc bordé).

### Bandeau d'onglets « pills » (`main.css`, overrides dans `theme.css`)

Structure : un conteneur `.tabs-wrapper`, puis pour chaque onglet un
`<input type="radio" class="tab-input">` immédiatement suivi d'un
`<label class="tab-label">`. L'état actif est purement CSS (`:checked + .tab-label`), la
navigation reste assurée par `showTab()` (`js/app.js`), qui coche aussi le radio correspondant
(`#<tabId>-radio`) pour rester synchrone avec les appels programmatiques (`map.js`, `history.js`).

- `.tabs-wrapper` : fond `var(--color-bg-muted)`, `padding: 8px 10px`, `gap: 6px`, filet
  inférieur 2 px `var(--green-dark)`, une seule ligne (`overflow-x: auto`,
  `scrollbar-width: none`).
- `.tab-input` : `position: absolute`, `opacity: 0`, 1×1 px → invisible mais focusable
  (`:focus-visible + .tab-label` affiche un contour `--color-primary-accent`).
- `.tab-label` : pill (`border-radius: 999px`), `min-height: 44px`, padding `10px 16px`,
  12 px / 700, fond `var(--color-white)` (blanc en thème jour), texte `var(--green-dark)`,
  bordure `--border`, ombre `--shadow-sm`, transitions 0,18 s.
- `.tab-label:hover` : fond `--color-primary-pale-bg`, bordure `--color-primary-accent` ;
  `:active` : `scale(0.97)`.
- `.tab-input:checked + .tab-label` : fond `var(--green-main)` (`#2e7d32`), texte blanc,
  ombre `--shadow-md` (la pill active « ressort »).
- Thème nuit : pills inactives = fond `--color-white` (`#1a1d27`) + texte
  `--color-primary-accent` (`#4ade80`) ; pill active = fond `--color-primary-accent` + texte
  `--green-dark` (contraste 8,55:1). Filet inférieur `--color-primary-light`.
- ≤ 360 px : `gap: 5px`, `padding: 7px 8px`, labels en `9px 12px` / 11 px.
- Le bandeau est masqué en plein écran caméra
  (`body.camera-ui-fullscreen .tabs-wrapper`).

### Modales (`main.css`)

- `.modal-overlay` : fond `rgba(0,0,0,0.5)`, `opacity: 0` → `.show` pour l'ouverture.
- `.modal-box` : fond `--color-white`, rayon 10 px, padding 16 px, `--shadow-xl`, max 480 px.
- `.modal-title` : 18 px, 700, `--color-primary-deep`.
- `.modal-handle` : poignée grise centrée.

### Barre terrain

- `.terrain-btn-circle` : 64 px, `border-radius: 50%`, bouton « premium » :
  - **relief** : `box-shadow` double interne (filet clair en haut, ombre en bas) + ombre
    portée externe ;
  - **reflet** : `::before` (ellipse dégradée blanche, `opacity: 0.7`) en `pointer-events:
    none` et `z-index: 0`, l'icône étant en `z-index: 1` ;
  - **dégradé** : `background-image: linear-gradient(180deg, …)` sur la couleur de base
    (`background-color` par variante, pour ne pas écraser le dégradé) ;
  - **survol** (souris uniquement, `@media (hover: hover) and (pointer: fine)`) :
    `translateY(-2px) scale(1.06)` + halo ;
  - **clic** : `translateY(1px) scale(0.94)` + ombres internes inversées (enfoncement).
- `.terrain-btn-text` : libellé **à l'intérieur** des cercles Tonte / Interdit / Obstacle
  (10 px / 800, 9 px sous 360 px), en `currentColor` — donc blanc, ou
  `--color-warning-text` pour l'obstacle sur fond ambre — avec `pointer-events: none`.
  Ces trois boutons n'ont plus de libellé sous le cercle.
- `.terrain-btn-circle svg` : icône **SVG outline** conservée pour « Nouvelle zone »
  (`fill: none`, `stroke: currentColor`, `stroke-width: 1.8`, 30 px, 26 px sous 360 px).
  Ce bouton garde son libellé `.terrain-btn-label` **sous** le cercle.
- Alignement : `.terrain-btns` est en `align-items: flex-start` ; les quatre cercles partagent
  la même ligne haute et le libellé de « Nouvelle zone » ne décale pas les autres boutons.
- Couleurs : tonte `--color-primary-light`, interdit `--color-danger`, obstacle `--color-warning`,
  nouvelle zone `--color-teal`.
- Classe `.disabled` : opacité 0.35, `saturate(0.7)` (gérée par `updateTerrainButtons()`).
- Thème nuit : reflet atténué (`opacity: 0.45`), ombre noire renforcée, bordure à 0.22.
- Responsive : 56 px sous 360 px de large, icône 26 px, texte 9 px ; sous 340 px, cercles
  52 px, icône 24 px, texte 8 px, `gap: 4px` et padding latéral 8 px pour que les quatre
  boutons restent dans la barre.

### Cartes et listes

- `.prec-card`, `.data-card`, `.card-full`, `.point-item`, `.stat-card`, `.session-item` :
  fond `--color-white`, rayon `--radius-xl`, ombre `--shadow-sm`.
- `.data-card` (données GPS) : rayon `--radius-lg`, padding 12 px, sans bordure gauche ;
  toutes les valeurs (Lat/Lon, altitude, satellites, HDOP, vitesse) sont **uniformes :
  24 px / 800 en `--color-primary-deep`** (override `--color-primary-light` en nuit).
- `.data-card-primary` : bloc Position pleine largeur (Latitude + Longitude côte à côte),
  mêmes valeurs 24 px / 800, labels 10 px (9 px pour les secondaires).
- `.badge-rtk/float/dgps/gps/none` : badges de fix.
- `.point-dot` : pastille de type (`tonte`, `interdit`, `obstacle`).
- `.btn-edit` / `.btn-del` : boutons ronds de 30 px de la liste POINTS (renommer / supprimer).
- `.leaflet-popup-content .popup-btn` : actions compactes de la popup carte (renommer /
  supprimer), couleurs `--color-primary` et `--color-danger`, fond pâle au survol.
- `.zone-badge` : badge « Zone #N » de l'onglet POINTS (fond pâle, bordure verte, override nuit).
- `.zone-label` : médaillon circulaire `ZN` centré sur chaque polygone de tonte.

## Règles

1. Ne jamais coder une couleur en dur dans un composant : utiliser un token ou une variable RTK.
   Exception documentée : `color: white` sur fond vert (le token `--color-white` devient une
   surface sombre en thème nuit).
2. Un nouveau composant doit être ajouté dans `components.css` (ou `main.css` s'il est
   structurel), avec une section commentée.
3. Toute nouvelle teinte doit être ajoutée comme variable, pas répétée dans les règles.
4. Vérifier systématiquement le rendu en clair **et** en sombre.
5. Ne pas modifier l'ordre des feuilles de style : `design-tokens.css` doit rester en premier.
