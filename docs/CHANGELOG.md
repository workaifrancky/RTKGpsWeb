# Journal des modifications — RTK Mower

Historique des évolutions notables de l'application. Format inspiré de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ; dates au format ISO
(`AAAA-MM-JJ`), entrées les plus récentes en premier.

## [2026-11-04] — Nettoyage des fichiers de test obsolètes

### Supprimé

- `header-test.html` : prototype du header (remplacé par le header intégré dans `index.html`).
- `menu-test.html` : prototype du menu (cassé depuis la refonte du header, non maintenu).
- `assets/logo-rtk-mower_ancien.svg` : ancien logo vectoriel (remplacé par `logo-rtk-mower.svg` et `logo-rtk-mower_tablette.svg`).

### Conservé (pour Mower Planner)

- `splash-test.html` : prototype du splash animé (rover qui tond), en attente d'intégration dans Mower Planner.
- `assets/Rover_original.svg`, `assets/Herbe haute_original.svg`, `assets/Herbe basse_original.svg` : sources SVG de l'animation.

## [2026-11-04] — Écran d'accueil statique (RTK Mower)

### Modifié

- Suppression de l'overlay splash animé (`#splash-screen`, `js/splash.js`, section CSS `SPLASH SCREEN`).
- Ajout d'un écran d'accueil statique `#welcome-screen` : titre "RTK MOWER / RELEVÉ GPS RTK", empreinte digitale dans un cercle, texte "Appuyer pour continuer", logo `logo-rtk-mower_tablette.svg` en bas.
- Au clic sur l'empreinte : fermeture en fondu (0,3 s) et activation de l'onglet "Tracés" (`showTab('tab-points')`).
- Nouveau script `js/welcome.js` (chargé après `js/app.js`).
- `index.html` : −61 Ko (suppression des 3 tracés SVG d'herbe/rover).

### Notes

- Le splash animé (rover qui tond) est réservé à **Mower Planner** (tablette, mode paysage), à intégrer plus tard. Le prototype `splash-test.html` reste dans le dépôt comme référence.
- `menu-test.html` contient encore un `#splashScreen`/`.splash-logo` orphelin (page de démo à aligner).
- `assets/logo-rtk-mower_ancien.svg` supprimé, `assets/logo-rtk-mower_tablette.svg` ajouté (renommage manuel).

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
