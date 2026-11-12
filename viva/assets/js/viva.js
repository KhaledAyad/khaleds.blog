/* Freight City Viva v2: the final boss, as Khaled set it. Two examiners, five hearts, a fresh draw every attempt. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return UI.esc(s); };
  var V = {};
  var run = null;
  var FIN = function () { return FCV.data.script.finale; };
  var ST = function () { return Game.state; };
  var RANK = { fail: 0, major: 1, minor: 2, none: 3 };
  var TITLES = { fail: 'PhD not awarded', major: 'Pass with major corrections', minor: 'Pass with minor corrections', none: 'Pass with no corrections' };
  var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  var SET = function () { return ST().settings; };

  function heartsHTML() {
    var h = '';
    for (var i = 0; i < run.max; i++) h += '<span class="h' + (i >= run.hearts ? ' gone' : '') + '" aria-hidden="true">' + (i >= run.hearts ? '&#9825;' : '&#9829;') + '</span>';
    $('hearts').innerHTML = h + '<span class="sr">' + run.hearts + ' of ' + run.max + ' hearts</span>';
    /* family mode: no red pulse; a ticking clock and a low drum stand in for the heartbeat */
    $('viva').classList.toggle('last', run.hearts === 1 && !SET().reduceMotion && !SET().family);
    $('viva').classList.toggle('famBoss', !!SET().family);
    if (SET().family) {
      var lamps = ''; for (var k = 0; k < 4; k++) lamps += '<i class="' + (k < Math.min(4, run.streak || 0) ? 'on' : '') + '"></i>';
      var left = run.items ? Math.max(0, run.items.length - (run.pos || 0)) : 0;
      $('hearts').classList.add('glass');
      $('hearts').insertAdjacentHTML('beforeend', '<span class="lamps streakLamps" aria-label="Streak ' + (run.streak || 0) + ' of 4">' + lamps + '</span><span class="pile" aria-label="' + left + ' questions left">' + left + '</span>');
    } else $('hearts').classList.remove('glass');
  }
  /* The Viva Hall live stage: the clean plate, the two seated puppets (the asker lit), the table edge in front. */
  var POSE = { dr_tally: { listen: 'TS18', killer: 'TS19', write: 'TS20', nod: 'TS21' }, prof_kerbstone: { listen: 'TS22', killer: 'TS23', write: 'TS24', nod: 'TS25' } };
  function stageSetup() {
    var bg = $('vivaBg'), plate = FCV.assetUrl('TS26');
    if (!plate || !FCV.assetUrl('TS18')) { bg.style.backgroundImage = 'url(' + (FCV.assetUrl('S16')) + ')'; return; }
    bg.style.backgroundImage = 'url(' + plate + ')'; bg.style.opacity = '.55';
    bg.innerHTML = '<img alt="" id="pupT" style="position:absolute;left:14%;bottom:18%;height:56%;transition:filter .3s"><img alt="" id="pupK" style="position:absolute;right:14%;bottom:18%;height:56%;transition:filter .3s">' + (FCV.assetUrl('TE10') ? '<img alt="" src="' + FCV.assetUrl('TE10') + '" style="position:absolute;left:0;right:0;bottom:0;width:100%">' : '');
    stagePose('dr_tally', 'listen'); stagePose('prof_kerbstone', 'listen', true);
  }
  function stagePose(who, kind, dim) {
    var el = $(who === 'dr_tally' ? 'pupT' : 'pupK'); if (!el || !POSE[who]) return;
    var u = FCV.assetUrl(POSE[who][kind] || POSE[who].listen); if (u) el.src = u;
    el.style.filter = dim ? 'brightness(.55)' : 'none';
    var other = $(who === 'dr_tally' ? 'pupK' : 'pupT'); if (other && !dim) other.style.filter = 'brightness(.55)';
  }
  function roundOf(i) { var t = Math.ceil(run.items.length / 3); return i < t ? 1 : i < 2 * t ? 2 : 3; }
  function meta() {
    var st = ST(), met = Object.keys(st.viva.seen).length;
    var r = roundOf(Math.max(0, run.pos));
    /* SD-18: the header is just the question count */
    void met;
    $('vivaMeta').innerHTML = (run.mock ? esc(run.title) + ' &middot; ' : '') + 'Question ' + Math.min(run.pos + 1, run.items.length) + ' of ' + run.items.length;
    var v = $('viva'); if (window.Kit && r > 1 && !v.classList.contains('r' + r)) Kit.sting('MUS-HALL-ROUND'); v.classList.remove('r1', 'r2', 'r3'); v.classList.add('r' + r);
  }
  function panel(asker) {
    return '<div class="panelists">' + FIN().examiners.map(function (e) {
      var c = FCV.character(e.id);
      return '<div class="panelist' + (e.id === asker ? ' on' : '') + '">' + UI.porHTML(e.id) + '<div><b>' + esc(c.name) + '</b><small>' + esc(e.role === 'internal' ? 'Internal examiner' : 'External examiner') + '</small></div></div>';
    }).join('') + '</div>';
  }
  function show(html) { var el = $('vivaInner'); el.innerHTML = html; el.parentNode.scrollTop = 0; }
  function nextBtn(label, id) { return '<div class="actions"><button class="btn go" type="button" id="' + (id || 'vNext') + '">' + esc(label || 'Next') + '</button></div>'; }
  /* round 7: a Next (or Hear the verdict) below the fold is brought up into view, clear of the "More answers below" fade
     (the stage keeps 80 px of scroll padding for it); one already in view stays where it is */
  function showBtn(b) {
    var stg = document.querySelector('#viva .vivaStage'); if (!b || !stg) return;
    var r = b.getBoundingClientRect(), sr = stg.getBoundingClientRect();
    if (r.top < sr.top || r.bottom > sr.bottom - 80) try { b.scrollIntoView({ block: 'nearest', behavior: SET().reduceMotion ? 'auto' : 'smooth' }); } catch (e) {}
  }
  function waitBtn(id) { return new Promise(function (res) { var b = $(id || 'vNext'); if (!b) return res(); try { b.focus({ preventScroll: true }); } catch (e) {} requestAnimationFrame(function () { showBtn(b); }); b.addEventListener('click', function () { res(); }); }); }
  /* stage directions are for the script, not the player: only "not scored" is said, in plain words */
  function dirText(d) { return d && /not scored/i.test(d) ? 'This one is not scored.' : ''; }
  async function say(who, line, fact, direction) {
    show(panel(who) + '<div class="vivaCard"><div class="who">' + esc(FCV.nameOf(who)) + '</div><div class="line">' + esc(line) + '</div>' +
      (dirText(direction) ? '<div class="dir">' + esc(dirText(direction)) + '</div>' : '') + (fact ? UI.cardHTML(fact) : '') + nextBtn() + '</div>');
    /* AUD-06: the opening ritual is voiced in the examiner's own voice; Next stops the line */
    if (who && who !== 'you' && line && !/^\(/.test(line)) speak(line, null, who);
    await waitBtn();
    if (window.Sound) Sound.stopVoice();
  }
  async function sayAloudHere(who, prompt, fact) {
    var r = FCV.resolve(fact);
    show(panel(who) + '<div class="vivaCard"><div class="who">' + esc(FCV.nameOf(who)) + '</div><div class="line">' + esc(prompt) + '</div><div class="dir">Say it aloud. This one is not scored.</div>' +
      '<div class="fb">' + nextBtn('Reveal the answer', 'vRev') + '</div></div>');
    await waitBtn('vRev');
    $('vivaInner').querySelector('.fb').innerHTML = UI.cardHTML(fact) + nextBtn();
    await waitBtn(); void r;
  }
  function shake(big) {
    if (SET().reduceMotion) return;
    var el = $('viva'); el.classList.remove('shake', 'shake2'); void el.offsetWidth; el.classList.add(big ? 'shake2' : 'shake');
    if (big && !SET().family) { var f = $('flash'); f.style.opacity = '.45'; setTimeout(function () { f.style.opacity = '0'; }, 220); }
  }
  function pressure(forceAfterWrong) {
    /* 'Let me press you on that' is said only before a follow-up (sayFollow), never as idle pressure */
    var pool = FIN().lines.pressure.filter(function (p) { return !/press you/i.test(p.line); }); run.sincePressure++;
    if (!forceAfterWrong && run.sincePressure < run.nextPressureAt) return null;
    var opts = pool.filter(function (p) { return p.who !== run.lastPressureWho; });
    var p = pick(opts.length ? opts : pool);
    run.lastPressureWho = p.who; run.sincePressure = 0; run.nextPressureAt = 3 + Math.floor(Math.random() * 2);
    return p;
  }
  function heldDiv(src) { return src && UI.HELD_RE && UI.HELD_RE.test(String(src)) ? '<div class="held">Held by the author, available on request</div>' : ''; }
  function cleanSource(src) { return String(src || '').split(/;\s*/).filter(function (t) { return t && !/^ch\d+[- ]|^gaps? \d+|objectives_note|^app-|^trace-|^gap-/.test(t); }).join('; '); }
  /* Examiner voices: the generated clip for this bank question (on by default; Settings can turn it off); speech synthesis only if chosen. */
  function speak(text, id, asker, onStart) {
    /* the Hall belongs to the examiners: their recorded voices only (the device voice never speaks in the Hall) */
    if (SET().examinerVoice !== false && window.Sound && (id || text)) return Sound.voice(id || null, { speaker: asker || 'dr_tally', inHall: true, text: text || null, onStart: onStart });
    return Promise.resolve(false);
  }
  function speakSynth(text) {
    return new Promise(function (res) {
      if (!SET().voice || !window.speechSynthesis) return res(false);
      var v = speechSynthesis.getVoices().filter(function (x) { return /en-GB/i.test(x.lang); })[0];
      if (!v) return res(false);
      var u = new SpeechSynthesisUtterance(text); u.voice = v; u.lang = 'en-GB'; u.onend = function () { res(true); }; u.onerror = function () { res(false); };
      speechSynthesis.speak(u);
    });
  }

  /* One scored question: think first, then sure or not sure, then the options. */
  function failLine(pool, q) {
    /* lines that speak of a figure or a table only for questions that carry one */
    /* chapter, objective, link, file and section numbers are not figures */
    var txt = String(q.question + ' ' + q.options[q.answer_index]).replace(/\b(?:Chapters?|Objectives?|Sub-objectives?|Sections?|Appendix|Links?|Files?|Stages?|Articles?|P)\s*\d+[A-Za-z]?(?:\.\d+)*(?:\s*(?:,|and|or|to)\s*\d+[A-Za-z]?)*/gi, '').replace(/\b\d\.\d+(?:\.\d+)*\b/g, '');
    var hasFig = /\d|\btable\b/i.test(txt);
    var ok = pool.filter(function (l) { return hasFig || !/figure|number|count|table/i.test(l); });
    return pick(ok.length ? ok : pool);
  }
  /* QAD3-m3: a two-heart cue names only the examiner who asks (or no examiner at all) */
  function cueFor(asker) {
    var pool = FIN().lines.killer_cues || [], ex = FIN().examiners || [];
    var sur = function (id) { var n = String(FCV.nameOf(id) || '').split(' '); return n[n.length - 1]; };
    var ok = pool.filter(function (l) { var named = ex.filter(function (e) { var w = sur(e.id); return w && new RegExp('\\b' + w + '\\b').test(l); }).map(function (e) { return e.id; }); return !named.length || (named.length === 1 && named[0] === asker); });
    return pick(ok.length ? ok : pool);
  }
  V._cueFor = cueFor; /* for the headless checks */
  function clipAsker(q) { try { var id = window.Voice && Voice.textClip ? Voice.textClip(q.question) : null, e = id && Voice.entry(id); return e && /^(dr_tally|prof_kerbstone)$/.test(e.speaker) ? e.speaker : null; } catch (x) { return null; } }
  function ask(q, asker, frame, pre, commit) {
    meta(); heartsHTML();
    if (window.Family) Family.dockSleep(true);
    var L = FIN().lines, killer = !!q._k;
    var cue = killer ? (q._cueFor === asker && q._cue ? q._cue : cueFor(asker)) : null; void L;
    var wakeS = killer ? 10 : 6;
    var order = FCV.shuffle(q.options.map(function (o, i) { return i; }));
    var html = panel(asker) + '<div class="vivaCard' + (killer ? ' killer' : '') + '">' +
      (killer ? '<div class="killerTag">Two-heart question: a wrong answer costs two hearts</div><div class="say">' + esc(cue) + '</div>' : '') +
      (frame ? '<div class="say">' + esc(FCV.nameOf(asker)) + ': ' + esc(frame) + '</div>' : '') +
      '<div class="who">' + esc(FCV.nameOf(asker)) + '</div><div class="q">' + esc(q.question) + '</div>' +
      '<div class="think"><div class="dir">Think first. Say your answer aloud, then say how sure you are. The answers stay hidden until you do.</div>' +
      '<div class="thinkWrap"><div class="thinkRing" aria-hidden="true"><b>' + wakeS + '</b></div><span class="thinkTxt" aria-live="off">Think... ' + wakeS + '</span><button class="btn small" type="button" data-hear="1" hidden>Hear it again</button></div>' +
      '<div class="rate"><button class="btn go" type="button" data-s="1" disabled>Said it, sure</button><button class="btn" type="button" data-s="0" disabled>Said it, not sure</button></div></div>' +
      '<div class="opts" hidden role="group" aria-label="Answers">' + order.map(function (oi, i) { return '<button class="opt" type="button" data-i="' + oi + '"><span class="k">' + (i + 1) + '</span><span>' + esc(q.options[oi]) + '</span></button>'; }).join('') + '</div>' +
      (SET().hardViva ? '<div class="timer" hidden aria-hidden="true"><i></i></div>' : '') + '<div class="fb" aria-live="polite"></div></div>';
    show(html);
    stagePose(asker, killer ? 'killer' : 'listen');
    var el = $('vivaInner');
    return new Promise(function (resolve) {
      run._abort = function () { clearTimeout(clock); resolve({ quit: true }); };
      var sure = null, answered = false, clock = null;
      /* item 13: a ring and "Think... n" count the wait down (from the examiner's clip while it plays, else the timer);
         item 8: the count waits while the tab is hidden */
      var ring = el.querySelector('.thinkRing'), ringTxt = el.querySelector('.thinkTxt'), hearB = el.querySelector('[data-hear]'), total = wakeS * 1000, spent = 0, woke = false, voiced = false;
      var wake = function () { if (woke) return; woke = true; clearInterval(ringT); if (ring) { ring.style.setProperty('--p', 100); ring.querySelector('b').textContent = '0'; } if (ringTxt) ringTxt.textContent = 'Say it now.'; if (hearB && !hearB.dataset.used) hearB.hidden = false; Array.prototype.forEach.call(el.querySelectorAll('[data-s]'), function (b) { b.disabled = false; }); try { el.querySelector('[data-s="1"]').focus({ preventScroll: true }); } catch (e) {} };
      var ringT = pre ? null : setInterval(function () {
        if (ring && !document.body.contains(ring)) { clearInterval(ringT); return; } if (document.hidden || woke) return; spent += 250;
        var left = Math.max(0, Math.ceil((total - spent) / 1000)); if (ring) { ring.style.setProperty('--p', Math.min(100, Math.round(spent / total * 100))); ring.querySelector('b').textContent = left; } if (ringTxt) ringTxt.textContent = 'Think... ' + left;
        if (spent >= total && !voiced) wake();
      }, 250);
      if (pre) { var tw = el.querySelector('.thinkWrap'); if (tw) tw.hidden = true; }
      if (!pre) speak(q.question, q.id, asker, function (e) { voiced = true; if (e && e.duration) { total = Math.max(total, e.duration * 1000 + 400); spent = 0; } }).then(function (spoke) { if (spoke) wake(); else voiced = false; });
      /* item 38: the examiner repeats the question once, as an examiner would if asked */
      if (hearB) hearB.addEventListener('click', function () { hearB.dataset.used = '1'; hearB.hidden = true; speak(q.question, q.id, asker); });
      /* FD4-01: in family mode a held or repeated key never answers: after Said it the focus goes to the answers as a group
         (not the first answer), a key repeat is ignored, and no answer counts in the first 1.5 s after they appear */
      var famH = !!SET().family, optsAt = 0;
      /* ND2: in family mode a key never answers in the Hall: an answer, and Said it (it opens the answers and starts a hard
         viva's clock), count only from a tap or a click. A key's click is trusted and has no click count (detail 0); the
         game's own scripted clicks (the autopilot) are not trusted and are not keys. */
      var byKey = function (e) { return famH && !!e && e.isTrusted && !e.detail; };
      if (famH) el.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.repeat && !el.querySelector('.opts').hidden) { e.preventDefault(); e.stopPropagation(); } }, true);
      Array.prototype.forEach.call(el.querySelectorAll('[data-s]'), function (b) {
        b.addEventListener('click', function (e) {
          if (byKey(e)) return;
          sure = b.getAttribute('data-s') === '1';
          el.querySelector('.think').hidden = true; var og = el.querySelector('.opts'); og.hidden = false; optsAt = performance.now();
          if (famH) { og.tabIndex = -1; try { og.focus({ preventScroll: true }); } catch (e) {} }
          else try { el.querySelector('.opt').focus({ preventScroll: true }); } catch (e) {}
          if (SET().hardViva) { var tm = el.querySelector('.timer'); tm.hidden = false; tm.querySelector('i').style.animationDuration = '45s'; clock = setTimeout(function () { answer(-1); }, 45000); }
        });
      });
      var answer = function (i, replay) {
        if (answered || (sure === null && !replay)) return; answered = true; clearTimeout(clock);
        if (window.Family) Family.dockSleep(false);
        var right = i === q.answer_index;
        Array.prototype.forEach.call(el.querySelectorAll('.opt'), function (b) { b.disabled = true; if (+b.getAttribute('data-i') === q.answer_index) { b.classList.add('right'); b.insertAdjacentHTML('beforeend', '<span class="mark">STRONG</span>'); } });
        if (i >= 0 && !right) { var mine = el.querySelector('.opt[data-i="' + i + '"]'); mine.classList.add('wrong'); mine.insertAdjacentHTML('beforeend', '<span class="mark">YOURS</span>'); }
        var out = [], fx = null;
        if (replay) {
          out.push('<div class="verdict ' + (right ? 'r' : 'w') + '">' + (right ? 'No heart lost.' : 'Answered before you left: ' + (killer ? 'two hearts' : 'one heart') + ' lost.') + '</div>');
        } else if (right) {
          if (window.SFX) SFX.right();
          stagePose(asker, 'nod'); out.push('<div class="verdict r">No heart lost. ' + esc(failLine(L.right[asker] || ['Good.'], q)) + '</div>');
          run.streak += killer ? 2 : 1;
          if (run.streak >= FIN().health.recovery.streak && !run.recovered && run.hearts < run.max) {
            run.hearts = Math.min(run.max, run.hearts + 1); run.recovered = true; run.streak = 0;
            if (window.SFX) SFX.chime(); fx = '<div class="answer"><b class="aTitle">A heart comes back</b>' + esc(pick(L.recovery.lines)) + '</div>';
            if (window.Family && Family.job) Family.job('heart');
          }
        } else {
          var dmg = killer ? 2 : 1; run.hearts = Math.max(0, run.hearts - dmg); run.streak = 0; run.lost = true;
          run.wrong.push(q.id);
          if (window.SFX) SFX.hit(killer); shake(killer); if (window.Kit) Kit.sfx('SFX-HEART-LOST');
          stagePose(asker, 'write'); out.push('<div class="verdict w">' + (killer ? 'Two hearts lost. ' : 'One heart lost. ') + esc(failLine(L.wrong[asker] || ['Hmm.'], q)) + '</div>');
          var head = i === -1 ? 'Out of time' : killer ? 'A two-heart question, and it landed' : 'That one landed';
          /* never the heading again as the line */
          var injury = (killer ? L.injury.minus_two : L.injury.minus_one).lines.filter(function (l) { return !/killer/i.test(l) && l.replace(/[.\s]+$/, '').toLowerCase() !== head.toLowerCase(); });
          fx = '<div class="answer"><b class="aTitle">' + head + '</b>' + esc(failLine(injury.length ? injury : ['Breathe.'], q)) + '</div>';
          if (run.hearts === 1) {
            if (window.Kit) Kit.hallLast(true);
            fx += '<div class="answer"><b class="aTitle">Last heart</b>' + esc(pick(L.injury.last_heart.lines)) + '</div>';
            if (SET().family) { if (window.Sound) { Sound.sfx('clock chime'); setTimeout(function () { Sound.sfx('thud'); }, 700); } } /* round 3: 'thud' sits within 6 dB of the Hall bed; 'book thump' was 6.9 dB over */
            else if (window.SFX) { SFX.heartbeat(); setTimeout(SFX.heartbeat, 1100); }
          }
          if (SET().family && window.Family) Family.react('killer');
        }
        run.answeredN = (run.answeredN || 0) + (replay ? 0 : 1);
        if (!replay && commit) commit({ right: right, sure: sure, killer: killer, i: i });
        heartsHTML();
        UI.announce(right ? 'Right. ' + run.hearts + ' hearts.' : 'Wrong. ' + run.hearts + ' hearts left.');
        var label = L.what_they_wanted_label || 'What they were after:';
        /* QAD3-m2: after a wrong answer the whole strong answer is open: the lesson behind the lost heart */
        out.push(UI.skimHTML(label, q.options[q.answer_index], null, !right));
        var src = cleanSource(q.source), place = FCV.teachPlace(q.source);
        if (place) out.push('<div class="chipRow"><span class="loc">Revise at: ' + esc(place.label) + '</span></div>');
        if (q.why) out.push('<details class="more"><summary>More</summary><div class="answer">' + esc(q.why) + (src ? '<div class="loc">Where: ' + esc(src) + '</div>' : '') + heldDiv(q.source) + '</div></details>');
        if (fx) out.push(fx);
        var p = run.hearts > 0 ? pressure(!right) : null;
        if (p) out.push('<div class="say">' + esc(FCV.nameOf(p.who)) + ': ' + esc(p.line) + '</div>');
        el.querySelector('.fb').innerHTML = out.join('') + nextBtn(run.hearts <= 0 ? 'Hear the verdict' : 'Next');
        resolve({ right: right, sure: sure, killer: killer });
      };
      Array.prototype.forEach.call(el.querySelectorAll('.opt'), function (b) { b.addEventListener('click', function (e) { if (famH && (performance.now() - optsAt < 1500 || byKey(e))) return; answer(+b.getAttribute('data-i')); }); });
      if (pre) { sure = !!pre.sure; el.querySelector('.think').hidden = true; el.querySelector('.opts').hidden = false; answer(pre.i, true); }
    }).then(function (res) { if (res.quit) return res; return waitBtn().then(function () { return res; }); });
  }
  /* Follow-ups: spoken, self-rated, never scored. */
  function sayFollow(asker, text, parent) {
    var press = FIN().lines.pressure.filter(function (p) { return /press you/i.test(p.line) && p.who === asker; })[0];
    show(panel(asker) + '<div class="vivaCard"><div class="killerTag follow">Follow-up</div>' + (press ? '<div class="say">' + esc(FCV.nameOf(asker)) + ': ' + esc(press.line) + '</div>' : '') + '<div class="who">' + esc(FCV.nameOf(asker)) + '</div><div class="q">' + esc(text) + '</div>' +
      '<div class="dir">Answer it aloud. Follow-ups cost no hearts.</div>' +
      '<div class="rate"><button class="btn go" type="button" data-f="1">Answered it well</button><button class="btn" type="button" data-f="0">I struggled</button></div><div class="fb"></div></div>');
    var el = $('vivaInner');
    if (SET().examinerVoice !== false && window.Sound && parent && parent.id) Sound.voice(parent.id + '.follow_up', { speaker: asker, inHall: true, text: text });
    return new Promise(function (res) {
      run._abort = function () { res(); };
      Array.prototype.forEach.call(el.querySelectorAll('[data-f]'), function (b) {
        b.addEventListener('click', function (e) {
          /* ND6: in family mode the self-rating is a tap or a click (I struggled writes to the record) */
          if (SET().family && UI.keyClick && UI.keyClick(e)) return;
          var ok = b.getAttribute('data-f') === '1';
          Array.prototype.forEach.call(el.querySelectorAll('[data-f]'), function (x) { x.disabled = true; });
          if (!ok) { ST().struggled.push({ text: text, parent: parent.id, at: Date.now() }); FCV.memRecord(ST(), 'bank:' + parent.id, 'wrong', false); Game.save(); if (window.Notebook && Notebook.note) Notebook.note('I struggled'); }
          /* the answer to the question it follows, and the cards linked to it (no internal grading words) */
          /* the parent question's own cards: card ids named in its source first, then linked cards from the same sections */
          var srcParts = String(parent.source || '').split(/;\s*/), secs = srcParts.filter(function (x) { return /^[A-O]?\.?\d+(\.\d+)*$/.test(x.trim()); });
          var own = srcParts.map(function (x) { return x.trim(); }).filter(function (x) { var r = FCV.resolve(x); return r && r.type === 'card'; }).map(function (x) { return { id: x }; });
          var near = window.Mastery && Mastery.registry ? Mastery.registry().filter(function (x) { var r = FCV.resolve(x.id); return (x.bank_links || []).indexOf(parent.id) >= 0 && r && r.type === 'card' && secs.some(function (sc) { return String(r.loc || '').indexOf(sc) >= 0; }); }) : [];
          var linked = own.concat(near.filter(function (x) { return !own.some(function (o) { return o.id === x.id; }); })).slice(0, 2);
          el.querySelector('.fb').innerHTML = UI.skimHTML('A follow-up has no model answer of its own. The answer to the question it follows:', parent.options[parent.answer_index], cleanSource(parent.source), false) +
            (linked.length ? '<div style="display:grid;gap:8px">' + linked.map(function (x) { return UI.cardHTML(x.id, { compact: true, noMet: true }); }).join('') + '</div>' : '') +
            (FCV.teachPlace(parent.source) ? '<div class="chipRow"><span class="loc">Revise at: ' + esc(FCV.teachPlace(parent.source).label) + '</span></div>' : '') + nextBtn();
          if (!ok && run && !run.mock) V.pause(run.pos + 1);
          waitBtn().then(res);
        });
      });
      try { el.querySelector('[data-f="1"]').focus({ preventScroll: true }); } catch (e) {}
    });
  }
  async function cut(shots) { $('viva').classList.add('hidden'); await UI.cutscene(shots); $('viva').classList.remove('hidden'); UI.letterbox(); }

  /* The engine shared by the boss and the dress rehearsal. cfg: {items, hearts, mock, title, resume} */
  V.engine = async function (cfg) {
    if (window.Kit && Kit.dropRadio) Kit.dropRadio(); /* AUDR3-04: a radio link never plays under this */
    var fin = FIN(), st = ST();
    stageSetup();
    $('viva').classList.remove('hidden', 'last'); UI.letterbox();
    var rs = cfg.resume || {};
    run = { items: cfg.items, max: cfg.hearts, hearts: rs.hearts !== undefined ? rs.hearts : cfg.hearts, streak: rs.streak || 0, recovered: !!rs.recovered, pos: rs.pos || 0,
      wrong: rs.wrong || [], fu: rs.fu || 0, lost: !!rs.lost, mock: !!cfg.mock, title: cfg.title || '', attempt: cfg.attempt || st.viva.attempt, quit: false, sincePressure: 0, nextPressureAt: 3, lastPressureWho: null,
      answeredN: rs.answeredN !== undefined ? rs.answeredN : (rs.pos || 0), answered: null };
    var preAns = rs.answered || null;
    heartsHTML(); meta();
    $('vivaQuit').textContent = cfg.mock ? 'Leave the rehearsal' : 'Walk out'; $('vivaQuit').hidden = false;
    for (; run.pos < run.items.length && run.hearts > 0 && !run.quit; run.pos++) {
      var q = run.items[run.pos], fixed = fin.v3 && fin.v3.askers_fixed_at_build, asker = q.asker || (fixed && fixed[q.id]) || clipAsker(q) || fin.examiners[run.pos % 2].id; /* AUDR4-10: a dress rehearsal item names the examiner who recorded it; AUDR4-12: a question recorded later is asked by the examiner who recorded it */
      if (run.pos === 10 && run.items.length > 10 && !cfg.mock) {
        /* AUD-06: the break is two shots, each examiner in their own voice */
        await cut(fin.lines.midpoint_break.lines.map(function (l) { return { visual: { asset: 'S16', move: 'light drops' }, subtitle: l.line, speaker: l.who, ms: 3000 }; }));
      }
      if (q._k) { q._cue = cueFor(asker); q._cueFor = asker; await cut([{ visual: { asset: 'S17', move: 'hold' }, subtitle: q._cue, ms: 1500, sound: 'hit' }]); }
      if (!cfg.mock && run.pos === 0 && !rs.counted) { ST().viva.attempt++; run.attempt = ST().viva.attempt; rs.counted = true; }
      var pre = preAns && preAns.id === q.id ? preAns : null; preAns = null;
      if (!cfg.mock && !pre) V.pause();
      /* The answer is recorded the moment it is chosen, before the verdict shows, so a closed tab cannot undo a miss. */
      var commit = function (a) {
        if (cfg.mock) { if (q.mem) Flows.record(q.mem, a.right ? 'right' : 'wrong', a.sure); }
        else { FCV.markSeen(ST().viva, q, a.right, run.attempt); Flows.record('bank:' + q.id, a.right ? 'right' : 'wrong', a.sure); run.answered = { id: q.id, right: a.right, sure: a.sure, i: a.i }; V.pause(); Game.flush(); }
      };
      var res = await ask(q, asker, null, pre, commit);
      run.answered = null;
      if (run.quit || res.quit) break;
      if (pre) res = { right: pre.right, sure: pre.sure, killer: !!q._k };
      if (run.hearts <= 0) break;
      if (!cfg.mock && (res.right || res.killer) && run.fu < 5 && q.follow_up) {
        run.fu++; await sayFollow(asker, typeof q.follow_up === 'string' ? q.follow_up : pick(fin.follow_ups.frames), q);
      }
      if (!cfg.mock) V.pause(run.pos + 1);
    }
    var out = { hearts: run.hearts, wrong: run.wrong.slice(), quit: run.quit, asked: run.answeredN };
    if (cfg.mock) { $('viva').classList.add('hidden'); UI.letterbox(); if (!run.quit && run.hearts <= 0) out.hearts = 0; return out; }
    return out;
  };
  /* Store the paused attempt: same draw, position, hearts and streak. */
  V.pause = function (pos) {
    var st = ST(); if (!run || run.mock) return;
    st.viva.paused = { draw: run.items.map(function (q) { return q.id; }), pos: pos === undefined ? run.pos : pos, hearts: run.hearts, streak: run.streak, recovered: run.recovered,
      wrong: run.wrong, fu: run.fu, lost: run.lost, attempt: run.attempt, counted: true, at: Date.now(), answered: run.answered || null, answeredN: run.answeredN || 0 };
    Game.save();
  };

  V.start = async function (resume) {
    var r = await startOnce(resume);
    while (r === 'again') { var st0 = ST(); await Game.snapshot('Before the viva, attempt ' + ((st0.viva.attempt || 0) + 1)); r = await startOnce(false); }
    return r;
  };
  async function startOnce(resume) {
    if (window.Kit && Kit.dropRadio) Kit.dropRadio(); /* AUDR3-04: a radio link never plays under this */
    var st = ST(), fin = FIN();
    if (!resume && window.Flows && Flows.clockOffer) await Flows.clockOffer('viva');
    if (!FCV.bank.items.length) { await UI.modal('The question bank is missing', '<p>The viva questions file did not load.</p>', [{ label: 'Back to the city', value: 1, cls: 'go' }]); return; }
    var items, rsm = null;
    if (resume && st.viva.paused) {
      var p = st.viva.paused; items = p.draw.map(function (id) { return FCV.bankItem(id); }).filter(Boolean);
      rsm = { pos: p.pos, hearts: p.hearts, streak: p.streak, recovered: p.recovered, wrong: p.wrong, fu: p.fu, lost: p.lost, counted: true, answered: p.answered || null, answeredN: p.answeredN };
    } else {
      var first = (st.viva.attempt || 0) === 0;
      if (first) {
        var chain = await UI.modal('Before the doors', '<p>Play the chain first: the five links, word for word?</p>', [{ label: 'Play the chain', value: 1, cls: 'go' }, { label: 'Go straight in', value: 0 }]);
        if (chain) await Flows.theChain();
        await UI.cutscene([{ visual: { asset: 'V12' }, subtitle: '', ms: 6000, music: 'CM-HALL' }].concat(fin.pre_viva_cutscene));
      } else await UI.cutscene([{ visual: { asset: 'V12' }, subtitle: '', ms: 6000, music: 'CM-HALL' }, { visual: { asset: 'V05' }, subtitle: 'Attempt ' + (st.viva.attempt + 1) + '.', ms: 6000 }]);
      stageSetup();
      $('viva').classList.remove('hidden'); UI.letterbox();
      run = { items: [], max: 5, hearts: 5, pos: 0, mock: false, attempt: st.viva.attempt + 1 };
      heartsHTML(); $('vivaMeta').textContent = '';
      var ritual = first ? fin.opening_ritual : fin.repeat_ritual;
      for (var r = 0; r < ritual.length; r++) {
        var l = ritual[r];
        if (l.format === 'say_then_reveal') await sayAloudHere(ritual[r - 1] ? ritual[r - 1].who : 'dr_tally', 'The thesis, in a sentence. Say it aloud.', l.fact);
        else await say(l.who, l.line, l.fact, l.direction);
        if (run.quit) return;
      }
      var lent = {}; FCV.data.script.acts.forEach(function (a) { if (a.rehearsal_borrowed) lent[String(a.rehearsal_borrowed.ref).replace('bank:', '')] = 1; });
      items = FCV.drawViva(FCV.bank, st.viva, null, lent);
    }
    var res = await V.engine({ items: items, hearts: fin.health.hearts, resume: rsm, attempt: st.viva.attempt });
    if (res.quit) return;
    return V.finish(res);
  }

  V.finish = async function (res) {
    var st = ST(), fin = FIN();
    var ending = FCV.vivaEnding(res.hearts);
    st.viva.paused = null;
    st.viva.results.push({ attempt: run.attempt, ending: ending, hearts: res.hearts, asked: res.asked, wrong: res.wrong.length, at: Date.now(), met: Object.keys(st.viva.seen).length });
    if (st.viva.best === null || RANK[ending] > RANK[st.viva.best]) st.viva.best = ending;
    if (ending === 'fail') st.viva.fails = (st.viva.fails || 0) + 1;
    Game.save();
    $('viva').classList.add('hidden'); UI.letterbox();
    /* AUDR4-01: the Hall's own line stops here, before the ending film's first line starts (which then plays in full) */
    if (window.Kit) { if (Kit.leftHall) Kit.leftHall(); Kit.hallLast(false); Kit.sting(ending === 'fail' ? 'MUS-STING-NOTAWARDED' : 'MUS-STING-AWARDED'); }
    if (ending === 'fail') {
      if (window.SFX) SFX.failed();
      var n = st.viva.fails;
      if (n === 1) { var na = Director.shotsFor('not_awarded_v3'); if (na) await Director.play(na.map(function (s, i) { return i === 0 ? Object.assign({ title: 'NOT AWARDED' }, s) : s; }), { id: 'not_awarded_v3', full: true, finale: true }); else await UI.cutscene(fin.fail.cutscene.map(function (s, i) { return i === 0 ? Object.assign({ title: 'NOT AWARDED' }, s) : s; })); }
      else if (n % 5 === 0) await UI.cutscene([{ visual: { asset: 'S18' }, title: 'NOT AWARDED', ms: 2500 }, { visual: { asset: 'V14' }, subtitle: 'Attempt ' + run.attempt + '.', ms: 6000 }]);
      else await UI.cutscene([{ visual: { asset: 'S18' }, title: 'NOT AWARDED', subtitle: FCV.nameOf(fin.fail.lines[n % 2].who) + ': ' + fin.fail.lines[n % 2].line, sayText: fin.fail.lines[n % 2].line, speaker: fin.fail.lines[n % 2].who, ms: 3000 }]);
      if (SET().family) await V.comfort(n);
    } else if (ending === 'major') {
      var mj = fin.endings.filter(function (e) { return e.id === 'major'; })[0], mf = Director.shotsFor('major_film');
      if (mf) await Director.play(mf, { id: 'major_film', full: true, finale: true }); else await UI.cutscene(mj.cutscene);
      await V.endRoll();
    } else {
      var hi = fin.endings.filter(function (e) { return e.id === 'pass_high'; })[0], pf = Director.shotsFor('pass_film');
      /* AUD-06: "Congratulations, Doctor." is its own shot (it is the recorded line); the corrections line follows it */
      if (pf) {
        var c0 = hi.cutscene[0] || {}, vt = c0.variant && c0.variant[ending], extra = vt && c0.subtitle ? String(vt).replace(/^['‘]|['’]$/g, '').replace(String(c0.subtitle).replace(/^['‘]|['’]$/g, ''), '').trim() : '';
        var pshots = [];
        pf.forEach(function (s, i) { var o = Object.assign({}, s); if (i === 0) { o.subtitle = c0.subtitle || o.subtitle; if (extra) o.dur_min = 3; } pshots.push(o); if (i === 0 && extra) pshots.push({ shot: (s.shot || 'W1') + 'b', visual: s.visual, subtitle: extra, speaker: s.speaker || 'dr_tally', dur_min: 3 }); });
        await Director.play(pshots, { id: 'pass_film', full: true, finale: true });
      }
      else await UI.cutscene(hi.cutscene.map(function (s) { return s.variant ? Object.assign({}, s, { subtitle: s.variant[ending] || s.subtitle }) : s; }));
      await V.endRoll();
      if (window.Family) { var ph = await UI.modal('The graduation photo', '<p>The courier, Docket and the cast, with the date and the result.' + (ST().settings.family ? ' The co-pilot presses the shutter.' : '') + '</p>', [{ label: 'Take the photo', value: 1, cls: 'go' }, { label: 'Not now', value: 0 }]); if (ph) await Family.photo(ending); }
    }
    st.cuts['ending:' + ending] = 1; Game.save();
    return V.debrief(ending, res);
  };
  /* Family mode after Not awarded: Docket climbs up beside the courier and the co-pilot can press Cheer up.
     The result copy stays as it is. From the second fail the beat lasts 2 s. */
  V.comfort = function (n) {
    /* Docket himself (the keyed cut-out, else his plain still), never the Animal's portrait. Copy from family_mode.boss_staging. */
    var u = (window.Family && Family.keyed && Family.keyed('GM-CH-02')) || FCV.assetUrl('GM-CH-01') || FCV.assetUrl('GM-CH-02');
    return new Promise(function (res) {
      var t = null, done = function () { clearTimeout(t); res(); };
      UI.modal('Docket is here', (u ? '<img alt="Docket the dog" src="' + u + '" style="width:100%;max-height:40vh;object-fit:contain;border-radius:10px">' : '') + '<p>Docket climbs onto the courier\'s lap. Co-pilot, press Cheer up.</p>',
        [{ label: 'Cheer up', value: 1, cls: 'go' }], { copilotKey: 1 }).then(function () { if (window.Family) Family.react('stamp'); if (window.Sound) Sound.sfx("Docket's bark"); done(); });
      t = setTimeout(function () { var b = document.querySelector('#modalBox .btn.go'); if (b) b.click(); }, n >= 2 ? 2000 : 6000);
    });
  };
  V.endRoll = async function () {
    var fin = FIN(), shots = fin.end_cutscene.filter(function (s) { return s.visual.asset !== 'cast roll'; });
    var cast = FCV.data.script.characters.filter(function (c) { return c.id !== 'you'; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    shots.push({ visual: { asset: 'img-18' }, subtitle: 'Cast', cardHTML: '<div class="castRoll">' + cast.map(function (c) { return '<div><b>' + esc(c.name) + '</b> <small>' + esc(c.role || '') + '</small></div>'; }).join('') + '</div>', ms: 15000 });
    await UI.cutscene(shots);
  };
  V.debrief = async function (ending, res) {
    var st = ST();
    $('viva').classList.remove('hidden', 'last'); UI.letterbox();
    var wrong = res.wrong.map(function (id) { return FCV.bankItem(id); }).filter(Boolean);
    var drill = []; wrong.forEach(function (q) { FCV.drillFor(q.source, 4).forEach(function (id) { if (drill.indexOf(id) < 0) drill.push(id); }); });
    drill = drill.slice(0, 10);
    var room = wrong.map(function (q) { return FCV.teachPlace(q.source); }).filter(Boolean)[0];
    /* item 23: the endings in words, each with its own shape */
    var stamps = st.viva.results.map(function (r) { return '<span class="rstamp ' + r.ending + '" title="Attempt ' + r.attempt + '">' + ({ fail: '&#10005; Not awarded', major: '&#9650; Major', minor: '&#9679; Minor', none: '&#9733; No corrections' }[r.ending]) + '</span>'; }).join('');
    var html = '<div class="vivaCard' + (ending === 'fail' ? ' killer' : '') + '"><div class="sheetTitle" style="color:var(--ink)">' + esc(TITLES[ending]) + '</div>' +
      '<div>Attempt ' + run.attempt + '. Hearts left: ' + res.hearts + ' of 5. Questions asked: ' + res.asked + '. Best so far: ' + esc(TITLES[st.viva.best]) + '.</div>' +
      '<div class="stampRow" aria-label="Attempt history">' + stamps + '</div>' +
      (ending === 'fail' ? FIN().fail.lines.map(function (l) { return '<div class="say">' + esc(FCV.nameOf(l.who)) + ': ' + esc(l.line) + '</div>'; }).join('') : '') +
      (wrong.length ? '<div class="answer"><b class="aTitle">Every heart you lost</b>' + wrong.map(function (q) {
        return '<details><summary>' + esc(q.question) + '</summary><div><b>What they were after:</b> ' + esc(q.options[q.answer_index]) + '</div><div>' + esc(q.why) + '</div><div class="loc">' + esc(cleanSource(q.source)) + '</div>' + heldDiv(q.source) + '</details>';
      }).join('') + '</div>' : '') +
      '<div class="actions">' + (drill.length ? '<button class="btn" type="button" id="vDrill">Drill these now (' + drill.length + ')</button>' : '') +
      (room ? '<button class="btn" type="button" id="vRoom">Go to ' + esc(room.label) + '</button>' : '') +
      '<button class="btn" type="button" id="vCity">Back to the city</button><button class="btn go" type="button" id="vAgain">Try again (fresh draw)</button></div></div>';
    show(html);
    /* SD-19: after the verdict there is nothing to walk out of; the buttons below are the ways on */
    $('hearts').innerHTML = ''; $('vivaMeta').textContent = 'Attempts so far: ' + st.viva.attempt; $('vivaQuit').hidden = true;
    return new Promise(function (res2) {
      var close = function () { $('vivaQuit').hidden = false; $('viva').classList.add('hidden'); UI.letterbox(); Game.afterUI(); Game.refresh(); res2(); };
      $('vCity').addEventListener('click', close);
      /* QAD4-m3: Try again ends this debrief with 'again'; V.start then begins the fresh draw inside the same flow
         (Game.isBusy() stays true, the flow's end-of-flow work runs at the end) */
      var again = function () { $('vivaQuit').hidden = false; $('viva').classList.add('hidden'); UI.letterbox(); res2('again'); };
      /* FD4-01: in family mode Try again needs the one-second hold, and Back to the city has the focus */
      var fam = !!(st.settings && st.settings.family);
      if (fam) { $('vAgain').classList.add('holdBtn'); $('vAgain').textContent = 'Hold to try again (fresh draw)'; UI.holdButton($('vAgain'), again); }
      else $('vAgain').addEventListener('click', again);
      if ($('vDrill')) $('vDrill').addEventListener('click', async function () { $('vivaQuit').hidden = false; $('viva').classList.add('hidden'); UI.letterbox(); await Flows.reviewRun(drill, 'Drill these now', 'Chapter and appendix items with the same sections', 'dr_tally'); close(); });
      if ($('vRoom')) $('vRoom').addEventListener('click', function () { close(); Game.travelTo(room); });
      try { (fam ? $('vCity') : $('vAgain')).focus(); } catch (e) {}
    });
  };
  /* Walking out: free before a heart is lost; after one it counts as Not awarded. */
  V.walkOut = async function (fromMap) {
    var st = ST(), p = st.viva.paused, lost = run ? run.lost : p && p.lost;
    var sc = FCV.data.script.session_copy.restart_viva;
    var v = await UI.modal(fromMap ? sc.title : 'Walk out of the viva?', '<p>' + esc(lost ? sc.body_counts : sc.body_free) + '</p>', [{ label: sc.no, value: 0, cls: 'go' }, { label: fromMap ? sc.yes : 'Walk out', value: 1, hold: true }]);
    if (!v) return false;
    if (run && !run.mock) { run.quit = true; if (run._abort) run._abort(); }
    if (lost) {
      st.viva.results.push({ attempt: (p && p.attempt) || st.viva.attempt, ending: 'fail', hearts: run ? run.hearts : p.hearts, asked: run ? run.answeredN || run.pos : p.answeredN || p.pos, wrong: (run ? run.wrong : p.wrong).length, at: Date.now(), walkedOut: true });
      st.viva.fails = (st.viva.fails || 0) + 1; if (st.viva.best === null) st.viva.best = 'fail';
    } else if (p && p.counted) { st.viva.attempt = Math.max(0, st.viva.attempt - 1); }
    st.viva.paused = null; Game.save();
    $('viva').classList.add('hidden'); UI.letterbox(); if (window.Kit && Kit.leftHall) Kit.leftHall(); Game.afterUI(); Game.refresh();
    var n = $('vNext'); if (n) n.click();
    return true;
  };
  $('vivaQuit').addEventListener('click', function () {
    if (run && run.mock) { run.quit = true; if (run._abort) run._abort(); $('viva').classList.add('hidden'); UI.letterbox(); var n = $('vNext'); if (n) n.click(); return; }
    V.walkOut(false);
  });
  document.addEventListener('keydown', function (e) {
    if ($('viva').classList.contains('hidden') || !$('modal').classList.contains('hidden') || !$('cut').classList.contains('hidden')) return;
    /* ND2: the number keys answer only out of family mode (in family mode an answer is a tap or a click) */
    if (/^[1-6]$/.test(e.key) && !SET().family) { var b = $('vivaInner').querySelectorAll('.opt:not([disabled])')[+e.key - 1]; if (b && !b.closest('[hidden]')) { e.preventDefault(); b.click(); } }
  });
  V.readiness = function () {
    var st = ST(), spine = [];
    FCV.data.script.spine.chain.forEach(function (c) { spine = spine.concat([c.claim], c.evidence, c.objection); });
    spine = spine.map(function (x) { return x.indexOf('bank:') === 0 || /-eq\d|-q\d/.test(x) ? x : 'recall:' + x; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
    var strong = spine.filter(function (id) { return st.mem[id] && st.mem[id].box >= 3; }).length;
    var weak = FCV.weakest(st, 3).map(function (id) { var p = Flows.placeOf(id); return p ? p.label : id; });
    return 'Spine ' + strong + '/' + spine.length + ', due ' + FCV.dueList(st).length + (weak.length ? ', weakest three: ' + weak.join('; ') : '') + '.';
  };

  /* SD-34: while the Hall's page has more below the fold, a fade says so */
  (function moreBelow() {
    var stage = document.querySelector('#viva .vivaStage'); if (!stage) return;
    var tag = document.createElement('div'); tag.className = 'moreBelow'; tag.hidden = true; tag.textContent = 'More answers below'; $('viva').appendChild(tag);
    var check = function () { var more = stage.scrollHeight - stage.scrollTop - stage.clientHeight > 24; tag.hidden = !more || $('viva').classList.contains('hidden'); };
    stage.addEventListener('scroll', check, { passive: true });
    if (window.MutationObserver) new MutationObserver(function () { setTimeout(check, 60); }).observe($('vivaInner'), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    window.addEventListener('resize', check);
  })();
  window.Viva = V;
})();
