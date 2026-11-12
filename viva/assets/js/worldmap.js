/* Freight City Viva v3: the World Map. Every step of every act is a node on a path, with the Locker rooms, the Academy's
   missions and lessons, the Waiting Room and the Viva Hall. Any node restarts in one click (a 1 s hold in family mode), with
   a snapshot and Undo for 30 s. Replay and Practice never change story progress. The v2 list stays as a toggle. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return UI.esc(s); };
  var W = {}, nodes = [], sel = 0, listMode = false, undo = null, undoT = null, scale = 1;
  var STARRED = /^(scene|mission|methods|rehearsal|mock_viva|shift_check)$/;
  var S = function () { return Game.state; };
  var SC = function () { return FCV.data.script; };
  var VW = 1600, VH = 1100, mapImg = null;
  var ACT_POS = { 1: [60, 60], 2: [430, 60], 3: [800, 60], 4: [1170, 60], 5: [1170, 420], 6: [1170, 780], 7: [800, 780] };
  var ACT_COL = { 1: '#ff8a3d', 2: '#2bb3a6', 3: '#7a5cff', 4: '#e2456f', 5: '#ffb000', 6: '#e6332a', 7: '#16a0d8' };
  var MINS = { opening: 1, scene: 4, tp: 3, on_air: 2, ladder: 2, mission: 8, methods: 8, rehearsal: 3, mock_viva: 8, shift_check: 4, closer: 2, academy_entrance: 1 };

  /* item 12: icons with the full label, never codes (TP, FM, SC, M, R, WR, K) */
  var IC = {
    tp: '<path d="M5 17V9a4 4 0 0 1 4-4h8l-3-3M17 5l-3 3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    on_air: '<path d="M6 10h12v9H6z M9 10l6-5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="10" cy="14.5" r="2" fill="currentColor"/>',
    mission: '<path d="M6 21V4h11l-2 4 2 4H6" fill="currentColor"/>',
    methods: '<path d="M4 5h7v14H4zM13 5h7v14h-7z" fill="none" stroke="currentColor" stroke-width="2.2"/>',
    rehearsal: '<path d="M4 5h16v10H9l-5 4z" fill="currentColor"/>',
    mock_viva: '<path d="M4 14a8 8 0 0 1 16 0zM3 15h18v3H3z" fill="currentColor"/>',
    shift_check: '<path d="M7 4h10v17H7z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M9.5 12l2 2 3.5-4" fill="none" stroke="currentColor" stroke-width="2.2"/>',
    ladder: '<path d="M8 3v18M16 3v18M8 7h8M8 12h8M8 17h8" stroke="currentColor" stroke-width="2.2"/>',
    academy_entrance: '<path d="M3 9l9-5 9 5-9 5zM7 11v5c3 2 7 2 10 0v-5" fill="currentColor"/>',
    waiting: '<path d="M7 4v9h10v7M7 13v7M17 4v9" fill="none" stroke="currentColor" stroke-width="2.4"/>',
    kiosk: '<path d="M4 9h16l-2-5H6zM5 9v11h14V9M10 20v-6h4v6" fill="none" stroke="currentColor" stroke-width="2.2"/>'
  };
  function icon(k) { return IC[k] ? '<svg class="wmIc" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' + IC[k] + '</svg>' : ''; }
  function nodeFace(nd) {
    if (nd.kind === 'step') { var k = nd.step.kind; if (k === 'scene') return esc(nd.short); if (k === 'opening') return '&#9654;'; if (k === 'closer') return '&#9733;'; return icon(k) || '&#8226;'; }
    if (nd.kind === 'mission') return icon('methods') + '<small>' + nd.num + '</small>';
    if (nd.kind === 'waiting' || nd.kind === 'kiosk') return icon(nd.kind);
    if (nd.kind === 'viva') return 'Viva';
    if (nd.kind === 'academy') return icon('academy_entrance') + '<span>Academy</span>';
    if (nd.kind === 'drop') return '<svg class="wmIc" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h16v11H4z" fill="#c9a46a" stroke="currentColor" stroke-width="2"/><path d="M4 9l3-4h10l3 4" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
    return esc(nd.short);
  }
  function stepState(n, s) {
    var st = S();
    if (FCV.isDone(st, n, s.id)) return 'done';
    if (FCV.isNewV3(st, n, s.id)) return 'new3';
    if (!FCV.actOpen(st, n)) return 'locked';
    if (FCV.nextSteps(st, n).some(function (x) { return x.id === s.id; })) return 'next';
    return 'locked';
  }
  function build() {
    var st = S(), out = [];
    for (var n = 1; n <= 7; n++) {
      var steps = FCV.actSteps(n), p = ACT_POS[n], cols = 4;
      steps.forEach(function (s, i) {
        var row = Math.floor(i / cols), col = row % 2 ? cols - 1 - (i % cols) : i % cols;
        out.push({ kind: 'step', act: n, step: s, id: 'act' + n + ':' + s.id, x: p[0] + 40 + col * 82, y: p[1] + 70 + row * 64, label: s.title, state: stepState(n, s), stars: st.stepStars[s.kind === 'methods' ? s.id : 'act' + n + ':' + s.id] || (s.kind === 'mission' && FCV.isDone(st, n, 'mission') ? ({ gold: 3, silver: 2, bronze: 1 }[(st.acts[n] || {}).stamp] || 0) : 0), starred: STARRED.test(s.kind), mins: MINS[s.kind] || 3, short: s.kind === 'scene' ? s.id.replace('scene:', '') : s.kind === 'methods' ? 'M' : s.kind === 'rehearsal' ? 'R' : s.kind === 'shift_check' ? 'SC' : s.kind === 'closer' ? '★' : s.kind === 'opening' ? '▶' : s.kind === 'tp' ? 'TP' : s.kind === 'mission' ? '!' : s.kind === 'on_air' ? 'FM' : s.kind === 'mock_viva' ? 'MV' : s.kind === 'ladder' ? 'L' : '•' });
      });
    }
    SC().evidence_locker.rooms.forEach(function (r, i) {
      var rs = st.rooms[r.id], open = FCV.actOpen(st, 2) || st.cuts.locker_entry;
      out.push({ kind: 'room', room: r, id: 'room:' + r.id, x: 465 + (i % 5) * 70, y: 500 + Math.floor(i / 5) * 90, label: r.name + ' (Appendix ' + r.appendices.join(', ') + ')' + (rs && rs.badge && rs.replaying ? ', replaying (badge kept)' : ''), state: rs && rs.badge && !rs.replaying ? 'done' : open ? 'next' : 'locked', short: String(r.name).replace(/^The /, '').split(/\s+/)[0].replace(/'s?$/, ''), roomNode: true, stars: st.stepStars['room:' + r.id] || 0, mins: 8 });
    });
    /* SD-03: while the bag holds parcels, each act's drop box they belong in shows as a pin in that act's panel, and a
       Locker room says how many are for it */
    var bagFor = {}; (st.parcels.bag || []).forEach(function (id) { var h = FCV.parcelHome(id); if (h) { var k = h.kind === 'act' ? 'act' + h.act : 'room' + h.room; bagFor[k] = (bagFor[k] || 0) + 1; } });
    for (var dn = 1; dn <= 7; dn++) if (bagFor['act' + dn] && FCV.isDone(st, dn, 'opening')) out.push({ kind: 'drop', act: dn, id: 'drop:' + dn, x: ACT_POS[dn][0] + 306, y: ACT_POS[dn][1] + 286, label: 'Drop box: Act ' + dn + ' (' + bagFor['act' + dn] + (bagFor['act' + dn] === 1 ? ' parcel from your bag goes here)' : ' parcels from your bag go here)'), state: 'next', short: 'Drop', mins: 2 });
    out.forEach(function (x) { if (x.kind === 'room' && bagFor['room' + x.room.id]) x.label += ' (' + bagFor['room' + x.room.id] + (bagFor['room' + x.room.id] === 1 ? ' parcel from your bag goes here)' : ' parcels from your bag go here)'); });
    /* SD-13: the Academy is one tile that opens its own list (its missions are also steps in their acts) */
    var nxL = window.Academy && Academy.nextLesson(), acOpen = !!(st.cuts.academy_entrance || FCV.isDone(st, 3, 'academy_entrance') || FCV.actOpen(st, 2));
    var lDone = Object.keys(st.methods.lessons || {}).filter(function (k) { return st.methods.lessons[k].done; }).length, lAll = SC().methods_academy.lessons.length;
    out.push({ kind: 'academy', id: 'academy', x: 975, y: 590, label: 'The Methods Academy: ' + lDone + ' of ' + lAll + ' lessons done' + (nxL ? '. Next: ' + nxL.term : ''), state: !acOpen ? 'locked' : nxL ? 'next' : 'done', short: 'Academy', mins: 5 });
    out.push({ kind: 'waiting', id: 'waiting', x: 240, y: 840, label: 'The Waiting Room: a mock viva', state: FCV.actDone(st, 7) ? 'next' : 'locked', short: 'WR', mins: 15 });
    out.push({ kind: 'viva', id: 'viva', x: 240, y: 560, label: 'The Viva Hall', state: FCV.vivaOpen(st) ? (st.viva.best && st.viva.best !== 'fail' ? 'done' : 'next') : 'locked', short: 'VIVA', mins: 25 });
    out.push({ kind: 'kiosk', id: 'kiosk', x: 560, y: 900, label: "Digits' kiosk: Night Shift, Tune-up Bay, Chain Sprint", state: 'next', short: 'K', mins: 10 });
    /* One gold "next": the objective (the earliest story step, else the Hall, the mock, a Methods mission, a lesson, a
       room, the kiosk). Everything else that can be played reads "open". */
    var order = ['step', 'viva', 'waiting', 'academy', 'room', 'kiosk', 'drop'], best = null;
    order.forEach(function (k) { if (!best) best = out.filter(function (x) { return x.kind === k && x.state === 'next'; })[0] || null; });
    out.forEach(function (x) { if (x.state === 'next' && x !== best) x.state = 'open'; });
    nodes = out;
  }
  function lockReason(nd) {
    /* D2-m9: an earlier act restarted part-way says so, rather than reading as if it had never been finished */
    if (nd.kind === 'step') { if (FCV.actOpen(S(), nd.act)) return 'Opens after the step before it.'; var ep = S().epochs || {}; return ep['act:' + (nd.act - 1)] ? 'Opens when Act ' + (nd.act - 1) + ' is finished again (you restarted it).' : 'Opens after Act ' + (nd.act - 1) + '.'; }
    if (nd.kind === 'viva') return 'Opens after Act 7 with 10 badges.';
    if (nd.kind === 'waiting') return 'Opens after Act 7.';
    if (nd.kind === 'academy') return 'Opens after Act 1.';
    if (nd.kind === 'room') return 'Opens when you reach the Evidence Locker.';
    return 'Opens with its act.';
  }
  function draw() {
    var cv = $('wmCanvas'), body = $('wmBody'), wd = Math.max(320, body.clientWidth), sc = Math.min(1.2, wd / VW);
    scale = listMode ? 1 : sc;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = VW * scale * dpr; cv.height = VH * scale * dpr; cv.style.width = VW * scale + 'px'; cv.style.height = VH * scale + 'px'; cv.style.display = listMode ? 'none' : '';
    var c = cv.getContext('2d'); c.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    c.fillStyle = '#f3e6cf'; c.fillRect(0, 0, VW, VH);
    if (mapImg && mapImg.complete && mapImg.naturalWidth) { c.globalAlpha = 0.22; c.drawImage(mapImg, 0, 0, VW, VH); c.globalAlpha = 1; }
    /* paper grain and roads */
    c.strokeStyle = 'rgba(122,90,48,.25)'; c.lineWidth = 18; c.lineCap = 'round';
    [[40, 400, 1560, 400], [40, 760, 1560, 760], [400, 40, 400, 1060], [770, 40, 770, 1060], [1140, 40, 1140, 1060]].forEach(function (l) { c.beginPath(); c.moveTo(l[0], l[1]); c.lineTo(l[2], l[3]); c.stroke(); });
    var st = S();
    for (var n = 1; n <= 7; n++) {
      var p = ACT_POS[n], done = FCV.actDone(st, n), open = FCV.actOpen(st, n);
      c.fillStyle = done ? ACT_COL[n] : open ? '#e8d6b8' : '#cfc3b1'; c.globalAlpha = done ? 0.35 : 1;
      rr(c, p[0], p[1], 350, 320, 26); c.fill(); c.globalAlpha = 1;
      c.strokeStyle = '#15101f'; c.lineWidth = 4; rr(c, p[0], p[1], 350, 320, 26); c.stroke();
      var acts = nodes.filter(function (x) { return x.kind === 'step' && x.act === n; });
      c.strokeStyle = ACT_COL[n]; c.lineWidth = 6; c.setLineDash([12, 10]); c.beginPath(); acts.forEach(function (x, i) { if (i) c.lineTo(x.x, x.y); else c.moveTo(x.x, x.y); }); c.stroke(); c.setLineDash([]);
    }
    [['#3b2a4f', 430, 420, 350, 330], ['#2f8f4e', 800, 420, 350, 330], ['#4a3366', 60, 420, 350, 330], ['#56606e', 430, 780, 350, 300], ['#2a1d3a', 60, 780, 350, 300]].forEach(function (z) { c.fillStyle = z[0]; c.globalAlpha = 0.25; rr(c, z[1], z[2], z[3], z[4], 26); c.fill(); c.globalAlpha = 1; c.strokeStyle = '#15101f'; c.lineWidth = 3; rr(c, z[1], z[2], z[3], z[4], 26); c.stroke(); });
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function starsTxt(k) { var s = ''; for (var i = 0; i < 3; i++) s += i < k ? '★' : '☆'; return s; }
  /* D-05: only steps that can earn stars count towards an act's stars and draw them; films, closers, On air and the ladder do not */
  function actStars(n) { var got = 0, max = 0; nodes.forEach(function (x) { if (x.kind === 'step' && x.act === n && x.starred) { max += 3; got += x.stars; } }); return got + ' of ' + max + ' stars'; }
  function doneTxt(nd) { return nd.starred ? 'done ' + starsTxt(nd.stars) : 'done'; }
  function render() {
    build(); draw();
    var box = $('wmNodes'); box.className = listMode ? 'list' : '';
    var labels = '', html = '';
    if (!listMode) {
      /* headers stay inside their own panel (wrapped, never across the next one) */
      for (var n = 1; n <= 7; n++) labels += '<div class="wmLabel" style="left:' + (ACT_POS[n][0] + 175) * scale + 'px;top:' + (ACT_POS[n][1] + 26) * scale + 'px;max-width:' + Math.round(330 * scale) + 'px;white-space:normal;text-align:center;font-size:' + Math.max(11, Math.round(18 * scale)) + 'px">Act ' + n + ': ' + esc(SC().acts[n - 1].district.name) + ' · ' + actStars(n) + '</div>';
      labels += '<div class="wmLabel" style="left:' + 605 * scale + 'px;top:' + 440 * scale + 'px">Evidence Locker</div><div class="wmLabel" style="left:' + 975 * scale + 'px;top:' + 440 * scale + 'px">Methods Academy</div><div class="wmLabel" style="left:' + 235 * scale + 'px;top:' + 440 * scale + 'px">Viva Hall</div><div class="wmLabel" style="left:' + 235 * scale + 'px;top:' + 800 * scale + 'px">Waiting Room</div><div class="wmLabel" style="left:' + 605 * scale + 'px;top:' + 800 * scale + 'px">Harbour</div>';
    }
    var lastGroup = '';
    nodes.forEach(function (nd, i) {
      var group = nd.kind === 'step' ? 'Act ' + nd.act + ': ' + SC().acts[nd.act - 1].district.name + ' · ' + actStars(nd.act) : nd.kind === 'room' ? 'Evidence Locker' : nd.kind === 'academy' ? 'Methods Academy' : nd.kind === 'drop' ? 'Act ' + nd.act + ': ' + SC().acts[nd.act - 1].district.name + ' · ' + actStars(nd.act) : 'The Hall and the Harbour';
      if (listMode && group !== lastGroup) { html += '<div class="wmLabel" role="heading" aria-level="3">' + esc(group) + '</div>'; lastGroup = group; }
      var style = listMode ? '' : 'left:' + nd.x * scale + 'px;top:' + nd.y * scale + 'px;' + (nd.small ? 'min-width:18px;min-height:18px;width:18px;height:18px;padding:0;border-width:2px;font-size:8px;font-family:var(--body);font-weight:700;box-shadow:none' : nd.roomNode ? 'font-size:12px;padding:0 5px' : nd.kind === 'academy' ? 'border-radius:16px;padding:6px 12px;font-size:' + Math.max(12, Math.round(18 * scale)) + 'px;gap:6px' : '');
      var stateTxt = nd.state === 'done' ? doneTxt(nd) : nd.state === 'next' ? 'next, about ' + nd.mins + ' min' : nd.state === 'open' ? 'open, about ' + nd.mins + ' min' : nd.state === 'new3' ? 'new in v3' : 'locked';
      html += '<button class="wmNode ' + nd.state + (i === sel ? ' sel' : '') + '" role="listitem" type="button" data-n="' + i + '" style="' + style + '" aria-label="' + esc(nd.label + ', ' + stateTxt) + '" title="' + esc(nd.label) + '">' + (listMode ? (nd.kind === 'step' && nd.step.kind !== 'scene' ? icon(nd.step.kind) + ' ' : '') + esc(nd.label) + ' <small>' + esc(stateTxt) + '</small>' : nodeFace(nd) + (nd.state === 'done' && !nd.small ? (nd.starred ? '<small>' + starsTxt(nd.stars) + '</small>' : '<small>done</small>') : nd.state === 'new3' && !nd.small ? '<small>new in v3</small>' : '')) + (pbOf(nd) ? ' <span class="pbChip">' + esc(pbOf(nd)) + '</span>' : '') + '</button>';
      /* item 50: a ribbon where he stopped last time */
      var sa = S().stoppedAt; if (!listMode && sa && sa.node === nd.id) html += '<div class="ribbon" style="left:' + nd.x * scale + 'px;top:' + nd.y * scale + 'px">You stopped here, ' + esc(new Date(sa.at).toLocaleDateString('en-GB', { weekday: 'short' }) + ' ' + new Date(sa.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })) + '</div>';
    });
    box.innerHTML = labels + html;
    box.style.width = listMode ? '' : VW * scale + 'px'; box.style.height = listMode ? '' : VH * scale + 'px';
    var rd = window.Mastery ? Mastery.readiness() : { score: 0, band: '' };
    var tot = 0, max = 0; for (var k = 1; k <= 7; k++) { var p = actStars(k).match(/\d+/g); tot += +p[0]; max += +p[1]; }
    var lg = $('wmLegend'); if (!lg) { lg = document.createElement('div'); lg.id = 'wmLegend'; lg.className = 'wmLegend'; $('wmPanel').parentNode.insertBefore(lg, $('wmPanel')); }
    lg.innerHTML = 'Key: &#9654; opening · 1.1 scene · ' + icon('tp') + ' turning point · ' + icon('on_air') + ' on air · ' + icon('mission') + ' mission · ' + icon('methods') + ' methods · ' + icon('rehearsal') + ' rehearsal · ' + icon('shift_check') + ' shift check · &#9733; closer. Gold pulse: play next.';
    lg.hidden = listMode; /* SD-13: the key belongs to the drawn map only */
    void rd; void tot; void max;
    $('wmStats').textContent = 'Badges ' + FCV.badges(S()) + (FCV.badges(S()) >= FCV.BADGES_FOR_VIVA ? ' · the Hall is open' : ' · the Hall opens at ' + FCV.BADGES_FOR_VIVA);
    Array.prototype.forEach.call(box.querySelectorAll('[data-n]'), function (b) { b.addEventListener('click', function () { sel = +b.getAttribute('data-n'); highlight(); panel(); }); });
    panel();
  }
  function highlight() { Array.prototype.forEach.call($('wmNodes').querySelectorAll('[data-n]'), function (b) { b.classList.toggle('sel', +b.getAttribute('data-n') === sel); }); var b = $('wmNodes').querySelector('[data-n="' + sel + '"]'); if (b) { try { b.focus({ preventScroll: false }); } catch (e) {} } }
  function panel() {
    var nd = nodes[sel], p = $('wmPanel'); if (!nd) { p.innerHTML = ''; return; }
    var fam = S().settings.family, played = nd.state === 'done' || nd.state === 'new3' || nd.state === 'next';
    var canR = canRestart(nd);
    var btn = function (a, label, cls, extra) { return '<button class="btn small ' + (cls || '') + '" type="button" data-a="' + a + '"' + (extra || '') + '>' + label + '</button>'; };
    var h = '<div><b>' + esc(nd.label) + '</b> · ' + (nd.state === 'locked' ? esc(lockReason(nd)) : nd.state === 'done' ? (nd.starred ? 'Done ' + starsTxt(nd.stars) : 'Done') : nd.state === 'new3' ? 'New in v3: optional; it never re-locks the act.' : (nd.state === 'open' ? 'Open' : 'Next') + ', about ' + nd.mins + ' min.') + '</div><div class="wmBtns">';
    /* SD-13: at most three buttons. Play takes you there and starts it; a done step plays again as practice (progress safe);
       Restart from here sits apart, quiet, with Undo. Ride there and Tram are folded into Play. */
    if (nd.state !== 'locked') {
      if (nd.kind === 'academy') h += btn('play', 'Open the Academy', 'go');
      else if (nd.kind === 'drop') h += btn('way', 'Show me the way', 'go');
      else if (nd.state === 'done' && nd.kind === 'step') h += btn('practice', 'Play again (practice)<span class="kbOnly"> (P)</span>', 'go');
      else h += btn('play', 'Play now', 'go');
    }
    h += '</div>';
    /* item 20: Restart is a quiet button set apart from Play, a one-second hold in every mode; a restart can be put back */
    var lr = lastRestartFor(nd);
    if (lr || canR || (nd.kind === 'viva' && S().viva.paused)) {
      h += '<div class="wmBtns wmRestart">';
      /* D2-M2: Put it back is drawn after the restart button, never in the slot a finger has just lifted from */
      if (canR) h += btn('restart', 'Hold to restart from here<span class="kbOnly">' + (S().settings.family ? ' (Shift+R)' : ' (R)') + '</span>', 'holdBtn quiet', '');
      if (lr) h += btn('putback', 'Restarted. Put it back', 'go');
      if (nd.kind === 'viva' && S().viva.paused) h += btn('vivaRestart', 'Restart the viva attempt', 'quiet');
      h += '</div>';
    }
    p.innerHTML = h;
    Array.prototype.forEach.call(p.querySelectorAll('[data-a]'), function (b) {
      var a = b.getAttribute('data-a');
      if (/restart/.test(a) && a !== 'vivaRestart') holdToFire(b, function () { act(a, nd); });
      else b.addEventListener('click', function () { act(a, nd); });
    });
  }
  /* the last restart, kept until a step of that act (or that room, mission or lesson) is played again */
  var LR_KEY = 'fcv3-last-restart';
  function lastRestart() { try { var r = JSON.parse(localStorage.getItem(LR_KEY) || 'null'); return r; } catch (e) { return null; } }
  function lastRestartFor(nd) {
    var r = lastRestart(), st = S(); if (!r || !st.lastRestart || st.lastRestart.at !== r.at || r.node !== nd.id) return null;
    if (nd.kind === 'step') { var da = (FCV.actState(st, nd.act).doneAt) || {}, played = Object.keys(da).some(function (k) { return da[k] > r.at && FCV.isDone(st, nd.act, k); }); if (played) return null; }
    return r;
  }
  W.putBack = function (nodeId) {
    var r = lastRestart(), st = S(); if (!r || r.node !== nodeId) { UI.toast('Nothing to put back now.', 2000); return; }
    var b = JSON.parse(r.before), sc = r.scope;
    if (sc.scope === 'act') { st.acts[sc.key] = b.acts[sc.key]; if (b.newV3) { st.newV3 = st.newV3 || {}; st.newV3[sc.key] = (b.newV3 || {})[sc.key]; } }
    else if (sc.scope === 'room') st.rooms[sc.key] = b.rooms[sc.key];
    else if (sc.scope === 'mission') { st.methods.missions[sc.key] = b.methods.missions[sc.key]; st.acts = b.acts; }
    else if (sc.scope === 'lesson') st.methods.lessons[sc.key] = b.methods.lessons[sc.key];
    Save.markReset(st, sc.scope, sc.key);
    st.lastRestart = null; try { localStorage.removeItem(LR_KEY); } catch (e) {}
    if (window.Kit) Kit.sfx('SFX-REWIND');
    Game.refresh(); Game.flush(); UI.toast('Put back as it was.', 2200);
    if (!$('worldmap').classList.contains('hidden')) render();
  };
  function pbOf(nd) { var st = S(); return st.pbChip && st.pbChip[nd.id] || ''; }
  function canRestart(nd) {
    if (!nd || nd.kind === 'viva' || nd.kind === 'kiosk' || nd.kind === 'waiting' || nd.kind === 'academy' || nd.kind === 'drop' || nd.state === 'locked') return false;
    return nd.state === 'done' || (nd.kind === 'step' && FCV.isDone(S(), nd.act, 'opening')) || (nd.kind === 'room' && !!S().rooms[nd.room.id]) || (nd.kind === 'mission' && !!S().methods.missions[nd.key]) || (nd.kind === 'lesson' && !!S().methods.lessons[nd.lesson.id]);
  }
  /* Family mode: Restart needs a 1 s press and hold. */
  /* D1-M1: the shared hold (it fires on letting go of the same press after 1 s; Tab, blur or another key cancel it) */
  function holdToFire(b, fn) { UI.holdButton(b, fn, 1000); }
  function placeOf(nd) {
    if (nd.kind === 'step') return { kind: 'act', act: nd.act };
    if (nd.kind === 'room') return { kind: 'room', room: nd.room.id };
    if (nd.kind === 'viva' || nd.kind === 'waiting') return { kind: 'viva' };
    if (nd.kind === 'kiosk') return { kind: 'kiosk' };
    if (nd.kind === 'drop') return { kind: 'drop', act: nd.act };
    return { kind: 'academy' };
  }
  async function act(a, nd) {
    var st = S();
    if (a === 'ride') { W.close(); Game.rideTo(placeOf(nd)); return; }
    if (a === 'way') { W.close(); var pid = (st.parcels.bag || []).filter(function (id) { var h = FCV.parcelHome(id); return h && h.kind === 'act' && h.act === nd.act; }).pop(); if (pid && window.Bag) Bag.show(pid); if (Game.rideTo) Game.rideTo({ kind: 'drop', act: nd.act }); return; }
    if (a === 'tram') { W.close(); Game.travelTo(placeOf(nd)); return; }
    if (a === 'restart' || a === 'restartAct') { W.restart(nd, a === 'restartAct'); render(); return; }
    if (a === 'putback') { W.putBack(nd.id); return; }
    if (st.pbChip && st.pbChip[nd.id]) { delete st.pbChip[nd.id]; Game.save(); }
    if (a === 'vivaRestart') { W.close(); Game.runFlow(function () { return Viva.walkOut(true); }); return; }
    var replay = a === 'replay' || a === 'practice';
    W.close();
    /* Play takes the courier there first, so he comes out of the step where it happened */
    if (nd.kind !== 'academy' && !replay && Game.travelTo) { try { Game.travelTo(placeOf(nd), true); } catch (e) {} }
    Game.runFlow(async function () {
      if (nd.kind === 'academy') return Academy.open();
      if (nd.kind === 'step') {
        if (replay && nd.step.kind === 'closer') return Flows.closer(nd.act, true);
        if (replay) UI.toast(SC().session_copy.replay_toast, 2200);
        return Flows.actStep(nd.act, nd.step.id, replay);
      }
      if (nd.kind === 'room') return Flows.room(nd.room.id);
      if (nd.kind === 'mission') return Missions.methodsMission(nd.key, replay);
      if (nd.kind === 'lesson') return Academy.lesson(nd.lesson.id, replay);
      if (nd.kind === 'viva') return Flows.vivaDoor();
      if (nd.kind === 'waiting') return Missions.waitingRoom();
      if (nd.kind === 'kiosk') return Flows.kiosk();
    });
  }

  /* ---------------- Restart from here: snapshot, unmark, toast with Undo for 30 s ---------------- */
  W.restart = function (nd, wholeAct) {
    var st = S(), before = JSON.stringify(st), copy = SC().session_copy, label, scope, rs0 = null;
    /* D-08: the snapshot says what was restarted, so two restarts a minute apart read differently in the Time Machine */
    Game.snapshot('Before a restart' + (nd.kind === 'step' ? ' of Act ' + nd.act + (wholeAct ? '' : nd.label ? ' from ' + String(nd.label).replace(/<[^>]+>/g, '').slice(0, 60) : '') : nd.label ? ' of ' + String(nd.label).replace(/<[^>]+>/g, '').slice(0, 60) : ''));
    if (nd.kind === 'step') {
      var steps = FCV.actSteps(nd.act).map(function (s) { return s.id; }), from = wholeAct ? 0 : steps.indexOf(nd.step.id);
      var as = FCV.actState(st, nd.act); as.done = as.done.filter(function (sid) { return steps.indexOf(sid) < from; }); as.mission = null; Save.markReset(st, 'act', nd.act); rs0 = { scope: 'act', key: nd.act };
      if (st.newV3 && st.newV3[nd.act]) st.newV3[nd.act] = st.newV3[nd.act].filter(function (sid) { return steps.indexOf(sid) < from; });
      if (st.resume && /^act\d/.test(st.resume.key || '') && st.resume.key.indexOf('act' + nd.act) === 0) st.resume = null;
      label = wholeAct ? copy.restart_act.toast.replace('[n]', nd.act).replace('[step]', FCV.actSteps(nd.act)[0].title) : copy.restart_step.toast.replace('[step]', nd.step.title);
      scope = wholeAct ? 'act' : 'step';
    } else if (nd.kind === 'room') {
      var rs = FCV.roomState(st, nd.room.id); rs.stage = 0; rs.done = {}; rs.corner = {}; rs.replaying = true; Save.markReset(st, 'room', nd.room.id); rs0 = { scope: 'room', key: nd.room.id };
      label = copy.restart_room.toast.replace('[room]', nd.room.name) + (rs.badge ? ' Badge kept.' : ''); scope = 'room';
    } else if (nd.kind === 'mission') {
      var mm = st.methods.missions[nd.key]; if (mm) { mm.done = false; delete mm.doneAt; } Save.markReset(st, 'mission', nd.key); rs0 = { scope: 'mission', key: nd.key };
      for (var n = 1; n <= 7; n++) { var ix = FCV.actSteps(n).map(function (s) { return s.id; }).indexOf('methods:' + nd.key); if (ix >= 0) { var a2 = FCV.actState(st, n); a2.done = a2.done.filter(function (sid) { return sid !== 'methods:' + nd.key; }); } }
      if (st.resume && st.resume.key === 'methods:' + nd.key) st.resume = null;
      label = copy.restart_step.toast.replace('[step]', nd.label); scope = 'step';
    } else if (nd.kind === 'lesson') {
      st.methods.lessons[nd.lesson.id] = { step: 0, done: false }; Save.markReset(st, 'lesson', nd.lesson.id); rs0 = { scope: 'lesson', key: nd.lesson.id };
      label = copy.restart_step.toast.replace('[step]', nd.label); scope = 'step';
    }
    /* AUDR4-07: a title that ends in ?, ! or . takes no second full stop ("where are the shippers?. Your learning stays.") */
    label = String(label).replace(/([?!.])\.(?=\s|$)/g, '$1');
    Game.refresh(); Game.flush();
    if (window.Kit) Kit.sfx('SFX-RESTART');
    if (window.Sound) Sound.voice(scope === 'act' ? copy.restart_act.voice : scope === 'room' ? copy.restart_room.voice : copy.restart_step.voice, { speaker: 'marigold', pri: 'menu' });
    W.offerUndo(label, before, null, rs0);
    if (rs0) { var at = Date.now(); st.lastRestart = { node: nd.id, at: at }; try { localStorage.setItem(LR_KEY, JSON.stringify({ node: nd.id, at: at, before: before, scope: rs0 })); } catch (e) {} Game.save(); UI.addRecent(label, { label: 'Put it back', fn: function () { W.putBack(nd.id); } }); }
  };
  /* The 30 s Undo survives a reload in this tab: it is kept in localStorage with its expiry. */
  var UNDO_KEY = 'fcv3-undo-restart';
  /* reset: {scope, key} of the reset this Undo takes back. The undone copy then carries a reset newer than the one every
     other device heard, so its steps are not pruned when those devices merge (QA round 3, U2 to U4). */
  var undoReset = null;
  W.offerUndo = function (label, before, until, reset) {
    undo = before; undoReset = reset || null; clearTimeout(undoT); until = until || Date.now() + 30000;
    try { localStorage.setItem(UNDO_KEY, JSON.stringify({ label: label, before: before, until: until, reset: undoReset })); } catch (e) {}
    var bar = $('undoBar');
    /* ND5: on a phone the bar says the short form ("Back to Scene 1.1. Your learning stays."), so it keeps to two lines */
    var short = String(label).replace(/^(Back to [^:]+?):\s.*?([?!.])\s+(Your .*)$/, '$1. $3');
    bar.innerHTML = '<span><span class="uFull">' + esc(label) + '</span><span class="uShort">' + esc(short) + '</span></span><button class="btn go" type="button" id="undoBtn" aria-label="' + esc(SC().session_copy.restart_step.undo + ': ' + label) + '" title="' + esc(label) + '">' + esc(SC().session_copy.restart_step.undo) + '</button>';
    bar.classList.remove('hidden');
    $('undoBtn').onclick = function () { W.undo(); };
    undoT = setTimeout(function () { bar.classList.add('hidden'); undo = null; try { localStorage.removeItem(UNDO_KEY); } catch (e) {} }, Math.max(0, until - Date.now()));
  };
  W.undo = function () {
    if (!undo) return; var s = JSON.parse(undo), rz = undoReset; undo = null; undoReset = null; clearTimeout(undoT); $('undoBar').classList.add('hidden'); try { localStorage.removeItem(UNDO_KEY); } catch (e) {}
    /* keep every reset this device has heard, then stamp a newer one for the same scope: the undone copy knows it */
    s.epochs = Object.assign({}, s.epochs || {}, Game.state.epochs || {});
    Object.keys(s.epochs).forEach(function (k) { s.epochs[k] = Math.max((s.epochs || {})[k] || 0, (Game.state.epochs || {})[k] || 0); });
    if (rz && rz.scope) Save.markReset(s, rz.scope, rz.key);
    /* AUDR2-10: Undo keeps today's sound settings (as the Time Machine does): a mute made since the restart stays */
    if (Game.state.settings && Game.state.settings.audio) { s.settings = s.settings || {}; s.settings.audio = JSON.parse(JSON.stringify(Game.state.settings.audio)); s.settings.at = Game.state.settings.at || 0; FCV.syncOldAudio(s.settings); }
    var pos = Game.state.pos; Game.adopt(Save.upgrade(s)); Game.state.pos = pos; if (window.Mastery) Mastery.bump(); Game.applySettings(); Game.refresh(); Game.flush();
    if (window.Kit) Kit.sfx('SFX-REWIND');
    UI.toast('Undone. Back as you were.', 2000);
    if (!$('worldmap').classList.contains('hidden')) render();
    /* pressed on the title: the title line follows */
    if (!$('title').classList.contains('hidden') && Game.showTitle) Game.showTitle();
  };
  W.hasUndo = function () { return !!undo; };
  (function restoreUndo(tries) {
    if (!(window.Game && Game.state && window.FCV && FCV.data)) { if (tries < 80) setTimeout(function () { restoreUndo(tries + 1); }, 400); return; }
    try { var u = JSON.parse(localStorage.getItem(UNDO_KEY) || 'null'); if (u && u.until > Date.now() + 500) W.offerUndo(u.label, u.before, u.until, u.reset); else localStorage.removeItem(UNDO_KEY); } catch (e) {}
  })(0);

  /* ---------------- open, close, keys ---------------- */
  W.open = function () {
    if (window.Kit && Kit.dropRadio) Kit.dropRadio(); /* AUDR3-04 */
    if (!mapImg && FCV.assetUrl('GM-MAP-01')) { mapImg = new Image(); mapImg.onload = function () { if (!$('worldmap').classList.contains('hidden')) draw(); }; mapImg.src = FCV.assetUrl('GM-MAP-01'); }
    if (Game.isBusy()) return;
    if (Game.kidDrive) { UI.toast(SC().session_copy.family.dads_job, 1400); return; }
    $('worldmap').classList.remove('hidden'); UI.letterbox();
    if (!$('wmFilms')) { var fb = document.createElement('button'); fb.id = 'wmFilms'; fb.className = 'btn small'; fb.type = 'button'; fb.textContent = 'Films'; $('wmList').parentNode.insertBefore(fb, $('wmList').nextSibling); fb.addEventListener('click', function () { W.close(); Game.runFlow(function () { return Director.shelf(); }); }); }
    /* phones and tablets open in list view (the drawn map is too small to tap there); the choice is remembered */
    /* QAD-m8: below 700 px the Map is always the list (the drawn map's nodes overlap there), whatever was chosen elsewhere */
    var pref = S().settings.mapView; listMode = window.innerWidth < 700 ? true : pref ? pref === 'list' : window.innerWidth < 1000;
    $('wmList').setAttribute('aria-pressed', listMode); $('wmList').textContent = listMode ? 'Map view' : 'Journey';
    build(); var nx = nodes.findIndex(function (x) { return x.state === 'next'; }); sel = nx >= 0 ? nx : 0;
    render(); highlight();
    var nd = nodes[sel]; if (nd && !listMode) { var b = $('wmNodes').querySelector('[data-n="' + sel + '"]'); if (b) b.scrollIntoView({ block: 'center', inline: 'center' }); }
    /* D1-m9: in family mode the Map opens with the focus on Back to the city, so mashed keys never start a step */
    if (S().settings.family) { try { $('wmClose').focus({ preventScroll: true }); } catch (e) {} }
  };
  W.close = function () { rCancel(false); $('worldmap').classList.add('hidden'); $('wmPanel').innerHTML = ''; UI.letterbox(); Game.afterUI(); };
  W.nodes = function () { build(); return nodes; };
  $('wmClose').addEventListener('click', W.close);
  $('wmList').addEventListener('click', function () { listMode = !listMode; S().settings.mapView = listMode ? 'list' : 'map'; FCV.stampSettings(S()); Game.save(); $('wmList').setAttribute('aria-pressed', listMode); $('wmList').textContent = listMode ? 'Map view' : 'Journey'; render(); highlight(); });
  window.addEventListener('resize', function () { if ($('worldmap').classList.contains('hidden')) return; if (window.innerWidth < 700 && !listMode) { listMode = true; $('wmList').setAttribute('aria-pressed', true); $('wmList').textContent = 'Map view'; } render(); });
  document.addEventListener('keydown', function (e) {
    if ($('worldmap').classList.contains('hidden') || !$('modal').classList.contains('hidden')) return;
    if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    var nd = nodes[sel];
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); W.close(); return; }
    if (/^Arrow/.test(e.key)) {
      e.preventDefault();
      var dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0, dy = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0, best = -1, bd = 1e9;
      if (listMode) { sel = Math.max(0, Math.min(nodes.length - 1, sel + (dx || dy))); highlight(); panel(); return; }
      nodes.forEach(function (o, i) { if (i === sel) return; var vx = o.x - nd.x, vy = o.y - nd.y, along = vx * dx + vy * dy; if (along <= 0) return; var d = along + Math.abs(vx * dy - vy * dx) * 2; if (d < bd) { bd = d; best = i; } });
      if (best >= 0) { sel = best; highlight(); panel(); }
      return;
    }
    /* D1-m9: in family mode Enter on a step only opens its panel (focus on Play now); it never plays at once */
    if (e.key === 'Enter' && document.activeElement && document.activeElement.classList.contains('wmNode')) { e.preventDefault(); if (S().settings.family) { panel(); var pb = $('wmPanel').querySelector('.btn.go, .btn'); if (pb) try { pb.focus({ preventScroll: true }); } catch (er) {} } else if (nd.state !== 'locked') act('play', nd); }
    else if ((e.key === 'r' || e.key === 'R') && !e.repeat) {
      /* D2-M4, QAD2-M1: R follows the shared hold rules (D1-M1). It starts only with no other key down (and, in family
         mode, only as Shift+R), fires on letting go of R after a full second, and any other key, Tab, blur, a hidden tab
         or the Map closing cancels it. */
      e.preventDefault();
      var fam = !!S().settings.family, others = Object.keys(keysDown).filter(function (k) { return k !== 'r' && !(fam && k === 'shift'); });
      if (fam && !e.shiftKey) { if (!rHold) UI.toast('In family mode, hold Shift+R to restart.', 1600); return; }
      if (others.length || !canRestart(nd) || rHold) return;
      rHold = { nd: nd, t0: performance.now(), ready: false, tm: setTimeout(function () { if (rHold) { rHold.ready = true; UI.toast('Let go of R to restart.', 1200); } }, 1000) };
      UI.toast('Keep holding R, then let go, to restart.', 1200);
    }
    else if ((e.key === 'p' || e.key === 'P') && nd.state === 'done') { e.preventDefault(); act('practice', nd); }
  });
  /* R must be held for a second (item 20) and let go: letting go early, or any other key, cancels */
  var rHold = null, keysDown = {};
  function rCancel(why) { if (!rHold) return; clearTimeout(rHold.tm); rHold = null; if (why) UI.toast('Restart cancelled.', 1200); }
  W.cancelHold = rCancel;
  document.addEventListener('keydown', function (e) { var k = String(e.key || '').toLowerCase(); if (rHold && k !== 'r' && !(k === 'shift' && S().settings.family)) rCancel(true); keysDown[k] = 1; }, true);
  document.addEventListener('keyup', function (e) {
    var k = String(e.key || '').toLowerCase(); delete keysDown[k]; if (k === 'meta' || k === 'control' || k === 'alt') keysDown = {};
    if (!rHold) return;
    if (k !== 'r') { if (!(k === 'shift' && S().settings.family)) rCancel(true); return; }
    var h = rHold; rCancel(false);
    if (!h.ready || performance.now() - h.t0 < 1000) { UI.toast('Restart cancelled.', 1200); return; }
    if ($('worldmap').classList.contains('hidden') || !$('modal').classList.contains('hidden') || nodes[sel] !== h.nd || !canRestart(h.nd)) return;
    W.restart(h.nd, false); render(); highlight();
  }, true);
  window.addEventListener('blur', function () { keysDown = {}; rCancel(false); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { keysDown = {}; rCancel(false); } });
  document.addEventListener('focusin', function () { if (rHold) rCancel(true); });
  window.WorldMap = W;
})();
