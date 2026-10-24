// ============================================================
// stats.js — Statistiques de session v2
// RTKGpsWeb v2
// ============================================================

// Paramètres génériques pour un ordre de grandeur (préparation du travail) :
// largeur de coupe 1,0 m, sans recouvrement, vitesse moyenne 4,0 km/h.
const MOWING_WIDTH_M = 1.0;
const MOWING_OVERLAP_RATIO = 0.0; // On ne gère plus le recouvrement pour cette appli de collecte
const MOWING_SPEED_KMH = 4.0;
const MOWING_EFFECTIVE_WIDTH_M = MOWING_WIDTH_M * (1 - MOWING_OVERLAP_RATIO);

function computePolygonPerimeter(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += haversine(a.lat, a.lon, b.lat, b.lon);
  }
  return total;
}

function formatObstacleDetail(obstacles) {
  if (obstacles.length === 0) return '—';

  const counts = {};
  obstacles.forEach(p => {
    const label = p.subtype || 'Autre';
    counts[label] = (counts[label] || 0) + 1;
  });

  return Object.keys(counts)
    .map(label => `${counts[label]} × ${label}`)
    .join(' · ');
}

function formatLinear(meters) {
  if (!Number.isFinite(meters) || meters <= 0) return '—';
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(1)} m`;
}

function computeStats() {
  const pts = getPoints();
  if (pts.length === 0) {
    return {
      count:0, distance:0, area:0, avgHdop:null, avgSat:null, bestFix:'None',
      duration:0, tonte:0, interdit:0, obstacle:0,
      linear:0, estimatedSeconds:0, perimeter:0, interditArea:0, obstacleDetail:'—',
      zonesCount:0,
    };
  }

  const tonte    = pts.filter(p=>p.type==='tonte');
  const interdit = pts.filter(p=>p.type==='interdit');
  const obstacle = pts.filter(p=>p.type==='obstacle');

  let totalDistance = 0;
  for (let i=1; i<pts.length; i++) {
    totalDistance += haversine(pts[i-1].lat, pts[i-1].lon, pts[i].lat, pts[i].lon);
  }

  const validHdop = pts.filter(p=>p.hdop!==null);
  const validSat  = pts.filter(p=>p.satellites!==null);
  const avgHdop   = validHdop.length>0 ? validHdop.reduce((s,p)=>s+p.hdop,0)/validHdop.length : null;
  const avgSat    = validSat.length>0  ? Math.round(validSat.reduce((s,p)=>s+p.satellites,0)/validSat.length) : null;
  const bestFix   = pts.reduce((best,p)=>(p.fixScore||0)>(best.fixScore||0)?p:best, pts[0]).fix;
  const first     = new Date(pts[0].timestamp);
  const last      = new Date(pts[pts.length-1].timestamp);
  const duration  = (last-first)/1000;

  // Surface et périmètre : somme des zones de tonte (jamais de fusion).
  const zones = getZones();
  let area = 0;
  let perimeter = 0;
  let zonesCount = 0;
  Object.keys(zones).map(Number).sort((a,b)=>a-b).forEach(zoneId => {
    const zonePts = zones[zoneId];
    if (zonePts.length < 3) return;
    zonesCount += 1;
    area      += calculateArea(zonePts);
    perimeter += computePolygonPerimeter(zonePts);
  });

  const interditArea = interdit.length >= 3 ? calculateArea(interdit) : 0;

  // Estimations du relevé : linéaire = surface / largeur utile, temps = linéaire / vitesse.
  const linear = area > 0 ? area / MOWING_EFFECTIVE_WIDTH_M : 0;
  const estimatedSeconds = linear > 0 ? linear / (MOWING_SPEED_KMH * 1000 / 3600) : 0;

  return {
    count:pts.length, distance:totalDistance, area, avgHdop, avgSat, bestFix, duration,
    tonte:tonte.length, interdit:interdit.length, obstacle:obstacle.length,
    linear, estimatedSeconds, perimeter, interditArea,
    obstacleDetail: formatObstacleDetail(obstacle), zonesCount,
  };
}

function updateStatsDisplay() {
  const s = computeStats();
  // L'unité m² est portée par le HTML (.data-unit) : ne pas la répéter ici.
  setHTML('statArea',      s.area>0 ? fmt(s.area, 1) : '—');
  setHTML('statTime',      formatDuration(s.estimatedSeconds));
  setHTML('statLinear',    formatLinear(s.linear));
  setHTML('statPerimeter', formatLinear(s.perimeter));
  setHTML('statZonesCount', s.zonesCount > 0 ? s.zonesCount : '—');
  setHTML('statObstacle',  s.obstacle);
  setHTML('statObstacleDetail', s.obstacleDetail);
  setHTML('statInterdit',  s.interdit);
  setHTML('statInterditSurface', s.interditArea>0 ? formatArea(s.interditArea) : '—');
  setHTML('statDuration',  formatDuration(s.duration));
  const meta = getFixMeta(s.bestFix);
  setHTML('statBestFix',  `<span class="${meta.cssClass}" style="font-weight:800">${s.bestFix}</span>`);
}

function setHTML(id,html){const el=document.getElementById(id);if(el)el.innerHTML=html;}
