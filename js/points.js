// ============================================================
// points.js — Enregistrement des 3 types de points
// RTKGpsWeb v2 — tonte / interdit / obstacle
// ============================================================

// Compteurs par type pour numérotation
let counters = { tonte: 0, interdit: 0, obstacle: 0 };

// Palette des zones de tonte (teintes de vert)
const ZONE_PALETTE = [
  { stroke:'#16a34a', fill:'rgba(22,163,74,0.14)'  },
  { stroke:'#0d9488', fill:'rgba(13,148,136,0.14)' },
  { stroke:'#65a30d', fill:'rgba(101,163,13,0.14)' },
  { stroke:'#15803d', fill:'rgba(21,128,61,0.14)'  },
  { stroke:'#22c55e', fill:'rgba(34,197,94,0.14)'  },
  { stroke:'#047857', fill:'rgba(4,120,87,0.14)'   },
];

function getZonePalette(zoneId) {
  const id = Math.max(1, Number(zoneId) || 1);
  return ZONE_PALETTE[(id - 1) % ZONE_PALETTE.length];
}

document.addEventListener('DOMContentLoaded', () => {
  // Recharge les compteurs depuis le projet courant
  setTimeout(syncCounters, 300);
  renderPointsList();
  initTraceFab();
  // La carte partagée peut déjà être initialisée : on reflète les points chargés.
  if (typeof renderMap === 'function') renderMap();
});

function syncCounters() {
  const pts = getPoints();
  counters = { tonte: 0, interdit: 0, obstacle: 0 };
  pts.forEach(p => { if (counters[p.type] !== undefined) counters[p.type]++; });
}

// ─── POSITION D'ENREGISTREMENT (GPS OU CIBLE CARTE) ──────────
// GPS valide (Float RTK minimum) → coordonnées du rover.
// Sinon → centre de la carte TRACÉS (mode manuel).
function getPointPosition() {
  if (APP.bleConnected && isPositionValid(lastGpsData)) {
    return { lat: lastGpsData.lat, lon: lastGpsData.lon, source: 'gps' };
  }

  const target = typeof getTargetCoords === 'function' ? getTargetCoords() : null;
  if (target && Number.isFinite(target.lat) && Number.isFinite(target.lon)) {
    return { lat: target.lat, lon: target.lon, source: 'manual' };
  }

  return null;
}

// En mode lecture, aucun point ne peut être ajouté (carte consultable).
function canRecordPoints() {
  if (document.body?.classList.contains('locked')) {
    showToast('Écran verrouillé — glissez pour déverrouiller', 'info');
    return false;
  }
  if (typeof APP !== 'undefined' && APP.tracesMode !== 'creation') {
    showToast('Mode lecture — menu FAB pour tracer', 'info');
    return false;
  }
  return true;
}

// ─── FAB DE TRACÉ ────────────────────────────────────────────
// Un seul bouton flottant : neutre il ouvre le menu, coloré il ajoute un
// point. Le bouton « ✓ » termine la zone (appui long : menu).
const TRACE_TYPE_LABELS = {
  tonte:    'Zone de tonte',
  interdit: 'Zone interdite',
  obstacle: 'Obstacle',
};

function syncTraceFabUI() {
  const fab = document.getElementById('traceFab');
  if (!fab) return;

  const hasProject = !!currentProject;
  const onTracesTab = typeof APP === 'undefined' || APP.currentTab === 'tab-points';
  // Le FAB reste visible sur TRACÉS même sans parcelle : son menu porte
  // l'option « Parcelle : … », seul accès à la création (le panneau Connexion
  // ne contient plus la parcelle). Le clic principal ouvre alors le tiroir.
  const visible = onTracesTab;
  fab.hidden = !visible;
  if (!visible) closeTraceFabMenu();

  const type = hasProject
    ? ((typeof APP !== 'undefined' && APP.currentTraceMode) || null)
    : null;
  const main = document.getElementById('traceFabMain');
  const secondary = document.getElementById('traceFabSecondary');

  if (main) {
    main.className = `trace-fab-main ${type || 'neutral'}`;
    main.title = !hasProject
      ? 'Aucune parcelle — en choisir ou en créer une'
      : type
        ? `Ajouter un point — ${TRACE_TYPE_LABELS[type]}`
        : 'Choisir un tracé';
    main.setAttribute('aria-label', main.title);
  }

  if (secondary) {
    secondary.hidden = !hasProject || !type;
    secondary.title = type
      ? `Terminer ${TRACE_TYPE_LABELS[type]} (appui long : menu)`
      : 'Terminer le tracé';
  }
}

function openTraceFabMenu() {
  // Sans parcelle, le menu reste accessible : l'option « Parcelle : … » y est
  // la première entrée et permet d'en créer une.
  const menu = document.getElementById('traceFabMenu');
  const main = document.getElementById('traceFabMain');
  if (!menu) return;

  // Un toast de gestion (création de parcelle, nouvelle zone…) peut
  // recouvrir la dernière option du menu.
  const toast = document.getElementById('toast');
  if (toast) {
    clearTimeout(toast._timer);
    toast.classList.remove('show');
  }

  menu.classList.add('show');
  menu.setAttribute('aria-hidden', 'false');
  if (main) main.setAttribute('aria-expanded', 'true');
}

function closeTraceFabMenu() {
  const menu = document.getElementById('traceFabMenu');
  const main = document.getElementById('traceFabMain');
  if (menu) {
    menu.classList.remove('show');
    menu.setAttribute('aria-hidden', 'true');
  }
  if (main) main.setAttribute('aria-expanded', 'false');
}

function toggleTraceFabMenu() {
  const menu = document.getElementById('traceFabMenu');
  if (!menu) return;
  if (menu.classList.contains('show')) closeTraceFabMenu();
  else openTraceFabMenu();
}

async function beginTraceMode(type) {
  if (!currentProject || !TRACE_TYPE_LABELS[type]) return false;
  closeTraceFabMenu();

  const current = (typeof APP !== 'undefined' && APP.currentTraceMode) || null;
  if (current && current !== type) {
    const message = `Terminer le tracé « ${TRACE_TYPE_LABELS[current]} » en cours `
      + `et passer à « ${TRACE_TYPE_LABELS[type]} » ?`;
    const ok = typeof customConfirm === 'function'
      ? await customConfirm(message, {
        title: 'Changer de tracé',
        confirmText: 'Changer',
        danger: true,
      })
      : true;
    if (!ok) return false;
  }

  if (typeof APP !== 'undefined') APP.tracesMode = 'creation';

  // Une zone existante déjà complète est clôturée ; une zone de 0 à 2 points
  // est reprise pour éviter de perdre un tracé commencé.
  if (type === 'tonte') {
    const points = getZones()[getCurrentZoneId()] || [];
    if (points.length >= 3) startNewZone();
  } else if (type === 'interdit') {
    const points = getInterditZones()[getCurrentInterditZoneId()] || [];
    if (points.length >= 3) startNewInterditZone();
  }

  APP.currentTraceMode = type;
  syncTracesModeUI();
  syncTraceFabUI();
  return true;
}

function chooseTraceMode(type) {
  if (!currentProject) {
    closeTraceFabMenu();
    showToast('Créez d’abord une parcelle', 'error');
    if (typeof openProjectDrawer === 'function') openProjectDrawer();
    return;
  }

  // Le menu FAB disparaît immédiatement (avant toute confirmation éventuelle).
  closeTraceFabMenu();

  // Obstacle : type ponctuel. Dès que le mode est validé (aucune confirmation
  // s'il n'y a pas d'autre tracé en cours), on ouvre DIRECTEMENT la modale
  // « Type d'obstacle » : pas besoin d'un second clic sur le FAB.
  if (type === 'obstacle') {
    Promise.resolve(beginTraceMode('obstacle')).then(started => {
      if (started && typeof openObstacleMenu === 'function') openObstacleMenu();
    });
    return;
  }

  // Appelée depuis le menu : la promesse n'a pas besoin d'être attendue.
  beginTraceMode(type);
}

async function finishCurrentTrace() {
  if (!currentProject || !APP.currentTraceMode) return;
  closeTraceFabMenu();

  const type = APP.currentTraceMode;
  let count = 0;
  if (type === 'tonte') {
    count = (getZones()[getCurrentZoneId()] || []).length;
  } else if (type === 'interdit') {
    count = (getInterditZones()[getCurrentInterditZoneId()] || []).length;
  }

  // Un obstacle est ponctuel : pas de contrôle des 3 points.
  if (type !== 'obstacle' && count < 3) {
    const ok = typeof customConfirm === 'function'
      ? await customConfirm(
        `Zone incomplète (${count} point${count === 1 ? '' : 's'}). Terminer quand même ?`,
        { title: 'Terminer la zone', confirmText: 'Terminer', danger: true },
      )
      : true;
    if (!ok) return;
  }

  APP.currentTraceMode = null;
  APP.tracesMode = 'lecture';
  syncTracesModeUI();
  syncTraceFabUI();
}

function onTraceFabMainClick() {
  // Sans parcelle, le FAB mène directement au tiroir (création/sélection).
  if (!currentProject) {
    if (typeof openProjectDrawer === 'function') openProjectDrawer();
    return;
  }

  const menu = document.getElementById('traceFabMenu');
  if (menu && menu.classList.contains('show')) {
    closeTraceFabMenu();
    return;
  }

  const type = (typeof APP !== 'undefined' && APP.currentTraceMode) || null;
  if (!type) {
    openTraceFabMenu();
    return;
  }
  if (type === 'obstacle') {
    openObstacleMenu();
    return;
  }
  if (type === 'tonte') recordTonte();
  else if (type === 'interdit') recordInterdit();
}

// Appui long (550 ms) sur le FAB ou sur « ✓ » : menu de choix.
// Clic court : action du bouton principal ou fin du tracé.
function initTraceFab() {
  const main = document.getElementById('traceFabMain');
  const secondary = document.getElementById('traceFabSecondary');
  if (!main || !secondary) return;

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

  bindLongPress(main, openTraceFabMenu, onTraceFabMainClick);
  bindLongPress(secondary, openTraceFabMenu, finishCurrentTrace);

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest('#traceFab')) closeTraceFabMenu();
  });

  syncTraceFabUI();
}

// ─── ENREGISTRER — ZONE DE TONTE ─────────────────────────────
function recordTonte() {
  if (!canRecordPoints()) return;
  const pos = getPointPosition();
  if (!pos) {
    showToast('Position indisponible — placez la cible sur la carte', 'error');
    return;
  }
  const pt = buildPoint('tonte', null, '🟢', pos);
  savePoint(pt);
}

// ─── ZONES DE TONTE ──────────────────────────────────────────
function getCurrentZoneId() {
  const id = Number(currentProject?.currentZoneId);
  return Number.isInteger(id) && id > 0 ? id : 1;
}

// ─── ZONES INTERDITES ────────────────────────────────────────
// Chaque zone interdite porte un zoneId distinct (comme les zones de tonte).
function getCurrentInterditZoneId() {
  const id = Number(currentProject?.currentInterditZoneId);
  return Number.isInteger(id) && id > 0 ? id : 1;
}

function getInterditZones() {
  const zones = {};
  getPoints().forEach(p => {
    if (p.type !== 'interdit') return;
    const zid = Number(p.zoneId);
    const zoneId = Number.isInteger(zid) && zid > 0 ? zid : 1;
    if (!zones[zoneId]) zones[zoneId] = [];
    zones[zoneId].push(p);
  });
  return zones;
}

function startNewInterditZone() {
  if (!currentProject) return;
  if (!canRecordPoints()) return;
  const currentZone = getCurrentInterditZoneId();
  const currentPoints = getInterditZones()[currentZone] || [];

  // Pas de nouvelle zone tant que la zone courante n'est pas exploitable
  if (currentPoints.length < 3) {
    showToast("Ajoutez au moins 3 points à la zone interdite courante avant d'en créer une nouvelle", 'error');
    return;
  }

  const nextZone = currentZone + 1;
  currentProject.currentInterditZoneId = nextZone;
  saveProjects();
  renderPointsList();
  if (typeof renderMap === 'function') renderMap();
  showToast(`Nouvelle zone interdite #${nextZone}`, 'info');
}

// ─── NOMS DES ZONES ─────────────────────────────────────────
// Code court affiché sur la carte : ZT1, ZT2… pour la tonte et ZI1, ZI2…
// pour les zones interdites.
function getZoneCode(type, zoneId) {
  const kind = type === 'interdit' ? 'ZI' : 'ZT';
  const id = Number(zoneId) || 1;
  return `${kind}${id}`;
}

function getZoneDisplayName(type, zoneId) {
  const kind = type === 'interdit' ? 'interdit' : 'tonte';
  const id = Number(zoneId) || 1;
  const custom = currentProject?.zoneNames?.[kind]?.[String(id)];
  if (custom) return custom;
  return kind === 'interdit'
    ? `Zone interdite ${getZoneCode('interdit', id)}`
    : `Zone de tonte ${getZoneCode('tonte', id)}`;
}

async function renameZone(type, zoneId) {
  if (!currentProject) return;
  const kind = type === 'interdit' ? 'interdit' : 'tonte';
  const id = Number(zoneId) || 1;
  const current = getZoneDisplayName(kind, id);

  const input = await customPrompt('Nom de la zone :', current, {
    title: 'Renommer la zone',
    placeholder: current,
    confirmText: 'Renommer',
  });
  if (input === null) return;
  const name = input.trim();
  if (!name) {
    showToast('Le nom de la zone ne peut pas être vide', 'error');
    return;
  }

  if (!currentProject.zoneNames || typeof currentProject.zoneNames !== 'object') {
    currentProject.zoneNames = { tonte: {}, interdit: {} };
  }
  if (!currentProject.zoneNames[kind]) currentProject.zoneNames[kind] = {};
  currentProject.zoneNames[kind][String(id)] = name;

  saveProjects();
  renderPointsList();
  if (typeof renderMap === 'function') renderMap();
  if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
  showToast(`Zone renommée : ${name}`, 'info');
}

async function deleteZone(type, zoneId) {
  if (!currentProject) return;
  const kind = type === 'interdit' ? 'interdit' : 'tonte';
  const id = Number(zoneId) || 1;
  const zonePoints = getPoints().filter(p => p.type === kind && (Number(p.zoneId) || 1) === id);
  if (!zonePoints.length) return;

  const name = getZoneDisplayName(kind, id);
  const ok = await customConfirm(
    `Supprimer « ${name} » et ses ${zonePoints.length} point(s) ?`,
    { title: 'Supprimer la zone', confirmText: 'Supprimer', danger: true },
  );
  if (!ok) return;

  currentProject.points = currentProject.points.filter(p => !zonePoints.includes(p));

  // Renumérotation par type
  ['tonte', 'interdit', 'obstacle'].forEach(t => {
    let idx = 1;
    currentProject.points.filter(p => p.type === t).forEach(p => { p.index = idx++; });
  });

  // Recalage des zones courantes. Une zone vide ouverte (max + 1) est
  // conservée si elle n'est pas elle-même supprimée.
  const tonteZones = currentProject.points
    .filter(p => p.type === 'tonte').map(p => Number(p.zoneId) || 1);
  const interditZones = currentProject.points
    .filter(p => p.type === 'interdit').map(p => Number(p.zoneId) || 1);
  const maxTonte = tonteZones.length ? Math.max(...tonteZones) : 1;
  const maxInterdit = interditZones.length ? Math.max(...interditZones) : 1;
  const currentTonte = Number(currentProject.currentZoneId);
  const currentInterdit = Number(currentProject.currentInterditZoneId);
  const deletingTonteZone = kind === 'tonte' && currentTonte === id;
  const deletingInterditZone = kind === 'interdit' && currentInterdit === id;
  if (deletingTonteZone
      || (!tonteZones.includes(currentTonte) && currentTonte !== maxTonte + 1)) {
    currentProject.currentZoneId = maxTonte;
  }
  if (deletingInterditZone
      || (!interditZones.includes(currentInterdit) && currentInterdit !== maxInterdit + 1)) {
    currentProject.currentInterditZoneId = maxInterdit;
  }

  if (currentProject.zoneNames && currentProject.zoneNames[kind]) {
    delete currentProject.zoneNames[kind][String(id)];
  }

  saveProjects();
  renderPointsList();
  if (typeof renderMap === 'function') renderMap();
  if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
  showToast('Zone supprimée', 'info');
}

function getZones() {
  const zones = {};
  getPoints().forEach(p => {
    if (p.type !== 'tonte') return;
    const zid = Number(p.zoneId);
    const zoneId = Number.isInteger(zid) && zid > 0 ? zid : 1;
    if (!zones[zoneId]) zones[zoneId] = [];
    zones[zoneId].push(p);
  });
  return zones;
}

function startNewZone() {
  if (!currentProject) return;
  if (!canRecordPoints()) return;
  const currentZone = getCurrentZoneId();
  const currentPoints = getZones()[currentZone] || [];

  // Pas de nouvelle zone tant que la zone courante n'est pas exploitable
  if (currentPoints.length < 3) {
    showToast("Ajoutez au moins 3 points à la zone courante avant d'en créer une nouvelle", 'error');
    return;
  }

  const nextZone = currentZone + 1;
  currentProject.currentZoneId = nextZone;
  saveProjects();
  updateZoneBadge();
  showToast(`Nouvelle zone #${nextZone}`, 'info');
}

// ─── CHOIX DU TYPE DE NOUVELLE ZONE ─────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeTraceFabMenu();
  });
});

function updateZoneBadge() {
  const el = document.getElementById('zoneBadge');
  if (!el) return;
  const zoneId = getCurrentZoneId();
  el.textContent = `Zone #${zoneId}`;
  el.dataset.zone = zoneId;
}

// ─── ENREGISTRER — ZONE INTERDITE ────────────────────────────
function recordInterdit() {
  if (!canRecordPoints()) return;
  const pos = getPointPosition();
  if (!pos) {
    showToast('Position indisponible — placez la cible sur la carte', 'error');
    return;
  }
  const pt = buildPoint('interdit', null, '🔴', pos);
  // buildPoint() rattache le point à getCurrentInterditZoneId().
  savePoint(pt);
}

// ─── ENREGISTRER — OBSTACLE ISOLÉ ────────────────────────────
function recordObstacle(subtype, icon) {
  if (!canRecordPoints()) return;
  const pos = getPointPosition();
  if (!pos) {
    showToast('Position indisponible — placez la cible sur la carte', 'error');
    return;
  }
  const pt = buildPoint('obstacle', subtype, icon || '🟡', pos);
  savePoint(pt);
  // Ajoute aussi l'obstacle à la bibliothèque globale (réutilisable).
  if (typeof addGlobalObstacle === 'function') addGlobalObstacle(pt);
  // Un obstacle est un tracé ponctuel : on revient à l'état sans type actif.
  if (typeof APP !== 'undefined' && APP.currentTraceMode === 'obstacle') {
    APP.currentTraceMode = null;
    if (typeof updateTraceTypeUI === 'function') updateTraceTypeUI();
  }
}

// ─── CONSTRUCTION D'UN POINT ─────────────────────────────────
function buildPoint(type, subtype, icon, position) {
  const pos = position || getPointPosition();
  if (!pos) return null;

  const gps = pos.source === 'gps';
  const src = gps ? lastGpsData : null;

  counters[type] = (counters[type] || 0) + 1;
  return {
    id:         Date.now(),
    type,
    subtype:    subtype || null,
    name:       null,           // nom personnalisé (facultatif)
    icon:       icon || '📍',
    index:      counters[type],
    ...(type === 'tonte'    ? { zoneId: getCurrentZoneId() } : {}),
    ...(type === 'interdit' ? { zoneId: getCurrentInterditZoneId() } : {}),
    lat:        pos.lat,
    lon:        pos.lon,
    alt:        gps && src ? src.alt : null,
    relX:       gps && src ? src.relX : null,
    relY:       gps && src ? src.relY : null,
    fix:        gps && src ? src.fix : 'Manuel',
    fixScore:   gps && src ? src.score : 0,
    satellites: gps && src ? src.satellites : null,
    hdop:       gps && src ? src.hdop : null,
    timestamp:  new Date().toISOString(),
  };
}

// ─── SAUVEGARDER ─────────────────────────────────────────────
function savePoint(pt) {
  addPointToCurrentProject(pt);
  renderPointsList();
  if (typeof addPointToMap === 'function') addPointToMap(pt);
  if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
}

// ─── SUPPRIMER ───────────────────────────────────────────────
function deletePoint(id) {
  removePointFromCurrentProject(id);
  syncCounters();
  renderPointsList();
  if (typeof renderMap === 'function') renderMap();
  if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
  showToast('Point supprimé', 'info');
}

// ─── RENOMMER UN POINT ───────────────────────────────────────
// Nom affiché : nom personnalisé, sinon sous-type, sinon type.
function getPointDisplayName(p) {
  if (!p) return '—';
  if (p.name) return p.name;
  if (p.subtype) return p.subtype;
  return p.type === 'tonte' ? 'Tonte' : 'Interdit';
}

async function renamePoint(pointId) {
  const pt = getPoints().find(p => p.id === pointId);
  if (!pt) return;

  const input = await customPrompt('Nouveau nom pour ce point :', pt.name || '', {
    title: 'Renommer le point',
    placeholder: pt.name || 'Nom du point',
    confirmText: 'Renommer',
  });
  if (input === null) return;                       // annulation
  const name = input.trim();
  if (!name) {
    showToast('Le nom du point ne peut pas être vide', 'error');
    return;
  }

  pt.name = name;
  saveProjects();
  renderPointsList();
  if (typeof renderMap === 'function') renderMap();
  showToast(`Point renommé : ${name}`, 'info');
}

// ─── TOUT EFFACER ────────────────────────────────────────────
async function clearAllPoints() {
  const pts = getPoints();
  if (pts.length === 0) { showToast('Aucun point à effacer', 'info'); return; }
  const ok = await customConfirm(
    `Effacer les ${pts.length} points de cette parcelle ?`,
    { title: 'Effacer les points', confirmText: 'Effacer', danger: true },
  );
  if (!ok) return;
  clearCurrentProjectPoints();
  counters = { tonte:0, interdit:0, obstacle:0 };
  renderPointsList();
  if (typeof renderMap === 'function') renderMap();
  if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
  showToast('Points effacés', 'info');
}

// La section POINTS ENREGISTRÉS reste accessible par l'onglet HISTORIQUE
// (bouton de navigation basse). Elle n'a plus de raccourci depuis le menu FAB
// de TRACÉS, qui ne contient que les tracés et la parcelle courante.

// ─── RENDU LISTE ─────────────────────────────────────────────
function renderPointsList() {
  const container = document.getElementById('pointsList');
  if (!container) return;
  const pts = getPoints();
  updatePointCount(pts);
  updateZoneBadge();

  if (pts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        ${currentProject
          ? 'Aucun point enregistré.<br>Touchez le bouton ＋ sur la carte<br>pour commencer un tracé.'
          : 'Aucune parcelle sélectionnée.<br>Choisissez ou créez une parcelle<br>via le bouton Parcelle.'}
      </div>`;
    return;
  }

  // Groupes par type (zones de tonte et zones interdites groupées par zoneId)
  const zones         = getZones();
  const interditZones = getInterditZones();
  const obstacle      = pts.filter(p => p.type === 'obstacle');

  const interditGroups = Object.keys(interditZones).map(Number).sort((a, b) => a - b)
    .map(zoneId => renderGroup(getZoneDisplayName('interdit', zoneId), interditZones[zoneId], '#dc2626', 'interdit'))
    .join('');

  container.innerHTML =
    Object.keys(zones).map(Number).sort((a, b) => a - b)
      .map(zoneId => renderGroup(getZoneDisplayName('tonte', zoneId), zones[zoneId], getZonePalette(zoneId).stroke, 'tonte'))
      .join('') +
    interditGroups +
    renderGroup('Obstacles isolés', obstacle,'#d97706', 'obstacle');
}

function renderGroup(title, pts, color, type) {
  if (pts.length === 0) return '';
  const numberedZone = type === 'tonte' || type === 'interdit';
  return `
    <div class="points-group">
      <div class="points-group-header" style="border-left-color:${color}">
        <span>${title}</span>
        <span class="points-group-count" style="background:${color}">${pts.length}</span>
      </div>
      ${pts.map((p, i) => renderPointItem(p, numberedZone ? i + 1 : null)).join('')}
    </div>`;
}

function renderPointItem(p, zoneIndex = null) {
  const date = new Date(p.timestamp).toLocaleDateString('fr-FR');
  const time  = fmtTime(p.timestamp);
  const inZone = p.type === 'tonte' || p.type === 'interdit';
  const number = inZone && Number.isInteger(zoneIndex) ? zoneIndex : p.index;
  const customName = p.name ? ` — ${p.name}` : '';
  const name = inZone
    ? `${p.icon} Point ${number}${customName}`
    : `${p.icon} ${getPointDisplayName(p)} #${p.index}`;
  const zoneMeta = inZone ? `${getZoneCode(p.type, p.zoneId)} &nbsp;·&nbsp; ` : '';
  const fix   = getFixMeta(p.fix);
  return `
    <div class="point-item">
      <div class="point-dot ${p.type}"></div>
      <div class="point-info">
        <div class="point-name">${name}</div>
        <div class="point-coords">${fmt(p.lat,6)}, ${fmt(p.lon,6)}</div>
        <div class="point-meta">
          ${zoneMeta}Alt: ${fmt(p.alt,1)}m &nbsp;·&nbsp;
          <span class="${fix.cssClass}" style="font-size:10px;font-weight:700">${p.fix}</span>
          &nbsp;·&nbsp; Sat: ${p.satellites || '—'}
        </div>
      </div>
      <div class="point-item-side">
        <span class="point-date">${date}</span>
        <span class="point-time">${time}</span>
        <div class="point-item-actions">
          <button class="btn-edit" onclick="renamePoint(${p.id})" title="Renommer">${ICON_PENCIL}</button>
          <button class="btn-del" onclick="deletePoint(${p.id})" title="Supprimer">${ICON_TRASH}</button>
        </div>
      </div>
    </div>`;
}

function updatePointCount(pts) {
  const el = document.getElementById('pointCount');
  if (el) el.textContent = `${pts.length} point(s)`;
}
