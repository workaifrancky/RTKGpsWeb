// ============================================================
// scan.js — Récepteur du QR code animé (page scan.html)
// RTK Mower
// ============================================================
// Décode en continu la séquence affichée par l'émetteur du hub
// (js/export.js → startAnimatedQrTransfer()) avec `createQrReceiver` de
// js/vendor/animated-data-qr. Le fichier reconstruit (GeoJSON ou ZIP) est
// proposé au téléchargement : son contenu est l'octet exact envoyé, donc le
// contrat GeoJSON de Mower Planner reste intact.

const SCAN_DOWNLOAD_LABELS = {
  geojson: 'Télécharger le GeoJSON',
  zip: 'Télécharger le ZIP',
};

let scanReceiver = null;
let scanResult = null;
let scanObjectUrl = null;
let scanStartInFlight = false;

function scanById(id) {
  return document.getElementById(id);
}

function getScanApi() {
  return typeof window !== 'undefined' && window.AnimatedDataQR
    ? window.AnimatedDataQR
    : null;
}

function setScanStatus(text) {
  const element = scanById('scanStatus');
  if (element) element.textContent = text;
}

function setScanCounters(text) {
  const element = scanById('scanCounters');
  if (element) element.textContent = text;
}

function setScanPercent(percent) {
  const clamped = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const bar = scanById('scanBar');
  const fill = scanById('scanBarFill');
  const label = scanById('scanPercent');
  if (fill) fill.style.width = `${clamped}%`;
  if (bar) bar.setAttribute('aria-valuenow', String(clamped));
  if (label) label.textContent = `${clamped} %`;
}

function showScanError(message) {
  const element = scanById('scanError');
  if (!element) return;
  element.textContent = message || '';
  element.hidden = !message;
}

function clearScanError() {
  showScanError('');
}

function isScanRunning() {
  if (!scanReceiver) return false;
  try {
    const state = scanReceiver.getState();
    return Boolean(state && state.scanning) && !state.result;
  } catch {
    return false;
  }
}

function syncScanButtons() {
  const running = isScanRunning();
  const startButton = scanById('btnScanStart');
  const stopButton = scanById('btnScanStop');
  if (startButton) startButton.hidden = running;
  if (stopButton) stopButton.hidden = !running;
}

function formatScanSize(bytes) {
  const size = Number(bytes) || 0;
  if (size >= 1048576) return `${(size / 1048576).toFixed(1)} Mo`;
  if (size >= 1024) return `${Math.round(size / 1024)} Ko`;
  return `${size} o`;
}

function isZipPayload(fileName, blob) {
  return /\.zip$/i.test(String(fileName || ''))
    || (blob && blob.type === 'application/zip');
}

function describeScanError(error) {
  if (!error) return 'Erreur inconnue pendant le scan.';
  const name = error.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Caméra refusée — autorisez l’accès à la caméra dans le navigateur.';
  }
  if (name === 'NotFoundError' || name === 'NoCameraDevicesError') {
    return 'Aucune caméra détectée sur cet appareil.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Caméra déjà utilisée par une autre application.';
  }
  if (name === 'SecurityError') {
    return 'La caméra exige un contexte sécurisé (HTTPS ou localhost).';
  }
  return error.message || 'Scan impossible.';
}

function updateScanProgress(progress) {
  if (!progress) return;
  const total = Number(progress.totalChunks) || 0;
  const received = Number(progress.receivedChunks) || 0;
  setScanPercent((Number(progress.ratio) || 0) * 100);
  if (total) {
    setScanCounters(`${received} / ${total} blocs reçus`);
    setScanStatus(received >= total
      ? 'Reconstruction du fichier…'
      : 'Réception en cours — gardez la séquence dans le cadre');
  }
}

function updateScanDiagnostics(diagnostics) {
  if (!diagnostics) return;
  const frames = Number(diagnostics.totalFramesSeen) || 0;
  const unique = Number(diagnostics.newFrames) || 0;
  const chunks = diagnostics.totalChunks
    ? `${diagnostics.receivedChunks} / ${diagnostics.totalChunks} blocs`
    : 'en attente du manifeste';
  setScanCounters(`${chunks} · ${unique} frame(s) unique(s) / ${frames} vue(s)`);
}

// Le récepteur crée lui-même son <video> et appelle getUserMedia
// (facingMode « environment » par défaut, repli sur la caméra disponible).
function ensureScanReceiver() {
  if (scanReceiver) return scanReceiver;

  const api = getScanApi();
  if (!api || typeof api.createQrReceiver !== 'function') {
    showScanError('Bibliothèque de QR animé indisponible — vérifiez js/vendor/animated-data-qr/.');
    return null;
  }

  const stage = scanById('scanStage');
  if (!stage) return null;

  scanReceiver = api.createQrReceiver(stage, {
    onCameraStart() {
      setScanStatus('Caméra active — visez la séquence affichée sur l’autre appareil');
      syncScanButtons();
    },
    onCameraStop() {
      syncScanButtons();
    },
    onManifest(manifest) {
      setScanStatus(`Séquence reconnue — ${manifest.fileName}`);
    },
    onProgress(progress) {
      updateScanProgress(progress);
    },
    onDiagnostics(diagnostics) {
      updateScanDiagnostics(diagnostics);
    },
    onError(error) {
      showScanError(describeScanError(error));
    },
  });

  return scanReceiver;
}

function hideScanResult() {
  const panel = scanById('scanResult');
  if (panel) panel.hidden = true;
  if (scanObjectUrl) {
    URL.revokeObjectURL(scanObjectUrl);
    scanObjectUrl = null;
  }
  scanResult = null;
}

async function startScan() {
  if (scanStartInFlight) return;

  clearScanError();
  hideScanResult();
  setScanPercent(0);
  setScanCounters('—');

  if (!window.isSecureContext) {
    showScanError('La caméra exige un contexte sécurisé : ouvrez cette page en HTTPS ou sur localhost.');
    return;
  }

  const receiver = ensureScanReceiver();
  if (!receiver) return;

  scanStartInFlight = true;
  setScanStatus('Ouverture de la caméra…');

  try {
    const result = await receiver.start();
    if (result) await handleScanResult(result);
  } catch (error) {
    if (!error || error.name !== 'AbortError') {
      showScanError(describeScanError(error));
      setScanStatus('Caméra indisponible');
    }
  } finally {
    scanStartInFlight = false;
    syncScanButtons();
  }
}

function stopScan() {
  if (!scanReceiver) return;
  try {
    scanReceiver.stop();
  } catch {
    // Récepteur déjà arrêté.
  }
  setScanStatus('Scan arrêté');
  syncScanButtons();
}

async function describeScanPayload(result) {
  const blob = result ? result.blob : null;
  if (!blob) return 'Contenu indisponible';

  if (isZipPayload(result.fileName, blob)) {
    return 'Archive ZIP — un GeoJSON par parcelle';
  }

  try {
    const text = await blob.text();
    const geojson = JSON.parse(text);
    if (geojson && geojson.type === 'FeatureCollection'
        && Array.isArray(geojson.features)) {
      return `GeoJSON valide — ${geojson.features.length} entité(s)`;
    }
    return 'Fichier JSON reçu';
  } catch {
    return 'Contenu non JSON';
  }
}

async function handleScanResult(result) {
  scanResult = result;

  const fileName = result.fileName || 'RTK_transfert.geojson';
  const blob = result.blob || null;
  const panel = scanById('scanResult');
  const nameEl = scanById('scanFileName');
  const sizeEl = scanById('scanFileSize');
  const infoEl = scanById('scanFileInfo');
  const downloadButton = scanById('btnScanDownload');

  if (nameEl) nameEl.textContent = fileName;
  if (sizeEl) sizeEl.textContent = formatScanSize(blob ? blob.size : 0);
  if (infoEl) infoEl.textContent = 'Analyse…';
  if (downloadButton) {
    downloadButton.textContent = isZipPayload(fileName, blob)
      ? SCAN_DOWNLOAD_LABELS.zip
      : SCAN_DOWNLOAD_LABELS.geojson;
  }
  if (panel) panel.hidden = false;

  setScanPercent(100);
  setScanStatus('Fichier reconstruit');
  syncScanButtons();

  const info = await describeScanPayload(result);
  if (infoEl) infoEl.textContent = info;
}

function downloadScanResult() {
  if (!scanResult || !scanResult.blob) {
    showScanError('Aucun fichier à télécharger');
    return;
  }

  if (scanObjectUrl) URL.revokeObjectURL(scanObjectUrl);
  scanObjectUrl = URL.createObjectURL(scanResult.blob);

  const anchor = document.createElement('a');
  anchor.href = scanObjectUrl;
  anchor.download = scanResult.fileName || 'RTK_transfert.geojson';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

async function restartScan() {
  hideScanResult();
  clearScanError();
  setScanPercent(0);
  setScanCounters('—');

  if (scanReceiver) {
    try {
      scanReceiver.reset();
    } catch {
      // Aucune session en cours : rien à réinitialiser.
    }
  }

  await startScan();
}

function initScanPage() {
  const startButton = scanById('btnScanStart');
  const stopButton = scanById('btnScanStop');
  const downloadButton = scanById('btnScanDownload');
  const againButton = scanById('btnScanAgain');

  if (startButton) {
    startButton.addEventListener('click', () => { void startScan(); });
  }
  if (stopButton) {
    stopButton.addEventListener('click', stopScan);
  }
  if (downloadButton) {
    downloadButton.addEventListener('click', downloadScanResult);
  }
  if (againButton) {
    againButton.addEventListener('click', () => { void restartScan(); });
  }

  const warning = scanById('scanSecureWarning');
  if (warning) warning.hidden = window.isSecureContext === true;

  if (!getScanApi()) {
    showScanError('Bibliothèque de QR animé indisponible — vérifiez js/vendor/animated-data-qr/.');
  } else if (!window.isSecureContext) {
    showScanError('Caméra indisponible : ouvrez cette page en HTTPS ou sur localhost.');
  }

  setScanStatus('Caméra arrêtée');
  setScanPercent(0);
  setScanCounters('—');
  syncScanButtons();
}

// Point d'entrée exposé pour les tests automatisés de la page.
window.scanPage = {
  start: startScan,
  stop: stopScan,
  restart: restartScan,
  download: downloadScanResult,
  getResult: () => scanResult,
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initScanPage);
} else {
  initScanPage();
}
