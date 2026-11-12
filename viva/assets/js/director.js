/* Freight City Viva v3: the Cutscene Director. Plays v3 shot lists (and v2's) by the film rules: a shot lasts the
   longest of its video, its voice plus 0.6 s, the card's reading time and 3 s; videos hold their last frame and never loop;
   a Carry on chevron between beats; seen films play core shots unless Full; Skip applies the end state; captions on a scrim
   with the speaker's colour and shape; Docket peeks in family mode; the shot is saved so a closed tab resumes there. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return UI.esc(s); };
  var D = { reg: {} };
  var ST = function () { return window.Game && Game.state; };
  var SET = function () { return (ST() && ST().settings) || FCV.defaultSettings(); };
  var SC = function () { return FCV.data.script; };
  var SPK = { marigold: ['#ffd166', '◆'], vera: ['#ff8a3d', '●'], dr_tally: ['#19c2b0', '■'], prof_kerbstone: ['#b48cff', '▲'], animal: ['#c9a46a', '⬣'], you: ['#fff3e0', '○'] };
  function spk(who) { return SPK[who] || ['#ff9ec7', '★']; }
  /* Paths like "finale.endings[pass_high].cutscene[0]" or "acts[5].opening_cutscene". */
  /* a shot's own id: its shot number when it has one, else its words */
  function shotKey(s) { return s ? String(s.shot || s.id || ((s.title || '') + '|' + (s.subtitle || '')).slice(0, 80)) : ''; }
  D.path = function (p) {
    var o = SC(), parts = String(p).replace(/^script\./, '').match(/[^.\[\]]+/g) || [];
    for (var i = 0; i < parts.length && o != null; i++) {
      var k = parts[i];
      if (Array.isArray(o) && !/^\d+$/.test(k)) { o = o.filter(function (x) { return x && (x.id === k || x.ending === k || x.name === k); })[0]; continue; }
      o = o[k];
    }
    return o;
  };
  function textOf(v) { if (v == null) return ''; if (typeof v === 'string') return v; return v.line || v.subtitle || v.text || ''; }
  function words(t) { return String(t || '').split(/\s+/).filter(Boolean).length; }
  function readMs(sh) {
    var w = words(sh.subtitle), facts = Array.isArray(sh.fact) ? sh.fact : sh.fact ? [sh.fact] : [];
    facts.forEach(function (f) { var r = FCV.resolve(f); if (r) w += words((r.figure || '') + ' ' + (r.text || r.q || r.question || '')); });
    var ms = w ? 2500 + 250 * w : 0;
    /* family mode: a fact card holds at most 12 s (the card stays in the Notebook) */
    try { if (facts.length && window.Game && Game.state && Game.state.settings.family) ms = Math.min(ms, 12000); } catch (e) {}
    return ms;
  }
  /* Normalise a shot: resolve subtitle_from and path voices, keep v2 fields. */
  function norm(sh) {
    var s = Object.assign({}, sh);
    if (s.subtitle_from && !s.subtitle) { var v = D.path(s.subtitle_from.replace(/\s*\(.*\)$/, '')); s.subtitle = textOf(v); if (v && v.who && !s.speaker) s.speaker = v.who; }
    if (s.voice && /[.\[]/.test(s.voice)) { var vp = s.voice.replace(/^script\./, '').replace(/\s*\(.*\)$/, ''), vv = D.path(vp); if (!s.subtitle) s.subtitle = textOf(vv); s.voice = vp; }
    if (!s.voice && typeof s.fact === 'string' && /^link-[1-5]$/.test(s.fact)) { s.voice = s.fact; s.speaker = s.speaker || 'marigold'; }
    if (!s.visual) s.visual = {};
    return s;
  }
  /* Shots the build cannot draw: the Parade becomes a real sequence (the opener clip, then the cast in alphabetical
     order, each with what they taught); a "lines" shot becomes one shot per voiced line; any other shot whose picture
     does not resolve and that carries nothing to read is dropped, so a stage direction never shows on black. */
  function expand(list) {
    var out = [];
    list.forEach(function (sh) {
      var a = sh.visual && sh.visual.asset;
      if (a && /Parade/i.test(a) && !FCV.assetUrl(a)) {
        var short = /short|20 s/i.test(a), cast = FCV.data.script.characters.filter(function (c) { return c.id !== 'you'; }).sort(function (x, y) { return x.name.localeCompare(y.name); });
        out.push({ visual: { asset: FCV.isVideo('FM-V02') ? 'FM-V02' : 'CV91', fallback: 'FM-S06' }, title: 'The Parade', dur_min: short ? 6 : 9, music: sh.music });
        if (short) out.push({ visual: { asset: 'FM-S06', move: 'slow pull back' }, subtitle: 'The cast', cardHTML: '<div class="castRoll">' + cast.map(function (c) { return '<div><b>' + UI.esc(c.name) + '</b> <small>' + UI.esc(c.role || '') + '</small></div>'; }).join('') + '</div>', dur_min: 14 });
        else {
          var each = Math.max(2.2, Math.min(4, 31 / Math.max(1, cast.length))), stills = ['S01', 'S03', 'S04', 'S06', 'S07', 'S08', 'FM-S06'];
          cast.forEach(function (c, i) { var am = /act-(\d)/.exec((c.belongs_to || []).join(' ')), still = am && FCV.actBackdrop[+am[1]] && FCV.assetUrl(FCV.actBackdrop[+am[1]]) ? FCV.actBackdrop[+am[1]] : stills[i % stills.length]; out.push({ visual: { asset: still, move: 'slow pan' }, cardHTML: '<div class="charCard">' + UI.porHTML(c.id) + '<div><b>' + UI.esc(c.name) + '</b><small>' + UI.esc(c.role || '') + '</small></div></div>', ms: each * 1000, parade: true }); });
        }
        return;
      }
      if (sh.lines && typeof sh.lines === 'string' && !sh.subtitle) {
        var base = sh.lines.replace(/\s*\(.*\)$/, ''), ls = D.path(base);
        if (Array.isArray(ls) && ls.length) { ls.forEach(function (l, i) { out.push(Object.assign({}, sh, { lines: null, subtitle: textOf(l), speaker: l.who || sh.speaker, voice: base.replace(/\.lines$/, '') + '[' + i + ']', dur_min: Math.max(3, (sh.dur_min || 6) / ls.length) })); }); return; }
      }
      var k = sh.visual && sh.visual.asset, fb = sh.visual && sh.visual.fallback;
      var drawable = !k || FCV.assetUrl(k) || FCV.isVideo(k) || /card|buttons/.test(String(k)) || (fb && FCV.assetUrl(fb));
      if (!drawable && !sh.fact && !sh.cardHTML && !sh.buttons && !sh.title) return;
      if (!drawable) sh = Object.assign({}, sh, { visual: Object.assign({}, sh.visual, { asset: 'S01' }) });
      out.push(sh);
    });
    return out;
  }
  D.expand = expand;
  function assetKind(key) {
    if (!key) return 'none';
    if (/card|buttons/.test(key) && !FCV.assetUrl(key)) return key === 'buttons' ? 'buttons' : 'card';
    if (FCV.isVideo(key)) return 'video';
    return FCV.assetUrl(key) ? 'still' : 'none';
  }
  function frameStill(url, move) {
    var cls = SET().reduceMotion ? 'kb-fade' : /pull back/i.test(move) ? 'kb-out' : /tilt/i.test(move) ? 'kb-up' : /pan|track|glide|dolly/i.test(move) ? 'kb-pan' : /dim/i.test(move) ? 'kb-dim' : /hold|card/i.test(move) ? 'kb-hold' : 'kb-in';
    return '<div class="frameBlur" style="background-image:url(\'' + url + '\')"></div><img alt="" class="frameImg ' + cls + (/character card|portrait|close-up/i.test(move || '') ? ' faceTop' : '') + '" src="' + url + '">';
  }

  /* opts: {id, full, onShot(i), family, radio, finale, startAt} -> resolves to a button value, 'skip' or 'end'. */
  D.play = function (shots, opts) {
    opts = opts || {};
    if (window.Kit && Kit.dropRadio) Kit.dropRadio(); /* AUDR3-04: a radio link never plays under this */
    shots = expand((shots || []).filter(Boolean).map(norm));
    var st = ST(), seen = opts.id && st && st.cuts && st.cuts['film:' + opts.id];
    if (opts.id && !/^(mx|fm):/.test(opts.id)) D.reg[opts.id] = shots;
    if (seen && !opts.full && shots.some(function (s) { return s.core; })) shots = shots.filter(function (s) { return s.core || s.buttons; });
    if (!shots.length) return Promise.resolve('end');
    /* D-03: a resumed film finds its shot by the shot's own id, in the same list it was first played from */
    if (opts.startShotId) { for (var si = 0; si < shots.length; si++) if (shotKey(shots[si]) === opts.startShotId) { opts.startAt = si; break; } }
    var s0 = opts.startAt || 0; D.preload(shots[s0]); D.preload(shots[s0 + 1]);
    var firstKey = shots[s0] && shots[s0].visual && shots[s0].visual.asset;
    var warm = FCV.isVideo(firstKey) ? new Promise(function (r) { var u = FCV.posterOf(firstKey); if (!u) return r(); var im = new Image(); im.onload = im.onerror = function () { r(); }; im.src = u; setTimeout(r, 1500); }) : Promise.resolve();
    return warm.then(function () { return new Promise(function (resolve) {
      var cut = $('cut'), media = $('cutMedia'), sub = $('cutSub'), card = $('cutCard'), title = $('cutTitle'), btns = $('cutBtns'), chev = $('cutChevron'), dk = $('cutDocket');
      var shotAt = 0, i = (opts.startAt || 0) - 1, timer = null, ended = false, paused = false, result = 'end', prev = document.activeElement, holdFF = false, t0 = Date.now(), wordT = null, waitingTap = false;
      /* round 4 (items 7 and 8): the shot in play keeps its own clock, so Pause, Play and a hidden tab never jump a shot */
      var cs = null, vGen = 0, skipAt = 0, firstView = !seen, hiddenPause = false;
      cut.classList.remove('hidden'); UI.letterbox(); cut.classList.toggle('portrait', window.innerHeight > window.innerWidth);
      if (UI.toastAsideForFilm) UI.toastAsideForFilm();
      if (window.Family) Family.dockSleep(false);
      function clear() { clearTimeout(timer); clearInterval(wordT); }
      function end(r) {
        if (ended) return; ended = true; D.nextMusic = null; clear(); if (window.Sound) Sound.stopVoice();
        document.removeEventListener('visibilitychange', onVis); cut.classList.remove('paused');
        /* D-10: an ending film skipped in the Hall leaves no note over the debrief */
        if (r === 'skip' && opts.id && !opts.quiet && !opts.finale) UI.toast('Skipped. It\'s in Films whenever you want it.', 3000);
        cut.classList.add('hidden'); media.innerHTML = ''; sub.innerHTML = ''; card.innerHTML = ''; card.classList.remove('closerCard'); title.innerHTML = ''; btns.innerHTML = ''; dk.innerHTML = ''; chev.classList.add('hidden');
        cut.onclick = null; document.removeEventListener('keydown', key, true); cut.onpointerdown = cut.onpointerup = null; UI.letterbox();
        var est = ST(); if (opts.id && st && est) { est.cuts['film:' + opts.id] = 1; est.film = null; }
        if (prev && prev.focus) try { prev.focus({ preventScroll: true }); } catch (e) {}
        if (window.Game && Game.flush) Game.flush();
        resolve(r || result); if (window.Game) Game.afterUI();
      }
      function go(d) {
        clear(); if (window.Sound) Sound.stopVoice(); var from = shots[i]; i = Math.max(0, i + d);
        if (i >= shots.length) { end(); return; }
        var nb = shots[i];
        /* Between beats: a Carry on chevron for 1.5 s; family mode waits for a tap. */
        if (d > 0 && from && nb && from.beat && nb.beat && from.beat !== nb.beat) {
          chev.classList.remove('hidden'); waitingTap = SET().family;
          if (!waitingTap) timer = setTimeout(function () { chev.classList.add('hidden'); show(nb); }, 1500);
          return;
        }
        show(nb);
      }
      /* buttons over a film sit above the caption, never on it */
      function placeBtns() { try { var r = sub.getBoundingClientRect(); btns.style.bottom = !sub.hidden && r.height ? Math.round(window.innerHeight - r.top + 12) + 'px' : ''; } catch (e) {} }
      function show(sh) {
        chev.classList.add('hidden'); waitingTap = false; shotAt = Date.now(); btns.style.bottom = '';
        /* QAD3-B1 and m4: the live save (never a copy held from the film's start), on its way to the account within 0.4 s */
        var cst = ST(); if (cst && st && opts.id) { cst.film = { id: opts.id, shot: i, sid: shotKey(sh), full: !!opts.full, at: Date.now() }; if (opts.step) cst.film.step = opts.step; if (window.Game) Game.save(true); }
        if (opts.onShot) try { opts.onShot(i, sh); } catch (e) {}
        var key = sh.visual.asset, move = sh.visual.move || '', kind = assetKind(key), fb = sh.visual.fallback;
        if (kind === 'none' && fb) { key = fb; kind = assetKind(fb); }
        var vidMs = 0, shotBase = 0, holdMove = null;
        media.innerHTML = '';
        if (kind === 'video' && SET().autoplay !== false && !SET().reduceMotion) {
          /* a clip without its own poster shows its fallback still at once, never black while it loads */
          var poster = FCV.posterOf(key) || (FCV.videoFallback[key] && FCV.assetUrl(FCV.videoFallback[key])) || (fb && FCV.assetUrl(fb)) || null;
          if (poster) { var bl = document.createElement('div'); bl.className = 'frameBlur'; bl.style.backgroundImage = 'url(' + poster + ')'; media.appendChild(bl); var pim = document.createElement('img'); pim.className = 'frameImg posterNow'; pim.alt = ''; pim.src = poster; media.appendChild(pim); }
          var v = document.createElement('video'); v.className = 'frameImg'; v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.autoplay = true; v.loop = false; v.preload = 'auto';
          if (poster) v.poster = poster; v.src = FCV.mediaOf(key).src;
          var fell = false, fallback = function () { if (fell) return; fell = true; var u = poster || FCV.assetUrl(fb) || null; media.innerHTML = u ? frameStill(u, 'slow push-in') : '<div class="frameBlur" style="background:linear-gradient(160deg,#2b1d3f,#ff8a3d)"></div>'; };
          /* When the clip ends before its shot, the held last frame keeps a slow move for the rest of the shot (never a frozen picture). */
          holdMove = function () {
            if (v.dataset.held || SET().reduceMotion) return; v.dataset.held = '1';
            var left = Math.max(0, (shotBase || 0) - (Date.now() - shotAt)); if (left < 600) return;
            v.style.animation = 'kbHoldOn ' + (left / 1000 + 0.6).toFixed(1) + 's ease-in-out forwards';
          };
          v.onerror = fallback; v.onended = function () { try { v.pause(); } catch (e) {} holdMove(); };
          if (/first (\d+) s/.test(move)) { var lim = +/first (\d+) s/.exec(move)[1]; v.addEventListener('timeupdate', function () { if (v.currentTime >= lim) { v.pause(); holdMove(); } }); }
          media.appendChild(v);
          try { var p = v.play(); if (p && p.catch) p.catch(fallback); } catch (e) { fallback(); }
          setTimeout(function () { if (!fell && v.readyState < 2) fallback(); }, 4000);
          vidMs = Math.min(15, (FCV.mediaOf(key).duration_s || 6)) * 1000;
          if (/first (\d+) s/.test(move)) vidMs = Math.min(vidMs, +/first (\d+) s/.exec(move)[1] * 1000);
          v.playbackRate = holdFF ? 2 : 1;
          /* family mode: the darkest clips are lifted to the brightness floor */
          if (SET().family && /^(V18|V07|CV95|LV16|V02|V14|CV85|CV42|CV04)$/.test(key)) { v.style.filter = 'brightness(1.18)'; var pn = media.querySelector('.posterNow'); if (pn) pn.style.filter = 'brightness(1.18)'; }
        } else if (kind === 'video' || kind === 'still') {
          var u = kind === 'video' ? (FCV.posterOf(key) || FCV.assetUrl(fb)) : FCV.assetUrl(key);
          media.innerHTML = u ? frameStill(u, move) : '';
        } else if (key === 'closer card' || key === 'keeper card' || /card/.test(String(key))) {
          var actN = /:(\d)$/.exec(opts.id || ''), bgk = actN && FCV.actBackdrop ? FCV.actBackdrop[+actN[1]] : null, bgu = bgk ? (FCV.isVideo(bgk) ? FCV.posterOf(bgk) || FCV.assetUrl(FCV.videoFallback[bgk]) : FCV.assetUrl(bgk)) : null;
          media.innerHTML = bgu ? '<div class="frameBlur" style="background-image:url(\'' + bgu + '\');filter:blur(6px) brightness(.4)"></div>' : '<div class="frameBlur" style="background:radial-gradient(circle at 50% 40%,#3a2a52,#15101f)"></div>';
          if (/keeper|Animal/.test(key) && sh.speaker) title.innerHTML = '<div class="charCard">' + UI.porHTML(sh.speaker) + '<div><b>' + esc(FCV.nameOf(sh.speaker)) + '</b><small>' + esc(FCV.roleOf(sh.speaker) || '') + '</small></div></div>';
        }
        /* captions: speaker colour and shape; words light up as they are spoken */
        var subHTML = '', sp = sh.speaker || sh.character;
        if (opts.radio || sh.radio) subHTML += '<span class="radio">FREIGHT FM 104.7</span><br>';
        if (sh.subtitle) {
          var c = spk(sp);
          subHTML += (sp ? '<span class="spk" style="color:' + c[0] + '">' + c[1] + ' ' + esc(sp === 'marigold' ? 'Marigold' : FCV.nameOf(sp)) + '</span>' : '') +
            String(sh.subtitle).split(/(\s+)/).map(function (w) { return /\s+/.test(w) ? w : '<span class="w">' + esc(w) + '</span>'; }).join('');
        }
        sub.innerHTML = subHTML; sub.hidden = !subHTML;
        /* the moments the sound plan scores: district cleared, Next time, Previously */
        if (window.Kit && sh.subtitle) { if (/^District cleared\.?$/.test(sh.subtitle)) { Kit.sting('MUS-ACT-CLEAR'); Kit.flag('cleared'); if (SET().family && window.Voice) setTimeout(function () { Voice.say({ key: 'VOX-CHEER', pri: 'menu' }); }, 2500); } else if (/^Next time/.test(sh.subtitle)) Kit.sting('MUS-NEXT-TIME'); else if (/^Previously,? in Freight City/.test(sh.subtitle)) Kit.sting('MUS-PREVIOUSLY'); }
        if (sh.title || !(/card/.test(String(key)) && sh.speaker)) title.innerHTML = sh.title ? '<h1>' + esc(sh.title) + '</h1>' + (sh.titleSub ? '<p>' + esc(sh.titleSub) + '</p>' : '') : '';
        var facts = Array.isArray(sh.fact) ? sh.fact : sh.fact ? [sh.fact] : [];
        card.innerHTML = facts.length ? facts.map(function (f) { return UI.cardHTML(f, { label: sh.card_label }); }).join('') : (sh.cardHTML || '');
        card.classList.toggle('closerCard', key === 'closer card' && facts.length > 0);
        var bl2 = sh.buttons || (key === 'buttons' && opts.buttons) || null;
        btns.innerHTML = (bl2 || []).map(function (b, bi) { return '<button class="btn ' + (bi === 0 ? 'go' : '') + '" type="button" data-v="' + esc(b.value) + '">' + esc(b.label) + '</button>'; }).join('');
        Array.prototype.forEach.call(btns.querySelectorAll('[data-v]'), function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); result = b.getAttribute('data-v'); end(result); }); });
        if (bl2) { placeBtns(); var f0 = btns.querySelector('.btn'); if (f0) try { f0.focus({ preventScroll: true }); } catch (e) {} }
        /* Auto-continue: the first button counts down 5 s; any key or tap cancels; Stop here stays visible. */
        if (bl2 && sh.auto && SET().autoContinue !== false && !SET().family) {
          var left = Math.round(sh.auto / 1000), lab = f0 ? f0.textContent : '';
          var cancel = function () { clearInterval(cd); if (f0) f0.textContent = lab; document.removeEventListener('keydown', cancel, true); cut.removeEventListener('pointerdown', cancel, true); };
          var cd = setInterval(function () { if (document.hidden || paused || !$('modal').classList.contains('hidden')) return; left--; if (f0) f0.textContent = lab + ' (' + left + ')'; if (left <= 0) { cancel(); if (!ended && f0) f0.click(); } }, 1000);
          if (f0) f0.textContent = lab + ' (' + left + ')';
          setTimeout(function () { document.addEventListener('keydown', cancel, true); cut.addEventListener('pointerdown', cancel, true); }, 50);
        }
        /* Docket peeks from a static place in family mode */
        dk.innerHTML = '';
        if (SET().family && sh.docket_spot && window.Family) dk.innerHTML = Family.peekHTML(opts.id + ':' + (sh.shot || i));
        /* AUDR2-06: the music the rest of this film asks for, for a one-shot that plays out with nothing under it */
        D.nextMusic = function () { for (var q = i + 1; q < shots.length; q++) if (shots[q] && shots[q].music && shots[q].music !== sh.music) return shots[q].music; return null; };
        if (window.Sound) { if (sh.music) Sound.music(sh.music); (sh.sfx || []).forEach(function (s) { Sound.sfx(s); }); if (sh.sound && window.SFX && SFX[sh.sound]) SFX[sh.sound](); }
        if ((opts.radio || sh.radio) && window.SFX) SFX.radio();
        preload(shots[i + 1]); preload(shots[i + 2]);
        if (bl2) return;
        /* timing: the longest of video, voice + 0.6 s, reading time, 3 s and dur_min */
        var base = Math.max(vidMs, readMs(sh), 3000, (sh.dur_min || 0) * 1000, sh.ms || 0);
        if (sh.title && !sh.subtitle) base = Math.max(base, 3200);
        shotBase = base;
        /* A still's Ken Burns move lasts the whole shot (it used to stop at 9 s and hold). */
        var kbImg = media.querySelector('img.frameImg:not(.posterNow)');
        if (kbImg && !SET().reduceMotion) { var secs = (base / 1000 + 0.8).toFixed(1); kbImg.style.animationDuration = /kb-flicker/.test(kbImg.className) ? secs + 's, 1.4s' : secs + 's'; }
        /* Family mode: on a long shot Docket moves to a second place halfway through. */
        if (SET().family && sh.docket_spot && window.Family && base > 12000) { var spotKey = opts.id + ':' + (sh.shot || i), shotNow = i; setTimeout(function () { if (!ended && i === shotNow) dk.innerHTML = Family.peekHTML(spotKey, true); }, base / 2); }
        var inHall = !!(sh.inHall || (opts.finale && /^(S16|S17|S18|TS2\d|TE10)$/.test(String(key))));
        /* the cast voice for this caption: by its key and its own words; Subtitles off hides the caption only while it plays */
        var subNow = sub;
        var wantVoice = window.Sound && (sh.voice || sh.subtitle) && !(inHall && sp === 'marigold');
        var sayIt = function () { var g = ++vGen; cs.voiceDone = !wantVoice; if (!wantVoice) return; Sound.voice(sh.voice || null, { speaker: sp, inHall: inHall, text: sh.subtitle || null, onStart: function () { if (window.AudioCtl && AudioCtl.subsOff() && !opts.forceCaptions && sh.subtitle) subNow.hidden = true; } }).then(function (ok) { var extra = ok ? 600 : 0; setTimeout(function () { if (g !== vGen || cs.shot !== shotHere) return; cs.voiceDone = true; cs.next(); }, extra); }); };
        var started = Date.now(), wl = sub.querySelectorAll('.w'), nW = wl.length, total = base, shotHere = i;
        if (nW && !SET().reduceMotion) wordT = setInterval(function () { if (paused || document.hidden) return; var k = Math.floor((Date.now() - started) / (Math.min(total, 9000) / nW)); for (var q = 0; q < nW; q++) wl[q].classList.toggle('on', q <= k); }, 120);
        cs = { shot: i, base: holdFF ? base / 2 : base, started: Date.now(), voiceDone: false, timeDone: false, sayIt: sayIt };
        var me = cs;
        me.next = function () { if (me.voiceDone && me.timeDone && !paused && !ended && i === shotHere && cs === me) go(1); };
        sayIt();
        me.onTime = function () {
          me.timeDone = true;
          /* the voice runs past the shot: a slow second move on the picture until it ends, never a frozen frame */
          if (!me.voiceDone && !SET().reduceMotion && !ended) { var tg = media.querySelector('img.frameImg:not(.posterNow)') || media.querySelector('video'); if (tg && !tg.parentNode.classList.contains('kbHoldWrap')) { var wr = document.createElement('div'); wr.className = 'kbHoldWrap'; wr.style.cssText = 'position:absolute;inset:0;animation:kbHoldOn 16s linear forwards'; tg.parentNode.insertBefore(wr, tg); wr.appendChild(tg); } }
          me.next();
        };
        timer = setTimeout(me.onTime, me.base);
        /* control returns within 90 s outside the finale; in family mode the film carries on by itself after 5 s */
        if (!opts.finale && Date.now() - t0 > 90000 && i < shots.length - 1) { clear(); btns.innerHTML = '<button class="btn go" type="button" data-v="more">Carry on watching</button><button class="btn" type="button" data-v="skip">Back to the game</button>'; bindBtns(); placeBtns();
          if (SET().family) { var atShot = i; setTimeout(function () { var mb = btns.querySelector('[data-v="more"]'); if (!ended && i === atShot && mb) mb.click(); }, 5000); } }
      }
      function bindBtns() { Array.prototype.forEach.call(btns.querySelectorAll('[data-v]'), function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); var v = b.getAttribute('data-v'); if (v === 'more') { t0 = Date.now(); btns.innerHTML = ''; go(1); } else end('skip'); }); }); }
      function preload(sh) { D.preload(sh); }
      /* Pause stops the clock where it is; Play carries on from there (the line is said again from its start) */
      function pauseFilm() {
        if (paused || ended) return; paused = true; $('cutPause').textContent = 'Play'; cut.classList.add('paused');
        clearTimeout(timer); if (cs) { cs.left = Math.max(0, cs.base - (Date.now() - cs.started)); if (!cs.voiceDone) cs.voiceCut = true; vGen++; }
        if (window.Sound) Sound.stopVoice();
        var v = media.querySelector('video'); if (v) { try { v.pause(); } catch (er) {} }
      }
      function playFilm() {
        if (!paused || ended) return; paused = false; $('cutPause').textContent = 'Pause'; cut.classList.remove('paused');
        var v = media.querySelector('video'); if (v && !v.ended && !v.dataset.held) { try { v.play(); } catch (er) {} }
        if (!cs || cs.shot !== i) { show(shots[i]); return; }
        if (cs.voiceCut) { cs.voiceCut = false; cs.sayIt(); }
        if (!cs.timeDone) { cs.started = Date.now() - (cs.base - cs.left); timer = setTimeout(cs.onTime, cs.left); } else cs.next();
      }
      D.pauseNow = pauseFilm; D.playNow = playFilm;
      /* a hidden tab stops everything; back in view, the shot plays again from its start with its voice */
      function onVis() {
        if (ended) return;
        if (document.hidden) { if (!paused) { hiddenPause = true; clearTimeout(timer); vGen++; if (window.Sound) Sound.stopVoice(); var v = media.querySelector('video'); if (v) { try { v.pause(); } catch (er) {} } } }
        else if (hiddenPause) { hiddenPause = false; if (!paused && i >= 0 && i < shots.length && !waitingTap) show(shots[i]); }
      }
      document.addEventListener('visibilitychange', onVis);
      /* Skip: on a first viewing it jumps to the next beat, and a second Skip within 3 s ends the film */
      function skip() {
        var now = Date.now(), cur = shots[i];
        if (firstView && now - skipAt > 3000 && cur && cur.beat) {
          var j = i + 1; while (j < shots.length && shots[j].beat === cur.beat) j++;
          if (j < shots.length && !shots[j].buttons) { skipAt = now; clear(); if (window.Sound) Sound.stopVoice(); paused = false; cut.classList.remove('paused'); $('cutPause').textContent = 'Pause'; i = j; show(shots[i]); var tp = $('cutTap'); if (tp) { tp.textContent = 'Skipped to the next part. Skip again to end the film.'; setTimeout(function () { tp.textContent = Game.cutHint ? Game.cutHint() : ''; }, 3000); } return; }
        }
        end('skip');
      }
      function key(e) {
        if (window.Family && Family.isDockKey(e)) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (paused) playFilm(); else pauseFilm(); }
        else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#cutBtns, #cutCtl')) return; e.preventDefault(); e.stopPropagation(); if (waitingTap) { waitingTap = false; show(shots[i]); } else { if (paused) { paused = false; cut.classList.remove('paused'); $('cutPause').textContent = 'Pause'; } go(1); } }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); if (paused) { paused = false; cut.classList.remove('paused'); $('cutPause').textContent = 'Pause'; } go(-1); }
      }
      document.addEventListener('keydown', key, true);
      $('cutSkip').onclick = function (e) { e.stopPropagation(); skip(); };
      $('cutBack').onclick = function (e) { e.stopPropagation(); if (paused) { paused = false; cut.classList.remove('paused'); $('cutPause').textContent = 'Pause'; } go(-1); };
      if ($('cutNext')) $('cutNext').onclick = function (e) { e.stopPropagation(); if (waitingTap) { waitingTap = false; show(shots[i]); return; } if (paused) { paused = false; cut.classList.remove('paused'); $('cutPause').textContent = 'Pause'; } go(1); };
      $('cutPause').onclick = function (e) { e.stopPropagation(); if (paused) playFilm(); else pauseFilm(); };
      $('cutPause').textContent = 'Pause';
      var holdT = null;
      cut.onpointerdown = function (e) { if (e.target.closest && e.target.closest('button, details')) return; holdT = setTimeout(function () { holdFF = true; var v = media.querySelector('video'); if (v) v.playbackRate = 2; }, 450); };
      cut.onpointerup = function () { clearTimeout(holdT); if (holdFF) { holdFF = false; var v = media.querySelector('video'); if (v) v.playbackRate = 1; cut.dataset.ff = '1'; } };
      cut.onclick = function (e) {
        if (cut.dataset.ff) { delete cut.dataset.ff; return; }
        if (e.target.closest && e.target.closest('#cutBtns, #cutCard details, #cutDocket button, #cutCtl')) return;
        if (SET().family && !waitingTap) return; /* a child's tap on the picture never skips the narrator */
        if (waitingTap) { waitingTap = false; show(shots[i]); return; }
        if (Date.now() - shotAt < 600) return;
        /* a tap on the picture pauses (and shows the controls); another tap plays on. The next shot needs Next. */
        if (!(shots[i] && shots[i].buttons)) { if (paused) playFilm(); else pauseFilm(); }
      };
      go(1);
    }); });
  };

  /* Warm the next shots: the poster and a preload link for video (appended, once), the image for stills. */
  var preloaded = {};
  D.preload = function (sh) {
    if (!sh || !sh.visual) return; var k = sh.visual.asset; if (!k || preloaded[k]) return; preloaded[k] = 1;
    if (FCV.isVideo(k)) {
      var pu = FCV.posterOf(k); if (pu) { var pi = new Image(); pi.src = pu; }
      var src = FCV.mediaOf(k) && FCV.mediaOf(k).src; if (src) { var l = document.createElement('link'); l.rel = 'preload'; l.as = 'video'; l.href = src; document.head.appendChild(l); }
    } else if (FCV.assetUrl(k)) { var im = new Image(); im.src = FCV.assetUrl(k); }
  };
  /* ---------------- films by id ---------------- */
  D.shotsFor = function (id, n) {
    var sc = SC(), a = n ? sc.acts[n - 1] : null;
    if (id === 'cold_open') return sc.cold_open.shots;
    if (id === 'opening' && a) return a.opening_cutscene;
    if (id === 'closer' && a) return a.closer.film;
    if (id === 'tp_in' && a) return [a.turning_point.narration_in];
    if (id === 'tp_out' && a) return [a.turning_point.narration_out];
    var c = FCV.cut(id); if (!c) return null;
    if (Array.isArray(c.shots)) return c.shots;
    if (c.shots && Array.isArray(c.shots.shots)) return c.shots.shots;
    if (typeof c.shots === 'string') { var p = D.path(c.shots.split(' ')[0]); if (Array.isArray(p)) return p; }
    return null;
  };
  D.film = function (id, n, opts) {
    var shots = D.shotsFor(id, n); if (!shots) return Promise.resolve('none');
    return D.play(shots, Object.assign({ id: id + (n ? ':' + n : '') }, opts || {}));
  };
  /* Resume a film closed mid-way, at the start of its shot. */
  D.resumable = function () { var st = ST(); return st && st.film && st.film.id ? st.film : null; };
  D.resume = function () {
    var f = D.resumable(); if (!f) return Promise.resolve();
    var m = /^(\w+):(\d)$/.exec(f.id), shots = m && m[1] === 'opening' && window.Flows && Flows.openingShots ? Flows.openingShots(+m[2]) : m ? D.shotsFor(m[1], +m[2]) : D.shotsFor(f.id);
    if (!shots) { ST().film = null; return Promise.resolve(); }
    var step = f.step || (m && m[1] === 'opening' ? { act: +m[2], step: 'opening' } : null);
    return D.play(shots, { id: f.id, startAt: f.shot || 0, startShotId: f.sid || null, full: f.full === undefined ? true : !!f.full, step: step }).then(function (r) {
      /* A resumed act opening completes its step, as the act flow would have. */
      var st = ST(); if (step && st && !FCV.isDone(st, step.act, step.step)) { FCV.markDone(st, step.act, step.step); if (st.resumeStep && st.resumeStep.act === step.act && st.resumeStep.step === step.step) st.resumeStep = null; if (window.Game) { Game.flush(); Game.refresh(); } }
      return r;
    });
  };

  /* ---------------- Watch the story: the whole thesis as one film; never changes progress ---------------- */
  D.storyChapters = function () {
    var sc = SC(), ch = [{ label: 'Cold open', shots: sc.cold_open.shots }];
    sc.acts.forEach(function (a) {
      var tp = a.turning_point, tpShots = [tp.narration_in, tp.cut_in ? { visual: tp.cut_in.visual, subtitle: (tp.lines[tp.cut_in.line - 1] || {}).line, speaker: (tp.lines[tp.cut_in.line - 1] || {}).who } : null, tp.narration_out].filter(Boolean);
      ch.push({ label: 'Act ' + a.act + ': ' + a.district.name, shots: (a.opening_cutscene || []).concat(tpShots).concat((a.closer.film || []).filter(function (s) { return s.visual && s.visual.asset !== 'buttons'; })) });
    });
    var lr = D.shotsFor('the_long_ride'); if (lr) ch.push({ label: 'The Long Ride', shots: lr });
    return ch;
  };
  /* item 63: one still per row, and it carries on where he stopped (st.storyAt) */
  function stillFor(c, i) {
    var k = i === 0 ? 'CS01' : (FCV.actBackdrop && FCV.actBackdrop[i]) || null; if (!k) { var v0 = c.shots[0] && c.shots[0].visual && c.shots[0].visual.asset; k = v0; }
    var u = k ? (FCV.isVideo(k) ? FCV.posterOf(k) || FCV.assetUrl(FCV.videoFallback[k]) : FCV.assetUrl(k)) : null;
    return u ? '<span class="thumb" style="background-image:url(\'' + u + '\')"></span>' : '<span class="thumb"></span>';
  }
  D.watchStory = async function () {
    var ch = D.storyChapters(), total = 0, st = ST(), at = st && st.storyAt;
    ch.forEach(function (c) { c.shots.forEach(function (s) { total += Math.max(3, s.dur_min || 4); }); });
    /* m7: the nine chapters fold under "Pick a chapter", so the card opens on its two buttons */
    var html = '<p>The whole story as one film, about ' + Math.round(total / 60) + ' minutes. It never changes your progress.</p><details class="pickChapter"><summary>Pick a chapter</summary><div class="hubList thumbs">' +
      ch.map(function (c, i) { var len = filmLen(c.shots); return '<button class="hubItem" type="button" data-ch="' + i + '">' + stillFor(c, i) + '<span>' + esc(c.label) + '<small> · about ' + (/min/.test(len) ? len : '1 min') + '</small></span></button>'; }).join('') + '</div></details>';
    var btns = [{ label: 'Play from the start', value: 0, cls: at ? '' : 'go' }, { label: 'Not now', value: -1, safe: true }];
    if (at && ch[at.chapter]) btns.unshift({ label: 'Carry on from ' + ch[at.chapter].label.split(':')[0], value: 'resume', cls: 'go' });
    var pick = await new Promise(function (res) {
      UI.modal('Watch the story', html, btns, { onOpen: function (box) {
        Array.prototype.forEach.call(box.querySelectorAll('.hubItem'), function (b) { b.addEventListener('click', function () { $('modal').classList.add('hidden'); UI.letterbox(); res(+b.getAttribute('data-ch')); }); });
      } }).then(res);
    });
    if (pick === -1 || pick === null || pick === undefined) return;
    var startCh = pick === 'resume' ? at.chapter : pick, startShot = pick === 'resume' ? at.shot || 0 : 0;
    var saved = st && JSON.stringify(st.cuts), savedFilm = st && st.film;
    for (var i = startCh; i < ch.length; i++) {
      var ci = i;
      var r = await D.play(ch[i].shots, { full: true, startAt: i === startCh ? startShot : 0, quiet: true, onShot: function (k) { if (ST()) { ST().storyAt = { chapter: ci, shot: k }; } } });
      if (r === 'skip') {
        var v = await UI.modal('Watch the story', '<p>' + esc(ch[i].label) + ' skipped.</p>', [{ label: i + 1 < ch.length ? 'Next: ' + ch[i + 1].label : 'Finish', value: 1, cls: 'go' }, { label: 'Stop watching', value: 0 }]);
        if (!v) break;
      }
      if (i + 1 >= ch.length && ST()) delete ST().storyAt;
    }
    if (saved && ST()) { ST().cuts = JSON.parse(saved); ST().film = savedFilm || null; } /* never changes progress */
    if (window.Game) Game.save();
  };

  /* ---------------- item 9: the Films shelf. Every film he has seen, by act and by place, with its length; a film not
     seen yet is a locked tile saying where it plays. Watching never changes progress. ---------------- */
  function filmLen(shots) { var t = 0; (shots || []).forEach(function (s) { t += Math.max(3, s.dur_min || 4); }); return t < 60 ? t + ' s' : Math.round(t / 60) + ' min'; }
  /* m5: when each film plays, in plain words (the script's trigger notes are for the makers) */
  var WHEN = {
    what_holds_them: 'Plays at the start of Scene 4.3.',
    sold: 'Plays when you ride into Red Cell Square at the start of Act 6.',
    the_chain: 'Plays when Act 7 is cleared, and you can watch it again at the Hall door.',
    hall_opens: 'Plays the first time the Hall opens.',
    academy_entrance: 'Plays the first time the Methods Academy opens, after Scene 3.1.',
    link_explainers: 'Plays as each link of the chain lights up, in Scenes 4.1 to 4.4.',
    the_long_ride: 'Plays after Act 7 is cleared.',
    evidence_locker_entry: 'Plays the first time you go into the Evidence Locker.',
    not_awarded_v3: 'Plays the first time you lose all five hearts.',
    pass_film: 'Plays when you pass with minor corrections or none.',
    major_film: 'Plays when you pass with major corrections.',
    first_spot_check: 'Plays the first time a Kerb Inspector rides up beside you.',
    docket_intro: 'Plays the first time family mode is turned on.',
    gate_run_finish: 'Plays when you finish the Gate Run.',
    bedtime: 'Plays when you stop for bedtime in family mode.',
    good_morning: 'Plays when you carry on in family mode.',
    readiness_band: 'Plays when your readiness reaches a new level.',
    proven_stinger: 'Plays when a card is fully learnt.'
  };
  D.catalogue = function () {
    var sc = SC(), out = [], st = ST() || { cuts: {} }, seen = function (id) { return !!st.cuts['film:' + id]; };
    var add = function (group, id, label, shots, where) { if (shots && shots.length) out.push({ group: group, id: id, label: label, shots: shots, seen: seen(id), where: where }); };
    add('The start', 'cold_open', 'Cold open', D.shotsFor('cold_open'), 'Plays when a new game starts.');
    sc.acts.forEach(function (a) {
      var n = a.act, g = 'Act ' + n + ': ' + a.district.name;
      add(g, 'opening:' + n, 'Opening', D.shotsFor('opening', n), 'Plays when you reach Act ' + n + '.');
      add(g, 'tp_in:' + n, 'Turning point', D.shotsFor('tp_in', n), 'Plays at the Act ' + n + ' turning point.');
      add(g, 'tp_out:' + n, 'After the turning point', D.shotsFor('tp_out', n), 'Plays after the Act ' + n + ' turning point.');
      add(g, 'closer:' + n, 'District cleared', (D.shotsFor('closer', n) || []).filter(function (s) { return !(s.visual && s.visual.asset === 'buttons'); }), 'Plays when Act ' + n + ' is cleared.');
    });
    sc.evidence_locker.rooms.forEach(function (r) { var sh = D.reg['room:' + r.id] || (window.Flows && Flows.roomEntryShots ? Flows.roomEntryShots(r) : null); add('Places', 'room:' + r.id, r.name, sh, 'Plays the first time you open the ' + r.name + '.'); });
    (sc.cutscenes || []).forEach(function (c) {
      if (/^(cold_open|act_|turning_point|watch_the_story|previously|method_explainers|locker_room_first_visit|examiner_sting|killer_insert|second_half|reveal|hall_doors|not_awarded$)/.test(c.id)) return;
      var sh = D.reg[c.id] || D.shotsFor(c.id); add(/hall|award|pass_film|major_film|the_chain/.test(c.id) ? 'The Viva Hall' : 'Places', c.id, c.name, sh, WHEN[c.id] || 'Plays later in the story.');
    });
    return out;
  };
  D.shelf = async function () {
    var cat = D.catalogue(), groups = [], html = '';
    cat.forEach(function (f) { if (groups.indexOf(f.group) < 0) groups.push(f.group); });
    var nSeen = cat.filter(function (f) { return f.seen; }).length;
    html = '<p>' + nSeen + ' of ' + cat.length + ' films watched. Watching one again never changes your progress.</p>' + groups.map(function (g) {
      return '<h4>' + esc(g) + '</h4><div class="hubList">' + cat.map(function (f, i) { if (f.group !== g) return ''; return f.seen
        ? '<button class="hubItem" type="button" data-f="' + i + '"><span>' + esc(f.label) + '<br><small>' + filmLen(f.shots) + '</small></span><span class="tick">Watch</span></button>'
        : '<button class="hubItem" type="button" disabled><span>' + esc(f.label) + '<br><small>' + esc(f.where) + '</small></span><span class="tick">Not yet</span></button>'; }).join('') + '</div>';
    }).join('');
    if (window.Extras) Extras.seen('films');
    var pick = await new Promise(function (res) {
      UI.modal('Films', html, [{ label: 'Done', value: -1, cls: 'go' }], { onOpen: function (box) {
        Array.prototype.forEach.call(box.querySelectorAll('[data-f]'), function (b) { b.addEventListener('click', function () { $('modal').classList.add('hidden'); UI.letterbox(); res(+b.getAttribute('data-f')); }); });
      } }).then(res);
    });
    if (pick === -1 || pick === null || pick === undefined || !cat[pick]) return;
    var st = ST(), saved = st && JSON.stringify(st.cuts), savedFilm = st && st.film;
    await D.play(cat[pick].shots, { full: true, quiet: true });
    if (saved && ST()) { ST().cuts = JSON.parse(saved); ST().film = savedFilm || null; if (window.Game) Game.save(); }
    return D.shelf();
  };

  /* v2 code calls UI.cutscene: route it through the Director. */
  UI.cutscene = function (shots, opts) { return D.play(shots, opts); };
  window.Director = D;
})();
