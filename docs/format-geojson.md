# Format d'export GeoJSON — contrat Mower Planner

L'export GeoJSON est **contractuel** : il est consommé par Mower Planner. Les noms de types,
l'ordre des coordonnées et les propriétés ne doivent pas être modifiés sans mise à jour des
deux applications.

- Fichier : `RTK_<nom-du-projet>_<YYYY-MM-DD>.geojson` (ex. `RTK_Jardin Nord_2026-10-23.geojson`).
- Racine : `FeatureCollection`.
- CRS : WGS84 (EPSG:4326).
- Coordonnées : **`[longitude, latitude]`**, altitude optionnelle en 3ᵉ position.
- JSON indenté sur 2 espaces, encodage UTF-8.
- Chaque propriété contient `source: 'rtk-mower'`.

## Ordre des features

| # | `properties.type` | Géométrie | Condition |
|---|---|---|---|
| 1 | `domaine` | `Polygon` | ≥ 3 points uniques hors base |
| 2 | `zone` | `Polygon` | ≥ 3 points `tonte` |
| 3 | `zone_interdite` | `Polygon` | ≥ 3 points `interdit` |
| 4 | `obstacle` (× N) | `Point` | 1 feature par point `obstacle` |
| 5 | `base` | `Point` | 0 ou 1 (base unique) |

## 1. Domaine

Enveloppe convexe (**Andrew's monotone chain**) de tous les points du projet **sauf la base**.
Polygone fermé : la première coordonnée est répétée à la fin.

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [-0.7021, 44.8321],
      [-0.7018, 44.8322],
      [-0.7017, 44.8325],
      [-0.7021, 44.8325],
      [-0.7021, 44.8321]
    ]]
  },
  "properties": {
    "type": "domaine",
    "name": "Jardin Nord",
    "created_at": "2026-10-01T08:00:00.000Z",
    "source": "rtk-mower"
  }
}
```

- `name` = nom du projet.
- `created_at` = date de création du projet (ISO 8601) ou `null`.
- Aucun domaine n'est émis si moins de 3 points uniques (ou si tous sont alignés).

## 2. Zone de tonte

Les points `tonte` sont utilisés **dans leur ordre d'enregistrement**, puis le premier point
est répété pour fermer l'anneau.

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [-0.7020, 44.8320],
      [-0.7018, 44.8320],
      [-0.7018, 44.8322],
      [-0.7020, 44.8322],
      [-0.7020, 44.8320]
    ]]
  },
  "properties": {
    "type": "zone",
    "name": "Jardin Nord - Zone de tonte",
    "surface_m2": 352.4,
    "source": "rtk-mower"
  }
}
```

## 3. Zone interdite

Même principe avec les points `interdit`. Le modèle actuel ne gère **qu'une seule** zone
interdite par parcelle (tous les points `interdit` sont regroupés).

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [-0.70195, 44.83205],
      [-0.70190, 44.83205],
      [-0.70190, 44.83210],
      [-0.70195, 44.83205]
    ]]
  },
  "properties": {
    "type": "zone_interdite",
    "name": "Zone interdite",
    "surface_m2": 11.0,
    "source": "rtk-mower"
  }
}
```

`surface_m2` est une estimation planaire en mètres carrés (`calculateArea()`), suffisante pour
de petites parcelles.

## 4. Obstacles

Une feature `Point` par obstacle. La catégorie provient du sous-type saisi dans l'application.

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [-0.70185, 44.83210, 120.1]
  },
  "properties": {
    "type": "obstacle",
    "categorie": "Arbre",
    "rayon": 1.0,
    "index": 1,
    "fix": "RTK Fix",
    "satellites": 20,
    "hdop": 0.6,
    "timestamp": "2026-10-23T10:00:10.000Z",
    "source": "rtk-mower"
  }
}
```

- `categorie` : `subtype` du point, sinon `"Autre"`.
- `rayon` : rayon de sécurité en mètres (constante `1.0`).
- `index` : numérotation de l'obstacle dans la parcelle.

## 5. Base du rover

Position de référence unique par parcelle. Elle est **exclue** du domaine et des statistiques,
mais toujours exportée si elle existe.

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [-0.701992, 44.832223, 120]
  },
  "properties": {
    "type": "base",
    "name": "Base du rover",
    "timestamp": "2026-10-23T10:00:00.000Z",
    "source": "rtk-mower"
  }
}
```

## Règles à ne pas casser

1. Ne pas renommer les `properties.type` (`domaine`, `zone`, `zone_interdite`, `obstacle`, `base`).
2. Ne jamais inverser les coordonnées : toujours `[lon, lat]`.
3. Toujours fermer les anneaux de polygones.
4. Conserver l'ordre des features (domaine en premier, base en dernier).
5. Une seule feature `base` par export.
6. La base ne doit pas influencer le convex hull.
7. Conserver `source: 'rtk-mower'` sur toutes les features.

## Liste de contrôle avant livraison

- [ ] Le fichier se parse sans erreur (`JSON.parse`).
- [ ] Le nom respecte `RTK_<projet>_<date>.geojson`.
- [ ] L'ordre des types est conforme.
- [ ] Les polygones sont fermés et en `[lon, lat]`.
- [ ] Les `surface_m2` sont numériques et > 0.
- [ ] La base apparaît une seule fois et n'est pas dans le domaine.
