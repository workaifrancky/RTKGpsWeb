// ============================================================
// export.js — Export CSV, GPX, GeoJSON v2
// RTKGpsWeb v2
// ============================================================

// ─── FORMAT D'EXPORT PAR DÉFAUT ─────────────────────────────
// Choisi dans le panneau Connexion (roue dentée), persisté dans
// `localStorage` (clé `rtkExportFormat`). Il s'applique à l'option
// « Télécharger le fichier » du hub de transfert pour une seule parcelle
// (GeoJSON / CSV / GPX). Le partage et les transferts multiples restent en
// GeoJSON (ZIP), conformément au contrat Mower Planner.
const EXPORT_FORMAT_KEY = 'rtkExportFormat';
const EXPORT_FORMAT_LABELS = { geojson: 'GeoJSON', csv: 'CSV', gpx: 'GPX' };
let exportFormat = 'geojson';

// ─── FILE D'ATTENTE HORS-LIGNE ──────────────────────────────
// Les exports/partages demandés sans connexion sont stockés puis rejoués au
// retour du réseau (événement `online`) ou via le bouton du panneau Connexion.
const OFFLINE_QUEUE_KEY = 'rtkOfflineQueue';
let offlineQueueProcessing = false;

function isOfflineNow() {
  return !offlineQueueProcessing
    && typeof navigator !== 'undefined'
    && navigator.onLine === false;
}

function loadOfflineQueue() {
  try {
    const list = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    if (!Array.isArray(list)) return [];
    return list.filter(req => req && typeof req === 'object'
      && typeof req.id === 'string'
      && (req.type === 'export' || req.type === 'share'));
  } catch {
    return [];
  }
}

function updateOfflineQueueIndicator() {
  const row = document.getElementById('offlineQueueRow');
  const button = document.getElementById('offlineQueueIndicator');
  if (!row || !button) return;
  const count = loadOfflineQueue().length;
  row.hidden = count === 0;
  button.textContent = `${count} demande(s) en attente`;
  button.setAttribute('aria-label',
    count === 0 ? 'Aucune demande en attente' : `Traiter ${count} demande(s) en attente`);
}

function saveOfflineQueue(queue) {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch { /* stockage indisponible : la demande ne peut pas être persistée */ }
  updateOfflineQueueIndicator();
}

function queueOfflineRequest(type, projectId, format, projectIds = null) {
  const queue = loadOfflineQueue();
  const request = {
    id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: type === 'share' ? 'share' : 'export',
    projectId: projectId ? String(projectId) : null,
    format: normalizeExportFormat(format),
    timestamp: new Date().toISOString(),
  };
  if (Array.isArray(projectIds) && projectIds.length) {
    request.projectIds = [...new Set(projectIds.map(String))];
  }
  queue.push(request);
  saveOfflineQueue(queue);
  if (typeof showToast === 'function') {
    showToast("Hors connexion — demande ajoutée à la file d'attente", 'info', 3200);
  }
  return request;
}

async function executeOfflineRequest(request) {
  const projects = typeof loadProjects === 'function' ? loadProjects() : [];
  const ids = Array.isArray(request.projectIds) && request.projectIds.length
    ? request.projectIds.map(String)
    : (request.projectId ? [String(request.projectId)] : []);
  const selected = projects.filter(project =>
    ids.includes(project.id) && Array.isArray(project.points) && project.points.length > 0);

  if (!selected.length) return false;

  if (request.type === 'share') {
    if (selected.length > 1) {
      await shareProjectsZip(selected);
    } else {
      await shareProjectGeoJSON(selected[0].id);
    }
    return true;
  }

  if (selected.length > 1) {
    await downloadProjectsZip(selected);
    return true;
  }

  const format = normalizeExportFormat(request.format);
  if (format === 'csv') {
    exportCSV(selected[0]);
    return true;
  }
  if (format === 'gpx') {
    exportGPX(selected[0]);
    return true;
  }
  exportProjectGeoJSON(selected[0].id);
  return true;
}

async function processOfflineQueue() {
  if (offlineQueueProcessing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (typeof showToast === 'function') {
      showToast('Hors connexion — la file reste en attente', 'info', 3000);
    }
    return;
  }

  const queue = loadOfflineQueue();
  if (!queue.length) {
    updateOfflineQueueIndicator();
    return;
  }

  offlineQueueProcessing = true;
  let processed = 0;
  try {
    for (const request of queue) {
      try {
        if (await executeOfflineRequest(request)) processed++;
      } catch (error) {
        console.warn('Demande hors-ligne non traitée', request, error);
      }
    }
  } finally {
    saveOfflineQueue([]);           // la file est vidée après le passage
    offlineQueueProcessing = false;
  }

  if (typeof showToast === 'function') {
    showToast(`File d'attente traitée : ${processed} export(s)`, 'info', 3600);
  }
}

function initOfflineQueue() {
  updateOfflineQueueIndicator();
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  window.addEventListener('online', () => {
    updateOfflineQueueIndicator();
    processOfflineQueue();
  });
}

function normalizeExportFormat(value) {
  return EXPORT_FORMAT_LABELS[value] ? value : 'geojson';
}

function getStoredExportFormat() {
  try {
    return normalizeExportFormat(localStorage.getItem(EXPORT_FORMAT_KEY));
  } catch {
    return 'geojson';
  }
}

function getExportFormatLabel(format = exportFormat) {
  return EXPORT_FORMAT_LABELS[normalizeExportFormat(format)];
}

// Met à jour la liste du panneau Connexion.
function syncExportFormatUI() {
  const select = document.getElementById('exportFormatSelect');
  if (select) select.value = exportFormat;
}

// Appelée par #exportFormatSelect (onchange).
function setExportFormat(value) {
  exportFormat = normalizeExportFormat(value);
  try {
    localStorage.setItem(EXPORT_FORMAT_KEY, exportFormat);
  } catch { /* stockage indisponible : le choix reste valable pour la session */ }
  syncExportFormatUI();
  if (typeof showToast === 'function') {
    showToast(`Format d'export : ${getExportFormatLabel()}`, 'info');
  }
}

// Export de la parcelle courante dans le format choisi (API de commodité).
// L'interface l'utilise via l'option « Télécharger le fichier » du hub.
function exportDefaultFormat() {
  const project = typeof getCurrentProjectData === 'function' ? getCurrentProjectData() : null;
  if (!project) { showToast('Aucune parcelle sélectionnée', 'error'); return; }
  return exportProjectDefaultFormat(project.id);
}

function initExportFormat() {
  exportFormat = getStoredExportFormat();
  syncExportFormatUI();
}

function exportCSV(projectArg) {
  const pts = Array.isArray(projectArg?.points) ? projectArg.points : getPoints();
  if (pts.length===0) { showToast('Aucun point à exporter','error'); return; }
  const proj = projectArg || getCurrentProjectData();
  if (isOfflineNow()) {
    queueOfflineRequest('export', proj?.id || null, 'csv');
    return;
  }
  const headers = 'Point,Type,SousType,Latitude,Longitude,Altitude,Fix,Satellites,HDOP,Horodatage\n';
  const rows = pts.map(p =>
    `${p.index},${p.type},${p.subtype||''},${p.lat},${p.lon},${p.alt||''},${p.fix},${p.satellites||''},${p.hdop||''},${p.timestamp}`
  ).join('\n');
  downloadFile(headers+rows, `RTK_${proj?.name||'export'}_${dateTag()}.csv`, 'text/csv');
  showToast(`✅ CSV exporté — ${pts.length} points`,'info');
}

function exportGPX(projectArg) {
  const pts = Array.isArray(projectArg?.points) ? projectArg.points : getPoints();
  if (pts.length===0) { showToast('Aucun point à exporter','error'); return; }
  const proj = projectArg || getCurrentProjectData();
  if (isOfflineNow()) {
    queueOfflineRequest('export', proj?.id || null, 'gpx');
    return;
  }
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

// `projectArg` (facultatif) : parcelle à exporter. La liste de l'onglet
// HISTORIQUE s'en sert pour exporter une parcelle sans changer la parcelle
// courante. Sans argument, la parcelle courante est utilisée (comportement
// historique, contrat GeoJSON inchangé).
function buildGeoJSON(projectArg) {
  const proj = projectArg || getCurrentProjectData();
  const pts = Array.isArray(projectArg?.points) ? projectArg.points : getPoints();
  if (pts.length===0) return null;
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
        // Toujours aligné sur la première capture (et non l'ancien createdAt).
        created_at:metadata.date_creation,
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
  // Regroupement local à partir des points exportés (et non de la parcelle
  // courante) : identique à getInterditZones() pour la parcelle courante, mais
  // valable pour une parcelle passée en argument.
  const interditZones = {};
  interdit.forEach(p => {
    const zid = Number(p.zoneId);
    const zoneId = Number.isInteger(zid) && zid > 0 ? zid : 1;
    if (!interditZones[zoneId]) interditZones[zoneId] = [];
    interditZones[zoneId].push(p);
  });
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
        // Un obstacle porte sa propre date de capture.
        date_creation:p.timestamp || metadata.date_creation,
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
  if (isOfflineNow()) {
    const project = typeof getCurrentProjectData === 'function' ? getCurrentProjectData() : null;
    queueOfflineRequest('export', project?.id || null, 'geojson');
    return;
  }

  downloadFile(
    JSON.stringify(payload.geojson, null, 2),
    payload.filename,
    'application/json',
  );
  showToast(`✅ GeoJSON exporté — ${payload.geojson.features.length} feature(s)`,'info');
}

// Export GeoJSON d'une parcelle précise, depuis la liste de l'onglet
// HISTORIQUE (bouton « Exporter » d'une ligne), sans changer la parcelle
// courante. Le contrat de sortie est identique à exportGeoJSON().
function exportProjectGeoJSON(projectId) {
  const projects = typeof loadProjects === 'function' ? loadProjects() : [];
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  const payload = buildGeoJSON(project);
  if (!payload) { showToast('Aucun point à exporter','error'); return; }
  if (isOfflineNow()) {
    queueOfflineRequest('export', projectId, 'geojson');
    return;
  }

  downloadFile(
    JSON.stringify(payload.geojson, null, 2),
    payload.filename,
    'application/json',
  );
  showToast(`✅ GeoJSON exporté — ${payload.geojson.features.length} feature(s)`,'info');
}

// Export d'une parcelle dans le format choisi dans le panneau Connexion
// (GeoJSON / CSV / GPX), depuis l'option « Télécharger le fichier » du hub.
// Le GeoJSON conserve exactement le contrat de buildGeoJSON().
function exportProjectDefaultFormat(projectId) {
  const list = typeof loadProjects === 'function' ? loadProjects() : [];
  const project = list.find(p => p.id === projectId);
  if (!project) return;
  const points = Array.isArray(project.points) ? project.points : [];
  if (!points.length) { showToast('Aucun point à exporter','error'); return; }

  if (exportFormat === 'csv') return exportCSV(project);
  if (exportFormat === 'gpx') return exportGPX(project);
  return exportProjectGeoJSON(projectId);
}

async function shareGeoJSONPayload(payload) {
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

async function shareGeoJSON() {
  const payload = buildGeoJSON();
  if (!payload) { showToast('Aucun point à partager','error'); return; }

  if (isOfflineNow()) {
    const project = typeof getCurrentProjectData === 'function' ? getCurrentProjectData() : null;
    queueOfflineRequest('share', project?.id || null, 'geojson');
    return;
  }

  return shareGeoJSONPayload(payload);
}

// Partage d'une parcelle précise (utilisé par la file d'attente hors-ligne :
// ne dépend pas de la parcelle courante).
async function shareProjectGeoJSON(projectId) {
  const projects = typeof loadProjects === 'function' ? loadProjects() : [];
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  const payload = buildGeoJSON(project);
  if (!payload) { showToast('Aucun point à partager','error'); return; }

  if (isOfflineNow()) {
    queueOfflineRequest('share', projectId, 'geojson');
    return;
  }

  return shareGeoJSONPayload(payload);
}

// ─── HUB DE TRANSFERT (redondance des solutions d'export) ───
// Une seule modale (#transferModal) propose quatre canaux : partage natif,
// mode serveur local, cloud, téléchargement direct. Chaque canal réutilise
// les fonctions d'export existantes (shareGeoJSON / exportGeoJSON / CSV / GPX)
// afin de ne jamais dupliquer la construction du GeoJSON.
let transferPreviousFocus = null;
let transferLocalUrls = [];
// Parcelles sélectionnées pour un transfert groupé (vide = parcelle courante).
let transferSelectionIds = [];

// Parcelles concernées par le hub : la sélection multiple si elle existe, sinon
// la parcelle courante. Les parcelles sans point sont ignorées.
function getTransferProjects() {
  const list = typeof loadProjects === 'function' ? loadProjects() : [];
  let projects;
  if (transferSelectionIds.length) {
    projects = list.filter(p => transferSelectionIds.includes(p.id));
  } else {
    const current = typeof getCurrentProjectData === 'function' ? getCurrentProjectData() : null;
    projects = current ? [current] : [];
  }
  return projects.filter(p => Array.isArray(p.points) && p.points.length > 0);
}

function openTransferModal(options = {}) {
  const overlay = document.getElementById('transferModal');
  if (!overlay) return;

  transferSelectionIds = Array.isArray(options.projectIds)
    ? options.projectIds.map(String)
    : [];

  const projects = getTransferProjects();
  if (!projects.length) {
    transferSelectionIds = [];
    showToast('Aucun point à transférer', 'error');
    return;
  }

  transferShowOptions();

  const nameEl = document.getElementById('transferProjectName');
  if (nameEl) {
    nameEl.textContent = projects.length > 1
      ? `Sélection : ${projects.length} parcelles`
      : `Parcelle : ${projects[0].name || 'Parcelle courante'}`;
  }

  transferPreviousFocus = document.activeElement;
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');

  const first = document.getElementById('transferOptionShare');
  if (first && typeof first.focus === 'function') first.focus({ preventScroll: true });
}

function closeTransferModal() {
  const overlay = document.getElementById('transferModal');
  if (!overlay || !overlay.classList.contains('show')) return;

  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');
  transferShowOptions();                 // la prochaine ouverture repart des options
  transferSelectionIds = [];             // la sélection groupée ne survit pas à la fermeture

  const target = transferPreviousFocus;
  transferPreviousFocus = null;
  if (target && target.isConnected && target.offsetParent !== null
      && typeof target.focus === 'function') {
    target.focus({ preventScroll: true });
  }
}

// Vue « options » = état par défaut de la modale.
function transferShowOptions() {
  const options = document.getElementById('transferOptions');
  const local = document.getElementById('transferLocalPanel');
  if (options) options.hidden = false;
  if (local) local.hidden = true;
}

// Option 1 — partage natif (Quick Share, Gmail, Drive…).
// Une parcelle : GeoJSON seul. Plusieurs parcelles : un ZIP unique (le partage
// natif multi-fichiers échoue sur Android).
async function transferViaNativeShare() {
  const projects = getTransferProjects();
  closeTransferModal();
  if (projects.length > 1) return shareProjectsZip(projects);
  await shareGeoJSON();
}

// Option 3 — cloud : c'est le menu de partage Android qui propose Drive.
function transferViaCloud() {
  const projects = getTransferProjects();
  closeTransferModal();
  if (isOfflineNow()) {
    return projects.length > 1 ? shareProjectsZip(projects) : shareGeoJSON();
  }
  showToast('Choisissez Drive / Cloud dans le menu de partage', 'info', 3200);
  if (projects.length > 1) return shareProjectsZip(projects);
  return shareGeoJSON();
}

// Option 4 — téléchargement direct.
// Une parcelle : format choisi dans le panneau Connexion (GeoJSON / CSV / GPX).
// Plusieurs parcelles : ZIP GeoJSON unique.
async function transferOpenDownloads() {
  const projects = getTransferProjects();
  closeTransferModal();
  if (!projects.length) {
    showToast('Aucun point à transférer', 'error');
    return;
  }
  if (projects.length > 1) return downloadProjectsZip(projects);
  return exportProjectDefaultFormat(projects[0].id);
}

// ─── ZIP DES PARCELLES SÉLECTIONNÉES ────────────────────────
// Un seul fichier .zip contenant un GeoJSON par parcelle : contourne le bug
// Android du partage natif de plusieurs fichiers. Le contrat de chaque GeoJSON
// reste celui de buildGeoJSON() (source, [lon, lat], anneaux fermés).
async function buildProjectsZip(projects) {
  if (typeof JSZip !== 'function') {
    showToast('Compression ZIP indisponible — vérifiez la connexion', 'error', 3500);
    return null;
  }

  const zip = new JSZip();
  const usedNames = new Set();
  let count = 0;

  projects.forEach(project => {
    const payload = typeof buildGeoJSON === 'function' ? buildGeoJSON(project) : null;
    if (!payload) return;

    let entryName = payload.filename;
    let suffix = 2;
    while (usedNames.has(entryName)) {
      entryName = payload.filename.replace(/\.geojson$/i, `_${suffix++}.geojson`);
    }
    usedNames.add(entryName);
    zip.file(entryName, JSON.stringify(payload.geojson, null, 2));
    count++;
  });

  if (!count) {
    showToast('Aucun point à transférer', 'error');
    return null;
  }

  try {
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    return { blob, filename: `RTK_parcelles_${dateTag()}.zip`, count };
  } catch (error) {
    console.warn('Création du ZIP impossible', error);
    showToast('Création du ZIP impossible', 'error');
    return null;
  }
}

async function shareProjectsZip(projects) {
  if (isOfflineNow()) {
    queueOfflineRequest('share', null, 'geojson', projects.map(p => p.id));
    return;
  }

  const archive = await buildProjectsZip(projects);
  if (!archive) return;

  let file = null;
  let canShare = typeof File === 'function'
    && typeof navigator !== 'undefined'
    && typeof navigator.share === 'function';
  if (canShare) {
    file = new File([archive.blob], archive.filename, { type: 'application/zip' });
    if (typeof navigator.canShare === 'function') {
      try { canShare = navigator.canShare({ files: [file] }); }
      catch { canShare = false; }
    }
  }

  if (canShare) {
    try {
      await navigator.share({
        title: `GeoJSON — ${archive.count} parcelles`,
        text:  `Export RTK Mower — ${archive.count} parcelles (ZIP)`,
        files: [file],
      });
      showToast(`${archive.count} parcelles partagées (ZIP)`, 'info');
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') return;   // partage annulé
      console.warn('Partage du ZIP impossible', error);
    }
  }

  downloadFile(archive.blob, archive.filename, 'application/zip');
  showToast(`ZIP téléchargé — ${archive.count} parcelles`, 'info');
}

async function downloadProjectsZip(projects) {
  if (isOfflineNow()) {
    queueOfflineRequest('export', null, 'geojson', projects.map(p => p.id));
    return;
  }

  const archive = await buildProjectsZip(projects);
  if (!archive) return;
  downloadFile(archive.blob, archive.filename, 'application/zip');
  showToast(`ZIP téléchargé — ${archive.count} parcelles`, 'info');
}

// Option 2 — mode serveur local. L'adresse LAN est fournie par
// `serve-http.cjs` (/api/local-info) ; le QR code reste à venir.
async function transferViaLocalServer() {
  const options = document.getElementById('transferOptions');
  const local = document.getElementById('transferLocalPanel');
  if (!local) return;
  if (options) options.hidden = true;
  local.hidden = false;

  const urlEl = document.getElementById('transferLocalUrl');
  const listEl = document.getElementById('transferLocalList');
  if (urlEl) urlEl.textContent = 'Recherche de l’adresse…';
  if (listEl) listEl.innerHTML = '';

  const fallback = typeof location !== 'undefined' && location.origin
    ? `${location.origin}/`
    : '';
  let urls = [];

  try {
    const response = await fetch('/api/local-info', { cache: 'no-store' });
    if (response.ok) {
      const info = await response.json();
      if (Array.isArray(info?.urls)) {
        urls = info.urls.filter(url => typeof url === 'string' && url.trim());
      }
    }
  } catch {
    // Serveur statique sans endpoint : repli sur l'origine courante.
  }

  if (!urls.length && fallback) urls = [fallback];
  transferLocalUrls = urls;

  if (urlEl) urlEl.textContent = urls[0] || 'Adresse indisponible';
  if (listEl && urls.length > 1) {
    listEl.innerHTML = urls.map(url => `<li>${url}</li>`).join('');
  }
}

async function copyTransferLocalUrl() {
  const url = transferLocalUrls[0];
  if (!url) {
    showToast('Adresse indisponible', 'error');
    return;
  }

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(url);
      showToast('Adresse copiée', 'info');
      return;
    }
  } catch {
    // Presse-papiers refusé : on affiche l'adresse pour une copie manuelle.
  }
  showToast(url, 'info', 4000);
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
  // Restaure le format d'export choisi (GeoJSON par défaut).
  initExportFormat();
  // Affiche l'indicateur de file d'attente et branche l'événement `online`.
  initOfflineQueue();

  // Ferme le menu au clic extérieur et avec Échap.
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('.export-menu')) return;
    closeExportMenu();
  });

  // Hub de transfert : piège de focus (Tab reste dans la modale).
  const transferOverlay = document.getElementById('transferModal');
  if (transferOverlay) {
    transferOverlay.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const focusables = Array.from(transferOverlay.querySelectorAll('button:not([disabled])'))
        .filter(el => el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last  = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  // Échap : la modale de transfert est prioritaire sur le menu d'export.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const overlay = document.getElementById('transferModal');
    if (overlay && overlay.classList.contains('show')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeTransferModal();
      return;
    }
    closeExportMenu();
  }, true);
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
