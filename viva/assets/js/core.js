/* Freight City Viva v2: core. Pure logic shared by the page and the build checks.
   Data resolver, step ids, spaced memory, the city layout and the viva draw. No DOM here. */
(function (root) {
  'use strict';
  var FCV = {};

  /* ---------------- assets ---------------- */
  var A = {};
  var IMG = ['img-00', 'img-01', 'img-02', 'img-03', 'img-04', 'img-04r', 'img-05', 'img-06', 'img-07', 'img-08', 'img-09', 'img-10', 'img-11', 'img-12', 'img-13', 'img-14', 'img-15', 'img-16', 'img-17', 'img-18',
    'S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S10r', 'S11', 'S13', 'S14', 'S15', 'S16', 'S17', 'S18', 'S20', 'S21', 'S22', 'por-animal', 'por-corra', 'por-tilly'];
  IMG.forEach(function (k) { A[k] = 'assets/img/' + k + '.webp'; });
  var VID = ['V01', 'V02', 'V03', 'V04', 'V05', 'V06', 'V07', 'V08', 'V09', 'V11', 'V12', 'V13', 'V14', 'V16', 'V17', 'V18'];
  VID.forEach(function (k) { A[k] = 'assets/video/' + k + '.mp4'; });
  FCV.assets = A;
  /* v3 media: data/media.json [{id, type, src, poster, duration_s, bytes, used_in}]; ids resolve to their files, videos by kind. */
  var MEDIA = {};
  VID.forEach(function (k) { MEDIA[k] = { id: k, type: 'video', src: A[k] }; });
  FCV.media = MEDIA;
  FCV.addMedia = function (list) {
    (Array.isArray(list) ? list : (list && (list.items || list.media)) || []).forEach(function (m) {
      if (!m || !m.id) return;
      var src = Array.isArray(m.src) ? m.src[0] : m.src;
      MEDIA[m.id] = { id: m.id, type: m.type || m.kind, src: src, poster: m.poster || null, duration_s: m.duration_s || 0, bytes: m.bytes || 0, used_in: m.used_in || [], still: m.still || null, raw: m };
      if (src && /^(still|video|explainer|image)$/.test(m.type || m.kind || '')) A[m.id] = src;
    });
  };
  FCV.mediaOf = function (k) { return MEDIA[k] || null; };
  /* Films live in the asset store (/_blob/<id>, no extension) or in the version (.mp4). */
  FCV.isVideo = function (k) { var m = MEDIA[k]; return !!(m && (m.type === 'video' || m.type === 'explainer') && m.src && (/\.(mp4|webm|mov)$/i.test(m.src) || /^\/_blob\/[0-9a-f]+$/i.test(m.src))); };
  FCV.posterOf = function (k) { var m = MEDIA[k]; return m ? (m.poster || (m.still && A[m.still]) || null) : null; };
  FCV.videoFallback = { V01: 'img-15', V02: 'S04', V03: 'S05', V04: 'S06', V05: 'img-17', V06: 'img-18', V07: 'img-16', V08: 'S02',
    V09: 'S11', V11: 'S13', V12: 'S15', V13: 'S16', V14: 'S18', V16: 'S03', V17: 'S21', V18: 'img-16', V10: 'S06', V15: 'S16' };
  /* Deferred shots (not made) fall back to a near still. */
  FCV.stillFallback = { S12: 'S11', S19: 'S16' };
  FCV.assetUrl = function (k) {
    if (!k) return null;
    if (FCV.isVideo(k)) { var pv = FCV.posterOf(k); if (pv) return pv; }
    if (A[k]) return A[k];
    if (FCV.videoFallback[k]) return A[FCV.videoFallback[k]];
    if (FCV.stillFallback[k]) return A[FCV.stillFallback[k]];
    return null;
  };
  FCV.portraitOverride = { animal: 'por-animal', corra: 'por-corra', tilly: 'por-tilly' };
  FCV.actBackdrop = { 1: 'CS10', 2: 'S03', 3: 'S11', 4: 'S04', 5: 'S05', 6: 'S06', 7: 'S14' };
  FCV.MIN = { 1: 20, 2: 20, 3: 25, 4: 35, 5: 30, 6: 30, 7: 35 };

  /* ---------------- data index ---------------- */
  FCV.data = null;
  var IDX = null;
  FCV.setData = function (d) {
    FCV.data = d;
    IDX = { chFact: {}, chQuiz: {}, app: {}, gloss: {}, actor: {}, prop: {}, chars: {}, rooms: {}, bank: {}, sub: {}, cuts: {} };
    d.story.acts.forEach(function (a) {
      a.key_facts.forEach(function (k) { IDX.chFact[k.id] = k; });
      a.quiz.forEach(function (q) { IDX.chQuiz[q.id] = q; });
    });
    d.story.thesis.objectives.forEach(function (o) { (o.sub || []).forEach(function (s) { IDX.sub[s.number] = { o: o, s: s }; }); });
    d.facts.appendices.forEach(function (a) { IDX.app[a.letter] = a; });
    d.story.glossary.forEach(function (g) { IDX.gloss[g.term] = g; });
    ((d.story.people_and_places || {}).actors || []).forEach(function (a) { IDX.actor[a.kind] = a; });
    d.story.thesis.propositions.forEach(function (p) { IDX.prop[p.id] = p; });
    d.script.characters.forEach(function (c) { IDX.chars[c.id] = c; });
    d.script.evidence_locker.rooms.forEach(function (r) { IDX.rooms[r.id] = r; });
    (d.script.cutscenes || []).forEach(function (c) { IDX.cuts[c.id] = c; });
    FCV.bank = FCV.normaliseBank(d.bank);
    FCV.bank.items.forEach(function (q) { IDX.bank[q.id] = q; });
    FCV.methods = FCV.normaliseMethods(d.methods); MBY = null;
  };
  FCV.character = function (id) { return (IDX && IDX.chars[id]) || null; };
  FCV.room = function (id) { return IDX.rooms[id]; };
  FCV.cut = function (id) { return IDX.cuts[id] || null; };
  FCV.bankItem = function (id) { return IDX.bank[id] || null; };
  FCV.portrait = function (id) {
    if (FCV.portraitOverride[id]) return FCV.portraitOverride[id];
    var c = FCV.character(id);
    if (!c || !c.image || c.image === 'none' || c.image === 'new') return null;
    return c.image;
  };
  FCV.nameOf = function (id) {
    if (id === 'you') return 'You';
    var c = FCV.character(id);
    return c ? c.name : id;
  };
  FCV.roleOf = function (id) { var c = FCV.character(id); return c ? c.role : ''; };

  /* ---------------- resolver ---------------- */
  FCV.resolve = function (id) {
    if (!id || !IDX) return null;
    var d = FCV.data, t = d.story.thesis, m;
    if ((m = /^thesis\.(\w+)$/.exec(id))) {
      var f = t[m[1]]; if (!f || !f.text) return null;
      var lab = { one_sentence: 'The one sentence', aim: 'The aim', research_question: 'The research question', four_findings_intro: 'The four findings', objectives_note: 'Where each objective is answered' }[m[1]] || 'The thesis';
      return { id: id, type: 'card', label: lab, figure: null, text: f.text, loc: f.section, quote: true };
    }
    if ((m = /^obj-([1-5][A-C])$/.exec(id))) {
      var so = IDX.sub[m[1]]; if (!so) return null;
      return { id: id, type: 'card', label: 'Objective ' + m[1], figure: 'Objective ' + m[1], text: so.s.text, loc: t.objectives_section + '; objective ' + so.o.number + ' is answered in ' + so.o.answered_in };
    }
    if ((m = /^obj-(\d)$/.exec(id))) {
      var o = t.objectives[+m[1] - 1]; if (!o) return null;
      return { id: id, type: 'card', label: 'Objective ' + o.number, figure: 'Objective ' + o.number, text: o.text,
        list: (o.sub || []).map(function (x) { return x.number + '. ' + x.text; }), loc: 'Answered in ' + o.answered_in };
    }
    if ((m = /^link-(\d)$/.exec(id))) {
      var l = t.five_links[+m[1] - 1]; if (!l) return null;
      return { id: id, type: 'card', label: 'Link ' + l.link + (l.link === 5 ? ' (proposed, not found)' : ''), figure: 'Link ' + l.link + ': ' + l.name, text: l.statement,
        list: [l.definition, 'Counted across the interviews: ' + l.count], loc: 'Tested in ' + l.tested_in };
    }
    if ((m = /^finding-(\d)$/.exec(id))) {
      var fd = t.four_findings[+m[1] - 1]; if (!fd) return null;
      return { id: id, type: 'card', label: 'Finding ' + fd.number, figure: 'Finding ' + fd.number + ': ' + fd.name, text: fd.as_named_in_6_1, loc: fd.section };
    }
    if ((m = /^P(\d)$/.exec(id))) {
      var p = IDX.prop[id]; if (!p) return null;
      return { id: id, type: 'card', label: 'Proposition ' + p.id, figure: p.id + ': ' + p.name, text: p.text,
        list: ['Rests on ' + p.rests_on, 'Falsified by ' + p.falsified_by], loc: t.propositions_section };
    }
    if ((m = /^glossary:(.+)$/.exec(id))) {
      var g = IDX.gloss[m[1]]; if (!g) return null;
      return { id: id, type: 'card', label: 'Glossary', figure: g.term, text: g.meaning, loc: g.section };
    }
    if ((m = /^actor:(.+)$/.exec(id))) { return IDX.actor[m[1]] ? { id: id, type: 'audit' } : null; }
    if ((m = /^ch(\d)-(\d\d)$/.exec(id))) {
      var kf = IDX.chFact[id]; if (!kf) return null;
      return { id: id, type: 'card', label: 'Chapter ' + m[1], figure: kf.figure || null, text: kf.fact, loc: kf.section, act: +m[1] };
    }
    if ((m = /^ch(\d)-q(\d+)$/.exec(id))) {
      var q = IDX.chQuiz[id]; if (!q) return null;
      return { id: id, type: 'quiz', label: 'Chapter ' + m[1], q: q.q, options: q.options, answer: q.answer_index, explanation: q.explanation, loc: q.section, act: +m[1] };
    }
    if ((m = /^ch(\d)-eq(\d+)$/.exec(id))) {
      var act = d.story.acts[+m[1] - 1]; var e = act && act.examiner_questions[+m[2] - 1]; if (!e) return null;
      return { id: id, type: 'eq', label: 'Chapter ' + m[1], question: e.question, answer: e.model_answer, loc: e.section, act: +m[1] };
    }
    if ((m = /^ch(\d)-tp$/.exec(id))) {
      var ta = d.story.acts[+m[1] - 1]; if (!ta) return null;
      return { id: id, type: 'card', label: 'Turning point, chapter ' + m[1], figure: null, text: ta.turning_point.quote, loc: ta.turning_point.section, quote: true, act: +m[1] };
    }
    if ((m = /^ch(\d)-b(\d+)$/.exec(id))) {
      var ba = d.story.acts[+m[1] - 1]; return ba && ba.story_beats[+m[2] - 1] !== undefined ? { id: id, type: 'audit' } : null;
    }
    if ((m = /^app-([A-O])-(what|why)$/.exec(id))) {
      var ap = IDX.app[m[1]]; if (!ap) return null;
      return { id: id, type: 'card', label: 'Appendix ' + ap.letter + ': ' + ap.title, figure: m[2] === 'what' ? 'What it is' : 'Why it exists',
        text: m[2] === 'what' ? ap.what_it_is : ap.why_it_exists, loc: 'Appendix ' + ap.letter, letter: ap.letter };
    }
    if ((m = /^app-([A-O])-f(\d+)$/.exec(id))) {
      var af = IDX.app[m[1]] && IDX.app[m[1]].key_facts[+m[2] - 1]; if (!af) return null;
      return { id: id, type: 'card', label: 'Appendix ' + m[1], figure: af.figure, text: af.fact, loc: FCV.plainCodes(af.location), letter: m[1] };
    }
    if ((m = /^app-([A-O])-q(\d+)$/.exec(id))) {
      var aq = IDX.app[m[1]] && IDX.app[m[1]].quiz[+m[2] - 1]; if (!aq) return null;
      return { id: id, type: 'quiz', label: 'Appendix ' + m[1], q: aq.q, options: aq.options, answer: aq.answer_index, explanation: aq.explanation, loc: FCV.plainCodes(aq.location), letter: m[1] };
    }
    if ((m = /^app-([A-O])-eq(\d+)$/.exec(id))) {
      var ae = IDX.app[m[1]] && IDX.app[m[1]].examiner_questions[+m[2] - 1]; if (!ae) return null;
      return { id: id, type: 'eq', label: 'Appendix ' + m[1], question: ae.question, answer: ae.model_answer, loc: 'Appendix ' + m[1], letter: m[1] };
    }
    if ((m = /^trace-(\d\d)$/.exec(id))) {
      var tr = d.facts.trace_the_number[+m[1] - 1]; if (!tr) return null;
      return { id: id, type: 'trace', number: tr.number, means: tr.what_it_means, stated: tr.stated_in_chapter, from: FCV.plainCodes(tr.comes_from), index: +m[1] - 1 };
    }
    if ((m = /^gap-(\d\d)$/.exec(id))) {
      var gp = d.facts.gaps_and_honest_answers[+m[1] - 1]; if (!gp) return null;
      return { id: id, type: 'gap', gap: gp.gap, answer: gp.model_answer, where: gp.where_disclosed };
    }
    if ((m = /^bank:(.+)$/.exec(id))) {
      var bq = IDX.bank[m[1]]; if (!bq) return null;
      return { id: id, type: 'bank', item: bq, q: bq.question, options: bq.options, answer: bq.answer_index, explanation: bq.why, loc: bq.source };
    }
    if ((m = /^recall:(.+)$/.exec(id))) return FCV.recallItem(m[1]);
    if ((m = /^say:(.+)$/.exec(id))) { var sb = FCV.resolve(m[1]); return sb && sb.type === 'card' ? Object.assign({}, sb, { id: id, type: 'say', base: m[1] }) : null; }
    if ((m = /^cutscene:(.+)$/.exec(id))) return IDX.cuts[m[1].split(' ')[0]] ? { id: id, type: 'audit' } : null;
    if ((m = /^drill:(.+)$/.exec(id))) return d.script.drills[m[1].split(' ')[0]] ? { id: id, type: 'audit' } : null;
    if ((m = /^method:([a-z0-9_]+):q(\d+)$/.exec(id))) {
      var mq = FCV.methodById(m[1]), qq = mq && mq.quiz[+m[2] - 1]; if (!qq) return null;
      return { id: id, type: 'quiz', label: mq.term, q: qq.q, options: qq.options, answer: qq.answer_index, explanation: FCV.supportingWhy(mq, qq), loc: (mq.raw.sections || []).join('; '), method: m[1],
        recallOnly: FCV.failsLengthGate(qq) };
    }
    if ((m = /^method:([a-z0-9_]+):v(\d+)$/.exec(id))) {
      var mv = FCV.methodById(m[1]), vq = mv && mv.viva[+m[2] - 1]; if (!vq) return null;
      return { id: id, type: 'eq', label: mv.term + ': viva question', question: vq.q || vq.question, answer: vq.model_answer || vq.answer, loc: (mv.raw.sections || []).join('; '), method: m[1] };
    }
    if ((m = /^method:([a-z0-9_]+):gap$/.exec(id))) {
      var mg = FCV.methodGap(m[1]); if (!mg) return null;
      return { id: id, type: 'gap', gap: mg, answer: mg, where: 'Methods Academy: ' + FCV.methodById(m[1]).term, method: m[1] };
    }
    if ((m = /^method:([a-z0-9_]+)\.(\w+)$/.exec(id))) return FCV.methodById(m[1]) ? { id: id, type: 'audit' } : null;
    if ((m = /^method:(.+)$/.exec(id))) return FCV.methodCard(m[1]);
    if ((m = /^falsifier:(P\d)$/.exec(id))) { var fp = IDX.prop[m[1]]; return fp ? { id: id, type: 'card', label: 'What would falsify ' + fp.id, figure: fp.id + ': ' + fp.name, text: fp.falsified_by, loc: t.propositions_section } : null; }
    if ((m = /^count:link-(\d)$/.exec(id))) { var cl = t.five_links[+m[1] - 1]; return cl ? { id: id, type: 'card', label: 'Link ' + cl.link + ': the count', figure: 'Link ' + cl.link + ': ' + cl.name, text: String(cl.count), loc: 'Tested in ' + cl.tested_in } : null; }
    if ((m = /^answer:obj-(\d)$/.exec(id))) {
      var ao = t.four_findings[+m[1] - 1];
      if (ao) return { id: id, type: 'card', label: 'Objective ' + m[1] + ': the answer', figure: 'Finding ' + ao.number + ': ' + ao.name, text: ao.as_answered_in_chapter_4, loc: ao.page_chapter_4 ? 'Chapter 4' : ao.section };
      if (+m[1] === 5) { var l5 = t.five_links[4]; return l5 ? { id: id, type: 'card', label: 'Objective 5: the answer (proposed, not found)', figure: 'Link 5: ' + l5.name, text: l5.statement, loc: 'Tested in ' + l5.tested_in } : null; }
      return null;
    }
    if ((m = /^card:app-([A-O])$/.exec(id))) { var ca = IDX.app[m[1]]; return ca ? { id: id, type: 'card', label: 'Appendix ' + ca.letter, figure: 'Appendix ' + ca.letter + ': ' + ca.title, text: ca.what_it_is, list: [ca.why_it_exists], loc: 'Appendix ' + ca.letter, letter: m[1] } : null; }
    if ((m = /^place:(\d+)$/.exec(id))) { var pl = ((d.story.people_and_places || {}).places || [])[+m[1] - 1]; return pl ? { id: id, type: 'card', label: 'A place in the thesis', figure: pl.place, text: pl.role, loc: pl.section } : null; }
    return null;
  };

  /* Figure recall: the fact with its figure hidden; the figure and three sibling figures as options. */
  FCV.recallItem = function (fid) {
    var r = FCV.resolve(fid); if (!r || r.type !== 'card' || !r.figure) return null;
    var sibs = [];
    var m = /^ch(\d)-/.exec(fid), a = /^app-([A-O])-f/.exec(fid);
    if (m) FCV.data.story.acts[+m[1] - 1].key_facts.forEach(function (k) { if (k.id !== fid && k.figure && k.figure !== r.figure && sibs.indexOf(k.figure) < 0) sibs.push(k.figure); });
    if (a) IDX.app[a[1]].key_facts.forEach(function (k) { if (k.figure && k.figure !== r.figure && sibs.indexOf(k.figure) < 0) sibs.push(k.figure); });
    /* distractors share the right figure's form: numbers against numbers, words against words; fewer than three: a Say it */
    var hasNum = function (x) { return /\d/.test(x) || new RegExp('\\b(?:' + NUMW + ')\\b', 'i').test(x); };
    sibs = sibs.filter(function (x) { return hasNum(x) === hasNum(r.figure); });
    if (sibs.length < 3) return Object.assign({}, r, { id: 'recall:' + fid, type: 'say', base: fid, recallAsSay: true });
    var rng = FCV.rng(hash32(fid));
    var opts = shuffle([r.figure].concat(shuffle(sibs, rng).slice(0, 3)), rng);
    var masked = FCV.maskFigure(r.text, r.figure);
    /* Where the figure cannot be hidden in its own sentence, the item stays a Say it, never a free point. */
    /* an interview code that is in the figure and still in the question would give the answer away: a Say it instead */
    var codes = String(r.figure).match(/\b[AB]\d{1,2}\b/g) || [];
    if (masked !== null && codes.some(function (c) { return new RegExp('\\b' + c + '\\b').test(masked); })) masked = null;
    if (masked === null) return Object.assign({}, r, { id: 'recall:' + fid, type: 'say', base: fid, recallAsSay: true });
    return { id: 'recall:' + fid, type: 'quiz', label: r.label + ': recall', q: 'Which figure goes with this? ' + masked, options: opts, answer: opts.indexOf(r.figure), explanation: r.text, loc: r.loc, recall: fid };
  };
  var NUMW = 'zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|half|third|quarter|single|once|twice|dozen';
  var MONTHS = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/g;
  function figTokens(fig) {
    var toks = [], f = String(fig), W = NUMW.split('|');
    /* digit groups, not codes such as A5, H1-11 or 1a; ordinals count (1st) */
    f.replace(/(^|[^A-Za-z\d])(\d[\d,.:]*\d|\d)(?:st|nd|rd|th)?(?![A-Za-z\d])/g, function (m, pre, n) { n = n.replace(/[.,:]$/, ''); toks.push(n); n.split(':').forEach(function (p) { if (p && p !== n) toks.push(p); }); return m; });
    (f.toLowerCase().match(new RegExp('\\b(?:' + NUMW + ')(?:-(?:' + NUMW + '))?\\b', 'g')) || []).forEach(function (w) { if (!/^(one|zero|single|once)$/.test(w)) toks.push(w); });
    (f.match(/["\u201c\u2018']([^"\u201d\u2019']{3,})["\u201d\u2019']/g) || []).forEach(function (q) { toks.push(q.slice(1, -1)); });
    (f.match(MONTHS) || []).forEach(function (mo) { toks.push(mo); });
    /* the same small numbers in the other form: 6 and six, ten and 10 */
    toks.slice().forEach(function (k) { if (/^\d+$/.test(k) && +k >= 2 && +k <= 20) toks.push(W[+k]); var wi = W.indexOf(k); if (wi >= 2 && wi <= 20) toks.push(String(wi)); });
    /* 21 to 99 as a whole compound word (twenty-six), so a mask never leaves half of it */
    var TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    toks.slice().forEach(function (k) { if (/^\d+$/.test(k) && +k >= 21 && +k <= 99) toks.push(TENS[Math.floor(+k / 10)] + (+k % 10 ? '-' + W[+k % 10] : '')); });
    /* longest first, so 'twenty-six' is masked before 'six' */
    return toks.filter(Boolean).sort(function (x, y) { return y.length - x.length; });
  }
  function escRe(x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /* The fact text with the figure's numbers, number words and quoted phrases replaced by ___; null if it still shows. */
  FCV.maskFigure = function (text, fig) {
    var t = String(text || ''), f = String(fig || '').trim(); if (!f) return t;
    t = t.replace(new RegExp(escRe(f), 'gi'), '___');
    figTokens(f).forEach(function (k) { t = t.replace(new RegExp('(^|[^\\w])' + escRe(k) + '(?![\\w])', 'gi'), '$1___'); });
    var still = figTokens(f).some(function (k) { return new RegExp('(^|[^\\w])' + escRe(k) + '(?![\\w])', 'i').test(t); });
    if (still || t.toLowerCase().indexOf(f.toLowerCase()) >= 0 || t.indexOf('___') < 0) return null;
    return t;
  };

  /* Trace-the-number options: the right "comes from" plus three from other appendices. */
  /* QAD4-04: a source with a raw code in it (row INIT) is never a wrong option, and the wrong options are spread: the
     least used so far this session come first, so no one source keeps turning up as the one that is always wrong */
  var traceUse = {};
  FCV.traceOptions = function (id, rng) {
    var tr = FCV.resolve(id); var all = FCV.data.facts.trace_the_number;
    var letterOf = function (s) { var mm = /Appendix ([A-O])/.exec(s); return mm ? mm[1] : s; };
    var mine = letterOf(tr.from), pool = [], seenL = {}; seenL[mine] = 1;
    var order = shuffle(all.map(function (x, i) { return i; }), rng).filter(function (i) { return i !== tr.index && !/\b[A-Z]{3,}\b/.test(all[i].comes_from); });
    order.sort(function (a, b) { return (traceUse[all[a].comes_from] || 0) - (traceUse[all[b].comes_from] || 0); });
    order.forEach(function (i) {
      var c = all[i].comes_from, L = letterOf(c);
      if (!seenL[L] && pool.length < 3) { seenL[L] = 1; pool.push(c); }
    });
    pool.forEach(function (c) { traceUse[c] = (traceUse[c] || 0) + 1; });
    var opts = shuffle(pool.concat([tr.from]), rng);
    return { options: opts, answer: opts.indexOf(tr.from) };
  };

  /* Text used for the memory stamp: when an item's words change, its old stats are dropped. */
  FCV.itemText = function (id) {
    var r = FCV.resolve(id); if (!r) return '';
    /* recall items keep the stamp of the full fact text, so masking the figure never wipes earned memory */
    if (r.recall) return 'Which figure goes with this? ' + r.explanation + '|' + r.options[r.answer];
    if (r.recallAsSay) return 'Which figure goes with this? ' + r.text + '|' + r.figure;
    if (r.type === 'quiz' || r.type === 'bank') return r.q + '|' + r.options[r.answer];
    if (r.type === 'eq') return r.question + '|' + r.answer;
    if (r.type === 'gap') return r.gap + '|' + r.answer;
    if (r.type === 'trace') return r.number + '|' + r.from;
    if (r.type === 'card' || r.type === 'say') return (r.figure || '') + '|' + r.text;
    return id;
  };
  FCV.stamp = function (id) { return ('000000' + (hash32(FCV.itemText(id)) >>> 0).toString(36)).slice(-6); };

  /* ---------------- helpers ---------------- */
  function hash32(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  FCV.hash32 = hash32;
  function shuffle(a, rng) { a = a.slice(); rng = rng || Math.random; for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  FCV.shuffle = shuffle;
  FCV.rng = function (seed) { var x = seed >>> 0 || 1; return function () { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
  FCV.pick = function (a, rng) { return a[Math.floor((rng || Math.random)() * a.length)]; };
  /* One sentence splitter for the whole game: a sentence ends at . ! or ? followed by space and then a capital letter, a
     quote or a bracket; never after an abbreviation (No, Nos, p, pp, s, et al, e.g, i.e, cf, vs, Dr, Prof, Fig, Table,
     ch, App, approx), a single initial, or a digit (section numbers such as "4." and "Table 3.5"). */
  var ABBR = /(?:^|[\s(])(?:No|Nos|no|nos|p|pp|s|ss|al|e\.g|i\.e|cf|vs|Dr|Prof|Mr|Mrs|Ms|Fig|Figs|Tab|Ch|ch|App|app|approx|ca|para|paras|vol|ed|eds|Sec|sec|Art|art|St|n|nn|op|cit|ibid|viz|etc)$/;
  FCV.sentences = function (t) {
    t = String(t || ''); var out = [], start = 0, re = /([.!?])(["'\u201d\u2019)\]]*)(\s+)(?=["'\u201c\u2018(\[]?[A-Z])/g, m;
    while ((m = re.exec(t))) {
      var before = t.slice(start, m.index), word = /(\S+)$/.exec(before);
      var w = word ? word[1].replace(/^[("'\u201c\u2018\[]+/, '') : '';
      /* after a digit a sentence ends only when it is not a list number ("1." at the start of the text or a line) */
      if (m[1] === '.' && (ABBR.test(' ' + w) || /^[A-Za-z]$/.test(w) || (/\d$/.test(w) && (/^\d{1,2}$/.test(w) && /(^|\n)\s*$/.test(before.slice(0, before.length - w.length)) || /\b(?:Table|Figure|Fig|Section|Appendix|Chapter|File|Stage|Link|Objective|P)\s+[\dA-Z.]*$/.test(before) && /^\d+(?:\.\d+)*$/.test(w) && /^\s+\(/.test(t.slice(m.index + 1)))) || /(^|\.)[A-Za-z]\.[A-Za-z]$/.test(w))) continue;
      out.push(t.slice(start, m.index + m[1].length + m[2].length).trim()); start = m.index + m[0].length;
    }
    if (start < t.length && t.slice(start).trim()) out.push(t.slice(start).trim());
    return out.length ? out : [t.trim()];
  };
  FCV.firstSentence = function (t) { return FCV.sentences(t)[0] || ''; };
  FCV.clauses = function (t) { return String(t || '').split(/(?<=[,;:])\s+/).filter(Boolean); };

  /* Point-check: two to four boxes from the model answer, in its own words. */
  /* Section references in brackets are stripped from tick boxes; boxes under three words are dropped (box 1 is always the
     start of the answer). */
  /* QAD3-M1 (clarity): a bracket goes only when everything in it is a reference (a section, table, appendix, file or page,
     a year); one that carries a figure (alpha .80, a per cent, a count) stays. A space before a figure that starts with a
     decimal point is kept ("alpha .80", never "alpha.80"). */
  function refOnly(inner) {
    if (/\b(?:alpha|kappa|per cent)\b|%/i.test(inner)) return false;
    var rest = String(inner)
      .replace(/\b(?:Tables?|Figures?|Fig\.|Sections?|Appendix|Appendices|Chapters?|Files?|Stages?|Rows?|No\.|pp?\.)\s*[A-Z]?[\d.]*[a-z]?(?:\s*(?:,|and|to|\u2013|-)\s*[A-Z]?(?:\.?\d[\d.]*)[a-z]?)*/gi, '')
      .replace(/\b[A-Z]?\d+\.\d+(?:\.\d+)*[a-z]?\b/g, '').replace(/\b[A-Z]\.\d+(?:\.\d+)*\b/g, '').replace(/\b(?:19|20)\d\d[a-z]?\b/g, '');
    return !/\d/.test(rest);
  }
  function stripRefs(s) { return String(s).replace(/\s*\((?=[^()]*(?:\d\.\d|\bTable\b|\bsection|\bAppendix\b|\bp\.|\bpp\.|\bFile\b|\bNo\.))([^()]*)\)/gi, function (all, inner) { return refOnly(inner) ? '' : all; }).replace(/\s+([.,;:])(?!\d)/g, '$1').trim(); }
  FCV.refOnly = refOnly;
  FCV.stripRefs = stripRefs;
  /* A recall reveal: the right option, then its explanation without the leading section references (the location chip shows them). */
  /* QAD3-m1 (clarity): a Hall item's note compares the strong answer with "the others"; where only the strong answer is on
     the screen (Say it), the note keeps its first sentence about that answer and drops the comparison */
  /* QAD3-m7: a raw column code in a source line is shown as plain words ("row INIT" is the initiator row) */
  var CODES = { INIT: 'the initiator row' };
  FCV.plainCodes = function (s) { if (s == null) return s; return String(s).replace(/\brow (INIT)\b/g, function (a, k) { return CODES[k]; }).replace(/(,\s*)(INIT)\b/g, function (a, sep, k) { return sep + CODES[k]; }); };
  FCV.whyStrong = function (why) {
    var w = String(why || ''), cut = w.search(/(^|\s)The others\b/), first = (cut >= 0 ? w.slice(0, cut) : (FCV.sentences(w)[0] || '')).trim();
    if (!first) return '';
    return first.replace(/^Strong\b/, 'This answer');
  };
  FCV.revealText = function (r) {
    var ex = String((r.type === 'bank' ? FCV.whyStrong(r.explanation) : r.explanation) || '').replace(/^\s*(?:(?:[A-Z]\.)?[1-9]\d*(?:\.\d+)+[a-z]?(?:\s*(?:;|,|and|:|\.(?=\s|$))\s*|\s*$))+/, '').trim();
    if (ex) ex = ex.charAt(0).toUpperCase() + ex.slice(1);
    var opt = String(r.options[r.answer]).replace(/[.\s]+$/, '');
    /* the explanation already opens with the answer ("170 full text, ..."): say it once */
    if (ex && ex.toLowerCase().indexOf(opt.toLowerCase()) === 0) return ex;
    return opt + '.' + (ex ? ' ' + ex : '');
  };
  FCV.pointCheck = function (text) {
    text = String(text || '');
    var sentences = FCV.sentences(text).map(function (s, i) { return i === 0 ? s.trim() : stripRefs(s); }).filter(function (s) { return !!String(s).trim(); });
    /* QAD4-06: a sentence of four words or fewer ("Yes.", "Two things.", "It compels nothing.") is joined to the sentence after
       it (the last one to the one before), so no box means nothing on its own; the words stay as written */
    var joined = [], carry = '';
    sentences.forEach(function (s, i) {
      s = String(s).trim();
      if (wc(s) <= 4 && i < sentences.length - 1) { carry += s + ' '; return; }
      if (wc(s) <= 4 && !carry && joined.length) { joined[joined.length - 1] += ' ' + s; return; }
      joined.push(carry + s); carry = '';
    });
    sentences = joined.filter(function (s, i) { return i === 0 || s.split(/\s+/).length >= 3; });
    /* one long sentence (the thesis's one sentence, for instance): a box per clause, never one box for all of it */
    if (sentences.length === 1 && wc(sentences[0]) > 24) {
      var cl = FCV.clauseBoxes(sentences[0]);
      if (cl.length > 1) return cl.map(function (c, i) { return { kind: i ? 'clause' : 'first', text: c }; });
    }
    var boxes = [{ kind: 'first', text: sentences[0] }];
    var used = {};
    var numRe = /\d[\d,.]*(?:\s?per cent|%)?/g, secRe = /\b\d\.\d\b/;
    for (var i = 1; i < sentences.length && boxes.length < 4; i++) {
      var s = sentences[i];
      if (used[s]) continue;
      if (numRe.test(s)) { boxes.push({ kind: 'number', text: s }); used[s] = 1; }
      numRe.lastIndex = 0;
    }
    for (var j = 0; j < sentences.length && boxes.length < 4; j++) {
      var s2 = sentences[j];
      if (j === 0 || used[s2]) continue;
      if (secRe.test(s2)) { boxes.push({ kind: 'section', text: s2 }); used[s2] = 1; }
    }
    if (boxes.length < 2 && sentences.length > 1) boxes.push({ kind: 'rest', text: sentences[1] });
    return boxes;
  };
  function wc(t) { return String(t).trim().split(/\s+/).filter(Boolean).length; }
  /* Split points outside brackets and quotes: '; ' and ': ' always; ', ' only where both sides keep five words or more
     and the comma is not inside a list. Clauses of four words or fewer join the next; at most four boxes, merging the
     shortest neighbouring pair. */
  function topSplit(t, chars) {
    var out = [], depth = 0, dq = false, sq = 0, cur = '';
    for (var i = 0; i < t.length; i++) {
      var c = t[i], prev = t[i - 1] || ' ', next = t[i + 1] || ' ';
      if (c === '(' || c === '[' || c === '\u201c') depth++;
      else if ((c === ')' || c === ']' || c === '\u201d') && depth > 0) depth--;
      else if (c === '"') dq = !dq;
      else if ((c === "'" || c === '\u2018') && /[\s(\[]/.test(prev) && /\S/.test(next)) sq++;
      else if ((c === "'" || c === '\u2019') && sq > 0 && /\S/.test(prev) && /[\s.,;:)\]]/.test(next)) sq--;
      cur += c;
      if (chars.indexOf(c) >= 0 && next === ' ' && !depth && !dq && !sq) { out.push(cur.trim()); cur = ''; }
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  FCV.clauseBoxes = function (sentence) {
    var parts = [], grp = [];
    topSplit(sentence, ';:').forEach(function (p, gi) {
      var pcs = topSplit(p, ','), chunk = '';
      for (var i = 0; i < pcs.length; i++) {
        chunk = chunk ? chunk + ' ' + pcs[i] : pcs[i];
        if (i === pcs.length - 1) break;
        var rest = pcs.slice(i + 1).join(' '), a = wc(pcs[i]), b = wc(pcs[i + 1]);
        var listy = (a <= 3 && b <= 4) || (/^(?:and|or|nor)\b/i.test(pcs[i + 1]) && b <= 5) || (a <= 3 && i > 0 && wc(pcs[i - 1]) <= 3);
        if (wc(chunk) >= 5 && wc(rest) >= 5 && !listy) { parts.push(chunk); grp.push(gi); chunk = ''; }
      }
      if (chunk) { parts.push(chunk); grp.push(gi); }
    });
    for (var j = 0; j < parts.length; j++) if (wc(parts[j]) <= 4 && parts.length > 1) {
      if (j < parts.length - 1) { parts[j + 1] = parts[j] + ' ' + parts[j + 1]; parts.splice(j, 1); grp.splice(j, 1); j--; }
      else { parts[j - 1] += ' ' + parts[j]; parts.splice(j, 1); grp.splice(j, 1); }
    }
    /* over four: merge the shortest neighbouring pair, preferring two pieces of the same clause over a semicolon or colon */
    while (parts.length > 4) {
      var best = 0, bw = Infinity;
      for (var k = 0; k < parts.length - 1; k++) { var w2 = wc(parts[k]) + wc(parts[k + 1]) + (grp[k] === grp[k + 1] ? 0 : 1000); if (w2 < bw) { bw = w2; best = k; } }
      parts.splice(best, 2, parts[best] + ' ' + parts[best + 1]); grp.splice(best + 1, 1);
    }
    return parts;
  };
  FCV.rateFromBoxes = function (ticks) {
    if (!ticks.length) return 'missed';
    var all = ticks.every(Boolean); if (all) return 'nailed';
    var rest = ticks.slice(1), half = rest.filter(Boolean).length >= Math.ceil(rest.length / 2);
    return ticks[0] && half ? 'partly' : 'missed';
  };

  /* ---------------- acts: step ids ---------------- */
  FCV.actSteps = function (n) {
    var a = FCV.data.script.acts[n - 1];
    return (a.steps || []).map(function (sid) {
      var m;
      if ((m = /^scene:(.+)$/.exec(sid))) {
        var idx = -1; a.scenes.forEach(function (s, i) { if (s.id === m[1]) idx = i; });
        return { id: sid, kind: 'scene', idx: idx, title: 'Scene ' + m[1] + ': ' + (a.scenes[idx] || {}).title };
      }
      if ((m = /^rehearsal:(.+)$/.exec(sid))) {
        var q = m[1], which = a.examiner_rehearsal && a.examiner_rehearsal.question === q ? 'examiner_rehearsal' :
          a.examiner_rehearsal_2 && a.examiner_rehearsal_2.question === q ? 'examiner_rehearsal_2' : a.rehearsal_borrowed && a.rehearsal_borrowed.ref === q ? 'rehearsal_borrowed' : null;
        var asker = which ? a[which].asker : 'dr_tally';
        return { id: sid, kind: 'rehearsal', which: which, question: q, asker: asker, title: 'Rehearsal with ' + FCV.nameOf(asker) };
      }
      if ((m = /^methods:(.+)$/.exec(sid))) {
        var mi = (FCV.data.script.methods_academy.missions || {})[m[1]] || {};
        return { id: sid, kind: 'methods', key: m[1], title: 'Methods mission: ' + (mi.name || m[1]) };
      }
      var titles = { opening: 'Ride into ' + a.district.name, tp: 'Turning point: ' + a.turning_point.title, on_air: 'On air', ladder: 'The one sentence, again',
        mission: 'Mission: ' + a.mission.name, mock_viva: 'Dress rehearsal', closer: 'District cleared', academy_entrance: 'The Methods Academy opens', shift_check: 'Shift Check' };
      return { id: sid, kind: sid, title: titles[sid] || sid };
    });
  };
  FCV.slotOf = function (step) {
    if (step.kind === 'scene') return 'scene' + step.idx;
    if (step.kind === 'tp' || step.kind === 'on_air' || step.kind === 'ladder') return 'tp';
    if (step.kind === 'mission') return 'mission';
    if (step.kind === 'rehearsal' || step.kind === 'mock_viva') return 'rehearsal';
    if (step.kind === 'opening') return 'scene0';
    if (step.kind === 'methods' || step.kind === 'academy_entrance') return 'scene3';
    if (step.kind === 'shift_check') return 'rehearsal';
    return 'tp';
  };
  FCV.stepSpeaker = function (n, step) {
    var a = FCV.data.script.acts[n - 1];
    var firstOther = function (lines) { for (var i = 0; i < lines.length; i++) if (lines[i].who !== 'you') return lines[i].who; return 'you'; };
    if (step.kind === 'scene') return firstOther(a.scenes[step.idx].lines);
    if (step.kind === 'tp') return firstOther(a.turning_point.lines);
    if (step.kind === 'on_air' || step.kind === 'ladder') return 'vera';
    if (step.kind === 'mission') return a.mission.giver;
    if (step.kind === 'rehearsal') return step.asker;
    if (step.kind === 'mock_viva') return 'dr_tally';
    if (step.kind === 'methods') { var mm = FCV.data.script.methods_academy.missions[step.key]; return (mm && mm.giver) || 'sam'; }
    if (step.kind === 'shift_check') return 'digits';
    return 'you';
  };

  /* ---------------- rooms ---------------- */
  /* QAD4-04: trace-09 ("95 of 117") is not asked as a trace question. Its right source is the only option that carries
     the card's own number ('Combined from rows (117)'), no other source line in the fact files mentions 117, and the
     quoted column name stays word for word. "95 of 117" is still taught (Act 1 and Act 4 key facts, the third finding in
     the chain, Methods lessons 13, 37 and 71, the Notebook's trace table) and tested (the Act 4 quiz, lesson 13's quiz,
     lesson 71's viva question, the Hall question on the binder's reliability). The Depot keeps its recorded line for its
     other number. */
  FCV.TRACE_NOT_ASKED = { 'trace-09': 1 };
  FCV.roomStages = function (room) {
    var all = [room.trace].concat(room.more_traces || []).filter(Boolean), traces = all.filter(function (t) { return !FCV.TRACE_NOT_ASKED[t.ref]; });
    if (!traces.length) traces = all;
    else if (traces[0] !== all[0] && all[0].digits_line && !traces[0].digits_line) traces[0] = Object.assign({}, traces[0], { digits_line: all[0].digits_line });
    var gaps = room.more_gaps || [];
    return [
      { kind: 'brief', title: 'Briefing from ' + FCV.nameOf(room.keeper) },
      { kind: 'quiz', title: 'The shelf quiz', items: room.quiz },
      { kind: 'trace', title: 'Digits at the door', items: traces },
      { kind: 'grill', title: 'The Grill', items: [room.tough_examiner].concat(gaps) },
      { kind: 'corner', title: 'Examiner corner', items: room.examiner_corner || [], optional: true }
    ];
  };
  FCV.roomOfLetter = function (L) {
    var rooms = FCV.data.script.evidence_locker.rooms;
    for (var i = 0; i < rooms.length; i++) if (rooms[i].appendices.indexOf(L) >= 0) return rooms[i];
    return null;
  };

  /* ---------------- progress (schema v2) ---------------- */
  FCV.SAVE_KEY_V3 = 'freight-city-viva-v3';
  FCV.SAVE_KEY = 'freight-city-viva-v2';
  FCV.V1_KEY = 'freight-city-viva-v1';
  FCV.BACKUP_KEY = 'freight-city-viva-backup';
  FCV.defaultSettings = function () {
    return { textSpeed: 'normal', skipSeen: false, music: true, effects: true, volume: 0.8, previously: true, autoplay: true, timers: true,
      calmCity: false, voice: false, hardViva: false, reduceMotion: false, textSize: 'normal', ticker: false, babble: false, topDown: false,
      family: false, docket: 'family', seat: 'right', graphics: 'auto', musicVol: 0.55, effectsVol: 0.8, voiceVol: 1, ambienceVol: 0.45,
      narrator: true, examinerVoice: true, characterVoices: true, captions: true, captionSize: 'normal', autoContinue: true, highContrast: false,
      planner: '20 min', vivaDate: '', listenTestDone: false, recordSelf: false, radio: 'district', audio: FCV.audioDefaults(), at: 0 };
  };
  /* AUDR4-03: settings.at is when the person last changed a setting on this copy (0: never, a fresh device). Two copies
     merge to the settings changed last, not to the copy saved last (a device that has just opened saves first). */
  FCV.stampSettings = function (st) { if (st && st.settings) st.settings.at = Date.now(); return st; };
  /* Sound settings (settings.audio): every value checked at load, unknown values fall back, old booleans carried over.
     Sliders are 0..100 (80 = the build's level); gain = base x (v / 80)^2. Never throws. */
  var RATES = [0.75, 0.9, 1, 1.15, 1.3, 1.5];
  FCV.audioDefaults = function () {
    return { v: 1, muted: false, musicOff: false, master: 80, music: 80, voice: 80, sfx: 80, ambience: 80, subtitles: true, readAloud: true,
      deviceVoice: false, voiceRate: 1, characterVoices: true, voiceOff: {}, ducking: 'normal', station: 'fm', idents: true, mono: false, seenKeyNote: false };
  };
  FCV.normAudio = function (a, old) {
    var d = FCV.audioDefaults(), o = old && typeof old === 'object' ? old : {};
    var sl = function (v, dflt) { v = Number(v); return isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : dflt; };
    var fromGain = function (g, base) { g = Number(g); return isFinite(g) && g >= 0 ? sl(80 * Math.sqrt(g / base), 80) : 80; };
    if (!a || typeof a !== 'object' || Array.isArray(a)) {
      /* first load of v3 sound settings: carry the older switches and sliders over */
      a = {};
      if (o.music === false) a.musicOff = true;
      if (typeof o.musicVol === 'number') a.music = fromGain(o.musicVol, 0.55);
      if (o.effects === false) a.sfx = 0; else if (typeof o.effectsVol === 'number') a.sfx = fromGain(o.effectsVol, 0.8);
      if (typeof o.voiceVol === 'number') a.voice = fromGain(o.voiceVol, 1);
      if (typeof o.ambienceVol === 'number') a.ambience = fromGain(o.ambienceVol, 0.45);
      if (typeof o.volume === 'number') a.master = fromGain(o.volume, 0.8);
      if (o.characterVoices === false) a.characterVoices = false;
      if (o.narrator === false) a.voiceOff = { marigold: true };
      /* the older 'voice' switch meant browser speech, which the cast replaced: it is not carried over (device voice stays off) */
      if (o.captions === false) a.subtitles = false;
      if (o.radio === 'off') a.station = 'off'; else if (o.radio === 'night') a.station = 'night';
    }
    var out = {}, k;
    for (k in d) out[k] = d[k];
    ['muted', 'musicOff', 'subtitles', 'readAloud', 'deviceVoice', 'characterVoices', 'idents', 'mono', 'seenKeyNote'].forEach(function (b) { if (typeof a[b] === 'boolean') out[b] = a[b]; });
    ['master', 'music', 'voice', 'sfx', 'ambience'].forEach(function (s) { out[s] = sl(a[s], d[s]); });
    var r = Number(a.voiceRate); if (isFinite(r)) out.voiceRate = RATES.reduce(function (best, x) { return Math.abs(x - r) < Math.abs(best - r) ? x : best; }, 1);
    if (/^(off|gentle|normal|strong)$/.test(a.ducking)) out.ducking = a.ducking;
    if (/^(fm|night|off)$/.test(a.station)) out.station = a.station;
    out.voiceOff = {};
    if (a.voiceOff && typeof a.voiceOff === 'object' && !Array.isArray(a.voiceOff)) Object.keys(a.voiceOff).slice(0, 60).forEach(function (id) { if (a.voiceOff[id] === true && /^[a-z_]{1,32}$/.test(id)) out.voiceOff[id] = true; });
    return out;
  };
  /* The older switches, written from settings.audio for any code that still reads them. */
  FCV.syncOldAudio = function (s) {
    if (!s || !s.audio) return s;
    var a = s.audio;
    s.music = !a.musicOff && a.music > 0; s.effects = a.sfx > 0; s.voice = !!a.deviceVoice; s.characterVoices = a.characterVoices !== false;
    s.narrator = !a.voiceOff.marigold; s.captions = a.subtitles !== false; s.radio = a.station === 'fm' ? 'district' : a.station;
    return s;
  };
  FCV.newState = function () {
    return { v: 3, savedAt: 0, played: 0, device: '', days: [], intro: false, acts: {}, rooms: {}, mem: {}, met: {}, stars: 0,
      viva: { attempt: 0, seen: {}, best: null, results: [], paused: null, hallSeen: false, fails: 0 },
      parcels: { picked: {}, delivered: {}, bag: [] }, cuts: {}, lines: {}, struggled: [], own: {}, settings: FCV.defaultSettings(),
      lastTp: 0, pos: null, lastExport: 0, sessions: 0, lastDue: 0,
      /* v3 */
      stepStars: {}, achievements: {}, garage: { owned: {}, equipped: {}, packs: 0 }, copilot: FCV.newCopilot(), timings: {}, orphans: [],
      methods: { lessons: {}, missions: {} }, newV3: {}, xp: 0, resume: null, film: null, shiftLog: [], session: null, repairs: [], streak: { best: 0 },
      wr: { attempts: [], passes: 0 }, predictions: [], wear: {}, snapLabels: [] };
  };
  FCV.newCopilot = function () {
    return { seat: 'right', stickers: {}, finds: {}, animal: {}, races: {}, stunts: {}, tellAct: {}, honks: 0, paint: {}, kidPos: null, kidTimer: 0, docketSpots: {} };
  };
  FCV.actState = function (st, n) {
    if (!st.acts[n]) st.acts[n] = { done: [], mission: null, side: {}, corner: {}, stamp: null, sideStamp: null, mock: null };
    return st.acts[n];
  };
  FCV.roomState = function (st, id) { if (!st.rooms[id]) st.rooms[id] = { stage: 0, done: {}, badge: false, cornerDone: false, visited: false, corner: {} }; return st.rooms[id]; };
  FCV.isDone = function (st, n, sid) { var a = st.acts[n]; return !!(a && a.done.indexOf(sid) >= 0); };
  /* doneAt: when each step was earned, so a reset on another device can tell old progress from new (Save.merge). */
  FCV.markDone = function (st, n, sid) { var a = FCV.actState(st, n); if (a.done.indexOf(sid) < 0) { a.done.push(sid); a.doneAt = a.doneAt || {}; a.doneAt[sid] = Date.now(); } if (st.lineAt) delete st.lineAt['act' + n + ':' + String(sid).replace(/^scene:/, '')]; };
  /* A step added in v3 to an act already cleared in v2 is optional ("new in v3"): it never re-locks the act. */
  FCV.isNewV3 = function (st, n, sid) { var l = st.newV3 && st.newV3[n]; return !!(l && l.indexOf(sid) >= 0); };
  FCV.actDone = function (st, n) { var steps = FCV.actSteps(n); for (var i = 0; i < steps.length; i++) if (!FCV.isDone(st, n, steps[i].id) && !FCV.isNewV3(st, n, steps[i].id)) return false; return true; };
  FCV.actOpen = function (st, n) { return n === 1 || FCV.actDone(st, n - 1); };
  /* The next steps available: the first not done; in a free-order act, every undone scene once scenes begin. */
  FCV.nextSteps = function (st, n) {
    var steps = FCV.actSteps(n), a = FCV.data.script.acts[n - 1];
    for (var i = 0; i < steps.length; i++) {
      if (FCV.isDone(st, n, steps[i].id) || FCV.isNewV3(st, n, steps[i].id)) continue;
      var fo = a.free_order, inFree = function (s) { return fo && (Array.isArray(fo.steps) ? fo.steps.indexOf(s.id) >= 0 : s.kind === 'scene'); };
      if (fo && inFree(steps[i])) return steps.filter(function (s) { return inFree(s) && !FCV.isDone(st, n, s.id); });
      return [steps[i]];
    }
    return [];
  };
  FCV.badges = function (st) {
    var b = 0, n;
    for (n = 1; n <= 7; n++) if (FCV.actDone(st, n)) b++;
    FCV.data.script.evidence_locker.rooms.forEach(function (r) { if (st.rooms[r.id] && st.rooms[r.id].badge) b++; });
    return b;
  };
  FCV.BADGES_FOR_VIVA = 10;
  FCV.vivaOpen = function (st) { return FCV.actDone(st, 7) && FCV.badges(st) >= FCV.BADGES_FOR_VIVA; };
  FCV.objective = function (st) {
    for (var n = 1; n <= 7; n++) {
      if (!FCV.actDone(st, n)) {
        var ns = FCV.nextSteps(st, n)[0];
        return { kind: 'act', act: n, step: ns, label: 'Act ' + n + ': ' + (ns ? ns.title : '') };
      }
    }
    if (!FCV.vivaOpen(st)) {
      var rooms = FCV.data.script.evidence_locker.rooms;
      for (var i = 0; i < rooms.length; i++) if (!(st.rooms[rooms[i].id] && st.rooms[rooms[i].id].badge)) return { kind: 'room', room: rooms[i].id, label: 'Evidence Locker: ' + rooms[i].name };
    }
    return { kind: 'viva', label: 'The Viva Hall' };
  };
  /* Chain pips and objective ticks, derived from progress. */
  FCV.chainState = function (st) {
    var lit = {};
    var a4 = FCV.data.script.acts[3];
    a4.scenes.forEach(function (sc) { if (sc.on_end && sc.on_end.light_link && FCV.isDone(st, 4, 'scene:' + sc.id)) lit[sc.on_end.light_link] = 'lit'; });
    if (FCV.isDone(st, 6, 'tp')) lit['link-5'] = 'proposed';
    var ticks = {};
    if (FCV.isDone(st, 4, 'closer')) ['obj-1', 'obj-2', 'obj-3', 'obj-4'].forEach(function (o) { ticks[o] = 1; });
    if (FCV.isDone(st, 5, 'closer')) ['obj-5A', 'obj-5B'].forEach(function (o) { ticks[o] = 1; });
    if (FCV.isDone(st, 6, 'closer')) ['obj-5C', 'obj-5'].forEach(function (o) { ticks[o] = 1; });
    return { lit: lit, ticks: ticks };
  };

  /* ---------------- spaced memory (boxes 1 to 5, counted in days played) ---------------- */
  var GAP = [1, 2, 4, 8, 16];
  FCV.today = function (d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  FCV.dayIndex = function (st) { return st.days.length; };
  FCV.touchDay = function (st) { var t = FCV.today(); if (st.days[st.days.length - 1] !== t && st.days.indexOf(t) < 0) st.days.push(t); };
  FCV.memRecord = function (st, id, outcome, sure) {
    if (outcome === 'skip') return { rec: st.mem[id] || { box: 0, seen: 0 }, first: false, skipped: true };
    var r = st.mem[id] || (st.mem[id] = { box: 1, last: 0, seen: 0, right: 0, wrong: 0, sureWrong: 0, stamp: FCV.stamp(id) });
    var first = r.seen === 0;
    r.seen++; r.last = FCV.dayIndex(st); r.at = Date.now();
    if (outcome === 'right') { r.right++; r.box = first ? 2 : Math.min(5, r.box + 1); }
    else if (outcome === 'partly') { r.wrong++; r.box = 2; }
    /* v3 stage rule: a wrong answer drops an item to Retrieved at most; sure-and-wrong drops it to box 1. */
    else { r.wrong++; r.box = sure ? 1 : Math.max(1, Math.min(r.box, first ? 1 : 3)); if (sure) r.sureWrong++; }
    r.firstRight = r.firstRight === undefined ? outcome === 'right' : r.firstRight;
    r.lastOutcome = outcome; r.lastSure = !!sure;
    return { rec: r, first: first };
  };
  FCV.overdue = function (st, id) {
    var r = st.mem[id]; if (!r) return -Infinity;
    return (FCV.dayIndex(st) - r.last) - GAP[Math.max(0, Math.min(4, r.box - 1))];
  };
  FCV.dueList = function (st) {
    return Object.keys(st.mem).filter(function (id) { return FCV.overdue(st, id) >= 0 && FCV.resolve(id) && FCV.askable(id); })
      .sort(function (a, b) {
        var ra = st.mem[a], rb = st.mem[b];
        var sa = ra.lastSure && ra.lastOutcome === 'wrong' ? 1 : 0, sb = rb.lastSure && rb.lastOutcome === 'wrong' ? 1 : 0;
        return (sb - sa) || (FCV.overdue(st, b) - FCV.overdue(st, a)) || (ra.box - rb.box);
      });
  };
  FCV.askable = function (id) { if (FCV.TRACE_NOT_ASKED[id]) return false; var r = FCV.resolve(id); return !!r && ['quiz', 'eq', 'gap', 'trace', 'bank', 'say'].indexOf(r.type) >= 0; };
  FCV.mostOverdue = function (st) {
    var d = FCV.dueList(st); if (d.length) return d[0];
    var any = Object.keys(st.mem).filter(FCV.askable).sort(function (a, b) { return st.mem[a].box - st.mem[b].box || st.mem[a].last - st.mem[b].last; });
    return any[0] || null;
  };
  FCV.weakest = function (st, n) {
    return Object.keys(st.mem).filter(FCV.askable).sort(function (a, b) {
      var ra = st.mem[a], rb = st.mem[b];
      return (ra.box - rb.box) || (rb.sureWrong - ra.sureWrong) || (rb.wrong - ra.wrong);
    }).slice(0, n || 10);
  };
  FCV.sureWrongCount = function (st) { return Object.keys(st.mem).filter(function (id) { return st.mem[id].sureWrong > 0 && st.mem[id].box === 1; }).length; };
  /* Every askable item an act teaches, for its readiness band. */
  FCV.actItems = function (n) {
    var a = FCV.data.script.acts[n - 1], out = [];
    a.scenes.forEach(function (s) { if (s.in_scene) out.push(s.in_scene.quiz); });
    (a.mission.items || []).forEach(function (i) { out.push(i.quiz); });
    ['examiner_rehearsal', 'examiner_rehearsal_2'].forEach(function (k) { if (a[k]) out.push(a[k].question); });
    (a.side_mission.items || []).forEach(function (i) { out.push(i.quiz); });
    (a.examiner_corner.items || []).forEach(function (i) { out.push(i.question); });
    return out.filter(function (x, i, arr) { return x && arr.indexOf(x) === i; });
  };
  FCV.readiness = function (st, ids) {
    if (!ids.length) return 0;
    return ids.filter(function (id) { return st.mem[id] && st.mem[id].box >= 3; }).length / ids.length;
  };

  /* ---------------- parcels ---------------- */
  FCV.parcelIds = function (st) {
    var out = [], sc = FCV.data.script, allOpen = FCV.actDone(st, 7);
    sc.acts.forEach(function (a, i) { if (allOpen || FCV.actOpen(st, i + 1)) (a.parcels.ids || []).forEach(function (id) { out.push(id); }); });
    if (allOpen || (st.cuts && st.cuts.locker_entry) || FCV.actOpen(st, 2)) (sc.evidence_locker.parcels.ids || []).forEach(function (id) { out.push(id); });
    return out;
  };
  FCV.parcelHome = function (id) {
    var m = /^ch(\d)-/.exec(id); if (m) return { kind: 'act', act: +m[1], label: 'Act ' + m[1] + ': ' + FCV.data.script.acts[+m[1] - 1].district.name };
    var a = /^app-([A-O])-/.exec(id); if (a) { var r = FCV.roomOfLetter(a[1]); return { kind: 'room', room: r.id, label: r.name }; }
    return null;
  };

  /* ---------------- the city ---------------- */
  FCV.buildCity = function () {
    var CW = 920, CH = 780, R = 150;
    var W = 4 * CW + 5 * R, H = 3 * CH + 4 * R;
    var cells = [], buildings = [], markers = [], water = [], decor = [];
    var ox = function (c) { return R + c * (CW + R); }, oy = function (r) { return R + r * (CH + R); };
    var palette = { 1: ['#ff8a3d', '#f6c453'], 2: ['#2bb3a6', '#8fd3c8'], 3: ['#7a5cff', '#b9a8ff'], 4: ['#e2456f', '#f59bb4'], 5: ['#ffb000', '#ffd98a'], 6: ['#e6332a', '#ff9a8f'], 7: ['#16a0d8', '#8ad6f3'] };
    var labels = {
      1: ['Freight FM', 'Traffic Desk', 'Studio B', 'Phone-in Line'], 2: ['Reading Room', 'Lost Property', 'Chalk Stacks', 'Returns Desk'],
      3: ['Drawing Office', 'Town Hall Counter', 'Coding Floor', "Referees' Room"], 4: ['Courtroom', 'Witness Box', 'Evidence Table', 'Cross-Exam Hall'],
      5: ["Tilly's Shop", 'Camera Cut', 'Locker Market', 'Gate House'], 6: ['Red Kiosk', "Penny's Slate", "Notary's Desk", 'Key Cutter'],
      7: ['Aerial Mast', 'Fire Escape', 'Rooftop Grill', 'Last Run Depot']
    };
    var actCells = { 1: [0, 0], 2: [1, 0], 3: [2, 0], 4: [3, 0], 5: [3, 1], 6: [3, 2], 7: [2, 2] };
    Object.keys(actCells).forEach(function (k) {
      var n = +k, c = actCells[k][0], r = actCells[k][1], x0 = ox(c), y0 = oy(r);
      var m = 50, bw = Math.round(CW * 0.34), bh = Math.round(CH * 0.30);
      cells.push({ kind: 'act', act: n, x: x0, y: y0, w: CW, h: CH, colour: palette[n][0], tint: palette[n][1] });
      [[x0 + m, y0 + m], [x0 + CW - m - bw, y0 + m], [x0 + CW - m - bw, y0 + CH - m - bh], [x0 + m, y0 + CH - m - bh]].forEach(function (p, i) {
        buildings.push({ x: p[0], y: p[1], w: bw, h: bh, label: labels[n][i], colour: palette[n][i % 2], act: n, door: i < 2 ? 'bottom' : 'top' });
      });
      var doorX = [x0 + m + bw * 0.7, x0 + CW - m - bw * 0.7, x0 + CW - m - bw * 0.7, x0 + m + bw * 0.7];
      var doorY = [y0 + m + bh + 44, y0 + m + bh + 44, y0 + CH - m - bh - 44, y0 + CH - m - bh - 44];
      var spots = { scene0: [doorX[0], doorY[0]], scene1: [doorX[1], doorY[1]], scene2: [doorX[2], doorY[2]], scene3: [x0 + CW / 2, y0 + 96],
        tp: [x0 + CW / 2, y0 + CH / 2], mission: [doorX[3], doorY[3]], rehearsal: [x0 + CW / 2, y0 + CH - 92],
        side: [x0 + 92, y0 + CH / 2], corner: [x0 + CW - 92, y0 + CH / 2], drop: [x0 + CW / 2 - 150, y0 + CH / 2] };
      Object.keys(spots).forEach(function (s) { markers.push({ id: 'act' + n + '-' + s, kind: 'act', act: n, slot: s, x: spots[s][0], y: spots[s][1] }); });
      decor.push({ kind: 'sign', x: x0 + CW / 2, y: y0 + 26, act: n });
    });
    var rooms = (FCV.data && FCV.data.script.evidence_locker.rooms) || [];
    var ri = 0;
    [[1, 1], [2, 1]].forEach(function (lc, ci) {
      var x0 = ox(lc[0]), y0 = oy(lc[1]);
      cells.push({ kind: 'locker', x: x0, y: y0, w: CW, h: CH, colour: '#3b2a4f', tint: '#5a4775' });
      var rw = 230, rh = 200;
      [[x0 + 45, y0 + 50, 'bottom'], [x0 + 345, y0 + 50, 'bottom'], [x0 + 645, y0 + 50, 'bottom'], [x0 + 150, y0 + CH - 50 - rh, 'top'], [x0 + 540, y0 + CH - 50 - rh, 'top']].forEach(function (sl) {
        var room = rooms[ri++]; if (!room) return;
        buildings.push({ x: sl[0], y: sl[1], w: rw, h: rh, label: room.name, colour: ['#ff5fa2', '#25c2b0', '#ffb000', '#7a5cff', '#ff7a3d'][ri % 5], room: room.id, door: sl[2] });
        markers.push({ id: 'room-' + room.id, kind: 'room', room: room.id, x: sl[0] + rw / 2, y: sl[2] === 'bottom' ? sl[1] + rh + 44 : sl[1] - 44 });
      });
      if (ci === 0) markers.push({ id: 'locker-gate', kind: 'lockergate', x: x0 + CW / 2, y: y0 + CH / 2, r: 130 });
    });
    var vx = ox(0), vy = oy(1);
    cells.push({ kind: 'viva', x: vx, y: vy, w: CW, h: CH, colour: '#2a1d3a', tint: '#4a3366' });
    buildings.push({ x: vx + 180, y: vy + 110, w: 560, h: 420, label: 'The Viva Hall', colour: '#8f6bd8', viva: true, door: 'bottom' });
    markers.push({ id: 'viva', kind: 'viva', x: vx + CW / 2, y: vy + 110 + 420 + 50 });
    var px = ox(0), py = oy(2);
    cells.push({ kind: 'park', x: px, y: py, w: CW, h: CH, colour: '#2f8f4e', tint: '#4fb46c' });
    water.push({ x: px + 300, y: py + 260, w: 320, h: 240, pond: true });
    var hx = ox(1), hy = oy(2);
    cells.push({ kind: 'harbour', x: hx, y: hy, w: CW, h: CH, colour: '#56606e', tint: '#7d8794' });
    water.push({ x: hx, y: hy + 440, w: CW, h: CH - 440 });
    buildings.push({ x: hx + 80, y: hy + 80, w: 300, h: 200, label: 'Bonded Store', colour: '#ff8a3d' });
    buildings.push({ x: hx + 540, y: hy + 80, w: 300, h: 200, label: "Digits' Kiosk", colour: '#25c2b0', door: 'bottom' });
    markers.push({ id: 'kiosk', kind: 'kiosk', x: hx + 690, y: hy + 80 + 200 + 46 });
    var solid = buildings.concat(water);
    var clear = function (x, y, pad, far) {
      for (var i = 0; i < solid.length; i++) { var b = solid[i]; if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return false; }
      for (var j = 0; j < markers.length; j++) { var mk = markers[j]; if (Math.abs(mk.x - x) < (far || 70) && Math.abs(mk.y - y) < (far || 70)) return false; }
      return true;
    };
    var rng = FCV.rng(7);
    cells.forEach(function (c) {
      var count = c.kind === 'park' ? 26 : 7;
      for (var t = 0, tries = 0; t < count && tries < 300; tries++) {
        var x = c.x + 20 + rng() * (c.w - 40), y = c.y + 20 + rng() * (c.h - 40);
        if (clear(x, y, 28)) { decor.push({ kind: 'tree', x: x, y: y, s: 16 + rng() * 10 }); t++; }
      }
    });
    /* Parcel spots: on pavements and roads, away from solids and markers; one per parcel id. */
    var spots = [], prng = FCV.rng(99), guard = 0;
    while (spots.length < 180 && guard++ < 20000) {
      var x = 30 + prng() * (W - 60), y = 30 + prng() * (H - 60);
      if (!clear(x, y, 36, 90)) continue;
      var ok = true; for (var s = 0; s < spots.length; s++) if (Math.abs(spots[s].x - x) < 110 && Math.abs(spots[s].y - y) < 110) { ok = false; break; }
      if (ok) spots.push({ x: x, y: y });
    }
    return { W: W, H: H, CW: CW, CH: CH, R: R, cells: cells, buildings: buildings, markers: markers, water: water, decor: decor, parcelSpots: spots,
      spawn: { x: ox(0) - R / 2, y: oy(0) + CH / 2 }, actCells: actCells, ox: ox, oy: oy };
  };
  FCV.parcelSpot = function (city, id) {
    var all = []; FCV.data.script.acts.forEach(function (a) { all = all.concat(a.parcels.ids || []); });
    all = all.concat(FCV.data.script.evidence_locker.parcels.ids || []);
    if (id === 'ch1-13') { return { x: city.ox(0) + 92, y: city.oy(0) + city.CH - 40 }; }
    var i = all.indexOf(id); if (i < 0) return null;
    return city.parcelSpots[(i * 7) % city.parcelSpots.length];
  };
  FCV.solids = function (city) { return city.buildings.concat(city.water); };
  FCV.cellAt = function (city, x, y) {
    for (var i = 0; i < city.cells.length; i++) { var c = city.cells[i]; if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return c; }
    return null;
  };
  FCV.collide = function (solids, x, y, r) {
    for (var i = 0; i < solids.length; i++) {
      var b = solids[i], cx = Math.max(b.x, Math.min(x, b.x + b.w)), cy = Math.max(b.y, Math.min(y, b.y + b.h)), dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  };
  FCV.move = function (city, solids, x, y, dx, dy, r) {
    var nx = Math.max(r, Math.min(city.W - r, x + dx)), ny = y;
    if (FCV.collide(solids, nx, ny, r)) nx = x;
    ny = Math.max(r, Math.min(city.H - r, y + dy));
    if (FCV.collide(solids, nx, ny, r)) ny = y;
    return [nx, ny];
  };

  /* ---------------- the viva ---------------- */
  FCV.normaliseBank = function (raw) {
    var items = Array.isArray(raw) ? raw : (raw && (raw.questions || raw.items)) || [];
    var meta = (raw && !Array.isArray(raw) && raw.meta) || {};
    var ok = items.filter(function (q) { return q && q.id && q.question && Array.isArray(q.options) && q.options.length > 1 && typeof q.answer_index === 'number'; });
    ok.forEach(function (q) { var d = +q.difficulty; q._d = isNaN(d) ? 2 : d; q._k = q.killer === true; q._t = q.topic || 'general'; });
    return { items: ok, sample: !!meta.sample, meta: meta };
  };
  /* Draw 18 to 20: proportional by topic (at least one each), exactly 4 killers (none before question 6, the last always one),
     three rounds easy to hard, never-seen first inside each topic; misses wait while unseen remain. */
  FCV.drawViva = function (bank, viva, rng, exclude) {
    rng = rng || Math.random; exclude = exclude || {};
    var items = bank.items.filter(function (q) { return !exclude[q.id]; }); if (!items.length) return [];
    var seen = viva.seen || {};
    var fresh = function (q) { var s = seen[q.id]; return s ? [1, s.result === 'wrong' ? 0 : 1, s.last || 0, rng()] : [0, 0, 0, rng()]; };
    var cmp = function (a, b) { for (var i = 0; i < 4; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i]; return 0; };
    var sortFresh = function (arr) { return arr.map(function (q) { return { q: q, k: fresh(q) }; }).sort(cmp).map(function (x) { return x.q; }); };
    var n = Math.min(items.length, 18 + Math.floor(rng() * 3));
    var unseenNK = items.filter(function (q) { return !q._k && !seen[q.id]; }).length;
    if (unseenNK < n - 4) n = Math.max(18, unseenNK + 4);
    var topics = {}; items.forEach(function (q) { (topics[q._t] = topics[q._t] || []).push(q); });
    var tnames = Object.keys(topics);
    var quota = {}, sum = 0;
    tnames.forEach(function (t) { quota[t] = Math.max(1, Math.round(n * topics[t].length / items.length)); sum += quota[t]; });
    /* Pace each topic so its unseen questions last at least 11 attempts: no topic takes more than its unseen share per attempt left. */
    var left = Math.max(1, 11 - (viva.attempt || 0));
    tnames.forEach(function (t) { var un = topics[t].filter(function (q) { return !seen[q.id]; }).length; var cap = Math.max(1, Math.floor(un / left)); if (quota[t] > cap) { sum -= quota[t] - cap; quota[t] = cap; } });
    var byShare = tnames.slice().sort(function (a, b) { return topics[b].length - topics[a].length; });
    for (var g = 0; sum > n && g < 100; g++) { var t1 = byShare[g % byShare.length]; if (quota[t1] > 1) { quota[t1]--; sum--; } }
    for (var h = 0; sum < n && h < 100; h++) { var t2 = byShare[h % byShare.length]; if (quota[t2] < topics[t2].length) { quota[t2]++; sum++; } }
    var killersAll = sortFresh(items.filter(function (q) { return q._k; }));
    /* A topic whose unseen ordinary questions have run out is kept present by one of its unseen killers (every topic, no repeat). */
    var dry = {}; tnames.forEach(function (t) { dry[t] = !topics[t].some(function (q) { return !q._k && !seen[q.id]; }); });
    killersAll = killersAll.filter(function (q) { return dry[q._t] && !seen[q.id]; }).concat(killersAll.filter(function (q) { return !(dry[q._t] && !seen[q.id]); }));
    var chosen = [], taken = {};
    /* exactly four killers, freshest first, spread over topics where possible */
    var kUsedTopic = {};
    for (var pass = 0; pass < 2 && chosen.length < 4; pass++) {
      for (var i = 0; i < killersAll.length && chosen.length < 4; i++) {
        var kq = killersAll[i]; if (taken[kq.id]) continue;
        /* D-06: freshness wins over topic spread: a seen killer is passed over while enough unseen ones are left anywhere */
        if (pass === 0 && (kUsedTopic[kq._t] || seen[kq.id] && killersAll.filter(function (x) { return !seen[x.id] && !taken[x.id]; }).length >= 4 - chosen.length)) continue;
        chosen.push(kq); taken[kq.id] = 1; kUsedTopic[kq._t] = (kUsedTopic[kq._t] || 0) + 1;
      }
    }
    /* Each topic takes its share from its own unseen questions; a shortfall is filled from unseen questions elsewhere,
       and seen ones come back only when nothing unseen is left anywhere (or a topic would otherwise go missing). */
    tnames.forEach(function (t) {
      var have = kUsedTopic[t] || 0, need = quota[t] - have;
      var pool = sortFresh(topics[t].filter(function (q) { return !q._k && !taken[q.id]; }));
      var unseen = pool.filter(function (q) { return !seen[q.id]; });
      for (var j = 0; j < unseen.length && need > 0; j++) { chosen.push(unseen[j]); taken[unseen[j].id] = 1; need--; have++; }
      if (have === 0 && pool.length && !items.some(function (q) { return !q._k && !taken[q.id] && !seen[q.id]; })) { chosen.push(pool[0]); taken[pool[0].id] = 1; }
    });
    if (chosen.length < n) {
      var rest = sortFresh(items.filter(function (q) { return !q._k && !taken[q.id]; }));
      for (var r2 = 0; r2 < rest.length && chosen.length < n; r2++) { chosen.push(rest[r2]); taken[rest[r2].id] = 1; }
    }
    n = chosen.length;
    var sorted = chosen.map(function (q) { return { q: q, r: rng() }; }).sort(function (a, b) { return (a.q._d - b.q._d) || (a.r - b.r); }).map(function (x) { return x.q; });
    var third = Math.ceil(n / 3), order = [];
    for (var k = 0; k < 3; k++) order = order.concat(shuffle(sorted.slice(k * third, (k + 1) * third), rng));
    if (order.length && !order[order.length - 1]._k) {
      for (var z = order.length - 2; z >= 0; z--) if (order[z]._k) { order.push(order.splice(z, 1)[0]); break; }
    }
    for (var a = 0; a < Math.min(5, order.length); a++) {
      if (order[a]._k) for (var b = 5; b < order.length - 1; b++) if (!order[b]._k) { var tmp = order[a]; order[a] = order[b]; order[b] = tmp; break; }
    }
    return order;
  };
  FCV.markSeen = function (viva, q, right, attempt) {
    var s = viva.seen[q.id] || (viva.seen[q.id] = { first: attempt, last: 0, result: null });
    s.last = attempt; s.result = right ? 'right' : 'wrong';
    return s;
  };
  FCV.vivaEnding = function (hearts) { if (hearts <= 0) return 'fail'; if (hearts <= 2) return 'major'; if (hearts <= 4) return 'minor'; return 'none'; };
  /* Where to revise: a district (act) or an Evidence Locker room. */
  FCV.teachPlace = function (src) {
    var s = String(src || '');
    var m = /Appendix ([A-O])\b|app-([A-O])\b|\b([A-O])\.\d/.exec(s);
    if (m) { var r = FCV.roomOfLetter(m[1] || m[2] || m[3]); if (r) return { kind: 'room', room: r.id, label: r.name }; }
    var c = /(?:Chapter|ch)\s*-?([1-7])\b|\b([1-7])\.\d/.exec(s);
    if (c) { var n = +(c[1] || c[2]); return { kind: 'act', act: n, label: 'Act ' + n + ': ' + FCV.data.script.acts[n - 1].district.name }; }
    return null;
  };
  /* Chapter and appendix items whose sections match a bank source, for "Drill these now". */
  FCV.drillFor = function (src, n) {
    var secs = String(src || '').match(/\b\d\.\d\b|\b[A-O]\.\d(?:\.\d+)?\b/g) || [];
    var out = [];
    var add = function (id, loc) { if (out.indexOf(id) < 0 && secs.some(function (s) { return String(loc || '').indexOf(s) >= 0; })) out.push(id); };
    FCV.data.story.acts.forEach(function (a) { a.quiz.forEach(function (q) { add(q.id, q.section); }); });
    FCV.data.facts.appendices.forEach(function (ap) { ap.quiz.forEach(function (q, i) { add('app-' + ap.letter + '-q' + (i + 1), q.location); }); });
    return out.slice(0, n || 10);
  };

  /* ---------------- Methods & Terms (data arrives later) ---------------- */
  FCV.normaliseMethods = function (raw) {
    var list = Array.isArray(raw) ? raw : (raw && (raw.methods || raw.items || raw.terms || raw.entries)) || [];
    return list.filter(function (m) { return m && (m.id || m.term || m.name); }).map(function (m, i) {
      return { id: String(m.id || ('m' + (i + 1))), term: m.term || m.name || m.title, plain: m.plain_meaning || m.plain || m.meaning || '',
        how: m.how_the_thesis_did_it || m.how || (Array.isArray(m.in_this_thesis) ? m.in_this_thesis.join(' ') : m.in_this_thesis) || '', why: m.why || '', alternatives: m.alternatives || [], analogy: m.analogy || '',
        viva: m.viva_questions || m.examiner_questions || [], quiz: m.quiz || [], video: m.video || m.video_brief || null, act: m.act || 3, raw: m,
        steps: Array.isArray(m.in_this_thesis) ? m.in_this_thesis : (m.in_this_thesis ? [m.in_this_thesis] : []), notThis: m.not_this || '', videoWorthy: !!m.video_worthy };
    });
  };
  var MBY = null;
  FCV.methodById = function (mid) {
    if (!MBY) { MBY = {}; (FCV.methods || []).forEach(function (x) { MBY[x.id] = x; }); }
    return MBY[String(mid).replace(/^method:/, '')] || null;
  };
  FCV.methodGap = function (mid) {
    var m = FCV.methodById(mid); if (!m) return null;
    if (m.raw.gap) return typeof m.raw.gap === 'string' ? m.raw.gap : (m.raw.gap.text || m.raw.gap.gap || null);
    var gl = (FCV.data.methods && FCV.data.methods.gaps) || [];
    for (var i = 0; i < gl.length; i++) if (gl[i].id === m.id) return gl[i].gap || null;
    return null;
  };
  /* An option set fails the length gate when its longest option is more than 1.6 times its shortest and 25 characters longer: asked as recall instead. */
  /* The length gate: an item whose options give the answer away by their shape is asked as Say it (recall), never as a pick.
     QAD-M6: also when the right answer is the one longest option and more than 1.25 times the mean of the others (the
     bank's own rule), or when only the right answer has the "X, not Y" form. */
  FCV.notForm = function (s) { return /,\s*not\b|\bnot\b[^.]*,\s*but\b/i.test(String(s)); };
  FCV.failsLengthGate = function (q) {
    var opts = q.options || [], L = opts.map(function (o) { return String(o).length; }); if (!L.length) return false;
    var mx = Math.max.apply(null, L), mn = Math.min.apply(null, L);
    if (mx > mn * 1.6 && mx - mn > 25) return true;
    var ai = typeof q.answer === 'number' ? q.answer : typeof q.answer_index === 'number' ? q.answer_index : -1;
    if (ai < 0 || ai >= L.length || L.length < 3) return false;
    var c = L[ai], others = L.filter(function (l, i) { return i !== ai; }), mean = others.reduce(function (a, b) { return a + b; }, 0) / others.length;
    if (c === mx && L.filter(function (l) { return l === c; }).length === 1 && c > mean * 1.25) return true;
    if (FCV.notForm(opts[ai]) && !opts.some(function (o, i) { return i !== ai && FCV.notForm(o); })) return true;
    return false;
  };
  /* QA round 3: two Interview Line explanations explain the wrong options only (methods_facts entry 31, quiz 1 and 2). Until
     the facts lens has checked them, the entry's own in_this_thesis line that names the right answer is shown first. */
  var SUPPORT = { purposive_sampling: [0, 1] };
  FCV.supportingWhy = function (m, q) {
    var ex = String(q.explanation || ''), k = (m.quiz || []).indexOf(q);
    if (!SUPPORT[m.id] || SUPPORT[m.id].indexOf(k) < 0) return ex;
    var right = String((q.options || [])[q.answer_index] || ''), tok = (/[A-Za-z][A-Za-z'-]{2,}/.exec(right) || [])[0]; if (!tok) return ex;
    var re = new RegExp('\\b' + tok + '\\b', 'i'), hit = [].concat((m.raw && m.raw.in_this_thesis) || []).map(String).filter(function (l) { return re.test(l); })[0];
    return hit ? hit + ' ' + ex : ex;
  };
  /* A pick whose right answer stands out by length (or a methods item marked recall-only) is asked as Say it instead. */
  FCV.gated = function (r) { return !!r && (r.type === 'quiz' || r.type === 'bank') && Array.isArray(r.options) && (!!r.recallOnly || FCV.failsLengthGate(r)); };
  FCV.methodCard = function (mid) {
    var m = FCV.methodById(mid); if (!m) return null;
    return { id: 'method:' + mid, type: 'card', label: 'Methods and terms', figure: m.term, text: m.plain, list: [m.how && 'How the thesis did it: ' + m.how, m.why && 'Why: ' + m.why, m.analogy && 'Like: ' + m.analogy].filter(Boolean), loc: (m.raw && ((m.raw.sections || []).join('; ') || m.raw.section || m.raw.where)) || '' };
  };

  root.FCV = FCV;
  if (typeof module !== 'undefined' && module.exports) module.exports = FCV;
})(typeof window !== 'undefined' ? window : globalThis);
