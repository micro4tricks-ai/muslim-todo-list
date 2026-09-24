"""Build js/adhkar-data.js from trusted sources.

- Hisn al-Muslim chapters come from the official API (hisnmuslim.com), in
  Arabic with the English translation and transliteration, the repeat count
  and the recitation audio.
- Quranic verses come from api.alquran.cloud (quran-simple + Sahih
  International). When a dua is only part of a verse, the part is cut out of
  the fetched text by matching its opening words, so no verse text is typed.
- Four well-known hadith duas for students of knowledge are listed with their
  sources in HADITH below.

Run:  python tools/build_adhkar.py
"""
import io
import json
import re
import sys
import urllib.request

OUT = 'js/adhkar-data.js'


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'muslim-todo-list-builder'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8-sig'))


def hisn(chapter):
    """Items of one Hisn al-Muslim chapter, Arabic merged with English."""
    ar = get(f'https://www.hisnmuslim.com/api/ar/{chapter}.json')
    en = get(f'https://www.hisnmuslim.com/api/en/{chapter}.json')
    ar_items = next(iter(ar.values()))
    en_items = {i['ID']: i for i in next(iter(en.values()))}
    out = []
    for it in ar_items:
        e = en_items.get(it['ID'], {})
        out.append({
            'id': f"h{it['ID']}",
            'ar': clean(it['ARABIC_TEXT']),
            'en': clean(e.get('TRANSLATED_TEXT', '')),
            'tr': clean(e.get('LANGUAGE_ARABIC_TRANSLATED_TEXT', '')),
            'repeat': max(1, int(it.get('REPEAT') or 1)),
            'audio': (it.get('AUDIO') or '').replace('http://', 'https://'),
            'src': 'hisn',
        })
    return out


def clean(s):
    return re.sub(r'\s+', ' ', (s or '').replace('\r', ' ').replace('\n', ' ')).strip()


# ---- Quran ----
HARAKAT = re.compile('[ؐ-ًؚ-ٰٟۖ-ۭـ]')


def plain(s):
    """Letters only: no diacritics, unified alef/ya, for matching opening words."""
    s = HARAKAT.sub('', s)
    return s.translate(str.maketrans({'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي'}))


def from_words(text, words):
    """Cut `text` starting at the first letter of `words` (matched without diacritics)."""
    target = plain(words)
    for i, ch in enumerate(text):
        if HARAKAT.match(ch):
            continue
        if plain(text[i:]).startswith(target):
            return text[i:]
    raise SystemExit(f'opening words not found: {words}')


def verses(ref):
    """ref like '2:255' or '2:285-286' -> (arabic, english) joined verse texts."""
    surah, ayat = ref.split(':')
    first, last = (ayat.split('-') + [ayat])[:2]
    ar, en = [], []
    for n in range(int(first), int(last) + 1):
        d = get(f'https://api.alquran.cloud/v1/ayah/{surah}:{n}/editions/quran-simple,en.sahih')['data']
        ar.append(d[0]['text'].replace('﻿', '').strip())
        en.append(d[1]['text'].replace('﻿', '').strip())
    return ' * '.join(ar), ' '.join(en)


def quran(ref, name_ar, name_en, repeat=1, ar_from=None, en_from=None):
    ar, en = verses(ref)
    # The API prefixes verse 1 of most surahs with the basmala; it is not part
    # of the verse, so show it before the Quran brackets instead of inside.
    lead = ''
    if not ref.startswith('1:') and ref.split(':')[1].split('-')[0] == '1' and plain(ar).startswith(plain('بسم الله الرحمن الرحيم')):
        body = from_words(ar, 'قل') if plain(ar).split()[4:5] == ['قل'] else None
        if body is None:
            raise SystemExit(f'unexpected basmala layout in {ref}')
        lead = ar[:len(ar) - len(body)].strip() + ' '
        ar = body
    if ar_from:
        ar = from_words(ar, ar_from)
    if en_from:
        at = en.find(en_from)
        if at < 0:
            raise SystemExit(f'English opening not found in {ref}: {en_from}')
        en = en[at:].rstrip('"” ').strip()
    return {'id': 'q' + ref.replace(':', '-'), 'ar': f'{lead}﴿{ar}﴾', 'en': en, 'tr': '',
            'repeat': repeat, 'audio': '', 'src': 'quran', 'ref': f'{name_ar} {ref}', 'refEn': f'{name_en} {ref}'}


# Hadith duas for students of knowledge (text and source listed for review).
HADITH = {
    'k1': ('اللَّهُمَّ انْفَعْنِي بِمَا عَلَّمْتَنِي، وَعَلِّمْنِي مَا يَنْفَعُنِي، وَزِدْنِي عِلْمًا',
           'O Allah, benefit me with what You have taught me, teach me what will benefit me, and increase me in knowledge.',
           'رواه الترمذي وابن ماجه', 'Tirmidhi, Ibn Majah'),
    'k2': ('اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا، وَرِزْقًا طَيِّبًا، وَعَمَلًا مُتَقَبَّلًا',
           'O Allah, I ask You for beneficial knowledge, good provision and accepted deeds.',
           'رواه ابن ماجه، ويقال بعد صلاة الصبح', 'Ibn Majah; said after the Fajr prayer'),
    'k3': ('اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ عِلْمٍ لَا يَنْفَعُ، وَمِنْ قَلْبٍ لَا يَخْشَعُ، وَمِنْ نَفْسٍ لَا تَشْبَعُ، وَمِنْ دَعْوَةٍ لَا يُسْتَجَابُ لَهَا',
           'O Allah, I seek refuge in You from knowledge that does not benefit, from a heart that is not humble, from a soul that is never satisfied, and from a supplication that is not answered.',
           'رواه مسلم', 'Muslim'),
    'k4': ('اللَّهُمَّ أَلْهِمْنِي رُشْدِي، وَأَعِذْنِي مِنْ شَرِّ نَفْسِي',
           'O Allah, inspire me with right guidance and protect me from the evil of my own self.',
           'رواه الترمذي', 'Tirmidhi'),
}


def hadith(key):
    ar, en, src_ar, src_en = HADITH[key]
    return {'id': key, 'ar': ar, 'en': en, 'tr': '', 'repeat': 1, 'audio': '', 'src': 'hadith',
            'ref': src_ar, 'refEn': src_en}


def build():
    cats = []

    def cat(cid, ar, en, items):
        cats.append({'id': cid, 'ar': ar, 'en': en, 'items': items})
        print(f'{cid}: {len(items)} items', file=sys.stderr)

    cat('am-pm', 'أذكار الصباح والمساء', 'Morning & evening', hisn(27))
    cat('after-prayer', 'أذكار بعد الصلاة', 'After the prayer', hisn(25))
    cat('student', 'أدعية طالب العلم', 'For students of knowledge', [
        quran('20:114', 'طه', 'Taha', ar_from='رب زدني', en_from='My Lord, increase me'),
        quran('20:25-28', 'طه', 'Taha', ar_from='رب اشرح', en_from='My Lord, expand'),
        quran('2:32', 'البقرة', 'Al-Baqarah', ar_from='سبحانك', en_from='Exalted are You'),
        quran('3:8', 'آل عمران', 'Aal Imran', en_from='Our Lord, let not'),
        hadith('k1'), hadith('k2'), hadith('k3'),
    ] + hisn(85))
    cat('success', 'التوفيق والتيسير', 'Success & ease', [
        quran('18:10', 'الكهف', 'Al-Kahf', ar_from='ربنا آتنا', en_from='Our Lord, grant us'),
        quran('11:88', 'هود', 'Hud', ar_from='وما توفيقي', en_from='And my success'),
        hadith('k4'),
    ] + hisn(43) + hisn(26))
    cat('clarity', 'الهم وصفاء الذهن', 'Worry & a clear mind', hisn(34) + hisn(35) + hisn(42) + hisn(45) + hisn(40))
    cat('ruqyah', 'الرقية الشرعية', 'Ruqyah', [
        quran('1:1-7', 'الفاتحة', 'Al-Fatihah'),
        quran('2:255', 'البقرة', 'Al-Baqarah'),
        quran('2:285-286', 'البقرة', 'Al-Baqarah'),
        quran('112:1-4', 'الإخلاص', 'Al-Ikhlas', repeat=3),
        quran('113:1-5', 'الفلق', 'Al-Falaq', repeat=3),
        quran('114:1-6', 'الناس', 'An-Nas', repeat=3),
    ] + hisn(124) + hisn(49) + hisn(48) + hisn(125))
    cat('sleep', 'أذكار النوم والاستيقاظ', 'Sleep & waking', hisn(28) + hisn(1))
    cat('istighfar', 'الاستغفار والتسبيح', 'Istighfar & tasbih', hisn(129) + hisn(130))

    body = json.dumps({'source': 'Hisn al-Muslim (hisnmuslim.com), Quran: api.alquran.cloud (quran-simple, Sahih International)',
                       'categories': cats}, ensure_ascii=False, indent=1)
    header = '// Generated by tools/build_adhkar.py from Hisn al-Muslim and the Quran API. Do not edit by hand.\n'
    io.open(OUT, 'w', encoding='utf-8', newline='\n').write(header + 'window.NOON_ADHKAR = ' + body + ';\n')
    print('wrote', OUT, file=sys.stderr)


if __name__ == '__main__':
    build()
