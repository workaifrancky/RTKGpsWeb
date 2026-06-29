// ============================================================
// camera.js — Caméra et guidage visuel vers point cible
// RTKGpsWeb
// Dépend de : app.js, points.js, parser.js
// ============================================================

// ─── ÉTAT ────────────────────────────────────────────────────
let cameraStream  = null;  // Flux vidéo
let targetPoint   = null;  // Point cible sélectionné
let currentPos    = null;  // Position GPS actuelle

// ─── DÉMARRER LA CAMÉRA ───────────────────────────────────────
async function startCamera() {
  if (cameraStream) return; // Déjà active

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment', // Caméra arrière
        width:  { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    const video = document.getElementById('cameraVideo');
    if (video) {
      video.srcObject = cameraStream;
      video.play();
    }

    showToast('📷 Caméra activée');
    updateCameraOverlay();

  } catch (error) {
    showAlert('❌ Accès caméra refusé', 'danger');
    console.error('Camera error:', error);
  }
}

// ─── ARRÊTER LA CAMÉRA ────────────────────────────────────────
function stopCamera() {
  if (!cameraStream) return;
  cameraStream.getTracks().forEach(t => t.stop());
  cameraStream = null;

  const video = document.getElementById('cameraVideo');
  if (video) video.srcObject = null;
}

// ─── SÉLECTIONNER UN POINT CIBLE ─────────────────────────────
function selectTargetPoint(pointId) {
  const pts = getPoints();
  targetPoint = pts.find(p => p.id === pointId) || null;

  if (targetPoint) {
    showToast(
      `🎯 Cible : Point #${targetPoint.index}`
    );
    updateCameraOverlay();
  }
}

// ─── METTRE À JOUR LA POSITION GPS ───────────────────────────
// Appelée par ble.js à chaque trame GPS
function updateCameraTarget(data) {
  currentPos = data;
  if (APP.currentTab === 'tab-camera') {
    updateCameraOverlay();
  }
}

// ─── MISE À JOUR DU OVERLAY (flèche + distance) ──────────────
function updateCameraOverlay() {
  const overlay = document.getElementById('cameraOverlay');
  if (!overlay) return;

  // Pas de cible sélectionnée
  if (!targetPoint) {
    overlay.innerHTML = `
      <div class="cam-message">
        Sélectionnez un point cible<br>dans l'onglet POINTS
      </div>`;
    return;
  }

  // Pas de position GPS
  if (!currentPos || !currentPos.lat) {
    overlay.innerHTML = `
      <div class="cam-message">
        En attente du signal GPS...
      </div>`;
    return;
  }

  // Calcul distance et cap vers la cible
  const dist    = haversine(
    currentPos.lat, currentPos.lon,
    targetPoint.lat, targetPoint.lon
  );
  const bearing = calculateBearing(
    currentPos.lat, currentPos.lon,
    targetPoint.lat, targetPoint.lon
  );

  // Affichage distance
  const distText = dist < 1
    ? `${(dist * 100).toFixed(0)} cm`
    : dist < 100
    ? `${dist.toFixed(2)} m`
    : `${dist.toFixed(1)} m`;

  // Couleur selon distance
  const color = dist < 0.05  ? '#00d4aa'   // < 5cm  → vert RTK
              : dist < 0.20  ? '#f59e0b'   // < 20cm → orange
              : dist < 1.00  ? '#3b82f6'   // < 1m   → bleu
              :                '#ef4444';  // > 1m   → rouge

  overlay.innerHTML = `
    <div class="cam-overlay-content">

      <!-- Flèche directionnelle -->
      <div class="cam-arrow-container">
        <div class="cam-arrow"
          style="transform: rotate(${bearing}deg); color: ${color}">
          ▲
        </div>
      </div>

      <!-- Distance -->
      <div class="cam-distance" style="color: ${color}">
        ${distText}
      </div>

      <!-- Infos cible -->
      <div class="cam-target-info">
        Cible : Point #${targetPoint.index}
        &nbsp;|&nbsp;
        Fix : ${targetPoint.fix}
      </div>

      <!-- Croix de visée si très proche -->
      ${dist < 0.10 ? `
        <div class="cam-crosshair">
          <div class="cam-crosshair-h"></div>
          <div class="cam-crosshair-v"></div>
          <div class="cam-crosshair-label">
            POSITION ATTEINTE
          </div>
        </div>` : ''}

    </div>`;
}

// ─── CAP ENTRE DEUX POINTS (en degrés) ───────────────────────
function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y    = Math.sin(dLon) *
               Math.cos(lat2 * Math.PI / 180);
  const x    = Math.cos(lat1 * Math.PI / 180) *
               Math.sin(lat2 * Math.PI / 180) -
               Math.sin(lat1 * Math.PI / 180) *
               Math.cos(lat2 * Math.PI / 180) *
               Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}