// ============================================================
// stats.js — Statistiques de session
// RTKGpsWeb
// Dépend de : points.js, map.js (calculateArea)
// ============================================================

// ─── CALCUL DES STATISTIQUES ─────────────────────────────────
function computeStats() {
  const pts = getPoints();

  if (pts.length === 0) {
    return {
      count:       0,
      distance:    0,
      area:        0,
      avgHdop:     null,
      avgSat:      null,
      bestFix:     'None',
      duration:    0,
    };
  }

  // Distance totale parcourue
  let totalDistance = 0;
  for (let i = 1; i < pts.length; i++) {
    totalDistance += haversine(
      pts[i - 1].lat, pts[i - 1].lon,
      pts[i].lat,     pts[i].lon
    );
  }

  // Moyennes qualité GPS
  const validHdop = pts.filter(p => p.hdop !== null);
  const validSat  = pts.filter(p => p.satellites !== null);

  const avgHdop = validHdop.length > 0
    ? validHdop.reduce((s, p) => s + p.hdop, 0) / validHdop.length
    : null;

  const avgSat = validSat.length > 0
    ? validSat.reduce((s, p) => s + p.satellites, 0) / validSat.length
    : null;

  // Meilleur fix de la session
  const bestFix = pts.reduce((best, p) => {
    return (p.fixQuality || 0) > (best.fixQuality || 0) ? p : best;
  }, pts[0]).fix;

  // Surface (si 3+ points)
  const area = pts.length >= 3 ? calculateArea(pts) : 0;

  // Durée de la session
  const first    = new Date(pts[0].timestamp);
  const last     = new Date(pts[pts.length - 1].timestamp);
  const duration = (last - first) / 1000; // en secondes

  return {
    count:    pts.length,
    distance: totalDistance,
    area,
    avgHdop,
    avgSat,
    bestFix,
    duration,
  };
}

// ─── DISTANCE ENTRE DEUX POINTS (formule Haversine) ──────────
function haversine(lat1, lon1, lat2, lon2) {
  const R    = 6371000; // Rayon Terre en mètres
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── MISE À JOUR DE L'AFFICHAGE ──────────────────────────────
function updateStatsDisplay() {
  const stats = computeStats();

  setHTML('statCount',    stats.count);
  setHTML('statDistance',
    stats.distance >= 1000
      ? `${(stats.distance / 1000).toFixed(3)} km`
      : `${stats.distance.toFixed(1)} m`
  );
  setHTML('statArea',
    stats.area > 0 ? formatArea(stats.area) : '—'
  );
  setHTML('statHdop',
    stats.avgHdop !== null ? fmt(stats.avgHdop, 2) : '—'
  );
  setHTML('statSat',
    stats.avgSat !== null ? Math.round(stats.avgSat) : '—'
  );
  setHTML('statBestFix',
    `<span class="fix-badge ${getFixClass(stats.bestFix)}">
      ${stats.bestFix}
    </span>`
  );
  setHTML('statDuration', formatDuration(stats.duration));
}

function formatDuration(seconds) {
  if (seconds < 60)   return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds/60)}min`;
  return `${Math.floor(seconds/3600)}h${Math.floor((seconds%3600)/60)}min`;
}