// ============================================================
// export.js — Export CSV, GPX, GeoJSON v2
// RTKGpsWeb v2
// ============================================================

function exportCSV() {
  const pts = getPoints();
  if (pts.length===0) { showToast('Aucun point à exporter','error'); return; }
  const proj = getCurrentProjectData();
  const headers = 'Point,Type,SousType,Latitude,Longitude,Altitude,Fix,Satellites,HDOP,Horodatage\n';
  const rows = pts.map(p =>
    `${p.index},${p.type},${p.subtype||''},${p.lat},${p.lon},${p.alt||''},${p.fix},${p.satellites||''},${p.hdop||''},${p.timestamp}`
  ).join('\n');
  downloadFile(headers+rows, `RTK_${proj?.name||'export'}_${dateTag()}.csv`, 'text/csv');
  showToast(`✅ CSV exporté — ${pts.length} points`,'info');
}

function exportGPX() {
  const pts = getPoints();
  if (pts.length===0) { showToast('Aucun point à exporter','error'); return; }
  const proj = getCurrentProjectData();
  const wpts = pts.map(p=>`
  <wpt lat="${p.lat}" lon="${p.lon}">
    <ele>${p.alt||0}</ele><time>${p.timestamp}</time>
    <name>${p.type} #${p.index}</name>
    <desc>Fix:${p.fix} Sat:${p.satellites} HDOP:${p.hdop} Type:${p.subtype||p.type}</desc>
  </wpt>`).join('');
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RTKGpsApp">
  <metadata><name>${proj?.name||'RTK'} ${dateTag()}</name></metadata>
  ${wpts}
</gpx>`;
  downloadFile(gpx, `RTK_${proj?.name||'export'}_${dateTag()}.gpx`, 'application/gpx+xml');
  showToast('✅ GPX exporté','info');
}

// ─── ENVELOPPE CONVEXE (Andrew's monotone chain) ─────────────
// Retourne [[lon, lat], ...] fermé (1re = dernière) ou null si
// moins de 3 points uniques / tous alignés.
function calculateConvexHull(points) {
  if (!Array.isArray(points)) return null;

  // Dédoublonnage + conversion directe en [lon, lat] (ordre GeoJSON)
  const unique = new Map();
  points.forEach(p => {
    const lat = Number(p?.lat);
    const lon = Number(p?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    unique.set(`${lat},${lon}`, [lon, lat]);
  });

  const sorted = [...unique.values()].sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  if (sorted.length < 3) return null;

  // Produit vectoriel : > 0 = virage antihoraire
  const cross = (o, a, b) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  // Chaîne inférieure
  const lower = [];
  for (const c of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], c) <= 0) lower.pop();
    lower.push(c);
  }

  // Chaîne supérieure
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const c = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], c) <= 0) upper.pop();
    upper.push(c);
  }

  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);
  if (hull.length < 3) return null;

  hull.push([hull[0][0], hull[0][1]]); // fermeture du polygone
  return hull;
}

function getExportMetadata(points, project) {
  // Première capture = timestamp le plus ancien (et non la date d'export).
  const first = points.reduce((min, p) => {
    const time = p && p.timestamp ? Date.parse(p.timestamp) : NaN;
    if (!Number.isFinite(time)) return min;
    return !min || time < min.time ? { time, iso: p.timestamp } : min;
  }, null);

  return {
    date_creation: first?.iso || project?.createdAt || new Date().toISOString(),
    version_app: (typeof APP !== 'undefined' && APP.version) ? APP.version : '2.0.0',
    source: 'rtk-mower',
  };
}

function buildGeoJSON() {
  const pts = getPoints();
  if (pts.length===0) return null;
  const proj = getCurrentProjectData();
  const projectName = proj?.name || 'export';
  const metadata = getExportMetadata(pts, proj);

  const tonte    = pts.filter(p => p.type === 'tonte');
  const interdit = pts.filter(p => p.type === 'interdit');
  const obstacles= pts.filter(p => p.type === 'obstacle');

  const features = [];

  // 1 ── Domaine : enveloppe convexe de tous les points du projet
  const hull = calculateConvexHull(pts);
  if (hull) {
    features.push({
      type:'Feature',
      geometry:{ type:'Polygon', coordinates:[hull] },
      properties:{
        type:'domaine',
        name:projectName,
        created_at:proj?.createdAt || null,
        ...metadata,
      },
    });
  }

  // 2 ── Zones de tonte (une Feature par zoneId)
  const tonteZones = {};
  tonte.forEach(p => {
    const zid = Number(p.zoneId);
    const zoneId = Number.isInteger(zid) && zid > 0 ? zid : 1;
    if (!tonteZones[zoneId]) tonteZones[zoneId] = [];
    tonteZones[zoneId].push(p);
  });

  Object.keys(tonteZones).map(Number).sort((a, b) => a - b).forEach(zoneId => {
    const zonePts = tonteZones[zoneId];
    if (zonePts.length < 3) return;
    const coords = [...zonePts.map(p=>[p.lon,p.lat]), [zonePts[0].lon, zonePts[0].lat]];
    features.push({
      type:'Feature',
      geometry:{ type:'Polygon', coordinates:[coords] },
      properties:{
        type:'zone',
        name:`${projectName} - Zone ${zoneId}`,
        surface_m2:calculateArea(zonePts),
        zone_id:zoneId,
        ...metadata,
      },
    });
  });

  // 3 ── Zones interdites (une Feature par zoneId)
  const interditZones = typeof getInterditZones === 'function' ? getInterditZones() : { 1: interdit };
  Object.keys(interditZones).map(Number).sort((a, b) => a - b).forEach(zoneId => {
    const zonePts = interditZones[zoneId] || [];
    if (zonePts.length < 3) return;
    const coords = [...zonePts.map(p=>[p.lon,p.lat]), [zonePts[0].lon, zonePts[0].lat]];
    features.push({
      type:'Feature',
      geometry:{ type:'Polygon', coordinates:[coords] },
      properties:{
        type:'zone_interdite',
        name: zoneId === 1 ? 'Zone interdite' : `Zone interdite #${zoneId}`,
        surface_m2:calculateArea(zonePts),
        zone_id:zoneId,
        ...metadata,
      },
    });
  });

  // 4 ── Obstacles isolés (1 Point par obstacle)
  obstacles.forEach(p => {
    features.push({
      type:'Feature',
      geometry:{ type:'Point', coordinates:[p.lon, p.lat, p.alt || 0] },
      properties:{
        type:'obstacle',
        name:p.name || p.subtype || 'Autre',
        categorie:p.subtype || 'Autre',
        rayon:1.0,
        index:p.index,
        fix:p.fix,
        satellites:p.satellites,
        hdop:p.hdop,
        timestamp:p.timestamp,
        ...metadata,
      },
    });
  });

  const geojson = { type:'FeatureCollection', features };
  return {
    geojson,
    filename: `RTK_${projectName}_${dateTag()}.geojson`,
    projectName,
  };
}

function exportGeoJSON() {
  const payload = buildGeoJSON();
  if (!payload) { showToast('Aucun point à exporter','error'); return; }

  downloadFile(
    JSON.stringify(payload.geojson, null, 2),
    payload.filename,
    'application/json',
  );
  showToast(`✅ GeoJSON exporté — ${payload.geojson.features.length} feature(s)`,'info');
}

async function shareGeoJSON() {
  const payload = buildGeoJSON();
  if (!payload) { showToast('Aucun point à partager','error'); return; }

  if (typeof navigator === 'undefined'
      || typeof navigator.share !== 'function'
      || typeof File !== 'function') {
    showToast('Partage non supporté sur ce navigateur','error');
    return;
  }

  const file = new File(
    [JSON.stringify(payload.geojson, null, 2)],
    payload.filename,
    { type: 'application/geo+json' },
  );

  let filesSupported = true;
  if (typeof navigator.canShare === 'function') {
    try { filesSupported = navigator.canShare({ files: [file] }); }
    catch { filesSupported = false; }
  }
  if (!filesSupported) {
    showToast('Partage non supporté sur ce navigateur','error');
    return;
  }

  try {
    await navigator.share({
      title: `GeoJSON — ${payload.projectName}`,
      text:  `Export RTK Mower — ${payload.projectName}`,
      files: [file],
    });
    showToast('✅ GeoJSON partagé','info');
  } catch (error) {
    if (error && error.name === 'AbortError') return;   // partage annulé
    showToast('Partage indisponible sur ce navigateur','error');
  }
}

// ─── MENU D'EXPORT SECONDAIRE (CSV / GPX) ───────────────────
function toggleExportMenu(event) {
  if (event) event.stopPropagation();
  const list = document.getElementById('exportMenu');
  const btn  = document.getElementById('btnExportMenu');
  if (!list) return;

  const willShow = !list.classList.contains('show');
  list.classList.toggle('show', willShow);
  if (btn) btn.setAttribute('aria-expanded', willShow ? 'true' : 'false');
}

function closeExportMenu() {
  const list = document.getElementById('exportMenu');
  const btn  = document.getElementById('btnExportMenu');
  if (!list) return;

  list.classList.remove('show');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

document.addEventListener('DOMContentLoaded', () => {
  // Ferme le menu au clic extérieur et avec Échap.
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('.export-menu')) return;
    closeExportMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeExportMenu();
  });
});

function downloadFile(content, filename, mime) {
  const blob = new Blob([content],{type:mime});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function dateTag() { return new Date().toISOString().slice(0,10); }
