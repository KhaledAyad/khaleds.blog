/* Freight City Viva v2: the searchable notebook, the quick revision view, and the Viva morning sheet. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return UI.esc(s); };
  var NB = {};
  var built = null;
  var ST = function () { return Game.state; };
  var SC = function () { return FCV.data.script; };

  function entryText(r) {
    if (!r) return '';
    if (r.type === 'card') return [r.label, r.figure, r.text, (r.list || []).join(' '), r.loc].join(' ');
    if (r.type === 'trace') return [r.number, r.means, r.stated, r.from].join(' ');
    if (r.type === 'gap') return [r.gap, r.answer, r.where].join(' ');
    if (r.type === 'quiz' || r.type === 'bank') return [r.q, r.options[r.answer], r.explanation, r.loc].join(' ');
    if (r.type === 'eq') return [r.question, r.answer, r.loc].join(' ');
    return '';
  }
  function skim(text) {
    var first = FCV.firstSentence(text), rest = String(text || '').slice(first.length).trim();
    return '<div class="nbFirst">' + UI.boldFigures(first) + '</div>' + (rest ? '<details><summary>More</summary><div>' + UI.boldFigures(rest) + '</div></details>' : '');
  }
  function pill(id, met) {
    var st = ST(), m = st.mem[id] || st.mem['recall:' + id] || st.mem['say:' + id];
    /* item 32: the box dot says what it means in plain words */
    var back = m ? -FCV.overdue(st, st.mem[id] ? id : st.mem['recall:' + id] ? 'recall:' + id : 'say:' + id) : 0, when = back > 0 ? 'back in ' + back + (back === 1 ? ' day' : ' days') : 'due now';
    var tip = m ? ' title="' + m.box + ' of 5: ' + when + '"' : '';
    /* SD-17: plain words, never "Box 1, sure and wrong" */
    if (m && m.box <= 2 && m.lastOutcome && m.lastOutcome !== 'right') return '<span class="pill flag"' + tip + '>' + (m.sureWrong ? 'Look again: you were sure, and it was wrong' : 'Look again') + '</span>';
    if (m) return '<span class="pill"' + tip + '>Learning: step ' + m.box + ' of 5</span>';
    return '<span class="pill">' + (met ? 'Met' : 'Not met yet') + '</span>';
  }
  function entryHTML(id, r, met) {
    var held = Flows.HELD[id];
    var h = '<div class="nbItem' + (met ? '' : ' unmet') + '" data-id="' + esc(id) + '">' + pill(id, met);
    if (r.type === 'card') {
      var pf = UI.plainFigure(r.figure);
      h += '<span class="cardTools"><button type="button" class="pinIt" data-pin="' + esc(id) + '" aria-pressed="' + !!(ST().pins && ST().pins[id]) + '" aria-label="Pin it" title="Pin it"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M14 3l7 7-3 1-4 4 1 5-2 1-4-5-5 5-1-1 5-5-5-4 1-2 5 1 4-4z"/></svg></button></span>';
      h += '<div class="fig">' + esc(pf || r.label) + '</div>' + (pf ? '<div class="nbLab">' + esc(r.label) + '</div>' : '') + skim(r.text);
      if (r.list && r.list.length) h += '<details><summary>Parts</summary><ul>' + r.list.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></details>';
      if (r.loc && UI.stripCodes(r.loc)) h += '<div class="loc">' + esc(UI.stripCodes(r.loc)) + '</div>';
    } else if (r.type === 'trace') {
      h += '<div class="fig">' + esc(r.number) + '</div>' + skim(r.means) + '<div class="loc">Comes from: ' + esc(r.from) + '</div> <div class="loc">Stated in: ' + esc(r.stated) + '</div>';
    } else if (r.type === 'gap') {
      h += '<div class="fig">The gap</div>' + skim(r.gap) + '<details><summary>The honest answer</summary>' + skim(r.answer) + '</details><div class="loc">Disclosed in: ' + esc(r.where) + '</div>';
    } else if (r.type === 'quiz' || r.type === 'bank') {
      h += '<div class="fig">' + esc(r.q) + '</div><details><summary>Answer</summary><div><b>' + esc(r.options[r.answer]) + '</b></div>' + skim(r.explanation) + '</details>' + (UI.stripCodes(r.loc) ? '<div class="loc">' + esc(UI.stripCodes(r.loc)) + '</div>' : '');
    } else if (r.type === 'eq') {
      h += '<div class="fig">' + esc(r.question) + '</div><details><summary>Model answer</summary>' + skim(r.answer) + '</details>' + (UI.stripCodes(r.loc) ? '<div class="loc">' + esc(UI.stripCodes(r.loc)) + '</div>' : '');
    }
    if (held) h += '<div class="held">' + esc(held) + '</div>';
    return h + '</div>';
  }
  function isMet(id) { var st = ST(); return !!(st.met[id] || st.mem[id] || st.mem['recall:' + id] || st.mem['say:' + id] || st.parcels.delivered[id]); }

  /* SD-17: designer notes in the script ("held_note", "the HUD", "he rated") are said plainly to the player */
  var NOTE = {
    'The chain: claim, evidence, objection': 'Each link: the claim, the evidence and the strongest objection.',
    'Held by the author': 'Each one: what the bound appendix prints, and the sentence to say for the rest.',
    'Say aloud: I struggled': 'Follow-ups and say-alouds you rated Partly or Missed.',
    'Your own words': 'Write your own answer under each prompt. Your words are saved and go on the viva morning sheet.'
  };
  function build() {
    var st = ST(), groups = SC().notebook.groups.map(function (g) { return NOTE[g.group] ? Object.assign({}, g, { note: NOTE[g.group] }) : g; }), out = [];
    /* round 4: New since last time (17), Pinned (40) and Recently picked up (2) come first */
    var fresh = (st.nbNewIds || []).filter(function (x) { return x.at > (st.nbSeenAt || 0); }).map(function (x) { return x.id; }).filter(function (id, i, a) { return a.indexOf(id) === i; });
    if (fresh.length) out.push({ title: 'New since last time', note: 'Added since you last opened the Notebook.', items: fresh.map(function (id) { return { id: id }; }) });
    var pins = Object.keys(st.pins || {}).sort(function (a, b) { return st.pins[b] - st.pins[a]; });
    if (pins.length) out.push({ title: 'Pinned', note: 'Your pinned cards. They are on the viva morning sheet too.', items: pins.map(function (id) { return { id: id }; }) });
    var picked = Object.keys(st.parcels.picked || {}).sort(function (a, b) { return st.parcels.picked[b] - st.parcels.picked[a]; }).slice(0, 10);
    if (picked.length) out.push({ title: 'Recently picked up', note: 'The parcels you picked up, newest first. Still in your bag: ' + st.parcels.bag.length + '.', items: picked.map(function (id) { return { id: id }; }) });
    var head = out.length;
    groups.forEach(function (g) {
      if (g.group === 'Seven lines to say aloud') {
        /* SD-17: lines not saved yet fold into one "Coming later" note */
        var shownIds = g.ids.filter(function (id, i) { return FCV.isDone(st, i + 1, 'closer'); }), later = g.ids.length - shownIds.length;
        out.push({ title: g.group, note: g.note + (later ? ' Coming later: ' + later + ' more, saved as each act closes.' : ''), ids: g.ids, items: shownIds.map(function (id) { return { id: id }; }), seven: true, keep: true });
      } else if (/^The chain/.test(g.group)) {
        out.push({ title: g.group, note: g.note, chain: true });
      } else if (g.dynamic && g.group === 'Say aloud: I struggled') {
        out.push({ title: g.group, note: g.note, struggled: true });
      } else if (g.dynamic && g.group === 'Your own words') {
        out.push({ title: g.group, note: g.note, own: g.prompts });
      } else if (g.group === 'Trace the number') {
        out.push({ title: g.group, trace: true, ids: g.ids });
      } else out.push({ title: g.group, note: g.note, items: g.ids.map(function (id) { return { id: id }; }) });
      if (g.group === 'Your own words') out.push({ title: 'Methods and terms', methods: true });
    });
    var flagged = Object.keys(st.mem).filter(function (id) { var m = st.mem[id]; return m.box <= 2 && m.lastOutcome && m.lastOutcome !== 'right' && FCV.resolve(id) && FCV.resolve(id).type !== 'audit'; })
      .sort(function (a, b) { return st.mem[a].box - st.mem[b].box || st.mem[b].sureWrong - st.mem[a].sureWrong; });
    /* SD-17: To revisit comes straight after New, Pinned and Recently picked up */
    out.splice(head, 0, { title: 'To revisit', note: flagged.length ? 'Flagged as you played, with their box. Box 1 comes back first.' : 'Nothing flagged yet.', items: flagged.map(function (id) { return { id: id }; }), flagged: true });
    var eqs = [];
    FCV.data.story.acts.forEach(function (a) { a.examiner_questions.forEach(function (e, i) { eqs.push({ id: 'ch' + a.act + '-eq' + (i + 1) }); }); });
    FCV.data.facts.appendices.forEach(function (a) { a.examiner_questions.forEach(function (e, i) { eqs.push({ id: 'app-' + a.letter + '-eq' + (i + 1) }); }); });
    out.push({ title: 'Examiner questions with model answers', items: eqs });
    built = out;
  }

  function chainHTML(terms, match) {
    var st = ST(), cs = FCV.chainState(st);
    var unlit = SC().spine.chain.filter(function (c) { return !cs.lit[c.link]; }).length;
    return SC().spine.chain.map(function (c) {
      var lit = cs.lit[c.link], r = FCV.resolve(c.claim);
      if (!lit && !terms.length) return '';
      var body = '<div class="chainItem' + (lit ? ' lit' : '') + '"><div class="fig">' + esc(r.figure) + (lit === 'proposed' ? ' <span class="pill">proposed</span>' : lit ? ' <span class="pill">lit</span>' : ' <span class="pill">not lit yet</span>') + '</div>' +
        '<details><summary>Claim</summary>' + skim(r.text) + '<div class="loc">' + esc(r.loc) + '</div></details>' +
        '<details><summary>Evidence</summary>' + c.evidence.map(function (id) { return UI.cardHTML(id, { noMet: true }); }).join('') + '</details>' +
        '<details><summary>Objection</summary>' + c.objection.map(function (id) { var o = FCV.resolve(id); if (!o) return ''; return o.type === 'bank' ? '<div class="answer"><b class="aTitle">' + esc(o.q) + '</b><details><summary>Answer</summary>' + esc(o.options[o.answer]) + '</details></div>' : '<div class="answer"><b class="aTitle">' + esc(o.question) + '</b><details><summary>Answer</summary>' + skim(o.answer) + '</details></div>'; }).join('') + '</details></div>';
      return (!terms.length || match(entryText(r) + ' ' + c.evidence.map(function (id) { return entryText(FCV.resolve(id)); }).join(' '))) ? body : '';
    }).join('') + (unlit && !terms.length ? '<div class="nbItem unmet"><div class="fig">Coming later: ' + unlit + (unlit === 1 ? ' more link' : ' more links') + '</div><div class="nbFirst">Each one lights up in the story. Then its claim, evidence and objection appear here.</div></div>' : '');
  }

  function render() {
    var st = ST(), q = $('nbSearch').value.trim().toLowerCase(), onlyMet = $('nbMet').checked, onlyFlag = $('nbFlag').checked;
    var terms = q ? q.split(/\s+/) : [];
    var match = function (txt) { txt = String(txt).toLowerCase(); for (var i = 0; i < terms.length; i++) if (txt.indexOf(terms[i]) < 0) return false; return true; };
    var html = [], shown = 0;
    built.forEach(function (g) {
      if (onlyFlag && !g.flagged && !g.struggled) return;
      if (g.chain) { var ch = chainHTML(terms, match); if (ch) { html.push('<section class="nbGroup"><h3>' + esc(g.title) + '</h3><p class="nbNote">' + esc(g.note || '') + '</p><div class="nbGrid">' + ch + '</div></section>'); shown++; } return; }
      if (g.own) {
        if (terms.length || onlyMet) return;
        html.push('<section class="nbGroup"><h3>' + esc(g.title) + '</h3><p class="nbNote">' + esc(g.note) + '</p><div class="nbGrid">' + g.own.map(function (p, i) {
          return '<label class="nbItem own" for="own' + i + '"><div class="fig">' + esc(p) + '</div><textarea id="own' + i + '" data-own="' + i + '" rows="4">' + esc(st.own[i] || '') + '</textarea></label>';
        }).join('') + '</div></section>');
        return;
      }
      if (g.methods) {
        var ms = FCV.methods || [];
        if (!ms.length) { if (!terms.length && !onlyMet) html.push('<section class="nbGroup"><h3>' + esc(g.title) + '</h3><p class="nbNote">Every method, design choice, statistic and term in the thesis, each with its plain meaning, why it was chosen and the alternatives. This page fills in when the methods file arrives.</p></section>'); return; }
        var mi = ms.filter(function (m) { return !terms.length || match([m.term, m.plain, m.how, m.why, m.analogy].join(' ')); });
        if (!mi.length) return; shown += mi.length;
        html.push('<section class="nbGroup"><h3>' + esc(g.title) + '</h3><div class="nbGrid">' + mi.map(function (m) { return entryHTML('method:' + m.id, FCV.resolve('method:' + m.id), isMet('method:' + m.id)) + (m.video ? '<button class="btn small" type="button" data-explainer="' + esc(m.id) + '">Watch the explainer</button>' : ''); }).join('') + '</div></section>');
        return;
      }
      if (g.struggled) {
        var items = st.struggled.filter(function (x) { return !terms.length || match(x.text); });
        var rated = Object.keys(st.mem).filter(function (id) { var r = FCV.resolve(id); return r && (r.type === 'eq' || r.type === 'gap') && st.mem[id].lastOutcome && st.mem[id].lastOutcome !== 'right'; });
        if (!items.length && !rated.length) { if (!terms.length) html.push('<section class="nbGroup"><h3>' + esc(g.title) + '</h3><p class="nbNote">Nothing here yet. Say-alouds you rate Partly or Missed, and viva follow-ups you struggle with, land here.</p></section>'); return; }
        html.push('<section class="nbGroup"><h3>' + esc(g.title) + '</h3><div class="nbGrid">' + items.map(function (x) { var p = FCV.bankItem(x.parent); return '<div class="nbItem"><span class="pill flag">Follow-up</span><div class="fig">' + esc(x.text) + '</div>' + (p ? '<details><summary>The question it followed</summary>' + esc(p.question) + '<div><b>' + esc(p.options[p.answer_index]) + '</b></div></details>' : '') + '</div>'; }).join('') +
          rated.filter(function (id) { return !terms.length || match(entryText(FCV.resolve(id))); }).map(function (id) { return entryHTML(id, FCV.resolve(id), true); }).join('') + '</div></section>');
        shown += items.length + rated.length;
        return;
      }
      if (g.trace) {
        var rows = g.ids.map(function (id) { var r = FCV.resolve(id); return { id: id, r: r, met: isMet(id) }; })
          .filter(function (x) { return x.r && (!onlyMet || x.met) && (!terms.length || match(entryText(x.r))); });
        if (!rows.length) return; shown += rows.length;
        html.push('<section class="nbGroup"><h3>' + esc(g.title) + '</h3><div class="tableWrap"><table class="trace"><thead><tr><th>Number</th><th>What it means</th><th>Stated in</th><th>Comes from</th></tr></thead><tbody>' +
          rows.map(function (x) { return '<tr><td><b>' + esc(x.r.number) + '</b></td><td>' + esc(x.r.means) + (Flows.HELD[x.id] ? '<div class="held">' + esc(Flows.HELD[x.id]) + '</div>' : '') + '</td><td>' + esc(x.r.stated) + '</td><td>' + esc(x.r.from) + '</td></tr>'; }).join('') + '</tbody></table></div></section>');
        return;
      }
      var list = (g.items || []).map(function (x) {
        var r = FCV.resolve(x.id); if (!r || r.type === 'audit') return null;
        return { id: x.id, r: r, met: isMet(x.id), locked: x.locked, lockText: x.lockText };
      }).filter(function (x) { return x && (!onlyMet || x.met) && (!terms.length || match(entryText(x.r))); });
      if (!list.length && !(g.flagged && !terms.length && !onlyMet) && !(g.keep && !terms.length && !onlyMet)) return;
      shown += list.length;
      html.push('<section class="nbGroup"><h3>' + esc(g.title) + '</h3>' + (g.note ? '<p class="nbNote">' + esc(g.note) + '</p>' : '') + (g.seven && !terms.length && list.length ? '<button class="btn small" type="button" id="nbPlaySeven">Play the lines saved so far</button>' : '') + '<div class="nbGrid">' +
        list.map(function (x) { return x.locked ? '<div class="nbItem unmet"><span class="pill">Locked</span><div class="fig">' + esc(x.lockText) + '</div></div>' : entryHTML(x.id, x.r, x.met); }).join('') + '</div></section>');
    });
    if (!shown && terms.length) html.push('<p>Nothing matches "' + esc(q) + '". Try a number, one word, or an appendix letter.</p>');
    /* item 32: a row of group chips to jump to each group, and a Top button */
    var titles = html.map(function (h) { var m = /<h3>([^<]*)<\/h3>/.exec(h); return m ? m[1] : null; });
    /* SD-17: short chips in three rows (sections, acts, appendices), never a wall of long titles */
    var SHORT = { 'Seven lines to say aloud': 'Seven lines', 'The chain: claim, evidence, objection': 'The chain', 'Say aloud: I struggled': 'I struggled', 'The parcel: the thesis in its own words': 'The parcel', 'Examiner questions with model answers': 'Examiner questions', 'Gaps and honest answers': 'Gaps' };
    var rowA = [], rowB = [], rowC = [];
    titles.forEach(function (t, i) { if (!t) return; var m; if ((m = /^Act (\d)/.exec(t))) rowB.push('<button class="chip" type="button" data-jump="' + i + '" title="' + t + '">' + m[1] + '</button>'); else if ((m = /^Appendix ([A-O])/.exec(t))) rowC.push('<button class="chip" type="button" data-jump="' + i + '" title="' + t + '">' + m[1] + '</button>'); else rowA.push('<button class="chip" type="button" data-jump="' + i + '">' + (SHORT[t.replace(/&amp;/g, '&')] || t) + '</button>'); });
    /* QAD-m3: the section chips stay; the act and appendix chips fold under Jump to */
    /* m7: the section chips fold under one Sections disclosure too, beside Jump to */
    var chips = '<nav class="nbChips" aria-label="Jump to a section">' + (rowA.length ? '<details class="nbJump"><summary>Sections</summary><div>' + rowA.join('') + '</div></details>' : '') + (rowB.length || rowC.length ? '<details class="nbJump"><summary>Jump to an act or an appendix</summary>' + (rowB.length ? '<div><span class="nbRowLab">Acts</span>' + rowB.join('') + '</div>' : '') + (rowC.length ? '<div><span class="nbRowLab">Appendices</span>' + rowC.join('') + '</div>' : '') + '</details>' : '') + '</nav>';
    html = html.map(function (h, i) { return h.replace('<section class="nbGroup">', '<section class="nbGroup" id="nbg' + i + '">'); });
    $('nbBody').innerHTML = chips + html.join('') + '<p><button class="btn small" type="button" id="nbTop">Top</button></p>';
    Array.prototype.forEach.call($('nbBody').querySelectorAll('[data-jump]'), function (b) { b.addEventListener('click', function () { var g = $('nbg' + b.getAttribute('data-jump')); if (g) g.scrollIntoView({ block: 'start' }); }); });
    var top = $('nbTop'); if (top) top.addEventListener('click', function () { $('nbBody').scrollTop = 0; try { $('notebook').scrollTop = 0; } catch (e) {} var c = $('nbBody').querySelector('.nbChips'); if (c) c.scrollIntoView({ block: 'start' }); });
    var p7 = $('nbPlaySeven'); if (p7) p7.addEventListener('click', NB.playSeven);
    /* item 52: the words searched for are marked */
    if (terms.length) markTerms($('nbBody'), terms);
    Array.prototype.forEach.call($('nbBody').querySelectorAll('[data-own]'), function (t) {
      var timer = null;
      t.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { st.own[t.getAttribute('data-own')] = t.value; Game.save(); }, 600); });
    });
    Array.prototype.forEach.call($('nbBody').querySelectorAll('[data-explainer]'), function (b) { b.addEventListener('click', function () { Methods.explainer(b.getAttribute('data-explainer')); }); });
    var b = FCV.badges(st), metN = Object.keys(st.met).length;
    $('nbStats').textContent = 'Badges: ' + b + ' · Cards met: ' + metN + ' · Due again: ' + FCV.dueList(st).length;
  }

  function markTerms(root, terms) {
    var re = new RegExp('(' + terms.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'gi');
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { return n.parentNode && /TEXTAREA|SCRIPT|STYLE|BUTTON/.test(n.parentNode.tagName) ? NodeFilter.FILTER_REJECT : re.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; } });
    var nodes = [], n; while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (tn) { re.lastIndex = 0; var span = document.createElement('span'); span.innerHTML = esc(tn.nodeValue).replace(re, '<mark>$1</mark>'); tn.parentNode.replaceChild(span, tn); });
  }
  /* item 48: the seven closer lines, read in order by the recordings already made */
  NB.playSeven = function () {
    var st = ST(), g = (built || []).filter(function (x) { return x.seven; })[0]; if (!g || !window.Voice) return;
    /* AUDR2-11: the card being read scrolls into view and is marked until its line ends */
    var cardEl = function (id) { var all = document.querySelectorAll('#notebook .nbItem[data-id]'); for (var k = 0; k < all.length; k++) if (all[k].getAttribute('data-id') === id) return all[k]; return null; };
    var items = g.ids.map(function (id, i) { if (!FCV.isDone(st, i + 1, 'closer')) return null; var c = Voice.cardClip(FCV.resolve(id)); if (!c) return null;
      return { text: c.text, pri: 'card', asked: true,
        onStart: function () { var el = cardEl(id); if (!el) return; try { el.scrollIntoView({ block: 'center', behavior: ST().settings.reduceMotion ? 'auto' : 'smooth' }); } catch (e) { el.scrollIntoView(); } el.classList.add('nbReading'); },
        after: function () { var el = cardEl(id); if (el) el.classList.remove('nbReading'); } }; }).filter(Boolean);
    if (!items.length) { UI.toast('The seven lines are saved as each act closes.', 2600); return; }
    Voice.sequence(items);
  };
  /* item 17: anything filed for another look flies a chip into the Notebook button and keeps a dot until it opens */
  NB.note = function (group, id) {
    var st = ST(); if (!st) return;
    st.nbNewIds = (st.nbNewIds || []).concat(id ? [{ id: String(id).replace(/^(say|recall):/, ''), at: Date.now() }] : []).slice(-40);
    st.nbNew = (st.nbNew || 0) + 1;
    var btn = $('btnNotebook'); if (btn) btn.classList.add('newDot');
    if (!btn || !btn.offsetParent) { UI.announce('Added to Notebook: ' + group); return; }
    var r = btn.getBoundingClientRect(), chip = document.createElement('div'); chip.className = 'flyChip'; chip.textContent = 'Added to Notebook: ' + group;
    chip.style.left = Math.round(innerWidth / 2 - 90) + 'px'; chip.style.top = Math.round(innerHeight * 0.3) + 'px'; document.body.appendChild(chip);
    requestAnimationFrame(function () { requestAnimationFrame(function () { chip.style.left = Math.round(r.left) + 'px'; chip.style.top = Math.round(r.top) + 'px'; chip.style.opacity = '0'; }); });
    setTimeout(function () { chip.remove(); }, 1100);
  };
  /* ---------- Viva morning: one printable page ---------- */
  NB.morningHTML = function () {
    var st = ST(), vm = SC().notebook.viva_morning, t = FCV.data.story.thesis;
    var card = function (id) { var r = FCV.resolve(id); if (!r) return ''; return '<div class="pm"><b>' + esc(r.figure || r.label) + '</b> ' + esc(r.text) + (r.type === 'card' && /^P\d/.test(id) ? '<br><i>Falsified by ' + esc(t.propositions.filter(function (p) { return p.id === id; })[0].falsified_by) + '</i>' : '') + '</div>'; };
    var seven = SC().notebook.groups.filter(function (g) { return g.group === 'Seven lines to say aloud'; })[0].ids;
    var held = SC().notebook.groups.filter(function (g) { return g.group === 'Held by the author'; })[0];
    var weak = FCV.weakest(st, 10);
    var pins = Object.keys(st.pins || {});
    return '<h1>Viva morning</h1>' + (pins.length ? '<h2>Pinned</h2>' + pins.map(card).join('') : '') + vm.contents.map(card).join('') +
      '<h2>Seven lines to say aloud</h2>' + seven.map(card).join('') +
      '<h2>Held by the author</h2><p>' + esc(held.note) + '</p>' + held.ids.map(function (id) { var r = FCV.resolve(id); return r ? '<div class="pm">' + esc(r.type === 'bank' ? r.q : r.type === 'eq' ? r.question : r.gap || r.number) + (Flows.HELD[id] ? '<br><i>' + esc(Flows.HELD[id]) + '</i>' : '') + '</div>' : ''; }).join('') +
      '<h2>Ten weakest</h2>' + (weak.length ? weak.map(function (id) { var r = FCV.resolve(id); return '<div class="pm">' + esc(r.q || r.question || r.gap || r.number) + ' <i>(box ' + st.mem[id].box + ')</i></div>'; }).join('') : '<p>None yet.</p>') +
      '<h2>Your own words</h2>' + SC().notebook.groups.filter(function (g) { return g.group === 'Your own words'; })[0].prompts.map(function (p, i) { return '<div class="pm"><b>' + esc(p) + '</b> ' + esc(st.own[i] || '') + '</div>'; }).join('');
  };
  NB.print = function () {
    var ps = $('printSheet'); ps.innerHTML = NB.morningHTML();
    try { window.print(); } catch (e) { UI.toast('Printing is not available here. Use Save the sheet instead.', 3000); }
  };
  NB.saveSheet = function () {
    var dl = Save.downloads();
    var page = '<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8"><title>Viva morning</title><style>body{font-family:Georgia,serif;max-width:720px;margin:24px auto;padding:0 16px;line-height:1.45}h1{margin:0 0 8px}h2{margin:18px 0 6px;font-size:18px}.pm{margin:4px 0;font-size:14px}</style></head><body>' + NB.morningHTML() + '</body></html>';
    if (!dl) { UI.toast('Saving files is not available here. Use Print instead.', 3000); return; }
    dl.save({ filename: 'viva-morning-' + FCV.today() + '.html', data: page }).then(function () { UI.toast('Sheet saved.', 2000); }).catch(function (e) { if (!e || e.code !== 'declined') UI.toast('That did not save. Try again in a moment.', 2600); });
  };

  NB.open = function () {
    if (window.Game && Game.kidDrive) { UI.toast(FCV.data.script.session_copy.family.dads_job, 1400); return; }
    build();
    $('notebook').classList.remove('hidden'); UI.letterbox();
    /* item 32: the last search, filters and place come back for the session; no keyboard pops up on touch */
    /* QAD3-m10: a placeholder that fits a phone's search box */
    $('nbSearch').placeholder = window.innerWidth < 560 ? 'Search a word or number' : 'Search: a number, a word, an appendix letter';
    if (memo) { $('nbSearch').value = memo.q; $('nbMet').checked = memo.met; $('nbFlag').checked = memo.flag; }
    render();
    if (memo && memo.scroll) setTimeout(function () { $('nbBody').scrollTop = memo.scroll; }, 0);
    var st = ST(); st.nbSeenAt = Date.now(); st.nbNew = 0; var bn = $('btnNotebook'); if (bn) bn.classList.remove('newDot'); if (window.Extras) Extras.seen('notebook'); Game.save();
    var coarse = false; try { coarse = matchMedia('(pointer: coarse)').matches; } catch (e) {}
    if (!coarse) try { $('nbSearch').focus({ preventScroll: true }); } catch (e) {}
  };
  var memo = null;
  NB.close = function () { memo = { q: $('nbSearch').value, met: $('nbMet').checked, flag: $('nbFlag').checked, scroll: $('nbBody').scrollTop }; $('notebook').classList.add('hidden'); UI.letterbox(); if (window.Game) Game.afterUI(); };
  var t = null;
  $('nbSearch').addEventListener('input', function () { clearTimeout(t); t = setTimeout(render, 120); });
  $('nbMet').addEventListener('change', render);
  $('nbFlag').addEventListener('change', render);
  $('nbClose').addEventListener('click', NB.close);
  /* m7: one Print or save button: it asks which, so the Notebook's bar has one button fewer */
  NB.printOrSave = async function () {
    var v = await UI.modal('Print or save', '<p>The viva morning sheet: the seven lines, the chain and the numbers on one page.</p>', [{ label: 'Print it', value: 'print', cls: 'go' }, { label: 'Save it as a file', value: 'save' }, { label: 'Back', value: 0 }]);
    if (v === 'print') NB.print(); else if (v === 'save') NB.saveSheet();
  };
  $('nbPrint').addEventListener('click', NB.printOrSave);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('notebook').classList.contains('hidden')) NB.close(); });
  window.Notebook = NB;
})();
