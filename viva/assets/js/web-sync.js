/* khaleds.blog only (not part of the game's own build): progress sync between devices. Round 7.
   The rule, case by case, is site_blog/SYNC_TABLE.txt. In short:
   - A device's save reaches the account only as ONE commit (meta and every changed part together), and the account takes
     it only if it still holds the copy this save is known to include: the device's own last commit, or the account's
     current copy read whole and merged. Which copy that is depends on what the account holds now, never on save times or
     clocks. A copy not known is read first; a copy not included is merged by the game, which then saves again.
   - The game's save layer (assets/js/save.js) talks to this file as it talked to the claude.ai artifact's db:
       claude.use('db') -> { doc(path) -> { get(), set(obj), onSnapshot(cb, err) } }, claude.use('user') -> { id() },
       claude.use('downloads') -> { save({filename, data}) }.  Its part writes are held and sent with its meta write.
     Reads always go to the account (reads made together go as one request, so they come from one consistent copy); the only
     exception is the read the game makes straight after its own write to check it.
   - When the page is hidden or closed, the device's save is PARKED on the account under its own device name (never over
     anyone's save), compressed at that moment with fflate when big, and committed too when its base is known. Every device
     merges parked saves when it opens and when it checks for news; a parked save is removed once the account includes it.
   - Without a code, use('db') answers null and the game saves on this device only, as before.
   Must load before the game boots (it is placed before core.js, after fflate.js). */
(function (root) {
  'use strict';
  var API = 'https://fcv-sync.vercel.app/api/sync';
  var KEY = 'fcv-sync-code';
  var LOCAL = 'freight-city-viva-v3';          /* save.js's device copy: :progress :memory :viva :meta */
  var PARTS = ['progress', 'memory', 'viva'];
  var POLL = 30000;
  var KEEPALIVE_MAX = 60000;                   /* browsers cap what a closing page may still send at 64 KB */
  var ZIP_OVER = 1000;                         /* parts longer than this are compressed (fflate) when a page closes */
  var ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  function norm(c) {
    c = String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (c.length !== 16) return null;
    for (var i = 0; i < 16; i++) if (ALPHABET.indexOf(c[i]) < 0) return null;
    return c.match(/.{4}/g).join('-');
  }
  function lsGet(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { root.localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  /* a code that arrives in the address (the "open on another device" link) is kept, then taken out of the address bar */
  var m = /[#&]sync=([0-9A-Za-z-]{16,24})/.exec(root.location.hash || '');
  if (m && norm(m[1])) {
    lsSet(KEY, norm(m[1]));
    try { root.history.replaceState(null, '', root.location.pathname + root.location.search); } catch (e) {}
  }
  var code = norm(lsGet(KEY));
  var status = { state: code ? 'on' : 'off', lastOk: 0 };

  /* a short trace on the device (last 40 steps), so what happened as a page closed can be read when it reopens */
  function trace(what) {
    try {
      var l = JSON.parse(root.localStorage.getItem('fcv-sync-trace') || '[]');
      l.push(new Date().toISOString().slice(11, 23) + ' ' + what);
      if (l.length > 40) l = l.slice(-40);
      root.localStorage.setItem('fcv-sync-trace', JSON.stringify(l));
    } catch (e) {}
  }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function snap(data) { return { exists: data != null, data: function () { return clone(data); }, metadata: { hasPendingWrites: false } }; }
  function nameOf(path) { var p = String(path).split('/'); return p[p.length - 1]; }
  function metaKey(meta) { return meta ? meta.savedAt + ':' + meta.hash : 'none'; }
  function h6(str) { return ('000000' + root.FCV.hash32('fcv3|' + str).toString(36)).slice(-6); }

  /* ---------------- transport: simple POSTs (no preflight), so a closing page can still send one ---------------- */
  function post(body, keepalive) {
    if (status.state === 'unknown') return Promise.reject({ code: 'revoked' });
    body.c = code;
    var text = JSON.stringify(body);
    var opts = { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: text };
    if (keepalive && text.length < KEEPALIVE_MAX) opts.keepalive = true;
    return root.fetch(API, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok) {
          var wasOffline = status.state === 'offline';
          status.lastOk = Date.now(); if (status.state !== 'unknown') status.state = 'on';
          if (wasOffline) backOnline();
          return j;
        }
        if (j.code === 'unknown_code') { status.state = 'unknown'; label(); throw { code: 'revoked' }; }
        if (j.code === 'too_big') throw { code: 'too_big' };
        throw { code: 'unavailable', status: r.status };
      });
    }, function () { status.state = 'offline'; throw { code: 'unavailable' }; });
  }

  /* ---------------- what this device knows about the account ---------------- */
  var lastAccount;            /* the account's meta at this device's latest read or commit: metaKey, 'none', or undefined */
  var mine = null;            /* this device's last commit: { meta, parts: {name: doc} } */
  var copies = [];            /* whole account copies read (meta + three parts), decoded: { meta, parts, state, ready } */
  var parks = {};             /* parked saves read: dev -> { savedAt, state } (kept to merge and to remove when included) */
  function decodeDoc(d) {
    if (!d) return Promise.resolve(null);
    if (d.z) return root.Save.unzip(d.z).then(JSON.parse);
    if (typeof d.data === 'string') return Promise.resolve(JSON.parse(d.data));
    return Promise.resolve(null);
  }
  function stateOf(parts, meta) {
    return Promise.all(PARTS.map(function (p) { return decodeDoc(parts[p]); })).then(function (dec) {
      if (dec.some(function (x) { return x == null; })) return null;
      var st = root.Save.join({ progress: dec[0], memory: dec[1], viva: dec[2] });
      st.savedAt = meta.savedAt;
      return root.Save.isValid(st) ? st : null;
    }).catch(function () { return null; });
  }
  function remember(docs) {
    if (!('meta' in docs)) return null;
    lastAccount = metaKey(docs.meta);
    if (!docs.meta || !PARTS.every(function (p) { return docs[p]; })) return null;
    var meta = docs.meta, key = metaKey(meta);
    var have = copies.filter(function (c) { return metaKey(c.meta) === key; })[0];
    if (have) return have;
    var parts = {};
    PARTS.forEach(function (p) { parts[p] = docs[p]; });
    var entry = { meta: meta, parts: parts, state: null, ready: null };
    entry.ready = stateOf(parts, meta).then(function (st) { entry.state = st; if (st) tidyParks(st); return entry; });
    copies.unshift(entry);
    if (copies.length > 6) copies.length = 6;
    return entry;
  }
  /* does `local` include `remote`? merging remote into local changes nothing but the play time */
  function includes(local, remote) {
    try {
      var merged = root.Save.validate(root.Save.merge(clone(local), clone(remote)));
      return root.Save.hash(Object.assign({}, merged, { played: local.played })) === root.Save.hash(local);
    } catch (e) { return false; }
  }
  function copyFor(key) { return copies.filter(function (c) { return metaKey(c.meta) === key; })[0] || null; }
  /* read the account's whole current copy now (one request) */
  function fetchWhole() {
    return post({ op: 'read', names: ['meta'].concat(PARTS) }).then(function (j) {
      var e = remember(j.docs || {});
      return e ? e.ready : null;
    });
  }
  /* the game merges an account copy or a parked save into its own (the game's own merge); not during Kid drive, when the
     game holds other saves back itself */
  function askMerge(state, why) {
    var g = root.Game;
    if (!g || !g.state || !g.mergeRemote || g.kidDrive || !state) return false;
    trace('merge ' + why);
    try { g.mergeRemote({ v3: clone(state) }); return true; } catch (e) { trace('merge failed ' + (e && e.message)); return false; }
  }
  /* which account copy this save may replace, by what the account holds NOW (never by save times or clocks):
     its own last commit; or the current account copy if the save includes it; nothing yet if the account is empty.
     Not known: read it first. Not included: the game merges it, and the commit waits for the next save. */
  function baseNow(localState) {
    if (lastAccount === 'none') return { meta: null, parts: {} };
    if (mine && lastAccount === metaKey(mine.meta)) return { meta: mine.meta, parts: mine.parts };
    var c = lastAccount ? copyFor(lastAccount) : null;
    if (c && c.state && localState && includes(localState, c.state)) return { meta: c.meta, parts: c.parts };
    return null;
  }
  function baseFor(localState) {
    var b = baseNow(localState);
    if (b) return Promise.resolve(b);
    var c = lastAccount && lastAccount !== 'none' ? copyFor(lastAccount) : null;
    return (c && c.state ? Promise.resolve(c) : fetchWhole()).then(function (c2) {
      b = baseNow(localState);
      if (b) return b;
      c2 = lastAccount && lastAccount !== 'none' ? copyFor(lastAccount) : null;
      if (c2 && c2.state) askMerge(c2.state, 'account ' + lastAccount);
      return null;
    });
  }
  function send(metaDoc, fullParts, base, keepalive) {
    var docs = { meta: metaDoc };
    PARTS.forEach(function (p) { if (fullParts[p] && (!base.parts[p] || base.parts[p].hash !== fullParts[p].hash)) docs[p] = fullParts[p]; });
    var expect = base.meta ? { savedAt: base.meta.savedAt, hash: base.meta.hash } : null;
    trace('commit ' + metaKey(metaDoc) + ' parts=' + Object.keys(docs).join(',') + ' expect=' + (expect ? metaKey(expect) : 'none') + (keepalive ? ' keepalive' : ''));
    return post({ op: 'commit', docs: docs, expect: expect }, keepalive);
  }
  function committed(metaDoc, fullParts, state) {
    mine = { meta: clone(metaDoc), parts: fullParts };
    lastAccount = metaKey(metaDoc);
    if (state) tidyParks(state);
  }
  /* the game's own commit */
  function commit(metaDoc, fullParts, localState) {
    return baseFor(localState).then(function (base) {
      if (!base) { trace('commit ' + metaKey(metaDoc) + ' waits: account copy not included yet'); throw { code: 'conflict' }; }
      return send(metaDoc, fullParts, base, false).then(function (j) {
        if (j.ok) { trace('commit ' + metaKey(metaDoc) + ' ok'); committed(metaDoc, fullParts, localState); return 'sent'; }
        trace('commit ' + metaKey(metaDoc) + ' refused: the account moved on');
        return fetchWhole().catch(function () {}).then(function () { throw { code: 'conflict' }; });
      });
    });
  }
  /* parked saves: merge them in, and remove each once the ACCOUNT includes it: called only with a state the account holds
     (this device's commit that just landed, or a whole account copy read from the service) */
  function tidyParks(state) {
    /* (round 7, QSYNC6-01, row A8) a covered second tab never removes a parked save; the writer tab or another device does */
    if (root.Save && root.Save.isWriter && !root.Save.isWriter()) return;
    Object.keys(parks).forEach(function (dev) {
      var p = parks[dev];
      if (!p.state || p.removing || !includes(state, p.state)) return;
      p.removing = true;
      post({ op: 'unpark', dev: dev, savedAt: p.savedAt }).then(function (j) { trace('unpark ' + dev + ' ' + (j.result || '')); delete parks[dev]; }, function () { p.removing = false; });
    });
  }
  var parksBusy = false;
  function readParks() {
    if (parksBusy) return Promise.resolve();
    parksBusy = true;
    return post({ op: 'parks' }).then(function (j) {
      var got = j.parked || {};
      return Promise.all(Object.keys(got).map(function (dev) {
        var d = got[dev], savedAt = d && d.meta && d.meta.savedAt;
        if (!savedAt) return null;
        if (parks[dev] && parks[dev].savedAt === savedAt && parks[dev].state) return null;
        return stateOf(d, d.meta).then(function (st) { parks[dev] = { savedAt: savedAt, state: st, merged: false }; });
      }));
    }).then(function () {
      Object.keys(parks).forEach(function (dev) {
        var p = parks[dev];
        if (p.state && !p.merged && askMerge(p.state, 'parked save of ' + dev)) p.merged = true;
      });
      /* (round 5, QSYNC4-01) a parked save is NOT removed here: merging it into this page's memory is not the account
         holding it. It is removed only by tidyParks after this device's commit lands, or when a whole account copy read
         from the service includes it. */
    }).catch(function () {}).then(function () { parksBusy = false; });
  }
  function newParks(parked) {
    var own = root.Save && root.Save.deviceId ? root.Save.deviceId() : '';
    return Object.keys(parked || {}).some(function (dev) {
      var p = parks[dev];
      return !p || p.savedAt !== parked[dev].savedAt || (!p.merged && dev !== own);
    });
  }

  /* ---------------- the store the game uses ---------------- */
  var queue = null;
  function read(name) {
    return new Promise(function (resolve, reject) {
      if (!queue) { queue = { names: [], waiters: [] }; Promise.resolve().then(flushReads); }
      if (queue.names.indexOf(name) < 0) queue.names.push(name);
      queue.waiters.push({ name: name, resolve: resolve, reject: reject });
    });
  }
  function flushReads() {
    var q = queue; queue = null;
    post({ op: 'read', names: q.names.slice() }).then(function (j) {
      var docs = j.docs || {};
      remember(docs);
      q.waiters.forEach(function (w) { w.resolve(docs[w.name] == null ? null : docs[w.name]); });
    }, function (e) { q.waiters.forEach(function (w) { w.reject(e); }); });
  }
  var pending = {}, justWrote = {};
  function makeDb() {
    function doc(path) {
      var name = nameOf(path);
      return {
        get: function () {
          if (justWrote[name]) { var d = justWrote[name]; delete justWrote[name]; return Promise.resolve(snap(d)); }
          return read(name).then(snap);
        },
        set: function (obj) {
          var copy = clone(obj);
          if (PARTS.indexOf(name) >= 0) {
            pending[name] = copy;
            justWrote[name] = copy; setTimeout(function () { if (justWrote[name] === copy) delete justWrote[name]; }, 0);
            return Promise.resolve();
          }
          if (name === 'meta') {
            var held = pending; pending = {};
            var full = {};
            PARTS.forEach(function (p) { full[p] = held[p] || (mine && mine.parts[p]) || null; });
            var whole = PARTS.every(function (p) { return full[p]; });
            return (whole ? stateOf(full, copy) : Promise.resolve(null)).then(function (st) {
              return commit(copy, full, st);
            }).then(function () {
              justWrote.meta = copy; setTimeout(function () { if (justWrote.meta === copy) delete justWrote.meta; }, 0);
            });
          }
          return post({ op: 'set', n: name, doc: copy }).then(function () {});
        },
        onSnapshot: function (cb, onErr) {
          var last = null, stopped = false, timer = null, busy = false;
          function check() {
            if (stopped || busy) return;
            if (root.document.visibilityState === 'hidden') return;
            busy = true;
            post({ op: 'poll' }).then(function (j) {
              busy = false;
              var d = j.meta || null;
              lastAccount = metaKey(d);
              var s = JSON.stringify(d);
              if (s !== last) { last = s; try { cb(snap(d)); } catch (e) {} }
              if (newParks(j.parked)) readParks();
            }, function (e) {
              busy = false;
              if (e && e.code === 'revoked') { stop(); if (onErr) try { onErr(e); } catch (x) {} }
            });
          }
          function onVis() { if (root.document.visibilityState === 'visible') check(); }
          function stop() {
            stopped = true; clearInterval(timer); clearInterval(quick);
            root.document.removeEventListener('visibilitychange', onVis);
            root.removeEventListener('focus', check); root.removeEventListener('online', check);
          }
          timer = setInterval(check, POLL);
          /* while the service cannot be reached, look every 5 s, so the device sends as soon as it answers again */
          var quick = setInterval(function () { if (status.state === 'offline') check(); }, 5000);
          var stopQuick = function () { clearInterval(quick); };
          root.addEventListener('pagehide', stopQuick);
          root.document.addEventListener('visibilitychange', onVis);
          root.addEventListener('focus', check); root.addEventListener('online', check);
          check();
          return stop;
        }
      };
    }
    return { doc: doc };
  }

  /* ---------------- the device's own copy, as a commit and a parked save (hidden or closed page; after opening) ------- */
  function b64(bytes) { var s = '', CH = 0x8000; for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH)); return btoa(s); }
  function zipNow(str) {
    try { return root.fflate && root.fflate.deflateSync ? b64(root.fflate.deflateSync(new TextEncoder().encode(str), { level: 6 })) : null; } catch (e) { return null; }
  }
  function localCopy() {
    var metaRaw = lsGet(LOCAL + ':meta');
    if (!metaRaw || !root.FCV || !root.FCV.hash32 || !root.Save) return null;
    var meta;
    try { meta = JSON.parse(metaRaw); } catch (e) { return null; }
    if (!meta || !meta.savedAt || !meta.hash) return null;
    var parts = {}, dec = {};
    for (var i = 0; i < PARTS.length; i++) {
      var p = PARTS[i], str = lsGet(LOCAL + ':' + p);
      if (str == null) return null;
      var h = h6(str), z = str.length > ZIP_OVER ? zipNow(str) : null;
      parts[p] = z ? { v: 3, savedAt: meta.savedAt, hash: h, z: z } : { v: 3, savedAt: meta.savedAt, hash: h, data: str };
      try { dec[p] = JSON.parse(str); } catch (e) { return null; }
    }
    var st = root.Save.join(dec); st.savedAt = meta.savedAt;
    return { meta: { v: 3, rev: meta.rev || {}, savedAt: meta.savedAt, device: meta.device, hash: meta.hash }, parts: parts, state: st };
  }
  /* when the service answers again after failing, the device's copy goes up straight away (not at the game's next save) */
  var recoverTimer = null;
  function backOnline() {
    trace('service answers again');
    clearTimeout(recoverTimer);
    recoverTimer = setTimeout(function () { if (root.Game && root.Game.state) push(false); }, 800);
  }
  var closingHash = null;
  function push(closing) {
    if (!code || status.state === 'unknown') return Promise.resolve('skip');
    /* (round 6, QSYNC5-01, row A8) only the tab that holds the game's save lock writes; a covered second tab on the same
       device never sends (the writer tab sends the same device copy) */
    if (root.Save && root.Save.isWriter && !root.Save.isWriter()) { trace('push skipped: not the writer tab'); return Promise.resolve('not writer'); }
    var c;
    try { c = localCopy(); } catch (e) { c = null; trace('push: device copy unreadable ' + (e && e.message)); }
    trace('push' + (closing ? ' (closing)' : '') + ': device ' + (c ? metaKey(c.meta) : 'none') + ', mine ' + (mine ? metaKey(mine.meta) : 'none') + ', account ' + lastAccount);
    if (!c) return Promise.resolve('none');
    if (mine && mine.meta.hash === c.meta.hash) return Promise.resolve('same');
    var acc = lastAccount && lastAccount !== 'none' ? copyFor(lastAccount) : null;
    if (acc && acc.meta.hash === c.meta.hash) return Promise.resolve('same');
    if (closing) {
      /* ONE request that survives the page closing: the service commits the whole save if the account still holds the
         copy it is known to include, and otherwise parks it (never over anyone's save). Hidden and close events often
         come together: the same save is sent once. */
      if (closingHash === c.meta.hash) return Promise.resolve('sent before');
      closingHash = c.meta.hash;
      var b = baseNow(c.state);
      var expect = !b ? 'unknown' : b.meta ? { savedAt: b.meta.savedAt, hash: b.meta.hash } : null;
      var body = { op: 'close', dev: root.Save.deviceId(), docs: { meta: c.meta, progress: c.parts.progress, memory: c.parts.memory, viva: c.parts.viva }, expect: expect };
      trace('close ' + metaKey(c.meta) + ' ~' + Math.round(JSON.stringify(body).length / 1000) + ' KB expect=' + (expect === 'unknown' ? 'unknown' : expect ? metaKey(expect) : 'none'));
      return post(body, true).then(function (j) {
        trace('close ' + (j.result || '?'));
        if (j.result === 'committed') committed(c.meta, c.parts, c.state);
        return j.result || 'failed';
      }, function () { closingHash = null; trace('close failed'); return 'failed'; });
    }
    return baseFor(c.state).then(function (b2) {
      if (!b2) { trace('push: commit waits (account copy not included yet)'); return 'waits'; }
      return send(c.meta, c.parts, b2, false).then(function (j) {
        if (j.ok) { trace('commit ' + metaKey(c.meta) + ' ok'); committed(c.meta, c.parts, c.state); return 'sent'; }
        trace('commit ' + metaKey(c.meta) + ' refused'); return fetchWhole().catch(function () {}).then(function () { return 'conflict'; });
      });
    }).catch(function () { return 'failed'; });
  }
  root.FCVSyncPush = push;

  /* the code is checked once, before the game is handed the store (one request); an unknown code: the game saves on this
     device only. A device holding progress that starts an empty code commits it before the game reads the account.
     Opened while the service cannot be reached: the store is handed over all the same, and the first commit reads the
     account before it decides (round 4). */
  var db = code ? makeDb() : null;
  var ready = null;
  function dbReady() {
    if (!db) return Promise.resolve(null);
    if (!ready) ready = post({ op: 'read', names: ['meta'] }).then(function (j) {
      var docs = j.docs || {};
      remember(docs);
      if (docs.meta) return db;
      return push(false).then(function () { return db; });
    }, function (e) { return e && e.code === 'revoked' ? null : db; }).then(function (d) {
      label();
      if (d) afterBoot();
      return d;
    });
    return ready;
  }
  /* after the game has opened and merged the account: merge parked saves, then send this device's copy once */
  function afterBoot() {
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      var g = root.Game;
      if ((g && g.state && root.Save && root.Save.dbState && root.Save.dbState() === 'ready') || tries > 60) {
        clearInterval(t);
        readParks().then(function () { setTimeout(function () { push(false); }, 2500); });
      }
    }, 500);
  }
  var user = code ? { id: function () { return Promise.resolve('sync-' + code.slice(0, 4).toLowerCase()); } } : null;
  var downloads = {
    save: function (o) {
      return new Promise(function (resolve, reject) {
        try {
          var blob = new Blob([o.data], { type: 'application/json' });
          var a = root.document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = o.filename || 'freight-city-viva-save.json';
          a.rel = 'noopener'; a.style.display = 'none';
          root.document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); resolve(); }, 1500);
        } catch (e) { reject({ code: 'unavailable' }); }
      });
    }
  };
  root.claude = {
    use: function (name) {
      if (name === 'db') return dbReady();
      if (name === 'user') return dbReady().then(function (d) { return d ? user : null; });
      if (name === 'downloads') return Promise.resolve(downloads);
      return Promise.resolve(null);
    }
  };
  root.FCVSync = {
    code: function () { return code; },
    status: function () { return { state: status.state, lastOk: status.lastOk }; },
    debug: function () { return { lastAccount: lastAccount, mine: mine && metaKey(mine.meta), copies: copies.map(function (c) { return metaKey(c.meta) + (c.state ? '' : ' (decoding)'); }), parks: Object.keys(parks).map(function (d) { return d + ':' + parks[d].savedAt + (parks[d].merged ? ' merged' : ''); }) }; }
  };

  /* a small "Sync" button on the title screen only, bottom left, that opens sync.html */
  function chip() {
    var t = root.document.getElementById('title');
    if (!t) return;
    var b = root.document.createElement('a');
    b.id = 'webSyncChip'; b.href = 'sync.html';
    /* inside the title screen (a fixed layer at z-index 85), so it shows and hides with it and nothing covers it */
    b.style.cssText = 'position:absolute;left:calc(12px + env(safe-area-inset-left,0px));bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:3;' +
      'font:700 14px/1 "Atkinson Hyperlegible",system-ui,sans-serif;color:#15101f;' +
      'padding:12px 14px;border-radius:999px;text-decoration:none;border:2px solid #000;box-shadow:0 3px 0 #000';
    t.appendChild(b);
    label();
  }
  function label() {
    var b = root.document.getElementById('webSyncChip');
    if (!b) return;
    var bad = status.state === 'unknown';
    b.textContent = !code ? 'Sync: off · set up' : bad ? 'Sync: code not recognised' : 'Sync: on';
    b.setAttribute('aria-label', !code ? 'Sync between devices is off. Set it up' : bad ? 'Sync code not recognised. Open sync settings' : 'Sync between devices is on. Open sync settings');
    b.style.background = !code ? '#ffd166' : bad ? '#ff3d8b' : '#19c2b0';
  }
  /* registered after the game's own scripts ran, so the game's hidden/close handlers (which write the device copy) go first */
  function onLoaded() {
    chip();
    if (!code) return;
    root.document.addEventListener('visibilitychange', function () { if (root.document.visibilityState === 'hidden') push(true); });
    root.addEventListener('pagehide', function () { push(true); });
  }
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', onLoaded); else onLoaded();
})(window);
