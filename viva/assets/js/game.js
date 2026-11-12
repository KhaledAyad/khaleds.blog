/* Freight City Viva v3: the city simulation (fixed 120 Hz step, interpolated), markers, parcels, Kerb Inspectors,
   the HUD with its save tick, input, saving and boot. Drawing is done by a swappable renderer (3D or 2D). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('game'), mm = $('minimap'), mx = mm.getContext('2d');
  var G = { state: null, renderer: null };
  window.Game = G;
  var city = null, solids = null, mmStatic = null, R = null;
  var player = { x: 0, y: 0, r: 14, face: 0, walk: 0, moving: false, vx: 0, vy: 0, px: 0, py: 0, lean: 0 };
  var keys = {}, target = null, joy = null, pointer = null, ride = null;
  var cars = [], peds = [], insp = [], lostTimer = 0, rideTimer = 0, graceUntil = 0, tickerAt = 0, playedAcc = 0, activeAcc = 0;
  var flowRunning = false, lastTriggered = null, lastCellKey = null, t0 = 0, saveTimer = 0, snapTimer = 0;
  var markers = [], parcels = [], nearestId = null, animal = null, route = null;
  var ACT_COL = { 1: '#ff8a3d', 2: '#2bb3a6', 3: '#7a5cff', 4: '#e2456f', 5: '#ffb000', 6: '#e6332a', 7: '#16a0d8' };
  var DWELL = { side: 1, corner: 1, drop: 1 }, dwell = {};
  /* QAR9-01: goal is the marker a tap or Ride there is taking the bike to. The bike stops within reach of it (a drop box
     wants a second's stand, and rolling on past it lost the delivery), and on the way and while it stands no other marker
     opens; heldOff are markers within reach when the goal opened, which wait until the bike has left them. */
  var goal = null, heldOff = {}, REACH = 34;
  /* QAR10-04: how the bike was last driven ('key' or 'touch'). A delivery writes to the learning record, so in family mode
     one made by keys alone (arrow keys riding in, or Enter or Space on Ride there) does not happen: the bike stands at the
     box and the box says "Tap to deliver"; a tap or click on the box or on that prompt delivers. */
  var lastDrive = 'touch', tapDeliver = null;
  function keysOnly() { return fam() && lastDrive === 'key'; }
  function deliversHere(m) { var bag = G.state && G.state.parcels ? G.state.parcels.bag : []; return bag.some(function (id) { return homeMarker(id) === m; }); }
  function showTapDeliver(m) {
    var b = $('tapDeliver');
    if (!b) { b = document.createElement('button'); b.id = 'tapDeliver'; b.type = 'button'; b.className = 'btn go tapDeliver'; b.setAttribute('data-answer', '1'); b.textContent = 'Tap to deliver'; document.body.appendChild(b);
      b.addEventListener('click', function () { var tm = tapDeliver; hideTapDeliver(); if (!tm || flowRunning) return; lastDrive = 'touch'; lastTriggered = null; goal = tm.id; trigger(tm); }); }
    tapDeliver = m; b.classList.remove('hidden'); placeTapDeliver();
  }
  function hideTapDeliver() { tapDeliver = null; var b = $('tapDeliver'); if (b) b.classList.add('hidden'); }
  function placeTapDeliver() {
    var b = $('tapDeliver'); if (!b || !tapDeliver || !R) return;
    if (flowRunning || UI.busy() || Math.hypot(tapDeliver.x - player.x, tapDeliver.y - player.y) > 38 + player.r + 8 || !deliversHere(tapDeliver)) { hideTapDeliver(); return; }
    var q = R.toScreen(tapDeliver.x, tapDeliver.y, 3.2); b.style.left = Math.max(8, Math.min(innerWidth - b.offsetWidth - 8, q.x - b.offsetWidth / 2)) + 'px'; b.style.top = Math.max(60, Math.min(innerHeight - 60, q.y - 54)) + 'px';
  }
  function goalMarker() { if (!goal) return null; for (var i = 0; i < markers.length; i++) if (markers[i].id === goal) return markers[i]; return null; }
  function catchBox() { var bag = G.state && G.state.parcels ? G.state.parcels.bag : []; if (!bag.length) return null; for (var i = 0; i < markers.length; i++) { var m = markers[i]; if (m.kind === 'drop' && Math.hypot(m.x - player.x, m.y - player.y) < 38 + player.r - 2 && bag.some(function (id) { return homeMarker(id) === m; })) return m; } return null; }
  function markerAt(x, y, within) { var best = null, bd = within; markers.forEach(function (m) { var d = Math.hypot(m.x - x, m.y - y); if (d < bd && !m.inert) { bd = d; best = m; } }); return best; }
  var STEP = 1 / 120;
  var SET = function () { return G.state.settings; };
  var fam = function () { return !!(G.state && G.state.settings.family); };

  /* ---------------- state and saving ---------------- */
  G.save = function (soon) { if (!G.state || !city || G.kidDrive) return; G.state.pos = { x: Math.round(player.x), y: Math.round(player.y) }; Save.write(G.state, soon === true); };
  /* Flushed on every step end, answer, hidden tab and pagehide; a film shot or a line reached is written within 0.4 s (G.save(true)). */
  G.flush = function () { if (G.kidDrive) return Promise.resolve('kid'); G.save(); return Save.flush(); };
  G.snapshot = function (label) { if (!G.state || G.kidDrive) return Promise.resolve(); return Save.snapshot(G.state, label); };
  G.stars = function (d, silent) {
    var st = G.state, before = st.stars;
    st.stars = Math.max(0, Math.min(5, Math.round((st.stars + d) * 2) / 2));
    if (st.stars > before && !silent) { var el = $('stars'); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); if (window.SFX) SFX.star(); }
    if (!st.settings.calmCity && Math.floor(st.stars) >= 3 && Math.floor(before) < 3) UI.toast('Three amber lights. The Kerb Inspectors want a word. Ride on, or stop for a spot check: one question you missed.', 3800);
    hud();
    /* item 10: the first light ever shows what amber lights mean, once */
    /* QAD4-02: the card is written at the moment the light came on (the count then), and says right answers dim them */
    if (st.stars > before && !st.cuts.amberIntro && !st.settings.calmCity && window.Extras) { var cameOn = st.stars, w = setInterval(function () { if (!UI.busy() && !flowRunning) { clearInterval(w); if (!st.cuts.amberIntro) Extras.amberCard(false, cameOn); } }, 800); }
  };
  /* Heat: a star only for an item missed on its second or later showing; never on a first meeting. */
  G.heat = function (outcome, res) { if (outcome === 'right') G.stars(-0.5, true); else if (outcome === 'wrong' && res && !res.first) G.stars(1); };
  G.noteMet = function (id) { if (G.state && !G.state.met[id]) { G.state.met[id] = 1; if (window.Mastery) Mastery.onMet(id); if (window.Kit) Kit.sfx('SFX-MET'); } };
  G.afterUI = function () { keys = {}; joy = null; $('joy').classList.add('hidden'); graceUntil = performance.now() + 10000; hud(); UI.letterbox(); };
  G.refresh = function () { buildMarkers(); buildParcels(); hud(); G.save(); };
  G.runFlow = function (fn) { return runFlow(fn); };
  G.isBusy = function () { return flowRunning; };
  G.statusText = function () { return Chapter.statusText(); };
  G.chainLit = function (link) {
    var r = FCV.resolve(link); if (!r) return;
    if (window.Sound) Sound.chainChord(link === 'link-5');
    UI.toast((link === 'link-5' ? 'Link 5 lights hollow: proposed, not found. ' : 'A link lights: ') + r.figure, 3600);
    hud();
  };
  G.applySettings = function () {
    var s = G.state.settings;
    document.body.classList.toggle('reduceMotion', !!s.reduceMotion);
    document.body.classList.toggle('family', !!s.family);
    var cutTap = document.getElementById('cutTap'); if (cutTap) cutTap.textContent = G.cutHint();
    document.body.classList.toggle('highContrast', !!s.highContrast);
    document.body.classList.remove('text-large', 'text-larger'); if (s.textSize !== 'normal') document.body.classList.add('text-' + s.textSize);
    document.body.classList.toggle('capLarge', s.captionSize === 'large' || !!s.family);
    if (window.SFX) SFX.setOn(s.effects !== false, s.volume);
    if (window.Sound) Sound.setVolumes(s);
    if (s.calmCity) insp = [];
    if (R && R.setTier) R.setTier(tierFor(s.graphics));
  };
  /* SD-20 and SD-21: the film hint never says "tap for the next shot", and names keys only where there is a keyboard */
  G.cutHint = function () { var fam = SET().family; return UI.kb() ? (fam ? 'Next, Space or the right arrow for the next shot' : 'Tap or Esc to pause. Next, Space or the right arrow for the next shot') : (fam ? 'Next for the next shot' : 'Tap to pause. Next for the next shot'); };
  G.toggleTopDown = function () { var s = SET(); s.topDown = !s.topDown; FCV.stampSettings(G.state); G.save(); hud(); UI.toast(s.topDown ? (UI.kb() ? 'Top-down view. Press T to go back.' : 'Top-down view. Tap Top view to go back.') : 'Normal view.', 1600, { replace: 'view' }); };
  /* QAD3-B1: the save object is never swapped while the game runs. A merged, loaded, restored or undone copy is written
     into the live object in place (keys it lacks are removed), so a flow that holds Game.state from its start still
     writes to the save that is kept. Flows that hold a part of the save (a room, a lesson) read it again after a wait. */
  G.adopt = function (s) {
    var cur = G.state; if (!s) return cur;
    if (!cur || cur === s) { G.state = s; return s; }
    Object.keys(cur).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(s, k)) delete cur[k]; });
    Object.assign(cur, s); if (window.Mastery) Mastery.bump(); /* the readiness cache is keyed by the save object, which stays the same */
    return cur;
  };
  G.replaceState = function (s) { G.adopt(Save.upgrade(s)); delete G.state.madeAt; if (window.Mastery) Mastery.bump(); G.applySettings(); G.respawn(); G.refresh(); };
  G.respawn = function () { placePlayer(true); };
  G.showTitle = function () { showTitle(); };
  G.player = function () { return player; };
  /* Test hooks for the headless checks (inert unless a test calls them). */
  window.__FCV_TEST__ = { world: function (w) { G.testWorld = w; }, place: function (x, y) { G.placePlayer(x, y); }, stats: function () { return R && R.stats ? R.stats() : null; }, frames: function () { return frames.slice(); } };
  G.city = function () { return city; };
  G.animal = function () { return animal; };
  G.markers = function () { return markers; };
  G.cityMarker = cityMarker;

  /* ---------------- travel: Tram (a crane fly-over) and Ride there (auto-ride at 1.6x) ---------------- */
  function fade(cb) {
    var f = $('fade'); f.classList.add('on'); if (window.SFX) SFX.bell();
    setTimeout(function () { cb(); setTimeout(function () { f.classList.remove('on'); }, 250); }, SET().reduceMotion ? 300 : 800);
  }
  function markerFor(place) {
    if (!place) return null;
    if (place.kind === 'room') return cityMarker('room-' + place.room);
    if (place.kind === 'act') { var ns = FCV.nextSteps(G.state, place.act)[0]; return ns ? cityMarker('act' + place.act + '-' + FCV.slotOf(ns)) : cityMarker('act' + place.act + '-tp'); }
    if (place.kind === 'viva') return cityMarker('viva');
    if (place.kind === 'kiosk') return cityMarker('kiosk');
    if (place.kind === 'academy') return cityMarker('act3-scene3');
    if (place.kind === 'drop') return cityMarker('act' + place.act + '-drop');
    return null;
  }
  G.travelTo = function (place) {
    var m = markerFor(place); if (!m) return;
    if (R && R.cine) R.cine({ kind: 'crane', to: { x: m.x, y: m.y }, ms: 1600 });
    fade(function () { G.teleportAt = Date.now(); player.x = player.px = m.x; player.y = player.py = m.y + 80; if (FCV.collide(solids, player.x, player.y, player.r)) player.y = player.py = m.y + 40; if (R.snapCam) R.snapCam(player.x, player.y); lastTriggered = null; lastCellKey = cellKey(FCV.cellAt(city, player.x, player.y)); G.save(); });
  };
  G.travelToAct = function (n) { G.travelTo({ kind: 'act', act: n }); };
  /* A route along the road grid: to the nearest road, along it, then in to the marker. */
  function roadRoute(ax, ay, bx, by) {
    var Rr = city.R, CW = city.CW, CH = city.CH;
    var colX = function (x) { var j = Math.round((x - Rr / 2) / (CW + Rr)); j = Math.max(0, Math.min(4, j)); return j * (CW + Rr) + Rr / 2; };
    var rowY = function (y) { var k = Math.round((y - Rr / 2) / (CH + Rr)); k = Math.max(0, Math.min(3, k)); return k * (CH + Rr) + Rr / 2; };
    var ax2 = colX(ax), by2 = rowY(by);
    return [{ x: ax, y: ay }, { x: ax2, y: ay }, { x: ax2, y: by2 }, { x: bx, y: by2 }, { x: bx, y: by }];
  }
  /* Ride there picks a road route whose every leg is clear of buildings, and stops just short of the marker on the
     side it approaches from; the old single route could end against a wall 40 m away. */
  function clearLeg(p, q) { var d = Math.hypot(q.x - p.x, q.y - p.y), n = Math.max(1, Math.ceil(d / 12)); for (var i = 1; i <= n; i++) { var x = p.x + (q.x - p.x) * i / n, y = p.y + (q.y - p.y) * i / n; if (FCV.collide(solids, x, y, player.r)) return false; } return true; }
  function bestRoute(ax, ay, bx, by) {
    var Rr = city.R, CW = city.CW, CH = city.CH, cands = [];
    var colX = function (j) { return j * (CW + Rr) + Rr / 2; }, rowY = function (k) { return k * (CH + Rr) + Rr / 2; };
    var nearCol = Math.max(0, Math.min(4, Math.round((ax - Rr / 2) / (CW + Rr)))), nearRow = Math.max(0, Math.min(3, Math.round((ay - Rr / 2) / (CH + Rr))));
    for (var k = 0; k <= 3; k++) { var ry = rowY(k), stop = { x: bx, y: by + (ry < by ? -60 : 60) }; cands.push([{ x: ax, y: ay }, { x: colX(nearCol), y: ay }, { x: colX(nearCol), y: ry }, { x: bx, y: ry }, stop]); }
    for (var j = 0; j <= 4; j++) { var cx = colX(j), stop2 = { x: bx + (cx < bx ? -60 : 60), y: by }; cands.push([{ x: ax, y: ay }, { x: ax, y: rowY(nearRow) }, { x: cx, y: rowY(nearRow) }, { x: cx, y: by }, stop2]); }
    var best = null, bl = 1e12;
    cands.forEach(function (r) { var ok = true, len = 0; for (var i = 1; i < r.length; i++) { len += Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y); if (i > 1 && !clearLeg(r[i - 1], r[i])) ok = false; } if (ok && len < bl) { bl = len; best = r; } });
    return best || roadRoute(ax, ay, bx, by + 70);
  }
  G.rideTo = function (place) {
    var m = place && place.x !== undefined ? place : markerFor(place); if (!m) return;
    route = bestRoute(player.x, player.y, m.x, m.y);
    ride = { pts: route.slice(1), i: 0 }; target = null; goal = m.id || null;
    UI.toast(UI.kb() ? 'Riding there. Any key takes control.' : 'Riding there. Drag or tap to take over.', 2200);
  };
  G.route = function () { return route; };
  G.setRoute = function (pts) { route = pts; };

  /* ---------------- markers and parcels ---------------- */
  function cityMarker(id) { for (var i = 0; i < city.markers.length; i++) if (city.markers[i].id === id) return city.markers[i]; return null; }
  var STEP_MIN = { opening: 1, scene: 4, tp: 3, on_air: 2, ladder: 2, mission: 8, methods: 8, rehearsal: 3, mock_viva: 8, shift_check: 4, closer: 2, academy_entrance: 1 };
  function buildMarkers() {
    var st = G.state, out = [];
    if (!st || !city) return;
    var obj = FCV.objective(st);
    for (var n = 1; n <= 7; n++) {
      if (!FCV.actOpen(st, n)) continue;
      FCV.nextSteps(st, n).forEach(function (s, si) {
        if (s.kind === 'closer' || s.kind === 'shift_check') { var c0 = cityMarker('act' + n + '-tp'); out.push({ id: c0.id + ':' + s.kind, x: c0.x, y: c0.y, kind: 'main', act: n, step: s.id, who: s.kind === 'shift_check' ? 'digits' : 'you', label: s.title, obj: obj.kind === 'act' && obj.act === n }); return; }
        var cm = cityMarker('act' + n + '-' + FCV.slotOf(s)); if (!cm) return;
        var off = 0; out.forEach(function (o) { if (o.x === cm.x && Math.abs(o.y - cm.y) < 60) off += 90; });
        out.push({ id: cm.id + ':' + s.id, x: cm.x + off, y: cm.y, kind: 'main', act: n, step: s.id, who: s.kind === 'opening' ? null : FCV.stepSpeaker(n, s), label: s.title + ' · about ' + (STEP_MIN[s.kind] || 3) + ' min', obj: obj.kind === 'act' && obj.act === n });
      });
      if (FCV.isDone(st, n, 'opening')) {
        var as = FCV.actState(st, n), a = FCV.data.script.acts[n - 1];
        var sm = cityMarker('act' + n + '-side'), co = cityMarker('act' + n + '-corner'), dr = cityMarker('act' + n + '-drop');
        out.push({ id: sm.id, x: sm.x, y: sm.y, kind: 'side', act: n, who: a.side_mission.giver, label: 'Side mission: ' + a.side_mission.name, done: !!as.side.done });
        out.push({ id: co.id, x: co.x, y: co.y, kind: 'corner', act: n, who: 'dr_tally', label: 'Examiner corner', done: !!as.cornerDone });
        out.push({ id: dr.id, x: dr.x, y: dr.y, kind: 'drop', act: n, label: 'Drop box: Act ' + n + ' evidence' });
      }
      if (n === 3 && (st.cuts.academy_entrance || FCV.isDone(st, 3, 'academy_entrance'))) { var mb = cityMarker('act3-scene3'); out.push({ id: 'academy', x: mb.x - 120, y: mb.y + 40, kind: 'methods', act: 3, who: 'sam', label: 'The Methods Academy' }); }
    }
    FCV.data.script.evidence_locker.rooms.forEach(function (r) {
      var cm = cityMarker('room-' + r.id), rs = st.rooms[r.id];
      out.push({ id: cm.id, x: cm.x, y: cm.y, kind: 'room', room: r.id, who: r.keeper, label: r.name + ' (Appendix ' + r.appendices.join(', ') + ')', done: !!(rs && rs.badge), obj: obj.kind === 'room' && obj.room === r.id, letters: r.appendices.join('') });
    });
    var vm = cityMarker('viva');
    out.push({ id: 'viva', x: vm.x, y: vm.y, kind: 'viva', label: 'The Viva Hall', locked: !FCV.vivaOpen(st), obj: obj.kind === 'viva' });
    if (FCV.actDone(st, 7)) out.push({ id: 'waiting-room', x: vm.x + 260, y: vm.y, kind: 'waiting', label: 'The Waiting Room: a mock viva' });
    var km = cityMarker('kiosk');
    out.push({ id: 'kiosk', x: km.x, y: km.y, kind: 'kiosk', who: 'digits', label: "Digits' kiosk: drills, the Night Shift and the Tune-up Bay" });
    if (G.kidDrive) out.forEach(function (m) { m.inert = true; m.label = FCV.data.script.session_copy.family.dads_job; });
    if (G.racing) out.forEach(function (m) { m.inert = true; m.quiet = true; });
    markers = out;
  }
  function buildParcels() {
    var st = G.state; if (!st || !city) return;
    if (G.kidDrive || G.racing) { parcels = []; return; }
    /* SD-06: never a litter of boxes. The current act's parcels (else the earliest act with some left), at most two for
       the Evidence Locker rooms, and only the three nearest in the city at once. Each box wears its district's colour. */
    var left = FCV.parcelIds(st).filter(function (id) { return !st.parcels.picked[id]; });
    var o = FCV.objective(st), cur = o.kind === 'act' ? o.act : 0, actOf = function (id) { var m = /^ch(\d)-/.exec(id); return m ? +m[1] : 0; };
    var acts = left.filter(function (id) { return actOf(id); }), pick = acts.filter(function (id) { return actOf(id) === cur; });
    if (!pick.length && acts.length) { var lo = Math.min.apply(null, acts.map(actOf)); pick = acts.filter(function (id) { return actOf(id) === lo; }); }
    pick = pick.concat(left.filter(function (id) { return /^app-/.test(id); }).slice(0, 2));
    var COL = { 1: '#ff8a3d', 2: '#2bb3a6', 3: '#7a5cff', 4: '#e2456f', 5: '#ffb000', 6: '#e6332a', 7: '#16a0d8' };
    parcels = pick.map(function (id) { var p = FCV.parcelSpot(city, id); return p ? { id: id, x: p.x, y: p.y, col: COL[actOf(id)] || '#ff5fa2', hot: st.mem[id] && st.mem[id].sureWrong > 0 && st.mem[id].box === 1 } : null; }).filter(Boolean)
      .sort(function (a, b) { return Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y); }).slice(0, 3);
  }
  /* the marker for a parcel's home: its act's drop box or its Evidence Locker door */
  function homeMarker(id) {
    var h = FCV.parcelHome(id); if (!h) return null;
    var mid = h.kind === 'act' ? 'act' + h.act + '-drop' : 'room-' + h.room;
    for (var i = 0; i < markers.length; i++) if (markers[i].id === mid) return markers[i];
    return null;
  }
  G.homeMarker = homeMarker;
  /* while the bag holds a parcel, the arrow points to where the newest one goes (item 1; this overrides design P15 and P38) */
  function bagAim() {
    var st = G.state; if (!st || !st.parcels.bag.length || G.kidDrive || G.racing) return null;
    var id = st.parcels.aim && st.parcels.bag.indexOf(st.parcels.aim) >= 0 ? st.parcels.aim : st.parcels.bag[st.parcels.bag.length - 1];
    var m = homeMarker(id); return m ? { m: m, id: id } : null;
  }
  G.bagAim = bagAim;
  G.objectivePoint = function () { return objectivePoint(); };
  G.parcelsNow = function () { return parcels; };
  /* QAD3-m1 (family): during Same Door Dash the gold arrow and the objective point at the race's finish */
  var raceTarget = null;
  G.setRaceTarget = function (m, n) { raceTarget = m ? { x: m.x, y: m.y, id: m.id, kind: 'drop', act: n, race: true } : null; hud(); };
  function objectivePoint() {
    if (G.racing && raceTarget) return raceTarget;
    var ba = bagAim(); if (ba) return ba.m;
    for (var i = 0; i < markers.length; i++) if (markers[i].obj) return markers[i];
    for (var j = 0; j < markers.length; j++) if (markers[j].kind === 'main') return markers[j];
    return null;
  }

  /* ---------------- HUD ---------------- */
  function hud() {
    var st = G.state; if (!st || !city) return;
    var o = FCV.objective(st), p = objectivePoint(), ba = bagAim();
    var label = ba ? 'Deliver the parcel: ' + FCV.parcelHome(ba.id).label + (ba.m.kind === 'drop' ? ' drop box' : ' door') : o.label;
    if (G.racing && raceTarget) label = 'Same Door Dash: ride to the Act ' + raceTarget.act + ' drop box';
    $('objText').textContent = G.kidDrive ? 'Co-pilot driving' : label + (p ? ' · ' + rideTime(p) : '');
    /* the one next action: Ride there, with the ride time (items 42 and 68a) */
    var na = $('nextAct');
    if (na) { na.classList.toggle('hidden', !p || G.kidDrive || G.racing || Math.hypot(p.x - player.x, p.y - player.y) < 90); na.querySelector('.naLabel').textContent = 'Ride there'; $('nextActWhy').textContent = p ? rideTime(p) : '';
      /* QAR11-03: Ride there is not an answer control (it records nothing): in family mode Enter or Space on it rides in, and at
         the box keysOnly() holds the delivery back for "Tap to deliver" */
      na.removeAttribute('data-answer'); }
    /* item 10: amber lamps for mistakes, never stars; shown only once one is lit */
    var s = '', full = Math.floor(st.stars), half = st.stars - full >= 0.5;
    for (var i = 0; i < 5; i++) s += '<i class="lamp' + (i < full ? ' on' : i === full && half ? ' half' : '') + '"></i>';
    $('stars').innerHTML = s;
    $('stars').classList.toggle('none', !!st.settings.calmCity || st.stars <= 0);
    $('stars').setAttribute('aria-label', 'Amber lights ' + st.stars + ' of 5');
    $('badges').textContent = 'Badges ' + FCV.badges(st) + (FCV.badges(st) >= FCV.BADGES_FOR_VIVA ? ' · the Hall is open' : ' · the Hall opens at ' + FCV.BADGES_FOR_VIVA);
    var bb = $('bagBtn'); if (bb) { bb.classList.toggle('hidden', !st.parcels.bag.length && !Object.keys(st.parcels.picked).length); $('bagCount').textContent = st.parcels.bag.length; bb.setAttribute('aria-label', 'Your bag: ' + st.parcels.bag.length + ' of 6 parcels. Tap to see them.'); bb.title = 'Your bag: ' + st.parcels.bag.length + ' of 6'; }
    var tb = $('btnTop'); if (tb) tb.setAttribute('aria-pressed', st.settings.topDown ? 'true' : 'false');
    if (window.Extras) { $('btnNotebook').classList.toggle('newDot', !!st.nbNew || Extras.isNew('notebook')); $('btnMenu').classList.toggle('newDot', Extras.isNew('films') || Extras.isNew('album') || Extras.isNew('passport')); }
    var cs = FCV.chainState(st);
    $('chain').innerHTML = FCV.data.script.spine.chain.map(function (c, i) { var l = cs.lit[c.link]; return '<button class="pip ' + (l || '') + '" type="button" data-l="' + c.link + '" title="' + (l ? 'Link ' + (i + 1) : 'Lights ' + c.lights_at) + '">' + (i + 1) + '</button>'; }).join('');
    if (window.Mastery) { var rd = Mastery.readiness(); var ring = $('ready'); if (ring) { ring.style.setProperty('--p', rd.score); ring.querySelector('b').textContent = rd.score; ring.title = 'Readiness ' + rd.score + ', ' + rd.band; ring.setAttribute('aria-label', 'Readiness ' + rd.score + ', ' + rd.band); } }
    if (window.Family) Family.hud();
    hudStatus();
  }
  G.hud = hud;
  /* item 42: "about N s ride" from the distance at the riding speed (240 units a second), to the nearest 5 s */
  function rideTime(p) { var d = Math.hypot(p.x - player.x, p.y - player.y), sec = Math.max(5, Math.round(d / 240 / 5) * 5); return sec >= 90 ? 'about ' + Math.round(sec / 60) + ' min ride' : 'about ' + sec + ' s ride'; }
  G.rideTime = rideTime;
  function ago(t) { if (!t) return 'never'; var s = Math.round((Date.now() - t) / 1000); return s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : Math.round(s / 3600) + ' h'; }
  G.ago = ago;
  function hudStatus(stat) {
    var st = G.state; if (!st) return;
    var s = stat || Save.status(), el = $('saveTick'), c = FCV.data.script.session_copy.save_tick;
    if (!el) return;
    var cls = s.pending ? 'saving' : !s.writer ? 'failed' : s.tick === 'failed' || s.kind === 'none' ? 'failed' : s.tick === 'saving' ? 'saving' : 'verified';
    el.className = 'saveTick ' + cls + (s.kind === 'device' && s.writer ? ' device' : '') + (s.writer || s.pending ? '' : ' notWriter');
    el.querySelector('span').textContent = s.pending ? 'Getting ready to save' : !s.writer ? 'Not saving: open in another tab' : G.kidDrive ? 'Co-pilot: not saving' : cls === 'failed' ? c.failed : cls === 'saving' ? c.saving : c.verified;
    el.setAttribute('aria-label', Chapter.statusText());
    el.title = Chapter.statusText();
  }
  var lastTick = ''; G.saveTimes = [];
  /* QAD4-10: and once a second while such a line is open, so its "1 s ago" keeps time */
  setInterval(function () { if (!G.state || !window.Chapter) return; var els = document.querySelectorAll('[data-status]'); if (!els.length) return; var t = Chapter.statusText(); Array.prototype.forEach.call(els, function (el) { if (el.textContent !== t) el.textContent = t; }); }, 1000);
  Save.onStatus(function (s) {
    if (!G.state) return;
    hudStatus(s);
    var ts = $('titleStatus'); if (ts && window.Chapter) ts.textContent = hasProgress(G.state) ? Chapter.statusText() : '';
    /* QAD4-10: a saving line already on screen (Menu, Save, Settings > Save) follows the same save event as the HUD tick */
    if (window.Chapter) Array.prototype.forEach.call(document.querySelectorAll('[data-status]'), function (el) { el.textContent = Chapter.statusText(); if (el.classList.contains('statusLine')) el.className = 'statusLine ' + s.kind; });
    if (s.tick === 'verified' && lastTick !== 'verified') { G.saveTimes.unshift(s.at || Date.now()); G.saveTimes = G.saveTimes.slice(0, 3); } 
    if (s.tick === 'verified' && lastTick !== 'verified') { var el = $('saveTick'); if (el && !SET().reduceMotion) { el.classList.remove('stampIt'); void el.offsetWidth; el.classList.add('stampIt'); } }
    if (s.tick === 'failed' && lastTick !== 'failed' && s.writer) UI.toast(FCV.data.script.session_copy.save_tick.failed, 4000);
    lastTick = s.tick;
  });

  /* ---------------- triggers ---------------- */
  var queuedFlow = null, quietUntil = 0;
  async function runFlow(fn) {
    if (G.kidDrive) { UI.toast(FCV.data.script.session_copy.family.dads_job, 1600); return; }
    if (flowRunning) { queuedFlow = fn; UI.toast('One moment.', 1200); return; }
    flowRunning = true; keys = {}; target = null; joy = null; ride = null; route = null; goal = null; $('joy').classList.add('hidden');
    if (window.Family) Family.dockSleep(true);
    try { await fn(); }
    catch (e) { if (!e || !e.leave) { console.error(e); UI.close(); UI.toast('Something went wrong in that scene. Your progress is saved.', 3500); } }
    flowRunning = false; if (window.Family) Family.dockSleep(false); G.refresh(); G.flush(); G.afterUI();
    /* no marker sheet opens in the 2 s after a flow or film ends (Act 1's side mission sits beside the opening) */
    quietUntil = Date.now() + 2000;
    if (queuedFlow) { var q = queuedFlow; queuedFlow = null; setTimeout(function () { runFlow(q); }, 0); return; }
    if (window.Session) Session.afterFlow();
    if (window.Album && Album.releaseHeld) Album.releaseHeld();
  }
  async function trigger(m) {
    lastTriggered = m.id; G.trigLog = (G.trigLog || []).concat([m.id]).slice(-12); /* which markers opened, newest last (read by the checks) */
    if (goal === m.id) { markers.forEach(function (o) { if (o.id !== m.id && Math.hypot(o.x - player.x, o.y - player.y) < 38 + player.r + 6) heldOff[o.id] = 1; }); goal = null; }
    var st = G.state;
    if (m.inert) { if (!m.quiet) UI.toast(m.label, 1400); return; }
    if (m.kind === 'main') return runFlow(function () { return Flows.actStep(m.act, m.step); });
    if (m.kind === 'side' || m.kind === 'corner') {
      return runFlow(async function () {
        var v = await UI.modal(m.label, '<p>Optional. ' + (m.kind === 'side' ? 'More questions from this chapter, then define its terms.' : 'Examiner questions from this chapter: answer aloud, then reveal.') + (m.done ? ' Done once; play again for practice.' : '') + '</p>',
          [{ label: m.done ? 'Play again' : 'Start', value: 1, cls: 'go' }, { label: 'Not now', value: 0, safe: true }], { focusSafe: true });
        if (v) await (m.kind === 'side' ? Flows.side(m.act) : Flows.corner(m.act));
      });
    }
    if (m.kind === 'drop' && st.parcels.bag.length && keysOnly() && deliversHere(m)) { showTapDeliver(m); return; }
    if (m.kind === 'drop') { if (st.parcels.bag.length) return runFlow(function () { return Flows.deliverAt({ kind: 'act', act: m.act, label: 'Act ' + m.act }); }); UI.toast('Drop box for Act ' + m.act + '. Your bag\'s empty. Pick up parcels round the city, then drop the Act ' + m.act + ' ones here.', 3600); return; }
    /* QAR12-02: an Evidence Locker door does what a drop box does: ridden to by keys alone in family mode with its parcel in
       the bag, the bike stands at the door with "Tap to deliver" and the room does not open; a tap on the prompt or the door
       delivers and opens the room once */
    if (m.kind === 'room' && st.parcels.bag.length && keysOnly() && deliversHere(m)) { showTapDeliver(m); return; }
    if (m.kind === 'room') {
      return runFlow(async function () {
        if (st.parcels.bag.length && keysOnly() && deliversHere(m)) UI.toast('Family mode: tap the door to deliver your parcel.', 2600);
        else if (st.parcels.bag.length) await Flows.deliverAt({ kind: 'room', room: m.room, label: FCV.room(m.room).name });
        await Flows.room(m.room);
      });
    }
    if (m.kind === 'kiosk') return runFlow(function () { return Flows.kiosk(); });
    if (m.kind === 'methods') return runFlow(function () { return Academy.open(); });
    if (m.kind === 'waiting') return runFlow(function () { return Missions.waitingRoom(); });
    if (m.kind === 'viva') {
      if (m.locked) return runFlow(function () { return Flows.vivaLocked(); });
      return runFlow(function () { return Flows.vivaDoor(); });
    }
  }
  function cellKey(c) { return c ? c.kind + (c.act || '') + c.x : 'road'; }
  function checkTriggers(dt) {
    var st = G.state;
    if (lastTriggered) {
      var lm = null; for (var i = 0; i < markers.length; i++) if (markers[i].id === lastTriggered) lm = markers[i];
      if (!lm || Math.hypot(lm.x - player.x, lm.y - player.y) > 74) lastTriggered = null;
    }
    var best = null, bd = 1e9;
    for (var j = 0; j < markers.length; j++) {
      var m = markers[j], d = Math.hypot(m.x - player.x, m.y - player.y);
      if (d < bd) { bd = d; best = m; }
      /* QAR10-02: the hold-offs keep a marker from opening when the bike rides over it unasked; a marker tapped or ridden
         to on purpose (the goal) always opens on arrival */
      if (m.id === lastTriggered && m.id !== goal) continue;
      if (heldOff[m.id] && m.id !== goal) { if (d > 74) delete heldOff[m.id]; continue; }
      if (goal && m.id !== goal) continue;
      if (d < 38 + player.r && Date.now() < quietUntil) continue;
      if (d < 38 + player.r) {
        if (DWELL[m.kind]) { dwell[m.id] = (dwell[m.id] || 0) + dt; if (dwell[m.id] < 1) continue; }
        dwell = {}; trigger(m); return;
      } else if (dwell[m.id]) delete dwell[m.id];
    }
    nearestId = best ? best.id : null;
    for (var k = 0; k < parcels.length && !ride; k++) {
      var pc = parcels[k];
      if (Math.hypot(pc.x - player.x, pc.y - player.y) < 30 + player.r) {
        if (st.parcels.bag.length >= 6) { if (!pc.warned) { pc.warned = true; UI.toast('Your bag is full: six parcels. Deliver some first.', 2400); } continue; }
        parcels.splice(k, 1); runFlow(function () { return Flows.pickup(pc.id); }); return;
      }
    }
    var c = FCV.cellAt(city, player.x, player.y), key = cellKey(c);
    if (key !== lastCellKey) {
      lastCellKey = key;
      if (window.Sound && c) Sound.districtMusic(c);
      if (G.kidDrive || G.racing) return;
      if (c && c.kind === 'act') {
        var a = FCV.data.script.acts[c.act - 1];
        if (!FCV.actOpen(st, c.act)) UI.toast(a.district.name + ' opens after Act ' + (c.act - 1) + '.', 2600);
        else if (!FCV.isDone(st, c.act, 'opening')) { UI.toast(a.district.name + '. Your film starts at the gate.', 2600); }
        else UI.toast('Act ' + c.act + ': ' + a.district.name + (parcelCount(c.act) ? ' · parcels delivered: ' + parcelCount(c.act).replace('/', ' of ') : ''), 2200);
      } else if (c && c.kind === 'locker') {
        if (!st.cuts.locker_entry) { runFlow(function () { return Flows.lockerEntry(); }); return; }
        UI.toast('The Evidence Locker. One room for each part of the appendices.', 2200);
      } else if (c && c.kind === 'viva') UI.toast(FCV.vivaOpen(st) ? 'The Viva Hall. The doors are open.' : 'The Viva Hall. Locked for now.', 2200);
      else if (c && c.kind === 'park') UI.toast('Freight Park', 1600);
      else if (c && c.kind === 'harbour') UI.toast("The Harbour. Digits' kiosk is here.", 2000);
    }
  }
  function parcelCount(n) {
    var st = G.state, ids = []; FCV.data.script.acts.forEach(function (a) { ids = ids.concat(a.parcels.ids || []); });
    ids = ids.filter(function (id) { var h = FCV.parcelHome(id); return h && h.act === n; });
    return ids.length ? ids.filter(function (id) { return st.parcels.delivered[id]; }).length + '/' + ids.length : '';
  }

  /* ---------------- the living city: lane traffic, people, the Animal, Kerb Inspectors ---------------- */
  function initAmbient() {
    var rng = FCV.rng(42), Rr = city.R, CW = city.CW, CH = city.CH;
    cars = [];
    var colours = ['#ff8a3d', '#19c2b0', '#ffd166', '#ff3d8b', '#f4f4f4', '#7a5cff', '#3a3a48'];
    for (var i = 0; i < 26; i++) {
      var horiz = i % 2 === 0, lane = rng() < 0.5 ? -1 : 1, sp = 120 + rng() * 90;
      if (horiz) { var k = Math.floor(rng() * 4); cars.push({ x: rng() * city.W, y: k * (CH + Rr) + Rr / 2 + lane * 34, dx: lane, dy: 0, sp: sp, v: sp, c: colours[i % colours.length], van: rng() < 0.5, kind: rng() < 0.15 ? 'tram' : 'van' }); }
      else { var kk = Math.floor(rng() * 5); cars.push({ x: kk * (CW + Rr) + Rr / 2 + lane * 34, y: rng() * city.H, dx: 0, dy: -lane, sp: sp, v: sp, c: colours[(i + 3) % colours.length], van: rng() < 0.5, kind: 'van' }); }
    }
    peds = [];
    city.cells.forEach(function (c) {
      for (var p = 0; p < (c.kind === 'park' ? 7 : 4); p++) {
        var x = c.x + 30 + rng() * (c.w - 60), y = c.y + 30 + rng() * (c.h - 60);
        if (!FCV.collide(solids, x, y, 10)) peds.push({ x: x, y: y, a: rng() * 6.28, t: rng() * 3, c: colours[Math.floor(rng() * colours.length)] });
      }
    });
    var c1 = city.cells.filter(function (c) { return c.act === 1; })[0];
    animal = { x: c1.x + c1.w / 2, y: c1.y + c1.h + city.R / 2, face: 0, size: 'big', dx: 1 };
  }
  function animalState() {
    var st = G.state;
    if (FCV.isDone(st, 6, 'scene:6.3')) return 'guarding';
    if (FCV.isDone(st, 4, 'tp')) return 'small';
    return 'big';
  }
  var bumpAt = 0;
  function updateAmbient(dt) {
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i];
      /* Driver model: brake for the courier within 70 units ahead, and for the car in front; never hit anyone. */
      var ax = c.x + c.dx * 70, ay = c.y + c.dy * 70, block = Math.hypot(ax - player.x, ay - player.y) < 52;
      /* a courier parked in the road is passed after a moment, never a gridlock */
      if (block && !player.moving) { c.wait = (c.wait || 0) + dt; if (c.wait > 1.5) { block = false; c.passing = 1.2; } } else if (!block) c.wait = 0;
      if (c.passing > 0) { c.passing -= dt; block = false; }
      if (!block) for (var j = 0; j < cars.length; j++) { var o = cars[j]; if (o !== c && o.dx === c.dx && o.dy === c.dy && Math.abs((o.x - c.x) * c.dy) + Math.abs((o.y - c.y) * c.dx) < 10) { var ahead = (o.x - c.x) * c.dx + (o.y - c.y) * c.dy; if (ahead > 0 && ahead < 80) { block = true; break; } } }
      c.v += ((block ? 0 : c.sp) - c.v) * Math.min(1, (block ? 9 : 1.5) * dt);
      c.x += c.dx * c.v * dt; c.y += c.dy * c.v * dt;
      if (c.x < -60) c.x = city.W + 50; if (c.x > city.W + 60) c.x = -50; if (c.y < -60) c.y = city.H + 50; if (c.y > city.H + 60) c.y = -50;
      if (!(c.passing > 0) && Math.hypot(c.x - player.x, c.y - player.y) < 30 && t0 - bumpAt > 900) { bumpAt = t0; var d = Math.hypot(player.x - c.x, player.y - c.y) || 1; player.vx += (player.x - c.x) / d * 160; player.vy += (player.y - c.y) / d * 160; if (window.Sound) Sound.sfx('spring boing'); }
    }
    for (var p = 0; p < peds.length; p++) {
      var pd = peds[p];
      pd.t -= dt; if (pd.t < 0) { pd.a += (Math.random() - 0.5) * 2.4; pd.t = 1 + Math.random() * 3; }
      var nx = FCV.move(city, solids, pd.x, pd.y, Math.cos(pd.a) * 40 * dt, Math.sin(pd.a) * 40 * dt, 9);
      if (nx[0] === pd.x && nx[1] === pd.y) pd.a += Math.PI / 2;
      pd.x = nx[0]; pd.y = nx[1];
    }
    if (animal) {
      animal.size = animalState();
      var c1 = city.cells.filter(function (c) { return c.act === (animal.size === 'guarding' ? 6 : 1); })[0];
      var speed = animal.size === 'big' ? 0 : 70;
      if (speed) { animal.x += animal.dx * speed * dt; if (animal.x > c1.x + c1.w - 40 || animal.x < c1.x + 40) animal.dx *= -1; animal.face = animal.dx > 0 ? 0 : Math.PI; }
      animal.y = c1.y + c1.h + city.R / 2 - 34;
      if (animal.size === 'big') animal.x = c1.x + c1.w / 2;
    }
  }
  function updateInspectors(dt, now) {
    var st = G.state;
    if (player.moving) { rideTimer += dt; if (rideTimer >= 60 && st.stars > 0) { rideTimer = 0; G.stars(-1, true); UI.toast('A minute of clean riding. One amber light off.', 2000); } }
    if (st.settings.calmCity || G.kidDrive) { insp = []; return; }
    if (now < graceUntil) return;
    var want = Math.max(0, Math.floor(st.stars) - 2);
    while (insp.length > want) insp.pop();
    if (insp.length < want) {
      for (var tries = 0; tries < 20; tries++) {
        var ang = Math.random() * 6.28, d = 650 + Math.random() * 200, x = player.x + Math.cos(ang) * d, y = player.y + Math.sin(ang) * d;
        if (x > 20 && y > 20 && x < city.W - 20 && y < city.H - 20 && !FCV.collide(solids, x, y, 18)) { insp.push({ x: x, y: y, a: 0, side: 0, sideT: 0 }); if (window.Sound) Sound.sfx('inspector chime'); break; }
      }
    }
    var far = true;
    for (var i = 0; i < insp.length; i++) {
      var p = insp[i], dx = player.x - p.x, dy = player.y - p.y, dist = Math.hypot(dx, dy) || 1;
      if (dist < 900) far = false;
      var sp = 270 * dt, ux = dx / dist, uy = dy / dist;
      if (p.sideT > 0) { p.sideT -= dt; var t = ux; ux = -uy * p.side; uy = t * p.side; }
      var n = FCV.move(city, solids, p.x, p.y, ux * sp, uy * sp, 16);
      if (Math.abs(n[0] - p.x) + Math.abs(n[1] - p.y) < sp * 0.3 && p.sideT <= 0) { p.side = Math.random() < 0.5 ? -1 : 1; p.sideT = 0.7; }
      p.x = n[0]; p.y = n[1]; p.a = Math.atan2(uy, ux);
      if (dist < 34) { insp = []; lostTimer = 0; runFlow(function () { return Flows.spotCheck(); }); return; }
    }
    if (insp.length) { lostTimer = far ? lostTimer + dt : 0; if (lostTimer > 12) { lostTimer = 0; G.stars(-1, true); UI.toast('You rode on. One amber light off.', 2400); G.save(); } }
  }

  /* ---------------- the cargo bike ---------------- */
  function updatePlayer(dt) {
    var ix = 0, iy = 0, run = keys.shift, mult = 1;
    if (keys.left) ix -= 1; if (keys.right) ix += 1; if (keys.up) iy -= 1; if (keys.down) iy += 1;
    var gm = goalMarker(), gd = gm ? Math.hypot(gm.x - player.x, gm.y - player.y) : 1e9;
    if (ix || iy) { target = null; goal = null; lastDrive = 'key'; if (ride) { ride = null; route = null; } }
    /* QAR9-02: the joystick's push sets the speed directly (it was a share of the walking speed, and a push under
       about 85% never got the bike past the standing threshold at 120 frames a second) */
    else if (joy && Math.hypot(joy.vx, joy.vy) > 0.01) { ix = joy.vx; iy = joy.vy; run = true; target = null; ride = null; goal = null; }
    else if (gm && gd < REACH) { ride = null; route = null; target = null; player.vx = 0; player.vy = 0; } /* QAR9-01: there: stand still within reach */
    else if (ride) {
      var pt = ride.pts[ride.i], ddx = pt.x - player.x, ddy = pt.y - player.y, dd = Math.hypot(ddx, ddy);
      if (dd < 24) { ride.i++; if (ride.i >= ride.pts.length) { ride = null; route = null; if (gm) target = { x: gm.x, y: gm.y }; else { player.vx *= 0.2; player.vy *= 0.2; } } }
      else { ix = ddx / dd; iy = ddy / dd; mult = 1.6; }
    }
    else if (target) {
      var dx = target.x - player.x, dy = target.y - player.y, d = Math.hypot(dx, dy);
      if (d < 10) { target = null; player.vx *= 0.2; player.vy *= 0.2; } else { ix = dx / d; iy = dy / d; run = d > 260; }
    }
    var len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }
    /* QAR9-01: let go of the keys beside a drop box that takes a parcel in the bag, and the bike stops there (it used to
       coast 90 units on, out of reach, so riding in by hand never delivered) */
    if (len < 0.05 && !ride && !target && player.speed > 0 && catchBox()) { player.vx = 0; player.vy = 0; }
    var top = (run ? 390 : 240) * mult * (G.boost && t0 < G.boost ? 1.5 : 1), acc = len > 0.05 ? 7 : 2.6;
    player.vx += (ix * top - player.vx) * Math.min(1, acc * dt);
    player.vy += (iy * top - player.vy) * Math.min(1, acc * dt);
    var speed = Math.hypot(player.vx, player.vy);
    /* QAR9-02: while pushing, any speed moves the bike (zeroing it below 12 each frame stalled a gentle push) */
    player.moving = speed > 12 || (len > 0.05 && speed > 0.5); player.speed = speed;
    if (player.moving) {
      var n = FCV.move(city, solids, player.x, player.y, player.vx * dt, player.vy * dt, player.r);
      if (n[0] === player.x) player.vx *= 0.3; if (n[1] === player.y) player.vy *= 0.3;
      if (target && Math.abs(n[0] - player.x) + Math.abs(n[1] - player.y) < speed * dt * 0.1) { target.stuck = (target.stuck || 0) + dt; if (target.stuck > 0.4) { target = null; if (gm && gd < 38 + player.r - 4) { player.vx = 0; player.vy = 0; } else goal = null; } }
      if (ride && Math.abs(n[0] - player.x) + Math.abs(n[1] - player.y) < speed * dt * 0.05) { ride.stuck = (ride.stuck || 0) + dt; if (ride.stuck > 0.6) { ride.i++; ride.stuck = 0; if (ride.i >= ride.pts.length) { ride = null; route = null; } } }
      var nf = Math.atan2(player.vy, player.vx), df = Math.atan2(Math.sin(nf - player.face), Math.cos(nf - player.face));
      player.lean += (Math.max(-0.35, Math.min(0.35, df * 3)) - player.lean) * Math.min(1, 8 * dt);
      player.x = n[0]; player.y = n[1]; player.face = nf; player.walk += dt * speed / 26;
    } else { player.vx = 0; player.vy = 0; player.lean *= 0.9; }
  }

  /* ---------------- renderer ---------------- */
  function tierFor(g) {
    if (g && g !== 'auto') return g;
    var phone = Math.min(window.innerWidth, window.innerHeight) < 600 || /iPhone|Android/.test(navigator.userAgent);
    return phone ? 'low' : 'high';
  }
  G.tierFor = tierFor;
  async function pickRenderer() {
    var s = SET(), tier = tierFor(s.graphics), want3d = tier !== 'simple' && !G.safeMode;
    if (want3d && window.Render3DReady) {
      try {
        var r3 = await Promise.race([window.Render3DReady, new Promise(function (res) { setTimeout(function () { res(null); }, 6000); })]);
        if (r3) { await r3.init(cv, city, { tier: tier }); return r3; }
      } catch (e) { console.warn('3D city unavailable, using 2D', e && e.message); }
    }
    await Render2D.init(cv, city); return Render2D;
  }
  G.switchRenderer = async function (to2d) {
    try { if (R && R.dispose) R.dispose(); } catch (e) {}
    var fresh = cv.cloneNode(false); cv.parentNode.replaceChild(fresh, cv); cv = fresh; bindCanvas();
    if (to2d) { await Render2D.init(cv, city); R = Render2D; } else R = await pickRenderer();
    G.renderer = R; if (R.snapCam) R.snapCam(player.x, player.y);
  };
  G.autoSimple = function () { if (R === Render2D) return; G.switchRenderer(true); UI.toast('Simple graphics on. Your progress is safe.', 4000); };
  G.contextLost = function (count) {
    if (count >= 2) { G.switchRenderer(true); UI.toast('Simple graphics on. Your progress is safe.', 4000); }
    else G.switchRenderer(false);
  };
  function snapshot(alpha) {
    var ix = player.px + (player.x - player.px) * alpha, iy = player.py + (player.y - player.py) * alpha;
    var cell = FCV.cellAt(city, ix, iy);
    return {
      t: t0, alpha: alpha, player: { x: ix, y: iy, face: player.face, speed: player.speed || 0, walk: player.walk, moving: player.moving, lean: player.lean, docket: window.Family ? Family.docketShown() : false },
      cars: cars, peds: peds, inspectors: insp, markers: markers, parcels: parcels, target: target, route: route, animal: animal, nearest: nearestId,
      objective: objectivePoint(), parcelCount: parcelCount, dwell: dwell, family: fam(), reduceMotion: !!SET().reduceMotion,
      cell: cell, flags: worldFlags(), world: G.testWorld ? Object.assign(worldTime(cell), G.testWorld) : worldTime(cell), state: G.state
    };
  }
  /* Story states only: each flag is first shown by the cutscene named in WORLD_FLAGS. */
  G.WORLD_FLAGS = { fogLifted: 'act_closers_v3', animalSize: 'turning_points_v3', lockerGrey: 'sold', kioskQueue: 'act_openings_v3', domeLinks: 'link_explainers', roomSecured: 'locker_room_first_visit' };
  function worldFlags() {
    var st = G.state, cs = FCV.chainState(st), rooms = {};
    Object.keys(st.rooms).forEach(function (r) { if (st.rooms[r].badge) rooms[r] = 1; });
    var links = 0; ['link-1', 'link-2', 'link-3', 'link-4'].forEach(function (l) { if (cs.lit[l]) links++; });
    var done = {}; for (var n = 1; n <= 7; n++) done[n] = FCV.actDone(st, n);
    return { fogLifted: done[1], animalSize: animalState(), lockerGrey: FCV.isDone(st, 6, 'tp'), kioskQueue: FCV.isDone(st, 6, 'opening'), domeLinks: links, domeHollow: !!cs.lit['link-5'], roomSecured: rooms, actsDone: done, vivaOpen: FCV.vivaOpen(st) };
  }
  function worldTime(cell) {
    var acts = FCV.data.script.acts, a = cell && cell.act ? acts[cell.act - 1] : null;
    var w = a && a.world || {}, t = w.story_time || (cell && cell.kind === 'viva' ? '21:30' : '12:00');
    var hm = t.split(':'), tt = +hm[0] + (+hm[1] || 0) / 60;
    if (fam() && tt > 19.5) tt = 19.5; /* family mode keeps the city at golden hour, never night-dark */
    return { time: tt, weather: w.weather || 'clear', music: w.music || null, act: a ? a.act : 0 };
  }

  /* ---------------- minimap ---------------- */
  function actColour(n, hex) { return FCV.actDone(G.state, n) ? hex : '#6b6276'; }
  function buildMinimapStatic(wd, ht) {
    var off = document.createElement('canvas'); off.width = wd; off.height = ht;
    var c = off.getContext('2d'), sx = wd / city.W, sy = ht / city.H;
    c.fillStyle = '#2b2538'; c.fillRect(0, 0, wd, ht);
    city.cells.forEach(function (cell) {
      c.fillStyle = cell.kind === 'act' ? actColour(cell.act, cell.colour) : cell.kind === 'park' ? '#3f9a58' : cell.kind === 'harbour' ? '#7d8794' : cell.kind === 'locker' ? '#5a4775' : '#4a3366';
      c.globalAlpha = 0.75; c.fillRect(cell.x * sx, cell.y * sy, cell.w * sx, cell.h * sy); c.globalAlpha = 1;
    });
    city.water.forEach(function (w) { c.fillStyle = '#1f7fb8'; c.fillRect(w.x * sx, w.y * sy, w.w * sx, w.h * sy); });
    c.fillStyle = 'rgba(21,16,31,.75)'; city.buildings.forEach(function (b) { c.fillRect(b.x * sx, b.y * sy, b.w * sx, b.h * sy); });
    return off;
  }
  var mmKey = '';
  function mColour(m) { return m.kind === 'main' ? '#ffd166' : m.kind === 'side' ? '#19c2b0' : m.kind === 'corner' ? '#b48cff' : m.kind === 'room' ? (m.done ? '#3ddc84' : '#ff5fa2') : m.kind === 'viva' ? (m.locked ? '#7a6a88' : '#ff3d5c') : m.kind === 'kiosk' ? '#25c2b0' : m.kind === 'methods' ? '#9be15d' : '#8a7f99'; }
  function drawMinimap() {
    var k = [1, 2, 3, 4, 5, 6, 7].map(function (n) { return FCV.actDone(G.state, n) ? 1 : 0; }).join('');
    if (!mmStatic || k !== mmKey) { mmStatic = buildMinimapStatic(mm.width, mm.height); mmKey = k; }
    var c = mx, sx = mm.width / city.W, sy = mm.height / city.H, blink = SET().reduceMotion ? 1 : Math.floor(t0 / 500) % 2;
    c.drawImage(mmStatic, 0, 0);
    parcels.forEach(function (p) { c.fillStyle = p.hot ? '#ff6a3d' : '#c9a46a'; c.fillRect(p.x * sx - 2, p.y * sy - 2, 4, 4); });
    if (route) { c.strokeStyle = '#19c2b0'; c.lineWidth = 3; c.beginPath(); c.moveTo(route[0].x * sx, route[0].y * sy); route.forEach(function (p) { c.lineTo(p.x * sx, p.y * sy); }); c.stroke(); }
    var op = objectivePoint(), ph = SET().reduceMotion ? 0.5 : (t0 % 1400) / 1400;
    markers.forEach(function (m) {
      if (m.kind === 'drop') {
        /* a box pin in the district colour */
        var dc = FCV.data.script.acts[m.act - 1] ? ['#ff8a3d', '#2bb3a6', '#7a5cff', '#e2456f', '#ffb000', '#e6332a', '#16a0d8'][m.act - 1] : '#c9a46a';
        c.fillStyle = '#c9a46a'; c.strokeStyle = dc; c.lineWidth = 3; c.fillRect(m.x * sx - 6, m.y * sy - 6, 12, 12); c.strokeRect(m.x * sx - 6, m.y * sy - 6, 12, 12);
        if (m !== op) return;
      }
      var r = m.kind === 'main' || m.obj ? (blink ? 11 : 9) : 5;
      if (m.kind !== 'drop') { c.fillStyle = mColour(m); c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.arc(m.x * sx, m.y * sy, r, 0, 6.29); c.fill(); c.stroke(); }
      if (m === op) { c.strokeStyle = 'rgba(255,209,102,' + (1 - ph).toFixed(2) + ')'; c.lineWidth = 4; c.beginPath(); c.arc(m.x * sx, m.y * sy, 10 + ph * 18, 0, 6.29); c.stroke(); }
    });
    insp.forEach(function (p) { c.fillStyle = blink ? '#ffb000' : '#7a5a10'; c.beginPath(); c.arc(p.x * sx, p.y * sy, 6, 0, 6.29); c.fill(); });
    c.save(); c.translate(player.x * sx, player.y * sy); c.rotate(player.face);
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.moveTo(12, 0); c.lineTo(-8, -8); c.lineTo(-4, 0); c.lineTo(-8, 8); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
  /* The canvas is aria-hidden; a DOM "Nearby" list of the five nearest markers is a polite live region. */
  var nearbyKey = '';
  function nearby() {
    var list = markers.map(function (m) { return { m: m, d: Math.hypot(m.x - player.x, m.y - player.y) }; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 5);
    var key = list.map(function (x) { return x.m.id; }).join('|') + ':' + (G.state.parcels.bag || []).join(',');
    if (key === nearbyKey) return; nearbyKey = key;
    $('nearby').innerHTML = '<h2 class="sr">Nearby</h2>' + list.map(function (x) { return '<button type="button" data-id="' + UI.esc(x.m.id) + '">' + UI.esc(x.m.label || x.m.kind) + ', ' + Math.round(x.d / 10) + ' m. Ride there</button>'; }).join('');
  }

  /* ---------------- Freight FM ticker: only cards he has met, flagged first ---------------- */
  function ticker(now) {
    var st = G.state; if (!st.settings.ticker || now < tickerAt || G.kidDrive) return;
    tickerAt = now + 120000;
    var flagged = Object.keys(st.mem).filter(function (id) { return st.mem[id].box <= 2 && /^recall:|^ch\d-\d\d$|^app-[A-O]-f/.test(id); }).map(function (id) { return id.replace('recall:', ''); });
    var met = Object.keys(st.met).filter(function (id) { var r = FCV.resolve(id); return r && r.type === 'card' && r.figure; });
    var pool = flagged.filter(function (id) { return st.met[id]; }); if (!pool.length) pool = met;
    if (!pool.length) return;
    var r = FCV.resolve(FCV.pick(pool)); if (!r) return;
    var t = $('ticker'); t.innerHTML = '<b>FREIGHT FM</b> ' + UI.esc(r.figure) + ': ' + UI.esc(FCV.firstSentence(r.text)) + ' <span class="loc">' + UI.esc(r.loc || '') + '</span>';
    t.setAttribute('data-id', r.id || ''); t.title = 'Tap to open the card';
    st.onAir = (st.onAir || []).filter(function (x) { return x !== r.id; }); st.onAir.unshift(r.id); st.onAir = st.onAir.slice(0, 10);
    t.classList.remove('hidden'); setTimeout(function () { t.classList.add('hidden'); }, 14000);
  }

  /* ---------------- loop: fixed 120 Hz simulation, render every frame (30 fps behind sheets) ---------------- */
  var last = 0, acc = 0, lastRender = 0, frames = [];
  G.frameTimes = function () { return frames.slice(); };
  function loop(ts) {
    var real = Math.min(0.1, (ts - last) / 1000 || 0); last = ts; t0 = ts;
    if (G.state && city && !document.hidden) {
      /* D2-m1: nothing in the city can start while the game is still booting (the title is not up yet): a courier saved
         standing on a step's marker used to start that step behind the title, and Continue then waited behind it */
      var paused = booting || flowRunning || UI.busy() || tabCovered();
      if (!paused) {
        acc += real; var n = 0;
        while (acc >= STEP && n < 24) { player.px = player.x; player.py = player.y; updatePlayer(STEP); updateAmbient(STEP); updateInspectors(STEP, ts); n++; acc -= STEP; }
        checkTriggers(real); ticker(ts);
        saveTimer += real; if (saveTimer > 20) { saveTimer = 0; G.save(); }
        snapTimer += real; if (snapTimer > 900) { snapTimer = 0; G.snapshot('Every 15 minutes'); }
        if (Math.floor(ts / 500) !== Math.floor((ts - real * 1000) / 500)) { hud(); nearby(); }
        /* SD-06: the three nearest parcels follow the courier round the city */
        if (Math.floor(ts / 2000) !== Math.floor((ts - real * 1000) / 2000)) buildParcels();
        if (player.moving) activeAcc += real;
        if (window.Kit && !G.kidDrive) Kit.bike(player.speed || 0);
      } else acc = 0;
      playedAcc += real; if (playedAcc >= 1) { if (!G.kidDrive) G.state.played += Math.floor(playedAcc); playedAcc -= Math.floor(playedAcc); }
      var behind = paused && !$('cut').classList.contains('hidden') ? 1000 / 30 : paused ? 1000 / 30 : 0;
      if (!behind || ts - lastRender >= behind - 1) {
        var t1 = performance.now();
        try { var snap = snapshot(paused ? 1 : acc / STEP); snap.paused = paused; R.frame(snap); } catch (e) { console.error(e); if (R !== Render2D) { G.switchRenderer(true); } }
        frames.push(performance.now() - t1); if (frames.length > 600) frames.shift();
        lastRender = ts;
        if (!paused) drawMinimap();
        if (window.Extras) Extras.frame(paused, player);
        if (tapDeliver) placeTapDeliver();
      }
    }
    requestAnimationFrame(loop);
  }

  /* ---------------- input ---------------- */
  var KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Shift') keys.shift = true;
    if (window.Family && Family.key(e)) return;
    if (G.kidDrive && e.key === 'Escape' && window.Family) { e.preventDefault(); Family.giveBack(); return; }
    if (UI.busy() || flowRunning || tabCovered()) { if (tabCovered()) { keys.left = keys.right = keys.up = keys.down = false; } return; }
    if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    var letter = !fam() || e.shiftKey; /* in family mode C, N and M need Shift */
    if (KEYMAP[e.key] && !(fam() && e.shiftKey && /^[a-zA-Z]$/.test(e.key))) { keys[KEYMAP[e.key]] = true; e.preventDefault(); }
    /* QAR11-03: Space presses the button the keyboard focus is on (Ride there, a Nearby entry, a HUD button), as a browser
       does; anywhere else in the city it rings the bell */
    else if (e.key === ' ') { var fb = document.activeElement; if (!(fb && fb.tagName === 'BUTTON' && fb.matches && fb.matches(':focus-visible'))) { e.preventDefault(); if (window.SFX) SFX.bell(); } }
    else if (G.kidDrive && /^[nNmMcC]$/.test(e.key)) UI.toast(FCV.data.script.session_copy.family.dads_job, 1400);
    else if ((e.key === 'n' || e.key === 'N') && letter) Notebook.open();
    else if ((e.key === 'm' || e.key === 'M' || e.key === 'c' || e.key === 'C') && letter) WorldMap.open();
    else if ((e.key === 'f' || e.key === 'F') && window.Sound) Sound.radio();
    else if ((e.key === 't' || e.key === 'T') && letter) G.toggleTopDown();
    else if (e.key === 'Escape') Chapter.menu();
  });
  document.addEventListener('keyup', function (e) { if (e.key === 'Shift') keys.shift = false; if (KEYMAP[e.key]) keys[KEYMAP[e.key]] = false; });
  window.addEventListener('blur', function () { keys = {}; });
  function bindCanvas() {
    cv.setAttribute('aria-hidden', 'true');
    cv.addEventListener('pointerdown', function (e) {
      if (UI.busy() || flowRunning) return;
      if (window.SFX) SFX.unlock();
      pointer = { id: e.pointerId, sx: e.clientX, sy: e.clientY, joy: false, t0: performance.now(), mouse: e.pointerType === 'mouse', dx: 0, dy: 0 };
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      /* QAR10-03: a finger held still past 250 ms after a small push (over 7 px) becomes the joystick then */
      var me = pointer; if (!me.mouse) setTimeout(function () { if (pointer === me && !me.joy && Math.hypot(me.dx, me.dy) > 7) startJoy(me); }, 260);
    });
    function startJoy(pt) {
      pt.joy = true; target = null; ride = null; goal = null; joy = { vx: 0, vy: 0 }; lastDrive = 'touch';
      var j = $('joy'); j.style.left = pt.sx + 'px'; j.style.top = pt.sy + 'px'; j.classList.remove('hidden'); steer(pt);
    }
    function steer(pt) { var dx = pt.dx, dy = pt.dy, d = Math.hypot(dx, dy), lim = 56, dz = 5, k = Math.min(1, d / lim), sp = d > dz ? 0.15 + 0.85 * Math.min(1, (d - dz) / (lim - dz)) : 0; joy.vx = d ? dx / d * sp : 0; joy.vy = d ? dy / d * sp : 0; $('joyKnob').style.transform = 'translate(' + (d ? dx / d * k * lim : 0) + 'px,' + (d ? dy / d * k * lim : 0) + 'px)'; }
    cv.addEventListener('pointermove', function (e) {
      if (!pointer || pointer.id !== e.pointerId) return;
      var dx = e.clientX - pointer.sx, dy = e.clientY - pointer.sy, d = Math.hypot(dx, dy); pointer.dx = dx; pointer.dy = dy;
      /* QAR9-02 and QAR10-03: a finger becomes the joystick past 15 px, or past 7 px once it has been down 250 ms (a quick
         tap that rolls a little stays a tap); a mouse after 16 px. Then the speed rises smoothly with the push: nothing
         inside a 5 px dead zone, a gentle roll at once beyond it, full speed at 56 px */
      if (!pointer.joy && (pointer.mouse ? d > 16 && e.buttons : d > 15 || (d > 7 && performance.now() - pointer.t0 > 250))) startJoy(pointer);
      if (pointer.joy) steer(pointer);
    });
    var endPointer = function (e) {
      if (!pointer || pointer.id !== e.pointerId) return;
      if (!pointer.joy && !UI.busy() && !flowRunning && R) {
        /* QAR10-03: a tap counts where the finger landed (a quick tap may roll a few px before it lifts) */
        var tx = pointer.sx, ty = pointer.sy, tw = R.toWorld(tx, ty);
        /* QAR10-01: a tap on any drawn part of a marker (its floating icon, name label, portrait, pin, post box or ground
           ring) picks THAT marker, the one drawn in front where two overlap; it rides there, stands within reach and opens.
           Only a tap on the bike itself, with no marker part under the finger, opens the Passport. */
        var hit = R.pick ? R.pick(tx, ty) : null, tm = hit ? markers.filter(function (x) { return x.id === hit.id && !x.inert; })[0] : (R.pick ? null : markerAt(tw.x, tw.y, 60));
        if (!tm && Math.hypot(tw.x - player.x, tw.y - player.y) < player.r * 2.2 && window.Album && !G.kidDrive) { pointer = null; Album.passport(); return; }
        target = tm ? { x: tm.x, y: tm.y } : tw; ride = null; goal = tm ? tm.id : null; lastDrive = 'touch';
      }
      /* QAR9-02: the bike stops when the finger lifts off the joystick */
      if (pointer.joy) { player.vx = 0; player.vy = 0; }
      pointer = null; joy = null; $('joy').classList.add('hidden'); $('joyKnob').style.transform = '';
    };
    cv.addEventListener('pointerup', endPointer);
    cv.addEventListener('pointercancel', endPointer);
  }
  bindCanvas();
  mm.addEventListener('click', function () { if (!UI.busy() && !flowRunning && !G.kidDrive) WorldMap.open(); });
  $('btnNotebook').addEventListener('click', function () { if (!flowRunning) Notebook.open(); });
  $('btnMenu').addEventListener('click', function () { if (!flowRunning) Chapter.menu(); });
  $('btnChapter').addEventListener('click', function () { if (!flowRunning) WorldMap.open(); });
  $('saveTick').addEventListener('click', function () { if (!flowRunning && window.Extras) Extras.saveChip(); });
  $('bagBtn').addEventListener('click', function () { if (!flowRunning && window.Bag) Bag.open(); });
  $('nextAct').addEventListener('click', function (e) { var p = objectivePoint(); if (p && !flowRunning) { lastDrive = UI.keyClick && UI.keyClick(e) ? 'key' : 'touch'; G.rideTo(p); } });
  $('btnTop').addEventListener('click', function () { G.toggleTopDown(); });
  $('stars').addEventListener('click', function () { if (window.Extras) Extras.amberCard(true); });
  $('ticker').addEventListener('click', function () { var id = $('ticker').getAttribute('data-id'); if (id && !flowRunning) runFlow(async function () { UI.open('On air', 'Freight FM', null); try { await UI.say(null, '', { fact: id, next: 'Done' }); } catch (e) {} UI.close(); }); });
  $('ready').addEventListener('click', function () { if (!flowRunning && window.Mastery) Mastery.panel(); });
  $('chain').addEventListener('click', function (e) { var b = e.target.closest('[data-l]'); if (b && !flowRunning) G.pip(b.getAttribute('data-l')); });
  /* item 22: a lit pip opens that link's claim, evidence and objection; an unlit one says where it lights */
  G.pip = function (link) {
    var c = FCV.data.script.spine.chain.filter(function (x) { return x.link === link; })[0]; if (!c) return;
    if (FCV.chainState(G.state).lit[link]) { if (Chapter.linkTabs) Chapter.linkTabs(link); return; }
    UI.toast('Lights at the ' + String(c.lights_at).replace(/scene (\d)/, 'Scene $1') + '.', 2400);
  };
  $('nearby').addEventListener('click', function (e) { var b = e.target.closest('[data-id]'); if (!b || flowRunning) return; var m = markers.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0]; if (m) { lastDrive = UI.keyClick && UI.keyClick(e) ? 'key' : 'touch'; G.rideTo(m); } });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (G.state) G.flush(); if (window.Sound) Sound.hidden(true); if (window.SFX) SFX.setMuted(true); }
    else { if (window.Sound) Sound.hidden(false); if (window.SFX) SFX.setMuted(false); }
  });
  window.addEventListener('pagehide', function () {
    if (!G.state) return;
    if (G.kidDrive) { if (window.Family && Family.kidPagehide) Family.kidPagehide(); return; }
    try { var o = FCV.objective(G.state); G.state.stoppedAt = { node: o.kind === 'act' && o.step ? 'act' + o.act + ':' + o.step.id : o.kind === 'room' ? 'room:' + o.room : 'viva', at: Date.now() }; } catch (e) {}
    G.save(); Save.flush(); if (window.Session) Session.markOpen();
  });

  /* ---------------- boot ---------------- */
  function placePlayer(spawn) {
    var p = G.state.pos;
    if (!spawn && p && !FCV.collide(solids, p.x, p.y, player.r)) { player.x = p.x; player.y = p.y; } else { player.x = city.spawn.x; player.y = city.spawn.y; }
    player.px = player.x; player.py = player.y;
    if (R && R.snapCam) R.snapCam(player.x, player.y);
    lastCellKey = cellKey(FCV.cellAt(city, player.x, player.y)); lastTriggered = null;
    var near = null; markers.forEach(function (m) { if (Math.hypot(m.x - player.x, m.y - player.y) < 74) near = m.id; }); lastTriggered = near;
  }
  G.placePlayer = function (x, y) { player.x = player.px = x; player.y = player.py = y; if (R && R.snapCam) R.snapCam(x, y); lastTriggered = null; G.teleportAt = Date.now(); };
  G.titleLine = titleLine;
  function titleLine(st) {
    var o = FCV.objective(st), when = st.savedAt ? new Date(st.savedAt) : null;
    var day = when ? (FCV.today(when) === FCV.today() ? 'today' : when.toLocaleDateString('en-GB', { weekday: 'long' })) : 'never';
    var h = Math.floor(st.played / 3600), m = Math.floor((st.played % 3600) / 60);
    var actPart = o.kind === 'act' ? 'Act ' + o.act + ', ' + FCV.data.script.acts[o.act - 1].district.name : o.kind === 'room' ? 'The Evidence Locker' : 'The Viva Hall';
    var stepTxt = o.kind === 'act' && o.step ? o.step.title : o.kind === 'room' ? FCV.room(o.room).name : FCV.vivaOpen(st) ? 'face the examiners' : 'open the Hall';
    /* D2-m7: no full stop after a step title that already ends in ? or ! */
    var tl = FCV.data.script.session_copy.title_line; if (/[?!]$/.test(stepTxt)) tl = tl.replace('[step].', '[step]');
    return tl.replace('[Act], [district]', actPart).replace('[step]', stepTxt).replace('[day]', day).replace('[h]', h).replace('[m]', m);
  }
  G.hasProgress = hasProgress;
  /* QAD3-m1: an opening film left part-way counts, so the title offers to carry on with it */
  function hasProgress(st) { return st && (st.intro || Object.keys(st.acts).length || Object.keys(st.rooms).length || st.viva.attempt || (st.film && st.film.id)); }
  /* item 61: Continue names the next step and who is there */
  function continueLabel(st) {
    /* D2-m2: a lesson left part-way is where Continue goes, so it says so */
    var lt = window.Session && Session.lessonLeft ? Session.lessonLeft() : null; if (lt) return 'Continue: Methods Academy lesson: ' + lt;
    if (!st.intro && st.film && st.film.id === 'cold_open') return 'Continue: the opening film';
    /* QAD4-m2: a room left part-way, played after the objective's last step */
    var rl = window.Session && Session.roomLeft ? Session.roomLeft() : null; if (rl) { var rm = FCV.room(rl); return 'Continue: ' + rm.name + (rm.keeper ? ' with ' + FCV.nameOf(rm.keeper) : ''); }
    var o = FCV.objective(st), who = o.kind === 'act' && o.step ? FCV.stepSpeaker(o.act, o.step) : null, name = who && who !== 'you' ? FCV.nameOf(who) : '';
    var place = o.kind === 'act' && o.step ? o.step.title : o.kind === 'room' ? FCV.room(o.room).name : 'The Viva Hall';
    return 'Continue: ' + place + (name ? ' with ' + name : '');
  }
  G.continueLabel = continueLabel;
  function showTitle() {
    var t = $('title'), st = G.state, started = hasProgress(st), fc = FCV.data.script.session_copy.family;
    t.style.backgroundImage = 'url(' + (FCV.assetUrl('CS01') || FCV.assetUrl('img-15')) + ')';
    $('titleBtns').innerHTML = (started ? '<button class="btn go big" type="button" id="tContinue">' + UI.esc(continueLabel(st)) + '</button>' : '<button class="btn go big" type="button" id="tStart">Start</button>') +
      '<details class="more"><summary>More</summary><button class="btn small" type="button" id="tMap">Map</button><button class="btn small" type="button" id="tFilm">Watch the story</button>' + (started ? '<button class="btn small" type="button" id="tNew">New Game</button>' : '<button class="btn small" type="button" id="tLoad">Load a save</button>') + '</details>';
    $('titleFamily').innerHTML = '<span>' + UI.esc(fc.switch) + '</span> <button class="btn small' + (st.settings.family ? ' go' : '') + '" type="button" id="tFamYes" aria-pressed="' + !!st.settings.family + '">' + UI.esc(fc.yes) + '</button><button class="btn small' + (st.settings.family ? ' holdBtn' : ' go') + '" type="button" id="tFamNo" aria-pressed="' + !st.settings.family + '">' + UI.esc(st.settings.family ? 'Hold for ' + fc.no.charAt(0).toLowerCase() + fc.no.slice(1) : fc.no) + '</button>';
    var checking = !started && !accountChecked && Save.dbState() !== 'absent';
    $('titleLine').textContent = started ? titleLine(st) + (window.Mastery ? ' Readiness ' + Mastery.readiness().score + '.' : '') : checking ? 'Checking your account...' : '';
    /* SD-38: a brand-new player sees no save status and one line of help, not a paragraph of keys */
    $('titleStatus').textContent = checking || !started ? '' : Chapter.statusText();
    if ($('titleHelp')) $('titleHelp').textContent = started ? 'Nothing can be lost: every step can be replayed.' : 'Tap Start. Nothing can be lost: every step can be replayed.';
    if (checking) Array.prototype.forEach.call($('titleBtns').querySelectorAll('button'), function (b) { b.disabled = true; });
    t.classList.remove('hidden'); $('hud').classList.add('hidden'); UI.letterbox();
    /* AUD-02: the district music and ambience start fresh once the sound engine exists, whatever opens first */
    var leaveTitle = function () { if (window.Sound) Sound.unlock(G.state.settings); if (window.SFX) { G.applySettings(); SFX.unlock(); } t.classList.add('hidden'); $('hud').classList.remove('hidden'); UI.letterbox(); try { if (window.Kit && Kit.resetAmb) Kit.resetAmb(); G.resetDistrictMusic(); } catch (e) {} };
    var go = async function (fresh) {
      leaveTitle();
      if (fresh) { var ok = await Chapter.wipe(); if (!ok) { showTitle(); return; } }
      /* D2-m6: a new game has nothing that "came across": What's new is never shown to it */
      if (fresh || !started) { G.state.cuts['whatsnew:v3'] = 1; G.save(); }
      if (window.Session) Session.begin();
      G.refresh();
      if (!G.state.intro) { runFlow(function () { return Flows.coldOpen(); }); return; }
      runFlow(async function () {
        if (G.state.settings.family && !G.state.cuts['film:docket_intro']) await Director.film('docket_intro');
        /* D-04: with a place to go back to, What's new waits in a note instead of a card in the way */
        var backTo = !!(G.state.resumeStep || G.state.film || G.state.resume);
        if (window.Extras) { var wasNew = !G.state.cuts['whatsnew:v3']; await Extras.whatsNew(!fresh && started && !backTo); if (wasNew && backTo && !fresh && started) UI.toast('This version has a few new things.', 5000, { action: { label: 'What\'s new', fn: function () { Extras.whatsNewCard(); } } }); }
        return Session.arrive();
      });
    };
    $('tFamYes').onclick = function () { G.state.settings.family = true; FCV.stampSettings(G.state); G.applySettings(); G.save(); showTitle(); };
    /* QAD2-M2: while family mode is on, turning it off from the title is the same one-second hold as in More and Settings */
    var famOff = function () { G.state.settings.family = false; FCV.stampSettings(G.state); G.applySettings(); G.save(); showTitle(); };
    if (st.settings.family) UI.holdButton($('tFamNo'), famOff, 1000); else $('tFamNo').onclick = famOff;
    $('tMap').onclick = function () { leaveTitle(); WorldMap.open(); };
    $('tFilm').onclick = function () { leaveTitle(); runFlow(function () { return Director.watchStory(); }); };
    if ($('tLoad')) $('tLoad').onclick = function () { if (window.Chapter && Chapter.loadOnly) Chapter.loadOnly(); };
    if (started) { $('tContinue').onclick = function () { go(false); }; $('tNew').onclick = function () { go(true); }; try { $('tContinue').focus(); } catch (e) {} }
    else { $('tStart').onclick = function () { go(false); }; try { $('tStart').focus(); } catch (e) {} }
  }
  async function loadLocalState(snap) {
    var local = Save.loadLocal(), st = null, note = null;
    if (snap && snap.v) st = Save.upgrade(snap);
    if (!st && local.v3) st = local.v3;
    if (!st && local.v3broken) {
      var rec = await Save.newestValidSnapshot();
      if (rec) { st = rec.st; note = FCV.data.script.session_copy.time_machine.recovered.replace('[time]', new Date(rec.at).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })); }
    }
    if (local.v3 && (local.v2 || local.v1)) Save.retireOld();
    if (!st && (local.v2 || local.v1)) {
      Save.backup('Before moving to version 3', JSON.stringify({ v2: local.v2, v1: local.v1 }));
      st = Save.merge(local.v2 ? Save.upgrade(local.v2) : null, local.v1 ? Save.upgrade(Object.assign({ v: 1 }, local.v1)) : null);
      st.migratedFrom = local.v2 ? 2 : 1; note = 'Your earlier progress was carried over to version 3. A backup copy is kept.';
      Save.write(st); Save.retireOld();
    }
    if (!st) {
      var rec2 = await Save.newestValidSnapshot();
      if (rec2) { st = rec2.st; note = FCV.data.script.session_copy.time_machine.recovered.replace('[time]', new Date(rec2.at).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })); }
    }
    return { st: st || FCV.newState(), note: note };
  }
  /* The account arrives later: merge it in silently, migrating a v2 account save if that is all there is. */
  function mergeDb(r) {
    if (!r || !G.state) return;
    if (G.kidDrive) { G.pendingMerge = r; return; }
    var before = Save.hash(G.state), playedBefore = G.state.played, incoming = null;
    if (r.v3) {
      incoming = r.v3;
      /* once: dialogue lines seen in v2 that the first migration did not carry */
      if (r.v2 && r.v2.lines && !Object.keys(incoming.lines || {}).length && !(G.state.linesFromV2)) {
        var v2l = Save.expandLines(r.v2.lines); if (Object.keys(v2l).length) { incoming.lines = Object.assign({}, incoming.lines || {}, v2l); G.state.lines = Object.assign({}, G.state.lines || {}, v2l); G.state.linesFromV2 = 1; }
      }
    }
    else if (r.v2) { Save.backup('Account save before moving to version 3', JSON.stringify(r.v2)); incoming = Save.upgrade(r.v2); }
    if (!incoming) return;
    var keepPos = G.state.pos;
    G.adopt(Save.validate(Save.merge(G.state, incoming))); if (window.Mastery) Mastery.bump();
    if (keepPos) G.state.pos = keepPos;
    G.applySettings();
    /* Play time ticks on every open device each second, so two copies nearly always differ in it. A difference in play
       time alone is never a reason to write at once (the timed save carries it): writing on it would bounce the saves
       between two open devices for ever. timeOnly: the copies are the same once the play time is set equal. */
    var now = Save.hash(G.state), timeOnly = function (h, played) { return Save.hash(Object.assign({}, G.state, { played: played })) === h; };
    if (now !== before) { buildMarkers(); buildParcels(); if (!flowRunning && !UI.busy()) placePlayer(false); hud(); if (!timeOnly(before, playedBefore)) Save.write(G.state); if (!$('title').classList.contains('hidden')) showTitle(); }
    /* the account copy lacks something this device has (progress made offline, or a step whose save another device's
       write overtook): send it now, not at the next save; the same: this device is verified as saved to the account */
    else if (r.meta && r.meta.hash) { if (now === r.meta.hash) { if (Save.markVerified) Save.markVerified(); } else if (!timeOnly(r.meta.hash, incoming.played)) Save.write(G.state); }
  }
  G.mergeRemote = mergeDb;
  var accountChecked = false;
  /* Two tabs: a tab that is not the writer is covered. Its one action is Use this tab: steal the lock, re-read this
     device and the account, merge, then write. It also takes over by itself when the other tab closes. */
  function tabCover(lost) {
    var tt = FCV.data.script.session_copy.two_tabs, c = $('tabCover');
    if (!c) { c = document.createElement('div'); c.id = 'tabCover'; c.setAttribute('role', 'dialog'); c.setAttribute('aria-modal', 'true'); document.body.appendChild(c); }
    c.innerHTML = '<div class="modalBox"><h3>' + UI.esc(lost ? 'Another tab took over' : tt.yes + '?') + '</h3><p>' + UI.esc(tt.body) + '</p><p class="small">This tab is not saving, so nothing played here would be kept.</p>' +
      '<button class="btn go" type="button" id="tcUse">' + UI.esc(tt.yes) + '</button><button class="btn" type="button" id="tcOther">Play in the other tab</button></div>';
    c.classList.remove('hidden'); hudStatus();
    $('tcUse').onclick = function () { Save.claimWriter(null, true).then(function (ok) { if (ok) takeOver(false); }); };
    $('tcOther').onclick = function () { c.querySelector('h3').textContent = 'Playing in the other tab'; c.querySelector('#tcOther').remove(); c.querySelector('p').textContent = 'Carry on in the other tab. If you close it, this tab takes over by itself.'; };
    try { $('tcUse').focus(); } catch (e) {}
  }
  G.tabCover = tabCover;
  /* Same Door Dash: markers inert and parcels hidden for the race, as in Kid drive */
  G.setRacing = function (v) { G.racing = !!v; buildMarkers(); buildParcels(); };
  /* after a race: the district bed comes back at once */
  G.resetDistrictMusic = function () { lastCellKey = null; if (window.Sound && Sound.resetDistrict) { Sound.resetDistrict(); var c = FCV.cellAt(city, player.x, player.y); if (c) Sound.districtMusic(c); else if (window.Kit && Kit.cityMusic && !G.racing && G.state && G.state.intro) Kit.cityMusic(null); } }; /* AUDR2-01: off any district, the act's groove; not before the cold open, which brings its own */
  function tabCovered() { var c = $('tabCover'); return !!(c && !c.classList.contains('hidden')); }
  G.tabCovered = tabCovered;
  function takeOver(auto) {
    var c = $('tabCover'); if (c) c.classList.add('hidden');
    var local = Save.loadLocal();
    if (local.v3) { var pos = G.state.pos; G.adopt(Save.validate(Save.merge(G.state, local.v3))); if (pos) G.state.pos = pos; G.applySettings(); }
    var done = function () { buildMarkers(); buildParcels(); hud(); Save.write(G.state); Save.flush(); if (!$('title').classList.contains('hidden')) showTitle(); };
    if (Save.hasDb()) Save.readDb().then(function (r) { if (r) mergeDb(r); done(); }); else done();
    UI.toast(auto ? 'The other tab closed. This tab saves now.' : 'This tab saves now.', 3000);
  }
  G.takeOver = takeOver;
  var booting = true;
  async function start(snap) {
    booting = true;
    var got = await loadLocalState(snap);
    G.adopt(got.st); if (window.Mastery) Mastery.bump();
    G.applySettings();
    buildMarkers(); buildParcels();
    R = await pickRenderer(); G.renderer = R;
    placePlayer(false); hud();
    $('loading').classList.add('hidden');
    requestAnimationFrame(loop);
    if (got.note) UI.toast(got.note, 4500);
    /* AUDR3-08: the title never waits on the tab lock: after 2 s it shows, the tab does not save until the lock answers,
       and then it says "This tab saves now" (or offers Use this tab if another tab has it) */
    var claim = Save.claimWriter(function () { tabCover(true); }, false, function () { takeOver(true); });
    var writerOk = await Promise.race([claim, new Promise(function (r) { setTimeout(function () { r('late'); }, 2000); })]);
    /* held by another copy: cover only if a person has used that copy; an unused hidden copy is taken over quietly */
    var heldElsewhere = function () { (Save.holderInUse ? Save.holderInUse(1200) : Promise.resolve(true)).then(function (inUse) {
      if (inUse) { tabCover(false); hudStatus(); return; }
      Save.claimWriter(null, true).then(function (ok) { if (ok) { G.flush(); } else tabCover(false); hudStatus(); });
    }); };
    if (writerOk === 'late') claim.then(function (ok) { if (ok) { UI.toast('This tab saves now.', 3000); G.flush(); hudStatus(); } else heldElsewhere(); });
    else if (!writerOk) heldElsewhere();
    /* Boot never waits for the host; an account that answers late is merged when it does. */
    Save.init(function (r) { mergeDb(r); Save.watchRemote(function () { return G.state; }); }).then(function (r) {
      accountChecked = true; mergeDb(r); Save.watchRemote(function () { return G.state; });
      if (!$('title').classList.contains('hidden')) showTitle();
    });
    setTimeout(function () { if (!accountChecked) { accountChecked = true; if (!$('title').classList.contains('hidden')) showTitle(); } }, 10000);
    Save.onRemote(function (st, meta) { mergeDb({ v3: st, meta: meta }); });
    var h = String(location.hash || '').replace('#', '');
    booting = false;
    if (h === 'fcv-selftest-save') { selfTestSave(); return; }
    if (h === 'fcv-selftest-check') { selfTestCheck(); return; }
    if ((h === 'fcv-selftest-play' || h === 'fcv-selftest-resume') && window.SelfTest) { SelfTest[h === 'fcv-selftest-play' ? 'play' : 'resume'](); return; }
    showTitle();
    if (window.Session) Session.lastTime();
  }
  /* Live self-test, inert unless the page is opened with #fcv-selftest-save or #fcv-selftest-check. */
  async function selfTestSave() {
    await Save.init().then(mergeDb);
    var real = JSON.stringify(G.state), where = await Save.writeAux('selftest-backup', real);
    var t = Save.upgrade(JSON.parse(real));
    FCV.actSteps(1).forEach(function (s) { FCV.markDone(t, 1, s.id); });
    FCV.markDone(t, 2, 'opening'); FCV.markDone(t, 2, 'scene:2.1'); t.selftest = Date.now();
    G.adopt(t); var res = await Save.flushNow(G.state);
    var next = FCV.nextSteps(t, 2)[0];
    await UI.modal('Self-test: saved', '<p id="selftestResult">SELFTEST SAVE ' + UI.esc(res) + '. Backup: ' + UI.esc(where) + '. Act 1 done: ' + FCV.actDone(t, 1) + '. Act 2 next: ' + UI.esc(next && next.id) + '. Marker ' + t.selftest + '. Hash ' + Save.hash(t) + '. Status: ' + UI.esc(Chapter.statusText()) + '</p>', [{ label: 'OK', value: 1, cls: 'go' }]);
  }
  async function selfTestCheck() {
    var r = await Save.init(); mergeDb(r);
    var st = G.state, next = FCV.nextSteps(st, 2)[0];
    var line = 'SELFTEST CHECK marker ' + (st.selftest || 'missing') + ' (account copy: ' + (r && r.v3 && r.v3.selftest ? r.v3.selftest : 'none') + '). Act 1 done: ' + FCV.actDone(st, 1) + '. Act 2 next: ' + (next && next.id) + '. Hash ' + Save.hash(st) + '. Status: ' + Chapter.statusText();
    var raw = await Save.readAux('selftest-backup'), restored = 'no backup found';
    if (raw) { G.adopt(Save.upgrade(JSON.parse(raw))); delete G.state.selftest; restored = await Save.flushNow(G.state); placePlayer(false); G.refresh(); }
    await UI.modal('Self-test: checked', '<p id="selftestResult">' + UI.esc(line) + '. Restored your own save: ' + UI.esc(restored) + '.</p>', [{ label: 'OK', value: 1, cls: 'go' }]);
    showTitle();
  }
  function fetchJSON(names, opt) {
    var tryOne = function (u, n) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(n + ' ' + r.status); return r.json(); }); };
    var tries = [0, 500, 2000, 5000];
    var attempt = function (i) {
      var p = names.reduce(function (acc, u) { return acc.catch(function () { return tryOne(u, u); }); }, Promise.reject());
      return p.catch(function (e) { if (i + 1 >= tries.length || opt) throw e; return new Promise(function (res) { setTimeout(res, tries[i + 1]); }).then(function () { return attempt(i + 1); }); });
    };
    return attempt(0);
  }
  G.fetchJSON = fetchJSON;
  async function boot() {
    var got = {};
    var fails = +(sessionStorageGet('fcv3-boot-fails') || 0); sessionStorageSet('fcv3-boot-fails', fails + 1);
    G.safeMode = fails >= 2;
    try {
      var main = ['script', 'story_facts', 'facts', 'methods_facts'];
      var res = await Promise.all(main.map(function (n) { return fetchJSON(['assets/data/' + n + '.json', 'data/' + n + '.json']); }));
      main.forEach(function (n, i) { got[n] = res[i]; });
      got.viva_bank = await fetchJSON(['data/viva_bank.json', 'assets/data/viva_bank.json'], true).catch(function () { return { meta: { missing: true }, questions: [] }; });
      FCV.setData({ script: got.script, story: got.story_facts, facts: got.facts, bank: got.viva_bank, methods: got.methods_facts });
      var media = await fetchJSON(['data/media.json', 'assets/data/media.json', 'assets/media/media.json'], true).catch(function () { return []; });
      FCV.addMedia(media);
      if (window.Mastery) await Mastery.load();
      if (window.Missions && Missions.loadFixes) Missions.loadFixes();
      if (window.Voice && Voice.applyFraming) Voice.applyFraming(FCV.data.script);
    } catch (e) { $('loadMsg').textContent = 'The game data did not load (' + (e && e.message) + '). Reload the page to try again.'; return; }
    Flows.buildHeld();
    city = FCV.buildCity(); solids = FCV.solids(city);
    initAmbient();
    $('loadMsg').textContent = 'Opening your save.';
    var hot = window.claude && window.claude.hot;
    if (hot && hot.snapshot) { try { hot.snapshot(function () { if (G.state) G.state.pos = { x: Math.round(player.x), y: Math.round(player.y) }; return G.state; }); } catch (e) {} }
    var go = function (d) { start(d).then(function () { sessionStorageSet('fcv3-boot-fails', 0); }); };
    if (hot && hot.ready) hot.ready(go); else go(hot && hot.data);
  }
  function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, String(v)); } catch (e) {} }
  window.addEventListener('error', function (e) { if (window.Help) Help.log('error', e.message); });
  window.addEventListener('unhandledrejection', function (e) { if (window.Help) Help.log('promise', String(e.reason && e.reason.message || e.reason)); });
  boot();
})();
