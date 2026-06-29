// ============================================================
// export.js — Export CSV, GPX, GeoJSON
// RTKGpsWeb
// Dépend de : points.js (getPoints)
// ============================================================

// ─── EXPORT CSV ───────────────────────────────────────────────
function exportCSV() {
  const pts = getPoints();
  if (pts.length === 0) {
    showToast('❌ Aucun point à exporter');
    return;
  }

  const headers = [
    'Point','Latitude','Longitude','Altitude',
    'Fix','Satellites','HDOP','Rel_X','Rel_Y',
    'Vitesse','Cap','Horodatage'
  ].join(',');

  const rows = pts.map(p => [
    p.index,
    p.lat,
    p.lon,
    p.alt         || '',
    p.fix         || '',
    p.satellites  || '',
    p.hdop        || '',
    p.relX        || '',
    p.relY        || '',
    p.speed       || '',
    p.course      || '',
    p.timestamp,
  ].join(','));

  const csv      = [headers, ...rows].join('\n');
  const filename = `RTK_points_${dateTag()}.csv`;
  downloadFile(csv, filename, 'text/csv');
  showToast(`✅ CSV exporté — ${pts.length} points`);
}

// ─── EXPORT GPX ───────────────────────────────────────────────
function exportGPX() {
  const pts = getPoints();
  if (pts.length === 0) {
    showToast('❌ Aucun point à exporter');
    return;
  }

  const waypoints = pts.map(p => `
  <wpt lat="${p.lat}" lon="${p.lon}">
    <ele>${p.alt || 0}</ele>
    <time>${p.timestamp}</time>
    <name>Point #${p.index}</name>
    <desc>Fix: ${p.fix} | Sat: ${p.satellites} | HDOP: ${p.hdop}</desc>
  </wpt>`).join('');

  const trackpoints = pts.map(p => `
      <trkpt lat="${p.lat}" lon="${p.lon}">
        <ele>${p.alt || 0}</ele>
        <time>${p.timestamp}</time>
      </trkpt>`).join('');

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RTKGpsApp"
  xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>RTK GPS Session ${dateTag()}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  ${waypoints}
  <trk>
    <name>Parcours RTK</name>
    <trkseg>${trackpoints}
    </trkseg>
  </trk>
</gpx>`;

  downloadFile(gpx, `RTK_session_${dateTag()}.gpx`, 'application/gpx+xml');
  showToast(`✅ GPX exporté — compatible GPS Garmin et Google Earth`);
}

// ─── EXPORT GEOJSON ───────────────────────────────────────────
function exportGeoJSON() {
  const pts = getPoints();
  if (pts.length === 0) {
    showToast('❌ Aucun point à exporter');
    return;
  }

  const features = pts.map(p => ({
    type: 'Feature',
    geometry: {
      type:        'Point',
      coordinates: [p.lon, p.lat, p.alt || 0],
    },
    properties: {
      index:      p.index,
      fix:        p.fix,
      satellites: p.satellites,
      hdop:       p.hdop,
      relX:       p.relX,
      relY:       p.relY,
      timestamp:  p.timestamp,
    },
  }));

  const geojson = {
    type:     'FeatureCollection',
    features,
  };

  downloadFile(
    JSON.stringify(geojson, null, 2),
    `RTK_session_${dateTag()}.geojson`,
    'application/json'
  );
  showToast('✅ GeoJSON exporté');
}

// ─── UTILITAIRES ──────────────────────────────────────────────
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function dateTag() {
  return new Date().toISOString().slice(0, 10);
}