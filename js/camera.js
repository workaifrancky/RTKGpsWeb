// ============================================================
// camera.js — Caméra et guidage visuel v2
// RTKGpsWeb v2
// ============================================================

let cameraStream=null, targetPoint=null, currentPos=null;

async function startCamera() {
  if (cameraStream) return;
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' }, audio:false });
    const video = document.getElementById('cameraVideo');
    if (video) { video.srcObject=cameraStream; video.play(); }
    updateCameraOverlay();
  } catch(e) {
    showAlert('❌ Accès caméra refusé','danger');
  }
}

function stopCamera() {
  if (!cameraStream) return;
  cameraStream.getTracks().forEach(t=>t.stop());
  cameraStream=null;
  const video=document.getElementById('cameraVideo');
  if (video) video.srcObject=null;
}

function selectTargetPoint(pointId) {
  const pts=getPoints();
  targetPoint=pts.find(p=>p.id===pointId)||null;
  if (targetPoint) { showToast(`🎯 Cible : ${targetPoint.type} #${targetPoint.index}`,'info'); updateCameraOverlay(); }
  // Remplir le select
  const sel=document.getElementById('targetSelect');
  if (sel) {
    sel.innerHTML='<option value="">— Sélectionnez un point cible —</option>'+
      pts.map(p=>`<option value="${p.id}">${p.icon} ${p.type} #${p.index} — ${p.fix}</option>`).join('');
  }
}

function updateCameraTarget(data) {
  currentPos=data;
  if (APP.currentTab==='tab-camera') updateCameraOverlay();
}

function updateCameraOverlay() {
  const overlay=document.getElementById('cameraOverlay');
  if (!overlay) return;
  if (!targetPoint) { overlay.innerHTML='<div class="cam-message">Sélectionnez un point cible<br>dans l\'onglet POINTS</div>'; return; }
  if (!currentPos||!currentPos.lat) { overlay.innerHTML='<div class="cam-message">En attente du signal GPS...</div>'; return; }

  const dist    = haversine(currentPos.lat,currentPos.lon,targetPoint.lat,targetPoint.lon);
  const bearing = calcBearing(currentPos.lat,currentPos.lon,targetPoint.lat,targetPoint.lon);
  const distText= dist<0.01?`${(dist*100).toFixed(0)} cm`:dist<100?`${dist.toFixed(2)} m`:`${dist.toFixed(1)} m`;
  const color   = dist<0.05?'#16a34a':dist<0.20?'#d97706':dist<1?'#2563eb':'#dc2626';

  overlay.innerHTML=`<div class="cam-overlay-content">
    <div class="cam-arrow" style="transform:rotate(${bearing}deg);color:${color}">▲</div>
    <div class="cam-distance" style="color:${color}">${distText}</div>
    <div class="cam-target-info">${targetPoint.icon} ${targetPoint.type} #${targetPoint.index} — ${targetPoint.fix}</div>
    ${dist<0.10?'<div style="color:#16a34a;font-weight:800;font-size:14px;letter-spacing:2px">✅ POSITION ATTEINTE</div>':''}
  </div>`;
}

function calcBearing(lat1,lon1,lat2,lon2) {
  const dLon=(lon2-lon1)*Math.PI/180;
  const y=Math.sin(dLon)*Math.cos(lat2*Math.PI/180);
  const x=Math.cos(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180)-Math.sin(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos(dLon);
  return ((Math.atan2(y,x)*180/Math.PI)+360)%360;
}
