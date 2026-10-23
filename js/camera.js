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
let cameraFullscreenListenersBound = false;
let cameraUiFullscreen = false;
let gpsFrameLastTimestampMs = null;
let gpsFrameIntervalsMs = [];

const GPS_RATE_SAMPLE_SIZE = 12;

const CAMERA_TARGET_NEAR_M = 1.0;
const CAMERA_HALO_ALERT_M = 0.5;

// Retour d'approche : seuils métriques, hystérésis de réarmement et persistance.
const CAMERA_APPROACH_FEEDBACK_KEY = 'rtkCameraApproachFeedback';
const APPROACH_THRESHOLDS_M = [10, 5, 2, 1];
const APPROACH_HYSTERESIS_M = 0.5;
const APPROACH_BEEP_HZ = { 10: 660, 5: 880, 2: 1040, 1: 1320 };
const APPROACH_VIBRATION_MS = { 10: [40], 5: [70], 2: [90, 60, 90], 1: [140, 80, 140] };

let approachFeedbackEnabled = true;
let approachThresholdsArmed = {};
let approachAudioContext = null;
let approachFeedbackTargetId = null;

document.addEventListener('DOMContentLoaded', () => {
  // Migration : ancienne clé de seuil réglable (0,8 / 1,0 / 1,5 m), supprimée en 3.4.
  localStorage.removeItem('rtkCameraTargetNearThreshold');

  approachFeedbackEnabled = localStorage.getItem(CAMERA_APPROACH_FEEDBACK_KEY) !== '0';
  resetApproachFeedbackState();

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
  if (targetMenu) targetMenu.classList.remove('show');
}

function toggleCameraTargetMenu() {
  const menu = document.getElementById('cameraTargetMenu');
  if (!menu) return;

  const willShow = !menu.classList.contains('show');
  menu.classList.toggle('show', willShow);

  if (willShow) {
    populateTargetSelect();
    const sel = document.getElementById('targetSelect');
    if (sel) sel.focus();
  }
}

function setCameraFullscreen(enabled) {
  cameraUiFullscreen = !!enabled;
  const shouldApply = cameraUiFullscreen && APP.currentTab === 'tab-camera';
  document.body.classList.toggle('camera-ui-fullscreen', shouldApply);
  if (shouldApply) updateCameraFullscreenOffset();
  else document.documentElement.style.setProperty('--camera-fs-top-offset', '0px');

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
  if (shouldApply) updateCameraFullscreenOffset();
  else document.documentElement.style.setProperty('--camera-fs-top-offset', '0px');
}

function updateCameraFullscreenOffset() {
  const header = document.querySelector('header');
  const fixBar = document.getElementById('fixBar');
  const headerHeight = header ? header.offsetHeight : 0;
  const fixHeight = fixBar ? fixBar.offsetHeight : 0;
  const offset = headerHeight + fixHeight;
  document.documentElement.style.setProperty('--camera-fs-top-offset', `${offset}px`);
}

function bindCameraFullscreenResizeHandler() {
  if (cameraFullscreenListenersBound) return;
  cameraFullscreenListenersBound = true;

  window.addEventListener('resize', () => {
    if (cameraUiFullscreen && APP.currentTab === 'tab-camera') updateCameraFullscreenOffset();
  });
}

function isTargetSelectInteracting() {
  const sel = document.getElementById('targetSelect');
  if (!sel) return false;
  return targetSelectLocked || document.activeElement === sel;
}

async function startCamera() {
  initCompass();
  unlockApproachAudio();
  bindTargetSelectStabilityHandlers();
  bindCameraPickerOutsideClose();
  bindCameraFullscreenResizeHandler();
  populateTargetSelect();
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
  resetApproachFeedbackState();

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
  if (targetCard) targetCard.style.display = 'block';
  if (settingsCard) settingsCard.style.display = 'block';

  updateCameraPickerLabels();
  renderCameraModeSettings();
}

function renderCameraModeSettings() {
  const container = document.getElementById('cameraModeSettings');
  if (!container) return;

  const compactCompassRow = getCompassAndCoordsRowHtml();

  if (cameraMode === 'target') {
    container.innerHTML = `
      ${compactCompassRow}
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
      ${compactCompassRow}
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

// ─── RETOUR D'APPROCHE (VIBRATION + BIP) ────────────────────

function resetApproachFeedbackState() {
  approachThresholdsArmed = {};
  APPROACH_THRESHOLDS_M.forEach(threshold => {
    approachThresholdsArmed[threshold] = true;
  });
  approachFeedbackTargetId = targetPoint ? String(targetPoint.id) : null;
}

function toggleApproachFeedback() {
  approachFeedbackEnabled = !approachFeedbackEnabled;
  localStorage.setItem(CAMERA_APPROACH_FEEDBACK_KEY, approachFeedbackEnabled ? '1' : '0');

  if (approachFeedbackEnabled) {
    unlockApproachAudio();
    resetApproachFeedbackState();
  }

  updateCameraOverlay();
  showToast(
    approachFeedbackEnabled ? '🔔 Retour d\'approche activé' : '🔕 Retour d\'approche coupé',
    'info',
    1600
  );
}

function getApproachFeedbackButtonHtml() {
  const label = approachFeedbackEnabled ? 'Couper le retour d\'approche' : 'Activer le retour d\'approche';
  const icon = approachFeedbackEnabled ? '🔔' : '🔕';
  return `<button class="cam-feedback-btn ${approachFeedbackEnabled ? 'on' : 'off'}"
    onclick="toggleApproachFeedback()" title="${label}" aria-pressed="${approachFeedbackEnabled ? 'true' : 'false'}">${icon}</button>`;
}

function ensureApproachAudioContext() {
  if (approachAudioContext) return approachAudioContext;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (typeof AudioCtx !== 'function') return null;

  try {
    approachAudioContext = new AudioCtx();
  } catch (error) {
    approachAudioContext = null;
  }

  return approachAudioContext;
}

function unlockApproachAudio() {
  const ctx = ensureApproachAudioContext();
  if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
    ctx.resume().catch(() => {});
  }
}

function playApproachBeep(threshold) {
  const ctx = ensureApproachAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
    ctx.resume().catch(() => {});
  }

  const frequency = APPROACH_BEEP_HZ[threshold] || 880;
  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.18);
}

function vibrateApproach(threshold) {
  if (!navigator.vibrate) return;
  navigator.vibrate(APPROACH_VIBRATION_MS[threshold] || 60);
}

function triggerApproachFeedback(threshold) {
  playApproachBeep(threshold);
  vibrateApproach(threshold);
}

// Appelé à chaque trame GPS en mode cible : franchise descendante d'un seuil
// -> bip + vibration, réarmement seulement au-delà du seuil + hystérésis.
function processApproachFeedback(dist) {
  if (!approachFeedbackEnabled || cameraMode !== 'target' || !targetPoint) return;
  if (typeof dist !== 'number' || !Number.isFinite(dist)) return;

  if (approachFeedbackTargetId !== String(targetPoint.id)) {
    resetApproachFeedbackState();
  }

  APPROACH_THRESHOLDS_M.forEach(threshold => {
    if (dist <= threshold) {
      if (approachThresholdsArmed[threshold] !== false) {
        approachThresholdsArmed[threshold] = false;
        triggerApproachFeedback(threshold);
      }
    } else if (dist > threshold + APPROACH_HYSTERESIS_M) {
      approachThresholdsArmed[threshold] = true;
    }
  });
}

function updateCameraPickerLabels() {
  const targetLabel = document.getElementById('cameraTargetLabel');

  if (targetLabel) {
    targetLabel.textContent = targetPoint
      ? `${targetPoint.icon} ${targetPoint.type} #${targetPoint.index}`
      : 'Aucun';
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
  resetApproachFeedbackState();
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
    if (cameraMode === 'target' && targetPoint && data && data.lat && data.lon) {
      const dist = haversine(data.lat, data.lon, targetPoint.lat, targetPoint.lon);
      processApproachFeedback(dist);
    }
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
  // Option A : cap géographique fixe à l'écran (0° = nord en haut).
  const guidanceBearing = getGuidanceBearing(bearing);
  const color = getCameraColor(dist);
  const cap = getCurrentCap();
  const nearTarget = dist < CAMERA_TARGET_NEAR_M;
  const haloAlert = nearTarget && dist < CAMERA_HALO_ALERT_M;
  const distText = nearTarget ? formatCameraDistanceCm(dist) : formatCameraDistance(dist);
  const fixClass = currentPos.badgeClass || getFixMeta(currentPos.fix).badgeClass;

  overlay.innerHTML = `
    <div class="cam-overlay-content cam-overlay-target" style="position:absolute;inset:0;">
      <div class="cam-status-row">
        ${getCompassBadgeHtml()}
        <div class="cam-status-actions">
          <span class="cam-fix-badge ${fixClass}">${currentPos.fix || '—'}</span>
          ${getApproachFeedbackButtonHtml()}
        </div>
      </div>
      ${nearTarget ? `<div class="cam-target-circle ${haloAlert ? 'halo-alert' : ''}" style="--halo-color:${color}"><div class="cam-target-circle-dot"></div></div>` : ''}
      <div class="cam-arrow-wrap">
        ${nearTarget ? '' : `<div class="cam-arrow cam-arrow-target" style="transform:rotate(${guidanceBearing}deg);color:${color}">
          <span class="cam-arrow-head"></span>
          <span class="cam-arrow-shaft"></span>
        </div>`}
      </div>
      <div class="cam-distance" style="color:${color}">${distText}</div>
      <div class="camera-settings" style="width:100%;max-width:320px;">
        <div class="card-row" style="background:rgba(0,0,0,0.45);border-radius:12px;border:none;">
          <span class="card-key" style="color:rgba(255,255,255,0.7)">CAP</span>
          <span class="card-val" style="color:#fff">${formatCap(cap)}</span>
        </div>
      </div>
      <div class="cam-target-info">${targetPoint.icon} ${targetPoint.type} #${targetPoint.index} — ${targetPoint.fix}</div>
      ${nearTarget ? `<div class="cam-success">CIBLE À MOINS DE ${CAMERA_TARGET_NEAR_M.toFixed(1).replace('.', ',')} M</div>` : ''}
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
  // Option A : la flèche de mode distance suit le cap brut, sans correction boussole.
  const guidanceCap = getGuidanceBearing(cap);
  const color = getCameraColor(dist);
  const fixClass = currentPos.badgeClass || getFixMeta(currentPos.fix).badgeClass;

  overlay.innerHTML = `
    <div class="cam-overlay-content cam-overlay-distance" style="position:absolute;inset:0;">
      <div class="cam-status-row">
        ${getCompassBadgeHtml()}
        <span class="cam-fix-badge ${fixClass}">${currentPos.fix || '—'}</span>
      </div>
      <div class="cam-arrow-wrap">
        <div class="cam-arrow cam-arrow-distance" style="transform:rotate(${guidanceCap}deg);color:${color}">
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

function getGuidanceBearing(bearing) {
  if (typeof bearing !== 'number' || !Number.isFinite(bearing)) return 0;
  return ((bearing % 360) + 360) % 360;
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

function getCompassAndCoordsRowHtml() {
  const stateClass = getCompassStateClass();
  const statusText = getCompassStatusText();
  const coords = formatCurrentCameraCoords();

  const compassControl = compassPermissionState === 'needs-permission'
    ? `<button class="cam-compass-inline ${stateClass}" title="${statusText}" onclick="requestCompassPermission()">🧭</button>`
    : `<span class="cam-compass-inline ${stateClass}" title="${statusText}">🧭</span>`;

  return `
    <div class="cam-compact-row">
      ${compassControl}
      <span class="cam-coords-inline">${coords}</span>
    </div>
  `;
}

function formatCurrentCameraCoords() {
  if (!currentPos || currentPos.lat === null || currentPos.lon === null) return 'GPS: —';
  return `${fmt(currentPos.lat, 6)}, ${fmt(currentPos.lon, 6)}`;
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

// Affichage en centimètres dès l'entrée dans le seuil de proximité.
function formatCameraDistanceCm(dist) {
  return `${Math.round(dist * 100)} cm`;
}

function calcBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}
