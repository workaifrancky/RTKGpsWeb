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
// Identifiants des parcelles cochées. La barre flottante
// #historySelectionBar (hors de .app-wrapper, au-dessus de la navigation
// basse) est affichée par syncHistorySelectionUI() dès que l'ensemble n'est
// pas vide, et masquée quand il se vide.
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

  // La barre flottante réserve sa hauteur dans la liste (dernière carte) via
  // cette classe : voir `body.history-selection-active #historyListView`.
  document.body.classList.toggle('history-selection-active', total > 0);

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
  container.innerHTML=projects.map(p=>{
    const date=new Date(p.createdAt).toLocaleDateString('fr-FR');
    const tonte=p.points.filter(pt=>pt.type==='tonte').length;
    const interdit=p.points.filter(pt=>pt.type==='interdit').length;
    const obstacle=p.points.filter(pt=>pt.type==='obstacle').length;
    const selected=historySelection.has(p.id);
    const safeName=typeof escapeHtml === 'function' ? escapeHtml(p.name) : p.name;
    // Carte cliquable (ouvre le détail) : la case à cocher et le menu
    // contextuel ⋮ gèrent leurs propres clics (voir handleHistoryCardClick).
    return `<div class="session-item${selected ? ' selected' : ''}" data-project-id="${p.id}"
        tabindex="0" role="group" aria-label="Parcelle ${safeName}"
        onclick="handleHistoryCardClick(event, '${p.id}')"
        onkeydown="handleHistoryCardKeydown(event, '${p.id}')">
      <div class="session-header">
        <label class="session-select-label">
          <input type="checkbox" class="session-select" data-project-id="${p.id}"
            ${selected ? 'checked' : ''}
            onchange="toggleHistorySelection('${p.id}', this.checked)"
            aria-label="Sélectionner la parcelle ${safeName}">
          <span class="session-name">${safeName}</span>
        </label>
        <div class="session-head-actions">
          <span class="session-count">${p.points.length} pts</span>
          <div class="session-menu-wrap">
            <button type="button" class="session-menu-btn" data-project-id="${p.id}"
              onclick="toggleHistoryCardMenu(event, '${p.id}')"
              aria-haspopup="true" aria-expanded="false"
              title="Actions sur la parcelle ${safeName}"
              aria-label="Actions sur la parcelle ${safeName}">${ICON_MORE_VERTICAL}</button>
            <div class="session-menu" role="menu" hidden>
              <button type="button" class="session-menu-item" role="menuitem"
                onclick="closeHistoryCardMenus(); openHistoryDetail('${p.id}')">${ICON_FOLDER_OPEN} Ouvrir</button>
              <button type="button" class="session-menu-item danger" role="menuitem"
                onclick="closeHistoryCardMenus(); deleteProject('${p.id}')">${ICON_TRASH} Supprimer</button>
            </div>
          </div>
        </div>
      </div>
      <div class="session-meta">
        Créé le ${date} &nbsp;·&nbsp;
        <span class="type-dot tonte"></span>${tonte} tonte &nbsp;·&nbsp;
        <span class="type-dot interdit"></span>${interdit} interdit &nbsp;·&nbsp;
        <span class="type-dot obstacle"></span>${obstacle} obstacle(s)
      </div>
    </div>`;
  }).reverse().join('');

  syncHistorySelectionUI();
}

// ─── CARTES DE PARCELLES : CLIC ET MENU CONTEXTUEL ⋮ ─────────
// La carte entière ouvre le détail ; la case à cocher et le menu ⋮ gèrent
// leurs propres clics (aucun conflit, pas de double ouverture).

function handleHistoryCardClick(event, projectId) {
  if (!projectId || !event) return;
  const target = event.target;
  if (target && typeof target.closest === 'function'
    && target.closest('.session-select-label, .session-menu-wrap')) return;
  openHistoryDetail(projectId);
}

function handleHistoryCardKeydown(event, projectId) {
  if (event.target !== event.currentTarget) return;   // frappe dans la case / le menu
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  openHistoryDetail(projectId);
}

function getHistoryCardMenu(projectId) {
  const btn = document.querySelector(
    `#historyList .session-menu-btn[data-project-id="${projectId}"]`);
  if (!btn) return null;
  const wrap = btn.closest('.session-menu-wrap');
  const menu = wrap ? wrap.querySelector('.session-menu') : null;
  return menu ? { btn, menu } : null;
}

// Referme tous les menus contextuels de la liste (clic extérieur, Échap,
// défilement, changement de vue).
function closeHistoryCardMenus() {
  document.querySelectorAll('#historyList .session-menu').forEach(menu => {
    menu.hidden = true;
  });
  document.querySelectorAll('#historyList .session-menu-btn').forEach(btn => {
    btn.setAttribute('aria-expanded', 'false');
  });
}

function toggleHistoryCardMenu(event, projectId) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const card = getHistoryCardMenu(projectId);
  if (!card) return;

  const wasOpen = !card.menu.hidden;
  closeHistoryCardMenus();
  if (wasOpen) return;   // second clic sur ⋮ : le menu se referme

  card.menu.hidden = false;
  card.btn.setAttribute('aria-expanded', 'true');
  const first = card.menu.querySelector('.session-menu-item');
  if (first && typeof first.focus === 'function') first.focus({ preventScroll: true });
}

function initHistoryCardMenus() {
  // Clic hors d'un menu (case à cocher, autre carte, onglet…) : on referme.
  document.addEventListener('click', event => {
    const target = event.target;
    if (target && typeof target.closest === 'function'
      && target.closest('.session-menu-wrap')) return;
    closeHistoryCardMenus();
  });

  // Échap : referme le menu ouvert et rend le focus au bouton ⋮ de sa carte.
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const openMenu = document.querySelector('#historyList .session-menu:not([hidden])');
    if (!openMenu) return;
    const card = openMenu.closest('.session-item');
    closeHistoryCardMenus();
    const btn = card ? card.querySelector('.session-menu-btn') : null;
    if (btn && typeof btn.focus === 'function') btn.focus({ preventScroll: true });
  });

  // Le menu est ancré à sa carte : le défilement de l'écran le referme.
  const screen = document.getElementById('tab-history');
  if (screen) screen.addEventListener('scroll', closeHistoryCardMenus, { passive: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHistoryCardMenus);
} else {
  initHistoryCardMenus();
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

// Ouvre le détail d'une parcelle (clic sur la carte ou option « Ouvrir » du
// menu ⋮) : elle devient la parcelle courante (cible de la carte, des exports
// et du transfert) et ses points (ZT, ZI, obstacles) sont affichés dans la
// vue 2.
function openHistoryDetail(projectId) {
  const project = typeof loadProjects === 'function'
    ? loadProjects().find(p => p.id === projectId)
    : null;
  if (!project) return;

  closeHistoryCardMenus();
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

  // Le focus revient à la carte de la parcelle consultée (elle est focusable).
  const projectId = typeof currentProject !== 'undefined' && currentProject ? currentProject.id : '';
  const trigger = projectId
    ? document.querySelector(`#historyList .session-item[data-project-id="${projectId}"]`)
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

// Transfert : le hub #transferModal est toujours utilisé.
// - une seule parcelle : elle devient la parcelle courante et le hub s'ouvre ;
// - plusieurs parcelles : le hub reçoit la sélection et produit un ZIP unique
//   (le partage natif multi-fichiers est buggé sur Android).
function transferSelectedProjects() {
  const selected = getSelectedHistoryProjects()
    .filter(p => Array.isArray(p.points) && p.points.length > 0);
  if (!selected.length) {
    showToast('Aucun point à transférer', 'error');
    return;
  }

  if (selected.length === 1 && typeof switchProject === 'function') {
    switchProject(selected[0].id);
  }
  if (typeof openTransferModal === 'function') {
    openTransferModal(selected.length > 1
      ? { projectIds: selected.map(p => p.id) }
      : {});
  }
}

// La suppression de parcelle est centralisée dans projects.js :
// deleteProject(projectId) met à jour l'état en mémoire, la carte, la liste,
// les statistiques, le tiroir et l'historique.
