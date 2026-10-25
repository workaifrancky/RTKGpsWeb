// ============================================================
// ble.js — Connexion Bluetooth BLE ESP32 v2
// ============================================================

const BLE_CONFIG = {
  deviceName:  'RTK_Mower',
  serviceUUID: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
  charUUID:    'beb5483e-36e1-4688-b7f5-ea07361b26a8',
  scanTimeout: 15000,
};

let bleDevice=null, bleServer=null, bleChar=null;
let scanTimer=null, reconnecting=false;

async function toggleBle() {
  if (bleDevice && bleDevice.gatt.connected) disconnectBle();
  else await connectBle();
}

async function connectBle() {
  try {
    setBleStatus('scanning');
    scanTimer = setTimeout(() => { setBleStatus('disconnected'); showToast('Scan expiré — réessayez','error'); }, BLE_CONFIG.scanTimeout);
    bleDevice = await navigator.bluetooth.requestDevice({
      filters:[{name:BLE_CONFIG.deviceName}],
      optionalServices:[BLE_CONFIG.serviceUUID],
    });
    clearTimeout(scanTimer);
    bleDevice.addEventListener('gattserverdisconnected', onUnexpectedDisconnect);
    setBleStatus('connecting');
    bleServer  = await bleDevice.gatt.connect();
    const svc  = await bleServer.getPrimaryService(BLE_CONFIG.serviceUUID);
    bleChar    = await svc.getCharacteristic(BLE_CONFIG.charUUID);
    await bleChar.startNotifications();
    bleChar.addEventListener('characteristicvaluechanged', onBleDataReceived);
    onConnected();
  } catch(e) {
    clearTimeout(scanTimer);
    if (e.name !== 'NotFoundError') showToast(`Erreur BLE : ${e.message}`, 'error');
    else showToast('Aucun appareil sélectionné','info');
    setBleStatus('disconnected');
  }
}

function disconnectBle() {
  reconnecting = false;
  if (bleChar) bleChar.removeEventListener('characteristicvaluechanged', onBleDataReceived);
  if (bleDevice?.gatt.connected) bleDevice.gatt.disconnect();
  onDisconnected();
}

function onUnexpectedDisconnect() {
  onDisconnected();
  if (!reconnecting) {
    reconnecting = true;
    showAlert('🔄 Reconnexion BLE...', 'warning');
    setTimeout(async () => { if (reconnecting) await connectBle(); }, 3000);
  }
}

function onConnected() {
  APP.bleConnected = true; reconnecting = false;
  setBleStatus('connected');
  showToast('✅ Connecté à RTK_Mower','tonte');
  updateTerrainButtons();
}

function onDisconnected() {
  APP.bleConnected = false; bleServer=null; bleChar=null;
  if (typeof clearLiveGpsPosition === 'function') clearLiveGpsPosition();
  setBleStatus('disconnected');
  updateTerrainButtons();
}

function onBleDataReceived(event) {
  const raw  = new TextDecoder('utf-8').decode(event.target.value);
  const data = parseGpsFrame(raw);
  if (data) {
    APP.hasGpsData = true; APP.lastUpdate = new Date();
    if (typeof updateUI               === 'function') updateUI(data);
    if (typeof updateLivePosition     === 'function') updateLivePosition(data);
    if (typeof updateCameraTarget     === 'function') updateCameraTarget(data);
  }
}

function setBleStatus(status) {
  const btn=document.getElementById('btnBle');
  const dot=document.getElementById('fixDot');
  const statusText=document.getElementById('statusText');
  const states = {
    disconnected:{ icon:'⬡', label:'CONNECTER BLE', dot:'none', text:'Non connecté',            btnCls:'off' },
    scanning:    { icon:'⏳', label:'Scan...',       dot:'none', text:'Recherche RTK_Mower...',  btnCls:'off' },
    connecting:  { icon:'⏳', label:'Connexion...',  dot:'none', text:'Connexion en cours...',   btnCls:'off' },
    connected:   { icon:'✓',  label:'CONNECTÉ',     dot:'',     text:'Connecté à RTK_Mower',    btnCls:'' },
  };
  const s = states[status] || states.disconnected;
  if (btn) {
    // Icône et libellé séparés : sur mobile seul « ⬡ » reste visible.
    btn.innerHTML = `<span class="ble-icon" aria-hidden="true">${s.icon}</span><span class="ble-label">${s.label}</span>`;
    btn.className = s.btnCls;
    btn.title = s.label;
    btn.setAttribute('aria-label', s.label);
  }
  if (statusText) statusText.textContent=s.text;
}

function updateTerrainButtons() {
  const connected   = APP.bleConnected;
  const manualReady = typeof getTargetCoords === 'function'
    && !!document.getElementById('map-points-slot');
  const locked      = document.body?.classList.contains('locked') || false;
  const enabled     = (connected || manualReady) && !locked;

  ['btnTonte','btnInterdit','btnObstacle'].forEach(id => {
    const circle = document.getElementById(id);
    if (circle) circle.classList.toggle('disabled', !enabled);
  });

  if (typeof updateRecordModeBadge === 'function') updateRecordModeBadge();
}
