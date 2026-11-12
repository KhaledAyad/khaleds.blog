/* Freight City Viva v3: mastery, readiness and spacing. Five stages computed from the one memory (only mem[id].proofs is
   new), four weighted tiers, readiness bands that never lock anything, the boss predictor in a Web Worker ("on today's
   form"), the Shift Check pool, the error taxonomy with bike parts, and the city's windows. */
(function () {
  'use strict';
  var M = {}, REG = [], BY = {}, ver = 0, cache = {};
  var S = function () { return Game.state; };
  var esc = function (s) { return UI.esc(s); };
  M.STAGES = ['Unseen', 'Taught', 'Practised', 'Retrieved', 'Spaced', 'Proven'];
  M.SHAPES = ['', '○', '●', '▲', '★', '✪'];
  M.TIERS = { A: { name: 'Say it', w: 0.35 }, B: { name: 'Defend it', w: 0.3 }, C: { name: 'Know it', w: 0.2 }, D: { name: 'Find it', w: 0.15 } };
  M.ERR = [
    { code: 'E1', error: 'Overclaims', part: 'Brakes', re: /overclaim|claims cause|unmeasured control|survey as a test|promise for a position/i },
    { code: 'E2', error: 'Over-concedes', part: 'Tyres', re: /over-concede/i },
    { code: 'E3', error: 'Denies the limit', part: 'Mirrors', re: /denies/i },
    { code: 'E4', error: 'Reverses the finding', part: 'Handlebars', re: /reverses|wrong reason|misstates/i },
    { code: 'E5', error: 'Found or proposed?', part: 'Gears', re: /proposition called|found or proposed|falsifier|mode of inference/i },
    { code: 'E6', error: 'Wrong number', part: 'Speedometer', re: /number/i },
    { code: 'E7', error: 'Wrong place', part: 'Map', re: /place|own work/i },
    { code: 'E8', error: 'Misnames the method', part: 'Toolbox', re: /method/i }
  ];
  M.load = function () {
    return Game.fetchJSON(['assets/data/mastery_items.json', 'data/mastery_items.json'], true).then(function (j) { var all = j.items || []; REG = all.filter(function (x) { return !(FCV.TRACE_NOT_ASKED && FCV.TRACE_NOT_ASKED[x.id]); }); /* QAD4-04: trace-09 is not asked, so it is not something to master */ BY = {}; REG.forEach(function (x, i) { x.i = i; BY[x.id] = x; }); /* ND1: the save code's registry is every item, in file order (append-only; trace-09 keeps its place) */ if (window.Save && Save.setRegistry) Save.setRegistry(all.map(function (x) { return x.id; })); }).catch(function () { REG = []; });
  };
  M.registry = function () { return REG; };
  M.item = function (id) { return BY[id] || null; };
  function bump() { ver++; cache = {}; }
  M.bump = bump;

  /* ---------------- stages ---------------- */
  function recOf(st, id) {
    var best = null;
    [id, 'recall:' + id, 'say:' + id].forEach(function (k) { var r = st.mem[k]; if (r && (!best || r.box > best.box || (r.box === best.box && r.right > best.right))) best = r; });
    if (BY[id] && BY[id].probes) BY[id].probes.forEach(function (k) { var r = st.mem[k]; if (r && (!best || r.box > best.box)) best = r; });
    return best;
  }
  M.stage = function (id, st) {
    st = st || S(); if (!st) return 0;
    var r = recOf(st, id);
    if (!r) return st.met[id] ? 1 : 0;
    var s = 1;
    if (r.right > 0 || r.lastOutcome === 'partly') s = 2;
    if (r.box >= 3) s = 3;
    if (r.box >= 4 && r.right >= 2) s = 4;
    if (s >= 4 && r.proofs && r.proofs.length) s = 5;
    if (r.lastOutcome === 'wrong') s = Math.min(s, r.lastSure ? 2 : 3);
    return s;
  };
  M.stageName = function (id) { return M.STAGES[M.stage(id)]; };
  M.pipHTML = function (id) {
    var s = M.stage(id), due = s === 5 && S() && recOf(S(), id) && FCV.dayIndex(S()) - recOf(S(), id).last >= 16;
    return '<span class="stagePip" title="' + M.STAGES[s] + (due ? ', due' : '') + '" aria-label="Stage: ' + M.STAGES[s] + '" style="' + (due ? 'opacity:.5' : '') + '">' + (M.SHAPES[s] || '·') + '</span>';
  };

  /* ---------------- readiness ---------------- */
  M.readiness = function () {
    var st = S(); if (!st || !REG.length) return { score: 0, band: 'Rookie', parts: {} };
    /* D2-M3: the cache belongs to one state object; a save that arrives or is replaced never reads the old one */
    if (cache.ready && cache.v === ver && cache.st === st) return cache.ready;
    var sum = {}, n = {};
    REG.forEach(function (x) { var s = M.stage(x.id, st); sum[x.tier] = (sum[x.tier] || 0) + s / 5; n[x.tier] = (n[x.tier] || 0) + 1; });
    var score = 0, parts = {};
    Object.keys(M.TIERS).forEach(function (t) { var m = n[t] ? sum[t] / n[t] : 0; parts[t] = m; score += M.TIERS[t].w * m; });
    score = Math.round(score * 100);
    var A = REG.filter(function (x) { return x.tier === 'A'; }), needs = [];
    var spine = ['thesis.one_sentence', 'link-1', 'link-2', 'link-3', 'link-4', 'link-5'];
    var readyOk = spine.every(function (id) { return M.stage(id, st) >= 5; }) && A.every(function (x) { return spine.indexOf(x.id) >= 0 || M.stage(x.id, st) >= 4; });
    if (score >= 75 && !readyOk) { needs.push('the one sentence and all five links Proven; every other Say it item Spaced'); score = 74; }
    var proofOk = A.every(function (x) { return M.stage(x.id, st) >= 5; }) && REG.filter(function (x) { return x.tier === 'B'; }).filter(function (x) { return M.stage(x.id, st) >= 3; }).length >= 0.8 * (n.B || 1) && (st.wr && st.wr.streak3 >= 2) && (cache.pass || 0) >= 0.85;
    if (score >= 90 && !proofOk) { needs.push('every Say it item Proven, most Defend it items Retrieved, two Waiting Room passes in a row'); score = 89; }
    var band = score >= 90 ? 'Viva-proof' : score >= 75 ? 'Ready' : score >= 60 ? 'Trusted' : score >= 40 ? 'On the rounds' : 'Rookie';
    var nextBand = score >= 90 ? null : score >= 75 ? 'Viva-proof' : score >= 60 ? 'Ready' : score >= 40 ? 'Trusted' : 'On the rounds';
    cache.ready = { score: score, band: band, next: nextBand, parts: parts, needs: needs }; cache.v = ver; cache.st = st;
    return cache.ready;
  };

  /* ---------------- recording: proofs, wear, stingers ---------------- */
  M.examContext = null;
  M.onRecord = function (id, outcome, sure, res, bandBefore) {
    var st = S(), r = st.mem[id]; if (!r) return;
    /* D2-M3: 'before' is the band computed just before this answer was recorded (F.record passes it), never a stale cache */
    var before = bandBefore || ((cache.ready && cache.v === ver && cache.st === st) ? cache.ready.band : M.readiness().band), baseId = id.replace(/^(recall|say):/, ''), was = M.stage(baseId);
    if (outcome === 'wrong' && sure) { r.box = 1; }
    if (M.examContext && outcome === 'right' && was >= 4 && (sure || UI.lastSure || M.examContext === 'sprint')) {
      r.proofs = (r.proofs || []).concat([[FCV.dayIndex(st), M.examContext]]).slice(-3);
    }
    bump();
    var now = M.stage(baseId);
    if (now === 5 && was < 5) { if (window.Family && Family.job && st.settings && st.settings.family) Family.job('seal'); if (window.Sound) Sound.sfx('stage5'); if (window.Director && !st.cuts['film:proven_stinger']) Director.film('proven_stinger'); else UI.toast('Proven: ' + ((FCV.resolve(baseId) || {}).figure || baseId), 2400); }
    else if (now > was && window.Sound) Sound.sfx('stage' + now);
    var after = M.readiness().band;
    if (after !== before && M.STAGES && ['Rookie', 'On the rounds', 'Trusted', 'Ready', 'Viva-proof'].indexOf(after) > ['Rookie', 'On the rounds', 'Trusted', 'Ready', 'Viva-proof'].indexOf(before)) {
      setTimeout(function () { if (window.Director) Director.film('readiness_band'); }, 400);
    }
    if (window.Album) Album.check();
  };
  M.onMet = function () { bump(); };
  M.wear = function (errLabel) {
    var st = S(); if (!errLabel) return;
    var e = M.ERR.filter(function (x) { return x.re.test(errLabel); })[0]; if (!e) return;
    st.wear = st.wear || {}; st.wear[e.code] = (st.wear[e.code] || 0) + 1;
  };
  M.worstPart = function () {
    var st = S(), w = st.wear || {}, best = null;
    M.ERR.forEach(function (e) { if ((w[e.code] || 0) > 0 && (!best || w[e.code] > w[best.code])) best = e; });
    return best;
  };

  /* ---------------- spacing: at most 40 due a day, danger order ---------------- */
  M.due = function () {
    var st = S(), list = FCV.dueList(st);
    var tierOf = function (id) { var b = BY[id.replace(/^(recall|say):/, '')]; return b ? 'ABCD'.indexOf(b.tier) : 2; };
    list.sort(function (a, b) {
      var ra = st.mem[a], rb = st.mem[b];
      var sa = ra.lastSure && ra.lastOutcome === 'wrong' ? 1 : 0, sb = rb.lastSure && rb.lastOutcome === 'wrong' ? 1 : 0;
      return (sb - sa) || (FCV.overdue(st, b) - FCV.overdue(st, a)) || (tierOf(a) - tierOf(b)) || (M.stage(a) - M.stage(b));
    });
    return list.slice(0, 40);
  };
  /* Proof-ready: Spaced but not yet Proven, tier A first; the exam-mode Night Shift offers them for their proof. */
  M.proofReady = function (n) {
    var st = S();
    return REG.filter(function (x) { return M.stage(x.id, st) === 4; }).sort(function (a, b) { return 'ABCD'.indexOf(a.tier) - 'ABCD'.indexOf(b.tier); })
      .map(function (x) { var p = (x.probes || []).filter(function (k) { return st.mem[k]; })[0]; return p || x.probes[0] || x.id; }).filter(function (id) { return FCV.askable(id); }).slice(0, n || 4);
  };
  /* Night Shift order: interleaved, never two from one unit in a row. */
  M.interleave = function (ids) {
    var out = [], pool = ids.slice(), lastUnit = null, guard = 0;
    while (pool.length && guard++ < 1000) {
      var k = pool.findIndex(function (id) { var b = BY[id.replace(/^(recall|say):/, '')]; return !b || b.home !== lastUnit; });
      if (k < 0) k = 0;
      var id = pool.splice(k, 1)[0]; out.push(id); var b2 = BY[id.replace(/^(recall|say):/, '')]; lastUnit = b2 ? b2.home : null;
    }
    return out;
  };

  /* ---------------- city lights ---------------- */
  M.litLine = function (n) {
    var key = 'act' + n, items = REG.filter(function (x) { return x.home === key; }), lit = items.filter(function (x) { return M.stage(x.id) >= 3; }).length;
    return lit + ' of ' + items.length + ' lit';
  };
  M.windows = function (home) { return REG.filter(function (x) { return x.home === home; }).map(function (x) { return M.stage(x.id); }); };

  /* ---------------- Shift Check pool ---------------- */
  M.shiftCheckItems = function (n) {
    var st = S(), key = 'act' + n;
    var pool = REG.filter(function (x) { return x.home === key && (x.tier === 'A' || x.tier === 'C') && M.stage(x.id) <= 2; }).map(function (x) { return x.id; });
    var askable = function (id) { var r = FCV.resolve(id); return r && (r.type === 'quiz'); };
    var q = pool.filter(askable);
    var a = FCV.data.script.acts[n - 1], fromAct = FCV.actItems(n).filter(function (id) { var r = FCV.resolve(id); return r && r.type === 'quiz'; });
    q = FCV.shuffle(q.concat(FCV.shuffle(fromAct))).filter(function (x, i, arr) { return arr.indexOf(x) === i; }).slice(0, 5);
    var tp = 'ch' + a.chapter + '-tp';
    return { quiz: q, tp: tp };
  };

  /* ---------------- the predictor (Web Worker, 5,000 simulated attempts with the real draw rules) ---------------- */
  var worker = null;
  var WORKER = "onmessage=function(e){var d=e.data,topics=d.topics,N=d.n||5000,pass=0,seed=d.seed||7;function r(){seed^=seed<<13;seed>>>=0;seed^=seed>>>17;seed^=seed<<5;seed>>>=0;return seed/4294967296;}" +
    "for(var a=0;a<N;a++){var q=18+Math.floor(r()*3),h=5,streak=0,restored=false;var order=[];for(var t in topics){var k=Math.max(1,Math.round(q*topics[t].share));for(var i=0;i<k;i++)order.push(t);}" +
    "for(var j=0;j<order.length&&h>0;j++){var p=topics[order[j]].p,killer=(j>=5&&(j%5===4||j===order.length-1));if(killer)p=p*d.killerFactor;if(r()<p){streak++;if(streak>=4&&!restored&&h<5){h++;restored=true;}}else{h-=killer?2:1;streak=0;}}" +
    "if(h>0)pass++;}postMessage({pass:pass/N});};";
  M.topicPriors = function (bump) {
    var st = S(), PR = [0.25, 0.35, 0.5, 0.65, 0.8, 0.9], items = FCV.bank.items, topics = {};
    items.forEach(function (q) { (topics[q._t] = topics[q._t] || { n: 0, a: 0, b: 0, ids: [] }).n++; topics[q._t].ids.push(q.id); });
    Object.keys(topics).forEach(function (t) {
      var T = topics[t], links = {};
      REG.forEach(function (x) { (x.bank_links || []).forEach(function (b) { if (T.ids.indexOf(b) >= 0) links[x.id] = 1; }); });
      var ids = Object.keys(links), mean = ids.length ? ids.reduce(function (s, id) { return s + PR[M.stage(id)]; }, 0) / ids.length : 0.35;
      var a = mean * 4, b = (1 - mean) * 4;
      (st.wr && st.wr.answers || []).forEach(function (x) { if (x.t === t) { if (x.ok) a += 1; else b += 1; } });
      (st.viva.results || []).forEach(function (res, k, arr) { var w = 2 * Math.pow(0.8, arr.length - 1 - k); (res.topics && res.topics[t] ? [res.topics[t]] : []).forEach(function (rt) { a += w * (rt.right || 0); b += w * (rt.wrong || 0); }); });
      T.p = Math.min(0.98, a / (a + b) + (bump && bump === t ? 0.1 : 0)); T.share = T.n / items.length;
    });
    return topics;
  };
  M.predict = function (bumpTopic) {
    var topics = M.topicPriors(bumpTopic), basis = (S().wr && S().wr.answers || []).length + (S().viva.results || []).length * 18;
    var payload = { topics: {}, n: 5000, killerFactor: 0.8, seed: 12345 };
    Object.keys(topics).forEach(function (t) { payload.topics[t] = { p: topics[t].p, share: topics[t].share }; });
    return new Promise(function (res) {
      var finish = function (pass) { if (!bumpTopic) cache.pass = pass; res({ pass: pass, doors: Math.round(pass * 10), basis: basis, early: basis < 150, topics: topics }); };
      try {
        if (!worker) worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })));
        var w = worker; var h = function (e) { w.removeEventListener('message', h); finish(e.data.pass); };
        w.addEventListener('message', h); w.postMessage(payload);
      } catch (e) {
        /* no worker: a smaller run on the page */
        var f = new Function('postMessage', 'var onmessage;' + WORKER + ';return onmessage;');
        var out = null; var on = f(function (m) { out = m; }); payload.n = 800; on({ data: payload }); finish(out ? out.pass : 0);
      }
    });
  };
  M.fastestGain = async function () {
    var base = await M.predict(), best = null;
    for (var t in base.topics) { var p = await M.predict(t); if (!best || p.pass - base.pass > best.gain) best = { topic: t, gain: p.pass - base.pass }; }
    return best;
  };
  M.doorsHTML = function (n) { var h = '<span class="doors" aria-label="' + n + ' doors in 10 open">'; for (var i = 0; i < 10; i++) h += '<i class="' + (i < n ? 'open' : '') + '"></i>'; return h + '</span>'; };
  M.panel = async function () {
    var rd = M.readiness(), c = FCV.data.script.session_copy.readiness, st = S();
    /* SD-25: one plain headline, the best next step, bars in words out of 100, and the pass chance and question bank
       (moved here from the Hall door, SD-26). Esc closes. */
    var bars = Object.keys(M.TIERS).map(function (t) { var p = Math.round(rd.parts[t] * 100); return '<div class="set readyBar"><span>' + esc(M.TIERS[t].name) + '</span><span class="timer" style="flex:1;max-width:220px"><i style="width:' + p + '%;animation:none"></i></span><span>' + p + ' out of 100</span></div>'; }).join('');
    var pr = await M.predict(), bank = FCV.bank ? FCV.bank.items : [], fresh = bank.filter(function (q) { return !((st && st.viva.seen) || {})[q.id]; }).length;
    var html = '<p><b>Readiness ' + rd.score + ' of 100: ' + esc(rd.band) + '.</b> <span id="fgLine">Best next step: working it out...</span></p>' + bars +
      '<p class="small">' + M.doorsHTML(pr.doors) + ' ' + esc(Missions.doorsLine(pr.doors)) + ' <small>' + esc(pr.early ? c.early : c.basis.replace('[n]', pr.basis)) + '</small></p>' +
      '<p class="small">Questions in the Hall: ' + bank.length + '. Fresh for you next time: ' + fresh + '.</p>';
    var p = UI.modal('Readiness', html, [{ label: 'Drill it now', value: 'drill', cls: 'go' }, { label: 'Close', value: 0 }]);
    M.fastestGain().then(function (g) {
      var el = document.getElementById('fgLine'); M._fg = g;
      if (el) el.textContent = g ? 'Best next step: drill ' + g.topic + '.' + (Math.round(g.gain * 100) >= 1 ? ' About ' + Math.round(g.gain * 100) + ' points more pass chance.' : '') : 'Best next step: play the next story step.';
    });
    var v = await p;
    if (v === 'drill' && window.Missions) { var g = M._fg; await Game.runFlow(function () { return Missions.topicDrill(g ? g.topic : null); }); }
  };

  /* ---------------- where it is taught / test me now ---------------- */
  M.whereTaught = function (id) { var b = BY[id]; return b ? b.taught_at : []; };
  /* A light picture of memory for the end-of-session card. */
  M.picture = function () {
    var st = S(), pic = {};
    REG.forEach(function (x) { var s = M.stage(x.id, st); if (s) pic[x.id] = s; });
    var sw = {}; Object.keys(st.mem).forEach(function (id) { var r = st.mem[id]; if (r.sureWrong && r.lastOutcome === 'wrong') sw[id] = 1; });
    return { stages: pic, sureWrong: sw, ready: M.readiness().score, at: Date.now() };
  };
  window.Mastery = M;
})();
