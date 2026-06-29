// ============================================================
// app.js — Initialisation et coordination v2
// RTKGpsWeb v2 — RTK Mower
// ============================================================

const APP = {
  version:      '2.0.0',
  currentTab:   'tab-data',
  theme:        'light',
  bleConnected: false,
  hasGpsData:   false,
  lastUpdate:   null,
};

// ─── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  console.log(`RTKGpsApp v${APP.version}`);
  initTheme();
  initNavigation();
  checkBleSupport();
  initProjectBar();
  console.log('App prête ✅');
});

// ─── THÈME ───────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('rtkTheme') || 'light';
  applyTheme(saved);
}

function applyTheme(theme) {
  APP.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('rtkTheme', theme);
  const btn = document.getElementById('btnTheme');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  applyTheme(APP.theme === 'dark' ? 'light' : 'dark');
}

// ─── NAVIGATION ──────────────────────────────────────────────
function initNavigation() { showTab(APP.currentTab); }

function showTab(tabId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const screen = document.getElementById(tabId);
  if (screen) screen.classList.add('active');
  const tab = document.querySelector(`[data-tab="${tabId}"]`);
  if (tab) tab.classList.add('active');
  APP.currentTab = tabId;

  if (tabId === 'tab-map') {
    setTimeout(() => { if (typeof refreshMap === 'function') refreshMap(); }, 120);
  }
  if (tabId === 'tab-camera') {
    if (typeof startCamera === 'function') startCamera();
  } else {
    if (typeof stopCamera === 'function') stopCamera();
  }
  if (tabId === 'tab-history') {
    if (typeof loadHistory === 'function') loadHistory();
  }
  if (tabId === 'tab-stats') {
    if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
  }
}

// ─── BLE SUPPORT ─────────────────────────────────────────────
function checkBleSupport() {
  if (!navigator.bluetooth) {
    showAlert('⚠️ Web Bluetooth non supporté — utilisez Chrome sur Android', 'danger', 0);
    const btn = document.getElementById('btnBle');
    if (btn) { btn.disabled = true; btn.textContent = '⬡ Non supporté'; }
  }
}

// ─── BARRE PROJETS ───────────────────────────────────────────
function initProjectBar() {
  renderProjectSelect();
}

// ─── TOAST ───────────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 2500) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className   = `toast-${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), duration);
}

// ─── ALERTE BAR ──────────────────────────────────────────────
function showAlert(msg, type = 'warning', duration = 5000) {
  const a = document.getElementById('alertBar');
  if (!a) return;
  a.textContent = msg;
  a.className   = `alert-bar alert-${type} show`;
  clearTimeout(a._timer);
  if (duration > 0) {
    a._timer = setTimeout(() => a.classList.remove('show'), duration);
  }
}

function hideAlert() {
  const a = document.getElementById('alertBar');
  if (a) a.classList.remove('show');
}

// ─── MODAL OBSTACLE ──────────────────────────────────────────
function openObstacleMenu() {
  if (!isPositionValid(lastGpsData)) {
    showToast('Fix GPS insuffisant pour enregistrer', 'error');
    return;
  }
  const modal = document.getElementById('obstacleModal');
  if (modal) modal.classList.add('show');
}

function closeObstacleMenu() {
  const modal = document.getElementById('obstacleModal');
  if (modal) modal.classList.remove('show');
}

function selectObstacleType(type, icon) {
  closeObstacleMenu();
  if (typeof recordObstacle === 'function') recordObstacle(type, icon);
}

// ─── MODAL NOUVEAU PROJET ────────────────────────────────────
function openNewProjectModal() {
  const modal = document.getElementById('projectModal');
  if (modal) modal.classList.add('show');
  const input = document.getElementById('projectNameInput');
  if (input) { input.value = ''; setTimeout(() => input.focus(), 200); }
}

function closeProjectModal() {
  const modal = document.getElementById('projectModal');
  if (modal) modal.classList.remove('show');
}

function createProject() {
  const input = document.getElementById('projectNameInput');
  const name  = input ? input.value.trim() : '';
  if (!name) { showToast('Entrez un nom de parcelle', 'error'); return; }
  if (typeof addProject === 'function') addProject(name);
  closeProjectModal();
  showToast(`Parcelle "${name}" créée`, 'tonte');
}

// ─── UTILITAIRES ─────────────────────────────────────────────
function fmt(val, dec = 2) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return parseFloat(val).toFixed(dec);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR');
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('fr-FR');
}

function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '—';
  if (seconds < 60)   return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds/60)}min ${Math.round(seconds%60)}s`;
  return `${Math.floor(seconds/3600)}h ${Math.floor((seconds%3600)/60)}min`;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R    = 6371000;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLon = (lon2-lon1)*Math.PI/180;
  const a    = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}