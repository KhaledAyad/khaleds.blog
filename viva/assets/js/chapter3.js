/* Freight City Viva v3: the phone pause menu (Map, Journey, Notebook, Save, Radio, Settings, Restart, Photo, Co-pilot),
   the Save screen (code, file, import side by side, the Time Machine, Save health, Test my save), Settings and
   accessibility, and Help > Copy a report. v2's Chapter Map stays as the World Map's list view. */
(function () {
  'use strict';
  var CM = window.Chapter, $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return UI.esc(s); };
  var ST = function () { return Game.state; };
  var SC = function () { return FCV.data.script; };
  var COPY = function () { return SC().session_copy; };

  CM.statusText = function () {
    var s = Save.status(), sc = COPY().save_status;
    if (!s.writer) return COPY().two_tabs.body;
    if (s.kind === 'account') {
      var t = s.at && Game.ago ? Game.ago(s.at) : '';
      if (s.retrying) return 'Saving... ' + (t ? 'last saved to your account ' + t + ' ago.' : 'not on your account yet. Get a save code to be safe.');
      if (!s.at) return 'Saving to your account...';
      return sc.account.replace('[t]', t);
    }
    return s.kind === 'device' ? sc.device : sc.none;
  };

  /* ---------------- the menu ---------------- */
  CM.menu = async function () {
    var st = ST(), fam = st.settings.family, fc = COPY().family;
    if (Game.kidDrive) {
      /* Kid drive: the menu offers only Give it back and the volume. */
      var kv = await UI.modal('Co-pilot driving', '<label class="set" for="kidVol">Volume <input type="range" id="kidVol" min="0" max="100" step="1" value="' + ((st.settings.audio && st.settings.audio.master !== undefined) ? st.settings.audio.master : 80) + '"></label>', [{ label: fc.give_back, value: 'give', cls: 'go' }, { label: 'Same Door Dash', value: 'dash' }, { label: 'Keep driving', value: 0 }], { onOpen: function (box) { var r = box.querySelector('#kidVol'); /* AUD-15: the co-pilot's Volume is the Everything level of the sound engine */ r.addEventListener('input', function () { if (!Game.kidDrive) return; var ss = ST().settings, a = ss.audio || (ss.audio = FCV.normAudio(null, ss)); a.master = Math.max(0, Math.min(100, Math.round(+r.value))); if (window.Sound) Sound.applyAudio(a); if (window.AudioCtl) AudioCtl.refresh(); }); } });
      /* QAD3-m4 (family): the timer ran out while this was open: Dad has his game back, so nothing here acts */
      if (!Game.kidDrive) return;
      if (kv === 'give') Family.giveBack();
      else if (kv === 'dash') { var kn = 0; for (var kk = 1; kk <= 7; kk++) if (FCV.actDone(st, kk)) kn = kk; if (!kn) UI.toast('The first race opens when Act 1 closes.', 2500); else Family.race(kn); }
      return;
    }
    var rd = Mastery.readiness(), cs = FCV.chainState(st);
    /* round 4 (items 68a and 68h): four main buttons and More; the chain, readiness and badges live here (the Journey) */
    var journey = '<div class="menuJourney" aria-label="Your journey"><span class="mjLab">The chain:</span>' + SC().spine.chain.map(function (c, i) { var l = cs.lit[c.link]; return '<button class="pip ' + (l === 'proposed' ? 'hollow' : l ? 'lit' : '') + '" type="button" data-l="' + c.link + '" title="' + (l ? 'Link ' + (i + 1) + ': open its claim, evidence and objection' : 'Lights at the ' + esc(c.lights_at)) + '">' + (i + 1) + '</button>'; }).join('') +
      '<button class="btn small" type="button" data-mv="ready">Readiness ' + rd.score + ', ' + esc(rd.band) + '</button><span class="chip">Badges ' + FCV.badges(st) + (FCV.badges(st) >= FCV.BADGES_FOR_VIVA ? ' · the Hall is open' : ' · the Hall opens at ' + FCV.BADGES_FOR_VIVA) + '</span></div>';
    var html = '<p class="statusLine ' + Save.status().kind + '" data-status="1">' + esc(CM.statusText()) + '</p><p class="small">' + esc(Extras.today()) + '</p>' + journey + (fam ? Family.journeyHTML() : '');
    var dot = function (k) { return Extras.isNew(k) ? ' newDot' : ''; };
    /* SD-11: four big buttons (Back to the game, Map, Notebook, Settings) and More; sound has its own buttons on every screen */
    var btns = [{ label: 'Back to the game', value: 'close', cls: 'go' }, { label: 'Map', value: 'map' }, { label: 'Notebook', value: 'nb', cls: dot('notebook') }, { label: 'Settings', value: 'settings' }, { label: 'More', value: 'more' }];
    var v = await new Promise(function (res) { UI.modal('Menu', html, btns, { onOpen: function (box) {
      Array.prototype.forEach.call(box.querySelectorAll('[data-l]'), function (b) { b.addEventListener('click', function () { $('modal').classList.add('hidden'); UI.letterbox(); res('link:' + b.getAttribute('data-l')); }); });
      Array.prototype.forEach.call(box.querySelectorAll('[data-mv]'), function (b) { b.addEventListener('click', function () { $('modal').classList.add('hidden'); UI.letterbox(); res(b.getAttribute('data-mv')); }); });
    } }).then(res); });
    if (v === 'more') v = await CM.more();
    CM.doMenu(v);
  };
  /* More: the rest, in small groups */
  CM.more = function () {
    var st = ST(), fam = st.settings.family, fc = COPY().family, dot = function (k) { return Extras.isNew(k) ? ' newDot' : ''; };
    var groups = [
      ['Your progress', [['save', 'Save'], ['recent', 'Recent'], ['films', 'Films', dot('films')], ['album', 'Album', dot('album')]]],
      ['More to look at', [['passport', 'Passport', dot('passport')], ['ach', 'Achievements'], ['film', 'Watch the story'], ['radio', 'Freight FM']]],
      ['How it works', [['plan', 'Plan a session'], ['controls', 'Controls'], ['help', 'Help'], ['end', 'End shift']]],
      /* QAD3-m10: never more than four choices: once Dot patrol opens, it and Same Door Dash share one Co-pilot games button */
      ['Playing together', [['family', fc.switch + (fam ? ' (on)' : ' (off)')]].concat(fam ? [['kid', fc.kid_drive], FCV.isDone(st, 6, 'scene:6.2') ? ['games', 'Co-pilot games'] : ['dash', 'Same Door Dash'], ['stickers', 'Sticker book']] : [])],
      ['Starting again', [['resets', 'Resets']].concat(CM.wipeUndo && CM.wipeUndo() ? [['undowipe', COPY().reset_everything.undo]] : []).concat(st.viva.best && st.viva.best !== 'fail' ? [['photo', 'Graduation photo']] : [])]
    ];
    /* QAD-m3: More opens as a few tiles, one per group; a tile opens its short list, with a way back to the tiles */
    var html = '<div class="moreTiles">' + groups.map(function (g, gi) { var nw = g[1].some(function (b) { return b[2]; }); return '<button class="btn moreTile' + (nw ? ' newDot' : '') + '" type="button" data-mg="' + gi + '">' + esc(g[0]) + '<small>' + esc(g[1].map(function (b) { return b[1].replace(/ \((on|off)\)$/, ''); }).slice(0, 3).join(', ') + (g[1].length > 3 ? '…' : '')) + '</small></button>'; }).join('') + '</div>' +
      groups.map(function (g, gi) { return '<div class="moreGroup" data-group="' + gi + '" hidden><h4>' + esc(g[0]) + '</h4><div class="moreRow">' + g[1].map(function (b) { return '<button class="btn small' + (b[2] || '') + '" type="button" data-mv="' + b[0] + '">' + esc(b[1]) + '</button>'; }).join('') + '</div><button class="linkBtn" type="button" data-mback="1">Back to More</button></div>'; }).join('');
    return new Promise(function (res) { UI.modal('More', html, [{ label: 'Back to the game', value: 'close', cls: 'go' }], { onOpen: function (box) {
      Array.prototype.forEach.call(box.querySelectorAll('[data-mv]'), function (b) { b.addEventListener('click', function () { $('modal').classList.add('hidden'); UI.letterbox(); res(b.getAttribute('data-mv')); }); });
      var tiles = box.querySelector('.moreTiles');
      Array.prototype.forEach.call(box.querySelectorAll('[data-mg]'), function (t) { t.addEventListener('click', function () { tiles.hidden = true; var g = box.querySelector('[data-group="' + t.getAttribute('data-mg') + '"]'); g.hidden = false; var f = g.querySelector('[data-mv]'); if (f) try { f.focus({ preventScroll: true }); } catch (e) {} }); });
      Array.prototype.forEach.call(box.querySelectorAll('[data-mback]'), function (bk) { bk.addEventListener('click', function () { Array.prototype.forEach.call(box.querySelectorAll('.moreGroup'), function (g) { g.hidden = true; }); tiles.hidden = false; var t0 = tiles.querySelector('[data-mg]'); if (t0) try { t0.focus({ preventScroll: true }); } catch (e) {} }); });
    } }).then(res); });
  };
  /* item 4: the toasts of this session, newest first, each with its action where it has one */
  CM.recent = async function () {
    var list = UI.recent();
    var html = list.length ? '<div class="hubList">' + list.map(function (r, i) { return '<div class="hubItem" style="cursor:default"><span>' + esc(r.text) + '<br><small>' + new Date(r.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + '</small></span>' + (r.action ? '<button class="btn small go" type="button" data-r="' + i + '">' + esc(r.action.label) + '</button>' : '') + '</div>'; }).join('') + '</div>' : '<p>Nothing yet this session.</p>';
    var pick = await new Promise(function (res) { UI.modal('Recent', html, [{ label: 'Done', value: -1, cls: 'go' }], { onOpen: function (box) { Array.prototype.forEach.call(box.querySelectorAll('[data-r]'), function (b) { b.addEventListener('click', function () { $('modal').classList.add('hidden'); UI.letterbox(); res(+b.getAttribute('data-r')); }); }); } }).then(res); });
    if (pick >= 0 && list[pick] && list[pick].action) try { list[pick].action.fn(); } catch (e) {}
  };
  /* item 29: Freight FM: change the station, and the cards on air today */
  CM.freightFM = async function () {
    var st = ST(), on = (st.onAir || []).filter(function (id) { return FCV.resolve(id); });
    var html = '<p>Station now: ' + esc({ fm: 'Freight FM', night: 'Night Shift', off: 'Radio off' }[(st.settings.audio || {}).station] || 'Freight FM') + '.</p>' + (on.length ? '<h4>On air today</h4><div class="hubList">' + on.map(function (id, i) { var r = FCV.resolve(id); return '<button class="hubItem" type="button" data-air="' + i + '"><span>' + esc(UI.plainFigure(r.figure) || r.label) + '<br><small>' + esc(FCV.firstSentence(r.text || '')) + '</small></span><span class="tick">Open</span></button>'; }).join('') + '</div>' : '<p class="small">Cards read on air will be listed here.</p>');
    var v = await new Promise(function (res) { UI.modal('Freight FM', html, [{ label: 'Change station', value: 'next', cls: 'go' }, { label: 'Done', value: 0 }], { onOpen: function (box) { Array.prototype.forEach.call(box.querySelectorAll('[data-air]'), function (b) { b.addEventListener('click', function () { $('modal').classList.add('hidden'); UI.letterbox(); res('air:' + b.getAttribute('data-air')); }); }); } }).then(res); });
    if (v === 'next') Sound.radio();
    else if (/^air:/.test(String(v))) { var id = on[+String(v).slice(4)]; Game.runFlow(async function () { UI.open('On air today', 'Freight FM', null); try { await UI.say(null, '', { fact: id, next: 'Done' }); } catch (e) {} UI.close(); }); }
  };
  CM.doMenu = function (v) {
    var st = ST(), fam = st.settings.family;
    if (!v || v === 'close') return;
    if (/^link:/.test(v)) { Game.pip(v.slice(5)); return; }
    if (v === 'map') WorldMap.open();
    else if (v === 'nb') Notebook.open();
    else if (v === 'sound') { if (window.AudioCtl) AudioCtl.panel(true); }
    else if (v === 'save') CM.saveCode();
    else if (v === 'recent') CM.recent();
    else if (v === 'films') Game.runFlow(function () { return Director.shelf(); });
    else if (v === 'album') { Extras.seen('album'); Album.open(); }
    else if (v === 'passport') { Extras.seen('passport'); Album.passport(); }
    else if (v === 'ach') Album.achievements();
    else if (v === 'ready') Mastery.panel();
    else if (v === 'radio') CM.freightFM();
    else if (v === 'controls') Extras.controls();
    else if (v === 'settings') CM.settings();
    else if (v === 'plan') Game.runFlow(function () { return Session.planner(); });
    else if (v === 'film') Game.runFlow(function () { return Director.watchStory(); });
    else if (v === 'end') Game.runFlow(function () { return Session.endShift(); });
    else if (v === 'family') {
      /* D1-M2: turning family mode off removes every guard, so it needs a one-second hold */
      if (fam) { UI.modal('Turn family mode off?', '<p>Family mode keeps the co-pilot buttons and the holds that stop a small hand resetting anything.</p>', [{ label: 'Keep family mode on', value: 0, cls: 'go' }, { label: 'Turn family mode off', value: 1, hold: true }]).then(function (off) { if (!off) return; st.settings.family = false; FCV.stampSettings(st); Game.applySettings(); Game.refresh(); Game.save(); }); return; }
      st.settings.family = true; FCV.stampSettings(st); Game.applySettings(); Game.refresh(); if (!st.cuts['film:docket_intro']) Game.runFlow(function () { return Director.film('docket_intro'); }); }
    else if (v === 'kid') Family.kidDrive();
    else if (v === 'dash') { var n = 0; for (var k = 1; k <= 7; k++) if (FCV.actDone(st, k)) n = k; if (!n) UI.toast('The first race opens when Act 1 closes.', 2500); else Family.race(n); }
    else if (v === 'stickers') Album.stickers();
    else if (v === 'dots') Game.runFlow(function () { return Family.dotPatrol(); });
    else if (v === 'games') UI.modal('Co-pilot games', '<p>Two games for a co-pilot. Neither changes your progress.</p>', [{ label: 'Back', value: 0, cls: 'go' }, { label: 'Same Door Dash', value: 'dash' }, { label: 'Dot patrol', value: 'dots' }]).then(function (g) { if (g) CM.doMenu(g); });
    else if (v === 'photo') Family.photo(st.viva.best);
    else if (v === 'help') CM.help();
    else if (v === 'resets') CM.resets();
    else if (v === 'undowipe') CM.undoWipe();
  };
  CM.resets = async function () {
    var st = ST(), c;
    var v = await UI.modal('Resets', '<p>To go back a little, use the Map: any step restarts with a one-second hold, with Undo. These reset more, and ask first.</p>', [{ label: 'Back', value: 0, cls: 'go' }].concat(CM.wipeUndo() ? [{ label: COPY().reset_everything.undo, value: 'undowipe' }] : []).concat([{ label: COPY().reset_story.yes, value: 'story' }, { label: COPY().reset_viva_history.yes, value: 'viva' }, { label: COPY().reset_everything.title, value: 'all', cls: 'danger' }]));
    if (v === 'undowipe') { CM.undoWipe(); return; }
    /* family mode: the yes is a one-second hold, so mashing keys never resets; a story reset offers the 30 s Undo */
    if (v === 'story') { c = COPY().reset_story; if (await UI.modal(c.title, '<p>' + esc(c.body) + '</p>', [{ label: c.no, value: 0, cls: 'go' }, { label: c.yes, value: 1, hold: true }])) { /* QAD3-m2: the save is read again after the hold and after the snapshot (another device may have saved meanwhile) */ var bS = JSON.stringify(ST()); await Game.snapshot('Before a story reset'); st = ST(); Save.backup('Before a story reset', JSON.stringify(st)); Save.markReset(st, 'story'); st.acts = {}; st.rooms = {}; st.parcels = { picked: {}, delivered: {}, bag: [] }; st.lastTp = 0; st.newV3 = {}; st.resume = null; st.resumeStep = null; Game.respawn(); Game.refresh(); Game.flush(); if (window.WorldMap) WorldMap.offerUndo('The story was reset.', bS, null, { scope: 'story' }); } }
    if (v === 'viva') { c = COPY().reset_viva_history; if (await UI.modal(c.title, '<p>' + esc(c.body) + '</p>', [{ label: c.no, value: 0, cls: 'go' }, { label: c.yes, value: 1, hold: true }])) { var bV = JSON.stringify(ST()); await Game.snapshot('Before a viva history reset'); st = ST(); Save.backup('Before a viva history reset', JSON.stringify(st)); var hs = st.viva.hallSeen; st.viva = FCV.newState().viva; st.viva.hallSeen = hs; Save.markReset(st, 'viva'); Game.flush(); if (window.WorldMap) WorldMap.offerUndo('Viva history reset.', bV, null, { scope: 'viva' }); } }
    if (v === 'all') { await CM.wipe(); }
  };
  var v2wipe = CM.wipe;
  CM.wipe = async function () { await Game.snapshot('Before starting again'); var ok = await v2wipe(); if (ok) Game.flush(); return ok; };

  /* ---------------- Save: code, file, import, Time Machine, Save health ---------------- */
  /* D-09: from the title, before any progress: paste a code or pick a file, straight away */
  CM.loadOnly = async function () {
    var html = '<p>Bring a save from another device. Paste its code, or pick the save file.</p><label for="codeIn">Save code</label><textarea id="codeIn" rows="3" placeholder="FCV3..."></textarea><label for="codeFile">Or a save file</label><input type="file" id="codeFile" accept=".json,.txt,application/json">';
    var res = await UI.modal('Load a save', html, [{ label: 'Not now', value: 0, cls: 'go' }, { label: 'Load this save', value: 'load', withInput: '#codeIn' }], { onOpen: function (box) {
      var f = box.querySelector('#codeFile'); if (f) f.addEventListener('change', function () { var file = f.files && f.files[0]; if (!file) return; if (file.size > 300000) { UI.toast('That file is too big to be a save.', 2500); return; } file.text().then(function (t) { box.querySelector('#codeIn').value = t; }); });
    } });
    if (res && res.value === 'load') { if (!String(res.input || '').trim()) { UI.toast('Paste a code or pick a file first.', 2200); return CM.loadOnly(); } await CM.importText(res.input); }
    if (window.Game && Game.showTitle && !document.getElementById('title').classList.contains('hidden')) Game.showTitle();
  };
  CM.saveCode = async function () {
    var st = ST(), code = await Save.exportCode(st), ex = COPY().export, dl = Save.downloads(), sh = COPY().save_health, s = Save.status();
    /* SD-28: the status line, Done and Go back in time up front. Moving to another device (code, file, loading) and
       checking the save sit folded underneath. */
    var html = '<p class="statusLine ' + s.kind + '" data-status="1">' + esc(CM.statusText()) + '</p>' +
      '<details class="more"><summary>Move to another device</summary><p>' + esc(ex.body) + '</p><label for="codeOut">Your save code (' + Math.round(code.length / 1024 * 10) / 10 + ' KB)</label><textarea id="codeOut" readonly rows="3">' + esc(code) + '</textarea>' +
      '<div class="moreRow"><button class="btn small" type="button" data-sv="copy">' + esc(ex.copy) + '</button>' + (dl ? '<button class="btn small" type="button" data-sv="file">' + esc(ex.file) + '</button>' : '') + '</div>' +
      '<label for="codeIn">Load a save from another device: paste a code, or pick a file</label><textarea id="codeIn" rows="2" placeholder="FCV3..."></textarea><input type="file" id="codeFile" accept=".json,.txt,application/json"><div class="moreRow"><button class="btn small" type="button" data-sv="load">Load this save</button></div></details>' +
      '<details class="more"><summary>Check my save</summary><p class="small">' + esc(sh.account.replace('[t]', s.account ? Game.ago(s.account) : 'never')) + ' · ' + esc(sh.device.replace('[t]', s.local ? Game.ago(s.local) : 'never')) + ' · ' + esc(sh.snapshots.replace('[n]', Save.snapshots().length)) + ' · Last export: ' + (st.lastExport ? new Date(st.lastExport).toLocaleDateString('en-GB') : 'never') + '</p><div class="moreRow"><button class="btn small" type="button" data-sv="test">' + esc(sh.test) + '</button></div></details>';
    var buttons = [{ label: 'Done', value: 'done', cls: 'go' }, { label: 'Go back in time', value: 'tm' }];
    var copied = false;
    var res = await new Promise(function (resolve) { UI.modal('Save', html, buttons, { onOpen: function (box) {
      Array.prototype.forEach.call(box.querySelectorAll('[data-sv]'), function (b) { if (b.getAttribute('data-sv') === 'copy') return; b.addEventListener('click', function () { var v = b.getAttribute('data-sv'), inp = box.querySelector('#codeIn'); $('modal').classList.add('hidden'); UI.letterbox(); resolve(v === 'load' ? { value: 'load', input: inp ? inp.value : '' } : v); }); });
      var f = box.querySelector('#codeFile'); if (f) f.addEventListener('change', function () { var file = f.files && f.files[0]; if (!file) return; if (file.size > 300000) { UI.toast('That file is too big to be a save.', 2500); return; } file.text().then(function (t) { box.querySelector('#codeIn').value = t; }); });
      /* Copy inside the click itself; if refused, the field is selected for a manual copy. The dialog stays open. */
      var cb = box.querySelector('[data-sv="copy"]');
      if (cb) cb.addEventListener('click', function () { var t = box.querySelector('#codeOut'); try { navigator.clipboard.writeText(code).then(function () { copied = true; UI.toast('Code copied.', 1800); st.lastExport = Date.now(); Game.save(); }, function () { UI.toast('Copy did not work here. The code is selected: copy it by hand.', 3000); if (t) { t.focus(); t.select(); } }); } catch (e) { if (t) { t.focus(); t.select(); } } });
    } }).then(resolve); });
    var v = res && res.value !== undefined ? res.value : res;
    void copied;
    if (v === 'file') { try { await Save.saveFile(st); st.lastExport = Date.now(); Game.save(); UI.toast('Save file offered.', 1800); } catch (e) { if (!e || e.code !== 'declined') UI.toast('The file did not save. Copy the code instead.', 3000); } return; }
    if (v === 'load') await CM.importText(res.input);
    if (v === 'tm') await CM.timeMachine();
    if (v === 'test') { var t = await Save.testMySave(st); await UI.modal(sh.test, '<p>' + esc(t.ok ? sh.test_ok.replace('[n]', t.n) : 'Something did not round-trip. Copy your code and keep it safe.') + '</p><p class="small">Code size ' + Math.round(t.bytes / 102.4) / 10 + ' KB. Nothing was written.</p>', [{ label: 'OK', value: 1, cls: 'go' }]); }
  };
  CM.importText = async function (text) {
    if (!text || !text.trim()) { UI.toast('Paste a code or pick a file first.', 2400); return; }
    var other;
    try { other = await Save.importFile(text); } catch (e) { await UI.modal('Save', '<p>' + (e && /^Paste/.test(e.message) ? UI.esc(e.message) : 'That code is damaged. Copy it again.') + '</p>', [{ label: 'OK', value: 1, cls: 'go' }]); return; }
    var ic = COPY().import;
    var html = '<div class="chute"><div class="card"><div class="lab">Here</div><div class="txt">' + esc(Save.summary(ST())) + '</div></div><div class="card"><div class="lab">The code</div><div class="txt">' + esc(Save.summary(other)) + '</div></div></div><p>' + esc(ic.body.split('.').slice(-2).join('.').trim()) + '</p>';
    var v = await UI.modal(ic.title, html, [{ label: ic.no, value: 0, cls: 'go' }, { label: ic.yes, value: 1, hold: true }]);
    if (!v) return;
    await Game.snapshot('Before loading a save code'); Save.backup('Before loading a save code', ST());
    var pos = ST().pos; other.epochs = Object.assign({}, ST().epochs || {}, other.epochs || {}); Save.markReset(other, 'all'); delete other.exportedAt; delete other.madeAt;
    Game.replaceState(other); Game.state.pos = pos; Game.flush();
    UI.toast('Save loaded.', 2000);
  };
  /* The Time Machine: snapshots with a label, acts done, stamps and items learnt. A restore first snapshots the present. */
  CM.timeMachine = async function () {
    var tm = COPY().time_machine, local = Save.snapshots(), acct = await Save.accountSnapshots();
    /* D-08: one row per save: copies with the same content (the same hash, or the same moment) are one row, the newest kept */
    var byKey = {}; local.concat(acct).sort(function (a, b) { return b.at - a.at; }).forEach(function (b) { var k = b.hash || String(b.at); if (byKey[k]) { if (byKey[k].where !== b.where) byKey[k].where = 'both'; return; } byKey[k] = b; });
    var list = Object.keys(byKey).map(function (k) { return byKey[k]; }).sort(function (a, b) { return b.at - a.at; });
    var sameMin = {}; list.forEach(function (b) { var m = Math.floor(b.at / 60000); sameMin[m] = (sameMin[m] || 0) + 1; });
    var when = function (b) { var d = new Date(b.at), two = sameMin[Math.floor(b.at / 60000)] > 1; return d.toLocaleTimeString('en-GB', two ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { hour: '2-digit', minute: '2-digit' }); };
    if (!list.length) { await UI.modal(tm.title, '<p>No snapshots yet. One is taken at every act closer, room badge, restart and every 15 minutes of play.</p>', [{ label: 'OK', value: 0, cls: 'go' }]); return; }
    var html = '<div class="hubList">' + list.map(function (b, i) { var d = new Date(b.at); return '<button class="hubItem" type="button" data-s="' + i + '"><span>' + esc(tm.label.replace('[label]', b.label).replace('[day]', d.toLocaleDateString('en-GB', { weekday: 'short' })).replace('[time]', when(b))) + '<br><small>' + (b.what ? esc(b.what) + ' · ' : '') + b.acts + ' acts done, ' + b.stamps + ' stamps, ' + b.learnt + ' items learnt · ' + (b.where === 'both' ? 'on this device and your account' : b.where === 'account' ? 'on your account' : 'on this device') + '</small></span><span class="tick">' + esc(tm.restore) + '</span></button>'; }).join('') + '</div>';
    var pick = await new Promise(function (res) { UI.modal(tm.title, html, [{ label: 'Close', value: -1, cls: 'go' }], { onOpen: function (box) { Array.prototype.forEach.call(box.querySelectorAll('[data-s]'), function (b) { b.addEventListener('click', function () { $('modal').classList.add('hidden'); UI.letterbox(); res(+b.getAttribute('data-s')); }); }); } }).then(res); });
    if (pick === -1 || pick === undefined || pick === null) return;
    var snap = list[pick], before = JSON.stringify(ST());
    /* D1-M2: going back is confirmed with a one-second hold (Undo still follows) */
    var dSnap = new Date(snap.at), okGo = await UI.modal('Go back to this save?', '<p>' + esc(snap.label) + ', ' + esc(dSnap.toLocaleDateString('en-GB', { weekday: 'short' })) + ' ' + esc(when(snap)) + ': ' + esc(Save.tallyText(snap)) + '.</p><p>Your present is kept as a snapshot, and Undo puts it back.</p>', [{ label: 'Stay where I am', value: 0, cls: 'go' }, { label: 'Go back to this save', value: 1, hold: true }]);
    if (!okGo) return;
    var st2 = await Save.readSnapshot(snap);
    await Game.snapshot('The present, before going back');
    var pos = ST().pos; st2.epochs = Object.assign({}, ST().epochs || {}, st2.epochs || {}); Save.markReset(st2, 'all'); /* QAD3-M1: every scope the snapshot restores, as a code import does */
    /* a restore keeps today's sound settings, so it can never suddenly unmute a quiet room */
    if (st2.settings && ST().settings.audio) { st2.settings.audio = JSON.parse(JSON.stringify(ST().settings.audio)); st2.settings.at = ST().settings.at || 0; FCV.syncOldAudio(st2.settings); }
    Game.adopt(st2); Game.state.pos = pos; if (window.Mastery) Mastery.bump(); Game.applySettings(); Game.refresh(); Game.flush();
    if (window.Kit) Kit.sfx('SFX-REWIND');
    WorldMap.offerUndo(tm.restored.replace('[label]', snap.label), before, null, { scope: 'all' });
  };

  /* ---------------- Settings and accessibility ---------------- */
  CM.settings = async function () {
    var s = ST().settings;
    var sel = function (id, label, opts) { return '<label class="set" for="set_' + id + '">' + esc(label) + ' <select id="set_' + id + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(s[id]) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>'; };
    /* SD-12: the control sits right after its words, the same way in every row */
    var chk = function (id, label) { return '<label class="set" for="set_' + id + '"><span>' + esc(label) + '</span><input type="checkbox" id="set_' + id + '"' + (s[id] ? ' checked' : '') + '></label>'; };
    var rng = function (id, label) { return '<label class="set" for="set_' + id + '">' + esc(label) + ' <input type="range" id="set_' + id + '" min="0" max="1" step="0.05" value="' + (s[id] === undefined ? 0.8 : s[id]) + '"></label>'; };
    /* round 4 (item 39): tabs, Sound first; one group at a time */
    var au = s.audio || FCV.normAudio(null, s);
    var tabs = [
      ['Sound', '<p class="setNote">The note and speaker buttons at the top of every screen turn music and all sound on or off' + (UI.kb() ? ' (B and V)' : '') + '.</p>' + (window.AudioCtl ? AudioCtl.controlsHTML(au, 'aud_') + AudioCtl.presetsHTML() + '<details><summary>More sound settings</summary>' + AudioCtl.moreHTML(au, 'aud_') + '</details>' : '') + chk('examinerVoice', 'Examiner voices in the viva')],
      ['Reading', sel('textSpeed', 'Text speed', [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']]) + sel('textSize', 'Text size', [['normal', 'Normal'], ['large', 'Large'], ['larger', 'Larger']]) +
        sel('captionSize', 'Captions', [['normal', 'Normal'], ['large', 'Large (40 px)']]) + chk('highContrast', 'High contrast') + chk('skipSeen', 'Skip seen dialogue') + chk('ticker', 'Freight FM ticker (a card now and then)') + chk('recordSelf', 'Record yourself on say-aloud screens (stays on the screen, never saved)')],
      ['Motion', chk('reduceMotion', 'Reduce motion (no shake, no drift; films cross-fade)') + chk('topDown', 'Top-down city view' + (UI.kb() ? ' (T)' : '')) + sel('graphics', 'Graphics', [['auto', 'Automatic'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low'], ['simple', 'Simple graphics (2D)']]) + chk('autoplay', 'Play film videos (off: stills only)') +
        chk('autoContinue', 'Auto-continue to the next ticket (5 s)') + chk('previously', 'Previously, when you come back') + chk('timers', 'Timers in runs and the whistle') + chk('calmCity', 'Calm city (no Kerb Inspectors)')],
      ['Family', chk('family', 'Playing with a co-pilot (family mode)') + sel('docket', 'Docket shows', [['family', 'In family mode'], ['always', 'Always'], ['never', 'Never']]) + sel('seat', 'Co-pilot sits', [['right', 'On my right' + (UI.kb() ? ' (H J K L)' : '')], ['left', 'On my left' + (UI.kb() ? ' (Q E Z X)' : '')]]) /* FD4-05: no key letters on a touch screen */ + chk('babble', 'Little sounds for lines with no recording')],
      ['Viva', chk('hardViva', 'Hard viva (45 second answer clock)') + '<label class="set" for="set_vivaDate">Viva date (optional) <input type="date" id="set_vivaDate" value="' + esc(s.vivaDate || '') + '"></label>'],
      ['Save', '<p class="setNote" data-status="1">' + esc(CM.statusText()) + '</p><div class="moreRow"><button class="btn small" type="button" data-go="save">Save options</button><button class="btn small" type="button" data-go="tm">Go back to an earlier save</button></div>']
    ];
    var html = '<div class="setTabs" role="tablist">' + tabs.map(function (t, i) { return '<button class="btn small' + (i === 0 ? ' go' : '') + '" type="button" role="tab" aria-selected="' + (i === 0) + '" data-tab="' + i + '">' + t[0] + '</button>'; }).join('') + '</div>' +
      tabs.map(function (t, i) { return '<div class="setGrid" role="tabpanel" data-panel="' + i + '"' + (i ? ' hidden' : '') + '>' + t[1] + '</div>'; }).join('');
    var goTo = null;
    var famWas = !!s.family;
    await UI.modal('Settings', html, [{ label: 'Done', value: 1, cls: 'go' }], { onOpen: function (box) {
      /* D1-M2: unticking family mode here needs a one-second hold on a button that appears beside it */
      box.addEventListener('change', function (e) {
        var el = e.target; s = ST().settings; if (!el || el.id !== 'set_family' || el.checked || !s.family) return;
        e.stopImmediatePropagation(); el.checked = true;
        if (box.querySelector('#famOffHold')) return;
        var hb = document.createElement('button'); hb.type = 'button'; hb.id = 'famOffHold'; hb.className = 'btn small holdBtn'; hb.textContent = 'Hold to turn family mode off';
        (el.closest('label') || el).insertAdjacentElement('afterend', hb);
        UI.holdButton(hb, function () { s = ST().settings; s.family = false; FCV.stampSettings(ST()); el.checked = false; hb.remove(); Game.applySettings(); Game.save(); Game.refresh(); });
        try { hb.focus({ preventScroll: true }); } catch (e2) {}
      }, true);
      if (window.AudioCtl) { AudioCtl.bind(box, 'aud_'); AudioCtl.bindPresets(box); }
      Array.prototype.forEach.call(box.querySelectorAll('[data-tab]'), function (b) { b.addEventListener('click', function () { var k = b.getAttribute('data-tab'); Array.prototype.forEach.call(box.querySelectorAll('[data-tab]'), function (x) { x.classList.toggle('go', x === b); x.setAttribute('aria-selected', x === b); }); Array.prototype.forEach.call(box.querySelectorAll('[data-panel]'), function (p) { p.hidden = p.getAttribute('data-panel') !== k; }); }); });
      Array.prototype.forEach.call(box.querySelectorAll('[data-go]'), function (b) { b.addEventListener('click', function () { goTo = b.getAttribute('data-go'); var d = box.querySelector('.btn.go[data-i]'); if (d) d.click(); }); });
      Array.prototype.forEach.call(box.querySelectorAll('select[id^="set_"], input[id^="set_"]'), function (el) {
        el.addEventListener('change', function () {
          s = ST().settings; /* QAD3-B1: the live settings, even if another device's save arrived while this is open */
          var k = el.id.replace('set_', ''), was = s[k]; s[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
          if (k === 'graphics' && (was === 'simple') !== (s[k] === 'simple')) Game.switchRenderer(s[k] === 'simple');
          FCV.stampSettings(ST()); Game.applySettings(); Game.save();
        });
      });
    } });
    if (!famWas && s.family && !ST().cuts['film:docket_intro']) Game.runFlow(function () { return Director.film('docket_intro'); });
    if (goTo === 'save') CM.saveCode(); else if (goTo === 'tm') CM.timeMachine();
  };

  /* ---------------- Help: errors never cost progress; Copy a report ---------------- */
  var LOG = [];
  window.Help = { log: function (kind, msg) { LOG.push(new Date().toISOString().slice(11, 19) + ' ' + kind + ': ' + String(msg).slice(0, 200)); if (LOG.length > 60) LOG.shift(); } };
  CM.help = async function () {
    var st = ST(), s = Save.status(), r = Game.renderer;
    var report = ['Freight City Viva v3', 'Renderer: ' + (r ? r.name : 'none') + (r && r.tier ? ', tier ' + r.tier() + (r.tierLog && r.tierLog().length ? ' (' + r.tierLog().join('; ') + ')' : '') : ''), 'Save: ' + s.kind + ' / ' + s.tick + ', writer ' + s.writer, 'Hash: ' + Save.hash(st), 'Acts done: ' + [1, 2, 3, 4, 5, 6, 7].filter(function (n) { return FCV.actDone(st, n); }).join(','), 'Snapshots: ' + Save.snapshots().length, 'Repairs: ' + JSON.stringify(Save.repairs.concat(st.repairs || [])).slice(0, 300), 'Agent: ' + navigator.userAgent].concat(LOG).join('\n');
    var hv = await UI.modal('Help', '<p>If something looks wrong, your progress is still safe: every save is checked, and you can go back to an earlier save at any time. Copy this report if you want to pass it on.</p><details class="more"><summary>Show the report for support</summary><textarea id="helpReport" readonly rows="8">' + esc(report) + '</textarea></details>', [{ label: 'Copy a report', value: 'copy', cls: 'go' }, { label: 'What\'s new', value: 'new' }, { label: 'Controls', value: 'controls' }, { label: 'Close', value: 0 }], { onOpen: function (box) {
      var b = box.querySelector('.btn.go'); b.addEventListener('click', function () { try { navigator.clipboard.writeText(report).catch(function () {}); } catch (e) {} }, true);
    } });
    if (hv === 'new') Extras.whatsNewCard(); else if (hv === 'controls') Extras.controls();
  };
})();
