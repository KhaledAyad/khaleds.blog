/* Freight City Viva v3: collectibles. The Evidence Card Album (only answering colours a card), the passport, Courier Rank
   and XP, garage packs from a whitelisted palette, the co-pilot's sticker book, and 50 achievements (one toast per 4 s). */
(function () {
  'use strict';
  /* QAD4-05: the number of Academy lessons in an achievement's words comes from the Academy itself (it has grown since the
     words were written) */
  function earnedBy(a) { var n = window.FCV && FCV.data && FCV.data.script.methods_academy ? FCV.data.script.methods_academy.lessons.length : 0; var t = window.FCV && FCV.data ? FCV.data.facts.trace_the_number.filter(function (x, i) { return !FCV.TRACE_NOT_ASKED['trace-' + String(i + 1).padStart(2, '0')]; }).length : 0; return String(a.earned_by || '').replace(/\ball \d+ lessons\b/, function (m) { return n ? 'all ' + n + ' lessons' : m; }).replace(/\ball \d+ traces\b/, function (m) { return t ? 'all ' + t + ' traces' : m; }); }
  var Al = {}, $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return UI.esc(s); };
  var S = function () { return Game.state; };
  var SC = function () { return FCV.data.script; };
  var queue = [], showing = false;
  var PALETTE = ['#ff8a3d', '#19c2b0', '#ffd166', '#ff3d8b', '#7a5cff', '#3ddc84', '#16a0d8', '#fff3e0'];
  var COSMETIC = ['box wrap', 'frame colour', 'bell', 'wheel lights', 'flag', "Docket's hat", 'horn'];

  /* ---------------- the album: 442 cards ---------------- */
  Al.cards = function () {
    if (Al._cards) return Al._cards;
    var d = FCV.data, out = [];
    d.story.acts.forEach(function (a, i) { a.key_facts.forEach(function (k) { out.push({ id: k.id, page: 'Chapter ' + (i + 1) }); }); });
    d.facts.appendices.forEach(function (ap) { ap.key_facts.forEach(function (k, i) { out.push({ id: 'app-' + ap.letter + '-f' + (i + 1), page: 'Appendix ' + ap.letter }); }); });
    d.story.glossary.forEach(function (g) { if (!/^Link \d/.test(g.term)) out.push({ id: 'glossary:' + g.term, page: 'Glossary' }); });
    d.story.thesis.five_links.forEach(function (l) { out.push({ id: 'link-' + l.link, page: 'The chain' }); });
    d.story.thesis.propositions.forEach(function (p) { out.push({ id: p.id, page: 'Propositions' }); });
    d.facts.gaps_and_honest_answers.forEach(function (g, i) { out.push({ id: 'gap-' + String(i + 1).padStart(2, '0'), page: 'Gaps' }); });
    d.facts.trace_the_number.forEach(function (t, i) { out.push({ id: 'trace-' + String(i + 1).padStart(2, '0'), page: 'Trace the number' }); });
    FCV.methods.forEach(function (m) { out.push({ id: 'method:' + m.id, page: 'Methods Academy' }); });
    Al._cards = out.filter(function (c) { return FCV.resolve(c.id); });
    return Al._cards;
  };
  Al.stateOf = function (id) {
    var st = S(), stage = Mastery.stage(id), r = st.mem[id] || st.mem['recall:' + id] || st.mem['say:' + id];
    if (r && r.sureWrong && r.lastOutcome === 'wrong') return 'cracked';
    if (stage >= 4) return 'mastered';
    if (stage >= 2) return 'learnt';
    if (st.met[id] || stage === 1) return 'met';
    return 'sealed';
  };
  Al.open = async function () {
    var cards = Al.cards(), pages = {}, counts = { sealed: 0, met: 0, learnt: 0, mastered: 0, cracked: 0 };
    cards.forEach(function (c) { (pages[c.page] = pages[c.page] || []).push(c); counts[Al.stateOf(c.id)]++; });
    var names = Object.keys(pages);
    /* SD-32: one plain line, and tabs (Chapters, Appendices, More) with a row of pages, never a 28-line drop-down */
    var tabsOf = { Chapters: names.filter(function (n) { return /^Chapter/.test(n); }), Appendices: names.filter(function (n) { return /^Appendix/.test(n); }) };
    tabsOf.More = names.filter(function (n) { return tabsOf.Chapters.indexOf(n) < 0 && tabsOf.Appendices.indexOf(n) < 0; });
    var html = '<p>Cards fill in when you answer them right. ' + (counts.learnt + counts.mastered) + ' of ' + cards.length + ' filled in so far.</p>' +
      '<div class="setTabs" role="tablist">' + Object.keys(tabsOf).map(function (t, i) { return '<button class="btn small' + (i ? '' : ' go') + '" type="button" role="tab" data-atab="' + t + '" aria-selected="' + !i + '">' + t + '</button>'; }).join('') + '</div>' +
      '<div class="alPages" id="alPages"></div><div id="alGrid" class="albumGrid"></div>';
    var p = UI.modal('Evidence Card Album', html, [{ label: 'Close', value: 0, cls: 'go' }], { onOpen: function (box) {
      box.style.width = 'min(1000px, 100%)';
      var page = names[0];
      var draw = function () {
        var pg = page;
        box.querySelector('#alGrid').innerHTML = pages[pg].map(function (c) {
          var s = Al.stateOf(c.id), r = FCV.resolve(c.id);
          var t = s === 'sealed' ? '' : esc(UI.plainFigure(r.figure || r.number || r.gap || '').slice(0, 60));
          return '<button class="aCard ' + s + '" type="button" data-id="' + esc(c.id) + '" aria-label="' + esc((s === 'sealed' ? 'Not filled in yet' : 'Card: ' + (r.figure || r.number || ''))) + '"><b>' + (t || (s === 'sealed' ? 'Not yet' : esc(r.label || 'Card'))) + '</b><span>' + (s === 'sealed' ? 'Answer it right to fill it in' : esc(FCV.firstSentence(r.text || r.means || r.gap || '').slice(0, 90))) + '</span></button>';
        }).join('');
        Array.prototype.forEach.call(box.querySelectorAll('.aCard'), function (b) { b.addEventListener('click', function () { Al.cardDetail(b.getAttribute('data-id')); }); });
      };
      var pagesRow = function (t) {
        var row = box.querySelector('#alPages');
        row.innerHTML = tabsOf[t].map(function (n) { var short = n.replace(/^Chapter (\d)$/, 'Chapter $1').replace(/^Appendix ([A-O])$/, '$1'); return '<button class="chip' + (n === page ? ' on' : '') + '" type="button" data-pg="' + esc(n) + '" title="' + esc(n) + '">' + esc(short) + '</button>'; }).join('');
        Array.prototype.forEach.call(row.querySelectorAll('[data-pg]'), function (b) { b.addEventListener('click', function () { page = b.getAttribute('data-pg'); pagesRow(t); draw(); }); });
      };
      Array.prototype.forEach.call(box.querySelectorAll('[data-atab]'), function (b) { b.addEventListener('click', function () { var t = b.getAttribute('data-atab'); Array.prototype.forEach.call(box.querySelectorAll('[data-atab]'), function (x) { x.classList.toggle('go', x === b); x.setAttribute('aria-selected', x === b); }); page = tabsOf[t][0]; pagesRow(t); draw(); }); });
      pagesRow('Chapters'); draw();
    } });
    return p;
  };
  Al.cardDetail = async function (id) {
    var st = S(), s = Al.stateOf(id), where = Flows.placeOf(id), tests = (Mastery.item(id) || {}).probes || [];
    var html = (s === 'sealed' ? '<p>Sealed. Meet it in the story, or drill it now.</p>' : UI.cardHTML(id, { noMet: true })) +
      '<p class="small">How well you know it: ' + esc(['not met yet', 'seen once', 'practised', 'remembered', 'spaced out', 'proven'][Mastery.stage(id)] || 'not met yet') + '. Where it lives: ' + esc(where ? where.label : 'its chapter') + '. Asked in ' + tests.length + (tests.length === 1 ? ' place' : ' places') + '.</p>';
    var mx = /^method:/.test(id) && SC().methods_academy.lessons.filter(function (l) { return l.id === id && l.explainer; })[0];
    $('modal').classList.add('hidden');
    var v = await UI.modal('Card', html, [{ label: 'Drill this', value: 'drill', cls: 'go' }].concat(mx ? [{ label: 'Watch', value: 'watch' }] : []).concat(where ? [{ label: 'Go there', value: 'go' }] : []).concat([{ label: 'Back', value: 0 }]));
    if (v === 'drill') Game.runFlow(function () { return Missions.sprint('Drill this', [id].concat(tests)); });
    if (v === 'watch') Game.runFlow(function () { return Academy.explainer(mx); });
    if (v === 'go') Game.travelTo(where);
    void st;
  };

  /* ---------------- passport ---------------- */
  Al.passport = function () {
    var st = S(), rows = [];
    SC().acts.forEach(function (a, i) {
      var n = i + 1, as = st.acts[n] || {}, stars = 0, max = 0;
      Object.keys(st.stepStars).forEach(function (k) { if (k.indexOf('act' + n + ':') === 0) stars += st.stepStars[k]; });
      FCV.actSteps(n).forEach(function (s) { if (/scene|mission|methods|rehearsal|mock_viva|shift_check|on_air|ladder/.test(s.kind)) max += 3; });
      rows.push('<div class="cmRow' + (FCV.actDone(st, n) ? '' : ' locked') + '"><div class="cmHead"><b>Act ' + n + ': ' + esc(a.district.name) + '</b><small>' + (as.stamp ? '<span class="stamp ' + as.stamp + '">' + as.stamp + '</span> ' : '') + (as.mastered ? 'MASTERED · ' : '') + stars + ' of ' + max + ' stars</small></div>' + (FCV.actDone(st, n) ? UI.cardHTML(a.closer.card, { compact: true, noMet: true }) : '') + '</div>');
    });
    SC().evidence_locker.rooms.forEach(function (r) { var rs = st.rooms[r.id] || {}; rows.push('<div class="cmRow' + (rs.badge ? '' : ' locked') + '"><div class="cmHead"><b>' + esc(r.name) + '</b><small>' + (rs.badge ? 'Secured' : 'Not yet secured') + '</small></div></div>'); });
    Object.keys(SC().methods_academy.missions).forEach(function (k) { var mi = SC().methods_academy.missions[k], m = st.methods.missions[k] || {}; rows.push('<div class="cmRow' + (m.done ? '' : ' locked') + '"><div class="cmHead"><b>' + esc(mi.name) + '</b><small>' + (m.stamp ? '<span class="stamp ' + m.stamp + '">' + m.stamp + '</span>' : 'Not yet') + '</small></div></div>'); });
    return UI.modal('Passport', '<div style="display:grid;gap:8px">' + rows.join('') + '</div>', [{ label: 'Close', value: 0, cls: 'go' }]);
  };

  /* ---------------- XP, rank, garage ---------------- */
  function ranks() { return SC().collectibles.courier_rank.ranks.map(function (r) { var m = /^(.*?)\s([\d,]+)$/.exec(r); return { name: m[1], xp: +m[2].replace(/,/g, '') }; }); }
  Al.rank = function (xp) { var rs = ranks(), cur = rs[0]; rs.forEach(function (r) { if ((xp || 0) >= r.xp) cur = r; }); return cur; };
  Al.xp = function (n, why) {
    var st = S(); if (!st || Game.kidDrive) return;
    var day = FCV.today(); st.timings.xpDay = st.timings.xpDay === day ? day : day;
    var before = Al.rank(st.xp); st.xp = (st.xp || 0) + n; var after = Al.rank(st.xp);
    if (after.name !== before.name) { held.push(function () { UI.banner('Delivered.', 'Courier Rank: ' + after.name); Al.pack('Rank up'); }); Al.releaseHeld(); }
    void why;
  };
  Al.pack = function (why) {
    var st = S(), rng = FCV.rng(Date.now() >>> 0), got = [];
    for (var i = 0; i < 3; i++) { var k = FCV.pick(COSMETIC, rng), col = FCV.pick(PALETTE, rng); var id = k + ':' + col; st.garage.owned[id] = Date.now(); got.push(k); }
    st.garage.packs = (st.garage.packs || 0) + 1; Game.save();
    UI.toast('Garage pack (' + why + '): ' + got.join(', ') + '.', 3000);
  };
  Al.palette = PALETTE;

  /* ---------------- achievements ---------------- */
  var stamped = function (k) { return S().stepStars[k] === 3; };
  var memRight = function (id) { var r = S().mem[id] || S().mem['say:' + id]; return !!(r && r.right > 0); };
  var CHECK = {
    'ach-say-whole': function (st) { return memRight('thesis.one_sentence'); },
    'ach-aim-q': function (st) { return FCV.isDone(st, 1, 'on_air') && memRight('thesis.aim'); },
    'ach-chain-4': function (st) { var l = FCV.chainState(st).lit; return !!(l['link-1'] && l['link-2'] && l['link-3'] && l['link-4']); },
    'ach-hollow': function (st) { return !!FCV.chainState(st).lit['link-5']; },
    'ach-fog': function () { return stamped('act1:mission'); }, 'ach-net': function () { return stamped('act2:mission'); },
    'ach-whistle': function (st) { return (st.acts[3] || {}).stamp === 'gold'; }, 'ach-no-objection': function (st) { return (st.acts[4] || {}).stamp === 'gold'; },
    'ach-gate-gold': function (st) { return (st.acts[5] || {}).stamp === 'gold'; }, 'ach-balanced': function (st) { return (st.acts[6] || {}).stamp === 'gold'; },
    'ach-packed': function (st) { return (st.acts[7] || {}).stamp === 'gold'; },
    'ach-mock': function (st) { return FCV.isDone(st, 7, 'mock_viva'); },
    'ach-waiting-2': function (st) { return (st.wr && st.wr.streak3 || 0) >= 2; },
    'ach-room': function (st) { return Object.keys(st.rooms).some(function (r) { return st.rooms[r].badge; }); },
    'ach-honest': function (st) { return FCV.data.facts.gaps_and_honest_answers.every(function (g, i) { return memRight('gap-' + String(i + 1).padStart(2, '0')); }); },
    'ach-trace-15': function (st) { return FCV.data.facts.trace_the_number.every(function (t, i) { var id = 'trace-' + String(i + 1).padStart(2, '0'); return FCV.TRACE_NOT_ASKED[id] || memRight(id); }); }, /* QAD4-04: every trace that is asked */
    'ach-parcels': function (st) { var ids = FCV.parcelIds(st); return ids.length > 20 && ids.every(function (id) { return st.parcels.delivered[id]; }); },
    'ach-foil': function () { return Al.cards().filter(function (c) { return Al.stateOf(c.id) === 'mastered'; }).length >= 10; },
    'ach-sure-fixed': function (st) { return Object.keys(st.mem).filter(function (id) { return st.mem[id].sureWrong > 0 && st.mem[id].lastOutcome === 'right'; }).length >= 10; },
    'ach-fp': function () { return SC().drills.finding_or_proposition.items.every(function (x) { return memRight(x.id); }); },
    'ach-streak': function (st) { return (st.streak && st.streak.best || 0) >= 3; },
    'ach-academy-open': function (st) { return !!st.cuts.academy_entrance; },
    'ach-blueprint': function (st) { return (st.methods.missions.blueprint || {}).stamp === 'gold'; }, 'ach-interviews': function (st) { return (st.methods.missions.interviews || {}).stamp === 'gold'; },
    'ach-coding': function (st) { return (st.methods.missions.coding || {}).stamp === 'gold'; }, 'ach-quality': function (st) { return (st.methods.missions.quality || {}).stamp === 'gold'; },
    'ach-switchboard': function (st) { return (st.methods.missions.act4 || {}).stamp === 'gold'; }, 'ach-shuffle': function (st) { return (st.methods.missions.act5 || {}).stamp === 'gold'; },
    'ach-methods-all': function (st) { return SC().methods_academy.lessons.every(function (l) { return (st.methods.lessons[l.id] || {}).done; }); },
    'ach-explainers': function (st) { return Object.keys(st.cuts).filter(function (k) { return /^film:mx:/.test(k); }).length >= 15; },
    'ach-method-gaps': function (st) { return FCV.methods.filter(function (m) { return FCV.methodGap(m.id); }).every(function (m) { return memRight('method:' + m.id + ':gap'); }); },
    'ach-mastered-act': function (st) { return Object.keys(st.acts).some(function (n) { return st.acts[n].mastered; }); },
    'ach-tuneup': function (st) { return Mastery.ERR.every(function (e) { return st.wear && st.wear[e.code] === 0; }); },
    'ach-ready': function () { return /Ready|Viva-proof/.test(Mastery.readiness().band); }, 'ach-viva-proof': function () { return Mastery.readiness().band === 'Viva-proof'; },
    'ach-first-attempt': function (st) { return (st.viva.attempt || 0) >= 1; },
    'ach-back-again': function (st) { var r = st.viva.results || []; return r.some(function (x, i) { return x.ending === 'fail' && i < r.length - 1; }) || (st.viva.fails > 0 && st.viva.attempt > st.viva.fails); },
    'ach-verdicts': function (st) { return /minor|none|major/.test(st.viva.best || ''); },
    'ach-11': function (st) { return (st.viva.attempt || 0) >= 11; },
    'ach-teacher': function (st) { return Object.keys(st.copilot.tellAct).filter(function (k) { return st.copilot.tellAct[k] === 'up'; }).length >= 7; },
    'ach-copilot-100': function (st) { return (st.copilot.honks || 0) >= 100; },
    'ach-dash': function (st) { return Object.keys(st.copilot.races).length >= 7; },
    'ach-jumps': function (st) { return Object.keys(st.copilot.stunts).length >= 9; },
    'ach-chain-sprint': function (st) { return st.stepStars['chain-sprint'] === 3; }
  };
  Al.event = function (id) { var st = S(); if (!st.achievements[id]) { st.achievements[id] = Date.now(); toast(id); Al.xp(50, 'achievement'); Game.save(); } };
  Al.check = function () {
    var st = S(); if (!st || Game.kidDrive) return;
    SC().achievements.forEach(function (a) { var f = CHECK[a.id]; if (!st.achievements[a.id] && f) { var ok = false; try { ok = f(st); } catch (e) {} if (ok) { st.achievements[a.id] = Date.now(); toast(a.id); Al.xp(50, 'achievement'); } } });
  };
  /* Celebrations wait until no question, sheet, mini-game or viva is open, so they never cover an answer or Next. */
  var held = [];
  function quiet() { return !UI.busy() && !(window.Game && Game.isBusy()); }
  Al.releaseHeld = function () { if (!quiet()) return; while (held.length) { try { held.shift()(); } catch (e) {} } if (queue.length && !showing) next(); };
  setInterval(function () { if (held.length || (queue.length && !showing)) Al.releaseHeld(); }, 1500);
  function toast(id) { queue.push(id); if (!showing && quiet()) next(); }
  function next() {
    if (!quiet()) { showing = false; return; }
    var id = queue.shift(); if (!id) { showing = false; return; } showing = true;
    var a = SC().achievements.filter(function (x) { return x.id === id; })[0] || { name: id, earned_by: '' }, el = $('achToast');
    el.innerHTML = '<b>' + esc(a.name) + '</b><span>' + esc(earnedBy(a)) + '</span>'; el.classList.remove('hidden');
    if (window.Sound) Sound.sfx('badge flip');
    setTimeout(function () { el.classList.add('hidden'); setTimeout(next, 200); }, 3800);
  }
  Al.achievements = function () {
    var st = S();
    return UI.modal('Achievements', '<div class="albumGrid">' + SC().achievements.map(function (a) { var got = st.achievements[a.id]; return '<div class="aCard ' + (got ? 'learnt' : 'sealed') + '"><b>' + esc(a.name) + '</b><span>' + esc(earnedBy(a)) + '</span></div>'; }).join('') + '</div>', [{ label: 'Close', value: 0, cls: 'go' }], { onOpen: function (b) { b.style.width = 'min(1000px,100%)'; } });
  };
  /* SD-36: every sticker slot shows, earned or not; an empty slot says how to earn it */
  Al.stickers = function () {
    var st = S(), c = st.copilot || { stickers: {}, stunts: {}, races: {} }, fc = SC().session_copy.family, slots = [], n;
    for (n = 1; n <= 7; n++) slots.push({ got: !!c.stickers['teacher-' + n], name: 'Teacher, Act ' + n, how: 'After Dad explains a card in Act ' + n + ', press "' + fc.got_it + '".' });
    var jumps = Object.keys(c.stunts || {}).length;
    slots.push({ got: jumps > 0, name: 'Ramp jump' + (jumps > 1 ? ' (' + jumps + ')' : ''), how: 'Ride the bike over a ramp in the city.' });
    for (n = 1; n <= 7; n++) { var r = (c.races || {})['act' + n]; slots.push({ got: !!r, name: 'Race, Act ' + n + (r ? ': ' + r.medal : ''), how: 'Finish the Same Door Dash for Act ' + n + '.' }); }
    slots.push({ got: !!c.stickers['dot-patrol'], name: 'Dot patrol', how: 'Find five dots in Dot patrol.' });
    var k = 0, have = slots.filter(function (x) { return x.got; }).length;
    var html = '<p>' + have + ' of ' + slots.length + ' stickers. Each empty slot says how to earn it.</p><div class="stkGrid">' + slots.map(function (x) {
      var u = x.got ? FCV.assetUrl('GM-STK-' + String(++k).padStart(2, '0')) : null;
      return '<div class="stk' + (x.got ? ' got' : '') + '">' + (x.got ? '<i style="background:' + (u ? 'url(' + u + ') center/contain no-repeat #fff' : '#ffd166') + '"></i>' : '<i aria-hidden="true">?</i>') + '<b>' + esc(x.name) + '</b>' + (x.got ? '' : '<small>' + esc(x.how) + '</small>') + '</div>';
    }).join('') + '</div>';
    return UI.modal('Sticker book', html, [{ label: 'Close', value: 0, cls: 'go' }]);
  };
  window.Album = Al;
})();
