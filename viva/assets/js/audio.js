/* Freight City Viva v3: audio. One AudioContext from the Press start click; buses (music, effects, voice, ambience, UI)
   into a master, a compressor and a -1 dBFS limiter; ducking under voices; the procedural score on Tone.js from the cue
   sheet (two stems a cue, cross-faded on the bar); about 45 synth effects; the narrator and cast voice clips. */
(function () {
  'use strict';
  var ctx = null, master = null, bus = {}, tone = null, toneP = null, cues = null, cuesP = null, hiddenT = null;
  var vol = { music: 0.55, effects: 0.8, voice: 1, ambience: 0.45, ui: 0.6 }, on = { music: true, effects: true, voice: true };
  var cur = null, lastDistrict = null;
  var TONE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/tone/15.5.65/Tone.min.js';
  var TONE_SRI = 'sha512-LX3X110uP6g1aEybaEWGJXU6rVXHiI8jXXUfXLzkIjXo/WFCqvKhM+2SllMOQsyJO5lKDV8CJfq9BZ7XdAKqnw==';
  function db2g(d) { return Math.pow(10, d / 20); }
  /* D-07, D1-m11, AUD-19: a disconnect of a node that is already disconnected (Tone does this itself when a disposed note
     ends) must never become an uncaught page error. Only that one case is swallowed, and Help keeps a note of it. */
  (function () {
    try {
      var P = window.AudioNode && AudioNode.prototype, od = P && P.disconnect, noted = 0; if (!od || od.__fcv) return;
      var wrapped = function () { try { return od.apply(this, arguments); } catch (e) { if (e && e.name === 'InvalidAccessError') { var n = Date.now(); if (n - noted > 10000) { noted = n; try { if (window.Help && Help.log) Help.log('music', 'a disconnect of a node that had already gone (handled)'); } catch (e2) {} } return; } throw e; } };
      wrapped.__fcv = true; P.disconnect = wrapped;
    } catch (e) {}
  })();

  /* master (Everything) -> mute stage -> compressor -> -1 dBFS limiter. Music runs musicIn -> duck -> music bus; ambience
     ambIn -> duck -> ambience bus; effects -> duck -> master. The music bus is 0 whenever music is off. */
  var BASE = { music: 0.55, effects: 0.8, voice: 1, ambience: 0.45, ui: 0.6 }, muteG = null, lim = null;
  function build(c) {
    master = c.createGain(); master.gain.value = 0.8; muteG = c.createGain(); muteG.gain.value = 1;
    var comp = c.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.2; comp.knee.value = 6;
    lim = c.createDynamicsCompressor(); lim.threshold.value = -1; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.05; lim.knee.value = 0;
    master.connect(muteG); muteG.connect(comp); comp.connect(lim); lim.connect(c.destination);
    ['music', 'effects', 'voice', 'ambience', 'ui'].forEach(function (k) { bus[k] = c.createGain(); bus[k].gain.value = vol[k]; });
    bus.duck = c.createGain(); bus.musicIn = c.createGain(); bus.musicIn.connect(bus.duck); bus.duck.connect(bus.music); bus.music.connect(master);
    bus.ambDuck = c.createGain(); bus.ambIn = c.createGain(); bus.ambIn.connect(bus.ambDuck); bus.ambDuck.connect(bus.ambience); bus.ambience.connect(master);
    bus.effDuck = c.createGain(); bus.effects.connect(bus.effDuck); bus.effDuck.connect(master);
    bus.voice.connect(master); bus.ui.connect(master);
    if (pendingAudio) applyAudio(pendingAudio);
  }
  function A() { var s = window.Game && Game.state && Game.state.settings; return (s && s.audio) || pendingAudio || FCV.audioDefaults(); }
  function musicAllowed() { var a = A(); return !a.musicOff && !(window.Game && Game.safeMode); }
  var pendingAudio = null;
  /* hold the value where it is before a new ramp (cancelScheduledValues alone can jump back to the old level for a moment) */
  function ramp(param, v, tau) { if (!ctx || !param) return; try { if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(ctx.currentTime); else param.cancelScheduledValues(ctx.currentTime); param.setTargetAtTime(v, ctx.currentTime, tau || 0.03); } catch (e) { param.value = v; } }
  function lvl(base, v) { return base * Math.pow(Math.max(0, Math.min(100, v)) / 80, 2); }
  /* Apply settings.audio to every bus at once. Music off stops every music source (cue, layers, Freight FM, stings). */
  function applyAudio(a) {
    pendingAudio = a; if (!ctx || !master) { if (window.AudioCtl) AudioCtl.refresh(); return; }
    var wasOff = on.music === false;
    on.music = musicAllowed(); on.effects = a.sfx > 0; on.voice = a.characterVoices !== false && a.voice > 0;
    vol.music = on.music ? lvl(BASE.music, a.music) : 0; vol.effects = lvl(BASE.effects, a.sfx); vol.ui = lvl(BASE.ui, a.sfx);
    vol.voice = lvl(BASE.voice, a.voice); vol.ambience = lvl(BASE.ambience, a.ambience);
    Object.keys(vol).forEach(function (k) { ramp(bus[k] && bus[k].gain, vol[k], 0.03); });
    ramp(master.gain, lvl(0.8, a.master), 0.03);
    /* AUD-12: Mute all reaches silence within about 0.1 s */
    ramp(muteG.gain, a.muted ? 0 : 1, a.muted ? 0.015 : 0.07);
    if (a.muted) { try { muteG.gain.setValueAtTime(0, ctx.currentTime + 0.07); } catch (e) {} }
    /* AUD-17: the device voice bypasses the engine, so it is stopped here when sound or voices go off */
    if (a.muted || !(a.voice > 0) || a.characterVoices === false || !a.deviceVoice) { try { if (window.speechSynthesis && speechSynthesis.speaking) speechSynthesis.cancel(); } catch (e) {} }
    /* AUD-18: the player's own recording follows Sound off and the voice level */
    try { Array.prototype.forEach.call(document.querySelectorAll('audio.myRec'), function (el) { el.muted = !!a.muted; el.volume = Math.max(0, Math.min(1, (a.voice / 100) * (a.master / 100) * 1.25)); }); } catch (e) {}
    try { lim.channelCount = a.mono ? 1 : 2; lim.channelCountMode = a.mono ? 'explicit' : 'max'; } catch (e) {}
    if (!on.music) stopAllMusic(); else if (wasOff && window.Kit && Kit.musicBack) Kit.musicBack();
    if (window.AudioCtl) AudioCtl.refresh();
  }
  function ac() {
    if (ctx) { if (ctx.state === 'suspended' && !document.hidden) { try { ctx.resume(); } catch (e) {} } return ctx; }
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { ctx = new AC(); build(ctx); } catch (e) { ctx = null; }
    return ctx;
  }
  function stopAllMusic() {
    stopCue(0.12); silenceFading();
    if (window.Kit && Kit.stopMusic) Kit.stopMusic();
    Array.prototype.forEach.call(document.querySelectorAll('video'), function (v) { v.muted = true; });
  }
  /* AUDR4-04: the music engine (Tone.js) is fetched once from cdnjs. If that fails or hangs for 12 s, the tag is removed and
     the fetch is tried again after 2, 6 and 15 s, and again whenever music is asked for. When it arrives, the cue last asked
     for starts, so the note button never shows music on with nothing playing for the rest of the session. */
  var toneTries = 0, toneRetryT = null, TONE_WAITS = [2000, 6000, 15000];
  function retryTone() {
    if (toneRetryT || tone || toneTries >= TONE_WAITS.length) return;
    toneRetryT = setTimeout(function () { toneRetryT = null; if (!tone && !toneP) loadTone(); }, TONE_WAITS[toneTries++]);
  }
  function loadTone() {
    if (window.Tone && tone) return Promise.resolve(window.Tone);
    if (toneP) return toneP;
    var retried = toneTries > 0;
    toneP = new Promise(function (res) {
      if (window.Tone) return res(window.Tone);
      var s = document.createElement('script'), settled = false, to = null;
      var end = function (T) { if (settled) return; settled = true; clearTimeout(to); if (!T) { try { s.remove(); } catch (e) {} } res(T); };
      s.src = TONE_URL; s.integrity = TONE_SRI; s.crossOrigin = 'anonymous';
      s.onload = function () { end(window.Tone || null); }; s.onerror = function () { end(null); };
      to = setTimeout(function () { end(null); }, 12000);
      document.head.appendChild(s);
    }).then(function (T) {
      if (!T) { toneP = null; retryTone(); return null; }
      /* a value that is not a number (a ramp read back from a note released just as its cue was disposed) is skipped,
         never thrown from inside a scheduled callback: the note simply keeps its last level */
      try { var PP = T.Param && T.Param.prototype; if (PP && !PP.__fcvSafe) { var sv = PP.setValueAtTime; PP.setValueAtTime = function (v, t) { if (v === null || v === undefined || (typeof v === 'number' && !isFinite(v)) || (typeof t === 'number' && !isFinite(t))) return this; return sv.apply(this, arguments); }; PP.__fcvSafe = true; } } catch (e) {}
      try { T.setContext(new T.Context(ctx)); } catch (e) { try { T.setContext(ctx); } catch (e2) {} }
      tone = T;
      if (retried) loadCues().then(function () { var w = lastWanted; if (w && !cur && musicAllowed()) playCue(w.id, w.stem); });
      return T;
    });
    return toneP;
  }
  function loadCues() {
    if (cues) return Promise.resolve(cues);
    if (!cuesP) cuesP = (window.Game ? Game.fetchJSON(['assets/media/music/CM-cuesheet.json'], true) : Promise.reject()).then(function (j) { cues = j.cues || {}; return cues; }).catch(function () { cues = {}; return cues; });
    return cuesP;
  }

  /* ---------------- synth effects (native WebAudio) ---------------- */
  function osc(f, dur, type, v, when, slide, dest) {
    var c = ac(); if (!c || !on.effects) return;
    try {
      var t = c.currentTime + (when || 0), o = c.createOscillator(), g = c.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v || 0.1), t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || bus.effects); o.start(t); o.stop(t + dur + 0.05);
    } catch (e) {}
  }
  function noise(dur, v, when, freq, q, dest) {
    var c = ac(); if (!c || !on.effects) return;
    try {
      var n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq || 1800; f.Q.value = q || 0.7; s.buffer = b; g.gain.value = v || 0.1;
      s.connect(f); f.connect(g); g.connect(dest || bus.effects); s.start(c.currentTime + (when || 0));
    } catch (e) {}
  }
  var semis = 0;
  var FX = {
    'CFX-STAMP2': function () { noise(0.08, 0.35, 0, 300, 1); osc(90, 0.12, 'sine', 0.3); noise(0.08, 0.3, 0.16, 300, 1); osc(80, 0.12, 'sine', 0.25, 0.16); },
    'CFX-HONK': function () { osc(330, 0.22, 'square', 0.12); osc(262, 0.22, 'square', 0.1, 0.02); },
    'CFX-WHISTLE': function () { osc(2200, 0.35, 'sine', 0.12, 0, 2600); },
    'CFX-PHONE': function () { for (var i = 0; i < 4; i++) osc(1200, 0.05, 'square', 0.05, i * 0.08); },
    'CFX-TICK': function () { noise(0.02, 0.2, 0, 3500, 3); },
    'CFX-PEN': function () { noise(0.25, 0.06, 0, 5000, 2); },
    'CFX-DOORS': function () { osc(70, 0.8, 'sawtooth', 0.12, 0, 50); noise(0.6, 0.1, 0.1, 400, 1); },
    'CFX-STATIC': function () { noise(0.5, 0.12, 0, 2500, 0.4); },
    'CFX-KEYS': function () { for (var i = 0; i < 3; i++) noise(0.04, 0.15, i * 0.07, 6000, 4); },
    'gavel': function () { osc(140, 0.15, 'square', 0.2, 0, 70); noise(0.06, 0.3, 0, 900, 1); },
    /* item 47: the bell rings in the key of the district he is in */
    'bike bell': function () { var r = window.Kit && Kit.districtTonic ? Kit.districtTonic() : 67, m = r; while (m < 86) m += 12; while (m > 97) m -= 12; var f1 = 440 * Math.pow(2, (m - 69) / 12), f2 = f1 * Math.pow(2, 5 / 12); osc(f1, 0.12, 'triangle', 0.12); osc(f2, 0.25, 'triangle', 0.1, 0.08); },
    'chain clink': function () { osc(2600, 0.08, 'triangle', 0.08); osc(3100, 0.1, 'triangle', 0.06, 0.05); },
    'crowd ooh': function () { noise(0.9, 0.08, 0, 600, 0.6); osc(220, 0.8, 'sine', 0.03, 0, 180); },
    'crowd cheer': function () { noise(1.4, 0.12, 0, 1200, 0.4); },
    'clock chime': function () { [659, 523, 587, 392].forEach(function (f, i) { osc(f, 0.6, 'sine', 0.1, i * 0.35); }); },
    'bollard drop': function () { osc(180, 0.3, 'sine', 0.2, 0, 60); },
    'locker clunk': function () { noise(0.1, 0.3, 0, 500, 1); osc(110, 0.15, 'square', 0.12); },
    'page flip': function () { noise(0.18, 0.12, 0, 4000, 0.8); },
    'packing tape': function () { noise(0.45, 0.1, 0, 3000, 1.5); },
    'net haul': function () { noise(0.6, 0.09, 0, 700, 0.6); osc(160, 0.5, 'sine', 0.06, 0.1, 220); },
    'book thump': function () { osc(100, 0.18, 'sine', 0.3, 0, 60); noise(0.08, 0.15, 0, 400, 1); },
    'balance clank': function () { osc(880, 0.3, 'triangle', 0.1); osc(1320, 0.4, 'triangle', 0.06, 0.03); noise(0.05, 0.2, 0, 2000, 2); },
    'spring boing': function () { osc(300, 0.35, 'sine', 0.14, 0, 700); },
    "Docket's bark": function () { noise(0.07, 0.25, 0, 900, 2); osc(420, 0.08, 'sawtooth', 0.08, 0, 300); noise(0.07, 0.22, 0.13, 900, 2); },
    'foghorn': function () { osc(98, 1.0, 'sawtooth', 0.1, 0, 92); },
    /* the Big Fierce Animal honks back: a deep HOOONK with two puffs while it is big; a small meep after Act 4 */
    'animal honk': function () { osc(73, 0.9, 'sawtooth', 0.09, 0, 69); osc(110, 0.9, 'square', 0.03, 0, 104); noise(0.18, 0.06, 0.95, 600, 1); noise(0.18, 0.06, 1.2, 600, 1); },
    'meep': function () { osc(990, 0.09, 'square', 0.05, 0, 1180); },
    'kiosk boop': function () { osc(988, 0.1, 'sine', 0.12); osc(1319, 0.14, 'sine', 0.1, 0.1); },
    'pigeon flutter': function () { for (var i = 0; i < 6; i++) noise(0.04, 0.12, i * 0.05, 1500, 1); },
    'puddle splash': function () { noise(0.3, 0.15, 0, 1200, 0.5); },
    'confetti pop': function () { noise(0.05, 0.35, 0, 2000, 1); for (var i = 0; i < 5; i++) osc(1500 + i * 300, 0.06, 'triangle', 0.04, 0.05 + i * 0.03); },
    'badge flip': function () { osc(660, 0.08, 'square', 0.06); osc(990, 0.12, 'square', 0.06, 0.07); },
    'fanfare': function () { [523, 659, 784, 1047].forEach(function (f, i) { osc(f, 0.18, 'square', 0.07, i * 0.11); }); osc(1047, 0.5, 'triangle', 0.07, 0.45); },
    'soft shh': function () { noise(0.8, 0.05, 0, 3500, 0.5); },
    'inspector chime': function () { [784, 988, 1175, 988].forEach(function (f, i) { osc(f, 0.18, 'sine', 0.08, i * 0.16); }); },
    'gate beep': function () { osc(1760, 0.08, 'square', 0.05); },
    'radio jingle': function () { [784, 1047, 1319].forEach(function (f, i) { osc(f, 0.12, 'triangle', 0.08, i * 0.09); }); },
    "referee's whistle": function () { osc(2400, 0.4, 'sine', 0.1, 0, 2300); },
    'gavel knock': function () { osc(140, 0.12, 'square', 0.18, 0, 70); },
    'pigeon coo': function () { osc(420, 0.25, 'sine', 0.08, 0, 360); osc(380, 0.3, 'sine', 0.08, 0.3, 330); },
    'thud': function () { osc(110, 0.16, 'sine', 0.18, 0, 70); },
    'bass hit': function () { osc(55, 0.5, 'sine', 0.17, 0, 40); },
    'right': function () { var k = Math.pow(2, semis / 12); osc(660 * k, 0.09, 'square', 0.07); osc(990 * k, 0.16, 'square', 0.07, 0.08); },
    'stage1': function () { osc(523, 0.3, 'triangle', 0.08); }, 'stage2': function () { osc(659, 0.3, 'triangle', 0.08); },
    'stage3': function () { osc(784, 0.35, 'triangle', 0.08); }, 'stage4': function () { osc(988, 0.4, 'triangle', 0.08); },
    'stage5': function () { [523, 659, 784, 1047].forEach(function (f) { osc(f, 0.8, 'triangle', 0.05); }); }
  };
  FX['five stage chimes'] = FX.stage5;

  /* ---------------- the score: Tone.js plays the cue sheet ---------------- */
  var KIND = { sq: 'square', bass_sq: 'square', tri: 'triangle', sine: 'sine', bass_sine: 'sine', pad: 'sine', widepad: 'sine', fogpad: 'sine', vaultpad: 'sine', drone: 'sine', strings: 'sawtooth', brass: 'sawtooth', tuba: 'sawtooth', accordion: 'sawtooth',
    woodwind: 'triangle', whistle: 'sine', piano: 'triangle', epiano: 'sine', harpsi: 'square', pluck: 'triangle', bass_pluck: 'triangle', marimba: 'sine', musicbox: 'sine', bell: 'sine', echo_bell: 'sine', chime: 'sine', timp: 'sine', fx: 'triangle', multi: 'triangle' };
  var SUSTAIN = { pad: 1, widepad: 1, fogpad: 1, vaultpad: 1, drone: 1, strings: 1, accordion: 1 };
  function makeInstr(T, kind, out) {
    if (kind === 'drums') {
      var kick = new T.MembraneSynth({ volume: -8 }).connect(out), snare = new T.NoiseSynth({ volume: -18, envelope: { attack: 0.001, decay: 0.12, sustain: 0 } }).connect(out);
      var hat = new T.MetalSynth({ volume: -30, envelope: { attack: 0.001, decay: 0.05, release: 0.01 } }).connect(out);
      return { trig: function (n, len, vel, time) {
        try {
          if (n === 'kick' || n === 'heart' || n === 'timp') kick.triggerAttackRelease(n === 'heart' ? 'A0' : 'C1', '8n', time, vel);
          else if (n === 'hat' || n === 'tick' || n === 'clank' || n === 'bike' || n === 'ohat' || n === 'shaker' || n === 'ride') hat.triggerAttackRelease(n === 'bike' ? 'C6' : n === 'ohat' || n === 'ride' ? 'G4' : 'C5', n === 'ohat' ? '8n' : '32n', time, vel * (n === 'shaker' ? 0.35 : 0.6));
          else if (n === 'rim' || n === 'wood' || n === 'clap') snare.triggerAttackRelease('32n', time, vel * (n === 'clap' ? 0.8 : 0.45));
          else snare.triggerAttackRelease(n === 'rain' || n === 'brush' || n === 'rustle' || n === 'swish' ? '8n' : '16n', time, vel * 0.7);
        } catch (e) {}
      }, dispose: function () { kick.dispose(); snare.dispose(); hat.dispose(); } };
    }
    var type = KIND[kind] || 'triangle', sus = SUSTAIN[kind];
    var syn = new T.PolySynth(T.Synth, { maxPolyphony: 10, volume: sus ? -20 : /bass/.test(kind) ? -12 : -16, oscillator: { type: type },
      envelope: sus ? { attack: 0.4, decay: 0.3, sustain: 0.7, release: 1.2 } : /bell|chime|musicbox|marimba|pluck|harpsi/.test(kind) ? { attack: 0.002, decay: 0.6, sustain: 0, release: 0.6 } : { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.3 } }).connect(out);
    return { trig: function (n, len, vel, time) { try { syn.triggerAttackRelease(T.Frequency(n, 'midi').toFrequency(), len, time, Math.min(1, vel)); } catch (e) {} }, release: function () { try { syn.releaseAll(); } catch (e) {} }, dispose: function () { syn.dispose(); } };
  }
  function stemLength(cue, stem) {
    var end = 0; stem.tracks.forEach(function (t) { t.events.forEach(function (e) { end = Math.max(end, e[0] + (e[2] || 0)); }); });
    var bpb = cue.beats_per_bar || 4; return Math.max(bpb, Math.ceil(end / bpb) * bpb);
  }
  function playCue(id, stemName) {
    if (!musicAllowed() || !tone || !cues || !cues[id]) return;
    var T = tone, cue = cues[id], names = Object.keys(cue.stems);
    var want = stemName && cue.stems[stemName] ? stemName : names[0];
    if (cur && cur.id === id) { if (cur.stem !== want) xfade(want); return; }
    /* AUD-03: a one-shot remembers the looping cue it cut into, so the music can come back when it ends */
    var before = cur && !(cues[cur.id] && cues[cur.id].oneshot) ? { id: cur.id, stem: cur.stem } : cur && cur.resume ? cur.resume : null;
    stopCue(1.5);
    var c = { id: id, stem: want, stems: {}, parts: [], instr: [], resume: cue.oneshot ? before : null };
    try {
      /* The Transport keeps one tempo for the whole session: every event time and loop end is in seconds, so a cue's
         own tempo lives in spb. Changing the Transport bpm while it ran made later Parts start late or not at all. */
      var TR = T.getTransport();
      if (TR.state !== 'started') TR.bpm.value = 120;
      var spb = 60 / (cue.bpm || 96), startAt = TR.state === 'started' ? TR.seconds + 0.1 : 0;
      c.leads = [];
      names.forEach(function (sn) {
        var stem = cue.stems[sn], g = new T.Gain(sn === want ? 1 : 0), lg = new T.Gain(leadsDown ? 0 : 1);
        T.connect(g, bus.musicIn); lg.connect(g); c.leads.push(lg);
        c.stems[sn] = g;
        stem.tracks.forEach(function (tr) {
          /* AUD-03: the chain bell is never faded under a voice */
          var ins = makeInstr(T, tr.kind, LEAD[tr.kind] && id !== 'CM-CHAIN' ? lg : g); c.instr.push(ins);
          var evs = tr.events.map(function (e) { return { time: e[0] * spb, n: e[1], len: Math.max(0.05, (e[2] || 0.25) * spb), vel: e[3] || 0.7 }; });
          var part = new T.Part(function (time, ev) { if (c.dead) return; ins.trig(ev.n, ev.len, ev.vel, time); }, evs);
          part.loop = !cue.oneshot; part.loopEnd = stemLength(cue, stem) * spb;
          part.start(startAt); c.parts.push(part);
        });
      });
      if (T.getTransport().state !== 'started') T.getTransport().start('+0.05');
      cur = c;
      if (id === 'CM-CHAIN') chainCap();
      /* AUD-03: when a one-shot has played out it lets go: the cue it cut into comes back (films, the Hall), or the
         city's own music (city, sheets, menus); asking for the same one-shot again plays it again */
      if (cue.oneshot) {
        var lenS = 0; Object.keys(cue.stems).forEach(function (sn) { if (sn === want) lenS = stemLength(cue, cue.stems[sn]) * spb; });
        c.endT = setTimeout(function () {
          if (cur !== c) return;
          stopCue(0.8);
          if (!musicAllowed()) return;
          var where = window.Kit && Kit.context ? Kit.context() : '';
          if (c.resume && (where === 'film' || where === 'hall' || where === 'title' || !window.Kit)) playCue(c.resume.id, c.resume.stem);
          /* AUDR2-06: a film's one-shot with nothing to go back to (the cold open's book sting): the film's next cue starts early */
          else if (where === 'film' && window.Director && Director.nextMusic) { var nm = Director.nextMusic(); if (nm && cues[nm] && !cues[nm].oneshot) { lastWanted = { id: nm, at: Date.now() }; playCue(nm); } }
          else if (window.Kit && Kit.musicBack && where !== 'film' && where !== 'hall') Kit.musicBack();
        }, Math.round((lenS + 0.4) * 1000));
      }
    } catch (e) { cur = null; if (window.Help) Help.log('music', id + ': ' + (e && e.message)); window.__lastCueError = id + ': ' + (e && e.message); }
  }
  function xfade(to) {
    if (!cur || !tone) return;
    Object.keys(cur.stems).forEach(function (sn) { try { cur.stems[sn].gain.rampTo(sn === to ? 1 : 0, 1.5); } catch (e) {} });
    cur.stem = to;
  }
  /* D-07, D1-m11: a cue stops in three steps. It fades; then its Parts stop and drop what they still had scheduled and
     every held note is released; only after the longest release has rung out are the instruments and stems disposed
     (disposing a note that is still sounding is what raised the disconnect errors). */
  var fading = [];
  /* Music off: cues still fading out stop at once too (their Parts go now; their notes are released) */
  function silenceFading() {
    fading.forEach(function (c) {
      c.dead = true;
      Object.keys(c.stems).forEach(function (sn) { try { c.stems[sn].gain.rampTo(0, 0.05); } catch (e) {} });
      c.parts.forEach(function (p) { try { p.stop(); } catch (e) {} try { p.cancel(0); } catch (e) {} try { p.dispose(); } catch (e) {} }); c.parts = [];
      c.instr.forEach(function (i) { try { if (i.release) i.release(); } catch (e) {} });
    });
  }
  function stopCue(fadeS) {
    if (!cur) return; var c = cur; cur = null; clearTimeout(c.endT); fading.push(c);
    var f = fadeS || 0.5;
    Object.keys(c.stems).forEach(function (sn) { try { c.stems[sn].gain.rampTo(0, f); } catch (e) {} });
    if (f <= 0.15) { c.dead = true; c.parts.forEach(function (p) { try { p.stop(); p.mute = true; p.cancel(0); p.dispose(); } catch (e) {} }); c.parts = []; }
    setTimeout(function () {
      c.dead = true;
      /* the Parts hold no sound of their own, so they go at once; the instruments wait for their notes to ring out */
      c.parts.forEach(function (p) { try { p.stop(); } catch (e) {} try { p.cancel(0); } catch (e) {} try { p.dispose(); } catch (e) {} });
      c.instr.forEach(function (i) { try { if (i.release) i.release(); } catch (e) {} });
    }, Math.round(f * 1000) + 60);
    var kill = function () {
      var fi = fading.indexOf(c); if (fi >= 0) fading.splice(fi, 1);
      c.parts.forEach(function (p) { try { p.dispose(); } catch (e) {} });
      c.instr.forEach(function (i) { try { i.dispose(); } catch (e) {} });
      Object.keys(c.stems).forEach(function (sn) { try { c.stems[sn].dispose(); } catch (e) {} });
      (c.leads || []).forEach(function (l) { try { l.dispose(); } catch (e) {} });
    };
    setTimeout(kill, Math.round((f + 3.2) * 1000));
  }
  /* Conversational underscore: while anyone speaks, a cue's lead tracks fade out; pads, bass and drums stay. */
  var LEAD = { tri: 1, pluck: 1, harpsi: 1, whistle: 1, marimba: 1, brass: 1, bell: 1, musicbox: 1, woodwind: 1, sq: 1, chime: 1 }, leadsDown = false;
  function setLeads(down) {
    leadsDown = down; if (!cur || !cur.leads) return;
    cur.leads.forEach(function (l) { try { l.gain.rampTo(down ? 0 : 1, down ? 0.4 : 0.6); } catch (e) {} });
  }
  function duck(db, ms) {
    if (!ctx || !bus.duck) return;
    var t = ctx.currentTime; bus.duck.gain.cancelScheduledValues(t); bus.duck.gain.setTargetAtTime(db2g(db), t, (ms || 400) / 3000);
  }
  /* Voices duck the beds: narration music -12, ambience -8, effects -3 dB; characters and examiners -6/-6/0; Vera's radio -6 on
     music. Keep voices clear scales it (Off 0, Gentle 0.5, Normal 1, Strong 1.5). Attack 0.08 s; a 0.3 s hold; release 0.4 s. */
  var DUCK = { narration: [-12, -8, -3], character: [-6, -6, 0], radio: [-6, 0, 0] }, relT = null, leadT = null, duckDb = 0;
  /* AUDR4-08: the chain cue (CM-CHAIN) ducks 6 dB at most, whether it is playing when the line starts, asked for just
     before it, or starts while the line is playing (chainCap, from playCue) */
  function chainSoon() { return (cur && cur.id === 'CM-CHAIN') || (lastWanted && lastWanted.id === 'CM-CHAIN' && Date.now() - lastWanted.at < 3000); }
  function chainCap() { if (ctx && bus.duck && duckDb < -6) { duckDb = -6; ramp(bus.duck.gain, db2g(-6), 0.08 / 3); } }
  function duckVoice(kind) {
    if (!ctx || !bus.duck) return;
    clearTimeout(relT); clearTimeout(leadT);
    var a = A(), k = { off: 0, gentle: 0.5, normal: 1, strong: 1.5 }[a.ducking]; if (k === undefined) k = 1;
    var d = DUCK[kind] || DUCK.character, m = d[0] * k; if (chainSoon()) m = Math.max(m, -6);
    duckDb = m;
    ramp(bus.duck.gain, db2g(m), 0.08 / 3); ramp(bus.ambDuck.gain, db2g(d[1] * k), 0.08 / 3); ramp(bus.effDuck.gain, db2g(d[2] * k), 0.08 / 3);
    if (k >= 1) setLeads(true);
  }
  function duckRelease() {
    clearTimeout(relT);
    relT = setTimeout(function () { if (!ctx) return; duckDb = 0; ramp(bus.duck.gain, 1, 0.4 / 3); ramp(bus.ambDuck.gain, 1, 0.4 / 3); ramp(bus.effDuck.gain, 1, 0.4 / 3); leadT = setTimeout(function () { setLeads(false); }, 600); }, 300);
  }

  /* The source text a clip was made from, by its key. */
  function sourceText(key) {
    var sc = FCV.data.script, n = sc.narration || {}, m, r;
    if (n.lines && n.lines[key]) return n.lines[key].text;
    if (n.cast_lines && n.cast_lines[key]) return n.cast_lines[key].text;
    if ((m = /^act(\d)\.(.+)$/.exec(key))) { var v = window.Director ? Director.path('acts[' + (m[1] - 1) + '].' + m[2]) : null; return v ? (typeof v === 'string' ? v : v.line || v.text || v.subtitle || null) : null; }
    if ((m = /^locker\.(.+)$/.exec(key))) { var lv = window.Director ? Director.path('evidence_locker.' + m[1]) : null; return lv ? (typeof lv === 'string' ? lv : lv.line || lv.text) : null; }
    if ((m = /^finale\.(.+)$/.exec(key))) { var fv = window.Director ? Director.path(key) : null; return typeof fv === 'string' ? fv : fv && (fv.line || fv.text); }
    if ((m = /^([a-z]{3}-\d+)(\.follow_up)?$/.exec(key))) { var q = FCV.bankItem(m[1]); if (!q) return null; return m[2] ? (typeof q.follow_up === 'string' ? q.follow_up : null) : q.question; }
    if ((m = /^method:([a-z0-9_]+)\.video_brief\.beats\[(\d+)\]$/.exec(key))) { var mb = FCV.methodById(m[1]); var b = mb && mb.raw.video_brief && mb.raw.video_brief.beats[+m[2]]; return b ? b.narration : null; }
    if ((m = /^method:([a-z0-9_]+)\.(plain|analogy)$/.exec(key))) { var mp = FCV.methodById(m[1]); return mp ? mp.raw[m[2]] : null; }
    if (/^sting:/.test(key)) return key.slice(6);
    r = FCV.resolve(key);
    if (r) return r.type === 'eq' ? r.question : r.type === 'gap' ? r.gap : r.text || r.q || null;
    return null;
  }
  /* Voices: the cast engine (voice.js) plays every line; these keep the older names working. */
  function V() { return window.Voice || null; }
  var lastWanted = null, fadedIn = false;
  window.Sound = {
    unlock: function (settings) { var c = ac(); if (settings && settings.audio) applyAudio(settings.audio); if (c) { if (!fadedIn && master) { fadedIn = true; try { master.gain.cancelScheduledValues(c.currentTime); master.gain.setValueAtTime(0, c.currentTime); master.gain.linearRampToValueAtTime(lvl(0.8, A().master), c.currentTime + 2); } catch (e) {} } loadTone(); loadCues(); if (V()) V().unlock(); if (window.Kit) Kit.unlock(); } },
    ready: function () { return Promise.all([loadTone(), loadCues()]); },
    setVolumes: function (s) { if (s && s.audio) applyAudio(s.audio); },
    applyAudio: applyAudio,
    music: function (id, stem) { lastWanted = { id: id, stem: stem, at: Date.now() }; if (!ctx || !musicAllowed()) return; Promise.all([loadTone(), loadCues()]).then(function () { if (musicAllowed()) playCue(id, stem); }); },
    /* item 69b: turning music back on plays the last cue asked for (a film's, the Hall's, the race's, the menu's) */
    musicLast: function () { if (lastWanted && ctx && musicAllowed()) { var w = lastWanted; Promise.all([loadTone(), loadCues()]).then(function () { if (musicAllowed()) playCue(w.id, w.stem); }); return true; } return false; },
    lastWanted: function () { return lastWanted; },
    stem: function (name) { xfade(name); },
    musicStop: function (s) { stopCue(s || 1); },
    stopAllMusic: stopAllMusic,
    musicAllowed: musicAllowed,
    current: function () { return cur && { id: cur.id, stem: cur.stem }; },
    sfx: function (name) { var f = FX[name]; if (f) try { f(); } catch (e) {} else if (window.Kit && Kit.sfx) Kit.sfx(name); },
    streak: function (n) { semis = Math.min(5, Math.max(0, n)); },
    chainChord: function (hollow) { if (!ctx) return; loadTone().then(function () { if (!musicAllowed()) return; if (!tone || !cues || !cues['CM-CHAIN']) { (hollow ? FX.stage3 : FX.stage5)(); return; } var cueId = 'CM-CHAIN'; var keep = cur && cur.id === cueId ? cur.resume : null; if (cur && cur.id === cueId) stopCue(0.2); playCue(cueId, hollow ? 'link5' : 'link4'); if (keep && cur && cur.id === cueId && !cur.resume) cur.resume = keep; }); },
    voice: function (key, opts) { return V() ? V().voiceKey(key, opts) : Promise.resolve(false); },
    stopVoice: function () { if (V()) V().stop(); },
    checkVoices: function () { return V() ? V().check() : Promise.resolve({ total: 0, muted: [] }); },
    sourceText: sourceText,
    hasVoice: function (id) { return V() ? V().has(id) : Promise.resolve(false); },
    duck: duck, duckVoice: duckVoice, duckRelease: duckRelease,
    voiceInput: function () { return bus.voice; },
    musicInput: function () { return bus.musicIn; },
    ambienceInput: function () { return bus.ambIn; },
    effectsInput: function () { return bus.effects; },
    uiInput: function () { return bus.ui; },
    registerCue: function (id, cue) { if (!cues) cues = {}; cues[id] = cue; },
    loadCues: loadCues, loadTone: loadTone,
    hidden: function (h) {
      if (!ctx) return;
      clearTimeout(hiddenT);
      if (h) { ramp(master.gain, 0, 0.05); hiddenT = setTimeout(function () { try { ctx.suspend(); } catch (e) {} }, 150); if (V()) V().pause(true); }
      else { try { ctx.resume(); } catch (e) {} ramp(master.gain, lvl(0.8, A().master), 0.1); if (V()) V().pause(false); }
    },
    districtMusic: function (cell) {
      /* the race keeps its own cue (CM-RACE) until it ends */
      if (!cell || (window.Game && Game.racing)) return; var key = cell.kind + (cell.act || '');
      if (window.Kit) Kit.district(cell);
      /* AUD-02: before the first tap there is no sound engine; the district is not marked as played until it really can be */
      if (!ctx) return;
      if (key === lastDistrict) return; lastDistrict = key;
      if (window.Kit && Kit.cityMusic) { Kit.cityMusic(cell); return; }
      var id = cell.kind === 'act' ? (FCV.data.script.acts[cell.act - 1].world || {}).music : cell.kind === 'locker' ? 'CM-LOCKER' : cell.kind === 'viva' ? 'CM-WAIT' : cell.kind === 'harbour' ? 'CM-HOME' : 'CM-RIDE';
      if (id) window.Sound.music(id);
    },
    resetDistrict: function () { lastDistrict = null; },
    radio: function () { if (window.Kit && Kit.nextStation) Kit.nextStation(); },
    babble: function (who) { var b = 300 + (FCV.hash32(who || 'x') % 300); for (var i = 0; i < 4; i++) osc(b + Math.random() * 120, 0.06, 'triangle', 0.035, i * 0.09); },
    ctx: function () { return ctx; },
    osc: osc, noise: noise,
    fxNames: function () { return Object.keys(FX); },
    cueIds: function () { return loadCues().then(function (c) { return Object.keys(c); }); },
    /* For the headless checks: what is sounding right now. */
    audit: function () {
      var media = [];
      Array.prototype.forEach.call(document.querySelectorAll('video, audio'), function (m) { if (!m.paused && !m.muted && m.volume > 0 && !m.__fcvVoice) media.push(m.tagName + ':' + (m.currentSrc || m.src).slice(-40)); });
      var T = tone, tr = null; try { tr = T ? T.getTransport().state : null; } catch (e) {}
      return { ctx: ctx ? ctx.state : 'none', muted: muteG ? muteG.gain.value : null, master: master ? master.gain.value : null,
        musicBus: bus.music ? bus.music.gain.value : null, ambience: bus.ambience ? bus.ambience.gain.value : null, voiceBus: bus.voice ? bus.voice.gain.value : null,
        cue: cur ? cur.id : null, transport: tr, kit: window.Kit && Kit.activeMusic ? Kit.activeMusic() : [], media: media,
        voice: V() && V().playing() ? V().playing().id : null, musicAllowed: musicAllowed(), duck: bus.duck ? bus.duck.gain.value : null };
    },
    /* For the build check: render a cue or effect offline and report the peak. */
    renderOffline: function () { return Promise.resolve(null); }
  };

  /* v2 compatibility: the older code calls SFX.* */
  window.SFX = {
    unlock: function () { ac(); },
    setOn: function (v) { on.effects = !!v; },
    setMuted: function () {},
    isOn: function () { return on.effects; },
    blip: function () { if (ctx) osc(660, 0.05, 'square', 0.04, 0, 0, bus.ui); },
    right: function () { if (!(window.Kit && Kit.sting('MUS-STING-RIGHT', semis))) FX.right(); },
    wrong: function () { if (!(window.Kit && Kit.sting('MUS-STING-WRONG'))) FX.thud(); },
    passed: function () { FX.fanfare(); },
    failed: function () { osc(330, 0.3, 'triangle', 0.06); osc(262, 0.4, 'triangle', 0.05, 0.25); },
    radio: function () { noise(0.45, 0.06); osc(880, 0.08, 'sine', 0.03, 0.4); },
    star: function () { osc(1200, 0.06, 'square', 0.04); osc(900, 0.06, 'square', 0.04, 0.07); },
    siren: function () { FX['inspector chime'](); },
    heartbeat: function () { osc(70, 0.12, 'sine', 0.2); osc(60, 0.14, 'sine', 0.16, 0.22); },
    chime: function () { osc(880, 0.2, 'triangle', 0.08); osc(1320, 0.35, 'triangle', 0.06, 0.12); },
    bell: function () { FX['bike bell'](); },
    hit: function (big) { osc(big ? 90 : 140, big ? 0.5 : 0.3, 'sine', big ? 0.12 : 0.15, 0, 50); }
  };
})();
