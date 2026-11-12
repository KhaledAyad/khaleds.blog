/* Freight City Viva v3: the session loop. Arrive (Good morning, paused viva, Previously), the Shift planner and its tickets
   with a GPS route, auto-continue, streaks that forgive a parked day, and the end-of-session card built only from memory. */
(function () {
  'use strict';
  var Ss = {};
  var S = function () { return Game.state; };
  var SC = function () { return FCV.data.script; };
  var esc = function (s) { return UI.esc(s); };
  var LS = 'fcv3-session-open';
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  Ss.begin = function () {
    var st = S(); FCV.touchDay(st); st.sessions = (st.sessions || 0) + 1;
    st.session = { startedAt: Date.now(), pic: Mastery.picture(), answers0: answersCount(st), xp0: st.xp || 0, tickets: null, plan: null };
    Ss.streak(); Game.save();
  };
  function answersCount(st) { var n = 0; Object.keys(st.mem).forEach(function (id) { n += st.mem[id].seen || 0; }); return n; }
  Ss.markOpen = function () { var st = S(); if (st && st.session) lsSet(LS, JSON.stringify({ at: Date.now(), pic: st.session.pic, xp0: st.session.xp0 })); };
  /* Streak: days played in a row (5 minutes of play or 10 answers); one missed day a week is forgiven. */
  Ss.streak = function () {
    var st = S(), days = (st.days || []).slice().sort(), run = 0, forgiven = 0, best = st.streak && st.streak.best || 0;
    for (var i = days.length - 1; i > 0; i--) {
      var gap = (new Date(days[i]) - new Date(days[i - 1])) / 864e5;
      if (gap <= 1.01) run++; else if (gap <= 2.01 && forgiven < 1) { forgiven++; run++; } else break;
    }
    run = days.length ? run + 1 : 0;
    st.streak = { now: run, best: Math.max(best, run) };
    return st.streak;
  };

  /* ---------------- arriving ---------------- */
  Ss.arrive = async function () {
    var st = S(), last = Ss.pendingLast();
    if (st.settings.family && window.Family) await Family.goodMorning();
    /* A paused viva comes first: the recap of the last shift waits until after it. */
    if (st.viva.paused) {
      var p = st.viva.paused, c = SC().session_copy.paused_viva, fam = !!st.settings.family;
      /* ND2: in family mode the verdict and the paused attempt go on only from the hold the Hall door asks for; Enter,
         Space or any key lands on Not now, and the attempt stays paused (the Hall door and the Chapter menu offer it).
         Out of family mode these two dialogs are as they were. */
      if (p.hearts <= 0) {
        /* the last heart went before the verdict was heard: one way on, the verdict */
        var hv = await UI.modal('The viva', '<p>Your last heart went before you left.</p>', [{ label: 'Hear the verdict', value: 1, cls: 'go', hold: fam }].concat(fam ? [{ label: 'Not now', value: 0, safe: true }] : []), { focusSafe: fam });
        if (hv || !fam) { await Viva.start(true); return; }
      } else {
        var v = await UI.modal('The viva is paused', '<p>' + esc(c.body.replace('[n]', p.attempt).replace('[q]', p.pos + 1).replace('[h]', p.hearts)) + '</p>', [{ label: c.yes, value: 1, cls: 'go', hold: fam }, { label: c.no, value: 0 }].concat(fam ? [{ label: 'Not now', value: 'later', safe: true }] : []), { focusSafe: fam });
        if (v === 1) { await Viva.start(true); return; }
        /* Walk out, then "Back to the questions": out of family mode that carries on; in family mode it stays paused */
        if (v === 0 && !(await Viva.walkOut(false)) && !fam) { await Viva.start(true); return; }
      }
    }
    /* D-04: the "Last time you learnt" card shows only after three hours or on a new day; sooner, it is a short note */
    if (last && last.pic) {
      var away = Date.now() - (last.at || st.savedAt || 0), otherDay = last.at && FCV.today(new Date(last.at)) !== FCV.today();
      if (away >= 3 * 3600e3 || otherDay) await Ss.endShift(last); else await Ss.endShift(last, { quiet: true });
    }
    if (st.resume && st.resume.kind === 'run') {
      var rn = st.resume, wr = await UI.modal('Back in', '<p>' + esc(rn.title || 'A practice run') + ' was under way when you left: question ' + (Object.keys(rn.state.done || {}).length + Object.keys(rn.state.firstWrong || {}).length + 1) + ' of ' + (rn.items || []).length + '. Carry on where you left it?</p>', [{ label: 'Carry on', value: 1, cls: 'go' }, { label: 'Drop it', value: 0 }]);
      if (wr) await resumeRun(rn); else st.resume = null;
    } else if (st.resume && st.resume.kind === 'mg') {
      /* D2-m1: Continue is already the choice to go back: straight into the mission, with a note saying where and From the top */
      var r = st.resume, rsd = r.state || {}, at = Object.keys(rsd.done || {}).length + 1, tot = at - 1 + (rsd.queue || []).length;
      var mk = /^act(\d):(mission|shift_check)$/.exec(r.key || ''), actN = null, stepId = null;
      if (mk) { actN = +mk[1]; stepId = mk[2]; } else if (/^methods:/.test(r.key || '')) { for (var an = 1; an <= 7; an++) if (FCV.actSteps(an).some(function (s) { return s.id === r.key; })) { actN = an; stepId = r.key; } }
      UI.toast('Back in: question ' + at + (tot >= at ? ' of ' + tot : '') + '.', 6000, actN ? { action: { label: 'From the top', fn: function () {
        Flows.restartTop = { n: actN, step: stepId, clearResume: true };
        var lv = document.querySelector('#mechBox [data-mg="leave"]'); if (lv) lv.click();
      } } } : null);
      await resumeMg(r);
    } else if (st.resume && st.resume.kind === 'lesson' && window.Academy && lessonLeft(st.resume)) {
      /* D2-m2: a lesson left part-way: Continue goes back into it, at its step (the lesson says which) */
      await Academy.lesson(String(st.resume.key || '').replace(/^lesson:/, ''));
    } else if (Director.resumable()) {
      /* D-04: Continue is the choice to go back: the film carries on from its shot (Skip is on the film itself) */
      UI.toast('Back in: the film carries on from where you left it.', 2600);
      await Director.resume();
    } else if (Ss.roomLeft()) {
      /* QAD4-m2: back into the room he left part-way (the hub shows how far each stage got) */
      var rl = Ss.roomLeft(); UI.toast('Back in: ' + FCV.room(rl).name + '.', 2600);
      if (Game.travelTo) Game.travelTo({ kind: 'room', room: rl });
      await Flows.room(rl);
    } else if (st.resumeStep && !FCV.isDone(st, st.resumeStep.act, st.resumeStep.step)) {
      /* D-04: Continue is already the choice to go back, so he goes straight in, at the line he left */
      var rs = st.resumeStep;
      if (Game.travelTo) Game.travelTo({ kind: 'act', act: rs.act });
      if (window.Flows) Flows.quickResume = true;
      await Flows.actStep(rs.act, rs.step);
      if (window.Flows) Flows.quickResume = false;
    }
    var since = Date.now() - (st.savedAt || 0), newDay = st.savedAt && FCV.today(new Date(st.savedAt)) !== FCV.today();
    if (st.settings.previously && st.savedAt && (since >= 3 * 3600e3 || newDay) && !Game.previouslyShown && st.intro) { Game.previouslyShown = true; await Flows.previously(); }
    /* SD-10: no planner on the way in. One card names the next step and its length, with one Go button. The Shift planner
       lives under Menu > More > Plan a session. */
    await Ss.carryOn();
  };
  Ss.carryOn = async function () {
    var st = S(), o = FCV.objective(st), MIN = { opening: 1, scene: 4, tp: 3, on_air: 2, ladder: 2, mission: 8, methods: 8, rehearsal: 3, mock_viva: 8, shift_check: 4, closer: 2, academy_entrance: 1 };
    var what, mins;
    if (o.kind === 'act' && o.step) { what = (/^Scene /.test(o.step.title) ? '' : 'Act ' + o.act + ': ') + o.step.title; mins = MIN[o.step.kind] || 3; }
    else if (o.kind === 'room') { what = 'The Evidence Locker: ' + FCV.room(o.room).name; mins = 8; }
    else { what = FCV.vivaOpen(st) ? 'The Viva Hall: face the examiners' : 'The Viva Hall'; mins = 20; }
    var go = await UI.modal('Carry on', '<p class="carryOn">' + esc(what) + ' <small>(about ' + mins + ' min)</small></p>', [{ label: 'Go', value: 1, cls: 'go big' }, { label: 'Just ride', value: 0, cls: 'quiet' }]);
    if (!go) return;
    if (o.kind === 'act' && o.step) { if (Game.travelTo) Game.travelTo({ kind: 'act', act: o.act }); await Flows.actStep(o.act, o.step.id); }
    else if (o.kind === 'room') { if (Game.travelTo) Game.travelTo({ kind: 'room', room: o.room }); await Flows.room(o.room); }
    else if (FCV.vivaOpen(st)) { if (Game.travelTo) Game.travelTo({ kind: 'viva' }); await Flows.vivaDoor(); }
    else if (Game.rideTo) Game.rideTo({ kind: 'viva' });
  };
  /* the lesson a lesson resume points at, if it is still part-way */
  function lessonLeft(r) { var id = String(r && r.key || '').replace(/^lesson:/, ''), ls = id && S().methods.lessons[id]; return !!(ls && ls.step > 0 && (FCV.methodById(id) || FCV.methodById(id.replace(/^method:/, '')))); }
  /* QAD4-m2: a Locker room left part-way (a replayed room, or one that is not the objective) is where Continue goes, if it
     was played after the objective's own last step */
  Ss.roomLeft = function () {
    var st = S(), lp = st.lastPlace; if (!lp || lp.kind !== 'room') return null;
    var room = FCV.room(lp.id), rs = (st.rooms || {})[lp.id]; if (!room || !rs || (rs.stage || 0) >= 4) return null;
    var cur = FCV.roomStages(room)[rs.stage || 0];
    var part = (rs.stage || 0) > 0 || (rs.briefAt || 0) > 0 || !!(cur && cur.kind === 'quiz' && rs.done && cur.items.some(function (x) { return rs.done[typeof x === 'string' ? x : x.quiz]; }));
    if (!part) return null;
    var o = FCV.objective(st); if (o.kind === 'room' && o.room === lp.id) return null;
    var after = st.resumeStep && !FCV.isDone(st, st.resumeStep.act, st.resumeStep.step) ? (st.resumeStep.at || 0) : 0;
    Object.keys(st.acts || {}).forEach(function (n) { var d = (st.acts[n] || {}).doneAt || {}; Object.keys(d).forEach(function (k) { after = Math.max(after, d[k] || 0); }); });
    return (lp.at || 0) > after ? lp.id : null;
  };
  Ss.lessonLeft = function () { var r = S().resume; if (!(r && r.kind === 'lesson' && lessonLeft(r))) return null; var id = String(r.key).replace(/^lesson:/, ''), m = FCV.methodById(id) || FCV.methodById(id.replace(/^method:/, '')); return m ? m.term : null; };
  async function resumeRun(r) {
    var k = r.key;
    if (k === 'waiting-room') return Missions.waitingRoom();
    if (k === 'night-shift') return Flows.nightShift(!!(r.state.data && r.state.data.exam));
    if (k === 'chain-sprint') return Missions.chainSprint();
    if (k === 'tune-up') return Missions.tuneUp();
    if (k === 'sprint') return Missions.sprint(r.title || 'Sprint', (r.items || []).map(function (x) { return x.id; }));
    S().resume = null;
  }
  async function resumeMg(r) {
    var k = r.key, m;
    if ((m = /^act(\d):mission$/.exec(k))) return Flows.actStep(+m[1], 'mission');
    if ((m = /^methods:(.+)$/.exec(k))) { for (var n = 1; n <= 7; n++) if (FCV.actSteps(n).some(function (s) { return s.id === k; })) return Flows.actStep(n, k); return Missions.methodsMission(m[1]); }
    if ((m = /^act(\d):shift_check$/.exec(k))) return Flows.actStep(+m[1], 'shift_check');
    if (/^lesson:/.test(k)) return Academy.lesson(k.replace('lesson:', ''));
    S().resume = null;
  }

  /* ---------------- the Shift planner ---------------- */
  var CHIP_MIN = { '10 min': 10, '20 min': 20, '40 min': 40, '60+ min': 60, 'Viva week': 45, 'Just ride': 0 };
  Ss.planner = async function () {
    var st = S(), sp = SC().session.shift_planner, c = SC().session_copy.shift_planner;
    var due = Mastery.due().length, chips = sp.chips;
    var pick = st.settings.planner || '20 min';
    /* "Just ride" is the button below (renamed), not a length to pick */
    chips = chips.filter(function (ch) { return ch !== 'Just ride'; }); if (pick === 'Just ride') pick = '20 min';
    var html = '<p>' + esc(c.question) + '</p><div class="planner">' + (function () {
      /* m7: three lengths in view (10, 20 and 40 min); 60+ min and Viva week sit under More */
      var b = function (ch) { return '<button class="btn small" type="button" data-c="' + esc(ch) + '" aria-pressed="' + (ch === pick) + '">' + esc(ch) + '</button>'; };
      var main = chips.filter(function (ch) { return /^(10|20|40) min$/.test(ch); }), more = chips.filter(function (ch) { return main.indexOf(ch) < 0; });
      return main.map(b).join('') + (more.length ? '<details class="plannerMore"' + (more.indexOf(pick) >= 0 ? ' open' : '') + '><summary>More</summary>' + more.map(b).join('') + '</details>' : '');
    })() + '</div><div id="ticketBox"></div>' +
      (st.settings.family && window.Family ? Family.journeyHTML() : '');
    var res = await new Promise(function (resolve) {
      UI.modal('Shift planner', html, [{ label: c.go, value: 'go', cls: 'go' }, { label: 'Ride without a plan', value: 'ride' }], { onOpen: function (box) {
        var draw = function () { var t = Ss.tickets(CHIP_MIN[pick], pick === 'Viva week'); box.querySelector('#ticketBox').innerHTML = t.map(function (x, i) { return '<div class="ticket"><b>' + (i + 1) + '</b><span class="grow">' + esc(x.label) + '<br><small>about ' + x.min + ' min. ' + esc(x.teaches || '') + '</small></span></div>'; }).join('') || '<p class="small">Free ride: no tickets.</p>'; box._t = t; };
        Array.prototype.forEach.call(box.querySelectorAll('[data-c]'), function (b) { b.addEventListener('click', function () { pick = b.getAttribute('data-c'); st.settings.planner = pick; FCV.stampSettings(st); Array.prototype.forEach.call(box.querySelectorAll('[data-c]'), function (x) { x.setAttribute('aria-pressed', x === b); }); draw(); }); });
        draw(); Ss._box = box;
      } }).then(resolve);
    });
    var tickets = Ss._box && Ss._box._t || [];
    st.session = st.session || {}; st.session.tickets = res === 'go' ? tickets.map(function (t) { return { kind: t.kind, ref: t.ref, label: t.label, min: t.min, done: false }; }) : [];
    Game.save();
    void due;
    if (res === 'go' && tickets.length) await Ss.runTicket(0);
  };
  /* Tickets: Morning Round if 3 or more due; the next story steps that fit; a lesson or a shelf; a Night Shift slice from 40 min. */
  Ss.tickets = function (mins, vivaWeek) {
    var st = S(), out = [], due = Mastery.due().length, budget = mins;
    if (!mins) return [];
    if (vivaWeek) {
      out.push({ kind: 'morning', label: 'Morning Round', min: 5, teaches: due + ' due' });
      out.push({ kind: 'tune', label: 'Tune-up Bay', min: 6, teaches: 'your most worn habit' });
      out.push({ kind: 'nightExam', label: 'Night Shift, exam mode', min: 10, teaches: 'proofs for Spaced items' });
      if (FCV.actDone(st, 7) && (st.days.length % 2 === 0)) out.push({ kind: 'mock', label: 'The Waiting Room mock', min: 15, teaches: 'all nine topics' });
      if (FCV.actDone(st, 6)) out.push({ kind: 'sprint', label: 'Chain Sprint', min: 6, teaches: 'the five links' });
      return out;
    }
    if (due >= 3) { out.push({ kind: 'morning', label: 'Morning Round', min: Math.max(2, Math.round(mins * 0.1)), teaches: due + ' items due' }); budget -= Math.round(mins * 0.1); }
    var storyBudget = Math.round(mins * 0.5);
    for (var n = 1; n <= 7 && storyBudget > 0; n++) {
      if (!FCV.actOpen(st, n) || FCV.actDone(st, n)) continue;
      var nexts = FCV.nextSteps(st, n);
      for (var i = 0; i < nexts.length && storyBudget > 0; i++) { var s = nexts[i], m = s.kind === 'opening' ? 2 : /mission|methods/.test(s.kind) ? 8 : s.kind === 'closer' ? 2 : 4; out.push({ kind: 'step', ref: { act: n, step: s.id }, label: 'Act ' + n + ': ' + s.title, min: m, teaches: SC().acts[n - 1].district.name }); storyBudget -= m; }
      break;
    }
    if (mins >= 20) {
      var L = window.Academy && Academy.nextLesson();
      if (L) out.push({ kind: 'lesson', ref: L.id, label: 'Academy lesson: ' + L.term, min: 5, teaches: 'how and why it was done' });
      else { var room = SC().evidence_locker.rooms.filter(function (r) { return !(st.rooms[r.id] && st.rooms[r.id].badge); })[0]; if (room && FCV.actOpen(st, 2)) out.push({ kind: 'room', ref: room.id, label: 'Evidence Locker: ' + room.name, min: 6, teaches: 'Appendix ' + room.appendices.join(', ') }); }
    }
    if (mins >= 40 && FCV.actDone(st, 3)) out.push({ kind: 'night', label: 'Night Shift slice', min: 8, teaches: 'ten mixed items' });
    return out.slice(0, 6);
  };
  Ss.runTicket = async function (i) {
    var st = S(), tk = st.session && st.session.tickets && st.session.tickets[i]; if (!tk) return;
    if (tk.kind === 'step') { var m = Game.cityMarker && null; void m; Game.rideTo({ kind: 'act', act: tk.ref.act }); UI.toast('Ticket ' + (i + 1) + ': ' + tk.label + '. Follow the teal route.', 3500); return; }
    if (tk.kind === 'room') { Game.rideTo({ kind: 'room', room: tk.ref }); UI.toast('Ticket ' + (i + 1) + ': ' + tk.label + '.', 3000); return; }
    if (tk.kind === 'morning') await Ss.morningRound(true);
    else if (tk.kind === 'lesson') await Academy.lesson(tk.ref);
    else if (tk.kind === 'night') await Flows.nightShift(false);
    else if (tk.kind === 'nightExam') await Flows.nightShift(true);
    else if (tk.kind === 'tune') await Missions.tuneUp();
    else if (tk.kind === 'mock') await Missions.waitingRoom();
    else if (tk.kind === 'sprint') await Missions.chainSprint();
    tk.done = true; Game.save();
    if (window.Album) Album.check();
    await Ss.offerNext();
  };
  /* Auto-continue: the next ticket counts down 5 s; any key cancels; Stop here is always visible. */
  Ss.offerNext = async function () {
    var st = S(), tks = st.session && st.session.tickets; if (!tks || !tks.length) return;
    tks.forEach(function (t) { if (t.kind === 'step' && FCV.isDone(st, t.ref.act, t.ref.step)) t.done = true; });
    var i = tks.findIndex(function (t) { return !t.done; });
    if (i < 0) { if (!st.session.complete) { st.session.complete = true; if (window.Album) Album.pack('Shift complete'); await UI.banner(SC().session_copy.shift_planner.done, 'A garage pack is yours.'); await Ss.endShift(); } return; }
    if (Ss._offering) return; Ss._offering = true;
    var tk = tks[i], c = SC().session_copy.shift_planner;
    var html = '<p>' + esc(c.next_ticket.replace('[ticket]', tk.label).replace('[n]', tk.min).replace('[unlocks]', '')) + '</p>';
    var v = await UI.modal('Next ticket', html, [{ label: 'Go', value: 'go', cls: 'go' }, { label: 'Stop here', value: 'stop' }, { label: 'Free ride', value: 'ride' }], { onOpen: function (box) {
      if (st.settings.autoContinue === false || st.settings.family) return;
      var go = box.querySelector('.btn.go'), n = 5, lab = go.textContent;
      var t = setInterval(function () { n--; go.textContent = lab + ' (' + n + ')'; if (n <= 0) { clearInterval(t); go.click(); } }, 1000);
      go.textContent = lab + ' (5)';
      var cancel = function () { clearInterval(t); go.textContent = lab; document.removeEventListener('keydown', cancel, true); box.removeEventListener('pointerdown', cancel, true); };
      setTimeout(function () { document.addEventListener('keydown', cancel, true); box.addEventListener('pointerdown', cancel, true); }, 30);
    } });
    Ss._offering = false;
    if (v === 'go') await Ss.runTicket(i); else if (v === 'stop') await Ss.endShift();
  };
  Ss.afterFlow = function () {
    var st = S(); if (!st || !st.session || !st.session.tickets) return;
    var changed = false; st.session.tickets.forEach(function (t) { if (!t.done && t.kind === 'step' && FCV.isDone(st, t.ref.act, t.ref.step)) { t.done = true; changed = true; } if (!t.done && t.kind === 'room' && st.rooms[t.ref] && st.rooms[t.ref].badge) { t.done = true; changed = true; } });
    if (changed) setTimeout(function () { if (!Game.isBusy() && !UI.busy()) Game.runFlow(Ss.offerNext); }, 400);
  };

  /* ---------------- Morning Round: first three from tier A or B when any are due ---------------- */
  Ss.morningRound = async function (direct) {
    var due = Mastery.due(); if (!due.length) return;
    var ab = due.filter(function (id) { var b = Mastery.item(id.replace(/^(recall|say):/, '')); return b && /A|B/.test(b.tier); });
    var order = ab.slice(0, 3).concat(due.filter(function (id) { return ab.slice(0, 3).indexOf(id) < 0; }));
    if (!direct) { var v = await UI.modal('Morning Round', '<p>' + due.length + ' items are due. Three now, to warm up?</p>', [{ label: 'Three now', value: 1, cls: 'go' }, { label: 'Skip', value: 0 }]); if (!v) return; }
    var size = S().settings.vivaDate && (new Date(S().settings.vivaDate) - Date.now()) < 7 * 864e5 ? 6 : 3;
    await MiniGame.run({ key: 'morning-round', title: 'Morning Round', items: order.slice(0, size).map(function (id) { return { id: id }; }), practice: true,
      item: function (it, api) { var r = FCV.resolve(it.id); return r && (r.type === 'quiz' || r.type === 'bank') ? api.quiz(it.id, {}) : MiniGame.sayHere(r, {}, api); } });
    S().lastDue = Date.now(); Game.save();
  };

  /* ---------------- the end-of-session card: every line comes from item memory ---------------- */
  Ss.card = function (pic0, last) {
    var st = S(), now = Mastery.picture(), c = SC().session_copy.end_card, rows = [];
    var moved = [], proven = [], fixed = [], said = [];
    Object.keys(now.stages).forEach(function (id) { var a = pic0.stages[id] || 0, b = now.stages[id]; if (b > a) moved.push({ id: id, a: a, b: b }); if (b === 5 && a < 5) proven.push(id); });
    Object.keys(pic0.sureWrong || {}).forEach(function (id) { var r = st.mem[id]; if (r && r.lastOutcome === 'right') fixed.push(id); });
    for (var n = 1; n <= 7; n++) { var cl = SC().acts[n - 1].closer; if (FCV.isDone(st, n, 'closer') && cl && cl.card && !(pic0.closers || {})[n] && moved.some(function (m) { return m.id.indexOf('ch' + n) === 0; })) said.push(cl.card); }
    var tierRank = function (id) { var b = Mastery.item(id); return b ? 'ABCD'.indexOf(b.tier) : 4; };
    moved.sort(function (x, y) { return tierRank(x.id) - tierRank(y.id) || y.b - x.b; });
    var learnt = moved.filter(function (m) { return m.a === 0 || m.a === 1; });
    var top = learnt.slice(0, 5).map(function (m) { return m.id; });
    var card = function (id) { var r = FCV.resolve(id); return r ? '<div class="card"><div class="lab">' + esc(r.label || '') + '</div><div class="txt"><b>' + esc(FCV.firstSentence(r.text || r.q || r.question || r.gap || r.figure || '')) + '</b></div>' + (r.loc ? '<div class="loc">' + esc(r.loc) + '</div>' : '') + '</div>' : ''; };
    /* "1 thing", never "1 things"; the Last time recap has no "Today" heading */
    var lt = c.learnt.replace('[n]', learnt.length); if (learnt.length === 1) lt = lt.replace(/\bthings\b/, 'thing'); if (!learnt.length) lt = 'Nothing new yet today. A scene or a drill will fill this in.';
    if (last) lt = lt.replace(/^Today you learnt/, 'You learnt');
    if (!(last && !learnt.length)) rows.push('<h3>' + esc(lt) + '</h3>' + top.map(card).join(''));
    /* SD-33: in words: "from seen once to practised", never bare circles */
    var stageWord = function (n) { return ['not met', 'seen once', 'practised', 'remembered', 'spaced out', 'proven'][n] || 'not met'; };
    if (moved.length) rows.push('<h3>' + esc(c.stronger) + '</h3><p>' + moved.slice(0, 8).map(function (m) { var r = FCV.resolve(m.id); return esc(UI.plainFigure((r && (r.figure || r.label)) || '') || (r && r.label) || 'A card') + ': from ' + stageWord(m.a) + ' to <b>' + stageWord(m.b) + '</b>'; }).join('<br>') + '</p>');
    if (proven.length) rows.push('<h3>' + esc(c.proven) + '</h3><p>' + proven.map(function (id) { return esc(UI.plainFigure((FCV.resolve(id) || {}).figure || '') || 'A card') + ': proven'; }).join('<br>') + '</p>');
    if (fixed.length) rows.push('<h3>' + esc(c.fixed) + '</h3>' + fixed.slice(0, 4).map(card).join(''));
    if (said.length) rows.push('<h3>' + esc(c.say) + '</h3>' + said.map(function (id) { return UI.cardHTML(id, { noMet: true }); }).join(''));
    var one = moved.filter(function (m) { return tierRank(m.id) <= 1; })[0] || moved[0];
    var missed = Object.keys(st.mem).filter(function (id) { return st.mem[id].lastOutcome === 'wrong'; }).sort(function (a, b) { return tierRank(a) - tierRank(b); })[0];
    var oneId = missed || (one && one.id);
    if (oneId) rows.push('<h3>' + esc(c.one_thing) + '</h3>' + UI.cardHTML(oneId.replace(/^(recall|say):/, ''), { noMet: true }));
    if (pic0.ready !== now.ready) rows.push('<h3>' + esc(c.readiness.replace('[a]', pic0.ready).replace('[b]', now.ready)) + '</h3>');
    var part = Mastery.worstPart(); if (part) rows.push('<p>' + esc(c.habit.replace('[error]', part.error).replace('[part]', part.part)) + '</p>');
    var sk = Ss.streak(); rows.push('<p>Streak: ' + sk.now + ' day' + (sk.now === 1 ? '' : 's') + '. Best: ' + sk.best + '. Courier XP today: ' + Math.max(0, (st.xp || 0) - (pic0.xp0 || st.session && st.session.xp0 || 0)) + '.</p>');
    var obj = FCV.objective(st), nm = obj.kind === 'act' && obj.step ? obj.step.title : obj.label;
    /* at the start of a session the recap never says "Shift over" */
    var es = SC().session_copy.end_shift.replace('[step]', nm).replace('[n]', obj.kind === 'act' ? FCV.MIN[obj.act] : 25).replace('[d]', Mastery.due().length);
    if (last) es = es.replace(/^Shift over\. Saved\.\s*/, '').replace(/^Next time/, 'Next');
    es = es.replace(/\b1 items\b/, '1 item');
    rows.push('<p><b>' + esc(es) + '</b></p>');
    if (st.settings.family) rows.push('<p>' + esc(c.windows.replace('[n]', moved.filter(function (m) { return m.b >= 3 && m.a < 3; }).length)) + '</p>');
    return { html: '<div class="endCard">' + rows.join('') + '</div>', moved: moved.length, learnt: learnt.length, proven: proven.length };
  };
  Ss.endShift = async function (last, o) {
    var st = S(); o = o || {}; await Game.flush();
    var pic0 = (last && last.pic) || (st.session && st.session.pic) || Mastery.picture();
    var made = Ss.card(pic0, !!last), c = SC().session_copy.end_card;
    st.shiftLog = (st.shiftLog || []).concat([{ at: Date.now(), learnt: made.learnt, moved: made.moved, proven: made.proven }]).slice(-30);
    Game.save(); Game.flush(); try { localStorage.removeItem(LS); } catch (e) {}
    if (o.quiet) { if (made.learnt) UI.toast('Welcome back. Last time you learnt ' + made.learnt + (made.learnt === 1 ? ' thing' : ' things') + '; they are in the Notebook.', 3200); return; }
    if (window.Sound && !last) Sound.music('CM-HOME');
    /* AUD-20: the card that opens a session has Keep riding as its main button, and no way back to the title */
    var v = await UI.modal(last ? 'Last time you learnt...' : c.title, made.html, last ? [{ label: 'Keep riding', value: 'ride', cls: 'go' }, { label: 'Notebook', value: 'nb' }, { label: 'Save as a page', value: 'page' }] : [{ label: 'Back to the title', value: 'title', cls: 'go' }, { label: 'Notebook', value: 'nb' }, { label: 'Save as a page', value: 'page' }, { label: 'Keep riding', value: 'ride' }]);
    if (v === 'page') { Ss.savePage(made.html); }
    if (v === 'nb') Notebook.open();
    if (v === 'title') Game.showTitle();
    if (!last) st.session = null;
  };
  Ss.savePage = function (inner) {
    var d = Save.downloads(); var body = '<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8"><title>What you learnt today</title><style>body{font-family:Georgia,serif;max-width:720px;margin:24px auto;line-height:1.5}.card{border:1px solid #999;border-radius:8px;padding:8px;margin:6px 0}.loc{font-size:12px;color:#555}</style></head><body><h1>What you learnt today, ' + new Date().toLocaleDateString('en-GB') + '</h1>' + inner + '</body></html>';
    if (d) d.save({ filename: 'freight-city-shift-' + FCV.today() + '.html', data: body }).catch(function () {}); else UI.toast('Saving files is not available here.', 2500);
  };
  /* A tab closed mid-session: on the next Continue, "Last time you learnt...". */
  Ss.lastTime = function () {
    var raw = lsGet(LS); if (!raw) return;
    try { var last = JSON.parse(raw); localStorage.removeItem(LS); Ss._last = last; } catch (e) {}
  };
  Ss.pendingLast = function () { var l = Ss._last; Ss._last = null; return l; };
  window.Session = Ss;
})();
