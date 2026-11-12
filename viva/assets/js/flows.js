/* Freight City Viva v2: story flows built from script.json (v2). */
(function () {
  'use strict';
  var F = {};
  var S = function () { return Game.state; };
  var SC = function () { return FCV.data.script; };
  var isLeave = function (e) { return e && e.leave; };
  var esc = function (s) { return UI.esc(s); };
  F.HELD = {};

  /* Held-by-the-author notes, keyed by the id they sit on. */
  F.buildHeld = function () {
    var map = {};
    (function walk(o) {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o && typeof o === 'object') {
        if (o.held_note) [].concat(o.ref || o.question || o.fact || []).forEach(function (id) { map[id] = o.held_note; });
        Object.keys(o).forEach(function (k) { walk(o[k]); });
      }
    })(SC().evidence_locker);
    F.HELD = map; UI.setHeld(map);
  };

  /* ---------------- answering and memory ---------------- */
  F.record = function (id, outcome, sure) {
    /* item 21: Skip for now records nothing (the caller brings the item back) */
    if (outcome === 'skip' || (UI.skipNext && Date.now() - UI.skipNext < 2500 && outcome !== 'right')) { UI.skipNext = 0; return { rec: S().mem[id] || { box: 0, seen: 0 }, first: false, skipped: true }; }
    var res = FCV.memRecord(S(), id, outcome, sure); Game.heat(outcome, res); Game.save();
    /* item 17: anything filed for another look says so */
    if ((outcome === 'wrong' || outcome === 'partly' || outcome === 'missed') && window.Notebook && Notebook.note) Notebook.note('To revisit', id);
    return res;
  };
  /* item 6: a scene left part-way carries on from its line */
  F.resumeAt = async function (key, total, label) {
    var st = S(); st.lineAt = st.lineAt || {}; var at = st.lineAt[key] || 0;
    var quick = F.quickResume; F.quickResume = false;
    if (!at || at >= total) return 0;
    /* D-04: arriving through Continue is already the choice to go back: the scene opens at its line, and a small
       "From the top" sits in a note for a few seconds */
    if (quick) { F.topNote = { key: key, label: label, at: at, total: total }; return at; }
    var v = await UI.modal('Back in: ' + label, '<p>Back in: ' + UI.esc(label) + ', line ' + (at + 1) + ' of ' + total + '.</p>', [{ label: 'Carry on', value: 'on', cls: 'go' }, { label: 'From the top', value: 'top' }]);
    if (v === 'top') { delete st.lineAt[key]; Game.save(); return 0; }
    return at;
  };
  /* item 27: before the first timed game of each kind, Sal offers to switch the clock off */
  F.clockOffer = async function (kind) {
    var st = S(), key = 'clockOffer:' + kind;
    if (st.cuts[key] || (kind === 'viva' ? !st.settings.hardViva : !st.settings.timers)) return;
    st.cuts[key] = 1; Game.save();
    var txt = kind === 'whistle' ? 'Six seconds a call. Want the clock off?' : kind === 'viva' ? 'Forty-five seconds an answer. Want the clock off?' : 'The Gate Run keeps a clock. Want it off?';
    var v = await UI.modal('The clock', '<p><b>Sal:</b> ' + UI.esc(txt) + '</p><p class="small">You can change this any time in Settings.</p>', [{ label: 'Keep the clock', value: 'keep', cls: 'go' }, { label: kind === 'viva' ? 'Clock off' : 'Timers off', value: 'off' }]);
    if (v === 'off') { if (kind === 'viva') st.settings.hardViva = false; else st.settings.timers = false; FCV.stampSettings(st); Game.applySettings(); Game.save(); UI.toast('Clock off. Settings can bring it back.', 2200); }
  };
  F.offerTop = function (n, stepId) {
    var t = F.topNote; F.topNote = null; if (!t) return;
    UI.toast('Back in: ' + t.label + ', line ' + (t.at + 1) + ' of ' + t.total + '.', 6000, { action: { label: 'From the top', fn: function () {
      var st = S(); if (st.lineAt) delete st.lineAt[t.key]; Game.save(); F.restartTop = { n: n, step: stepId };
      var lv = document.getElementById('sheetLeave'); if (lv) lv.click();
    } } });
  };
  /* QAD3-m4: a line reached is on its way to the account within 0.4 s, and a new line never pushes that back */
  F.lineDone = function (key, next) { var st = S(); st.lineAt = st.lineAt || {}; st.lineAt[key] = next; Game.save(true); };

  /* ---------------- lines ---------------- */
  async function sayLine(l, key, opts) {
    opts = opts || {};
    if (l.format === 'say_then_reveal') {
      var reveal = [].concat(l.fact || []).map(function (f) { var r = FCV.resolve(f); return r && r.type === 'eq' ? { title: 'Model answer', text: r.answer, loc: r.loc } : { cardId: f, text: r ? r.text : '' }; });
      var rating = await UI.sayAloud(l.who === 'you' ? opts.asker || 'you' : l.who, opts.prompt || l.line, reveal, { wake: 3, unscored: /unscored/.test(String(l.check || '')) });
      [].concat(l.fact || []).forEach(function (f) { if (rating !== 'unscored') F.record('say:' + f, rating === 'nailed' ? 'right' : rating); });
      return;
    }
    var r = await UI.say(l.who, l.line, { fact: l.fact, direction: l.direction, held: l.held_by_author, key: key, compact: /compact/.test(String(l.card_style || '')),
      extra: l.held_note ? '<div class="held">' + esc(l.held_note) + '</div>' : '' });
    return r;
  }
  F.lines = async function (ls, keyBase, opts) {
    var from = opts && opts.from || 0, onLine = opts && opts.onLine;
    for (var i = from; i < ls.length; i++) { if (onLine) onLine(i); await sayLine(ls[i], keyBase ? keyBase + ':' + i : null, Object.assign({ prompt: i && ls[i - 1].who !== 'you' ? ls[i - 1].line : null, asker: i ? ls[i - 1].who : null }, opts || {})); }
  };
  function otherOf(lines) { for (var i = 0; i < lines.length; i++) if (lines[i].who !== 'you') return lines[i].who; return 'vera'; }
  function chapterTitle(a) { return a.title.replace(/^Chapter \d+\s+/, ''); }

  /* ---------------- cutscenes by id ---------------- */
  F.cutsceneRef = async function (ref) {
    var id = String(ref).replace(/^cutscene:/, '').split(' ')[0], c = FCV.cut(id);
    if (!c || !Array.isArray(c.shots)) return;
    await UI.cutscene(c.shots);
    S().cuts[id] = 1; Game.save();
  };

  /* ---------------- the opening ---------------- */
  F.coldOpen = async function () {
    var co = SC().cold_open;
    var shots = co.shots.map(function (sh) {
      var o = Object.assign({}, sh);
      if (sh.title_card) { o.title = sh.title_card; o.titleSub = null; }
      if (sh.style === 'character_card') o.cardHTML = '<div class="charCard">' + UI.porHTML('you') + '<div><b>' + esc(FCV.nameOf('you')) + '</b><small>' + esc(FCV.roleOf('you')) + '</small></div></div>';
      return o;
    });
    await UI.cutscene(shots);
    S().intro = true; S().cuts.cold_open = 1; Game.save();
    UI.toast('Ride into the Blank Quarter.', 3000); if (window.Extras) Extras.showHint();
  };

  F.actOpening = async function (n) {
    var a = SC().acts[n - 1];
    var first = a.opening_cutscene[0] && a.opening_cutscene[0].visual;
    var titleAsset = first ? (FCV.isVideo(first.asset) ? FCV.videoFallback[first.asset] : first.asset) : FCV.actBackdrop[n];
    var shots = [{ title: 'Act ' + n + ': ' + (a.opening_cutscene_name ? a.opening_cutscene_name : a.district.name), titleSub: 'Chapter ' + a.chapter + '. ' + chapterTitle(a), visual: { asset: titleAsset, move: 'slow push-in' }, ms: 3200 }];
    a.opening_cutscene.forEach(function (sh) { shots.push(sh); });
    await UI.cutscene(shots);
    FCV.markDone(S(), n, 'opening'); Game.save();
    UI.toast('Act ' + n + ': ' + a.district.map_line, 4000);
    Game.refresh();
  };

  /* ---------------- quiz runs: wrong answers come back at the end; resumable ---------------- */
  F.quizRun = async function (items, giver, opts) {
    opts = opts || {};
    var all = items.map(function (x, i) { return typeof x === 'string' ? { quiz: x, pos: i } : { quiz: x.quiz, framing: x.framing, pos: i }; });
    /* QAD3-B1: progress may be a function that finds the record in the live save each time (a save merged from another
       device while the run is open replaces the old record) */
    var prog = function () { return typeof opts.progress === 'function' ? opts.progress() : opts.progress; };
    var done = prog() || {};
    var queue = all.filter(function (x) { return !done[x.quiz]; });
    if (!queue.length) { queue = all.slice(); done = {}; var p0 = prog(); if (p0) Object.keys(p0).forEach(function (k) { delete p0[k]; }); }
    var status = all.map(function (x) { return done[x.quiz] ? 1 : 0; });
    var firstSeen = {}, first = 0, wrongFirst = 0, total = queue.length;
    while (queue.length) {
      var it = queue.shift();
      var right = await UI.quiz(it.quiz, { who: giver, framing: it.retry ? 'Back to this one. You have seen the answer now.' : it.framing, progress: status.slice() });
      F.record(it.quiz, right ? 'right' : 'wrong');
      if (!firstSeen[it.quiz]) { firstSeen[it.quiz] = 1; if (right) first++; else wrongFirst++; }
      if (right) { status[it.pos] = 1; done[it.quiz] = 1; var pg = prog(); if (pg) { pg[it.quiz] = 1; Game.save(); } }
      else { status[it.pos] = 2; queue.push({ quiz: it.quiz, framing: it.framing, pos: it.pos, retry: true }); }
    }
    return { first: first, total: total, wrongFirst: wrongFirst };
  };
  F.stampFor = function (wrongFirst) { return wrongFirst === 0 ? 'gold' : wrongFirst <= 1 ? 'silver' : 'bronze'; };
  var RK = { bronze: 1, silver: 2, gold: 3 };
  F.giveStamp = function (n, stamp, key) {
    var as = FCV.actState(S(), n), k = key || 'stamp';
    if ((RK[stamp] || 0) > (RK[as[k]] || 0)) as[k] = stamp;
    Game.save();
  };

  /* ---------------- rehearsals ---------------- */
  F.sting = async function (asker, lead) {
    var c = FCV.cut('examiner_sting');
    await UI.cutscene([{ visual: { asset: FCV.portrait(asker), move: 'character card' }, subtitle: lead || '', ms: 3000,
      cardHTML: '<div class="charCard">' + UI.porHTML(asker) + '<div><b>' + esc(FCV.nameOf(asker)) + '</b><small>' + esc(FCV.roleOf(asker)) + '</small></div></div>' }]);
    void c;
  };
  F.rehearsal = async function (n, step) {
    var a = SC().acts[n - 1], er = a[step.which];
    if (!er) return;
    await F.sting(er.asker, er.lead_in);
    UI.open('Examiner rehearsal', 'Act ' + n + ', ' + a.district.name, FCV.actBackdrop[n], { leave: 'Pause and ride' });
    var cardHTML = er.lead_in_card ? UI.cardHTML(er.lead_in_card) : '';
    var right;
    if (step.which === 'rehearsal_borrowed') {
      var r = FCV.resolve(er.ref), bq = r.item;
      var choices = bq.options.map(function (o, i) { return { text: o, best: i === bq.answer_index }; });
      right = await UI.choose(er.asker, null, '<div class="q">' + esc(bq.question) + '</div>', choices, UI.skimHTML('What they were after', bq.options[bq.answer_index], null, false) + UI.skimHTML('Why', bq.why, bq.source, false), { cardHTML: cardHTML });
      FCV.markSeen(S().viva, bq, right, 0);
      F.record(er.ref, right ? 'right' : 'wrong');
    } else {
      var q = FCV.resolve(er.question);
      var best = er.choices.filter(function (c) { return c.best; })[0];
      var ans = FCV.resolve((best && best.model_answer) || er.question);
      right = await UI.choose(er.asker, null, UI.cardHTML(er.question), er.choices, UI.skimHTML('Model answer', ans.answer, ans.loc || q.loc, false), { cardHTML: cardHTML });
      F.record(er.question, right ? 'right' : 'wrong');
    }
    return right;
  };

  /* ---------------- on air, the ladder, closers ---------------- */
  F.onAir = async function (n) {
    var a = SC().acts[n - 1], oa = a.on_air; if (!oa) return;
    UI.open('On air', 'Freight FM, live from ' + a.district.name, 'S20', { leave: 'Pause and ride' });
    var reveal = oa.reveal.map(function (id) { var r = FCV.resolve(id); return r && r.type === 'eq' ? { title: 'Model answer', text: r.answer, loc: r.loc } : { cardId: id, text: r ? r.text : '' }; });
    if (window.Family && S().settings.family) { Family.job('onair', 2); await new Promise(function (r) { setTimeout(r, 2000); }); }
    var rating = await UI.sayAloud('vera', oa.prompt, reveal, { wake: 5 });
    oa.reveal.forEach(function (id) { var r = FCV.resolve(id); F.record(r && r.type === 'eq' ? id : 'say:' + id, rating === 'nailed' ? 'right' : rating); });
  };
  function sentenceParts() { return FCV.clauses(FCV.data.story.thesis.one_sentence.text).map(function (p) { return p.replace(/[,;]$/, ''); }); }
  F.ladderBlank = async function () {
    var parts = sentenceParts(), blank = 'not a shortage of trust';
    var idx = parts.indexOf(blank); if (idx < 0) return;
    var shown = FCV.data.story.thesis.one_sentence.text.replace(blank, '________');
    /* m1: every other phrase of the sentence is on the screen, so a pick needed no knowledge: it is asked as Say it, with
       the missing phrase as the point to check */
    var os = FCV.data.story.thesis.one_sentence;
    UI.open('The one sentence, again', 'Say the whole sentence, gap and all', 'S04');
    await UI.sayAloud('vera', 'One phrase is missing: ' + shown + ' Say the whole sentence aloud, with the missing phrase.', [{ title: 'The thesis says', text: os.text, checkText: blank, loc: os.section }], { wake: 3 });
  };
  F.closer = async function (n) {
    var a = SC().acts[n - 1], cl = a.closer, nextA = SC().acts[n], st = S();
    var stamp = FCV.actState(st, n).stamp;
    if (cl.cutscene === 'the_chain') await F.theChain();
    var nextName = nextA ? nextA.district.name : 'the Evidence Locker and the Viva Hall';
    var mins = nextA ? FCV.MIN[n + 1] : 20;
    var nextArt = nextA ? (nextA.opening_cutscene[0] && nextA.opening_cutscene[0].visual.asset) : 'S15';
    var res = await UI.cutscene([
      { visual: cl.visual || { asset: FCV.actBackdrop[n] }, subtitle: 'District cleared.' + (stamp ? ' ' + stamp.charAt(0).toUpperCase() + stamp.slice(1) + ' stamp.' : ''), fact: cl.card, sound: 'passed', ms: 7000 },
      { visual: { asset: FCV.isVideo(nextArt) ? FCV.videoFallback[nextArt] : nextArt }, subtitle: 'Saved. Next: ' + nextName + ', about ' + mins + ' min.', buttons: [{ label: 'Carry on', value: 'go' }, { label: 'Stop here', value: 'stop' }] }
    ]);
    FCV.markDone(S(), n, 'closer'); Game.save();
    (cl.chain_lights && Array.isArray(cl.chain_lights) ? cl.chain_lights : []).forEach(function () {});
    Game.refresh();
    if (res === 'stop') await F.endShift();
    else if (n === 7) await F.hallOpens();
  };
  F.theChain = async function () {
    var c = FCV.cut('the_chain'); if (!c) return;
    var shots = c.shots.map(function (sh) { var o = Object.assign({}, sh); o.ms = 7000; if (sh.fact === 'link-5') o.card_label = 'Link 5: proposed, not found'; return o; });
    await UI.cutscene(shots);
    S().cuts.the_chain = 1; Game.save();
  };
  F.hallOpens = async function () {
    var st = S(); if (!FCV.vivaOpen(st) || st.viva.hallSeen) return;
    st.viva.hallSeen = true; Game.save();
    var weak = FCV.weakest(st, 3).map(function (id) { var p = F.placeOf(id); return p ? p.label : null; }).filter(Boolean);
    var res = await UI.cutscene([{ visual: { asset: 'S15', move: 'slow push-in up the steps' }, subtitle: 'The Viva Hall is open. Go when you are ready.' },
      { visual: { asset: 'S15' }, subtitle: weak.length ? 'Weakest three: ' + weak.join(', ') + '.' : 'Nothing weak on record yet.', buttons: [{ label: 'Go there', value: 'go' }, { label: 'Not yet', value: 'no' }] }]);
    if (res === 'go' && weak.length) Game.travelTo(F.placeOf(FCV.weakest(st, 1)[0]));
  };
  F.placeOf = function (id) {
    var m = /^ch(\d)-|^say:ch(\d)/.exec(id); if (m) { var n = +(m[1] || m[2]); return { kind: 'act', act: n, label: 'Act ' + n + ': ' + SC().acts[n - 1].district.name }; }
    var a = /app-([A-O])-/.exec(id); if (a) { var r = FCV.roomOfLetter(a[1]); return { kind: 'room', room: r.id, label: r.name }; }
    var b = /^bank:(.+)$/.exec(id); if (b) { var bq = FCV.bankItem(b[1]); return bq ? FCV.teachPlace(bq.source) : null; }
    var g = /^(gap|trace)-(\d\d)$/.exec(id);
    if (g) { var rooms = SC().evidence_locker.rooms; for (var i = 0; i < rooms.length; i++) { if (JSON.stringify(rooms[i]).indexOf('"' + id + '"') >= 0) return { kind: 'room', room: rooms[i].id, label: rooms[i].name }; } }
    return null;
  };

  /* ---------------- an act's steps ---------------- */
  F.actStep = async function (n, stepId, replay) {
    leaveKey = null;
    var a = SC().acts[n - 1], st = S(), steps = FCV.actSteps(n), step = steps.filter(function (s) { return s.id === stepId; })[0];
    if (!step) return;
    if (replay) UI.toast(SC().session_copy.replay_toast, 2200);
    try {
      if (step.kind === 'opening') { await F.actOpening(n); return; }
      if (step.kind === 'scene') {
        var sc = a.scenes[step.idx];
        var lk = 'act' + n + ':' + sc.id, from = await F.resumeAt(lk, sc.lines.length, 'Scene ' + sc.id);
        leaveKey = lk;
        if (sc.before && !from) await F.cutsceneRef(sc.before);
        UI.open('Act ' + n + ', scene ' + sc.id + ': ' + sc.title, sc.setting, FCV.actBackdrop[n], { leave: 'Pause and ride' });
        F.offerTop(n, stepId);
        if (sc.chip && !from) await UI.say(null, '', { fact: sc.chip, hint: 'This scene answers this part of objective 5.' });
        var asker = otherOf(sc.lines);
        var after = sc.in_scene ? Math.min(sc.in_scene.after_line, sc.lines.length) : -1;
        for (var i = from; i < sc.lines.length; i++) {
          await sayLine(sc.lines[i], 'act' + n + ':' + sc.id + ':' + i, { prompt: i ? sc.lines[i - 1].line : null, asker: i ? sc.lines[i - 1].who : asker });
          F.lineDone(lk, i + 1);
          if (i + 1 === after) {
            var right = await UI.quiz(sc.in_scene.quiz, { who: asker, framing: sc.in_scene.framing, job: n === 5 && sc.id === '5.4' ? 'tally' : undefined });
            if (right && n === 5 && sc.id === '5.4' && window.Family && Family.job && S().settings.family) Family.job('tally');
            F.record(sc.in_scene.quiz, right ? 'right' : 'wrong');
          }
        }
        UI.close();
        if (!replay) FCV.markDone(S(), n, step.id);
        if (sc.on_end && sc.on_end.light_link && !replay) { Game.save(); Game.chainLit(sc.on_end.light_link); }
        if (sc.after && /finding_or_proposition/.test(sc.after) && !replay) await F.drillFoP(true);
      } else if (step.kind === 'tp') {
        var tp = a.turning_point, tk = 'act' + n + ':tp', tfrom = await F.resumeAt(tk, tp.lines.length, 'the turning point');
        leaveKey = tk;
        UI.open('Turning point: ' + tp.title, 'Act ' + n + ', ' + a.district.name, (tp.visual && tp.visual.asset) || FCV.actBackdrop[n], { leave: 'Pause and ride' });
        F.offerTop(n, stepId);
        for (var j = tfrom; j < tp.lines.length; j++) {
          var l = tp.lines[j];
          if (tp.cut_in && j + 1 === tp.cut_in.line) {
            await UI.cutscene([{ visual: tp.cut_in.visual, subtitle: l.line, loop: tp.cut_in.loop, fact: tp.cut_in.then_card ? null : l.fact, ms: 6000 }].concat(tp.cut_in.then_card ? [{ visual: tp.cut_in.visual, subtitle: tp.cut_in.card_label || '', fact: tp.cut_in.then_card, card_label: tp.cut_in.card_label, ms: 8000 }] : []));
            if (l.fact) await UI.say(l.who, '', { fact: l.fact });
          } else await sayLine(l, 'act' + n + ':tp:' + j);
          F.lineDone(tk, j + 1);
        }
        UI.close();
        if (!replay) { FCV.markDone(S(), n, 'tp'); S().lastTp = n; Game.save(); if (n === 6) Game.chainLit('link-5'); }
        if (!replay) { var nxt = FCV.nextSteps(S(), n)[0]; if (nxt && (nxt.kind === 'on_air')) await F.actStep(n, nxt.id); }
        return;
      } else if (step.kind === 'on_air') {
        await F.onAir(n); UI.close();
        if (!replay) { FCV.markDone(S(), n, 'on_air'); Game.save(); var nx2 = FCV.nextSteps(S(), n)[0]; if (nx2 && nx2.kind === 'ladder') await F.actStep(n, nx2.id); }
        return;
      } else if (step.kind === 'ladder') {
        await F.ladderBlank(); UI.close();
        if (!replay) FCV.markDone(S(), n, 'ladder');
      } else if (step.kind === 'mission') {
        if (a.mission.mechanic && a.mission.mechanic.type !== 'gate_run') { await Mechanics.run(n, replay); }
        else {
          var as = FCV.actState(st, n); if (!as.mission) as.mission = {};
          UI.open('Mission: ' + a.mission.name, 'Given by ' + FCV.nameOf(a.mission.giver) + '. Wrong answers come back at the end.', FCV.actBackdrop[n], { leave: 'Pause and ride' });
          var r = await F.quizRun(a.mission.items, a.mission.giver, { progress: replay ? {} : function () { var x = FCV.actState(S(), n); return x.mission || (x.mission = {}); } });
          var stamp = F.stampFor(r.wrongFirst); F.giveStamp(n, stamp);
          await UI.banner('Mission passed', stamp.toUpperCase() + ' stamp. ' + r.first + ' of ' + r.total + ' right first time');
          UI.close();
        }
        if (!replay) { FCV.markDone(S(), n, 'mission'); FCV.actState(S(), n).mission = null; }
      } else if (step.kind === 'rehearsal') {
        await F.rehearsal(n, step); UI.close();
        if (!replay) { FCV.markDone(S(), n, step.id); Game.save(); var nx3 = FCV.nextSteps(S(), n)[0]; if (nx3 && (nx3.kind === 'rehearsal' || nx3.kind === 'mock_viva')) await F.actStep(n, nx3.id); else if (nx3 && nx3.kind === 'closer') await F.closer(n); }
        return;
      } else if (step.kind === 'mock_viva') {
        var passed = await Mechanics.mockViva(n);
        if (!replay && passed) FCV.markDone(S(), n, 'mock_viva');
      } else if (step.kind === 'closer') {
        await F.closer(n); return;
      }
      Game.save();
      if (!replay) {
        var nn = FCV.nextSteps(S(), n)[0];
        if (nn && nn.kind === 'closer') await F.closer(n);
      }
    } catch (e) {
      if (!isLeave(e)) throw e;
      UI.close();
      var at = leaveKey && S().lineAt && S().lineAt[leaveKey];
      UI.toast(at ? 'Saved at line ' + (at + 1) + '. Ride back in to carry on.' : 'Saved. Ride back in to carry on.', 3000);
    }
    Game.refresh();
  };
  var leaveKey = null;

  F.side = async function (n) {
    var a = SC().acts[n - 1], AS = function () { return FCV.actState(st0(), n); }, sm = a.side_mission;
    try {
      UI.open('Side mission: ' + sm.name, 'Optional. Given by ' + FCV.nameOf(sm.giver) + '.', FCV.actBackdrop[n], { leave: 'Pause and ride' });
      /* item 6: a side mission left part-way keeps the questions already answered */
      var r = await F.quizRun(sm.items, sm.giver, { progress: function () { var x = AS(); return x.sideRun || (x.sideRun = {}); } });
      await F.defineIt(n);
      var as = AS(); as.side = as.side || {}; as.side.done = true; as.sideRun = {}; F.giveStamp(n, F.stampFor(r.wrongFirst), 'sideStamp');
      await UI.banner('Side mission passed', r.first + ' of ' + r.total + ' right first time');
    } catch (e) { if (!isLeave(e)) throw e; UI.close(); UI.toast('Saved. Ride back in to carry on.', 2600); }
    UI.close(); Game.refresh();
  };
  function st0() { return S(); }

  F.cornerRun = async function (intro, items, store) {
    if (intro) await UI.say(null, intro);
    var queue = items.slice(), rounds = {};
    while (queue.length) {
      var it = queue.shift(); var q = FCV.resolve(it.question); var rating;
      if (!q) continue;
      var held = F.HELD[it.question] || it.held_note;
      if (it.choices) {
        var ok = await UI.choose(it.asker, null, UI.cardHTML(it.question), it.choices, UI.skimHTML('Model answer', q.answer, q.loc, false) + (held ? '<div class="held">' + esc(held) + '</div>' : ''));
        rating = ok ? 'nailed' : 'missed';
      } else {
        rating = await UI.sayAloud(it.asker, q.question, [{ title: 'Model answer', text: q.answer, loc: q.loc }], { wake: 3, cardHTML: held ? '<div class="held">' + esc(held) + '</div>' : '' });
      }
      F.record(it.question, rating === 'nailed' ? 'right' : rating);
      var sto = typeof store === 'function' ? store() : store; if (sto) sto[it.question] = rating; Game.save();
      if (rating !== 'nailed') { rounds[it.question] = (rounds[it.question] || 0) + 1; if (rounds[it.question] <= 2) queue.push(it); }
    }
  };
  F.corner = async function (n) {
    var a = SC().acts[n - 1], AS = function () { return FCV.actState(S(), n); }, ec = a.examiner_corner;
    try {
      UI.open('Examiner corner', 'Optional. Act ' + n + ', ' + a.district.name, FCV.actBackdrop[n], { leave: 'Pause and ride' });
      await F.cornerRun(ec.intro, ec.items, function () { var x = AS(); return x.corner || (x.corner = {}); });
      AS().cornerDone = true; Game.save();
      await UI.banner('Corner cleared', 'Partly and Missed are flagged in the notebook');
    } catch (e) { if (!isLeave(e)) throw e; UI.close(); UI.toast('Saved. Ride back in to carry on.', 2600); }
    UI.close(); Game.refresh();
  };

  /* ---------------- the Evidence Locker ---------------- */
  F.lockerEntry = async function () {
    var el = SC().evidence_locker;
    await UI.cutscene([{ title: el.name, titleSub: el.map_line, visual: { asset: 'S09', move: 'slow push-in' }, ms: 3500 }, { visual: el.entry.visual, subtitle: el.entry.subtitle }]);
    S().cuts.locker_entry = 1; Game.save(); Game.refresh();
  };
  function stageSub(s, rs, i) {
    if (s.kind === 'brief') return 'The keeper walks you through the shelves';
    /* QAD4-m2: a shelf quiz left part-way says how far it got */
    if (s.kind === 'quiz') { var nd = rs && i === rs.stage && rs.done ? s.items.filter(function (x) { return rs.done[typeof x === 'string' ? x : x.quiz]; }).length : 0; return nd && nd < s.items.length ? nd + ' of ' + s.items.length + ' done' : s.items.length + ' questions'; }
    if (s.kind === 'trace') return s.items.length + (s.items.length === 1 ? ' number' : ' numbers') + ' to trace';
    if (s.kind === 'grill') return s.items.length === 1 ? 'One tough question' : 'One tough question, then ' + (s.items.length - 1) + ' more';
    return s.items.length + ' examiner questions, optional';
  }
  F.roomStage = async function (room, rs0, stage) {
    /* QAD3-B1: the room's record is found in the live save at every write (a merge replaces it) */
    var who = room.keeper, RS = function () { return FCV.roomState(S(), room.id); }, rs = RS();
    if (stage.kind === 'brief') {
      /* a briefing left part-way picks up at its line */
      var from = rs.briefAt && rs.briefAt < room.lines.length ? rs.briefAt : 0;
      if (from) UI.toast('Back in: line ' + (from + 1) + ' of ' + room.lines.length + '.', 1800);
      await F.lines(room.lines, 'room:' + room.id, { from: from, onLine: function (i) { var r0 = RS(); if (i !== r0.briefAt) { r0.briefAt = i; Game.save(); } } });
      RS().briefAt = 0;
      if (room.held_say_aloud) {
        var h = room.held_say_aloud;
        var rating = await UI.sayAloud(who, h.prompt, [{ title: 'What the keepers say', text: h.reveal_lines.join(' '), loc: 'Coders\' Tower, Claims Registry, Locker Market, Archive Library' }], { wake: 3 });
        F.record('say:held', rating === 'nailed' ? 'right' : rating);
      }
      return;
    }
    if (stage.kind === 'quiz') {
      var r = await F.quizRun(stage.items, who, { progress: function () { var r0 = RS(); return r0.done || (r0.done = {}); } });
      await UI.banner('Shelf cleared', r.first + ' of ' + r.total + ' right first time');
      return;
    }
    if (stage.kind === 'trace') {
      var q = stage.items.map(function (t, i) { return { t: t, first: i === 0, tries: 0 }; });
      while (q.length) {
        var it = q.shift();
        var lead = it.tries ? 'Back to this one.' : it.first && it.t.digits_line ? it.t.digits_line : 'Another one for you. Where does this one live?';
        var ok = await UI.trace(it.t.ref, lead);
        F.record(it.t.ref, ok ? 'right' : 'wrong');
        if (F.HELD[it.t.ref]) await UI.say('digits', '', { extra: '<div class="held">' + esc(F.HELD[it.t.ref]) + '</div>' });
        if (!ok && it.tries < 1) { it.tries++; q.push(it); }
      }
      return;
    }
    if (stage.kind === 'grill') {
      for (var i = 0; i < stage.items.length; i++) {
        var g = stage.items[i], gap = FCV.resolve(g.ref), held = F.HELD[g.ref];
        var reveal = UI.cardHTML(g.ref) + UI.skimHTML('The honest answer', gap.answer, 'Where it is disclosed: ' + gap.where, false) + (held ? '<div class="held">' + esc(held) + '</div>' : '');
        if (g.honest_gist) {
          var choices = [{ text: g.honest_gist, best: true, feedback: 'Strong. Honest, calm, and it points to where you said it.' }]
            .concat((g.weak_replies || []).map(function (w, j) { return { text: w, error: (g.weak_errors || [])[j], feedback: (g.weak_feedback || [])[j] }; }));
          var okg = await UI.choose('grill', g.grill_line, '', choices, reveal);
          F.record(g.ref, okg ? 'right' : 'wrong');
        } else {
          var rt = await UI.sayAloud('grill', g.grill_line, [{ title: 'The honest answer', text: gap.answer, loc: 'Where it is disclosed: ' + gap.where }], { wake: 3, cardHTML: UI.cardHTML(g.ref) + (held ? '<div class="held">' + esc(held) + '</div>' : '') });
          F.record(g.ref, rt === 'nailed' ? 'right' : rt);
        }
      }
      return;
    }
    if (stage.kind === 'corner') { await F.cornerRun('The examiners have taken the back table. Answer aloud, then reveal.', stage.items, function () { var r0 = RS(); return r0.corner || (r0.corner = {}); }); }
  };
  F.roomEntry = async function (room) {
    var look = String(room.look || ''), m = /keeper card: (img-\d\d\w?)/.exec(look);
    var asset = m ? m[1] : look || 'S09';
    await UI.cutscene([{ visual: { asset: asset, move: 'slow push-in' }, subtitle: FCV.nameOf(room.keeper) + ', ' + FCV.roleOf(room.keeper) + '.', ms: 4000,
      cardHTML: '<div class="charCard">' + UI.porHTML(room.keeper) + '<div><b>' + esc(FCV.nameOf(room.keeper)) + '</b><small>' + esc(room.name) + ': Appendix ' + esc(room.appendices.join(' and ')) + '</small></div></div>' }]);
  };
  F.room = async function (id) {
    var room = FCV.room(id), RS = function () { return FCV.roomState(S(), id); }, rs = RS(), stages = FCV.roomStages(room);
    if (!rs.visited) { await F.roomEntry(room); rs = RS(); }
    /* SD-29: the subtitle names the appendices in the thesis's own titles, not the art brief */
    var appx = room.appendices.map(function (L) { var ap = FCV.data.facts.appendices.filter(function (a) { return a.letter === L; })[0]; return 'Appendix ' + L + (ap && ap.title ? ': ' + String(ap.title).split(':')[0] : ''); }).join('. ');
    UI.open(room.name, appx + '.', (room.look && !/keeper/.test(room.look)) ? room.look : 'S09');
    var greet = rs.visited ? 'Back again. Pick up where you left off.' : 'Welcome to ' + (/^The /.test(room.name) ? '' : 'the ') + room.name + '. Work through the stages in order; leave any time and keep your place.';
    if (!rs.visited) rs.visitedAt = Date.now(); rs.visited = true;
    /* QAD4-m2: the place he is in, so Continue comes back here if he leaves part-way (Session.roomLeft) */
    S().lastPlace = { kind: 'room', id: id, at: Date.now() }; Game.save();
    try {
      for (;;) {
        rs = RS();
        var items = stages.map(function (s, i) {
          var done = s.kind === 'corner' ? !!rs.cornerDone : i < rs.stage;
          var locked = s.kind === 'corner' ? rs.stage < 4 : i > rs.stage;
          return { label: (i + 1) + '. ' + s.title, sub: stageSub(s, rs, i), done: done, disabled: locked, value: i, tag: locked ? (s.kind === 'corner' ? 'Opens after the Grill' : 'Opens after stage ' + i) : undefined };
        });
        /* SD-29: one way out of the hub, and it says what is kept */
        items.push({ label: 'Back to the city', sub: rs.badge ? 'Your place is kept. Room badge held.' : 'Your place is kept', value: 'leave', tag: 'EXIT' });
        document.getElementById('sheetLeave').classList.add('hidden');
        var v = await UI.menu(room.keeper, greet, items);
        document.getElementById('sheetLeave').classList.remove('hidden');
        greet = 'What next?';
        if (v === 'leave') break;
        S().lastPlace = { kind: 'room', id: id, at: Date.now() };
        await F.roomStage(room, rs, stages[v]);
        rs = RS();
        if (stages[v].kind === 'corner') rs.cornerDone = true;
        else if (v === rs.stage) { rs.stage = v + 1; rs.stageAt = Date.now(); }
        Game.save();
        if (rs.stage >= 4 && rs.replaying) { rs.replaying = false; Game.save(); }
        if (rs.stage >= 4 && !rs.badge) {
          rs.badge = true; rs.badgeAt = Date.now(); Game.save(); Game.snapshot('Room badge: ' + room.name);
          await UI.banner('Evidence secured', room.name + ' badge. Badges: ' + FCV.badges(S()));
          if (FCV.vivaOpen(S())) { UI.close(); await F.hallOpens(); return; }
        }
      }
    } catch (e) { if (!isLeave(e)) throw e; }
    UI.close(); Game.refresh();
  };

  /* ---------------- parcels ---------------- */
  /* Khaled's items 1, 2 and 66: a plain card, a task with three choices, Put it in my bag, then the box flies into the bag */
  F.pickup = async function (id) {
    var st = S();
    st.parcels.picked[id] = Date.now(); st.parcels.bag.push(id); st.parcels.aim = id; Game.noteMet(id); Game.save();
    if (window.Extras) Extras.mark('notebook');
    UI.open('Parcel picked up: a fact to file', 'It goes in your bag (' + st.parcels.bag.length + ' of 6). Then deliver it where it belongs.', 'img-16', { noLeave: true });
    try { await Bag.card(id); } catch (e) { if (!isLeave(e)) throw e; }
    UI.close(); Game.refresh();
    Bag.added(id);
  };
  F.deliverAt = async function (place) {
    var st = S(), bag = st.parcels.bag.slice(); if (!bag.length) return;
    var here = bag.filter(function (id) { var h = FCV.parcelHome(id); return h && ((place.kind === 'act' && h.kind === 'act' && h.act === place.act) || (place.kind === 'room' && h.kind === 'room' && h.room === place.room)); });
    /* item 11: nothing for this door: name what is in the bag */
    if (!here.length) { UI.toast('None of ' + (bag.length === 1 ? 'your parcels' : 'these ' + bag.length) + ' live here: ' + bag.map(function (id) { return Bag.shortName(id); }).join('; ') + '. No heat. Open your bag to see where each one goes.', 5200); return; }
    st.parcels.bag = bag.filter(function (id) { return here.indexOf(id) < 0; });
    if (st.parcels.aim && here.indexOf(st.parcels.aim) >= 0) st.parcels.aim = null;
    here.forEach(function (id) { st.parcels.delivered[id] = Date.now(); F.record('recall:' + id, 'right'); });
    /* item 46: a chute sound in the district's key and the drop box lid flaps */
    if (here.length) { if (window.Kit) Kit.sfx('SFX-CHUTE', place.kind === 'act' ? place.act : 4); if (Game.renderer && Game.renderer.flapDrop && place.kind === 'act') Game.renderer.flapDrop(place.act); }
    Game.save();
    /* item 30: one sheet with every delivered card, stamped in turn */
    UI.open('Delivered', here.length + (here.length === 1 ? ' parcel' : ' parcels') + ' to ' + place.label, 'img-16');
    try { await F.stampCards(here); } catch (e) { if (!isLeave(e)) throw e; }
    UI.close(); Game.refresh();
  };
  /* QAD4-08: the Delivered card has no Read, Pin it or Copy card buttons for the stamp to land on (they stay on every other card) */
  F.stampCards = function (ids) {
    var html = '<div class="line">Right door.</div><div class="stampStack">' + ids.map(function (id, i) { return '<div class="dCard" data-k="' + i + '">' + UI.cardHTML(id, { compact: true, noTools: true, noRead: true }) + '<span class="dStamp" hidden>DELIVERED</span></div>'; }).join('') + '</div>' +
      '<div class="actions">' + (ids.length > 1 ? '<button class="btn small" type="button" data-all="1">Stamp them all</button>' : '') + '<button class="btn go" type="button">Done</button></div>';
    return UI.custom(null, html, function (done, t) {
      var k = 0, iv = null, stamp = function () { var st = t.querySelector('.dCard[data-k="' + k + '"] .dStamp'); if (st) { st.hidden = false; if (window.Kit) Kit.sfx('SFX-THUNK'); } k++; if (k >= ids.length) { clearInterval(iv); var a = t.querySelector('[data-all]'); if (a) a.remove(); } };
      stamp(); if (ids.length > 1) iv = setInterval(stamp, S().settings.reduceMotion ? 250 : 650);
      var all = t.querySelector('[data-all]'); if (all) all.addEventListener('click', function () { clearInterval(iv); while (k < ids.length) stamp(); });
      t.querySelector('.btn.go').addEventListener('click', function () { clearInterval(iv); while (k < ids.length) stamp(); done(true); });
    });
  };

  /* ---------------- drills ---------------- */
  F.drillFoP = async function (withDivider) {
    var d = SC().drills.finding_or_proposition;
    UI.open('Finding or proposition?', 'Say which each one is. A viva examiner will ask.', 'S06');
    try {
      var items = FCV.shuffle(d.items);
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var rr = FCV.resolve(it.id) || {};
        var right = await UI.quiz({ id: 'fop:' + it.id, q: (rr.figure ? rr.figure + '. ' : '') + (rr.text || ''), options: ['Finding', 'Proposition'], answer: it.answer === 'finding' ? 0 : 1,
          explanation: (it.answer === 'finding' ? 'A finding: what the data showed. ' : 'A proposition: stated so that it can be tested, with what would falsify it. ') + (rr.label || ''), loc: rr.loc }, { who: 'corra', framing: 'Finding or proposition?', rightWord: 'Right', wrongWord: 'Other way round' });
        F.record('fop:' + it.id, right ? 'right' : 'wrong');
      }
      if (withDivider) await F.divider();
    } catch (e) { if (!isLeave(e)) throw e; }
    UI.close();
  };
  F.divider = async function () {
    var d = SC().drills.finding_or_proposition.divider, text = FCV.resolve(d.fact).text;
    var parts = FCV.clauses(text);
    var answerAfter = -1; parts.forEach(function (p, i) { if (/the street,?$/.test(p.trim())) answerAfter = i; });
    var html = '<div class="line">Tap where the one sentence stops being a finding.</div><div class="divider">' +
      parts.map(function (p, i) { return '<span class="clause">' + esc(p) + '</span>' + (i < parts.length - 1 ? '<button class="cut pickable" type="button" data-i="' + i + '" aria-label="Cut after: ' + esc(p) + '">|</button>' : ''); }).join(' ') + '</div><div class="fb"></div>';
    await UI.custom('corra', html, function (done, el) {
      var answered = false;
      Array.prototype.forEach.call(el.querySelectorAll('.cut'), function (b) {
        b.addEventListener('click', function () {
          if (answered) return; answered = true;
          var i = +b.getAttribute('data-i'), ok = i === answerAfter;
          b.classList.add(ok ? 'right' : 'wrong'); var rb = el.querySelector('.cut[data-i="' + answerAfter + '"]'); if (rb) rb.classList.add('right');
          if (window.SFX) (ok ? SFX.right : SFX.wrong)();
          F.record('drill:divider', ok ? 'right' : 'wrong');
          var fb = el.querySelector('.fb');
          fb.innerHTML = '<div class="verdict ' + (ok ? 'r' : 'w') + '">' + (ok ? 'Right: after the street' : 'It stops after the street') + '</div>' + UI.cardHTML(d.answer) + '<div class="actions"><button class="btn go" type="button">Next</button></div>';
          fb.querySelector('.btn.go').addEventListener('click', function () { done(ok); });
        });
      });
    });
  };
  F.defineIt = async function (n) {
    var terms = (SC().drills.define_it.by_act['act' + n] || []).filter(function (t) { return FCV.resolve(t); });
    if (!terms.length) return;
    var gl = FCV.data.story.glossary;
    for (var i = 0; i < terms.length; i++) {
      var r = FCV.resolve(terms[i]);
      var wrong = FCV.shuffle(gl.filter(function (g) { return 'glossary:' + g.term !== terms[i]; })).slice(0, 3).map(function (g) { return g.meaning; });
      var opts = FCV.shuffle([r.text].concat(wrong));
      var ok = await UI.quiz({ id: 'define:' + terms[i], q: 'Define it: ' + r.figure, options: opts, answer: opts.indexOf(r.text), explanation: r.text, loc: r.loc }, { who: 'polly', framing: 'Define it.' });
      F.record('define:' + terms[i], ok ? 'right' : 'wrong');
    }
  };
  F.twins = async function () {
    var pairs = SC().drills.twins.pairs;
    for (var i = 0; i < pairs.length; i++) {
      var a = FCV.resolve(pairs[i][0]), b = FCV.resolve(pairs[i][1]); if (!a || !b) continue;
      var opts = FCV.shuffle([a.figure, b.figure]);
      var ok = await UI.quiz({ id: 'twins:' + i, q: 'Which is the figure for this? ' + a.text, options: opts, answer: opts.indexOf(a.figure), explanation: 'This one: ' + a.figure + ' (' + a.loc + '). The other, ' + b.figure + ', is: ' + b.text, loc: a.loc }, { who: 'digits', framing: 'Twins. Both numbers are real. Which belongs here?' });
      F.record('twins:' + i, ok ? 'right' : 'wrong');
    }
  };
  F.objectiveParts = async function () {
    var items = FCV.shuffle(SC().drills.objective_parts.items);
    for (var i = 0; i < items.length; i++) {
      var r = FCV.resolve(items[i]); if (!r) continue;
      var num = items[i].replace('obj-', '');
      var others = FCV.shuffle(SC().drills.objective_parts.items.filter(function (x) { return x !== items[i]; })).slice(0, 3).map(function (x) { return x.replace('obj-', ''); });
      var opts = FCV.shuffle([num].concat(others));
      var ok = await UI.quiz({ id: 'objpart:' + num, q: 'Which sub-objective is this? ' + r.text, options: opts, answer: opts.indexOf(num), explanation: 'Objective ' + num + ': ' + r.text, loc: r.loc }, { who: 'digits' });
      F.record('objpart:' + num, ok ? 'right' : 'wrong');
    }
  };

  /* ---------------- spaced review ---------------- */
  /* Ask any remembered item, whatever kind it is. Resolves 'right' | 'wrong' | 'partly'. */
  F.present = async function (id, who) {
    var r = FCV.resolve(id);
    if (!r) return null;
    if (r.type === 'quiz' || r.type === 'bank') {
      var opts = r.type === 'bank' ? FCV.shuffle(r.options.map(function (o, i) { return i; })) : null;
      var item = r.type === 'bank' ? { id: id, q: r.q, options: opts.map(function (i) { return r.options[i]; }), answer: opts.indexOf(r.answer), explanation: r.explanation, loc: r.loc, label: 'From the viva' } : r;
      var ok = await UI.quiz(item, { who: who || 'digits', gate: true });
      if (r.type === 'bank') FCV.markSeen(S().viva, r.item, ok, S().viva.attempt);
      return ok ? 'right' : 'wrong';
    }
    if (r.type === 'trace') { var t = await UI.trace(id, 'Where does this one live?'); return t ? 'right' : 'wrong'; }
    if (r.type === 'eq' || r.type === 'gap') {
      var rt = await UI.sayAloud(who || 'dr_tally', r.type === 'eq' ? r.question : 'The gap. Give your honest answer.', [{ title: r.type === 'eq' ? 'Model answer' : 'The honest answer', text: r.answer, loc: r.loc || r.where }], { wake: 3, cardHTML: r.type === 'gap' ? UI.cardHTML(id) : (UI.heldLabel(id, r) ? '<div class="held">' + UI.esc(UI.heldLabel(id, r)) + '</div>' : '') });
      return rt === 'nailed' ? 'right' : rt;
    }
    return null;
  };
  F.reviewRun = async function (ids, title, sub, who) {
    var right = 0, n = 0;
    UI.open(title, sub, 'img-15');
    try {
      for (var i = 0; i < ids.length; i++) {
        var out = await F.present(ids[i], who); if (!out) continue;
        n++; if (out === 'right') right++;
        F.record(ids[i], out);
      }
    } catch (e) { if (!isLeave(e)) throw e; }
    UI.close();
    return { right: right, n: n };
  };
  F.morningRound = async function () {
    var due = FCV.dueList(S()); if (!due.length) return;
    var v = await UI.modal('Morning Round', '<p>' + due.length + ' items are due. Three now, to warm up?</p>', [{ label: 'Three now', value: 1, cls: 'go' }, { label: 'Skip', value: 0 }]);
    if (!v) return;
    var done = 0;
    while (done < 12 && due.length) {
      var batch = due.slice(done, done + 3); if (!batch.length) break;
      await F.reviewRun(batch, 'Morning Round', 'Items you have seen before, due today', 'vera');
      done += batch.length; due = FCV.dueList(S());
      if (done >= 12 || !due.length) break;
      var more = await UI.modal('Morning Round', '<p>' + due.length + ' still due.</p>', [{ label: 'Three more', value: 1, cls: 'go' }, { label: 'That will do', value: 0 }]);
      if (!more) break; done = 0;
    }
    S().lastDue = Date.now(); Game.save();
  };
  F.nightShift = async function () {
    var st = S();
    var due = FCV.dueList(st).slice(0, 10), pool = [];
    if (due.length < 10) {
      var played = [];
      for (var n = 1; n <= 7; n++) if (FCV.actOpen(st, n)) played = played.concat(FCV.actItems(n));
      Object.keys(st.viva.seen).forEach(function (bid) { if (st.viva.seen[bid].result === 'wrong') played.push('bank:' + bid); });
      pool = FCV.shuffle(played.filter(function (id) { return due.indexOf(id) < 0 && FCV.askable(id); }));
    }
    var ids = due.concat(pool).slice(0, 10);
    if (!ids.length) { UI.toast('Nothing for the Night Shift yet. Play a few scenes first.', 3000); return; }
    var r = await F.reviewRun(ids, 'Night Shift', 'Ten items, the ones you need most first', 'digits');
    if (r.n) await UI.banner('Shift over', r.right + ' of ' + r.n + '. ' + (r.right >= r.n * 0.9 ? 'Clean shift.' : r.right >= r.n * 0.6 ? 'Solid shift.' : 'Rough shift. They will come back.'));
  };
  F.kiosk = async function () {
    var st = S(), nightOpen = FCV.actDone(st, 3);
    UI.open("Digits' kiosk", 'Numbers, twins and the Night Shift', 'img-13');
    try {
      for (;;) {
        var v = await UI.menu('digits', 'What are we running tonight?', [
          { label: 'Night Shift', sub: nightOpen ? '10 mixed items, due ones first' : 'Opens after Act 3', disabled: !nightOpen, value: 'night' },
          { label: 'Twins', sub: 'Two real figures. Which belongs?', value: 'twins' },
          { label: 'Objective parts', sub: 'Match each sub-objective to its number', value: 'obj' },
          { label: 'Back to the city', value: 'leave', tag: 'EXIT' }]);
        if (v === 'leave') break;
        if (v === 'night') { UI.close(); await F.nightShift(); UI.open("Digits' kiosk", 'Numbers, twins and the Night Shift', 'img-13'); }
        if (v === 'twins') await F.twins();
        if (v === 'obj') await F.objectiveParts();
      }
    } catch (e) { if (!isLeave(e)) throw e; }
    UI.close(); Game.refresh();
  };

  /* ---------------- busted ---------------- */
  F.bust = async function () {
    var st = S();
    if (!st.cuts.first_bust) { await F.cutsceneRef('first_bust'); }
    var id = FCV.mostOverdue(st) || FCV.data.story.acts[0].quiz[0].id;
    if (window.SFX) SFX.siren();
    var out = null;
    try {
      UI.open('Spot check', 'Answer one you missed, and you ride on.', 'img-16');
      out = await F.present(id, null);
      if (out) F.record(id, out);
    } catch (e) { if (!isLeave(e)) throw e; }
    UI.close();
    Game.stars(out === 'right' ? -2 : -1, true);
    UI.toast(out === 'right' ? 'Released. Two amber lights off.' : 'Released with a caution. One amber light off. It is in your Notebook.', 3200);
  };

  /* ---------------- coming back ---------------- */
  F.previously = async function () {
    var st = S(), sc = SC();
    var n = st.lastTp || 0, obj = FCV.objective(st);
    var shots = [];
    if (n) { var a = sc.acts[n - 1], v = a.turning_point.visual && a.turning_point.visual.asset; shots.push({ visual: { asset: v || FCV.actBackdrop[n] }, subtitle: 'Previously: ' + a.district.name + '.', fact: 'ch' + a.chapter + '-tp', ms: 5000 }); }
    if (obj.kind === 'act' && obj.step) {
      var who = FCV.stepSpeaker(obj.act, obj.step);
      shots.push({ visual: { asset: FCV.actBackdrop[obj.act] }, subtitle: 'Now: ' + obj.step.title + ', with ' + FCV.nameOf(who) + '. About ' + FCV.MIN[obj.act] + ' min.', ms: 5000 });
    } else shots.push({ visual: { asset: 'S09' }, subtitle: 'Now: ' + obj.label + '.', ms: 5000 });
    var miss = Object.keys(st.mem).filter(function (id) { return st.mem[id].lastOutcome === 'wrong' && FCV.askable(id); }).sort(function (x, y) { return FCV.overdue(st, y) - FCV.overdue(st, x); })[0];
    if (miss) shots.push({ visual: { asset: 'img-15' }, subtitle: 'Wrong last time.', cardHTML: UI.cardHTML(miss, { noMet: true }), ms: 5000 });
    await UI.cutscene(shots);
  };
  F.endShift = async function () {
    var st = S(), obj = FCV.objective(st), due = FCV.dueList(st).length;
    Game.save();
    var nm = obj.kind === 'act' && obj.step ? obj.step.title : obj.label, mins = obj.kind === 'act' ? FCV.MIN[obj.act] : 25;
    var txt = SC().session_copy.end_shift.replace('[step]', nm).replace('[n]', mins).replace('[d]', due);
    await UI.modal('End of shift', '<p>' + esc(txt) + '</p><p class="statusLine">' + esc(Game.statusText()) + '</p>', [{ label: 'Back to the title', value: 'title', cls: 'go' }, { label: 'Keep riding', value: 'ride' }]).then(function (v) { if (v === 'title') Game.showTitle(); });
  };

  F.vivaLocked = function () {
    var st = S(), b = FCV.badges(st), need = FCV.BADGES_FOR_VIVA;
    var msg = !FCV.actDone(st, 7) ? 'Finish all seven acts first, then hold at least ' + need + ' badges.' : 'Hold at least ' + need + ' badges. The Evidence Locker rooms each give one.';
    var rooms = SC().evidence_locker.rooms.filter(function (r) { return !(st.rooms[r.id] && st.rooms[r.id].badge); });
    /* QAD-m3: one room to go to next (the nearest without a badge), the others folded under All rooms */
    var row = function (r) { return '<div class="hubItem" style="cursor:default"><span>' + esc(r.name) + '</span><button class="btn small" type="button" data-ride="' + esc(r.id) + '">Ride there</button></div>'; };
    try { var pp = Game.player(); rooms.sort(function (a, c) { var ma = Game.cityMarker ? Game.cityMarker('room-' + a.id) : null, mc = Game.cityMarker ? Game.cityMarker('room-' + c.id) : null; return (ma ? Math.hypot(ma.x - pp.x, ma.y - pp.y) : 1e9) - (mc ? Math.hypot(mc.x - pp.x, mc.y - pp.y) : 1e9); }); } catch (e) {}
    var list = rooms.length ? '<p>The nearest room without a badge:</p><div class="hubList">' + row(rooms[0]) + '</div>' + (rooms.length > 1 ? '<details class="more"><summary>All rooms without a badge (' + rooms.length + ')</summary><div class="hubList">' + rooms.slice(1).map(row).join('') + '</div></details>' : '') : '';
    return new Promise(function (res) { UI.modal('The Viva Hall is locked', '<p>' + esc(msg) + '</p><p>You have ' + b + (b === 1 ? ' badge' : ' badges') + '. The Hall opens at ' + need + '.</p>' + list, [{ label: 'Back to the city', value: 1, cls: 'go' }], { onOpen: function (box) {
      Array.prototype.forEach.call(box.querySelectorAll('[data-ride]'), function (bt) { bt.addEventListener('click', function () { document.getElementById('modal').classList.add('hidden'); UI.letterbox(); res(1); var id = bt.getAttribute('data-ride'); setTimeout(function () { Game.rideTo({ kind: 'room', room: id }); }, 50); }); });
    } }).then(res); });
  };

  window.Flows = F;
})();
