"""Build js/extras-data.js: texts for the tools (Hajj and Umrah, istikhara, the names of Allah,
Ramadan, and the verse and hadith of the day).

- Hadiths are cut from the hadith collections (github.com/fawazahmed0/hadith-api) by their
  opening and closing words, as in tools/build_sunnah.py; nothing is typed here.
- The Hajj steps follow Jabir's description of the Farewell Pilgrimage (Sahih Muslim 1218).
- The 99 names come from api.aladhan.com (Arabic, transliteration, English meaning).
- The forty hadiths of an-Nawawi come from github.com/AhmedBaset/hadith-json.
- Verses of the day are taken from quran/uthmani.json and quran/en.json by reference.

Run:  python tools/build_extras.py   (after tools/build_quran.py)
"""
import json
import os
import urllib.request

import build_sunnah as B

OUT = os.path.join(B.ROOT, 'js', 'extras-data.js')

# id: (book, number, Arabic first/last words, English first/last words)
HADITH = {
    'names': ('bukhari', '2736', 'ان لله تسعة وتسعين اسما', 'دخل الجنة', 'Allah has ninety-nine names', 'will go to Paradise'),
    'istikhara': ('bukhari', '1166', 'اذا هم احدكم بالامر', 'ويسمي حاجته', 'If anyone of you thinks of doing', 'name (mention) his need'),
    'iftar': ('abudawud', '2357', 'ذهب الظما', 'ان شاء الله', 'Thirst has gone', 'if Allah wills'),
    'fitr': ('bukhari', '1503', 'فرض رسول الله', 'الى الصلاة', 'enjoined the payment', 'the `Id prayer'),
    'qadr': ('tirmidhi', '3513', 'اللهم انك عفو', 'فاعف عني', 'O Allah, indeed You are Pardoning', 'so pardon me'),
    'nisab': ('bukhari', '1447', 'ليس فيما دون خمس ذود', 'خمسة اوسق صدقة', 'There is no Zakat on less than five camels', 'less than five Awsuq'),
    'rate': ('bukhari', '1454', 'وفي الرقة ربع العشر', 'ربع العشر', 'For silver the Zakat is one-fortieth', '(i.e. 2.5%)'),
    'rawatib': ('tirmidhi', '415', 'من صلى في يوم وليلة ثنتي عشرة ركعة', 'قبل صلاة الفجر', 'Whoever prays twelve', 'in the morning Salat'),
    'qada': ('bukhari', '597', 'من نسي صلاة', 'الا ذلك', 'If anyone forgets a prayer', 'to pray the same'),
    'jamaah': ('bukhari', '645', 'صلاة الجماعة تفضل صلاة الفذ', 'وعشرين درجة', 'The prayer in congregation', 'times superior'),
    'umrahVirtue': ('bukhari', '1773', 'العمرة الى العمرة', 'الا الجنة', '(The performance of) `Umra', 'nothing except Paradise'),
    'miqat': ('bukhari', '1524', 'وقت لاهل المدينة ذا الحليفة', 'من مكة', 'made Dhul-Hulaifa as the Miqat', 'Mecca'),
    'talbiyah': ('bukhari', '1549', 'لبيك اللهم لبيك', 'لا شريك لك', 'Labbaika Allahumma labbaik', 'no partners with You'),
    'tawaf': ('muslim', '1218', 'حتى اذا اتينا البيت معه استلم الركن', 'ومشي اربعا', 'when we came with him to the House', 'walking four'),
    'maqam': ('muslim', '1218', 'ثم نفذ الى مقام ابراهيم', 'قل يا ايها الكافرون', 'going to the Station of Ibrahim', 'unbelievers'),
    'sai': ('muslim', '1218', 'ثم خرج من الباب الى الصفا', 'كما فعل على الصفا', 'He then went out of the gate to al-Safa', "as he had done at al-Safa'"),
    'halq': ('bukhari', '1727', 'اللهم ارحم المحلقين', 'قال والمقصرين', 'O Allah! Be merciful to those who have their head shaved', 'those who get their hair cut short'),
    'tarwiyah': ('muslim', '1218', 'فلما كان يوم التروية توجهوا الى مني', 'حتى طلعت الشمس', 'when it was the day of Tarwiya', 'till the sun rose'),
    'arafah': ('muslim', '1218', 'ثم ركب رسول الله صلى الله عليه وسلم حتى اتى الموقف', 'حتى غاب القرص', 'then mounted his camel and came to the place of stay', 'the disc of the sun had disappeared'),
    'muzdalifah': ('muslim', '1218', 'حتى اتى المزدلفة فصلى بها المغرب والعشاء', 'حتى اسفر جدا', 'reached al-Muzdalifa', 'the daylight was very clear'),
    'jamrah': ('muslim', '1218', 'حتى اتى الجمرة التي عند الشجرة', 'فنحر ثلاثا وستين بيده', 'he came to the jamra which is near the tree', 'with his own hand'),
    'ifadah': ('muslim', '1218', 'فافاض الى البيت', 'فصلى بمكة الظهر', 'again rode and came to the House', 'offered the Zuhr prayer at Mecca'),
    'wada': ('bukhari', '1755', 'امر الناس ان يكون اخر عهدهم بالبيت', 'عن الحائض', 'The people were ordered', 'who were excused'),
}

# Steps: (id, Arabic heading, English heading, [hadith ids])
UMRAH = [
    ('ihram', 'الإحرام من الميقات', 'Ihram from the miqat', ['miqat']),
    ('talbiyah', 'التلبية', 'The talbiyah', ['talbiyah']),
    ('tawaf', 'الطواف بالبيت سبعاً', 'Seven circuits around the House', ['tawaf']),
    ('maqam', 'ركعتان خلف المقام', 'Two rak‘ahs behind the Station of Ibrahim', ['maqam']),
    ('sai', 'السعي بين الصفا والمروة', 'Sa‘i between as-Safa and al-Marwah', ['sai']),
    ('halq', 'الحلق أو التقصير', 'Shaving or shortening the hair', ['halq']),
]
HAJJ = [
    ('tarwiyah', 'يوم التروية (٨ ذي الحجة): الإحرام بالحج والمبيت بمنى', 'Day of Tarwiyah (8th): ihram for Hajj, Mina', ['tarwiyah']),
    ('arafah', 'يوم عرفة (٩ ذي الحجة): الوقوف بعرفة إلى الغروب', 'Day of Arafah (9th): standing at Arafah until sunset', ['arafah']),
    ('muzdalifah', 'المبيت بمزدلفة', 'The night at Muzdalifah', ['muzdalifah']),
    ('nahr', 'يوم النحر (١٠ ذي الحجة): رمي جمرة العقبة والنحر', 'Day of Sacrifice (10th): the stoning and the sacrifice', ['jamrah']),
    ('halq', 'الحلق أو التقصير', 'Shaving or shortening the hair', ['halq']),
    ('ifadah', 'طواف الإفاضة', 'Tawaf al-Ifadah', ['ifadah']),
    ('wada', 'طواف الوداع', 'The farewell tawaf', ['wada']),
]

# Verses of the day: (surah, ayah)
VERSES = [(2, 152), (2, 153), (2, 186), (2, 201), (2, 255), (2, 286), (3, 8), (3, 26), (3, 139), (3, 173), (3, 190),
          (3, 200), (7, 56), (11, 88), (12, 87), (13, 28), (14, 7), (16, 97), (16, 128), (17, 80), (18, 10), (20, 114),
          (21, 87), (21, 89), (23, 118), (25, 74), (28, 24), (29, 69), (33, 41), (33, 56), (39, 10), (39, 53), (40, 44),
          (40, 60), (42, 19), (49, 10), (49, 13), (50, 16), (51, 56), (57, 4), (59, 18), (64, 11), (65, 3), (67, 2),
          (93, 5), (94, 5), (94, 6), (2, 45), (2, 214), (3, 31), (4, 110), (8, 46), (9, 51), (10, 62), (15, 99), (17, 24),
          (20, 46), (24, 22), (31, 17), (35, 2)]


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'muslim-todo-list-builder'})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode('utf-8'))


def main():
    cache = {}

    def book(lang, name):
        k = f'{lang}-{name}'
        if k not in cache:
            cache[k] = B.get(B.API.format(k))
        return cache[k]

    texts = {}
    for hid, (b, num, a1, a2, e1, e2) in HADITH.items():
        ara = [h for h in book('ara', b) if str(h.get('arabicnumber', h['hadithnumber'])).split('.')[0] == num]
        eng = {h['hadithnumber']: h for h in book('eng', b)}
        found = None
        for h in ara:
            try:
                e = eng[h['hadithnumber']]
                found = (B.cut_ar(h['text'], a1, a2), B.cut_en(e['text'], e1, e2), e.get('grades') or [])
                break
            except AssertionError:
                continue
        assert found, hid
        ar, en, grades = found
        name_ar, name_en = B.BOOKS[b]
        ref_ar, ref_en = f'{name_ar} {num.translate(B.AR_DIGITS)}', f'{name_en} {num}'
        if b not in ('bukhari', 'muslim'):
            g = next((x['grade'] for x in grades if 'Albani' in x['name']), None)
            assert g in B.GRADE_AR, (hid, g)
            ref_ar += f'، {B.GRADE_AR[g]}'
            ref_en += f', graded {g.lower()} by al-Albani'
        texts[hid] = {'ar': ar, 'en': en, 'refAr': ref_ar, 'refEn': ref_en}
        print(hid, '|', ar[:50], '|', en[:40])

    names = [{'n': x['number'], 'ar': x['name'], 'tr': x['transliteration'], 'en': x['en']['meaning']}
             for x in get('https://api.aladhan.com/v1/asmaAlHusna')['data']]
    assert len(names) == 99

    nawawi = get('https://cdn.jsdelivr.net/gh/AhmedBaset/hadith-json@main/db/by_book/forties/nawawi40.json')
    forty = [{'n': h['idInBook'], 'ar': h['arabic'].strip(), 'en': ' '.join(x for x in (h['english'].get('narrator'), h['english'].get('text')) if x).strip()}
             for h in nawawi['hadiths']]

    uth = json.load(open(os.path.join(B.ROOT, 'quran', 'uthmani.json'), encoding='utf-8'))
    en = json.load(open(os.path.join(B.ROOT, 'quran', 'en.json'), encoding='utf-8'))
    with open(os.path.join(B.ROOT, 'js', 'quran-meta.js'), encoding='utf-8') as f:
        surahs = json.loads(f.read().split('= ', 1)[1].rstrip().rstrip(';'))['surahs']
    verses = []
    for s, a in VERSES:
        assert 1 <= a <= surahs[s - 1][4], (s, a)
        i = sum(x[4] for x in surahs[:s - 1]) + a - 1
        verses.append({'i': i, 'ar': uth[i], 'en': en[i], 'refAr': f'{surahs[s - 1][0]} {str(a).translate(B.AR_DIGITS)}', 'refEn': f'Quran {s}:{a}'})

    steps = lambda lst: [{'id': sid, 'ar': ar, 'en': en_, 'hadith': ids} for sid, ar, en_, ids in lst]
    data = {'texts': texts, 'umrah': steps(UMRAH), 'hajj': steps(HAJJ), 'names': names, 'forty': forty, 'verses': verses}
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Generated by tools/build_extras.py. Do not edit by hand.\n')
        f.write('window.NOON_EXTRAS = ')
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print('names', len(names), 'forty', len(forty), 'verses', len(verses))


if __name__ == '__main__':
    main()
