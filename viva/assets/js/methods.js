/* Freight City Viva v2: the Methods & Terms layer. It lights up when assets/data/methods_facts.json arrives:
   a Methods bench in Method Works (Act 3), a Notebook section, and an explainer-video player. */
(function () {
  'use strict';
  var M = {};
  var esc = function (s) { return UI.esc(s); };
  var isLeave = function (e) { return e && e.leave; };
  function list(v) { return Array.isArray(v) ? v : v ? [v] : []; }
  function qItem(m, q, i) {
    return { id: 'method:' + m.id + ':q' + (i + 1), q: q.q || q.question, options: q.options, answer: q.answer_index, explanation: q.explanation || q.why || m.plain, loc: (m.raw && ((m.raw.sections || []).join('; ') || m.raw.section)) || '', label: m.term };
  }
  /* One method: the plain meaning, how and why, the alternatives, an analogy; then its quiz and viva questions. */
  M.lesson = async function (m) {
    await UI.say('sam', 'Method: ' + m.term + '.', { fact: 'method:' + m.id });
    if (list(m.alternatives).length) await UI.say('sal', 'And what else could have been done?', { extra: '<div class="answer"><b class="aTitle">The alternatives</b><ul>' + list(m.alternatives).map(function (a) { return '<li>' + esc(typeof a === 'string' ? a : (a.name || '') + (a.why_not ? ': ' + a.why_not : '')) + '</li>'; }).join('') + '</ul></div>' });
    if (m.video) await M.explainer(m.id);
    var qs = list(m.quiz).filter(function (q) { return q && Array.isArray(q.options) && typeof q.answer_index === 'number'; });
    for (var i = 0; i < qs.length; i++) { var ok = await UI.quiz(qItem(m, qs[i], i), { who: i % 2 ? 'sam' : 'sal', gate: true }); Flows.record('method:' + m.id + ':q' + (i + 1), ok ? 'right' : 'wrong'); }
    var vq = list(m.viva).filter(function (v) { return v && (v.question || v.q); });
    for (var j = 0; j < vq.length; j++) {
      var r = await UI.sayAloud(j % 2 ? 'prof_kerbstone' : 'dr_tally', vq[j].question || vq[j].q, [{ title: 'Model answer', text: vq[j].model_answer || vq[j].answer || '', loc: (m.raw && ((m.raw.sections || []).join('; ') || m.raw.section)) || '' }], { wake: 3 });
      Flows.record('method:' + m.id + ':v' + (j + 1), r === 'nailed' ? 'right' : r);
    }
    Game.state.met['method:' + m.id] = 1; Game.save();
  };
  M.bench = async function () {
    var ms = FCV.methods || []; if (!ms.length) { UI.toast('The methods bench opens when the methods file arrives.', 2600); return; }
    UI.open('Methods bench', 'Every method, design choice, statistic and term, one at a time', 'S11');
    try {
      for (;;) {
        var items = ms.map(function (m) { return { label: m.term, sub: FCV.firstSentence(m.plain), done: !!Game.state.met['method:' + m.id], value: m.id, tag: Game.state.met['method:' + m.id] ? 'AGAIN' : 'GO' }; });
        items.push({ label: 'Back to the city', value: 'leave', tag: 'EXIT' });
        var v = await UI.menu('sam', 'Pick a method. The twins will take it apart.', items);
        if (v === 'leave') break;
        await M.lesson(ms.filter(function (m) { return m.id === v; })[0]);
      }
    } catch (e) { if (!isLeave(e)) throw e; }
    UI.close();
  };
  /* The explainer player: a video when the asset exists, otherwise the brief over a still, with captions. */
  M.explainer = async function (id) {
    var m = (FCV.methods || []).filter(function (x) { return x.id === id; })[0]; if (!m || !m.video) return;
    var v = m.video, key = typeof v === 'string' ? v : v.asset || v.id;
    var brief = typeof v === 'object' ? list(v.beats || v.shots || v.script || v.brief) : [];
    var shots = [];
    if (key && (FCV.assets[key] || FCV.assetUrl(key))) shots.push({ visual: { asset: key }, subtitle: m.term + ': ' + FCV.firstSentence(m.plain) });
    brief.forEach(function (b) { shots.push({ visual: { asset: (b && b.asset) || 'S11', move: 'slow push-in' }, subtitle: typeof b === 'string' ? b : b.subtitle || b.text || '' }); });
    if (!shots.length) shots.push({ visual: { asset: 'S11', move: 'slow push-in' }, subtitle: m.term + ': ' + m.plain });
    await UI.cutscene(shots);
  };
  window.Methods = M;
})();
