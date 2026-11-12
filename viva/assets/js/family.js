/* Freight City Viva v3: family mode. One switch. The co-pilot's layer lives in pictures, sound, animation and buttons:
   Docket, the co-pilot dock (asleep during questions), jobs that resolve by themselves, Tell your co-pilot, Listen for the
   number, the Animal's three states, Dot patrol, Kid drive, Same Door Dash, stunt jumps, Spot Docket, Bedtime and Good
   morning, the journey strip, and the graduation photo. Every subtitle, line, card and question is identical in both modes. */
(function () {
  'use strict';
  var Fm = {}, $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return UI.esc(s); };
  var S = function () { return Game.state; };
  var SC = function () { return FCV.data.script; };
  var FAM = function () { return SC().family_mode; };
  var on = function () { return !!(S() && S().settings.family); };
  var asleep = false, lastPress = 0;
  var KEYS_R = { h: 'honk', j: 'confetti', k: 'lights', l: 'paint' }, KEYS_L = { q: 'honk', e: 'confetti', z: 'lights', x: 'paint' };
  var HONK = { 1: 'radio jingle', 2: 'book thump', 3: "referee's whistle", 4: 'gavel knock', 5: 'clock chime', 6: 'kiosk boop', 7: 'pigeon coo' };

  /* Docket's pose stills sit on a magenta key: cut them out once on a canvas. */
  var KEYED = {};
  Fm.keyed = function (id) {
    if (KEYED[id] !== undefined) return KEYED[id] || null;
    KEYED[id] = false; var u = FCV.assetUrl(id); if (!u) return null;
    var im = new Image(); im.onload = function () {
      try {
        var c = document.createElement('canvas'); c.width = 256; c.height = 256; var g = c.getContext('2d'); g.drawImage(im, 0, 0, 256, 256);
        var d = g.getImageData(0, 0, 256, 256), p = d.data;
        for (var i = 0; i < p.length; i += 4) if (p[i] > 170 && p[i + 1] < 110 && p[i + 2] > 170) p[i + 3] = 0;
        g.putImageData(d, 0, 0); KEYED[id] = c.toDataURL('image/png'); Fm.hud();
      } catch (e) { KEYED[id] = false; }
    };
    im.src = u; return null;
  };
  ['GM-CH-02', 'GM-CH-03', 'GM-CH-04', 'GM-CH-05', 'GM-CH-06', 'GM-CH-07'].forEach(function (k) { setTimeout(function () { if (window.FCV && FCV.data) Fm.keyed(k); }, 3000); });
  Fm.docketShown = function () { var d = S() && S().settings.docket; return d === 'always' || (d !== 'never' && on()); };
  Fm.hud = function () {
    var dock = $('dock'), dk = $('docket');
    if (!on() || !$('title').classList.contains('hidden')) { dock.classList.add('hidden'); dk.classList.toggle('hidden', !Fm.docketShown() || !$('title').classList.contains('hidden')); }
    else {
      var keys = S().settings.seat === 'left' ? ['Q', 'E', 'Z', 'X'] : ['H', 'J', 'K', 'L'];
      if (!dock.dataset.built || dock.dataset.seat !== S().settings.seat) {
        /* round 4 (item 67): a small tray in the bottom-right corner, titled for a little helper, closed to one paw button */
        dock.innerHTML = '<div class="trayHead"><span class="trayTitle" id="trayTitle">Co-pilot buttons (for a little helper)</span><button type="button" class="paw" id="trayPaw" aria-controls="trayBtns" aria-expanded="false" aria-label="Co-pilot buttons (for a little helper)" title="Co-pilot buttons (for a little helper)"><svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><g fill="#15101f"><ellipse cx="16" cy="21" rx="7" ry="6"/><circle cx="8" cy="13" r="3"/><circle cx="13" cy="8" r="3"/><circle cx="19" cy="8" r="3"/><circle cx="24" cy="13" r="3"/></g></svg></button></div>' +
          '<div class="trayBtns" id="trayBtns">' + ['Honk', 'Confetti', 'Lights', 'Paint'].map(function (n, i) { return '<button type="button" class="' + n.toLowerCase() + '" data-d="' + n.toLowerCase() + '" title="' + n + ' (' + keys[i] + ')">' + n + '<kbd>' + keys[i] + '</kbd></button>'; }).join('') + '</div>';
        dock.dataset.built = '1'; dock.dataset.seat = S().settings.seat;
        if (!dock.hasAttribute('aria-expanded')) dock.setAttribute('aria-expanded', 'false');
        dock.setAttribute('role', 'group'); dock.setAttribute('aria-label', 'Co-pilot buttons (for a little helper)');
        Array.prototype.forEach.call(dock.querySelectorAll('[data-d]'), function (b) { b.addEventListener('click', function () { Fm.press(b.getAttribute('data-d')); }); });
        $('trayPaw').addEventListener('click', function () { Fm.tray(dock.getAttribute('aria-expanded') !== 'true'); });
      }
      dock.classList.remove('hidden'); dk.classList.toggle('hidden', !Fm.docketShown());
      /* the first time the tray shows, one line says what it is for */
      if (!S().cuts.trayIntro && !UI.busy() && $('title').classList.contains('hidden')) { S().cuts.trayIntro = 1; Game.save(); Fm.tray(true); setTimeout(function () { Fm.tray(false); }, 8000); UI.toast('Fun buttons for a child watching with you: honk the horn, throw confetti, flash the lights, change the bike\'s colour. They don\'t affect your progress.', 6500); }
    }
    var u = Fm.keyed('GM-CH-02'); if (u && dk.dataset.u !== u) { dk.style.backgroundImage = 'url(' + u + ')'; dk.dataset.u = u; }
    /* the Animal's portrait follows its state in family mode */
    var stt = Game.state && (FCV.isDone(S(), 6, 'scene:6.3') ? 'FM-S03' : FCV.isDone(S(), 4, 'tp') ? 'FM-S02' : 'FM-S01');
    if (on() && FCV.assetUrl(stt)) FCV.portraitOverride.animal = stt; else FCV.portraitOverride.animal = 'por-animal';
  };
  /* Asleep while a question or its options show, during think-first, every say-aloud and every recording. */
  /* A job still pending when the buttons sleep is finished (its sound and Docket's wag), never dropped. */
  Fm.tray = function (open) { var d = $('dock'); if (!d) return; d.setAttribute('aria-expanded', open ? 'true' : 'false'); var p = $('trayPaw'); if (p) p.setAttribute('aria-expanded', open ? 'true' : 'false'); };
  Fm.dockSleep = function (v) { asleep = !!v; var d = $('dock'); if (d) d.classList.toggle('asleep', asleep); if (asleep) endJob(null); };
  Fm.isDockKey = function (e) { if (!on()) return false; var map = S().settings.seat === 'left' ? KEYS_L : KEYS_R; return !!map[String(e.key).toLowerCase()] && !e.shiftKey && !e.ctrlKey && !e.metaKey; };
  /* Dock keys never reach a confirm: they are swallowed here when a modal is open. */
  Fm.key = function (e) {
    if (!Fm.isDockKey(e)) return false;
    if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return false;
    var modalOpen = !$('modal').classList.contains('hidden');
    e.preventDefault(); e.stopPropagation();
    if (!modalOpen && !asleep) Fm.press((S().settings.seat === 'left' ? KEYS_L : KEYS_R)[e.key.toLowerCase()]);
    return true;
  };
  window.addEventListener('keydown', function (e) {
    if (Fm.isDockKey(e) && (!$('modal').classList.contains('hidden') || asleep)) {
      e.preventDefault(); e.stopImmediatePropagation();
      /* the one card that asks for the co-pilot (the comfort beat's Cheer up): any dock key presses it; no other confirm */
      var cb = !$('modal').classList.contains('hidden') && !e.repeat ? $('modalBox').querySelector('[data-copilot]') : null; if (cb) cb.click();
    }
  }, true);
  Fm.press = function (what) {
    var now = Date.now(); if (asleep || now - lastPress < 2000 * 0.25) return; lastPress = now;
    if (job) { endJob(true); return; }
    var st = S(), c = st.copilot; c.honks = (c.honks || 0) + 1;
    var p = Game.player(), cell = FCV.cellAt(Game.city(), p.x, p.y);
    if (what === 'honk') { if (window.Sound) Sound.sfx(cell && cell.act ? HONK[cell.act] : cell && cell.kind === 'harbour' ? 'foghorn' : cell && cell.kind === 'viva' ? 'soft shh' : 'CFX-HONK'); }
    else if (what === 'confetti') { if (window.Sound) Sound.sfx('confetti pop'); Fm.confetti(); }
    else if (what === 'lights') { if (window.Sound) Sound.sfx('chain clink'); var d = $('dock'); d.style.boxShadow = '0 0 24px #ffd166'; setTimeout(function () { d.style.boxShadow = ''; }, 500); }
    else if (what === 'paint') { if (window.Sound) Sound.sfx('badge flip'); c.paint.bike = ['#ff8a3d', '#19c2b0', '#ffd166', '#ff3d8b'][(c.honks || 0) % 4]; }
    /* FM2: the Animal honks back from up to 600 px: a deep honk while big, a meep once it is small */
    if (what === 'honk' && Game.animal) { var an = Game.animal(); if (an && Math.hypot(an.x - p.x, an.y - p.y) < 600 && window.Sound) setTimeout(function () { Sound.sfx(an.size === 'big' ? 'animal honk' : 'meep'); }, 450); }
    Fm.react('stamp'); Game.save();
  };
  /* Confetti across the whole city or film frame; 40 pieces at most, and none with Reduce motion on. */
  Fm.confetti = function () {
    if (S().settings.reduceMotion) return;
    var W = window.innerWidth, H = window.innerHeight, cols = ['#ff8a3d', '#19c2b0', '#ffd166', '#ff3d8b', '#7a5cff'];
    for (var i = 0; i < 40; i++) (function () {
      var p = document.createElement('i'); p.className = 'particle'; p.style.background = cols[i % cols.length]; p.style.left = (Math.random() * W) + 'px'; p.style.top = '-12px'; document.body.appendChild(p);
      p.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: 'translate(' + ((Math.random() - 0.5) * 160) + 'px,' + (H * (0.6 + Math.random() * 0.4)) + 'px) rotate(' + (Math.random() * 720) + 'deg)', opacity: 0.2 }], { duration: 1600 + Math.random() * 900, easing: 'cubic-bezier(.3,.6,.5,1)' }).onfinish = function () { p.remove(); };
    })();
  };
  Fm.react = function (kind) { var dk = $('docket'); if (!dk || dk.classList.contains('hidden') || S().settings.reduceMotion) return; dk.classList.remove('wag'); void dk.offsetWidth; dk.classList.add('wag'); if (kind === 'killer' && window.Sound) Sound.sfx("Docket's bark"); };
  /* A job in every act: it resolves by itself in 1.5 to 3 s if nobody presses. */
  var JOBS = { broadcast: 'radio jingle', haul: 'net haul', light: 'chain clink', permit: 'gate beep', stamp: 'CFX-STAMP2', key: 'CFX-KEYS', doorbell: 'clock chime', bell: 'bike bell',
    whistle: "referee's whistle", gavel: 'gavel knock', block: 'thud', tape: 'page flip', onair: 'radio jingle', redcards: "referee's whistle", linkbell: 'chain clink', tally: 'gate beep', seal: 'CFX-STAMP2', heart: 'stage3' };
  var JOB_AUTO = { broadcast: 1.5, haul: 1.5, light: 1.5, permit: 1.5, whistle: 1.5, gavel: 1.5, block: 1.5, tape: 1.5, linkbell: 1.5, tally: 1.5, seal: 1.5, stamp: 1.5, onair: 2, redcards: 2, key: 2, doorbell: 3, heart: 2, bell: 2 };
  /* A job: a big prompt above every overlay names the key, the matching dock button lights, one press within 3 s does it,
     and it does itself if nobody presses. It is cancelled the moment the dock sleeps (the next question). */
  var JOB_BTN = { broadcast: ['honk', 'go on air'], haul: ['lights', 'haul the net'], light: ['lights', 'light the lamp'], permit: ['honk', 'open the gate'], stamp: ['confetti', 'stamp it'], key: ['paint', 'turn the key'], doorbell: ['honk', 'ring the doorbell'], bell: ['honk', 'ring the bell'],
    whistle: ['honk', 'blow the whistle'], gavel: ['confetti', 'bang the gavel'], block: ['lights', 'drop the block'], tape: ['paint', 'zip the tape'], onair: ['lights', 'light the ON AIR lamp'], redcards: ['paint', 'show the two red cards'], linkbell: ['honk', 'ring the link bell'], tally: ['lights', "click Polly's counter"], seal: ['confetti', 'stamp the seal'], heart: ['lights', 'catch the heart'] };
  var job = null, lastJobAt = 0;
  function endJob(pressed) {
    if (!job) return; var j = job; job = null; clearTimeout(j.t); clearTimeout(j.t0);
    if (j.el) j.el.remove(); var b = $('dock') && $('dock').querySelector('.lit'); if (b) b.classList.remove('lit');
    if (pressed === false && !j.shown) return;
    if (pressed !== false) { if (window.Sound) Sound.sfx(JOBS[j.name] || 'bike bell'); Fm.react('right'); if (pressed && !S().settings.reduceMotion) Juice.particles($('dock'), 14); }
  }
  /* The prompt shows at once and the job does itself after its auto_s (family_mode.jobs; 1.5 s for mission jobs, 2 s otherwise). */
  Fm.job = function (name, autoS) {
    if (!on() || !name || asleep) return; endJob(null);
    var spec = JOB_BTN[name] || JOB_BTN.bell, keys = S().settings.seat === 'left' ? { honk: 'Q', confetti: 'E', lights: 'Z', paint: 'X' } : { honk: 'H', confetti: 'J', lights: 'K', paint: 'L' };
    job = { name: name, shown: true }; lastJobAt = Date.now();
    /* D1-m4: on a touch screen there is no key, so the prompt itself is the button */
    var touch = window.UI && UI.kb && !UI.kb();
    var el = document.createElement(touch ? 'button' : 'div'); el.className = 'jobPrompt'; el.setAttribute('role', 'status');
    if (touch) { el.type = 'button'; el.textContent = 'Co-pilot: tap here to ' + spec[1]; el.addEventListener('click', function (e) { e.stopPropagation(); endJob(true); }); }
    else el.textContent = 'Co-pilot: press ' + keys[spec[0]] + ' to ' + spec[1];
    document.body.appendChild(el); job.el = el;
    var b = $('dock') && $('dock').querySelector('[data-d="' + spec[0] + '"]'); if (b) b.classList.add('lit');
    job.t = setTimeout(function () { endJob(null); }, (autoS || JOB_AUTO[name] || 2) * 1000);
  };
  /* Right answers in v2 mechanics and scenes also hand the co-pilot a small job, at most one every 20 s. */
  Fm.maybeJob = function (name) { if (!on() || Date.now() - lastJobAt < 20000) return; lastJobAt = Date.now(); Fm.job(name || 'bell'); };
  /* Listen for the number: after a reveal whose answer holds a figure, the figure shows big with two buttons. */
  /* The number to listen for: a card's own figure; otherwise the first real figure in the text, never a section reference,
     an interview code's digit (A2) or trailing punctuation. Nothing shows when no figure is left. */
  Fm.figureOf = function (items) {
    items = Array.isArray(items) ? items : [{ text: items }];
    for (var i = 0; i < items.length; i++) { var c = items[i] && items[i].cardId ? FCV.resolve(items[i].cardId) : null; if (c && c.figure && /\d/.test(c.figure) && /^(Chapter \d|Appendix [A-O])$/.test(c.label || '')) return String(c.figure); }
    var text = FCV.stripRefs(items.map(function (x) { return (x && x.text) || ''; }).join(' ')), re = /(?<![A-Za-z\d.])\d[\d,]*(?:\.\d+)?(?:\s?per cent|%)?/g, m;
    while ((m = re.exec(text))) {
      var f = m[0].replace(/[,.;:]+$/, '');
      if (/^[1-9]\.\d{1,2}(\.\d+)*$/.test(f)) continue; /* a section reference such as 4.2 */
      if (/^[1-9]\.\d/.test(f) && /^[;,]/.test(text.slice(m.index + m[0].length).trim() || ';')) continue;
      /* not figures: the number of an objective, chapter, file, version, article, link, stage, table or proposition;
         a sub-objective such as 5A; a day of the month */
      var before = text.slice(0, m.index), after = text.slice(m.index + m[0].length);
      if (/\b(?:Objectives?|Sub-objectives?|Chapters?|Files?|Version|changes?|Articles?|Links?|Stages?|Tables?|Figures?|Questions?|Rules?|Sections?|Appendix|Steps?|Rounds?|Acts?|P)\s*$/i.test(before)) continue;
      if (/\b(?:Chapters?|Files?|Objectives?|Links?|Stages?|Articles?)\s+\d+(?:\s*(?:,|and|or|to)\s*\d+)*\s*(?:,|and|or|to)\s*$/i.test(before)) continue;
      if (/^[A-Za-z]/.test(after) && !/^\s?per cent/.test(after)) continue;
      if (+f <= 31 && /^\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/.test(after)) continue;
      return f;
    }
    return null;
  };
  Fm.listenForNumber = function (items) {
    var fig = Fm.figureOf(items); if (!fig || !on()) return; var m = [fig];
    var c = SC().session_copy.family, t = $('toast');
    /* QAD3-m6: the number toast has its own place, centred and wide enough for its two buttons, even over a card */
    t.innerHTML = '<b style="font-family:var(--display);font-size:44px;display:block">' + esc(m[0]) + '</b>'; t.classList.add('listen'); t.classList.remove('hidden', 'act'); t.style.opacity = '1'; t.style.pointerEvents = 'auto';
    var row = document.createElement('div'); row.className = 'faces'; row.innerHTML = '<button class="btn small go" type="button">' + esc(c.dad_said) + '</button><button class="btn small" type="button">' + esc(c.not_heard) + '</button>';
    t.appendChild(row); var close = function () { if (!t.classList.contains('listen')) return; t.style.opacity = '0'; t.style.pointerEvents = 'none'; setTimeout(function () { if (t.classList.contains('listen')) { t.classList.add('hidden'); t.classList.remove('listen'); t.style.pointerEvents = ''; } }, 300); };
    row.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', close); }); setTimeout(close, 6000);
  };
  /* Tell your co-pilot: two faces, unscored, never in item memory. */
  Fm.tell = async function (q) {
    var st = S(), c = SC().session_copy.family;
    /* resolves by itself after 8 s, with nothing recorded */
    var auto = setTimeout(function () { var b = document.querySelector('#modalBox [data-i="2"]'); if (b) b.click(); }, 8000);
    var v = await UI.modal(c.tell, '<p class="q">' + esc(q.ask) + '</p>' + UI.cardHTML(q.card, { noMet: true }) + '<div class="faces"></div>', [{ label: c.got_it, value: 'up', cls: 'go' }, { label: c.huh, value: 'huh' }, { label: 'Later', value: null, cls: 'small' }]);
    clearTimeout(auto);
    if (v === null || v === undefined) return;
    var prev = st.copilot.tellAct[q.act]; st.copilot.tellAct[q.act] = v;
    if (v === 'up') { st.copilot.stickers['teacher-' + q.act] = Date.now(); Fm.react('stamp'); }
    if (v === 'huh' && prev === 'huh') { st.own['simpler:' + q.card] = 'Say it simpler'; }
    Game.save();
  };
  /* Spot Docket: a peek from a static place in each new shot; a tap barks and counts. */
  var PLACES = [[8, 62], [84, 58], [12, 30], [78, 26], [46, 70]];
  Fm.peekHTML = function (spot, alt) {
    var st = S(), found = st.copilot.docketSpots[spot], i = (FCV.hash32(spot) + (alt ? Math.ceil(PLACES.length / 2) : 0)) % PLACES.length, p = PLACES[i], u = Fm.keyed('GM-CH-0' + (2 + (FCV.hash32(spot) % 6)));
    if (!u) return '';
    setTimeout(function () { var b = document.querySelector('#cutDocket button'); if (b) b.addEventListener('click', function (e) { e.stopPropagation(); if (!S().copilot.docketSpots[spot]) { S().copilot.docketSpots[spot] = 1; if (window.Sound) Sound.sfx("Docket's bark"); b.style.outline = '4px solid #ffd166'; Game.save(); } }); }, 0);
    return '<button type="button" aria-label="Docket is hiding here" style="left:' + p[0] + '%;top:' + p[1] + '%;background:url(' + u + ') center/contain no-repeat;opacity:' + (found ? 0.6 : 1) + '"></button>';
  };
  Fm.spottedLine = function (prefix) { var st = S(), n = Object.keys(st.copilot.docketSpots).length; return SC().session_copy.family.docket_spotted.replace('[n]', n).replace('[m]', Math.max(n, 60)); };
  Fm.animalShrinks = function () { if (on() && window.Sound) Sound.sfx('spring boing'); S().copilot.animal.small = 1; return Fm.clipOnce('FM-V05'); };
  /* A family clip from media_plan used_in, played once (no words: the picture carries it). */
  Fm.clipOnce = function (key) {
    var st = S(); if (!on() || !FCV.isVideo(key) || st.cuts['film:fm:' + key] || !window.Director) return Promise.resolve();
    return Director.play([{ visual: { asset: key }, dur_min: 6 }], { id: 'fm:' + key, full: true });
  };
  /* Bedtime and Good morning */
  Fm.bedtime = async function () {
    /* item 57: Bedtime stop turns on Bedtime volume */
    if (window.AudioCtl && AudioCtl.preset) AudioCtl.preset('quiet');
    await Game.flush();
    if (window.Sound) Sound.music('CM-LULLABY');
    await Director.play([{ visual: { asset: 'FM-S04', move: 'slow push-in' }, subtitle: SC().narration.lines['CN-GOODNIGHT'].text, voice: 'CN-GOODNIGHT', speaker: 'marigold', dur_min: 6 }], {});
    await Session.endShift();
  };
  Fm.goodMorning = async function () {
    if (!on()) return;
    if (window.Sound) Sound.music('CM-SUNRISE');
    await Director.play([{ visual: { asset: 'FM-S05', move: 'slow push-in' }, subtitle: SC().narration.lines['CN-MORNING'].text, voice: 'CN-MORNING', speaker: 'marigold', dur_min: 3 }], {});
  };
  /* The journey strip: nine badges in a board-game path, the bike token on the current stop. */
  Fm.journeyHTML = function () {
    var st = S(), here = 0; for (var n = 1; n <= 7; n++) if (FCV.actDone(st, n)) here = n;
    if (FCV.vivaOpen(st)) here = 8;
    var h = '<div class="journey" aria-label="Journey: stop ' + (here + 1) + ' of 9">';
    for (var i = 0; i < 9; i++) { var u = FCV.assetUrl('FM-S' + (10 + i)); h += '<i class="' + (i < here ? 'done' : '') + (i === here ? ' here' : '') + '" style="' + (u ? 'background-image:url(' + u + ')' : '') + '"></i>'; }
    return h + '</div>';
  };
  Fm.journeyHop = function () { if (on() && window.Sound) Sound.sfx('bike bell'); };

  /* ---------------- Kid drive: writes only copilot.*; not a day played ---------------- */
  var kid = null;
  Fm.kidDrive = async function () {
    var c = SC().session_copy.family, st = S();
    var mins = await UI.modal(c.kid_drive, '<p>Story markers become "' + esc(c.dads_job) + '" signs; parcels hide; the Kerb Inspectors stay home.</p>', [{ label: '5 minutes', value: 5, cls: 'go' }, { label: '10 minutes', value: 10 }, { label: 'Not now', value: 0 }]);
    if (!mins) return;
    var p = Game.player();
    await Game.flush();
    kid = { snap: JSON.stringify(st), pos: { x: p.x, y: p.y }, until: Date.now() + mins * 60000, played: st.played, days: st.days.slice() };
    /* Nothing the co-pilot does reaches Dad's save: writes are held until Give it back, which keeps only copilot data. */
    Game.kidDrive = true; Save.hold(true); document.body.classList.add('kidDrive'); Game.refresh();
    /* D1-M4, D1-m8: the Give it back button sits in the HUD under "Co-pilot driving", never over the road or the tray;
       the Esc words only show on a keyboard */
    var old = $('kidBar'); if (old) old.remove();
    var bar = document.createElement('div'); bar.id = 'kidBar'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<button class="btn go small" type="button" id="giveBack">' + esc(c.give_back) + '</button>' + (UI.kb && UI.kb() ? '<span>Esc gives it back.</span>' : '');
    var obj = $('objective'); if (obj && obj.parentNode) obj.parentNode.insertBefore(bar, obj.nextSibling); else document.body.appendChild(bar);
    $('giveBack').onclick = Fm.giveBack;
    kid.t = setInterval(function () { if (Date.now() >= kid.until) { UI.toast(c.time_up, 3000); Fm.giveBack(); } else Fm.stunts(); }, 150);
  };
  /* AUDR2-02: Dad's save comes back with today's sound settings (the Time Machine's rule), so the buttons, the saved
     settings and what is heard always agree after Give it back */
  function restored() {
    var back = JSON.parse(kid.snap); back.copilot = S().copilot;
    if (S().settings && S().settings.audio) { back.settings = back.settings || {}; back.settings.audio = JSON.parse(JSON.stringify(S().settings.audio)); back.settings.at = S().settings.at || 0; if (S().settings.volume !== undefined) back.settings.volume = S().settings.volume; FCV.syncOldAudio(back.settings); }
    return Save.upgrade(back);
  }
  Fm.giveBack = function () {
    if (!kid) return;
    Fm.endRace();
    /* QAD3-m4: the co-pilot's own menu closes when the game goes back to Dad (its safe button, Keep driving) */
    var mb = $('modalBox'), mo = $('modal');
    if (mo && !mo.classList.contains('hidden') && mb && mb.getAttribute('aria-label') === 'Co-pilot driving') { var kb = mb.querySelector('.btn[data-i="2"]'); if (kb) kb.click(); }
    if (Game.isBusy()) { UI.toast('One moment: finish this first.', 1600); return; }
    clearInterval(kid.t);
    Game.adopt(restored()); if (window.Mastery) Mastery.bump(); Game.kidDrive = false; Save.hold(false); document.body.classList.remove('kidDrive');
    Game.applySettings(); if (window.AudioCtl && AudioCtl.refresh) AudioCtl.refresh();
    Game.placePlayer(kid.pos.x, kid.pos.y); kid = null; var bar = $('kidBar'); if (bar) bar.remove();
    Game.refresh(); Game.flush();
    if (Game.pendingMerge) { var r = Game.pendingMerge; Game.pendingMerge = null; Game.mergeRemote(r); }
  };
  Fm.kidDriving = function () { return !!kid; };
  /* The tab closes mid-drive: write Dad's save as it was, plus the co-pilot's stickers. */
  Fm.kidPagehide = function () { if (!kid) return; try { Save.flushNow(restored(), true); } catch (e) {} };
  /* Stunt jumps: one per district, one at the Locker, one on the Hall approach; no fall can hurt. */
  Fm.stunts = function () {
    var city = Game.city(), p = Game.player(), st = S(); if (!city) return;
    var ramps = city.decor.filter(function (d) { return d.kind === 'sign'; }).map(function (d) { return { id: 'act' + d.act, x: d.x, y: d.y + 90 }; });
    var lk = city.markers.filter(function (m) { return m.id === 'locker-gate'; })[0], vm = city.markers.filter(function (m) { return m.id === 'viva'; })[0];
    if (lk) ramps.push({ id: 'locker', x: lk.x, y: lk.y + 160 }); if (vm) ramps.push({ id: 'hall', x: vm.x, y: vm.y + 120 });
    /* the bike can move 190 px between checks at full speed: test the path since the last check, not just the point */
    var lp = Fm._lastPos || { x: p.x, y: p.y }; Fm._lastPos = { x: p.x, y: p.y };
    if (Date.now() - (Game.teleportAt || 0) < 400) return; /* placed, not ridden */
    var segDist = function (r) { var dx = p.x - lp.x, dy = p.y - lp.y, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((r.x - lp.x) * dx + (r.y - lp.y) * dy) / L)) : 0; return Math.hypot(lp.x + t * dx - r.x, lp.y + t * dy - r.y); };
    var moved = Math.hypot(p.x - lp.x, p.y - lp.y); if (moved > 400) return; /* a teleport (race start, Ride there), not a ride */
    ramps.forEach(function (r) { if (segDist(r) < 40 && (p.speed > 200 || moved > 40) && Fm._lastRamp !== r.id) { Fm._lastRamp = r.id; var firstJump = !Object.keys(st.copilot.stunts).length; st.copilot.stunts[r.id] = 1; if (firstJump) { if (Game.racing) Fm._afterRace = 'FM-V03'; else Fm.clipOnce('FM-V03'); } if (window.Sound) Sound.sfx('spring boing'); if (window.Kit) Kit.sfx('SFX-BIKE-LAND'); if (window.Voice && on()) setTimeout(function () { Voice.say({ key: 'VOX-OOH', pri: 'menu' }); }, 300); UI.toast('Stunt jump. ' + Object.keys(st.copilot.stunts).length + ' of 9.', 1500); setTimeout(function () { Fm._lastRamp = null; }, 3000); } });
  };
  /* the running race, if any: Give it back (Esc or the timer) ends it first */
  var race = null;
  Fm.endRace = function () { if (race) race.end(); };
  /* stunts run in family mode on any ride, not only in Kid drive (FM7) */
  setInterval(function () { try { if (on() && !kid && window.Game && Game.city && Game.city() && !(Game.isBusy && Game.isBusy())) Fm.stunts(); if (on()) Fm.sighting(); } catch (e) {} }, 150);
  /* FM2 sightings: riding within 120 px of the Animal logs a sticker for its current state; the first plays FM-V01 */
  Fm.sighting = function () {
    var an = Game.animal && Game.animal(), p = Game.player(), st = S(); if (!an || !p || !st.copilot || (Game.isBusy && Game.isBusy())) return;
    if (Math.hypot(an.x - p.x, an.y - p.y) > 120) return;
    var key = 'sighting-' + an.size; st.copilot.animal = st.copilot.animal || {}; if (st.copilot.animal[key]) return;
    var first = !Object.keys(st.copilot.animal).some(function (k) { return /^sighting-/.test(k); });
    st.copilot.animal[key] = Date.now(); if (window.Sound) Sound.sfx(an.size === 'big' ? 'animal honk' : 'meep');
    UI.toast('Animal spotted. Sticker ' + Object.keys(st.copilot.animal).filter(function (k) { return /^sighting-/.test(k); }).length + ' of 3.', 2000);
    if (!Game.kidDrive) Game.save();
    if (first) Game.runFlow(function () { return Fm.clipOnce('FM-V01'); });
  };
  /* Same Door Dash: a race to the district's drop box against a friendly rival courier; the horn gives 1.5 s of speed (3 charges). */
  Fm.race = async function (n) {
    var st = S(), start = Game.cityMarker('act' + n + '-tp'), fin = Game.cityMarker('act' + n + '-drop'); if (!start || !fin) return;
    var violet = FCV.character && FCV.character('violet'), s09 = FCV.assetUrl('FM-S09'), s08 = FCV.assetUrl('FM-S08');
    await UI.modal('Same Door Dash', (s09 ? '<img alt="" src="' + s09 + '" style="width:100%;max-height:36vh;object-fit:cover;border-radius:10px">' : '') + '<p>' + esc(violet ? violet.name + ': ' + violet.role + '.' : 'A friendly rival races you to the same door.') + ' Ride to the drop box. ' + (UI.kb && !UI.kb() ? 'Tap Honk' : 'Press Honk') + ' for a boost (3 charges).</p>', [{ label: 'Go', value: 1, cls: 'go' }]);
    /* markers inert and parcels hidden for the race, as in Kid drive, so no scene or parcel opens behind the clock */
    if (Game.setRacing) Game.setRacing(true);
    /* QAD3-m1: the gold arrow and the objective line point at this race's drop box */
    if (Game.setRaceTarget) Game.setRaceTarget(fin, n);
    Game.placePlayer(start.x, start.y + 60); Game.setRoute([{ x: start.x, y: start.y + 60 }, { x: fin.x, y: fin.y }]);
    if (window.Sound) Sound.music('CM-RACE');
    var charges = 3, rivalMs = 9000 + Math.random() * 3000;
    var rv = document.createElement('div'); rv.id = 'raceRival'; rv.setAttribute('aria-hidden', 'true');
    rv.innerHTML = (s08 ? '<img alt="" src="' + s08 + '">' : '') + '<div class="bar"><i></i></div>'; document.body.appendChild(rv);
    /* D1-m3: Honk is the race's only control, so the tray opens for the race and folds again after it */
    var trayWas = $('dock') && $('dock').getAttribute('aria-expanded') === 'true'; Fm.tray(true);
    /* D1-m2: the race card sits under the minimap and Top view, and to the left of the open tray if they would meet */
    /* QAD2-m1: visibility by client rects and computed display (offsetParent is always null for fixed elements such as
       the tray); placed again once the tray has finished opening; below 500 px high the card sits under the left HUD */
    var shownEl = function (e) { if (!e || !e.getClientRects().length) return false; var cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
    var meets = function (a, b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; };
    var placeRival = function () {
      try {
        rv.style.left = ''; rv.style.right = '14px';
        var anchors = ['btnTop', 'minimapWrap', 'saveTick'].map($).filter(shownEl).map(function (e) { return e.getBoundingClientRect(); });
        var top = anchors.length ? Math.max.apply(null, anchors.map(function (r) { return r.bottom; })) + 8 : 70;
        rv.style.top = Math.round(top) + 'px';
        var d = $('dock'), dr = shownEl(d) ? d.getBoundingClientRect() : null, r = rv.getBoundingClientRect();
        if (dr && dr.width && meets(r, dr)) {
          if (window.innerHeight < 500) {
            var hl = $('hudLeft'), hb = shownEl(hl) ? hl.getBoundingClientRect().bottom + 8 : 70;
            rv.style.right = ''; rv.style.left = '14px'; rv.style.top = Math.round(hb) + 'px';
            r = rv.getBoundingClientRect();
            if (r.bottom > window.innerHeight - 8 || meets(r, dr)) { rv.style.left = ''; rv.style.right = Math.round(window.innerWidth - dr.left + 10) + 'px'; rv.style.top = Math.round(Math.max(8, dr.top - r.height - 8)) + 'px'; }
          } else rv.style.right = Math.round(window.innerWidth - dr.left + 10) + 'px';
        }
      } catch (e) {}
    };
    placeRival(); setTimeout(placeRival, 300); setTimeout(placeRival, 800);
    return new Promise(function (res) {
      race = { end: function () { done(null); } };
      var boost = function () { if (charges > 0) { charges--; Game.boost = performance.now() + 1500; if (window.Sound) Sound.sfx('CFX-HONK'); } };
      var oldPress = Fm.press; Fm.press = function (w) { if (w === 'honk') boost(); else oldPress(w); };
      var done = function (v) {
        if (!race) return; race = null; clearInterval(iv); Fm.press = oldPress; Game.setRoute(null); rv.remove(); if (!trayWas) Fm.tray(false); if (Game.setRaceTarget) Game.setRaceTarget(null); if (Game.setRacing) Game.setRacing(false); if (Game.resetDistrictMusic) Game.resetDistrictMusic();
        /* QAD3-m2: a stunt film earned during the race plays once the race is over */
        if (Fm._afterRace) { var clip = Fm._afterRace; Fm._afterRace = null; var tries = 0, w = setInterval(function () { if (++tries > 80) { clearInterval(w); return; } if (UI.busy() || Game.isBusy() || Game.racing) return; clearInterval(w); Game.runFlow(function () { return Fm.clipOnce(clip); }); }, 500); }
        res(v);
      };
      /* QAD3-m2: the race clock runs only while the race is on the screen: never under the menu, a film, a dialog or a
         hidden tab, so a child never loses the medal to something else taking the screen */
      var el = 0, lastT = Date.now();
      var iv = setInterval(function () {
        var nowT = Date.now(), dt = nowT - lastT; lastT = nowT;
        if (!document.hidden && !UI.busy() && !Game.isBusy()) el += dt;
        var p = Game.player(), bar = rv.querySelector('.bar i'); if (bar) bar.style.width = Math.min(100, el / rivalMs * 100) + '%';
        /* the drop box stands about 60 px off the street: the finish counts from the street front (100 px) */
        if (Math.hypot(p.x - fin.x, p.y - fin.y) < 100) {
          var ms = el, medal = ms < rivalMs * 0.8 ? 'gold' : ms < rivalMs ? 'silver' : 'bronze', key = 'act' + n, prev = st.copilot.races[key];
          var RK = { bronze: 1, silver: 2, gold: 3 };
          if (!prev || RK[medal] > RK[prev.medal] || (medal === prev.medal && ms < prev.bestMs)) st.copilot.races[key] = { medal: medal, bestMs: ms };
          UI.banner(medal.toUpperCase() + ' MEDAL', Math.round(ms / 100) / 10 + ' s'); if (!Game.kidDrive) Game.save(); done(medal); return;
        }
        /* QAD3-m3: a race not finished in a minute says so, and says where to race again */
        if (el > 60000) { var vn = violet && violet.name ? String(violet.name).split(' ')[0] : 'Your rival'; done(null); UI.banner('TIME UP', vn + ' got there first'); UI.toast('Time up. Race again from More, Same Door Dash.', 4000); }
      }, 100);
    });
  };
  /* Dot patrol (after scene 6.2): one kiosk at a time fades grey and a small dot appears; find it with the magnifier. */
  Fm.dotPatrol = async function () {
    var dp = FAM().dot_patrol, cards = dp.cards_in_order, found = 0, st = S(), bg = FCV.assetUrl(dp.backdrop || 'FM-S51');
    /* QAD3-m5 and m8: a way back from everywhere: Not now here, and Stop (or Esc) during the round, keeping the finds */
    var go = await UI.modal('Dot patrol', '<p>One kiosk at a time fades to plain grey and a small dark dot appears inside. Co-pilot, find it. Each find opens a card.</p>', [{ label: 'Start: 40 seconds', value: 1, cls: 'go' }, { label: 'Not now', value: 0 }]);
    if (!go) return;
    var layer = $('mech'), box = $('mechBox'); layer.classList.remove('hidden'); UI.letterbox();
    var cells = ''; for (var i = 0; i < 12; i++) cells += '<button class="dpKiosk pickable" type="button" data-k="' + i + '" aria-label="Kiosk ' + (i + 1) + '" style="left:' + (6 + (i % 6) * 15.5) + '%;top:' + (i < 6 ? 30 : 62) + '%"></button>';
    /* three icons tick past on every find, for "notice, time to explain, then separation": an envelope, a clock, a box splitting */
    var icons = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="4" y="9" width="32" height="22" rx="3" fill="#fff3e0" stroke="#15101f" stroke-width="3"/><path d="M5 11 L20 23 L35 11" fill="none" stroke="#15101f" stroke-width="3"/></svg>' +
      '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="15" fill="#fff3e0" stroke="#15101f" stroke-width="3"/><path d="M20 11 V20 L27 24" fill="none" stroke="#15101f" stroke-width="3" stroke-linecap="round"/></svg>' +
      '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="12" width="15" height="18" rx="2" fill="#c9a46a" stroke="#15101f" stroke-width="3"/><rect x="22" y="12" width="15" height="18" rx="2" fill="#c9a46a" stroke="#15101f" stroke-width="3"/><path d="M20 6 V36" stroke="#15101f" stroke-width="2" stroke-dasharray="3 3"/></svg>';
    box.innerHTML = '<div class="mgHead"><h2>Dot patrol</h2><span class="grow"></span><span id="dpLeft"></span><button class="btn small" type="button" id="dpStop">Stop</button></div><div class="dpWrap"><div><div class="dpStage"' + (bg ? ' style="background-image:url(' + bg + ')"' : '') + '>' + cells + '</div><div class="dpIcons">' + icons + '</div></div><div class="dpCards" aria-live="polite"></div></div>';
    var target = -1, end = Date.now() + (dp.length_s || 40) * 1000;
    /* the next grey kiosk is always one the child can see and click: its centre must be on top */
    var visible = function (b) { var r = b.getBoundingClientRect(); if (!r.width) return false; var el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el === b || (el && b.contains(el)); };
    var pickNew = function () {
      var all = Array.prototype.slice.call(box.querySelectorAll('[data-k]')); all.forEach(function (b) { b.classList.remove('grey'); });
      var ok = all.filter(function (b) { return +b.getAttribute('data-k') !== target && visible(b); }); if (!ok.length) ok = all.filter(function (b) { return +b.getAttribute('data-k') !== target; });
      var pick = ok[Math.floor(Math.random() * ok.length)]; target = +pick.getAttribute('data-k'); pick.classList.add('grey');
    };
    var tickIcons = function () { var ic = box.querySelectorAll('.dpIcons svg'); Array.prototype.forEach.call(ic, function (x) { x.classList.remove('on'); }); Array.prototype.forEach.call(ic, function (x, k) { setTimeout(function () { x.classList.add('on'); }, 250 + k * 350); }); };
    /* one card per find, in order, newest on top; link 5 keeps its hollow 'proposed' pip (the card's own label says so) */
    var reveal = function () { tickIcons(); if (found > cards.length) return; var id = cards[found - 1]; box.querySelector('.dpCards').insertAdjacentHTML('afterbegin', '<div class="' + (/link-5/.test(id) ? 'hollowPip' : '') + '">' + UI.cardHTML(id, { noMet: true, compact: true }) + '</div>'); };
    pickNew();
    await new Promise(function (res) {
      Array.prototype.forEach.call(box.querySelectorAll('[data-k]'), function (b) { b.addEventListener('click', function () { if (+b.getAttribute('data-k') === target) { found++; if (window.Sound) Sound.sfx('kiosk boop'); if (window.Juice && !st.settings.reduceMotion) Juice.particles(b, 12); reveal(); pickNew(); } }); });
      var over = false, stop = function () { if (over) return; over = true; clearInterval(iv); document.removeEventListener('keydown', escK, true); res(); };
      var escK = function (e) { if (e.key === 'Escape' && $('modal').classList.contains('hidden')) { e.preventDefault(); e.stopPropagation(); stop(); } };
      document.addEventListener('keydown', escK, true);
      var sb = box.querySelector('#dpStop'); if (sb) sb.addEventListener('click', stop);
      var iv = setInterval(function () { var left = Math.max(0, Math.round((end - Date.now()) / 1000)); var l = box.querySelector('#dpLeft'); if (l) l.textContent = left + ' s · found ' + found; if (left <= 0) stop(); }, 250);
    });
    layer.classList.add('hidden'); box.innerHTML = ''; UI.letterbox();
    if (found >= 5) st.copilot.stickers['dot-patrol'] = Date.now();
    st.copilot.finds['dot'] = Math.max(st.copilot.finds.dot || 0, found); Game.save();
    await UI.modal('Dot patrol', '<p>Found ' + found + '.' + (found >= 5 ? ' Sticker: five finds.' : '') + '</p>', [{ label: 'Back', value: 1, cls: 'go' }]);
  };
  /* The graduation photo: a canvas composite saved through downloads.save. */
  Fm.photo = async function (result) {
    var cv = document.createElement('canvas'); cv.width = 1600; cv.height = 1000; var c = cv.getContext('2d');
    c.fillStyle = '#15101f'; c.fillRect(0, 0, 1600, 1000);
    var load = function (k) { return new Promise(function (r) { var u = FCV.assetUrl(k); if (!u) return r(null); var im = new Image(); im.onload = function () { r(im); }; im.onerror = function () { r(null); }; im.src = u; }); };
    var bg = await load('S16'); if (bg) c.drawImage(bg, 0, 0, 1600, 1000);
    var cast = ['img-00', 'GM-CH-01', FCV.portrait('vera'), FCV.portrait('dr_tally'), FCV.portrait('prof_kerbstone'), FCV.portrait('digits')].filter(Boolean);
    for (var i = 0; i < cast.length; i++) { var im = await load(cast[i]); if (im) c.drawImage(im, 80 + i * 245, 560, 220, 220); }
    c.fillStyle = 'rgba(21,16,31,.8)'; c.fillRect(0, 820, 1600, 180); c.fillStyle = '#ffd166'; c.font = '64px Bangers, Impact'; c.textAlign = 'center';
    c.fillText('Freight City Viva', 800, 890); c.fillStyle = '#fff3e0'; c.font = '36px sans-serif'; var RES = { none: 'No corrections', minor: 'Minor corrections', major: 'Major corrections', fail: 'Not awarded' };
    c.fillText(new Date().toLocaleDateString('en-GB') + (result ? ' · ' + (RES[result] || result) : ''), 800, 950);
    var d = Save.downloads(); if (!d) { UI.toast('Saving pictures is not available here.', 2500); return; }
    var blob = await new Promise(function (r) { cv.toBlob(r, 'image/png'); });
    try { await d.save({ filename: 'freight-city-graduation-' + FCV.today() + '.png', data: blob }); } catch (e) { try { await d.save({ filename: 'freight-city-graduation-' + FCV.today() + '.png', data: cv.toDataURL('image/png') }); } catch (e2) { UI.toast('The photo was not saved.', 2500); } }
  };
  window.Family = Fm;
})();
