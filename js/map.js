// ============================================================
// map.js — Carte Leaflet v2 — tonte / interdit / obstacle
// ============================================================

const BOD1_LAT = 44.832223988119964;
const BOD1_LON = -0.7019923801219144;
const MAP_BASE_LAYER_KEY = 'rtkMapBaseLayer';

let map=null, layerTonte=null, layerInterdit=null, layerObstacle=null;
let reliefLayer=null, satelliteLayer=null, activeBaseLayer='relief';
let liveMarker=null, liveTrail=[], livePolyline=null;
let surfaceOverlayControl = null;
let surfaceOverlayEl = null;

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
  // ── Fond « Relief » ─────────────────────────────────────────
  // CARTO Voyager exige maintenant une clé API : sans clé, CARTO renvoie des
  // tuiles « API KEY REQUIRED » (filigrane). On garde donc Voyager activable
  // via une clé, sinon on utilise Esri World Topo (sans clé, sans 403).
  const CARTO_API_KEY = ''; // ← renseigner une clé CARTO pour utiliser Voyager
  const reliefUrl = CARTO_API_KEY
    ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?api_key=${CARTO_API_KEY}`
    : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';

  // maxNativeZoom : au-delà, Leaflet réutilise et agrandit la dernière tuile disponible.
  // CARTO fournit le zoom 19 ; Esri World Topo s'arrête au zoom 17 sur certaines zones.
  reliefLayer = L.tileLayer(reliefUrl, {
    attribution: CARTO_API_KEY
      ? '&copy; OpenStreetMap &copy; CARTO'
      : 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom:22, maxNativeZoom: CARTO_API_KEY ? 19 : 17,
  });
  satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution:'Tiles © Esri', maxZoom:22, maxNativeZoom:19 }
  );

  activeBaseLayer = localStorage.getItem(MAP_BASE_LAYER_KEY) || 'relief';
  if (activeBaseLayer === 'satellite') satelliteLayer.addTo(map);
  else reliefLayer.addTo(map);

  layerTonte    = L.layerGroup().addTo(map);
  layerInterdit = L.layerGroup().addTo(map);
  layerObstacle = L.layerGroup().addTo(map);

  initSurfaceOverlayControl();

  // Marqueur station NTRIP sélectionnée
  L.circleMarker([centerLat,centerLon],{
    radius:6, fillColor:'#fff', color:'#888', weight:2, fillOpacity:1
  }).addTo(map).bindPopup(`<b>Station ${station?.name || 'NTRIP'}</b><br>${station?.mountpoint || 'Référence NTRIP'}`);

  syncMapBaseLayerButtons();

  renderMap();
}

function setMapBaseLayer(layerId) {
  const nextLayer = layerId === 'satellite' ? 'satellite' : 'relief';
  if (!map) {
    activeBaseLayer = nextLayer;
    localStorage.setItem(MAP_BASE_LAYER_KEY, activeBaseLayer);
    syncMapBaseLayerButtons();
    return;
  }

  if (activeBaseLayer === nextLayer) return;

  if (activeBaseLayer === 'satellite' && map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
  if (activeBaseLayer === 'relief' && map.hasLayer(reliefLayer)) map.removeLayer(reliefLayer);

  activeBaseLayer = nextLayer;
  if (activeBaseLayer === 'satellite') satelliteLayer.addTo(map);
  else reliefLayer.addTo(map);

  localStorage.setItem(MAP_BASE_LAYER_KEY, activeBaseLayer);
  syncMapBaseLayerButtons();
}

function syncMapBaseLayerButtons() {
  const reliefBtn = document.getElementById('btnBaseRelief');
  const satelliteBtn = document.getElementById('btnBaseSatellite');
  if (reliefBtn) reliefBtn.classList.toggle('active', activeBaseLayer === 'relief');
  if (satelliteBtn) satelliteBtn.classList.toggle('active', activeBaseLayer === 'satellite');
}

function renderMap() {
  if (!map) return;
  layerTonte.clearLayers();
  layerInterdit.clearLayers();
  layerObstacle.clearLayers();

  const pts = getPoints();
  if (pts.length === 0) {
    updateSurfaceOverlay('');
    return;
  }

  const tonte    = pts.filter(p=>p.type==='tonte');
  const interdit = pts.filter(p=>p.type==='interdit');
  const obstacle = pts.filter(p=>p.type==='obstacle');
  const surfaceParts = [];

  // Zones de tonte : un polygone par zoneId, teinte de vert différente
  const zones = typeof getZones === 'function' ? getZones() : { 1: tonte };
  Object.keys(zones).map(Number).sort((a, b) => a - b).forEach(zoneId => {
    const zonePts = zones[zoneId];
    if (!zonePts || zonePts.length === 0) return;

    const palette = typeof getZonePalette === 'function'
      ? getZonePalette(zoneId)
      : COLORS.tonte;

    if (zonePts.length >= 3) {
      const area = calculateArea(zonePts);
      L.polygon(zonePts.map(p => [p.lat, p.lon]), {
        color: palette.stroke, weight: 2.5, fillColor: palette.fill, fillOpacity: 1,
      })
        .addTo(layerTonte)
        .bindPopup(`<b>Zone de tonte #${zoneId}</b><br>Surface : ${formatArea(area)}`);

      // Numéro de zone au centre du polygone
      const center = zonePts.reduce(
        (acc, p) => ({ lat: acc.lat + p.lat, lon: acc.lon + p.lon }), { lat: 0, lon: 0 });
      center.lat /= zonePts.length;
      center.lon /= zonePts.length;
      L.marker([center.lat, center.lon], {
        icon: L.divIcon({
          className: 'zone-label',
          html: `<div>Z${zoneId}</div>`,
          iconSize: [28, 28], iconAnchor: [14, 14],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(layerTonte);

      surfaceParts.push(`Zone ${zoneId} : <b>${formatArea(area)}</b>`);
    }

    // Marqueurs des points de la zone
    zonePts.forEach(p => {
      L.circleMarker([p.lat, p.lon], {
        radius: 8, fillColor: palette.stroke, color: 'white', weight: 2, fillOpacity: 0.95,
      })
        .addTo(layerTonte)
        .bindPopup(pointPopup(p, p.index));
    });
  });

  // Polygone zone interdite (si ≥3 pts)
  if (interdit.length >= 3) {
    const lls = interdit.map(p=>[p.lat,p.lon]);
    const area = calculateArea(interdit);
    L.polygon(lls, { color:COLORS.interdit.stroke, weight:2.5, fillColor:COLORS.interdit.fill, fillOpacity:1 })
      .addTo(layerInterdit)
      .bindPopup('<b>Zone interdite</b>');

    surfaceParts.push(`Surface interdite : <b>${formatArea(area)}</b>`);
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

  updateSurfaceOverlay(surfaceParts.join(' &nbsp;•&nbsp; '));
}

function pointPopup(p, idx) {
  const label = p.subtype ? `${p.icon} ${p.subtype}` : (p.type==='tonte'?'Tonte':'Interdit');
  const zone = p.type === 'tonte' ? `Zone ${p.zoneId || 1} · ` : '';
  return `<b>${label} #${idx}</b><br>${zone}Fix: ${p.fix}<br>Alt: ${fmt(p.alt,1)}m<br>Sat: ${p.satellites}<br>${fmtTime(p.timestamp)}`;
}

// Ajoute un seul point sans tout redessiner
function addPointToMap(pt) {
  if (!map) return;

  // Les zones de tonte sont redessinées en entier (polygone + numéro + couleurs)
  if (pt.type === 'tonte') {
    renderMap();
    map.panTo([pt.lat, pt.lon]);
    return;
  }

  const layer  = pt.type==='interdit'?layerInterdit:layerObstacle;
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

function initSurfaceOverlayControl() {
  if (!map || surfaceOverlayControl) return;

  surfaceOverlayControl = L.control({ position: 'topright' });
  surfaceOverlayControl.onAdd = () => {
    const el = L.DomUtil.create('div', 'map-surface-overlay');
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
    surfaceOverlayEl = el;
    return el;
  };

  surfaceOverlayControl.addTo(map);
}

function updateSurfaceOverlay(html) {
  if (!map) return;
  if (!surfaceOverlayControl || !surfaceOverlayEl) initSurfaceOverlayControl();
  if (!surfaceOverlayEl) return;

  if (!html) {
    surfaceOverlayEl.innerHTML = '';
    surfaceOverlayEl.classList.remove('show');
    return;
  }

  surfaceOverlayEl.innerHTML = html;
  surfaceOverlayEl.classList.add('show');
}

function setHTML(id,html){const el=document.getElementById(id);if(el)el.innerHTML=html;}
