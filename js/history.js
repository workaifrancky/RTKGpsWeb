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

function loadHistory() {
  updateHistoryProjectName();

  const container=document.getElementById('historyList');
  if (!container) return;
  const projects=loadProjects();
  if (projects.length===0) {
    container.innerHTML='<div class="empty-state"><div class="empty-state-icon">🕐</div>Aucune session enregistrée.</div>';
    return;
  }
  container.innerHTML=projects.map(p=>{
    const date=new Date(p.createdAt).toLocaleDateString('fr-FR');
    const tonte=p.points.filter(pt=>pt.type==='tonte').length;
    const interdit=p.points.filter(pt=>pt.type==='interdit').length;
    const obstacle=p.points.filter(pt=>pt.type==='obstacle').length;
    return `<div class="session-item">
      <div class="session-header">
        <span class="session-name">${p.name}</span>
        <span class="session-count">${p.points.length} pts</span>
      </div>
      <div class="session-meta">
        Créé le ${date} &nbsp;·&nbsp;
        <span class="type-dot tonte"></span>${tonte} tonte &nbsp;·&nbsp;
        <span class="type-dot interdit"></span>${interdit} interdit &nbsp;·&nbsp;
        <span class="type-dot obstacle"></span>${obstacle} obstacle(s)
      </div>
      <div class="session-actions">
        <button class="btn-action-bar" onclick="switchProject('${p.id}');showTab('tab-points')">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>
          </svg>
          Ouvrir
        </button>
        <button class="btn-action-bar" onclick="exportProjectCSV('${p.id}')">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" x2="12" y1="15" y2="3"/>
          </svg>
          CSV
        </button>
        <button class="btn-action-bar danger" onclick="deleteProject('${p.id}')">${ICON_TRASH} Suppr.</button>
      </div>
    </div>`;
  }).reverse().join('');
}

function exportProjectCSV(projectId) {
  const projects=loadProjects();
  const proj=projects.find(p=>p.id===projectId);
  if (!proj) return;
  const headers='Point,Type,SousType,Latitude,Longitude,Altitude,Fix,Horodatage\n';
  const rows=proj.points.map(p=>`${p.index},${p.type},${p.subtype||''},${p.lat},${p.lon},${p.alt||''},${p.fix},${p.timestamp}`).join('\n');
  const blob=new Blob([headers+rows],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`RTK_${proj.name}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('✅ CSV exporté','info');
}

// La suppression de parcelle est centralisée dans projects.js :
// deleteProject(projectId) met à jour l'état en mémoire, la carte, la liste,
// les statistiques, le tiroir et l'historique.
