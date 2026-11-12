/* Freight City Viva v2: UI primitives. Every scene, quiz and cutscene is a promise. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var UI = { esc: esc, LEAVE: { leave: true } };
  var pending = null, lastFocus = null;
  var ST = function () { return window.Game && Game.state; };
  /* Voices: a line plays only in its own words (voice.js checks); cards and questions are read when Read aloud is on. */
  var VO = function () { return window.Voice || null; };
  function speak(items) { if (VO() && items.length) VO().sequence(items); }
  function cardItem(f) { var V = VO(); if (!V) return null; var r = typeof f === 'string' ? FCV.resolve(f) : f; var c = V.cardClip(r); return c ? { text: c.text, pri: 'card' } : null; }
  function skimText(el) { if (!el) return ''; var f = el.querySelector('.first'), d = el.querySelector('details > div'); return ((f ? f.textContent : '') + ' ' + (d ? d.textContent : '')).trim(); }
  UI.speakText = function (text, who, pri) { if (text) speak([{ text: text, speaker: who || null, pri: pri || 'card' }]); };
  var SET = function () { return (ST() && ST().settings) || FCV.defaultSettings(); };
  UI.busy = function () {
    return ['sheet', 'cut', 'viva', 'notebook', 'modal', 'title', 'chapter', 'mech', 'worldmap'].some(function (id) { var el = $(id); return el && !el.classList.contains('hidden'); });
  };
  /* D1-m10: while a film, card, dialog or the Hall is open, the city HUD behind it is inert, so Tab never walks it unseen
     (the two sound buttons sit outside the HUD and stay reachable) */
  UI.letterbox = function () { var b = UI.busy(); document.body.classList.toggle('letterbox', b); ['hud', 'nearby'].forEach(function (id) { var el = $(id); if (el && el.inert !== b) el.inert = b; }); };
  /* simplicity round (SD-21): key letters and keyboard words show on a keyboard device, or once a key has been pressed on a
     touch device; never otherwise. body.kb drives the CSS (.kbOnly / .touchOnly). */
  var kbUsed = false;
  var coarsePtr = function () { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } };
  UI.kb = function () { return kbUsed || !coarsePtr(); };
  UI.kbSync = function () { document.body.classList.toggle('kb', UI.kb()); document.body.classList.toggle('touchUI', !UI.kb()); var ct = document.getElementById('cutTap'); if (ct && window.Game && Game.cutHint && Game.state) ct.textContent = Game.cutHint(); };
  document.addEventListener('keydown', function (e) { if (kbUsed || e.isComposing || /^(Shift|Control|Alt|Meta|Unidentified|Process)$/.test(e.key)) return; if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; kbUsed = true; UI.kbSync(); }, true);
  if (document.body) UI.kbSync(); else document.addEventListener('DOMContentLoaded', UI.kbSync);
  /* "Space, Enter or tap Next" on a keyboard device; "Tap Next" on touch */
  UI.nextHint = function (label) { return UI.kb() ? 'Space, Enter or tap ' + (label || 'Next') : 'Tap ' + (label || 'Next'); };
  /* SD-14 and SD-17: asset codes such as "(LS01)" and id codes such as "ch2-02" never show; the words around them stay */
  UI.stripCodes = function (s) {
    return String(s == null ? '' : s).replace(/\s*\((?:[A-Z]{1,3}-?\d{1,3}[a-z]?)(?:[,;]\s*[A-Z]{1,3}-?\d{1,3}[a-z]?)*\)/g, '')
      .replace(/\b(?:ch\d-(?:\d\d|tp|eq\d+|q\d+)|app-[A-O]-\w+)\b[;,]?\s*/g, '').replace(/\s{2,}/g, ' ').replace(/^[\s;,·]+|[\s;,·]+$/g, '').trim();
  };
  UI.announce = function (msg) { var a = $('live'); if (a) { a.textContent = ''; setTimeout(function () { a.textContent = msg; }, 30); } };

  var PHONE = '<svg viewBox="0 0 64 64" width="60%" height="60%" aria-hidden="true"><path fill="#ffd166" stroke="#000" stroke-width="3" d="M18 6c4 0 8 9 8 12s-5 5-5 7c0 5 13 18 18 18 2 0 4-5 7-5s12 4 12 8-5 12-12 12C26 58 6 38 6 18 6 11 14 6 18 6z"/></svg>';
  /* Character card: a sharp portrait over a blurred copy of itself. */
  UI.porHTML = function (who) {
    if (!who) return '';
    if (who === 'head_office') return '<div class="por" aria-hidden="true">' + PHONE + '</div>';
    var u = FCV.assetUrl(FCV.portrait(who));
    return '<div class="por" role="img" aria-label="' + esc(FCV.nameOf(who)) + '">' + (u ? '<span class="porBlur" style="background-image:url(\'' + u + '\')"></span><span class="porImg" style="background-image:url(\'' + u + '\')"></span>' : '') + '</div>';
  };

  /* ---------- text helpers ---------- */
  /* QAD3-M1 (clarity): a figure that starts with a decimal point (alpha .80) is bolded whole */
  var FIG = /(^|[^\w.])(\.\d+(?:\s?per cent|%)?)|(\d[\d,.]*(?:\s?per cent|%)?)/g;
  UI.boldFigures = function (t) { return esc(t).replace(FIG, function (all, pre, dec, num) { return dec ? pre + '<b>' + dec + '</b>' : '<b>' + num + '</b>'; }); };
  /* Skimmer layout: first sentence large, figures bold, the rest folded, the location chip last. */
  UI.skimHTML = function (title, text, loc, open) {
    /* QAD3-m2: a first sentence of a few words ("Not none.", "Yes.") never stands alone: the next sentence joins it */
    var ss = FCV.sentences(String(text || '')), first = ss[0] || '';
    if (first.length < 40 && ss.length > 1) { var two = String(text).indexOf(ss[1], first.length); if (two >= 0) first = String(text).slice(0, two + ss[1].length); }
    var rest = String(text || '').slice(first.length).trim();
    return '<div class="answer"><b class="aTitle">' + esc(title) + '</b><div class="first">' + UI.boldFigures(first) + '</div>' +
      (rest ? '<details' + (open ? ' open' : '') + '><summary>More</summary><div>' + UI.boldFigures(rest) + '</div></details>' : '') +
      (loc ? '<div class="loc">' + esc(loc) + '</div>' : '') + '</div>';
  };
  UI.answerHTML = function (title, text, loc) { return UI.skimHTML(title, text, loc, false); };
  var HELD = {};
  UI.setHeld = function (map) { HELD = map || {}; };

  /* ---------- fact cards ---------- */
  /* item 66b: codebook codes (HOLDER_CLASS and the like) never show; if nothing else is left, the card's own words say it */
  var CODE = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g;
  /* QAD-m2: a known code is replaced by its plain words (from the card's own text), never just deleted; a figure that is
     only row ids reads as the number of rows (the ids stay in the card's text) */
  var CODE_LABEL = { HOLDER_CLASS: 'Holder class (version 3)' }, NUMW = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' };
  UI.plainFigure = function (f) {
    if (!f) return '';
    var s = String(f);
    if (/^\s*H\d-\d+(\s*,\s*H\d-\d+)*(\s*,?\s*and\s+H\d-\d+)?\s*$/.test(s)) { var nr = (s.match(/H\d-\d+/g) || []).length; return (NUMW[nr] || nr) + ' rows'; }
    s = s.replace(CODE, function (c) { return CODE_LABEL[c] ? '\u0001' + CODE_LABEL[c] + '\u0002' : ' '; }).replace(/\u0002\s+(?=[\d.])/g, ': ').replace(/[\u0001\u0002]/g, '');
    /* QAD-M3: a leading minus sign is part of the figure (-£12,000), so it is never trimmed from the start */
    var t = s.replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/^[\s,;:·]+|[\s,;:·-]+$/g, '').trim();
    return /[A-Za-z0-9]/.test(t) ? t : '';
  };
  UI.CODE_RE = CODE;
  UI.cardHTML = function (id, opts) {
    opts = opts || {};
    var r = typeof id === 'string' ? FCV.resolve(id) : id;
    if (!r) return '';
    if (window.Game && typeof id === 'string' && !opts.noMet) Game.noteMet(id);
    var h = '<div class="card ' + (opts.cls || '') + '">';
    if (r.type === 'card') {
      if (!opts.hideLabel) h += '<div class="lab">' + esc(opts.label || r.label) + '</div>';
      var pf = UI.plainFigure(r.figure);
      if (pf) h += '<div class="fig' + (pf.length > 46 ? ' long' : '') + '">' + esc(pf) + '</div>';
      if (opts.compact) {
        h += '<details><summary>' + esc(FCV.firstSentence(r.text)) + '</summary><div class="txt">' + esc(r.text) + '</div>' +
          (r.list && r.list.length ? '<ul>' + r.list.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') + '</details>';
      } else {
        h += '<div class="txt' + (r.quote ? ' q' : '') + '">' + esc(r.text) + '</div>';
        if (r.list && r.list.length) h += '<details><summary>More</summary><ul>' + r.list.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></details>';
      }
      if (r.loc && !opts.hideLoc) h += '<div class="loc">' + esc(r.loc) + '</div>';
    } else if (r.type === 'trace') {
      h += '<div class="lab">Trace the number</div><div class="fig">' + esc(r.number) + '</div><div class="txt">' + esc(r.means) + '</div>' +
        (opts.hideLoc ? '' : '<div class="loc">Comes from: ' + esc(r.from) + '</div> <div class="loc">Stated in: ' + esc(r.stated) + '</div>');
    } else if (r.type === 'gap') {
      h += '<div class="lab">The gap</div><div class="txt">' + esc(r.gap) + '</div>';
    } else if (r.type === 'eq') {
      h += '<div class="lab">' + esc(r.label) + ': examiner question</div><div class="txt q">' + esc(r.question) + '</div>';
    } else if (r.type === 'quiz' || r.type === 'bank') {
      h += '<div class="lab">' + esc(r.label || 'Question') + '</div><div class="txt q">' + esc(r.q) + '</div>';
    }
    var held = UI.heldLabel(typeof id === 'string' ? id : r.id, r);
    if (held) h += '<div class="held">' + esc(held) + '</div>';
    /* Read it to me: replays the card's own recording at any time */
    var cc = !opts.noRead && VO() && VO().cardClip(r);
    /* items 40 and 53: Pin it and Copy card sit beside Read it to me */
    var cid = typeof id === 'string' ? id : r.id, tools = '';
    if (cc) tools += '<button class="readMe" type="button" data-read="' + esc(cc.text) + '" aria-label="Read it to me" title="Read it to me"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 8.5a5 5 0 0 1 0 7"/></svg></button>';
    if (!opts.noTools && r.type === 'card' && cid) {
      var pinned = !!(ST() && ST().pins && ST().pins[cid]);
      tools += '<button type="button" class="pinIt" data-pin="' + esc(cid) + '" aria-pressed="' + pinned + '" aria-label="Pin it" title="' + (pinned ? 'Pinned: tap to unpin' : 'Pin it for the viva morning') + '"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M14 3l7 7-3 1-4 4 1 5-2 1-4-5-5 5-1-1 5-5-5-4 1-2 5 1 4-4z"/></svg></button>' +
        '<button type="button" class="copyIt" data-copy="' + esc(cid) + '" aria-label="Copy card" title="Copy card"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M8 8h11v13H8z"/><path fill="none" stroke="currentColor" stroke-width="2" d="M5 16V3h11"/></svg></button>';
    }
    if (tools) h = h.replace('<div class="card ' + (opts.cls || '') + '">', '<div class="card ' + (opts.cls || '') + '"><span class="cardTools">' + tools + '</span>');
    return h + '</div>';
  };
  UI.togglePin = function (id) {
    var st = ST(); if (!st || !id) return false; st.pins = st.pins || {};
    if (st.pins[id]) delete st.pins[id]; else st.pins[id] = Date.now();
    if (window.Game) Game.save(); return !!st.pins[id];
  };
  UI.copyCard = function (id) {
    var r = FCV.resolve(id); if (!r) return '';
    var txt = [UI.plainFigure(r.figure), r.text, r.loc].filter(Boolean).join('\n');
    try { navigator.clipboard.writeText(txt).then(function () { UI.toast('Card copied.', 1600); }, function () { UI.toast('Copy did not work here.', 2000); }); } catch (e) { UI.toast('Copy did not work here.', 2000); }
    return txt;
  };
  document.addEventListener('click', function (e) {
    var p = e.target.closest && e.target.closest('[data-pin]'), c = e.target.closest && e.target.closest('[data-copy]');
    if (p && !p.disabled) { e.preventDefault(); e.stopPropagation(); var on = UI.togglePin(p.getAttribute('data-pin')); p.setAttribute('aria-pressed', on); p.title = on ? 'Pinned: tap to unpin' : 'Pin it for the viva morning'; UI.toast(on ? 'Pinned. It is first in the Notebook and on the viva morning sheet.' : 'Unpinned.', 2200); }
    else if (c && !c.disabled) { e.preventDefault(); e.stopPropagation(); UI.copyCard(c.getAttribute('data-copy')); }
  }, true);
  /* Held by the author: the listed ids, and any card whose location names coding File 1 or 2, transcript-level coding of
     Files 3 to 6, an Appendix O claim or register, the M.2 search log, or E.3.2 to E.3.5. say: and recall: share the base. */
  var HELD_RE = /\bFiles? [12]\b|\bFiles? [3-6]\b[^;]*transcript|transcript[^;]*\bFiles? [3-6]\b|\bregister\b[^;]*\bO\b|Appendix O|\bO\.\d|claim (?:No\.? ?)?\d|\bM\.2\b|\bE\.3\.[2-5]\b/i;
  UI.HELD_RE = HELD_RE;
  /* The prompt for a Say it item is a question about the card, never its bare label. */
  UI.sayPrompt = function (r) {
    var lab = String(r.label || ''), f = r.figure && r.figure !== r.label ? String(r.figure) : '', m;
    if ((m = /^Turning point, chapter (\d)/.exec(lab))) return 'Say it aloud: what is the turning point of chapter ' + m[1] + ', in the thesis\'s words?';
    if (lab === 'Glossary' && f) return 'Say it aloud: what does "' + f + '" mean in the thesis?';
    if (/^(Chapter \d|Appendix [A-Z])$/.test(lab) && f) return 'Say it aloud: what lies behind "' + f + '"? (' + lab + ')';
    /* never say the label twice ("Link 1, Link 1: Overlap"): the figure alone when it starts with the label */
    var lp = lab.split(':')[0].trim(), note = /^(.*?)\s*\(([^)]+)\)$/.exec(lab);
    /* QAD4-07: "Link 5 (proposed, not found)" with "Link 5: The holder" reads "Link 5: The holder (proposed, not found)" */
    if (f && note && f.indexOf(note[1] + ':') === 0) return 'Say it aloud: ' + f + ' (' + note[2] + '). What does the thesis say?';
    if (f && lab && f.toLowerCase().indexOf(lab.toLowerCase()) === 0) return 'Say it aloud: ' + f + '. What does the thesis say?';
    if (f && lp && f.indexOf(lp + ':') === 0) return 'Say it aloud: ' + lab + ' (' + f.slice(lp.length + 1).trim() + '). What does the thesis say?';
    if (f) return 'Say it aloud: ' + lab + ', ' + f + '. What does the thesis say?';
    return 'Say it aloud: ' + lab + '. What does the thesis say?';
  };
  UI.heldLabel = function (id, r) {
    var base = String(id || '').replace(/^(say|recall):/, '');
    if (HELD[id]) return HELD[id];
    if (HELD[base]) return HELD[base];
    r = r || FCV.resolve(base);
    if (!r || r.type === 'gap' || r.type === 'bank' || r.type === 'trace') return '';
    var where = r ? [r.loc, r.where, r.label === 'Appendix O' ? 'Appendix O' : ''].filter(Boolean).join('; ') : '';
    if (/^app-O-/.test(base) || (where && HELD_RE.test(where))) return 'Held by the author, available on request';
    return '';
  };

  /* ---------- the sheet ---------- */
  /* opts.leave names what the Leave button does: Pause and ride (scenes), Back to the city (rooms), Keep it in my bag (parcels) */
  UI.open = function (title, sub, backdrop, opts) {
    opts = opts || {};
    if (window.Kit && Kit.dropRadio) Kit.dropRadio(); /* AUDR3-04: a radio link never plays under this */
    lastFocus = document.activeElement;
    $('sheetTitle').textContent = title || '';
    $('sheetSub').textContent = sub || '';
    UI.backdrop(backdrop);
    $('sheet').classList.remove('hidden');
    /* SD-02: a card with its own way out (the parcel card's Put it in my bag) shows no second exit */
    $('sheetLeave').classList.toggle('hidden', !!opts.noLeave);
    $('sheetLeave').textContent = opts.leave || 'Back to the city';
    histReset();
    UI.letterbox();
  };
  /* ---------- item 5: a way back in a sheet. Every screen shown in this visit is kept; Back shows an earlier one,
     read-only (an answered question shows its result and records nothing new); Forward returns to now. ---------- */
  var hist = [], histAt = -1, liveFrag = null, liveLook = null, soFar = [], takenBack = false;
  function histReset() { takenBack = false; hist = []; histAt = -1; liveFrag = null; liveLook = null; soFar = []; $('soFar').hidden = true; $('soFar').innerHTML = ''; $('sheetSoFar').setAttribute('aria-pressed', 'false'); sheetTools(); }
  function sheetTools() { $('sheetBack').hidden = !hist.length; $('sheetSoFar').hidden = soFar.length < 2; }
  function snapshotLive() {
    var t = $('talk'); if (!t.innerHTML.trim()) return;
    hist.push({ html: t.innerHTML, cls: t.className, cols: t.style.gridTemplateColumns }); if (hist.length > 60) hist.shift();
    sheetTools();
  }
  function restoreLive() {
    if (histAt === -1) return; var t = $('talk'); histAt = -1;
    t.innerHTML = ''; if (liveFrag) t.appendChild(liveFrag); liveFrag = null;
    if (liveLook) { t.className = liveLook.cls; t.style.gridTemplateColumns = liveLook.cols; }
    var go = t.querySelector('.btn.go:not([disabled])'); if (go) try { go.focus({ preventScroll: true }); } catch (e) {}
  }
  function showHist() {
    var h = hist[histAt], t = $('talk');
    t.className = h.cls + ' histView'; t.style.gridTemplateColumns = h.cols; t.innerHTML = h.html;
    Array.prototype.forEach.call(t.querySelectorAll('.actions, .readMe, .cardTools, .recRow'), function (a) { a.remove(); });
    Array.prototype.forEach.call(t.querySelectorAll('button, input, select, textarea'), function (el) { el.disabled = true; });
    Array.prototype.forEach.call(t.querySelectorAll('.cards[hidden], [hidden].opts'), function (el) { el.hidden = false; });
    var body = t.querySelector('.body') || t;
    body.insertAdjacentHTML('beforeend', '<div class="actions histNav"><span class="hint">Earlier in this visit (' + (histAt + 1) + ' of ' + (hist.length + 1) + '). Nothing here changes your answers.</span>' + (histAt > 0 ? '<button class="btn small" type="button" data-h="back">Back</button>' : '') + '<button class="btn go" type="button" data-h="fwd">' + (histAt === hist.length - 1 ? 'Back to now' : 'Forward') + '</button></div>');
    Array.prototype.forEach.call(t.querySelectorAll('[data-h]'), function (b) { b.addEventListener('click', function () { if (b.getAttribute('data-h') === 'back') UI.back(); else UI.forward(); }); });
    var f = t.querySelector('[data-h="fwd"]'); if (f) try { f.focus({ preventScroll: true }); } catch (e) {}
    if (VO()) VO().stop();
  }
  UI.back = function () {
    if (!hist.length || $('sheet').classList.contains('hidden')) return false;
    var t = $('talk');
    if (histAt === -1) { liveLook = { cls: t.className, cols: t.style.gridTemplateColumns }; liveFrag = document.createDocumentFragment(); while (t.firstChild) liveFrag.appendChild(t.firstChild); histAt = hist.length - 1; }
    else if (histAt > 0) histAt--; else return false;
    showHist(); return true;
  };
  UI.forward = function () { if (histAt === -1) return false; if (histAt < hist.length - 1) { histAt++; showHist(); } else restoreLive(); return true; };
  UI.viewingHistory = function () { return histAt !== -1; };
  function noteSoFar(who, text, facts) {
    soFar.push({ who: who, text: text, facts: facts || [] }); sheetTools();
    if (!$('soFar').hidden) drawSoFar();
  }
  function drawSoFar() {
    $('soFar').innerHTML = soFar.map(function (x) { return '<p>' + (x.who ? '<b>' + esc(x.who === 'you' ? 'You' : FCV.nameOf(x.who)) + ':</b> ' : '') + esc(x.text || '') + (x.facts.length ? ' <i>(' + x.facts.map(function (f) { var r = FCV.resolve(f); return esc(r ? (UI.plainFigure(r.figure) || FCV.firstSentence(r.text || r.q || '')) : ''); }).join('; ') + ')</i>' : '') + '</p>'; }).join('');
  }
  $('sheetBack').addEventListener('click', function () { UI.back(); });
  $('sheetSoFar').addEventListener('click', function () { var p = $('soFar'), open = p.hidden; p.hidden = !open; $('sheetSoFar').setAttribute('aria-pressed', open ? 'true' : 'false'); if (open) drawSoFar(); });
  UI.backdrop = function (key) {
    var bg = $('sheetBg'); bg.innerHTML = ''; bg.style.backgroundImage = '';
    if (!key) return;
    if (FCV.isVideo(key) && SET().autoplay && !SET().reduceMotion && FCV.assets[key]) {
      var v = document.createElement('video'); v.muted = true; v.loop = false; v.playsInline = true; v.autoplay = true; v.setAttribute('playsinline', '');
      v.src = FCV.assets[key]; v.onerror = function () { bg.innerHTML = ''; bg.style.backgroundImage = 'url(' + FCV.assetUrl(FCV.videoFallback[key]) + ')'; };
      bg.appendChild(v); try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    } else { var u = FCV.isVideo(key) ? FCV.assetUrl(FCV.videoFallback[key]) : FCV.assetUrl(key); if (u) bg.style.backgroundImage = 'url(' + u + ')'; }
  };
  UI.close = function () {
    /* A line still waiting when the sheet closes is left, never resolved: the flow behind it ends as a Leave. */
    var p = pending; pending = null;
    if (VO()) VO().stop();
    histAt = -1; liveFrag = null; histReset();
    $('sheet').classList.add('hidden'); $('talk').innerHTML = ''; $('sheetBg').innerHTML = ''; UI.letterbox();
    if (p) { try { p.reject(UI.LEAVE); } catch (e) {} }
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
    if (window.Game) Game.afterUI();
  };
  $('sheetLeave').addEventListener('click', function () { if (pending) { var p = pending; pending = null; p.reject(UI.LEAVE); } });
  function render(who, html, extraClass) {
    var t = $('talk');
    restoreLive(); snapshotLive();
    t.className = 'talk' + (extraClass ? ' ' + extraClass : '');
    t.innerHTML = (who ? UI.porHTML(who) : '<div></div>') + '<div class="body">' + (who ? '<div class="who" style="color:' + UI.speakerColour(who) + '">' + esc(FCV.nameOf(who)) + '<span class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>' : '') + html + '</div>';
    if (!who) t.style.gridTemplateColumns = '1fr'; else t.style.gridTemplateColumns = '';
    t.scrollTop = 0;
    if (who && ST() && !ST().cuts['card:' + who] && who !== 'you') { ST().cuts['card:' + who] = 1; var por = t.querySelector('.por'); if (por && !SET().reduceMotion) por.classList.add('slam'); }
    var go = t.querySelector('.btn.go'); if (go) { try { go.focus({ preventScroll: true }); } catch (e) {} }
  }
  /* item 54: the same speaker colours as the films */
  var SPKC = { marigold: '#ffd166', vera: '#ff8a3d', dr_tally: '#19c2b0', prof_kerbstone: '#b48cff', animal: '#c9a46a', you: '#fff3e0', digits: '#3dd6c6', sam: '#9be15d' };
  UI.speakerColour = function (who) { return SPKC[who] || '#ff9ec7'; };
  function wait(bind) {
    return new Promise(function (resolve, reject) {
      pending = { resolve: resolve, reject: reject };
      bind(function (v) { if (pending && pending.resolve === resolve) { pending = null; resolve(v); } });
    });
  }
  function on(sel, fn) { Array.prototype.forEach.call($('talk').querySelectorAll(sel), function (el) { el.addEventListener('click', function (e) { fn(el, e); }); }); }
  UI.on = on;

  /* Typewriter at the chosen text speed; a tap finishes the line first. */
  var CPS = { slow: 28, normal: 60, fast: 140, instant: 0 }, typing = null;
  function typeInto(el, text, done) {
    var speed = CPS[SET().textSpeed] || 0;
    if (!speed || SET().reduceMotion) { el.textContent = text; done(); return function () {}; }
    var i = 0, stop = false;
    var tick = function () { if (stop) return; if (document.hidden) { setTimeout(tick, 200); return; } i = Math.min(text.length, i + Math.max(1, Math.round(speed / 30)) * (typing && typing.ff ? 4 : 1)); el.textContent = text.slice(0, i); if (i < text.length) setTimeout(tick, 33); else done(); };
    tick();
    return function () { stop = true; el.textContent = text; done(); };
  }

  /* One spoken line, with any fact cards it names. opts.key marks it as seen for Skip seen dialogue. */
  UI.say = function (who, line, opts) {
    opts = opts || {};
    var facts = opts.fact ? (Array.isArray(opts.fact) ? opts.fact : [opts.fact]) : [];
    var seen = opts.key && ST() && ST().lines[opts.key];
    var html = (line ? '<div class="line" aria-live="polite"></div>' : '') +
      (opts.direction ? '<div class="dir">(' + esc(opts.direction) + ')</div>' : '') +
      (opts.held ? '<div class="held">Held by the author, available on request</div>' : '') +
      '<div class="cards" hidden>' + facts.map(function (f) { return UI.cardHTML(f, { compact: opts.compact, hideLoc: opts.hideLoc, hideLabel: opts.hideLabel }); }).join('') + (opts.extra || '') + '</div>' +
      '<div class="actions"><span class="hint">' + esc(opts.hint || UI.nextHint(opts.next)) + '</span>' +
      (SET().skipSeen && seen ? '<button class="btn small" type="button" data-skip="1">Skip seen</button>' : '') +
      '<button class="btn small hearAgain" type="button" data-hear="1" hidden>Hear it again</button>' +
      '<button class="btn go" type="button">' + esc(opts.next || 'Next') + '</button></div>';
    render(who, html);
    noteSoFar(who, line, facts);
    if (window.SFX) SFX.blip();
    var t = $('talk'), lineEl = t.querySelector('.line'), cards = t.querySelector('.cards'), typed = !line;
    var finish = function () { typed = true; cards.hidden = false; if (typing && typing.el === lineEl) typing = null; };
    typing = line ? { el: lineEl, seen: !!seen, ff: false } : null;
    var stopType = line ? typeInto(lineEl, line, finish) : (finish(), function () {});
    if (typing) typing.stop = stopType;
    if (seen && SET().skipSeen) stopType();
    if (opts.key && ST()) ST().lines[opts.key] = 1;
    var vk = UI.voiceKey(opts.key);
    /* item 49: Marigold's words light up as she reads them; item 54: a waveform beside the name while a voice plays */
    var wordT = null;
    var waveOn = function (v) { var w = t.querySelector('.wave'); if (w) w.classList.toggle('on', v); };
    var lightWords = function (secs) {
      if (!lineEl || SET().reduceMotion || !t.contains(lineEl)) return; stopType();
      lineEl.innerHTML = String(line).split(/(\s+)/).map(function (w) { return /\s+/.test(w) ? w : '<span class="w">' + esc(w) + '</span>'; }).join('');
      var ws = lineEl.querySelectorAll('.w'), n = ws.length, t0 = Date.now(), total = Math.max(1, secs * 1000 / ((ST() && ST().settings.audio && ST().settings.audio.voiceRate) || 1));
      clearInterval(wordT); wordT = setInterval(function () { if (!t.contains(lineEl)) { clearInterval(wordT); return; } var k = Math.floor((Date.now() - t0) / (total / n)); for (var q = 0; q < n; q++) ws[q].classList.toggle('on', q <= k); if (k >= n) clearInterval(wordT); }, 110);
    };
    var hear = t.querySelector('[data-hear]');
    var lineItem = line && who !== 'you' ? { key: vk, text: line, speaker: who || null, pri: who ? 'scene' : 'card', asked: true,
      onStart: function (e) { if (!t.contains(lineEl)) return; waveOn(true); if (hear) hear.hidden = false; if (e && e.speaker === 'marigold') lightWords(e.duration || 4); },
      after: function (r) { clearInterval(wordT); waveOn(false); if (!r.played && who && SET().family && window.Sound && UI.babbleOn()) Sound.babble(who); } } : null;
    if (!opts.noVoice) {
      var items = [];
      if (lineItem) items.push(lineItem);
      facts.forEach(function (f) { var ci = cardItem(f); if (ci) items.push(ci); });
      if (items.length && VO()) speak(items); else if (who && who !== 'you' && line && SET().family && window.Sound && UI.babbleOn()) Sound.babble(who);
    }
    /* item 38: Hear it again, for a line that has its own recording */
    if (hear && lineItem && VO() && (vk || (VO().textClip && VO().textClip(line)))) hear.hidden = false;
    if (hear) hear.addEventListener('click', function () { if (VO() && lineItem) VO().say(Object.assign({}, lineItem, { after: null })); });
    return wait(function (done) {
      on('.btn.go', function () { if (!typed) { stopType(); return; } clearInterval(wordT); if (window.Sound) Sound.stopVoice(); done(true); });
      on('[data-skip]', function () { done('skip'); });
    });
  };

  /* item 15: the family-mode babble has its own switch (off unless chosen) and is silent whenever sound is muted */
  UI.babbleOn = function () { var s = SET(), a = s.audio || {}; return !!s.babble && !a.muted && !(a.master === 0); };
  /* The voice clip key for a spoken line: act scenes, turning points and Locker rooms by script path. */
  UI.voiceKey = function (key) {
    var m; if (!key) return null;
    if ((m = /^act(\d):tp:(\d+)$/.exec(key))) return 'act' + m[1] + '.turning_point.lines[' + m[2] + ']';
    if ((m = /^act(\d):([\d.]+):(\d+)$/.exec(key))) { var a = FCV.data.script.acts[+m[1] - 1], ix = -1; a.scenes.forEach(function (s, i) { if (s.id === m[2]) ix = i; }); return ix < 0 ? null : 'act' + m[1] + '.scenes[' + ix + '].lines[' + m[3] + ']'; }
    if ((m = /^room:([^:]+):(\d+)$/.exec(key))) { var rooms = FCV.data.script.evidence_locker.rooms, ri = -1; rooms.forEach(function (r, i) { if (r.id === m[1]) ri = i; }); return ri < 0 ? null : 'locker.rooms[' + ri + '].lines[' + m[2] + ']'; }
    return null;
  };
  function progHTML(prog) {
    if (!prog) return '';
    return '<div class="progress" aria-hidden="true">' + prog.map(function (p) { return '<i class="' + (p === 1 ? 'd' : p === 2 ? 'n' : '') + '"></i>'; }).join('') + '</div>';
  }
  /* A multiple-choice item from the source files. Resolves true if right. */
  UI.quiz = function (id, opts) {
    opts = opts || {};
    var r = typeof id === 'string' ? FCV.resolve(id) : id;
    /* a data item whose right answer stands out by length is never shown as a pick: say it, reveal, tick */
    if (r && !opts.noGate && (typeof id === 'string' || r.recallOnly || opts.gate) && FCV.gated(r)) {
      var hl = UI.heldLabel(typeof id === 'string' ? id : r.id, r);
      return UI.sayAloud(opts.who || null, r.q, [{ title: 'The thesis says', text: FCV.revealText(r), checkText: r.options[r.answer], loc: r.loc }],
        { wake: 3, cardHTML: progHTML(opts.progress) + (opts.framing ? '<div class="line">' + esc(opts.framing) + '</div>' : '') + (hl ? '<div class="held">' + esc(hl) + '</div>' : '') })
        .then(function (rt) { UI.lastSure = false; if (rt === 'skip') { UI.skipNext = Date.now(); return false; } if (opts.onAnswer) opts.onAnswer(rt !== 'missed', false); return rt !== 'missed'; });
    }
    /* Every showing redraws the option order; options in a set are identical in size, colour and motion. */
    var order = opts.keepOrder ? r.options.map(function (o, i) { return i; }) : FCV.shuffle(r.options.map(function (o, i) { return i; }));
    var exam = !!opts.exam, think = exam ? (opts.think || 4) : 0;
    var html = progHTML(opts.progress) + (opts.framing ? '<div class="line">' + esc(opts.framing) + '</div>' : '') +
      '<div class="q">' + esc(r.q) + '</div>' + (exam ? '<div class="thinkFirst dir" aria-live="polite">Think first: say your answer in your head. The options open in ' + think + ' s.</div>' : '') +
      '<div class="opts equal" role="group" aria-label="Answers"' + (exam ? ' hidden' : '') + '>' +
      order.map(function (oi, i) { return '<button class="opt" type="button" data-i="' + oi + '"><span class="k">' + (i + 1) + '</span><span>' + esc(r.options[oi]) + '</span></button>'; }).join('') +
      '</div>' + (exam ? '<label class="tick sureBox" hidden><input type="checkbox" id="sureBox"> <span>I am sure</span></label>' : '') + '<div class="fb" aria-live="polite"></div>';
    render(opts.who || null, html);
    noteSoFar(opts.who || null, r.q, []);
    speak([].concat(opts.framing ? [{ text: opts.framing, speaker: opts.who || null, pri: 'card' }] : [], [{ text: r.q, speaker: opts.who || null, pri: 'card' }]));
    if (window.Family) Family.dockSleep(true);
    var takeBack = !exam && !opts.noUndo && !takenBack && !/Waiting Room/i.test($('sheetTitle').textContent);
    if (exam) { var tt = $('talk'), n0 = think, tf = tt.querySelector('.thinkFirst'); var iv = setInterval(function () { if (document.hidden) return; if (!tt.contains(tf)) { clearInterval(iv); return; } n0--; if (n0 <= 0) { clearInterval(iv); tf.textContent = 'Pick your answer. Tick "I am sure" first if you are.'; tt.querySelector('.opts').hidden = false; tt.querySelector('.sureBox').hidden = false; } else tf.textContent = 'Think first: say your answer in your head. The options open in ' + n0 + ' s.'; }, 1000); }
    return wait(function (done) {
      var answered = false;
      on('.opt', function (el) {
        if (answered || el.closest('[hidden]')) return; answered = true;
        var sureEl = $('talk').querySelector('#sureBox'), sure = !!(sureEl && sureEl.checked);
        if (window.Family) Family.dockSleep(false);
        var i = +el.getAttribute('data-i'), right = i === r.answer;
        var before = !right && takeBack && ST() ? { mem: JSON.stringify(ST().mem), stars: ST().stars } : null;
        Array.prototype.forEach.call($('talk').querySelectorAll('.opt'), function (b) { b.disabled = true; if (+b.getAttribute('data-i') === r.answer) { b.classList.add('right'); b.insertAdjacentHTML('beforeend', '<span class="mark" aria-label="right answer">RIGHT</span>'); } });
        if (!right) { el.classList.add('wrong'); el.insertAdjacentHTML('beforeend', '<span class="mark" aria-label="your answer, wrong">YOURS</span>'); }
        if (window.Juice) Juice[right ? 'right' : 'wrong'](el, $('talk').querySelector('.opt.right')); else if (window.SFX) (right ? SFX.right : SFX.wrong)();
        if (opts.onAnswer) opts.onAnswer(right, sure);
        UI.lastSure = sure;
        if (right && window.Family && Family.maybeJob) Family.maybeJob(opts.job);
        var fb = $('talk').querySelector('.fb');
        fb.innerHTML = '<div class="verdict ' + (right ? 'r' : 'w') + '"><span class="verdictStamp ' + (right ? 'r' : 'w') + '">' + (right ? esc(opts.rightWord || 'Right') : esc(opts.wrongWord || 'Not quite')) + '</span></div>' +
          UI.skimHTML('Why', r.explanation, r.loc, !right) + (UI.heldLabel(r.id, r) ? '<div class="held">' + esc(UI.heldLabel(r.id, r)) + '</div>' : '') +
          '<div class="actions"><button class="btn go" type="button">' + esc(opts.next || 'Next') + '</button></div>';
        UI.announce(right ? 'Right.' : 'Not quite. The right answer is marked.');
        speak([{ text: r.explanation, speaker: opts.who || null, pri: 'card' }]);
        var go = fb.querySelector('.btn.go'); go.addEventListener('click', function () { if (VO()) VO().stop(); done(right); });
        try { go.focus({ preventScroll: true }); } catch (e) {}
        fb.scrollIntoView({ block: 'nearest' });
        /* item 28: a wrong pick can be taken back for 3 s, once a visit: its memory and heat are undone and he answers again */
        if (before) {
          var tb = document.createElement('button'); tb.className = 'btn small takeBack'; tb.type = 'button'; tb.textContent = 'Misclick? Take it back';
          fb.querySelector('.actions').insertBefore(tb, go);
          var tbT = setTimeout(function () { tb.remove(); }, 3000);
          tb.addEventListener('click', function () {
            clearTimeout(tbT); takenBack = true; var st = ST(); st.mem = JSON.parse(before.mem); st.stars = before.stars; if (window.Game) { Game.save(); Game.hud(); }
            answered = false; fb.innerHTML = '';
            Array.prototype.forEach.call($('talk').querySelectorAll('.opt'), function (b) { b.disabled = false; b.classList.remove('right', 'wrong'); Array.prototype.forEach.call(b.querySelectorAll('.mark'), function (m) { m.remove(); }); });
            UI.announce('Taken back. Pick again.');
          });
        }
      });
    });
  };

  /* Pick the best of several replies, see the named error, then the full model answer. */
  UI.choose = function (who, lead, questionHTML, choices, reveal, opts) {
    opts = opts || {};
    var cs = FCV.shuffle(choices.map(function (c, i) { return { c: c, i: i }; }));
    var html = (opts.cardHTML || '') + (lead ? '<div class="line">' + esc(lead) + '</div>' : '') + (questionHTML || '') +
      '<div class="dir">Pick your answer.</div><div class="opts" role="group" aria-label="Replies">' +
      cs.map(function (x, j) { return '<button class="opt" type="button" data-j="' + j + '"><span class="k">' + (j + 1) + '</span><span>' + esc(x.c.text) + '</span></button>'; }).join('') +
      '</div><div class="fb" aria-live="polite"></div>';
    render(who, html);
    (function () { var qe = $('talk').querySelector('.q, .card .txt.q'), it = []; if (lead) it.push({ text: lead, speaker: who, pri: 'scene' }); if (qe) it.push({ text: qe.textContent, speaker: who, pri: 'scene' }); speak(it); })();
    if (window.Family) Family.dockSleep(true);
    return wait(function (done) {
      var answered = false;
      on('.opt', function (el) {
        if (answered) return; answered = true;
        var j = +el.getAttribute('data-j'), pick = cs[j].c, right = !!pick.best;
        Array.prototype.forEach.call($('talk').querySelectorAll('.opt'), function (b, k) { b.disabled = true; if (cs[k].c.best) { b.classList.add('right'); b.insertAdjacentHTML('beforeend', '<span class="mark">BEST</span>'); } });
        if (!right) el.classList.add('wrong');
        if (window.Juice) Juice[right ? 'right' : 'wrong'](el, null); else if (window.SFX) (right ? SFX.right : SFX.wrong)();
        if (opts.onAnswer) opts.onAnswer(right, pick);
        UI.lastPick = pick;
        if (window.Family) Family.dockSleep(false);
        var label = pick.error ? '<span class="errTag">' + esc(pick.error) + '</span>' : '';
        var fb = $('talk').querySelector('.fb');
        fb.innerHTML = '<div class="verdict ' + (right ? 'r' : 'w') + '">' + (right ? 'Strong answer' : 'Weak answer') + ' ' + label + '</div>' +
          (pick.feedback ? '<div class="answer">' + esc(pick.feedback) + '</div>' : '') + '<div class="revealBox"></div>' +
          '<div class="actions"><button class="btn go" type="button">Show the full answer</button></div>';
        UI.announce(right ? 'Strong answer.' : 'Weak answer. ' + (pick.error || ''));
        if (pick.feedback) speak([{ text: pick.feedback, speaker: who, pri: 'scene' }]);
        var go = fb.querySelector('.btn.go');
        go.addEventListener('click', function () {
          if (go.dataset.step === '2') { if (VO()) VO().stop(); done(right); return; }
          fb.querySelector('.revealBox').innerHTML = typeof reveal === 'string' ? reveal : '';
          speak(Array.prototype.map.call(fb.querySelectorAll('.revealBox .answer'), function (a) { return { text: skimText(a), speaker: null, pri: 'card' }; }));
          go.textContent = opts.next || 'Next'; go.dataset.step = '2';
          try { go.focus({ preventScroll: true }); } catch (e) {}
        });
        try { go.focus({ preventScroll: true }); } catch (e) {}
      });
    });
  };

  /* ---------- say it aloud, reveal, point-check ---------- */
  var rec = { stream: null, mr: null, chunks: [], url: null, denied: false };
  function recordHTML() {
    /* SD-22: off unless Settings > Reading > Record yourself is on; then a small mic button, its note in the tooltip */
    if (!SET().recordSelf || rec.denied || !window.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return '';
    return '<div class="recRow"><button class="btn small micBtn" type="button" data-rec="1" aria-label="Record yourself. Stays on this screen only, never saved or sent." title="Record yourself. Stays on this screen only, never saved or sent."><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1A7 7 0 0 0 19 12z"/></svg></button></div>';
  }
  function bindRecord() {
    var b = $('talk').querySelector('[data-rec]'); if (!b) return;
    b.addEventListener('click', function () {
      if (rec.mr && rec.mr.state === 'recording') { rec.mr.stop(); return; }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        rec.stream = stream; rec.chunks = []; rec.mr = new MediaRecorder(stream);
        rec.mr.ondataavailable = function (e) { rec.chunks.push(e.data); };
        rec.mr.onstop = function () {
          if (window.Kit) Kit.sfx('SFX-RECORD', false);
          stream.getTracks().forEach(function (t) { t.stop(); });
          if (rec.url) URL.revokeObjectURL(rec.url);
          rec.url = URL.createObjectURL(new Blob(rec.chunks)); b.textContent = 'Record again';
          var row = b.parentNode, old = row.querySelector('audio'); if (old) old.remove();
          var au = document.createElement('audio'); au.controls = true; au.src = rec.url; row.appendChild(au);
        };
        rec.mr.start(); b.textContent = 'Stop recording'; if (window.Kit) Kit.sfx('SFX-RECORD', true);
      }).catch(function () { rec.denied = true; b.parentNode.remove(); UI.toast('Recording is not available here. Say it aloud instead.', 3000); });
    });
  }
  /* Resolves 'nailed' | 'partly' | 'missed'. reveal: [{title, text, loc, cardId}] built from ids or text. */
  UI.sayAloud = function (who, prompt, reveal, opts) {
    opts = opts || {};
    var wake = opts.wake === undefined ? 5 : opts.wake;
    var html = (opts.cardHTML || '') + '<div class="line">' + esc(prompt) + '</div>' + (opts.questionHTML || '') +
      '<div class="dir">Say it aloud, as you would in the room. Then reveal and tick what you said.</div>' + recordHTML() +
      '<div class="fb"><div class="actions">' + (opts.noSkip ? '' : '<button class="btn small" type="button" data-sk="1">Skip for now</button>') +
      '<button class="btn go" type="button" disabled>' + (wake ? 'Think... ' + wake : 'Reveal the answer') + '</button></div></div>';
    render(who, html);
    noteSoFar(who, prompt, []);
    bindRecord();
    speak([{ text: prompt, speaker: who, pri: who && who !== 'you' ? 'scene' : 'card' }]);
    if (window.Family) Family.dockSleep(true);
    var t = $('talk'), go = t.querySelector('.btn.go'), n = wake;
    /* the Reveal countdown waits while the tab is hidden */
    var timer = setInterval(function () { if (document.hidden) return; n--; if (n <= 0) { clearInterval(timer); go.disabled = false; go.textContent = 'Reveal the answer'; } else go.textContent = 'Think... ' + n; }, 1000);
    if (!wake) { clearInterval(timer); go.disabled = false; }
    return wait(function (done) {
      /* item 21: Skip for now records nothing; the item comes back later */
      var sk = t.querySelector('[data-sk]'); if (sk) sk.addEventListener('click', function () { clearInterval(timer); if (VO()) VO().stop(); UI.skipNext = Date.now(); done('skip'); });
      go.addEventListener('click', function () {
        var fb = t.querySelector('.fb');
        var parts = reveal.map(function (r) {
          var boxes = FCV.pointCheck(r.checkText || r.text);
          return { r: r, boxes: boxes };
        });
        var allBoxes = [];
        fb.innerHTML = parts.map(function (p, pi) {
          var b = p.boxes.map(function (bx, bi) { allBoxes.push(pi + ':' + bi); return '<label class="tick"><input type="checkbox" data-b="' + pi + ':' + bi + '"> <span>' + UI.boldFigures(bx.text) + '</span></label>'; }).join('');
          return (p.r.cardId ? UI.cardHTML(p.r.cardId) : UI.skimHTML(p.r.title || 'Model answer', p.r.text, p.r.loc, false)) +
            (opts.unscored ? '' : '<div class="ticks"><div class="dir">Tick what you said:</div>' + b + '</div>');
        }).join('') + (rec.url ? '<div class="recRow"><span class="recNote">Your recording:</span><audio class="myRec" controls src="' + rec.url + '"></audio></div>' : '') +
          '<div class="actions"><button class="btn go" type="button">' + (opts.unscored ? 'Next' : 'Done') + '</button></div>';
        var g2 = fb.querySelector('.btn.go');
        try { g2.focus({ preventScroll: true }); } catch (e) {}
        speak(reveal.map(function (r) { var ci = r.cardId ? cardItem(r.cardId) : null; return ci || { text: r.text, speaker: null, pri: 'card' }; }));
        g2.addEventListener('click', function () {
          if (VO()) VO().stop();
          if (opts.unscored) { done('unscored'); return; }
          var rates = parts.map(function (p, pi) { return FCV.rateFromBoxes(p.boxes.map(function (bx, bi) { return t.querySelector('[data-b="' + pi + ':' + bi + '"]').checked; })); });
          var rank = { nailed: 2, partly: 1, missed: 0 }, worst = rates.reduce(function (a, b) { return rank[b] < rank[a] ? b : a; }, 'nailed');
          var ticked = t.querySelectorAll('[data-b]:checked').length, boxes = t.querySelectorAll('[data-b]').length;
          var finishIt = function () {
            UI.announce('Rated ' + worst + '.');
            if (window.Family) Family.dockSleep(false);
            if (window.Family && SET().family) Family.listenForNumber(parts.map(function (p) { return p.r; }));
            if (window.Juice) Juice[worst === 'missed' ? 'soft' : 'right'](g2);
            /* item 21: the verdict shows as a stamp for a second before the next screen */
            var acts = fb.querySelector('.actions'); if (acts) acts.innerHTML = '<span class="sayStamp ' + worst + '">' + ({ nailed: 'Nailed it', partly: 'Partly', missed: 'Missed it' })[worst] + '</span>';
            setTimeout(function () { done(worst); }, SET().reduceMotion ? 600 : 1000);
          };
          /* nothing ticked: ask before scoring it as missed */
          if (boxes && !ticked && !g2.dataset.asked) {
            g2.dataset.asked = '1';
            var ask = document.createElement('div'); ask.className = 'askTick'; ask.innerHTML = '<p class="dir">Nothing ticked. Missed it, or forgot to tick?</p><button class="btn small" type="button" data-ask="missed">Missed it</button> <button class="btn small go" type="button" data-ask="tick">Let me tick</button>';
            g2.parentNode.insertBefore(ask, g2); g2.hidden = true;
            ask.querySelector('[data-ask="missed"]').addEventListener('click', function () { ask.remove(); finishIt(); });
            ask.querySelector('[data-ask="tick"]').addEventListener('click', function () { ask.remove(); g2.hidden = false; var f1 = t.querySelector('[data-b]'); if (f1) try { f1.focus(); } catch (e) {} });
            return;
          }
          finishIt();
        });
      });
    });
  };
  /* Old-style reveal for items with free text only. */
  UI.reveal = function (who, lead, questionHTML, title, text, loc, opts) {
    return UI.sayAloud(who, lead || 'Answer it aloud.', [{ title: title, text: text, loc: loc }], Object.assign({ questionHTML: questionHTML, wake: 3 }, opts || {}));
  };

  /* Trace the number: which appendix and table does it come from? */
  UI.trace = function (id, lead, opts) {
    opts = opts || {};
    var r = FCV.resolve(id); var mc = FCV.traceOptions(id);
    var html = (lead ? '<div class="line">' + esc(lead) + '</div>' : '') +
      '<div class="card"><div class="lab">The number</div><div class="fig">' + esc(r.number) + '</div><div class="txt">Stated in: ' + esc(r.stated) + '</div></div>' +
      '<div class="q">Where does it come from?</div><div class="opts">' +
      mc.options.map(function (o, i) { return '<button class="opt" type="button" data-i="' + i + '"><span class="k">' + (i + 1) + '</span><span>' + esc(o) + '</span></button>'; }).join('') +
      '</div><div class="fb" aria-live="polite"></div>';
    render('digits', html);
    speak(lead ? [{ text: lead, speaker: 'digits', pri: 'scene' }] : []);
    return wait(function (done) {
      var answered = false;
      on('.opt', function (el) {
        if (answered) return; answered = true;
        var i = +el.getAttribute('data-i'), right = i === mc.answer;
        Array.prototype.forEach.call($('talk').querySelectorAll('.opt'), function (b, j) { b.disabled = true; if (j === mc.answer) b.classList.add('right'); });
        if (!right) el.classList.add('wrong');
        if (window.Juice) Juice[right ? 'right' : 'wrong'](el, null); else if (window.SFX) (right ? SFX.right : SFX.wrong)();
        if (opts.onAnswer) opts.onAnswer(right);
        var fb = $('talk').querySelector('.fb');
        fb.innerHTML = '<div class="verdict ' + (right ? 'r' : 'w') + '">' + (right ? 'Found it' : 'Wrong shelf') + '</div>' + UI.cardHTML(id) +
          '<div class="actions"><button class="btn go" type="button">Next</button></div>';
        var go = fb.querySelector('.btn.go'); go.addEventListener('click', function () { done(right); });
        try { go.focus({ preventScroll: true }); } catch (e) {}
      });
    });
  };

  /* A list of choices (room stages, menus). */
  UI.menu = function (who, line, items, opts) {
    opts = opts || {};
    var html = (line ? '<div class="line">' + esc(line) + '</div>' : '') + (opts.extra || '') + '<div class="hubList">' +
      items.map(function (it, i) {
        return '<button class="hubItem' + (it.done ? ' done' : '') + '" type="button" data-i="' + i + '"' + (it.disabled ? ' disabled' : '') + '><span>' + esc(it.label) +
          (it.sub ? '<br><small>' + esc(it.sub) + '</small>' : '') + '</span><span class="tick">' + esc(it.tag || (it.done ? 'DONE' : it.disabled ? 'LOCKED' : 'GO')) + '</span></button>';
      }).join('') + '</div>';
    render(who, html);
    speak(line && who !== 'you' ? [{ text: line, speaker: who, pri: 'scene' }] : []);
    return wait(function (done) { on('.hubItem', function (el) { if (!el.disabled) done(items[+el.getAttribute('data-i')].value); }); });
  };
  /* Free rendering for mechanics: html, then bind(done, el). */
  UI.custom = function (who, html, bind, cls) {
    render(who, html, cls);
    return wait(function (done) { bind(done, $('talk')); });
  };

  /* ---------- toast, banner, modal ---------- */
  /* item 4: toasts queue (each shows at least 1.8 s, none is overwritten); a toast with an action stays until it is
     tapped or 30 s pass; the last 30 of the session are kept for Menu > Recent, with their actions. */
  var toastT = null, toastQ = [], toastNow = null, recent = [];
  UI.recent = function () { return recent.slice(); };
  UI.addRecent = function (text, action) { recent.unshift({ at: Date.now(), text: String(text), action: action || null }); if (recent.length > 30) recent.pop(); };
  UI.toast = function (msg, ms, opt) {
    /* the old third argument was a retry count for waiting out a film */
    var o = opt && typeof opt === 'object' ? opt : {}, held = typeof opt === 'number' ? opt : (o.held || 0);
    if (!held) { recent.unshift({ at: Date.now(), text: String(msg), action: o.action || o.recentAction || null }); if (recent.length > 30) recent.pop(); }
    /* a toast never lands on a film: it waits (up to a minute) until the film has ended */
    var cut = $('cut');
    if (cut && !cut.classList.contains('hidden') && held < 150) { setTimeout(function () { UI.toast(msg, ms, Object.assign({}, o, { held: held + 1 })); }, 400); return; }
    /* QAD3-m8: on a phone the Hall has no free strip for a note: a new one waits (up to a minute) until the Hall closes */
    var hallOn = $('viva'); if (hallOn && !hallOn.classList.contains('hidden') && innerWidth < 560 && !o.action && held < 150) { setTimeout(function () { UI.toast(msg, ms, Object.assign({}, o, { held: held + 1 })); }, 400); return; }
    var item = { msg: String(msg), ms: Math.max(1800, ms || 2600), action: o.action || null, key: o.replace || null };
    /* QAD4-11b: a toast with a replace key (the T view switch) replaces the one showing with that key and any waiting */
    if (item.key) { toastQ = toastQ.filter(function (q) { return q.key !== item.key; }); if (toastNow && toastNow.key === item.key) { showToast(item); return; } }
    if (toastNow) {
      /* the same words twice in a row are shown once; a plain toast already shown 1.8 s gives way */
      if (toastNow.msg === item.msg || toastQ.some(function (q) { return q.msg === item.msg; })) return;
      toastQ.push(item);
      /* something is waiting: the one showing gives way once it has had 1.8 s (4 s for one with an action) */
      var need = toastNow.action ? 4000 : 1800, had = Date.now() - toastNow.at;
      if (had >= need) nextToast(); else { clearTimeout(toastT); toastT = setTimeout(nextToast, need - had); }
      return;
    }
    showToast(item);
  };
  function showToast(item) {
    var t = $('toast'); toastNow = Object.assign({ at: Date.now(), until: Date.now() + (item.action ? 30000 : item.ms) }, item);
    t.classList.toggle('act', !!item.action); t.classList.remove('listen');
    t.innerHTML = '<span>' + esc(item.msg) + '</span>' + (item.action ? '<button class="tAct" type="button">' + esc(item.action.label) + '</button>' : '');
    t.classList.remove('hidden'); t.style.opacity = '1';
    if (item.action) t.querySelector('.tAct').addEventListener('click', function (e) { e.stopPropagation(); var fn = item.action.fn; hideToast(); try { fn(); } catch (er) {} });
    if (VO() && VO().textClip(item.msg) && !VO().playing()) VO().say({ text: item.msg, pri: 'menu' });
    clearTimeout(toastT);
    /* with something waiting, a plain toast gives way after 1.8 s; an action toast after 30 s */
    var hold = item.action ? 30000 : toastQ.length ? Math.max(1800, Math.min(item.ms, 2400)) : item.ms;
    toastT = setTimeout(function () { if (toastQ.length) nextToast(); else hideToast(); }, hold);
  }
  function hideToast() {
    var t = $('toast'); clearTimeout(toastT); toastNow = null; t.style.opacity = '0';
    setTimeout(function () { if (!toastNow) { t.classList.add('hidden'); t.classList.remove('act'); } if (toastQ.length && !toastNow) showToast(toastQ.shift()); }, 320);
  }
  function nextToast() { clearTimeout(toastT); if (!toastQ.length) { hideToast(); return; } showToast(toastQ.shift()); }
  UI.toastNow = function () { return toastNow ? toastNow.msg : null; };
  /* a film starting while a plain toast shows: the toast steps aside and comes back when the film ends */
  UI.toastAsideForFilm = function () {
    var t = $('toast'); if (!toastNow || !t || t.classList.contains('hidden') || toastNow.action) return;
    var left = toastNow.until - Date.now(), msg = toastNow.msg; toastNow = null; clearTimeout(toastT); t.style.opacity = '0'; t.classList.add('hidden');
    if (left > 700) UI.toast(msg, Math.max(2000, left), { held: 1 });
    else if (toastQ.length) { var q = toastQ.shift(); UI.toast(q.msg, q.ms, { held: 1, action: q.action }); }
  };
  UI.banner = function (title, sub, fail) {
    var b = $('banner');
    b.innerHTML = '<div class="inner"><h2 class="' + (fail ? 'fail' : '') + '">' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
    b.classList.remove('hidden');
    if (window.Kit) { if (fail || /not yet|not passed|return to sender/i.test(title)) { Kit.sting('MUS-STING-RETRY'); Kit.flag('failed'); } else if (/passed|cleared|secured|delivered/i.test(title)) { Kit.sting('MUS-STING-DELIVERED'); Kit.flag('passed'); } }
    if (VO() && VO().textClip(title)) VO().say({ text: title, pri: 'menu' });
    UI.announce(title + (sub ? '. ' + sub : ''));
    if (window.SFX) (fail ? SFX.failed : SFX.passed)();
    return new Promise(function (res) { setTimeout(function () { b.classList.add('hidden'); res(); }, 2650); });
  };
  /* D1-M1: one hold-to-confirm for every destructive button. It fires only when the press that started it is let go on
     the same button after the full second: a key coming up somewhere else, focus moving (Tab), the pointer leaving, another
     key, a hidden tab or the window losing focus all cancel it. A click, or Enter or Space on their own, never fire it. */
  UI.swallowClick = function (ms) {
    var done = false, off = function () { if (done) return; done = true; window.removeEventListener('click', eat, true); };
    var eat = function (e) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); off(); };
    window.addEventListener('click', eat, true); setTimeout(off, ms || 700);
  };
  UI.holdButton = function (el, fn, ms) {
    ms = ms || 1000;
    var fill = el.querySelector('i.fill'); if (!fill) { fill = document.createElement('i'); fill.className = 'fill'; el.appendChild(fill); }
    var by = null, t0 = 0, ready = false, tm = null, need = ms;
    var famKey = function () { var st = ST(); return !!(st && st.settings && st.settings.family); };
    var onDocKey = function (e) { if (by && e.target !== el && e.key !== 'Shift') reset(); };
    var onVis = function () { if (document.hidden) reset(); };
    var attach = function () { document.addEventListener('keyup', onDocKey, true); document.addEventListener('keydown', onDocKey, true); document.addEventListener('visibilitychange', onVis); window.addEventListener('blur', reset); };
    var detach = function () { document.removeEventListener('keyup', onDocKey, true); document.removeEventListener('keydown', onDocKey, true); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('blur', reset); };
    function reset() { clearTimeout(tm); tm = null; by = null; ready = false; fill.style.transition = 'none'; fill.style.width = '0'; el.classList.remove('holdReady'); detach(); }
    /* FD4-02: in family mode a finger or mouse hold lasts 2.5 s (a child's random long press lasts 1 to 1.6 s); the ring
       fills over the whole hold. Shift+Enter on the keyboard keeps its own length. */
    var start = function (kind) {
      if (by) return; by = kind; t0 = performance.now(); ready = false; need = kind === 'pointer' && famKey() ? Math.max(ms, 2500) : ms;
      fill.style.transition = 'none'; fill.style.width = '0'; void fill.offsetWidth; fill.style.transition = 'width ' + need / 1000 + 's linear'; fill.style.width = '100%';
      tm = setTimeout(function () { ready = true; el.classList.add('holdReady'); }, need); attach();
    };
    var release = function (kind) {
      var ok = by === kind && ready && performance.now() - t0 >= need && (kind === 'pointer' || document.activeElement === el) && document.body.contains(el);
      reset();
      /* D2-M2: a finger lifting fires the hold; the screen may redraw under that finger, so the tap's own click that
         follows (anywhere) is swallowed for 700 ms and can never press what was drawn in its place (Put it back). */
      if (ok && kind === 'pointer') UI.swallowClick(700);
      if (ok) fn();
    };
    /* QAD3-M1 (family): a finger that slides off the button cancels the hold. A touch is captured by the button it lands
       on, so the capture is released at once (pointerleave then fires), any move more than 8 px outside the button
       cancels, and a finger lifted outside it never fires. */
    var inside = function (e) { var r = el.getBoundingClientRect(), x = e.clientX, y = e.clientY; return x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8; };
    el.addEventListener('pointerdown', function (e) { if (e.button > 0) return; e.preventDefault(); try { if (el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); } catch (_) {} start('pointer'); });
    el.addEventListener('pointermove', function (e) { if (by === 'pointer' && !inside(e)) reset(); });
    el.addEventListener('pointerup', function (e) { if (by === 'pointer' && inside(e)) release('pointer'); else reset(); });
    el.addEventListener('pointerleave', function () { if (by === 'pointer') reset(); });
    el.addEventListener('pointercancel', reset);
    el.addEventListener('blur', reset); el.addEventListener('focusout', reset);
    /* QAD3-M2: in family mode a keyboard hold needs Shift as well (Shift+Enter or Shift+Space, as the Shift+R label says),
       so a child mashing keys can never fire one; a pointer hold works as before */
    var toldK = 0;
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) { if (by && by !== 'key') reset(); else if (famKey() && !e.shiftKey) { reset(); if (Date.now() - toldK > 3000) { toldK = Date.now(); UI.toast('Family mode: hold it with a finger or the mouse, or hold Shift and Enter.', 2400); } } else start('key'); } } else if (by && !(e.key === 'Shift' && by === 'key')) reset(); });
    el.addEventListener('keyup', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (by === 'key') release('key'); else reset(); } });
    el.addEventListener('click', function (e) { e.preventDefault(); });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    return reset;
  };
  /* ND2 (round 5) and ND6 (round 6): in family mode nothing that writes to the learning record (memory, the struggled list,
     Notebook notes, the Waiting Room's answers, viva results, stamps) can be pressed from the keyboard: not Enter or Space
     on it, not a number key, not Enter pressing a sheet's go button. Those controls are one list, UI.ANSWER, and count only
     from a tap or a click (the hold buttons keep their holds):
       .opt               a choice: quizzes, the Hall, UI.choose, traces, parcels, mini-games, the falsifier
       .pickable          a tile, bin, lever, term, cut or order step in a mission or drill (not the co-pilot's Dot patrol)
       .tile[data-id]     an exhibit in the Act 4 trial
       .ticks input       a say-aloud tick box (it sets the rating a Done then records)
       .ticks ~ .actions .btn, [data-ask]   a say-aloud's Done, and its "Missed it" / "Let me tick"
       #vivaInner [data-s], #vivaInner [data-f]   the Hall's Said it, and a follow-up's Answered it well / I struggled
       [data-answer]      any control added later that records an answer
     Next, Carry on, Reveal, riding and the rest still work from the keyboard, and out of family mode nothing changes. A
     key's click comes while a key is being handled (the click Enter or Space makes, or one a key handler makes); a
     button's keyboard click is also trusted with no click count (detail 0). A tick box clicked through its label is not. */
  (function familyAnswersByPointer() {
    var inKey = false, toldAt = 0;
    var mark = function () { inKey = true; setTimeout(function () { inKey = false; }, 0); };
    window.addEventListener('keydown', mark, true); window.addEventListener('keyup', mark, true);
    UI.ANSWER = '.opt, .pickable, .tile[data-id], .ticks input, .ticks ~ .actions .btn, [data-ask], #vivaInner [data-s], #vivaInner [data-f], [data-answer]';
    UI.isAnswerEl = function (el) { var a = el && el.closest && el.closest(UI.ANSWER); return !!a && !a.classList.contains('dpKiosk'); }; /* the co-pilot's own game is not an answer */
    UI.keyClick = function (e) { return !!e && (inKey || (e.isTrusted && !e.detail && !(e.target && e.target.type === 'checkbox'))); };
    UI.famAnswerTold = function () { if (Date.now() - toldAt > 4000) { toldAt = Date.now(); UI.toast('Family mode: answer with a tap or a click.', 2200); } };
    document.addEventListener('click', function (e) {
      var st = ST(); if (!(st && st.settings && st.settings.family) || !UI.isAnswerEl(e.target) || !UI.keyClick(e)) return;
      e.preventDefault(); e.stopImmediatePropagation(); UI.famAnswerTold();
    }, true);
  })();
  /* QAD2-m5: in family mode a palm (two or more keys down together) never answers, confirms or starts anything on a card,
     a dialog, a mini-game or in the Hall: Enter, Space and the number keys are held back while another key is down */
  (function palmGuard() {
    var down = {}, MOD = /^(shift|control|alt|meta|capslock|os|fn)$/, toldAt = 0, eatSpace = false, press = {};
    var sig = function () { return ['sheet', 'modal', 'mech', 'viva', 'cut', 'worldmap', 'title'].map(function (id) { var el = $(id); return el && !el.classList.contains('hidden') ? 1 : 0; }).join('') + ':' + modalSeq; };
    var keyName = function (e) { var k = String(e.key || '').toLowerCase(); return k === ' ' ? 'space' : k; };
    var count = function () { return Object.keys(down).filter(function (k) { return !MOD.test(k); }).length; };
    UI.keysDown = count;
    window.addEventListener('keydown', function (e) {
      var k = keyName(e); down[k] = 1;
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) press[k] = { t: e.target, sig: sig() };
      var st = ST(); if (!(st && st.settings && st.settings.family)) return;
      if (!(e.key === 'Enter' || e.key === ' ' || /^[1-9]$/.test(e.key)) || count() < 2) return;
      var open = ['sheet', 'modal', 'mech', 'viva'].some(function (id) { var el = $(id); return el && !el.classList.contains('hidden'); });
      if (!open) return;
      e.preventDefault(); e.stopImmediatePropagation(); if (e.key === ' ') eatSpace = true;
      if (Date.now() - toldAt > 4000) { toldAt = Date.now(); UI.toast('Tap, or press one number on its own, to answer.', 1800); }
    }, true);
    window.addEventListener('keyup', function (e) {
      var k = keyName(e); delete down[k]; if (k === 'meta' || k === 'control' || k === 'alt') down = {};
      if (e.key === ' ' && eatSpace) { eatSpace = false; e.preventDefault(); e.stopImmediatePropagation(); }
      /* QAD3-m7: a Space or Enter pressed before the screen changed (a dialog opened under a held key), or pressed on
         another element than the one now focused, never presses anything when it is let go */
      if (e.key === ' ' || e.key === 'Enter') { var p = press[k]; delete press[k]; if (p && (p.t !== document.activeElement || p.sig !== sig())) e.preventDefault(); }
    }, true);
    window.addEventListener('blur', function () { down = {}; eatSpace = false; press = {}; });
  })();
  var modalSeq = 0;
  /* In-page dialog. buttons: [{label, value, cls}]; opts.typeToConfirm: a word the yes button needs. The safe button is focused. */
  UI.modal = function (title, html, buttons, opts) {
    opts = opts || {};
    if (window.Kit && Kit.dropRadio) Kit.dropRadio(); /* AUDR3-04: a radio link never plays under this */
    var m = $('modal'), box = $('modalBox'), prev = document.activeElement;
    box.setAttribute('aria-label', title);
    box.innerHTML = '<h3>' + esc(title) + '</h3>' + html +
      (opts.typeToConfirm ? '<label class="typeConfirm" for="typeConfirm">Type ' + esc(opts.typeToConfirm) + ' to confirm <input id="typeConfirm" autocomplete="off"></label>' : '') +
      /* QAD-m4: the buttons sit in a footer that stays in view while a tall dialog scrolls */
      (buttons.length ? '<div class="modalFoot n' + Math.min(buttons.length, 9) + '">' : '') +
      buttons.map(function (b, i) { var hold = !!b.hold; return '<button class="btn ' + (b.cls || '') + (hold ? ' holdBtn' : '') + '" type="button" data-i="' + i + '"' + (b.needsType ? ' disabled' : '') + (opts.copilotKey === b.value ? ' data-copilot="1"' : '') + '>' + esc(hold ? 'Hold to ' + b.label.charAt(0).toLowerCase() + b.label.slice(1) : b.label) + '</button>'; }).join('') + (buttons.length ? '</div>' : '');
    m.classList.remove('hidden'); UI.letterbox();
    var my = ++modalSeq;
    return new Promise(function (res) {
      /* item 33: Esc, or a tap outside the box, presses the safe button (never in a type-to-confirm dialog) */
      /* simplicity round (SD-11): the safe button is the one that changes nothing: a button marked safe, else the decline
         (value 0, false, null, -1, 'close', 'done', 'no', 'later'), else the go button. Esc never starts a drill or a mission. */
      var SAFE_V = [0, false, null, -1, 'close', 'done', 'no', 'later', 'ride'];
      var plain = function (b) { return b && !b.classList.contains('danger') && !b.classList.contains('holdBtn') && !b.disabled; };
      var safeBtn = function () {
        var els = Array.prototype.slice.call(box.querySelectorAll('.btn[data-i]')), pick = null;
        els.forEach(function (b) { var bb = buttons[+b.getAttribute('data-i')]; if (!pick && bb && (bb.safe || (opts.safe !== undefined && bb.value === opts.safe)) && plain(b)) pick = b; });
        if (!pick && els.length > 1) els.forEach(function (b) { var bb = buttons[+b.getAttribute('data-i')]; if (!pick && bb && SAFE_V.indexOf(bb.value) >= 0 && plain(b)) pick = b; });
        return pick || box.querySelector('.btn.go:not(.holdBtn):not(.danger)') || els.filter(plain)[0];
      };
      var escH = function (e) {
        if (my !== modalSeq || m.classList.contains('hidden')) { document.removeEventListener('keydown', escH, true); return; }
        if (e.key !== 'Escape' || opts.typeToConfirm || $('sysPanel')) return;
        e.preventDefault(); e.stopPropagation(); var b = safeBtn(); if (b) b.click();
      };
      document.addEventListener('keydown', escH, true);
      m.onclick = function (e) { if (e.target === m && my === modalSeq && !opts.typeToConfirm) { var b = safeBtn(); if (b) b.click(); } };
      Array.prototype.forEach.call(box.querySelectorAll('[data-i]'), function (el) {
        var bb = buttons[+el.getAttribute('data-i')], fire = null;
        /* D1-M1, D1-M2: a destructive "yes" needs a one-second press and hold in every mode; a click, Enter or Space never fires it */
        if (bb.hold) UI.holdButton(el, function () { fire(); });
        fire = function () {
          var b = bb;
          var input = box.querySelector('#typeConfirm');
          var val = b.withInput && box.querySelector(b.withInput) ? box.querySelector(b.withInput).value : undefined;
          m.classList.add('hidden'); UI.letterbox(); document.removeEventListener('keydown', escH, true); m.onclick = null;
          if (prev && prev.focus) { try { prev.focus({ preventScroll: true }); } catch (e) {} }
          res(val !== undefined ? { value: b.value, input: val } : b.value); if (window.Game) Game.afterUI();
          void input;
        };
        el.addEventListener('click', function () { if (bb.hold) return; fire(); });
      });
      var ti = box.querySelector('#typeConfirm');
      if (ti) ti.addEventListener('input', function () { Array.prototype.forEach.call(box.querySelectorAll('[data-i]'), function (el) { if (buttons[+el.getAttribute('data-i')].needsType) el.disabled = ti.value.trim().toUpperCase() !== opts.typeToConfirm; }); });
      var safe = (opts.focusSafe && safeBtn()) || box.querySelector('.btn.go') || box.querySelector('.btn'); if (safe) try { safe.focus({ preventScroll: true }); } catch (e) {}
      box.scrollTop = 0; /* a long dialog opens at its title, not scrolled to the focused button */
      if (opts.onOpen) opts.onOpen(box);
    });
  };

  /* ---------- cutscenes ---------- */
  var kbClass = function (move) {
    if (SET().reduceMotion) return 'kb-fade';
    var m = String(move || '').toLowerCase();
    if (/pull back/.test(m)) return 'kb-out';
    if (/tilt/.test(m)) return 'kb-up';
    if (/pan|dolly|track|orbit|aisle/.test(m)) return 'kb-pan';
    if (/flicker|whistle|shake|slam|blast|hard push/.test(m)) return 'kb-flicker';
    if (/dim|freeze|light drops/.test(m)) return 'kb-dim';
    if (/hold|pulses|stand|character card/.test(m)) return 'kb-hold';
    return 'kb-in';
  };
  function frameHTML(url, cls) {
    /* Phone framing: a sharp contained frame over a blurred copy; never a crop that cuts the subject. */
    return '<div class="frameBlur" style="background-image:url(\'' + url + '\')"></div><img alt="" class="frameImg ' + cls + '" src="' + url + '">';
  }
  /* shots: [{visual:{asset,move}, subtitle, fact, card_label, title, titleSub, radio, buttons, character}] */
  UI.cutscene = function (shots, opts) {
    opts = opts || {};
    shots = shots.filter(Boolean);
    return new Promise(function (resolve) {
      var cut = $('cut'), media = $('cutMedia'), sub = $('cutSub'), card = $('cutCard'), title = $('cutTitle'), btns = $('cutBtns');
      var i = -1, timer = null, ended = false, watch = null, paused = false, result = null, prev = document.activeElement;
      cut.classList.remove('hidden'); UI.letterbox();
      cut.classList.toggle('portrait', window.innerHeight > window.innerWidth);
      function clear() { clearTimeout(timer); clearTimeout(watch); }
      function end() {
        if (ended) return; ended = true; clear(); if (VO()) VO().stop(); cut.classList.add('hidden'); media.innerHTML = ''; sub.innerHTML = ''; card.innerHTML = ''; title.innerHTML = ''; btns.innerHTML = '';
        cut.onclick = null; document.removeEventListener('keydown', key, true); UI.letterbox();
        if (prev && prev.focus) try { prev.focus({ preventScroll: true }); } catch (e) {}
        resolve(result); if (window.Game) Game.afterUI();
      }
      function go(d) { clear(); if (VO()) VO().stop(); i = Math.max(0, i + d); if (i >= shots.length) end(); else show(shots[i]); }
      function still(key, move) { var u = FCV.assetUrl(key); media.innerHTML = u ? frameHTML(u, kbClass(move)) : ''; }
      function preload(sh) {
        var k = sh && sh.visual && sh.visual.asset; if (!k) return;
        if (FCV.isVideo(k) && FCV.assets[k]) { var v = document.createElement('video'); v.preload = 'auto'; v.muted = true; v.src = FCV.assets[k]; }
        else if (FCV.assetUrl(k)) { var im = new Image(); im.src = FCV.assetUrl(k); }
      }
      function show(sh) {
        var key = sh.visual && sh.visual.asset, move = sh.visual && sh.visual.move;
        var useVideo = key && FCV.isVideo(key) && FCV.assets[key] && SET().autoplay && !SET().reduceMotion;
        if (useVideo) {
          media.innerHTML = '';
          var blur = document.createElement('div'); blur.className = 'frameBlur'; blur.style.backgroundImage = 'url(' + FCV.assetUrl(FCV.videoFallback[key]) + ')'; media.appendChild(blur);
          var v = document.createElement('video'); v.className = 'frameImg'; v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.autoplay = true; v.loop = !!(sh.loop || (sh.visual && sh.visual.loop)); v.preload = 'auto';
          v.src = FCV.assets[key];
          var fell = false; var fallback = function () { if (fell) return; fell = true; still(FCV.videoFallback[key], 'slow push-in'); };
          v.onerror = fallback;
          if (/hold on the last frame/.test(String(move))) v.addEventListener('loadedmetadata', function () { try { v.currentTime = Math.max(0, v.duration - 0.1); v.pause(); } catch (e) {} });
          media.appendChild(v);
          try { var p = v.play(); if (p && p.catch) p.catch(function () { fallback(); }); } catch (e) { fallback(); }
          watch = setTimeout(function () { if (v.readyState < 2) fallback(); }, 3500);
        } else if (key) still(FCV.isVideo(key) ? FCV.videoFallback[key] : key, move);
        else media.innerHTML = '';
        var subHTML = '';
        if (opts.radio || sh.radio) subHTML += '<span class="radio">FREIGHT FM 104.7</span><br>';
        if (sh.subtitle) subHTML += esc(sh.subtitle);
        sub.innerHTML = subHTML; sub.hidden = !subHTML;
        var vP = Promise.resolve(false);
        if (sh.subtitle && VO()) { var subEl = sub; vP = VO().say({ text: sh.sayText || sh.subtitle, speaker: sh.speaker || null, pri: 'film', /* AUDR4-12: sayText is the line said when the subtitle also names who says it */ onStart: function () { if (window.AudioCtl && AudioCtl.subsOff()) subEl.hidden = true; } }).then(function (r) { return r.played; }); }
        title.innerHTML = sh.title ? '<h1>' + esc(sh.title) + '</h1>' + (sh.titleSub ? '<p>' + esc(sh.titleSub) + '</p>' : '') : '';
        card.innerHTML = sh.fact ? (Array.isArray(sh.fact) ? sh.fact : [sh.fact]).map(function (f) { return UI.cardHTML(f, { label: sh.card_label }); }).join('') : (sh.cardHTML || '');
        btns.innerHTML = (sh.buttons || []).map(function (b, bi) { return '<button class="btn ' + (bi === 0 ? 'go' : '') + '" type="button" data-v="' + esc(b.value) + '">' + esc(b.label) + '</button>'; }).join('');
        Array.prototype.forEach.call(btns.querySelectorAll('[data-v]'), function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); result = b.getAttribute('data-v'); end(); }); });
        if (sh.buttons) { var fb = btns.querySelector('.btn'); if (fb) try { fb.focus({ preventScroll: true }); } catch (e) {} }
        if ((opts.radio || sh.radio) && window.SFX) SFX.radio();
        if (sh.sound && window.SFX && SFX[sh.sound]) SFX[sh.sound]();
        preload(shots[i + 1]);
        var words = String(sh.subtitle || '').split(/\s+/).length + (sh.fact ? 30 : 0);
        var dur = sh.ms || Math.max(sh.title ? 3200 : 4200, words * 330 + 1600);
        if (useVideo) dur = Math.max(dur, 6000);
        if (sh.buttons) return;
        var shotNow = i, tDone = false, vDone = !sh.subtitle, nx = function () { if (tDone && vDone && !paused && !ended && i === shotNow) go(1); };
        vP.then(function (ok) { setTimeout(function () { vDone = true; nx(); }, ok ? 500 : 0); });
        if (!paused) timer = setTimeout(function () { tDone = true; nx(); }, dur);
      }
      /* simplicity round (SD-20): as in the films, Esc and a tap on the picture pause; Play carries on with the same shot */
      function unpause() { paused = false; $('cutPause').textContent = 'Pause'; cut.classList.remove('paused'); }
      function togglePause() {
        paused = !paused; $('cutPause').textContent = paused ? 'Play' : 'Pause'; cut.classList.toggle('paused', paused);
        var v = media.querySelector('video'); if (v) { try { paused ? v.pause() : v.play(); } catch (er) {} }
        if (paused) clear(); else if (i >= 0 && i < shots.length && !shots[i].buttons) timer = setTimeout(function () { go(1); }, 2500);
      }
      function key(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); togglePause(); }
        else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#cutBtns, #cutCtl')) return; e.preventDefault(); e.stopPropagation(); unpause(); go(1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      }
      document.addEventListener('keydown', key, true);
      $('cutSkip').onclick = function (e) { e.stopPropagation(); end(); };
      $('cutBack').onclick = function (e) { e.stopPropagation(); go(-1); };
      $('cutPause').onclick = function (e) { e.stopPropagation(); togglePause(); };
      $('cutPause').textContent = 'Pause'; cut.classList.remove('paused');
      if ($('cutNext')) $('cutNext').onclick = function (e) { e.stopPropagation(); unpause(); go(1); };
      cut.onclick = function (e) { if (e.target.closest && e.target.closest('#cutBtns, #cutCard details, #cutCtl, #sysCorner, #sysPanel')) return; if (!(shots[i] && shots[i].buttons)) togglePause(); };
      go(1);
    });
  };

  /* Keyboard: Enter or Space presses the main button; 1 to 6 picks an option; the left arrow goes back (item 5).
     Item 28: a number key within 150 ms of another key, or while another key is held, is ignored; in family mode the
     first press only highlights the option and Enter (or the same number again) picks it. Item 43: on a line already
     seen, holding Space types it four times faster; a quick tap still finishes it. */
  var lastKeyAt = 0, held = {}, famPick = null, spaceAt = 0;
  document.addEventListener('keyup', function (e) {
    delete held[e.key];
    if (e.key === ' ' && typing && typing.ff) { typing.ff = false; if (Date.now() - spaceAt < 250 && typing.stop) typing.stop(); }
  }, true);
  window.addEventListener('blur', function () { held = {}; if (typing) typing.ff = false; });
  document.addEventListener('keydown', function (e) {
    var prevAt = lastKeyAt, othersHeld = Object.keys(held).filter(function (k) { return k !== e.key; }).length; lastKeyAt = Date.now(); if (!e.repeat) held[e.key] = 1;
    if ($('sheet').classList.contains('hidden') || !$('cut').classList.contains('hidden') || !$('modal').classList.contains('hidden')) return;
    if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    var t = $('talk');
    if (e.key === 'ArrowLeft' && !e.repeat) { if (UI.back()) e.preventDefault(); return; }
    if (e.key === 'ArrowRight' && UI.viewingHistory()) { e.preventDefault(); UI.forward(); return; }
    if (/^[1-6]$/.test(e.key)) {
      if (e.repeat || lastKeyAt - prevAt < 150 || othersHeld) { e.preventDefault(); return; }
      var opts = Array.prototype.filter.call(t.querySelectorAll('.opt:not([disabled]), .hubItem:not([disabled]), .pickable:not([disabled])'), function (x) { return !x.closest('[hidden]'); });
      var b = opts[+e.key - 1]; if (!b) return;
      e.preventDefault();
      /* ND2 (round 5): in family mode the number keys pick nothing (an answer is a tap or a click) */
      if (SET().family && UI.isAnswerEl(b)) { UI.famAnswerTold(); return; }
      if (SET().family && famPick !== b) { opts.forEach(function (x) { x.classList.remove('kbPick'); }); famPick = b; b.classList.add('kbPick'); try { b.focus({ preventScroll: true }); } catch (er) {} UI.announce('Option ' + e.key + '. Press Enter or ' + e.key + ' again to pick it.'); return; }
      famPick = null; b.classList.remove('kbPick'); b.click();
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (e.repeat) { e.preventDefault(); return; }
      if (SET().family && famPick && e.key === 'Enter' && t.contains(famPick) && !famPick.disabled) { e.preventDefault(); var fp = famPick; famPick = null; fp.classList.remove('kbPick'); fp.click(); return; }
      if (e.key === ' ' && typing && typing.seen && !typing.ff && t.contains(typing.el)) { e.preventDefault(); typing.ff = true; spaceAt = Date.now(); return; }
      if (document.activeElement && document.activeElement.tagName === 'BUTTON' && t.contains(document.activeElement)) return;
      var go = Array.prototype.filter.call(t.querySelectorAll('.btn.go:not([disabled])'), function (x) { return !x.hidden && !x.closest('[hidden]'); }); if (go.length) { e.preventDefault(); go[go.length - 1].click(); }
    }
  });

  window.UI = UI;
})();
/* AUD-18: the player's own recording follows Sound off and the voice level whenever it plays */
document.addEventListener('play', function (e) {
  var el = e.target; if (!el || !el.classList || !el.classList.contains('myRec')) return;
  try { var a = (window.Game && Game.state && Game.state.settings.audio) || {}; el.muted = !!a.muted; el.volume = Math.max(0, Math.min(1, ((a.voice === undefined ? 80 : a.voice) / 100) * ((a.master === undefined ? 80 : a.master) / 100) * 1.25)); } catch (er) {}
}, true);
