// ============================================================
// app.js — Initialisation et coordination v2
// RTKGpsWeb v2 — RTK Mower
// ============================================================

const APP = {
  version:      '2.0.0',
  currentTab:   'tab-points',
  tracesMode:   'lecture',   // 'lecture' (consultation) | 'creation' (tracé)
  currentTraceMode: null,    // 'tonte' | 'interdit' | 'obstacle' | null
  theme:        'light',
  bleConnected: false,
  hasGpsData:   false,
  lastUpdate:   null,
};

// ─── ICÔNES D'INTERFACE (SVG Lucide partagés) ────────────────
// Déclarées dans app.js, chargé avant projects.js / points.js / map.js :
// les autres scripts y accèdent directement (scope global des scripts
// classiques). `stroke: currentColor` : la couleur vient toujours du bouton
// ou du conteneur, jamais du markup. Ne jamais réintroduire d'emoji dans
// les boutons d'action : le rendu varie selon la plateforme.
const ICON_PENCIL = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true" focusable="false">
  <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
  <path d="m15 5 4 4"/>
</svg>`;

const ICON_TRASH = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true" focusable="false">
  <path d="M3 6h18"/>
  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  <line x1="10" x2="10" y1="11" y2="17"/>
  <line x1="14" x2="14" y1="11" y2="17"/>
</svg>`;

const ICON_MOON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true" focusable="false">
  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
</svg>`;

const ICON_SUN = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="4"/>
  <path d="M12 2v2"/>
  <path d="M12 20v2"/>
  <path d="m4.93 4.93 1.41 1.41"/>
  <path d="m17.66 17.66 1.41 1.41"/>
  <path d="M2 12h2"/>
  <path d="M20 12h2"/>
  <path d="m6.34 17.66-1.41 1.41"/>
  <path d="m19.07 4.93-1.41 1.41"/>
</svg>`;

// Icônes du FAB CAMÉRA (bouton principal, 26 px).
const ICON_CROSSHAIR = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="10"/>
  <line x1="22" x2="18" y1="12" y2="12"/>
  <line x1="6" x2="2" y1="12" y2="12"/>
  <line x1="12" x2="12" y1="6" y2="2"/>
  <line x1="12" x2="12" y1="22" y2="18"/>
</svg>`;

const ICON_RULER = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true" focusable="false">
  <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/>
  <path d="m14.5 12.5 2-2"/>
  <path d="m11.5 9.5 2-2"/>
  <path d="m8.5 6.5 2-2"/>
  <path d="m17.5 15.5 2-2"/>
</svg>`;

// ─── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  console.log(`RTKGpsApp v${APP.version}`);
  initTheme();
  initCustomModal();
  initScreenLock();
  initNavigation();
  initHeaderMenu();
  checkBleSupport();
  initProjectUI();
  initAutosave();
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
  if (btn) {
    const isDark = theme === 'dark';
    // Icône Lucide injectée directement dans le bouton (lune en clair,
    // soleil en sombre) : aucun conteneur intermédiaire à maintenir.
    btn.innerHTML = isDark ? ICON_SUN : ICON_MOON;
    const label = isDark ? 'Thème clair' : 'Thème sombre';
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }
}

function toggleTheme() {
  applyTheme(APP.theme === 'dark' ? 'light' : 'dark');
}

// ─── NAVIGATION ──────────────────────────────────────────────
function initNavigation() {
  showTab(APP.currentTab);
  if (typeof syncTracesModeUI === 'function') syncTracesModeUI();
}

// ─── MENU DÉROULANT DU HEADER (bouton « Connexion ») ────────
// Déclencheur du panneau : #btnConnectionSettings (header 2 lignes).
function getHeaderMenuTrigger() {
  return document.getElementById('btnConnectionSettings')
    || document.getElementById('btnHeaderMenu');
}

// Le header mesure deux lignes : on aligne le menu juste sous lui plutôt
// que d'utiliser un décalage fixe (robuste aux breakpoints et au safe-area).
function positionHeaderMenu() {
  const menu = document.getElementById('headerMenu');
  const header = document.querySelector('header');
  if (!menu || !header) return;
  const bottom = header.getBoundingClientRect().bottom;
  menu.style.top = `${Math.round(bottom + 8)}px`;
}

function openHeaderMenu() {
  const menu = document.getElementById('headerMenu');
  const overlay = document.getElementById('headerMenuOverlay');
  const btn = getHeaderMenuTrigger();
  if (!menu) return;

  // Le verrouillage écran reste prioritaire (z-index 3000 sous le menu,
  // mais on évite toute ouverture programmatique pendant le verrouillage).
  if (document.body && document.body.classList.contains('locked')) return;

  if (typeof closeTraceFabMenu === 'function') closeTraceFabMenu();

  positionHeaderMenu();
  menu.classList.add('show');
  menu.setAttribute('aria-hidden', 'false');
  if (overlay) {
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
  }
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

function closeHeaderMenu() {
  const menu = document.getElementById('headerMenu');
  const overlay = document.getElementById('headerMenuOverlay');
  const btn = getHeaderMenuTrigger();
  if (!menu) return;

  const wasOpen = menu.classList.contains('show');
  menu.classList.remove('show');
  menu.setAttribute('aria-hidden', 'true');
  if (overlay) {
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
  }
  if (btn) btn.setAttribute('aria-expanded', 'false');
  if (wasOpen && btn) btn.focus({ preventScroll: true });
}

function toggleHeaderMenu() {
  const menu = document.getElementById('headerMenu');
  if (!menu) return;
  if (menu.classList.contains('show')) closeHeaderMenu();
  else openHeaderMenu();
}

// Alias métier du bouton « Connexion » : le panneau regroupe la parcelle
// courante et la station NTRIP de référence.
function toggleConnectionPanel() {
  toggleHeaderMenu();
}

function initHeaderMenu() {
  if (!document.getElementById('headerMenu')) return;

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('#headerMenu')) return;
    if (event.target.closest('#btnConnectionSettings') || event.target.closest('#btnHeaderMenu')) return;
    closeHeaderMenu();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeHeaderMenu();
  });

  // Le menu est positionné en JS : on le recalcule si la fenêtre change.
  window.addEventListener('resize', () => {
    const menu = document.getElementById('headerMenu');
    if (menu && menu.classList.contains('show')) positionHeaderMenu();
  });
}

function showTab(tabId) {
  const screen = document.getElementById(tabId);
  if (!screen) return;

  // Mémorise le défilement horizontal de la barre de navigation (la barre est
  // désormais fixe en bas ; la valeur reste à 0, mais l'appel est sans risque).
  const tabsWrapper = document.querySelector('.tabs-wrapper');
  const tabsScrollLeft = tabsWrapper ? tabsWrapper.scrollLeft : 0;

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  screen.classList.add('active');

  // Navigation basse = boutons : l'état actif est géré en JS.
  document.querySelectorAll('.tabs-wrapper .tab-label').forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
    if (isActive) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });

  if (tabsWrapper) tabsWrapper.scrollLeft = tabsScrollLeft;

  APP.currentTab = tabId;
  if (typeof exitMapFullscreen === 'function') exitMapFullscreen();
  if (typeof syncCrosshairVisibility === 'function') syncCrosshairVisibility(tabId);
  if (typeof syncTraceFabUI === 'function') syncTraceFabUI();
  if (typeof syncCameraFabUI === 'function') syncCameraFabUI();
  if (typeof closeExportMenu === 'function') closeExportMenu();
  if (typeof closeHeaderMenu === 'function') closeHeaderMenu();
  if (typeof closeProjectDrawer === 'function') closeProjectDrawer();
  if (typeof closeObstacleMenu === 'function') closeObstacleMenu();
  if (typeof closeTraceFabMenu === 'function') closeTraceFabMenu();

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
    // L'onglet contient la section POINTS puis les parcelles / sessions.
    if (typeof renderPointsList === 'function') renderPointsList();
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
    if (btn) {
      const icon = typeof getBleIconMarkup === 'function' ? getBleIconMarkup() : '';
      btn.classList.remove('connected');
      btn.classList.add('disconnected');
      btn.disabled = true;
      btn.innerHTML = icon;
      btn.title = 'Web Bluetooth non supporté';
      btn.setAttribute('aria-label', 'Web Bluetooth non supporté');
    }
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
    showToast('Mode lecture — menu FAB pour ajouter', 'info');
    return;
  }
  const activeType = typeof APP !== 'undefined' ? (APP.currentTraceMode || null) : null;
  if (activeType && activeType !== 'obstacle') {
    showToast('Terminez le tracé en cours (✓ Terminer) avant d’ajouter un obstacle', 'error');
    return;
  }
  const pos = typeof getPointPosition === 'function' ? getPointPosition() : null;
  if (!pos) {
    if (typeof APP !== 'undefined' && APP.currentTraceMode === 'obstacle') {
      APP.currentTraceMode = null;
      if (typeof updateTraceTypeUI === 'function') updateTraceTypeUI();
    }
    showToast('Position indisponible — placez la cible sur la carte', 'error');
    return;
  }
  // Appel direct au menu : on entre dans le type obstacle. Le clic normal
  // passe par le FAB, qui gère la sélection et la confirmation.
  if (typeof APP !== 'undefined') {
    APP.tracesMode = 'creation';
    if (!activeType) APP.currentTraceMode = 'obstacle';
    if (typeof updateTraceTypeUI === 'function') updateTraceTypeUI();
  }
  const modal = document.getElementById('obstacleModal');
  if (modal) modal.classList.add('show');
}

function closeObstacleMenu(preserveCreation = false) {
  const modal = document.getElementById('obstacleModal');
  if (modal) modal.classList.remove('show');
  // Fermer le menu sans choisir (ou après le choix) libère le type obstacle.
  if (typeof APP !== 'undefined' && APP.currentTraceMode === 'obstacle') {
    APP.currentTraceMode = null;
    if (!preserveCreation) APP.tracesMode = 'lecture';
    if (typeof updateTraceTypeUI === 'function') updateTraceTypeUI();
  }
}

function selectObstacleType(type, icon) {
  // Sécurité supplémentaire si le menu était ouvert hors du flux normal :
  // un obstacle ne peut pas être créé au milieu d'une zone.
  if (typeof APP !== 'undefined' && APP.currentTraceMode
      && APP.currentTraceMode !== 'obstacle') {
    closeObstacleMenu();
    showToast('Terminez le tracé en cours (✓ Terminer) avant d’ajouter un obstacle', 'error');
    return;
  }
  closeObstacleMenu(true);
  if (typeof recordObstacle === 'function') recordObstacle(type, icon);
  // L'obstacle est ponctuel : retour à l'état neutre après sa création.
  if (typeof APP !== 'undefined' && APP.tracesMode === 'creation' && !APP.currentTraceMode) {
    APP.tracesMode = 'lecture';
    if (typeof syncTracesModeUI === 'function') syncTracesModeUI();
  }
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

// ─── VERROUILLAGE D'ÉCRAN (anti-fausse manip) ────────────────
// Le voile #lockOverlay couvre tout ; le déverrouillage se fait par un
// glissement horizontal du curseur (ou Entrée / Espace au clavier).
function initScreenLock() {
  // On repart toujours déverrouillé après un rechargement.
  if (document.body) document.body.classList.remove('locked');
  const overlay = document.getElementById('lockOverlay');
  if (overlay) overlay.setAttribute('aria-hidden', 'true');

  const track = document.getElementById('lockSwipe');
  const knob  = document.getElementById('lockSwipeKnob');
  if (!track || !knob) return;

  let startX = null;
  let maxX   = 0;

  const reset = () => {
    startX = null;
    track.classList.remove('dragging', 'armed');
    knob.style.transform = 'translateX(0)';
  };

  const onDown = event => {
    if (!document.body.classList.contains('locked')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    startX = event.clientX;
    maxX = Math.max(0, track.clientWidth - knob.offsetWidth - 10);
    track.classList.add('dragging');
    try { track.setPointerCapture(event.pointerId); } catch { /* non supporté */ }
    event.preventDefault();
  };

  const onMove = event => {
    if (startX === null) return;
    const dx = Math.max(0, Math.min(event.clientX - startX, maxX));
    knob.style.transform = `translateX(${dx}px)`;
    track.classList.toggle('armed', maxX > 0 && dx >= maxX * 0.72);
  };

  const onUp = event => {
    if (startX === null) return;
    const dx = Math.max(0, Math.min(event.clientX - startX, maxX));
    const unlock = maxX > 0 && dx >= maxX * 0.72;
    reset();
    try { track.releasePointerCapture(event.pointerId); } catch { /* ignoré */ }
    if (unlock) setScreenLock(false);
  };

  track.addEventListener('pointerdown', onDown);
  track.addEventListener('pointermove', onMove);
  track.addEventListener('pointerup', onUp);
  track.addEventListener('pointercancel', reset);
  track.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && document.body.classList.contains('locked')) {
      event.preventDefault();
      setScreenLock(false);
    }
  });

  // Piège de focus : le seul élément interactif du voile est la piste.
  const overlayEl = document.getElementById('lockOverlay');
  if (overlayEl) {
    overlayEl.addEventListener('keydown', event => {
      if (event.key === 'Tab' && document.body.classList.contains('locked')) {
        event.preventDefault();
        track.focus({ preventScroll: true });
      }
    });
  }

  setScreenLock(false, { silent: true });
}

function resetLockSwipe() {
  const track = document.getElementById('lockSwipe');
  const knob  = document.getElementById('lockSwipeKnob');
  if (track) track.classList.remove('dragging', 'armed');
  if (knob)  knob.style.transform = 'translateX(0)';
}

function toggleScreenLock() {
  setScreenLock(!document.body.classList.contains('locked'));
}

function setScreenLock(locked, options = {}) {
  const isLocked = !!locked;

  document.body.classList.toggle('locked', isLocked);
  if (isLocked && typeof closeHeaderMenu === 'function') closeHeaderMenu();
  const overlay = document.getElementById('lockOverlay');
  if (overlay) overlay.setAttribute('aria-hidden', isLocked ? 'false' : 'true');

  if (isLocked) {
    if (typeof closeExportMenu === 'function') closeExportMenu();
    if (typeof closeProjectDrawer === 'function') closeProjectDrawer();
  }

  const btn = document.getElementById('btnLock');
  if (btn) {
    btn.textContent = isLocked ? '🔓' : '🔒';
    btn.title = isLocked ? "Déverrouiller l'écran" : "Verrouiller l'écran";
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-pressed', isLocked ? 'true' : 'false');
  }

  if (typeof setMapInteractionEnabled === 'function') setMapInteractionEnabled(!isLocked);
  if (typeof updateTerrainButtons === 'function') updateTerrainButtons();

  if (!isLocked) resetLockSwipe();

  if (!options.silent) {
    showToast(isLocked ? '🔒 Écran verrouillé' : '🔓 Écran déverrouillé', 'info', 1600);

    if (isLocked) {
      const track = document.getElementById('lockSwipe');
      if (track) setTimeout(() => track.focus({ preventScroll: true }), 60);
    } else {
      if (btn) setTimeout(() => btn.focus({ preventScroll: true }), 60);
    }
  }
}

// ─── SAUVEGARDE LOCALE AUTOMATIQUE ───────────────────────────
let autosaveInterval = null;
let saveIndicatorTimeout = null;

function flashSaveIndicator() {
  const el = document.getElementById('saveIndicator');
  if (!el) return;

  const time = new Date().toLocaleTimeString('fr-FR');
  el.title = `Sauvegardé localement à ${time}`;
  el.setAttribute('aria-label', el.title);

  el.classList.remove('flash');
  void el.offsetWidth;             // relance l'animation
  el.classList.add('flash');

  clearTimeout(saveIndicatorTimeout);
  saveIndicatorTimeout = setTimeout(() => el.classList.remove('flash'), 1000);
}

function initAutosave() {
  // Le banc Node ne fournit pas window.addEventListener : on n'installe pas
  // l'autosauvegarde hors navigateur.
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  if (autosaveInterval) clearInterval(autosaveInterval);

  // Filet de sécurité : même sans modification, on réécrit le stockage.
  autosaveInterval = setInterval(() => {
    if (typeof flushProjectStorage === 'function') flushProjectStorage();
  }, 30000);

  // Dernière chance avant fermeture / mise en arrière-plan.
  const flush = () => {
    if (typeof flushProjectStorage === 'function') flushProjectStorage();
  };
  if (document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
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
