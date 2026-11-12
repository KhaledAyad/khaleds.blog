/* Freight City Viva v3: every new mechanic on the one mini-game engine. Act missions (Fill the Blank Quarter, Cast the
   Net, the Gate Run; v2's whistle, trial, scale and parcel keep their engines), the ten Methods missions, the Shift Check,
   the Waiting Room mock, the Chain Sprint, the Tune-up Bay and the sprints. Every shown string is a field or a card by id. */
(function () {
  'use strict';
  var X = {};
  var esc = function (s) { return UI.esc(s); };
  var S = function () { return Game.state; };
  var SC = function () { return FCV.data.script; };
  var MG = function () { return window.MiniGame; };
  var fig = function (id) { var r = FCV.resolve(id); return r ? (r.figure || r.number || '') : ''; };

  /* ---------------- stage pictures (SVG over the act's own still, no words except card figures by id) ----------------
     Each stage counts the items done; the newest one animates once (fog lifting, a book dropping, a bollard sinking, a
     parcel sliding down its chute, a lamp lighting). With the quiz path the stage is redrawn the moment an answer is
     right (right === true), so that redraw counts one more. */
  function svg(inner, h) { return '<svg viewBox="0 0 800 ' + (h || 220) + '" role="img" aria-hidden="true">' + inner + '</svg>'; }
  function countDone(st, right) { return Object.keys(st.done).length + (right === true ? 1 : 0); }
  function fresh(st, n) { if (n > (st.shown || 0)) { st.shown = n; return true; } if (n < (st.shown || 0)) st.shown = n; return false; }
  function quarters(st, def, right) {
    var n = countDone(st, right), anim = fresh(st, n), out = '', cols = ['#ff8a3d', '#f6c453', '#19c2b0', '#ff3d8b'];
    for (var i = 0; i < 4; i++) { var x = (i % 2) * 400, y = Math.floor(i / 2) * 110, lifted = i < n;
      out += '<rect x="' + (x + 6) + '" y="' + (y + 6) + '" width="388" height="98" rx="10" fill="none" stroke="#15101f" stroke-width="4"/>';
      if (lifted) for (var k = 0; k < 4; k++) out += '<g><rect x="' + (x + 30 + k * 90) + '" y="' + (y + 40) + '" width="64" height="56" rx="4" fill="#fff3e0" stroke="#15101f" stroke-width="3"/><path d="M' + (x + 26 + k * 90) + ' ' + (y + 42) + ' L' + (x + 62 + k * 90) + ' ' + (y + 18) + ' L' + (x + 98 + k * 90) + ' ' + (y + 42) + 'Z" fill="' + cols[i] + '" stroke="#15101f" stroke-width="3"/><rect x="' + (x + 54 + k * 90) + '" y="' + (y + 70) + '" width="16" height="26" fill="#15101f"/></g>';
      if (!lifted || (anim && i === n - 1)) out += '<g class="' + (lifted ? 'fogGo' : 'fogSway') + '"><rect x="' + (x + 6) + '" y="' + (y + 6) + '" width="388" height="98" rx="10" fill="rgba(226,222,236,.82)"/><ellipse cx="' + (x + 120) + '" cy="' + (y + 40) + '" rx="110" ry="26" fill="rgba(255,255,255,.55)"/><ellipse cx="' + (x + 270) + '" cy="' + (y + 72) + '" rx="120" ry="24" fill="rgba(255,255,255,.45)"/></g>';
      if (anim && i === n - 1) out += '<circle class="ringGo" cx="' + (x + 200) + '" cy="' + (y + 55) + '" r="30" fill="none" stroke="#ffd166" stroke-width="6"/>'; }
    return svg(out);
  }
  function tower(st, def, right) {
    var n = countDone(st, right), anim = fresh(st, n), miss = Object.keys(st.firstWrong).length, cols = ['#ffd166', '#19c2b0', '#ff8a3d', '#ff3d8b', '#7a5cff'];
    var out = '<path d="M60 20 Q400 120 740 20" stroke="#c9a46a" stroke-width="5" fill="none" stroke-dasharray="10 8"/><path d="M200 34 L400 98 L600 34" stroke="#c9a46a" stroke-width="3" fill="none" stroke-dasharray="6 6"/>';
    for (var i = 0; i < n; i++) out += '<g class="' + (anim && i === n - 1 ? 'bookGo' : '') + '"><rect x="' + (320 + (i % 2) * 12) + '" y="' + (186 - i * 32) + '" width="150" height="28" rx="4" fill="' + cols[i % 5] + '" stroke="#15101f" stroke-width="3"/><rect x="' + (338 + (i % 2) * 12) + '" y="' + (186 - i * 32) + '" width="8" height="28" fill="rgba(21,16,31,.45)"/><rect x="' + (444 + (i % 2) * 12) + '" y="' + (186 - i * 32) + '" width="8" height="28" fill="rgba(21,16,31,.45)"/></g>';
    if (anim && n) out += '<circle class="ringGo" cx="400" cy="' + (200 - (n - 1) * 32) + '" r="26" fill="none" stroke="#ffd166" stroke-width="5"/>';
    for (var j = 0; j < miss; j++) out += '<rect x="' + (610 + j * 36) + '" y="160" width="28" height="50" rx="3" fill="#7a5cff" stroke="#15101f" stroke-width="3" opacity=".85"/>';
    return svg(out);
  }
  function bikeSVG() {
    return '<g id="mgBike"><circle cx="-16" cy="0" r="12" fill="none" stroke="#15101f" stroke-width="5"/><circle cx="16" cy="0" r="12" fill="none" stroke="#15101f" stroke-width="5"/><path d="M-16 0 L-2 -16 L16 0 M-2 -16 L10 -16" stroke="#15101f" stroke-width="4" fill="none"/><rect x="-26" y="-34" width="18" height="16" rx="3" fill="#ff8a3d" stroke="#15101f" stroke-width="3"/><circle cx="0" cy="-36" r="9" fill="#19c2b0" stroke="#15101f" stroke-width="3"/></g>';
  }
  function rideStart(n) { return n === 0 ? 40 : 170 + (n - 1) * 160; }
  function rideEnd(n) { return n >= 4 ? 770 : 110 + n * 160; }
  function gantries(st, def, right) {
    var d = st.data, n = countDone(st, right), anim = fresh(st, n), out = '<rect x="20" y="150" width="760" height="34" rx="8" fill="#3a2f4d" opacity=".92"/><path d="M30 167 H770" stroke="#ffd166" stroke-width="3" stroke-dasharray="18 14"/>';
    for (var i = 0; i < 4; i++) { var x = 140 + i * 160, ok = i < n;
      out += '<rect x="' + (x - 6) + '" y="60" width="12" height="90" fill="#15101f"/><rect x="' + (x - 44) + '" y="50" width="88" height="18" rx="4" fill="#15101f"/><circle cx="' + x + '" cy="82" r="11" fill="' + (ok ? '#3ddc84' : '#ffb000') + '" stroke="#15101f" stroke-width="3"/>';
      if (!ok || (anim && i === n - 1)) out += '<rect class="' + (ok ? 'bollardGo' : '') + '" x="' + (x - 9) + '" y="128" width="18" height="26" rx="3" fill="#e6332a" stroke="#15101f" stroke-width="3"/>'; }
    var bx = right === true ? 170 + (n - 1) * 160 : d.riding ? rideStart(n) : 110 + Math.min(4, n) * 160;
    out += '<g transform="translate(' + Math.min(770, bx).toFixed(1) + ',158)">' + bikeSVG() + '</g>';
    if (S().settings.timers) out += '<text x="760" y="36" text-anchor="end" font-size="28" font-family="Bangers, Impact" fill="#ffd166" stroke="#15101f" stroke-width="1">' + Math.round(d.clock || 0) + ' s</text>';
    return svg(out);
  }
  function lamps(st, n, right) {
    var dn = countDone(st, right), anim = fresh(st, dn), out = '';
    for (var i = 0; i < n; i++) { var x = 60 + i * (680 / Math.max(1, n - 1)), on = i < dn;
      out += '<rect x="' + (x - 3) + '" y="120" width="6" height="80" fill="#15101f"/>' + (on ? '<circle cx="' + x + '" cy="104" r="34" fill="rgba(255,209,102,.28)"/>' : '') + '<circle class="' + (anim && i === dn - 1 ? 'lampGo' : '') + '" cx="' + x + '" cy="104" r="20" fill="' + (on ? '#ffd166' : '#3a2f4d') + '" stroke="#15101f" stroke-width="4"/>'; }
    return svg(out);
  }
  /* The Sorting Office: each claim drops as a parcel into its chute (finding left, proposition right). */
  function sortStage(st, def, right) {
    var n = countDone(st, right), anim = fresh(st, n), bins = { finding: 0, proposition: 0 }, out = '';
    out += '<path d="M110 20 L250 120 L250 210 L110 210 Z" fill="rgba(25,194,176,.35)" stroke="#15101f" stroke-width="4"/><path d="M690 20 L550 120 L550 210 L690 210 Z" fill="rgba(255,209,102,.35)" stroke="#15101f" stroke-width="4"/>';
    out += '<circle cx="180" cy="160" r="22" fill="none" stroke="#19c2b0" stroke-width="6"/><path d="M195 175 L215 195" stroke="#19c2b0" stroke-width="7"/><path d="M600 150 l20 -24 l20 24 l-12 0 l0 26 l-16 0 l0 -26 Z" fill="#ffd166" stroke="#15101f" stroke-width="3"/>';
    var doneIdx = Object.keys(st.done).map(Number).sort(function (a, b) { return a - b; }); if (right === true && st.queue && st.queue.length) doneIdx.push(st.queue[0]);
    doneIdx.forEach(function (i, k) {
      var it = def && def.items[i]; if (!it || it.kind !== 'chute') return;
      var side = it.answer === 'proposition' ? 1 : 0, c = bins[it.answer] = (bins[it.answer] || 0) + 1, x = side ? 600 : 140, y = 196 - (c - 1) * 22;
      out += '<rect class="' + (anim && k === doneIdx.length - 1 ? (side ? 'parcelGoR' : 'parcelGo') : '') + '" x="' + (x + (c % 2) * 8) + '" y="' + y + '" width="60" height="20" rx="3" fill="#c9a46a" stroke="#15101f" stroke-width="3"/>';
    });
    out += '<rect x="330" y="150" width="140" height="18" rx="6" fill="#3a2f4d"/><text x="400" y="60" text-anchor="middle" font-size="40" font-family="Bangers, Impact" fill="#fff3e0" stroke="#15101f" stroke-width="1">' + n + ' / ' + (def ? def.items.length : '') + '</text>';
    return svg(out);
  }
  /* QAD-m10: the Chain Sprint draws all five links of the chain: a link lights gold when its questions are done, the one
     being asked now is outlined in teal, the rest wait in grey */
  function chainLinks(st, def, right) {
    var groups = {}, items = (def && def.items) || []; items.forEach(function (it, i) { var k = it.link || 0; (groups[k] = groups[k] || []).push(i); });
    var n = Math.max(5, Object.keys(groups).length), out = '', cur = -1;
    for (var k = 0; k < n; k++) {
      var g = groups[k] || [], done = g.length && g.every(function (i) { return st.done[i]; });
      if (!done && cur < 0) cur = k;
      var cx = 90 + k * 155, col = done ? '#ffd166' : k === cur ? '#3dd6c6' : '#5b5266';
      out += '<ellipse cx="' + cx + '" cy="100" rx="62" ry="34" fill="none" stroke="' + col + '" stroke-width="14"' + (k === cur && !done ? ' stroke-dasharray="18 10"' : '') + '/>' +
        '<text x="' + cx + '" y="175" text-anchor="middle" font-size="26" font-family="Bangers, Impact" fill="' + (done || k === cur ? '#fff3e0' : '#8a8096') + '">Link ' + (k + 1) + '</text>';
    }
    return svg(out, 200);
  }
  function chainPic(st, def, right) { var n = countDone(st, right), anim = fresh(st, n), out = ''; for (var i = 0; i < Math.max(n, 1); i++) out += '<ellipse class="' + (anim && i === n - 1 ? 'lampGo' : '') + '" cx="' + (70 + i * 90) + '" cy="110" rx="40" ry="22" fill="none" stroke="' + (i < n ? '#ffd166' : '#5b5266') + '" stroke-width="10"/>'; return svg(out); }
  /* Backdrop cards: each figure in full, wrapped over as many lines as it needs, the font scaled to fit; never sliced. */
  function wrapWords(str, max) { var out = [], cur = ''; String(str).split(' ').forEach(function (w) { if (!cur) cur = w; else if ((cur + ' ' + w).length <= max) cur += ' ' + w; else { out.push(cur); cur = w; } }); if (cur) out.push(cur); return out; }
  function cardsPic(ids) {
    var n = Math.max(1, ids.length), gap = 20, w = Math.floor((760 - gap * (n - 1)) / n), h = 180;
    return svg(ids.map(function (id, i) {
      var f = String(fig(id)), x = 20 + i * (w + gap), fs = 32, lines;
      for (; fs >= 13; fs--) { lines = wrapWords(f, Math.max(6, Math.floor((w - 24) / (fs * 0.5)))); if (lines.length * fs * 1.15 <= h - 24) break; }
      var y0 = 20 + h / 2 - (lines.length - 1) * fs * 1.15 / 2 + fs * 0.35;
      return '<rect x="' + x + '" y="20" width="' + w + '" height="' + h + '" rx="10" fill="#fffaf0" stroke="#15101f" stroke-width="4"/><text data-fig="' + esc(f) + '" x="' + (x + w / 2) + '" y="' + y0.toFixed(1) + '" text-anchor="middle" font-size="' + fs + '" font-family="Bangers, Impact" fill="#15101f">' +
        lines.map(function (l, k) { return '<tspan x="' + (x + w / 2) + '" dy="' + (k ? (fs * 1.15).toFixed(1) : 0) + '">' + esc(l) + '</tspan>'; }).join('') + '</text>';
    }).join(''));
  }
  /* build check: every backdrop card shows its whole figure */
  X.figuresCheck = function () {
    var bad = [], box = document.createElement('div');
    [['ch2-01', 'ch2-06'], ['ch3-10', 'ch4-11']].forEach(function (ids) {
      box.innerHTML = cardsPic(ids);
      Array.prototype.forEach.call(box.querySelectorAll('[data-fig]'), function (t, i) { var shown = Array.prototype.map.call(t.querySelectorAll('tspan'), function (x) { return x.textContent; }).join(' '); if (shown !== String(fig(ids[i]))) bad.push(ids[i] + ': "' + shown + '"'); });
    });
    return bad;
  };
  function hump(st, def, right) { var n = countDone(st, right), anim = fresh(st, n), out = '<path d="M40 200 C 250 200, 300 40, 400 40 S 550 200, 760 200" fill="none" stroke="#19c2b0" stroke-width="5"/>'; for (var i = 0; i < n; i++) out += '<circle class="' + (anim && i === n - 1 ? 'lampGo' : '') + '" cx="' + (360 + (i - n / 2) * 30) + '" cy="' + (60 + i * 8) + '" r="12" fill="#ffd166" stroke="#15101f" stroke-width="3"/>'; return svg(out); }
  function dials(st, def, right) { var n = countDone(st, right), anim = fresh(st, n), out = ''; for (var i = 0; i < 13; i++) { var x = 40 + (i % 7) * 110, y = i < 7 ? 60 : 160; out += '<g class="' + (anim && i === n - 1 ? 'lampGo' : '') + '"><circle cx="' + x + '" cy="' + y + '" r="34" fill="' + (i < 8 ? '#ffe9cc' : '#fff') + '" stroke="#15101f" stroke-width="4"/><line x1="' + x + '" y1="' + y + '" x2="' + (x + 24 * Math.cos(i < n ? -0.3 : 2)) + '" y2="' + (y + 24 * Math.sin(i < n ? -0.3 : 2)) + '" stroke="#15101f" stroke-width="5"/></g>'; } return svg(out); }

  /* ---------------- act missions ---------------- */
  /* SD-23: one goal line on the task screen until the game has been finished once */
  X.GOALS = {
    fill_the_blank_quarter: 'Answer [n] questions right to clear the fog from the Blank Quarter.',
    cast_the_net: 'Answer [n] questions right to haul a book onto the tower.',
    gate_run: 'Ride past [n] gantries. A right answer drops the bollard; a wrong one adds 10 seconds.',
    found_or_proposed_chute: 'Drop each line in the right chute: Finding or Proposition.',
    put_the_flow_in_order: 'Put the counts in order, top to bottom. Then answer the questions.',
    stepping_stones: 'Put the steps in the order the thesis took them. Then answer the questions.',
    referral_chain: 'Each right answer adds a link to the chain of introductions.',
    two_desks: 'Each question comes twice. Get both right to light the lamp.',
    quality_gate: 'Say each answer aloud, then reveal it and tick what you said.',
    switchboard: 'Flip the switches and watch the meter. Then answer the questions.',
    shuffle_table: 'Answer the questions: each right answer drops a marker on the table.',
    dials: 'Turn the dials that decide the answer. Then answer the questions.',
    falsifier_match: 'Match each proposition to what would prove it wrong. Then answer the questions.'
  };
  var JOB = { 1: 'broadcast', 2: 'haul', 5: 'permit' };
  X.actMission = async function (n, replay) {
    var a = SC().acts[n - 1], mech = a.mission.mechanic || {}, items = (a.mission.items || []).map(function (x) { return { id: x.quiz, framing: x.framing }; });
    if (!/fill_the_blank_quarter|cast_the_net|gate_run/.test(mech.type || '')) { await Mechanics.run(n, replay); return { done: true }; }
    var def = { key: 'act' + n + ':mission', title: 'Mission: ' + a.mission.name, giver: a.mission.giver, items: items, practice: !!replay, job: JOB[n], backdrop: mech.backdrop || FCV.actBackdrop[n], goal: X.GOALS[mech.type] ? X.GOALS[mech.type].replace('[n]', items.length) : '' };
    /* D-02: the step, the stamp and the mission record are saved the moment the run is finished */
    def.onDone = function (r) { if (replay) return; Flows.giveStamp(n, r.stamp); FCV.markDone(S(), n, 'mission'); FCV.actState(S(), n).mission = null; if (S().resumeStep && S().resumeStep.act === n && S().resumeStep.step === 'mission') S().resumeStep = null; };
    if (mech.type === 'fill_the_blank_quarter') def.stageHTML = quarters;
    if (mech.type === 'cast_the_net') { def.stageHTML = tower; def.onWrong = function () { if (window.Sound) Sound.sfx('page flip'); }; def.onRight = function () { if (window.Sound) Sound.sfx('net haul'); }; }
    if (mech.type === 'gate_run') {
      await Flows.clockOffer('gate');
      def.timed = !!S().settings.timers;
      def.init = function () { return { clock: 0, fines: 0 }; };
      def.stageHTML = gantries;
      def.item = async function (it, api) {
        /* ride to the next gantry; Up pedals hard, Down brakes; the clock pauses while the card is open */
        await ride(api, 2600);
        var ok = await api.quiz(it.id, { framing: it.framing });
        if (!ok) { api.state.data.fines++; api.state.data.clock += 10; if (window.Sound) Sound.sfx('clock chime'); } else if (window.Sound) Sound.sfx('bollard drop');
        return ok;
      };
      def.afterPending = function (ok, api) { if (!ok) { api.state.data.fines++; api.state.data.clock += 10; } };
      def.finish = async function (r) { r.par = r.data.clock <= 70; if (r.data.fines === 0 && r.par) r.stamp = 'gold'; else if (r.data.fines <= 1) r.stamp = 'silver'; else r.stamp = 'bronze'; if (window.Director) await Director.film('gate_run_finish'); };
    }
    var res = await MG().run(def);
    if (res.quit) throw UI.LEAVE;
    if (!replay) Flows.giveStamp(n, res.stamp);
    return res;
  };
  /* The bike steers itself to the next gantry; Up or W pedals hard, Down or S brakes; near the gantry time slows. */
  function ride(api, ms) {
    var st = api.state.data, t0 = performance.now(), fast = false, slow = false;
    st.riding = true;
    var body = api.frame('<p class="dir">' + (UI.kb() ? 'Riding to the next gantry. Hold Pedal hard (or Up or W) to go faster; Down or S brakes.' : 'Riding to the next gantry. Hold Pedal hard to go faster.') + '</p><div class="actions"><button class="btn go" type="button">Pedal hard</button></div>');
    var kd = function (e) { if (/ArrowUp|^w$|^W$/.test(e.key)) fast = true; if (/ArrowDown|^s$|^S$/.test(e.key)) slow = true; };
    var ku = function () { fast = false; slow = false; };
    document.addEventListener('keydown', kd); document.addEventListener('keyup', ku);
    body.querySelector('.btn.go').addEventListener('pointerdown', function () { fast = true; }); body.querySelector('.btn.go').addEventListener('pointerup', function () { fast = false; });
    var stg = api.box.querySelector('.mgStage'), n = Object.keys(api.state.done).length, lastClock = -1;
    return new Promise(function (res) {
      var last = t0, prog = 0;
      (function tick(now) {
        var near = prog * 1000 > ms * 0.78, dt = (now - last) / 1000; last = now;
        prog += dt * (fast ? 1.6 : slow ? 0.5 : 1) * (near ? 0.35 : 1);
        if (S().settings.timers) st.clock += dt;
        var frac = Math.min(1, prog * 1000 / ms), bike = stg && stg.querySelector('#mgBike'), bx = rideStart(n) + (rideEnd(n) - rideStart(n)) * (1 - Math.pow(1 - frac, 2));
        if (bike) bike.parentNode.setAttribute('transform', 'translate(' + bx.toFixed(1) + ',' + (158 + (Math.sin(now / 90) * 1.5)).toFixed(1) + ')');
        if (stg) stg.classList.toggle('slowmo', near);
        if (stg && S().settings.timers && Math.round(st.clock) !== lastClock) { lastClock = Math.round(st.clock); var tx = stg.querySelector('text'); if (tx) tx.textContent = lastClock + ' s'; }
        if (prog * 1000 >= ms) { st.riding = false; document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku); if (stg) stg.classList.remove('slowmo'); res(); }
        else requestAnimationFrame(tick);
      })(t0);
    });
  }

  /* ---------------- the ten Methods missions ---------------- */
  function lessonOf(mid) { return SC().methods_academy.lessons.filter(function (l) { return l.id === mid; })[0]; }
  function probeItems(mi) {
    var out = [];
    (mi.core_lessons || []).forEach(function (mid) {
      var L = lessonOf(mid); if (!L) return;
      (L.probes || []).forEach(function (p) { if (FCV.resolve(p.id)) out.push({ id: p.id, format: p.format }); });
    });
    return out;
  }
  function sayOrPick(it, api) {
    var r = FCV.resolve(it.id);
    if (it.format === 'say_then_reveal' || (r && r.type !== 'quiz')) return MG().sayHere(Object.assign({}, r), {}, api);
    return api.quiz(it.id, { framing: it.framing, grey: it._grey });
  }
  X.methodsMission = async function (key, replay) {
    var mi = SC().methods_academy.missions[key]; if (!mi) return { done: true };
    var items = probeItems(mi), pre = [], stage = null, job = 'light';
    var def = { key: 'methods:' + key, title: mi.name, giver: mi.giver, practice: !!replay, job: job, backdrop: FCV.assetUrl('LS02') ? 'LS02' : 'S11', goal: X.GOALS[mi.mechanic] || '' };
    var mech = mi.mechanic;
    if (mech === 'found_or_proposed_chute') {
      pre = FCV.shuffle(SC().drills.finding_or_proposition.items.map(function (x) { return { id: x.id, kind: 'chute', answer: x.answer }; }), FCV.rng(FCV.hash32('chute:' + key)));
      stage = sortStage;
    } else if (mech === 'put_the_flow_in_order' || mech === 'stepping_stones') {
      (mi.core_lessons || []).forEach(function (mid) { var m = FCV.methodById(mid); if (m && m.steps.length >= 3) pre.push({ id: mid, kind: 'order' }); });
      stage = mech === 'put_the_flow_in_order' ? function () { return cardsPic(['ch2-01', 'ch2-06']); } : function (st, d, right) { return lamps(st, pre.length + items.length, right); };
    } else if (mech === 'referral_chain') stage = chainPic;
    else if (mech === 'two_desks') { items = items.map(function (it) { return Object.assign({ desks: true }, it); }); stage = function (st, d, right) { return lamps(st, items.length, right); }; }
    else if (mech === 'quality_gate') {
      (mi.core_lessons || []).forEach(function (mid) { var m = FCV.methodById(mid); if (m && m.why) pre.push({ id: mid, kind: 'why' }); if (m && m.notThis) pre.push({ id: mid, kind: 'not' }); });
      stage = function (st, d, right) { return lamps(st, pre.length + items.length, right); };
    } else if (mech === 'switchboard') { pre = [{ id: 'switch', kind: 'switch' }]; stage = function () { return cardsPic(['ch3-10', 'ch4-11']); }; }
    else if (mech === 'shuffle_table') stage = hump;
    else if (mech === 'dials') stage = dials;
    else if (mech === 'falsifier_match') { pre = FCV.data.story.thesis.propositions.map(function (p) { return { id: p.id, kind: 'falsifier' }; }); stage = function (st, d, right) { return lamps(st, pre.length + items.length, right); }; }
    def.items = pre.concat(items); def.stageHTML = stage;
    def.item = function (it, api) {
      if (it.kind === 'chute') return chute(it, api);
      if (it.kind === 'order') return orderSteps(it, api);
      if (it.kind === 'why' || it.kind === 'not') { var m = FCV.methodById(it.id); return MG().sayHere({ id: 'method:' + m.id + '.' + it.kind, type: 'eq', question: m.term + (it.kind === 'why' ? ': why this?' : ': why not the alternative?'), answer: it.kind === 'why' ? m.why : m.notThis, loc: (m.raw.sections || []).join('; ') }, { noRecord: true }, api); }
      if (it.kind === 'switch') return switchboard(it, api);
      if (it.kind === 'falsifier') return falsifier(it, api);
      if (it.desks) return twoDesks(it, api);
      return sayOrPick(it, api);
    };
    if (!def.items.length) return { done: true };
    /* teach before asking: the mission's core lessons are offered first if they have not been played */
    var untaught = (mi.core_lessons || []).filter(function (mid) { return FCV.methodById(mid) && !(S().methods.lessons[mid] || {}).done; });
    if (!replay && untaught.length && window.Academy && !(S().resume && S().resume.key === def.key)) {
      var tf = await UI.modal(mi.name, '<p>This mission asks about:</p><ul class="tightList">' + untaught.map(function (mid) { return '<li>' + esc(FCV.methodById(mid).term) + '</li>'; }).join('') + '</ul><p>Hear the short version of ' + (untaught.length === 1 ? 'its lesson' : 'those lessons') + ' first: the plain meaning and one example (about ' + untaught.length + ' min)?</p>', [{ label: 'Teach me first', value: 1, cls: 'go' }, { label: 'Straight in', value: 0 }]);
      /* Leave for now inside a lesson leaves the whole thing: no next lesson, no mission */
      /* SD-23: Teach me first gives the plain meaning and one example per lesson; the full lesson stays in the Academy */
      if (tf) { for (var u = 0; u < untaught.length; u++) { var lr = await Academy.brief(untaught[u]); if (lr && lr.left) throw UI.LEAVE; } UI.toast('The full lessons are in the Methods Academy whenever you want them.', 3000); }
    }
    /* D-02: the mission record and its act step are saved before the results screen */
    var recorded = false;
    var record = function (r) {
      if (replay) return;
      var mm = S().methods.missions[key] || (S().methods.missions[key] = {}); mm.done = true; mm.doneAt = mm.doneAt || Date.now(); var RK = { bronze: 1, silver: 2, gold: 3 }; if ((RK[r.stamp] || 0) > (RK[mm.stamp] || 0)) mm.stamp = r.stamp;
      (mi.core_lessons || []).forEach(function (mid) { var L = S().methods.lessons[mid] || (S().methods.lessons[mid] = { step: 0 }); if (typeof L.step !== 'number') L.step = 0; L.core = true; });
      for (var an = 1; an <= 7; an++) FCV.actSteps(an).forEach(function (s) { if (s.kind === 'methods' && s.key === key) { FCV.markDone(S(), an, s.id); if (S().resumeStep && S().resumeStep.act === an && S().resumeStep.step === s.id) S().resumeStep = null; } });
      if (!recorded) { recorded = true; Game.snapshot('Methods mission: ' + mi.name); }
    };
    def.onDone = record;
    var res = await MG().run(def);
    if (res.quit) throw UI.LEAVE;
    record(res);
    return res;
  };
  function chute(it, api) {
    var r = FCV.resolve(it.id);
    /* the claim alone: its label, "The first finding, that" and "the thesis proposes" would give the answer away; the full card shows in the feedback */
    var claim = String(r.text || r.figure).replace(/^The (?:first|second|third|fourth|fifth) finding, that /i, '').replace(/,? the thesis proposes,/i, '');
    claim = FCV.stripRefs(claim).replace(/^And so,?\s+/i, '');
    claim = claim.charAt(0).toUpperCase() + claim.slice(1);
    var body = api.frame('<div class="dropCard">' + esc(claim) + '</div><div class="chute"><button class="bin pickable" type="button" data-v="finding">Finding</button><button class="bin pickable" type="button" data-v="proposition">Proposition</button></div><div class="fb"></div>');
    return new Promise(function (resolve, reject) {
      api.reject = reject; var done = false;
      Array.prototype.forEach.call(body.querySelectorAll('[data-v]'), function (b) { b.addEventListener('click', function () {
        if (done) return; done = true; var ok = b.getAttribute('data-v') === it.answer; Array.prototype.forEach.call(body.querySelectorAll('[data-v]'), function (x) { x.disabled = true; });
        window.Juice[ok ? 'right' : 'wrong'](b); if (ok && window.Sound) Sound.sfx('bike bell');
        Flows.record(it.id, ok ? 'right' : 'wrong'); if (api.answered) api.answered(ok);
        body.querySelector('.fb').innerHTML = '<div class="verdict"><span class="verdictStamp ' + (ok ? 'r' : 'w') + '">' + (ok ? 'Right chute' : 'Back up the chute') + '</span></div>' + UI.cardHTML(it.id) + '<div class="actions"><button class="btn go" type="button">Next</button></div>';
        body.querySelector('.fb .btn.go').addEventListener('click', function () { resolve(ok); });
      }); });
    });
  }
  function orderSteps(it, api) {
    var m = FCV.methodById(it.id), steps = m.steps.slice(0, 5), shuffled = FCV.shuffle(steps.map(function (s, i) { return i; })), placed = [];
    var body = api.frame('<div class="line">' + esc(m.term) + ': put the steps in the thesis\'s order.</div><div class="built orderBuilt"></div><div class="orderList">' + shuffled.map(function (i) { return '<button class="opt pickable" type="button" data-o="' + i + '">' + esc(steps[i]) + '</button>'; }).join('') + '</div><div class="fb"></div>');
    return new Promise(function (resolve, reject) {
      api.reject = reject; var miss = 0;
      Array.prototype.forEach.call(body.querySelectorAll('[data-o]'), function (b) { b.addEventListener('click', function () {
        var i = +b.getAttribute('data-o');
        if (i === placed.length) { placed.push(i); b.disabled = true; b.style.opacity = '.45'; window.Juice.right(b); body.querySelector('.orderBuilt').textContent = placed.length + ' of ' + steps.length + ' stones lit';
          if (placed.length === steps.length) { Flows.record('method:' + m.id, miss ? 'partly' : 'right'); if (api.answered) api.answered(miss <= 1); body.querySelector('.fb').innerHTML = '<div class="actions"><button class="btn go" type="button">Next</button></div>'; body.querySelector('.fb .btn.go').addEventListener('click', function () { resolve(miss <= 1); }); } }
        else { miss++; window.Juice.wrong(b); }
      }); });
    });
  }
  function twoDesks(it, api) {
    return sayOrPick(it, api).then(function (ok1) {
      var mid = it.id.split(':')[1], m = FCV.methodById(mid); if (!m) return ok1;
      var others = FCV.shuffle(FCV.methods.filter(function (x) { return x.id !== mid; })).slice(0, 3);
      var opts = FCV.shuffle([m].concat(others));
      var q = { id: null, type: 'quiz', q: m.plain, options: opts.map(function (x) { return x.term; }), answer: opts.indexOf(m), explanation: m.plain, loc: (m.raw.sections || []).join('; ') };
      return MG().quizHere(q, { noRecord: true, framing: 'The second desk: which term is this?' }, api).then(function (ok2) { if (ok1 && ok2 && window.Sound) Sound.sfx('chain clink'); return ok1 && ok2; });
    });
  }
  function switchboard(it, api) {
    var body = api.frame('<div class="line">Toggle rule 1a and read the meter from the cards.</div><div class="levers"><button class="switch" type="button" aria-pressed="false" data-sw="1">Rule 1a</button></div><div class="cards2"></div><div class="fb"><div class="actions"><button class="btn go" type="button">Next</button></div></div>');
    var cards = body.querySelector('.cards2');
    var show = function (on) { cards.innerHTML = UI.cardHTML(on ? 'ch4-11' : 'ch3-10'); };
    show(false);
    body.querySelector('[data-sw]').addEventListener('click', function (e) { var b = e.currentTarget, on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); show(on); if (window.Sound) Sound.sfx('badge flip'); });
    return new Promise(function (resolve, reject) { api.reject = reject; body.querySelector('.fb .btn.go').addEventListener('click', function () { resolve(true); }); });
  }
  function falsifier(it, api) {
    var props = FCV.data.story.thesis.propositions, p = props.filter(function (x) { return x.id === it.id; })[0];
    var opts = FCV.shuffle([p].concat(FCV.shuffle(props.filter(function (x) { return x.id !== p.id; })).slice(0, 3)));
    var q = { id: 'falsifier:' + p.id, type: 'quiz', q: p.id + ': ' + p.name + '. What would falsify it?', options: opts.map(function (x) { return x.falsified_by; }), answer: opts.indexOf(p), explanation: p.falsified_by, loc: FCV.data.story.thesis.propositions_section };
    return MG().quizHere(q, { noRecord: true }, api).then(function (ok) { Flows.record('falsifier:' + p.id, ok ? 'right' : 'wrong'); return ok; });
  }

  /* ---------------- Shift Check: before every closer; MASTERED or CLEARED, Second Pass ---------------- */
  X.shiftCheck = async function (n, replay) {
    var a = SC().acts[n - 1], pool = Mastery.shiftCheckItems(n);
    var v = await UI.modal('Shift Check', '<p>' + esc(SC().mastery.shift_check.result.split('.')[0]) + '. Six items from ' + esc(a.district.name) + ', think first.</p>', [{ label: 'Start the check', value: 1, cls: 'go' }, { label: 'Not now', value: 0 }]);
    if (!v) { pool.quiz.forEach(function (id) { var r = S().mem[id]; if (r) r.last = Math.min(r.last, FCV.dayIndex(S()) - 1); }); return { skipped: true }; }
    Mastery.examContext = 'shift';
    var items = pool.quiz.map(function (id) { return { id: id } }).concat([{ id: pool.tp, say: true }]);
    var def = { key: 'act' + n + ':shift_check', title: 'Shift Check: ' + a.district.name, items: items, practice: !!replay, job: 'stamp',
      item: function (it, api) { if (it.say) return MG().sayHere(FCV.resolve(it.id), {}, api); return Flows.examQuiz ? Flows.examQuiz(it.id, api) : api.quiz(it.id, { exam: true }); },
      mastered: function (r) { return r.wrongFirst <= 1 ? 'MASTERED. The windows of ' + a.district.name + ' light up.' : 'CLEARED'; },
      /* D-02: the check counts as done before its results screen */
      onDone: function (r) { if (replay) return; FCV.markDone(S(), n, 'shift_check'); if (r.wrongFirst <= 1) FCV.actState(S(), n).mastered = true; } };
    var res = await MG().run(def); Mastery.examContext = null;
    if (res.quit) throw UI.LEAVE;
    var mastered = res.wrongFirst <= 1;
    if (mastered) { FCV.actState(S(), n).mastered = true; }
    else if (res.missed.length) {
      /* Second Pass: each miss re-taught in a different form, then a parallel check */
      var go = await UI.modal('Second Pass', '<p>CLEARED. About four minutes to re-teach the ' + res.missed.length + ' you missed, in a different form.</p>', [{ label: 'Second Pass', value: 1, cls: 'go' }, { label: 'Not now', value: 0 }]);
      if (go) {
        UI.open('Second Pass', a.district.name, FCV.actBackdrop[n]);
        try {
          for (var i = 0; i < res.missed.length; i++) {
            var id = res.missed[i], r = FCV.resolve(id), card = FCV.drillFor(r && r.loc, 1)[0];
            if (card) await UI.say('digits', '', { fact: card, hint: 'The card behind it.' });
            var sib = FCV.actItems(n).filter(function (x) { var rr = FCV.resolve(x); return x !== id && rr && rr.type === 'quiz' && rr.loc === (r && r.loc); })[0];
            if (sib) { var ok = await UI.quiz(sib, { who: 'digits', framing: 'A parallel check.' }); Flows.record(sib, ok ? 'right' : 'wrong'); }
          }
        } finally { UI.close(); }
      }
    }
    return res;
  };

  /* ---------------- the Waiting Room mock (never a bank item) ---------------- */
  var TOPIC_OF_CH = { 1: 'question and objectives', 2: 'literature and gap', 3: 'method and design', 4: 'findings', 5: 'findings', 6: 'proposition and red-cell rule', 7: 'contribution' };
  function mockPool() {
    var out = [], d = FCV.data;
    d.story.acts.forEach(function (a, i) { a.examiner_questions.forEach(function (e, k) { out.push({ id: 'ch' + (i + 1) + '-eq' + (k + 1), t: TOPIC_OF_CH[i + 1], d: i < 3 ? 1 : 2 }); }); });
    d.facts.appendices.forEach(function (ap) { ap.examiner_questions.forEach(function (e, k) { out.push({ id: 'app-' + ap.letter + '-eq' + (k + 1), t: 'appendices', d: 2 }); }); });
    d.facts.gaps_and_honest_answers.forEach(function (g, i) { out.push({ id: 'gap-' + String(i + 1).padStart(2, '0'), t: 'limitations and reflexivity', d: 3, killer: true }); });
    FCV.methods.forEach(function (m) { m.viva.forEach(function (v, k) { out.push({ id: 'method:' + m.id + ':v' + (k + 1), t: 'method and design', d: 2 }); }); });
    d.story.thesis.propositions.forEach(function (p) { out.push({ id: 'falsifier:' + p.id, t: 'theory', d: 2, pick: true }); });
    Object.keys(F_HELD()).forEach(function (id) { var o = out.filter(function (x) { return x.id === id; })[0]; if (o) { o.killer = true; o.d = 3; } });
    return out.filter(function (x) { return FCV.resolve(x.id); });
  }
  function F_HELD() { return (window.Flows && Flows.HELD) || {}; }
  X.drawMock = function (st, rng) {
    rng = rng || Math.random;
    var pool = mockPool(), seen = st.wr.seen || {}, topics = {};
    pool.forEach(function (q) { (topics[q.t] = topics[q.t] || []).push(q); });
    var fresh = function (a, b) { return (seen[a.id] ? 1 : 0) - (seen[b.id] ? 1 : 0) || rng() - 0.5; };
    var killers = pool.filter(function (q) { return q.killer; }).sort(fresh).slice(0, 3), chosen = killers.slice(), taken = {};
    chosen.forEach(function (q) { taken[q.id] = 1; });
    Object.keys(topics).forEach(function (t) { var q = topics[t].filter(function (x) { return !taken[x.id] && !x.killer; }).sort(fresh)[0]; if (q && chosen.length < 14) { chosen.push(q); taken[q.id] = 1; } });
    var rest = pool.filter(function (x) { return !taken[x.id] && !x.killer; }).sort(fresh);
    while (chosen.length < 14 && rest.length) { var r = rest.shift(); chosen.push(r); }
    var nk = chosen.filter(function (q) { return !q.killer; }).sort(function (a, b) { return a.d - b.d || rng() - 0.5; });
    var ks = chosen.filter(function (q) { return q.killer; });
    var order = nk.slice(0, 4).concat(FCV.shuffle(nk.slice(4).concat(ks.slice(0, ks.length - 1)), rng)).concat(ks.slice(-1));
    for (var i = 0; i < 4; i++) if (order[i] && order[i].killer) { for (var j = 4; j < order.length - 1; j++) if (!order[j].killer) { var tmp = order[i]; order[i] = order[j]; order[j] = tmp; break; } }
    return order;
  };
  X.doorsLine = function (n) { var t = SC().session_copy.end_card.doors; return n > 0 ? t.replace('[n]', n) : "On today's form you would pass fewer than 1 try in 10."; };
  /* The Waiting Room on the Hall's examiner stage: the clean plate, the two seated examiners (the asker lit), the table
     edge, and five hearts. Poses: listen, killer (a two-heart question), nod (right), write (wrong). */
  var WR_POSE = { dr_tally: { listen: 'TS18', killer: 'TS19', write: 'TS20', nod: 'TS21' }, prof_kerbstone: { listen: 'TS22', killer: 'TS23', write: 'TS24', nod: 'TS25' } };
  function wrStage(d) {
    var pose = d.pose || { who: 'dr_tally', kind: 'listen' }, u = function (k) { return FCV.assetUrl(k) || ''; };
    var img = function (who, side) { var k = who === pose.who ? (WR_POSE[who][pose.kind] || WR_POSE[who].listen) : WR_POSE[who].listen; return '<img alt="" class="wrPup ' + side + (who === pose.who ? '' : ' dim') + '" src="' + u(k) + '">'; };
    var h = ''; for (var i = 0; i < 5; i++) h += '<text x="' + (40 + i * 64) + '" y="58" font-size="52" fill="' + (i < d.hearts ? '#ff3b5c' : '#3a2c47') + '" stroke="#15101f" stroke-width="2">♥</text>';
    return '<div class="wrStage" style="background-image:url(' + u('TS26') + ')">' + img('dr_tally', 'l') + img('prof_kerbstone', 'r') + (u('TE10') ? '<img alt="" class="wrTable" src="' + u('TE10') + '">' : '') + '<svg class="wrHearts" viewBox="0 0 360 70" aria-hidden="true">' + h + '</svg></div>';
  }
  X.waitingRoom = async function () {
    var st = S(); st.wr = st.wr || { attempts: [], passes: 0 }; st.wr.seen = st.wr.seen || {}; st.wr.answers = st.wr.answers || [];
    var back = st.resume && st.resume.kind === 'run' && st.resume.key === 'waiting-room' ? st.resume : null;
    var before = back && back.state.data.before ? back.state.data.before : await Mastery.predict();
    if (!back) {
      /* ND2 (round 5): in family mode the mock viva starts only from the hold the Hall door asks for; Enter lands on Not now */
      var famW = !!st.settings.family;
      var v = await UI.modal('The Waiting Room', '<p>A mock viva: 14 questions in three rounds, five hearts, never a question from the Hall. ' + Mastery.doorsHTML(before.doors) + ' ' + esc(X.doorsLine(before.doors)) + '</p>', [{ label: 'Take the mock', value: 1, cls: 'go', hold: famW }, { label: 'Not now', value: 0 }], { focusSafe: famW });
      if (!v) return;
    }
    var order = back ? back.items : X.drawMock(st).map(function (q) { return { id: q.id, t: q.t, killer: !!q.killer, pick: !!q.pick }; });
    Mastery.examContext = 'mock';
    /* hearts, streak and the hearts lost live in the run's own state, so a closed tab resumes the mock where it was */
    var D = function (api) { return api.state.data; };
    var def = { key: 'waiting-room', title: 'The Waiting Room', items: order, boss: true, practice: true, resumable: true, noRequeue: true, noResults: true, noPending: true,
      init: function () { return { hearts: 5, streak: 0, restored: false, lost: [], before: { pass: before.pass, doors: before.doors } }; },
      stageHTML: function (state) { return wrStage(state.data); },
      item: async function (it, api) {
        var r = FCV.resolve(it.id), ok, rate, d = D(api);
        d.pose = { who: (d.lost.length + Object.keys(api.state.done).length) % 2 ? 'prof_kerbstone' : 'dr_tally', kind: it.killer ? 'killer' : 'listen' };
        if (it.pick) ok = await falsifier({ id: it.id.split(':')[1] }, api);
        else { ok = await MG().sayHere(r, {}, api); rate = api.lastRate; }
        st.wr.seen[it.id] = 1; st.wr.answers.push({ t: it.t, ok: ok && rate !== 'partly' });
        if (rate === 'partly') { d.streak = 0; return true; }
        if (ok) { d.streak++; if (d.streak >= 4 && !d.restored && d.hearts < 5) { d.hearts++; d.restored = true; UI.toast('Four in a row: a heart comes back.', 2000); } }
        else { d.hearts -= it.killer ? 2 : 1; d.streak = 0; d.lost.push(it.id); if (window.Family) Family.react('killer'); }
        if (d.hearts <= 0) api.state.queue = [];
        d.pose = { who: d.pose.who, kind: ok ? 'nod' : 'write' };
        var stg = api.box.querySelector('.mgStage'); if (stg) stg.innerHTML = wrStage(d);
        return ok;
      } };
    var res = await MG().run(def); Mastery.examContext = null;
    if (res.quit) return;
    var hearts = res.data.hearts, lost = res.data.lost;
    var passed = hearts > 0;
    st.wr.attempts.push({ at: Date.now(), hearts: Math.max(0, hearts), passed: passed });
    st.wr.streak3 = passed && hearts >= 3 ? (st.wr.streak3 || 0) + 1 : 0;
    if (passed) st.wr.passes = (st.wr.passes || 0) + 1;
    Mastery.bump(); Game.flush();
    /* every lost question gets a teach link: its own place, else its Methods lesson, else the place of a card linked to it */
    var teachOf = function (id) {
      var p = Flows.placeOf(id); if (p) return { go: p };
      var mm = /^(?:say:|recall:)?method:([a-z0-9_]+)/.exec(id); if (mm && FCV.methodById(mm[1]) && window.Academy) return { lesson: mm[1] };
      var fm = /^falsifier:(P\d)$/.exec(id); if (fm) { var pa = Flows.placeOf('ch7-tp'); if (pa) return { go: pa }; }
      var reg = window.Mastery && Mastery.registry ? Mastery.registry() : [], hit = reg.filter(function (x) { return x.id === id || (x.probes || []).indexOf(id) >= 0; })[0];
      if (hit && hit.home) { var hm = /^act(\d)$/.exec(hit.home); if (hm) return { go: { kind: 'act', act: +hm[1] } }; }
      return null;
    };
    var dbHtml = lost.map(function (id) { var t = teachOf(id), rq = FCV.resolve(id) || {}; return '<div class="set"><span>' + esc(rq.question || rq.gap || (rq.label && rq.figure ? rq.label + ': ' + rq.figure : rq.label) || 'A question you missed') + '</span>' + (t && t.go ? '<button class="btn small" type="button" data-go="' + esc(JSON.stringify(t.go)) + '">Go teach me</button>' : t && t.lesson ? '<button class="btn small" type="button" data-lesson="' + esc(t.lesson) + '">Go teach me</button>' : '') + '</div>'; }).join('');
    var w = await UI.modal(passed ? 'Mock passed' : 'Mock not passed', '<p>Predicted before this mock: ' + Math.round(before.pass * 100) + ' per cent. ' + (passed ? 'You passed' : 'Not this time') + ', with ' + Math.max(0, hearts) + ' hearts.</p>' + (dbHtml ? '<h4>Every heart lost</h4>' + dbHtml : ''), [{ label: 'Back to the city', value: 0, cls: 'go' }], { onOpen: function (box) {
      Array.prototype.forEach.call(box.querySelectorAll('[data-go]'), function (b) { b.addEventListener('click', function () { document.getElementById('modal').classList.add('hidden'); UI.letterbox(); Game.travelTo(JSON.parse(b.getAttribute('data-go'))); }); });
      Array.prototype.forEach.call(box.querySelectorAll('[data-lesson]'), function (b) { b.addEventListener('click', function () { document.getElementById('modal').classList.add('hidden'); UI.letterbox(); var mid = b.getAttribute('data-lesson'); setTimeout(function () { Game.runFlow(function () { return Academy.lesson(mid); }); }, 50); }); });
    } });
    void w;
  };

  /* ---------------- Chain Sprint: claim, count, objection for each link (15 say steps; a proof context) ---------------- */
  X.chainSprint = async function () {
    var items = [];
    SC().spine.chain.forEach(function (c, k) { items.push({ id: c.claim, link: k }); items.push({ id: 'count:' + c.link, link: k }); if (c.objection && c.objection[0]) items.push({ id: c.objection[0], link: k }); });
    Mastery.examContext = 'sprint';
    var nailed = 0;
    var res = await MG().run({ key: 'chain-sprint', title: 'Chain Sprint', items: items, practice: true, resumable: true,
      stageHTML: chainLinks,
      item: function (it, api) { return MG().sayHere(FCV.resolve(it.id), {}, api).then(function (ok) { if (api.lastRate === 'nailed') nailed++; return ok; }); },
      finish: function (r) { r.stamp = nailed >= 15 ? 'gold' : nailed >= 10 ? 'silver' : 'bronze'; } });
    Mastery.examContext = null;
    return res;
  };
  /* ---------------- Tune-up Bay: six items where the most worn habit tempted him ---------------- */
  X.tuneUp = async function () {
    var part = Mastery.worstPart(), st = S();
    if (!part) { await UI.modal('Tune-up Bay', '<p>Nothing worn yet. Every bike part is in good order.</p>', [{ label: 'Back', value: 0, cls: 'go' }]); return; }
    var ids = Object.keys(st.mem).filter(function (id) { return st.mem[id].err === part.code && FCV.askable(id); });
    if (ids.length < 6) ids = ids.concat(Mastery.due().filter(function (id) { return ids.indexOf(id) < 0; })).slice(0, 6);
    var res = await MG().run({ key: 'tune-up', title: 'Tune-up Bay: ' + part.part, items: ids.slice(0, 6).map(function (id) { return { id: id }; }), practice: true, resumable: true,
      item: function (it, api) { var r = FCV.resolve(it.id); return r.type === 'quiz' || r.type === 'bank' ? api.quiz(it.id, {}) : MG().sayHere(r, {}, api); } });
    if (res && res.right - res.wrong >= 5) { st.wear[part.code] = Math.max(0, (st.wear[part.code] || 0) - 3); UI.toast(part.part + ' polished. ' + part.error + ': ' + SC().mastery.error_taxonomy.filter(function (e) { return e.code === part.code; })[0].fix, 4000); }
  };
  /* ---------------- sprints: a section, or a bank topic's linked items ---------------- */
  X.sprint = async function (title, ids) {
    ids = ids.filter(function (id) { return FCV.askable(id); }).slice(0, 6); if (!ids.length) { UI.toast('Nothing to sprint here yet.', 2000); return; }
    return MG().run({ key: 'sprint', title: title, items: ids.map(function (id) { return { id: id }; }), practice: true, resumable: true,
      item: function (it, api) { var r = FCV.resolve(it.id); return r.type === 'quiz' ? api.quiz(it.id, {}) : MG().sayHere(r, {}, api); } });
  };
  X.sectionSprint = function (section) {
    var st = S(), reg = Mastery.registry().filter(function (x) { return String(x.unit) === String(section); }).map(function (x) { return x.id; });
    var due = reg.filter(function (id) { return FCV.overdue(st, id) >= 0; }), unseen = reg.filter(function (id) { return !st.mem[id]; });
    return X.sprint('Section sprint: ' + section, due.concat(unseen).concat(reg));
  };
  X.topicDrill = function (topic) {
    var ids = Mastery.registry().filter(function (x) { return (x.bank_links || []).some(function (b) { var q = FCV.bankItem(b); return q && (!topic || q._t === topic); }); }).map(function (x) { return x.id; });
    return X.sprint('Drill: ' + (topic || 'your weakest topic'), FCV.shuffle(ids));
  };
  /* bank_fixes.md section 5, applied in memory so the script copy stays byte-identical to its source:
     the nine new askers, the bank count in place of "222", and the rehearsal and Grill replies that failed the length gate. */
  X.FIXES = {
    askers: { 'pro-26': 'prof_kerbstone', 'pro-27': 'dr_tally', 'pro-28': 'prof_kerbstone', 'pro-29': 'dr_tally', 'pro-30': 'prof_kerbstone', 'pro-31': 'dr_tally', 'pro-32': 'prof_kerbstone', 'pro-33': 'dr_tally', 'pro-34': 'prof_kerbstone' },
    replies: [
      ['Rule 1a was in the codebook from the start, before any results were seen, so nothing is circular.', 'Rule 1a was in the codebook from the start, before any results were seen, so nothing about the holder result is circular.'],
      ['The rule makes no real difference: the holder condition clears the bar with it or without it.', 'The rule makes no real difference: the holder condition clears the bar with it or without it, so when it was written doesn\'t matter.'],
      ['No, because the survey shows overlap rising with size, which is exactly what my first link predicts.', 'No, because the survey shows overlap rising with company size, which is exactly what my first link predicts about refusal.'],
      ['Fair point. The carrier findings probably don\'t hold, so I\'d present them as tentative only.', 'Fair point. The carrier findings probably don\'t hold up without more carrier voices, so I\'d present them as tentative only, pending a larger study.'],
      ['Everybody adjusts their rules after a pilot, and these changes only tidied up the codebook.', 'Everybody adjusts their rules after a pilot, and these changes only tidied up the codebook without moving any result that the thesis reports.'],
      ['It\'s only an illustration, so a council can safely ignore it and wait for better data.', 'It\'s only an illustration, so a council can safely ignore it and simply wait until better data on failed deliveries and redirection have been published.'],
      /* QA round 1: Act 7 rehearsal 2 (P3's falsifier, ch7-eq2 and Table 4.7); the wrong replies padded for the 1.25 length gate */
      ['An arrangement outliving its binder on trust alone, or dying while its binder stood. None of those I recorded did.', 'Outliving its binder on trust alone, or dissolving while it stood and the parties still gained. None recorded outlived it; the one that ended under a standing binder ended at a shipper\'s instruction.'],
      ['It can\'t really be falsified: no arrangement has ever outlived its binder, so P3 is effectively proven.', 'It can\'t really be falsified: no arrangement has ever outlived its binder, in my data or anywhere else, so P3 is effectively proven and needs no further test.'],
      ['By showing that trust between the parties was high in the arrangements that lasted longest, and low in the ones that failed.', 'By showing that trust between the parties was high in the arrangements that lasted longest, and low in the ones that failed or were wound up early by the parties.']
    ],
    /* QA round 1: tone, accuracy against the source, and feedback that praised points the reply does not make. Substrings. */
    script: [
      ['Traffic news! Parcels climbing.', 'Traffic news. Parcels climbing.'],
      ['Working claim, onto the pitch!', 'Working claim, onto the pitch.'],
      ['Objection! Explain rule 1a before the bench does.', 'Objection. Explain rule 1a before the bench does.'],
      ['Meanwhile parcels multiplied,', 'Meanwhile parcels kept growing,'],
      ['Shippers are documented here, but never examined as a category beside the carriers.', 'Shippers are documented here, but under-examined as a category and never set beside the carriers.'],
      ['most providers didn\'t want an independent third party', 'most who answered didn\'t want an independent third party'],
      ['Carriers don\'t decide how flows run. Shippers, receivers and cities do.', 'Carriers don\'t decide how flows run. Mainly shippers, receivers and cities do.'],
      ['the field\'s best-known papers on collaboration', 'twelve well-known papers on collaboration'],
      ['Where a grant held them, some ended the day the grant did.', 'Where a grant held them, four ended with their grant.'],
      ['hard shake, two hearts shatter, a red flash', 'hard shake, two hearts shatter'],
      ['A killer, and it hit.', 'A two-heart question, and it landed.'],
      ['Both alternatives dismissed for a reason, and the mechanism named. That\'s the answer.', 'Both alternatives dismissed for a reason. That\'s the answer.'],
      ['Firm held constant, size recorded beside overlap. That\'s the defence.', 'Firm held constant. That\'s the defence.'],
      ['Cost of watching, the subcontracting, and Ghent\'s own model. That\'s why.', 'Cost of watching and the subcontracting. That\'s why.'],
      /* QA round 2 */
      ['Same firm, both answers: what differs is overlap.', 'Same firm or kind of firm, both answers: what differs is overlap.'],
      /* QA round 3: the lead-in named its own answer */
      ['The Big Fierce Animal growls: which idea did the data correct?', 'Something rumbles out in the fog: which early idea did the data correct?'],
      /* round 3: Act 1 scenes play over the Blank Quarter street still (CS10), not a studio; no coffee in Dr Tally's still */
      ['Freight FM studio, on-air lamp glowing', 'The Blank Quarter, Freight FM on every radio'],
      ['Studio, traffic jingle', 'The Blank Quarter, the traffic jingle on the radio'],
      ['Studio, on-air lamp', 'The Blank Quarter, Freight FM still on air'],
      ['Dr Tally, passing with a coffee, stops at your handlebars.', 'Dr Tally, passing, stops at your handlebars.']
    ],
    methods: [
      /* round 2: no interview code beside the comparator (countries as a set, not against each code) */
      ['India\'s one interview (A1) \'was held as a comparator', 'One interview \'was held as a comparator'],
      ['A1 is the comparator; A9 low confidence;', 'The comparator is not out of domain; A9 low confidence;'],
      [/\btoward\b/g, 'towards'],
      /* round 3: nothing is shown "above" it in the lesson or the mission */
      ['Finlay (2002), as above;', 'Finlay (2002);']
    ],
    /* m2: no gloss is added to a fact card: it reads word for word as facts.json */
    facts: []
  };
  X.loadFixes = function () {
    var sc = FCV.data.script, n = String(FCV.bank.items.length), applied = 0, F = X.FIXES;
    var fixed = sc.finale.v3 && sc.finale.v3.askers_fixed_at_build; if (fixed) Object.keys(F.askers).forEach(function (k) { if (!fixed[k] && FCV.bankItem(k)) { fixed[k] = F.askers[k]; applied++; } });
    (function walk(o) {
      if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) { if (typeof o[i] === 'string') o[i] = fix(o[i]); else walk(o[i]); } return; }
      if (o && typeof o === 'object') Object.keys(o).forEach(function (k) { if (typeof o[k] === 'string') o[k] = fix(o[k]); else walk(o[k]); });
    })(sc);
    function fix(t) {
      for (var i = 0; i < F.replies.length; i++) if (t === F.replies[i][0]) { applied++; return F.replies[i][1]; }
      if (/\b222\b/.test(t) && /questions|lent/.test(t)) { applied++; t = t.replace(/\b222\b/g, n); }
      return sub(t, F.script);
    }
    function sub(t, list) { for (var i = 0; i < list.length; i++) { var a = list[i][0]; if (typeof a === 'string' ? t.indexOf(a) >= 0 : a.test(t)) { if (a.lastIndex) a.lastIndex = 0; applied++; t = t.split ? (typeof a === 'string' ? t.split(a).join(list[i][1]) : t.replace(a, list[i][1])) : t; } } return t; }
    function walkWith(o, list) {
      if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) { if (typeof o[i] === 'string') o[i] = sub(o[i], list); else walkWith(o[i], list); } return; }
      if (o && typeof o === 'object') Object.keys(o).forEach(function (k) { if (typeof o[k] === 'string') o[k] = sub(o[k], list); else walkWith(o[k], list); });
    }
    if (FCV.data.methods) walkWith(FCV.data.methods, F.methods);
    if (FCV.methods) walkWith(FCV.methods, F.methods);
    if (FCV.data.facts) walkWith(FCV.data.facts, F.facts);
    X.fixesApplied = applied;
  };
  window.Missions = X;
})();
