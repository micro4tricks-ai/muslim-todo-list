"""Build js/sunnah-data.js: the evidence shown with each Sunnah reminder.

Hadith texts are cut out of the hadith collections published at
github.com/fawazahmed0/hadith-api (Arabic and the English translations used
on sunnah.com), by matching the opening and closing words of the passage, so
no hadith text is typed here. Muslim is looked up by the standard (Fuad Abd
al-Baqi) number. Al-Albani's grading is shown for hadiths outside the two
Sahihs. The one hadith not in those collections (Surat al-Kahf on Friday) is
listed in MANUAL with its reference.

Verses (morning and evening remembrance) come from quran/uthmani.json and
quran/en.json, built by tools/build_quran.py.

Run:  python tools/build_sunnah.py   (after tools/build_quran.py)
"""
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'js', 'sunnah-data.js')
API = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/{}.min.json'

BOOKS = {
    'bukhari': ('صحيح البخاري', 'Sahih al-Bukhari'),
    'muslim': ('صحيح مسلم', 'Sahih Muslim'),
    'tirmidhi': ('سنن الترمذي', "Jami' at-Tirmidhi"),
    'nasai': ('سنن النسائي', "Sunan an-Nasa'i"),
    'abudawud': ('سنن أبي داود', 'Sunan Abi Dawud'),
}

# id: (book, number, Arabic first words, Arabic last words, English first words, English last words)
HADITH = {
    'monThu': ('tirmidhi', '747', 'تعرض الاعمال', 'وانا صائم', 'Deeds are presented', 'while I am fasting'),
    'monday': ('muslim', '1162', 'سئل عن صوم الاثنين', 'انزل علي', 'was asked about fasting on Monday', 'sent down to me'),
    'white': ('tirmidhi', '761', 'اذا صمت من الشهر', 'وخمس عشرة', 'When you fast three days', 'fifteenth'),
    'arafah': ('muslim', '1162', 'صيام يوم عرفة', 'والسنة التي بعده', 'fasting on the day of', 'the coming years'),
    'ashura': ('muslim', '1162', 'وصيام يوم عاشوراء', 'السنة التي قبله', 'fasting on the day of Ashura', 'the preceding year'),
    'tasua': ('muslim', '1134', 'لئن بقيت الى قابل', 'لاصومن التاسع', 'If I live till the next', 'on the 9th'),
    'shawwal': ('muslim', '1164', 'من صام رمضان ثم اتبعه', 'كصيام الدهر', 'He who observed the fast of Ramadan', 'fasted perpetually'),
    'dhulhijja': ('bukhari', '969', 'ما العمل في ايام العشر', 'في هذه', 'No good deeds done on other days', 'first ten days of Dhul Hijja)'),
    'muharram': ('muslim', '1163', 'افضل الصيام بعد رمضان', 'شهر الله المحرم', 'The most excellent fast after Ramadan', 'al-Muharram'),
    'shaban': ('bukhari', '1969', 'فما رايت رسول الله', 'في شعبان', 'I never saw', "Sha'ban"),
    'ramadan': ('bukhari', '38', 'من صام رمضان ايمانا', 'من ذنبه', 'Whoever observes fasts', 'will be forgiven'),
    'lastTen': ('bukhari', '2017', 'تحروا ليلة القدر', 'من رمضان', 'Search for the Night of Qadr', 'of Ramadan'),
    'eid': ('bukhari', '1991', 'نهى النبي', 'والنحر', 'The Prophet', '(two feast days)'),
    'tashreeq': ('muslim', '1141', 'ايام التشريق', 'اكل وشرب', 'The days of Tashriq', 'eating and drinking'),
    'friday': ('abudawud', '1047', 'ان من افضل ايامكم', 'معروضة علي', 'Among the most excellent of your days', 'submitted to me'),
    'fridayFast': ('bukhari', '1985', 'لا يصومن احدكم', 'او بعده', 'None of you should fast on Friday', 'before or after it'),
}

# Not in the collections above; reference given in full.
MANUAL = {
    'kahf': {
        'ar': 'مَنْ قَرَأَ سُورَةَ الْكَهْفِ فِي يَوْمِ الْجُمُعَةِ أَضَاءَ لَهُ مِنَ النُّورِ مَا بَيْنَ الْجُمُعَتَيْنِ',
        'en': 'Whoever recites Surat al-Kahf on Friday, light will shine for him between the two Fridays.',
        'refAr': 'رواه الحاكم والبيهقي عن أبي سعيد الخدري، وصحّحه الألباني (صحيح الجامع ٦٤٧٠)',
        'refEn': "Al-Hakim and al-Bayhaqi, from Abu Sa'id al-Khudri; graded sahih by al-Albani (Sahih al-Jami' 6470)",
    },
}

# Verses: id -> (surah, ayah)
VERSES = {'adhkar': (50, 39)}

GRADE_AR = {'Sahih': 'صحّحه الألباني', 'Hasan Sahih': 'قال الألباني: حسن صحيح', 'Hasan': 'حسّنه الألباني'}
AR_DIGITS = str.maketrans('0123456789', '٠١٢٣٤٥٦٧٨٩')


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'muslim-todo-list-builder'})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode('utf-8'))['hadiths']


def fold(c):
    """One Arabic letter in a comparable form, or '' for marks."""
    if c in 'أإآٱ':
        return 'ا'
    if c == 'ى':
        return 'ي'
    if 'ء' <= c <= 'ي':
        return c
    if c == ' ':
        return ' '
    return ''


def cut_ar(text, first, last):
    """The original (voweled) text from `first` to `last`, matched on letters only."""
    plain, where = [], []
    for i, c in enumerate(text):
        f = fold(c)
        if f == ' ' and (not plain or plain[-1] == ' '):
            continue
        if f:
            plain.append(f)
            where.append(i)
    s = ''.join(plain)
    first, last = ''.join(map(fold, first)), ''.join(map(fold, last))
    a = s.find(first)
    assert a >= 0, first
    b = s.find(last, a + len(first) - len(last) if len(last) < len(first) else a)
    assert b >= 0, last
    end = where[b + len(last) - 1] + 1
    while end < len(text) and fold(text[end]) == '' and text[end] not in ' "‏':
        end += 1  # keep the last letter's vowel marks
    part = text[where[a]:end].replace('‏', '').replace('"', '')
    return re.sub(r'\s+', ' ', part).strip(' ،.')


def cut_en(text, first, last):
    a = text.find(first)
    assert a >= 0, first
    b = text.find(last, a)
    assert b >= 0, last
    return re.sub(r'\s+', ' ', text[a:b + len(last)]).strip()


def main():
    cache = {}

    def book(lang, name):
        key = f'{lang}-{name}'
        if key not in cache:
            cache[key] = get(API.format(key))
        return cache[key]

    out = {}
    for hid, (b, num, a1, a2, e1, e2) in HADITH.items():
        ara = [h for h in book('ara', b) if str(h.get('arabicnumber', h['hadithnumber'])).split('.')[0] == num]
        eng = {h['hadithnumber']: h for h in book('eng', b)}
        found = None
        for h in ara:
            try:
                ar = cut_ar(h['text'], a1, a2)
                e = eng[h['hadithnumber']]
                found = (ar, cut_en(e['text'], e1, e2), e.get('grades') or [])
                break
            except AssertionError:
                continue
        assert found, hid
        ar, en, grades = found
        name_ar, name_en = BOOKS[b]
        ref_ar, ref_en = f'{name_ar} {num.translate(AR_DIGITS)}', f'{name_en} {num}'
        if b not in ('bukhari', 'muslim'):
            g = next((x['grade'] for x in grades if 'Albani' in x['name']), None)
            assert g in GRADE_AR, (hid, g)
            ref_ar += f'، {GRADE_AR[g]}'
            ref_en += f', graded {g.lower()} by al-Albani'
        out[hid] = {'ar': ar, 'en': en, 'refAr': ref_ar, 'refEn': ref_en}
    out.update(MANUAL)

    uth = json.load(open(os.path.join(ROOT, 'quran', 'uthmani.json'), encoding='utf-8'))
    en = json.load(open(os.path.join(ROOT, 'quran', 'en.json'), encoding='utf-8'))
    with open(os.path.join(ROOT, 'js', 'quran-meta.js'), encoding='utf-8') as f:
        surahs = json.loads(f.read().split('= ', 1)[1].rstrip().rstrip(';'))['surahs']
    for vid, (s, a) in VERSES.items():
        i = sum(x[4] for x in surahs[:s - 1]) + a - 1
        out[vid] = {'ar': uth[i], 'en': en[i], 'refAr': f'{surahs[s - 1][0]} {str(a).translate(AR_DIGITS)}',
                    'refEn': f'Quran {s}:{a}', 'verse': True}

    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Generated by tools/build_sunnah.py from the hadith collections and the Mushaf data. Do not edit by hand.\n')
        f.write('window.NOON_SUNNAH_TEXTS = ')
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write(';\n')
    for k, v in out.items():
        print(k, '|', v['ar'][:70], '|', v['en'][:50], '|', v['refAr'])


if __name__ == '__main__':
    main()
