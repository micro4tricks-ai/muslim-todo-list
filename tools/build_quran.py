"""Build the Mushaf data from api.alquran.cloud (Tanzil texts).

- quran/uthmani.json : the Uthmani script (Hafs), one string per verse (6236)
- quran/clean.json   : the same verses without diacritics, used for search
- quran/en.json      : Sahih International English translation
- js/quran-meta.js   : surah names, verse counts, page / juz / hizb-quarter
                       starts and sajda verses (all as global verse indexes)

The basmala that the source puts at the start of verse 1 of every surah
(except al-Fatiha, where it is verse 1, and at-Tawba, which has none) is cut
off here and drawn by the reader as a header. The cut is checked against the
source's own al-Fatiha 1:1, so no Quran text is typed by hand.

Run:  python tools/build_quran.py
"""
import json
import re
import os
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'muslim-todo-list-builder'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode('utf-8'))['data']


def edition(name):
    return get(f'https://api.alquran.cloud/v1/quran/{name}')['surahs']


def strip_basmala(surahs):
    """Verse texts in order, with the basmala removed from each verse 1 but al-Fatiha's."""
    basmala = surahs[0]['ayahs'][0]['text'].replace('﻿', '').strip().split(' ')
    out = []
    for s in surahs:
        for a in s['ayahs']:
            t = a['text'].replace('﻿', '').strip()
            if s['number'] not in (1, 9) and a['numberInSurah'] == 1:
                words = t.split(' ')
                # A few surahs mark the basmala with an extra shadda (idgham); compare letters only.
                assert [letters(w) for w in words[:4]] == [letters(w) for w in basmala], (s['number'], t[:60])
                t = ' '.join(words[4:]).strip()
                assert t, s['number']
            out.append(t)
    return out


def letters(w):
    return ''.join(c for c in w if 'ء' <= c <= 'ي' or c == 'ٱ')


def tajweed_texts():
    """The colour-coded tajweed edition: rules are marked [code[letters] or [code:id[letters].

    Where a verse 1 starts with the basmala, it is cut off at the fourth space outside
    any mark. Every verse is checked letter for letter against the Uthmani text.
    """
    surahs = edition('quran-tajweed')
    basmala = [letters(w) for w in surahs[0]['ayahs'][0]['text'].replace('﻿', '').strip().split(' ')]
    mark = re.compile(r'\[[a-z](?::\d+)?\[|\]')
    out = []
    for s in surahs:
        for a in s['ayahs']:
            t = a['text'].replace('﻿', '').strip()
            plain = mark.sub('', t)
            if s['number'] not in (1, 9) and a['numberInSurah'] == 1 and [letters(w) for w in plain.split(' ')[:4]] == basmala:
                # Walk the marked text and cut after the fourth word.
                spaces, depth, k = 0, 0, 0
                while k < len(t):
                    m = mark.match(t, k)
                    if m:
                        depth += 1 if m.group().startswith('[') else -1
                        k = m.end()
                        continue
                    if t[k] == ' ' and depth == 0:
                        spaces += 1
                        if spaces == 4:
                            break
                    k += 1
                assert spaces == 4, s['number']
                t = t[k + 1:].strip()
            out.append(t)
    assert len(out) == 6236
    return out


def main():
    uth = edition('quran-uthmani')
    clean = edition('quran-simple-clean')
    en = edition('en.sahih')
    assert len(uth) == len(clean) == len(en) == 114

    verses, pages, juz, quarters, sajdas, surahs = [], [], [], [], [], []
    i = 0
    for s in uth:
        surahs.append([s['name'], s['englishName'], s['englishNameTranslation'],
                       'M' if s['revelationType'] == 'Meccan' else 'D', len(s['ayahs'])])
        for a in s['ayahs']:
            if not pages or a['page'] != len(pages):
                assert a['page'] == len(pages) + 1, (s['number'], a['numberInSurah'])
                pages.append(i)
            if not juz or a['juz'] != len(juz):
                assert a['juz'] == len(juz) + 1
                juz.append(i)
            if not quarters or a['hizbQuarter'] != len(quarters):
                assert a['hizbQuarter'] == len(quarters) + 1
                quarters.append(i)
            if a.get('sajda'):
                sajdas.append(i)
            i += 1
    assert i == 6236 and len(pages) == 604 and len(juz) == 30 and len(quarters) == 240

    texts = strip_basmala(uth)
    bas_uth = uth[0]['ayahs'][0]['text'].replace('﻿', '').strip()
    bas_en = en[0]['ayahs'][0]['text'].strip()
    for e in (strip_basmala(clean), [a['text'].strip() for s in en for a in s['ayahs']]):
        assert len(e) == 6236
    os.makedirs(os.path.join(ROOT, 'quran'), exist_ok=True)

    def dump(name, data):
        with open(os.path.join(ROOT, 'quran', name), 'w', encoding='utf-8', newline='\n') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

    dump('uthmani.json', texts)
    tajweed = tajweed_texts()
    # The two editions spell small yaa/waw and tatweel differently; everything else must match.
    mark = re.compile(r'\[[a-z](?::\d+)?\[|\]')

    def skeleton(w):
        w = ''.join(c for c in w if ('ء' <= c <= 'ي' or c == 'ٱ') and c != 'ـ')
        for a, b in (('ٱ', 'ا'), ('أ', 'ا'), ('إ', 'ا'), ('آ', 'ا'), ('ى', ''), ('ئ', ''), ('ؤ', ''), ('ء', ''), ('ي', ''), ('و', '')):
            w = w.replace(a, b)
        return w
    bad = [i for i in range(6236) if skeleton(mark.sub('', tajweed[i])) != skeleton(texts[i])]
    assert not bad, bad[:10]
    dump('tajweed.json', tajweed)
    dump('clean.json', strip_basmala(clean))
    dump('en.json', [a['text'].strip() for s in en for a in s['ayahs']])

    meta = {
        'surahs': surahs, 'pages': pages, 'juz': juz, 'quarters': quarters, 'sajdas': sajdas,
        'basmala': bas_uth, 'basmalaEn': bas_en,
        'source': 'Tanzil Quran text (tanzil.net, CC BY 3.0) and Sahih International, via api.alquran.cloud'
    }
    with open(os.path.join(ROOT, 'js', 'quran-meta.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Generated by tools/build_quran.py from api.alquran.cloud. Do not edit by hand.\n')
        f.write('window.NOON_QURAN_META = ')
        json.dump(meta, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print('verses', i, 'pages', len(pages), 'sajdas', len(sajdas))


if __name__ == '__main__':
    main()
