/* Freight City Viva v3: the story flows that changed. Longer films (openings in two beats, Before/After turning points,
   closers that begin "Stamped, and saved."), the steps v3 added (Academy entrance, Methods missions, Shift Check), stars on
   every graded step, Kerb Inspector spot checks, the Hall door with readiness, and Previously. v2's flows stay underneath. */
(function () {
  'use strict';
  var F = window.Flows, v2 = {};
  ['actStep', 'record', 'nightShift', 'kiosk', 'roomEntry', 'previously'].forEach(function (k) { v2[k] = F[k]; });
  var S = function () { return Game.state; };
  var SC = function () { return FCV.data.script; };
  var esc = function (s) { return UI.esc(s); };
  var isLeave = function (e) { return e && e.leave; };

  /* ---------------- answering: tally for stars, mastery hooks, error wear ---------------- */
  var tally = null;
  F.record = function (id, outcome, sure) {
    var bandBefore = null; try { if (window.Mastery) bandBefore = Mastery.readiness().band; } catch (e) {}
    var res = v2.record(id, outcome, sure);
    if (tally) { if (outcome === 'right') tally.right++; else if (outcome === 'wrong') tally.wrong++; else tally.partly++; }
    var pick = UI.lastPick; UI.lastPick = null;
    if (pick && pick.error && outcome !== 'right') { Mastery.wear(pick.error); var r = S().mem[id]; if (r) { var e = Mastery.ERR.filter(function (x) { return x.re.test(pick.error); })[0]; if (e) r.err = e.code; } }
    if (window.Mastery) Mastery.onRecord(id, outcome, sure || UI.lastSure, res, bandBefore);
    if (window.Album) { if (outcome === 'right' && res && res.first) Album.xp(10, 'first'); else if (outcome === 'right') Album.xp(Math.min(50, 10 * (res && res.rec ? res.rec.box : 1)), 'review'); }
    UI.lastSure = false;
    return res;
  };

  /* ---------------- films ---------------- */
  F.coldOpen = async function () {
    /* QAD3-m1: an opening closed part-way carries on from the shot it stopped at */
    var f = S().film, at = f && f.id === 'cold_open' ? { startAt: f.shot || 0, startShotId: f.sid || null } : {};
    await Director.film('cold_open', null, Object.assign({ full: true }, at));
    S().intro = true; S().cuts.cold_open = 1; Game.flush();
    if (S().settings.family && !S().cuts['film:docket_intro']) await Director.film('docket_intro');
    UI.toast('Ride into the Blank Quarter.', 3000); if (window.Extras) Extras.showHint();
  };
  /* D-03: the act opening's shot list in one place, so a film resumed after closing rebuilds exactly the same list */
  F.openingShots = function (n) {
    var a = SC().acts[n - 1];
    var titleShot = { shot: 'title:' + n, title: 'Act ' + n + ': ' + a.district.name, titleSub: 'Chapter ' + a.chapter + '. ' + a.title.replace(/^Chapter \d+\s+/, ''), visual: { asset: (a.opening_cutscene[0] || {}).visual ? a.opening_cutscene[0].visual.asset : FCV.actBackdrop[n], move: 'slow push-in' }, ms: 3200, core: true, beat: 'A' };
    return [titleShot].concat(a.opening_cutscene || []);
  };
  F.actOpening = async function (n, replay) {
    var a = SC().acts[n - 1];
    await Director.play(F.openingShots(n), { id: 'opening:' + n, full: !!replay, step: replay ? null : { act: n, step: 'opening' } });
    if (!replay) { FCV.markDone(S(), n, 'opening'); Game.flush(); }
    UI.toast('Act ' + n + ': ' + a.district.map_line, 4000);
    Game.refresh();
  };
  /* Turning point: narration in, v2's lines voiced with the cut-in, a Before/After card, narration out. */
  async function turningPoint(n, replay) {
    var a = SC().acts[n - 1], tp = a.turning_point;
    if (tp.narration_in) await Director.play([tp.narration_in], { id: 'tp_in:' + n, full: true });
    UI.open('Turning point: ' + tp.title, 'Act ' + n + ', ' + a.district.name, (tp.visual && tp.visual.asset) || FCV.actBackdrop[n]);
    try {
      if (n === 3 && window.Family && S().settings.family) { Family.job('redcards', 2); await new Promise(function (r) { setTimeout(r, 2000); }); }
      for (var j = 0; j < tp.lines.length; j++) {
        var l = tp.lines[j];
        if (tp.cut_in && j + 1 === tp.cut_in.line) {
          UI.close();
          await Director.play([{ visual: tp.cut_in.visual, subtitle: l.line, speaker: l.who, voice: l.voice || null, dur_min: 6 }], {});
          UI.open('Turning point: ' + tp.title, 'Act ' + n + ', ' + a.district.name, (tp.visual && tp.visual.asset) || FCV.actBackdrop[n]);
          if (l.fact) await UI.say(l.who, '', { fact: l.fact });
        } else {
          await UI.say(l.who, l.line, { fact: l.fact, direction: l.direction, key: 'act' + n + ':tp:' + j });
        }
      }
      if (tp.before_after) {
        var ba = tp.before_after, col = function (ids) { return (ids || []).map(function (id) { return UI.cardHTML(id, { compact: true }); }).join(''); };
        await UI.say(null, '', { extra: '<div class="chute"><div><div class="lab"><b>Before</b></div>' + col(ba.before) + '</div><div><div class="lab"><b>After</b></div>' + col(ba.after) + '</div></div>', hint: 'Before and after' });
      }
    } finally { UI.close(); }
    if (tp.narration_out) await Director.play([tp.narration_out], { id: 'tp_out:' + n, full: true });
    if (!replay) { FCV.markDone(S(), n, 'tp'); S().lastTp = n; Game.flush(); if (n === 6) Game.chainLit('link-5'); if (n === 4 && window.Family) await Family.animalShrinks(); }
  }

  /* ---------------- one act step, v3 ---------------- */
  F.actStep = async function (n, stepId, replay) {
    var a = SC().acts[n - 1], st = S(), step = FCV.actSteps(n).filter(function (s) { return s.id === stepId; })[0];
    if (!step) return;
    var key = 'act' + n + ':' + stepId, wasDone = FCV.isDone(st, n, stepId);
    var prevTally = tally, mine = tally = { right: 0, wrong: 0, partly: 0 };
    if (!replay) st.resumeStep = { act: n, step: stepId, at: Date.now() };
    try {
      if (step.kind === 'opening') { await F.actOpening(n, replay); }
      else if (step.kind === 'tp') { await turningPoint(n, replay); var nx = FCV.nextSteps(S(), n)[0]; if (!replay && nx && nx.kind === 'on_air') await F.actStep(n, nx.id); return; }
      else if (step.kind === 'academy_entrance') { await Director.film('academy_entrance', null, { full: !!replay }); S().cuts.academy_entrance = 1; if (!replay) FCV.markDone(S(), n, stepId); UI.toast('The Methods Academy is open in Method Works.', 3000); }
      else if (step.kind === 'methods') { var r = await Missions.methodsMission(step.key, replay); if (!replay && r && !r.quit) FCV.markDone(S(), n, stepId); }
      else if (step.kind === 'shift_check') { var sc = await Missions.shiftCheck(n, replay); if (!replay) FCV.markDone(S(), n, stepId); /* QAD4-m5: practice keeps the stars as they were */ if (!replay && sc && !sc.skipped) MiniGame.giveStars(key, sc.stars || 1); Game.flush(); if (!replay) await F.closer(n); return; }
      else if (step.kind === 'mission') {
        var mr = await Missions.actMission(n, replay);
        if (!replay) { FCV.markDone(S(), n, 'mission'); FCV.actState(S(), n).mission = null; }
        void mr;
      }
      else if (step.kind === 'closer') { await F.closer(n, replay); return; }
      else { await v2.actStep(n, stepId, replay); if (!replay && stepId === 'scene:2.2' && window.Family && Family.clipOnce) await Family.clipOnce('FM-V04'); }
      /* stars on every graded step */
      if (mine && mine.right + mine.wrong + mine.partly > 0 && !/mission|methods/.test(step.kind)) MiniGame.giveStars(key, mine.wrong === 0 && mine.partly === 0 ? 3 : mine.wrong <= 1 ? 2 : 1);
      if (!replay && !wasDone && FCV.isDone(S(), n, stepId)) { S().resumeStep = null; Game.flush(); }
      if (!replay) {
        var nn = FCV.nextSteps(S(), n)[0];
        if (nn && nn.kind === 'shift_check') await F.actStep(n, nn.id);
        else if (nn && nn.kind === 'closer' && step.kind !== 'rehearsal') await F.closer(n);
        else if (nn && (step.kind === 'methods' || step.kind === 'academy_entrance') && window.Session) Session.offerNext();
      }
    } catch (e) {
      if (!isLeave(e)) throw e;
      UI.close();
      /* D-04: "From the top" on a resumed scene leaves it and starts it again from its first line */
      var top = F.restartTop; F.restartTop = null;
      if (top && top.n === n && top.step === stepId) { tally = prevTally; if (top.clearResume) { S().resume = null; Game.save(); } Game.refresh(); return F.actStep(n, stepId, replay); }
      UI.toast('Saved. The marker will be here when you come back.');
    } finally { tally = prevTally; }
    Game.refresh();
  };

  /* ---------------- the closer: Shift Check has run; K1 "Stamped, and saved." writes the save ---------------- */
  F.closer = async function (n, replay) {
    var a = SC().acts[n - 1], cl = a.closer, st = S(), nextA = SC().acts[n];
    if (cl.cutscene === 'the_chain') await F.theChain(true);
    var mins = nextA ? FCV.MIN[n + 1] : 20, nextName = nextA ? nextA.district.name : 'the Evidence Locker and the Viva Hall';
    var film = (cl.film || []).filter(function (s) { return !s.cutscene; }).map(function (s) {
      var o = Object.assign({}, s);
      if (s.visual && s.visual.asset === 'closer card') { o.fact = cl.card; o.visual = { asset: 'closer card' }; }
      if (s.visual && /Animal card/.test(s.visual.asset)) { o.visual = { asset: 'keeper card' }; o.speaker = 'animal'; }
      if (s.visual && s.visual.asset === 'buttons') {
        o.subtitle = 'Saved. Next: ' + nextName + ', about ' + mins + ' min.' + (st.settings.family && window.Family ? ' ' + Family.spottedLine('closer:' + n) : '');
        o.visual = { asset: (nextA && nextA.opening_cutscene[0] && nextA.opening_cutscene[0].visual.asset) || 'S15' };
        o.buttons = [{ label: 'Carry on', value: 'go' }, { label: st.settings.family ? SC().session_copy.family.bedtime : 'Stop here', value: 'stop' }]; o.auto = 5000;
      }
      return o;
    });
    var shotK3 = null;
    var res = await Director.play(film, { id: 'closer:' + n, full: !!replay, onShot: function (i, sh) {
      if (sh.shot === 'K1' && !replay) { FCV.markDone(S(), n, 'closer'); if (window.Sound) Sound.sfx('CFX-STAMP2'); Game.flush(); }
      if (sh.shot === 'K3') shotK3 = sh;
    } });
    if (!replay) {
      FCV.markDone(S(), n, 'closer');
      if (cl.tell_your_copilot && S().settings.family && window.Family) await Family.tell(cl.tell_your_copilot);
      await Game.snapshot('After Act ' + n + ': ' + a.district.name);
      if (window.Album) Album.check();
      if (window.Family) Family.journeyHop(n);
      /* item 17: the closer line is filed in Seven lines to say aloud, and says so */
      if (window.Notebook && Notebook.note) Notebook.note('Seven lines to say aloud', cl.card);
      if (window.Extras) { Extras.mark('films'); Extras.mark('album'); Extras.mark('passport'); }
      Game.flush();
    }
    Game.refresh();
    if (res === 'stop') { if (S().settings.family && window.Family) await Family.bedtime(); else await Session.endShift(); return; }
    if (n === 7 && !replay) {
      if (!S().cuts['film:the_long_ride']) await Director.film('the_long_ride');
      await F.hallOpens();
    } else if (window.Session && !replay) Session.offerNext();
  };
  F.theChain = async function (full) {
    var shots = Director.shotsFor('the_chain') || [];
    var att = S().viva.attempt || 0;
    if (!full && att >= 1) shots = shots.filter(function (s, i) { return i === 0 || /link-5|link-1/.test(JSON.stringify(s.fact || '')); });
    await Director.play(shots.map(function (sh) { var o = Object.assign({}, sh); if (sh.fact === 'link-5') o.card_label = 'Link 5: proposed, not found'; if (!o.music) o.music = 'CM-CHAIN'; return o; }), { id: 'the_chain', full: true });
    S().cuts.the_chain = 1; Game.flush();
  };
  function hallWeakShot(weak, lines) {
    var h2 = (lines['CN-H2'] || {}).text || '', n = weak.length; if (!n) return null;
    var sub = n === 3 ? h2 : (n === 1 ? 'This one could use another look first.' : 'These two could use another look first.');
    var sh = { visual: { asset: 'S15' }, subtitle: sub, speaker: 'marigold', buttons: n ? [{ label: 'Go there', value: 'go' }, { label: 'Not yet', value: 'no' }] : [{ label: 'Not yet', value: 'no' }] };
    if (sub === h2) sh.voice = 'CN-H2';
    if (n) sh.cardHTML = '<div class="castRoll">' + weak.map(function (p) { return '<div><b>' + UI.esc(p) + '</b></div>'; }).join('') + '</div>';
    return sh;
  }
  F.hallOpens = async function () {
    var st = S(); if (!FCV.vivaOpen(st) || st.viva.hallSeen) return;
    st.viva.hallSeen = true; Game.flush();
    var weak = FCV.weakest(st, 3).map(function (id) { var p = F.placeOf(id); return p ? p.label : null; }).filter(Boolean);
    var lines = SC().narration.lines;
    var res = await Director.play([{ visual: { asset: 'S15', move: 'slow push-in up the steps' }, subtitle: (lines['CN-H1'] || {}).text, voice: 'CN-H1', speaker: 'marigold', music: 'CM-HALL' },
      /* AUDR2-08: CN-H2 keeps its own words, so its recording plays; the places show as a card under it. With fewer than
         three places, the line is worded from the count (and plays as text). */
      hallWeakShot(weak, lines)], { id: 'hall_opens' });
    if (res === 'go' && weak.length) Game.travelTo(F.placeOf(FCV.weakest(st, 1)[0]));
  };

  /* ---------------- Kerb Inspectors: a spot check ---------------- */
  F.spotCheck = async function () {
    var st = S(), c = SC().session_copy.spot_check;
    if (!st.cuts.first_spot_check) { await Director.film('first_spot_check'); st.cuts.first_spot_check = 1; }
    var id = Mastery.due()[0] || FCV.mostOverdue(st) || FCV.data.story.acts[0].quiz[0].id;
    if (window.Sound) { Sound.sfx('inspector chime'); Sound.voice('STING-11', { speaker: 'inspector', text: 'Spot check.', pri: 'menu' }); }
    var out = null;
    try { UI.open('Spot check', c.first, 'img-16'); out = await F.present(id, null); if (out) F.record(id, out); }
    catch (e) { if (!isLeave(e)) throw e; }
    UI.close();
    Game.stars(out === 'right' ? -2 : -1, true);
    UI.toast(out === 'right' ? c.clear + ' Two amber lights off.' : 'Ride on. One amber light off. It is in your Notebook.', 3200);
  };
  F.bust = F.spotCheck;

  /* ---------------- the Viva Hall door: readiness, the ten doors, the doorbell ---------------- */
  F.vivaDoor = async function () {
    var st = S(), pr = await Mastery.predict();
    if (window.Family && st.settings.family) Family.job('doorbell');
    /* SD-26: one encouraging line at the door. Pass chance, readiness and the question bank live in Menu > Readiness. */
    /* FD4-01: in family mode a real attempt starts only from a one-second hold (a finger, the mouse, or Shift+Enter held),
       as a reset does; plain Enter or Space lands on Not yet */
    var fam = !!st.settings.family;
    var v = await UI.modal('Enter the Viva Hall?', '<p>Five hearts. A wrong answer costs a heart; you can always try again with fresh questions.</p>',
      [{ label: st.viva.paused ? 'Carry on the paused attempt' : 'Face the examiners', value: 1, cls: 'go', hold: fam }, { label: 'Not yet', value: 0 }], { focusSafe: fam });
    if (!v) return;
    if (!st.viva.paused) { st.predictions = (st.predictions || []).concat([{ at: Date.now(), p: pr.pass }]).slice(-20); await Game.snapshot('Before the viva, attempt ' + ((st.viva.attempt || 0) + 1)); }
    await Viva.start(!!st.viva.paused);
  };

  /* ---------------- coming back: Previously (v3) ---------------- */
  F.previously = async function () {
    var st = S(), shots = (Director.shotsFor('previously_v3') || []).map(function (s) { return Object.assign({}, s); }), n = st.lastTp || 0, obj = FCV.objective(st);
    var lines = SC().narration.lines;
    shots.forEach(function (sh) {
      if (sh.voice_by_last_tp) { var vid = sh.voice_by_last_tp[String(n)]; sh.voice = vid; sh.speaker = 'marigold'; sh.subtitle = (lines[vid] || {}).text; sh.fact = n ? ['ch' + n + '-tp'] : null; sh.visual = { asset: n ? ((SC().acts[n - 1].turning_point.visual || {}).asset || FCV.actBackdrop[n]) : 'img-15' }; }
      else if (/next step/.test(sh.visual.asset)) { sh.visual = { asset: obj.kind === 'act' ? FCV.actBackdrop[obj.act] : 'S09', move: 'slow push' }; if (obj.kind === 'act' && obj.step) sh.subtitle += ' Next: ' + obj.step.title + ', with ' + FCV.nameOf(FCV.stepSpeaker(obj.act, obj.step)) + '. About ' + FCV.MIN[obj.act] + ' min.'; }
      else if (Array.isArray(sh.fact) && /most overdue/.test(sh.fact[0])) {
        var miss = Object.keys(st.mem).filter(function (id) { return st.mem[id].lastOutcome === 'wrong' && FCV.askable(id); }).sort(function (x, y) { return FCV.overdue(st, y) - FCV.overdue(st, x); })[0];
        sh.fact = null; sh.cardHTML = miss ? UI.cardHTML(miss, { noMet: true }) : ''; if (!miss) sh.skip = true;
      }
    });
    await Director.play(shots.filter(function (s) { return !s.skip; }), { id: 'previously', full: true });
  };

  /* ---------------- the kiosk: Night Shift (exam mode), Tune-up Bay, Chain Sprint ---------------- */
  F.nightShift = async function (exam) {
    var st = S(), ready = exam ? Mastery.proofReady(10) : [], due = Mastery.interleave(ready.concat(Mastery.due().filter(function (id) { return ready.indexOf(id) < 0; }))).slice(0, 10), pool = [];
    if (due.length < 10) {
      var played = [];
      for (var n = 1; n <= 7; n++) if (FCV.actOpen(st, n)) played = played.concat(FCV.actItems(n));
      Object.keys(st.methods.lessons || {}).forEach(function (mid) { var m = FCV.methodById(mid); if (m) m.quiz.forEach(function (q, i) { played.push(mid + ':q' + (i + 1)); }); });
      pool = FCV.shuffle(played.filter(function (id) { return due.indexOf(id) < 0 && FCV.askable(id); }));
    }
    var ids = due.concat(pool).slice(0, 10);
    if (!ids.length) { UI.toast('Nothing for the Night Shift yet. Play a few scenes first.', 3000); return; }
    if (exam) Mastery.examContext = 'nightshift';
    var res = await MiniGame.run({ key: 'night-shift', title: 'Night Shift' + (exam ? ' (exam mode)' : ''), items: ids.map(function (id) { return { id: id }; }), practice: true, resumable: true, init: function () { return { exam: !!exam }; },
      item: function (it, api) { var r = FCV.resolve(it.id); if (r && (r.type === 'quiz' || r.type === 'bank')) return exam ? examQuiz(it.id, api) : api.quiz(it.id, {}); return MiniGame.sayHere(r, {}, api); } });
    Mastery.examContext = null;
    return res;
  };
  function examQuiz(id, api) {
    /* an item the length gate marks (or a recall-only methods item) is a Say it here too, never a pick */
    var rg = FCV.resolve(id); if (rg && FCV.gated(rg)) return MiniGame.sayHere(rg, { id: id }, api);
    /* think first, then sure or not, then the options */
    return new Promise(function (resolve, reject) {
      var body = api.frame('<div class="q">' + esc(FCV.resolve(id).q) + '</div><p class="dir">Think first. Then say whether you are sure.</p><div class="actions"><button class="btn go" type="button" data-s="1">I am sure</button><button class="btn" type="button" data-s="0">Not sure</button></div>');
      api.reject = reject;
      Array.prototype.forEach.call(body.querySelectorAll('[data-s]'), function (b) { b.addEventListener('click', function () { UI.lastSure = b.getAttribute('data-s') === '1'; api.quiz(id, {}).then(resolve, reject); }); });
    });
  }
  F.examQuiz = examQuiz;
  F.kiosk = async function () {
    var st = S(), nightOpen = FCV.actDone(st, 3), sprintOpen = FCV.actDone(st, 6);
    UI.open("Digits' kiosk", 'Quick drills', 'img-13');
    try {
      for (;;) {
        var part = Mastery.worstPart();
        /* SD-24: three choices. Tonight's 10 first; Chain Sprint; More drills holds the rest. The Tune-up Bay shows only
           once a habit is worn. */
        var main = [], more = [];
        if (nightOpen) main.push({ label: "Night Shift: tonight's 10 (recommended)", sub: '10 mixed questions, the ones due first', value: 'night' });
        if (sprintOpen) main.push({ label: 'Chain Sprint', sub: 'Each link: the claim, the count, and the objections', value: 'sprint' /* QAD4-07: links 1 and 4 have no objection */ });
        var drills = [
          { label: 'Twins', sub: 'Two real figures. Which belongs?', value: 'twins' },
          { label: 'Objective parts', sub: 'Match each sub-objective to its number', value: 'obj' },
          { label: 'Night Shift, exam mode', sub: nightOpen ? 'Think first, then say whether you are sure: it shows which cards you really know' : 'Opens after Act 3', disabled: !nightOpen, value: 'exam' }];
        if (part) drills.splice(0, 0, { label: 'Tune-up Bay', sub: 'Most worn: ' + part.part + ' (' + part.error + ')', value: 'tune' });
        if (!sprintOpen) drills.push({ label: 'Chain Sprint', sub: 'Opens after Act 6', disabled: true, value: 'sprint' });
        while (main.length < 2 && drills.length && !drills[0].disabled) main.push(drills.shift());
        more = drills;
        document.getElementById('sheetLeave').classList.add('hidden');
        var v = await UI.menu('digits', 'What are we running tonight?', main.concat(more.length ? [{ label: 'More drills', sub: more.map(function (x) { return x.label; }).join(', '), value: 'more', tag: 'MORE' }] : []).concat([{ label: 'Back to the city', sub: 'Your place is kept', value: 'leave', tag: 'EXIT' }]));
        if (v === 'more') v = await UI.menu('digits', 'More drills.', more.concat([{ label: 'Back', value: 'back', tag: 'BACK' }]));
        document.getElementById('sheetLeave').classList.remove('hidden');
        if (v === 'back') continue;
        if (v === 'leave') break;
        if (v === 'night' || v === 'exam' || v === 'tune' || v === 'sprint') {
          UI.close();
          if (v === 'night') await F.nightShift(false); else if (v === 'exam') await F.nightShift(true); else if (v === 'tune') await Missions.tuneUp(); else await Missions.chainSprint();
          UI.open("Digits' kiosk", 'Quick drills', 'img-13');
        }
        if (v === 'twins') await F.twins();
        if (v === 'obj') await F.objectiveParts();
      }
    } catch (e) { if (!isLeave(e)) throw e; }
    UI.close(); Game.refresh();
  };

  /* ---------------- the Evidence Locker: entry film and each room's first visit ---------------- */
  F.lockerEntry = async function () {
    await Director.film('evidence_locker_entry');
    S().cuts.locker_entry = 1; Game.flush(); Game.refresh();
  };
  F.roomEntry = async function (room) {
    var st = S();
    if (window.Family && st.settings.family) Family.job('key');
    var shots = F.roomEntryShots(room);
    if (shots) await Director.play(shots, { id: 'room:' + room.id });
    return v2.roomEntry(room);
  };
  /* the room's entry film, rebuilt the same way for the Films shelf */
  F.roomEntryShots = function (room) {
    var rx = Object.keys(FCV.media).filter(function (k) { var m = FCV.media[k]; return /^RX/.test(k) && (m.used_in || []).join(' ').indexOf(room.id) >= 0; })[0];
    var lineId = Object.keys(SC().narration.lines).filter(function (k) { return k.indexOf('CN-R-') === 0 && (SC().narration.lines[k].room === room.id || k.toLowerCase().indexOf(room.id.toLowerCase().slice(0, 4)) >= 0); })[0];
    if (!rx && !lineId) return null;
    var L = lineId ? SC().narration.lines[lineId] : null;
    return [{ visual: { asset: rx || FCV.portrait(room.keeper) || 'S09', move: 'slow push-in' }, subtitle: L ? L.text : room.name, voice: lineId, speaker: 'marigold', fact: room.appendices.map(function (x) { return 'app-' + x + '-what'; }).slice(0, 2), docket_spot: true }];
  };
  /* Review surfaces also ask the say-it items: say it aloud, then reveal the card. */
  var v2present = F.present;
  F.present = async function (id, who) {
    var r = FCV.resolve(id);
    if (r && r.type === 'say') { var rt = await UI.sayAloud(who || 'vera', UI.sayPrompt(r), [{ cardId: r.base, text: r.text }], { wake: 3 }); return rt === 'nailed' ? 'right' : rt; }
    return v2present(id, who);
  };
  F.endShift = function () { return Session.endShift(); };
  F.morningRound = function () { return Session.morningRound(); };
})();
