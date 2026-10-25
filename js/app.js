// ============================================================
// app.js — Initialisation et coordination v2
// RTKGpsWeb v2 — RTK Mower
// ============================================================

const APP = {
  version:      '2.0.0',
  currentTab:   'tab-points',
  tracesMode:   'lecture',   // 'lecture' (consultation) | 'creation' (tracé)
  theme:        'light',
  bleConnected: false,
  hasGpsData:   false,
  lastUpdate:   null,
};

// ─── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  console.log(`RTKGpsApp v${APP.version}`);
  initTheme();
  initCustomModal();
  initNavigation();
  checkBleSupport();
  initProjectUI();
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
function initNavigation() {
  showTab(APP.currentTab);
  if (typeof syncTracesModeUI === 'function') syncTracesModeUI();
}

function showTab(tabId) {
  const screen = document.getElementById(tabId);
  if (!screen) return;

  // Mémorise le défilement horizontal des onglets : le navigateur ne doit jamais
  // ramener la barre à gauche lors d'un changement d'onglet.
  const tabsWrapper = document.querySelector('.tabs-wrapper');
  const tabsScrollLeft = tabsWrapper ? tabsWrapper.scrollLeft : 0;

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  screen.classList.add('active');

  // Onglets = boutons : l'état actif est géré en JS (plus de radios).
  document.querySelectorAll('.tabs-wrapper .tab-label').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  if (tabsWrapper) tabsWrapper.scrollLeft = tabsScrollLeft;

  APP.currentTab = tabId;
  if (typeof exitMapFullscreen === 'function') exitMapFullscreen();
  if (typeof syncCrosshairVisibility === 'function') syncCrosshairVisibility(tabId);
  if (typeof closeExportMenu === 'function') closeExportMenu();
  if (typeof closeProjectDrawer === 'function') closeProjectDrawer();

  // Une seule instance de carte, dans l'onglet TRACÉS.
  if (tabId === 'tab-points' && typeof mountMapForTab === 'function') {
    mountMapForTab(tabId);
  }

  if (tabId === 'tab-camera') {
    if (typeof startCamera === 'function') startCamera();
    if (typeof syncCameraFullscreenForTab === 'function') syncCameraFullscreenForTab();
  } else {
    if (typeof stopCamera === 'function') stopCamera();
    if (typeof setCameraFullscreen === 'function') setCameraFullscreen(false);
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
  if (typeof APP !== 'undefined' && APP.tracesMode !== 'creation') {
    showToast('Mode lecture — ✏️ Modifier pour ajouter', 'info');
    return;
  }
  const pos = typeof getPointPosition === 'function' ? getPointPosition() : null;
  if (!pos) {
    showToast('Position indisponible — placez la cible sur la carte', 'error');
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
  if (typeof renderGlobalObstaclePicker === 'function') renderGlobalObstaclePicker();
  if (typeof resetGlobalObstaclePicker === 'function') resetGlobalObstaclePicker();
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

  const importIds = typeof getSelectedGlobalObstacleIds === 'function'
    ? getSelectedGlobalObstacleIds()
    : [];

  if (typeof addProject === 'function') addProject(name, true, importIds);
  // Nouvelle parcelle = mode création (capsule complète).
  if (typeof setTracesMode === 'function') setTracesMode('creation');
  closeProjectModal();
  if (typeof resetGlobalObstaclePicker === 'function') resetGlobalObstaclePicker();
  showToast(importIds.length
    ? `Parcelle "${name}" créée — ${importIds.length} obstacle(s) importé(s)`
    : `Parcelle "${name}" créée`, 'tonte');
}

// ─── MODALE GÉNÉRIQUE (confirm / prompt) ────────────────────
let customModalResolve = null;
let customModalPreviousFocus = null;

function initCustomModal() {
  const overlay = document.getElementById('customModal');
  if (!overlay) return;

  overlay.addEventListener('click', event => {
    if (event.target === overlay) closeCustomModal(null);
  });

  document.getElementById('customModalCancel')?.addEventListener('click', () => closeCustomModal(null));
  document.getElementById('customModalConfirm')?.addEventListener('click', confirmCustomModal);

  const input = document.getElementById('customModalInput');
  if (input) {
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        confirmCustomModal();
      }
    });
  }

  // Piège de focus : Tab reste dans la modale.
  overlay.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusables = Array.from(overlay.querySelectorAll('button:not(:disabled), input'))
      .filter(el => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last  = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  // Échap ferme uniquement la modale (avant le tiroir / le menu d'export).
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && customModalResolve) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeCustomModal(null);
    }
  }, true);
}

function openCustomModal(options = {}) {
  const overlay = document.getElementById('customModal');
  if (!overlay) return Promise.resolve(null);

  // Une seule modale à la fois.
  if (customModalResolve) closeCustomModal(null);

  const titleEl    = document.getElementById('customModalTitle');
  const messageEl  = document.getElementById('customModalMessage');
  const input      = document.getElementById('customModalInput');
  const errorEl    = document.getElementById('customModalError');
  const confirmBtn = document.getElementById('customModalConfirm');
  const cancelBtn  = document.getElementById('customModalCancel');

  const hasInput = Object.prototype.hasOwnProperty.call(options, 'inputValue');

  if (titleEl)   titleEl.textContent = options.title || 'Confirmation';
  if (messageEl) messageEl.textContent = options.message || '';
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.style.display = 'none';
  }

  if (input) {
    input.style.display = hasInput ? 'block' : 'none';
    input.value = hasInput ? String(options.inputValue ?? '') : '';
    input.placeholder = options.placeholder || '';
    input.setAttribute('aria-label', options.inputLabel || options.message || 'Saisie');
  }

  if (confirmBtn) {
    confirmBtn.textContent = options.confirmText || 'Confirmer';
    confirmBtn.className = options.danger
      ? 'action-button action-button-danger'
      : 'action-button';
  }
  if (cancelBtn) cancelBtn.textContent = options.cancelText || 'Annuler';

  overlay.dataset.required = options.required === false ? '0' : '1';
  overlay.dataset.errorText = options.errorText || 'Ce champ ne peut pas être vide.';

  customModalPreviousFocus = document.activeElement;
  overlay.style.display = 'flex';
  void overlay.offsetHeight;   // force le calcul avant la transition
  overlay.classList.add('show');

  window.setTimeout(() => {
    if (!customModalResolve) return;
    if (hasInput && input) {
      input.focus();
      input.select();
    } else if (confirmBtn) {
      confirmBtn.focus();
    }
  }, 60);

  return new Promise(resolve => { customModalResolve = resolve; });
}

function confirmCustomModal() {
  const overlay = document.getElementById('customModal');
  const input   = document.getElementById('customModalInput');
  const errorEl = document.getElementById('customModalError');
  if (!overlay || !customModalResolve) return;

  const hasInput = input && input.style.display !== 'none';
  if (hasInput) {
    const value = input.value.trim();
    if (!value && overlay.dataset.required !== '0') {
      if (errorEl) {
        errorEl.textContent = overlay.dataset.errorText || 'Ce champ ne peut pas être vide.';
        errorEl.style.display = 'block';
      }
      input.focus();
      return;
    }
    closeCustomModal(value);
    return;
  }

  closeCustomModal(true);
}

function closeCustomModal(result = null) {
  const overlay = document.getElementById('customModal');
  if (!overlay) return;

  overlay.classList.remove('show');
  overlay.style.display = 'none';

  const resolve = customModalResolve;
  customModalResolve = null;

  const previous = customModalPreviousFocus;
  customModalPreviousFocus = null;
  if (previous && typeof previous.focus === 'function') {
    try { previous.focus(); } catch { /* élément retiré du DOM */ }
  }

  if (resolve) resolve(result);
}

function customConfirm(message, options = {}) {
  return openCustomModal({
    title:       options.title || 'Confirmation',
    message,
    confirmText: options.confirmText || 'Confirmer',
    cancelText:  options.cancelText || 'Annuler',
    danger:      !!options.danger,
  }).then(result => result === true);
}

function customPrompt(message, defaultValue = '', options = {}) {
  return openCustomModal({
    title:       options.title || 'Renommer',
    message,
    inputValue:  defaultValue ?? '',
    placeholder: options.placeholder || '',
    inputLabel:  options.inputLabel || message,
    required:    options.required !== false,
    errorText:   options.errorText || 'Ce nom ne peut pas être vide.',
    confirmText: options.confirmText || 'Valider',
    cancelText:  options.cancelText || 'Annuler',
  }).then(result => (typeof result === 'string' ? result : null));
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
