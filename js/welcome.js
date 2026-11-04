/* ============================================================
   welcome.js — Écran d'accueil statique (RTK Mower, téléphone)
   RTKGpsWeb v2 — RTK Mower
   ------------------------------------------------------------
   Écran volontairement rapide : aucun minuteur, aucune animation. Un appui
   sur l'empreinte ferme l'écran en fondu (0,3 s, `--welcome-fade`) et ouvre
   l'onglet TRACÉS.
   L'écran est TOUJOURS affiché au démarrage : aucune mémorisation locale.
   (Le splash animé « rover qui tond » est retiré de l'application : il est
   réservé au futur Mower Planner et reste consultable dans splash-test.html.)
   ============================================================ */

// Fondu de fermeture, aligné sur --welcome-fade (css/components.css).
const WELCOME_FADE_MS = 300;

function getWelcomeScreen() {
  return document.getElementById('welcome-screen');
}

// Ferme l'écran d'accueil (fondu) et ouvre l'onglet TRACÉS.
function closeWelcomeScreen() {
  const screen = getWelcomeScreen();
  if (!screen || screen.classList.contains('is-closing')) return;
  screen.classList.add('is-closing');
  screen.setAttribute('aria-hidden', 'true');
  // Même mécanisme que la barre de navigation basse.
  if (typeof showTab === 'function') showTab('tab-points');
  window.setTimeout(() => {
    screen.hidden = true;
    screen.classList.remove('is-closing');
  }, WELCOME_FADE_MS);
}

function initWelcomeScreen() {
  const screen = getWelcomeScreen();
  if (!screen) return;
  const button = document.getElementById('btnWelcomeEnter');
  if (!button) return;
  button.addEventListener('click', closeWelcomeScreen);
  // Seule action possible : on y place le focus pour le clavier.
  button.focus({ preventScroll: true });
}

document.addEventListener('DOMContentLoaded', initWelcomeScreen);
