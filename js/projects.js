// ============================================================
// projects.js — Gestion des projets/parcelles
// RTKGpsWeb v2
// ============================================================

const PROJECT_KEY    = 'rtkProjects';
const CURRENT_KEY    = 'rtkCurrentProject';
const GLOBAL_OBSTACLES_KEY = 'rtkGlobalObstacles';

// ─── ÉTAT ────────────────────────────────────────────────────
let projects        = [];
let currentProject  = null;
let globalObstacles = [];   // bibliothèque d'obstacles réutilisables

// ─── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  projects       = loadProjects();
  currentProject = loadCurrentProject();
  // Crée un projet par défaut si aucun n'existe
  if (projects.length === 0) {
    addProject('Mon jardin', false);
  }
  if (!currentProject || !projects.find(p => p.id === currentProject.id)) {
    currentProject = projects[0];
    saveCurrentProject();
  }
  // Charge (et amorce au premier lancement) la base globale des obstacles.
  globalObstacles = loadGlobalObstacles();
  // Persiste la migration éventuelle (purge des anciens points `base`)
  // et rafraîchit le tiroir + le nom de la parcelle dans le header.
  saveProjects();

  // Fermeture du tiroir au clavier (Échap).
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeProjectDrawer();
  });
});

// ─── THÉÂTRE : ÉCHAPPEMENT HTML ──────────────────────────────
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

// ─── BASE GLOBALE DES OBSTACLES ──────────────────────────────
// Bibliothèque réutilisable d'une parcelle à l'autre (localStorage).
// Un obstacle y est identifié par son nom (ou sous-type) + ses coordonnées.
function sameObstacle(a, b) {
  if (!a || !b) return false;
  const nameA = String(a.name || a.subtype || '').trim().toLowerCase();
  const nameB = String(b.name || b.subtype || '').trim().toLowerCase();
  return nameA === nameB
    && Math.abs(Number(a.lat) - Number(b.lat)) < 1e-9
    && Math.abs(Number(a.lon) - Number(b.lon)) < 1e-9;
}

function buildGlobalObstacleEntry(point, projectId) {
  return {
    id:        'obs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    name:      point.name || null,
    subtype:   point.subtype || 'Autre',
    icon:      point.icon || '🟡',
    lat:       Number(point.lat),
    lon:       Number(point.lon),
    alt:       point.alt ?? null,
    rayon:     1.0,
    createdAt: new Date().toISOString(),
    projectId: projectId || null,
  };
}

// Lit la base ; au premier lancement (clé absente), l'amorce avec les obstacles
// déjà présents dans les parcelles (dédoublonnés par nom + coordonnées).
function loadGlobalObstacles() {
  const raw = localStorage.getItem(GLOBAL_OBSTACLES_KEY);
  if (raw === null) {
    const seeded = [];
    projects.forEach(project => {
      (project.points || []).forEach(p => {
        if (!p || p.type !== 'obstacle') return;
        if (seeded.some(o => sameObstacle(o, p))) return;
        seeded.push(buildGlobalObstacleEntry(p, project.id));
      });
    });
    localStorage.setItem(GLOBAL_OBSTACLES_KEY, JSON.stringify(seeded));
    return seeded;
  }
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(o => o && Number.isFinite(Number(o.lat)) && Number.isFinite(Number(o.lon)));
  } catch { return []; }
}

function saveGlobalObstacles() {
  localStorage.setItem(GLOBAL_OBSTACLES_KEY, JSON.stringify(globalObstacles));
}

// Ajoute un obstacle enregistré à la base globale (mise à jour si doublon).
function addGlobalObstacle(point) {
  if (!point || point.type !== 'obstacle') return null;
  const entry = buildGlobalObstacleEntry(point, currentProject ? currentProject.id : null);
  const existing = globalObstacles.find(o => sameObstacle(o, entry));
  if (existing) {
    existing.name      = existing.name || entry.name;
    existing.subtype   = entry.subtype;
    existing.icon      = entry.icon;
    existing.lat       = entry.lat;
    existing.lon       = entry.lon;
    existing.alt       = entry.alt;
    existing.projectId = entry.projectId;
    saveGlobalObstacles();
    return existing;
  }
  globalObstacles.push(entry);
  saveGlobalObstacles();
  return entry;
}

// ─── IMPORT DANS UNE PARCELLE ────────────────────────────────
// Copie les obstacles sélectionnés (nouveaux IDs, attributs conservés) en
// ignorant ceux déjà présents (même nom + coordonnées).
function importGlobalObstacles(project, ids, persist = true) {
  if (!project || !Array.isArray(project.points)) return 0;
  const wanted = new Set(Array.isArray(ids) ? ids : []);
  let imported = 0;

  globalObstacles.forEach(entry => {
    if (!wanted.has(entry.id)) return;
    if (project.points.some(p => p && p.type === 'obstacle' && sameObstacle(p, entry))) return;
    project.points.push({
      id:           Date.now() + imported,
      type:         'obstacle',
      subtype:      entry.subtype || 'Autre',
      name:         entry.name || null,
      icon:         entry.icon || '🟡',
      index:        0,
      lat:          Number(entry.lat),
      lon:          Number(entry.lon),
      alt:          entry.alt ?? null,
      relX:         null,
      relY:         null,
      fix:          'Manuel',
      fixScore:     0,
      satellites:   null,
      hdop:         null,
      timestamp:    new Date().toISOString(),
      importedFrom: entry.id,
    });
    imported++;
  });

  if (imported) {
    let idx = 1;
    project.points.filter(p => p.type === 'obstacle').forEach(p => { p.index = idx++; });
    if (persist) saveProjects();
  }
  return imported;
}

// ─── SÉLECTEUR D'OBSTACLES (modale parcelle) ─────────────────
function renderGlobalObstaclePicker() {
  const container = document.getElementById('globalObstacleList');
  const toggle    = document.getElementById('btnToggleAllObstacles');
  if (!container) return;

  if (!globalObstacles.length) {
    container.innerHTML = '<div class="import-obstacles-empty">Aucun obstacle enregistré pour le moment.</div>';
  } else {
    container.innerHTML = globalObstacles.map(o => {
      const name   = escapeHtml(o.name || o.subtype || 'Obstacle');
      const coords = `${Number(o.lat).toFixed(5)}, ${Number(o.lon).toFixed(5)}`;
      return `
        <label class="import-obstacle-item">
          <input type="checkbox" class="import-obstacle-check" value="${escapeHtml(o.id)}">
          <span class="import-obstacle-icon" aria-hidden="true">${escapeHtml(o.icon || '🟡')}</span>
          <span class="import-obstacle-name">${name}</span>
          <span class="import-obstacle-coords">${coords}</span>
        </label>`;
    }).join('');
  }

  if (toggle) {
    toggle.disabled = globalObstacles.length === 0;
    toggle.textContent = 'Tout cocher';
  }
}

function getSelectedGlobalObstacleIds() {
  return Array.from(document.querySelectorAll('.import-obstacle-check:checked'))
    .map(input => input.value);
}

function toggleAllGlobalObstacles() {
  const checks = Array.from(document.querySelectorAll('.import-obstacle-check'));
  if (!checks.length) return;
  const allChecked = checks.every(c => c.checked);
  checks.forEach(c => { c.checked = !allChecked; });
  const toggle = document.getElementById('btnToggleAllObstacles');
  if (toggle) toggle.textContent = allChecked ? 'Tout cocher' : 'Tout décocher';
}

function resetGlobalObstaclePicker() {
  document.querySelectorAll('.import-obstacle-check').forEach(c => { c.checked = false; });
  const toggle = document.getElementById('btnToggleAllObstacles');
  if (toggle) {
    toggle.textContent = 'Tout cocher';
    toggle.disabled = globalObstacles.length === 0;
  }
}

// ─── AJOUT D'UN PROJET ───────────────────────────────────────
function addProject(name, renderAfter = true, importIds = []) {
  const project = {
    id:            'proj_' + Date.now(),
    name:          name.trim(),
    createdAt:     new Date().toISOString(),
    currentZoneId: 1,       // zone de tonte en cours d'enregistrement
    points:        [],
  };
  projects.push(project);
  currentProject = project;
  saveCurrentProject();
  // Import éventuel des obstacles sélectionnés avant le premier rendu.
  if (Array.isArray(importIds) && importIds.length) {
    importGlobalObstacles(project, importIds, false);
  }
  saveProjects();           // persiste + rafraîchit tiroir et libellé du header
  if (renderAfter) {
    if (typeof updateZoneBadge    === 'function') updateZoneBadge();
    if (typeof renderMap          === 'function') renderMap();
    if (typeof renderPointsList   === 'function') renderPointsList();
    if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
    closeProjectDrawer();
  }
  return project;
}

// ─── SUPPRIMER UN PROJET ─────────────────────────────────────
function deleteProject(projectId) {
  if (projects.length <= 1) {
    showToast('Impossible — au moins une parcelle requise', 'error');
    return;
  }
  const proj = projects.find(p => p.id === projectId);
  if (!proj) return;
  if (!confirm(`Supprimer la parcelle "${proj.name}" et tous ses points ?`)) return;

  projects = projects.filter(p => p.id !== projectId);
  if (!currentProject || currentProject.id === projectId) {
    currentProject = projects[0];
    saveCurrentProject();
  }
  saveProjects();          // persiste + rafraîchit tiroir et libellé du header
  if (typeof updateZoneBadge  === 'function') updateZoneBadge();
  if (typeof renderMap        === 'function') renderMap();
  if (typeof renderPointsList === 'function') renderPointsList();
  if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
  if (APP.currentTab === 'tab-history' && typeof loadHistory === 'function') loadHistory();
  showToast('Parcelle supprimée', 'info');
}

function deleteCurrentProject() {
  if (currentProject) deleteProject(currentProject.id);
}

// ─── RENOMMER UN PROJET ──────────────────────────────────────
function renameProject(projectId) {
  const proj = projects.find(p => p.id === projectId);
  if (!proj) return;

  const input = prompt('Nouveau nom de la parcelle :', proj.name);
  if (input === null) return;                       // annulation
  const name = input.trim();
  if (!name) {
    showToast('Le nom de la parcelle ne peut pas être vide', 'error');
    return;
  }
  if (name === proj.name) return;

  proj.name = name;
  saveProjects();                                   // persiste + rafraîchit tiroir/libellé
  if (APP.currentTab === 'tab-history' && typeof loadHistory === 'function') loadHistory();
  showToast(`Parcelle renommée : ${name}`, 'info');
}

function renameCurrentProject() {
  if (currentProject) renameProject(currentProject.id);
}

// ─── CHANGER DE PROJET ───────────────────────────────────────
function switchProject(projectId) {
  const proj = projects.find(p => p.id === projectId);
  if (!proj) return;
  currentProject = proj;
  saveCurrentProject();
  renderProjectList();       // état actif + libellé du header
  closeProjectDrawer();
  if (typeof updateZoneBadge === 'function') updateZoneBadge();
  if (typeof renderMap       === 'function') renderMap();
  if (typeof renderPointsList=== 'function') renderPointsList();
  if (typeof updateStatsDisplay==='function') updateStatsDisplay();
  if (APP.currentTab === 'tab-history' && typeof loadHistory === 'function') loadHistory();
}

// ─── ACCÈS AUX POINTS DU PROJET COURANT ──────────────────────
function getPoints() {
  return currentProject ? currentProject.points : [];
}

function addPointToCurrentProject(point) {
  if (!currentProject) return;
  currentProject.points.push(point);
  saveProjects();
}

function removePointFromCurrentProject(pointId) {
  if (!currentProject) return;
  currentProject.points = currentProject.points.filter(p => p.id !== pointId);
  // Renumérote par type
  ['tonte','interdit','obstacle'].forEach(type => {
    let idx = 1;
    currentProject.points.filter(p => p.type === type).forEach(p => p.index = idx++);
  });
  // Si la zone courante n'a plus de point, revenir à la dernière zone existante
  const tonteZones = currentProject.points
    .filter(p => p.type === 'tonte')
    .map(p => Number(p.zoneId) || 1);
  const maxZone = tonteZones.length ? Math.max(...tonteZones) : 1;
  if (!tonteZones.includes(Number(currentProject.currentZoneId))) {
    currentProject.currentZoneId = maxZone;
  }
  saveProjects();
}

function clearCurrentProjectPoints() {
  if (!currentProject) return;
  currentProject.points = [];
  currentProject.currentZoneId = 1;
  saveProjects();
}

// ─── TIROIR PARCELLES ────────────────────────────────────────
// Le bandeau #projectBar est remplacé par un bouton compact dans le header
// qui ouvre ce tiroir latéral (liste + actions par parcelle).
function openProjectDrawer() {
  const drawer = document.getElementById('projectDrawer');
  const overlay = document.getElementById('projectDrawerOverlay');
  const toggle = document.getElementById('btnProjectDrawer');
  if (!drawer) return;

  renderProjectList();
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  if (overlay) overlay.classList.add('show');
  if (toggle) toggle.setAttribute('aria-expanded', 'true');

  const closeBtn = drawer.querySelector('.drawer-close');
  if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
}

function closeProjectDrawer() {
  const drawer = document.getElementById('projectDrawer');
  const overlay = document.getElementById('projectDrawerOverlay');
  const toggle = document.getElementById('btnProjectDrawer');
  if (!drawer || !drawer.classList.contains('open')) return;

  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  if (overlay) overlay.classList.remove('show');
  if (toggle) {
    toggle.setAttribute('aria-expanded', 'false');
    if (typeof toggle.focus === 'function') toggle.focus();
  }
}

function toggleProjectDrawer() {
  const drawer = document.getElementById('projectDrawer');
  if (!drawer) return;
  if (drawer.classList.contains('open')) closeProjectDrawer();
  else openProjectDrawer();
}

// ─── RENDU DU TIROIR ET DU LIBELLÉ HEADER ───────────────────
function renderProjectList() {
  const container = document.getElementById('projectListContainer');
  const label = document.getElementById('currentProjectName');
  const toggle = document.getElementById('btnProjectDrawer');

  if (label) label.textContent = currentProject ? currentProject.name : 'Aucune parcelle';
  if (toggle) {
    toggle.title = currentProject
      ? `Parcelle : ${currentProject.name} — choisir une parcelle`
      : 'Aucune parcelle — en créer une';
  }

  if (!container) return;
  if (!projects.length) {
    container.innerHTML = '<div class="drawer-empty">Aucune parcelle</div>';
    return;
  }

  container.innerHTML = projects.map(p => {
    const id = escapeHtml(p.id);
    const name = escapeHtml(p.name);
    const active = p.id === currentProject?.id;
    const count = p.points.length;
    const zone = Number(p.currentZoneId) || 1;
    return `
      <div class="drawer-project${active ? ' active' : ''}">
        <button type="button" class="drawer-project-main" onclick="switchProject('${id}')"
          ${active ? 'aria-current="true"' : ''}>
          <span class="drawer-project-name">${name}</span>
          <span class="drawer-project-meta">${count} point(s) · Zone #${zone}</span>
        </button>
        <div class="drawer-project-actions">
          <button type="button" onclick="renameProject('${id}')"
            title="Renommer la parcelle" aria-label="Renommer ${name}">✏️</button>
          <button type="button" class="danger" onclick="deleteProject('${id}')"
            title="Supprimer la parcelle" aria-label="Supprimer ${name}">🗑</button>
        </div>
      </div>`;
  }).join('');
}

// Compatibilité : le tiroir remplace l'ancien <select>.
function initProjectUI() {
  renderProjectList();
}

// ─── PERSISTENCE ─────────────────────────────────────────────
function saveProjects() {
  localStorage.setItem(PROJECT_KEY, JSON.stringify(projects));
  renderProjectList();
}

function loadProjects() {
  try {
    const list = JSON.parse(localStorage.getItem(PROJECT_KEY) || '[]');
    return Array.isArray(list) ? list.map(normalizeProject) : [];
  } catch { return []; }
}

// Migration douce : zoneId (tonte) et currentZoneId obligatoires
function normalizeProject(project) {
  if (!project || typeof project !== 'object') return project;
  if (!Array.isArray(project.points)) project.points = [];

  // Migration : la fonction « base du rover » a été supprimée. Les anciens
  // points de type `base` sont purgés du stockage local.
  project.points = project.points.filter(p => p && p.type !== 'base');

  project.points.forEach(p => {
    if (p && p.type === 'tonte') {
      const zid = Number(p.zoneId);
      p.zoneId = Number.isInteger(zid) && zid > 0 ? zid : 1;
    }
  });

  const maxZone = project.points.reduce(
    (max, p) => (p.type === 'tonte' ? Math.max(max, Number(p.zoneId) || 1) : max), 1);
  const current = Number(project.currentZoneId);
  if (!Number.isInteger(current) || current < 1 || current > maxZone) {
    project.currentZoneId = maxZone;
  }
  return project;
}

function saveCurrentProject() {
  if (currentProject) localStorage.setItem(CURRENT_KEY, currentProject.id);
}

function loadCurrentProject() {
  const id = localStorage.getItem(CURRENT_KEY);
  return projects.find(p => p.id === id) || null;
}

// ─── EXPORT D'UN PROJET ──────────────────────────────────────
function getCurrentProjectData() {
  return currentProject;
}
