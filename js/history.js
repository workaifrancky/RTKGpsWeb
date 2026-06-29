// ============================================================
// history.js — Historique des sessions précédentes
// RTKGpsWeb
// Dépend de : points.js (loadSessions), map.js, export.js
// ============================================================

// ─── CHARGER ET AFFICHER L'HISTORIQUE ────────────────────────
function loadHistory() {
  const sessions  = loadSessions();
  const container = document.getElementById('historyList');
  if (!container) return;

  if (sessions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        Aucune session enregistrée.<br>
        Les sessions sont sauvegardées automatiquement<br>
        quand vous effacez les points.
      </div>`;
    return;
  }

  // Affiche les sessions de la plus récente à la plus ancienne
  container.innerHTML = [...sessions].reverse().map(s => {
    const date     = new Date(s.startedAt)
                       .toLocaleDateString('fr-FR');
    const time     = new Date(s.startedAt)
                       .toLocaleTimeString('fr-FR');
    const duration = formatDuration(
      (new Date(s.endedAt) - new Date(s.startedAt)) / 1000
    );

    return `
      <div class="session-item">
        <div class="session-header">
          <span class="session-date">${date} à ${time}</span>
          <span class="session-count">
            ${s.count} point(s)
          </span>
        </div>
        <div class="session-meta">
          Durée : ${duration}
        </div>
        <div class="session-actions">
          <button class="btn-action"
            onclick="reloadSession('${s.id}')">
            📂 Recharger
          </button>
          <button class="btn-action"
            onclick="exportSessionCSV('${s.id}')">
            ⬇ CSV
          </button>
          <button class="btn-action btn-danger"
            onclick="deleteSession('${s.id}')">
            ✕
          </button>
        </div>
      </div>`;
  }).join('');
}

// ─── RECHARGER UNE SESSION ────────────────────────────────────
function reloadSession(sessionId) {
  const sessions = loadSessions();
  const session  = sessions.find(s => s.id === sessionId);
  if (!session) return;

  if (!confirm(
    `Recharger la session du ${
      new Date(session.startedAt).toLocaleDateString('fr-FR')
    } ? Les points actuels seront remplacés.`
  )) return;

  // Recharge les points dans localStorage
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(session.points)
  );

  // Recharge la page pour tout réinitialiser proprement
  location.reload();
}

// ─── EXPORTER UNE SESSION EN CSV ─────────────────────────────
function exportSessionCSV(sessionId) {
  const sessions = loadSessions();
  const session  = sessions.find(s => s.id === sessionId);
  if (!session) return;

  const headers = [
    'Point','Latitude','Longitude','Altitude',
    'Fix','Satellites','HDOP','Horodatage'
  ].join(',');

  const rows = session.points.map(p => [
    p.index, p.lat, p.lon, p.alt || '',
    p.fix || '', p.satellites || '',
    p.hdop || '', p.timestamp,
  ].join(','));

  const csv = [headers, ...rows].join('\n');
  downloadFile(
    csv,
    `RTK_session_${sessionId}.csv`,
    'text/csv'
  );
  showToast('✅ Session exportée en CSV');
}

// ─── SUPPRIMER UNE SESSION ────────────────────────────────────
function deleteSession(sessionId) {
  if (!confirm('Supprimer cette session ?')) return;

  const sessions = loadSessions().filter(
    s => s.id !== sessionId
  );
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessions));
  loadHistory();
  showToast('Session supprimée');
}