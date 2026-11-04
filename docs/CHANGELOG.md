# Journal des modifications — RTK Mower

Historique des évolutions notables de l'application. Format inspiré de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ; dates au format ISO
(`AAAA-MM-JJ`), entrées les plus récentes en premier.

## [2026-11-04] — Réexport vectoriel du logo

### Modifié

- `assets/logo-rtk-mower.svg` : nouveau logo vectoriel (1 path, 26 278 car., SHA-256 `4B5C8E…010E`, viewBox `0 0 3524 500`). Remplace la version précédente (1 path, 38 020 car., SHA-256 `9E8A1081…79FE43`) qui était un SVG valide mais avec une syntaxe Inkscape plus ancienne.
- `index.html` : mise à jour du `<path>` dans `.header-logo-layer` (injecté par script, SHA-256 vérifié, géométrie identique).

### Notes

- `AGENTS.md §10` : bloc de vérification de référence mis à jour (regex robuste, valeurs 26 278 / `4B5C8E…010E`).
- `header-test.html` utilise encore l'ancien `<path>` en dur — sera aligné dans une passe ultérieure.
- Le logo reste `fill="currentColor"` (blanc sur fond vert, inversion en thème nuit).

## [2026-11-03] — Refonte du header et intégration

### Ajouté

- Logo vectoriel `assets/logo-rtk-mower.svg` (SVG unique de 38 020 caractères,
  `viewBox="0 0 3524 500"`).
- Page de test `header-test.html` pour valider le design avant intégration.
- Pastille FIX compacte (texte « FIX », libellé complet dans l'attribut `title`).

### Modifié

- `index.html` : nouveau bloc `<header>` (structure en couches absolues, hauteur 121 px,
  fond `--color-primary-deep`).
- `js/ui.js` : `updateFixBar()` et `setGpsStatusIdle()` n'écrasent plus le texte de la pastille,
  qui reste « FIX » (constante `GPS_PILL_LABEL` ; le détail passe par `title`).
- `css/main.css` : surcharge du header (`.header-logo-layer`, `.header-title`,
  `.header-bottom-band`, pastille `flex: 0 0 auto`), positionnement absolu de la roue dentée
  (`header #btnConnectionSettings`), suppression des sélecteurs `.header-top-row` /
  `.header-bottom-row`.
- `css/map.css` et `css/theme.css` : nettoyage des sélecteurs obsolètes `.header-top-row` /
  `.header-bottom-row` (masquage en plein écran carte et caméra) et suppression de l'override
  nuit codé en dur `[data-theme="dark"] header { background: #14532d }` (le token
  `--color-primary-deep` couvre les deux thèmes).

### À noter

- `menu-test.html` utilise encore l'ancienne structure de header (non aligné pour l'instant).
- Le header passe de **110 à 121 px** : les écrans de contenu perdent 11 px de hauteur utile
  (aucun ajustement nécessaire, `.app-wrapper` est en `100dvh` + `flex`).
- En thème nuit, le fond du header passe de `#14532d` à `#052e16` (`--color-primary-deep`),
  et en thème clair de `#2e7d32` à `#1b5e20`.
- Procédure de maintenance du logo (ne jamais recopier le `<path>` à la main) : `AGENTS.md` §10.
