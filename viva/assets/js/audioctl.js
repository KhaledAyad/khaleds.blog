/* Freight City Viva v3: the two sound buttons on every screen (Khaled's item 69), the B and V keys, the sound panel, and the
   Sound section of Settings. Music (note) turns every music source off or on in one tap; Sound (speaker) mutes everything.
   Hold either button (or right-click) for the sliders. Every choice is saved in settings.audio and survives a reload. */
(function () {
  'use strict';
  var C = {}, $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var ST = function () { return window.Game && Game.state; };
  var AU = function () { var s = ST(); if (!s) return null; if (!s.settings.audio) s.settings.audio = FCV.normAudio(null, s.settings); return s.settings.audio; };
  var fam = function () { var s = ST(); return !!(s && s.settings.family); };
  var NOTE = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M9 3v11.3A3.5 3.5 0 1 0 11 17V8h7V3H9z"/><path class="x" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M3 3l18 18"/></svg>';
  var SPK = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path class="on" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/><path class="x" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M16 9l5 6M21 9l-5 6"/></svg>';
  var CSS = '#sysCorner{position:fixed;z-index:100;top:calc(env(safe-area-inset-top) + 6px);left:50%;transform:translateX(-50%);display:flex;gap:6px;pointer-events:auto}' +
    '#sysCorner button{width:44px;height:44px;border-radius:50%;border:2px solid rgba(255,243,224,.55);background:rgba(21,16,31,.86);color:#fff3e0;display:grid;place-items:center;padding:0;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.4);-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;touch-action:manipulation}' +
    '#sysCorner button:focus-visible{outline:3px solid #ffd166;outline-offset:2px}#sysCorner button .x{display:none}#sysCorner button[aria-pressed="true"]{background:#fff3e0;color:#15101f;border-color:#15101f}' +
    '#sysCorner button[aria-pressed="true"] .x{display:inline}#sysCorner button[aria-pressed="true"] .on{display:none}' +
    '#sysPanel{position:fixed;z-index:101;top:calc(env(safe-area-inset-top) + 56px);left:50%;transform:translateX(-50%);width:min(340px,94vw);max-height:calc(100vh - 70px);overflow:auto;background:#fff3e0;color:#15101f;border:3px solid #15101f;border-radius:12px;padding:12px 14px;font-size:15px;box-shadow:0 8px 24px rgba(0,0,0,.5)}' +
    '#sysPanel h3{margin:0 0 8px;font-size:17px}#sysPanel label{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:7px 0}#sysPanel input[type=range]{width:55%}' +
    '#sysPanel .row{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}#sysPanel select{font:inherit}' +
    /* AUD-13: the tip is a small pill beside the two buttons, in their own row, so it never covers a title or a control */
    '#sysTip{position:fixed;z-index:101;top:calc(env(safe-area-inset-top) + 6px);left:calc(50% + 54px);background:rgba(21,16,31,.94);color:#fff3e0;border:2px solid #ffd166;border-radius:999px;padding:4px 12px;font-size:13px;line-height:1.25;pointer-events:none;max-width:min(320px,calc(50vw - 62px));min-height:44px;box-sizing:border-box;display:flex;align-items:center;text-align:left}#sysTip[hidden]{display:none}' +
    '#radioChip{position:fixed;z-index:26;left:calc(env(safe-area-inset-left) + 12px);bottom:calc(env(safe-area-inset-bottom) + 64px);max-width:min(420px,80vw);background:rgba(21,16,31,.92);border:2px solid #3dd6c6;border-radius:8px;padding:6px 10px;font-size:14px;color:#fff3e0;pointer-events:none}' +
    '#radioChip b{color:#3dd6c6;margin-right:6px}.readMe{float:right;margin:-4px -4px 4px 8px;width:34px;height:34px;border-radius:50%;border:2px solid currentColor;background:transparent;color:inherit;display:inline-grid;place-items:center;padding:0;cursor:pointer;opacity:.8}.readMe:hover{opacity:1}' +
    /* AUD-14: the hit area stays 44 x 44 on a phone too */
    '@media (max-width:560px){#sysCorner{top:calc(env(safe-area-inset-top) + 4px)}#sysTip{top:calc(env(safe-area-inset-top) + 4px);font-size:12px;padding:3px 10px}}' +
    /* the top bars of full-screen panels step down by one button row (and the city HUD on a phone), so the two buttons never sit on a title, a counter or a button */
    '.wmTop,.vivaTop{padding-top:calc(env(safe-area-inset-top) + 54px)}.nbHead,.cmTop{padding-top:calc(env(safe-area-inset-top) + 56px)}.modal{padding-top:60px}.modal .modalBox{max-height:calc(100vh - 82px)}#mech{padding-top:56px}' +
    '@media (max-width:700px){#hud{padding-top:calc(env(safe-area-inset-top) + 52px)}#toast{top:calc(env(safe-area-inset-top) + 160px)}}';
  function keyName(k) { return (fam() ? 'Shift+' : '') + k; }
  /* AUD-13: key names only on a keyboard device */
  function orKey(k) { return window.UI && UI.kb && !UI.kb() ? '' : ' or press ' + keyName(k); }
  var lastMusic = 80;
  function build() {
    if ($('sysCorner')) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var d = document.createElement('div'); d.id = 'sysCorner'; d.setAttribute('role', 'group'); d.setAttribute('aria-label', 'Sound');
    d.innerHTML = '<button type="button" id="sysMusic" aria-pressed="false">' + NOTE + '</button><button type="button" id="sysMute" aria-pressed="false">' + SPK + '</button>';
    document.body.appendChild(d);
    bindBtn($('sysMusic'), C.toggleMusic); bindBtn($('sysMute'), C.toggleMute);
    C.refresh();
  }
  /* one tap toggles; a long press, right-click or Shift+click opens the sliders. Never reaches the film or sheet behind. */
  function bindBtn(b, fn) {
    var t = null, longed = false, downT = 0;
    ['pointerdown', 'pointerup', 'click', 'mousedown', 'touchstart'].forEach(function (ev) { b.addEventListener(ev, function (e) { e.stopPropagation(); }, false); });
    /* AUDR2-09: a tap is judged by the event times (the gap the finger was really down), not by a timer that a busy page
       may fire late: under 650 ms is a tap even if a late timer already opened the sliders (they close, and it toggles).
       The long press is 650 ms. */
    /* AUDR3-03: a right-click (a two-finger tap on a Mac) opens the sliders and they stay open: on a Mac contextmenu fires
       on mousedown, before pointerup, so the right button's down and up are not judged as a tap at all */
    var byMenu = false;
    b.addEventListener('pointerdown', function (e) { if (e.button === 2) return; byMenu = false; longed = false; downT = e.timeStamp || performance.now(); clearTimeout(t); t = setTimeout(function () { longed = true; C.panel(true); }, 650); });
    b.addEventListener('pointerup', function (e) {
      if (e.button === 2) return;
      clearTimeout(t);
      if (byMenu) { byMenu = false; return; }
      var held = (e.timeStamp || performance.now()) - downT;
      if (longed && downT && held < 650) { longed = false; if ($('sysPanel')) C.panel(false); }
    });
    b.addEventListener('pointerleave', function () { clearTimeout(t); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); clearTimeout(t); byMenu = true; longed = true; C.panel(true); });
    b.addEventListener('click', function (e) { e.preventDefault(); if (longed) { longed = false; return; } if (e.shiftKey) { C.panel(true); return; } fn(); });
  }
  function save(now) { var s = ST(); if (!s) return; FCV.stampSettings(s); FCV.syncOldAudio(s.settings); if (window.Game && Game.save) Game.save(); if (now && window.Game && Game.flush) setTimeout(function () { try { Game.flush(); } catch (e) {} }, 50); }
  function apply() { var a = AU(); if (a && window.Sound) Sound.applyAudio(a); C.refresh(); }
  var tipT = null;
  function tip(msg, ms) { var el = $('sysTip'); if (!el) { el = document.createElement('div'); el.id = 'sysTip'; el.setAttribute('role', 'status'); document.body.appendChild(el); } el.textContent = msg; el.hidden = false; clearTimeout(tipT); tipT = setTimeout(function () { el.hidden = true; }, ms || 2200); }
  var told = {};
  /* AUD-05: one rule for 'music on' (switch on and a level above 0), used by the button, its look and the toggle */
  C.musicOn = function () { var a = AU(); return !!(a && !a.musicOff && a.music > 0); };
  C.toggleMusic = function () {
    var a = AU(); if (!a) return;
    if (C.musicOn()) a.musicOff = true;
    else { a.musicOff = false; if (!(a.music > 0)) a.music = lastMusic > 0 ? lastMusic : 80; }
    save(true); apply();
    var off = !C.musicOn();
    if (window.UI) UI.announce(off ? 'Music off' : 'Music on');
    tip(off ? (told.m ? 'Music off.' : 'Music off. Tap the note' + orKey('B') + ' to bring it back.') : 'Music on.', told.m ? 1400 : 3200); told.m = 1;
    if (window.Kit) Kit.sfx('SFX-UI-TOGGLE', !off);
  };
  C.toggleMute = function () {
    var a = AU(); if (!a) return;
    a.muted = !a.muted; save(true); apply();
    if (window.UI) UI.announce(a.muted ? 'Sound off' : 'Sound on');
    tip(a.muted ? (told.v ? 'Sound off.' : 'Sound off. Tap the speaker' + orKey('V') + ' to bring it back.') : 'Sound on.', told.v ? 1400 : 3200); told.v = 1;
    if (!a.muted && window.Kit) setTimeout(function () { Kit.sfx('SFX-UNMUTE'); }, 160);
  };
  C.refresh = function () {
    var a = AU(), m = $('sysMusic'), v = $('sysMute'); if (!m || !v) return;
    var mOff = !!(a && !(!a.musicOff && a.music > 0)), muted = !!(a && a.muted);
    /* AUD-16: the mirrored switches and sliders (the sound panel and Settings > Sound) follow every change */
    if (a) ['sp_', 'aud_'].forEach(function (px) {
      var ae = document.activeElement, set = function (id, prop, v) { var el = $(px + id); if (el && el !== ae && el[prop] !== v) el[prop] = v; };
      set('musicOn', 'checked', !a.musicOff); set('voicesOn', 'checked', a.characterVoices !== false); set('subtitles', 'checked', !!a.subtitles); set('readAloud', 'checked', !!a.readAloud);
      ['music', 'voice', 'sfx', 'ambience', 'master'].forEach(function (k) { set(k, 'value', String(a[k])); });
    });
    m.setAttribute('aria-pressed', mOff ? 'true' : 'false'); m.setAttribute('aria-label', mOff ? 'Turn music on' : 'Turn music off');
    m.title = (mOff ? 'Music is off. ' : '') + 'Music on or off (' + keyName('B') + '). Hold for sound settings.';
    v.setAttribute('aria-pressed', muted ? 'true' : 'false'); v.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn all sound off');
    v.title = (muted ? 'All sound is off. ' : '') + 'All sound on or off (' + keyName('V') + '). Hold for sound settings.';
  };

  /* ---------- the sound panel (mini mixer) ---------- */
  function sl(id, label, v) { return '<label for="sp_' + id + '">' + esc(label) + ' <input type="range" id="sp_' + id + '" min="0" max="100" step="1" value="' + v + '" aria-valuetext="' + esc(label) + '"></label>'; }
  function sw(id, label, on) { return '<label for="sp_' + id + '">' + esc(label) + ' <input type="checkbox" id="sp_' + id + '"' + (on ? ' checked' : '') + '></label>'; }
  C.controlsHTML = function (a, prefix) {
    return [sw('musicOn', 'Music on', !a.musicOff), sl('music', 'Music volume', a.music), sw('voicesOn', 'Voices', a.characterVoices !== false), sl('voice', 'Voices volume', a.voice),
      sl('sfx', 'Effects', a.sfx), sl('ambience', 'City sounds', a.ambience), sl('master', 'Everything', a.master), sw('subtitles', 'Subtitles in films', a.subtitles),
      sw('readAloud', 'Read cards and questions aloud', a.readAloud),
      '<label for="sp_station">Radio in the city <select id="sp_station"><option value="fm"' + (a.station === 'fm' ? ' selected' : '') + '>Freight FM</option><option value="night"' + (a.station === 'night' ? ' selected' : '') + '>Night Shift</option><option value="off"' + (a.station === 'off' ? ' selected' : '') + '>Radio off</option></select></label>'
    ].join('').replace(/sp_/g, prefix || 'sp_').replace(/<label for=/g, prefix ? '<label class="set" for=' : '<label for=');
  };
  /* items 14 and 57: one tap for a quiet room (voices low, music off); in family mode it is called Bedtime volume */
  C.presetName = function () { return fam() ? 'Bedtime volume' : 'Quiet room'; };
  C.presetsHTML = function () { return '<div class="moreRow"><button class="btn small" type="button" data-preset="quiet">' + esc(C.presetName()) + '</button><button class="btn small" type="button" data-preset="normal">Normal sound</button></div>'; };
  C.preset = function (name) {
    var a = AU(); if (!a) return;
    if (name === 'quiet') { a.musicOff = true; a.voice = Math.min(a.voice, 35); a.sfx = Math.min(a.sfx, 30); a.ambience = Math.min(a.ambience, 20); a.muted = false; a.preset = 'quiet'; }
    else { a.musicOff = false; a.voice = Math.max(a.voice, 80); a.sfx = Math.max(a.sfx, 70); a.ambience = Math.max(a.ambience, 60); a.muted = false; a.preset = null; }
    save(true); apply(); tip(name === 'quiet' ? C.presetName() + ': voices low, music off.' : 'Normal sound.', 2200);
  };
  C.bindPresets = function (box) { Array.prototype.forEach.call(box.querySelectorAll('[data-preset]'), function (b) { b.addEventListener('click', function () { C.preset(b.getAttribute('data-preset')); var p = $('sysPanel'); if (p) { C.panel(false); C.panel(true); } }); }); };
  C.moreHTML = function (a, prefix) {
    var rates = [[0.75, 'Slower'], [0.9, 'Relaxed'], [1, 'Normal'], [1.15, 'Brisk'], [1.3, 'Quick'], [1.5, 'Fastest']];
    return ('<label for="sp_voiceRate">Voice speed <select id="sp_voiceRate">' + rates.map(function (r) { return '<option value="' + r[0] + '"' + (a.voiceRate === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select></label>' +
      '<label for="sp_ducking">Keep voices clear <select id="sp_ducking">' + [['off', 'Off'], ['gentle', 'Gentle'], ['normal', 'Normal'], ['strong', 'Strong']].map(function (r) { return '<option value="' + r[0] + '"' + (a.ducking === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select></label>' +
      sw('deviceVoice', 'Fill gaps with my device\'s voice', a.deviceVoice) + sw('mono', 'Mono', a.mono)).replace(/sp_/g, prefix || 'sp_').replace(/<label for=/g, prefix ? '<label class="set" for=' : '<label for=');
  };
  /* bind every control in box whose id starts with prefix to settings.audio */
  C.bind = function (box, prefix) {
    prefix = prefix || 'sp_';
    var slT = null;
    Array.prototype.forEach.call(box.querySelectorAll('[id^="' + prefix + '"]'), function (el) {
      var k = el.id.slice(prefix.length);
      var on = function (final) {
        var a = AU(); if (!a) return;
        if (k === 'musicOn') a.musicOff = !el.checked; else if (k === 'voicesOn') a.characterVoices = el.checked;
        else if (el.type === 'checkbox') a[k] = el.checked; else if (el.type === 'range') { a[k] = Math.max(0, Math.min(100, Math.round(+el.value))); if (k === 'music' && a.music > 0) lastMusic = a.music; }
        else if (k === 'voiceRate') a.voiceRate = +el.value; else a[k] = el.value;
        apply();
        if (k === 'station' && window.Kit) { Kit.setStation(a.station); return; }
        if (el.type === 'checkbox' && window.Kit) Kit.sfx('SFX-UI-TOGGLE', el.checked);
        if (el.type === 'range') { clearTimeout(slT); slT = setTimeout(function () { save(false); }, final ? 0 : 1000); } else save(true);
        /* item 39: moving a slider lets him hear it: a voice line, a bar of music, the bell */
        if (final && k === 'voice' && window.Voice) Voice.say({ key: 'CN-SAVED', pri: 'menu', asked: true });
        if (final && k === 'music' && window.Kit && !a.musicOff) Kit.sting('MUS-STING-RIGHT');
        if (final && k === 'sfx' && window.SFX) SFX.bell();
      };
      el.addEventListener(el.type === 'range' ? 'input' : 'change', function () { on(false); });
      if (el.type === 'range') el.addEventListener('change', function () { on(true); });
    });
  };
  C.panel = function (open) {
    var p = $('sysPanel');
    if (!open || p) { if (p) p.remove(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escKey, true); return; }
    var a = AU(); if (!a) return;
    p = document.createElement('div'); p.id = 'sysPanel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Sound settings');
    p.innerHTML = '<h3>Sound</h3>' + C.controlsHTML(a) + C.presetsHTML() + '<details><summary>More</summary>' + C.moreHTML(a) + '</details><div class="row"><button class="btn small go" type="button" id="sp_close">Done</button></div>';
    ['pointerdown', 'click', 'pointerup'].forEach(function (ev) { p.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    document.body.appendChild(p); C.bind(p); C.bindPresets(p);
    $('sp_close').addEventListener('click', function () { C.panel(false); });
    try { p.querySelector('input').focus({ preventScroll: true }); } catch (e) {}
    setTimeout(function () { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escKey, true); }, 30);
  };
  function outside(e) { var p = $('sysPanel'), c = $('sysCorner'); if (p && !p.contains(e.target) && !(c && c.contains(e.target))) C.panel(false); }
  function escKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); C.panel(false); } }

  /* ---------- keys: B music, V all sound (Shift in family mode); never in a text box or with Cmd, Ctrl or Alt ---------- */
  window.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    var k = e.key; if (k !== 'b' && k !== 'B' && k !== 'v' && k !== 'V') return;
    var ae = document.activeElement; if (ae && (/INPUT|TEXTAREA|SELECT/.test(ae.tagName) || ae.isContentEditable)) return;
    if (fam() && !e.shiftKey) return;
    if (!ST()) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (k === 'b' || k === 'B') C.toggleMusic(); else C.toggleMute();
  }, true);

  /* ---------- interface sounds: buttons, switches, keyboard focus ---------- */
  var BACK = /^(back|close|leave for now|back to the city|back to the game|back to now|pause and ride|keep it in my bag|done|walk out|cancel|not now|skip)\b/i, kbAt = 0;
  document.addEventListener('keydown', function (e) { if (e.key === 'Tab' || /^Arrow/.test(e.key)) kbAt = Date.now(); }, true);
  document.addEventListener('focusin', function () { if (Date.now() - kbAt < 400 && window.Kit) Kit.sfx('SFX-UI-FOCUS'); });
  document.addEventListener('click', function (e) {
    var rb = e.target.closest && e.target.closest('.readMe');
    if (rb) { e.preventDefault(); e.stopPropagation(); if (window.Voice) Voice.say({ text: rb.getAttribute('data-read'), pri: 'card', asked: true }); return; }
    var b = e.target.closest && e.target.closest('button'); if (!b || !window.Kit || b.closest('#sysCorner') || b.classList.contains('opt')) return;
    var t = (b.textContent || '').trim();
    if (/^Undo\b/.test(t)) Kit.sfx('SFX-UNDO'); else if (/^(Reveal|Said it)\b/.test(t)) Kit.sfx('SFX-SAID-IT'); else Kit.sfx(BACK.test(t) ? 'SFX-UI-BACK' : 'SFX-UI-SELECT');
  }, true);
  document.addEventListener('change', function (e) { if (e.target && e.target.type === 'checkbox' && window.Kit && !e.target.id.match(/^(sp_|aud_)/)) Kit.sfx('SFX-UI-TOGGLE', e.target.checked); }, true);

  /* subtitles off hides a film caption only while its voice is really playing (the words never vanish otherwise) */
  C.subsOff = function () { var a = AU(); return !!(a && a.subtitles === false && !a.muted && a.voice > 0 && a.characterVoices !== false); };

  /* a save restored as muted says so on the title, so silence is never a mystery */
  var shownMutedNote = false;
  setInterval(function () {
    if (!$('sysCorner') && document.body) build();
    C.refresh();
    var a = AU(), t = $('title');
    if (a && a.muted && !shownMutedNote && t && !t.classList.contains('hidden')) { shownMutedNote = true; tip('Sound is off. Tap the speaker' + orKey('V') + '.', 5000); }
  }, 500);
  if (document.readyState !== 'loading') build(); else document.addEventListener('DOMContentLoaded', build);
  window.AudioCtl = C;
})();
