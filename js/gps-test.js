// ============================================================
// gps-test.js — Mode « Test GPS » (GPS interne du téléphone)
// RTKGpsWeb v2 — RTK Mower
// ============================================================
// Remplace temporairement le flux BLE par le GPS du téléphone.
// Aucune modification du parser métier : on fabrique une trame
// texte au format ESP32 puis on la fait passer par parseGpsFrame(),
// exactement comme ble.js (updateUI / updateLivePosition /
// updateCameraTarget). NTRIP n'est ni contacté ni modifié.

// Fix annoncé pour le GPS interne. Le téléphone ne fournit pas de RTK :
// 'GPS' (score 1) est honnête, donc isPositionValid() refuse toujours
// l'enregistrement de points (Float RTK minimum requis, score 3).
const GPS_TEST_FIX = 'GPS';

// Le navigateur ne fournit ni HDOP ni nombre de satellites : on estime
// un HDOP indicatif (1 unité ≈ 5 m d'exactitude horizontale).
const GPS_TEST_HDOP_METERS_PER_UNIT = 5;
const GPS_TEST_HDOP_FALLBACK = null;

const GPS_TEST_GEO_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge:        0,
  timeout:           15000,
};

let gpsTestWatchId = null;
let gpsTestActive  = false;
let gpsTestUiState = 'off';

// ─── BASCULE ─────────────────────────────────────────────────
function toggleGpsTest() {
  if (gpsTestActive || gpsTestWatchId !== null) stopGpsTest(true);
  else startGpsTest();
}

// ─── ACTIVATION ──────────────────────────────────────────────
function startGpsTest() {
  if (!navigator.geolocation) {
    showAlert('⚠️ Géolocalisation non supportée par ce navigateur', 'danger', 0);
    return;
  }

  // La géolocalisation exige un contexte sécurisé (HTTPS ou localhost).
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    showAlert('⚠️ Test GPS indisponible : ouvrez l’application en HTTPS ou sur 127.0.0.1', 'danger', 0);
    return;
  }

  // Un seul flux GPS à la fois : on coupe le BLE s'il est encore connecté.
  if (typeof APP !== 'undefined' && APP.bleConnected && typeof disconnectBle === 'function') {
    disconnectBle();
  }

  gpsTestActive = true;
  updateGpsTestButton('connecting');
  setBleButtonLocked(true);

  try {
    gpsTestWatchId = navigator.geolocation.watchPosition(
      onGpsTestPosition,
      onGpsTestError,
      GPS_TEST_GEO_OPTIONS
    );
  } catch (error) {
    stopGpsTest(false);
    showAlert(`⚠️ Géolocalisation indisponible : ${error.message}`, 'danger', 0);
    return;
  }

  showToast('📱 Test GPS activé — GPS interne du téléphone', 'info');
}

// ─── ARRÊT ───────────────────────────────────────────────────
function stopGpsTest(showMessage) {
  if (gpsTestWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(gpsTestWatchId);
  }
  gpsTestWatchId = null;
  gpsTestActive  = false;
  updateGpsTestButton('off');
  setBleButtonLocked(false);
  if (showMessage) showToast('📱 Test GPS désactivé', 'info');
}

// ─── RÉCEPTION D'UNE POSITION ────────────────────────────────
function onGpsTestPosition(position) {
  if (!gpsTestActive) return;

  const data = buildGpsTestData(position);
  if (!data) return;

  APP.hasGpsData = true;
  APP.lastUpdate = new Date();

  // Même pipeline que le BLE (js/ble.js, onBleDataReceived).
  if (typeof updateUI           === 'function') updateUI(data);
  if (typeof updateLivePosition === 'function') updateLivePosition(data);
  if (typeof updateCameraTarget === 'function') updateCameraTarget(data);

  updateGpsTestButton('on');
}

// ─── ERREURS GÉOLOCALISATION ─────────────────────────────────
function onGpsTestError(error) {
  const code = error && typeof error.code === 'number' ? error.code : -1;
  const messages = {
    1: 'Géolocalisation refusée — autorisez l’accès à la position',
    2: 'Position indisponible — vérifiez le GPS du téléphone',
    3: 'Délai de géolocalisation dépassé — nouvelle tentative...',
  };
  const message = messages[code]
    || `Erreur géolocalisation : ${error && error.message ? error.message : 'inconnue'}`;

  showAlert(`⚠️ ${message}`, 'warning', code === 3 ? 5000 : 0);

  // Un refus de permission est définitif : on quitte le mode Test.
  if (code === 1) stopGpsTest(false);
}

// ─── CONSTRUCTION DE LA TRAME ────────────────────────────────
// Retourne un objet identique à celui du BLE (parseGpsFrame).
function buildGpsTestData(position) {
  const coords = position && position.coords ? position.coords : null;
  if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
    return null;
  }

  const lines = [
    `Fix: ${GPS_TEST_FIX}`,
    `Lat: ${coords.latitude.toFixed(6)}`,
    `Lon: ${coords.longitude.toFixed(6)}`,
  ];

  // Altitude (m) — facultative selon le matériel.
  if (Number.isFinite(coords.altitude)) {
    lines.push(`Alt: ${coords.altitude.toFixed(2)}`);
  }

  // Position relative à la base de la parcelle courante, si elle existe.
  const rel = getGpsTestRelativePosition(coords.latitude, coords.longitude);
  if (rel) {
    lines.push(`Rel_X: ${rel.relX.toFixed(3)}`);
    lines.push(`Rel_Y: ${rel.relY.toFixed(3)}`);
  }

  // HDOP estimé (le navigateur ne le fournit pas).
  const hdop = estimateGpsTestHdop(coords.accuracy);
  if (hdop !== GPS_TEST_HDOP_FALLBACK) lines.push(`HDOP: ${hdop}`);

  // Vitesse en km/h (coords.speed est en m/s, souvent null à l'arrêt).
  if (Number.isFinite(coords.speed)) {
    lines.push(`Speed: ${(coords.speed * 3.6).toFixed(1)}`);
  }

  // Cap géographique en degrés (null si immobile ou non calculé).
  if (Number.isFinite(coords.heading)) {
    lines.push(`Cap: ${coords.heading.toFixed(1)}`);
  }

  const stamp = Number.isFinite(position.timestamp) ? new Date(position.timestamp) : new Date();
  lines.push(`Date: ${stamp.toISOString()}`);

  return parseGpsFrame(lines.join('\n'));
}

// Estimation indicative du HDOP à partir de l'exactitude horizontale (m).
function estimateGpsTestHdop(accuracy) {
  if (!Number.isFinite(accuracy) || accuracy <= 0) return GPS_TEST_HDOP_FALLBACK;
  return Math.max(0.1, accuracy / GPS_TEST_HDOP_METERS_PER_UNIT).toFixed(1);
}

// Coordonnées relatives à la base de la parcelle (même convention que
// js/simulation.js : relX = est, relY = nord).
function getGpsTestRelativePosition(lat, lon) {
  if (typeof getBase !== 'function') return null;
  const base = getBase();
  if (!base || !Number.isFinite(base.lat) || !Number.isFinite(base.lon)) return null;

  const metersPerDegLat = 111320;
  return {
    relX: (lon - base.lon) * Math.cos(base.lat * Math.PI / 180) * metersPerDegLat,
    relY: (lat - base.lat) * metersPerDegLat,
  };
}

// ─── INTERFACE ───────────────────────────────────────────────
function updateGpsTestButton(state) {
  if (gpsTestUiState === state) return;
  gpsTestUiState = state;

  const btn = document.getElementById('btnGpsTest');
  if (!btn) return;

  const states = {
    off:        { html: '<span>📱</span> TEST GPS',   cls: 'gps-test-btn' },
    connecting: { html: '<span>⏳</span> GPS...',      cls: 'gps-test-btn connecting' },
    on:         { html: '<span>📱</span> TEST ACTIF', cls: 'gps-test-btn on' },
  };
  const s = states[state] || states.off;

  btn.innerHTML = s.html;
  btn.className = s.cls;
  btn.setAttribute('aria-pressed', state === 'on' ? 'true' : 'false');
  btn.title = state === 'on'
    ? 'GPS interne actif — cliquer pour revenir au BLE'
    : 'Utiliser le GPS interne du téléphone (test sans récepteur RTK)';
}

// Verrouille (ou libère) le bouton BLE pour éviter deux flux concurrents.
function setBleButtonLocked(locked) {
  const btn = document.getElementById('btnBle');
  if (!btn) return;

  if (locked) {
    btn.disabled    = true;
    btn.title       = 'Connexion BLE désactivée pendant le test GPS';
    btn.textContent = '⬡ BLE DÉSACTIVÉ';
    return;
  }

  btn.title = '';
  if (!navigator.bluetooth) {
    // Web Bluetooth absent : on restitue l'état posé par checkBleSupport().
    btn.disabled    = true;
    btn.textContent = '⬡ Non supporté';
    return;
  }

  btn.disabled = false;
  if (typeof setBleStatus === 'function') {
    setBleStatus(APP.bleConnected ? 'connected' : 'disconnected');
  } else {
    btn.textContent = '⬡ CONNECTER';
  }
}

// Le HTML porte déjà l'état initial : on force seulement l'attribut ARIA.
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnGpsTest');
  if (btn) btn.setAttribute('aria-pressed', 'false');
});
