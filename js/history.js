// ============================================================
// history.js — Historique des sessions v2
// RTKGpsWeb v2
// ============================================================

// Nom de la parcelle courante dans l'en-tête de la section POINTS
// (« Parcelle : <NOM> »). Appelée par loadHistory() et renderProjectList().
function updateHistoryProjectName() {
  const el = document.getElementById('historyProjectName');
  if (!el) return;
  const project = typeof getCurrentProjectData === 'function' ? getCurrentProjectData() : null;
  const name = project?.name ? String(project.name).toUpperCase() : '';
  el.textContent = name || '—';
  el.title = name ? `Parcelle : ${name}` : 'Aucune parcelle';
}

// ─── SÉLECTION MULTIPLE (VUE PARCELLES) ──────────────────────
// Identifiants des parcelles cochées. La barre #historySelectionBar est
// affichée par syncHistorySelectionUI() dès que l'ensemble n'est pas vide.
let historySelection = new Set();

function getHistoryProjects() {
  return typeof loadProjects === 'function' ? loadProjects() : [];
}

// Retire de la sélection les parcelles qui n'existent plus (suppression,
// changement de stockage…).
function pruneHistorySelection(projectList) {
  const list = Array.isArray(projectList) ? projectList : getHistoryProjects();
  const valid = new Set(list.map(p => p.id));
  [...historySelection].forEach(id => {
    if (!valid.has(id)) historySelection.delete(id);
  });
}

function syncHistorySelectionUI() {
  const bar   = document.getElementById('historySelectionBar');
  const count = document.getElementById('selectionCount');
  const total = historySelection.size;

  document.querySelectorAll('#historyList .session-select').forEach(input => {
    const selected = historySelection.has(input.dataset.projectId);
    input.checked = selected;
    const item = input.closest('.session-item');
    if (item) item.classList.toggle('selected', selected);
  });

  if (count) count.textContent = `${total} sélectionné(s)`;
  if (bar) bar.hidden = total === 0;

  const deleteBtn = document.getElementById('btnSelectionDelete');
  if (deleteBtn) {
    deleteBtn.setAttribute('aria-label',
      total > 1 ? `Supprimer ${total} parcelles` : 'Supprimer la parcelle sélectionnée');
  }
  const transferBtn = document.getElementById('btnSelectionTransfer');
  if (transferBtn) {
    transferBtn.setAttribute('aria-label',
      total > 1 ? `Transférer ${total} parcelles` : 'Transférer la parcelle sélectionnée');
  }
}

function toggleHistorySelection(projectId, checked) {
  if (!projectId) return;
  const id = String(projectId);
  if (checked) historySelection.add(id);
  else historySelection.delete(id);
  syncHistorySelectionUI();
}

function clearHistorySelection(options = {}) {
  const hadSelection = historySelection.size > 0;
  historySelection.clear();
  syncHistorySelectionUI();

  // Le bouton de retour disparaît avec la barre : on rend le focus à la
  // première case pour ne pas le perdre sur <body>.
  if (!options.silent && hadSelection) {
    const first = document.querySelector('#historyList .session-select');
    if (first && typeof first.focus === 'function') first.focus({ preventScroll: true });
  }
}

function getSelectedHistoryProjects() {
  return getHistoryProjects().filter(p => historySelection.has(p.id));
}

function loadHistory() {
  updateHistoryProjectName();

  const container=document.getElementById('historyList');
  if (!container) return;
  const projects=loadProjects();
  pruneHistorySelection(projects);

  if (projects.length===0) {
    container.innerHTML='<div class="empty-state"><div class="empty-state-icon">🕐</div>Aucune session enregistrée.</div>';
    syncHistorySelectionUI();
    return;
  }
  // Format d'export choisi dans le panneau Connexion (GeoJSON par défaut).
  const exportLabel = typeof getExportFormatLabel === 'function'
    ? getExportFormatLabel()
    : 'GeoJSON';
  container.innerHTML=projects.map(p=>{
    const date=new Date(p.createdAt).toLocaleDateString('fr-FR');
    const tonte=p.points.filter(pt=>pt.type==='tonte').length;
    const interdit=p.points.filter(pt=>pt.type==='interdit').length;
    const obstacle=p.points.filter(pt=>pt.type==='obstacle').length;
    const selected=historySelection.has(p.id);
    const safeName=typeof escapeHtml === 'function' ? escapeHtml(p.name) : p.name;
    return `<div class="session-item${selected ? ' selected' : ''}">
      <div class="session-header">
        <label class="session-select-label">
          <input type="checkbox" class="session-select" data-project-id="${p.id}"
            ${selected ? 'checked' : ''}
            onchange="toggleHistorySelection('${p.id}', this.checked)"
            aria-label="Sélectionner la parcelle ${safeName}">
          <span class="session-name">${safeName}</span>
        </label>
        <span class="session-count">${p.points.length} pts</span>
      </div>
      <div class="session-meta">
        Créé le ${date} &nbsp;·&nbsp;
        <span class="type-dot tonte"></span>${tonte} tonte &nbsp;·&nbsp;
        <span class="type-dot interdit"></span>${interdit} interdit &nbsp;·&nbsp;
        <span class="type-dot obstacle"></span>${obstacle} obstacle(s)
      </div>
      <div class="session-actions">
        <button class="btn-action-bar btn-history-open" data-project-id="${p.id}"
          onclick="openHistoryDetail('${p.id}')" title="Ouvrir le détail des points">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>
          </svg>
          Ouvrir
        </button>
        <button class="btn-action-bar btn-history-export" data-project-id="${p.id}"
          onclick="exportProjectDefaultFormat('${p.id}')"
          title="Exporter en ${exportLabel}" aria-label="Exporter la parcelle">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" x2="12" y1="15" y2="3"/>
          </svg>
          Exporter
        </button>
        <button class="btn-action-bar danger" onclick="deleteProject('${p.id}')">${ICON_TRASH} Suppr.</button>
      </div>
    </div>`;
  }).reverse().join('');

  syncHistorySelectionUI();
}

// ─── VUES DE L'ONGLET HISTORIQUE ─────────────────────────────
// Vue 1 (racine) : liste des parcelles (#historyListView).
// Vue 2 (détail) : points de la parcelle ouverte (#historyDetailView).
// Les deux vues coexistent dans le DOM ; l'attribut `hidden` bascule de l'une
// à l'autre (aucune reconstruction du HTML).

function syncHistoryView(view) {
  const listView   = document.getElementById('historyListView');
  const detailView = document.getElementById('historyDetailView');
  const isDetail   = view === 'detail';

  if (listView)   listView.hidden   = isDetail;
  if (detailView) detailView.hidden = !isDetail;

  // La sélection multiple appartient à la vue PARCELLES : on la libère en
  // ouvrant le détail pour ne pas retrouver des cases cochées au retour.
  if (isDetail && typeof clearHistorySelection === 'function') {
    clearHistorySelection({ silent: true });
  }

  if (typeof updateHistoryProjectName === 'function') updateHistoryProjectName();
}

function isHistoryDetailOpen() {
  const detailView = document.getElementById('historyDetailView');
  return !!(detailView && !detailView.hidden);
}

// Ouvre le détail d'une parcelle depuis « Ouvrir » : elle devient la parcelle
// courante (cible de la carte, des exports et du transfert) et ses points
// (ZT, ZI, obstacles) sont affichés dans la vue 2.
function openHistoryDetail(projectId) {
  const project = typeof loadProjects === 'function'
    ? loadProjects().find(p => p.id === projectId)
    : null;
  if (!project) return;

  if (typeof switchProject === 'function') switchProject(projectId);
  if (typeof renderPointsList === 'function') renderPointsList();
  syncHistoryView('detail');
  scrollHistoryToTop();
}

// Revient à la liste des parcelles (vue racine).
function closeHistoryDetail() {
  syncHistoryView('list');
  if (typeof loadHistory === 'function') loadHistory();
  scrollHistoryToTop();

  // Le focus revient au bouton « Ouvrir » de la parcelle consultée.
  const projectId = typeof currentProject !== 'undefined' && currentProject ? currentProject.id : '';
  const trigger = projectId
    ? document.querySelector(`#historyList .btn-history-open[data-project-id="${projectId}"]`)
    : null;
  if (trigger && typeof trigger.focus === 'function') trigger.focus({ preventScroll: true });
}

function scrollHistoryToTop() {
  const screen = document.getElementById('tab-history');
  if (screen) screen.scrollTop = 0;
}

// ─── ACTIONS DE LA BARRE DE SÉLECTION ───────────────────────
// Suppression groupée : une seule confirmation (deleteProjects), puis
// nettoyage de la sélection. En cas d'annulation, la sélection est conservée.
async function deleteSelectedProjects() {
  const selected = getSelectedHistoryProjects();
  if (!selected.length) {
    showToast('Aucune parcelle sélectionnée', 'error');
    return;
  }

  const deleted = typeof deleteProjects === 'function'
    ? await deleteProjects(selected.map(p => p.id))
    : 0;
  if (!deleted) return;

  historySelection.clear();
  if (typeof loadHistory === 'function') loadHistory();
  syncHistorySelectionUI();
}

// Transfert : une seule parcelle → hub de transfert existant (4 canaux).
// Plusieurs parcelles → un GeoJSON par parcelle dans un seul partage natif,
// avec repli en téléchargement (le contrat GeoJSON par parcelle est conservé).
async function transferSelectedProjects() {
  const selected = getSelectedHistoryProjects()
    .filter(p => Array.isArray(p.points) && p.points.length > 0);
  if (!selected.length) {
    showToast('Aucun point à transférer', 'error');
    return;
  }

  if (selected.length === 1) {
    if (typeof switchProject === 'function') switchProject(selected[0].id);
    if (typeof openTransferModal === 'function') openTransferModal();
    return;
  }

  await shareSelectedHistoryProjects(selected);
}

async function shareSelectedHistoryProjects(selected) {
  const payloads = selected
    .map(p => (typeof buildGeoJSON === 'function' ? buildGeoJSON(p) : null))
    .filter(Boolean);
  if (!payloads.length) {
    showToast('Aucun point à transférer', 'error');
    return;
  }

  const files = (typeof File === 'function')
    ? payloads.map(p => new File(
        [JSON.stringify(p.geojson, null, 2)],
        p.filename,
        { type: 'application/geo+json' },
      ))
    : [];

  let canShare = files.length > 0
    && typeof navigator !== 'undefined'
    && typeof navigator.share === 'function';
  if (canShare && typeof navigator.canShare === 'function') {
    try { canShare = navigator.canShare({ files }); }
    catch { canShare = false; }
  }

  if (canShare) {
    try {
      await navigator.share({
        title: `GeoJSON — ${files.length} parcelles`,
        text:  `Export RTK Mower — ${files.length} parcelles`,
        files,
      });
      showToast(`${files.length} GeoJSON partagés`, 'info');
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') return;   // partage annulé
      // Sinon : repli sur le téléchargement ci-dessous.
    }
  }

  if (typeof downloadFile !== 'function') {
    showToast('Partage non supporté sur ce navigateur', 'error');
    return;
  }

  payloads.forEach(p => downloadFile(
    JSON.stringify(p.geojson, null, 2),
    p.filename,
    'application/json',
  ));
  showToast(`${payloads.length} fichiers GeoJSON téléchargés`, 'info');
}

// La suppression de parcelle est centralisée dans projects.js :
// deleteProject(projectId) met à jour l'état en mémoire, la carte, la liste,
// les statistiques, le tiroir et l'historique.
