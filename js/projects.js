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
  renderProjectSelect();
});

// ─── AJOUT D'UN PROJET ───────────────────────────────────────
function addProject(name, renderAfter = true) {
  const project = {
    id:        'proj_' + Date.now(),
    name:      name.trim(),
    createdAt: new Date().toISOString(),
    points:    [],
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
  saveProjects();
  currentProject = projects[0];
  saveCurrentProject();
  renderProjectSelect();
  if (typeof renderMap       === 'function') renderMap();
  if (typeof renderPointsList=== 'function') renderPointsList();
  showToast('Parcelle supprimée', 'info');
}

// ─── CHANGER DE PROJET ───────────────────────────────────────
function switchProject(projectId) {
  const proj = projects.find(p => p.id === projectId);
  if (!proj) return;
  currentProject = proj;
  saveCurrentProject();
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
  saveProjects();
}

function clearCurrentProjectPoints() {
  if (!currentProject) return;
  currentProject.points = [];
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
  try { return JSON.parse(localStorage.getItem(PROJECT_KEY) || '[]'); }
  catch { return []; }
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
