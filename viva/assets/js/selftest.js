/* Freight City Viva: live self-test. Inert unless the page is opened with #fcv-selftest-play or #fcv-selftest-resume.
   It backs up the real save, plays Act 1, one room, an act restart and part of a viva through the real UI, and
   on the resume pass checks the paused viva, finishes it, and restores the real save. Results show on screen. */
(function () {
  'use strict';
  var H = String(location.hash || '').replace('#', '');
  if (!/^fcv-selftest-(play|resume)$/.test(H)) { window.SelfTest = null; return; }
  var T = { log: [] }, Q = null, memo = {};
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var vis = function (id) { var e = document.getElementById(id); return e && !e.classList.contains('hidden'); };
  function out(line) {
    T.log.push(line);
    var el = document.getElementById('selftestOut');
    if (!el) { el = document.createElement('pre'); el.id = 'selftestOut'; el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:500;max-width:min(560px,94vw);max-height:90vh;overflow:auto;background:#fff;color:#111;font:13px/1.35 monospace;padding:10px;border:3px solid #000;white-space:pre-wrap;margin:0'; document.body.appendChild(el); }
    el.textContent = T.log.join('\n');
  }
  function allQ() {
    var o = [];
    FCV.data.story.acts.forEach(function (a) { a.quiz.forEach(function (q) { o.push({ q: q.q, a: q.options[q.answer_index] }); }); });
    FCV.data.facts.appendices.forEach(function (ap) { ap.quiz.forEach(function (q) { o.push({ q: q.q, a: q.options[q.answer_index] }); }); });
    FCV.bank.items.forEach(function (q) { o.push({ q: q.question, a: q.options[q.answer_index] }); });
    return o;
  }
  var strip = function (t) { return t.slice(1).replace(/(RIGHT|YOURS|BEST|STRONG)$/, ''); };
  function clickOpt(root) {
    var qEl = $('.q', root), qt = qEl ? qEl.textContent : '';
    var opts = $$('.opt:not([disabled])', root).filter(function (o) { return !o.closest('[hidden]'); });
    if (!opts.length) return false;
    var hit = Q.filter(function (x) { return x.q === qt; })[0], want = hit ? hit.a : memo[qt];
    var o = want && opts.filter(function (b) { return strip(b.textContent) === want; })[0];
    (o || opts[Math.floor(Math.random() * opts.length)]).click();
    return true;
  }
  /* One step of play through whatever is on screen. confirmText: the button to press in a confirm dialog. */
  function step(confirmText) {
    if (vis('cut')) { var cb = $('#cutBtns .btn'); if (cb) { cb.click(); return 'cut-btn'; } document.getElementById('cutSkip').click(); return 'cut'; }
    if (vis('modal')) {
      var btns = $$('#modalBox .btn'), want = confirmText && btns.filter(function (b) { return b.textContent === confirmText; })[0];
      (want || $('#modalBox .btn.go') || btns[0]).click(); return 'modal';
    }
    if (vis('viva')) {
      var root = document.getElementById('vivaInner');
      var th = $$('[data-s]', root).filter(function (b) { return !b.closest('[hidden]'); });
      if (th.length) { th.forEach(function (b) { b.disabled = false; }); th[0].click(); return 'think'; }
      if (clickOpt(root)) return 'viva-opt';
      var f = $('[data-f="1"]:not([disabled])', root); if (f) { f.click(); return 'follow'; }
      if (document.getElementById('vCity')) return 'viva-summary';
      var vn = $('#vNext', root) || $('#vRev', root); if (vn) { vn.click(); return 'viva-next'; }
      return 'wait';
    }
    if (vis('chapter')) return 'chapter';
    if (!vis('sheet')) return 'closed';
    var t = document.getElementById('talk');
    var done = $('.opt.right', t), qq = $('.q', t); if (done && qq) memo[qq.textContent] = strip(done.textContent);
    var wv = $$('[data-v]:not([disabled])', t);
    if (wv.length) { var qt = $('.q', t).textContent, shown = $('.card .txt.q', t).textContent, hit = Q.filter(function (x) { return x.q === qt; })[0]; var isA = hit ? hit.a === shown : true; wv.filter(function (b) { return b.getAttribute('data-v') === (isA ? '1' : '0'); })[0].click(); return 'whistle'; }
    if (clickOpt(t)) return 'opt';
    var ticks = $$('.tick input', t); ticks.forEach(function (x) { x.checked = true; });
    var hub = $$('.hubItem:not([disabled])', t);
    if (hub.length) { var nx = hub.filter(function (h) { return !h.classList.contains('done') && !/EXIT/.test(h.textContent); })[0]; (nx || hub[hub.length - 1]).click(); return 'hub'; }
    var gos = $$('.btn.go', t); if (gos.length) { var g = gos[gos.length - 1]; g.disabled = false; g.click(); return 'go'; }
    return 'wait';
  }
  async function drive(ms, opts) {
    opts = opts || {}; var end = Date.now() + ms, n = 0, last = '';
    while (Date.now() < end) {
      var s = step(opts.confirm);
      if (opts.until && opts.until(s)) return s;
      if (s === 'closed' && !opts.keepGoing) return s;
      if (s === 'viva-opt') n++;
      if (opts.maxAnswers && n >= opts.maxAnswers) return 'answered';
      last = s;
      await sleep(s === 'cut' || s === 'modal' || s === 'cut-btn' ? 300 : 70);
    }
    return 'timeout after ' + last;
  }
  async function untilIdle() { for (var i = 0; i < 100 && (Game.isBusy && Game.isBusy()); i++) await sleep(100); }

  T.play = async function () {
    Q = allQ();
    out('SELFTEST PLAY ' + new Date().toISOString() + ' | save: ' + Chapter.statusText());
    var had = await Save.readAux('selftest-backup');
    if (!had) out('backup of the real save: ' + (await Save.writeAux('selftest-backup', JSON.stringify(Game.state))));
    else out('backup already held from an earlier pass');
    var fresh = FCV.newState(); fresh.intro = true; fresh.cuts.cold_open = 1; Game.replaceState(fresh);
    $('#title').classList.add('hidden'); $('#hud').classList.remove('hidden'); UI.letterbox();
    /* one act, by its own steps */
    var t0 = Date.now();
    for (var g = 0; g < 20; g++) {
      var ns = FCV.nextSteps(Game.state, 1)[0]; if (!ns) break;
      Game.runFlow(function () { return Flows.actStep(1, ns.id); });
      await sleep(150);
      var r = await drive(120000);
      await untilIdle();
      if (r !== 'closed') out('  step ' + ns.id + ': ' + r);
    }
    var a1 = Game.state.acts[1] || { done: [] };
    out('ACT 1: ' + (FCV.actDone(Game.state, 1) ? 'PASS' : 'FAIL') + ' (' + a1.done.length + ' steps, stamp ' + a1.stamp + ', ' + Math.round((Date.now() - t0) / 1000) + ' s)');
    /* one room */
    Game.runFlow(function () { return Flows.room('interview_cafe'); }); await sleep(200);
    var rr = await drive(240000, { until: function (s) { return s === 'closed'; } }); await untilIdle();
    var rs = Game.state.rooms.interview_cafe || {};
    out('ROOM Interview Cafe: ' + (rs.badge ? 'PASS' : 'FAIL') + ' (stage ' + rs.stage + ', ' + rr + ')');
    /* restart the act through the real dialog */
    var stampBefore = (Game.state.acts[1] || {}).stamp, memBefore = Object.keys(Game.state.mem).length;
    var p = Chapter.restartAct(1); await drive(5000, { confirm: FCV.data.script.session_copy.restart_act.yes, until: function (s) { return s !== 'modal'; } }); await p;
    var a1b = Game.state.acts[1] || { done: [] };
    out('RESTART ACT 1: ' + (a1b.done.length === 0 && a1b.stamp === stampBefore && Object.keys(Game.state.mem).length === memBefore ? 'PASS' : 'FAIL') + ' (steps now ' + a1b.done.length + ', stamp kept ' + a1b.stamp + ', memory kept ' + Object.keys(Game.state.mem).length + ')');
    /* a viva attempt, paused after three answers */
    var st = Game.state;
    for (var n = 1; n <= 7; n++) FCV.actSteps(n).forEach(function (s) { FCV.markDone(st, n, s.id); });
    FCV.data.script.evidence_locker.rooms.forEach(function (rm) { var x = FCV.roomState(st, rm.id); x.stage = 4; x.badge = true; });
    st.viva.hallSeen = true; st.cuts.locker_entry = 1; Game.refresh();
    var att0 = st.viva.attempt;
    Game.runFlow(function () { return Viva.start(false); });
    var vr = await drive(180000, { maxAnswers: 3, keepGoing: true });
    await sleep(600);
    var pz = Game.state.viva.paused;
    out('VIVA: attempt ' + att0 + ' -> ' + Game.state.viva.attempt + ' (' + vr + '); paused at question ' + (pz ? pz.pos + 1 : 'none') + ', hearts ' + (pz ? pz.hearts : '-') + ', draw ' + (pz ? pz.draw.length : '-'));
    try { localStorage.setItem('fcv-selftest-pause', JSON.stringify(pz && { pos: pz.pos, hearts: pz.hearts, first: pz.draw[0], n: pz.draw.length })); } catch (e) {}
    await Save.flushNow(Game.state);
    out('save now: ' + Chapter.statusText());
    out('NEXT: reload this page with #fcv-selftest-resume');
  };

  T.resume = async function () {
    Q = allQ();
    out('SELFTEST RESUME ' + new Date().toISOString() + ' | save: ' + Chapter.statusText());
    var pz = Game.state.viva.paused, want = null; try { want = JSON.parse(localStorage.getItem('fcv-selftest-pause')); } catch (e) {}
    var same = pz && want && pz.pos === want.pos && pz.hearts === want.hearts && pz.draw[0] === want.first && pz.draw.length === want.n;
    out('PAUSE survived the reload: ' + (same ? 'PASS' : 'FAIL') + ' (question ' + (pz ? pz.pos + 1 : 'none') + ', hearts ' + (pz ? pz.hearts : '-') + ')');
    $('#title').classList.add('hidden'); $('#hud').classList.remove('hidden'); UI.letterbox();
    var before = Game.state.viva.results.length;
    Game.runFlow(function () { return Viva.start(true); });
    var r = await drive(420000, { keepGoing: true, until: function (s) { return s === 'viva-summary'; } });
    var res = Game.state.viva.results.slice(-1)[0];
    out('RESUME to the end: ' + (Game.state.viva.results.length > before ? 'PASS' : 'FAIL') + ' (' + r + '; result ' + (res ? res.ending + ', hearts ' + res.hearts + ', asked ' + res.asked : 'none') + ', attempt counter ' + Game.state.viva.attempt + ')');
    var vc = document.getElementById('vCity'); if (vc) vc.click();
    await sleep(500);
    var raw = await Save.readAux('selftest-backup');
    if (raw) { Game.replaceState(JSON.parse(raw)); out('real save restored: ' + (await Save.flushNow(Game.state))); await Save.writeAux('selftest-backup', ''); }
    else out('no backup found; leaving the test save');
    try { localStorage.removeItem('fcv-selftest-pause'); } catch (e) {}
    out('DONE. Open the page without the #name to play.');
  };
  window.SelfTest = T;
})();
