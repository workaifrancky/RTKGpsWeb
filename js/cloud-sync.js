// ============================================================
// cloud-sync.js — Synchronisation Firestore (Mower Survey)
// ============================================================
// localStorage reste la source LOCALE (mode terrain hors-ligne, aucune
// régression) et Firestore assure la synchronisation entre appareils dès
// qu'un compte est connecté.
//
// Modèle Firestore : users/{uid}/projects/{projectId}
//   { payload: <parcelle complète, même structure que localStorage>,
//     name: <nom>, updatedAt: <timestamp serveur> }
//
// Le SDK « compat » (global `firebase`) est chargé avant ce fichier dans
// index.html ; l'ordre des scripts est décrit dans AGENTS.md §7.

const CLOUD_COLLECTION   = 'projects';
const CLOUD_PUSH_DELAY   = 1500;   // ms : regroupe les écritures rapprochées
const CLOUD_MIGRATED_KEY = 'rtkCloudMigrated';

// État de la synchronisation (aucune donnée métier ici).
let cloudAuth        = null;
let cloudDb          = null;
let cloudUser        = null;
let cloudListening   = false;
let cloudUnsubscribe = null;
let cloudPushTimer   = null;
let cloudApplying    = false;   // vrai pendant l'application d'un snapshot distant
let cloudPushing     = false;   // vrai pendant l'envoi local
let cloudLastSignature = '';
let cloudKnownIds    = new Set();
let cloudBound       = false;
let cloudStatus      = 'local';        // local | signedOut | connecting | synced | offline | error
let cloudStatusDetail = '';

function isCloudEnabled() {
  return typeof CLOUD_SYNC_ENABLED !== 'undefined' && CLOUD_SYNC_ENABLED === true
    && typeof firebase !== 'undefined' && !!firebase;
}

function isCloudConnected() {
  return !!(cloudUser && cloudUser.uid);
}

// ─── INITIALISATION ──────────────────────────────────────────
function initCloudSync() {
  bindCloudUi();
  if (!isCloudEnabled()) {
    // Deux cas : fonctionnalité désactivée volontairement, ou SDK Firebase
    // indisponible (CDN inaccessible hors-ligne) → mode local, sans erreur.
    const disabled = typeof CLOUD_SYNC_ENABLED === 'undefined' || CLOUD_SYNC_ENABLED !== true;
    syncCloudStatus('local', disabled
      ? 'Synchronisation désactivée'
      : 'Hors-ligne — synchronisation indisponible');
    return;
  }
  try {
    // Une seule initialisation, même si le script est rechargé (Hot Reload).
    if (!firebase.apps || firebase.apps.length === 0) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    cloudAuth = firebase.auth();
    cloudDb   = firebase.firestore();
  } catch (error) {
    console.warn('Firebase indisponible', error);
    syncCloudStatus('error', 'Initialisation Firebase impossible');
    return;
  }

  // Cache local IndexedDB : lectures et écritures continuent hors-ligne
  // (terrain sans réseau) et sont rejouées à la reconnexion.
  try {
    cloudDb.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  } catch (error) {
    // Persistance multi-onglets indisponible : la synchronisation reste
    // fonctionnelle, sans cache hors-ligne.
  }

  cloudAuth.onAuthStateChanged(user => {
    cloudUser = user || null;
    renderCloudUi();
    if (cloudUser) {
      syncCloudStatus('connecting');
      attachCloudSnapshot();
    } else {
      detachCloudSnapshot();
      cloudKnownIds = new Set();
      syncCloudStatus('signedOut');
    }
  });
}

// ─── ÉCOUTE DISTANTE (temps réel) ────────────────────────────
function cloudProjectsRef() {
  return cloudDb.collection('users').doc(cloudUser.uid).collection(CLOUD_COLLECTION);
}

function detachCloudSnapshot() {
  if (typeof cloudUnsubscribe === 'function') cloudUnsubscribe();
  cloudUnsubscribe = null;
  cloudListening = false;
}

function attachCloudSnapshot() {
  if (!cloudDb || !isCloudConnected() || cloudListening) return;
  cloudListening = true;
  cloudUnsubscribe = cloudProjectsRef().onSnapshot(
    snapshot => handleCloudSnapshot(snapshot),
    error => {
      cloudListening = false;
      console.warn('Synchronisation interrompue', error);
      const denied = error && error.code === 'permission-denied';
      syncCloudStatus('error', denied
        ? 'Accès refusé — vérifiez les règles Firestore'
        : 'Synchronisation indisponible');
    },
  );
}

// Signature comparable de deux jeux de parcelles (évite les rendus inutiles).
function cloudSignature(list) {
  return JSON.stringify(list);
}

function migrationDoneForUser() {
  try {
    return localStorage.getItem(`${CLOUD_MIGRATED_KEY}_${cloudUser.uid}`) === '1';
  } catch (error) {
    return false;
  }
}

function markMigrationDone() {
  try {
    localStorage.setItem(`${CLOUD_MIGRATED_KEY}_${cloudUser.uid}`, '1');
  } catch (error) {
    // Stockage indisponible : la migration sera retentée au prochain démarrage.
  }
}

function handleCloudSnapshot(snapshot) {
  if (!isCloudConnected()) return;

  const remote = [];
  const ids = new Set();
  snapshot.forEach(doc => {
    const data = doc.data() || {};
    ids.add(doc.id);
    if (data.payload && typeof data.payload === 'object') {
      remote.push({ ...data.payload, id: data.payload.id || doc.id });
    }
  });
  cloudKnownIds = ids;

  // Première connexion : cloud vide + parcelles locales → migration unique
  // par compte (le téléphone devient la référence initiale).
  if (remote.length === 0 && !migrationDoneForUser()) {
    const local = typeof loadProjects === 'function' ? loadProjects() : [];
    if (local.length > 0) {
      markMigrationDone();
      cloudLastSignature = cloudSignature(local);
      pushProjectsToCloud({ projectsOverride: local });
      if (typeof showToast === 'function') {
        showToast(`${local.length} parcelle(s) envoyée(s) vers le cloud`, 'info', 3000);
      }
      return;
    }
  }

  // Cloud vide : cas transitoire (écriture pas encore visible) ou compte neuf
  // sans données locales. On ne remplace JAMAIS le local par une liste vide.
  if (remote.length === 0) {
    syncCloudStatus('synced');
    return;
  }

  const signature = cloudSignature(remote);
  if (signature === cloudLastSignature) {
    syncCloudStatus('synced');
    return;
  }
  cloudLastSignature = signature;
  applyProjectsFromCloud(remote);
}

// Applique les parcelles distantes au stockage local et rafraîchit l'interface.
function applyProjectsFromCloud(list) {
  if (cloudPushing) return;          // nos écritures ne sont pas confirmées
  cloudApplying = true;
  try {
    projects = (Array.isArray(list) ? list : []).map(normalizeProject);
    if (typeof persistProjectStorage === 'function') persistProjectStorage();
    // La parcelle courante peut avoir été supprimée sur un autre appareil.
    if (currentProject) {
      const found = projects.find(p => p.id === currentProject.id);
      if (!found && typeof showToast === 'function') {
        showToast('Parcelle courante supprimée sur un autre appareil', 'info', 3200);
      }
      currentProject = found || null;
    }
    if (typeof renderProjectList === 'function') renderProjectList();
    if (typeof updateHistoryProjectName === 'function') updateHistoryProjectName();
    if (typeof loadHistory === 'function') loadHistory();
    if (typeof renderMap === 'function') renderMap();
    if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
    syncCloudStatus('synced');
  } finally {
    cloudApplying = false;
  }
}

// ─── ENVOI VERS LE CLOUD ─────────────────────────────────────
// Débounce : chaque point enregistré passe par saveProjects() → un seul envoi
// groupé (batch Firestore) 1,5 s plus tard.
function scheduleCloudPush() {
  if (!isCloudEnabled() || !isCloudConnected() || cloudApplying) return;
  if (cloudPushTimer) clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(() => {
    cloudPushTimer = null;
    pushProjectsToCloud();
  }, CLOUD_PUSH_DELAY);
}

function pushProjectsToCloud(options = {}) {
  if (!isCloudEnabled() || !isCloudConnected() || !cloudDb) return;
  if (cloudPushing) {                 // envoi en cours : on repousse
    scheduleCloudPush();
    return;
  }
  const list = Array.isArray(options.projectsOverride)
    ? options.projectsOverride
    : (typeof loadProjects === 'function' ? loadProjects() : []);
  const ref = cloudProjectsRef();
  const batch = cloudDb.batch();
  const sentIds = new Set();

  list.forEach(project => {
    if (!project || !project.id) return;
    const id = String(project.id);
    sentIds.add(id);
    batch.set(ref.doc(id), {
      payload: project,
      name: project.name || '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  });

  // Parcelles supprimées localement → suppression des documents distants.
  cloudKnownIds.forEach(id => {
    if (!sentIds.has(String(id))) batch.delete(ref.doc(String(id)));
  });

  cloudPushing = true;
  syncCloudStatus('connecting');
  batch.commit()
    .then(() => {
      cloudKnownIds = sentIds;
      cloudLastSignature = cloudSignature(list);
      syncCloudStatus('synced');
    })
    .catch(error => {
      console.warn('Envoi vers le cloud impossible', error);
      syncCloudStatus('offline', 'Envoi impossible — hors-ligne ?');
    })
    .finally(() => { cloudPushing = false; });
}

// ─── ÉTAT AFFICHÉ (panneau Connexion) ────────────────────────
const CLOUD_STATUS_LABELS = {
  local:      'Local uniquement',
  signedOut:  'Non connecté',
  connecting: 'Synchronisation…',
  synced:     'À jour',
  offline:    'Hors-ligne',
  error:      'Erreur de synchronisation',
};

function syncCloudStatus(state, detail = '') {
  cloudStatus = state;
  cloudStatusDetail = detail;
  const row = document.getElementById('cloudSyncRow');
  if (row) row.dataset.state = state;
  renderCloudUi();
}

function renderCloudUi() {
  const email = document.getElementById('cloudSyncEmail');
  const authBtn = document.getElementById('btnCloudAuth');
  const status = document.getElementById('cloudSyncStatus');
  const connected = isCloudConnected();

  if (email) email.textContent = connected ? (cloudUser.email || cloudUser.uid) : 'Aucun compte';
  if (authBtn) {
    authBtn.textContent = connected ? 'Se déconnecter' : 'Se connecter';
    authBtn.setAttribute('aria-label', connected
      ? 'Se déconnecter du compte cloud'
      : 'Se connecter au compte cloud');
  }
  if (status) {
    status.textContent = cloudStatusDetail || CLOUD_STATUS_LABELS[cloudStatus] || '';
  }
}

// ─── AUTHENTIFICATION (e-mail / mot de passe) ────────────────
function openAuthModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  const error = document.getElementById('cloudAuthError');
  if (error) { error.textContent = ''; error.hidden = true; }
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  const email = document.getElementById('cloudAuthEmail');
  if (email) setTimeout(() => email.focus({ preventScroll: true }), 60);
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
}

function toggleCloudAuth() {
  if (isCloudConnected()) signOutCloud();
  else openAuthModal();
}

async function signInCloud(email, password) {
  await cloudAuth.signInWithEmailAndPassword(email, password);
  if (typeof showToast === 'function') {
    showToast('Connecté — synchronisation active', 'info', 2600);
  }
}

async function signUpCloud(email, password) {
  await cloudAuth.createUserWithEmailAndPassword(email, password);
  if (typeof showToast === 'function') {
    showToast('Compte créé — synchronisation active', 'info', 2600);
  }
}

async function signOutCloud() {
  try {
    await cloudAuth.signOut();
    if (typeof showToast === 'function') {
      showToast('Déconnecté — données locales conservées', 'info', 2600);
    }
  } catch (error) {
    console.warn('Déconnexion impossible', error);
    if (typeof showToast === 'function') showToast('Déconnexion impossible', 'error');
  }
}

async function resetCloudPassword(email) {
  await cloudAuth.sendPasswordResetEmail(email);
  if (typeof showToast === 'function') {
    showToast('E-mail de réinitialisation envoyé', 'info', 3200);
  }
}

function cloudAuthErrorMessage(error) {
  const code = (error && error.code) || '';
  switch (code) {
    case 'auth/invalid-email':        return 'Adresse e-mail invalide.';
    case 'auth/missing-password':     return 'Mot de passe requis.';
    case 'auth/weak-password':        return 'Mot de passe trop faible (6 caractères minimum).';
    case 'auth/email-already-in-use': return 'Cette adresse a déjà un compte.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':   return 'E-mail ou mot de passe incorrect.';
    case 'auth/too-many-requests':    return 'Trop de tentatives — réessayez plus tard.';
    case 'auth/network-request-failed': return 'Réseau indisponible.';
    case 'auth/unauthorized-domain':
      return 'Domaine non autorisé dans Firebase (Authentication → Domaines autorisés).';
    case 'auth/operation-not-allowed':
      return 'Connexion e-mail / mot de passe désactivée dans Firebase.';
    default:
      return (error && error.message) || 'Connexion impossible.';
  }
}

async function submitCloudAuth(mode) {
  const emailEl = document.getElementById('cloudAuthEmail');
  const passEl = document.getElementById('cloudAuthPassword');
  const errorEl = document.getElementById('cloudAuthError');
  const email = emailEl ? emailEl.value.trim() : '';
  const password = passEl ? passEl.value : '';
  const setError = message => {
    if (!errorEl) return;
    errorEl.textContent = message || '';
    errorEl.hidden = !message;
  };
  setError('');

  if (!isCloudEnabled()) {
    setError('Synchronisation indisponible (hors-ligne ou désactivée).');
    return;
  }
  if (!email) { setError('Adresse e-mail requise.'); return; }
  if (mode !== 'reset' && password.length < 6) {
    setError('Mot de passe : 6 caractères minimum.');
    return;
  }

  try {
    if (mode === 'signin') await signInCloud(email, password);
    else if (mode === 'signup') await signUpCloud(email, password);
    else await resetCloudPassword(email);
    if (mode !== 'reset') {
      if (passEl) passEl.value = '';
      closeAuthModal();
    }
  } catch (error) {
    setError(cloudAuthErrorMessage(error));
  }
}

// Branchement de l'interface (panneau Connexion + modale de compte).
function bindCloudUi() {
  if (cloudBound) return;
  cloudBound = true;

  const form = document.getElementById('cloudAuthForm');
  if (form) {
    form.addEventListener('submit', event => {
      event.preventDefault();
      submitCloudAuth('signin');
    });
  }
  const signUpBtn = document.getElementById('btnCloudSignUp');
  if (signUpBtn) signUpBtn.addEventListener('click', () => submitCloudAuth('signup'));
  const resetBtn = document.getElementById('btnCloudReset');
  if (resetBtn) resetBtn.addEventListener('click', () => submitCloudAuth('reset'));
  const closeBtn = document.getElementById('btnCloudAuthClose');
  if (closeBtn) closeBtn.addEventListener('click', closeAuthModal);
  const authBtn = document.getElementById('btnCloudAuth');
  if (authBtn) authBtn.addEventListener('click', toggleCloudAuth);

  const modal = document.getElementById('authModal');
  if (modal) {
    modal.addEventListener('click', event => {
      if (event.target === modal) closeAuthModal();
    });
  }

  // Échap ferme la modale de compte (les modales prioritaires la précèdent).
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const m = document.getElementById('authModal');
    if (!m || !m.classList.contains('show')) return;
    if (typeof customModalResolve !== 'undefined' && customModalResolve) return;
    event.preventDefault();
    closeAuthModal();
  });
}

// Statut initial (avant toute connexion) + reprise de session.
document.addEventListener('DOMContentLoaded', () => {
  if (!cloudBound) bindCloudUi();
  renderCloudUi();
});
