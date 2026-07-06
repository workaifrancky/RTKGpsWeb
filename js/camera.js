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
let cameraPickerListenersBound = false;
let cameraUiFullscreen = false;
let gpsFrameLastTimestampMs = null;
let gpsFrameIntervalsMs = [];

const GPS_RATE_SAMPLE_SIZE = 12;

const CAMERA_TARGET_NEAR_KEY = 'rtkCameraTargetNearThreshold';
let targetNearThresholdMeters = 1.5;

document.addEventListener('DOMContentLoaded', () => {
  const savedThreshold = parseFloat(localStorage.getItem(CAMERA_TARGET_NEAR_KEY));
  if ([0.8, 1.0, 1.5].includes(savedThreshold)) {
    targetNearThresholdMeters = savedThreshold;
  }

  bindTargetSelectStabilityHandlers();
  bindCameraPickerOutsideClose();
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

function bindCameraPickerOutsideClose() {
  if (cameraPickerListenersBound) return;
  cameraPickerListenersBound = true;

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('.camera-picker-card')) return;
    closeCameraMenus();
  });
}

function closeCameraMenus() {
  const targetMenu = document.getElementById('cameraTargetMenu');
  const thresholdMenu = document.getElementById('cameraThresholdMenu');
  if (targetMenu) targetMenu.classList.remove('show');
  if (thresholdMenu) thresholdMenu.classList.remove('show');
}

function toggleCameraTargetMenu() {
  const menu = document.getElementById('cameraTargetMenu');
  const other = document.getElementById('cameraThresholdMenu');
  if (!menu) return;

  if (other) other.classList.remove('show');
  const willShow = !menu.classList.contains('show');
  menu.classList.toggle('show', willShow);

  if (willShow) {
    populateTargetSelect();
    const sel = document.getElementById('targetSelect');
    if (sel) sel.focus();
  }
}

function toggleCameraThresholdMenu() {
  const menu = document.getElementById('cameraThresholdMenu');
  const other = document.getElementById('cameraTargetMenu');
  if (!menu) return;

  if (other) other.classList.remove('show');
  menu.classList.toggle('show');
}

function setCameraFullscreen(enabled) {
  cameraUiFullscreen = !!enabled;
  document.body.classList.toggle('camera-ui-fullscreen', cameraUiFullscreen && APP.currentTab === 'tab-camera');

  const btn = document.getElementById('btnCameraFullscreen');
  if (btn) {
    btn.textContent = cameraUiFullscreen ? '🗗' : '⛶';
    btn.title = cameraUiFullscreen ? 'Quitter le plein écran' : 'Passer en plein écran';
    btn.setAttribute('aria-pressed', cameraUiFullscreen ? 'true' : 'false');
  }
}

function toggleCameraFullscreen() {
  setCameraFullscreen(!cameraUiFullscreen);
}

function syncCameraFullscreenForTab() {
  const shouldApply = cameraUiFullscreen && APP.currentTab === 'tab-camera';
  document.body.classList.toggle('camera-ui-fullscreen', shouldApply);
}

function isTargetSelectInteracting() {
  const sel = document.getElementById('targetSelect');
  if (!sel) return false;
  return targetSelectLocked || document.activeElement === sel;
}

async function startCamera() {
  initCompass();
  bindTargetSelectStabilityHandlers();
  bindCameraPickerOutsideClose();
  populateTargetSelect();
  renderCameraThresholdMenu();
  updateCameraPickerLabels();
  refreshCameraModeUI();
  syncCameraFullscreenForTab();

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
  closeCameraMenus();
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
  const thresholdCard = document.getElementById('cameraThresholdCard');
  const settingsCard = document.getElementById('cameraModeSettings');

  if (targetBtn) targetBtn.classList.toggle('active', cameraMode === 'target');
  if (distanceBtn) distanceBtn.classList.toggle('active', cameraMode === 'distance');
  if (targetCard) targetCard.style.display = 'block';
  if (thresholdCard) thresholdCard.style.display = 'block';
  if (settingsCard) settingsCard.style.display = 'block';

  renderCameraThresholdMenu();
  updateCameraPickerLabels();
  renderCameraModeSettings();
}

function renderCameraModeSettings() {
  const container = document.getElementById('cameraModeSettings');
  if (!container) return;

  const gpsRefreshHtml = getGpsRefreshDebugHtml();

  if (cameraMode === 'target') {
    container.innerHTML = `
      <div class="card-key" style="margin-bottom:6px">BOUSSOLE</div>
      <div class="cam-status ${getCompassStateClass()}">${getCompassStatusText()}</div>
      ${gpsRefreshHtml}
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
      ${gpsRefreshHtml}
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

function setTargetNearThreshold(value) {
  const next = typeof value === 'number' ? value : parseFloat(value);
  if (![0.8, 1.0, 1.5].includes(next)) return;

  targetNearThresholdMeters = next;
  localStorage.setItem(CAMERA_TARGET_NEAR_KEY, String(next));

  updateCameraPickerLabels();
  renderCameraThresholdMenu();
  updateCameraOverlay();
  showToast(`Seuil cible: ${next.toFixed(1).replace('.', ',')} m`, 'info', 1600);
}

function renderCameraThresholdMenu() {
  const menu = document.getElementById('cameraThresholdMenu');
  if (!menu) return;

  const buttons = [0.8, 1.0, 1.5].map(v => {
    const active = Math.abs(v - targetNearThresholdMeters) < 0.001 ? 'active' : '';
    return `<button class="btn-map-tool cam-threshold-btn ${active}" onclick="setTargetNearThreshold(${v});closeCameraMenus();">${v.toFixed(1).replace('.', ',')} m</button>`;
  }).join('');

  menu.innerHTML = `<div class="cam-threshold-row">${buttons}</div>`;
}

function updateCameraPickerLabels() {
  const targetLabel = document.getElementById('cameraTargetLabel');
  const thresholdLabel = document.getElementById('cameraThresholdLabel');

  if (targetLabel) {
    targetLabel.textContent = targetPoint
      ? `${targetPoint.icon} ${targetPoint.type} #${targetPoint.index}`
      : 'Aucun';
  }

  if (thresholdLabel) {
    thresholdLabel.textContent = `${targetNearThresholdMeters.toFixed(1).replace('.', ',')} m`;
  }
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

  updateCameraPickerLabels();
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
  }

  closeCameraMenus();
  updateCameraPickerLabels();
  updateCameraOverlay();
}

function updateCameraTarget(data) {
  registerGpsFrameTimestamp(data);
  currentPos = data;
  if (APP.currentTab === 'tab-camera') {
    updateCameraOverlay();
  }
}

function registerGpsFrameTimestamp(data) {
  const receivedTs = data && data.receivedAt ? Date.parse(data.receivedAt) : NaN;
  const now = Number.isFinite(receivedTs) ? receivedTs : Date.now();

  if (Number.isFinite(gpsFrameLastTimestampMs)) {
    const delta = now - gpsFrameLastTimestampMs;
    // Filter out obviously invalid gaps to keep the indicator stable.
    if (delta > 10 && delta < 10000) {
      gpsFrameIntervalsMs.push(delta);
      if (gpsFrameIntervalsMs.length > GPS_RATE_SAMPLE_SIZE) {
        gpsFrameIntervalsMs.shift();
      }
    }
  }

  gpsFrameLastTimestampMs = now;
}

function getGpsRefreshStats() {
  if (!Number.isFinite(gpsFrameLastTimestampMs) || gpsFrameIntervalsMs.length === 0) {
    return { hzText: '—', intervalText: '—', ageMs: null };
  }

  const avgMs = gpsFrameIntervalsMs.reduce((sum, v) => sum + v, 0) / gpsFrameIntervalsMs.length;
  const hz = 1000 / avgMs;
  const hzDecimals = hz >= 10 ? 1 : 2;

  return {
    hzText: `${hz.toFixed(hzDecimals).replace('.', ',')} Hz`,
    intervalText: `${Math.round(avgMs)} ms`,
    ageMs: Date.now() - gpsFrameLastTimestampMs,
  };
}

function getGpsRefreshDebugHtml() {
  const stats = getGpsRefreshStats();
  const freshness = stats.ageMs !== null && stats.ageMs > 3000
    ? `<span style="color:#fca5a5">(dernier point il y a ${Math.round(stats.ageMs / 1000)} s)</span>`
    : '';

  return `
    <div class="card-row" style="margin-top:8px;background:rgba(0,0,0,0.35);border-radius:10px;border:none;padding:8px 10px;">
      <span class="card-key" style="color:rgba(255,255,255,0.7)">GPS</span>
      <span class="card-val" style="color:#fff;font-size:12px">${stats.hzText} • ${stats.intervalText} ${freshness}</span>
    </div>
  `;
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
  const cap = getCurrentCap();
  const nearTarget = dist < targetNearThresholdMeters;

  overlay.innerHTML = `
    <div class="cam-overlay-content cam-overlay-target" style="position:absolute;inset:0;">
      <div class="cam-status-row">
        ${getCompassBadgeHtml()}
        <span class="cam-fix-badge ${currentPos.badgeClass || getFixMeta(currentPos.fix).badgeClass}">${currentPos.fix || '—'}</span>
      </div>
      ${nearTarget ? '<div class="cam-target-circle"><div class="cam-target-circle-dot"></div></div>' : ''}
      <div class="cam-arrow-wrap">
        <div class="cam-arrow" style="transform:rotate(${correctedBearing}deg);color:${color}">
          <span class="cam-arrow-head"></span>
          <span class="cam-arrow-shaft"></span>
        </div>
      </div>
      <div class="cam-distance" style="color:${color}">${distText}</div>
      <div class="camera-settings" style="width:100%;max-width:320px;">
        <div class="card-row" style="background:rgba(0,0,0,0.45);border-radius:12px;border:none;">
          <span class="card-key" style="color:rgba(255,255,255,0.7)">CAP</span>
          <span class="card-val" style="color:#fff">${formatCap(cap)}</span>
        </div>
      </div>
      <div class="cam-target-info">${targetPoint.icon} ${targetPoint.type} #${targetPoint.index} — ${targetPoint.fix}</div>
      ${nearTarget ? `<div class="cam-success">CIBLE À MOINS DE ${targetNearThresholdMeters.toFixed(1).replace('.', ',')} M</div>` : ''}
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
        <div class="cam-arrow" style="transform:rotate(${correctedCap}deg);color:${color}">
          <span class="cam-arrow-head"></span>
          <span class="cam-arrow-shaft"></span>
        </div>
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
