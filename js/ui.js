// ============================================================
// ui.js — Pastille GPS du header et alertes
// RTKGpsWeb v2
// ============================================================

let lastGpsData      = null;
let dataTimeoutTimer = null;

const ALERT_CONFIG = { minSat:6, maxHdop:2.0, timeout:10000 };

function updateUI(data) {
  lastGpsData = data;
  resetDataTimeout();
  if (!data.isValid) { showRejectedFrame(data); return; }
  updateFixBar(data);
  checkAlerts(data);
  hideAlert();
}

// ─── STATUT GPS (pastille du header) ────────────────────────
function updateFixBar(data) {
  const pill = document.getElementById('headerGpsStatus');
  const pillText = document.getElementById('headerGpsText');
  const dotClass = data.dotClass || 'none';

  if (pill) {
    pill.className = `gps-status-pill ${dotClass}`;
    pill.title = `${data.fix} — ${data.label} ${data.precision}`;
  }
  if (pillText) {
    pillText.textContent = data.fix === 'None' ? 'AUCUN FIX' : data.fix.toUpperCase();
  }
}

// Retour à l'état sans GPS (déconnexion BLE, démarrage).
function setGpsStatusIdle() {
  const pill = document.getElementById('headerGpsStatus');
  const pillText = document.getElementById('headerGpsText');

  if (pill) {
    pill.className = 'gps-status-pill disconnected';
    pill.title = 'Aucun fix GPS';
  }
  if (pillText) pillText.textContent = 'AUCUN FIX';
}

function showRejectedFrame(data) {
  showAlert(`⚠️ ${data.rejectReason || 'Trame invalide'}`, 'warning');
}

// ─── ALERTES ─────────────────────────────────────────────────
function checkAlerts(data) {
  if (data.score === 0)   { showAlert('🚨 Fix GPS perdu !', 'danger'); return; }
  if (data.satellites!==null && data.satellites < ALERT_CONFIG.minSat)
    { showAlert(`⚠️ Satellites faibles : ${data.satellites}`, 'warning'); return; }
  if (data.hdop!==null && data.hdop > ALERT_CONFIG.maxHdop)
    { showAlert(`⚠️ Précision dégradée — HDOP : ${fmt(data.hdop,1)}`, 'warning'); return; }
}

function resetDataTimeout() {
  clearTimeout(dataTimeoutTimer);
  dataTimeoutTimer = setTimeout(() => {
    if (APP.bleConnected) showAlert('⚠️ Plus de données GPS depuis 10s', 'warning');
  }, ALERT_CONFIG.timeout);
}
