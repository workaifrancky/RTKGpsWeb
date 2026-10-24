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
| `--color-primary` | `#2e7d32` | Boutons principaux, header, base du rover |
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

### Modales (`main.css`)

- `.modal-overlay` : fond `rgba(0,0,0,0.5)`, `opacity: 0` → `.show` pour l'ouverture.
- `.modal-box` : fond `--color-white`, rayon 10 px, padding 16 px, `--shadow-xl`, max 480 px.
- `.modal-title` : 18 px, 700, `--color-primary-deep`.
- `.modal-handle` : poignée grise centrée.

### Barre terrain

- `.terrain-btn-circle` : 64 px, `border-radius: 50%`, bordure blanche translucide.
- Couleurs : tonte `--color-primary-light`, interdit `--color-danger`, obstacle `--color-warning`,
  base `--color-primary`, nouvelle zone `--color-teal`.
- Classe `.disabled` : opacité 0.35 (gérée par `updateTerrainButtons()`).
- Responsive : 56 px sous 360 px de large.

### Cartes et listes

- `.prec-card`, `.data-card`, `.card-full`, `.point-item`, `.stat-card`, `.session-item` :
  fond `--color-white`, rayon `--radius-xl`, ombre `--shadow-sm`.
- `.data-card` (données GPS) : rayon `--radius-lg`, padding 12 px, sans bordure gauche ;
  toutes les valeurs (Lat/Lon, altitude, satellites, HDOP, vitesse) sont **uniformes :
  24 px / 800 en `--color-primary-deep`** (override `--color-primary-light` en nuit).
- `.data-card-primary` : bloc Position pleine largeur (Latitude + Longitude côte à côte),
  mêmes valeurs 24 px / 800, labels 10 px (9 px pour les secondaires).
- `.badge-rtk/float/dgps/gps/none` : badges de fix.
- `.point-dot` : pastille de type (`tonte`, `interdit`, `obstacle`, `base`).
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
