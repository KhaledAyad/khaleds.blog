/* khaleds.blog only (not part of the game's own build): the first tap, click or key on the page asks the browser for full
   screen, once per visit, where the browser allows it (Mac, iPad, Android). An iPhone has no full screen for web pages; there
   "Add to Home Screen" opens the game full screen. The listeners sit on window in the bubbling phase, so the game has already
   handled the tap or key before this runs, and the screen changes size only after the tap has done its job. In Chrome the
   Escape key stays with the game while full screen (hold Escape to leave full screen). */
(function () {
  'use strict';
  var d = document, el = d.documentElement, asked = false;
  var req = el.requestFullscreen || el.webkitRequestFullscreen;
  var app = (window.matchMedia && window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) || window.navigator.standalone === true;
  if (!req || app) return;
  function lockEscape() {
    try { if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['Escape']).catch(function () {}); } catch (e) {}
  }
  function off() { window.removeEventListener('pointerup', go); window.removeEventListener('keyup', onKey); }
  function go() {
    if (asked) return;
    asked = true; off();
    if (d.fullscreenElement || d.webkitFullscreenElement) return;
    try {
      var p = req.call(el, { navigationUI: 'hide' });
      if (p && typeof p.then === 'function') p.then(lockEscape, function () {}); else lockEscape();
    } catch (e) {}
  }
  function onKey(e) { if (e.key === 'Escape' || e.key === 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return; go(); }
  window.addEventListener('pointerup', go);
  window.addEventListener('keyup', onKey);
})();
