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

function exportGeoJSON() {
  const pts = getPoints();
  if (pts.length===0) { showToast('Aucun point à exporter','error'); return; }
  const proj = getCurrentProjectData();
  const projectName = proj?.name || 'export';

  const tonte    = pts.filter(p => p.type === 'tonte');
  const interdit = pts.filter(p => p.type === 'interdit');
  const obstacles= pts.filter(p => p.type === 'obstacle');

  const features = [];

  // 1 ── Domaine : enveloppe convexe des points du projet (base exclue)
  const allPoints = pts.filter(p => p.type !== 'base');
  const hull = calculateConvexHull(allPoints);
  if (hull) {
    features.push({
      type:'Feature',
      geometry:{ type:'Polygon', coordinates:[hull] },
      properties:{
        type:'domaine',
        name:projectName,
        created_at:proj?.createdAt || null,
        source:'rtk-mower',
      },
    });
  }

  // 2 ── Zone de tonte
  if (tonte.length >= 3) {
    const coords = [...tonte.map(p=>[p.lon,p.lat]), [tonte[0].lon, tonte[0].lat]];
    features.push({
      type:'Feature',
      geometry:{ type:'Polygon', coordinates:[coords] },
      properties:{
        type:'zone',
        name:`${projectName} - Zone de tonte`,
        surface_m2:calculateArea(tonte),
        source:'rtk-mower',
      },
    });
  }

  // 3 ── Zones interdites
  if (interdit.length >= 3) {
    const coords = [...interdit.map(p=>[p.lon,p.lat]), [interdit[0].lon, interdit[0].lat]];
    features.push({
      type:'Feature',
      geometry:{ type:'Polygon', coordinates:[coords] },
      properties:{
        type:'zone_interdite',
        name:'Zone interdite',
        surface_m2:calculateArea(interdit),
        source:'rtk-mower',
      },
    });
  }

  // 4 ── Obstacles isolés (1 Point par obstacle)
  obstacles.forEach(p => {
    features.push({
      type:'Feature',
      geometry:{ type:'Point', coordinates:[p.lon, p.lat, p.alt || 0] },
      properties:{
        type:'obstacle',
        categorie:p.subtype || 'Autre',
        rayon:1.0,
        index:p.index,
        fix:p.fix,
        satellites:p.satellites,
        hdop:p.hdop,
        timestamp:p.timestamp,
        source:'rtk-mower',
      },
    });
  });

  // 5 ── Base du rover (position unique par parcelle)
  const base = typeof getBase === 'function'
    ? getBase()
    : pts.find(p => p.type === 'base') || null;
  if (base) {
    features.push({
      type:'Feature',
      geometry:{ type:'Point', coordinates:[base.lon, base.lat, base.alt || 0] },
      properties:{
        type:'base',
        name:'Base du rover',
        timestamp:base.timestamp,
        source:'rtk-mower',
      },
    });
  }

  const geojson = { type:'FeatureCollection', features };
  downloadFile(JSON.stringify(geojson,null,2), `RTK_${projectName}_${dateTag()}.geojson`, 'application/json');
  showToast(`✅ GeoJSON exporté — ${features.length} feature(s)`,'info');
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content],{type:mime});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function dateTag() { return new Date().toISOString().slice(0,10); }
