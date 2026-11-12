/* Freight City Viva v3, round 4: small pieces that sit across screens. The arrow at the edge of the screen (item 65c),
   the first controls hint (26), Docket sniffing for parcels (45), the amber light card (10), What's new (16), the save
   chip (56), Today so far (60), the Controls card (26), and the new-dot marks on menu buttons (41). */
(function () {
  'use strict';
  var X = {}, $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return UI.esc(s); };
  var S = function () { return window.Game && Game.state; };
  var coarse = function () { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } };
  X.coarse = coarse;

  /* ---------- every frame: the arrow, the first hint, Docket's sniff ---------- */
  var hintShownAt = 0, sniffAt = 0;
  /* QAD-M7: the arrow keeps clear of everything drawn over the city: the HUD, the sound buttons, Docket, the tray, toasts */
  var obsAt = 0, obs = [], obsSig = '';
  function obstacles() {
    /* M2: the cache is dropped as soon as the HUD's layout changes (Ride there appearing moves the rows below it) */
    var hl = $('hudLeft'), hr = $('hudRight'), sig = (hl ? hl.offsetHeight + ':' + hl.offsetWidth : '') + '|' + (hr ? hr.offsetHeight + ':' + hr.offsetWidth : '') + '|' + innerWidth + 'x' + innerHeight;
    var now = Date.now(); if (now - obsAt < 60 && sig === obsSig) return obs; obsAt = now; obsSig = sig; obs = [];
    var push = function (e) { if (!e) return; var r = e.getBoundingClientRect(); if (r.width > 2 && r.height > 2) obs.push({ l: r.left, t: r.top, r: r.right, b: r.bottom }); };
    var vis = function (e) { if (!e || e.classList.contains('hidden') || e.hidden) return false; var cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05; };
    if (!vis($('hud'))) return obs;
    ['hudLeft', 'hudRight'].forEach(function (id) { var e = $(id); if (!vis(e)) return; Array.prototype.forEach.call(e.children, function (c) { if (!vis(c)) return; if (c.classList.contains('hudRow') || c.classList.contains('hudTop')) Array.prototype.forEach.call(c.children, function (cc) { if (vis(cc)) push(cc); }); else push(c); }); });
    ['sysCorner', 'sysTip', 'docket', 'dock', 'toast', 'nearby', 'raceRival', 'hint1', 'radioChip', 'undoBar', 'ticker'].forEach(function (id) { var e = $(id); if (vis(e)) push(e); });
    /* M2: the HUD's buttons are no-go zones at every size, whatever their parent */
    ['nextAct', 'btnNotebook', 'btnMenu', 'btnChapter', 'objective', 'objPanel', 'sysMusic', 'sysMute', 'saveTick', 'bagBtn', 'minimapWrap', 'btnTop', 'ready', 'kidBar'].forEach(function (id) { var e = $(id); if (vis(e)) push(e); });
    /* QAD2-m6: the nearest marker's name */
    try { var R = Game.renderer, lr = R && R.labelRect && R.labelRect(); if (lr) obs.push(lr); } catch (e) {}
    return obs;
  }
  /* M2: when the nearer searches fail, the free place nearest the wanted one (a 12 px grid over the screen) */
  function freeSpot(x0, y0, w, h) {
    var best = null, bd = 1e18, W = innerWidth, H = innerHeight;
    for (var y = h / 2 + 8; y <= H - h / 2 - 8; y += 12) for (var x = w / 2 + 8; x <= W - w / 2 - 8; x += 12) {
      var d = (x - x0) * (x - x0) + (y - y0) * (y - y0); if (d >= bd) continue;
      if (!hits(x, y, w, h)) { bd = d; best = [x, y]; }
    }
    return best;
  }
  X._obs = function () { return obs.slice(); };
  function hits(x, y, w, h) { var pad = 8, l = x - w / 2 - pad, t = y - h / 2 - pad, r = x + w / 2 + pad, b = y + h / 2 + pad; for (var i = 0; i < obs.length; i++) { var o = obs[i]; if (l < o.r && r > o.l && t < o.b && b > o.t) return true; } return l < 0 || t < 0 || r > innerWidth || b > innerHeight; }
  /* QAD4-01: where the arrow's label goes for a tip turned to an (radians, screen axes): on the far side from the tip.
     The side in use is kept until the tip is more than 55 degrees from its own direction, so it never flickers at 45. */
  var TIP = { row: Math.PI, 'row-reverse': 0, column: -Math.PI / 2, 'column-reverse': Math.PI / 2 };
  function labelSide(an, now) {
    if (now && TIP[now] !== undefined) { var d = Math.abs(Math.atan2(Math.sin(an - TIP[now]), Math.cos(an - TIP[now]))); if (d < 55 * Math.PI / 180) return now; }
    var c = Math.cos(an), s = Math.sin(an); return Math.abs(c) >= Math.abs(s) ? (c > 0 ? 'row-reverse' : 'row') : (s > 0 ? 'column-reverse' : 'column');
  }
  X._labelSide = labelSide;
  X.frame = function (paused, player) {
    var st = S(), R = Game.renderer, a = $('objArrow'); if (!st || !a) return;
    var busy = paused || UI.busy() || Game.kidDrive;
    /* 65c: the objective off the screen (16 px margin) or behind a building: an arrow on the edge, turned towards it */
    var p = Game.objectivePoint ? Game.objectivePoint() : null, show = false;
    if (!busy && p && R && R.toScreen) {
      var sp = R.toScreen(p.x, p.y), m = 16, W = innerWidth, H = innerHeight, off = sp.behind || sp.x < m || sp.y < m || sp.x > W - m || sp.y > H - m;
      var occ = !off && R.occluded ? R.occluded(p.x, p.y) : false, near = Math.hypot(p.x - player.x, p.y - player.y) < 60;
      if ((off || occ) && !near) {
        show = true;
        var cx = W / 2, cy = H / 2, dx = sp.x - cx, dy = sp.y - cy;
        if (sp.behind) { dx = -dx; dy = -dy; }
        var ang = Math.atan2(dy, dx), x, y, tx = sp.x, ty = sp.y;
        if (a.style.flexDirection !== labelSide(ang, a.style.flexDirection)) a.style.flexDirection = labelSide(ang, a.style.flexDirection);
        a.querySelector('span').textContent = (occ ? 'Behind the buildings · ' : '') + (Game.rideTime ? Game.rideTime(p) : '');
        a.classList.remove('hidden');
        var aw = a.offsetWidth || 120, ah = a.offsetHeight || 60;
        obstacles();
        if (off) {
          /* on the edge, turned towards the objective; slid along the edge (or a little inwards) until nothing is under it */
          var edge = function (an, inset) { var ex = Math.cos(an), ey = Math.sin(an), kk = Math.min((W / 2 - inset - aw / 2 + 40) / Math.max(1e-3, Math.abs(ex)), (H / 2 - inset - ah / 2 + 30) / Math.max(1e-3, Math.abs(ey))); return [cx + ex * kk, cy + ey * kk]; };
          var best = edge(ang, 70);
          if (hits(best[0], best[1], aw, ah)) {
            var found = null;
            for (var inset = 70; inset <= 230 && !found; inset += 40) for (var dA = 0; dA <= 1.2 && !found; dA += 0.08) { [1, -1].forEach(function (sg) { if (found) return; var c = edge(ang + sg * dA, inset); if (!hits(c[0], c[1], aw, ah)) found = c; }); }
            if (!found) found = freeSpot(best[0], best[1], aw, ah);
            if (found) best = found;
          }
          x = best[0]; y = best[1];
          tx = sp.behind ? cx + dx * 50 : sp.x; ty = sp.behind ? cy + dy * 50 : sp.y; ang = Math.atan2(ty - y, tx - x);
        } else {
          /* QAD-m9: above the point, or below it when the top of the screen is too close; always inside the screen */
          x = Math.max(aw / 2 + 8, Math.min(W - aw / 2 - 8, sp.x)); y = sp.y - 64; ang = Math.PI / 2;
          if (y - ah / 2 < 8 || hits(x, y, aw, ah)) {
            /* try below the point, then a little further away above or below, until nothing is under the arrow */
            var placed = false;
            for (var dy2 = 64; dy2 <= 260 && !placed; dy2 += 28) {
              [sp.y + dy2, sp.y - dy2].forEach(function (yy) { if (placed) return; if (yy - ah / 2 >= 8 && yy + ah / 2 <= H - 8 && !hits(x, yy, aw, ah)) { placed = true; ang = yy > sp.y ? -Math.PI / 2 : Math.PI / 2; y = yy; } });
            }
            if (!placed) { var fs = freeSpot(x, sp.y - 64, aw, ah); if (fs) { x = fs[0]; y = fs[1]; ang = Math.atan2(sp.y - y, sp.x - x); } else y = Math.max(ah / 2 + 8, Math.min(H - ah / 2 - 8, y)); }
          }
        }
        a.style.left = Math.round(x) + 'px'; a.style.top = Math.round(y) + 'px';
        /* QAD4-01: aim from the arrow itself, not from the middle of the arrow and its label (near the objective the two
           differ by tens of degrees); the label sits on the side away from the tip */
        var iel = a.querySelector('i');
        for (var it = 0; it < 2; it++) {
          var sd = labelSide(ang, a.style.flexDirection); if (a.style.flexDirection !== sd) a.style.flexDirection = sd;
          var bw = a.offsetWidth, bh = a.offsetHeight, icx = x - bw / 2 + iel.offsetLeft + iel.offsetWidth / 2, icy = y - bh / 2 + iel.offsetTop + iel.offsetHeight / 2;
          ang = Math.atan2(ty - icy, tx - icx);
        }
        iel.style.transform = 'rotate(' + ang.toFixed(3) + 'rad)';
        a.dataset.state = off ? 'edge' : 'occluded';
      }
    }
    a.classList.toggle('hidden', !show); if (!show) a.dataset.state = 'none';
    /* 26: the first controls hint stays until the bike first moves */
    var h = $('hint1');
    if (h && !h.classList.contains('hidden') && player.moving && Date.now() - hintShownAt > 800) { h.style.opacity = '0'; setTimeout(function () { h.classList.add('hidden'); h.style.opacity = ''; }, 650); st.cuts.movedOnce = 1; }
    /* 45: in family mode with an empty bag, Docket turns towards the nearest parcel (never a drop door) and wags */
    var dk = $('docket');
    if (dk && st.settings.family && !dk.classList.contains('hidden') && !busy) {
      var ps = Game.parcelsNow ? Game.parcelsNow() : [];
      if (!st.parcels.bag.length && ps.length) {
        var best = null, bd = 1e9; ps.forEach(function (q) { var d = Math.hypot(q.x - player.x, q.y - player.y); if (d < bd) { bd = d; best = q; } });
        var deg = Math.round(Math.atan2(best.y - player.y, best.x - player.x) * 180 / Math.PI);
        dk.style.transform = 'rotate(' + Math.max(-35, Math.min(35, deg / 4)) + 'deg)'; dk.dataset.sniff = String(deg);
        if (bd < 900 && Date.now() - sniffAt > 9000 && !st.settings.reduceMotion) { sniffAt = Date.now(); dk.classList.remove('wag'); void dk.offsetWidth; dk.classList.add('wag'); }
      } else { dk.style.transform = ''; delete dk.dataset.sniff; }
    }
  };
  X.showHint = function () {
    var h = $('hint1'), st = S(); if (!h || (st && st.cuts.movedOnce)) return;
    h.textContent = coarse() ? 'Drag anywhere to steer, or tap where you want to go.' : 'WASD or the arrow keys to pedal, Shift to pedal hard. Or click where you want to go.';
    h.classList.remove('hidden'); hintShownAt = Date.now();
  };

  /* ---------- 10: the amber light card, the first time a light comes on ---------- */
  /* QAD4-02: written for the moment the light came on (cameOn, the count then), the lights drawn as the HUD's lamps, and
     the rule that dims them said plainly; if they have all gone out by the time the card opens, it says so */
  X.amberCard = async function (force, cameOn) {
    var st = S(); if (!st) return;
    if (!force && st.cuts.amberIntro) return;
    st.cuts.amberIntro = 1; Game.save();
    var lamps = function (n) { var full = Math.floor(n), half = n - full >= 0.5, s = ''; for (var i = 0; i < 5; i++) s += '<i class="lamp' + (i < full ? ' on' : i === full && half ? ' half' : '') + '"></i>'; return '<span class="lamps" role="img" aria-label="Amber lights ' + n + ' of 5">' + s + '</span>'; };
    var lead = cameOn !== undefined ? 'A light came on: you missed one you\'d met before.' : 'Amber lights come on when you miss one you\'d met before.';
    var now = st.stars > 0 ? '<p>Lights on now: ' + lamps(st.stars) + '</p>' : '<p>It has already gone out: right answers dim the lights.</p>';
    await UI.modal('Amber light', '<p>' + lead + ' Three lights and a Kerb Inspector waves you over for a spot check. Each right answer dims half a light, and a minute of clean riding switches one off.</p>' + now, [{ label: 'Got it', value: 1, cls: 'go' }]);
  };

  /* ---------- 16: What's new, once per build, also for a save that already moved to version 3 ---------- */
  X.whatsNew = async function (show) {
    var st = S(); if (!st || st.cuts['whatsnew:v3']) return;
    st.cuts['whatsnew:v3'] = 1; Game.save();
    if (!show) return;
    return X.whatsNewCard();
  };
  /* D2-m5: the same counts as the Time Machine and Load a save. m7: one "Show me around" that steps through the five,
     instead of five Show me buttons */
  X.whatsNewCard = async function () {
    var st = S();
    var rows = [['bag', 'Your bag', 'Parcels go in a bag you can open, with where each one goes.'], ['map', 'Map and Journey', 'Every step on one map. Hold Restart on any step to play it again from there, with Undo.'], ['academy', 'The Academy', 'Short lessons on the methods, one at a time.'], ['sound', 'Sound and mute', 'The note and speaker buttons at the top: music and all sound on or off.'], ['tm', 'Time Machine', 'Go back to an earlier save at any time.']];
    var html = '<p>Your progress came across: ' + esc(Save.tallyText(Save.tally(st))) + '.</p><p>Five things are new: ' + esc(rows.map(function (r) { return r[1]; }).join(', ')) + '.</p>';
    var go = await UI.modal('What\'s new', html, [{ label: 'Show me around', value: 1, cls: 'go' }, { label: 'Carry on', value: 0 }]);
    if (!go) return;
    for (var i = 0; i < rows.length; i++) {
      var last = i === rows.length - 1;
      var v = await UI.modal((i + 1) + ' of ' + rows.length + ': ' + rows[i][1], '<p>' + esc(rows[i][2]) + '</p>', [{ label: last ? 'Done' : 'Next', value: 1, cls: 'go' }].concat(last ? [] : [{ label: 'Carry on', value: 0 }]));
      if (!v) break;
    }
  };

  /* ---------- 56: a tap on the save tick: a small chip, the last three saves, and Save options ---------- */
  X.saveChip = function () {
    var old = $('saveChip'); if (old) { old.remove(); return; }
    var s = Save.status(), list = (Game.saveTimes || []).slice(0, 3);
    var c = document.createElement('div'); c.id = 'saveChip'; c.className = 'saveChip'; c.setAttribute('role', 'status');
    var when = s.at ? Game.ago(s.at) : null;
    c.innerHTML = '<b>' + esc(when ? 'Saved ' + when + ' ago, ' + (s.kind === 'account' ? 'to your account' : s.kind === 'device' ? 'on this device' : 'not yet') : Chapter.statusText()) + '</b>' +
      (list.length ? '<ul>' + list.map(function (t) { return '<li>' + new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '</li>'; }).join('') + '</ul>' : '') +
      '<button class="btn small" type="button" id="saveChipMore">Save options</button>';
    document.body.appendChild(c);
    $('saveChipMore').addEventListener('click', function () { c.remove(); Chapter.saveCode(); });
    var close = function (e) { if (!c.contains(e.target) && e.target.id !== 'saveTick' && !(e.target.closest && e.target.closest('#saveTick'))) { c.remove(); document.removeEventListener('pointerdown', close, true); } };
    setTimeout(function () { document.addEventListener('pointerdown', close, true); }, 30);
    setTimeout(function () { if (c.parentNode) c.remove(); }, 8000);
  };

  /* ---------- 60: Today so far, from memory only ---------- */
  X.today = function () {
    var st = S(), d = FCV.today(), di = (st.days || []).indexOf(d) + 1;
    var steps = 0; Object.keys(st.acts || {}).forEach(function (n) { var a = st.acts[n]; Object.keys((a && a.doneAt) || {}).forEach(function (k) { if (FCV.today(new Date(a.doneAt[k])) === d) steps++; }); });
    var answers = 0, proven = 0; if (di) Object.keys(st.mem || {}).forEach(function (id) { var m = st.mem[id]; if (m && m.last === di) { answers++; if (m.box >= 3) proven++; } });
    return 'Today so far: ' + steps + (steps === 1 ? ' step, ' : ' steps, ') + answers + (answers === 1 ? ' answer, ' : ' answers, ') + proven + (proven === 1 ? ' card proven.' : ' cards proven.');
  };

  /* ---------- 26: the Controls card, for this device ---------- */
  X.controls = function () {
    var fam = S() && S().settings.family, sh = fam ? 'Shift+' : '';
    var rows = coarse()
      ? ['Drag anywhere on the city to steer; push further to pedal hard.', 'Tap a spot to ride there.', 'Tap Ride there for the next stop.', 'Tap your bike for your passport.', 'The note button: music on or off. The speaker: all sound on or off.']
      : ['WASD or the arrow keys: pedal. Shift: pedal hard. Space: the bell.', 'Click a spot to ride there, or Ride there for the next stop.', sh + 'M: the Map. ' + sh + 'N: the Notebook. ' + sh + 'T: top-down view. F: Freight FM.', sh + 'B: music on or off. ' + sh + 'V: all sound on or off.', 'Esc: the menu. In a scene, the left arrow goes back a line.'];
    return UI.modal('Controls', '<ul class="tightList">' + rows.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>', [{ label: 'Got it', value: 1, cls: 'go' }]);
  };

  /* ---------- 41: new dots ---------- */
  X.mark = function (kind) { var st = S(); if (!st) return; st.newIn = st.newIn || {}; st.newIn[kind] = Date.now(); };
  X.seen = function (kind) { var st = S(); if (st && st.newIn && st.newIn[kind]) { delete st.newIn[kind]; Game.save(); } };
  X.isNew = function (kind) { var st = S(); return !!(st && st.newIn && st.newIn[kind]); };
  window.Extras = X;
})();
