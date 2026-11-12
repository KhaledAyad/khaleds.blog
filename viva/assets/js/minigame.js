/* Freight City Viva v3: one mini-game engine for every mechanic (intro, play, check, result, retry), the juice kit,
   the assist ladder, one results screen, and resume mid-play (serialised after every input). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return UI.esc(s); };
  var S = function () { return Game.state; };
  var SET = function () { return S().settings; };
  var RK = { bronze: 1, silver: 2, gold: 3 };

  /* ---------------- the juice kit ---------------- */
  var streak = 0;
  var J = {
    right: function (el, rightEl) {
      if (!SET().reduceMotion && navigator.vibrate) try { navigator.vibrate(15); } catch (e) {}
      streak = Math.min(5, streak + 1); if (window.Sound) { Sound.streak(streak - 1); if (!(window.Kit && Kit.sting('MUS-STING-RIGHT', streak - 1))) Sound.sfx('right'); }
      if (el && !SET().reduceMotion) J.particles(el, 24);
      if (window.Family) Family.react('right');
    },
    wrong: function (el, rightEl) {
      if (!SET().reduceMotion && navigator.vibrate) try { navigator.vibrate(15); } catch (e) {}
      streak = 0; if (window.Sound) { Sound.streak(0); if (!(window.Kit && Kit.sting('MUS-STING-WRONG'))) Sound.sfx('thud'); }
      var box = el && (el.closest('.opts') || el.parentNode);
      if (box && !SET().reduceMotion) { box.classList.remove('shakeSoft'); void box.offsetWidth; box.classList.add('shakeSoft'); }
      if (rightEl && !SET().reduceMotion) { rightEl.style.transition = 'transform .25s'; rightEl.style.transform = 'translateX(8px)'; setTimeout(function () { rightEl.style.transform = ''; }, 260); }
    },
    soft: function () { if (window.Sound) Sound.sfx('thud'); },
    big: function (el) {
      if (window.Sound) Sound.sfx('bass hit');
      if (SET().reduceMotion) return Promise.resolve();
      if (el) { el.classList.remove('punch'); void el.offsetWidth; el.classList.add('punch'); }
      return new Promise(function (r) { setTimeout(r, 80); });
    },
    particles: function (el, n) {
      var r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      for (var i = 0; i < n; i++) (function (i) {
        var p = document.createElement('i'); p.className = 'particle'; p.style.left = cx + 'px'; p.style.top = cy + 'px'; document.body.appendChild(p);
        var a = Math.random() * 6.28, d = 60 + Math.random() * 90, dx = Math.cos(a) * d, dy = Math.sin(a) * d - 40;
        p.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: 'translate(' + dx + 'px,' + (dy + 80) + 'px) rotate(' + (a * 90) + 'deg)', opacity: 0 }], { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = function () { p.remove(); };
      })(i);
    },
    resetStreak: function () { streak = 0; }
  };
  window.Juice = J;

  /* ---------------- XP and stars ---------------- */
  var MG = {};
  MG.starsFor = function (wrongFirst, assisted) { var s = wrongFirst === 0 ? 3 : wrongFirst <= 1 ? 2 : 1; return assisted ? Math.min(2, s) : s; };
  MG.stampFor = function (wrongFirst, assisted) { var s = wrongFirst === 0 ? 'gold' : wrongFirst <= 1 ? 'silver' : 'bronze'; return assisted && s === 'gold' ? 'silver' : s; };
  MG.giveStars = function (key, n) { var st = S(); if ((st.stepStars[key] || 0) < n) st.stepStars[key] = n; };

  /* ---------------- the engine ----------------
     def: {key, title, sub, giver, items:[{id, ...}], intro, stageHTML(state), item(it, api) -> Promise<bool>, onRight(it, state), onWrong(it, state), boss, practice, replay}
     Default item: the quiz item by id, options equal in size, keys 1 to 4. Wrong answers come back at the end. */
  MG.run = async function (def) {
    if (window.Kit && Kit.dropRadio) Kit.dropRadio(); /* AUDR3-04 */
    var st = S(), key = def.key, rr = st.resume;
    /* Story runs resume as 'mg'; practice runs that ask for it (mocks, Night Shift, sprints) resume as 'run'. */
    var res = rr && rr.key === key && ((rr.kind === 'mg' && !def.practice) || (rr.kind === 'run' && def.resumable)) ? rr : null;
    if (res && res.kind === 'run' && Array.isArray(res.items) && res.items.length) def.items = res.items;
    var state = res ? res.state : { queue: def.items.map(function (it, i) { return i; }), firstWrong: {}, done: {}, right: 0, wrong: 0, assisted: false, fails: (st.timings['fails:' + key] || 0), data: def.init ? def.init() : {} };
    /* QAD3-B1: from here on every write reads the live save (S()), never a copy held from the start */
    var layer = $('mech'), box = $('mechBox'), quit = false;
    layer.classList.remove('hidden'); UI.letterbox(); layer.classList.toggle('mgTimed', !!def.timed);
    /* simplicity round: Pause only while a clock runs (SD-31); the way out says what happens (SD-37); a first-time goal line
       says what to do (SD-23) until the game has been finished once */
    var goal = def.goal && !S().stepStars[key] && !def.lap ? '<p class="mgGoal">' + esc(def.goal) + '</p>' : '';
    var slam = '<div class="mgHead"><h2 class="' + (SET().reduceMotion ? '' : 'slam') + '" id="mechTitle">' + esc(def.title) + '</h2><span class="grow"></span>' + (def.timed ? '<button class="btn small" type="button" data-mg="pause">Stop the clock</button>' : '') + '<button class="btn small" type="button" data-mg="leave">Pause and ride</button></div>' + goal;
    if (!res && def.intro !== false) { if (window.Sound) Sound.sfx('bass hit'); }
    if (res) { box.innerHTML = slam + '<div class="resultCard"><p class="delivered" style="font-size:40px">Back in</p><p>' + esc(def.title) + ', where you left it.</p></div>'; await wait(1500); }
    function save() {
      if (!def.practice) { S().resume = { kind: 'mg', key: key, state: state, at: Date.now() }; Game.save(); }
      else if (def.resumable) { S().resume = { kind: 'run', key: key, state: state, items: def.items, title: def.title, at: Date.now() }; Game.flush(); }
    }
    function stageHTML() {
      if (!def.stageHTML) return '';
      /* the stage is drawn over the act's own still at about 60 per cent (CSS ::before), so it reads as a place, not a chart */
      var bk = def.backdrop, bu = bk ? (FCV.isVideo(bk) ? FCV.posterOf(bk) : FCV.assetUrl(bk)) : null;
      /* absolute: a relative url() inside a custom property resolves against the stylesheet, not the page */
      if (bu) { try { bu = new URL(bu, location.href).href; } catch (e) {} }
      return '<div class="mgStage' + (bu ? ' hasBg' : '') + '" aria-hidden="true"' + (bu ? ' style="--mgbg:url(\'' + bu + '\')"' : '') + '>' + def.stageHTML(state, def) + '</div>';
    }
    function progress() { return '<div class="progress" aria-hidden="true">' + def.items.map(function (it, i) { return '<i class="' + (state.done[i] ? 'd' : state.firstWrong[i] ? 'n' : '') + '"></i>'; }).join('') + '</div>'; }
    var api = {
      box: box, state: state, def: def, save: function () { save(); },
      /* called the moment an answer is recorded, before its feedback: a closed tab then resumes on the verdict */
      answered: function (ok, rate) {
        /* the pip fills the moment an item is answered (the Coding Floor's stayed grey) */
        var pip = api.cur !== undefined ? box.querySelectorAll('.progress i')[api.cur] : null; if (pip) pip.className = ok ? 'd' : (state.done[api.cur] ? 'd' : 'n');
        if (def.noPending || api.cur === undefined || api.cur !== state.queue[0]) return;
        if (state.pending && state.pending.idx === api.cur) { state.pending.ok = state.pending.ok && !!ok; } else state.pending = { idx: api.cur, ok: !!ok, rate: rate || null };
        save();
      },
      frame: function (inner) { box.innerHTML = slam + stageHTML() + progress() + '<div class="mgBody">' + inner + '</div>'; bindHead(); return box.querySelector('.mgBody'); },
      quiz: function (id, opts) { return quizHere(id, opts || {}, api); }
    };
    MG.teachAfter = null;
    function bindHead() {
      Array.prototype.forEach.call(box.querySelectorAll('[data-mg]'), function (b) {
        b.onclick = async function () {
          var a = b.getAttribute('data-mg');
          if (a === 'leave') { quit = true; save(); if (api.reject) api.reject({ leave: true }); }
          if (a === 'pause') { var v = await UI.modal('Paused', '<p>' + esc(def.title) + '. Everything so far is saved.</p>', [{ label: 'Carry on', value: 1, cls: 'go', safe: true }, { label: 'Pause and ride', value: 0 }]); if (!v) { quit = true; save(); if (api.reject) api.reject({ leave: true }); } }
        };
      });
    }
    var keyH = function (e) {
      if ($('modal') && !$('modal').classList.contains('hidden')) return;
      if (/^[1-6]$/.test(e.key)) { var o = box.querySelectorAll('.opt:not([disabled]), .pickable:not([disabled])')[+e.key - 1]; if (o) { e.preventDefault(); o.click(); } }
      else if (e.key === 'Enter' || e.key === ' ') { if (document.activeElement && document.activeElement.tagName === 'BUTTON' && box.contains(document.activeElement)) return; var g = box.querySelectorAll('.btn.go:not([disabled])'); if (g.length) { e.preventDefault(); g[g.length - 1].click(); } }
      else if ((e.key === 'r' || e.key === 'R') && box.querySelector('[data-res="retry"]')) { e.preventDefault(); box.querySelector('[data-res="retry"]').click(); }
      else if ((e.key === 'p' || e.key === 'P') && box.querySelector('[data-res="practice"]')) { e.preventDefault(); box.querySelector('[data-res="practice"]').click(); }
    };
    document.addEventListener('keydown', keyH);
    var result;
    try {
      while (state.queue.length && !quit) {
        var idx = state.queue[0], it = def.items[idx], ok;
        /* closed during an answer's feedback: the answer was already recorded, so show its verdict again, never ask twice */
        if (state.pending && state.pending.idx === idx) { ok = await pendingHere(it, state.pending, api); if (def.afterPending) def.afterPending(ok, api); }
        else { api.cur = idx; ok = def.item ? await def.item(it, api, idx) : await api.quiz(it.id, { framing: it.framing, idx: idx, grey: it._grey }); }
        state.pending = null;
        state.queue.shift();
        if (ok) { state.done[idx] = 1; state.right++; if (def.onRight) def.onRight(it, state); }
        else { state.wrong++; if (!state.firstWrong[idx] && !state.done[idx]) state.firstWrong[idx] = 1; if (!def.noRequeue) state.queue.push(idx); if (def.onWrong) def.onWrong(it, state); }
        save();
        /* Assist ladder after two fails of one mini-game (never in the boss). */
        if (!ok && !def.boss && state.wrong >= 2 && !state.assistOffered) { state.assistOffered = true; var as = await assist(it, api); if (as) state.assisted = true; }
      }
      var wrongFirst = Object.keys(state.firstWrong).length;
      var putRight = Object.keys(state.firstWrong).filter(function (i) { return state.done[i]; }).length;
      result = { putRight: putRight, stamp: MG.stampFor(wrongFirst, state.assisted), stars: MG.starsFor(wrongFirst, state.assisted), right: state.right, wrong: state.wrong, wrongFirst: wrongFirst, total: def.items.length,
        missed: Object.keys(state.firstWrong).map(function (i) { return def.items[i].id; }), assisted: state.assisted, data: state.data };
      /* item 44: a better stamp than last time shows "Silver to Gold", kept on the Map node until the next play */
      var oldStars = S().stepStars[key] || 0, NAMES = ['No stamp', 'Bronze', 'Silver', 'Gold'];
      if (oldStars && result.stars > oldStars) { result.pb = NAMES[oldStars] + ' to ' + NAMES[result.stars]; S().pbChip = S().pbChip || {}; S().pbChip[key] = result.pb; }
      if (def.finish) await def.finish(result, api);
      if (!def.practice) { S().resume = null; MG.giveStars(key, result.stars); if (window.Album) Album.xp(RK[result.stamp] === 3 ? 50 : RK[result.stamp] === 2 ? 30 : 15, 'stamp'); }
      /* D-02: the result is saved as done (step, stamp, mission record) before the results screen shows, so closing the
         tab on the results card or during a Retry or Practice lap never loses the finished mission */
      if (!def.practice && def.onDone) { try { await def.onDone(result); } catch (e) { if (window.Help) Help.log('save', 'onDone: ' + (e && e.message)); } }
      else if (S().resume && S().resume.kind === 'run' && S().resume.key === key) S().resume = null;
      S().timings['fails:' + key] = wrongFirst ? (S().timings['fails:' + key] || 0) + 1 : 0;
      Game.flush();
      if (!def.noResults) result.next = await results(result, def, api);
    } catch (e) {
      if (!(e && e.leave)) throw e;
      result = { quit: true };
    } finally {
      document.removeEventListener('keydown', keyH);
      layer.classList.add('hidden'); box.innerHTML = ''; UI.letterbox(); Game.afterUI();
    }
    /* Retry or Practice after a finished run: the extra lap is practice, and the finished result stands (so the caller
       still marks the step done and gives the stamp even if the lap is left half way). A better retry raises the stars. */
    if (result.next === 'retry' || result.next === 'practice') {
      var lap = await MG.run(Object.assign({}, def, { practice: true, resumable: false, lap: result.next }));
      if (result.next === 'retry' && !def.practice && lap && !lap.quit && (RK[lap.stamp] || 0) > (RK[result.stamp] || 0)) { result.stamp = lap.stamp; result.stars = lap.stars; MG.giveStars(key, lap.stars); if (def.onDone) { try { await def.onDone(result); } catch (e) {} } Game.flush(); }
      delete result.next;
      return result;
    }
    if (MG.teachAfter) { var tp = MG.teachAfter; MG.teachAfter = null; setTimeout(function () { Game.travelTo(tp); }, 50); }
    return result;
  };
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* A quiz item inside the mini-game frame: equal options, the verdict, Why, Next. */
  function quizHere(id, opts, api) {
    var r = typeof id === 'string' ? FCV.resolve(id) : id; if (!r) return Promise.resolve(true);
    if (r.type !== 'quiz' && r.type !== 'bank') return sayHere(r, opts, api);
    /* an option set whose right answer stands out by length is never a pick: say it, then reveal and tick */
    if (!opts.noGate && FCV.gated(r)) return sayHere(r, Object.assign({ id: typeof id === 'string' ? id : r.id }, opts), api);
    var order = FCV.shuffle(r.options.map(function (o, i) { return i; }));
    var greyed = opts.grey !== undefined ? opts.grey : null;
    var body = api.frame((opts.framing ? '<div class="line">' + esc(opts.framing) + '</div>' : '') + '<div class="q">' + esc(r.q) + '</div>' +
      '<div class="opts equal" role="group" aria-label="Answers">' + order.map(function (oi, i) { return '<button class="opt" type="button" data-i="' + oi + '"' + (oi === greyed ? ' disabled style="opacity:.45"' : '') + '><span class="k">' + (i + 1) + '</span><span>' + esc(r.options[oi]) + '</span></button>'; }).join('') + '</div><div class="fb" aria-live="polite"></div>');
    if (window.Family) Family.dockSleep(true);
    return new Promise(function (resolve, reject) {
      api.reject = reject; var answered = false;
      Array.prototype.forEach.call(body.querySelectorAll('.opt'), function (el) {
        el.addEventListener('click', function () {
          if (answered) return; answered = true;
          var i = +el.getAttribute('data-i'), right = i === r.answer, rightEl = body.querySelector('.opt[data-i="' + r.answer + '"]');
          Array.prototype.forEach.call(body.querySelectorAll('.opt'), function (b) { b.disabled = true; });
          rightEl.classList.add('right'); if (!right) el.classList.add('wrong');
          J[right ? 'right' : 'wrong'](el, rightEl);
          if (window.Family) { Family.dockSleep(false); if (right) Family.job(api.def.job); }
          if (typeof id === 'string' && !opts.noRecord) Flows.record(id, right ? 'right' : 'wrong', UI.lastSure);
          if (api.answered) api.answered(right);
          var fb = body.querySelector('.fb');
          fb.innerHTML = '<div class="verdict"><span class="verdictStamp ' + (right ? 'r' : 'w') + '">' + (right ? 'Right' : 'Not quite') + '</span></div>' + UI.skimHTML('Why', r.explanation, r.loc, !right) +
            heldHTML(typeof id === 'string' ? id : r.id, r) + '<div class="actions"><button class="btn go" type="button">Next</button></div>';
          if (api.def.afterAnswer) api.def.afterAnswer(right, api.state);
          var stg = api.box.querySelector('.mgStage'); if (stg && api.def.stageHTML) stg.innerHTML = api.def.stageHTML(api.state, api.def, right);
          var go = fb.querySelector('.btn.go'); go.addEventListener('click', function () { resolve(right); }); try { go.focus({ preventScroll: true }); } catch (e) {}
        });
      });
    });
  }
  /* Say then reveal inside the frame (items that fail the length gate, viva questions, gaps). */
  function sayHere(r, opts, api) {
    var isQ = r.type === 'quiz' || r.type === 'bank', hid = opts.id || r.id;
    var prompt = r.type === 'eq' ? r.question : r.type === 'gap' ? r.gap : isQ ? r.q : UI.sayPrompt(r);
    var answer = r.type === 'eq' ? r.answer : r.type === 'gap' ? r.answer : isQ ? FCV.revealText(r) : r.text;
    var body = api.frame('<div class="line">' + esc(prompt) + '</div><div class="dir">Say it aloud first. Then reveal and tick what you said.</div><div class="fb"><div class="actions"><button class="btn go" type="button">Reveal the answer</button></div></div>');
    if (window.Family) Family.dockSleep(true);
    return new Promise(function (resolve, reject) {
      api.reject = reject;
      body.querySelector('.btn.go').addEventListener('click', function () {
        var boxes = FCV.pointCheck(isQ ? r.options[r.answer] : answer).filter(function (b) { return String(b.text || '').trim(); }), fb = body.querySelector('.fb');
        /* nothing to tick (an empty answer): shown, never scored */
        if (!String(answer || '').trim() || !boxes.length) {
          fb.innerHTML = UI.skimHTML('The thesis says', answer || '', r.loc || r.where, true) + heldHTML(hid, r) + '<div class="actions"><button class="btn go" type="button">Next</button></div>';
          fb.querySelector('.btn.go').addEventListener('click', function () { if (window.Family) Family.dockSleep(false); api.lastRate = 'unscored'; resolve(true); });
          return;
        }
        fb.innerHTML = UI.skimHTML('The thesis says', answer, r.loc || r.where, true) + heldHTML(hid, r) + '<div class="ticks"><div class="dir">Tick what you said:</div>' + boxes.map(function (b, i) { return '<label class="tick"><input type="checkbox" data-b="' + i + '"> <span>' + UI.boldFigures(b.text) + '</span></label>'; }).join('') + '</div><div class="actions"><button class="btn go" type="button">Done</button></div>';
        fb.querySelector('.btn.go').addEventListener('click', function () {
          var rate = FCV.rateFromBoxes(boxes.map(function (b, i) { return body.querySelector('[data-b="' + i + '"]').checked; }));
          if (window.Family) Family.dockSleep(false);
          if (hid && !opts.noRecord) Flows.record(hid, rate === 'nailed' ? 'right' : rate === 'partly' ? 'partly' : 'wrong');
          if (api.answered) api.answered(rate !== 'missed', rate);
          J[rate === 'missed' ? 'soft' : 'right'](fb);
          api.lastRate = rate;
          resolve(rate !== 'missed');
        });
      });
    });
  }
  MG.quizHere = quizHere; MG.sayHere = sayHere;
  function heldHTML(id, r) { var h = id || (r && r.id) ? UI.heldLabel(id || r.id, r) : ''; return h ? '<div class="held">' + esc(h) + '</div>' : ''; }
  MG.heldHTML = heldHTML;
  /* The verdict of an answer given just before the tab closed: recorded once already, so shown, not asked. */
  function pendingHere(it, p, api) {
    var r = it && it.id ? FCV.resolve(it.id) : null;
    var q = r ? (r.q || r.question || r.gap || (r.label ? UI.sayPrompt(r) : '')) : '';
    var body = api.frame((q ? '<div class="q">' + esc(q) + '</div>' : '') + '<div class="verdict"><span class="verdictStamp ' + (p.ok ? 'r' : 'w') + '">' + (p.ok ? 'Answered before you left: right' : 'Answered before you left: not quite') + '</span></div>' +
      (r && (r.type === 'quiz' || r.type === 'bank') ? UI.skimHTML('The answer', FCV.revealText(r), r.loc, true) : r && (r.answer || r.text) ? UI.skimHTML('The thesis says', r.answer || r.text, r.loc || r.where, true) : '') +
      '<div class="actions"><button class="btn go" type="button">Next</button></div>');
    api.lastRate = p.rate || (p.ok ? 'nailed' : 'missed');
    return new Promise(function (resolve, reject) { api.reject = reject; var go = body.querySelector('.btn.go'); go.addEventListener('click', function () { resolve(p.ok); }); try { go.focus({ preventScroll: true }); } catch (e) {} });
  }
  /* The card behind one miss: the item itself, the right answer and why for quiz items, and Go teach me. */
  MG.missCard = function (id) {
    var x = FCV.resolve(id); if (!x) return '';
    var h = '';
    if (x.type === 'quiz' || x.type === 'bank') h = '<div class="card"><div class="lab">' + esc(x.label || 'Question') + '</div><div class="txt q">' + esc(x.q) + '</div><div class="txt"><b>Right answer:</b> ' + esc(x.options[x.answer]) + '</div>' + (x.explanation ? '<details><summary>Why</summary><div class="txt">' + esc(x.explanation) + '</div></details>' : '') + (x.loc ? '<div class="loc">' + esc(x.loc) + '</div>' : '') + '</div>';
    else if (x.type === 'eq') h = '<div class="card"><div class="lab">' + esc(x.label) + '</div><div class="txt q">' + esc(x.question) + '</div><details><summary>Model answer</summary><div class="txt">' + esc(x.answer) + '</div></details></div>';
    else if (x.type === 'gap') h = '<div class="card"><div class="lab">The gap</div><div class="txt q">' + esc(x.gap) + '</div><details><summary>The honest answer</summary><div class="txt">' + esc(x.answer) + '</div></details></div>';
    else h = UI.cardHTML(x.base || id, { compact: true, noMet: true });
    var place = window.Flows && Flows.placeOf ? Flows.placeOf(id) : null;
    return '<div style="display:grid;gap:4px">' + h + (place ? '<button class="btn small" type="button" data-teach="' + esc(id) + '">Go teach me: ' + esc(place.label) + '</button>' : '') + '</div>';
  };

  /* Assist ladder: Show me the card; Name one mistake; Practice lap. An assist caps the run at silver. */
  async function assist(it, api) {
    var r = FCV.resolve(it.id); if (!r || r.type !== 'quiz') return false;
    var v = await UI.modal('Need a hand?', '<p>Two misses so far. Pick a help, or carry on as you are. A help caps this run at silver.</p>',
      [{ label: 'Show me the card', value: 'card', cls: 'go' }, { label: 'Name one mistake', value: 'mistake' }, { label: 'Practice lap first', value: 'lap' }, { label: 'No thanks', value: 0 }]);
    if (v === 'card') { await UI.modal('The card', (r.recall ? UI.cardHTML(r.recall, { noMet: true }) : '') + UI.skimHTML('The thesis says', r.explanation, r.loc, true), [{ label: 'Back to it', value: 1, cls: 'go' }]); }
    else if (v === 'mistake') { var wrongs = r.options.map(function (o, i) { return i; }).filter(function (i) { return i !== r.answer; }); it._grey = FCV.pick(wrongs); }
    else if (v === 'lap') { await UI.modal('Practice lap', UI.skimHTML('The answer', r.options[r.answer], r.loc, true) + UI.skimHTML('Why', r.explanation, null, true), [{ label: 'Back to it', value: 1, cls: 'go' }]); }
    return !!v;
  }

  /* One results screen: "Delivered." with stamp, stars and XP; missed cards; Retry, Practice, Carry on. No exclamation marks. */
  function results(r, def, api) {
    var stars = ''; for (var i = 0; i < 3; i++) stars += '<span class="' + (i < r.stars ? 'on' : '') + '">' + (i < r.stars ? '★' : '☆') + '</span>';
    var missed = r.missed.slice(0, 6).map(function (id) { return MG.missCard(id); }).join('');
    var mastered = def.mastered ? '<p class="verdictStamp r">' + esc(def.mastered(r)) + '</p>' : '';
    box();
    function box() {
      api.box.innerHTML = '<div class="resultCard"><p class="delivered' + (SET().reduceMotion ? '' : ' slam') + '">Delivered.</p>' + mastered +
        '<span class="stamp ' + r.stamp + '">' + r.stamp + ' stamp</span>' + (r.pb ? ' <span class="pbChip">Personal best: ' + esc(r.pb) + '</span>' : '') + '<div class="starsRow" aria-label="' + r.stars + ' of 3 stars">' + stars + '</div>' +
        '<p>' + (r.total - r.wrongFirst) + ' of ' + r.total + ' right first time' + (r.putRight ? '; ' + r.putRight + ' put right on a later go' : '') + (r.assisted ? '. A help was used: silver at most.' : '.') + (def.lap === 'retry' ? ' Retry: a better stamp counts; the step stays done.' : def.practice ? ' Practice: your story progress is unchanged.' : '') + '</p>' +
        (missed ? '<details open><summary>The cards behind your misses</summary><div style="display:grid;gap:8px">' + missed + '</div></details>' : '') +
        /* SD-39: Carry on is the one big button; playing again and practice are small links under it */
        '<div class="actions" style="justify-content:center"><button class="btn go big" type="button" data-res="go">Carry on</button></div>' +
        '<p class="resLinks"><button class="linkBtn" type="button" data-res="retry">Play it again<span class="kbOnly"> (R)</span></button><span aria-hidden="true"> · </span><button class="linkBtn" type="button" data-res="practice">Practice (no score)<span class="kbOnly"> (P)</span></button></p></div>';
    }
    if (window.Sound && !(window.Kit && Kit.sting('MUS-STING-DELIVERED'))) Sound.sfx('fanfare');
    if (window.Kit) Kit.flag('passed');
    if (window.Voice) Voice.say({ key: 'BAG-DELIVER-1', text: 'Delivered.', pri: 'menu' });
    return new Promise(function (resolve) {
      Array.prototype.forEach.call(api.box.querySelectorAll('[data-teach]'), function (b) { b.addEventListener('click', function () { var p = Flows.placeOf(b.getAttribute('data-teach')); if (p) { MG.teachAfter = p; } resolve('go'); }); });
      Array.prototype.forEach.call(api.box.querySelectorAll('[data-res]'), function (b) { b.addEventListener('click', function () { resolve(b.getAttribute('data-res')); }); });
      var g = api.box.querySelector('[data-res="go"]'); try { g.focus(); } catch (e) {}
    });
  }
  window.MiniGame = MG;
  /* m6: while a mini-game has more answers below the fold, a fade says so (as in the Hall) */
  (function moreBelow() {
    var layer = document.getElementById('mech'), box = document.getElementById('mechBox'); if (!layer || !box) return;
    var tag = document.createElement('div'); tag.className = 'moreBelow'; tag.hidden = true; tag.setAttribute('aria-hidden', 'true'); tag.textContent = 'More answers below'; layer.appendChild(tag);
    var check = function () { var more = box.scrollHeight - box.scrollTop - box.clientHeight > 24; tag.hidden = !more || layer.classList.contains('hidden'); };
    box.addEventListener('scroll', check, { passive: true });
    if (window.MutationObserver) new MutationObserver(function () { setTimeout(check, 60); }).observe(box, { childList: true, subtree: true });
    if (window.MutationObserver) new MutationObserver(function () { setTimeout(check, 60); }).observe(layer, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', check);
  })();
})();
