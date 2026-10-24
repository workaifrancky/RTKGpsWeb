# Outils de simulation

> **État en production : DÉSACTIVÉS.**
> L'application est prête pour les tests terrain : aucun bouton de simulation n'est visible et
> les fonctions concernées sont neutralisées par le flag `ENABLE_SIMULATION`.

## 1. Ce qui a été désactivé

| Élément | État |
|---|---|
| Bouton `🎮 Mode Simulation` (onglet DONNÉES) | supprimé de `index.html` |
| Bouton `📡 Simuler une trame GPS` (onglet DONNÉES) | supprimé de `index.html` |
| `generateSimulationData()` | retourne `null` + `console.warn` si le flag est `false` |
| `simulateGpsFrame()` | retourne `null` + `console.warn` si le flag est `false` |
| `simulateGpsAt(lat, lon, course, fix)` | retourne `null` + `console.warn` si le flag est `false` |

Le fichier `js/simulation.js` reste chargé par `index.html` (ordre des scripts inchangé) : il ne
produit aucun effet tant que le flag est à `false`. Aucune donnée n'est écrite dans
`localStorage`, aucune trame n'est injectée dans `updateUI()` ni dans la caméra.

Les styles `.action-button-simulation` et `.action-button-simulation-gps` sont conservés dans
`css/components.css` pour ne pas casser une réactivation future ; ils ne sont simplement plus
utilisés par l'interface.

## 2. Réactiver les outils

### Étape 1 — Activer le flag

Dans `js/simulation.js`, en tête de fichier :

```js
const ENABLE_SIMULATION = true;
```

### Étape 2 — Restaurer les boutons

Dans `index.html`, onglet DONNÉES, juste après le bouton `#btnToggleDataDetails` et à la place
du commentaire « Outils de simulation retirés de l'interface terrain » :

```html
<!-- Mode simulation (visible sans BLE) -->
<button class="action-button-simulation" onclick="generateSimulationData()"
  title="Générer un jeu de données fictif pour tester sans GPS">🎮 Mode Simulation</button>

<button class="action-button-simulation-gps" onclick="simulateGpsFrame()"
  title="Injecter une trame GPS fictive dans l'onglet DONNÉES">📡 Simuler une trame GPS</button>
```

### Étape 3 — Recharger sans cache

`serve-http.cjs` envoie `Cache-Control: no-store` : un simple rechargement de page suffit.
En cas de doute, fermer l'onglet et rouvrir <http://127.0.0.1:8000/>.

## 3. Utilisation

- `generateSimulationData()` — crée (ou réutilise) la parcelle **`Simulation`** et injecte
  14 points fictifs : 2 zones de tonte de 4 points, 3 points interdits et 3 obstacles.
  La parcelle est vidée puis reconstruite à chaque appel.
- `simulateGpsFrame()` — injecte une trame GPS fixe (`44.832223 / -0.701992`, RTK Fix, cap 45°)
  dans le même pipeline que le BLE (`parseGpsFrame()` → `updateUI()`).
- `simulateGpsAt(lat, lon, course, fix)` — variante positionnée, appelable uniquement depuis la
  console du navigateur (aucun bouton) :

```js
simulateGpsAt(44.832500, -0.701500, 90, 'RTK Fix'); // 90° = cap est
```

## 4. Nettoyage après un test

La simulation écrit dans le `localStorage` réel de l'application :

- la parcelle `Simulation` reste dans la liste `PARCELLE` et dans l'historique ;
- elle apparaît dans les exports (`CSV`, `GPX`, `GeoJSON`) si elle est sélectionnée.

Après un test, supprimer la parcelle `Simulation` depuis l'onglet **HISTORIQUE**, ou vider les
clés `rtkProjects` / `rtkCurrentProject` du `localStorage` pour repartir d'une base saine.
Ne jamais laisser un relevé terrain réel se mélanger aux points fictifs.

## 5. Rappel des limites

- La simulation ne teste ni le BLE, ni le NTRIP, ni la précision réelle du UM980 : elle ne
  valide que l'interface et le pipeline de parsing.
- Le cap simulé est statique (ou fourni à la main) : la boussole et la scène 3D de la caméra
  ne bougent donc pas comme sur le terrain.
