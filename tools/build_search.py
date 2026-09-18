#!/usr/bin/env python3
"""Rebuild assets/search-index.json from the project pages.

Run from the repo root after changing a project's text:  python3 tools/build_search.py
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def text(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s)).strip()


def burdah():
    page = (ROOT / 'burdah' / 'index.html').read_text(encoding='utf8')
    closing = page.index('<section class="closing" aria-labelledby="closeh">')
    items = []
    for m in re.finditer(r'<div class="bayt"(?: id="([^"]+)")?>(.*?)\n</div>', page, re.S):
        anchor, block = m.group(1), m.group(2)
        halves = re.search(r'<span class="s1">(.*?)</span><span class="s2">(.*?)</span>', block, re.S)
        en = re.search(r'<p class="en">(.*?)</p>', block, re.S)
        notes = ['%s: %s' % (text(dt), text(dd)) for dt, dd in re.findall(r'<dt>(.*?)</dt><dd>(.*?)</dd>', block, re.S)]
        if anchor == 'v0':
            label = 'Opening verse'
        elif anchor:
            label = 'Verse %d' % int(anchor[1:])
        elif m.start() > closing:
            anchor, label = 'closeh', 'Closing verse'
        else:
            continue
        items.append({
            'a': '#' + anchor,
            'n': label,
            'ar': text(halves.group(1)) + ' · ' + text(halves.group(2)),
            'en': text(en.group(1)),
            'gl': ' | '.join(notes),
        })
    refrain = re.search(r'<div class="refrain" id="refrain">(.*?)</div>', page, re.S).group(1)
    ar = re.search(r'<p class="ar"[^>]*>(.*?)</p>', refrain, re.S).group(1)
    items.insert(1, {
        'a': '#refrain', 'n': 'Refrain',
        'ar': ' · '.join(text(x) for x in re.findall(r'<span>(.*?)</span>', ar)),
        'en': text(re.search(r'<p class="en">(.*?)</p>', refrain, re.S).group(1)),
        'gl': '',
    })
    return {
        'id': 'burdah', 'url': '/burdah/', 'title': 'Qasida al-Burdah',
        'items': items,
    }


def main():
    projects = [burdah()]
    out = ROOT / 'assets' / 'search-index.json'
    out.write_text(json.dumps({'projects': projects}, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    for p in projects:
        print('%s: %d items' % (p['id'], len(p['items'])))
    print('wrote %s (%d bytes)' % (out.relative_to(ROOT), out.stat().st_size))


if __name__ == '__main__':
    main()
