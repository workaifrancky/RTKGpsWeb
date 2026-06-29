// ============================================================
// history.js — Historique des sessions v2
// RTKGpsWeb v2
// ============================================================

function loadHistory() {
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
        <span class="session-name">🌾 ${p.name}</span>
        <span class="session-count">${p.points.length} pts</span>
      </div>
      <div class="session-meta">
        Créé le ${date} &nbsp;·&nbsp;
        🟢 ${tonte} tonte &nbsp;·&nbsp;
        🔴 ${interdit} interdit &nbsp;·&nbsp;
        🟡 ${obstacle} obstacle(s)
      </div>
      <div class="session-actions">
        <button class="btn-action-bar" onclick="switchProject('${p.id}');showTab('tab-data')">📂 Ouvrir</button>
        <button class="btn-action-bar" onclick="exportProjectCSV('${p.id}')">⬇ CSV</button>
        <button class="btn-action-bar danger" onclick="deleteProject('${p.id}')">🗑 Suppr.</button>
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

function deleteProject(projectId) {
  if (!confirm('Supprimer cette parcelle ?')) return;
  const projects=loadProjects().filter(p=>p.id!==projectId);
  localStorage.setItem('rtkProjects',JSON.stringify(projects));
  loadHistory();
  showToast('Parcelle supprimée','info');
}
