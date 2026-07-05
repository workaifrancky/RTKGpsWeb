// ============================================================
// camera.js — Caméra et guidage visuel v2
// RTKGpsWeb v2
// ============================================================

let cameraStream = null;
let currentPos = null;
let targetPoint = null;
let cameraMode = 'target';
let compassHeading = null;
let compassPermissionState = 'unknown';
let compassReady = false;
let distanceMeasureStart = null;
let targetSelectSignature = '';
let targetSelectLocked = false;
let cameraSelectListenersBound = false;

document.addEventListener('DOMContentLoaded', () => {
  bindTargetSelectStabilityHandlers();
});

function bindTargetSelectStabilityHandlers() {
  if (cameraSelectListenersBound) return;
  const sel = document.getElementById('targetSelect');
  if (!sel) return;

  cameraSelectListenersBound = true;

  const lock = () => {
    targetSelectLocked = true;
  };

  const unlockAndRefresh = () => {
    targetSelectLocked = false;
    targetSelectSignature = '';
    if (APP.currentTab === 'tab-camera') updateCameraOverlay();
  };

  sel.addEventListener('focus', lock);
  sel.addEventListener('pointerdown', lock);
  sel.addEventListener('mousedown', lock);
  sel.addEventListener('touchstart', lock, { passive: true });
  sel.addEventListener('change', unlockAndRefresh);
  sel.addEventListener('blur', unlockAndRefresh);
}

function isTargetSelectInteracting() {
  const sel = document.getElementById('targetSelect');
  if (!sel) return false;
  return targetSelectLocked || document.activeElement === sel;
}

async function startCamera() {
  initCompass();
  bindTargetSelectStabilityHandlers();
  populateTargetSelect();
  refreshCameraModeUI();

  if (cameraStream) {
    updateCameraOverlay();
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    const video = document.getElementById('cameraVideo');
    if (video) {
      video.srcObject = cameraStream;
      video.play();
    }
    updateCameraOverlay();
  } catch (e) {
    showAlert('❌ Accès caméra refusé', 'danger');
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  const video = document.getElementById('cameraVideo');
  if (video) video.srcObject = null;
}

function initCompass() {
  if (!window.DeviceOrientationEvent) {
    compassPermissionState = 'unsupported';
    compassReady = false;
    updateCameraOverlay();
    return;
  }

  if (compassPermissionState === 'granted' && compassReady) return;

  if (typeof DeviceOrientationEvent.requestPermission !== 'function') {
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
    compassPermissionState = 'granted';
    compassReady = true;
    updateCameraOverlay();
    return;
  }

  compassPermissionState = 'needs-permission';
  updateCameraOverlay();
}

async function requestCompassPermission() {
  if (!window.DeviceOrientationEvent || typeof DeviceOrientationEvent.requestPermission !== 'function') return;

  try {
    const permission = await DeviceOrientationEvent.requestPermission();
    if (permission === 'granted') {
      window.addEventListener('deviceorientation', handleDeviceOrientation, true);
      compassPermissionState = 'granted';
      compassReady = true;
    } else {
      compassPermissionState = 'denied';
      compassReady = false;
    }
  } catch (error) {
    compassPermissionState = 'denied';
    compassReady = false;
  }

  updateCameraOverlay();
}

function handleDeviceOrientation(event) {
  if (typeof event.alpha !== 'number') return;
  compassHeading = event.alpha;
  compassReady = true;
  if (APP.currentTab === 'tab-camera') updateCameraOverlay();
}

function setMode(mode) {
  cameraMode = mode === 'distance' ? 'distance' : 'target';

  if (cameraMode === 'distance') {
    startDistanceMeasurement();
  }

  refreshCameraModeUI();
  updateCameraOverlay();
}

function refreshCameraModeUI() {
  const targetBtn = document.getElementById('btnCameraTargetMode');
  const distanceBtn = document.getElementById('btnCameraDistanceMode');
  const targetCard = document.getElementById('cameraTargetCard');
  const settingsCard = document.getElementById('cameraModeSettings');

  if (targetBtn) targetBtn.classList.toggle('active', cameraMode === 'target');
  if (distanceBtn) distanceBtn.classList.toggle('active', cameraMode === 'distance');
  if (targetCard) targetCard.style.display = cameraMode === 'target' ? 'block' : 'none';
  if (settingsCard) settingsCard.style.display = 'block';

  renderCameraModeSettings();
}

function renderCameraModeSettings() {
  const container = document.getElementById('cameraModeSettings');
  if (!container) return;

  if (cameraMode === 'target') {
    container.innerHTML = `
      <div class="card-key" style="margin-bottom:6px">BOUSSOLE</div>
      <div class="cam-status ${getCompassStateClass()}">${getCompassStatusText()}</div>
    `;
    return;
  }

  const hasStart = !!distanceMeasureStart;
  const startText = hasStart
    ? `${fmt(distanceMeasureStart.lat, 6)}, ${fmt(distanceMeasureStart.lon, 6)}`
    : 'Appuyez sur "Mesurer une distance" pour démarrer';

  container.innerHTML = `
    <div class="card-key" style="margin-bottom:6px">MESURE DE DISTANCE</div>
    <div class="camera-settings">
      <div class="cam-status ${getCompassStateClass()}">${getCompassStatusText()}</div>
      <div class="camera-target-line">Départ: ${startText}</div>
      <button class="btn-map-tool" style="width:100%" onclick="restartDistanceMeasurement()">↻ Repartir d'ici</button>
    </div>
  `;
}

function startDistanceMeasurement() {
  if (!currentPos || !currentPos.lat || !currentPos.lon) return;

  distanceMeasureStart = {
    lat: currentPos.lat,
    lon: currentPos.lon,
  };
}

function restartDistanceMeasurement() {
  if (!currentPos || !currentPos.lat || !currentPos.lon) {
    showToast('Signal GPS requis pour démarrer la mesure', 'warning');
    return;
  }

  startDistanceMeasurement();
  updateCameraOverlay();
  showToast('📏 Mesure relancée depuis la position actuelle', 'info');
}

function populateTargetSelect() {
  const sel = document.getElementById('targetSelect');
  if (!sel) return;

  // Do not rebuild the dropdown while the user is interacting with it.
  if (isTargetSelectInteracting()) return;

  const pts = getPoints();
  const selectedId = targetPoint ? String(targetPoint.id) : '';
  const signature = `${selectedId}|${pts.map(p => `${p.id}:${p.icon}:${p.type}:${p.index}:${p.fix}`).join('|')}`;

  if (signature === targetSelectSignature) return;

  targetSelectSignature = signature;
  const previousValue = sel.value;

  sel.innerHTML = '<option value="">— Sélectionnez un point cible —</option>' +
    pts.map(p => `<option value="${p.id}" ${selectedId === String(p.id) ? 'selected' : ''}>${p.icon} ${p.type} #${p.index} — ${p.fix}</option>`).join('');

  if (!selectedId && previousValue && pts.some(p => String(p.id) === previousValue)) {
    sel.value = previousValue;
  }
}

function selectTargetPoint(pointId) {
  const pts = getPoints();
  targetPoint = pts.find(p => p.id === pointId) || null;
  targetSelectSignature = '';
  populateTargetSelect();

  if (targetPoint) {
    cameraMode = 'target';
    refreshCameraModeUI();
    showToast(`🎯 Cible : ${targetPoint.type} #${targetPoint.index}`, 'info');
    updateCameraOverlay();
  }
}

function updateCameraTarget(data) {
  currentPos = data;
  if (APP.currentTab === 'tab-camera') {
    updateCameraOverlay();
  }
}

function updateCameraOverlay() {
  const overlay = document.getElementById('cameraOverlay');
  if (!overlay) return;

  if (isTargetSelectInteracting()) return;

  populateTargetSelect();
  renderCameraModeSettings();

  if (!currentPos || !currentPos.lat || !currentPos.lon) {
    overlay.innerHTML = '<div class="cam-message">En attente du signal GPS...</div>';
    return;
  }

  if (cameraMode === 'distance') {
    renderDistanceMode(overlay);
    return;
  }

  renderTargetMode(overlay);
}

function renderTargetMode(overlay) {
  if (!targetPoint) {
    overlay.innerHTML = '<div class="cam-message">Sélectionnez un point cible<br>dans l\'onglet POINTS</div>';
    return;
  }

  const dist = haversine(currentPos.lat, currentPos.lon, targetPoint.lat, targetPoint.lon);
  const bearing = calcBearing(currentPos.lat, currentPos.lon, targetPoint.lat, targetPoint.lon);
  const correctedBearing = getCorrectedBearing(bearing);
  const color = getCameraColor(dist);
  const distText = formatCameraDistance(dist);

  overlay.innerHTML = `
    <div class="cam-overlay-content cam-overlay-target" style="position:absolute;inset:0;">
      <div class="cam-status-row">
        ${getCompassBadgeHtml()}
        <span class="cam-fix-badge ${currentPos.badgeClass || getFixMeta(currentPos.fix).badgeClass}">${currentPos.fix || '—'}</span>
      </div>
      <div class="cam-arrow-wrap">
        ${dist < 0.05 ? '<div class="cam-crosshair">✛</div>' : `<div class="cam-arrow" style="transform:rotate(${correctedBearing}deg);color:${color}">▲</div>`}
      </div>
      <div class="cam-distance" style="color:${color}">${distText}</div>
      <div class="cam-target-info">${targetPoint.icon} ${targetPoint.type} #${targetPoint.index} — ${targetPoint.fix}</div>
      ${dist < 0.05 ? '<div class="cam-success">✅ POSITION ATTEINTE</div>' : ''}
    </div>
  `;
}

function renderDistanceMode(overlay) {
  if (!distanceMeasureStart) {
    overlay.innerHTML = '<div class="cam-message">Appuyez sur "Mesurer une distance"<br>pour définir le point de départ</div>';
    return;
  }

  const dist = haversine(distanceMeasureStart.lat, distanceMeasureStart.lon, currentPos.lat, currentPos.lon);
  const cap = getCurrentCap();
  const correctedCap = typeof cap === 'number' ? getCorrectedBearing(cap) : 0;
  const color = getCameraColor(dist);

  overlay.innerHTML = `
    <div class="cam-overlay-content cam-overlay-distance" style="position:absolute;inset:0;">
      <div class="cam-status-row">
        ${getCompassBadgeHtml()}
        <span class="cam-fix-badge ${currentPos.badgeClass || getFixMeta(currentPos.fix).badgeClass}">${currentPos.fix || '—'}</span>
      </div>
      <div class="cam-arrow-wrap">
        <div class="cam-arrow" style="transform:rotate(${correctedCap}deg);color:${color}">▲</div>
      </div>
      <div class="cam-distance" style="color:${color}">${formatCameraDistance(dist)}</div>
      <div class="cam-target-info">Distance parcourue depuis le départ</div>
      <div class="camera-settings" style="width:100%;max-width:320px;">
        <div class="card-row" style="background:rgba(0,0,0,0.45);border-radius:12px;border:none;">
          <span class="card-key" style="color:rgba(255,255,255,0.7)">CAP</span>
          <span class="card-val" style="color:#fff">${formatCap(cap)}</span>
        </div>
        <div class="card-row" style="background:rgba(0,0,0,0.45);border-radius:12px;border:none;">
          <span class="card-key" style="color:rgba(255,255,255,0.7)">DÉPART</span>
          <span class="card-val" style="color:#fff">${fmt(distanceMeasureStart.lat, 5)}, ${fmt(distanceMeasureStart.lon, 5)}</span>
        </div>
      </div>
    </div>
  `;
}

function getCurrentCap() {
  if (currentPos && typeof currentPos.course === 'number' && Number.isFinite(currentPos.course)) {
    return ((currentPos.course % 360) + 360) % 360;
  }

  if (compassReady && typeof compassHeading === 'number' && Number.isFinite(compassHeading)) {
    return ((compassHeading % 360) + 360) % 360;
  }

  return null;
}

function formatCap(cap) {
  if (typeof cap !== 'number' || !Number.isFinite(cap)) return '—';
  return `${cap.toFixed(0)}°`;
}

function getCorrectedBearing(bearing) {
  if (compassReady && typeof compassHeading === 'number') {
    return (bearing - compassHeading + 360) % 360;
  }
  return bearing;
}

function getCompassBadgeHtml() {
  if (compassPermissionState === 'granted' && compassReady) {
    return '<span class="cam-compass cam-compass-ok">🧭 Boussole active</span>';
  }

  if (compassPermissionState === 'needs-permission') {
    return '<button class="cam-compass cam-compass-warn" onclick="requestCompassPermission()">Activer la boussole</button>';
  }

  return '<span class="cam-compass cam-compass-warn">⚠ Boussole indisponible — direction géographique</span>';
}

function getCompassStateClass() {
  return compassPermissionState === 'granted' && compassReady ? 'ok' : 'warn';
}

function getCompassStatusText() {
  if (compassPermissionState === 'granted' && compassReady) return '🧭 Boussole active';
  if (compassPermissionState === 'needs-permission') return '⚠ Boussole requiert une permission';
  if (compassPermissionState === 'unsupported') return '⚠ Boussole indisponible — direction géographique';
  if (compassPermissionState === 'denied') return '⚠ Boussole refusée — direction géographique';
  return '⚠ Boussole indisponible — direction géographique';
}

function getCameraColor(dist) {
  if (dist < 0.05) return '#16a34a';
  if (dist < 0.20) return '#d97706';
  if (dist < 1) return '#2563eb';
  return '#dc2626';
}

function formatCameraDistance(dist) {
  if (dist < 1) return `${(dist * 100).toFixed(0)} cm`;
  return `${dist.toFixed(2)} m`;
}

function calcBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}
