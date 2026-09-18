// Homepage search: filters the project cards and finds words inside the projects.
(function(){
  var input = document.getElementById('q');
  var results = document.getElementById('results');
  var head = document.getElementById('results-head');
  var hits = document.getElementById('hits');
  var more = document.getElementById('more');
  var nothing = document.getElementById('nothing');
  var cards = [].slice.call(document.querySelectorAll('.card[data-project]'));
  var SHOW = 12;
  var index = null, loading = null, timer = 0, expanded = false;
  document.getElementById('yr').textContent = new Date().getFullYear();
  // The full placeholder is cut off on a phone, so small screens get the short one.
  var longHint = input.placeholder;
  function fitHint(){ input.placeholder = window.innerWidth < 560 ? 'Search, in English or العربية' : longHint; }
  fitHint(); window.addEventListener('resize', fitHint);

  // One character in, zero or more out: vowel marks and tatweel vanish, letter variants fold together,
  // Latin accents and transliteration marks drop, so "busiri" finds "Būṣīrī" and "القمر" finds "بِالْقَمَرِ".
  function foldChar(c){
    var d = c.normalize('NFD').replace(/[\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, '');
    return d.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
            .replace(/[‘’'ʿʾ`]/g, '').toLowerCase();
  }
  function fold(s){ var out = ''; for (var ch of s) out += foldChar(ch); return out; }
  // Folded text plus, for each folded character, where it came from in the original.
  function mapFold(s){
    var out = '', map = [], i = 0;
    for (var ch of s) { var f = foldChar(ch); for (var k = 0; k < f.length; k++) { out += f[k]; map.push(i); } i += ch.length; }
    return {text: out, map: map};
  }
  function esc(s){ return s.replace(/[&<>"]/g, function(c){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  // Wrap every match of every term in <mark>, working on the folded text but cutting the original.
  function highlight(s, terms){
    var m = mapFold(s), ranges = [];
    terms.forEach(function(t){
      var from = 0, at;
      while ((at = m.text.indexOf(t, from)) >= 0) {
        var a = m.map[at], lastIdx = m.map[at + t.length - 1], b = lastIdx + 1;
        // keep the vowel marks that sit on the last matched letter
        while (b < s.length && foldChar(s[b]) === '') b++;
        ranges.push([a, b]); from = at + t.length;
      }
    });
    if (!ranges.length) return {html: esc(s), hit: false};
    ranges.sort(function(x, y){ return x[0] - y[0]; });
    var html = '', pos = 0;
    ranges.forEach(function(r){ if (r[0] < pos) return; html += esc(s.slice(pos, r[0])) + '<mark>' + esc(s.slice(r[0], r[1])) + '</mark>'; pos = r[1]; });
    return {html: html + esc(s.slice(pos)), hit: true};
  }
  function snippet(s, terms, width){
    var f = fold(s), first = -1;
    terms.forEach(function(t){ var i = f.indexOf(t); if (i >= 0 && (first < 0 || i < first)) first = i; });
    if (s.length <= width || first < 0) return s;
    var start = Math.max(0, first - Math.floor(width / 3));
    return (start ? '… ' : '') + s.slice(start, start + width) + (start + width < s.length ? ' …' : '');
  }

  function load(){
    if (loading) return loading;
    loading = fetch('/assets/search-index.json').then(function(r){ return r.json(); }).then(function(d){
      d.projects.forEach(function(p){ p.items.forEach(function(it){ it.hay = fold([it.n, it.ar, it.en, it.gl].join(' ')); }); });
      index = d;
      return d;
    }).catch(function(){ loading = null; });
    return loading;
  }

  function render(){
    var raw = input.value.trim();
    var terms = raw.split(/\s+/).map(fold).filter(Boolean);
    if (!terms.length) {
      results.hidden = true; nothing.hidden = true;
      cards.forEach(function(c){ c.hidden = false; });
      return;
    }
    var found = [];
    var perProject = {};
    if (index) index.projects.forEach(function(p){
      p.items.forEach(function(it){
        if (terms.every(function(t){ return it.hay.indexOf(t) >= 0; })) { found.push({p: p, it: it}); perProject[p.id] = (perProject[p.id] || 0) + 1; }
      });
    });
    var anyCard = false;
    cards.forEach(function(c){
      var text = fold(c.dataset.text + ' ' + c.textContent);
      var show = terms.every(function(t){ return text.indexOf(t) >= 0; }) || !!perProject[c.dataset.project];
      c.hidden = !show; anyCard = anyCard || show;
    });

    hits.innerHTML = '';
    if (found.length) {
      var titles = Object.keys(perProject).map(function(id){
        var p = index.projects.filter(function(x){ return x.id === id; })[0];
        return perProject[id] + (perProject[id] === 1 ? ' match' : ' matches') + ' in ' + p.title;
      });
      head.textContent = titles.join(' · ');
      found.slice(0, expanded ? found.length : SHOW).forEach(function(f){
        var it = f.it, en = highlight(it.en, terms), ar = highlight(it.ar, terms);
        var li = document.createElement('li');
        var html = '<a href="' + f.p.url + it.a + '"><span class="hit-n">' + esc(it.n) + '</span>' +
          (it.ar ? '<span class="hit-ar" lang="ar" dir="rtl">' + ar.html + '</span>' : '') +
          '<span class="hit-en">' + en.html + '</span>';
        if (!en.hit && !ar.hit && it.gl) html += '<span class="hit-gl">' + highlight(snippet(it.gl, terms, 160), terms).html + '</span>';
        li.innerHTML = html + '</a>';
        hits.appendChild(li);
      });
      more.hidden = expanded || found.length <= SHOW;
      more.textContent = 'Show all ' + found.length;
      results.hidden = false;
    } else {
      results.hidden = true;
    }
    nothing.hidden = !!(found.length || anyCard) || !index;
    nothing.textContent = 'Nothing here matches “' + raw + '” yet. Try another word, in English or Arabic.';
  }

  function onType(){
    expanded = false;
    clearTimeout(timer);
    timer = setTimeout(function(){ (index ? Promise.resolve() : load()).then(render); }, 120);
    if (!index) render();
  }
  input.addEventListener('input', onType);
  input.addEventListener('focus', load, {once: true});
  more.addEventListener('click', function(){ expanded = true; render(); });
})();
