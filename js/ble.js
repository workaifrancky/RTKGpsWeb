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
  if (typeof setGpsStatusIdle === 'function') setGpsStatusIdle();
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
  // Icône seule dans le header : la couleur (bleu / vert), le pictogramme
  // (bluetooth / bluetooth-off) et le title portent l'état, sans texte.
  const states = {
    disconnected:{ label:'Connecter le module BLE', btnCls:'disconnected', connected:false },
    scanning:    { label:'Recherche RTK_Mower...',  btnCls:'disconnected', connected:false },
    connecting:  { label:'Connexion en cours...',   btnCls:'disconnected', connected:false },
    connected:   { label:'Connecté à RTK_Mower',    btnCls:'connected',    connected:true  },
  };
  const s = states[status] || states.disconnected;
  if (btn) {
    btn.innerHTML = getBleIconMarkup(s.connected);
    btn.classList.remove('connected', 'disconnected');
    btn.classList.add(s.btnCls);
    btn.title = s.label;
    btn.setAttribute('aria-label', s.label);
  }
}

// Pictogrammes Lucide du bouton BLE (aucun emoji, aucun encadrement) :
// « bluetooth » une fois connecté, « bluetooth-off » hors connexion.
const BLE_ICON_PATHS = {
  connected:    '<path d="m7 7 10 10-5 5V2l5 5L7 17"/>',
  disconnected: '<path d="m17 17-5 5V12l-5 5"/><path d="m2 2 20 20"/><path d="M14.5 9.5 17 7l-5-5v4.5"/>',
};

// Markup de l'icône Bluetooth : SVG Lucide + trois ondes animées.
// `connected` vaut false par défaut (repli sur l'icône barrée).
function getBleIconMarkup(connected) {
  const paths = connected ? BLE_ICON_PATHS.connected : BLE_ICON_PATHS.disconnected;
  return '<div class="ble-icon-container" aria-hidden="true">'
    + '<div class="ble-waves"></div><div class="ble-waves"></div><div class="ble-waves"></div>'
    + '<svg class="ble-svg" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"'
    + ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
    + ' aria-hidden="true" focusable="false">'
    + paths + '</svg></div>';
}

function updateTerrainButtons() {
  // Les anciens boutons de la capsule ont été remplacés par le FAB.
  // On maintient l'état du FAB après une connexion.
  if (typeof syncTraceFabUI === 'function') syncTraceFabUI();
}
