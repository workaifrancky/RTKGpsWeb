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

// Retour haptique des captures : courte vibration quand le point est
// enregistré avec un fix exploitable (Float RTK / RTK Fix), motif long si le
// récepteur est connecté mais que la précision est insuffisante.
function vibratePointFeedback(success = true) {
  if (!navigator.vibrate) return;
  try {
    navigator.vibrate(success ? 50 : [100, 50, 100]);
  } catch (error) {
    // Vibration indisponible : aucune conséquence sur l'enregistrement.
  }
}

function hasWeakGpsFix() {
  // Un point reste enregistrable dès Float RTK (score 3), mais le retour
  // haptique long signale que l'on n'est pas en RTK Fix (score 4).
  return typeof APP !== 'undefined'
    && APP.bleConnected
    && typeof lastGpsData !== 'undefined'
    && lastGpsData
    && Number(lastGpsData.score || 0) < 4;
}

function signalPointRecorded() {
  vibratePointFeedback(!hasWeakGpsFix());
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

// ─── STAKEOUT : GUIDAGE VERS LE PREMIER SOMMET ───────────────
// Pendant un tracé de zone, le bouton dédié (à droite du FAB) guide vers le
// premier point de la zone, c'est-à-dire le sommet de fermeture. Il ne
// remplace pas le FAB d'ajout de point : il fonctionne en parallèle.
const STAKEOUT_THRESHOLDS_M = [10, 5, 2, 1];
const STAKEOUT_HYSTERESIS_M = 0.5;
const STAKEOUT_ARRIVAL_M = 0.5;
const STAKEOUT_REARM_M = 1.5;
let stakeoutActive = false;
let stakeoutTimer = null;
let stakeoutThresholdsArmed = {};
let stakeoutArrivalAnnounced = false;

function getCurrentZoneTracePoints() {
  const type = (typeof APP !== 'undefined' && APP.currentTraceMode) || null;
  if (type === 'tonte') return getZones()[getCurrentZoneId()] || [];
  if (type === 'interdit') return getInterditZones()[getCurrentInterditZoneId()] || [];
  return [];
}

function getStakeoutTarget() {
  return getCurrentZoneTracePoints()[0] || null;
}

function getStakeoutPosition() {
  if (typeof APP !== 'undefined' && APP.bleConnected
      && typeof lastGpsData !== 'undefined' && isPositionValid(lastGpsData)) {
    return { lat: lastGpsData.lat, lon: lastGpsData.lon };
  }
  if (typeof getTargetCoords === 'function') {
    const target = getTargetCoords();
    if (target && Number.isFinite(target.lat) && Number.isFinite(target.lon)) {
      return { lat: target.lat, lon: target.lon };
    }
  }
  return null;
}

function getStakeoutBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180)
    - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

function formatStakeoutDistance(distance) {
  if (distance < 1) return `${Math.max(0, Math.round(distance * 100))} cm`;
  if (distance < 10) return `${distance.toFixed(1)} m`;
  return `${Math.round(distance)} m`;
}

function speakStakeout(text) {
  if (!text || typeof window === 'undefined') return;
  if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.lang = 'fr-FR';
    utterance.rate = 1.05;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    // Synthèse indisponible : le HUD et les vibrations restent actifs.
  }
}

function vibrateStakeout(pattern) {
  if (!navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch (error) {
    // Vibration indisponible.
  }
}

function resetStakeoutThresholds() {
  stakeoutThresholdsArmed = {};
  STAKEOUT_THRESHOLDS_M.forEach(threshold => {
    stakeoutThresholdsArmed[threshold] = true;
  });
  stakeoutArrivalAnnounced = false;
}

function updateStakeoutGuidance() {
  if (!stakeoutActive) return;

  const target = getStakeoutTarget();
  if (!target) {
    stopStakeout(false);
    showToast('Stakeout arrêté : plus aucun sommet dans la zone', 'info');
    return;
  }

  const distanceEl = document.getElementById('stakeoutDistance');
  const bearingEl = document.getElementById('stakeoutBearing');
  const pos = getStakeoutPosition();
  if (!pos) {
    if (distanceEl) distanceEl.textContent = 'En attente de position';
    if (bearingEl) bearingEl.textContent = 'GPS ou cible de carte';
    return;
  }

  const distance = haversine(pos.lat, pos.lon, target.lat, target.lon);
  const bearing = getStakeoutBearing(pos.lat, pos.lon, target.lat, target.lon);

  if (distanceEl) distanceEl.textContent = `Sommet : ${formatStakeoutDistance(distance)}`;
  if (bearingEl) bearingEl.textContent = `Cap ${bearing.toFixed(0)}°`;

  let crossedThreshold = null;
  STAKEOUT_THRESHOLDS_M.forEach(threshold => {
    if (distance <= threshold) {
      if (stakeoutThresholdsArmed[threshold] !== false) {
        stakeoutThresholdsArmed[threshold] = false;
        crossedThreshold = threshold;
      }
    } else if (distance > threshold + STAKEOUT_HYSTERESIS_M) {
      stakeoutThresholdsArmed[threshold] = true;
    }
  });

  if (crossedThreshold !== null) {
    const metres = `${crossedThreshold} mètre${crossedThreshold > 1 ? 's' : ''}`;
    speakStakeout(`Avance de ${metres} vers le sommet`);
    vibrateStakeout(60);
  }

  if (distance < STAKEOUT_ARRIVAL_M) {
    if (!stakeoutArrivalAnnounced) {
      stakeoutArrivalAnnounced = true;
      speakStakeout('Sommet atteint');
      vibrateStakeout([40, 60, 120]);
    }
  } else if (distance > STAKEOUT_REARM_M) {
    stakeoutArrivalAnnounced = false;
  }
}

function startStakeout() {
  const type = (typeof APP !== 'undefined' && APP.currentTraceMode) || null;
  if (type !== 'tonte' && type !== 'interdit') {
    showToast('Stakeout disponible pendant un tracé de zone', 'info');
    return;
  }
  const target = getStakeoutTarget();
  if (!target) {
    showToast('Ajoutez au moins un point avant de lancer le Stakeout', 'info');
    return;
  }

  closeTraceFabMenu();
  stakeoutActive = true;
  resetStakeoutThresholds();

  const btn = document.getElementById('traceFabStakeout');
  if (btn) btn.setAttribute('aria-pressed', 'true');
  const hud = document.getElementById('stakeoutHud');
  if (hud) hud.hidden = false;

  if (stakeoutTimer) clearInterval(stakeoutTimer);
  stakeoutTimer = setInterval(updateStakeoutGuidance, 750);

  speakStakeout('Guidage vers le premier sommet activé');
  updateStakeoutGuidance();
}

function stopStakeout(notify = true) {
  if (stakeoutTimer) {
    clearInterval(stakeoutTimer);
    stakeoutTimer = null;
  }
  const wasActive = stakeoutActive;
  stakeoutActive = false;
  resetStakeoutThresholds();

  const btn = document.getElementById('traceFabStakeout');
  if (btn) btn.setAttribute('aria-pressed', 'false');
  const hud = document.getElementById('stakeoutHud');
  if (hud) hud.hidden = true;

  if (wasActive && notify) {
    speakStakeout('Guidage arrêté');
    showToast('Stakeout arrêté', 'info', 1800);
  }
}

function toggleStakeout() {
  if (stakeoutActive) stopStakeout();
  else startStakeout();
}

function syncTraceFabUI() {
  const fab = document.getElementById('traceFab');
  if (!fab) return;

  const hasProject = !!currentProject;
  const onTracesTab = typeof APP === 'undefined' || APP.currentTab === 'tab-points';
  // Le FAB reste visible sur TRACÉS même sans parcelle : son menu porte
  // l'option « Parcelle : … », accès au tiroir (création/sélection).
  const visible = onTracesTab;
  fab.hidden = !visible;
  if (!visible) closeTraceFabMenu();

  const type = hasProject
    ? ((typeof APP !== 'undefined' && APP.currentTraceMode) || null)
    : null;
  const pendingObstacle = (typeof APP !== 'undefined' && APP.pendingObstacle) || null;
  const main = document.getElementById('traceFabMain');
  const secondary = document.getElementById('traceFabSecondary');
  const stakeout = document.getElementById('traceFabStakeout');
  const zonePointsForStakeout = hasProject && (type === 'tonte' || type === 'interdit')
    ? getCurrentZoneTracePoints()
    : [];
  const stakeoutEligible = visible && hasProject && !!type && type !== 'obstacle'
    && zonePointsForStakeout.length > 0;
  if (stakeout) {
    stakeout.hidden = !stakeoutEligible;
    if (!stakeoutEligible && stakeoutActive) stopStakeout(false);
  }

  if (main) {
    main.className = `trace-fab-main ${type || 'neutral'}`;
    if (!hasProject) {
      main.title = 'Aucune parcelle — en choisir ou en créer une';
    } else if (type === 'obstacle' && pendingObstacle) {
      // Type choisi : le clic sur le FAB valide l'obstacle (position = cible).
      main.title = `Valider l'obstacle « ${getObstacleTypeLabel(pendingObstacle.type)} »`;
    } else if (type === 'obstacle') {
      main.title = 'Choisir le type d’obstacle';
    } else if (type) {
      main.title = `Ajouter un point — ${TRACE_TYPE_LABELS[type]}`;
    } else {
      main.title = 'Choisir un tracé';
    }
    main.setAttribute('aria-label', main.title);
  }

  if (secondary) {
    // Un obstacle est ponctuel : il se valide avec le FAB, le bouton « ✓ »
    // (terminer la zone) n'a pas de sens et reste masqué.
    secondary.hidden = !hasProject || !type || type === 'obstacle';
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

  // Le HUD de Stakeout occupe la même zone que le menu : on arrête le guidage
  // avant d'ouvrir le choix du tracé.
  if (stakeoutActive) stopStakeout(false);

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

  if (typeof APP !== 'undefined') {
    APP.tracesMode = 'creation';
    // Nouveau type : aucun obstacle en attente de positionnement.
    APP.pendingObstacle = null;
  }

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
  APP.pendingObstacle = null;
  APP.tracesMode = 'lecture';
  syncTracesModeUI();
  syncTraceFabUI();
}

function onTraceFabMainClick() {
  const menu = document.getElementById('traceFabMenu');
  if (menu && menu.classList.contains('show')) {
    closeTraceFabMenu();
    return;
  }

  // Sans parcelle, le clic ouvre le menu : la 1re option « Parcelle : … »
  // mène au tiroir de création/sélection.
  if (!currentProject) {
    openTraceFabMenu();
    return;
  }

  const type = (typeof APP !== 'undefined' && APP.currentTraceMode) || null;
  if (!type) {
    openTraceFabMenu();
    return;
  }
  if (type === 'obstacle') {
    // Type déjà choisi dans la modale : le clic sur le FAB VALIDE l'obstacle
    // à la position de la cible. Sinon, on (re)demande le type.
    const pending = (typeof APP !== 'undefined' && APP.pendingObstacle) || null;
    if (pending && typeof recordObstacle === 'function') {
      recordObstacle(pending.type, pending.icon, pending.name);
      return;
    }
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
    vibratePointFeedback(false);
    showToast('Position indisponible — placez la cible sur la carte', 'error');
    return;
  }
  const pt = buildPoint('tonte', null, '🟢', pos);
  savePoint(pt);
  signalPointRecorded();
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

// Libellé d'une zone : nom personnalisé, sinon « Zone de tonte (ZT) » /
// « Zone interdite (ZI) ». Le numéro n'apparaît plus dans le libellé : le code
// complet de la zone (ZT1, ZI2…) reste affiché dans la méta de chaque point
// (`getZoneCode()`) et sur la carte.
function getZoneDisplayName(type, zoneId) {
  const kind = type === 'interdit' ? 'interdit' : 'tonte';
  const id = Number(zoneId) || 1;
  const custom = currentProject?.zoneNames?.[kind]?.[String(id)];
  if (custom) return custom;
  return kind === 'interdit' ? 'Zone interdite (ZI)' : 'Zone de tonte (ZT)';
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

// Le badge « Zone #N » a été retiré de la vue détail (allègement de la liste) :
// la fonction reste appelée par projects.js / points.js et ne fait rien tant que
// l'élément est absent. La zone courante reste stockée dans `currentZoneId` et
// affichée par le code ZT/ZI de chaque point — aucune logique de tracé n'est
// impactée.
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
    vibratePointFeedback(false);
    showToast('Position indisponible — placez la cible sur la carte', 'error');
    return;
  }
  const pt = buildPoint('interdit', null, '🔴', pos);
  // buildPoint() rattache le point à getCurrentInterditZoneId().
  savePoint(pt);
  signalPointRecorded();
}

// ─── ENREGISTRER — OBSTACLE ISOLÉ ────────────────────────────
function recordObstacle(subtype, icon, name) {
  if (!canRecordPoints()) return;
  const pos = getPointPosition();
  if (!pos) {
    vibratePointFeedback(false);
    showToast('Position indisponible — placez la cible sur la carte', 'error');
    return;
  }
  const pt = buildPoint('obstacle', subtype, icon || '🟡', pos);
  pt.name = name && String(name).trim() ? String(name).trim() : null;
  savePoint(pt);
  // Ajoute aussi l'obstacle à la bibliothèque globale (réutilisable).
  if (typeof addGlobalObstacle === 'function') addGlobalObstacle(pt);
  // Mémorise le dernier type et le dernier nom pour pré-remplir la modale.
  try {
    if (subtype) localStorage.setItem(LAST_OBSTACLE_TYPE_KEY, subtype);
    if (pt.name) localStorage.setItem(LAST_OBSTACLE_NAME_KEY, pt.name);
  } catch (error) {
    // Stockage indisponible : valeurs par défaut conservées.
  }
  signalPointRecorded();
  // Un obstacle est un tracé ponctuel : on revient à l'état sans type actif.
  if (typeof APP !== 'undefined') {
    APP.pendingObstacle = null;
    if (APP.currentTraceMode === 'obstacle') {
      APP.currentTraceMode = null;
      if (typeof updateTraceTypeUI === 'function') updateTraceTypeUI();
    }
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
  // Le bouton Stakeout apparaît dès le premier point de la zone.
  syncTraceFabUI();
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
  // Sous-type affiché (« Divers » pour le sous-type stocké « Perso »).
  if (p.subtype) return getObstacleTypeLabel(p.subtype);
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
    .map(zoneId => renderGroup(getZoneDisplayName('interdit', zoneId), interditZones[zoneId], '#dc2626'))
    .join('');

  container.innerHTML =
    Object.keys(zones).map(Number).sort((a, b) => a - b)
      .map(zoneId => renderGroup(getZoneDisplayName('tonte', zoneId), zones[zoneId], getZonePalette(zoneId).stroke))
      .join('') +
    interditGroups +
    renderGroup('Obstacles isolés', obstacle,'#d97706');
}

function renderGroup(title, pts, color) {
  if (pts.length === 0) return '';
  return `
    <div class="points-group">
      <div class="points-group-header" style="border-left-color:${color}">
        <span>${title}</span>
      </div>
      ${pts.map(p => renderPointItem(p)).join('')}
    </div>`;
}

function renderPointItem(p) {
  const date = new Date(p.timestamp).toLocaleDateString('fr-FR');
  const time  = fmtTime(p.timestamp);
  const inZone = p.type === 'tonte' || p.type === 'interdit';
  const customName = p.name ? ` — ${p.name}` : '';
  // Le type est porté par la pastille `.point-dot` à gauche : plus d'emoji
  // `p.icon` dans l'interface (le champ reste intact pour l'export GeoJSON).
  // Un obstacle affiche en plus l'icône Lucide de son sous-type.
  const obstacleIcon = !inZone && p.type === 'obstacle' && typeof getObstacleIconMarkup === 'function'
    ? `<span class="obstacle-type-icon" aria-hidden="true">${getObstacleIconMarkup(p.subtype)}</span>`
    : '';
  // Libellés SANS numéro d'ordre : « Arbre » pour un obstacle, « Point » (ou
  // « Point — Nom ») dans une zone. Le numéro d'ordre reste dans `point.index`
  // (cible CAMÉRA, export CSV / GPX / GeoJSON) : il n'est plus affiché dans la
  // liste des points de HISTORIQUE.
  const name = inZone
    ? `Point${customName}`
    : `${obstacleIcon}${getPointDisplayName(p)}`;
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
