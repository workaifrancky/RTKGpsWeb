// ============================================================
// projects.js — Gestion des projets/parcelles
// RTKGpsWeb v2
// ============================================================

const PROJECT_KEY    = 'rtkProjects';
const CURRENT_KEY    = 'rtkCurrentProject';

// ─── ÉTAT ────────────────────────────────────────────────────
let projects       = [];
let currentProject = null;

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
  // Persiste la migration éventuelle (purge des anciens points `base`)
  // et rafraîchit la liste déroulante.
  saveProjects();
});

// ─── AJOUT D'UN PROJET ───────────────────────────────────────
function addProject(name, renderAfter = true) {
  const project = {
    id:            'proj_' + Date.now(),
    name:          name.trim(),
    createdAt:     new Date().toISOString(),
    currentZoneId: 1,       // zone de tonte en cours d'enregistrement
    points:        [],
  };
  projects.push(project);
  saveProjects();
  currentProject = project;
  saveCurrentProject();
  if (renderAfter) {
    renderProjectSelect();
    if (typeof renderMap === 'function') renderMap();
    if (typeof renderPointsList === 'function') renderPointsList();
  }
  return project;
}

// ─── SUPPRIMER UN PROJET ─────────────────────────────────────
function deleteCurrentProject() {
  if (projects.length <= 1) {
    showToast('Impossible — au moins un projet requis', 'error');
    return;
  }
  if (!confirm(`Supprimer la parcelle "${currentProject.name}" et tous ses points ?`)) return;
  projects = projects.filter(p => p.id !== currentProject.id);
  currentProject = projects[0];
  saveProjects();          // persiste + rafraîchit la liste déroulante
  saveCurrentProject();
  if (typeof updateZoneBadge  === 'function') updateZoneBadge();
  if (typeof renderMap        === 'function') renderMap();
  if (typeof renderPointsList === 'function') renderPointsList();
  if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
  if (APP.currentTab === 'tab-history' && typeof loadHistory === 'function') loadHistory();
  showToast('Parcelle supprimée', 'info');
}

// ─── RENOMMER LE PROJET COURANT ──────────────────────────────
function renameCurrentProject() {
  if (!currentProject) return;

  const input = prompt('Nouveau nom de la parcelle :', currentProject.name);
  if (input === null) return;                       // annulation
  const name = input.trim();
  if (!name) {
    showToast('Le nom de la parcelle ne peut pas être vide', 'error');
    return;
  }
  if (name === currentProject.name) return;

  currentProject.name = name;
  saveProjects();                                   // persiste + rafraîchit #projectSelect
  if (typeof initProjectBar === 'function') initProjectBar();
  if (APP.currentTab === 'tab-history' && typeof loadHistory === 'function') loadHistory();
  showToast(`Parcelle renommée : ${name}`, 'info');
}

// ─── CHANGER DE PROJET ───────────────────────────────────────
function switchProject(projectId) {
  const proj = projects.find(p => p.id === projectId);
  if (!proj) return;
  currentProject = proj;
  saveCurrentProject();
  if (typeof updateZoneBadge === 'function') updateZoneBadge();
  if (typeof renderMap       === 'function') renderMap();
  if (typeof renderPointsList=== 'function') renderPointsList();
  if (typeof updateStatsDisplay==='function') updateStatsDisplay();
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

// ─── RENDU SELECT PROJET ─────────────────────────────────────
function renderProjectSelect() {
  const sel = document.getElementById('projectSelect');
  if (!sel) return;
  sel.innerHTML = projects.map(p =>
    `<option value="${p.id}" ${p.id === currentProject?.id ? 'selected' : ''}>
      ${p.name} (${p.points.length} pts)
    </option>`
  ).join('');
}

// ─── PERSISTENCE ─────────────────────────────────────────────
function saveProjects() {
  localStorage.setItem(PROJECT_KEY, JSON.stringify(projects));
  renderProjectSelect();
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
