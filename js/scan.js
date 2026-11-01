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

// Types MIME acceptés pour une archive : le manifeste de la bibliothèque restitue
// le type envoyé par l'émetteur (application/zip), mais certains navigateurs
// normalisent le type d'un Blob et certains manifestes anciens n'en portent aucun.
const SCAN_ZIP_MIMES = ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip'];

// Détection d'une archive ZIP : type MIME, extension puis signature binaire
// (« PK\x03\x04 » archive, « PK\x05\x06 » archive vide, « PK\x07\x08 » archive
// répartie). `bytes` est facultatif : il permet de rattraper un manifeste sans
// type MIME ni extension .zip.
function isZipPayload(fileName, blob, bytes) {
  const type = String(blob && blob.type ? blob.type : '').toLowerCase();
  if (SCAN_ZIP_MIMES.includes(type)) return true;
  if (/\.zip$/i.test(String(fileName || ''))) return true;
  if (bytes && bytes.length >= 4) {
    return bytes[0] === 0x50 && bytes[1] === 0x4b
      && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
  }
  return false;
}

// Premiers octets du blob, pour la détection par signature binaire.
async function readScanHead(blob, length = 4) {
  if (!blob || typeof blob.slice !== 'function') return null;
  try {
    const head = await blob.slice(0, length).arrayBuffer();
    return new Uint8Array(head);
  } catch {
    return null;
  }
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
  renderScanFileList([]);
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

// Détail d'une archive : nombre de fichiers, entrées et validité GeoJSON.
// JSZip est chargé par scan.html (CDN) : s'il manque (page ouverte hors ligne
// sans cache), on retombe sur un message générique sans comptage.
async function describeZipPayload(blob) {
  const fallback = { text: 'Archive ZIP — un GeoJSON par parcelle', files: [], zip: true };
  if (typeof JSZip !== 'function') return fallback;

  try {
    const archive = await JSZip.loadAsync(blob);
    const entries = Object.keys(archive.files).filter(name => !archive.files[name].dir);
    if (!entries.length) {
      return { text: 'Archive ZIP vide', files: [], zip: true };
    }

    const geojsonEntries = entries.filter(name => /\.geojson$/i.test(name));
    let featureCount = 0;
    let validCount = 0;
    for (const name of geojsonEntries) {
      try {
        const doc = JSON.parse(await archive.files[name].async('string'));
        if (doc && doc.type === 'FeatureCollection' && Array.isArray(doc.features)) {
          validCount += 1;
          featureCount += doc.features.length;
        }
      } catch {
        // Entrée illisible : comptée comme invalide, jamais bloquante.
      }
    }

    const parts = [`Archive ZIP — ${entries.length} fichier(s)`];
    if (geojsonEntries.length) {
      const invalid = geojsonEntries.length - validCount;
      parts.push(invalid
        ? `${invalid} GeoJSON invalide`
        : `${featureCount} entité(s)`);
    }
    return { text: parts.join(' · '), files: entries, zip: true };
  } catch {
    return { text: 'Archive ZIP illisible', files: [], zip: true };
  }
}

// Analyse du fichier reconstruit : renvoie le texte du bloc « Contenu », la liste
// des entrées (ZIP) et le drapeau `zip` qui pilote le libellé du bouton.
async function describeScanPayload(result) {
  const blob = result ? result.blob : null;
  if (!blob) return { text: 'Contenu indisponible', files: [], zip: false };

  const head = await readScanHead(blob);
  if (isZipPayload(result.fileName, blob, head)) {
    return describeZipPayload(blob);
  }

  try {
    const text = await blob.text();
    const geojson = JSON.parse(text);
    if (geojson && geojson.type === 'FeatureCollection'
        && Array.isArray(geojson.features)) {
      return {
        text: `GeoJSON valide — ${geojson.features.length} entité(s)`,
        files: [],
        zip: false,
      };
    }
    return { text: 'Fichier JSON reçu', files: [], zip: false };
  } catch {
    return { text: 'Contenu non JSON', files: [], zip: false };
  }
}

// Liste des fichiers de l'archive (texte seul : aucune injection HTML).
function renderScanFileList(files) {
  const list = scanById('scanFileList');
  if (!list) return;

  const entries = Array.isArray(files) ? files.filter(Boolean) : [];
  list.innerHTML = '';
  if (!entries.length) {
    list.hidden = true;
    return;
  }

  entries.forEach((name) => {
    const item = document.createElement('li');
    item.textContent = name;
    list.appendChild(item);
  });
  list.hidden = false;
}

// Nom de repli cohérent avec le contenu réellement reconstruit.
function getScanFallbackName(fileName, blob) {
  if (fileName) return fileName;
  return isZipPayload(fileName, blob) ? 'RTK_transfert.zip' : 'RTK_transfert.geojson';
}

// La bibliothèque peut renvoyer `{ kind: 'file' }` (cas RTK Mower : GeoJSON ou
// ZIP) ou `{ kind: 'folder' }` pour son propre format d'archive « SARC1 ».
// On normalise pour ne jamais dépendre du nom exact du champ côté appelant.
function normalizeScanResult(result) {
  if (!result) return null;
  const blob = result.blob || result.archiveBlob || null;
  const fileName = result.fileName || result.archiveFileName || '';
  return { ...result, blob, fileName };
}

async function handleScanResult(result) {
  const normalized = normalizeScanResult(result);
  if (!normalized) return;

  scanResult = normalized;

  const blob = normalized.blob;
  const fileName = getScanFallbackName(normalized.fileName, blob);
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

  const info = await describeScanPayload(normalized);
  if (infoEl) infoEl.textContent = info.text;
  renderScanFileList(info.files);
  // La signature binaire peut révéler une archive que le type MIME et
  // l'extension n'annonçaient pas : on recale le libellé du bouton.
  if (info.zip && downloadButton) {
    downloadButton.textContent = SCAN_DOWNLOAD_LABELS.zip;
  }
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
  anchor.download = getScanFallbackName(scanResult.fileName, scanResult.blob);
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
