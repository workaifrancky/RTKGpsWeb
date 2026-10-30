// ============================================================
// export.js — Export CSV, GPX, GeoJSON v2
// RTKGpsWeb v2
// ============================================================

// ─── FORMAT D'EXPORT PAR DÉFAUT ─────────────────────────────
// Choisi dans le panneau Connexion (roue dentée), persisté dans
// `localStorage` (clé `rtkExportFormat`). Le bouton principal de la section
// POINTS reprend ce format : libellé ET action. Les boutons CSV / GPX / GeoJSON
// restent disponibles individuellement et le contrat GeoJSON est inchangé.
const EXPORT_FORMAT_KEY = 'rtkExportFormat';
const EXPORT_FORMAT_LABELS = { geojson: 'GeoJSON', csv: 'CSV', gpx: 'GPX' };
let exportFormat = 'geojson';

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

// Met à jour la liste du panneau Connexion et les boutons « Exporter » de la
// liste des parcelles (le titre reflète le format courant).
function syncExportFormatUI() {
  const select = document.getElementById('exportFormatSelect');
  if (select) select.value = exportFormat;

  const text = getExportFormatLabel();
  document.querySelectorAll('#historyList .btn-history-export').forEach(rowBtn => {
    rowBtn.title = `Exporter en ${text}`;
  });
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
// L'interface utilise exportProjectDefaultFormat(projectId) depuis la liste.
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

  downloadFile(
    JSON.stringify(payload.geojson, null, 2),
    payload.filename,
    'application/json',
  );
  showToast(`✅ GeoJSON exporté — ${payload.geojson.features.length} feature(s)`,'info');
}

// Export d'une parcelle dans le format choisi dans le panneau Connexion
// (GeoJSON / CSV / GPX), depuis le bouton « Exporter » de la liste HISTORIQUE.
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

// ─── HUB DE TRANSFERT (redondance des solutions d'export) ───
// Une seule modale (#transferModal) propose quatre canaux : partage natif,
// mode serveur local, cloud, téléchargement direct. Chaque canal réutilise
// les fonctions d'export existantes (shareGeoJSON / exportGeoJSON / CSV / GPX)
// afin de ne jamais dupliquer la construction du GeoJSON.
let transferPreviousFocus = null;
let transferLocalUrls = [];

function openTransferModal() {
  const overlay = document.getElementById('transferModal');
  if (!overlay) return;

  // Sans point, aucun fichier à produire : même garde-fou que les exports.
  if (typeof getPoints === 'function' && getPoints().length === 0) {
    showToast('Aucun point à transférer', 'error');
    return;
  }

  transferShowOptions();

  const project = typeof getCurrentProjectData === 'function' ? getCurrentProjectData() : null;
  const nameEl = document.getElementById('transferProjectName');
  if (nameEl) nameEl.textContent = project?.name || 'Parcelle courante';

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

  const fromFocused = transferPreviousFocus;
  transferPreviousFocus = null;
  const trigger = document.getElementById('btnTransfer');
  const target = trigger && trigger.offsetParent !== null ? trigger : fromFocused;
  if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
}

// Vue « options » = état par défaut de la modale.
function transferShowOptions() {
  const options = document.getElementById('transferOptions');
  const local = document.getElementById('transferLocalPanel');
  if (options) options.hidden = false;
  if (local) local.hidden = true;
}

// Option 1 — partage natif (Quick Share, Gmail, Drive…).
async function transferViaNativeShare() {
  closeTransferModal();
  await shareGeoJSON();
}

// Option 3 — cloud : c'est le menu de partage Android qui propose Drive.
function transferViaCloud() {
  closeTransferModal();
  showToast('Choisissez Drive / Cloud dans le menu de partage', 'info', 3200);
  return shareGeoJSON();
}

// Option 4 — téléchargement manuel : on revient sur la liste des parcelles et
// on met en évidence le bouton « Exporter » de la parcelle consultée.
function transferOpenDownloads() {
  const project = typeof getCurrentProjectData === 'function' ? getCurrentProjectData() : null;
  const projectId = project ? project.id : '';

  closeTransferModal();

  if (typeof isHistoryDetailOpen === 'function' && isHistoryDetailOpen()
      && typeof closeHistoryDetail === 'function') {
    closeHistoryDetail();
  }

  const selector = projectId
    ? `#historyList .btn-history-export[data-project-id="${projectId}"]`
    : '#historyList .btn-history-export';
  const button = document.querySelector(selector);
  if (!button) {
    showToast('Utilisez « Exporter » sur une parcelle de la liste', 'info', 3200);
    return;
  }

  if (typeof button.scrollIntoView === 'function') {
    button.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  const actions = button.closest('.session-actions') || button;
  actions.classList.remove('is-highlight');
  void actions.offsetWidth;              // relance l'animation
  actions.classList.add('is-highlight');
  setTimeout(() => actions.classList.remove('is-highlight'), 2000);
  if (typeof button.focus === 'function') button.focus({ preventScroll: true });
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
  // Restaure le format d'export choisi (GeoJSON par défaut) et aligne le
  // libellé du bouton principal de la section POINTS.
  initExportFormat();

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
