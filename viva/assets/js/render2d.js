/* Freight City Viva v3: the 2D renderer. The fallback and "Simple graphics": v2's poster-map canvas, behind the
   same interface as the 3D city (Render.init / frame / cine / setTier / screenshot / toWorld / dispose). */
(function () {
  'use strict';
  var R2 = { name: '2d' };
  var cv = null, cx = null, city = null, snap = null, vw = 0, vh = 0, dpr = 1, zoom = 1, cam = { x: 0, y: 0 }, P = { x: 0, y: 0 }, imgs = {};
  var ACT_COL = { 1: '#ff8a3d', 2: '#2bb3a6', 3: '#7a5cff', 4: '#e2456f', 5: '#ffb000', 6: '#e6332a', 7: '#16a0d8' };
  var DWELL = { side: 1, corner: 1, drop: 1 }, dwell = {};
  var st = function () { return window.Game.state; };
  var T = function () { return snap ? snap.t : 0; };
  function img(key) {
    if (!key) return null; if (imgs[key]) return imgs[key];
    var u = FCV.assetUrl(key); if (!u) return null;
    var im = new Image(); im.decoding = 'async'; im.src = u; imgs[key] = im; return im;
  }
  function parcelCount(n) { return snap && snap.parcelCount ? snap.parcelCount(n) : ''; }
  function objectivePoint() { return snap && snap.objective; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var m = function (v) { return Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))); };
    return 'rgb(' + m(r) + ',' + m(g) + ',' + m(b) + ')';
  }
  function grey(hex) { var n = parseInt(hex.slice(1), 16), v = Math.round(((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) * 0.85 + 30); return 'rgb(' + v + ',' + v + ',' + (v + 6) + ')'; }
  function actColour(n, hex) { return FCV.actDone(st(), n) ? hex : grey(hex); }
  function drawGround(c, view) {
    c.fillStyle = '#2b2538'; c.fillRect(0, 0, city.W, city.H);
    var R = city.R, CW = city.CW, CH = city.CH;
    c.strokeStyle = 'rgba(255,209,102,.55)'; c.lineWidth = 4; c.setLineDash([28, 26]);
    for (var k = 0; k < 4; k++) { var y = k * (CH + R) + R / 2; c.beginPath(); c.moveTo(0, y); c.lineTo(city.W, y); c.stroke(); }
    for (var j = 0; j < 5; j++) { var x = j * (CW + R) + R / 2; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, city.H); c.stroke(); }
    c.setLineDash([]);
    city.cells.forEach(function (cell) {
      if (cell.x > view.x2 || cell.x + cell.w < view.x1 || cell.y > view.y2 || cell.y + cell.h < view.y1) return;
      c.fillStyle = '#bfb2a0'; rr(c, cell.x - 12, cell.y - 12, cell.w + 24, cell.h + 24, 18); c.fill();
      var fill = cell.kind === 'act' ? (FCV.actDone(st(), cell.act) ? shade(cell.tint, 0.55) : grey(shade(cell.tint, 0.4))) : cell.kind === 'park' ? '#58b56f' : cell.kind === 'harbour' ? '#9aa3ad' : cell.kind === 'locker' ? '#3a2f4d' : '#3a2c52';
      c.fillStyle = fill; rr(c, cell.x, cell.y, cell.w, cell.h, 12); c.fill();
      if (cell.kind === 'act') { c.strokeStyle = actColour(cell.act, cell.colour); c.lineWidth = 8; rr(c, cell.x + 4, cell.y + 4, cell.w - 8, cell.h - 8, 10); c.stroke(); }
      if (cell.kind === 'locker') {
        c.save(); rr(c, cell.x, cell.y, cell.w, cell.h, 12); c.clip(); c.strokeStyle = 'rgba(255,209,102,.18)'; c.lineWidth = 6;
        for (var h = -cell.h; h < cell.w; h += 70) { c.beginPath(); c.moveTo(cell.x + h, cell.y + cell.h); c.lineTo(cell.x + h + cell.h, cell.y); c.stroke(); }
        c.restore();
      }
      if (cell.kind === 'viva') { c.fillStyle = 'rgba(255,209,102,.08)'; for (var t = 0; t < 10; t++) c.fillRect(cell.x + t * cell.w / 10, cell.y, cell.w / 20, cell.h); }
    });
    city.water.forEach(function (w) {
      c.fillStyle = '#1f7fb8'; rr(c, w.x, w.y, w.w, w.h, w.pond ? 60 : 4); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 3;
      var off = (T() / 40) % 40;
      for (var yy = w.y + 20; yy < w.y + w.h - 10; yy += 34) for (var xx = w.x + 20 + off; xx < w.x + w.w - 30; xx += 80) { c.beginPath(); c.moveTo(xx, yy); c.quadraticCurveTo(xx + 10, yy - 6, xx + 20, yy); c.stroke(); }
    });
  }
  function drawBuilding(c, b) {
    var stv = st(), col = b.act ? actColour(b.act, b.colour) : b.colour;
    c.fillStyle = 'rgba(0,0,0,.35)'; rr(c, b.x + 12, b.y + 14, b.w, b.h, 10); c.fill();
    c.fillStyle = shade(col.charAt(0) === '#' ? col : '#888888', -0.35); if (col.charAt(0) !== '#') c.fillStyle = col; rr(c, b.x, b.y, b.w, b.h, 10); c.fill();
    c.fillStyle = col; rr(c, b.x + 6, b.y - 10, b.w - 12, b.h - 4, 9); c.fill();
    c.strokeStyle = '#15101f'; c.lineWidth = 4; rr(c, b.x + 6, b.y - 10, b.w - 12, b.h - 4, 9); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.25)'; for (var i = 0; i < 3; i++) c.fillRect(b.x + 22 + i * 34, b.y + 6, 22, 16);
    if (b.viva) {
      c.fillStyle = '#ffd166'; c.beginPath(); c.arc(b.x + b.w / 2, b.y + b.h / 2 - 20, 90, 0, 6.29); c.fill(); c.stroke();
      c.fillStyle = '#f2e6ff'; for (var k = 0; k < 7; k++) c.fillRect(b.x + 40 + k * 76, b.y + b.h - 70, 18, 60);
    }
    var dw = 46, dx = b.x + b.w * 0.7 - dw / 2;
    if (b.room || b.viva || b.door === 'bottom' && !b.act) dx = b.x + b.w / 2 - dw / 2;
    c.fillStyle = '#15101f';
    if (b.door === 'bottom') c.fillRect(dx, b.y + b.h - 18, dw, 18); else if (b.door === 'top') c.fillRect(dx, b.y - 10, dw, 14);
    if (b.label) {
      var size = b.viva ? 40 : 24; c.font = size + 'px Bangers, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      while (c.measureText(b.label).width > b.w - 30 && size > 12) { size -= 2; c.font = size + 'px Bangers, Impact, sans-serif'; }
      var ly = b.viva ? b.y + 40 : b.y + b.h / 2 - 8;
      c.lineWidth = 5; c.strokeStyle = '#15101f'; c.strokeText(b.label.toUpperCase(), b.x + b.w / 2, ly);
      c.fillStyle = '#fff3e0'; c.fillText(b.label.toUpperCase(), b.x + b.w / 2, ly);
    }
    if (b.room && stv.rooms[b.room] && stv.rooms[b.room].badge) { c.fillStyle = '#3ddc84'; c.font = '30px Bangers, Impact'; c.fillText('SECURED', b.x + b.w / 2, b.y + b.h / 2 + 26); }
  }
  function drawTree(c, d) {
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(d.x + 6, d.y + 8, d.s, 0, 6.29); c.fill();
    c.fillStyle = '#1f7a45'; c.beginPath(); c.arc(d.x, d.y, d.s, 0, 6.29); c.fill();
    c.strokeStyle = '#15101f'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#3fb86a'; c.beginPath(); c.arc(d.x - d.s * 0.3, d.y - d.s * 0.3, d.s * 0.45, 0, 6.29); c.fill();
  }
  function drawSign(c, d) {
    var stv = st(), a = FCV.data.script.acts[d.act - 1], pcnt = parcelCount(d.act);
    var t = 'ACT ' + d.act + ': ' + a.district.name.toUpperCase() + (pcnt ? '  EVIDENCE ' + pcnt : '');
    var size = 22; c.font = size + 'px Bangers, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    while (c.measureText(t).width > 260 && size > 12) { size -= 1; c.font = size + 'px Bangers, Impact, sans-serif'; }
    var w = c.measureText(t).width + 24;
    c.fillStyle = actColour(d.act, ACT_COL[d.act]); rr(c, d.x - w / 2, d.y - 17, w, 34, 6); c.fill(); c.strokeStyle = '#15101f'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#15101f'; c.fillText(t, d.x, d.y + 1);
    var cell = null; city.cells.forEach(function (cc) { if (cc.act === d.act) cell = cc; });
    if (d.act === 1 && !FCV.actDone(stv, 1)) {
      var fog = c.createRadialGradient(cell.x + cell.w / 2, cell.y + cell.h / 2, 80, cell.x + cell.w / 2, cell.y + cell.h / 2, cell.w * 0.7);
      fog.addColorStop(0, 'rgba(230,225,240,0.05)'); fog.addColorStop(1, 'rgba(230,225,240,0.45)');
      c.fillStyle = fog; rr(c, cell.x, cell.y, cell.w, cell.h, 12); c.fill();
    }
    if (!FCV.actOpen(stv, d.act)) {
      c.fillStyle = 'rgba(15,10,22,.55)'; rr(c, cell.x, cell.y, cell.w, cell.h, 12); c.fill();
      c.fillStyle = '#ffd166'; c.font = '34px Bangers, Impact'; c.fillText('OPENS AFTER ACT ' + (d.act - 1), cell.x + cell.w / 2, cell.y + cell.h / 2);
    }
  }
  function drawPortraitDisc(c, key, x, y, r, ring) {
    c.save(); c.beginPath(); c.arc(x, y, r, 0, 6.29); c.closePath(); c.fillStyle = '#241a35'; c.fill();
    var im = img(key);
    if (im && im.complete && im.naturalWidth) { c.clip(); c.drawImage(im, x - r, y - r, r * 2, r * 2); }
    c.restore();
    c.strokeStyle = ring; c.lineWidth = 5; c.beginPath(); c.arc(x, y, r, 0, 6.29); c.stroke();
    c.strokeStyle = '#15101f'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r + 3, 0, 6.29); c.stroke();
  }
  function mColour(m) { return m.kind === 'main' ? '#ffd166' : m.kind === 'side' ? '#19c2b0' : m.kind === 'corner' ? '#b48cff' : m.kind === 'room' ? (m.done ? '#3ddc84' : m.obj ? '#ffd166' : '#ff5fa2') : m.kind === 'viva' ? (m.locked ? '#7a6a88' : '#ff3d5c') : m.kind === 'kiosk' ? '#25c2b0' : m.kind === 'drop' ? '#c9a46a' : m.kind === 'methods' ? '#9be15d' : '#8a7f99'; }
  function drawMarker(c, m) {
    var reduce = st().settings.reduceMotion;
    var pulse = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(T() / 260), bob = reduce ? 0 : Math.sin(T() / 300) * 6;
    var col = mColour(m), rad = m.kind === 'drop' ? 26 : 34;
    c.globalAlpha = 0.35 + 0.25 * pulse; c.fillStyle = col; c.beginPath(); c.arc(m.x, m.y, rad + pulse * 8, 0, 6.29); c.fill();
    c.globalAlpha = 1; c.strokeStyle = col; c.lineWidth = 4; c.beginPath(); c.arc(m.x, m.y, rad, 0, 6.29); c.stroke();
    var key = m.who ? FCV.portrait(m.who) : null;
    if (m.kind === 'viva') key = 'img-17';
    if (m.kind === 'main' && !m.who) key = 'img-00';
    /* QAR11: as drawn: the halo disc and ring (to rad + 2), the portrait disc with its outline (30), the pin, the label */
    var dw = { id: m.id, x: m.x, y: m.y, rad: rad + pulse * 8, rr: Math.max(rad + pulse * 8, rad + 2) }; drawn2.push(dw);
    if (key && m.kind !== 'drop') { drawPortraitDisc(c, key, m.x, m.y - 62 + bob, 26, col); dw.face = { x: m.x, y: m.y - 62 + bob, r: 30 }; }
    if (m.kind === 'main' || m.obj) {
      c.fillStyle = col; c.strokeStyle = '#15101f'; c.lineWidth = 3;
      c.beginPath(); var ty = m.y - 104 + bob; c.moveTo(m.x - 14, ty); c.lineTo(m.x + 14, ty); c.lineTo(m.x, ty + 16); c.closePath(); c.fill(); c.stroke(); dw.pin = { x: m.x, y: ty + 8, tri: [{ x: m.x - 14, y: ty }, { x: m.x + 14, y: ty }, { x: m.x, y: ty + 16 }] };
    }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    var tag = m.kind === 'room' ? m.letters : m.kind === 'viva' ? (m.locked ? 'LOCKED' : 'VIVA') : m.kind === 'side' ? (m.done ? 'AGAIN' : 'SIDE') : m.kind === 'corner' ? (m.done ? 'AGAIN' : 'EXAM') : m.kind === 'kiosk' ? 'DRILL' : m.kind === 'drop' ? 'DROP' : m.kind === 'methods' ? 'METHOD' : '';
    if (tag) { c.font = '18px Bangers, Impact'; c.fillStyle = m.kind === 'viva' ? '#fff' : '#15101f'; c.fillText(tag, m.x, m.y + 1); }
    var near = snap.nearest === m.id && Math.hypot(m.x - P.x, m.y - P.y) < 260;
    if (near && m.label && !st().settings.hideLabels) {
      var text = DWELL[m.kind] ? m.label + ' (stand here to start)' : m.label;
      c.font = 'bold 15px "Atkinson Hyperlegible", sans-serif';
      var w = Math.min(360, c.measureText(text).width + 18);
      lastLabel = { x: m.x - w / 2, y: m.y + rad + 10, w: w, h: 26, at: Date.now(), id: m.id }; dw.label = lastLabel;
      c.fillStyle = 'rgba(21,16,31,.88)'; rr(c, m.x - w / 2, m.y + rad + 10, w, 26, 6); c.fill();
      c.fillStyle = '#fff3e0'; c.save(); c.beginPath(); c.rect(m.x - w / 2 + 4, m.y + rad + 10, w - 8, 26); c.clip(); c.fillText(text, m.x, m.y + rad + 24); c.restore();
    }
    if (dwell[m.id]) { c.strokeStyle = '#fff'; c.lineWidth = 6; c.beginPath(); c.arc(m.x, m.y, rad + 6, -Math.PI / 2, -Math.PI / 2 + Math.min(1, dwell[m.id] / 0.7) * 6.283); c.stroke(); }
  }
  function drawParcel(c, p) {
    var b = st().settings.reduceMotion ? 0 : Math.sin(T() / 200 + p.x) * 3;
    c.fillStyle = 'rgba(255,209,102,.35)'; c.beginPath(); c.arc(p.x, p.y, 22, 0, 6.29); c.fill();
    c.fillStyle = '#c9a46a'; c.strokeStyle = '#15101f'; c.lineWidth = 3; rr(c, p.x - 12, p.y - 10 + b, 24, 20, 3); c.fill(); c.stroke();
    c.strokeStyle = '#7a5a30'; c.lineWidth = 2; c.beginPath(); c.moveTo(p.x, p.y - 10 + b); c.lineTo(p.x, p.y + 10 + b); c.stroke();
  }
  function drawCar(c, car, isInsp) {
    c.save(); c.translate(car.x, car.y); c.rotate(isInsp ? car.a : Math.atan2(car.dy, car.dx));
    var L = car.van ? 58 : 46, Wd = 26;
    c.fillStyle = 'rgba(0,0,0,.3)'; rr(c, -L / 2 + 4, -Wd / 2 + 5, L, Wd, 7); c.fill();
    c.fillStyle = isInsp ? '#e8f7f2' : car.c; rr(c, -L / 2, -Wd / 2, L, Wd, 7); c.fill(); c.strokeStyle = '#15101f'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#2b3550'; c.fillRect(L / 2 - 18, -Wd / 2 + 4, 9, Wd - 8);
    if (isInsp) { var on = Math.floor(T() / 333) % 2; c.fillStyle = on ? '#ffb000' : '#7a5a10'; c.fillRect(-6, -Wd / 2 + 2, 12, Wd - 4); }
    c.restore();
  }
  function drawPerson(c, x, y, col, face, walk) {
    var sw = Math.sin(walk) * 3;
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(x + 3, y + 10, 10, 6, 0, 0, 6.29); c.fill();
    c.save(); c.translate(x, y); c.rotate(face + Math.PI / 2);
    c.fillStyle = '#15101f'; c.beginPath(); c.arc(-4, sw, 3.5, 0, 6.29); c.arc(4, -sw, 3.5, 0, 6.29); c.fill();
    c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, 9, 6.3, 0, 0, 6.29); c.fill(); c.strokeStyle = '#15101f'; c.lineWidth = 2.5; c.stroke();
    c.fillStyle = '#c98e62'; c.beginPath(); c.arc(0, -1, 4.5, 0, 6.29); c.fill();
    c.restore();
  }
  /* The courier on a cargo bike: box in front, wheels, teal jacket and orange cap. */
  function drawBike(c) {
    var x = P.x, y = P.y, f = P.face, pedal = Math.sin(P.walk) * 4;
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(x + 4, y + 10, 26, 12, f, 0, 6.29); c.fill();
    /* SD-05: a bright ring under the courier, so a child can find the bike */
    c.strokeStyle = '#ffd166'; c.lineWidth = 4; c.beginPath(); c.arc(x, y, 38, 0, 6.29); c.stroke();
    c.save(); c.translate(x, y); c.rotate(f); c.scale(1.3, 1.3);
    c.fillStyle = '#15101f'; rr(c, -26, -4, 10, 8, 3); c.fill(); rr(c, 18, -4, 10, 8, 3); c.fill();
    c.fillStyle = '#ff8a3d'; c.strokeStyle = '#15101f'; c.lineWidth = 3; rr(c, 4, -13, 20, 26, 4); c.fill(); c.stroke();
    c.strokeStyle = '#ffd166'; c.lineWidth = 2; c.beginPath(); c.moveTo(14, -13); c.lineTo(14, 13); c.stroke();
    c.fillStyle = '#15101f'; c.beginPath(); c.arc(-6 + pedal * 0.3, -7, 3.5, 0, 6.29); c.arc(-6 - pedal * 0.3, 7, 3.5, 0, 6.29); c.fill();
    c.fillStyle = '#19c2b0'; c.beginPath(); c.ellipse(-8, 0, 10, 11, 0, 0, 6.29); c.fill(); c.stroke();
    c.fillStyle = '#c98e62'; c.beginPath(); c.arc(-6, 0, 6, 0, 6.29); c.fill();
    c.fillStyle = '#ff8a3d'; c.beginPath(); c.arc(-6, 0, 6.4, -Math.PI / 2, Math.PI / 2); c.fill(); c.fillRect(-1, -4, 5, 8);
    var stickers = 0; for (var n = 1; n <= 7; n++) if (FCV.actDone(st(), n)) stickers++;
    for (var s = 0; s < stickers; s++) { c.fillStyle = ACT_COL[s + 1]; c.beginPath(); c.arc(8 + (s % 4) * 4, -8 + Math.floor(s / 4) * 16, 2.2, 0, 6.29); c.fill(); }
    c.restore();
  }
  function drawArrow(c) {
    var p = objectivePoint(); if (!p) return;
    var sx = (p.x - cam.x) * zoom + vw / 2, sy = (p.y - cam.y) * zoom + vh / 2, margin = 46;
    if (sx > margin && sx < vw - margin && sy > 110 && sy < vh - margin) return;
    var ang = Math.atan2(sy - vh / 2, sx - vw / 2), ex = Math.max(margin, Math.min(vw - margin, sx)), ey = Math.max(130, Math.min(vh - margin, sy));
    c.save(); c.translate(ex, ey); c.rotate(ang);
    c.fillStyle = '#ffd166'; c.strokeStyle = '#15101f'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(20, 0); c.lineTo(-12, -14); c.lineTo(-6, 0); c.lineTo(-12, 14); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2); vw = window.innerWidth; vh = window.innerHeight;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    zoom = Math.max(0.55, Math.min(1.1, Math.min(vw, vh) / 760)) * (snap && snap.family ? 1.25 : 1);
  }
  R2.init = function (canvas, c) { cv = canvas; cx = cv.getContext('2d'); city = c; resize(); window.addEventListener('resize', resize); return Promise.resolve(R2); };
  R2.setTier = function () {};
  R2.cine = function () {};
  R2.toWorld = function (sx, sy) { return { x: cam.x + (sx - vw / 2) / zoom, y: cam.y + (sy - vh / 2) / zoom }; };
  var lastLabel = null;
  /* QAD2-m6: where the nearest marker's name was last drawn, on the screen (the edge arrow keeps off it) */
  R2.labelRect = function () { if (!lastLabel || Date.now() - lastLabel.at > 250) return null; var a = R2.toScreen(lastLabel.x, lastLabel.y), b = R2.toScreen(lastLabel.x + lastLabel.w, lastLabel.y + lastLabel.h); return { l: a.x, t: a.y, r: b.x, b: b.y }; };
  /* QAR10-01 and QAR11: a tap picks the marker whose drawn part is under it. Each part gives the px distance from the tap to
     its outline as drawn (below 0 on it; up to 8 px off it a near miss). A tap ON a part always beats a near miss on another
     marker's part; among the parts it is on, the one drawn last (on top) wins: markers are drawn in turn, each its halo and
     ring, portrait, pin, then its name label. With only near misses, the nearest outline wins */
  var drawn2 = [];
  function polyGap(x, y, poly) {
    var pos = 0, neg = 0, d = Infinity;
    for (var i = 0; i < poly.length; i++) { var a = poly[i], b = poly[(i + 1) % poly.length], ex = b.x - a.x, ey = b.y - a.y, L = ex * ex + ey * ey, t = L ? Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / L)) : 0, cr = ex * (y - a.y) - ey * (x - a.x); d = Math.min(d, Math.hypot(x - a.x - t * ex, y - a.y - t * ey)); if (cr > 0) pos++; else if (cr < 0) neg++; }
    return pos && neg ? d : -d;
  }
  function rectGap(x, y, l, t, r, b) { var dx = Math.max(l - x, 0, x - r), dy = Math.max(t - y, 0, y - b); return dx || dy ? Math.hypot(dx, dy) : -Math.min(x - l, r - x, y - t, b - y); }
  R2.pick = function (sx, sy) {
    var w = R2.toWorld(sx, sy), all = [], SLACK = 8;
    var add = function (id, part, ord, gap) { gap *= zoom; if (gap <= SLACK) all.push({ id: id, part: part, ord: ord, gap: gap }); };
    drawn2.forEach(function (m, i) {
      add(m.id, 'ring', i * 4, Math.hypot(w.x - m.x, w.y - m.y) - m.rr);
      if (m.face) add(m.id, 'portrait', i * 4 + 1, Math.hypot(w.x - m.face.x, w.y - m.face.y) - m.face.r);
      if (m.pin) add(m.id, 'pin', i * 4 + 2, polyGap(w.x, w.y, m.pin.tri) - 1.5);
      if (m.label) add(m.id, 'label', i * 4 + 3, rectGap(w.x, w.y, m.label.x, m.label.y, m.label.x + m.label.w, m.label.y + m.label.h));
    });
    var on = all.filter(function (p) { return p.gap <= 0; });
    var best = on.length ? on.sort(function (a, b) { return b.ord - a.ord; })[0] : all.sort(function (a, b) { return a.gap - b.gap || b.ord - a.ord; })[0];
    return best ? { id: best.id, part: best.part, on: best.gap <= 0 } : null;
  };
  R2.visiblePoint = function (id, which) {
    var m = drawn2.filter(function (x) { return x.id === id; })[0]; if (!m) return null; var pts = [], k, a;
    var circ = function (cx, cy, r) { for (k = 0; k <= 3; k++) for (a = 0; a < 12; a++) pts.push(R2.toScreen(cx + Math.cos(a * Math.PI / 6) * r * k / 3, cy + Math.sin(a * Math.PI / 6) * r * k / 3)); };
    if (which === 'ring') circ(m.x, m.y, m.rad); else if (which === 'portrait' && m.face) circ(m.face.x, m.face.y, m.face.r); else if (which === 'pin' && m.pin) pts.push(R2.toScreen(m.pin.x, m.pin.y));
    else if (which === 'label' && lastLabel && lastLabel.id === id) pts.push(R2.toScreen(lastLabel.x + lastLabel.w / 2, lastLabel.y + lastLabel.h / 2));
    for (var i = 0; i < pts.length; i++) { var q = pts[i]; if (q.x < 6 || q.y < 60 || q.x > vw - 6 || q.y > vh - 6) continue; var h = R2.pick(q.x, q.y); if (h && h.id === id && h.part === which) return q; }
    return null;
  };
  R2.partsOf = function (id) { var m = drawn2.filter(function (x) { return x.id === id; })[0]; if (!m) return null; var o = { ring: R2.toScreen(m.x, m.y) }; if (m.face) o.portrait = R2.toScreen(m.face.x, m.face.y); if (m.pin) o.pin = R2.toScreen(m.pin.x, m.pin.y); if (lastLabel && lastLabel.id === id) o.label = R2.toScreen(lastLabel.x + lastLabel.w / 2, lastLabel.y + lastLabel.h / 2); return o; };
  R2.toScreen = function (x, y) { return { x: vw / 2 + (x - cam.x) * zoom, y: vh / 2 + (y - cam.y) * zoom }; };
  R2.snapCam = function (x, y) { cam.x = x; cam.y = y; };
  R2.screenshot = function () { try { return cv.toDataURL('image/png'); } catch (e) { return null; } };
  R2.dispose = function () { window.removeEventListener('resize', resize); if (cx) { cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height); } };
  R2.stats = function () { return { calls: 0, tris: 0 }; };
  R2.frame = function (s) {
    snap = s; P = s.player; dwell = s.dwell || {};
    var fam = !!s.family; if (fam !== R2._fam) { R2._fam = fam; resize(); }
    var c = cx, markers = s.markers, parcels = s.parcels, cars = s.cars, peds = s.peds, insp = s.inspectors, target = s.target;
    var k = s.reduceMotion ? 1 : 0.12;
    cam.x += (P.x - cam.x) * k; cam.y += (P.y - cam.y) * k;
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#1d1729'; c.fillRect(0, 0, cv.width, cv.height);
    c.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * (vw / 2 - cam.x * zoom), dpr * (vh / 2 - cam.y * zoom));
    var hw = vw / 2 / zoom + 120, hh = vh / 2 / zoom + 160;
    var view = { x1: cam.x - hw, x2: cam.x + hw, y1: cam.y - hh, y2: cam.y + hh };
    var inV = function (x, y, pad) { return x > view.x1 - pad && x < view.x2 + pad && y > view.y1 - pad && y < view.y2 + pad; };
    drawGround(c, view);
    city.decor.forEach(function (d) { if (d.kind === 'tree' && inV(d.x, d.y, 30)) drawTree(c, d); });
    parcels.forEach(function (p) { if (inV(p.x, p.y, 30)) drawParcel(c, p); });
    cars.forEach(function (car) { if (inV(car.x, car.y, 60)) drawCar(c, car, false); });
    peds.forEach(function (p) { if (inV(p.x, p.y, 20)) drawPerson(c, p.x, p.y, p.c, p.a, T() / 120 + p.x); });
    city.buildings.forEach(function (b) { if (b.x < view.x2 && b.x + b.w > view.x1 && b.y < view.y2 && b.y + b.h > view.y1) drawBuilding(c, b); });
    city.decor.forEach(function (d) { if (d.kind === 'sign' && inV(d.x, d.y, 500)) drawSign(c, d); });
    if (s.route && s.route.length > 1) { c.strokeStyle = 'rgba(25,194,176,.75)'; c.lineWidth = 10; c.setLineDash([18, 14]); c.beginPath(); c.moveTo(s.route[0].x, s.route[0].y); for (var r = 1; r < s.route.length; r++) c.lineTo(s.route[r].x, s.route[r].y); c.stroke(); c.setLineDash([]); }
    drawn2 = []; markers.forEach(function (m) { if (inV(m.x, m.y, 120)) drawMarker(c, m); });
    insp.forEach(function (p) { drawCar(c, p, true); });
    if (s.animal && inV(s.animal.x, s.animal.y, 120)) drawAnimal(c, s.animal);
    drawBike(c);
    if (target) { c.strokeStyle = 'rgba(255,209,102,.8)'; c.lineWidth = 3; c.beginPath(); c.arc(target.x, target.y, 12, 0, 6.29); c.stroke(); }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawArrow(c);
  };
  function drawAnimal(c, a) {
    var sc = a.size === 'big' ? 1.9 : 1;
    c.save(); c.translate(a.x, a.y); c.rotate(a.face || 0); c.scale(sc, sc);
    c.fillStyle = 'rgba(0,0,0,.3)'; rr(c, -30, -12, 64, 30, 8); c.fill();
    c.fillStyle = '#6b4a2b'; rr(c, -32, -15, 64, 30, 8); c.fill(); c.strokeStyle = '#15101f'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#ffd166'; c.fillRect(22, -10, 6, 6); c.fillRect(22, 4, 6, 6);
    c.restore();
  }
  window.Render2D = R2;
})();
