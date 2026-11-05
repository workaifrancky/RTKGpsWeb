// ============================================================
// fab-press.js — Gestuelle des boutons du FAB (TRACÉS et CAMÉRA)
// RTKGpsWeb v2 — RTK Mower
// ============================================================
// Module partagé, sans dépendance, chargé **avant** `points.js` et
// `camera.js` (voir index.html). Script classique : les constantes et la
// fonction sont exposées dans le scope global, comme les autres fichiers.
// Ne pas dupliquer cette logique dans un module : les deux FAB (#traceFab*
// et #cameraFab*) doivent réagir exactement de la même façon.

// Seuil volontairement généreux (700 ms) : le tap est l'action primaire du FAB
// (ajouter un point, terminer la zone, quitter un mode caméra). Avec 550 ms,
// un appui « appuyé » (gants, terrain, doigt qui traîne) ouvrait le menu à la
// place de l'action et neutralisait le clic, d'où l'impression qu'il fallait
// appuyer 2 à 3 fois sur « ✓ ».
const LONG_PRESS_MS = 700;
// Tolérance de mouvement : au-delà, le geste est un panoramique, pas un tap.
const LONG_PRESS_MOVE_TOLERANCE_PX = 12;

// Câblage d'un bouton du FAB : tap = action courte, appui long = menu.
// L'action courte est déclenchée sur `pointerup` et non sur `click` : le
// `click` peut être perdu (doigt qui sort du bouton, `pointercancel`) ou
// neutralisé après un appui long. Aucun drapeau ne survit à un geste :
// le tap suivant trouve toujours un état propre.
function bindTraceFabPress(el, longAction, clickAction) {
  if (!el) return;

  let timer = null;
  let pressed = false;
  let longFired = false;
  let startX = 0;
  let startY = 0;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  // Remise à zéro complète en fin de geste.
  const endGesture = () => {
    clearTimer();
    pressed = false;
    longFired = false;
  };

  el.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    clearTimer();
    pressed = true;
    longFired = false;
    startX = Number(event.clientX) || 0;
    startY = Number(event.clientY) || 0;
    timer = setTimeout(() => {
      timer = null;
      longFired = true;
      longAction();
    }, LONG_PRESS_MS);
  });

  el.addEventListener('pointermove', event => {
    if (!pressed || !timer) return;
    const dx = (Number(event.clientX) || 0) - startX;
    const dy = (Number(event.clientY) || 0) - startY;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) {
      // Geste de déplacement : ni appui long, ni tap.
      clearTimer();
      longFired = true;
    }
  });

  // Doigt sorti du bouton ou geste annulé par le navigateur : aucune action et
  // aucun état conservé pour le geste suivant.
  el.addEventListener('pointerleave', endGesture);
  el.addEventListener('pointercancel', endGesture);

  el.addEventListener('pointerup', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      endGesture();
      return;
    }
    if (!pressed) return;          // relâchement sans appui sur ce bouton
    const wasLong = longFired;
    endGesture();
    if (wasLong) return;           // le menu a déjà été ouvert par l'appui long
    clickAction();
  });

  // Clavier (Entrée / Espace) : un `<button>` émet un `click` dont `detail`
  // vaut 0. Les clics souris/tactile sont déjà traités au `pointerup`.
  el.addEventListener('click', event => {
    if (event.detail !== 0) return;
    clickAction();
  });
}
