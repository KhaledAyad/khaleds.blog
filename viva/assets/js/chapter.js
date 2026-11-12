/* Freight City Viva v2: the Chapter Map (go there, replay, restart, readiness, endings), Settings, the save code and the resets. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return UI.esc(s); };
  var CM = {};
  var ST = function () { return Game.state; };
  var SC = function () { return FCV.data.script; };
  var undoState = null;
  var COPY = function () { return SC().session_copy; };

  function pips(n) {
    var st = ST(), steps = FCV.actSteps(n), next = FCV.nextSteps(st, n).map(function (s) { return s.id; });
    return '<span class="pips" aria-label="' + steps.filter(function (s) { return FCV.isDone(st, n, s.id); }).length + ' of ' + steps.length + ' steps">' +
      steps.map(function (s) { return '<i class="' + (FCV.isDone(st, n, s.id) ? 'd' : next.indexOf(s.id) >= 0 ? 'n' : '') + '" title="' + esc(s.title) + '"></i>'; }).join('') + '</span>';
  }
  function parcelsFor(n) {
    var st = ST(), ids = []; SC().acts.forEach(function (a) { ids = ids.concat(a.parcels.ids || []); });
    ids = ids.filter(function (id) { var h = FCV.parcelHome(id); return h && h.kind === 'act' && h.act === n; });
    return { got: ids.filter(function (id) { return st.parcels.delivered[id]; }).length, total: ids.length };
  }
  function minsLeft(n) {
    var st = ST(), steps = FCV.actSteps(n), left = steps.filter(function (s) { return !FCV.isDone(st, n, s.id); }).length;
    return Math.max(left ? 3 : 0, Math.round(FCV.MIN[n] * left / steps.length));
  }
  function statusHTML() {
    var s = Save.status(), sc = COPY().save_status, ago = s.at ? Math.max(1, Math.round((Date.now() - s.at) / 1000)) : 0;
    var agoTxt = ago < 60 ? ago + ' s' : ago < 3600 ? Math.round(ago / 60) + ' min' : Math.round(ago / 3600) + ' h';
    var txt = CM.statusText ? CM.statusText() : s.kind === 'account' ? sc.account.replace('[t]', agoTxt) : s.kind === 'device' ? sc.device : sc.none;
    return '<div class="statusLine ' + s.kind + '" role="status"><span data-status="1">' + esc(txt) + '</span> <button class="btn small" type="button" data-act="code">Save code</button></div>';
  }
  CM.statusText = function () {
    var s = Save.status(), sc = COPY().save_status;
    return s.kind === 'account' ? sc.account.replace('[t]', s.at ? Math.max(1, Math.round((Date.now() - s.at) / 1000)) + ' s' : 'a moment') : s.kind === 'device' ? sc.device : sc.none;
  };

  CM.open = function () {
    var st = ST(), sc = SC(), cs = FCV.chainState(st);
    var rows = [];
    rows.push('<div class="cmRow"><div class="cmHead"><b>Prologue</b><small>Freight City, and a parcel addressed to the Viva Hall</small></div><div class="cmBtns"><button class="btn small" type="button" data-act="replay-cold">Replay the cold open</button></div></div>');
    sc.acts.forEach(function (a, i) {
      var n = i + 1, open = FCV.actOpen(st, n), done = FCV.actDone(st, n), as = FCV.actState(st, n), pc = parcelsFor(n);
      var ready = Math.round(FCV.readiness(st, FCV.actItems(n)) * 100);
      rows.push('<div class="cmRow' + (open ? '' : ' locked') + '"><div class="cmHead"><b>Act ' + n + ': ' + esc(a.district.name) + '</b><small>Chapter ' + a.chapter + '. ' + esc(a.title.replace(/^Chapter \d+\s+/, '')) + '</small></div>' +
        (open ? '<div class="cmInfo">' + pips(n) + (as.stamp ? '<span class="stamp ' + as.stamp + '">' + as.stamp + '</span>' : '') + (pc.total ? '<span class="chip">Evidence ' + pc.got + '/' + pc.total + '</span>' : '') +
          '<span class="chip">Ready ' + ready + '%</span>' + (done ? '<span class="chip">Cleared</span>' : '<span class="chip">About ' + minsLeft(n) + ' min left</span>') + '</div>' +
          '<div class="cmBtns"><button class="btn small go" type="button" data-act="go" data-n="' + n + '">Go there</button><button class="btn small" type="button" data-act="replay" data-n="' + n + '">Replay</button><button class="btn small" type="button" data-act="restart" data-n="' + n + '">Restart act</button></div>'
          : '<div class="cmInfo"><small>Opens when Act ' + (n - 1) + ' is cleared.</small></div>') + '</div>');
    });
    rows.push('<div class="cmRow"><div class="cmHead"><b>The Evidence Locker</b><small>The appendices, one room each. Open any time.</small></div><div class="tilesRow">' + sc.evidence_locker.rooms.map(function (r) {
      var rs = st.rooms[r.id] || {};
      return '<div class="roomTile' + (rs.badge ? ' done' : '') + '"><b>' + esc(r.name) + '</b><small>Appendix ' + esc(r.appendices.join(', ')) + ' · ' + (rs.badge ? 'secured' : 'stage ' + (rs.stage || 0) + ' of 4') + '</small>' +
        '<span><button class="btn small" type="button" data-act="goroom" data-r="' + r.id + '">Go there</button><button class="btn small" type="button" data-act="restartroom" data-r="' + r.id + '">Restart</button></span></div>';
    }).join('') + '</div></div>');
    var vopen = FCV.vivaOpen(st);
    rows.push('<div class="cmRow' + (vopen ? '' : ' locked') + '"><div class="cmHead"><b>The Viva Hall</b><small>' + (vopen ? esc(Viva.readiness()) : 'Opens after Act 7 with at least ' + FCV.BADGES_FOR_VIVA + ' badges. You have ' + FCV.badges(st) + '.') + '</small></div>' +
      '<div class="cmInfo"><span class="stampRow">' + st.viva.results.map(function (r) { return '<span class="rstamp ' + r.ending + '" title="Attempt ' + r.attempt + ', ' + new Date(r.at || 0).toLocaleDateString('en-GB') + ', hearts ' + r.hearts + ', met ' + (r.met || '') + '">' + ({ fail: 'NA', major: 'MAJ', minor: 'MIN', none: 'NO' }[r.ending]) + '</span>'; }).join('') + '</span>' +
      (st.viva.paused ? '<span class="chip">Paused at question ' + (st.viva.paused.pos + 1) + '</span>' : '') + '</div>' +
      '<div class="cmBtns">' + (vopen ? '<button class="btn small go" type="button" data-act="viva">' + (st.viva.paused ? 'Carry on' : 'Enter') + '</button>' : '') +
      (st.viva.paused ? '<button class="btn small" type="button" data-act="restartviva">Restart the viva</button>' : '') + '<button class="btn small" type="button" data-act="resetviva">Reset viva history</button></div></div>');
    var endings = ['major', 'minor', 'none', 'fail'].filter(function (e) { return st.cuts['ending:' + e]; });
    rows.push('<div class="cmRow"><div class="cmHead"><b>Endings</b><small>' + (endings.length ? 'Replay what you have earned.' : 'None earned yet.') + '</small></div><div class="cmBtns">' + endings.map(function (e) { return '<button class="btn small" type="button" data-act="ending" data-e="' + e + '">' + esc({ major: 'Major corrections', minor: 'Minor corrections', none: 'No corrections', fail: 'Not awarded' }[e]) + '</button>'; }).join('') + '</div></div>');
    rows.push('<div class="cmRow"><div class="cmHead"><b>The spine</b><small>Sure and wrong: ' + FCV.sureWrongCount(st) + '</small></div><div class="cmInfo chainRow">' + sc.spine.chain.map(function (c, i) {
      var lit = cs.lit[c.link]; return '<button class="pip ' + (lit || '') + '" type="button" data-act="link" data-l="' + c.link + '" ' + (lit ? '' : 'disabled') + '>' + (i + 1) + (lit === 'proposed' ? ' proposed' : '') + '</button>';
    }).join('') + '</div><div class="cmInfo manifest">' + sc.spine.manifest.map(function (m) { var tick = cs.ticks[m.objective]; return '<span class="chip' + (tick ? ' on' : '') + '">' + (tick ? 'Done: ' : '') + esc((FCV.resolve(m.objective) || {}).figure || m.objective) + '</span>'; }).join('') + '</div></div>');
    $('cmBody').innerHTML = statusHTML() + rows.join('');
    $('chapter').classList.remove('hidden'); UI.letterbox();
    bind();
    try { $('cmClose').focus(); } catch (e) {}
  };
  CM.close = function () { $('chapter').classList.add('hidden'); UI.letterbox(); Game.afterUI(); };
  function bind() {
    Array.prototype.forEach.call($('cmBody').querySelectorAll('[data-act]'), function (b) {
      b.addEventListener('click', async function () {
        var act = b.getAttribute('data-act'), n = +b.getAttribute('data-n'), r = b.getAttribute('data-r');
        if (act === 'go') { CM.close(); Game.travelToAct(n); }
        else if (act === 'goroom') { CM.close(); Game.travelTo({ kind: 'room', room: r }); }
        else if (act === 'replay') { await replayMenu(n); }
        else if (act === 'restart') { await restartAct(n); CM.open(); }
        else if (act === 'restartroom') { await restartRoom(r); CM.open(); }
        else if (act === 'viva') { CM.close(); Game.runFlow(function () { return ST().settings.family ? Flows.vivaDoor() : Viva.start(!!ST().viva.paused); }); } /* FD4-01: the door's hold in family mode */
        else if (act === 'restartviva') { var ok = await Viva.walkOut(true); if (ok) { CM.close(); Game.runFlow(function () { return Viva.start(false); }); } else CM.open(); }
        else if (act === 'resetviva') { await resetViva(); CM.open(); }
        else if (act === 'ending') { CM.close(); await replayEnding(b.getAttribute('data-e')); }
        else if (act === 'link') { await linkTabs(b.getAttribute('data-l')); }
        else if (act === 'replay-cold') { CM.close(); await Flows.coldOpen(); }
        else if (act === 'code') { await CM.saveCode(); }
      });
    });
  }
  async function replayMenu(n) {
    var a = SC().acts[n - 1], st = ST(), steps = FCV.actSteps(n);
    var items = steps.filter(function (s) { return FCV.isDone(st, n, s.id); }).map(function (s) {
      var teaches = s.kind === 'scene' ? (a.scenes[s.idx].lines.filter(function (l) { return l.fact; }).map(function (l) { return [].concat(l.fact)[0]; }).slice(0, 3).join(', ')) : s.kind === 'tp' ? a.turning_point.ref : s.kind === 'rehearsal' ? s.question : '';
      return { label: s.title, sub: teaches ? 'Teaches ' + teaches : '', value: s.id };
    });
    if (!items.length) { UI.toast('Nothing to replay yet in Act ' + n + '.', 2000); return; }
    CM.close();
    await Game.runFlow(async function () {
      UI.open('Replay: Act ' + n, 'Replaying never changes your progress.', FCV.actBackdrop[n]);
      var v;
      try { v = await UI.menu(null, 'Pick what to replay.', items.concat([{ label: 'Back', value: 'back', tag: 'EXIT' }])); } catch (e) { v = 'back'; }
      UI.close();
      if (v && v !== 'back') await Flows.actStep(n, v, true);
    });
  }
  async function restartAct(n) {
    var c = COPY().restart_act;
    var v = await UI.modal(c.title.replace('[n]', n), '<p>' + esc(c.body) + '</p>', [{ label: c.no, value: 0, cls: 'go' }, { label: c.yes, value: 1 }]);
    if (!v) return;
    var as = FCV.actState(ST(), n), stamp = as.stamp; Save.backup(JSON.stringify(ST()));
    ST().acts[n] = { done: [], mission: null, side: {}, corner: {}, stamp: stamp, sideStamp: as.sideStamp, mock: as.mock }; Save.markReset(ST(), 'act', n);
    Game.save(); Game.refresh();
  }
  async function restartRoom(id) {
    var room = FCV.room(id), c = COPY().restart_room;
    var v = await UI.modal(c.title.replace('[room]', room.name), '<p>' + esc(c.body) + '</p>', [{ label: c.no, value: 0, cls: 'go' }, { label: c.yes, value: 1 }]);
    if (!v) return;
    var rs = FCV.roomState(ST(), id); Save.backup(JSON.stringify(ST()));
    ST().rooms[id] = { stage: 0, done: {}, badge: rs.badge, cornerDone: false, visited: true, corner: {}, replaying: !!rs.badge }; Save.markReset(ST(), 'room', id);
    Game.save(); Game.refresh();
  }
  async function resetViva() {
    var c = COPY().reset_viva_history;
    var v = await UI.modal(c.title, '<p>' + esc(c.body) + '</p>', [{ label: c.no, value: 0, cls: 'go' }, { label: c.yes, value: 1, hold: true }]);
    if (!v) return;
    await Game.snapshot('Before a viva history reset');
    Save.backup(JSON.stringify(ST()));
    var hs = ST().viva.hallSeen; ST().viva = FCV.newState().viva; ST().viva.hallSeen = hs; if (Save.markReset) Save.markReset(ST(), 'viva');
    Game.save();
  }
  async function replayEnding(e) {
    var fin = SC().finale;
    if (e === 'fail') await UI.cutscene(fin.fail.cutscene);
    else if (e === 'major') await UI.cutscene(fin.endings.filter(function (x) { return x.id === 'major'; })[0].cutscene);
    else { var hi = fin.endings.filter(function (x) { return x.id === 'pass_high'; })[0]; await UI.cutscene(hi.cutscene.map(function (s) { return s.variant ? Object.assign({}, s, { subtitle: s.variant[e] || s.subtitle }) : s; })); }
  }
  async function linkTabs(link) {
    var c = SC().spine.chain.filter(function (x) { return x.link === link; })[0], r = FCV.resolve(c.claim);
    var obj = c.objection.map(function (id) { var o = FCV.resolve(id); if (!o) return ''; var q = o.type === 'bank' ? o.q : o.question, a = o.type === 'bank' ? o.options[o.answer] : o.answer; return '<details><summary>' + esc(q) + '</summary>' + UI.skimHTML('Answer', a, o.loc, true) + '</details>'; }).join('');
    await UI.modal(r.figure, '<div class="tabs"><details open><summary>Claim</summary>' + UI.cardHTML(c.claim, { noMet: true }) + '</details><details><summary>Evidence</summary>' + c.evidence.map(function (id) { return UI.cardHTML(id, { noMet: true }); }).join('') + '</details><details><summary>Objection</summary>' + obj + '</details></div>', [{ label: 'Close', value: 1, cls: 'go' }]);
  }

  /* ---------------- save code and file ---------------- */
  CM.saveCode = async function () {
    var st = ST(), code = await Save.exportCode(st), ex = COPY().export, dl = Save.downloads();
    var html = '<p>' + esc(ex.body) + '</p><label for="codeOut">Your save code (' + Math.round(code.length / 1024 * 10) / 10 + ' KB)</label><textarea id="codeOut" readonly rows="4">' + esc(code) + '</textarea>' +
      '<label for="codeIn">Load a save: paste a code, or pick a file</label><textarea id="codeIn" rows="3" placeholder="FCV2..."></textarea><input type="file" id="codeFile" accept=".json,.txt,application/json">';
    var buttons = [{ label: 'Done', value: 'done', cls: 'go' }, { label: ex.copy, value: 'copy' }].concat(dl ? [{ label: ex.file, value: 'file' }] : []).concat([{ label: 'Load this save', value: 'load', withInput: '#codeIn' }]);
    var res = await UI.modal('Save code', html, buttons, { onOpen: function (box) {
      var f = box.querySelector('#codeFile'); if (f) f.addEventListener('change', function () { var file = f.files && f.files[0]; if (!file) return; file.text().then(function (t) { box.querySelector('#codeIn').value = t; }); });
    } });
    var v = res && res.value !== undefined ? res.value : res;
    if (v === 'copy') { try { await navigator.clipboard.writeText(code); UI.toast('Code copied.', 1800); st.lastExport = Date.now(); Game.save(); } catch (e) { UI.toast('Copy did not work here. Select the code and copy it by hand.', 3000); } return CM.saveCode(); }
    if (v === 'file') { try { await Save.saveFile(st); st.lastExport = Date.now(); Game.save(); UI.toast('Save file offered.', 1800); } catch (e) { if (!e || e.code !== 'declined') UI.toast('The file did not save. Copy the code instead.', 3000); } return; }
    if (v === 'load') { await CM.importText(res.input); }
  };
  CM.importText = async function (text) {
    if (!text || !text.trim()) { UI.toast('Paste a code or pick a file first.', 2400); return; }
    var other;
    try { other = await Save.importFile(text); } catch (e) { await UI.modal('Save code', '<p>' + (e && /^Paste/.test(e.message) ? UI.esc(e.message) : 'That code is damaged. Copy it again.') + '</p>', [{ label: 'OK', value: 1, cls: 'go' }]); return; }
    var ic = COPY().import;
    var body = ic.body.replace('[summary]', Save.summary(ST())).replace('[summary]', Save.summary(other));
    var v = await UI.modal(ic.title, '<p>' + esc(body) + '</p>', [{ label: ic.no, value: 0, cls: 'go' }, { label: ic.yes, value: 1 }]);
    if (!v) return;
    Save.backup(JSON.stringify(ST()));
    Game.replaceState(other);
    UI.toast('Save loaded.', 2000);
  };

  /* ---------------- settings ---------------- */
  CM.settings = async function () {
    var s = ST().settings;
    var sel = function (id, label, opts) { return '<label class="set" for="set_' + id + '">' + esc(label) + ' <select id="set_' + id + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(s[id]) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>'; };
    var chk = function (id, label) { return '<label class="set" for="set_' + id + '"><input type="checkbox" id="set_' + id + '"' + (s[id] ? ' checked' : '') + '> ' + esc(label) + '</label>'; };
    var html = '<div class="setGrid">' + sel('textSpeed', 'Text speed', [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']]) + sel('textSize', 'Text size', [['normal', 'Normal'], ['large', 'Large'], ['larger', 'Larger']]) +
      chk('skipSeen', 'Skip seen dialogue') + chk('music', 'Music') + chk('effects', 'Sound effects') +
      '<label class="set" for="set_volume">Volume <input type="range" id="set_volume" min="0" max="1" step="0.1" value="' + s.volume + '"></label>' +
      chk('previously', 'Previously, when you come back') + chk('autoplay', 'Play cutscene videos (off: stills only)') + chk('timers', 'Timers in runs and the whistle') +
      chk('calmCity', 'Calm city (no Kerb Inspectors)') + chk('voice', 'Examiner voice in the viva') + chk('hardViva', 'Hard viva (45 second answer clock)') + chk('reduceMotion', 'Reduce motion') + chk('ticker', 'Freight FM ticker') + '</div>';
    await UI.modal('Settings', html, [{ label: 'Done', value: 1, cls: 'go' }], { onOpen: function (box) {
      Array.prototype.forEach.call(box.querySelectorAll('select, input'), function (el) {
        el.addEventListener('change', function () {
          s = ST().settings; var k = el.id.replace('set_', ''); s[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
          FCV.stampSettings(ST()); Game.applySettings(); Game.save();
        });
      });
    } });
  };

  /* ---------------- the menu and resets ---------------- */
  CM.menu = async function () {
    var st = ST();
    var html = statusHTML() + '<p>Badges: ' + FCV.badges(st) + ' of 17. Items due: ' + FCV.dueList(st).length + '. Viva attempts: ' + st.viva.attempt + '.</p>' +
      '<p class="small">Keys: WASD or arrows to pedal, Shift to pedal hard, Space for the bell, C for the Chapter Map, N for the notebook, M for the map, Esc for this menu.</p>';
    var btns = [{ label: 'Back to the game', value: 'close', cls: 'go' }, { label: 'Chapter Map', value: 'chapter' }, { label: 'Settings', value: 'settings' }, { label: 'Save code', value: 'code' },
      { label: 'End shift', value: 'end' }, { label: 'Reset the story', value: 'rstory' }, { label: 'Reset viva history', value: 'rviva' }, { label: 'Start again from nothing', value: 'rall', cls: 'danger' }];
    if (CM.wipeUndo()) btns.push({ label: COPY().reset_everything.undo, value: 'undo' });
    var v = await UI.modal('Menu', html, btns, { onOpen: function (box) { var b = box.querySelector('[data-act="code"]'); if (b) b.addEventListener('click', function () { $('modal').classList.add('hidden'); CM.saveCode(); }); } });
    if (v === 'chapter') CM.open();
    else if (v === 'settings') CM.settings();
    else if (v === 'code') CM.saveCode();
    else if (v === 'end') Game.runFlow(function () { return Flows.endShift(); });
    else if (v === 'rstory') { var c = COPY().reset_story; var ok = await UI.modal(c.title, '<p>' + esc(c.body) + '</p>', [{ label: c.no, value: 0, cls: 'go' }, { label: c.yes, value: 1, hold: true }]); if (ok) { var beforeR = JSON.stringify(ST()); await Game.snapshot('Before a story reset'); st = ST(); Save.backup(JSON.stringify(st)); if (Save.markReset) Save.markReset(st, 'story'); st.acts = {}; st.rooms = {}; st.parcels = { picked: {}, delivered: {}, bag: [] }; st.lastTp = 0; st.newV3 = {}; st.resume = null; st.resumeStep = null; Game.flush(); Game.refresh(); Game.respawn(); /* D2-m8: the same 30 s Undo as a Map restart */ if (window.WorldMap && WorldMap.offerUndo) WorldMap.offerUndo('Story reset.', beforeR, null, { scope: 'story' }); } }
    else if (v === 'rviva') { await resetViva(); }
    else if (v === 'rall') { await CM.wipe(); }
    else if (v === 'undo') { CM.undoWipe(); }
  };
  CM.wipe = async function () {
    var c = COPY().reset_everything;
    var v = await UI.modal(c.title, '<p>' + esc(c.body) + '</p>', [{ label: c.no, value: 0, cls: 'go' }, { label: c.yes, value: 1, cls: 'danger', needsType: true }], { typeToConfirm: c.type_to_confirm });
    if (!v) return false;
    undoState = JSON.parse(JSON.stringify(ST())); undoState.__wipedAt = Date.now();
    try { sessionStorage.setItem('fcv3-undo-wipe', JSON.stringify(undoState)); } catch (e) {}
    Save.backup(JSON.stringify(ST()));
    var fresh = FCV.newState(); fresh.settings = ST().settings; fresh.days = ST().days; fresh.epochs = Object.assign({}, ST().epochs || {}); Save.markReset(fresh, 'all');
    Game.replaceState(fresh);
    UI.toast('Wiped. Undo the wipe is in the Menu and in Resets until you close the game.', 4000);
    return true;
  };
  /* Undo the wipe: kept for this tab (it survives a reload) until the game closes. */
  /* Hidden once a new act step has been done since the wipe (the new run has begun). */
  CM.wipeUndo = function () {
    if (!undoState) { try { var raw = sessionStorage.getItem('fcv3-undo-wipe'); if (raw) undoState = JSON.parse(raw); } catch (e) {} }
    var cur = ST();
    if (undoState && cur && Object.keys(cur.acts || {}).some(function (n) { return ((cur.acts[n] || {}).done || []).length > 0; })) return null;
    return undoState;
  };
  /* Undo the wipe: a Time Machine snapshot first, and learning memory earned since the wipe is kept (newer record wins). */
  CM.undoWipe = async function () {
    var u = CM.wipeUndo(); if (!u) return false;
    await Game.snapshot('Before undoing the wipe');
    var cur = ST(); u = JSON.parse(JSON.stringify(u)); delete u.__wipedAt;
    u.mem = u.mem || {}; Object.keys((cur && cur.mem) || {}).forEach(function (id) { var nw = cur.mem[id], o = u.mem[id]; if (!o || (nw.last || 0) > (o.last || 0) || ((nw.last || 0) === (o.last || 0) && (nw.seen || 0) > (o.seen || 0))) u.mem[id] = nw; });
    u.met = Object.assign({}, u.met || {}, (cur && cur.met) || {});
    u.epochs = Object.assign({}, u.epochs || {}); Save.markReset(u, 'all');
    Game.replaceState(u); undoState = null; try { sessionStorage.removeItem('fcv3-undo-wipe'); } catch (e) {}
    Game.flush(); UI.toast('Restored. Everything is back as it was before the wipe.', 3000); return true;
  };
  CM.restartAct = restartAct;
  $('cmClose').addEventListener('click', CM.close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('chapter').classList.contains('hidden')) CM.close(); });
  CM.linkTabs = linkTabs;
  window.Chapter = CM;
})();
