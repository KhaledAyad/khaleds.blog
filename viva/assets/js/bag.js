/* Freight City Viva v3, round 4: the bag (Khaled's items 1, 2 and 66). The parcel card says what is happening in plain
   words, asks which building the fact belongs in (three choices, a wrong one only gives a hint), and puts it in the bag;
   the box flies into the bag button, the arrow points to where it goes, and the bag lists every parcel with Read it again
   and Show me the way. Every fact shown is the card by id, word for word. */
(function () {
  'use strict';
  var B = {}, $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return UI.esc(s); };
  var S = function () { return Game.state; };
  var SC = function () { return FCV.data.script; };

  /* where a parcel goes, in plain words */
  B.whereText = function (id) {
    var h = FCV.parcelHome(id); if (!h) return '';
    return h.kind === 'act' ? 'the Act ' + h.act + ' drop box (' + SC().acts[h.act - 1].district.name + ')' : 'the ' + h.label.replace(/^The /, '') + ' door in the Evidence Locker';
  };
  /* a short plain name for a parcel: its figure with codes taken out, else the first words of the card */
  B.shortName = function (id) {
    var r = FCV.resolve(id); if (!r) return id;
    var f = UI.plainFigure ? UI.plainFigure(r.figure) : (r.figure || '');
    if (f && f.length <= 60) return f;
    var w = String(r.text || '').split(/\s+/).slice(0, 7).join(' ');
    return w + (String(r.text || '').split(/\s+/).length > 7 ? '...' : '');
  };
  /* QAD4-03 (rounds 7 and 8): which homes are offered carries no tell. Every home (an act, or a room of the Evidence
     Locker) is offered, right or wrong, in proportion to how often it can still be the right answer: its parcels in the
     current pool (FCV.parcelIds: the districts reached so far) that are not yet picked up, plus the card's own (round 8: a
     district whose parcels are all delivered is no longer offered, so counting "X of Y delivered" gives nothing away): a card's three homes are drawn with inclusion chances of three times the home's
     share of the pool (capped at 1, systematic sampling in a random order), drawn again until the card's own home is among
     them. Then, for any three homes shown, each is the right one a third of the time, so no guess that ignores the card
     wins more than a third: not a position, a neighbour, the distance from Act 4, the ends, a reached district, nor how
     often a home has been offered. Homes with no parcels yet (districts not reached) are offered only when fewer than
     three homes have parcels. When one home holds more than a third of the pool (early in the game: Act 1 holds 8 of 12
     act parcels after Act 1), no three choices can hide it: it is offered every time, and "pick it" wins its share, which
     is the lowest any choice of three can reach. */
  function poolWeights(kind, st, own) {
    var w = {}, picked = (st.parcels && st.parcels.picked) || {};
    FCV.parcelIds(st).forEach(function (id) { if (picked[id] && id !== own) return; var h = FCV.parcelHome(id); if (h && h.kind === kind) { var k = kind === 'room' ? h.room : h.act; w[k] = (w[k] || 0) + 1; } });
    return w;
  }
  /* inclusion chances that add up to k, none over 1 (a home too big to share is always in) */
  function inclusion(w, k) {
    var free = Object.keys(w).filter(function (x) { return w[x] > 0; }), pi = {}, left = k;
    for (;;) {
      if (!free.length || left <= 0) break;
      var tot = 0; free.forEach(function (x) { tot += w[x]; });
      var big = null; free.forEach(function (x) { if (left * w[x] / tot >= 1 && (big === null || w[x] > w[big])) big = x; });
      if (big === null) { free.forEach(function (x) { pi[x] = left * w[x] / tot; }); break; }
      pi[big] = 1; free = free.filter(function (x) { return x !== big; }); left -= 1;
    }
    return pi;
  }
  /* systematic sampling: the homes in a random order laid end to end by their chances; one start, k points a step apart */
  function drawK(pi, k) {
    var order = FCV.shuffle(Object.keys(pi).filter(function (x) { return pi[x] > 0; })), u = Math.random(), got = [], cum = 0, t = 0;
    order.forEach(function (x) { var a = cum; cum += pi[x]; while (t < k && u + t >= a - 1e-9 && u + t < cum - 1e-9) { got.push(x); t++; } });
    for (var j = order.length - 1; got.length < k && j >= 0; j--) if (got.indexOf(order[j]) < 0) got.push(order[j]); /* a point lost to rounding at the very end */
    return got;
  }
  B.homeSet = function (kind, key, all, st, own) {
    key = String(key); var w = poolWeights(kind, st || S(), own); if (!(w[key] > 0)) w[key] = 1; /* a card's own home always counts */
    var pi = inclusion(w, 3), set = null, i;
    for (i = 0; i < 400 && !set; i++) { var d = drawK(pi, 3); if (d.indexOf(key) >= 0) set = d; }
    set = set || [key];
    var rest = FCV.shuffle(all.map(String).filter(function (x) { return set.indexOf(x) < 0; })), zero = rest.filter(function (x) { return !(w[x] > 0); });
    while (set.length < 3 && zero.length) set.push(zero.pop());
    rest = rest.filter(function (x) { return set.indexOf(x) < 0; }); while (set.length < 3 && rest.length) set.push(rest.pop());
    return set;
  };
  /* three choices: the right building plus two of the same kind (other rooms, or other districts) */
  B.choices = function (id, st) {
    var h = FCV.parcelHome(id); if (!h) return [];
    var pool = h.kind === 'room'
      ? SC().evidence_locker.rooms.filter(function (r) { return r.id !== h.room; }).map(function (r) { return { kind: 'room', room: r.id, label: r.name, hint: r.hint }; })
      : SC().acts.map(function (a, i) { return { kind: 'act', act: i + 1, label: 'Act ' + (i + 1) + ': ' + a.district.name, hint: a.district.map_line }; }).filter(function (x) { return x.act !== h.act; });
    /* QAD4-03: the two other homes come from B.homeSet (no tell, rooms as acts); the display order is shuffled */
    var key = h.kind === 'room' ? h.room : h.act, all = [key].concat(pool.map(function (x) { return h.kind === 'room' ? x.room : x.act; }));
    var set = B.homeSet(h.kind, key, all, st, id).filter(function (x) { return x !== String(key); });
    pool = set.map(function (x) { return pool.filter(function (y) { return String(h.kind === 'room' ? y.room : y.act) === x; })[0]; }).filter(Boolean);
    var right = h.kind === 'room' ? { kind: 'room', room: h.room, label: FCV.room(h.room).name, hint: FCV.room(h.room).hint, right: true } : { kind: 'act', act: h.act, label: h.label, hint: SC().acts[h.act - 1].district.map_line, right: true };
    return FCV.shuffle([right].concat(pool.slice(0, 2)));
  };
  /* the parcel card: plain heading (set by the caller), the fact without its label or codes, the task, three choices,
     and "Put it in my bag". Resolves when he presses it (or leaves with Keep it in my bag). */
  B.card = function (id) {
    var cs = B.choices(id), st = S();
    var html = UI.cardHTML(id, { hideLabel: true, hideLoc: true }) +
      '<div class="q">Which building does this belong in?</div><div class="homeChoices opts" role="group" aria-label="Which building">' +
      cs.map(function (c, i) { return '<button class="opt" type="button" data-c="' + i + '"><span class="k">' + (i + 1) + '</span><span>' + esc(c.label) + '</span></button>'; }).join('') +
      '</div><div class="homeHint" aria-live="polite"></div><p class="small">You can read it again any time: open your bag or the Notebook.</p>' +
      '<div class="actions"><button class="btn go" type="button">Put it in my bag</button></div>';
    /* AUDR3-01: with Read cards aloud on, the card's own recorded read plays as it opens (the question has no recording) */
    return UI.custom(null, html, function (done, t) {
      var picked = false;
      if (window.Voice && Voice.load) Voice.load().then(function () { var cc = Voice.cardClip(FCV.resolve(id)); if (cc && document.body.contains(t)) Voice.sequence([{ key: cc.id, text: cc.text, pri: 'card' }]); });
      Array.prototype.forEach.call(t.querySelectorAll('[data-c]'), function (b) {
        b.addEventListener('click', function () {
          var c = cs[+b.getAttribute('data-c')], hint = t.querySelector('.homeHint');
          if (c.right) {
            picked = true; st.parcels.aim = id;
            Array.prototype.forEach.call(t.querySelectorAll('[data-c]'), function (x) { x.disabled = true; });
            b.classList.add('right'); hint.textContent = 'Yes: it belongs in ' + B.whereText(id) + '. The arrow will point there.';
            if (window.Juice) Juice.right(b, b); else if (window.SFX) SFX.right();
            var g = t.querySelector('.btn.go'); if (g) try { g.focus({ preventScroll: true }); } catch (e) {}
          } else {
            /* no penalty: a hint about the building he picked, and he can try again */
            b.disabled = true; b.classList.add('wrong');
            /* QAD3-m4: a Locker room is described by what it holds (its appendices, in the thesis's own titles), and the
               parcel says which appendix it comes from, so the hint steers to the right room */
            var room = c.kind === 'room' ? FCV.room(c.room) : null, apT = function (L) { var ap = FCV.data.facts.appendices.filter(function (a) { return a.letter === L; })[0]; return 'Appendix ' + L + (ap && ap.title ? ' (' + String(ap.title).split(':')[0] + ')' : ''); };
            var own = /app-([A-O])-/.exec(id);
            if (room && room.appendices && room.appendices.length) hint.textContent = 'Not that one. ' + c.label + ' holds ' + room.appendices.map(apT).join(' and ') + '.' + (own ? ' This one comes from ' + apT(own[1]) + '.' : '') + ' Try another.';
            else hint.textContent = 'Not that one. ' + c.label + ' holds this: ' + String(c.hint || '').replace(/\s+$/, '') + (/[.!?]$/.test(String(c.hint || '')) ? '' : '.') + ' Try another.';
            /* QAD3-m5: the hint and Put it in my bag stay in view on a phone */
            try { var gb = t.querySelector('.btn.go'); (gb || hint).scrollIntoView({ block: 'nearest' }); } catch (e) {}
            if (window.Kit) Kit.sfx('SFX-HINT');
          }
        });
      });
      t.querySelector('.btn.go').addEventListener('click', function () { if (window.Sound) Sound.stopVoice(); done(picked); });
    }, 'parcelCard');
  };
  /* after the card: the box flies into the bag button, the tape sound, and one line on where it goes */
  B.added = function (id) {
    var st = S(), btn = $('bagBtn'); if (window.Game) Game.hud();
    /* nothing vanishes silently: a drop box that has not opened yet says when it will */
    var h = FCV.parcelHome(id), open = !(window.Game && Game.homeMarker) || !!Game.homeMarker(id);
    var msg = 'It\'s in your bag (' + st.parcels.bag.length + ' of 6). ' + (open ? 'Ride to ' + B.whereText(id) + ' to deliver it.' : h && h.kind === 'act' ? 'Its drop box opens after the Act ' + h.act + ' film. The parcel waits in your bag.' : 'Its door opens later in the story. The parcel waits in your bag.');
    if (btn && !btn.classList.contains('hidden')) {
      var r = btn.getBoundingClientRect(), box = document.createElement('div'); box.className = 'flyBox';
      box.style.left = (innerWidth / 2 - 17) + 'px'; box.style.top = (innerHeight / 2 - 17) + 'px'; document.body.appendChild(box);
      requestAnimationFrame(function () { requestAnimationFrame(function () { box.style.left = (r.left + r.width / 2 - 17) + 'px'; box.style.top = (r.top + r.height / 2 - 17) + 'px'; box.style.transform = 'scale(.5)'; box.style.opacity = '0.2'; }); });
      setTimeout(function () { box.remove(); btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump'); if (window.Kit) Kit.sfx('SFX-BAG-ADD'); }, 760);
    } else if (window.Kit) Kit.sfx('SFX-BAG-ADD');
    UI.toast(msg, 5200, { recentAction: { label: 'Open my bag', fn: function () { B.open(); } } });
  };
  /* the bag: each parcel in plain words, where it goes, Read it again and Show on the map */
  B.open = async function () {
    var st = S(), bag = st.parcels.bag.slice();
    if (window.Kit) Kit.sfx('SFX-BAG-OPEN');
    var html = bag.length ? '<div class="bagList">' + bag.map(function (id, i) {
      return '<div class="bagRow">' + UI.cardHTML(id, { hideLabel: true, hideLoc: true, compact: true, noMet: true, noTools: true }) +
        '<div class="where">Goes to ' + esc(B.whereText(id)) + '</div>' +
        '<button class="btn small" type="button" data-again="' + i + '">Read it again</button><button class="btn small" type="button" data-show="' + i + '">Show me the way</button></div>';
    }).join('') + '</div><p class="small">Ride into the right drop box or door and every parcel that belongs there is delivered.</p>'
      : '<p>Your bag is empty. Parcels are the brown boxes on the streets: ride into one to pick it up.</p>';
    var pick = await new Promise(function (res) {
      UI.modal('Your bag (' + bag.length + ' of 6)', html, [{ label: 'Done', value: 'done', cls: 'go' }], { onOpen: function (box) {
        Array.prototype.forEach.call(box.querySelectorAll('[data-again],[data-show]'), function (b) {
          b.addEventListener('click', function () { $('modal').classList.add('hidden'); UI.letterbox(); res(b.hasAttribute('data-again') ? { read: bag[+b.getAttribute('data-again')] } : { show: bag[+b.getAttribute('data-show')] }); });
        });
      } }).then(res);
    });
    if (window.Kit) Kit.sfx('SFX-BAG-CLOSE');
    if (pick && pick.read) B.readAgain(pick.read);
    else if (pick && pick.show) B.show(pick.show);
  };
  B.readAgain = function (id) {
    return Game.runFlow(async function () {
      UI.open('Read it again', 'Goes to ' + B.whereText(id), null, { leave: 'Back to the city' });
      try { await UI.say(null, '', { fact: id, next: 'Done', hideLoc: !S().parcels.delivered[id], hideLabel: true }); } catch (e) { if (!e || !e.leave) throw e; }
      UI.close();
    });
  };
  B.show = function (id) {
    var st = S(); st.parcels.aim = id; Game.save(); Game.hud();
    var m = Game.homeMarker && Game.homeMarker(id);
    if (!m) { UI.toast('That door opens later in the story.', 2400); return; }
    UI.toast('The arrow now points to ' + B.whereText(id) + '. Tap Ride there to go.', 3200);
  };
  window.Bag = B;
})();
