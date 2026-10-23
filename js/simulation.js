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

    // Zone de tonte : carré de 0.0001° de côté autour de la base
    makePoint('tonte', baseLat + 0.0001, baseLon - 0.0001, 1, { icon:'🟢', offset:10 }),
    makePoint('tonte', baseLat + 0.0001, baseLon + 0.0001, 2, { icon:'🟢', offset:20 }),
    makePoint('tonte', baseLat - 0.0001, baseLon + 0.0001, 3, { icon:'🟢', offset:30 }),
    makePoint('tonte', baseLat - 0.0001, baseLon - 0.0001, 4, { icon:'🟢', offset:40 }),

    // Zone interdite : triangle au centre de la parcelle
    makePoint('interdit', baseLat + 0.00005, baseLon - 0.00005, 1, { icon:'🔴', offset:50 }),
    makePoint('interdit', baseLat + 0.00005, baseLon + 0.00002, 2, { icon:'🔴', offset:60 }),
    makePoint('interdit', baseLat - 0.00002, baseLon - 0.00002, 3, { icon:'🔴', offset:70 }),

    // Obstacles isolés
    makePoint('obstacle', baseLat + 0.00007, baseLon + 0.00007, 1,
      { subtype:'Arbre', icon:'🌳', offset:80 }),
    makePoint('obstacle', baseLat - 0.00008, baseLon + 0.00008, 2,
      { subtype:'Poteau', icon:'🪝', offset:90 }),
    makePoint('obstacle', baseLat - 0.00006, baseLon - 0.00007, 3,
      { subtype:'Souche', icon:'🪵', offset:100 }),
  ];

  // ── 3. Injection via les helpers existants ──────────────────
  points.forEach(pt => addPointToCurrentProject(pt));

  // ── 4. Rafraîchissement de l'interface ──────────────────────
  syncCounters();
  renderPointsList();
  if (typeof renderMap === 'function') renderMap();
  if (typeof updateStatsDisplay === 'function') updateStatsDisplay();

  showToast(`🎮 Mode simulation activé — ${points.length} points générés`, 'info');
  return points;
}
