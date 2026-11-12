/* Freight City Viva v3: the Methods Academy. Every lesson in methods_academy.lessons, from methods_facts.json by id, in its order: Watch (the explainer
   clip, then a GSAP motion diagram whose captions are the brief by reference and whose numbers come from the bound cards),
   Plain, How (one step at a time), Why and Not this (say then reveal), the analogy, probes, viva questions, the gap card.
   No words are written here: every shown string is a field or a card by id. A lesson is a save point after every step. */
(function () {
  'use strict';
  var A = {}, $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return UI.esc(s); };
  var S = function () { return Game.state; };
  var SC = function () { return FCV.data.script; };
  var isLeave = function (e) { return e && e.leave; };
  var GSAP = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.15.0/gsap.min.js', GSAP_SRI = 'sha512-oJ8QbaQThQoJZ7oEv+29jfPM6CcP+zUxh3PKJs1vyOhx0UraUrE7PQgeItu3dOuCJyrzWpoYMsVjkkPEBzbUqw==', gsapP = null;
  function loadGsap() {
    if (window.gsap) return Promise.resolve(window.gsap);
    if (!gsapP) gsapP = new Promise(function (res) { var s = document.createElement('script'); s.src = GSAP; s.integrity = GSAP_SRI; s.crossOrigin = 'anonymous'; s.onload = function () { res(window.gsap || null); }; s.onerror = function () { res(null); }; document.head.appendChild(s); });
    return gsapP;
  }
  function lessons() { return SC().methods_academy.lessons.slice().sort(function (a, b) { return a.order - b.order; }); }
  function L(id) { return lessons().filter(function (x) { return x.id === id || x.id === 'method:' + id; })[0]; }
  A.lessonOpen = function () { return true; }; /* never locks: core lessons also play on the main path */
  A.nextLesson = function () {
    var st = S(), list = lessons().filter(function (l) { return !(st.methods.lessons[l.id] || {}).done; });
    list.sort(function (a, b) { return (b.core ? 1 : 0) - (a.core ? 1 : 0) || a.order - b.order; });
    var l = list[0]; if (!l) return null; var m = FCV.methodById(l.id); return { id: l.id, term: m ? m.term : l.id };
  };

  /* ---------------- the Academy menu: unseen core lessons first, then by bank demand ---------------- */
  A.open = async function () {
    var st = S();
    if (!st.cuts['film:academy_entrance']) await Director.film('academy_entrance');
    if (window.Sound) Sound.music('CM-ACADEMY');
    /* AUDR2-05: while the Academy is open, music back on plays its theme */
    inAcademy = true; if (window.Kit && Kit.screenTheme) Kit.screenTheme('CM-ACADEMY', function () { return inAcademy; });
    /* SD-14: no asset codes in the subtitle */
    var where = 'How every part of the thesis was done, and why it was done that way.';
    UI.open(SC().methods_academy.name, where, FCV.assetUrl('LS02') ? 'LS02' : 'S11');
    try {
      for (;;) {
        var v = await hub(st);
        if (v === 'leave') break;
        UI.close();
        if (/^mission:/.test(v)) await Missions.methodsMission(v.slice(8), !!(st.methods.missions[v.slice(8)] || {}).done);
        else await A.lesson(v);
        UI.open(SC().methods_academy.name, where, FCV.assetUrl('LS02') ? 'LS02' : 'S11');
      }
    } catch (e) { if (!isLeave(e)) { inAcademy = false; throw e; } }
    inAcademy = false; if (window.Kit && Kit.screenTheme) Kit.screenTheme(null);
    UI.close(); Game.refresh();
  };
  var inAcademy = false;
  /* SD-14: one big "Next lesson for you", then one folded group per act (its mission first), then the way out */
  function hub(st) {
    var nx = A.nextLesson(), missions = SC().methods_academy.missions, byAct = {};
    Object.keys(missions).forEach(function (k) { var mi = missions[k]; (byAct[mi.act] = byAct[mi.act] || { missions: [], lessons: [] }).missions.push({ key: k, mi: mi }); });
    lessons().forEach(function (l) { var a = l.act || 0; (byAct[a] = byAct[a] || { missions: [], lessons: [] }).lessons.push(l); });
    var row = function (value, label, sub, tag, done) { return '<button class="hubItem' + (done ? ' done' : '') + '" type="button" data-v="' + esc(value) + '"><span>' + esc(label) + (sub ? '<br><small>' + esc(sub) + '</small>' : '') + '</span><span class="tick">' + esc(tag) + '</span></button>'; };
    var groups = Object.keys(byAct).sort(function (a, b) { return (+a || 99) - (+b || 99); }).map(function (a) {
      var g = byAct[a], done = 0, total = g.lessons.length;
      var rows = g.missions.map(function (x) { var m = st.methods.missions[x.key] || {}; return row('mission:' + x.key, 'Mission: ' + x.mi.name, 'Uses what this act teaches', m.stamp ? m.stamp.toUpperCase() : m.done ? 'DONE' : 'GO', !!m.done); }).join('') +
        g.lessons.map(function (l) { var m = FCV.methodById(l.id), ls = st.methods.lessons[l.id] || {}; if (ls.done) done++; return row(l.id, m ? m.term : l.id, (l.core ? 'Core. ' : '') + (m ? FCV.firstSentence(m.plain) : ''), ls.done ? 'AGAIN' : ls.step ? 'RESUME' : l.explainer ? 'WATCH' : 'GO', !!ls.done); }).join('');
      var name = +a ? 'Act ' + a + ': ' + SC().acts[+a - 1].district.name : 'More lessons';
      return '<details class="acGroup"><summary>' + esc(name) + ' <small>' + done + ' of ' + total + (total === 1 ? ' lesson' : ' lessons') + ' done</small></summary><div class="hubList">' + rows + '</div></details>';
    }).join('');
    var html = '<div class="line">Pick a lesson. Each one shows you, says it plainly, then how and why.</div>' +
      (nx ? '<button class="btn go big acNext" type="button" data-v="' + esc(nx.id) + '">Next lesson for you: ' + esc(nx.term) + '</button>' : '<p class="small">Every lesson is done. Play any of them again below.</p>') +
      groups + '<div class="hubList">' + row('leave', 'Back to the city', 'Your place is kept', 'EXIT') + '</div>';
    document.getElementById('sheetLeave').classList.add('hidden');
    return UI.custom('sam', html, function (done, el) {
      Array.prototype.forEach.call(el.querySelectorAll('[data-v]'), function (b) { b.addEventListener('click', function () { document.getElementById('sheetLeave').classList.remove('hidden'); done(b.getAttribute('data-v')); }); });
    });
  }
  /* SD-23: before a Methods mission, "Teach me first" plays only the plain meaning and one example (the analogy, else the
     first "how" step). Nothing is marked done; the full lesson stays in the Academy. */
  A.brief = async function (id) {
    var les = L(id); if (!les) return { done: true };
    var m = FCV.methodById(les.id); if (!m) return { done: true };
    var st = S();
    try {
      UI.open(m.term, 'Methods Academy · the short version', FCV.assetUrl('LS02') ? 'LS02' : 'S11', { leave: 'Pause and ride' });
      await UI.say(null, '', { fact: 'method:' + m.id, hint: 'Plain meaning' });
      if (m.analogy) await UI.say(null, m.analogy, { hint: 'An example', noVoice: !!(st.settings.family && /^(interviewer_effects|generalisation_to_mechanism|p_value)$/.test(m.id)) });
      else if (m.steps && m.steps.length) await UI.say(les.keeper || 'sam', m.steps[0], { hint: 'How it was done here' });
      UI.close(); st.met['method:' + m.id] = 1; Game.save();
      return { done: true };
    } catch (e) { UI.close(); if (!isLeave(e)) throw e; return { left: true }; }
  };

  /* ---------------- one lesson ---------------- */
  A.lesson = async function (id, replay) {
    var les = L(id); if (!les) return;
    var m = FCV.methodById(les.id); if (!m) return;
    var st = S(), ls = st.methods.lessons[les.id] || (st.methods.lessons[les.id] = { step: 0 });
    /* A lesson left part-way picks up at its step, even a replay of a lesson already done. A fresh replay starts at 1. */
    /* D2-M1: a record made by a Methods mission ({core:true}) or an old save may have no number step */
    if (typeof ls.step !== 'number' || !isFinite(ls.step) || ls.step < 0) ls.step = 0;
    if (ls.done && !(ls.step > 0)) ls.step = 0;
    var steps = [];
    if (les.explainer) steps.push('watch');
    steps.push('plain', 'how');
    if (m.why) steps.push('why'); if (m.notThis) steps.push('not');
    if (m.analogy) steps.push('analogy');
    if ((les.probes || []).length) steps.push('probes');
    if ((les.say_then_reveal || []).length) steps.push('viva');
    if (les.gap || FCV.methodGap(m.id)) steps.push('gap');
    var tally = { right: 0, wrong: 0 }, finished = false;
    /* QAD3-B1: the lesson's record is found in the live save at every write (a merge from another device replaces it) */
    var LS = function () { var mm = S().methods; mm.lessons = mm.lessons || {}; return mm.lessons[les.id] || (mm.lessons[les.id] = { step: 0 }); };
    var save = function (i) { ls = LS(); ls.step = i + 1; S().resume = { kind: 'lesson', key: 'lesson:' + les.id, at: Date.now() }; Game.save(); };
    if (ls.step > 0 && ls.step < steps.length) UI.toast('Back in: ' + m.term + ', step ' + (ls.step + 1) + ' of ' + steps.length + '.', 2500);
    var keeper = les.keeper || 'sam', loc = (m.raw.sections || []).join('; ');
    try {
      for (var i = Math.max(0, Math.min(+ls.step || 0, steps.length - 1)); i < steps.length; i++) {
        var s = steps[i];
        if (s === 'watch') { await A.explainer(les); save(i); continue; }
        UI.open(m.term, 'Methods Academy · ' + (i + 1) + ' of ' + steps.length, FCV.assetUrl('LS02') ? 'LS02' : 'S11');
        if (s === 'plain') {
          await UI.say(null, '', { fact: 'method:' + m.id, hint: 'Plain meaning' });
        } else if (s === 'how') {
          var cards = les.thesis_cards || [];
          for (var k = 0; k < m.steps.length; k++) await UI.say(keeper, m.steps[k], { extra: UI.HELD_RE && UI.HELD_RE.test(m.steps[k]) ? '<div class="held">Held by the author, available on request</div>' : '', fact: k === m.steps.length - 1 ? cards.filter(function (c) { var r = FCV.resolve(c); return r && r.type === 'card'; }).slice(0, 2) : null, hint: 'How it was done here: ' + (k + 1) + ' of ' + m.steps.length });
        } else if (s === 'why' || s === 'not') {
          /* AUDR3-07: the method is the card's heading and the prompt is one of two fixed lines, so one recording of each
             in Dr Tally's voice serves every lesson */
          var r = await UI.sayAloud('dr_tally', s === 'why' ? 'Why this one?' : 'Why not the alternative?', [{ title: s === 'why' ? 'Why' : 'Not this', text: s === 'why' ? m.why : m.notThis, loc: loc }], { wake: 3, cardHTML: '<div class="q">' + esc(m.term) + '</div>' });
          Flows.record('say:method:' + m.id, r === 'nailed' ? 'right' : r); tally[r === 'missed' ? 'wrong' : 'right']++;
        } else if (s === 'analogy') {
          /* three analogies lean on crime: shown as written, never read aloud next to a child */
          await UI.say(null, m.analogy, { hint: 'The analogy', noVoice: !!(st.settings.family && /^(interviewer_effects|generalisation_to_mechanism|p_value)$/.test(m.id)) });
        } else if (s === 'probes') {
          for (var p = 0; p < les.probes.length; p++) {
            var pr = les.probes[p], rr = FCV.resolve(pr.id); if (!rr) continue;
            if (pr.format === 'say_then_reveal' || rr.recallOnly) {
              var rt = await UI.sayAloud(keeper, rr.q, [{ title: 'The thesis says', text: FCV.revealText(rr), checkText: rr.options[rr.answer], loc: rr.loc }], { wake: 3 });
              Flows.record(pr.id, rt === 'nailed' ? 'right' : rt); tally[rt === 'missed' ? 'wrong' : 'right']++;
            } else { var ok = await UI.quiz(pr.id, { who: keeper }); Flows.record(pr.id, ok ? 'right' : 'wrong'); tally[ok ? 'right' : 'wrong']++; }
          }
        } else if (s === 'viva') {
          for (var v2 = 0; v2 < les.say_then_reveal.length; v2++) {
            var sv = les.say_then_reveal[v2], vr = FCV.resolve(sv.id); if (!vr) continue;
            var rv = await UI.sayAloud(sv.asker || 'dr_tally', vr.question, [{ title: 'Model answer', text: vr.answer, loc: vr.loc }], { wake: 3 });
            Flows.record(sv.id, rv === 'nailed' ? 'right' : rv); tally[rv === 'missed' ? 'wrong' : 'right']++;
          }
        } else if (s === 'gap') {
          var gid = 'method:' + m.id + ':gap', g = FCV.resolve(gid);
          if (g) { var rg = await UI.sayAloud('prof_kerbstone', g.gap, [{ title: 'Say it in the thesis\'s words', text: g.answer, loc: loc }], { wake: 3, cardHTML: '' }); Flows.record(gid, rg === 'nailed' ? 'right' : rg); }
        }
        UI.close(); save(i);
        if (i === steps.length - 1) finished = true;
      }
      if (!finished) return { left: true };
      ls = LS(); st = S(); ls.done = true; ls.doneAt = Date.now(); ls.step = 0; st.resume = null; st.met['method:' + m.id] = 1;
      MiniGame.giveStars('lesson:' + les.id, tally.wrong === 0 ? 3 : tally.wrong <= 1 ? 2 : 1);
      if (window.Album) { Album.xp(20, 'lesson'); Album.check(); }
      Game.flush();
      UI.toast('Lesson done: ' + m.term + '.', 2200);
      return { done: true };
    } catch (e) { UI.close(); if (!isLeave(e)) throw e; UI.toast('Saved at this step. The lesson picks up here next time.', 2600); return { left: true }; }
  };

  /* ---------------- explainers: the clip (mood only), then the motion diagram ---------------- */
  A.explainer = async function (les) {
    var key = les.explainer, m = FCV.methodById(les.id);
    if (key && FCV.isVideo(key)) await Director.play([{ visual: { asset: key }, dur_min: 6 }], { id: 'mx:' + key, full: true });
    var brief = m && m.raw.video_brief, beats = brief && brief.beats || [];
    if (!beats.length) return;
    await A.diagram({ id: les.id, beats: beats, cards: (les.thesis_cards || []).filter(function (c) { var r = FCV.resolve(c); return r && r.type === 'card'; }), template: template(les.id), voicePrefix: les.id + '.video_brief.beats' });
  };
  A.explainerById = async function (mxId) { var les = lessons().filter(function (l) { return l.explainer === mxId; })[0]; if (les) return A.explainer(les); };
  function template(id) {
    if (/search|prisma|systematic/.test(id)) return 'funnel';
    if (/two_readings|krippendorff|three_codings/.test(id)) return 'readers';
    if (/csqca|necessary|rule_1a/.test(id)) return 'grid';
    if (/permutation/.test(id)) return 'hump';
    if (/scenario/.test(id)) return 'dials';
    if (/chain/.test(id)) return 'tokens';
    if (/staged|retroduction|stratified|triangulation/.test(id)) return 'layers';
    return 'layers';
  }
  /* The SVG stage is 1600 x 900: shapes above y 560, every bound figure in full on a dark plate below them (wrapped, never cut),
     and a short label beside each beat's shape taken from that beat's own narration. Every number shown is read from the
     bound cards at run time (A.figuresCheck proves it). */
  var COLS = ['#ff8a3d', '#19c2b0', '#ffd166', '#ff3d8b', '#7a5cff', '#3ddc84'];
  function wrapText(str, maxChars) {
    var words = String(str).split(' '), lines = [], cur = '';
    words.forEach(function (w) {
      if (!cur) { cur = w; return; }
      if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w; else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    /* prefer to end a line after '→' or ';' when the next break is close */
    return lines;
  }
  function tspans(lines, x, fs) { return lines.map(function (l, i) { return '<tspan x="' + x + '" dy="' + (i ? Math.round(fs * 1.18) : 0) + '">' + esc(l) + '</tspan>'; }).join(''); }
  function plate(cls, x, y, w, str, opt) {
    opt = opt || {};
    var fs = opt.fs || 36, max = Math.max(10, Math.floor((w - 36) / (fs * 0.54))), lines = wrapText(str, max);
    while (lines.length > (opt.maxLines || 3) && fs > 24) { fs -= 4; max = Math.max(10, Math.floor((w - 36) / (fs * 0.54))); lines = wrapText(str, max); }
    var lh = Math.round(fs * 1.18), th = opt.title ? 34 : 0, h = lines.length * lh + 26 + th;
    return '<g class="' + cls + '" opacity="0"' + (opt.fig ? ' data-fig="' + esc(str) + '"' : '') + '><rect x="' + (x - w / 2) + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="14" fill="#241a35" stroke="' + (opt.stroke || '#ffd166') + '" stroke-width="4"/>' +
      (opt.title ? '<text x="' + x + '" y="' + (y + 32) + '" text-anchor="middle" font-size="24" font-family="Bangers, Impact" letter-spacing="1" fill="#ffd166">' + esc(opt.title) + '</text>' : '') +
      '<text x="' + x + '" y="' + (y + th + 13 + fs * 0.92) + '" text-anchor="middle" font-size="' + fs + '" font-weight="700" font-family="Atkinson Hyperlegible, Arial, sans-serif" fill="#fff3e0">' + tspans(lines, x, fs) + '</text></g>';
  }
  function beatLabel(b, i) {
    var t = String((b && b.narration) || '').replace(/\s+/g, ' ').trim(), first = t.split(/(?<=[.:;,?])\s/)[0].replace(/[.:;,]$/, '');
    /* a clause of one or two words ("Wall", "Net") says too little: take the label to the first full stop */
    if (first.split(' ').length <= 2) first = t.split(/(?<=[.?])\s/)[0].replace(/[.]$/, '');
    var words = first.split(' '); if (words.length > 10) first = words.slice(0, 8).join(' ') + ' …';
    return (i + 1) + '. ' + first;
  }
  var lastFigMap = [];
  function stageSVG(tpl, cards, beats) {
    var figs = cards.map(function (c) { var r = FCV.resolve(c); return r ? String(r.figure || '') : ''; }).filter(Boolean);
    var g = '', n = Math.max(1, beats.length), top = 30, zone = 520, rowH = Math.min(120, Math.floor(zone / n)), lastB = 'b' + (n - 1);
    /* a beat label is one line when rows are tight (cut at a word, with an ellipsis); labels are not figures */
    var lab = function (i, x, y, w, room) {
      /* two lines at a smaller size where a row has room for them; one line only in the tightest rows, cut at a word */
      var rm = room || rowH, fs = rm < 100 ? 22 : 28, max = Math.floor((w - 36) / (fs * 0.54)), one = rm < 80;
      var t = beatLabel(beats[i], i);
      if (!one && t.length > max * 2) { var c2 = t.slice(0, max * 2 - 2), sp2 = c2.lastIndexOf(' '); t = sp2 > 4 ? c2.slice(0, sp2).replace(/[ ,.;:]+$/, '') + ' …' : (i + 1) + '.'; }
      if (one && t.length > max) { var cut = t.slice(0, max - 2), sp = cut.lastIndexOf(' '); t = sp > 4 ? cut.slice(0, sp).replace(/[ ,.;:]+$/, '') + ' …' : (i + 1) + '.'; }
      return plate('b' + i, x, y, w, t, { fs: fs, maxLines: one ? 1 : 2, stroke: COLS[i % 6] });
    };
    /* where each figure appears: with its own beat in the stepwise templates, with the last beat in the others */
    /* a figure appears with the beat that first names one of its numbers; otherwise by template */
    var spoken = function (j) {
      var nums = (figs[j].match(/\d[\d,.]*\d/g) || []).filter(function (x) { return x.replace(/\D/g, '').length >= 3; });
      for (var bi = 0; bi < n; bi++) { var nar = String((beats[bi] || {}).narration || ''); if (nums.some(function (x) { return nar.indexOf(x) >= 0; })) return bi; }
      return -1;
    };
    var figBeat = function (j) { var sb = spoken(j); if (sb >= 0) return sb; return /funnel|layers|readers|tokens/.test(tpl) ? Math.min(n - 1, tpl === 'readers' ? j + 1 : j) : n - 1; };
    /* a plate's title is the card's own phrase ("The 2023 review"), so two figures are never left unnamed */
    var figCards = cards.filter(function (c) { var r = FCV.resolve(c); return r && String(r.figure || ''); });
    var figTitle = function (j) { var r = FCV.resolve(figCards[j]) || {}, m = /^The (\d{4} [a-z]+)\b/.exec(String(r.text || '')); return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : ''; };
    /* QAD-M8: the phone shows each beat's words and figures as large text under the picture; this is what it reads */
    lastFigMap = figs.map(function (f, j) { return { fig: f, beat: figBeat(j), title: figTitle(j) }; });
    if (tpl === 'funnel') {
      /* the stage counts of a figure with one count per ring are written on the rings */
      var ringCounts = null; figs.forEach(function (f) { var ps = f.split(/\s*→\s*/); if (!ringCounts && ps.length === n) ringCounts = ps; });
      /* M1: a count is written on a ring only when every ring's beat says its own count; otherwise the rings stay plain
         and the figure plate carries the counts, so no number ever sits beside a line that says something else */
      if (ringCounts && !ringCounts.every(function (c, i) { var nar = String((beats[i] || {}).narration || ''), num = String(c).replace(/[^\d,.]/g, ''); return num && nar.indexOf(num) >= 0; })) ringCounts = null;
      for (var i = 0; i < n; i++) { var w = 900 - i * (600 / n), y = top + i * rowH; g += '<g class="b' + i + '" opacity="0"><rect x="' + (560 - w / 2) + '" y="' + y + '" width="' + w + '" height="' + (rowH - 14) + '" rx="16" fill="' + COLS[i % 6] + '" stroke="#15101f" stroke-width="8"/>' + (ringCounts ? '<text x="560" y="' + (y + (rowH - 14) / 2 + 14) + '" text-anchor="middle" font-size="' + Math.min(40, rowH - 34) + '" font-family="Bangers, Impact" fill="#15101f">' + esc(ringCounts[i]) + '</text>' : '') + '</g>' + lab(i, 1290, y, 560); }
    } else if (tpl === 'readers') {
      g += '<g class="b0" opacity="0"><circle cx="420" cy="140" r="100" fill="#19c2b0" stroke="#15101f" stroke-width="8"/><circle cx="1180" cy="140" r="100" fill="#ff8a3d" stroke="#15101f" stroke-width="8"/></g>' + lab(0, 800, 100, 440, 160);
      var cw = Math.min(380, Math.floor(1500 / Math.max(1, n - 1)));
      for (var k = 1; k < n; k++) { var cx = 50 + cw / 2 + (k - 1) * cw + (1500 - cw * (n - 1)) / 2; g += '<g class="b' + k + '" opacity="0"><rect x="' + (cx - cw / 2 + 10) + '" y="290" width="' + (cw - 20) + '" height="70" rx="14" fill="#fffaf0" stroke="#15101f" stroke-width="6"/></g>' + lab(k, cx, 380, cw - 20, 160); }
    } else if (tpl === 'grid') {
      for (var r = 0; r < n; r++) { for (var c = 0; c < 5; c++) g += '<rect class="b' + r + '" opacity="0" x="' + (560 + c * 200) + '" y="' + (top + r * rowH) + '" width="180" height="' + (rowH - 16) + '" rx="10" fill="' + ((r + c) % 3 ? '#fffaf0' : '#ffd166') + '" stroke="#15101f" stroke-width="6"/>'; g += lab(r, 280, top + r * rowH, 500); }
    } else if (tpl === 'hump') {
      /* the hump on the left, labels 540 px wide on the right (two lines each) */
      g += '<path class="b0" opacity="0" d="M60 520 C 380 520, 420 60, 540 60 S 700 520, 1000 520" fill="none" stroke="#19c2b0" stroke-width="12"/>' + lab(0, 1300, 30, 540, 92);
      for (var h = 1; h < n; h++) { g += '<circle class="b' + h + '" opacity="0" cx="' + (260 + h * 110) + '" cy="' + (470 - h * 50) + '" r="30" fill="#ffd166" stroke="#15101f" stroke-width="6"/>' + lab(h, 1300, 30 + h * 90, 540, 92); }
    } else if (tpl === 'dials') {
      for (var d = 0; d < 12; d++) g += '<circle class="b' + Math.min(n - 1, Math.floor(d / 3)) + '" opacity="0" cx="' + (110 + (d % 6) * 170) + '" cy="' + (d < 6 ? 130 : 350) + '" r="70" fill="' + (d < 8 ? '#ffe9cc' : '#fffaf0') + '" stroke="#15101f" stroke-width="8"/>';
      for (var dl = 0; dl < n; dl++) g += lab(dl, 1350, top + dl * Math.min(110, Math.floor(zone / n)), 460, Math.min(110, Math.floor(zone / n)));
    } else if (tpl === 'tokens') {
      var sx = Math.floor(1400 / Math.max(1, n));
      for (var t = 0; t < n; t++) { var tx = 100 + sx / 2 + t * sx, ty = t % 2 ? 110 : 250, px = 100 + sx / 2 + (t - 1) * sx, py = (t - 1) % 2 ? 110 : 250; g += '<g class="b' + t + '" opacity="0"><circle cx="' + tx + '" cy="' + ty + '" r="54" fill="#ff8a3d" stroke="#15101f" stroke-width="8"/>' + (t ? '<line x1="' + px + '" y1="' + py + '" x2="' + tx + '" y2="' + ty + '" stroke="#ffd166" stroke-width="10"/>' : '') + '</g>' + lab(t, tx, 340 + (t % 2) * 100, Math.max(220, sx - 10), 100); }
    } else {
      for (var yy = 0; yy < n; yy++) { var ly = top + yy * rowH; g += '<g class="b' + yy + '" opacity="0"><rect x="60" y="' + ly + '" width="520" height="' + (rowH - 14) + '" rx="14" fill="' + ['#2bb3a6', '#7a5cff', '#ff8a3d', '#e2456f', '#ffb000', '#16a0d8'][yy % 6] + '" stroke="#15101f" stroke-width="8"/></g>' + lab(yy, 1080, ly + 4, 960); }
    }
    /* figures: full strings on plates in the band below the shapes, up to three a row */
    var cols = Math.min(3, figs.length) || 1, pw = Math.floor(1520 / cols) - 20, rows = Math.ceil(figs.length / cols), bandTop = 580, rowGap = Math.floor(300 / Math.max(1, rows));
    figs.forEach(function (f, j) { var col = j % cols, row = Math.floor(j / cols), x = 40 + (pw + 20) * col + pw / 2 + (1520 - (pw + 20) * Math.min(cols, figs.length - row * cols)) / 2; g += plate('b' + figBeat(j), x, bandTop + row * rowGap, pw, f, { fig: 1, fs: rows > 1 ? 32 : 38, maxLines: rows > 1 ? 2 : 4, title: figTitle(j) }); });
    void lastB;
    return '<svg viewBox="0 0 1600 900" role="img" aria-hidden="true"><rect width="1600" height="900" fill="#15101f"/>' + g + '</svg>';
  }
  /* Build check: every figure shown equals its card's figure field, and nothing is cut. */
  A.figuresCheck = function () {
    var bad = [], box = document.createElement('div');
    lessons().forEach(function (les) {
      var m = FCV.methodById(les.id), beats = m && m.raw.video_brief && m.raw.video_brief.beats || []; if (!beats.length) return;
      var cards = (les.thesis_cards || []).filter(function (c) { var r = FCV.resolve(c); return r && r.type === 'card'; });
      box.innerHTML = stageSVG(template(les.id), cards, beats);
      var want = cards.map(function (c) { return String(FCV.resolve(c).figure || ''); }).filter(Boolean);
      var shown = Array.prototype.map.call(box.querySelectorAll('[data-fig]'), function (gEl) { return Array.prototype.map.call(gEl.querySelectorAll('tspan'), function (t) { return t.textContent; }).join(' '); });
      if (shown.length !== want.length) bad.push(les.id + ': ' + shown.length + ' of ' + want.length + ' figures');
      shown.forEach(function (sx, i) { if (sx !== want[i]) bad.push(les.id + ': "' + sx + '" is not "' + want[i] + '"'); });
    });
    return bad;
  };
  /* Play, pause, scrub, 0.75 to 1.5x, captions (the brief's narration, read by Marigold where voiced). */
  A.diagram = async function (cfg) {
    if (window.Kit && Kit.dropRadio) Kit.dropRadio(); /* AUDR3-04: a radio link never plays under this */
    var gs = await loadGsap();
    var cut = $('cut'), media = $('cutMedia'), sub = $('cutSub'), btns = $('cutBtns'), card = $('cutCard'), title = $('cutTitle');
    cut.classList.remove('hidden'); UI.letterbox(); card.innerHTML = ''; title.innerHTML = ''; btns.innerHTML = '';
    var tapHint = $('cutTap'); if (tapHint) tapHint.hidden = true;
    media.innerHTML = '<div class="mdStage">' + stageSVG(cfg.template, cfg.cards, cfg.beats) + '<div class="mdBeat" aria-hidden="true"><div class="mdLab"></div><div class="mdFig"></div></div></div>';
    var figMap = lastFigMap.slice(), mdBeat = media.querySelector('.mdBeat');
    var showBeatText = function (i) {
      if (!mdBeat) return;
      mdBeat.querySelector('.mdLab').textContent = cfg.beats[i] ? beatLabel(cfg.beats[i], i) : '';
      var fs = figMap.filter(function (f) { return f.beat === i; });
      if (!fs.length) fs = figMap.filter(function (f) { return f.beat < i; }).slice(-1);
      mdBeat.querySelector('.mdFig').innerHTML = fs.map(function (f) { return (f.title ? '<small>' + esc(f.title) + '</small> ' : '') + esc(f.fig); }).join('<br>');
    };
    var ctl = document.createElement('div'); ctl.className = 'mdCtl';
    ctl.innerHTML = '<button class="btn small" type="button" data-md="play">Pause</button><input type="range" min="0" max="1000" value="0" aria-label="Scrub the explainer"><select aria-label="Speed"><option value="0.75">0.75x</option><option value="1" selected>1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option></select><button class="btn small go" type="button" data-md="done">Done</button>';
    cut.appendChild(ctl);
    /* SD-15: one set of controls. The film bar (Back, Pause, Next, Skip) drives the explainer; its own bar stays hidden. */
    ctl.style.display = 'none'; $('cutPause').textContent = 'Pause'; cut.classList.remove('paused');
    var reduce = S().settings.reduceMotion, beatLen = 5.5, total = cfg.beats.length * beatLen, tl = null, svgEl = media.querySelector('svg');
    /* AUD-04: each beat lasts at least as long as its narration (the clip's length at the chosen voice speed, plus 0.4 s),
       and the picture waits at a beat's end while the line is still being said */
    var rate = (S().settings.audio && S().settings.audio.voiceRate) || 1, lens = cfg.beats.map(function (b, i) {
      var d = 0; try { var id = window.Voice && Voice.find ? Voice.find(cfg.voicePrefix + '[' + i + ']', b.narration, 'marigold') : null, e = id && Voice.entry(id); d = e && e.duration > 0 ? e.duration / rate + 0.4 : 0; } catch (er) {}
      return Math.max(beatLen, d);
    }), starts = []; lens.reduce(function (t, l, i) { starts[i] = t; return t + l; }, 0);
    var beatAt = function (t) { var k = 0; for (var q = 0; q < starts.length; q++) if (t >= starts[q]) k = q; return k; };
    var heldForVoice = false, userPaused = false;
    var voiceBusy = function () { try { var p = window.Voice && Voice.playing(); return !!p; } catch (e) { return false; } };
    var caption = function (i) { showBeatText(i); var b = cfg.beats[i]; sub.hidden = false; sub.innerHTML = b ? '<span class="spk" style="color:#ffd166">◆ Marigold</span>' + esc(b.narration) : ''; if (window.Sound && b) Sound.voice(cfg.voicePrefix + '[' + i + ']', { speaker: 'marigold', text: b.narration }); };
    return new Promise(function (resolve) {
      var lastBeat = -1, done = false;
      var finish = function () { if (done) return; done = true; clearTimeout(pend); if (tapHint) tapHint.hidden = false; cut.classList.remove('paused'); cut.onclick = null; if (tl) tl.kill(); if (window.Sound) Sound.stopVoice(); ctl.remove(); cut.classList.add('hidden'); media.innerHTML = ''; sub.innerHTML = ''; UI.letterbox(); Game.afterUI(); document.removeEventListener('keydown', kd, true); resolve(); };
      /* AUDR3-02: Next (and Enter, Space or the right arrow, as in every film) moves exactly one beat on; on the last beat
         it closes. Esc and a tap pause; Skip and Done close. */
      var pend = null, stepNow = null;
      /* AUDR4-11: a beat that has just started by itself (under 0.7 s ago) counts as the Next he meant: the press is not taken
         as a second step, so the beat that began is heard, never cut after a fraction of a second */
      var autoAt = 0, stepping = false;
      var nextBeat = function () {
        if (done) return;
        if (autoAt && performance.now() - autoAt < 700) { autoAt = 0; return; }
        autoAt = 0;
        if (lastBeat >= cfg.beats.length - 1) return finish();
        stepping = true;
        if (window.Sound) Sound.stopVoice();
        userPaused = false; heldForVoice = false;
        if (tl) { tl.seek(starts[lastBeat + 1] + 0.01); tl.resume(); ctl.querySelector('[data-md="play"]').textContent = 'Pause'; $('cutPause').textContent = 'Pause'; cut.classList.remove('paused'); if (lastBeat < beatAt(tl.time())) onBeat(beatAt(tl.time())); }
        else if (stepNow) { clearTimeout(pend); stepNow(); }
        stepping = false;
      };
      var kd = function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ctl.querySelector('[data-md="play"]').click(); } else if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) nextBeat(); } };
      document.addEventListener('keydown', kd, true);
      var onBeat = function (i) { if (i !== lastBeat) { if (lastBeat >= 0 && !stepping) autoAt = performance.now(); lastBeat = i; caption(i); } };
      if (gs && !reduce) {
        tl = gs.timeline({ onUpdate: function () {
          ctl.querySelector('input').value = Math.round(tl.progress() * 1000);
          var b = beatAt(tl.time());
          /* the next beat waits until the line before it has been said in full */
          if (b > lastBeat && lastBeat >= 0 && !heldForVoice && voiceBusy()) {
            heldForVoice = true; tl.pause();
            var wait = setInterval(function () { if (done) { clearInterval(wait); return; } if (!voiceBusy()) { clearInterval(wait); heldForVoice = false; if (!userPaused && tl) tl.resume(); } }, 150);
            return;
          }
          onBeat(b);
        }, onComplete: function () { ctl.querySelector('[data-md="play"]').textContent = 'Replay'; var waitEnd = function () { if (done) return; if (voiceBusy()) { setTimeout(waitEnd, 200); return; } setTimeout(function () { if (tl && tl.progress() >= 1 && !tl.paused()) finish(); }, 1500); }; waitEnd(); } });
        cfg.beats.forEach(function (b, i) { tl.to(svgEl.querySelectorAll('.b' + i), { opacity: 1, duration: 0.8, stagger: 0.08, ease: 'back.out(1.6)' }, starts[i]); });
        tl.to({}, { duration: lens[lens.length - 1] }, starts[starts.length - 1] + 0.8);
      } else {
        /* no GSAP or reduced motion: cross-fade beat by beat on a timer */
        var i = 0; var step = function () { if (done) return; clearTimeout(pend); Array.prototype.forEach.call(svgEl.querySelectorAll('.b' + i), function (el) { el.setAttribute('opacity', 1); }); onBeat(i); var len = lens[i] || beatLen; i++; var after = function () { if (done) return; if (voiceBusy()) { pend = setTimeout(after, 200); return; } if (i < cfg.beats.length) step(); else finish(); }; pend = setTimeout(after, len * 1000); };
        stepNow = function () { if (i < cfg.beats.length) step(); else finish(); };
        step();
      }
      ctl.querySelector('[data-md="play"]').onclick = function (e) { e.stopPropagation(); if (!tl) return; if (tl.progress() >= 1) { tl.restart(); e.target.textContent = 'Pause'; return; } userPaused = !userPaused; if (userPaused) { tl.pause(); if (window.Sound) Sound.stopVoice(); } else { heldForVoice = false; tl.resume(); if (lastBeat >= 0) caption(lastBeat); } e.target.textContent = userPaused ? 'Play' : 'Pause'; $('cutPause').textContent = tl.paused() ? 'Play' : 'Pause'; cut.classList.toggle('paused', tl.paused()); };
      ctl.querySelector('input').oninput = function (e) { if (tl) { tl.pause(); tl.progress(e.target.value / 1000); ctl.querySelector('[data-md="play"]').textContent = 'Play'; } };
      ctl.querySelector('select').onchange = function (e) { if (tl) tl.timeScale(+e.target.value); };
      ctl.querySelector('[data-md="done"]').onclick = function (e) { e.stopPropagation(); finish(); };
      $('cutSkip').onclick = function (e) { e.stopPropagation(); finish(); };
      $('cutBack').onclick = function (e) { e.stopPropagation(); if (tl) tl.restart(); };
      $('cutPause').onclick = function (e) { e.stopPropagation(); ctl.querySelector('[data-md="play"]').click(); };
      if ($('cutNext')) $('cutNext').onclick = function (e) { e.stopPropagation(); nextBeat(); };
      cut.onclick = function (e) { if (e.target.closest && e.target.closest('#cutCtl, #sysCorner, #sysPanel')) return; ctl.querySelector('[data-md="play"]').click(); };
      void total;
    });
  };
  /* For the build check: every caption is the brief by reference, at most 25 words. */
  A.captionsCheck = function () { var bad = []; FCV.methods.forEach(function (m) { ((m.raw.video_brief || {}).beats || []).forEach(function (b, i) { if (String(b.narration).split(/\s+/).length > 25) bad.push(m.id + ':' + i); }); }); return bad; };
  window.Academy = A;
  if (window.Methods) { Methods.bench = A.open; Methods.lesson = function (m) { return A.lesson(m.id || m); }; Methods.explainer = function (id) { return A.explainerById('MX-' + id); }; }
})();
