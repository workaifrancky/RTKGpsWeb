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
| 1 | `domaine` | `Polygon` | ≥ 3 points uniques |
| 2 | `zone` (× N) | `Polygon` | ≥ 3 points `tonte` par `zoneId` |
| 3 | `zone_interdite` | `Polygon` | ≥ 3 points `interdit` par `zoneId` |
| 4 | `obstacle` (× N) | `Point` | 1 feature par point `obstacle` |

Les zones de tonte sont triées par `zone_id` croissant.

## 1. Domaine

Enveloppe convexe (**Andrew's monotone chain**) de tous les points du projet.
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

## 2. Zones de tonte

Une Feature `zone` est produite **par `zoneId`** (plusieurs zones de tonte possibles dans une
même parcelle). Les points d'une zone sont utilisés **dans leur ordre d'enregistrement**, puis
le premier point est répété pour fermer l'anneau. Les zones sont triées par `zone_id` croissant.

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
    "name": "Jardin Nord - Zone 1",
    "surface_m2": 352.4,
    "zone_id": 1,
    "source": "rtk-mower"
  }
}
```

Une zone dont le nombre de points est inférieur à 3 n'est pas exportée.

## 3. Zones interdites

Une Feature `zone_interdite` est produite **par `zoneId`** (plusieurs zones interdites possibles
dans une même parcelle). Les points d'une zone sont utilisés dans leur ordre d'enregistrement,
puis le premier point est répété pour fermer l'anneau. Les zones sont triées par `zone_id`
croissant ; une zone de moins de 3 points n'est pas exportée.

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
    "zone_id": 1,
    "source": "rtk-mower"
  }
}
```

- `zone_id` : identifiant de la zone interdite (1, 2, …).
- `name` : `Zone interdite` pour la zone 1, `Zone interdite #N` au-delà (compatibilité avec
  les exports mono-zone existants).
- `surface_m2` : estimation planaire en mètres carrés (`calculateArea()`), suffisante pour
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
    "name": "Arbre du fond",
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

- `name` : nom personnalisé du point (`point.name`, saisi avec `✏️`), sinon `categorie`.
- `categorie` : `subtype` du point, sinon `"Autre"`.
- `rayon` : rayon de sécurité en mètres (constante `1.0`).
- `index` : numérotation de l'obstacle dans la parcelle.

## Règles à ne pas casser

1. Ne pas renommer les `properties.type` (`domaine`, `zone`, `zone_interdite`, `obstacle`).
2. Ne jamais inverser les coordonnées : toujours `[lon, lat]`.
3. Toujours fermer les anneaux de polygones.
4. Conserver l'ordre des features (domaine en premier, zones par `zone_id` croissant).
5. Conserver `source: 'rtk-mower'` sur toutes les features.
6. Conserver `zone_id` sur chaque Feature `zone` et `zone_interdite`, et ne pas fusionner les
   zones.
7. Aucune Feature `base` : la fonction « base du rover » est supprimée de l'application.

## Liste de contrôle avant livraison

- [ ] Le fichier se parse sans erreur (`JSON.parse`).
- [ ] Le nom respecte `RTK_<projet>_<date>.geojson`.
- [ ] L'ordre des types est conforme (une Feature `zone` par `zoneId`).
- [ ] `zone_id` et le nom `« <projet> - Zone N »` sont corrects.
- [ ] Les polygones sont fermés et en `[lon, lat]`.
- [ ] Les `surface_m2` sont numériques et > 0.
- [ ] Chaque obstacle possède un `properties.name` (nom personnalisé ou catégorie).
- [ ] Aucune Feature `base` n'est présente.
