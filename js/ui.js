// ============================================================
// ui.js — Bandeau Fix et alertes GPS
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

// ─── FIX BAR (header vert) ───────────────────────────────────
function updateFixBar(data) {
  const dot  = document.getElementById('fixDot');
  const name = document.getElementById('fixName');
  const prec = document.getElementById('fixPrec');
  if (dot)  dot.className  = `fix-dot ${data.dotClass}`;
  if (name) name.textContent = data.fix.toUpperCase();
  if (prec) prec.textContent = `${data.label} ${data.precision}`;
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
