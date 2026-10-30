// ============================================================
// map.js — Carte Leaflet v2 — tonte / interdit / obstacle
// ============================================================

const BOD1_LAT = 44.832223988119964;
const BOD1_LON = -0.7019923801219144;
const MAP_BASE_LAYER_KEY = 'rtkMapBaseLayer';

let map=null, layerTonte=null, layerInterdit=null, layerObstacle=null;
let reliefLayer=null, satelliteLayer=null, activeBaseLayer='relief';
let liveMarker=null, liveTrail=[], livePolyline=null;
// Métré temporaire du segment en cours de tracé (zone de tonte à 2 points).
let tempMeasureLine = null;
// Labels permanents de zone (ZT1, ZT2, ZI1…), visibles à partir du zoom
// ZONE_LABEL_MIN_ZOOM pour ne pas surcharger la carte. La surface n'est plus
// écrite sur la carte : elle reste dans la popup de la zone.
let zoneLabelLayer = null;
const ZONE_LABEL_MIN_ZOOM = 18;

// Numéros des points sur la carte : option d'affichage désactivée par défaut,
// persistée dans localStorage et pilotée par le switch du panneau Connexion.
const POINT_NUMBERS_KEY = 'rtkShowPointNumbers';
let showPointNumbers = false;
try {
  showPointNumbers = localStorage.getItem(POINT_NUMBERS_KEY) === '1';
} catch { /* stockage indisponible : option désactivée */ }

// Mode de tracé : suivi GPS, position connue et état de la vue TRACÉS.
let followGps = true;
let lastMapPosition = null;
let gpsControl = null;
let gpsFollowBtn = null;
let pointsViewProjectId = null;
let pointsViewNeedsFit = true;

const COLORS = {
  tonte:    { stroke:'#16a34a', fill:'rgba(22,163,74,0.12)'   },
  interdit: { stroke:'#dc2626', fill:'rgba(220,38,38,0.15)'   },
  obstacle: { stroke:'#d97706', fill:'rgba(217,119,6,0.9)'    },
  live:     '#1a6b1a',
};

// Distances de chaque segment des zones de tonte (leaflet-measure-path).
// minPixelDistance évite d'afficher les étiquettes sur les segments trop courts à l'écran.
// showTotalDistance: pour une polyligne (segment en cours à 2 points), le plugin
// ajoute sinon une 2e étiquette « longueur totale » au dernier sommet.
const ZONE_MEASUREMENT_OPTIONS = {
  showDistances:     true,
  showArea:          false,
  showTotalDistance: false,
  minPixelDistance:  10,
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
  zoneLabelLayer = L.layerGroup().addTo(map);

  initGpsControl();

  // Un déplacement manuel désactive le suivi GPS (le bouton permet de le réactiver).
  map.on('dragstart', disableGpsFollow);
  map.on('zoomend', syncZoneLabelVisibility);

  // Marqueur station NTRIP sélectionnée
  L.circleMarker([centerLat,centerLon],{
    radius:6, fillColor:'#fff', color:'#888', weight:2, fillOpacity:1
  }).addTo(map).bindPopup(`<b>Station ${station?.name || 'NTRIP'}</b><br>${station?.mountpoint || 'Référence NTRIP'}`);

  syncMapBaseLayerButtons();

  renderMap();

  // Si la carte est créée alors que l'écran est verrouillé (reprise de session),
  // on applique tout de suite l'état des gestes.
  if (document.body.classList.contains('locked')) setMapInteractionEnabled(false);
}

// Active/désactive tous les gestes Leaflet (verrouillage d'écran).
function setMapInteractionEnabled(enabled) {
  if (!map) return;

  [map.dragging, map.touchZoom, map.doubleClickZoom, map.scrollWheelZoom,
   map.boxZoom, map.keyboard, map.tap].forEach(handler => {
    if (!handler) return;
    try {
      enabled ? handler.enable() : handler.disable();
    } catch { /* handler absent */ }
  });

  const container = map.getContainer();
  if (container) container.classList.toggle('map-locked', !enabled);
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

// Supprime la polyligne de métré temporaire (segment en cours de tracé).
function clearTempMeasureLine() {
  if (!tempMeasureLine) return;
  if (layerTonte) layerTonte.removeLayer(tempMeasureLine);
  else if (map) map.removeLayer(tempMeasureLine);
  tempMeasureLine = null;
}

function renderMap() {
  if (!map) return;
  // Le métré temporaire est recréé à chaque rendu (zone à 2 points).
  clearTempMeasureLine();
  layerTonte.clearLayers();
  layerInterdit.clearLayers();
  layerObstacle.clearLayers();

  if (zoneLabelLayer) zoneLabelLayer.clearLayers();

  const pts = getPoints();
  if (pts.length === 0) {
    syncZoneLabelVisibility();
    // Évite un recadrage intempestif au premier point manuel : la vue courante
    // de l'onglet TRACÉS est conservée.
    if (APP.currentTab === 'tab-points' && map.getSize().x > 0) {
      pointsViewProjectId = typeof currentProject !== 'undefined' ? currentProject?.id : null;
      pointsViewNeedsFit = false;
    }
    return;
  }

  const tonte    = pts.filter(p=>p.type==='tonte');
  const interdit = pts.filter(p=>p.type==='interdit');
  const obstacle = pts.filter(p=>p.type==='obstacle');

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
        showMeasurements: true,
        measurementOptions: ZONE_MEASUREMENT_OPTIONS,
      })
        .addTo(layerTonte)
        .bindPopup(zonePopup('tonte', zoneId, area));

      addZoneLabel('tonte', zoneId, zonePts);
    }

    // Zone en cours de tracé (2 points) : une ligne seule n'est pas mesurée par
    // leaflet-measure-path, on crée donc la polyligne temporaire qui porte la
    // distance du segment. Elle est supprimée dès le 3e point (polygone).
    if (zonePts.length === 2) {
      clearTempMeasureLine();
      tempMeasureLine = L.polyline(zonePts.map(p => [p.lat, p.lon]), {
        color:       palette.stroke,
        weight:      2.5,
        interactive: false,
      }).addTo(layerTonte);
      if (typeof tempMeasureLine.showMeasurements === 'function') {
        tempMeasureLine.showMeasurements(ZONE_MEASUREMENT_OPTIONS);
      }
    }

    // Marqueurs des points de la zone, numérotés de 1 à N dans l'ordre de
    // création. Le numéro permanent dépend de l'option « Numéros des points ».
    zonePts.forEach((p, index) => {
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: 8, fillColor: palette.stroke, color: 'white', weight: 2, fillOpacity: 0.95,
      })
        .addTo(layerTonte)
        .bindPopup(pointPopup(p, index + 1));
      bindPointNumberTooltip(marker, index + 1);
    });
  });

  // Zones interdites : un polygone distinct par zoneId (comme la tonte)
  const interditZones = typeof getInterditZones === 'function' ? getInterditZones() : { 1: interdit };
  Object.keys(interditZones).map(Number).sort((a, b) => a - b).forEach(zoneId => {
    const zonePts = interditZones[zoneId];
    if (!zonePts || !zonePts.length) return;

    if (zonePts.length >= 3) {
      const area = calculateArea(zonePts);
      L.polygon(zonePts.map(p => [p.lat, p.lon]), {
        color: COLORS.interdit.stroke, weight: 2.5,
        fillColor: COLORS.interdit.fill, fillOpacity: 1,
        showMeasurements: true,
        measurementOptions: ZONE_MEASUREMENT_OPTIONS,
      })
        .addTo(layerInterdit)
        .bindPopup(zonePopup('interdit', zoneId, area));

      addZoneLabel('interdit', zoneId, zonePts);
    }

    // Points numérotés de 1 à N dans leur zone interdite.
    zonePts.forEach((p, index) => {
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: 8, fillColor: COLORS.interdit.stroke, color: 'white', weight: 2, fillOpacity: 0.95,
      })
        .addTo(layerInterdit)
        .bindPopup(pointPopup(p, index + 1));
      bindPointNumberTooltip(marker, index + 1);
    });
  });

  // Obstacles isolés
  obstacle.forEach((p,i) => {
    const icon = L.divIcon({
      html:`<div style="background:${COLORS.obstacle.stroke};width:16px;height:16px;border-radius:50%;border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:9px"></div>`,
      iconSize:[16,16], iconAnchor:[8,8], className:'',
    });
    const marker = L.marker([p.lat,p.lon],{icon})
      .addTo(layerObstacle)
      .bindPopup(pointPopup(p,i+1));
    bindPointNumberTooltip(marker, i+1);
  });

  // TRACÉS : cadrage uniquement à l'initialisation ou au changement de parcelle,
  // pour ne pas faire sauter la cible pendant un tracé manuel.
  const projectId = typeof currentProject !== 'undefined' ? currentProject?.id : null;
  const mapHasSize = map.getSize().x > 0;

  if (projectId !== pointsViewProjectId) {
    pointsViewProjectId = projectId;
    pointsViewNeedsFit = true;
  }

  if (pointsViewNeedsFit && mapHasSize) {
    const allLls = pts.filter(p=>p.lat&&p.lon).map(p=>[p.lat,p.lon]);
    if (allLls.length === 1) map.setView(allLls[0], 19);
    else if (allLls.length > 1) map.fitBounds(allLls, {padding:[30,30]});
    pointsViewNeedsFit = false;
  }

  syncZoneLabelVisibility();
}

// Centre approximatif de la zone (moyenne des sommets) pour le label de surface.
function getZoneCenter(zonePts) {
  const center = zonePts.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lon: acc.lon + p.lon }), { lat: 0, lon: 0 });
  center.lat /= zonePts.length;
  center.lon /= zonePts.length;
  return center;
}

// Ajoute un label permanent « ZT1 » / « ZI1 » au centre de la zone.
// La surface n'est volontairement plus affichée sur la carte : elle reste
// accessible dans la popup de la zone (zonePopup) et dans l'export GeoJSON.
function addZoneLabel(type, zoneId, zonePts) {
  if (!map || !zoneLabelLayer) return;
  const center = getZoneCenter(zonePts);
  const code = typeof getZoneCode === 'function'
    ? getZoneCode(type, zoneId)
    : `${type === 'interdit' ? 'ZI' : 'ZT'}${zoneId}`;

  const label = L.tooltip({
    permanent: true,
    direction: 'center',
    className: 'zone-name-label',
    opacity: 1,
    interactive: false,
  })
    .setLatLng([center.lat, center.lon])
    .setContent(code);

  zoneLabelLayer.addLayer(label);
}

// Numéro permanent d'un point sur la carte, uniquement si l'option
// « Numéros des points » est active (switch du panneau Connexion).
function bindPointNumberTooltip(marker, number) {
  if (!marker || !showPointNumbers) return marker;
  return marker.bindTooltip(String(number), {
    permanent: true, direction: 'right', offset: [8, 0],
    className: 'point-number-label', interactive: false,
  });
}

// Reflète l'état de l'option sur le switch du panneau Connexion.
function syncPointNumbersSwitch() {
  const btn = document.getElementById('btnPointNumbers');
  if (!btn) return;
  // L'état visuel du switch est entièrement porté par aria-checked (CSS).
  btn.setAttribute('aria-checked', showPointNumbers ? 'true' : 'false');
}

// Bascule l'affichage des numéros et persiste le choix.
function togglePointNumbers() {
  showPointNumbers = !showPointNumbers;
  try {
    localStorage.setItem(POINT_NUMBERS_KEY, showPointNumbers ? '1' : '0');
  } catch { /* stockage indisponible : l'option reste valable pour la session */ }
  syncPointNumbersSwitch();
  if (typeof renderMap === 'function') renderMap();
  if (typeof showToast === 'function') {
    showToast(showPointNumbers ? 'Numéros des points affichés' : 'Numéros des points masqués', 'info');
  }
}

document.addEventListener('DOMContentLoaded', syncPointNumbersSwitch);

// Les labels de zone ne sont visibles qu'à partir du zoom 18.
function syncZoneLabelVisibility() {
  if (!map || !zoneLabelLayer) return;
  const shouldShow = map.getZoom() >= ZONE_LABEL_MIN_ZOOM;
  if (shouldShow) {
    if (!map.hasLayer(zoneLabelLayer)) map.addLayer(zoneLabelLayer);
  } else if (map.hasLayer(zoneLabelLayer)) {
    map.removeLayer(zoneLabelLayer);
  }
}

function pointPopup(p, idx) {
  const label = typeof getPointDisplayName === 'function'
    ? getPointDisplayName(p)
    : (p.subtype
      ? (typeof getObstacleTypeLabel === 'function' ? getObstacleTypeLabel(p.subtype) : p.subtype)
      : (p.type==='tonte'?'Tonte':'Interdit'));
  // Pastille colorée à la place de l'emoji `p.icon` (conservé dans les données
  // pour l'export GeoJSON, mais plus affiché dans l'interface). Un obstacle
  // affiche l'icône Lucide de son sous-type (arbre, souche, poteau…).
  const dot = p.type === 'obstacle' && typeof getObstacleIconMarkup === 'function'
    ? `<span class="obstacle-type-icon" aria-hidden="true">${getObstacleIconMarkup(p.subtype)}</span>`
    : `<span class="type-dot ${p.type}" aria-hidden="true"></span>`;
  const zone = (p.type === 'tonte' || p.type === 'interdit') && typeof getZoneCode === 'function'
    ? `${getZoneCode(p.type, p.zoneId)} · `
    : '';
  const actions = `
    <div class="popup-actions">
      <button class="popup-btn" onclick="renamePoint(${p.id})" title="Renommer ce point">${ICON_PENCIL} Renommer</button>
      <button class="popup-btn popup-btn-danger" onclick="deletePoint(${p.id})" title="Supprimer ce point">${ICON_TRASH}</button>
    </div>`;
  // Popup allégée : pas d'horodatage (l'heure reste dans la liste des points
  // et l'export), uniquement zone, fix, altitude et satellites.
  // Numéro d'ordre sans dièse (« Arbre 2 »), comme dans la liste des points.
  return `<b>${dot}${label} ${idx}</b><br>${zone}Fix: ${p.fix}<br>Alt: ${fmt(p.alt,1)}m<br>Sat: ${p.satellites}${actions}`;
}

// Popup d'une zone (tonte ou interdite) : nom personnalisé + actions.
function zonePopup(type, zoneId, area) {
  const name = typeof getZoneDisplayName === 'function'
    ? getZoneDisplayName(type, zoneId)
    : (type === 'interdit' ? 'Zone interdite (ZI)' : 'Zone de tonte (ZT)');
  const surface = Number(area) > 0 ? `<br>Surface : ${formatArea(area)}` : '';
  return `<b>${name}</b>${surface}
    <div class="popup-actions">
      <button class="popup-btn" onclick="renameZone('${type}', ${zoneId})" title="Renommer cette zone">${ICON_PENCIL} Renommer</button>
      <button class="popup-btn popup-btn-danger" onclick="deleteZone('${type}', ${zoneId})" title="Supprimer cette zone">${ICON_TRASH}</button>
    </div>`;
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
// Efface le marqueur de position live et sa trace : appelé à la déconnexion
// BLE pour qu'aucun point GPS périmé ne reste affiché en mode manuel.
function clearLiveGpsPosition() {
  if (map) {
    if (liveMarker) map.removeLayer(liveMarker);
    if (livePolyline) map.removeLayer(livePolyline);
  }
  liveMarker = null;
  livePolyline = null;
  liveTrail = [];
  lastMapPosition = null;
}

function updateLivePosition(data) {
  if (!map || !data.lat || !data.lon) return;
  const pos=[data.lat,data.lon];
  lastMapPosition = { lat: data.lat, lon: data.lon };

  if (!liveMarker) {
    liveMarker = L.circleMarker(pos,{radius:7,fillColor:COLORS.live,color:'white',weight:2,fillOpacity:1,className:'live-marker-pulse'}).addTo(map);
  } else {
    liveMarker.setLatLng(pos);
  }
  liveTrail.push(pos);
  if (liveTrail.length>500) liveTrail.shift();
  if (livePolyline) livePolyline.setLatLngs(liveTrail);
  else livePolyline = L.polyline(liveTrail,{color:COLORS.live,weight:2,opacity:0.5}).addTo(map);

  if (followGps) map.panTo(pos, { animate: false });
}

// ─── CIBLE, MODE GPS / MANUEL ET SUIVI ──────────────────────
// Coordonnées du centre de la carte active (cible fixe de l'onglet TRACÉS).
function getTargetCoords() {
  if (!map) initMap();
  if (!map) return null;

  const center = map.getCenter();
  return { lat: center.lat, lon: center.lng };
}

// La cible de visée ne sert qu'au tracé actif : elle est masquée sans mode
// actif et sur les autres onglets.
function syncCrosshairVisibility(tabId) {
  const crosshair = document.getElementById('map-crosshair');
  if (!crosshair) return;

  const tracing = typeof APP !== 'undefined'
    && !!APP.currentTraceMode
    && typeof currentProject !== 'undefined'
    && !!currentProject;
  const visible = tabId === 'tab-points' && tracing;
  crosshair.classList.toggle('is-hidden', !visible);
  crosshair.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function getGpsPositionForMap() {
  // En mode manuel (BLE déconnecté), la dernière position reçue est périmée :
  // elle ne doit ni recentrer la carte ni déplacer la cible de tracé.
  if (typeof APP === 'undefined' || !APP.bleConnected) return null;
  if (lastMapPosition) return lastMapPosition;
  if (typeof lastGpsData !== 'undefined' && lastGpsData
      && Number.isFinite(lastGpsData.lat) && Number.isFinite(lastGpsData.lon)) {
    return { lat: lastGpsData.lat, lon: lastGpsData.lon };
  }
  return null;
}

function isGpsFollowActive() { return followGps; }

function centerMapOnGps() {
  if (!map) return;

  const pos = getGpsPositionForMap();
  if (!pos) {
    showToast('Aucune position GPS disponible', 'info');
    return;
  }

  map.setView([pos.lat, pos.lon], map.getZoom(), { animate: false });
}

function toggleGpsFollow() {
  followGps = !followGps;
  updateGpsFollowControl();
  if (followGps) centerMapOnGps();
}

function disableGpsFollow() {
  if (!followGps) return;
  followGps = false;
  updateGpsFollowControl();
}

function updateGpsFollowControl() {
  const btn = gpsFollowBtn || document.getElementById('btnFollowGps');
  if (!btn) return;

  btn.classList.toggle('active', followGps);
  btn.setAttribute('aria-pressed', followGps ? 'true' : 'false');
  btn.title = followGps
    ? 'Suivi GPS activé — toucher pour désactiver'
    : 'Suivi GPS désactivé — toucher pour activer';
}

// Position adaptative des contrôles GPS : à gauche quand la carte est assez
// haute (les 3 contrôles restent au-dessus), à droite sur une carte courte
// (paysage) pour ne jamais croiser la colonne zoom + Relief/Satellite/⛶.
let gpsControlPosition = 'bottomleft';

function ensureGpsControlPosition() {
  if (!map || !gpsControl) return;
  const wanted = map.getSize().y < 430 ? 'bottomright' : 'bottomleft';
  if (wanted === gpsControlPosition) return;

  map.removeControl(gpsControl);
  gpsControl.options.position = wanted;
  gpsControlPosition = wanted;
  gpsControl.addTo(map);
  updateGpsFollowControl();
}

function initGpsControl() {
  if (!map || gpsControl) return;

  gpsControl = L.control({ position: 'bottomleft' });
  gpsControl.onAdd = () => {
    const container = L.DomUtil.create('div', 'map-gps-control');

    const recenterBtn = L.DomUtil.create('button', 'map-gps-btn', container);
    recenterBtn.type      = 'button';
    recenterBtn.textContent = '⌖';
    recenterBtn.title     = 'Recentrer sur la position GPS';

    const followBtn = L.DomUtil.create('button', 'map-gps-btn', container);
    followBtn.type        = 'button';
    followBtn.id          = 'btnFollowGps';
    followBtn.textContent = '➤';
    gpsFollowBtn = followBtn;

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    L.DomEvent.on(recenterBtn, 'click', L.DomEvent.stop)
      .on(recenterBtn, 'click', centerMapOnGps);
    L.DomEvent.on(followBtn, 'click', L.DomEvent.stop)
      .on(followBtn, 'click', toggleGpsFollow);

    updateGpsFollowControl();
    return container;
  };

  gpsControl.addTo(map);
  gpsControlPosition = 'bottomleft';
  map.on('resize', ensureGpsControlPosition);
}

// Une seule instance de carte, dans l'onglet TRACÉS.
function mountMapForTab(tabId) {
  const slot = document.getElementById('map-points-slot');
  if (!slot) return;

  if (!map) initMap();
  if (!map) return;

  const container = map.getContainer();
  if (container.parentElement !== slot) slot.appendChild(container);

  setTimeout(() => {
    if (!map) return;
    map.invalidateSize({ animate: false });
    ensureGpsControlPosition();

    if (tabId === 'tab-points') {
      renderMap();
      syncTracesModeUI();
      if (followGps && getGpsPositionForMap()) centerMapOnGps();
    }
  }, 60);
}

// ─── MODES LECTURE / CRÉATION ───────────────────────────────
// En lecture la carte reste déplaçable mais aucun point ne peut être ajouté.
function isTracesCreation() {
  return typeof APP !== 'undefined' && APP.tracesMode === 'creation';
}

function setTracesMode(mode) {
  if (typeof APP === 'undefined') return;
  APP.tracesMode = mode === 'creation' ? 'creation' : 'lecture';
  // Changer de mode (Terminer / Modifier) remet le type de tracé à zéro.
  APP.currentTraceMode = null;
  syncTracesModeUI();
}

function syncTracesModeUI() {
  const creation = isTracesCreation();
  const screen = document.getElementById('tab-points');
  if (screen) {
    screen.classList.toggle('mode-creation', creation);
    screen.classList.toggle('mode-lecture', !creation);
  }

  syncCrosshairVisibility(typeof APP !== 'undefined' ? APP.currentTab : 'tab-points');
  if (typeof updateTerrainButtons === 'function') updateTerrainButtons();
  if (typeof updateTraceTypeUI === 'function') updateTraceTypeUI();
  if (typeof renderPointsList === 'function') renderPointsList();
}

// ─── PLEIN ÉCRAN CARTE ──────────────────────────────────────
let mapUiFullscreen = false;

function setMapFullscreen(enabled) {
  mapUiFullscreen = !!enabled;
  if (mapUiFullscreen && typeof closeProjectDrawer === 'function') closeProjectDrawer();
  document.body.classList.toggle('map-ui-fullscreen', mapUiFullscreen);

  const btn = document.getElementById('btnMapFullscreen');
  if (btn) {
    // Icône Lucide : `minimize` en plein écran, `maximize` sinon.
    btn.innerHTML = mapUiFullscreen ? ICON_MINIMIZE : ICON_MAXIMIZE;
    btn.title = mapUiFullscreen ? 'Quitter le plein écran' : 'Plein écran carte';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-pressed', mapUiFullscreen ? 'true' : 'false');
  }

  setTimeout(() => {
    if (!map) return;
    map.invalidateSize({ animate: false });
    ensureGpsControlPosition();
    renderMap();
  }, 120);
}

function toggleMapFullscreen() { setMapFullscreen(!mapUiFullscreen); }

function exitMapFullscreen() {
  if (mapUiFullscreen) setMapFullscreen(false);
}

// Type de tracé actif : la couleur et le titre du FAB suffisent désormais.
function updateTraceTypeUI() {
  syncCrosshairVisibility(typeof APP !== 'undefined' ? APP.currentTab : 'tab-points');
  if (typeof syncTraceFabUI === 'function') syncTraceFabUI();
}

function centerMapOnPoint(lat, lon) {
  if (!map) initMap();
  map.setView([lat,lon],19);
  showTab('tab-points');
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

function setHTML(id,html){const el=document.getElementById(id);if(el)el.innerHTML=html;}
