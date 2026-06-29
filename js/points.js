// ============================================================
// points.js — Enregistrement des 3 types de points
// RTKGpsWeb v2 — tonte / interdit / obstacle
// ============================================================

// Compteurs par type pour numérotation
let counters = { tonte: 0, interdit: 0, obstacle: 0 };

document.addEventListener('DOMContentLoaded', () => {
  // Recharge les compteurs depuis le projet courant
  setTimeout(syncCounters, 300);
  renderPointsList();
});

function syncCounters() {
  const pts = getPoints();
  counters = { tonte: 0, interdit: 0, obstacle: 0 };
  pts.forEach(p => { if (counters[p.type] !== undefined) counters[p.type]++; });
}

// ─── ENREGISTRER — ZONE DE TONTE ─────────────────────────────
function recordTonte() {
  if (!checkGps()) return;
  const pt = buildPoint('tonte', null, '🟢');
  savePoint(pt);
  showToast(`🟢 Tonte #${pt.index} enregistré`, 'tonte');
}

// ─── ENREGISTRER — ZONE INTERDITE ────────────────────────────
function recordInterdit() {
  if (!checkGps()) return;
  const pt = buildPoint('interdit', null, '🔴');
  savePoint(pt);
  showToast(`🔴 Interdit #${pt.index} enregistré`, 'interdit');
}

// ─── ENREGISTRER — OBSTACLE ISOLÉ ────────────────────────────
function recordObstacle(subtype, icon) {
  if (!checkGps()) return;
  const pt = buildPoint('obstacle', subtype, icon || '🟡');
  savePoint(pt);
  showToast(`${icon} ${subtype} #${pt.index} enregistré`, 'obstacle');
}

// ─── CONSTRUCTION D'UN POINT ─────────────────────────────────
function buildPoint(type, subtype, icon) {
  counters[type] = (counters[type] || 0) + 1;
  return {
    id:         Date.now(),
    type,
    subtype:    subtype || null,
    icon:       icon || '📍',
    index:      counters[type],
    lat:        lastGpsData.lat,
    lon:        lastGpsData.lon,
    alt:        lastGpsData.alt,
    relX:       lastGpsData.relX,
    relY:       lastGpsData.relY,
    fix:        lastGpsData.fix,
    fixScore:   lastGpsData.score,
    satellites: lastGpsData.satellites,
    hdop:       lastGpsData.hdop,
    timestamp:  new Date().toISOString(),
  };
}

// ─── VALIDATION GPS ──────────────────────────────────────────
function checkGps() {
  if (!APP.bleConnected) {
    showToast('BLE non connecté', 'error'); return false;
  }
  if (!isPositionValid(lastGpsData)) {
    showToast(getRecordBlockReason(lastGpsData) || 'Fix insuffisant', 'error'); return false;
  }
  return true;
}

// ─── SAUVEGARDER ─────────────────────────────────────────────
function savePoint(pt) {
  addPointToCurrentProject(pt);
  renderPointsList();
  if (typeof addPointToMap === 'function') addPointToMap(pt);
  if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
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

// ─── TOUT EFFACER ────────────────────────────────────────────
function clearAllPoints() {
  const pts = getPoints();
  if (pts.length === 0) { showToast('Aucun point à effacer', 'info'); return; }
  if (!confirm(`Effacer les ${pts.length} points de cette parcelle ?`)) return;
  clearCurrentProjectPoints();
  counters = { tonte:0, interdit:0, obstacle:0 };
  renderPointsList();
  if (typeof renderMap === 'function') renderMap();
  if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
  showToast('Points effacés', 'info');
}

// ─── RENDU LISTE ─────────────────────────────────────────────
function renderPointsList() {
  const container = document.getElementById('pointsList');
  if (!container) return;
  const pts = getPoints();
  updatePointCount(pts);

  if (pts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📍</div>
        Aucun point enregistré.<br>
        Utilisez les boutons en bas de page<br>pour enregistrer des points.
      </div>`;
    return;
  }

  // Groupes par type
  const tonte    = pts.filter(p => p.type === 'tonte');
  const interdit = pts.filter(p => p.type === 'interdit');
  const obstacle = pts.filter(p => p.type === 'obstacle');

  container.innerHTML =
    renderGroup('Zone de tonte', tonte,    '#16a34a', 'tonte') +
    renderGroup('Zone interdite', interdit, '#dc2626', 'interdit') +
    renderGroup('Obstacles isolés', obstacle,'#d97706', 'obstacle');
}

function renderGroup(title, pts, color, type) {
  if (pts.length === 0) return '';
  return `
    <div class="points-group">
      <div class="points-group-header" style="border-left-color:${color}">
        <span>${title}</span>
        <span class="points-group-count" style="background:${color}">${pts.length}</span>
      </div>
      ${pts.map(p => renderPointItem(p)).join('')}
    </div>`;
}

function renderPointItem(p) {
  const time  = fmtTime(p.timestamp);
  const name  = p.subtype
    ? `${p.icon} ${p.subtype} #${p.index}`
    : `${p.icon} ${p.type === 'tonte' ? 'Tonte' : 'Interdit'} #${p.index}`;
  const fix   = getFixMeta(p.fix);
  return `
    <div class="point-item">
      <div class="point-dot ${p.type}"></div>
      <div class="point-info">
        <div class="point-name">${name}</div>
        <div class="point-coords">${fmt(p.lat,6)}, ${fmt(p.lon,6)}</div>
        <div class="point-meta">
          Alt: ${fmt(p.alt,1)}m &nbsp;·&nbsp;
          <span class="${fix.cssClass}" style="font-size:10px;font-weight:700">${p.fix}</span>
          &nbsp;·&nbsp; Sat: ${p.satellites || '—'}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
        <span class="point-time">${time}</span>
        <button class="btn-del" onclick="deletePoint(${p.id})" title="Supprimer">✕</button>
      </div>
    </div>`;
}

function updatePointCount(pts) {
  const el = document.getElementById('pointCount');
  if (el) el.textContent = `${pts.length} point(s)`;
}
