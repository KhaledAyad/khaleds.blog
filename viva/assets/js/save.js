/* Freight City Viva v3: saving. Five documents per person in the host db, every write read back and checked,
   a localStorage mirror, ten local snapshots (the Time Machine), backups before every risky change, a migration
   chain v1 -> v2 -> v3 that never returns null, one writer across tabs, and the FCV3 save code and file. */
(function (root) {
  'use strict';
  var FCV = root.FCV;
  var S = {};
  var K = 'freight-city-viva-v3', SNAP = 'freight-city-viva-snap-', BK = 'freight-city-viva-backup-';
  var DOCS = ['progress', 'memory', 'viva'];
  var db = null, userId = null, dbState = 'pending', downloads = null, persisted = false;
  var pendingW = false, tick = 'verified', lastDbOk = 0, lastDbRead = 0, lastLocalOk = 0, localOk = true, writer = true, listeners = [], remoteCbs = [];
  var lastHash = {}, rev = { progress: 0, memory: 0, viva: 0 }, timer = null, cur = null, flushing = null, retryAt = 0, retryN = 0;
  S.repairs = [];

  /* ---------------- small helpers ---------------- */
  function lsGet(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) {
    try { root.localStorage.setItem(k, v); return true; }
    catch (e) { if (e && /quota/i.test(String(e.name) + String(e.message))) { dropOldestSnap(); try { root.localStorage.setItem(k, v); return true; } catch (e2) {} } return false; }
  }
  function lsDel(k) { try { root.localStorage.removeItem(k); } catch (e) {} }
  function lsKeys() { var out = []; try { for (var i = 0; i < root.localStorage.length; i++) out.push(root.localStorage.key(i)); } catch (e) {} return out; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function h6(str) { return ('000000' + FCV.hash32('fcv3|' + str).toString(36)).slice(-6); }
  /* A canonical hash: the save as the code carries it (memory columnar, no text stamps), so a pasted code hashes the same. */
  S.hash = function (st) { var c = codeState(st); delete c.copilotTemp; delete c.pos; delete c.exportedAt; delete c.madeAt; return h6(JSON.stringify(c, Object.keys(flatKeys(c)).sort())); };
  function flatKeys(o, acc) { acc = acc || {}; if (o && typeof o === 'object') Object.keys(o).forEach(function (k) { acc[k] = 1; flatKeys(o[k], acc); }); return acc; }
  function emit() { var s = S.status(); listeners.forEach(function (f) { try { f(s); } catch (e) {} }); }
  S.onStatus = function (f) { listeners.push(f); };
  S.onRemote = function (f) { remoteCbs.push(f); };
  function setTick(t) { tick = t; emit(); }
  function safeParse(text) {
    return JSON.parse(text, function (k, v) { if (k === '__proto__' || k === 'constructor' || k === 'prototype') return undefined; return v; });
  }

  /* ---------------- bytes: deflate-raw, base64url, CRC-32 ---------------- */
  function b64(bytes, url) { var s = '', CH = 0x8000; for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH)); var o = btoa(s); return url ? o.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : o; }
  function unb64(str) { str = String(str).replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; var s = atob(str), out = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
  var CRC = null;
  function crc32(bytes) {
    if (!CRC) { CRC = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
    var x = 0xFFFFFFFF; for (var i = 0; i < bytes.length; i++) x = CRC[(x ^ bytes[i]) & 255] ^ (x >>> 8);
    return ('00000000' + ((x ^ 0xFFFFFFFF) >>> 0).toString(16)).slice(-8);
  }
  S.crc32 = crc32;
  function stream(bytes, Ctor, mode) { var cs = new Ctor(mode), w = cs.writable.getWriter(); w.write(bytes).catch(function () {}); w.close().catch(function () {}); return new Response(cs.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
  var pakoP = null;
  S.ensureDeflate = function () {
    if (root.CompressionStream && root.DecompressionStream) return Promise.resolve('native');
    if (root.pako) return Promise.resolve('pako');
    if (!pakoP) pakoP = new Promise(function (res) {
      var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pako/2.2.0/pako.min.js';
      s.integrity = 'sha512-fPsR5SQgPbxZTpzlAGomA03t8G3JT0euc5vxhseE6YGv5U57AI+8IYr42eQdrp8GcY2J69D3x5kVOORnCJ/OWw=='; s.crossOrigin = 'anonymous';
      s.onload = function () { res('pako'); }; s.onerror = function () { res('none'); }; document.head.appendChild(s);
    });
    return pakoP;
  };
  function deflate(bytes) {
    if (root.CompressionStream) return stream(bytes, CompressionStream, 'deflate-raw');
    return S.ensureDeflate().then(function (k) { if (k === 'pako') return root.pako.deflateRaw(bytes); throw new Error('no deflate'); });
  }
  function inflate(bytes) {
    if (root.DecompressionStream) return stream(bytes, DecompressionStream, 'deflate-raw');
    return S.ensureDeflate().then(function (k) { if (k === 'pako') return root.pako.inflateRaw(bytes); throw new Error('no inflate'); });
  }
  S.zip = function (text) { return deflate(new TextEncoder().encode(text)).then(function (b) { return b64(b, false); }); };
  S.unzip = function (z) { return inflate(unb64(z)).then(function (b) { return new TextDecoder().decode(b); }); };

  /* ---------------- the state, split into documents ---------------- */
  /* The device id lives in this browser only (never inside the save), so two devices can tell each other apart. */
  var myDevice = null;
  S.deviceId = function () {
    if (myDevice) return myDevice;
    myDevice = lsGet('fcv3-device');
    if (!myDevice) { myDevice = Math.random().toString(36).slice(2, 8); lsSet('fcv3-device', myDevice); }
    return myDevice;
  };
  /* Seen dialogue, compacted to the highest line index seen per scene. */
  function compactLines(lines) {
    var c = {}, x = [];
    Object.keys(lines || {}).forEach(function (k) { var m = /^(.*):(\d+)$/.exec(k); if (m) c[m[1]] = Math.max(c[m[1]] === undefined ? -1 : c[m[1]], +m[2]); else x.push(k); });
    return { c: c, x: x };
  }
  function expandLines(l) {
    if (!l || typeof l !== 'object') return {};
    if (!l.c && !l.x) return l; /* already expanded */
    var out = {}; Object.keys(l.c || {}).forEach(function (p) { for (var i = 0; i <= Math.min(400, +l.c[p] || 0); i++) out[p + ':' + i] = 1; }); (l.x || []).forEach(function (k) { out[k] = 1; });
    return out;
  }
  S.compactLines = compactLines; S.expandLines = expandLines;
  function slim(st) { var c = clone(st); c.lines = compactLines(c.lines); delete c.savedAt; delete c.selftest; delete c.device; delete c.copilotTemp; return c; }
  /* Memory as compact rows: [id, box, last, seen, right, wrong, sureWrong, stamp, firstRight, lastOutcome, lastSure, proofs, gen, err, at] */
  function packMem(mem) {
    return Object.keys(mem || {}).map(function (id) {
      var r = mem[id]; return [id, r.box, r.last, r.seen, r.right, r.wrong, r.sureWrong || 0, r.stamp || '', r.firstRight ? 1 : 0, r.lastOutcome || '', r.lastSure ? 1 : 0, r.proofs || [], r.gen || 0, r.err || '', r.at || 0];
    });
  }
  function unpackMem(rows) {
    var mem = {}; (rows || []).forEach(function (a) {
      if (!Array.isArray(a) || typeof a[0] !== 'string') return;
      mem[a[0]] = { box: +a[1] || 1, last: +a[2] || 0, seen: +a[3] || 0, right: +a[4] || 0, wrong: +a[5] || 0, sureWrong: +a[6] || 0, stamp: a[7] || '', firstRight: !!a[8], lastOutcome: a[9] || undefined, lastSure: !!a[10], proofs: Array.isArray(a[11]) ? a[11] : [], gen: +a[12] || 0, err: a[13] || '' };
      if (+a[14]) mem[a[0]].at = +a[14];
      if (!mem[a[0]].lastOutcome) delete mem[a[0]].lastOutcome;
    });
    return mem;
  }
  S.split = function (st) {
    var s = slim(st), out = {};
    out.memory = { m: packMem(s.mem), met: Object.keys(s.met || {}) };
    out.viva = s.viva || {};
    delete s.mem; delete s.met; delete s.viva;
    out.progress = s;
    return out;
  };
  S.join = function (parts) {
    var st = clone(parts.progress || {});
    st.lines = expandLines(st.lines); delete st.device;
    var m = parts.memory || {};
    st.mem = unpackMem(m.m); st.met = {}; (m.met || []).forEach(function (id) { st.met[id] = 1; });
    st.viva = parts.viva || {};
    return st;
  };

  /* ---------------- migration chain: 1 -> 2 -> 3 ---------------- */
  function v1to2(v1) {
    var st = FCV.newState(); st.v = 2;
    if (!v1 || typeof v1 !== 'object') return st;
    st.intro = !!v1.intro; st.played = v1.played || 0; st.stars = Math.min(v1.stars || 0, 2); st.pos = v1.pos || null;
    st.settings.effects = v1.sound !== false; st.settings.music = v1.sound !== false;
    if (v1.intro) st.cuts.cold_open = 1;
    if (v1.lockerSeen) st.cuts.locker_entry = 1;
    var sc = FCV.data.script, V1STEPS = { 1: 3, 2: 3, 3: 3, 4: 4, 5: 4, 6: 3, 7: 3 };
    Object.keys(v1.acts || {}).forEach(function (k) {
      var n = +k, va = v1.acts[k], a = sc.acts[n - 1]; if (!a || !va) return;
      var order = a.scenes.slice(0, V1STEPS[n] || a.scenes.length).map(function (s) { return 'scene:' + s.id; });
      var reh1 = a.examiner_rehearsal ? 'rehearsal:' + a.examiner_rehearsal.question : null;
      var v1ids = order.concat(['tp', 'mission', reh1]);
      var steps = FCV.actSteps(n).map(function (s) { return s.id; });
      var as = FCV.actState(st, n);
      if (va.cut) as.done.push('opening');
      for (var i = 0; i < Math.min(va.step || 0, v1ids.length); i++) if (v1ids[i] && steps.indexOf(v1ids[i]) >= 0 && as.done.indexOf(v1ids[i]) < 0) as.done.push(v1ids[i]);
      if (va.side && va.side.done) as.side.done = true;
      as.corner = va.corner || {}; if (va.cornerDone) as.cornerDone = true;
    });
    Object.keys(v1.rooms || {}).forEach(function (id) { st.rooms[id] = clone(v1.rooms[id]); if (!st.rooms[id].corner) st.rooms[id].corner = {}; });
    Object.keys(v1.items || {}).forEach(function (id) {
      var it = v1.items[id]; if (!FCV.resolve(id)) return;
      st.mem[id] = { box: it.right >= it.seen && it.seen ? 2 : 1, last: 0, seen: it.seen || 0, right: it.right || 0, wrong: Math.max(0, (it.seen || 0) - (it.right || 0)), sureWrong: 0, stamp: FCV.stamp(id), firstRight: it.firstRight };
    });
    Object.keys(v1.rate || {}).forEach(function (id) {
      if (!FCV.resolve(id)) return;
      var r = v1.rate[id], rec = st.mem[id] || (st.mem[id] = { box: 1, last: 0, seen: 1, right: 0, wrong: 0, sureWrong: 0, stamp: FCV.stamp(id) });
      rec.box = r === 'nailed' || r === 'partly' ? 2 : 1; rec.lastOutcome = r === 'nailed' ? 'right' : 'wrong';
    });
    st.met = v1.met || {};
    var vv = v1.viva || {};
    Object.keys(vv.seen || {}).forEach(function (id) { var s = vv.seen[id]; st.viva.seen[id] = { first: s.last || 1, last: s.last || 1, result: s.wrong ? 'wrong' : 'right' }; });
    st.viva.attempt = vv.attempt || 0;
    st.viva.results = (vv.results || []).map(function (r) { return Object.assign({ at: 0 }, r); });
    st.viva.best = vv.best || null;
    st.migratedFrom = 1;
    return st;
  }
  var V2STEPS = null;
  function v2Steps(n) {
    /* The v2 step list of each act: the v3 list less the steps v3 added. */
    if (!V2STEPS) V2STEPS = {};
    if (!V2STEPS[n]) V2STEPS[n] = FCV.actSteps(n).filter(function (s) { return !/^(methods|academy_entrance|shift_check)$/.test(s.kind); }).map(function (s) { return s.id; });
    return V2STEPS[n];
  }
  function v2to3(s2) {
    var st = FCV.newState(), base = clone(s2 || {});
    Object.keys(base).forEach(function (k) { st[k] = base[k]; });
    var fresh = FCV.newState();
    Object.keys(fresh).forEach(function (k) { if (st[k] === undefined || st[k] === null && fresh[k] !== null) st[k] = fresh[k]; });
    st.settings = Object.assign(FCV.defaultSettings(), base.settings || {});
    if (base.settings && typeof base.settings.at !== 'number') st.settings.at = 1; /* AUDR4-03 */
    st.settings.audio = FCV.normAudio(base.settings && base.settings.audio, base.settings); FCV.syncOldAudio(st.settings);
    st.viva = Object.assign(fresh.viva, base.viva || {});
    st.parcels = Object.assign({ picked: {}, delivered: {}, bag: [] }, base.parcels || {});
    st.copilot = Object.assign(FCV.newCopilot(), base.copilot || {});
    st.methods = Object.assign({ lessons: {}, missions: {} }, base.methods || {});
    st.garage = Object.assign({ owned: {}, equipped: {}, packs: 0 }, base.garage || {});
    st.newV3 = base.newV3 || {}; st.orphans = base.orphans || [];
    /* Steps added in v3 never re-lock an act cleared in v2; unknown step ids move to orphans. */
    for (var n = 1; n <= 7; n++) {
      var as = st.acts[n]; if (!as) continue;
      var known = FCV.actSteps(n).map(function (x) { return x.id; });
      as.done = (as.done || []).filter(function (sid) { if (known.indexOf(sid) >= 0) return true; st.orphans.push(n + ':' + sid); return false; });
      var v2 = v2Steps(n), cleared = v2.every(function (sid) { return as.done.indexOf(sid) >= 0; });
      if (cleared && (base.v || 2) < 3) st.newV3[n] = known.filter(function (sid) { return v2.indexOf(sid) < 0 && as.done.indexOf(sid) < 0; });
    }
    st.v = 3;
    return st;
  }
  S.migrations = { 1: v1to2, 2: v2to3 };
  function versionOf(s) {
    if (!s || typeof s !== 'object') return 0;
    if (s.v === 3) return 3;
    if (s.v === 1 || (s.v === undefined && s.acts && Object.keys(s.acts).some(function (k) { return s.acts[k] && typeof s.acts[k].step === 'number'; }))) return 1;
    return 2;
  }
  /* Bring any loaded object up to v3. Each step is wrapped: a failing step leaves its input unchanged and logs a repair. */
  S.upgrade = function (s) {
    var v = versionOf(s), cur2 = s;
    if (!v) return FCV.newState();
    while (v < 3) {
      try { cur2 = S.migrations[v](cur2); } catch (e) { S.repairs.push({ at: Date.now(), step: v + 'to' + (v + 1), err: String(e && e.message) }); if (v === 1) cur2 = FCV.newState(); }
      v++;
    }
    return S.validate(cur2);
  };
  S.migrate = function (v1) { return S.upgrade(Object.assign({ v: 1 }, v1)); };
  /* Boot self-test: fill missing fields, clamp numbers, drop stats for vanished ids and memory whose text changed. */
  S.validate = function (s) {
    var st = FCV.newState();
    if (!s || typeof s !== 'object') return st;
    Object.keys(s).forEach(function (k) { st[k] = s[k]; });
    var fresh = FCV.newState();
    Object.keys(fresh).forEach(function (k) { if (st[k] === undefined || st[k] === null && fresh[k] !== null && typeof fresh[k] === 'object') st[k] = fresh[k]; });
    st.v = 3;
    st.lines = expandLines(st.lines); delete st.device;
    st.settings = Object.assign(FCV.defaultSettings(), s.settings || {});
    if (s.settings && typeof s.settings.at !== 'number') st.settings.at = 1; /* AUDR4-03: real settings, time unknown */
    st.settings.audio = FCV.normAudio(s.settings && s.settings.audio, s.settings); FCV.syncOldAudio(st.settings);
    st.viva = Object.assign(fresh.viva, s.viva || {});
    st.copilot = Object.assign(FCV.newCopilot(), s.copilot || {});
    st.stars = Math.max(0, Math.min(5, +st.stars || 0));
    st.played = Math.max(0, +st.played || 0);
    if (!Array.isArray(st.days)) st.days = [];
    /* a junk epoch key from round 2's Reset viva history ("viva:undefined") is dropped on load */
    if (st.epochs && typeof st.epochs === 'object') Object.keys(st.epochs).forEach(function (k) { if (/:undefined$/.test(k)) delete st.epochs[k]; });
    Object.keys(st.acts || {}).forEach(function (n) { var a = st.acts[n]; if (!a || !Array.isArray(a.done)) st.acts[n] = { done: [], mission: null, side: {}, corner: {}, stamp: null, sideStamp: null, mock: null }; });
    /* D2-M1: every lesson record has a number step (a Methods mission used to write {core:true} alone) */
    if (st.methods && st.methods.lessons && typeof st.methods.lessons === 'object') Object.keys(st.methods.lessons).forEach(function (k) { var l = st.methods.lessons[k]; if (!l || typeof l !== 'object') { st.methods.lessons[k] = { step: 0 }; return; } if (typeof l.step !== 'number' || !isFinite(l.step) || l.step < 0) l.step = 0; });
    if (FCV.data) Object.keys(st.mem || {}).forEach(function (id) {
      var r = st.mem[id];
      if (!r || typeof r !== 'object') { delete st.mem[id]; return; }
      r.box = Math.max(1, Math.min(5, Math.round(+r.box || 1)));
      if (!FCV.resolve(id)) return; /* kept: a vanished id may come back; never counted */
      if (r.stamp && r.stamp !== FCV.stamp(id)) delete st.mem[id];
    });
    return st;
  };
  S.isValid = function (s) { return !!(s && typeof s === 'object' && s.acts && typeof s.acts === 'object' && s.settings && s.viva); };

  /* ---------------- merging two saves (v2 rules, plus v3 fields as unions) ---------------- */
  var RANK = { fail: 0, major: 1, minor: 2, none: 3 }, SR = { bronze: 1, silver: 2, gold: 3 };
  /* Reset epochs: a restart, reset, wipe, Time Machine restore or import stamps the time it happened, and a merge takes
     an older copy's progress for that scope only if that copy knew of the reset or was saved after it. */
  S.markReset = function (st, scope, key) {
    var now = Date.now(); st.epochs = st.epochs || {};
    if (scope === 'story') { st.epochs.story = now; }
    else if (scope === 'all') { st.epochs.story = now; st.epochs.memory = now; st.epochs.viva = now; st.epochs.methods = now; }
    else if (scope === 'viva' || scope === 'memory' || scope === 'methods') st.epochs[scope] = now;
    else if (key !== undefined && key !== null) st.epochs[scope + ':' + key] = now;
    return now;
  };
  function ep(st, k) { return (st && st.epochs && st.epochs[k]) || 0; }
  /* Does the older copy still count for this scope? E is the newest epoch of either copy. */
  function counts(older, newer, keys) {
    var eo = 0, en = 0; keys.forEach(function (k) { eo = Math.max(eo, ep(older, k)); en = Math.max(en, ep(newer, k)); });
    var E = Math.max(eo, en); if (!E) return true;
    return eo === E || (older.savedAt || 0) > E;
  }
  S.merge = function (a, b) {
    if (!a) return b; if (!b) return a;
    var newer = (b.savedAt || 0) > (a.savedAt || 0) ? b : a, older = newer === a ? b : a;
    var m = clone(newer); delete m.device;
    /* AUDR4-03: settings follow the copy where they were last changed. A copy with settings but no stamp (saved before the
       stamp existed) counts as 1, so it still wins over a fresh device's defaults (0). */
    var setAt = function (x) { var s = x && x.settings; return !s ? -1 : typeof s.at === 'number' ? s.at : 1; };
    if (setAt(older) > setAt(newer)) m.settings = clone(older.settings);
    /* QAD4-m2: the room left part-way is the one with the later time, whichever copy was saved last */
    var lpAt = function (x) { return (x && x.lastPlace && x.lastPlace.at) || 0; };
    if (lpAt(older) > lpAt(newer)) m.lastPlace = clone(older.lastPlace);
    m.epochs = Object.assign({}, older.epochs || {}, newer.epochs || {});
    Object.keys(older.epochs || {}).forEach(function (k) { m.epochs[k] = Math.max(ep(older, k), ep(newer, k)); });
    var storyOk = counts(older, newer, ['story']);
    /* Wiped or replaced by a code after the older copy was saved: nothing of it comes back but the days played. */
    if (!storyOk && !counts(older, newer, ['memory'])) {
      var dd = {}; (m.days || []).concat(older.days || []).forEach(function (d) { dd[d] = 1; }); m.days = Object.keys(dd).sort();
      m.savedAt = Math.max(a.savedAt || 0, b.savedAt || 0); return m;
    }
    /* Acts, rooms and parcels are united here and then pruned by time against the newest reset for their scope
       (pruneByEpochs): an item survives if a copy that knew the reset has it, or if it was earned after the reset. */
    Object.keys(older.acts || {}).forEach(function (n) {
      var oa = older.acts[n], ma = m.acts[n] || (m.acts[n] = clone(oa));
      (oa.done || []).forEach(function (sid) { if (ma.done.indexOf(sid) < 0) ma.done.push(sid); });
      if (oa.doneAt) { ma.doneAt = ma.doneAt || {}; Object.keys(oa.doneAt).forEach(function (sid) { ma.doneAt[sid] = Math.max(ma.doneAt[sid] || 0, oa.doneAt[sid] || 0); }); }
      if (oa.side && oa.side.done) { ma.side = ma.side || {}; ma.side.done = true; }
      if (oa.cornerDone) ma.cornerDone = true;
      if ((SR[oa.stamp] || 0) > (SR[ma.stamp] || 0)) ma.stamp = oa.stamp;
      if (oa.mastered) ma.mastered = true;
    });
    Object.keys(older.rooms || {}).forEach(function (r) {
      var or = older.rooms[r], mr = m.rooms[r] || (m.rooms[r] = clone(or));
      mr.stage = Math.max(mr.stage || 0, or.stage || 0); mr.stageAt = Math.max(mr.stageAt || 0, or.stageAt || 0); mr.badge = mr.badge || or.badge; mr.cornerDone = mr.cornerDone || or.cornerDone;
      mr.visited = mr.visited || or.visited; mr.done = Object.assign({}, or.done || {}, mr.done || {});
    });
    m.mem = m.mem || {};
    var memOk = counts(older, newer, ['memory']), vivaOk = counts(older, newer, ['viva', 'memory']);
    if (memOk) Object.keys(older.mem || {}).forEach(function (id) { var o = older.mem[id], n = m.mem[id]; if (!n || (o.last || 0) > (n.last || 0) || ((o.last || 0) === (n.last || 0) && o.seen > n.seen)) m.mem[id] = o; });
    m.viva = m.viva || FCV.newState().viva; var ov = vivaOk ? (older.viva || FCV.newState().viva) : FCV.newState().viva;
    Object.keys(ov.seen || {}).forEach(function (id) { var o = ov.seen[id], n = m.viva.seen[id]; if (!n || (o.last || 0) > (n.last || 0)) m.viva.seen[id] = o; });
    var res = {}; (m.viva.results || []).concat(ov.results || []).forEach(function (r) { res[(r.at || 0) + ':' + r.attempt + ':' + r.ending] = r; });
    m.viva.results = Object.keys(res).map(function (k) { return res[k]; }).sort(function (x, y) { return (x.at || 0) - (y.at || 0); });
    m.viva.attempt = Math.max(m.viva.attempt || 0, ov.attempt || 0);
    if ((RANK[ov.best] === undefined ? -1 : RANK[ov.best]) > (RANK[m.viva.best] === undefined ? -1 : RANK[m.viva.best])) m.viva.best = ov.best;
    m.viva.fails = Math.max(m.viva.fails || 0, ov.fails || 0);
    m.parcels = m.parcels || { picked: {}, delivered: {}, bag: [] };
    ['picked', 'delivered'].forEach(function (k) { var o = (older.parcels || {})[k] || {}, n = m.parcels[k] || {}; m.parcels[k] = Object.assign({}, o, n); Object.keys(o).forEach(function (id) { if (typeof o[id] === 'number' && typeof n[id] === 'number') m.parcels[k][id] = Math.max(o[id], n[id]); }); });
    (storyOk ? ['cuts', 'lines', 'met', 'achievements'] : ['lines', 'achievements']).forEach(function (k) { m[k] = Object.assign({}, older[k] || {}, m[k] || {}); });
    if (!memOk) m.met = Object.assign({}, newer.met || {});
    var sw = {}; (m.struggled || []).concat(older.struggled || []).forEach(function (x) { sw[x.text] = x; }); m.struggled = Object.keys(sw).map(function (k) { return sw[k]; });
    m.own = m.own || {}; Object.keys(older.own || {}).forEach(function (k) { if (!m.own[k]) m.own[k] = older.own[k]; });
    var days = {}; (m.days || []).concat(older.days || []).forEach(function (d) { days[d] = 1; }); m.days = Object.keys(days).sort();
    ['played', 'lastTp', 'xp', 'sessions', 'lastExport'].forEach(function (k) { m[k] = Math.max(m[k] || 0, older[k] || 0); });
    if (storyOk) m.intro = m.intro || older.intro;
    /* v3 fields */
    m.stepStars = m.stepStars || {}; Object.keys(older.stepStars || {}).forEach(function (k) { m.stepStars[k] = Math.max(m.stepStars[k] || 0, older.stepStars[k] || 0); });
    m.methods = m.methods || { lessons: {}, missions: {} }; var om = older.methods || {};
    Object.keys(om.lessons || {}).forEach(function (k) { if (!counts(older, newer, ['methods', 'lesson:' + k])) return; var o = om.lessons[k], n = m.methods.lessons[k]; if (!n) m.methods.lessons[k] = o; else { n.done = n.done || o.done; n.step = Math.max(n.step || 0, o.step || 0); if (o.doneAt) n.doneAt = Math.max(n.doneAt || 0, o.doneAt); } });
    Object.keys(om.missions || {}).forEach(function (k) { if (!counts(older, newer, ['methods', 'mission:' + k])) return; var o = om.missions[k], n = m.methods.missions[k]; if (!n) m.methods.missions[k] = o; else { n.done = n.done || o.done; if (o.doneAt) n.doneAt = Math.max(n.doneAt || 0, o.doneAt); if ((SR[o.stamp] || 0) > (SR[n.stamp] || 0)) n.stamp = o.stamp; } });
    m.garage = m.garage || { owned: {}, equipped: {}, packs: 0 }; m.garage.owned = Object.assign({}, (older.garage || {}).owned || {}, m.garage.owned || {});
    var oc = older.copilot || {}, mc = m.copilot = Object.assign(FCV.newCopilot(), m.copilot || {});
    ['stickers', 'finds', 'animal', 'stunts', 'tellAct', 'docketSpots', 'paint'].forEach(function (k) { mc[k] = Object.assign({}, oc[k] || {}, mc[k] || {}); });
    var MED = { bronze: 1, silver: 2, gold: 3 };
    Object.keys(oc.races || {}).forEach(function (d) { var o = oc.races[d], n = mc.races[d]; if (!n || (MED[o.medal] || 0) > (MED[n.medal] || 0) || (o.medal === n.medal && o.bestMs < n.bestMs)) mc.races[d] = o; });
    mc.honks = Math.max(mc.honks || 0, oc.honks || 0);
    var logs = {}; (m.shiftLog || []).concat(older.shiftLog || []).forEach(function (x) { logs[x.at] = x; }); m.shiftLog = Object.keys(logs).map(function (k) { return logs[k]; }).sort(function (x, y) { return x.at - y.at; }).slice(-30);
    if (m.newV3 && older.newV3) Object.keys(m.newV3).forEach(function (n) { if (older.newV3[n]) m.newV3[n] = m.newV3[n].filter(function (sid) { return older.newV3[n].indexOf(sid) >= 0; }); });
    pruneByEpochs(m, a, b);
    m.savedAt = Math.max(a.savedAt || 0, b.savedAt || 0);
    return m;
  };
  /* A copy that has never seen any reset (an old v1 or v2 save being migrated) has no epochs and no earn times:
     it keeps the old rule, counting if it was saved after the reset. Every v3 copy that has met a reset is strict. */
  /* QAD3-M1: only a copy with no earn times at all (a v1 or v2 save) is legacy; a v3 copy that simply never met a reset has
     earn times on its steps and rooms, so it is judged by them (strict), never by when it was last saved */
  function earnTimes(x) {
    var a = x.acts || {}, r = x.rooms || {}, k;
    for (k in a) if (a[k] && a[k].doneAt && Object.keys(a[k].doneAt).length) return true;
    for (k in r) if (r[k] && (r[k].stageAt || r[k].badgeAt || r[k].visitedAt)) return true;
    return false;
  }
  function legacyAfter(x, E) { return !(x.epochs && Object.keys(x.epochs).length) && !earnTimes(x) && (x.savedAt || 0) > E; }
  function knows(x, keys, E) { var e = 0; keys.forEach(function (k) { e = Math.max(e, ep(x, k)); }); return e >= E; }
  function newest(a, b, keys) { var E = 0; keys.forEach(function (k) { E = Math.max(E, ep(a, k), ep(b, k)); }); return E; }
  function pruneByEpochs(m, a, b) {
    var both = [a, b];
    Object.keys(m.acts || {}).forEach(function (n) {
      var keys = ['story', 'act:' + n], ma = m.acts[n]; if (!ma || !Array.isArray(ma.done)) return;
      /* a Methods step also answers to its mission's own restart */
      var keysOf = function (sid) { return /^methods:/.test(sid) ? keys.concat(['mission:' + sid.slice(8)]) : keys; };
      var E = newest(a, b, keys), anyM = ma.done.some(function (sid) { return /^methods:/.test(sid) && newest(a, b, keysOf(sid)); }); if (!E && !anyM) return;
      ma.done = ma.done.filter(function (sid) {
        var ks = keysOf(sid), Es = newest(a, b, ks); if (!Es) return true;
        return both.some(function (x) { var xa = x.acts && x.acts[n]; if (!xa || (xa.done || []).indexOf(sid) < 0) return false; return knows(x, ks, Es) || (((xa.doneAt || {})[sid]) || 0) >= Es || legacyAfter(x, Es); });
      });
      if (ma.doneAt) Object.keys(ma.doneAt).forEach(function (sid) { if (ma.done.indexOf(sid) < 0) delete ma.doneAt[sid]; });
      if (E && !both.some(function (x) { return knows(x, keys, E) && x.acts && x.acts[n] && x.acts[n].mission; })) { if (ma.done.indexOf('mission') < 0) ma.mission = null; }
    });
    /* Methods missions and lessons: done survives only from a copy that knew the newest restart, or if earned after it */
    ['missions', 'lessons'].forEach(function (kind) {
      var mk = (m.methods || {})[kind] || {}, pre = kind === 'missions' ? 'mission:' : 'lesson:';
      Object.keys(mk).forEach(function (k) {
        var ks = ['methods', pre + k], Ek = newest(a, b, ks), cur = mk[k]; if (!Ek || !cur) return;
        var ok = both.filter(function (x) { var xm = ((x.methods || {})[kind] || {})[k]; return xm && (knows(x, ks, Ek) || (xm.doneAt || 0) >= Ek || legacyAfter(x, Ek)); });
        var done = ok.some(function (x) { return x.methods[kind][k].done; });
        if (!done) { cur.done = false; delete cur.doneAt; }
        if (kind === 'lessons') cur.step = ok.reduce(function (mx, x) { return Math.max(mx, x.methods[kind][k].step || 0); }, 0);
      });
    });
    Object.keys(m.rooms || {}).forEach(function (r) {
      var keys = ['story', 'room:' + r], E = newest(a, b, keys), mr = m.rooms[r]; if (!E || !mr) return;
      var stage = 0, done = {}, corner = false;
      both.forEach(function (x) { var xr = x.rooms && x.rooms[r]; if (!xr) return; if (knows(x, keys, E) || (xr.stageAt || 0) >= E || legacyAfter(x, E)) { stage = Math.max(stage, xr.stage || 0); Object.assign(done, xr.done || {}); corner = corner || !!xr.cornerDone; } });
      mr.stage = stage; mr.done = done; mr.cornerDone = corner;
      /* QAD3-M1: after a story reset (or a Time Machine or code restore) the whole room goes: its badge and its visit
         survive only from a copy that knew the reset, or if earned after it. "Badge kept" is for a room's own restart. */
      if (newest(a, b, ['story']) >= E) {
        var held = function (f, at) { return both.some(function (x) { var xr = x.rooms && x.rooms[r]; return !!(xr && xr[f] && (knows(x, keys, E) || at(xr) >= E || legacyAfter(x, E))); }); };
        var badge = held('badge', function (xr) { return xr.badgeAt || 0; }), visited = held('visited', function (xr) { return Math.max(xr.visitedAt || 0, xr.stageAt || 0, xr.badgeAt || 0); });
        mr.badge = badge; if (!badge) { delete mr.badgeAt; mr.replaying = false; }
        mr.visited = visited; if (!visited) delete mr.visitedAt;
        if (!badge && !visited && !stage && !corner && !Object.keys(done).length) delete m.rooms[r];
      }
    });
    /* QAD3-M1: an act's stamp, mastered flag and side records after a story reset come only from a copy that knew the
       reset, or from the step that earns them done after it */
    var Es = newest(a, b, ['story']);
    if (Es) Object.keys(m.acts || {}).forEach(function (n) {
      var ma = m.acts[n]; if (!ma || newest(a, b, ['act:' + n]) > Es) return;
      var ok = function (x, sid) { var xa = x.acts && x.acts[n]; return xa && (knows(x, ['story'], Es) || legacyAfter(x, Es) || (sid && (((xa.doneAt || {})[sid]) || 0) >= Es)) ? xa : null; };
      var best = function (f, sid) { var v = null; both.forEach(function (x) { var xa = ok(x, sid); if (xa && xa[f] && (SR[xa[f]] || 0) > (SR[v] || 0)) v = xa[f]; }); return v; };
      ma.stamp = best('stamp', 'mission'); ma.sideStamp = best('sideStamp', null);
      if (!both.some(function (x) { var xa = ok(x, 'shift_check'); return xa && xa.mastered; })) delete ma.mastered;
      if (!both.some(function (x) { var xa = ok(x, null); return xa && xa.side && xa.side.done; })) { if (ma.side) delete ma.side.done; }
      if (!both.some(function (x) { var xa = ok(x, null); return xa && xa.cornerDone; })) delete ma.cornerDone;
    });
    /* QAD3-M1: learning after a reset of the memory: a record survives from a copy that knew the reset, or if it was made
       after it; a copy that missed the reset gives way to the one that knew it */
    var Em = newest(a, b, ['memory']);
    if (Em && m.mem) Object.keys(m.mem).forEach(function (id) {
      var okm = function (x) { var r0 = x && x.mem && x.mem[id]; return r0 && (knows(x, ['memory'], Em) || (r0.at || 0) >= Em || legacyAfter(x, Em)) ? r0 : null; };
      var ra = okm(a), rb = okm(b);
      if (!ra && !rb) delete m.mem[id];
      else if (!ra || !rb) m.mem[id] = clone(ra || rb);
    });
    /* the same for viva results: an attempt made before a viva reset, kept only by a copy that missed it, does not return */
    var Ev = newest(a, b, ['viva', 'memory']);
    if (Ev && m.viva) {
      var vk = function (x) { return knows(x, ['viva', 'memory'], Ev) || legacyAfter(x, Ev); };
      var okR = {}; both.forEach(function (x) { ((x.viva || {}).results || []).forEach(function (r0) { if (vk(x) || (r0.at || 0) >= Ev) okR[(r0.at || 0) + ':' + r0.attempt + ':' + r0.ending] = 1; }); });
      m.viva.results = (m.viva.results || []).filter(function (r0) { return okR[(r0.at || 0) + ':' + r0.attempt + ':' + r0.ending]; });
      var bestR = null, att = 0, fl = 0;
      both.forEach(function (x) { if (!vk(x) || !x.viva) return; if ((RANK[x.viva.best] === undefined ? -1 : RANK[x.viva.best]) > (RANK[bestR] === undefined ? -1 : RANK[bestR])) bestR = x.viva.best; att = Math.max(att, x.viva.attempt || 0); fl = Math.max(fl, x.viva.fails || 0); });
      m.viva.results.forEach(function (r0) { if ((RANK[r0.ending] === undefined ? -1 : RANK[r0.ending]) > (RANK[bestR] === undefined ? -1 : RANK[bestR])) bestR = r0.ending; att = Math.max(att, r0.attempt || 0); });
      m.viva.best = bestR || null; m.viva.attempt = att; m.viva.fails = fl;
      if (m.viva.paused && (m.viva.paused.at || 0) < Ev && !both.some(function (x) { return vk(x) && x.viva && x.viva.paused && x.viva.paused.at === m.viva.paused.at; })) m.viva.paused = null;
    }
    var E = newest(a, b, ['story']);
    if (E && m.parcels) {
      ['picked', 'delivered'].forEach(function (k) {
        var keep = {}; Object.keys(m.parcels[k] || {}).forEach(function (id) {
          if (both.some(function (x) { var v = ((x.parcels || {})[k] || {})[id]; return v && (knows(x, ['story'], E) || (typeof v === 'number' && v >= E) || legacyAfter(x, E)); })) keep[id] = m.parcels[k][id];
        }); m.parcels[k] = keep;
      });
      m.parcels.bag = (m.parcels.bag || []).filter(function (id) { return m.parcels.picked[id] && !m.parcels.delivered[id]; });
    }
  }
  S.pruneByEpochs = pruneByEpochs;

  /* ---------------- local mirror ---------------- */
  function writeLocal(st) {
    var parts = S.split(st), ok = true;
    DOCS.forEach(function (d) { ok = lsSet(K + ':' + d, JSON.stringify(parts[d])) && ok; });
    ok = lsSet(K + ':meta', JSON.stringify({ v: 3, savedAt: st.savedAt, device: S.deviceId(), hash: S.hash(st), rev: rev })) && ok;
    localOk = ok; if (ok) lastLocalOk = Date.now();
    if (!persisted && root.navigator && navigator.storage && navigator.storage.persist) { persisted = true; try { navigator.storage.persist().catch(function () {}); } catch (e) {} }
    return ok;
  }
  S.loadLocal = function () {
    var out = { v3: null, v2: null, v1: null, v3broken: false };
    var meta = lsGet(K + ':meta');
    if (meta) {
      try {
        var parts = {}; DOCS.forEach(function (d) { var r = lsGet(K + ':' + d); parts[d] = r ? safeParse(r) : null; });
        var st = S.join(parts), mt = safeParse(meta); st.savedAt = mt.savedAt;
        if (mt.rev) rev = Object.assign(rev, mt.rev);
        if (S.isValid(st)) out.v3 = st; else out.v3broken = true;
      } catch (e) { out.v3broken = true; }
    }
    var raw2 = lsGet(FCV.SAVE_KEY); if (raw2) { try { out.v2 = safeParse(raw2); } catch (e) {} }
    var raw1 = lsGet(FCV.V1_KEY); if (raw1) { try { out.v1 = safeParse(raw1); } catch (e) {} }
    return out;
  };
  /* A backup before every migration, reset and import; the last five are kept. */
  S.backup = function (label, st) {
    if (st === undefined) { st = label; label = 'Backup'; }
    var body = typeof st === 'string' ? st : JSON.stringify(st);
    lsSet(BK + Date.now(), JSON.stringify({ label: label, at: Date.now(), data: body }));
    var keys = lsKeys().filter(function (k) { return k.indexOf(BK) === 0; }).sort();
    while (keys.length > 5) lsDel(keys.shift());
  };
  S.backups = function () { return lsKeys().filter(function (k) { return k.indexOf(BK) === 0; }).sort().map(function (k) { try { var b = safeParse(lsGet(k)); return { key: k, label: b.label, at: b.at, data: b.data }; } catch (e) { return null; } }).filter(Boolean); };
  S.readBackup = function () { var b = S.backups().pop(); try { return b ? safeParse(b.data) : null; } catch (e) { return null; } };

  /* ---------------- the Time Machine: ten local snapshots, three on the account ---------------- */
  function snapKeys() { return lsKeys().filter(function (k) { return k.indexOf(SNAP) === 0; }); }
  function dropOldestSnap() {
    var all = snapKeys().map(function (k) { try { return { k: k, at: safeParse(lsGet(k)).at || 0 }; } catch (e) { return { k: k, at: 0 }; } }).sort(function (a, b) { return a.at - b.at; });
    if (all.length) lsDel(all[0].k);
  }
  /* D2-m5: one count for every screen that sums up a save (What's new, the Time Machine, Load a save):
     acts done, act stamps (one per act mission), items learnt (answered right at least once) */
  S.tally = function (st) {
    var acts = 0; for (var n = 1; n <= 7; n++) if (FCV.actDone(st, n)) acts++;
    var stamps = Object.keys(st.acts || {}).filter(function (n) { return st.acts[n] && st.acts[n].stamp; }).length;
    var learnt = Object.keys(st.mem || {}).filter(function (id) { return st.mem[id] && st.mem[id].right > 0; }).length;
    return { acts: acts, stamps: stamps, learnt: learnt };
  };
  S.tallyText = function (t) { var pl = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); }; return pl(t.acts, 'act', 'acts') + ' done, ' + pl(t.stamps, 'act stamp', 'act stamps') + ', ' + pl(t.learnt, 'item', 'items') + ' learnt'; };
  function snapMeta(st, label) {
    var t = S.tally(st);
    var hash = null; try { hash = S.hash(st); } catch (e) {}
    return { label: label, at: Date.now(), acts: t.acts, stamps: t.stamps, learnt: t.learnt, hash: hash };
  }
  S.snapshot = function (st, label) {
    if (!st) return Promise.resolve(null);
    var meta = snapMeta(st, label || 'Snapshot'), json = JSON.stringify(slim(st));
    return S.zip(json).catch(function () { return null; }).then(function (z) {
      var body = Object.assign({}, meta, z ? { z: z } : { data: json });
      /* two rings: ten milestone slots, and five for restarts, so restarts never push out act closers */
      var base = /restart/i.test(meta.label) ? 10 : 0, size = base ? 5 : 10;
      var all = []; for (var i = base; i < base + size; i++) { var r = lsGet(SNAP + i); var at = 0; try { at = r ? safeParse(r).at : 0; } catch (e) {} all.push({ i: i, at: at }); }
      var empty = all.filter(function (x) { return !x.at; })[0], slot = empty ? empty.i : all.sort(function (a, b) { return a.at - b.at; })[0].i;
      lsSet(SNAP + slot, JSON.stringify(body));
      if (db && writer) {
        /* account slot 0 keeps the newest milestone (closers, badges, the viva, codes, resets); restarts, "The present"
           and the timed snapshots take turns in slots 1 and 2, so three restarts never push a milestone out */
        var acct;
        if (/restart|The present|Every 15 minutes|Methods mission/i.test(meta.label)) { acct = 1 + (st.snapRing2 || 0) % 2; st.snapRing2 = (st.snapRing2 || 0) + 1; }
        else acct = 0;
        db.doc(path('snap-' + acct)).set(body).catch(function () {});
      }
      return meta;
    });
  };
  S.snapshots = function () {
    var out = [];
    for (var i = 0; i < 15; i++) { var r = lsGet(SNAP + i); if (!r) continue; try { var b = safeParse(r); b.slot = i; b.where = 'device'; out.push(b); } catch (e) {} }
    return out.sort(function (a, b) { return b.at - a.at; });
  };
  S.accountSnapshots = function () {
    if (!db) return Promise.resolve([]);
    return Promise.all([0, 1, 2].map(function (i) { return db.doc(path('snap-' + i)).get().then(function (s) { if (!s.exists) return null; var b = Object.assign({}, s.data()); b.slot = i; b.where = 'account'; return b; }).catch(function () { return null; }); }))
      .then(function (l) { return l.filter(Boolean); });
  };
  S.readSnapshot = function (b) {
    var p = b.z ? S.unzip(b.z) : Promise.resolve(b.data);
    return p.then(function (json) { return S.upgrade(safeParse(json)); });
  };
  /* Boot never reaches a blank New Game while a valid snapshot exists. */
  S.newestValidSnapshot = function () {
    var list = S.snapshots(), i = 0;
    function next() {
      if (i >= list.length) return Promise.resolve(null);
      var b = list[i++];
      return S.readSnapshot(b).then(function (st) { return S.isValid(st) ? { st: st, at: b.at } : next(); }).catch(next);
    }
    return next();
  };

  /* ---------------- the host's storage: five documents ---------------- */
  function path(name) { return 'data/users/' + userId + '/' + name; }
  /* onLate(r): when the account answers after the 10 s boot wait, it is connected then and its save handed over to merge. */
  S.init = function (onLate) {
    var c = root.claude;
    if (!c || typeof c.use !== 'function') { dbState = 'absent'; emit(); return Promise.resolve(null); }
    var timedOut = false, timeout = new Promise(function (res) { setTimeout(function () { timedOut = true; res(null); }, 10000); });
    c.use('downloads').then(function (d) { downloads = d; }).catch(function () { downloads = null; });
    var both = Promise.all([c.use('db'), c.use('user')]);
    var connect = function (pair) {
      if (!pair || !pair[0] || !pair[1]) { dbState = 'absent'; emit(); return null; }
      return Promise.resolve(pair[1].id()).then(function (id) {
        if (!id) { dbState = 'absent'; emit(); return null; }
        db = pair[0]; userId = id; dbState = 'ready'; emit();
        return S.readDb();
      });
    };
    both.then(function (pair) { if (timedOut && !db && onLate) connect(pair).then(function (r) { onLate(r); }).catch(function () {}); }).catch(function () {});
    return Promise.race([both, timeout]).then(function (pair) { if (!pair) { dbState = 'absent'; emit(); return null; } return connect(pair); })
      .catch(function () { db = null; dbState = 'absent'; emit(); return null; });
  };
  function decodeDoc(d) {
    if (!d) return Promise.resolve(null);
    if (d.z) return S.unzip(d.z).then(safeParse);
    if (typeof d.data === 'string') return Promise.resolve(safeParse(d.data));
    return Promise.resolve(null);
  }
  /* Reads the v3 documents (or the v2 single document, for migration). Resolves {v3, v2} or null. */
  S.readDb = function () {
    if (!db) return Promise.resolve(null);
    var get = function (n) { return db.doc(path(n)).get().then(function (s) { return s && s.exists ? s.data() : null; }); };
    return Promise.all(['meta', 'progress', 'memory', 'viva', 'save'].map(get)).then(function (r) {
      var meta = r[0], out = { v3: null, v2: null, meta: meta };
      var jobs = [];
      if (meta && r[1]) {
        jobs.push(Promise.all([decodeDoc(r[1]), decodeDoc(r[2]), decodeDoc(r[3])]).then(function (p) {
          var st = S.join({ progress: p[0], memory: p[1], viva: p[2] }); st.savedAt = meta.savedAt || 0;
          lastRemoteSeen = Math.max(lastRemoteSeen, meta.savedAt || 0);
          if (meta.rev) Object.keys(meta.rev).forEach(function (k) { rev[k] = Math.max(rev[k] || 0, meta.rev[k] || 0); });
          if (S.isValid(st)) out.v3 = st;
        }).catch(function () {}));
      }
      if (r[4] && r[4].data) { try { out.v2 = safeParse(r[4].data); } catch (e) {} }
      return Promise.all(jobs).then(function () { lastDbRead = Date.now(); emit(); return out.v3 || out.v2 ? out : null; });
    }).catch(function () { return null; });
  };
  /* Two devices: a newer meta written by another device is merged in silently. */
  var unsubMeta = null, lastRemoteSeen = 0;
  /* Two devices: another device's write is news when it is newer than anything seen here, and also when its hash is not
     the one this device last wrote or read. A write that started before ours but landed after it carries an older time
     and can still have replaced our documents; it must be read, merged and, if ours holds more, written back over. */
  var lastSeenHash = null, lastPulled = null;
  function foreignNewer(m) {
    if (!m || m.device === S.deviceId()) return false;
    if ((m.savedAt || 0) > lastRemoteSeen) return true;
    var key = (m.savedAt || 0) + ':' + (m.hash || '');
    return !!(m.hash && m.hash !== lastSeenHash && key !== lastPulled);
  }
  /* the account's meta goes with the state, so the merge can tell when the account lacks something this device holds
     (its own copy then does not change, but it must be written back) */
  function pullRemote() {
    return S.readDb().then(function (r) {
      if (r && r.meta) { lastPulled = (r.meta.savedAt || 0) + ':' + (r.meta.hash || ''); lastSeenHash = r.meta.hash || lastSeenHash; }
      if (r && r.v3) remoteCbs.forEach(function (f) { try { f(r.v3, r.meta); } catch (e) {} });
      return r;
    });
  }
  S.watchRemote = function (getState) {
    if (!db || unsubMeta) return;
    try {
      unsubMeta = db.doc(path('meta')).onSnapshot(function (snap) {
        if (!snap || !snap.exists || snap.metadata && snap.metadata.hasPendingWrites) return;
        var m = snap.data(), st = getState();
        if (!st) return;
        if (!foreignNewer(m)) return;
        pullRemote();
      }, function () { unsubMeta = null; });
    } catch (e) {}
  };
  /* Before an account write: if another device saved since this tab last read, read it and merge first. */
  function precheck() {
    if (!db) return Promise.resolve();
    return db.doc(path('meta')).get().then(function (snap) {
      var m = snap && snap.exists ? snap.data() : null;
      if (foreignNewer(m)) return pullRemote();
    }).catch(function () {});
  }
  function encode(obj) {
    var json = JSON.stringify(obj);
    if (json.length <= 50000) return Promise.resolve({ data: json, h: h6(json) });
    return S.zip(json).then(function (z) { return { z: z, h: h6(json) }; }).catch(function () { return { data: json, h: h6(json) }; });
  }
  /* Write the changed documents one at a time, then read each back and compare savedAt and hash. */
  function writeDb(st) {
    var parts = S.split(st), at = st.savedAt, changed = [];
    /* viva first, then memory, then progress, then meta: a viva answer reaches the account in one round trip */
    return Promise.all(['viva', 'memory', 'progress'].map(function (d) { return encode(parts[d]).then(function (e) { return { d: d, e: e }; }); })).then(function (enc) {
      enc.forEach(function (x) { if (lastHash[x.d] !== x.e.h) changed.push(x); });
      var chain = Promise.resolve();
      changed.forEach(function (x) {
        chain = chain.then(function () {
          var body = Object.assign({ v: 3, savedAt: at, hash: x.e.h }, x.e.z ? { z: x.e.z } : { data: x.e.data });
          if ((body.z || body.data).length > 200000) throw { code: 'too_big' };
          return db.doc(path(x.d)).set(body).then(function () { return db.doc(path(x.d)).get(); }).then(function (snap) {
            var back = snap && snap.exists ? snap.data() : null;
            if (!back || back.savedAt !== at || back.hash !== x.e.h) throw { code: 'mismatch' };
            lastHash[x.d] = x.e.h; rev[x.d] = (rev[x.d] || 0) + 1;
          });
        });
      });
      return chain.then(function () {
        if (!changed.length) return;
        var meta = { v: 3, rev: rev, savedAt: at, device: S.deviceId(), hash: S.hash(st) };
        return db.doc(path('meta')).set(meta).then(function () { return db.doc(path('meta')).get(); }).then(function (snap) {
          var back = snap && snap.exists ? snap.data() : null; if (!back || back.savedAt !== at) throw { code: 'mismatch' };
          lastRemoteSeen = Math.max(lastRemoteSeen, at); lastSeenHash = meta.hash;
        });
      });
    });
  }

  /* ---------------- writing: local now, account coalesced and debounced 1.2 s ---------------- */
  var hold = false;
  /* QAD3-m4: the account write is due 1.2 s after the first unsent change (0.4 s for a film shot or a line reached) and a
     later change never pushes it back, so a tab closed soon after a line or shot resumes there on another device */
  var due = 0;
  function stopT() { clearTimeout(timer); timer = null; due = 0; }
  S.hold = function (v) { hold = !!v; if (hold) stopT(); };
  S.held = function () { return hold; };
  S.write = function (st, soon) {
    if (!st || !writer || hold) return;
    cur = st; st.savedAt = Date.now();
    writeLocal(st);
    if (!db) { setTick(localOk ? 'verified' : 'failed'); return; }
    setTick('saving');
    var wait = soon === true ? 400 : 1200, at = Date.now() + wait;
    if (due && due > Date.now() - 50 && due <= at) return;
    clearTimeout(timer); due = at; timer = setTimeout(function () { due = 0; S.flush(); }, wait);
  };
  S.flush = function () {
    stopT();
    if (!cur || !writer || hold) return Promise.resolve('none');
    if (!db) { cur.savedAt = cur.savedAt || Date.now(); writeLocal(cur); setTick(localOk ? 'verified' : 'failed'); return Promise.resolve(localOk ? 'device' : 'failed'); }
    if (flushing) { flushing.again = true; return flushing.p; }
    var me = { again: false }; flushing = me;
    me.p = precheck().then(function () { if (!writer || hold) throw { code: 'not_writer' }; stopT(); return writeDb(cur); }).then(function () {
      lastDbOk = Date.now(); retryN = 0; setTick('verified'); return 'account';
    }).catch(function (e) {
      var code = e && e.code;
      if (code === 'revoked' || code === 'invalid_argument' || code === 'not_granted' || code === 'capability_disabled') { db = null; dbState = 'absent'; setTick(localOk ? 'verified' : 'failed'); return 'device'; }
      if (code === 'not_writer') { emit(); return 'none'; }
      if (code === 'quota_exceeded' || code === 'too_big') { setTick('failed'); return 'failed'; }
      var waits = [1000, 4000, 15000]; lastHash = {};
      if (retryN < waits.length) { var w = waits[retryN++]; setTick('saving'); setTimeout(function () { S.flush(); }, w); }
      else { retryN = 0; setTick('failed'); }
      return 'retrying';
    }).then(function (r) { flushing = null; if (me.again) S.flush(); return r; });
    return me.p;
  };
  var forced = null;
  /* force: write this state even while writes are held (Kid drive closing the tab writes Dad's own save). */
  S.flushNow = function (st, force) {
    if (!writer || (hold && !force)) return Promise.resolve('none');
    st.savedAt = Date.now(); writeLocal(st);
    if (force) { forced = st; if (!db) return Promise.resolve('device'); return writeDb(st).then(function () { forced = null; return 'account'; }, function () { forced = null; return 'failed'; }); }
    cur = st; return S.flush();
  };
  S.writeAux = function (name, json) {
    lsSet('fcv-aux-' + name, json);
    if (!db) return Promise.resolve('local');
    return db.doc(path(name)).set({ data: json, savedAt: Date.now() }).then(function () { return 'account'; }).catch(function () { return 'local'; });
  };
  S.readAux = function (name) {
    var local = lsGet('fcv-aux-' + name);
    if (!db) return Promise.resolve(local);
    return db.doc(path(name)).get().then(function (snap) { return snap && snap.exists ? snap.data().data : local; }).catch(function () { return local; });
  };
  S.hasDb = function () { return !!db; };
  S.dbState = function () { return dbState; };
  S.downloads = function () { return downloads; };
  S.isWriter = function () { return writer; };
  /* "Saved to your account" rests on the last verified write (or a read that matched this device exactly), never on a
     plain read; while a retry is pending the line says so. */
  S.markVerified = function () { lastDbOk = Date.now(); emit(); };
  S.status = function () {
    var kind = db && dbState === 'ready' ? 'account' : localOk ? 'device' : 'none';
    return { kind: kind, tick: tick, at: kind === 'account' ? lastDbOk : lastLocalOk, local: lastLocalOk, account: lastDbOk, read: lastDbRead, writer: writer, pending: pendingW, retrying: retryN > 0 || tick === 'failed' };
  };

  /* ---------------- two tabs: one writer ---------------- */
  var bc = null, tabId = Math.random().toString(36).slice(2), onLost = null, onGained = null, queued = false;
  /* A tab that is not the writer queues a plain request, so it takes over (merging first) when the other tab closes. */
  function queueWait() {
    if (queued || !(root.navigator && navigator.locks && navigator.locks.request)) return;
    queued = true;
    navigator.locks.request('fcv3-writer', function () {
      queued = false; writer = true; emit(); if (onGained) { try { onGained(); } catch (e) {} }
      return new Promise(function () {});
    }).catch(function () { queued = false; if (writer) { writer = false; stopT(); emit(); if (onLost) onLost(); } queueWait(); });
  }
  /* 8 Nov (live, new link): the claude.ai viewer can run a second, hidden copy of the page that takes the lock first,
     so a single real tab was always covered. Every copy answers "who holds it?" and says whether a person has used it.
     A boot that finds the lock held asks first, and covers itself only when the holder is a copy someone has used. */
  var usedHere = false, who = null;
  try {
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { root.addEventListener(ev, function () { usedHere = true; }, { capture: true, passive: true }); });
    who = new BroadcastChannel('fcv3-who');
    who.onmessage = function (e) { var d = e.data || {}; if (d.q === 'who' && d.tab !== tabId && writer) { try { who.postMessage({ a: 'me', to: d.tab, used: usedHere }); } catch (x) {} } };
  } catch (e) { who = null; }
  S.holderInUse = function (ms) {
    if (!who) return Promise.resolve(true);
    return new Promise(function (res) {
      var done = false, used = false, prev = who.onmessage;
      var t = setTimeout(function () { finish(); }, ms || 1200);
      function finish() { if (done) return; done = true; clearTimeout(t); who.onmessage = prev; res(used); }
      who.onmessage = function (e) { var d = e.data || {}; if (d.a === 'me' && d.to === tabId && d.used) { used = true; finish(); } else if (prev) prev(e); };
      try { who.postMessage({ q: 'who', tab: tabId }); } catch (x) { finish(); }
    });
  };
  S.claimWriter = function (onLostCb, steal, onGainedCb) {
    onLost = onLostCb || onLost; onGained = onGainedCb || onGained;
    if (root.navigator && navigator.locks && navigator.locks.request) {
      /* AUDR3-08: until the lock answers, this tab does not write (boot no longer waits for the answer) */
      if (!steal) { writer = false; pendingW = true; emit(); }
      return new Promise(function (res) {
        var opts = steal ? { steal: true } : { ifAvailable: true };
        navigator.locks.request('fcv3-writer', opts, function (lock) {
          pendingW = false;
          if (!lock) { writer = false; emit(); res(false); queueWait(); return; }
          writer = true; emit(); res(true);
          return new Promise(function () {}); /* held for the life of the tab */
        }).catch(function () { writer = false; stopT(); emit(); if (onLost) onLost(); queueWait(); });
      });
    }
    try {
      bc = bc || new BroadcastChannel('fcv3-writer');
      bc.onmessage = function (e) { if (e.data && e.data.claim && e.data.tab !== tabId && writer) { writer = false; stopT(); emit(); if (onLost) onLost(); } };
      bc.postMessage({ claim: true, tab: tabId });
    } catch (e) {}
    writer = true; return Promise.resolve(true);
  };

  /* ---------------- save code: FCV3.<base64url(deflate-raw(JSON))>.<CRC-32> ---------------- */
  /* Memory in the code is columnar and keyed by registry index, so a full memory stays under 10 KB.
     ND1: the registry is append-only. Every id keeps the position it had on 0cc68c1 (the build on the link since 8 Nov) and
     new items only go on the end; an item that is no longer asked (trace-09) stays in it. tools/check_build.js refuses a
     build whose registry is anything else, or that reads a 0cc68c1 code differently. */
  var REGI = null, REGL = null;
  S.setRegistry = function (ids) { REGL = (ids || []).slice(); REGI = {}; REGL.forEach(function (id, i) { if (REGI[id] === undefined) REGI[id] = i; }); };
  S.registry = function () { return (REGL || []).slice(); };
  /* cb133ed (never on the link) left trace-09 out of its registry, so every later position in its codes is one lower. Its
     codes carry trace-09 by name among the unregistered records whenever the player had met it; such a code is read with
     that build's list. A code made from now on carries rn (the registry length when it was made) and is read as it is. */
  var CB133ED_DROPPED = 'trace-09';
  function codeList(c) {
    if (!REGL || c.rn) return REGL;
    var named = function (rows) { return Array.isArray(rows) && rows.some(function (x) { var id = Array.isArray(x) ? x[0] : x; return typeof id === 'string' && id.replace(/^(recall|say):/, '') === CB133ED_DROPPED; }); };
    if ((c.mem && !Array.isArray(c.mem) && named(c.mem.x)) || (c.met && !Array.isArray(c.met) && named(c.met.x))) return REGL.filter(function (id) { return id !== CB133ED_DROPPED; });
    return REGL;
  }
  var PFX = ['', 'recall:', 'say:'], LO = { '': 0, right: 1, wrong: 2, partly: 3 }, LOR = ['', 'right', 'wrong', 'partly'];
  function splitId(id) { for (var p = 2; p >= 1; p--) if (id.indexOf(PFX[p]) === 0 && REGI && REGI[id.slice(PFX[p].length)] !== undefined) return [REGI[id.slice(PFX[p].length)], p]; return REGI && REGI[id] !== undefined ? [REGI[id], 0] : null; }
  function packMemCode(mem) {
    var rows = Object.keys(mem || {}).map(function (id) { return { id: id, k: splitId(id), r: mem[id] }; });
    var reg = rows.filter(function (x) { return x.k; }).sort(function (a, b) { return a.k[0] - b.k[0] || a.k[1] - b.k[1]; }), other = rows.filter(function (x) { return !x.k; });
    /* QAD4-m4: 'a' carries each record's time made (at), delta-encoded like 'l'; codes made before it simply have none */
    var out = { i: [], p: '', b: '', l: [], a: [], s: [], r: [], w: [], q: [], f: '', pr: {}, x: [] }, prev = 0, prevL = 0, prevA = 0, anyA = false;
    reg.forEach(function (x, n) {
      var r = x.r; out.i.push(x.k[0] - prev); prev = x.k[0]; out.p += x.k[1]; out.b += Math.max(1, Math.min(5, r.box || 1));
      out.l.push((r.last || 0) - prevL); prevL = r.last || 0; out.a.push((r.at || 0) - prevA); prevA = r.at || 0; if (r.at) anyA = true; out.s.push(r.seen || 0); out.r.push(r.right || 0); out.w.push(r.wrong || 0); out.q.push(r.sureWrong || 0);
      out.f += ((r.firstRight ? 1 : 0) + (r.lastSure ? 2 : 0) + 4 * (LO[r.lastOutcome || ''] || 0)).toString(16);
      if (r.proofs && r.proofs.length) out.pr[n] = r.proofs; if (r.err) (out.e = out.e || {})[n] = r.err;
    });
    other.forEach(function (x) { out.x.push(packMem({ a: x.r }).map(function (row) { row[0] = x.id; return row; })[0]); });
    if (!anyA) delete out.a;
    return out;
  }
  function unpackMemCode(c, L) {
    if (Array.isArray(c)) return unpackMem(c);
    var mem = {}, idx = 0, last = 0, at = 0;
    (c.i || []).forEach(function (d, n) {
      idx += d; last += c.l[n]; if (c.a) at += +c.a[n] || 0; var id = PFX[+c.p[n]] + (L ? L[idx] : idx), f = parseInt(c.f[n], 16);
      mem[id] = { box: +c.b[n], last: last, seen: c.s[n], right: c.r[n], wrong: c.w[n], sureWrong: c.q[n], stamp: FCV.data && FCV.resolve(id) ? FCV.stamp(id) : '', firstRight: !!(f & 1), lastSure: !!(f & 2), proofs: (c.pr && c.pr[n]) || [], gen: 0, err: (c.e && c.e[n]) || '' };
      var lo = LOR[f >> 2]; if (lo) mem[id].lastOutcome = lo;
      if (at) mem[id].at = at;
    });
    var ox = unpackMem(c.x || []); Object.keys(ox).forEach(function (k) { mem[k] = ox[k]; });
    return mem;
  }
  function codeState(st) {
    var c = slim(st);
    delete c.timings; delete c.shiftLog; delete c.repairs; delete c.snapLabels; delete c.film; delete c.predictions; delete c.orphans; delete c.session; delete c.resume;
    c.mem = packMemCode(c.mem);
    var mi = [], mo = [], prev = 0; Object.keys(c.met || {}).map(function (id) { return REGI && REGI[id] !== undefined ? REGI[id] : id; }).forEach(function (k) { if (typeof k === 'number') mi.push(k); else mo.push(k); });
    mi.sort(function (a, b) { return a - b; }); c.met = { i: mi.map(function (k) { var d = k - prev; prev = k; return d; }), x: mo };
    if (c.viva && c.viva.results) c.viva.results = c.viva.results.slice(-30);
    c.exportedAt = st.savedAt || Date.now(); c.madeAt = Date.now();
    if (c.wr) { c.wr = { attempts: (c.wr.attempts || []).slice(-10), passes: c.wr.passes, streak3: c.wr.streak3, seen: c.wr.seen, answers: (c.wr.answers || []).slice(-150) }; }
    return c;
  }
  function fromCodeState(c) {
    var L = codeList(c); delete c.rn;
    if (c.mem && !Array.isArray(c.mem) && c.mem.i) c.mem = unpackMemCode(c.mem, L); else if (Array.isArray(c.mem)) c.mem = unpackMem(c.mem);
    if (c.met && c.met.i) { var m = {}, k = 0; c.met.i.forEach(function (d) { k += d; m[L ? L[k] : k] = 1; }); (c.met.x || []).forEach(function (id) { m[id] = 1; }); c.met = m; }
    else if (Array.isArray(c.met)) { var m2 = {}; c.met.forEach(function (id) { m2[id] = 1; }); c.met = m2; }
    return c;
  }
  S.exportCode = function (st) {
    var cs = codeState(st); if (REGL) cs.rn = REGL.length; /* ND1: made on an append-only registry (not part of the hash) */
    var bytes = new TextEncoder().encode(JSON.stringify(cs));
    return deflate(bytes).then(function (out) { var body = b64(out, true); return 'FCV3.' + body + '.' + crc32(new TextEncoder().encode(body)); });
  };
  function sum8v2(s) { return ('00000000' + FCV.hash32('fcv2|' + s).toString(16)).slice(-8); }
  S.importCode = function (code) {
    code = String(code || '').trim();
    /* words around the code are fine: pick out the first FCV3 or FCV2 token */
    var tok = /FCV[23]\.[A-Za-z0-9_\-\s]+?\.[0-9a-f]{8}(?![0-9a-f])/.exec(code);
    if (tok) code = tok[0];
    else if (!/^\s*[{\[]/.test(code)) return Promise.reject(new Error('Paste just the code, starting FCV3.'));
    code = code.replace(/\s+/g, '');
    if (code.length > 300000) return Promise.reject(new Error('too big'));
    var m3 = /^FCV3\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})$/.exec(code), m2 = /^FCV2\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})$/.exec(code);
    if (m3) {
      if (crc32(new TextEncoder().encode(m3[1])) !== m3[2]) return Promise.reject(new Error('damaged'));
      return inflate(unb64(m3[1])).then(function (b) { var s = safeParse(new TextDecoder().decode(b)); if (!s || typeof s !== 'object') throw new Error('damaged'); return S.upgrade(fromCodeState(s)); });
    }
    if (m2) {
      if (sum8v2(m2[1]) !== m2[2]) return Promise.reject(new Error('damaged'));
      var bytes = unb64(m2[1]);
      /* plain JSON first (most FCV2 codes), deflate second, so a failed inflate never reaches the console */
      var plain = null; try { plain = safeParse(new TextDecoder().decode(bytes)); } catch (e) { plain = null; }
      if (plain && typeof plain === 'object') return Promise.resolve(S.upgrade(plain));
      return inflate(bytes).then(function (b) { return S.upgrade(safeParse(new TextDecoder().decode(b))); });
    }
    return Promise.reject(new Error('damaged'));
  };
  S.importFile = function (text) {
    if (String(text).length > 300000) return Promise.reject(new Error('too big'));
    try { var s = safeParse(text); if (s && s.code) return S.importCode(s.code); if (s && (s.save || s.acts)) return Promise.resolve(S.upgrade(s.save || s)); return Promise.reject(new Error('damaged')); }
    catch (e) { return S.importCode(text); }
  };
  S.fileName = function () { return 'freight-city-viva-save-' + FCV.today() + '.json'; };
  S.saveFile = function (st) {
    return S.exportCode(st).then(function (code) {
      var body = JSON.stringify({ game: 'Freight City Viva', version: 3, saved: new Date().toISOString(), code: code });
      if (downloads) return downloads.save({ filename: S.fileName(), data: body }).then(function () { return 'saved'; });
      return Promise.reject({ code: 'unavailable' });
    });
  };
  /* Test my save: round-trip through the code in memory; writes nothing. */
  S.testMySave = function (st) {
    var before = S.hash(st);
    return S.exportCode(st).then(function (code) { return S.importCode(code).then(function (back) {
      back.savedAt = st.savedAt;
      var n = 0, ok = true;
      Object.keys(st.acts || {}).forEach(function (a) { (st.acts[a].done || []).forEach(function (sid) { n++; if (!back.acts[a] || back.acts[a].done.indexOf(sid) < 0) ok = false; }); });
      Object.keys(st.mem || {}).forEach(function (id) { n++; var x = st.mem[id], y = back.mem[id]; if (!y || y.box !== x.box || y.seen !== x.seen || (x.stamp && y.stamp !== x.stamp)) ok = false; });
      Object.keys(st.rooms || {}).forEach(function (r) { n++; if (!back.rooms[r] || !!back.rooms[r].badge !== !!st.rooms[r].badge) ok = false; });
      Object.keys((st.viva || {}).seen || {}).forEach(function (q) { n++; if (!back.viva.seen[q]) ok = false; });
      return { ok: ok, n: n, bytes: code.length, hashBefore: before, code: code };
    }); });
  };
  /* D2-m3: the viva best in words (none is a pass with no corrections, not "never passed") */
  var BEST_WORDS = { none: 'Pass with no corrections', minor: 'Pass with minor corrections', major: 'Pass with major corrections', fail: 'Not awarded' };
  S.summary = function (st) {
    var fmt = function (t) { return new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
    var att = (st.viva && st.viva.attempt) || 0, best = st.viva && st.viva.best;
    var pl = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); };
    /* D2-m4: "last played" is the last save; a code or file also says when it was made */
    var lp = st.savedAt || st.exportedAt, played = lp ? 'last played ' + fmt(lp) : 'last played: not recorded';
    var made = st.madeAt && Math.abs(st.madeAt - (lp || 0)) > 60000 ? ', code made ' + fmt(st.madeAt) : '';
    return S.tallyText(S.tally(st)) + ', viva best: ' + (best ? (BEST_WORDS[best] || best) : 'not tried yet') + ', ' + pl(att, 'attempt', 'attempts') + ', ' + played + made;
  };
  S.wipeLocal = function () { DOCS.concat(['meta']).forEach(function (d) { lsDel(K + ':' + d); }); };
  S.retireOld = function () {
    var raw1 = lsGet(FCV.V1_KEY), raw2 = lsGet(FCV.SAVE_KEY);
    if (raw1) { if (!lsGet('freight-city-viva-backup-v1')) lsSet('freight-city-viva-backup-v1', raw1); lsDel(FCV.V1_KEY); }
    if (raw2) { if (!lsGet('freight-city-viva-backup-v2')) lsSet('freight-city-viva-backup-v2', raw2); lsDel(FCV.SAVE_KEY); }
  };
  S._setDbForTest = function (fake, id) { db = fake; userId = id || 'test'; dbState = fake ? 'ready' : 'absent'; lastHash = {}; emit(); };

  root.Save = S;
  if (typeof module !== 'undefined' && module.exports) module.exports = S;
})(typeof window !== 'undefined' ? window : globalThis);
