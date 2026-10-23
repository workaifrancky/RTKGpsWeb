// ============================================================
// simulation.js — Mode simulation (tests sans GPS)
// RTKGpsWeb v2 — RTK Mower
// ============================================================

const SIMULATION_PROJECT_NAME = 'Simulation';
const SIM_BASE_LAT = 44.832223;
const SIM_BASE_LON = -0.701992;

// Génère un projet fictif complet et l'injecte dans les données.
// Retourne la liste des points générés.
function generateSimulationData() {
  // ── 1. Projet « Simulation » (créé ou réutilisé) ────────────
  let simProject = typeof projects !== 'undefined'
    ? projects.find(p => p.name === SIMULATION_PROJECT_NAME)
    : null;

  if (!simProject) {
    simProject = addProject(SIMULATION_PROJECT_NAME, false);
  } else if (typeof currentProject === 'undefined' || currentProject?.id !== simProject.id) {
    switchProject(simProject.id);
  }

  // Repart d'une parcelle vierge à chaque activation
  clearCurrentProjectPoints();
  simProject.currentZoneId = 1;

  // ── 2. Points fictifs ───────────────────────────────────────
  const now = Date.now();
  let nextId = now;
  const baseLat = SIM_BASE_LAT;
  const baseLon = SIM_BASE_LON;

  const makePoint = (type, lat, lon, index, opts = {}) => ({
    id:         nextId++,
    type,
    subtype:    opts.subtype || null,
    icon:       opts.icon || '📍',
    index,
    ...(type === 'tonte' ? { zoneId: opts.zoneId || 1 } : {}),
    lat,
    lon,
    alt:        opts.alt ?? 120,
    relX:       (lon - baseLon) * Math.cos(baseLat * Math.PI / 180) * 111320,
    relY:       (lat - baseLat) * 111320,
    fix:        'RTK Fix',
    fixScore:   4,
    satellites: opts.satellites ?? 23,
    hdop:       opts.hdop ?? 0.6,
    timestamp:  new Date(now + (opts.offset || 0) * 1000).toISOString(),
  });

  const points = [
    // Base du rover (centre)
    makePoint('base', baseLat, baseLon, 1,
      { icon:'🏠', alt:120, satellites:25, hdop:0.5, offset:0 }),

    // Zone de tonte n°1 : carré autour de la base
    makePoint('tonte', baseLat + 0.0001, baseLon - 0.0001, 1, { icon:'🟢', zoneId:1, offset:10 }),
    makePoint('tonte', baseLat + 0.0001, baseLon + 0.0001, 2, { icon:'🟢', zoneId:1, offset:20 }),
    makePoint('tonte', baseLat - 0.0001, baseLon + 0.0001, 3, { icon:'🟢', zoneId:1, offset:30 }),
    makePoint('tonte', baseLat - 0.0001, baseLon - 0.0001, 4, { icon:'🟢', zoneId:1, offset:40 }),

    // Zone de tonte n°2 : carré décalé au nord-est (sans chevauchement)
    makePoint('tonte', baseLat + 0.0005, baseLon + 0.0003, 5, { icon:'🟢', zoneId:2, offset:50 }),
    makePoint('tonte', baseLat + 0.0005, baseLon + 0.0005, 6, { icon:'🟢', zoneId:2, offset:60 }),
    makePoint('tonte', baseLat + 0.0003, baseLon + 0.0005, 7, { icon:'🟢', zoneId:2, offset:70 }),
    makePoint('tonte', baseLat + 0.0003, baseLon + 0.0003, 8, { icon:'🟢', zoneId:2, offset:80 }),

    // Zone interdite : triangle au centre de la parcelle
    makePoint('interdit', baseLat + 0.00005, baseLon - 0.00005, 1, { icon:'🔴', offset:90 }),
    makePoint('interdit', baseLat + 0.00005, baseLon + 0.00002, 2, { icon:'🔴', offset:100 }),
    makePoint('interdit', baseLat - 0.00002, baseLon - 0.00002, 3, { icon:'🔴', offset:110 }),

    // Obstacles isolés
    makePoint('obstacle', baseLat + 0.00007, baseLon + 0.00007, 1,
      { subtype:'Arbre', icon:'🌳', offset:120 }),
    makePoint('obstacle', baseLat - 0.00008, baseLon + 0.00008, 2,
      { subtype:'Poteau', icon:'🪝', offset:130 }),
    makePoint('obstacle', baseLat - 0.00006, baseLon - 0.00007, 3,
      { subtype:'Souche', icon:'🪵', offset:140 }),
  ];

  // ── 3. Injection via les helpers existants ──────────────────
  // La zone 1 est injectée, puis currentZoneId passe à 2 pour la seconde zone.
  const basePoints     = points.filter(p => p.type === 'base');
  const zone1Points    = points.filter(p => p.type === 'tonte' && p.zoneId === 1);
  const zone2Points    = points.filter(p => p.type === 'tonte' && p.zoneId === 2);
  const interditPoints = points.filter(p => p.type === 'interdit');
  const obstaclePoints = points.filter(p => p.type === 'obstacle');

  simProject.currentZoneId = 1;
  basePoints.concat(zone1Points).forEach(pt => addPointToCurrentProject(pt));

  simProject.currentZoneId = 2;
  zone2Points.concat(interditPoints, obstaclePoints).forEach(pt => addPointToCurrentProject(pt));

  // ── 4. Rafraîchissement de l'interface ──────────────────────
  syncCounters();
  renderPointsList();
  if (typeof renderMap === 'function') renderMap();
  if (typeof updateStatsDisplay === 'function') updateStatsDisplay();

  showToast('🎮 Mode simulation activé — 2 zones, 3 obstacles, 1 base', 'info');
  return points;
}

// ─── SIMULATION D'UNE TRAME GPS ──────────────────────────────
// Injecte une fausse trame dans le même pipeline que le BLE
// (parseGpsFrame → updateUI) pour tester l'onglet DONNÉES.
function simulateGpsFrame() {
  const raw = [
    'Fix: RTK Fix',
    'Lat: 44.832223',
    'Lon: -0.701992',
    'Alt: 120.5',
    'Rel_X: 0',
    'Rel_Y: 0',
    'Sat: 23',
    'HDOP: 0.6',
    'Speed: 1.2',
    'Cap: 45',
    'Date: 2026-10-23T14:00:00Z',
  ].join('\n');

  const data = parseGpsFrame(raw);

  APP.hasGpsData = true;
  APP.lastUpdate = new Date();
  updateUI(data);

  showToast('Trame GPS simulée', 'info');
  return data;
}
