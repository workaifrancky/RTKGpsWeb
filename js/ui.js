// ============================================================
// ui.js — Interface utilisateur v2 Haute Visibilité
// ============================================================

let lastGpsData      = null;
let dataTimeoutTimer = null;
let dataDetailsVisible = false;

const ALERT_CONFIG = { minSat:6, maxHdop:2.0, timeout:10000 };

function updateUI(data) {
  lastGpsData = data;
  resetDataTimeout();
  if (!data.isValid) { showRejectedFrame(data); return; }
  updateFixBar(data);
  updateDataCards(data);
  updateDetailCard(data);
  updateRawData(data.raw);
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

// ─── CARTES DONNÉES ──────────────────────────────────────────
function updateDataCards(data) {
  setHTML('dLat',   data.lat  !==null ? `${fmt(data.lat,6)}`  : '—');
  setHTML('dLon',   data.lon  !==null ? `${fmt(data.lon,6)}`  : '—');
  setHTML('dAlt',   data.alt  !==null ? `${fmt(data.alt,2)}<span class="data-unit">m</span>` : '—');
  setHTML('dSat',   colorSat(data.satellites));
  setHTML('dHdop',  colorHdop(data.hdop));
  setHTML('dSpeed', data.speed!==null ? `${fmt(data.speed,1)}<span class="data-unit">km/h</span>` : '—');
}

function updateDetailCard(data) {
  setHTML('dRelX',  data.relX   !==null ? `${fmt(data.relX,3)} m`  : '—');
  setHTML('dRelY',  data.relY   !==null ? `${fmt(data.relY,3)} m`  : '—');
  setHTML('dCap',   data.course !==null ? `${fmt(data.course,1)}°` : '—');
  setHTML('dDate',  data.date   || '—');
}

function applyDataDetailsVisibility() {
  const card = document.getElementById('dataDetailCard');
  const btn = document.getElementById('btnToggleDataDetails');
  if (card) card.classList.toggle('is-collapsed', !dataDetailsVisible);
  if (btn) btn.textContent = dataDetailsVisible ? 'Masquer REL/CAP/DATE' : 'Afficher REL/CAP/DATE';
}

function toggleDataDetails() {
  dataDetailsVisible = !dataDetailsVisible;
  applyDataDetailsVisibility();
}

function updateRawData(raw) {
  const el = document.getElementById('rawData');
  if (el) el.textContent = raw || '—';
}

function showRejectedFrame(data) {
  const el = document.getElementById('rawData');
  if (el) el.textContent = `⚠ Trame rejetée : ${data.rejectReason}\n\n${data.raw||''}`;
  showAlert(`⚠️ ${data.rejectReason || 'Trame invalide'}`, 'warning');
}

// ─── COULEURS SATELLITES ─────────────────────────────────────
function colorSat(n) {
  if (n===null) return '—';
  const cls = n>=10?'green':n>=7?'orange':n>=5?'':'red';
  return `<span class="data-value ${cls}" style="font-size:22px">${n}</span>`;
}

function colorHdop(h) {
  if (h===null) return '—';
  const cls = h<=1.0?'green':h<=1.5?'orange':h<=2.0?'':'red';
  return `<span class="data-value ${cls}" style="font-size:22px">${fmt(h,1)}</span>`;
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

function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function showEmptyState() {
  ['dLat','dLon','dAlt','dSat','dHdop','dSpeed','dRelX','dRelY','dCap','dDate'].forEach(id => setHTML(id,'—'));
  const raw = document.getElementById('rawData');
  if (raw) raw.textContent = 'En attente de connexion BLE...';
  applyDataDetailsVisibility();
}

document.addEventListener('DOMContentLoaded', showEmptyState);
