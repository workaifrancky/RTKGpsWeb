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
let distanceModeReference = null;
let distanceTargetMeters = 1;
let targetSelectSignature = '';

const CAMERA_DISTANCE_KEY = 'rtkCameraDistanceTarget';

document.addEventListener('DOMContentLoaded', () => {
  const saved = parseFloat(localStorage.getItem(CAMERA_DISTANCE_KEY));
  if (!Number.isNaN(saved) && saved >= 1 && saved <= 50) {
    distanceTargetMeters = saved;
  }
});

async function startCamera() {
  initCompass();
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

  const pts = getPoints();
  if (!distanceModeReference || !pts.find(p => p.id === distanceModeReference.id)) {
    distanceModeReference = pts.length > 0 ? pts[pts.length - 1] : null;
  }

  const refLabel = distanceModeReference
    ? `${distanceModeReference.icon} ${distanceModeReference.type} #${distanceModeReference.index}`
    : 'Aucun point de référence';

  container.innerHTML = `
    <div class="card-key" style="margin-bottom:6px">MESURE DE DISTANCE</div>
    <div class="camera-settings">
      <div class="cam-status ${getCompassStateClass()}">${getCompassStatusText()}</div>
      <div class="camera-slider-row">
        <input id="distanceSlider" class="camera-slider" type="range" min="1" max="50" step="0.5" value="${distanceTargetMeters}" oninput="setDistanceTarget(this.value)">
        <div class="camera-slider-value">${distanceTargetMeters.toFixed(1)} m</div>
      </div>
      <div class="camera-target-line">Référence: ${refLabel}</div>
    </div>
  `;
}

function populateTargetSelect() {
  const sel = document.getElementById('targetSelect');
  if (!sel) return;

  // Do not rebuild the dropdown while the user is interacting with it.
  if (document.activeElement === sel) return;

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
  const pts = getPoints();
  if (!pts.length) {
    overlay.innerHTML = '<div class="cam-message">Aucun point de référence disponible<br>enregistrez d\'abord un point</div>';
    return;
  }

  distanceModeReference = pts[pts.length - 1];
  const dist = haversine(currentPos.lat, currentPos.lon, distanceModeReference.lat, distanceModeReference.lon);
  const bearing = calcBearing(distanceModeReference.lat, distanceModeReference.lon, currentPos.lat, currentPos.lon);
  const correctedBearing = getCorrectedBearing(bearing);
  const progress = Math.min((dist / distanceTargetMeters) * 100, 100);
  const color = dist >= distanceTargetMeters ? '#16a34a' : getCameraColor(dist);
  const ringDegrees = Math.max(0, Math.min(progress, 100)) * 3.6;
  const reached = dist >= distanceTargetMeters;

  overlay.innerHTML = `
    <div class="cam-overlay-content cam-overlay-distance" style="position:absolute;inset:0;">
      <div class="cam-status-row">
        ${getCompassBadgeHtml()}
        <span class="cam-fix-badge ${currentPos.badgeClass || getFixMeta(currentPos.fix).badgeClass}">${currentPos.fix || '—'}</span>
      </div>
      <div class="cam-distance-ring" style="background:conic-gradient(${color} 0deg ${ringDegrees}deg, rgba(255,255,255,0.12) ${ringDegrees}deg 360deg); border-color:${color}">
        <div class="cam-distance-ring-inner">
          <div class="cam-gauge-value cam-distance" style="color:${color};font-size:24px;">${formatCameraDistance(dist)}</div>
          <div class="cam-ref-label">Réf. ${distanceModeReference.icon} ${distanceModeReference.type} #${distanceModeReference.index}</div>
        </div>
      </div>
      <div class="cam-arrow-wrap">
        <div class="cam-arrow" style="transform:rotate(${correctedBearing}deg);color:${color}">▲</div>
      </div>
      <div class="cam-distance-target">Cible : <span>${distanceTargetMeters.toFixed(1)} m</span></div>
      <div class="camera-slider-row" style="width:100%;justify-content:center;">
        <input id="distanceSlider" class="camera-slider" type="range" min="1" max="50" step="0.5" value="${distanceTargetMeters}" oninput="setDistanceTarget(this.value)">
      </div>
      <div class="camera-slider-value">${distanceTargetMeters.toFixed(1)} m</div>
      ${reached ? '<div class="cam-success">DISTANCE ATTEINTE — enregistrez le point</div><button class="cam-save-btn" onclick="recordPointHere()">Enregistrer ici</button>' : ''}
    </div>
  `;
}

function updateDistanceBar() {
  const slider = document.getElementById('distanceSlider');
  if (slider) slider.value = distanceTargetMeters;
  updateCameraOverlay();
}

function setDistanceTarget(value) {
  const next = Math.min(50, Math.max(1, parseFloat(value) || 1));
  distanceTargetMeters = next;
  localStorage.setItem(CAMERA_DISTANCE_KEY, String(next));
  updateDistanceBar();
}

function recordPointHere() {
  if (typeof buildPoint !== 'function' || typeof savePoint !== 'function') {
    showToast('Enregistrement indisponible', 'error');
    return;
  }

  const pt = buildPoint('obstacle', 'Perso', '📍');
  savePoint(pt);
  distanceModeReference = pt;
  updateCameraOverlay();
  showToast('📍 Point enregistré ici', 'tonte');
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
