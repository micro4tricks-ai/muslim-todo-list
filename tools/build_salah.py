"""Build js/salah-data.js: the Prophet's prayer ﷺ step by step, each step with its hadith.

The steps follow the order of al-Albani's "Sifat Salat an-Nabi" (from the takbir to the
taslim). The book itself is not copied: every step shows authentic hadiths cut from the
hadith collections (github.com/fawazahmed0/hadith-api) by their opening and closing words,
with the reference and al-Albani's grading outside the two Sahihs. The page links to the
book on al-Maktaba al-Shamela for the full text and its detail.

Run:  python tools/build_salah.py
"""
import json
import os
import re

import build_sunnah as B

OUT = os.path.join(B.ROOT, 'js', 'salah-data.js')

# (id, Arabic heading, English heading, [(book, number, Arabic first/last words, English first/last words)])
STEPS = [
    ('intro', 'صلّوا كما رأيتموني أصلّي', 'Pray as you have seen me pray',
     [('bukhari', '631', 'وصلوا كما رايتموني اصلي', 'اصلي', 'Pray as you have seen me praying', 'praying')]),
    ('niyyah', 'النية', 'The intention',
     [('bukhari', '1', 'انما الاعمال بالنيات', 'ما نوي', 'The reward of deeds', 'intended')]),
    ('qibla', 'استقبال القبلة وتكبيرة الإحرام', 'Facing the qibla and the opening takbir',
     [('bukhari', '6251', 'اذا قمت الى الصلاة فاسبغ الوضوء', 'القبلة فكبر', 'When you stand for prayer', 'say Takbir (Allahu-Akbar)')]),
    ('hands', 'رفع اليدين', 'Raising the hands',
     [('bukhari', '735', 'كان يرفع يديه حذو منكبيه', 'في السجود', 'used to raise both his hands', 'in prostrations')]),
    ('right', 'وضع اليد اليمنى على اليسرى', 'The right hand over the left',
     [('bukhari', '740', 'كان الناس يؤمرون', 'في الصلاة', 'The people were ordered', 'in the prayer')]),
    ('istiftah', 'دعاء الاستفتاح', 'The opening supplication',
     [('bukhari', '744', 'اللهم باعد بيني وبين خطاياي', 'والبرد', 'Allahumma, baa`id', 'snow and hail')]),
    ('fatiha', 'قراءة الفاتحة', 'Reciting al-Fatiha',
     [('bukhari', '756', 'لا صلاة لمن لم يقرا بفاتحة الكتاب', 'الكتاب', 'Whoever does not recite', 'is invalid')]),
    ('amin', 'التأمين', 'Saying Amin',
     [('bukhari', '780', 'اذا امن الامام فامنوا', 'من ذنبه', 'Say Amin', 'will be forgiven')]),
    ('ruku', 'الركوع والاعتدال منه بطمأنينة', 'Bowing and rising from it, calmly',
     [('bukhari', '757', 'ثم اركع حتى تطمئن راكعا', 'حتى تعتدل قائما', 'then bow till you feel at ease', 'stand up straight')]),
    ('rukuDhikr', 'ما يقال في الركوع والرفع منه', 'What is said in bowing and on rising',
     [('muslim', '772', 'ثم ركع فجعل يقول سبحان ربي العظيم', 'ربي العظيم', 'would then bow and say', 'Glory be to my Mighty Lord'),
      ('bukhari', '789', 'ثم يقول سمع الله لمن حمده', 'ربنا لك الحمد', 'On rising from bowing', 'Rabbana laka-l hamd')]),
    ('sujud', 'السجود على الأعضاء السبعة', 'Prostrating on the seven bones',
     [('bukhari', '812', 'امرت ان اسجد على سبعة اعظم', 'واطراف القدمين', 'I have been ordered to prostrate', 'toes of both feet')]),
    ('sujudDhikr', 'ما يقال في السجود', 'What is said in prostration',
     [('muslim', '772', 'ثم سجد فقال سبحان ربي الاعلي', 'ربي الاعلي', 'He would then prostrate himself', 'my Lord most High')]),
    ('jalsa', 'الجلوس بين السجدتين', 'Sitting between the two prostrations',
     [('bukhari', '757', 'ثم اسجد حتى تطمئن ساجدا', 'في صلاتك كلها', 'then prostrate till you feel at ease', 'in all your prayers'),
      ('abudawud', '874', 'وكان يقول رب اغفر لي', 'رب اغفر لي', 'and said while sitting', 'O my Lord forgive me')]),
    ('tashahhud', 'التشهد', 'The tashahhud',
     [('bukhari', '831', 'فليقل التحيات لله', 'عبده ورسوله', 'he should say, at-Tahiyatu', 'wa Rasuluh')]),
    ('salawat', 'الصلاة على النبي ﷺ', 'Blessings on the Prophet ﷺ',
     [('bukhari', '3370', 'قولوا اللهم صل على محمد', 'انك حميد مجيد', 'Say: O Allah!', 'the Most Glorious')]),
    ('taawwudh', 'الاستعاذة من أربع قبل السلام', 'Seeking refuge from four things before the salam',
     [('muslim', '588', 'اذا فرغ احدكم من التشهد الاخر', 'المسيح الدجال', 'When any one of you completes the last tashahhud', '(Antichrist)')]),
    ('taslim', 'التسليم', 'The closing salam',
     [('muslim', '582', 'يسلم عن يمينه وعن يساره', 'بياض خده', 'pronouncing taslim', 'whiteness of his cheek')]),
]


def cut_ar(text, first, last):
    """Like build_sunnah.cut_ar, but ends at the last occurrence of `last` (for repeated endings)."""
    plain, where = [], []
    for i, c in enumerate(text):
        f = B.fold(c)
        if f == ' ' and (not plain or plain[-1] == ' '):
            continue
        if f:
            plain.append(f)
            where.append(i)
    s = ''.join(plain)
    first, last = ''.join(map(B.fold, first)), ''.join(map(B.fold, last))
    a = s.find(first)
    assert a >= 0, first
    b = s.rfind(last)
    assert b >= a, last
    end = where[b + len(last) - 1] + 1
    while end < len(text) and B.fold(text[end]) == '' and text[end] not in ' "‏':
        end += 1
    part = text[where[a]:end].replace('‏', '').replace('"', '')
    return re.sub(r'\s+', ' ', part).strip(' ،.')


def cut_en(text, first, last):
    a = text.find(first)
    assert a >= 0, first
    b = text.rfind(last)
    assert b >= a, last
    return re.sub(r'\s+', ' ', text[a:b + len(last)]).strip(' "\'')


def main():
    cache = {}

    def book(lang, name):
        k = f'{lang}-{name}'
        if k not in cache:
            cache[k] = B.get(B.API.format(k))
        return cache[k]

    steps = []
    for sid, title_ar, title_en, refs in STEPS:
        items = []
        for b, num, a1, a2, e1, e2 in refs:
            ara = [h for h in book('ara', b) if str(h.get('arabicnumber', h['hadithnumber'])).split('.')[0] == num]
            eng = {h['hadithnumber']: h for h in book('eng', b)}
            found = None
            for h in ara:
                try:
                    e = eng[h['hadithnumber']]
                    found = (cut_ar(h['text'], a1, a2), cut_en(e['text'], e1, e2), e.get('grades') or [])
                    break
                except AssertionError:
                    continue
            assert found, (sid, b, num)
            ar, en, grades = found
            name_ar, name_en = B.BOOKS[b]
            ref_ar, ref_en = f'{name_ar} {num.translate(B.AR_DIGITS)}', f'{name_en} {num}'
            if b not in ('bukhari', 'muslim'):
                g = next((x['grade'] for x in grades if 'Albani' in x['name']), None)
                assert g in B.GRADE_AR, (sid, g)
                ref_ar += f'، {B.GRADE_AR[g]}'
                ref_en += f', graded {g.lower()} by al-Albani'
            items.append({'ar': ar, 'en': en, 'refAr': ref_ar, 'refEn': ref_en})
        steps.append({'id': sid, 'ar': title_ar, 'en': title_en, 'hadith': items})
        print(sid, '|', items[0]['ar'][:60], '|', items[0]['en'][:40])
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Generated by tools/build_salah.py from the hadith collections. Do not edit by hand.\n')
        f.write('window.NOON_SALAH = ')
        json.dump({'steps': steps, 'book': {'ar': 'صفة صلاة النبي ﷺ من التكبير إلى التسليم كأنك تراها — الشيخ محمد ناصر الدين الألباني',
                                            'en': 'The Prophet’s Prayer Described — Shaykh Muhammad Nasir ad-Din al-Albani',
                                            'url': 'https://shamela.ws/book/657', 'full': 'https://shamela.ws/book/9875'}},
                  f, ensure_ascii=False, indent=1)
        f.write(';\n')


if __name__ == '__main__':
    main()
