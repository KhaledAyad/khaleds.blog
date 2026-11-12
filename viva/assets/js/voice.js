/* Freight City Viva v3: the cast voice engine.
   One index (assets/media/cast/voice_index.json): line id -> {pack, start, duration, speaker, text}. A line plays only when the
   words on screen are the clip's own words (whitespace and curly quotes aside), so a subtitle always matches what is said.
   Older script-path keys reach the cast through key_map.json. Packs play through a small pool of audio elements routed into
   the voice bus (unlocked on the first tap, which iOS needs), with a decoded-buffer fallback if an element is refused.
   One voice at a time: Hall examiner > film > scene line > card read > menu line > radio. A lower one never cuts a higher one. */
(function () {
  'use strict';
  var IDX = null, KM = {}, BYT = {}, loadP = null, DIR = 'assets/media/cast/';
  var PRI = { radio: 1, menu: 2, card: 3, scene: 4, film: 5, hall: 6 };
  var EXAMINERS = { dr_tally: 1, prof_kerbstone: 1 };
  var pool = [], POOL_N = 4, cur = null, seq = 0, unlocked = false, paused = false, bufs = {}, bufOrder = [];
  var V = {};
  function G() { return window.Game && Game.state; }
  function SET() { var s = G(); return (s && s.settings) || FCV.defaultSettings(); }
  function AU() { var s = SET(); return s.audio || FCV.normAudio(null, s); }
  /* the same words: curly quotes, spacing, and ! against . (copy has no exclamation marks; an actor may say it with energy) do not count */
  /* AUD-06: quote marks that wrap a whole line ('Congratulations, Doctor.') are not part of the words said */
  function norm(t) { var s = String(t == null ? '' : t).replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u00A0/g, ' ').replace(/!/g, '.').replace(/\s+/g, ' ').trim(); var m = /^(['"])([\s\S]*)\1$/.exec(s); if (m && m[2].indexOf(m[1] + ' ') < 0) s = m[2].trim(); return s; }
  V.norm = norm;

  function indexUrl() {
    var m = FCV.media && FCV.media['VO-CAST'], raw = m && m.raw;
    return { index: (raw && raw.index) || DIR + 'voice_index.json', keymap: (raw && raw.keymap) || DIR + 'key_map.json' };
  }
  V.load = function () {
    if (loadP) return loadP;
    var u = indexUrl();
    var get = function (url) { return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
    loadP = Promise.all([get(u.index), get(u.keymap)]).then(function (res) {
      IDX = res[0] && typeof res[0] === 'object' ? res[0] : {};
      KM = (res[1] && res[1].map) || {};
      BYT = {};
      Object.keys(IDX).forEach(function (id) { var e = IDX[id]; if (!e || !e.pack || !(e.duration > 0)) return; var k = norm(e.text); (BYT[k] = BYT[k] || []).push(id); });
      return IDX;
    });
    return loadP;
  };
  V.ready = function () { return !!IDX; };
  V.entry = function (id) { return IDX && IDX[id] || null; };
  V.size = function () { return IDX ? Object.keys(IDX).length : 0; };

  /* Find the clip for a key and the words shown. The words win: a key whose clip says something else is ignored. */
  function byText(text, speaker) {
    var ids = BYT[norm(text)]; if (!ids || !ids.length) return null;
    if (speaker) for (var i = 0; i < ids.length; i++) if (IDX[ids[i]].speaker === speaker) return ids[i];
    return ids[0];
  }
  V.find = function (key, text, speaker) {
    if (!IDX) return null;
    var id = null, direct = !!(key && IDX[key]), shown = text;
    if (key) id = direct ? key : (KM[key] && IDX[KM[key]] ? KM[key] : null);
    /* an older script-path key with no words passed: its words are the script's own */
    if (shown == null && key && !direct && window.Sound && Sound.sourceText) { try { shown = Sound.sourceText(key); } catch (e) { shown = null; } }
    if (id && shown != null && norm(shown) && norm(IDX[id].text) !== norm(shown)) id = null;
    if (!id && shown) id = byText(shown, speaker);
    return id;
  };
  V.has = function (id) { return V.load().then(function () { return !!V.find(id, null, null); }); };

  /* Who may speak now. "You" never; in the Hall only the examiners; Voices off or at 0 silences every clip. */
  function allowed(speaker, o) {
    var a = AU(), s = SET();
    if (speaker === 'you') return false;
    if (a.characterVoices === false || !(a.voice > 0)) return false;
    if (speaker && a.voiceOff && a.voiceOff[speaker]) return false;
    var hall = document.getElementById('viva'); if ((o.inHall || (hall && !hall.classList.contains('hidden'))) && !EXAMINERS[speaker]) return false;
    if (EXAMINERS[speaker] && o.inHall && s.examinerVoice === false) return false;
    if (o.pri === 'radio' && (a.musicOff || a.station === 'off' && !o.force)) return false;
    if (o.pri === 'card' && !o.asked && a.readAloud === false) return false;
    return true;
  }

  /* ---------- the pool of pack players ---------- */
  function connect(el) {
    var c = window.Sound && Sound.ctx && Sound.ctx(); if (!c || el.__fcvConnected) return;
    try { var n = c.createMediaElementSource(el); n.connect(Sound.voiceInput()); el.__fcvConnected = true; } catch (e) {}
  }
  function makeEl() { var el = new Audio(); el.preload = 'auto'; el.__fcvVoice = true; connect(el); return { el: el, pack: null, last: 0 }; }
  function playerFor(pack) {
    var now = Date.now(), p = null, i;
    for (i = 0; i < pool.length; i++) if (pool[i].pack === pack) { pool[i].last = now; return pool[i]; }
    if (pool.length < POOL_N) { p = makeEl(); pool.push(p); }
    else { p = pool.filter(function (x) { return !cur || x.el !== cur.el; }).sort(function (x, y) { return x.last - y.last; })[0] || pool[0]; }
    p.pack = pack; p.last = now; p.el.src = DIR + pack + '.mp4'; try { p.el.load(); } catch (e) {}
    return p;
  }
  /* First tap: make the players and let each make a sound once inside the gesture (iOS needs it); load the system pack. */
  V.unlock = function () {
    V.load();
    if (unlocked) return; unlocked = true;
    while (pool.length < POOL_N) pool.push(makeEl());
    /* each player plays the system pack's opening 0.1 s of silence, unmuted, inside the tap: iOS then lets it play later */
    pool.forEach(function (p) {
      connect(p.el);
      if (!p.pack) { p.pack = 'vo-system'; p.el.src = DIR + 'vo-system.mp4'; }
      try { var pr = p.el.play(); var stop = function () { setTimeout(function () { if (!cur || cur.el !== p.el) { try { p.el.pause(); } catch (e) {} } }, 60); }; if (pr && pr.then) pr.then(stop).catch(function () {}); else stop(); } catch (e) {}
    });
  };
  /* Decoded fallback for a refused element: the pack at 24 kHz, the three most recent kept. */
  function bufferFor(pack) {
    if (bufs[pack]) return bufs[pack];
    var c = window.Sound && Sound.ctx && Sound.ctx(); if (!c) return Promise.resolve(null);
    bufs[pack] = fetch(DIR + pack + '.mp4').then(function (r) { return r.arrayBuffer(); }).then(function (ab) {
      return new Promise(function (res) { c.decodeAudioData(ab, res, function () { res(null); }); });
    }).catch(function () { return null; });
    bufOrder.push(pack); if (bufOrder.length > 3) { var old = bufOrder.shift(); delete bufs[old]; }
    return bufs[pack];
  }

  function kindOf(e, o) { return o.pri === 'radio' || e.speaker === 'radio' ? 'radio' : e.speaker === 'marigold' ? 'narration' : 'character'; }
  /* Play one line by id. Resolves true when it played to its end, false if it could not play or was cut short. */
  function playId(id, o) {
    var e = IDX[id], pri = PRI[o.pri] || PRI.scene;
    if (!e) return Promise.resolve(false);
    if (cur && !cur.done && cur.pri > pri) return Promise.resolve(false);
    V.stop(true);
    var s = G(), a = AU();
    var rate = e.speaker === 'animal' ? (s && FCV.isDone && FCV.isDone(s, 4, 'tp') ? 0.94 : 0.84) : (a.voiceRate || 1);
    return new Promise(function (res) {
      var p = playerFor(e.pack), el = p.el, me = { id: id, e: e, pri: pri, el: el, done: false, rate: rate, o: o, at: Date.now() }, timer = null, guard = null;
      cur = me;
      var endT = e.start + e.duration;
      var finish = function (ok) {
        if (me.done) return; me.done = true; clearTimeout(timer); clearTimeout(guard);
        el.removeEventListener('timeupdate', tu); el.removeEventListener('playing', onPlaying);
        if (me.src) { try { me.src.stop(); } catch (x) {} } else { try { el.pause(); } catch (x) {} }
        if (cur === me) cur = null;
        if (window.Sound && Sound.duckRelease) Sound.duckRelease();
        if (o.onEnd) try { o.onEnd(ok); } catch (x) {}
        res(ok);
      };
      me.finish = finish;
      var tu = function () { if (el.currentTime >= endT) finish(true); };
      var onPlaying = function () { clearTimeout(timer); timer = setTimeout(function () { finish(true); }, Math.max(0, (endT - el.currentTime) / rate) * 1000 + 150); };
      var started = function () {
        if (window.Sound && Sound.duckVoice) Sound.duckVoice(kindOf(e, o));
        if (o.onStart) try { o.onStart(e, id); } catch (x) {}
      };
      var viaBuffer = function () {
        bufferFor(e.pack).then(function (b) {
          var c = Sound.ctx(); if (!b || !c || me.done) return finish(false);
          if (o.gate && !o.gate()) { me.gated = true; return finish(false); }
          var src = c.createBufferSource(); src.buffer = b; src.playbackRate.value = e.speaker === 'animal' ? rate : 1; src.connect(Sound.voiceInput());
          me.src = src; src.onended = function () { finish(true); }; src.start(0, e.start, e.duration); started();
        });
      };
      var go = function () {
        if (me.done) return;
        /* AUDR3-04: a gated line (a radio link) checks its gate synchronously just before it plays, and plays nothing if
           the screen changed meanwhile */
        if (o.gate && !o.gate()) { me.gated = true; return finish(false); }
        try { el.currentTime = e.start; } catch (x) {}
        el.playbackRate = rate; try { el.preservesPitch = e.speaker !== 'animal'; el.webkitPreservesPitch = e.speaker !== 'animal'; } catch (x) {}
        el.addEventListener('timeupdate', tu); el.addEventListener('playing', onPlaying);
        var pr; try { pr = el.play(); } catch (x) { pr = null; viaBuffer(); return; }
        started();
        if (pr && pr.catch) pr.catch(function () { if (!me.done) { el.removeEventListener('timeupdate', tu); viaBuffer(); } });
        guard = setTimeout(function () { finish(true); }, (e.duration / rate) * 1000 + 6000);
      };
      if (el.readyState >= 1) go();
      else { el.addEventListener('loadedmetadata', go, { once: true }); setTimeout(function () { if (!me.done && el.readyState < 1) { el.removeEventListener('loadedmetadata', go); viaBuffer(); } }, 7000); }
    });
  }

  /* The device's own voice, only for text with no recording and only when chosen. Never in the Hall, never the courier. */
  function deviceSay(text, o) {
    var a = AU();
    return new Promise(function (res) {
      if (!a.deviceVoice || o.inHall || o.speaker === 'you' || !window.speechSynthesis || a.muted || !(a.voice > 0) || a.characterVoices === false) return res(false);
      var vs = speechSynthesis.getVoices().filter(function (x) { return /en-GB/i.test(x.lang); }), v = vs[0];
      var u = new SpeechSynthesisUtterance(text); if (v) u.voice = v; u.lang = 'en-GB'; u.rate = a.voiceRate || 1;
      u.volume = Math.min(1, Math.pow(a.master / 80, 2) * Math.pow(a.voice / 80, 2));
      u.onend = function () { res(true); }; u.onerror = function () { res(false); };
      cur = { id: 'device', pri: PRI[o.pri] || 3, done: false, finish: function () { try { speechSynthesis.cancel(); } catch (e) {} res(false); } };
      try { speechSynthesis.speak(u); } catch (e) { res(false); }
    });
  }

  /* Say one line. o: {key, text, speaker, pri, inHall, onStart, onEnd, asked, device}. Resolves {played, id}. */
  function normName(s) { return String(s || '').replace(/[^A-Za-z' -]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  /* the person shown where the line is heard: the card's name in a sheet (not under a mini-game), the Hall card's name */
  function screenWho() {
    var vis = function (id) { var el = document.getElementById(id); return el && !el.classList.contains('hidden'); };
    if (vis('viva')) { var vc = document.querySelector('#vivaInner .vivaCard'), vw = vc && vc.querySelector('.who'); return vc ? { box: vc, name: vw ? vw.textContent : '' } : null; }
    if (vis('cut')) return null;
    if (vis('sheet') && !vis('mech')) { var box = document.getElementById('sheetBox'), w = document.querySelector('#talk .who'); return box ? { box: box, name: w ? w.textContent : '' } : null; }
    return null;
  }
  V.say = function (o) {
    o = o || {};
    return V.load().then(function () {
      var id = V.find(o.key, o.text, o.speaker);
      var e = id && IDX[id], who = (e && e.speaker) || o.speaker;
      if (o.speaker === 'you') return { played: false, id: null };
      if (!e) {
        if (o.text && o.device !== false && !(cur && !cur.done && cur.pri > (PRI[o.pri] || 3))) return deviceSay(o.text, o).then(function (ok) { return { played: ok, id: null }; });
        return { played: false, id: null };
      }
      if (!allowed(who, o)) return { played: false, id: id, blocked: true };
      if (o.gate && !o.gate()) return { played: false, id: id, gated: true };
      /* AUD-11: when the voice heard is not the person shown (a quiz read by the narrator under Vera's name), a small tag
         on the card says who is reading, for as long as the line plays */
      /* AUDR2-03: the tag is decided by the screen, not by the caller: while a card is open (not a mini-game) or the Hall
         is up, the name shown on it is compared with the voice heard. If they differ, "Read by ..." shows for as long as
         the line plays (Hear it again too), and the shown person's wave stays dark. */
      var tag = null, place = o.pri === 'radio' ? null : screenWho(), heard = who === 'marigold' ? 'Marigold' : (window.FCV && FCV.nameOf ? FCV.nameOf(who) : who);
      if (place && place.name && who && who !== 'you' && normName(place.name) !== normName(heard)) {
        tag = document.getElementById('readBy') || document.createElement('div'); tag.id = 'readBy'; tag.className = 'readBy'; tag.setAttribute('aria-hidden', 'true');
        tag.textContent = 'Read by ' + heard;
        if (tag.parentNode !== place.box) place.box.appendChild(tag); tag.hidden = false;
        o = Object.assign({}, o, { onStart: (function (os) { return function (e) { if (os) try { os(e); } catch (x) {} var w = place.box.querySelectorAll('.wave.on'); for (var i = 0; i < w.length; i++) w[i].classList.remove('on'); }; })(o.onStart) });
      }
      else if (o.pri !== 'radio') { var old = document.getElementById('readBy'); if (old) old.hidden = true; }
      return playId(id, o).then(function (ok) { if (tag && !(cur && !cur.done && cur.id !== id)) tag.hidden = true; return { played: ok, id: id }; });
    });
  };
  /* Older callers: Sound.voice(key, {speaker, inHall, text}) -> true when played to the end. */
  V.voiceKey = function (key, opts) {
    opts = opts || {};
    return V.say({ key: key, text: opts.text, speaker: opts.speaker, pri: opts.pri || (opts.inHall ? 'hall' : 'film'), inHall: opts.inHall, onStart: opts.onStart, device: opts.device }).then(function (r) { return r.played; });
  };
  /* A run of lines, one after another (a scene line, then the cards it names). Any new say or stop cancels the rest. */
  V.sequence = function (items) {
    var my = ++seq, i = 0;
    var next = function () {
      if (my !== seq || i >= items.length) return Promise.resolve();
      var it = items[i++];
      return V.say(it).then(function (r) { if (it.after) try { it.after(r); } catch (e) {} return new Promise(function (res) { setTimeout(res, r.played ? 250 : 0); }); }).then(next);
    };
    return next();
  };
  V.stop = function (keepSeq) {
    if (!keepSeq) seq++;
    if (cur && !cur.done && cur.finish) cur.finish(false);
    cur = null;
  };
  var resumeO = null;
  V.pause = function (p) {
    paused = p;
    if (p) { resumeO = cur && !cur.done && cur.o ? cur.o : null; if (cur && !cur.done) V.stop(); return; }
    var o = resumeO; resumeO = null;
    var cutOn = document.getElementById('cut'); if (o && !(cutOn && !cutOn.classList.contains('hidden'))) setTimeout(function () { V.say(Object.assign({}, o)); }, 250);
  };
  /* AUDR4-01: at = when the line was asked to play (a Hall line is told apart from a film line that starts just after) */
  V.playing = function () { return cur && !cur.done ? { id: cur.id, pri: cur.pri, speaker: cur.e && cur.e.speaker, at: cur.at || 0 } : null; };
  /* Every clip's words against the index text (they are the same file): reports index size and any line with no audio span. */
  V.check = function () { return V.load().then(function () { var bad = Object.keys(IDX).filter(function (id) { var e = IDX[id]; return !e.pack || !(e.duration > 0); }); return { total: Object.keys(IDX).length, muted: bad }; }); };

  /* ---------- what a card or a sheet reads ---------- */
  /* The words a fact card shows, in the forms a read may take ("Term. Definition." for glossary and term cards). */
  V.cardTexts = function (r) {
    if (!r) return [];
    var out = [], push = function (t) { if (t && out.indexOf(t) < 0) out.push(t); };
    if (r.type === 'eq') push(r.question);
    else if (r.type === 'gap') push(r.gap);
    else if (r.type === 'quiz' || r.type === 'bank') push(r.q);
    else if (r.type === 'trace') push(r.means);
    if (r.figure && r.text) { push(String(r.figure).replace(/[.\s]+$/, '') + '. ' + r.text); }
    if (r.label && r.text) push(String(r.label).replace(/[.\s]+$/, '') + '. ' + r.text);
    push(r.text);
    return out;
  };
  V.cardClip = function (r) {
    if (!IDX || !r) return null;
    var ts = V.cardTexts(r);
    for (var i = 0; i < ts.length; i++) { var id = byText(ts[i], null); if (id) return { id: id, text: ts[i] }; }
    return null;
  };
  V.textClip = function (text, speaker) { return IDX && text ? byText(text, speaker) : null; };

  /* Framing lines the cast recorded in their own words (none carries a fact or a figure; each is unlocked in voice_lines.json):
     the subtitle takes the recorded words, so what is shown is what is said. Exact whole strings only. */
  V.FRAMING = [
    ["Every city has someone who knows where every parcel goes. In Freight City, that's me, Marigold Post.", "Every city's got someone who knows where every parcel goes. In Freight City, that's me. Marigold Post."],
    ["This is you: a courier with one parcel, your thesis, addressed to the Viva Hall.", "This is you. One courier, one parcel, your thesis, addressed to the Viva Hall."],
    ["Seven districts are about to correct you, one chapter each. I'll keep the map.", "Seven districts are about to correct you, one chapter each. No stress. I'll keep the map."],
    ["Your job in the Blank Quarter: where the shippers are, what the traffic is doing, and the one sentence, said aloud.", "Your job in the Blank Quarter: find the shippers, clock the traffic, and say the one sentence out loud."],
    ["Your turn. Say it aloud, word for word.", "Your turn. Say it out loud, word for word."],
    ["Back on air before the Hall. Keep that parcel dry.", "Back on air before the Hall. Keep that parcel dry, yeah?"],
    ["Ada Stacks keeps the trail. She knows which shelves are empty, and why.", "Ada Stacks keeps the trail. She knows which shelves are empty, and exactly why."],
    ["Your job at Method Works: the blueprint, the permits and microphones, the codings, and the Methods Academy across the road.", "Your job at Method Works: the blueprint, the permits, the microphones, the codings. And the Methods Academy over the road."],
    ["Manny Docks has the ledger: every arrangement described, and what held it together.", "Manny Docks has the ledger: every arrangement described, and what held it together. She trusts paper over a handshake."],
    ["Your job here: the clock, the gate, the lockers, and Polly's tally.", "Your job here: the clock, the gate, the lockers, and Polly's tally. Let's ride."],
    ["And Vera is back on air, as promised. One last interview before the Hall.", "And Vera's back on air, like she promised. One last interview before the Hall."],
    ["Your job on the Rooftops: the answer on air, Digits' numbers, the Grill, and a dress rehearsal.", "Your job on the Rooftops: the answer on air, Digits' numbers, the Grill, and a dress rehearsal. Big night."],
    ["Freight FM, live. Courier: horizontal collaboration, in plain English?", "Freight FM, live and loud. Courier: horizontal collaboration, in plain English?"],
    ["The newest reviews must file them somewhere.", "The newest reviews must file them somewhere, surely."],
    ["A caller says: just put everyone's parcels on one van.", "Got a caller on the line. Says: just put everyone's parcels on one van."],
    ["Your whole thesis, one sentence. Go.", "Your whole thesis, one sentence. No pressure. Go."],
    ["Off air: did you plan these conclusions?", "Off air now. Straight up: did you plan these conclusions?"]
  ];
  V.applyFraming = function (script) {
    var map = {}, n = 0; V.FRAMING.forEach(function (p) { map[p[0]] = p[1]; });
    (function walk(o) {
      if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) { if (typeof o[i] === 'string') { if (map[o[i]]) { o[i] = map[o[i]]; n++; } } else walk(o[i]); } return; }
      if (o && typeof o === 'object') Object.keys(o).forEach(function (k) { if (typeof o[k] === 'string') { if (map[o[k]]) { o[k] = map[o[k]]; n++; } } else walk(o[k]); });
    })(script);
    V.framingApplied = n; return n;
  };

  window.Voice = V;
})();
