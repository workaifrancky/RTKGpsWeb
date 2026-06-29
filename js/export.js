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

function exportGeoJSON() {
  const pts = getPoints();
  if (pts.length===0) { showToast('Aucun point à exporter','error'); return; }
  const proj = getCurrentProjectData();
  const features = pts.map(p=>({
    type:'Feature',
    geometry:{ type:'Point', coordinates:[p.lon,p.lat,p.alt||0] },
    properties:{ type:p.type, subtype:p.subtype, index:p.index, fix:p.fix, satellites:p.satellites, hdop:p.hdop, timestamp:p.timestamp }
  }));

  // Polygone zone de tonte
  const tonte = pts.filter(p=>p.type==='tonte');
  if (tonte.length>=3) {
    const coords = [...tonte.map(p=>[p.lon,p.lat]), [tonte[0].lon,tonte[0].lat]];
    features.push({ type:'Feature', geometry:{ type:'Polygon', coordinates:[coords] }, properties:{ type:'zone_tonte', name:proj?.name } });
  }

  const geojson = { type:'FeatureCollection', features };
  downloadFile(JSON.stringify(geojson,null,2), `RTK_${proj?.name||'export'}_${dateTag()}.geojson`, 'application/json');
  showToast('✅ GeoJSON exporté','info');
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
