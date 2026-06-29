// ============================================================
// map.js — Carte Leaflet v2 — tonte / interdit / obstacle
// ============================================================

const BOD1_LAT = 44.832223988119964;
const BOD1_LON = -0.7019923801219144;

let map=null, layerTonte=null, layerInterdit=null, layerObstacle=null;
let liveMarker=null, liveTrail=[], livePolyline=null;
let surfaceMode=false, surfacePolygon=null;

const COLORS = {
  tonte:    { stroke:'#16a34a', fill:'rgba(22,163,74,0.12)'   },
  interdit: { stroke:'#dc2626', fill:'rgba(220,38,38,0.15)'   },
  obstacle: { stroke:'#d97706', fill:'rgba(217,119,6,0.9)'    },
  live:     '#1a6b1a',
};

function initMap() {
  if (map) return;
  const station = typeof getSelectedNtripStation === 'function'
    ? getSelectedNtripStation()
    : { id:'bod1', name:'BOD1', lat:BOD1_LAT, lon:BOD1_LON, mountpoint:'Référence NTRIP' };
  const centerLat = station?.lat ?? BOD1_LAT;
  const centerLon = station?.lon ?? BOD1_LON;
  map = L.map('map', { center:[centerLat,centerLon], zoom:17, zoomControl:true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution:'© OpenStreetMap', maxZoom:22 }).addTo(map);

  layerTonte    = L.layerGroup().addTo(map);
  layerInterdit = L.layerGroup().addTo(map);
  layerObstacle = L.layerGroup().addTo(map);

  // Marqueur station NTRIP sélectionnée
  L.circleMarker([centerLat,centerLon],{
    radius:6, fillColor:'#fff', color:'#888', weight:2, fillOpacity:1
  }).addTo(map).bindPopup(`<b>Station ${station?.name || 'NTRIP'}</b><br>${station?.mountpoint || 'Référence NTRIP'}`);

  renderMap();
}

function renderMap() {
  if (!map) return;
  layerTonte.clearLayers();
  layerInterdit.clearLayers();
  layerObstacle.clearLayers();

  const pts = getPoints();
  if (pts.length === 0) return;

  const tonte    = pts.filter(p=>p.type==='tonte');
  const interdit = pts.filter(p=>p.type==='interdit');
  const obstacle = pts.filter(p=>p.type==='obstacle');

  // Polygone zone de tonte (si ≥3 pts)
  if (tonte.length >= 3) {
    const lls = tonte.map(p=>[p.lat,p.lon]);
    L.polygon(lls, { color:COLORS.tonte.stroke, weight:2.5, fillColor:COLORS.tonte.fill, fillOpacity:1 })
      .addTo(layerTonte).bindPopup('<b>Zone de tonte</b>');
  }
  // Marqueurs tonte
  tonte.forEach((p,i) => {
    L.circleMarker([p.lat,p.lon],{radius:8,fillColor:COLORS.tonte.stroke,color:'white',weight:2,fillOpacity:0.95})
      .addTo(layerTonte)
      .bindPopup(pointPopup(p,i+1));
  });

  // Polygone zone interdite (si ≥3 pts)
  if (interdit.length >= 3) {
    const lls = interdit.map(p=>[p.lat,p.lon]);
    L.polygon(lls, { color:COLORS.interdit.stroke, weight:2.5, fillColor:COLORS.interdit.fill, fillOpacity:1 })
      .addTo(layerInterdit).bindPopup('<b>Zone interdite</b>');
  }
  interdit.forEach((p,i) => {
    L.circleMarker([p.lat,p.lon],{radius:8,fillColor:COLORS.interdit.stroke,color:'white',weight:2,fillOpacity:0.95})
      .addTo(layerInterdit)
      .bindPopup(pointPopup(p,i+1));
  });

  // Obstacles isolés
  obstacle.forEach((p,i) => {
    const icon = L.divIcon({
      html:`<div style="background:${COLORS.obstacle.stroke};width:16px;height:16px;border-radius:50%;border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:9px"></div>`,
      iconSize:[16,16], iconAnchor:[8,8], className:'',
    });
    L.marker([p.lat,p.lon],{icon})
      .addTo(layerObstacle)
      .bindPopup(pointPopup(p,i+1));
  });

  // Fitbounds sur tous les points
  const allLls = pts.filter(p=>p.lat&&p.lon).map(p=>[p.lat,p.lon]);
  if (allLls.length === 1) map.setView(allLls[0], 19);
  else if (allLls.length > 1) map.fitBounds(allLls, {padding:[30,30]});
}

function pointPopup(p, idx) {
  const label = p.subtype ? `${p.icon} ${p.subtype}` : (p.type==='tonte'?'Tonte':'Interdit');
  return `<b>${label} #${idx}</b><br>Fix: ${p.fix}<br>Alt: ${fmt(p.alt,1)}m<br>Sat: ${p.satellites}<br>${fmtTime(p.timestamp)}`;
}

// Ajoute un seul point sans tout redessiner
function addPointToMap(pt) {
  if (!map) return;
  const layer  = pt.type==='tonte'?layerTonte:pt.type==='interdit'?layerInterdit:layerObstacle;
  const color  = COLORS[pt.type]?.stroke || '#888';
  const pts    = getPoints().filter(p=>p.type===pt.type);
  const idx    = pts.length;

  if (pt.type === 'obstacle') {
    const icon = L.divIcon({
      html:`<div style="background:${color};width:16px;height:16px;border-radius:50%;border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
      iconSize:[16,16],iconAnchor:[8,8],className:'',
    });
    L.marker([pt.lat,pt.lon],{icon}).addTo(layer).bindPopup(pointPopup(pt,idx));
  } else {
    L.circleMarker([pt.lat,pt.lon],{radius:8,fillColor:color,color:'white',weight:2,fillOpacity:0.95})
      .addTo(layer).bindPopup(pointPopup(pt,idx));
    // Redessine le polygone si ≥3 pts
    if (pts.length >= 3) {
      renderMap(); return;
    }
  }
  map.panTo([pt.lat,pt.lon]);
}

// Position live
function updateLivePosition(data) {
  if (!map || !data.lat || !data.lon) return;
  const pos=[data.lat,data.lon];
  if (!liveMarker) {
    liveMarker = L.circleMarker(pos,{radius:7,fillColor:COLORS.live,color:'white',weight:2,fillOpacity:1,className:'live-marker-pulse'}).addTo(map);
  } else {
    liveMarker.setLatLng(pos);
  }
  liveTrail.push(pos);
  if (liveTrail.length>500) liveTrail.shift();
  if (livePolyline) livePolyline.setLatLngs(liveTrail);
  else livePolyline = L.polyline(liveTrail,{color:COLORS.live,weight:2,opacity:0.5}).addTo(map);
}

function centerMapOnPoint(lat, lon) {
  if (!map) initMap();
  map.setView([lat,lon],19);
  showTab('tab-map');
  setTimeout(()=>map.invalidateSize(),120);
}

function refreshMap() {
  if (!map) initMap();
  else { map.invalidateSize(); renderMap(); }
}

// Surface
function toggleSurfaceMode() {
  surfaceMode = !surfaceMode;
  const btn = document.getElementById('btnSurface');
  if (surfaceMode) {
    if (btn) { btn.textContent='⏹ Arrêter mesure'; btn.classList.add('active'); }
    updateSurfaceDisplay();
  } else {
    if (btn) { btn.textContent='📐 Surface'; btn.classList.remove('active'); }
    const pts = getPoints().filter(p=>p.type==='tonte');
    if (pts.length >= 3) {
      const a = calculateArea(pts);
      document.getElementById('surfaceResult')?.classList.add('show');
      setHTML('surfaceResult', `Surface tonte : <b>${formatArea(a)}</b>`);
    }
  }
}

function updateSurfaceDisplay() {
  const pts = getPoints().filter(p=>p.type==='tonte');
  if (pts.length < 3) return;
  if (surfacePolygon) map.removeLayer(surfacePolygon);
  surfacePolygon = L.polygon(pts.map(p=>[p.lat,p.lon]),{
    color:'#16a34a',weight:2,fillColor:'#16a34a',fillOpacity:0.15,dashArray:'5,5'
  }).addTo(map);
}

function calculateArea(pts) {
  if (pts.length<3) return 0;
  const ref=pts[0].lat;
  const coords=pts.map(p=>({
    x:(p.lon-pts[0].lon)*Math.cos(ref*Math.PI/180)*111320,
    y:(p.lat-pts[0].lat)*111320,
  }));
  let area=0;
  const n=coords.length;
  for(let i=0;i<n;i++){const j=(i+1)%n;area+=coords[i].x*coords[j].y-coords[j].x*coords[i].y;}
  return Math.abs(area/2);
}

function formatArea(m2) {
  if(m2>=10000) return `${(m2/10000).toFixed(4)} ha`;
  return `${m2.toFixed(1)} m²`;
}

function setHTML(id,html){const el=document.getElementById(id);if(el)el.innerHTML=html;}
