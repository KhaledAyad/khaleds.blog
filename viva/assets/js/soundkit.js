/* Freight City Viva v3: the sound plan made in code (no samples, no credits). The Kerbside grooves under each district cue,
   the menu loop, Night Shift tracks, Freight FM (stations, beds and Vera's idents), stings, district ambience, and the
   interface and bike effects. Music here goes through the music bus, so Music off silences all of it at once. */
(function () {
  'use strict';
  var K = {}, live = [], timers = [], amb = null, ambKey = null, ctxName = '', fmT = null, nightT = null, nightI = 0, lastIdent = 0, flags = {};
  var S = function () { return window.Game && Game.state; };
  var AU = function () { var s = S(); return (s && s.settings && s.settings.audio) || FCV.audioDefaults(); };
  var C = function () { return window.Sound && Sound.ctx && Sound.ctx(); };
  var musicOn = function () { return window.Sound && Sound.musicAllowed && Sound.musicAllowed(); };
  var $ = function (id) { return document.getElementById(id); };
  var shown = function (id) { var e = $(id); return !!(e && !e.classList.contains('hidden')); };
  function seeded(n) { var x = n || 7; return function () { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; }; }

  /* ---------------- generated cues (Tone.js plays them through the cue engine) ---------------- */
  var NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var EXT = { m: [0, 3, 7], '': [0, 4, 7], m7: [0, 3, 7, 10], m9: [0, 3, 7, 10, 14], maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14], '69': [0, 4, 7, 9, 14], '7b9': [0, 4, 7, 10, 13], '9': [0, 4, 7, 10, 14], '7': [0, 4, 7, 10], m9add: [0, 3, 7, 14], '6': [0, 4, 7, 9] };
  function root(name) { var m = /^([A-G])(b|#)?/.exec(name || 'C') || ['', 'C', '']; return (NOTE[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0) + 12) % 12; }
  function chord(name, ext, base) { var r = root(name), iv = EXT[ext !== undefined ? ext : /m(?!aj)/.test(name.slice(1)) ? 'm7' : 'maj7'] || EXT['']; return iv.map(function (i) { return (base || 48) + r + i; }); }
  function groove(o) {
    var rnd = seeded(o.seed), bpb = o.bpb || 4, bars = o.bars || 16, dr = [], bass = [], stab = [], lead = [];
    var hum = function () { return rnd() * 0.012; }, vel = function (v) { return Math.max(0.05, Math.min(1, v * (0.9 + rnd() * 0.2))); };
    for (var bar = 0; bar < bars; bar++) {
      var b0 = bar * bpb, ch = o.chords[bar % o.chords.length];
      (o.kick || []).forEach(function (t) { dr.push([b0 + t + hum(), 'kick', 0.25, vel(0.9)]); });
      (o.snare || []).forEach(function (t) { dr.push([b0 + t + hum(), o.brush ? 'brush' : 'snare', 0.25, vel(0.75)]); });
      (o.clap || []).forEach(function (t) { if (!o.clapFrom || bar >= o.clapFrom) dr.push([b0 + t + hum(), 'clap', 0.2, vel(0.7)]); });
      (o.rim || []).forEach(function (t) { dr.push([b0 + t + hum(), 'rim', 0.2, vel(0.5)]); });
      (o.ghost || []).forEach(function (t) { dr.push([b0 + t + hum(), 'snare', 0.2, 0.25]); });
      (o.clank || []).forEach(function (t) { dr.push([b0 + t + hum(), 'clank', 0.2, vel(0.5)]); });
      var div = o.div || 2, n = bpb * div;
      for (var i = 0; i < n; i++) { var t = i / div; if (i % 2) t += ((o.swing || 0.5) - 0.5) * (2 / div); dr.push([b0 + t + hum(), o.openEvery && i % o.openEvery === o.openEvery - 1 ? 'ohat' : 'hat', 0.1, vel(i % 2 ? 0.35 : 0.5)]); if (o.shaker && i % 2) dr.push([b0 + t, 'shaker', 0.1, 0.3]); }
      if (rnd() < 0.5) dr.push([b0 + rnd() * bpb, 'tick', 0.05, 0.06]);
      if (o.riser && bar % 8 === 7) dr.push([b0 + bpb - 2, 'swish', 2, 0.35]);
      if (o.bell && bar % o.bellEvery === o.bellEvery - 1) dr.push([b0 + bpb - 1, 'bike', 0.2, 0.5]);
      var r = 36 + root(ch);
      if (o.walk) o.walk.forEach(function (st, k) { bass.push([b0 + k * (bpb / o.walk.length), r + st, bpb / o.walk.length * 0.9, 0.75]); });
      else if (o.octave) { bass.push([b0, r, 0.5, 0.8]); bass.push([b0 + 1.5, r + 12, 0.4, 0.6]); bass.push([b0 + 2, r, 0.5, 0.75]); bass.push([b0 + 3.5, r + 12, 0.4, 0.6]); }
      else bass.push([b0, r, bpb * 0.9, 0.8]);
      if (o.stab && bar % (o.stabEvery || 1) === 0) o.stab.forEach(function (t) { chord(ch, o.ext ? o.ext(ch) : undefined, o.stabBase || 57).forEach(function (m) { stab.push([b0 + t, m, o.stabLen || 0.5, 0.5]); }); });
      if (o.extra) o.extra(bar, b0, lead, dr);
    }
    var tracks = [{ kind: 'drums', events: dr }, { kind: o.bassKind || 'bass_sine', events: bass }];
    if (stab.length) tracks.push({ kind: o.stabKind || 'epiano', events: stab });
    if (lead.length) tracks.push({ kind: o.leadKind || 'pluck', events: lead });
    return tracks;
  }
  var GROOVES = {
    1: { seed: 11, kick: [0, 1.75, 2.5], snare: [1, 3], ghost: [2.75], div: 4, swing: 0.58, openEvery: 4, stab: [0.5], stabEvery: 2, riser: true },
    2: { seed: 12, kick: [0, 1.5], snare: [1, 3], brush: true, div: 3, swing: 0.5, walk: [0, 2, 3, 5], bassKind: 'bass_pluck', stab: [1.5, 3.5], stabKind: 'harpsi', stabLen: 0.25 },
    3: { seed: 13, kick: [0, 2], clap: [1, 3], clank: [1.25, 3.75], div: 4, shaker: true, octave: true, bassKind: 'bass_sq' },
    4: { seed: 14, kick: [0, 2.25], snare: [1, 3], div: 2, swing: 0.56, walk: [0, -4, -2, -5], stab: [2.5], stabKind: 'piano' },
    5: { seed: 15, bpb: 3, kick: [0], snare: [2.04], div: 2, swing: 0.56, shaker: true, bell: true, bellEvery: 8 },
    6: { seed: 16, kick: [0, 1.75], clap: [1, 3], div: 2, swing: 0.6, shaker: true, octave: true, stab: [0.5, 2.5], stabKind: 'brass', stabLen: 0.25 },
    7: { seed: 17, kick: [0], snare: [2], clap: [2], clapFrom: 8, div: 2, openEvery: 2 }
  };
  function actCueWithGroove(n, cues) {
    var base = cues['CM-D' + n]; if (!base) return null;
    var g = Object.assign({ chords: base.chords || ['C'], bars: base.bars || 16, bpb: base.beats_per_bar || 4 }, GROOVES[n]);
    var tracks = groove(g), out = JSON.parse(JSON.stringify(base));
    Object.keys(out.stems).forEach(function (sn) { out.stems[sn].tracks = out.stems[sn].tracks.filter(function (t) { return t.kind !== 'drums'; }).concat(tracks); });
    return out;
  }
  var MENU_EXT = { D: 'm9', B: 'maj7', Bb: 'maj7', C: '69', F: 'maj9', A: '7b9' };
  function menuCue(cues) {
    var th = cues['CM-THEME'], chords = (th && th.chords) || ['Dm', 'Bb', 'C', 'F'];
    var tracks = groove({ seed: 21, chords: chords, kick: [0, 2.5], rim: [1, 3], div: 2, swing: 0.57, stab: [0, 2.5], stabLen: 1.5, stabBase: 50, bell: true, bellEvery: 16,
      ext: function (ch) { return MENU_EXT[ch.replace(/m$/, '')] || MENU_EXT[ch[0]] || 'maj7'; } });
    var mel = th && th.stems && th.stems.calm && th.stems.calm.tracks.filter(function (t) { return t.kind === 'tri'; })[0];
    if (mel) tracks.push({ kind: 'pluck', events: mel.events.map(function (e) { return [e[0], e[1], e[2], 0.45]; }) });
    return { bpm: 84, beats_per_bar: 4, bars: 16, oneshot: false, chords: chords, stems: { main: { tracks: tracks } } };
  }
  function nightCue(which) {
    var two = which === 2, chords = two ? ['F', 'Em', 'Dm', 'C'] : ['Am', 'D', 'G', 'C'];
    var tracks = groove({ seed: 30 + which, bars: 32, chords: chords, kick: [0, 2.5], snare: two ? [1, 3] : [], rim: two ? [] : [1, 3], brush: two, div: 2, swing: two ? 0.62 : 0.55, shaker: !two,
      stab: [0], stabLen: 3.5, stabKind: two ? 'epiano' : 'sine', stabBase: 52, ext: function (ch) { return two ? (ch === 'Dm' ? 'm9' : /m/.test(ch) ? 'm7' : 'maj7') : (ch === 'Am' ? 'm9' : ch === 'D' ? '9' : 'maj7'); },
      extra: function (bar, b0, lead) { if (two && bar % 8 === 7) [77, 81, 84].forEach(function (m, k) { lead.push([b0 + k, m, 0.8, 0.35]); }); if (!two && bar % 16 === 15) [76, 79, 81, 79].forEach(function (m, k) { lead.push([b0 + k * 0.75, m, 0.6, 0.3]); }); },
      leadKind: two ? 'bell' : 'whistle' });
    return { bpm: two ? 76 : 82, beats_per_bar: 4, bars: 32, oneshot: false, chords: chords, stems: { main: { tracks: tracks } } };
  }
  var registered = false;
  function register() {
    if (registered || !window.Sound) return;
    Sound.loadCues().then(function (cues) {
      if (registered || !cues || !cues['CM-D1']) return; registered = true;
      for (var n = 1; n <= 7; n++) { var c = actCueWithGroove(n, cues); if (c) Sound.registerCue('GROOVE-' + n, c); }
      Sound.registerCue('MUS-MENU', menuCue(cues)); Sound.registerCue('MUS-NIGHT-2', nightCue(2)); Sound.registerCue('MUS-NIGHT-3', nightCue(3));
    });
  }

  /* ---------------- native layers: beds, stings, the last-heart tone ---------------- */
  var TONIC = { 'CM-D1': 57, 'GROOVE-1': 57, 'CM-D2': 62, 'GROOVE-2': 62, 'CM-D3': 64, 'GROOVE-3': 64, 'CM-D4': 60, 'GROOVE-4': 60, 'CM-D5': 67, 'GROOVE-5': 67, 'CM-D6': 65, 'GROOVE-6': 65, 'CM-D7': 58, 'GROOVE-7': 58, 'CM-LOCKER': 59, 'MUS-NIGHT-2': 65, 'MUS-NIGHT-3': 57 };
  function tonic() { var c = window.Sound && Sound.current && Sound.current(); return (c && TONIC[c.id]) || 62; }
  var hz = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  function node(n, until, name) { live.push({ n: n, until: until, name: name }); }
  function mtone(name, f, dur, type, v, when, slide, dest) {
    var c = C(); if (!c) return;
    try {
      var t = c.currentTime + (when || 0), o = c.createOscillator(), g = c.createGain();
      o.type = type || 'triangle'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || Sound.musicInput()); o.start(t); o.stop(t + dur + 0.05); node(o, Date.now() + (when + dur) * 1000 + 100, name);
    } catch (e) {}
  }
  function mnoise(name, dur, v, when, f0, f1, dest) {
    var c = C(); if (!c) return;
    try {
      var n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1);
      var s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter(), t = c.currentTime + (when || 0);
      f.type = 'bandpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(f0 || 800, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.buffer = b; s.connect(f); f.connect(g); g.connect(dest || Sound.musicInput()); s.start(t); s.stop(t + dur + 0.05); node(s, Date.now() + ((when || 0) + dur) * 1000 + 100, name);
    } catch (e) {}
  }
  function chordTones(name, notes, dur, type, v, when) { notes.forEach(function (m) { mtone(name, hz(m), dur, type, v, when); }); }
  var STINGS = {
    'MUS-STING-RIGHT': function (k) { var t = tonic() + (k || 0), low = window.Viva && shown('viva') ? -12 : 0; mtone('right', hz(t + 7 + low), 0.18, 'triangle', 0.07); mtone('right', hz(t + 12 + low), 0.3, 'triangle', 0.07, 0.09); },
    'MUS-STING-WRONG': function () { var t = tonic() - 12; mtone('wrong', hz(t), 0.12, 'square', 0.04); mtone('wrong', hz(t + 5), 0.25, 'sine', 0.06, 0.02, hz(t - 3)); },
    'MUS-STING-DELIVERED': function () { var t = tonic(); mnoise('delivered', 0.08, 0.3, 0, 300); mnoise('delivered', 0.08, 0.3, 0.22, 300); [[0, 4, 7], [5, 9, 12], [0, 4, 7, 12]].forEach(function (c, i) { chordTones('delivered', c.map(function (x) { return t + x; }), 0.5, 'sawtooth', 0.02, 0.5 + i * 0.32); }); mtone('delivered', hz(t + 24), 0.9, 'sine', 0.04, 1.2); },
    'MUS-STING-RETRY': function () { var t = tonic(); chordTones('retry', [t + 5, t + 9, t + 12], 0.7, 'sine', 0.03); chordTones('retry', [t + 7, t + 12, t + 14], 1.0, 'sine', 0.03, 0.7); mnoise('retry', 0.5, 0.05, 1.6, 2500, 600); },
    'MUS-ACT-CLEAR': function () { var t = tonic(); mnoise('clear', 1.6, 0.06, 0, 400, 5000); [0, 4, 7, 12, 16, 19, 24].forEach(function (x, i) { mtone('clear', hz(t + x), 0.3, 'triangle', 0.05, i * 0.2); }); chordTones('clear', [t, t + 4, t + 7, t + 12], 1.0, 'triangle', 0.035, 1.4); mtone('clear', hz(t + 24), 0.8, 'sine', 0.05, 1.5); mtone('clear', hz(t + 27), 0.8, 'sine', 0.04, 1.75); },
    'MUS-MISSION-GO': function () { var t = tonic(); mtone('go', 55, 0.5, 'sine', 0.15, 0, 40); for (var i = 0; i < 8; i++) mnoise('go', 0.06, 0.04 + i * 0.015, 0.9 + i * 0.12, 1800); [0, 3, 7].forEach(function (x, i) { mtone('go', hz(t + x), 0.22, 'sawtooth', 0.03, 1.9 + i * 0.12); }); },
    'MUS-STING-AWARDED': function () { mnoise('awarded', 0.08, 0.3, 0, 300); mnoise('awarded', 0.08, 0.3, 0.22, 300); chordTones('awarded', [62, 66, 69, 74], 1.8, 'sawtooth', 0.025, 0.7); mtone('awarded', hz(86), 1.5, 'sine', 0.05, 0.7); mnoise('awarded', 1.6, 0.05, 0.7, 3000, 9000); },
    'MUS-STING-NOTAWARDED': function () { mtone('notawarded', hz(45), 1.8, 'triangle', 0.08); mnoise('notawarded', 0.1, 0.15, 0.6, 300); },
    'MUS-PREVIOUSLY': function () { var t = tonic(); mnoise('prev', 0.6, 0.06, 0, 500, 4000); chordTones('prev', [t, t + 3, t + 7, t + 10], 1.2, 'sine', 0.03, 0.5); mtone('prev', 900, 0.15, 'square', 0.02, 1.6, 300); },
    'MUS-NEXT-TIME': function () { var t = tonic(); chordTones('next', [t, t + 5, t + 7], 2.0, 'sine', 0.03); mtone('next', hz(t + 17), 1.2, 'sine', 0.04, 0.4, hz(t + 19)); mtone('next', hz(t + 7), 0.3, 'triangle', 0.04, 1.8); mtone('next', hz(t + 10), 0.4, 'triangle', 0.04, 2.1); },
    'MUS-HALL-ROUND': function () { mtone('round', hz(38), 1.5, 'sawtooth', 0.03, 0, hz(36)); mtone('round', hz(50), 1.5, 'sine', 0.04); },
    'MUS-FM-BED-DROP': function () { var t = tonic(); mtone('bed', 80, 0.6, 'sine', 0.12, 0, 40); chordTones('bed', [t - 12, t - 5, t, t + 2], 0.8, 'sine', 0.025, 0.1); mtone('bed', hz(t + 12), 0.4, 'sine', 0.04, 0.3); mtone('bed', hz(t + 15), 0.6, 'sine', 0.04, 0.5); mnoise('bed', 0.5, 0.03, 0.9, 2500); },
    'MUS-FM-BED-GLIDE': function () { var t = tonic(); mnoise('bed', 1.0, 0.04, 0, 300, 3000); chordTones('bed', [t - 12, t - 5, t, t + 4], 1.6, 'sine', 0.022, 0.8); mnoise('bed', 0.05, 0.1, 0.8, 2000); mnoise('bed', 0.4, 0.02, 2.2, 2500); },
    'MUS-FM-BED-NIGHT': function () { chordTones('bed', [53, 57, 60, 64], 2.2, 'sine', 0.025); mtone('bed', hz(81), 1.0, 'sine', 0.03, 0.4); }
  };
  var lastHeart = null;
  K.hallLast = function (onOff) {
    if (lastHeart) { try { lastHeart.o.stop(); lastHeart.l.stop(); } catch (e) {} lastHeart = null; }
    var c = C(); if (!onOff || !c || !musicOn() || (S() && S().settings.family)) return;
    try { var o = c.createOscillator(), l = c.createOscillator(), lg = c.createGain(), g = c.createGain(); o.frequency.value = 1800; l.frequency.value = 5; lg.gain.value = 9; l.connect(lg); lg.connect(o.frequency); g.gain.value = 0.012; o.connect(g); g.connect(Sound.musicInput()); o.start(); l.start(); lastHeart = { o: o, l: l }; } catch (e) {}
  };
  K.sting = function (name, arg) { if (!musicOn() || !C() || !STINGS[name]) return false; STINGS[name](arg); return true; };

  /* ---------------- effects (the effects and interface buses) ---------------- */
  var fx = function (f, d, t, v, w, s, ui) { if (window.Sound && Sound.osc) Sound.osc(f, d, t, v, w, s, ui ? Sound.uiInput() : undefined); };
  var nz = function (d, v, w, f, q, ui) { if (window.Sound && Sound.noise) Sound.noise(d, v, w, f, q, ui ? Sound.uiInput() : undefined); };
  var bagN = 0;
  var SFX = {
    'SFX-BAG-ADD': function () { nz(0.25, 0.08, 0, 1800, 0.6); nz(0.12, 0.06, 0.25, 4000, 2); var n = Math.min(6, (S() && S().parcels.bag.length) || ++bagN); fx(523 * Math.pow(2, (n - 1) * 2 / 12), 0.08, 'triangle', 0.06, 0.4); fx(659 * Math.pow(2, (n - 1) * 2 / 12), 0.12, 'triangle', 0.06, 0.5); },
    'SFX-BAG-OPEN': function () { nz(0.2, 0.06, 0, 2500, 2, 1); nz(0.1, 0.05, 0.2, 600, 1, 1); }, 'SFX-BAG-CLOSE': function () { nz(0.2, 0.06, 0, 1800, 2, 1); },
    'SFX-DROPBOX': function () { nz(0.1, 0.3, 0, 400, 1); fx(110, 0.15, 'square', 0.1); fx(1568, 0.3, 'triangle', 0.06, 0.15); }, 'SFX-DROP-NEAR': function () { fx(659, 0.3, 'sine', 0.06); fx(831, 0.4, 'sine', 0.06, 0.2); },
    'SFX-WAYPOINT': function () { fx(1200, 0.35, 'sine', 0.04, 0, 1100); }, 'SFX-MET': function () { nz(0.03, 0.15, 0, 4000, 3, 1); fx(2093, 0.15, 'sine', 0.03, 0.05, 0, 1); fx(2637, 0.2, 'sine', 0.025, 0.1, 0, 1); },
    'SFX-UI-SELECT': function () { nz(0.03, 0.12, 0, 1400, 4, 1); }, 'SFX-UI-BACK': function () { nz(0.03, 0.09, 0, 800, 4, 1); },
    'SFX-UI-FOCUS': function () { nz(0.015, 0.03, 0, 3000, 5, 1); }, 'SFX-UI-TOGGLE': function (up) { fx(up ? 660 : 880, 0.05, 'square', 0.03, 0, 0, 1); fx(up ? 880 : 660, 0.06, 'square', 0.03, 0.05, 0, 1); },
    'SFX-UNMUTE': function () { fx(784, 0.08, 'triangle', 0.05, 0.05, 0, 1); fx(1047, 0.14, 'triangle', 0.05, 0.13, 0, 1); }, 'SFX-SAVE-TICK': function () { nz(0.05, 0.08, 0, 300, 1, 1); fx(90, 0.08, 'sine', 0.06, 0, 0, 1); },
    'SFX-SNAPSHOT': function () { nz(0.04, 0.2, 0, 3000, 1, 1); nz(0.06, 0.15, 0.08, 2000, 1, 1); }, 'SFX-UNDO': function () { nz(0.4, 0.06, 0, 3000, 1, 1); fx(300, 0.4, 'sine', 0.05, 0, 900, 1); },
    'SFX-RESTART': function () { nz(0.6, 0.05, 0, 2000, 1); for (var i = 0; i < 5; i++) fx(600 + i * 150, 0.05, 'square', 0.025, 0.1 + i * 0.1); },
    'SFX-RADIO-TUNE': function () { nz(0.5, 0.07, 0, 1200, 0.5); fx(1400, 0.2, 'sine', 0.015, 0.2, 2200); }, 'SFX-HINT': function () { fx(1319, 0.3, 'sine', 0.05); fx(1760, 0.3, 'sine', 0.03, 0.06); },
    'SFX-TIMER-SOFT': function () { nz(0.02, 0.12, 0, 3500, 3); }, 'SFX-SAID-IT': function () { nz(0.04, 0.2, 0, 600, 2); fx(1800, 0.04, 'square', 0.03, 0.05); },
    'SFX-HEART-LOST': function () { fx(70, 0.2, 'sine', 0.2); fx(60, 0.15, 'sine', 0.12, 0.45); }, 'SFX-RECORD': function (up) { fx(up === false ? 880 : 660, 0.07, 'sine', 0.04, 0, 0, 1); fx(up === false ? 660 : 880, 0.09, 'sine', 0.04, 0.08, 0, 1); },
    /* round 4: the drop-box chute in the district's key (46), a soft thunk (30, 36), a short rewind on Undo (55) */
    'SFX-CHUTE': function (act) { var k = Math.pow(2, (((act || 1) - 1) * 2) / 12); nz(0.35, 0.09, 0, 700 * k, 0.7); fx(240 * k, 0.28, 'sine', 0.08, 0.05, 120 * k); fx(360 * k, 0.12, 'triangle', 0.05, 0.34); },
    'SFX-THUNK': function () { fx(95, 0.14, 'sine', 0.16, 0, 60); nz(0.05, 0.1, 0, 260, 1); },
    'SFX-REWIND': function () { nz(0.45, 0.06, 0, 1600, 0.6, 1); fx(1400, 0.45, 'sine', 0.045, 0, 260, 1); fx(700, 0.3, 'triangle', 0.03, 0.12, 180, 1); },
    'SFX-BIKE-BRAKE': function () { fx(2400, 0.25, 'sine', 0.012, 0, 2100); }, 'SFX-BIKE-LAND': function () { fx(100, 0.18, 'sine', 0.2, 0, 60); fx(300, 0.3, 'sine', 0.08, 0.08, 700); }
  };
  K.sfx = function (name, arg) { var f = SFX[name]; if (f) try { f(arg); } catch (e) {} return !!f; };
  /* the bike: ratchet ticks that follow speed while coasting; a soft squeak on a hard stop */
  var tickAt = 0, lastSpeed = 0;
  K.bike = function (speed) {
    var now = Date.now(); if (!C() || document.hidden) return;
    if (lastSpeed > 150 && speed < 40) SFX['SFX-BIKE-BRAKE']();
    lastSpeed = speed;
    if (speed > 25 && now > tickAt) { nz(0.012, 0.025, 0, 5000, 6); tickAt = now + Math.max(45, 2600 / speed * 10); }
  };

  /* ---------------- district ambience (procedural loops with random events) ---------------- */
  var AMB = {
    1: { bed: [[60, 200, 0.08], [900, 1400, 0.012]], ev: [[0.08, 'bike bell'], [0.02, 'foghorn']] },
    2: { bed: [[300, 1200, 0.03]], ev: [[0.35, 'bird'], [0.05, 'page flip']] },
    3: { bed: [[40, 140, 0.07]], hum: 50, ev: [[0.2, 'chain clink'], [0.06, 'hiss']] },
    4: { bed: [[200, 700, 0.025]], ev: [[0.5, 'tick'], [0.05, 'pen']] },
    5: { bed: [[80, 500, 0.05]], ev: [[0.12, 'bike bell'], [0.03, 'clock chime']], rain: true },
    6: { bed: [[800, 3000, 0.02], [200, 700, 0.03]], ev: [[0.1, 'kiosk boop'], [0.15, 'pigeon coo']] },
    7: { bed: [[150, 900, 0.05]], ev: [[0.12, 'pigeon flutter']] },
    hall: { bed: [[80, 300, 0.03]], ev: [[0.04, 'creak'], [0.04, 'page flip']] },
    night: { bed: [[60, 250, 0.04]], ev: [[0.02, 'owl']] }
  };
  function noiseBuf(c) { var n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; }
  function ambEvent(name) {
    var c = C(); if (!c || !amb) return; var dest = Sound.ambienceInput();
    var t = function (f, d, ty, v, w, sl) { if (Sound.osc) Sound.osc(f, d, ty, v, w, sl, dest); };
    if (name === 'bird') { for (var i = 0; i < 3; i++) t(2500 + Math.random() * 1500, 0.08, 'sine', 0.02, i * 0.12, 3500 + Math.random() * 800); }
    else if (name === 'hiss') Sound.noise(0.8, 0.03, 0, 6000, 0.5, dest);
    else if (name === 'tick') Sound.noise(0.02, 0.05, 0, 3500, 3, dest);
    else if (name === 'pen') Sound.noise(0.3, 0.02, 0, 5000, 2, dest);
    else if (name === 'creak') t(180, 0.4, 'sawtooth', 0.01, 0, 140);
    else if (name === 'owl') { t(420, 0.35, 'sine', 0.02, 0, 380); t(400, 0.5, 'sine', 0.02, 0.45, 360); }
    else if (window.Sound) { var fxn = Sound.fxNames(); if (fxn.indexOf(name) >= 0) { var g = c.createGain(); g.gain.value = 0.35; g.connect(dest); /* the city's own event sounds, quietly */ try { Sound.sfx(name); } catch (e) {} } }
  }
  function stopAmb(fade) {
    if (!amb) return; var a = amb, c = C(); amb = null;
    a.timers.forEach(clearTimeout);
    try { a.g.gain.setTargetAtTime(0, c.currentTime, (fade || 1) / 3); } catch (e) {}
    setTimeout(function () { a.nodes.forEach(function (n) { try { n.stop(); } catch (e) {} }); }, (fade || 1) * 1000 + 200);
  }
  K.ambience = function (key) {
    if (key === ambKey && amb) return; ambKey = key; stopAmb(1.5);
    var c = C(), r = AMB[key]; if (!c || !r) return;
    var g = c.createGain(); g.gain.value = 0; g.connect(Sound.ambienceInput()); g.gain.setTargetAtTime(1, c.currentTime, 0.6);
    var a = { g: g, nodes: [], timers: [] }, buf = noiseBuf(c);
    r.bed.forEach(function (b, i) {
      var s = c.createBufferSource(), f = c.createBiquadFilter(), bg = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      s.buffer = buf; s.loop = true; s.loopStart = Math.random(); f.type = 'bandpass'; f.frequency.value = Math.sqrt(b[0] * b[1]); f.Q.value = b[0] / (b[1] - b[0]) + 0.3; bg.gain.value = b[2];
      lfo.frequency.value = 0.05 + i * 0.03; lg.gain.value = b[2] * 0.4; lfo.connect(lg); lg.connect(bg.gain);
      s.connect(f); f.connect(bg); bg.connect(g); s.start(); lfo.start(); a.nodes.push(s, lfo);
    });
    if (r.hum) { var o = c.createOscillator(), og = c.createGain(); o.frequency.value = r.hum; og.gain.value = 0.015; o.connect(og); og.connect(g); o.start(); a.nodes.push(o); }
    if (r.rain) { var rs = c.createBufferSource(), rf = c.createBiquadFilter(), rg = c.createGain(); rs.buffer = buf; rs.loop = true; rf.type = 'highpass'; rf.frequency.value = 2500; rg.gain.value = 0.02; rs.connect(rf); rf.connect(rg); rg.connect(g); rs.start(); a.nodes.push(rs); }
    amb = a;
    var tick = function () { if (amb !== a) return; r.ev.forEach(function (e) { if (Math.random() < e[0]) ambEvent(e[1]); }); a.timers.push(setTimeout(tick, 2500 + Math.random() * 3000)); };
    a.timers.push(setTimeout(tick, 3000));
  };
  K.district = function (cell) {
    if (!cell) return;
    var h = new Date().getHours(), night = h >= 21 || h < 6;
    K.ambience(cell.kind === 'act' ? cell.act : night ? 'night' : cell.kind === 'viva' ? 'hall' : 'night');
  };

  /* ---------------- Freight FM: stations, beds and Vera's idents ---------------- */
  var ROT = ['VOX-FM-01', 'VOX-FM-02', 'VOX-FM-03', 'VOX-FM-04', 'VOX-FM-05', 'VOX-FM-06', 'VOX-FM-11', 'VOX-FM-12', 'VOX-FM-16'], rotI = Math.floor(Math.random() * 9);
  var NIGHT = ['CM-ACADEMY', 'MUS-NIGHT-2', 'MUS-NIGHT-3'];
  function chip(text) {
    var a = AU(), el = $('radioChip'); if (!el) { el = document.createElement('div'); el.id = 'radioChip'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    if (!text || (!a.subtitles && !a.muted)) { el.classList.add('hidden'); return; }
    el.innerHTML = '<b>' + (a.station === 'night' ? 'Night Shift' : 'Freight FM') + '</b> ' + UI.esc(text); el.classList.remove('hidden');
    clearTimeout(el._t); el._t = setTimeout(function () { el.classList.add('hidden'); }, 5200);
  }
  /* AUDR3-04: a radio link plays only on the open road. Its gate (city, nothing open) is checked again synchronously just
     before the clip starts, so a sheet, film, dialog or the Hall that opened in between gets no blip of Vera; and anything
     that takes the screen calls Kit.dropRadio(), which stops the link and its bed at once (no polling). */
  var identT = null;
  /* AUDR4-09: the open road is the city with no flow running (two chained steps leave a split-second city gap between
     them) and nothing open for at least 1.5 s; offRoadAt is the last moment anything else was on screen */
  var offRoadAt = 0;
  /* AUDR4-09 (round 5): the poll runs every 0.7 s, so a sheet open for less than that could close unseen. Every screen
     that is not the open road stamps offRoadAt the moment it opens or closes, so the 1.5 s is counted from the close
     itself when an ident would start. */
  (function watchScreens() {
    if (!window.MutationObserver) return;
    var ids = ['loading', 'title', 'cut', 'viva', 'worldmap', 'chapter', 'modal', 'sheet', 'mech', 'notebook'];
    var mo = new MutationObserver(function () { offRoadAt = Date.now(); });
    var hook = function () { ids.forEach(function (id) { var el = $(id); if (el && !el.__fmWatch) { el.__fmWatch = 1; mo.observe(el, { attributes: true, attributeFilter: ['class', 'hidden'] }); } }); };
    hook(); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook);
  })();
  function roadClear() {
    var open = contextNow() !== 'city' || (window.UI && UI.busy && UI.busy()) || (window.Game && Game.isBusy && Game.isBusy());
    if (open) { offRoadAt = Date.now(); return false; }
    return Date.now() - offRoadAt >= 1500;
  }
  K.dropRadio = function () {
    clearTimeout(identT); identT = null;
    var pl = window.Voice && Voice.playing && Voice.playing(); if (pl && pl.pri === 1) Voice.stop();
    live = live.filter(function (l) { if (l.name !== 'bed') return true; try { l.n.stop(); } catch (e) {} return false; });
    var ch = $('radioChip'); if (ch) ch.classList.add('hidden');
  };
  K.ident = function (id, bed) {
    var a = AU(); if (!musicOn() || !a.idents || !window.Voice) return;
    if (Voice.playing()) return; /* a radio link is dropped, never queued */
    /* AUD-10: the ident is dropped (bed and all) unless he is still riding in the city with nothing else speaking */
    var clear = function () { return roadClear() && !Voice.playing(); };
    if (!clear()) return;
    lastIdent = Date.now(); K.sting(bed || 'MUS-FM-BED-GLIDE');
    clearTimeout(identT);
    identT = setTimeout(function () { identT = null; if (!clear()) { K.dropRadio(); return; } var e = Voice.entry(id); Voice.say({ key: id, speaker: 'vera', pri: 'radio', force: true, gate: roadClear, onStart: function () { chip(e && e.text); }, onEnd: function (ok) { if (!ok) { var ch = $('radioChip'); if (ch) ch.classList.add('hidden'); } } }).then(function (r) { if (r && !r.played && !roadClear()) K.dropRadio(); }); }, 600);
  };
  function cityCell() { try { var p = Game.player(); return FCV.cellAt(Game.city(), p.x, p.y); } catch (e) { return null; } }
  /* outside any district cell: the groove of the act he is on */
  function homeAct() { var s = S(); for (var n = 1; n <= 7; n++) if (!(s && FCV.actDone && FCV.actDone(s, n))) return n; return 7; }
  K.cityMusic = function (cell) {
    var a = AU(); cell = cell || cityCell() || { kind: 'act', act: homeAct() }; clearTimeout(nightT);
    if (!musicOn()) return;
    if (a.station === 'off') { Sound.musicStop(0.6); return; }
    if (a.station === 'night') { nightPlay(); return; }
    var id = cell.kind === 'act' ? (registered ? 'GROOVE-' + cell.act : 'CM-D' + cell.act) : cell.kind === 'locker' ? 'CM-LOCKER' : cell.kind === 'viva' ? 'CM-WAIT' : cell.kind === 'harbour' ? 'CM-HOME' : 'CM-RIDE';
    Sound.music(id);
  };
  function nightPlay() {
    clearTimeout(nightT); if (!musicOn() || AU().station !== 'night') return;
    Sound.music(NIGHT[nightI % 3]);
    nightT = setTimeout(function () { nightI++; if (ctxName === 'city') K.ident('VOX-FM-14', 'MUS-FM-BED-NIGHT'); setTimeout(nightPlay, 2500); }, 95000);
  }
  K.setStation = function (st) {
    var s = S(); if (!s || !/^(fm|night|off)$/.test(st)) return;
    s.settings.audio.station = st; FCV.stampSettings(s); FCV.syncOldAudio(s.settings); if (window.Game && Game.save) Game.save();
    K.sfx('SFX-RADIO-TUNE');
    /* item 62: a dial for a second; with music off, say how to bring it back */
    K.dial({ fm: 'Freight FM', night: 'Night Shift', off: 'Radio off' }[st], st);
    if (window.UI) UI.toast(!musicOn() && st !== 'off' ? 'Music is off. Turn it on with ' + (!UI.kb() ? 'the note button' : S() && S().settings.family ? 'Shift+B' : 'B') + '.' : { fm: 'Freight FM', night: 'Night Shift', off: 'Radio off' }[st], 1800);
    Sound.resetDistrict(); K.cityMusic(cityCell());
    if (st === 'night') setTimeout(function () { K.ident('VOX-FM-13', 'MUS-FM-BED-NIGHT'); }, 900);
    if (st === 'off' && window.Voice) Voice.say({ key: 'VOX-FM-15', speaker: 'vera', pri: 'radio', force: true, gate: roadClear, onStart: function () { chip('Going off air. The road\'s all yours.'); } });
    if (window.AudioCtl) AudioCtl.refresh();
  };
  K.dial = function (name, st) {
    var d = $('fmDial'); if (d) d.remove(); d = document.createElement('div'); d.id = 'fmDial'; d.setAttribute('aria-hidden', 'true');
    var ang = st === 'fm' ? -40 : st === 'night' ? 40 : 0; d.innerHTML = '<i style="transform:rotate(' + ang + 'deg)"></i><span>' + UI.esc(name) + '</span>'; document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 1000);
  };
  K.nextStation = function () { var st = AU().station; K.setStation(st === 'fm' ? 'night' : st === 'night' ? 'off' : 'fm'); };
  K.flag = function (f) { flags[f] = Date.now(); };
  function fmTick() {
    var a = AU(), now = Date.now();
    if (ctxName !== 'city' || a.station !== 'fm' || !musicOn() || !a.idents) return;
    if (flags.firstRide === undefined) { flags.firstRide = now; K.ident('VOX-FM-10', 'MUS-FM-BED-DROP'); return; }
    var ev = flags.cleared && now - flags.cleared < 600000 ? ['cleared', 'VOX-FM-09'] : flags.passed && now - flags.passed < 600000 ? ['passed', 'VOX-FM-07'] : flags.failed && now - flags.failed < 600000 ? ['failed', 'VOX-FM-08'] : null;
    if (ev && now - lastIdent > 20000) { delete flags[ev[0]]; K.ident(ev[1], 'MUS-FM-BED-DROP'); return; }
    if (now - lastIdent > 150000 + Math.random() * 90000) { K.ident(ROT[rotI++ % ROT.length]); }
  }

  /* ---------------- where are we: city, film, Hall, menus ---------------- */
  function contextNow() {
    if (shown('loading') || shown('title')) return 'title';
    if (shown('cut')) return 'film';
    if (shown('viva')) return 'hall';
    if (shown('worldmap') || shown('chapter')) return 'menu';
    if (window.UI && UI.busy && UI.busy()) return 'sheet';
    /* AUDR2-04: an open dialog is not the open road (no radio link starts or carries on under it) */
    if (shown('modal')) return 'sheet';
    return 'city';
  }
  /* AUDR2-01: in the city or a scene, music that nobody has asked for since this context began (and that is not playing)
     comes back once, about a second in: the first scene after Start or Continue is never silent. */
  var ctxAt = 0, ctxTried = true;
  function ensureMusic() {
    if (ctxTried || !(ctxName === 'sheet' || ctxName === 'city') || Date.now() - ctxAt < 1100) return;
    ctxTried = true;
    if (!window.Sound || !Sound.ctx || !Sound.ctx() || (Sound.current && Sound.current()) || !Sound.musicAllowed() || (window.Game && Game.racing)) return;
    var lw = Sound.lastWanted && Sound.lastWanted(); if (lw && lw.at > ctxAt) return;
    K.musicBack();
  }
  K.ensureMusic = ensureMusic;
  /* AUDR4-01: the last moment the Hall was known to be on screen. Leaving it stops an examiner line only if that line
     started while the Hall was up; the ending film's first line (also an examiner line) starts after, and plays in full. */
  var hallSeen = 0;
  /* the Hall has just closed (V.finish, quitting): its examiner line stops now, before the ending film starts its own */
  K.leftHall = function () { var pl = window.Voice && Voice.playing(); if (pl && pl.pri === 6) Voice.stop(); };
  function poll() {
    var now = contextNow(), was = ctxName; if (now === 'hall') hallSeen = Date.now(); if (now !== 'city' || (window.Game && Game.isBusy && Game.isBusy())) offRoadAt = Date.now();
    if (now === was) { if (now === 'city') fmTick(); ensureMusic(); return; }
    ctxName = now; ctxAt = Date.now(); ctxTried = false;
    if (was === 'hall' && window.Voice && Voice.playing() && Voice.playing().pri === 6 && Voice.playing().at <= hallSeen) Voice.stop();
    /* AUDR2-04: a radio link never carries on into a dialog, film, scene, menu or the Hall */
    if (was === 'city' && now !== 'city' && window.Voice && Voice.playing() && Voice.playing().pri === 1) Voice.stop();
    if (now === 'menu' && musicOn()) Sound.music('MUS-MENU');
    /* AUD-07: the Hall has its own cue */
    if (now === 'hall' && musicOn()) Sound.music('CM-HALL');
    /* back in the city after a film, the Hall or a menu: the district's own music returns; AUD-02: also after a sheet when
       nothing is playing (the first sheet after Start, or a one-shot that has played out) */
    if ((now === 'city' && (was !== 'sheet' || !(Sound.current && Sound.current()))) || (was === 'menu' && now === 'sheet')) { if (!(window.Game && Game.racing)) { Sound.resetDistrict(); var c = cityCell(); if (c) Sound.districtMusic(c); else K.cityMusic(null); } }
    if (now === 'hall') K.ambience('hall'); else if (was === 'hall') { K.hallLast(false); ambKey = null; var c2 = cityCell(); if (c2) K.district(c2); }
    if (now === 'title') stopAmb(1);
  }
  K.context = function () { return ctxName; };
  /* AUD-02: forget the ambience and the context so the first poll after Start sets both again */
  K.resetAmb = function () { ambKey = null; ctxName = ''; };
  K.unlock = function () { register(); if (!timers.length) timers.push(setInterval(poll, 700)); };
  /* Music off: every layer made here stops now (the cue engine stops its own cue). */
  K.stopMusic = function () {
    clearTimeout(nightT); K.hallLast(false);
    live.forEach(function (l) { try { l.n.stop(); } catch (e) {} }); live = [];
    var el = $('radioChip'); if (el) el.classList.add('hidden');
    if (window.Voice && Voice.playing() && Voice.playing().pri === 1) Voice.stop();
  };
  /* AUDR2-05: a screen with its own theme (the Academy, the Locker) marks it; while that screen is open, music back on
     plays the theme, not the district groove */
  var screenCue = null;
  K.screenTheme = function (id, isOpen) { screenCue = id ? { id: id, open: isOpen } : null; };
  K.musicBack = function () {
    var c = contextNow();
    if (screenCue && c === 'sheet' && (!screenCue.open || screenCue.open())) { var lw = Sound.lastWanted && Sound.lastWanted(); if (lw && lw.id === screenCue.id && Sound.musicLast()) return; Sound.music(screenCue.id); return; }
    if (screenCue && screenCue.open && !screenCue.open()) screenCue = null;
    if (c === 'menu') Sound.music('MUS-MENU'); else if (c === 'city' || c === 'sheet') { Sound.resetDistrict(); var cell = cityCell(); if (window.Game && Game.racing) { if (!Sound.musicLast()) Sound.music('CM-RACE'); } else if (cell) Sound.districtMusic(cell); else K.cityMusic(null); }
    else if (!Sound.musicLast() && c === 'title') Sound.music('MUS-MENU');
  };
  K.districtTonic = function () { var c = cityCell(); if (c && c.kind === 'act') return TONIC['CM-D' + c.act]; if (c && c.kind === 'locker') return 59; return tonic(); };
  K.activeMusic = function () { var now = Date.now(); live = live.filter(function (l) { return l.until > now; }); return live.map(function (l) { return l.name; }).concat(lastHeart ? ['hall-last'] : []); };
  window.Kit = K;
})();
