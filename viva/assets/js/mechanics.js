/* Freight City Viva v2: the act mechanics. Every one works by tap-to-pick, tap-to-place, mouse and keyboard. */
(function () {
  'use strict';
  var M = {};
  var esc = function (s) { return UI.esc(s); };
  var S = function () { return Game.state; };
  var SC = function () { return FCV.data.script; };
  var isLeave = function (e) { return e && e.leave; };

  M.run = async function (n, replay) {
    var a = SC().acts[n - 1], mech = a.mission.mechanic;
    /* QAD4-m1: the mechanic's own progress (calls, claims, levers, parts and the stamp once it is finished) lives in the
       mission record, found in the live save each time, written after every answer. A practice run keeps it in memory. */
    var scratch = {};
    var R = function () { if (replay) return scratch; var as = FCV.actState(S(), n); if (!as.mission) as.mission = {}; return as.mission.mech || (as.mission.mech = {}); };
    var keep = function () { if (!replay && window.Game && Game.flush) Game.flush(); };
    try {
      UI.open('Mission: ' + a.mission.name, 'Act ' + n + ', ' + a.district.name, mech.backdrop || FCV.actBackdrop[n], { leave: 'Pause and ride' });
      var stamp = R().stamp || null;
      if (stamp) UI.toast('Back in: the questions.', 2600);
      else {
        stamp = 'bronze';
        if (mech.type === 'whistle') stamp = await M.whistle(n, mech, R, keep);
        else if (mech.type === 'present_evidence') stamp = await M.trial(n, mech, R, keep);
        else if (mech.type === 'the_scale') stamp = await M.scale(n, mech, R, keep);
        else if (mech.type === 'rebuild_the_parcel') stamp = await M.rebuild(n, mech, R, keep);
        R().stamp = stamp; keep();
      }
      if (a.mission.items && a.mission.items.length) {
        await UI.say(a.mission.giver, 'Now the questions.', {});
        await Flows.quizRun(a.mission.items, a.mission.giver, { progress: replay ? {} : function () { var x = FCV.actState(S(), n); return x.mission || (x.mission = {}); } });
      }
      /* QAD4-m5: a practice run ("Play again (practice)") leaves the act stamp and the stars as they were */
      if (!replay) {
        Flows.giveStamp(n, stamp);
        /* D-02, D-05: the mission is saved as done, with its stars, before the banner */
        if (window.MiniGame) MiniGame.giveStars('act' + n + ':mission', { gold: 3, silver: 2, bronze: 1 }[stamp] || 1);
        FCV.markDone(S(), n, 'mission'); FCV.actState(S(), n).mission = null; if (S().resumeStep && S().resumeStep.act === n && S().resumeStep.step === 'mission') S().resumeStep = null;
      }
      if (window.Game && Game.flush) Game.flush();
      await UI.banner(replay ? 'Practice run done' : 'Mission passed', stamp.toUpperCase() + (replay ? ' stamp, practice (no score)' : ' stamp'));
    } finally { UI.close(); }
  };

  /* ---------- Act 3: the whistle ---------- */
  function makeCalls(pool, count) {
    var calls = [], ids = FCV.shuffle(pool);
    for (var i = 0; i < count; i++) {
      var id = ids[i % ids.length], r = FCV.resolve(id);
      var showRight = Math.random() < 0.5;
      var wrongs = r.options.map(function (o, j) { return j; }).filter(function (j) { return j !== r.answer; });
      var oi = showRight ? r.answer : FCV.pick(wrongs);
      calls.push({ id: id, r: r, oi: oi, isAnswer: oi === r.answer });
    }
    return calls;
  }
  function oneCall(c, k, total) {
    var timed = S().settings.timers;
    var html = '<div class="progress">' + Array.apply(null, Array(total)).map(function (x, i) { return '<i class="' + (i < k ? 'd' : '') + '"></i>'; }).join('') + '</div>' +
      '<div class="q">' + esc(c.r.q) + '</div><div class="card"><div class="lab">The call on the pitch</div><div class="txt q">' + esc(c.r.options[c.oi]) + '</div></div>' +
      (timed ? '<div class="timer" aria-hidden="true"><i></i></div>' : '') +
      '<div class="rate"><button class="btn go pickable" type="button" data-v="1">Play on: that is the answer</button><button class="btn pickable" type="button" data-v="0">Blow the whistle</button></div><div class="fb" aria-live="polite"></div>';
    return UI.custom(k % 2 ? 'sam' : 'sal', html, function (done, el) {
      var answered = false, t = null;
      var finish = function (v) {
        if (answered) return; answered = true; clearTimeout(t);
        var ok = v === (c.isAnswer ? 1 : 0);
        Array.prototype.forEach.call(el.querySelectorAll('[data-v]'), function (b) { b.disabled = true; });
        if (window.SFX) (ok ? SFX.right : SFX.wrong)();
        if (ok && window.Family) Family.job('whistle', 1.5);
        var pp = el.querySelectorAll('.progress i')[k]; if (pp) pp.className = ok ? 'd' : 'n';
        var fb = el.querySelector('.fb');
        fb.innerHTML = '<div class="verdict ' + (ok ? 'r' : 'w') + '">' + (v === -1 ? 'Too slow' : ok ? 'Good call' : 'Bad call') + '</div>' +
          UI.skimHTML('The right option', c.r.options[c.r.answer], c.r.loc, false) + '<div class="actions"><button class="btn go" type="button">Next call</button></div>';
        var go = fb.querySelector('.btn.go'); go.addEventListener('click', function () { done(ok); }); try { go.focus({ preventScroll: true }); } catch (e) {}
      };
      Array.prototype.forEach.call(el.querySelectorAll('[data-v]'), function (b) { b.addEventListener('click', function () { finish(+b.getAttribute('data-v')); }); });
      if (timed) { var bar = el.querySelector('.timer i'); bar.style.animationDuration = '6s'; t = setTimeout(function () { finish(-1); }, 6000); }
    });
  }
  M.whistle = async function (n, mech, R, keep) {
    var stamp = 'bronze', total = 8;
    if (!R().calls) { await UI.say('sal', 'Eight calls. Play on if the call is the answer; blow the whistle if it is not.', {}); await Flows.clockOffer('whistle'); }
    else UI.toast('Back in: call ' + Math.min(total, (R().k || 0) + 1) + ' of ' + total + '.', 2600);
    for (;;) {
      var calls;
      if (R().calls) calls = R().calls.map(function (x) { var r = FCV.resolve(x[0]); return { id: x[0], r: r, oi: x[1], isAnswer: x[1] === r.answer }; });
      else { calls = makeCalls(mech.pool, total); var r0 = R(); r0.calls = calls.map(function (c) { return [c.id, c.oi]; }); r0.k = 0; r0.right = 0; r0.missed = []; keep(); }
      for (var k = R().k || 0; k < calls.length; k++) {
        var ok = await oneCall(calls[k], k, calls.length);
        Flows.record(calls[k].id, ok ? 'right' : 'wrong');
        var rk = R(); if (ok) rk.right = (rk.right || 0) + 1; else (rk.missed = rk.missed || []).push(calls[k].id); rk.k = k + 1; keep();
      }
      var right = R().right || 0, missed = (R().missed || []).slice(), firstRun = R().firstRun !== false;
      if (right >= 6) { stamp = right === 8 && firstRun ? 'gold' : right >= 7 ? 'silver' : 'bronze'; await UI.say('sam', 'Full time. ' + right + ' of 8.', {}); return stamp; }
      await UI.say('sam', right + ' of 8. The twins replay the calls you missed, then you go again.', {});
      for (var m = 0; m < missed.length; m++) { var okq = await UI.quiz(missed[m], { who: 'sal', framing: 'Replay.' }); Flows.record(missed[m], okq ? 'right' : 'wrong'); }
      var rn = R(); rn.calls = null; rn.k = 0; rn.right = 0; rn.missed = []; rn.firstRun = false; keep();
    }
  };

  /* ---------- Act 4: present the evidence ---------- */
  M.trial = async function (n, mech, R, keep) {
    var total = mech.claims.length;
    if (R().i === undefined) {
      await UI.say('manny', 'The Big Fierce Animal makes six claims. Answer each with a card from the evidence case. Three objections and the judge adjourns.', {});
      var r0 = R(); r0.i = 0; r0.hearts = 3; r0.lost = 0; r0.tries = {}; r0.restarts = 0; keep();
    } else UI.toast('Back in: claim ' + Math.min(total, R().i + 1) + ' of ' + total + '.', 2600);
    for (;;) {
      var adjourned = false;
      for (var i = R().i || 0; i < total; i++) {
        var rr = R(), c = mech.claims[i];
        var ok = await claimRound(c, mech.case, rr.hearts, i, total, (rr.tries || {})[i] || 0);
        rr = R();
        if (ok) { rr.i = i + 1; keep(); continue; }
        rr.tries = rr.tries || {}; rr.tries[i] = (rr.tries[i] || 0) + 1; rr.hearts--; rr.lost = (rr.lost || 0) + 1; rr.i = i; keep(); i--;
        if (rr.hearts <= 0) { adjourned = true; break; }
      }
      if (!adjourned) break;
      var ra = R(); ra.restarts = (ra.restarts || 0) + 1; ra.i = 0; ra.hearts = 3; ra.lost = 0; ra.tries = {}; keep();
      await UI.say('manny', 'Three objections. The judge adjourns. Back to claim one; nothing else is lost.', { direction: 'gavel' });
    }
    var rf = R(), lostTotal = rf.lost || 0, restarts = rf.restarts || 0;
    return lostTotal === 0 && restarts === 0 ? 'gold' : lostTotal <= 1 && restarts === 0 ? 'silver' : 'bronze';
  };
  /* SD-16: a headline in sentence case with no code lists; the full card stays one tap away (Read) */
  function sentenceCase(t) { t = String(t || ''); if (t.replace(/[^A-Za-z]/g, '').length > 3 && t === t.toUpperCase()) t = t.toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); }
  function tileHTML(id, i) {
    var r = FCV.resolve(id); if (!r) return '';
    var short = r.text.length > 110 ? r.text.slice(0, 107).replace(/\s+\S*$/, '') + '...' : r.text;
    var head = sentenceCase(UI.stripCodes(UI.plainFigure(r.figure) || r.label));
    /* QAD-m7: a stance count reads in words, in the cards' own order (for, against, mixed, silent) */
    head = head.replace(/\b(\d+)\/(\d+)\/(\d+)\/(\d+)\b/g, '$1 for, $2 against, $3 mixed, $4 silent');
    /* item 19: a Read button opens the whole card in place without choosing the tile */
    return '<div class="tileWrap"><button class="tile exTile pickable" type="button" data-id="' + esc(id) + '"><span class="k">' + (i + 1) + '</span><b>' + esc(head || r.label) + '</b><span class="exShort">' + esc(short) + '</span></button>' +
      (short !== r.text ? '<button class="btn small exRead" type="button" data-read-tile="' + esc(id) + '" aria-expanded="false">Read</button><div class="exFull" hidden>' + UI.cardHTML(id, { noMet: true, noTools: true }) + '</div>' : '') + '</div>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-read-tile]'); if (!b) return;
    e.preventDefault(); e.stopPropagation(); var full = b.nextElementSibling, open = full.hidden; full.hidden = !open; b.setAttribute('aria-expanded', open); b.textContent = open ? 'Close' : 'Read';
  }, true);
  /* SD-16: four exhibits per claim: the one that answers it and three others from the case, in a fixed shuffled order */
  function fourFor(c, caseIds, k) {
    var others = caseIds.filter(function (id) { return id !== c.answer && FCV.resolve(id); }), seed = k * 7 + 3, pick = [];
    for (var j = 0; j < others.length && pick.length < 3; j++) pick.push(others[(seed + j * 5) % others.length]);
    pick = pick.filter(function (x, i, a) { return a.indexOf(x) === i; });
    for (var q = 0; pick.length < 3 && q < others.length; q++) if (pick.indexOf(others[q]) < 0) pick.push(others[q]);
    var all = pick.concat([c.answer]), at = (k * 3 + 1) % all.length; all.splice(all.length - 1, 1); all.splice(at, 0, c.answer);
    return all;
  }
  function claimRound(c, caseIds, hearts, k, total, missedBefore) {
    var html = '<div class="objections" aria-label="Objections left: ' + hearts + '">' + [0, 1, 2].map(function (i) { return '<span class="h' + (i < hearts ? '' : ' gone') + '">&#9878;</span>'; }).join('') + ' <small>Objections left: ' + hearts + '</small></div>' +
      '<div class="progress">' + Array.apply(null, Array(total)).map(function (x, i) { return '<i class="' + (i < k ? 'd' : '') + '"></i>'; }).join('') + '</div>' +
      '<div class="claimPin"><div class="line">' + esc(c.line) + '</div><div class="dir">Tap the card that answers this claim.</div></div><div class="tiles">' + fourFor(c, caseIds, k).map(tileHTML).join('') + '</div><div class="fb" aria-live="polite"></div>';
    return UI.custom(c.who, html, function (done, el) {
      var answered = false;
      /* AUDR4-02: the claim is heard in the Animal's own voice, and "Why it answers the claim" in Manny's */
      UI.speakText(c.line, c.who, 'scene');
      Array.prototype.forEach.call(el.querySelectorAll('.tile'), function (b) {
        b.addEventListener('click', function () {
          if (answered) return; answered = true;
          var id = b.getAttribute('data-id'), ok = id === c.answer;
          Array.prototype.forEach.call(el.querySelectorAll('.tile'), function (x) { x.disabled = true; });
          b.classList.add(ok ? 'right' : 'wrong');
          if (window.SFX) (ok ? SFX.right : SFX.hit)(false);
          if (ok && window.Family) Family.job('gavel', 1.5);
          Flows.record('recall:' + c.answer, ok ? 'right' : 'wrong');
          var fb = el.querySelector('.fb');
          fb.innerHTML = ok ? '<div class="verdict r">Exhibit accepted</div>' + UI.cardHTML(c.answer) + '<div class="answer"><b class="aTitle">Why it answers the claim</b>' + esc(c.why_shown) + '</div>'
            : '<div class="verdict w">Objection sustained</div><div class="answer">That card does not answer this claim. One objection lost.</div>' +
              /* after the second wrong try on a claim, the card that answers it and why */
              (missedBefore >= 1 ? UI.cardHTML(c.answer) + '<div class="answer"><b class="aTitle">Why that card answers the claim</b>' + esc(c.why_shown) + '</div>' : '');
          if (ok || missedBefore >= 1) UI.speakText(c.why_shown, 'manny', 'scene');
          var pp = el.querySelectorAll('.progress i')[k]; if (pp && ok) pp.className = 'd';
          fb.innerHTML += '<div class="actions"><button class="btn go" type="button">' + (ok ? 'Next claim' : 'Try again') + '</button></div>';
          var go = fb.querySelector('.btn.go'); go.addEventListener('click', function () { done(ok); }); try { go.focus({ preventScroll: true }); } catch (e) {}
          fb.scrollIntoView({ block: 'nearest' });
        });
      });
    });
  }

  /* ---------- Act 6: the scale ---------- */
  M.scale = async function (n, mech, R, keep) {
    var levers = [{ id: 'wall', label: 'A wall', term: 'L', why: 'Walls cut L.' }, { id: 'grant', label: 'A grant', term: 'S', why: 'Grants raise S.' }, { id: 'permit', label: 'A permit', term: 'P', why: 'Permits add P.' }];
    /* QAD4-m1: back in after a close, the facts are not read again and the levers already placed stay placed */
    if (!R().read) { for (var f = 0; f < mech.facts.length; f++) await UI.say('corra', f === 0 ? 'The condition, as a balance. Saving and penalty on one pan; exposure and the wall on the other.' : 'Read it once more.', { fact: mech.facts[f] }); R().read = true; keep(); }
    else UI.toast('Back in: ' + Object.keys(R().placed || {}).length + ' of ' + levers.length + ' levers placed.', 2600);
    var placed = Object.assign({}, R().placed || {}), wrong = R().wrong || 0;
    /* SD-30: each letter carries its word from Corra's line: saving, penalty, exposure, the wall */
    var term = function (t, w) { return '<button class="term pickable" type="button" data-t="' + t + '">' + t + '<small>' + w + '</small></button>'; };
    var html = '<div class="line">Tap a lever, then tap the term it moves.</div><div class="scale"><div class="beam"><div class="pan left">' + term('S', 'saving') + ' + ' + term('P', 'penalty') + '</div>' +
      '<div class="pivot"></div><div class="pan right">' + term('L', 'exposure') + ' + ' + term('W', 'the wall') + '</div></div></div>' +
      '<div class="levers">' + levers.map(function (l) { return '<button class="lever pickable" type="button" data-l="' + l.id + '">' + esc(l.label) + '</button>'; }).join('') + '</div><div class="fb" aria-live="polite"></div>';
    await UI.custom('corra', html, function (done, el) {
      var sel = null, beam = el.querySelector('.beam');
      var tilt = function () { var k = Object.keys(placed).length; beam.style.transform = 'rotate(' + (-6 * k) + 'deg)'; };
      Object.keys(placed).forEach(function (id) { var lb = el.querySelector('[data-l="' + id + '"]'), lv = levers.filter(function (x) { return x.id === id; })[0]; if (lb) { lb.classList.add('placed'); lb.disabled = true; } if (lv) { var tb = el.querySelector('[data-t="' + lv.term + '"]'); if (tb) tb.classList.add('on'); } }); tilt();
      Array.prototype.forEach.call(el.querySelectorAll('.lever'), function (b) {
        b.addEventListener('click', function () { if (placed[b.getAttribute('data-l')]) return; Array.prototype.forEach.call(el.querySelectorAll('.lever'), function (x) { x.classList.remove('sel'); }); b.classList.add('sel'); sel = b.getAttribute('data-l'); });
      });
      Array.prototype.forEach.call(el.querySelectorAll('.term'), function (t) {
        t.addEventListener('click', function () {
          if (!sel) { UI.toast('Tap a lever first.', 1500); return; }
          var lv = levers.filter(function (x) { return x.id === sel; })[0], ok = lv.term === t.getAttribute('data-t');
          var fb = el.querySelector('.fb');
          if (ok) {
            placed[sel] = 1; var rp = R(); rp.placed = Object.assign({}, placed); keep(); el.querySelector('[data-l="' + sel + '"]').classList.add('placed'); el.querySelector('[data-l="' + sel + '"]').disabled = true; t.classList.add('on'); tilt();
            if (window.SFX) SFX.right(); if (window.Family) Family.job('block', 1.5); fb.innerHTML = '<div class="verdict r">' + esc(lv.why) + '</div>';
          } else {
            wrong++; R().wrong = wrong; keep(); var lb = el.querySelector('[data-l="' + sel + '"]'); lb.classList.add('spring'); setTimeout(function () { lb.classList.remove('spring'); }, 600);
            if (window.SFX) SFX.wrong(); fb.innerHTML = '<div class="verdict w">It springs back</div>' + UI.cardHTML('ch6-01');
          }
          sel = null; Array.prototype.forEach.call(el.querySelectorAll('.lever'), function (x) { x.classList.remove('sel'); });
          if (Object.keys(placed).length === levers.length) {
            fb.innerHTML += '<div class="answer"><b class="aTitle">The pans tip</b>With the wall, the grant and the permit in place, the saving and penalty side outweighs the exposure side.</div><div class="actions"><button class="btn go" type="button">Next</button></div>';
            fb.querySelector('.btn.go').addEventListener('click', function () { done(true); });
          }
        });
      });
    });
    Flows.record('recall:ch6-01', wrong ? 'wrong' : 'right');
    return wrong === 0 ? 'gold' : wrong <= 1 ? 'silver' : 'bronze';
  };

  /* ---------- Act 7: rebuild the parcel ---------- */
  function orderPuzzle(who, title, parts, tries) {
    var shuffled = FCV.shuffle(parts.map(function (p, i) { return { p: p, i: i }; }));
    var html = '<div class="line">' + esc(title) + '</div><div class="built" aria-live="polite"></div><div class="tiles">' +
      shuffled.map(function (x, j) { return '<button class="tile pickable" type="button" data-i="' + x.i + '"><span class="k">' + (j + 1) + '</span><span>' + esc(x.p) + '</span></button>'; }).join('') +
      '</div><div class="dir triesLeft">Tries left: ' + tries + '</div><div class="fb"></div>';
    return UI.custom(who, html, function (done, el) {
      var next = 0, left = tries, errors = 0, built = el.querySelector('.built');
      var reset = function () { next = 0; built.textContent = ''; Array.prototype.forEach.call(el.querySelectorAll('.tile'), function (t) { t.disabled = false; t.classList.remove('right'); }); };
      Array.prototype.forEach.call(el.querySelectorAll('.tile'), function (b) {
        b.addEventListener('click', function () {
          var i = +b.getAttribute('data-i');
          if (i === next) { b.disabled = true; b.classList.add('right'); built.textContent += (next ? ' ' : '') + parts[i]; next++; if (window.SFX) SFX.blip(); }
          else {
            /* item 36: the message sits beside the line, and the placed tiles fly back with a soft thud */
            errors++; left--; if (window.Kit) Kit.sfx('SFX-THUNK'); else if (window.SFX) SFX.wrong();
            el.querySelector('.triesLeft').textContent = left > 0 ? 'Not that one. Start again. Tries left: ' + left : 'Tries left: 0';
            if (left > 0) { Array.prototype.forEach.call(el.querySelectorAll('.tile.right'), function (t) { t.classList.add('flyBack'); setTimeout(function () { t.classList.remove('flyBack'); }, 450); }); setTimeout(reset, S().settings.reduceMotion ? 0 : 420); }
          }
          if (next === parts.length || left <= 0) {
            Array.prototype.forEach.call(el.querySelectorAll('.tile'), function (t) { t.disabled = true; });
            var fb = el.querySelector('.fb');
            if (next === parts.length && window.Family) Family.job('tape', 1.5);
            fb.innerHTML = '<div class="verdict ' + (next === parts.length ? 'r' : 'w') + '">' + (next === parts.length ? 'Rebuilt' : 'Here it is, word for word') + '</div><div class="answer">' + esc(parts.join(' ')) + '</div><div class="actions"><button class="btn go" type="button">Next</button></div>';
            fb.querySelector('.btn.go').addEventListener('click', function () { done(errors); });
          }
        });
      });
    });
  }
  M.rebuild = async function (n, mech, R, keep) {
    var t = FCV.data.story.thesis, errors = R().errors || 0;
    /* QAD4-m1: the part (and the proposition or objective inside it) reached is kept; back in, the run carries on there */
    var p0 = R().p || 0, sub0 = R().sub || 0;
    if (p0 || sub0) UI.toast('Back in: part ' + Math.min(mech.parts.length, p0 + 1) + ' of ' + mech.parts.length + '.', 2600);
    var mark = function (p, sub) { var r = R(); r.p = p; r.sub = sub; r.errors = errors; keep(); };
    for (var p = p0; p < mech.parts.length; p++) {
      var part = mech.parts[p], from = p === p0 ? sub0 : 0;
      if (part.part === 'one_sentence') {
        errors += await orderPuzzle('digits', 'Rebuild the one sentence. Tap its parts in order.', FCV.clauses(t.one_sentence.text), 3);
      } else if (part.part === 'research_question') {
        errors += await orderPuzzle('digits', 'Rebuild the research question.', FCV.clauses(t.research_question.text), 3);
      } else if (part.part === 'propositions') {
        var props = t.propositions;
        for (var i = from; i < props.length; i++) {
          var names = props.map(function (x) { return x.name; });
          var ok1 = await UI.quiz({ id: 'prop-name:' + props[i].id, q: 'Which name goes with ' + props[i].id + '? ' + props[i].text, options: names, answer: i, explanation: props[i].id + ': ' + props[i].name, loc: t.propositions_section }, { who: 'digits' });
          var fals = FCV.shuffle(props.filter(function (x, j) { return j !== i; })).slice(0, 3).map(function (x) { return x.falsified_by; });
          var fo = FCV.shuffle([props[i].falsified_by].concat(fals));
          var ok2 = await UI.quiz({ id: 'prop-fals:' + props[i].id, q: 'What would falsify ' + props[i].id + ' (' + props[i].name + ')?', options: fo, answer: fo.indexOf(props[i].falsified_by), explanation: 'Falsified by ' + props[i].falsified_by, loc: t.propositions_section }, { who: 'digits' });
          if (!ok1) errors++; if (!ok2) errors++;
          Flows.record(props[i].id + ':falsifier', ok2 ? 'right' : 'wrong');
          mark(p, i + 1);
        }
      } else if (part.part === 'wiring_board') {
        var objs = t.objectives, secs = objs.map(function (o) { return o.answered_in; });
        var targets = ['finding-1', 'finding-2', 'finding-3', 'finding-4', 'link-5'];
        var tnames = targets.map(function (x) { var r = FCV.resolve(x); return r.figure + (x === 'link-5' ? ' (proposed)' : ''); });
        for (var o = from; o < objs.length; o++) {
          var okA = await UI.quiz({ id: 'wire-sec:' + o, q: 'Objective ' + objs[o].number + ': ' + objs[o].text + ' Which section answers it?', options: secs, answer: o, explanation: 'Answered in ' + objs[o].answered_in, loc: t.objectives_section }, { who: 'digits', framing: 'The wiring board.' });
          var okB = await UI.quiz({ id: 'wire-link:' + o, q: 'Objective ' + objs[o].number + ' wires to which finding or link?', options: tnames, answer: o, explanation: tnames[o], loc: (FCV.resolve(targets[o]) || {}).loc }, { who: 'digits' });
          if (!okA) errors++; if (!okB) errors++;
          mark(p, o + 1);
        }
      } else if (part.part === 'finding_or_proposition') {
        UI.close(); await Flows.drillFoP(false); UI.open('Mission: Last Run', 'The parcel, rebuilt', FCV.actBackdrop[7]);
      }
      mark(p + 1, 0);
    }
    return errors === 0 ? 'gold' : errors <= 3 ? 'silver' : 'bronze';
  };

  /* ---------- Act 7: the mock viva ---------- */
  M.mockViva = async function (n) {
    var a = SC().acts[n - 1], st = S(), eqs = [], bank = [];
    /* AUDR4-10: every question in the dress rehearsal has an examiner recording, asked by the examiner who recorded it:
       the acts' examiner rehearsals, and Hall bank questions (the Hall's own asker for each). The Hall mutes the narrator,
       so a chapter quiz read by Marigold would be shown in silence here. */
    SC().acts.forEach(function (act) {
      ['examiner_rehearsal', 'examiner_rehearsal_2'].forEach(function (k) {
        var er = act[k]; if (!er || !er.choices) return;
        var q = FCV.resolve(er.question); var bi = er.choices.findIndex(function (c) { return c.best; });
        eqs.push({ id: 'mock:' + er.question, mem: er.question, asker: er.asker, question: q.question, options: er.choices.map(function (c) { return c.text; }), answer_index: bi, why: er.choices[bi].feedback || '', source: q.loc, _k: false, _d: 2 });
      });
    });
    var fixed = (SC().finale.v3 || {}).askers_fixed_at_build || {};
    Object.keys(fixed).forEach(function (id) { var b = FCV.bankItem(id); if (!b) return; bank.push({ id: 'mock:bank:' + id, mem: 'bank:' + id, asker: fixed[id], question: b.question, options: b.options, answer_index: b.answer_index, why: b.why, source: b.source, _k: false, _d: b.difficulty || 2 }); });
    var weakFirst = function (x, y) { var bx = (st.mem[x.mem] || { box: 0 }).box, by = (st.mem[y.mem] || { box: 0 }).box; return bx - by || Math.random() - 0.5; };
    eqs.sort(weakFirst); bank.sort(weakFirst);
    for (;;) {
      var draw = FCV.shuffle(FCV.shuffle(eqs.slice(0, 6)).slice(0, 3).concat(FCV.shuffle(bank.slice(0, 20)).slice(0, 5))).map(function (x) { return Object.assign({}, x); });
      draw[draw.length - 1]._k = true;
      var res = await Viva.engine({ items: draw, hearts: 3, mock: true, title: a.mock_viva ? a.mock_viva.title : 'Dress rehearsal' });
      if (res.quit) return false;
      if (res.hearts > 0) { Flows.giveStamp(n, res.hearts === 3 ? 'gold' : res.hearts === 2 ? 'silver' : 'bronze', 'mock'); await UI.banner('Dress rehearsal passed', res.hearts + ' of 3 hearts left'); return true; }
      var again = await UI.modal('Not yet', '<p>All three hearts gone. ' + res.wrong.length + ' answers cost you. Read the feedback, then go again.</p>', [{ label: 'Go again', value: 1, cls: 'go' }, { label: 'Later', value: 0 }]);
      if (!again) return false;
    }
  };

  window.Mechanics = M;
})();
