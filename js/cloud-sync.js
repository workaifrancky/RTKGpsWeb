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
// Fenêtre de protection après une saisie locale (ajout/suppression de point) :
// un snapshot Firestore retardataire ne doit pas réécrire la parcelle pendant
// ce délai, même si sa signature paraît plus récente.
const CLOUD_EDIT_GUARD_MS = 2000;
// Dernière adresse e-mail utilisée sur cet appareil : pré-remplissage de la
// modale de compte. Seul l'e-mail est mémorisé, JAMAIS le mot de passe.
const AUTH_EMAIL_KEY = 'mowerSurveyLastEmail';

// État de la synchronisation (aucune donnée métier ici).
let cloudAuth        = null;
let cloudDb          = null;
let cloudUser        = null;
let cloudListening   = false;
let cloudUnsubscribe = null;
let cloudPushTimer   = null;
let cloudApplying    = false;   // vrai pendant l'application d'un snapshot distant
let cloudPushing     = false;   // vrai pendant l'envoi local
let cloudPendingMerge = false;  // un snapshot est arrivé pendant un envoi
let cloudLastRemote  = null;    // dernier état distant connu { list, ids }
// Dernière saisie locale par parcelle (id → timestamp) : protège la parcelle en
// cours de modification des snapshots retardataires. Au plus une entrée par
// parcelle (la clé est l'identifiant), donc aucune purge n'est nécessaire.
let cloudEditGuard   = new Map();
let cloudLastSignature = '';
let cloudKnownIds    = new Set();
// Référence de synchronisation : signature de chaque parcelle telle qu'elle a
// été confirmée par Firestore (ou appliquée depuis le cloud). Toute parcelle
// dont la signature locale diffère est « en attente de push » : un snapshot
// distant ne doit JAMAIS l'écraser (c'était la cause de la disparition du
// dernier point ajouté).
let cloudBaseline    = new Map();
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
  // Aide au diagnostic : la console affiche au niveau « Info » (visible par
  // défaut) comment activer la trace de synchronisation.
  if (typeof window !== 'undefined' && !window.__MOWER_SYNC_DEBUG) {
    console.info('[sync] journal désactivé — tapez window.__MOWER_SYNC_DEBUG = true pour tracer la synchronisation');
  }
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

  // Référence initiale : tout ce qui est modifié APRÈS cette ligne est
  // considéré comme « en attente de push » et protégé des snapshots distants.
  refreshCloudBaseline(typeof loadProjects === 'function' ? loadProjects() : []);

  cloudAuth.onAuthStateChanged(user => {
    cloudUser = user || null;
    renderCloudUi();
    // Session restaurée au démarrage : l'adresse du compte alimente aussi le
    // pré-remplissage de la modale.
    if (cloudUser && cloudUser.email) rememberAuthEmail(cloudUser.email);
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

// ─── RÉSYNCHRONISATION AU RETOUR AU PREMIER PLAN ────────────
// Sur mobile, le navigateur suspend les écoutes Firestore quand l'onglet passe
// en arrière-plan (écran éteint, changement d'app). Au retour, on force une
// lecture serveur et, si l'écoute temps réel a été perdue, on la réattache.
// C'est ce qui manquait pour que les modifications du PC arrivent sur le
// téléphone sans devoir recharger l'application.
function refreshCloudFromServer() {
  if (!isCloudEnabled() || !isCloudConnected() || !cloudDb) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    syncCloudStatus('offline', 'Hors-ligne — synchronisation en attente');
    return;
  }
  if (!cloudListening) attachCloudSnapshot();
  const ref = cloudProjectsRef();
  ref.get({ source: 'server' })
    .then(snapshot => handleCloudSnapshot(snapshot))
    .catch(() => {
      // Serveur injoignable : repli sur le cache local du SDK.
      ref.get()
        .then(snapshot => handleCloudSnapshot(snapshot))
        .catch(() => syncCloudStatus('offline', 'Synchronisation indisponible'));
    });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isCloudConnected()) {
    refreshCloudFromServer();
  }
});

window.addEventListener('online', () => {
  if (isCloudConnected()) refreshCloudFromServer();
});

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

// Signature d'une parcelle : `updatedAt` est ignoré (horodatage de push, il ne
// fait pas partie du contenu métier).
function projectSignature(project) {
  if (!project || typeof project !== 'object') return '';
  const { updatedAt, ...rest } = project;
  return JSON.stringify(rest);
}

// Enregistre l'état de référence : ce qui est considéré comme synchronisé.
function refreshCloudBaseline(list) {
  cloudBaseline = new Map();
  (Array.isArray(list) ? list : []).forEach(project => {
    if (project && project.id) {
      cloudBaseline.set(String(project.id), projectSignature(project));
    }
  });
}

// Vrai si la parcelle est en cours de saisie locale : tracé actif sur la
// parcelle courante, ou point ajouté il y a moins de CLOUD_EDIT_GUARD_MS.
// Dans ce cas, un snapshot distant ne doit JAMAIS la remplacer (c'est ce qui
// protège le dernier point d'une zone en cours de création).
function isProjectBeingEdited(project) {
  if (!project || !project.id) return false;
  const id = String(project.id);

  // 1. Tracé en cours sur cette parcelle (création de zone) : priorité absolue.
  if (typeof APP !== 'undefined' && typeof currentProject !== 'undefined'
      && currentProject && String(currentProject.id) === id
      && (APP.tracesMode === 'creation' || !!APP.currentTraceMode)) {
    return true;
  }
  // 2. Saisie très récente : un snapshot retardataire ne l'écrase pas.
  const last = cloudEditGuard.get(id) || 0;
  return (Date.now() - last) < CLOUD_EDIT_GUARD_MS;
}

// Parcelles locales actuelles : l'état en MÉMOIRE (`projects`) est plus frais
// que `localStorage` (l'autosauvegarde peut être en retard). Repli sur le
// stockage si le module `projects.js` n'est pas chargé.
function currentLocalProjects() {
  if (typeof projects !== 'undefined' && Array.isArray(projects)) return projects;
  return typeof loadProjects === 'function' ? loadProjects() : [];
}

// Parcelles modifiées localement depuis la dernière synchronisation
// (Map id → signature). Elles priment sur les versions distantes.
function collectDirtyProjects(list) {
  const dirty = new Map();
  (Array.isArray(list) ? list : []).forEach(project => {
    if (!project || !project.id) return;
    const id = String(project.id);
    const signature = projectSignature(project);
    if (cloudBaseline.get(id) !== signature) dirty.set(id, signature);
  });
  return dirty;
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

// ─── JOURNAL DE SYNCHRONISATION ─────────────────────────────
// Activé à chaud dans la console : window.__MOWER_SYNC_DEBUG = true
// `console.log` (et non `console.debug`) : le niveau « Verbose » est masqué par
// défaut dans la console Chrome, d'où l'absence de logs constatée sur le terrain.
function syncLog(...args) {
  if (typeof window === 'undefined' || !window.__MOWER_SYNC_DEBUG) return;
  console.log('[sync]', ...args);
}

function projectBrief(project) {
  if (!project) return '∅';
  const count = Array.isArray(project.points) ? project.points.length : 0;
  return `${project.id} (${count} pt)`;
}

function listBrief(list) {
  const items = (Array.isArray(list) ? list : []).filter(Boolean).map(projectBrief);
  return items.length ? items.join(' | ') : '∅';
}

// ─── RÉCEPTION D'UN SNAPSHOT ────────────────────────────────
function handleCloudSnapshot(snapshot) {
  if (!isCloudConnected()) return;

  const remote = [];
  const remoteIds = new Set();
  snapshot.forEach(doc => {
    const data = doc.data() || {};
    remoteIds.add(doc.id);
    if (data.payload && typeof data.payload === 'object') {
      remote.push({ ...data.payload, id: data.payload.id || doc.id });
    }
  });
  cloudKnownIds = remoteIds;
  // Dernier état distant connu : sert à rejouer la FUSION (jamais la liste
  // brute) quand un snapshot arrive pendant un envoi.
  cloudLastRemote = { list: remote, ids: remoteIds };

  syncLog('snapshot reçu :', listBrief(remote), '| local :', listBrief(currentLocalProjects()));
  mergeRemoteProjects(remote, remoteIds);
}

// ─── FUSION DISTANT / LOCAL ─────────────────────────────────
// Utilisée par la réception temps réel ET par le rejeu après un envoi : la
// fusion est toujours recalculée sur l'état local le plus récent.
function mergeRemoteProjects(remote, remoteIds) {
  if (!isCloudConnected()) return;

  // Première connexion : cloud vide + parcelles locales → migration unique
  // par compte (le téléphone devient la référence initiale).
  if (remote.length === 0 && !migrationDoneForUser()) {
    const local = currentLocalProjects();
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

  // ─── Fusion protectrice (cœur du correctif) ─────────────────
  // Les parcelles modifiées localement depuis la dernière synchronisation
  // (signature différente de la référence) sont CONSERVÉES : un snapshot
  // Firestore encore basé sur l'état précédent ne doit jamais faire disparaître
  // le dernier point ajouté.
  const local = currentLocalProjects();
  const dirty = collectDirtyProjects(local);
  const localById = new Map(local.map(p => [String(p.id), p]));
  const merged = [];

  remote.forEach(remoteProject => {
    const id = String(remoteProject.id);
    const localProject = localById.get(id);
    // 1. Parcelle modifiée localement ou en cours de saisie : le local prime.
    //    `isProjectBeingEdited()` couvre le tracé actif ET la fenêtre de 2 s qui
    //    suit un ajout de point : c'est ce qui protège le dernier point ajouté.
    if (localProject && (dirty.has(id) || isProjectBeingEdited(localProject))) {
      syncLog('fusion :', projectBrief(localProject), 'conservée (édition locale en cours)');
      merged.push(localProject);
      return;
    }
    // 2. Écho de notre propre push (`updatedAt` en plus, contenu identique) :
    // on conserve la version locale pour éviter rendu et écriture inutiles.
    if (localProject && projectSignature(localProject) === projectSignature(remoteProject)) {
      merged.push(localProject);
      return;
    }
    merged.push(remoteProject);
  });

  // Parcelles locales absentes du cloud : conservées tant qu'elles sont en
  // attente de push (sinon elles ont été supprimées sur un autre appareil).
  dirty.forEach((signature, id) => {
    if (!remoteIds.has(id) && localById.has(id)) merged.push(localById.get(id));
  });

  // Aucun changement par rapport au local → aucun rendu (pas de clignotement).
  if (cloudSignature(merged) === cloudSignature(local)) {
    syncLog('fusion : aucune différence avec le local → aucun rendu');
    syncCloudStatus('synced');
    return;
  }

  cloudLastSignature = cloudSignature(merged);
  applyProjectsFromCloud(merged);
}

// Applique les parcelles distantes au stockage local et rafraîchit l'interface.
function applyProjectsFromCloud(list) {
  // Envoi local en vol : on NE rejoue PAS cette liste telle quelle (elle peut
  // être antérieure à un point ajouté pendant l'envoi → clignotement). On
  // rejoue la FUSION complète à la fin de l'envoi, sur l'état local à jour.
  if (cloudPushing) {
    cloudPendingMerge = true;
    syncLog('application différée : un envoi est en cours, fusion rejouée à la fin');
    return;
  }
  cloudApplying = true;
  syncLog('application distante :', listBrief(list));
  try {
    projects = (Array.isArray(list) ? list : []).map(normalizeProject);
    // Référence = état qui vient d'être appliqué : plus rien n'est en attente.
    refreshCloudBaseline(projects);
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
  const pending = collectDirtyProjects(currentLocalProjects());
  const now = Date.now();
  pending.forEach((signature, id) => cloudEditGuard.set(String(id), now));
  syncLog('envoi planifié dans', CLOUD_PUSH_DELAY, 'ms :',
    pending.size ? [...pending.keys()].join(', ') : 'aucune parcelle modifiée');
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
    : currentLocalProjects();

  // ─── ENVOI SÉLECTIF (corrige l'asymétrie PC → téléphone) ──
  // Seules les parcelles modifiées localement sont envoyées. Avant, la totalité
  // de la liste était réécrite à chaque envoi : une modification faite sur
  // l'autre appareil était donc écrasée par l'état local, plus ancien.
  const dirty = collectDirtyProjects(list);
  const localIds = new Set(list.filter(p => p && p.id).map(p => String(p.id)));
  const deletedIds = [...cloudKnownIds].filter(id => !localIds.has(String(id)));

  if (dirty.size === 0 && deletedIds.length === 0) {
    // Rien à envoyer : aucune écriture inutile sur le cloud.
    syncLog('envoi : rien à envoyer (état local identique à la référence)');
    syncCloudStatus('synced');
    return;
  }

  syncLog('envoi :', listBrief(list.filter(p => p && dirty.has(String(p.id)))),
    '| suppressions :', deletedIds.length ? deletedIds.join(', ') : 'aucune');

  const ref = cloudProjectsRef();
  const batch = cloudDb.batch();
  const pushedSignatures = new Map();

  list.forEach(project => {
    if (!project || !project.id) return;
    const id = String(project.id);
    if (!dirty.has(id)) return;       // parcelle déjà à jour : on n'y touche pas
    pushedSignatures.set(id, dirty.get(id));
    // `updatedAt` local (ISO) : horodatage logique de la version poussée (le
    // document porte aussi le timestamp serveur pour l'ordre des écritures).
    const payload = { ...project, updatedAt: new Date().toISOString() };
    batch.set(ref.doc(id), {
      payload,
      name: payload.name || '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  });

  // Parcelles supprimées localement → suppression des documents distants.
  deletedIds.forEach(id => batch.delete(ref.doc(String(id))));

  cloudPushing = true;
  syncCloudStatus('connecting');
  batch.commit()
    .then(() => {
      // Référence mise à jour pour les SEULES parcelles réellement poussées :
      // une parcelle modifiée pendant l'envoi reste « en attente ».
      pushedSignatures.forEach((signature, id) => {
        cloudBaseline.set(id, signature);
        cloudKnownIds.add(id);
      });
      deletedIds.forEach(id => {
        cloudKnownIds.delete(String(id));
        cloudBaseline.delete(String(id));
      });
      cloudLastSignature = cloudSignature(currentLocalProjects());
      syncCloudStatus('synced');
    })
    .catch(error => {
      console.warn('Envoi vers le cloud impossible', error);
      syncCloudStatus('offline', 'Envoi impossible — hors-ligne ?');
    })
    .finally(() => {
      cloudPushing = false;
      // Un snapshot est arrivé pendant l'envoi : on rejoue la FUSION sur l'état
      // local à jour (le point ajouté pendant l'envoi est donc conservé).
      if (cloudPendingMerge) {
        cloudPendingMerge = false;
        if (cloudLastRemote) {
          syncLog('rejeu de la fusion après envoi :', listBrief(cloudLastRemote.list));
          mergeRemoteProjects(cloudLastRemote.list, cloudLastRemote.ids);
        }
      }
    });
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
    // Action discrète : icône Lucide `log-out` + libellé quand un compte est
    // actif, libellé seul sinon (l'icône vient de js/app.js, chargé avant).
    const icon = connected && typeof ICON_LOG_OUT !== 'undefined' ? ICON_LOG_OUT : '';
    authBtn.innerHTML = `${icon}<span class="cloud-sync-btn-label">`
      + `${connected ? 'Se déconnecter' : 'Se connecter'}</span>`;
    const label = connected
      ? 'Se déconnecter du compte cloud'
      : 'Se connecter au compte cloud';
    authBtn.setAttribute('aria-label', label);
    authBtn.setAttribute('title', label);
  }
  if (status) {
    status.textContent = cloudStatusDetail || CLOUD_STATUS_LABELS[cloudStatus] || '';
  }
}

// ─── MÉMORISATION DE L'E-MAIL (jamais le mot de passe) ───────
// Évite de retaper l'adresse à chaque connexion sur le terrain. La clé
// `mowerSurveyLastEmail` ne contient QUE l'e-mail.
function getLastAuthEmail() {
  try {
    const value = localStorage.getItem(AUTH_EMAIL_KEY);
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';        // navigation privée : simplement pas de pré-remplissage
  }
}

function rememberAuthEmail(email) {
  const value = typeof email === 'string' ? email.trim() : '';
  if (!value) return;
  try {
    localStorage.setItem(AUTH_EMAIL_KEY, value);
  } catch {
    // Quota / navigation privée : le pré-remplissage est un confort, il ne doit
    // jamais faire échouer une connexion pourtant réussie.
  }
}

// ─── AFFICHAGE DU MOT DE PASSE (Lucide eye / eye-off) ────────
// Le type du champ bascule entre `password` et `text` ; l'icône, le libellé
// d'accessibilité et `aria-pressed` suivent l'état. Rien n'est jamais stocké.
function setPasswordVisible(visible) {
  const input  = document.getElementById('cloudAuthPassword');
  const button = document.getElementById('btnPasswordToggle');
  const show   = visible === true;

  if (input) input.type = show ? 'text' : 'password';
  if (!button) return;

  if (typeof ICON_EYE_OFF !== 'undefined' && typeof ICON_EYE !== 'undefined') {
    button.innerHTML = show ? ICON_EYE_OFF : ICON_EYE;
  }

  const label = show ? 'Masquer le mot de passe' : 'Afficher le mot de passe';
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.setAttribute('aria-pressed', show ? 'true' : 'false');
  button.classList.toggle('is-visible', show);
}

function togglePasswordVisibility() {
  const input = document.getElementById('cloudAuthPassword');
  if (!input) return;
  const visible = input.type === 'password';
  // Trace volontaire (une ligne par clic) : permet de vérifier dans la console
  // que le gestionnaire est bien branché sur #btnPasswordToggle.
  console.log('[auth] affichage du mot de passe :', visible ? 'clair' : 'masqué');
  setPasswordVisible(visible);
}

// ─── AUTHENTIFICATION (e-mail / mot de passe) ────────────────
// Ferme le panneau Connexion avant d'afficher la modale de compte. Trois filets :
// 1) le helper officiel (retire `.show`, le voile, `aria-expanded`, rend le focus),
// 2) un retrait direct des classes si l'état avait dérivé,
// 3) une trace console pour vérifier à chaud que le panneau est bien fermé.
// La modale est en plus portée à z-index 5000 (css/main.css) : elle reste au
// premier plan même si la roue dentée est rouverte ensuite.
function closeConnectionPanelForAuth() {
  if (typeof closeHeaderMenu === 'function') closeHeaderMenu();

  const menu = document.getElementById('headerMenu');
  const overlay = document.getElementById('headerMenuOverlay');
  if (menu) {
    menu.classList.remove('show');
    menu.setAttribute('aria-hidden', 'true');
  }
  if (overlay) {
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
  }
  const trigger = document.getElementById('btnConnectionSettings');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');

  return !(menu && menu.classList.contains('show'));
}

function openAuthModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;

  const panelClosed = closeConnectionPanelForAuth();
  console.log('[auth] openAuthModal — closeHeaderMenu() appelé, panneau fermé :', panelClosed);

  const error = document.getElementById('cloudAuthError');
  if (error) { error.textContent = ''; error.hidden = true; }

  // Pré-remplissage : dernière adresse utilisée sur cet appareil. Un champ déjà
  // rempli par l'utilisateur n'est jamais écrasé.
  const email = document.getElementById('cloudAuthEmail');
  const lastEmail = getLastAuthEmail();
  if (email && lastEmail && !email.value.trim()) email.value = lastEmail;

  // Le mot de passe est toujours masqué à l'ouverture de la modale.
  setPasswordVisible(false);

  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  if (email) setTimeout(() => email.focus({ preventScroll: true }), 60);
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  // Ne jamais rouvrir la modale avec un mot de passe resté visible.
  setPasswordVisible(false);
}

function toggleCloudAuth() {
  if (isCloudConnected()) signOutCloud();
  else openAuthModal();
}

async function signInCloud(email, password) {
  await cloudAuth.signInWithEmailAndPassword(email, password);
  // Connexion réussie : mémorise l'adresse pour la prochaine ouverture.
  rememberAuthEmail(email);
  if (typeof showToast === 'function') {
    showToast('Connecté — synchronisation active', 'info', 2600);
  }
}

async function signUpCloud(email, password) {
  await cloudAuth.createUserWithEmailAndPassword(email, password);
  rememberAuthEmail(email);
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

  // Bascule d'affichage du mot de passe (état initial : masqué).
  const passwordToggle = document.getElementById('btnPasswordToggle');
  if (passwordToggle) passwordToggle.addEventListener('click', togglePasswordVisibility);
  setPasswordVisible(false);

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
