// ============================================================
// camera.js — Caméra et guidage visuel v2
// RTKGpsWeb v2
// ============================================================

let cameraStream = null;
let currentPos = null;
let targetPoint = null;
let cameraMode = null;
let compassHeading = null;
let compassPermissionState = 'unknown';
let compassReady = false;
let distanceMeasureStart = null;
let targetSelectSignature = '';
let targetSelectLocked = false;
let cameraSelectListenersBound = false;
let cameraPickerListenersBound = false;
let cameraFabListenersBound = false;
let cameraFullscreenListenersBound = false;
let cameraUiFullscreen = false;
let gpsFrameLastTimestampMs = null;
let gpsFrameIntervalsMs = [];

let deviceBeta = 45;  // inclinaison avant/arrière (0 = à plat, 90 = vertical)
let deviceGamma = 0;  // inclinaison gauche/droite

const CAMERA_3D_BASE_TILT = { arrow: 30, circle: 55 };
const CAMERA_3D_BETA_NEUTRAL = 45;
const CAMERA_3D_BETA_RATIO = 0.4;
const CAMERA_3D_ROLL_RATIO = 0.4;
const CAMERA_3D_ROLL_MAX = 25;

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

// Guidage vocal (option A) : annonces mains libres de la distance et de la
// direction vers la cible. Désactivé par défaut (opt-in) et persisté.
const CAMERA_VOICE_KEY = 'rtkCameraVoiceGuidance';
const VOICE_ARRIVAL_M = CAMERA_HALO_ALERT_M;   // « Cible atteinte » sous 50 cm
const VOICE_ARRIVAL_REARM_M = 1.5;             // réarmement si on s'éloigne
const VOICE_STRAIGHT_TOLERANCE_DEG = 20;       // « tout droit » dans cet écart
const VOICE_ARRIVAL_CHORD_HZ = [523.25, 659.25, 783.99]; // do majeur (C5-E5-G5)

let voiceGuidanceEnabled = false;
let voiceThresholdsArmed = {};
let voiceTargetId = null;
let voiceArrivalAnnounced = false;

document.addEventListener('DOMContentLoaded', () => {
  // Migration : ancienne clé de seuil réglable (0,8 / 1,0 / 1,5 m), supprimée en 3.4.
  localStorage.removeItem('rtkCameraTargetNearThreshold');

  approachFeedbackEnabled = localStorage.getItem(CAMERA_APPROACH_FEEDBACK_KEY) !== '0';
  resetApproachFeedbackState();

  initVoiceGuidance();

  bindTargetSelectStabilityHandlers();
  bindCameraPickerOutsideClose();
  initCameraFab();
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
    closeCameraFabMenu();
    populateTargetSelect();
    const sel = document.getElementById('targetSelect');
    if (sel) sel.focus();
  }
}

// ─── FAB CAMÉRA (composant partagé avec TRACÉS) ─────────────
// Même gestuelle : neutre = menu, coloré = action du mode, « ✓ » = quitter,
// appui long = rouvrir le menu. Aucun contrôle ne consomme de hauteur.
const CAMERA_MODE_LABELS = {
  target:   'Rejoindre un point',
  distance: 'Mesurer une distance',
};

function syncCameraFabUI() {
  const fab = document.getElementById('cameraFab');
  if (!fab) return;

  const onCameraTab = typeof APP !== 'undefined' && APP.currentTab === 'tab-camera';
  fab.hidden = !onCameraTab;
  if (!onCameraTab) {
    closeCameraFabMenu();
    return;
  }

  const main = document.getElementById('cameraFabMain');
  const secondary = document.getElementById('cameraFabSecondary');

  if (main) {
    main.className = `trace-fab-main ${cameraMode || 'neutral'}`;
    main.innerHTML = cameraMode === 'target' ? ICON_CROSSHAIR
      : cameraMode === 'distance' ? ICON_RULER
      : ICON_PLUS;
    main.title = cameraMode
      ? `${CAMERA_MODE_LABELS[cameraMode]} (appui long : menu)`
      : 'Choisir un mode caméra';
    main.setAttribute('aria-label', main.title);
  }

  if (secondary) {
    secondary.hidden = !cameraMode;
    secondary.title = 'Quitter le mode caméra (appui long : menu)';
    secondary.setAttribute('aria-label', 'Quitter le mode caméra');
  }
}

function openCameraFabMenu() {
  const menu = document.getElementById('cameraFabMenu');
  const main = document.getElementById('cameraFabMain');
  if (!menu) return;
  closeCameraMenus();
  menu.classList.add('show');
  menu.setAttribute('aria-hidden', 'false');
  if (main) main.setAttribute('aria-expanded', 'true');
}

function closeCameraFabMenu() {
  const menu = document.getElementById('cameraFabMenu');
  const main = document.getElementById('cameraFabMain');
  if (menu) {
    menu.classList.remove('show');
    menu.setAttribute('aria-hidden', 'true');
  }
  if (main) main.setAttribute('aria-expanded', 'false');
}

function toggleCameraFabMenu() {
  const menu = document.getElementById('cameraFabMenu');
  if (!menu) return;
  if (menu.classList.contains('show')) closeCameraFabMenu();
  else openCameraFabMenu();
}

function chooseCameraMode(mode) {
  setMode(mode);
}

function exitCameraMode() {
  if (!cameraMode) return;
  cameraMode = null;
  resetApproachFeedbackState();
  closeCameraFabMenu();
  closeCameraMenus();
  refreshCameraModeUI();
  updateCameraOverlay();
}

function onCameraFabMainClick() {
  const menu = document.getElementById('cameraFabMenu');
  if (menu && menu.classList.contains('show')) {
    closeCameraFabMenu();
    return;
  }

  if (!cameraMode) {
    openCameraFabMenu();
    return;
  }

  if (cameraMode === 'target') {
    closeCameraMenus();
    toggleCameraTargetMenu();
    return;
  }

  if (cameraMode === 'distance') restartDistanceMeasurement();
}

function initCameraFab() {
  if (cameraFabListenersBound) return;
  const main = document.getElementById('cameraFabMain');
  const secondary = document.getElementById('cameraFabSecondary');
  if (!main || !secondary) return;
  cameraFabListenersBound = true;

  const bindLongPress = (el, longAction, clickAction) => {
    let timer = null;
    let longFired = false;

    const clear = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    el.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      longFired = false;
      clear();
      timer = setTimeout(() => {
        timer = null;
        longFired = true;
        longAction();
      }, 550);
    });

    ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => {
      el.addEventListener(evt, clear);
    });

    el.addEventListener('click', event => {
      if (longFired) {
        longFired = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      clickAction();
    });
  };

  bindLongPress(main, openCameraFabMenu, onCameraFabMainClick);
  bindLongPress(secondary, openCameraFabMenu, exitCameraMode);

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest('#cameraFab')) closeCameraFabMenu();
  });

  syncCameraFabUI();
}

function setCameraFullscreen(enabled) {
  cameraUiFullscreen = !!enabled;
  const shouldApply = cameraUiFullscreen && APP.currentTab === 'tab-camera';
  if (shouldApply && typeof closeProjectDrawer === 'function') closeProjectDrawer();
  document.body.classList.toggle('camera-ui-fullscreen', shouldApply);
  if (shouldApply) updateCameraFullscreenOffset();
  else document.documentElement.style.setProperty('--camera-fs-top-offset', '0px');

  const btn = document.getElementById('btnCameraFullscreen');
  if (btn) {
    btn.innerHTML = cameraUiFullscreen ? ICON_MINIMIZE : ICON_MAXIMIZE;
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
  // Le plein écran caméra masque aussi le header et la barre GPS : la
  // caméra démarre donc tout en haut de la fenêtre (comme la carte).
  document.documentElement.style.setProperty('--camera-fs-top-offset', '0px');
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
  initCameraFab();
  populateTargetSelect();
  updateCameraPickerLabels();
  refreshCameraModeUI();
  syncCameraFullscreenForTab();
  syncCameraFabUI();

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
  closeCameraFabMenu();
  // Quitter l'onglet CAMÉRA coupe une annonce en cours.
  stopVoiceGuidance();
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
  if (typeof event.alpha === 'number') compassHeading = event.alpha;
  if (typeof event.beta === 'number') deviceBeta = event.beta;
  if (typeof event.gamma === 'number') deviceGamma = event.gamma;
  compassReady = true;
  if (APP.currentTab === 'tab-camera') updateCameraOverlay();
}

function clampCamera3D(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Transformation du plan de guidage : l'inclinaison suit beta (avant/arrière)
// et gamma (roulis gauche/droite), autour d'un angle de base propre à l'élément.
function getCameraSceneTransform(baseTilt) {
  const tiltX = clampCamera3D(
    baseTilt + (deviceBeta - CAMERA_3D_BETA_NEUTRAL) * CAMERA_3D_BETA_RATIO,
    10,
    85
  );
  const rollZ = clampCamera3D(
    deviceGamma * CAMERA_3D_ROLL_RATIO,
    -CAMERA_3D_ROLL_MAX,
    CAMERA_3D_ROLL_MAX
  );

  return `perspective(700px) rotateX(${tiltX.toFixed(1)}deg) rotateZ(${rollZ.toFixed(1)}deg)`;
}

function setMode(mode) {
  cameraMode = mode === 'distance' ? 'distance' : 'target';
  resetApproachFeedbackState();
  closeCameraFabMenu();
  if (cameraMode !== 'target') closeCameraMenus();

  if (cameraMode === 'distance') {
    startDistanceMeasurement();
  }

  refreshCameraModeUI();
  updateCameraOverlay();
}

function refreshCameraModeUI() {
  const targetCard = document.getElementById('cameraTargetCard');
  const settingsCard = document.getElementById('cameraModeSettings');

  // La cible n'est utile qu'en mode « Rejoindre un point ».
  if (targetCard) targetCard.hidden = cameraMode !== 'target';
  if (settingsCard) settingsCard.hidden = false;

  updateCameraPickerLabels();
  renderCameraModeSettings();
  syncCameraFabUI();
}

function renderCameraModeSettings() {
  const container = document.getElementById('cameraModeSettings');
  if (!container) return;

  const compactCompassRow = getCompassAndCoordsRowHtml();

  // Mode inactif ou guidage : le HUD n'affiche que boussole + coordonnées.
  if (!cameraMode || cameraMode === 'target') {
    container.innerHTML = compactCompassRow;
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
  // Le guidage vocal suit les mêmes points de réinitialisation (cible, mode).
  resetVoiceGuidanceState();
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

// ─── GUIDAGE VOCAL (OPTION A) ───────────────────────────────

function isVoiceGuidanceSupported() {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof window.SpeechSynthesisUtterance === 'function';
}

function initVoiceGuidance() {
  try {
    voiceGuidanceEnabled = localStorage.getItem(CAMERA_VOICE_KEY) === '1';
  } catch (error) {
    voiceGuidanceEnabled = false;
  }
  resetVoiceGuidanceState();
  syncVoiceGuidanceUI();
}

function syncVoiceGuidanceUI() {
  const btn = document.getElementById('btnCameraVoice');
  if (!btn) return;

  btn.innerHTML = voiceGuidanceEnabled ? ICON_VOLUME_ON : ICON_VOLUME_OFF;
  btn.classList.toggle('on', voiceGuidanceEnabled);
  btn.classList.toggle('off', !voiceGuidanceEnabled);

  const label = voiceGuidanceEnabled ? 'Couper le guidage vocal' : 'Activer le guidage vocal';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-pressed', voiceGuidanceEnabled ? 'true' : 'false');
}

function toggleCameraVoiceGuidance() {
  if (!isVoiceGuidanceSupported()) {
    showToast('Guidage vocal indisponible sur cet appareil', 'warning', 2600);
    return;
  }

  voiceGuidanceEnabled = !voiceGuidanceEnabled;
  try {
    localStorage.setItem(CAMERA_VOICE_KEY, voiceGuidanceEnabled ? '1' : '0');
  } catch (error) {
    // Stockage plein : le réglage reste valable pour la session en cours.
  }

  resetVoiceGuidanceState();
  syncVoiceGuidanceUI();

  if (voiceGuidanceEnabled) {
    unlockApproachAudio();
    speak('Guidage vocal activé');
  } else {
    stopVoiceGuidance();
  }

  showToast(
    voiceGuidanceEnabled ? 'Guidage vocal activé' : 'Guidage vocal coupé',
    'info',
    1600
  );
}

// Annonce vocale en français. `cancel()` remplace l'annonce en cours : la
// distance la plus récente est toujours celle qui est prononcée.
function speak(text) {
  if (!voiceGuidanceEnabled || !text || !isVoiceGuidanceSupported()) return;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.lang = 'fr-FR';
    utterance.rate = 1.05;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    // Synthèse indisponible : le guidage visuel reste seul actif.
  }
}

function stopVoiceGuidance() {
  if (!isVoiceGuidanceSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch (error) {
    // Rien à arrêter.
  }
}

function resetVoiceGuidanceState() {
  voiceThresholdsArmed = {};
  APPROACH_THRESHOLDS_M.forEach(threshold => {
    voiceThresholdsArmed[threshold] = true;
  });
  voiceTargetId = targetPoint ? String(targetPoint.id) : null;
  voiceArrivalAnnounced = false;
}

// « gauche » / « droite » / « tout droit » d'après l'écart entre le cap
// géographique de la cible et le cap courant (GPS ou boussole).
function getVoiceDirection(bearing, cap) {
  if (typeof cap !== 'number' || !Number.isFinite(cap)) return null;
  const delta = ((bearing - cap + 540) % 360) - 180;
  if (delta > VOICE_STRAIGHT_TOLERANCE_DEG) return 'droite';
  if (delta < -VOICE_STRAIGHT_TOLERANCE_DEG) return 'gauche';
  return 'tout droit';
}

function buildVoiceThresholdMessage(threshold, bearing, cap) {
  const metres = `${threshold} mètre${threshold > 1 ? 's' : ''}`;
  const direction = getVoiceDirection(bearing, cap);

  if (direction === 'gauche') return `Tournez à gauche, ${metres}`;
  if (direction === 'droite') return `Tournez à droite, ${metres}`;
  if (direction === 'tout droit') return `Cible à ${metres}, continuez tout droit`;
  return `Cible à ${metres}`;
}

// Accord majeur de réussite (Web Audio) : court arpège do-mi-sol.
function playSuccessChord() {
  const ctx = ensureApproachAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  VOICE_ARRIVAL_CHORD_HZ.forEach((frequency, index) => {
    const startAt = now + index * 0.09;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.5);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.52);
  });
}

// Appelé à chaque rendu du mode cible : annonce d'un seuil franchi
// (10 / 5 / 2 / 1 m) puis « Cible atteinte » sous 0,5 m, une seule fois.
function processVoiceGuidance(dist, bearing) {
  if (!voiceGuidanceEnabled || cameraMode !== 'target' || !targetPoint) return;
  if (typeof dist !== 'number' || !Number.isFinite(dist)) return;

  if (voiceTargetId !== String(targetPoint.id)) resetVoiceGuidanceState();

  const cap = getCurrentCap();

  if (dist < VOICE_ARRIVAL_M) {
    if (!voiceArrivalAnnounced) {
      voiceArrivalAnnounced = true;
      speak('Cible atteinte');
      playSuccessChord();
    }
    return;
  }

  if (voiceArrivalAnnounced && dist > VOICE_ARRIVAL_REARM_M) voiceArrivalAnnounced = false;

  APPROACH_THRESHOLDS_M.forEach(threshold => {
    if (dist <= threshold) {
      if (voiceThresholdsArmed[threshold] !== false) {
        voiceThresholdsArmed[threshold] = false;
        speak(buildVoiceThresholdMessage(threshold, bearing, cap));
      }
    } else if (dist > threshold + APPROACH_HYSTERESIS_M) {
      voiceThresholdsArmed[threshold] = true;
    }
  });
}

function updateCameraPickerLabels() {
  const targetLabel = document.getElementById('cameraTargetLabel');

  if (targetLabel) {
    // Icône Lucide du type d'obstacle (repli épingle) : plus d'emoji affiché.
    targetLabel.innerHTML = targetPoint
      ? `<span class="obstacle-type-icon" aria-hidden="true">${getObstacleIconMarkup(targetPoint.subtype)}</span>`
        + `${getObstacleTypeLabel(targetPoint.subtype) || targetPoint.type} #${targetPoint.index}`
      : 'Aucun';
  }
}

function populateTargetSelect() {
  const sel = document.getElementById('targetSelect');
  if (!sel) return;

  // Do not rebuild the dropdown while the user is interacting with it.
  if (isTargetSelectInteracting()) return;

  // Seuls les obstacles sont des lieux physiques à rejoindre.
  const pts = getPoints().filter(p => p.type === 'obstacle');
  const selectedId = targetPoint ? String(targetPoint.id) : '';
  // Plus d'emoji dans les options (un `<option>` ne peut pas contenir de SVG) :
  // le libellé repose sur le sous-type de l'obstacle.
  const signature = `${selectedId}|${pts.map(p => `${p.id}:${p.subtype}:${p.type}:${p.index}:${p.fix}`).join('|')}`;

  if (signature === targetSelectSignature) return;

  targetSelectSignature = signature;
  const previousValue = sel.value;

  sel.innerHTML = '<option value="">— Sélectionnez un obstacle —</option>' +
    pts.map(p => `<option value="${p.id}" ${selectedId === String(p.id) ? 'selected' : ''}>${getObstacleTypeLabel(p.subtype) || 'Obstacle'} #${p.index} — ${p.fix}</option>`).join('');
  // Hauteur compacte : une ligne de titre + un obstacle par ligne (3 à 7 max).
  sel.size = Math.min(Math.max(pts.length + 1, 3), 7);

  if (!selectedId && previousValue && pts.some(p => String(p.id) === previousValue)) {
    sel.value = previousValue;
  }

  updateCameraPickerLabels();
}

function selectTargetPoint(pointId) {
  const pts = getPoints().filter(p => p.type === 'obstacle');
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

  if (!cameraMode) {
    overlay.innerHTML = '<div class="cam-message">Choisissez un mode avec le bouton ＋<br>🎯 Rejoindre un point · 📏 Mesurer une distance</div>';
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
    overlay.innerHTML = '<div class="cam-message">Sélectionnez un point cible<br>dans l\'onglet TRACÉS</div>';
    return;
  }

  const dist = haversine(currentPos.lat, currentPos.lon, targetPoint.lat, targetPoint.lon);
  const bearing = calcBearing(currentPos.lat, currentPos.lon, targetPoint.lat, targetPoint.lon);
  // Option A : cap géographique fixe à l'écran (0° = nord en haut).
  const guidanceBearing = getGuidanceBearing(bearing);
  const color = getCameraColor(dist);
  const cap = getCurrentCap();
  // Guidage vocal : annonce les seuils franchis et l'arrivée (si activé).
  processVoiceGuidance(dist, bearing);
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
      ${nearTarget ? `<div class="cam-3d-scene cam-3d-scene-circle" style="transform:${getCameraSceneTransform(CAMERA_3D_BASE_TILT.circle)}"><div class="cam-target-circle ${haloAlert ? 'halo-alert' : ''}" style="--halo-color:${color}"><div class="cam-target-circle-dot"></div></div></div>` : ''}
      <div class="cam-arrow-wrap">
        ${nearTarget ? '' : `<div class="cam-3d-scene cam-3d-scene-arrow" style="transform:${getCameraSceneTransform(CAMERA_3D_BASE_TILT.arrow)}">
          <div class="cam-arrow cam-arrow-target" style="transform:rotate(${guidanceBearing}deg);color:${color}">
            <span class="cam-arrow-head"></span>
            <span class="cam-arrow-shaft"></span>
          </div>
        </div>`}
      </div>
      <div class="cam-distance" style="color:${color}">${distText}</div>
      <div class="camera-settings" style="width:100%;max-width:320px;">
        <div class="card-row" style="background:rgba(0,0,0,0.45);border-radius:12px;border:none;">
          <span class="card-key" style="color:rgba(255,255,255,0.7)">CAP</span>
          <span class="card-val" style="color:#fff">${formatCap(cap)}</span>
        </div>
      </div>
      <div class="cam-target-info"><span class="type-dot ${targetPoint.type}" aria-hidden="true"></span>${targetPoint.type} #${targetPoint.index} — ${targetPoint.fix}</div>
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
        <div class="cam-3d-scene cam-3d-scene-arrow" style="transform:${getCameraSceneTransform(CAMERA_3D_BASE_TILT.arrow)}">
          <div class="cam-arrow cam-arrow-distance" style="transform:rotate(${guidanceCap}deg);color:${color}">
            <span class="cam-arrow-head"></span>
            <span class="cam-arrow-shaft"></span>
          </div>
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
    ? `<button class="cam-compass-inline ${stateClass}" title="${statusText}" onclick="requestCompassPermission()">${ICON_COMPASS}</button>`
    : `<span class="cam-compass-inline ${stateClass}" title="${statusText}">${ICON_COMPASS}</span>`;

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
