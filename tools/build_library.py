"""Build js/library-meta.js: the index of the hadith library (the six books and al-Muwatta).

The hadith texts themselves are not stored here: the page reads each book section on demand
from github.com/fawazahmed0/hadith-api (via jsDelivr), Arabic with the English translation
and the gradings (al-Albani, Shu'ayb al-Arna'ut, Ahmad Shakir, Bashar Awwad, Zubair Ali Zai...).
This script records, for every book, its sections with their hadith ranges, and the Arabic
section titles from github.com/AhmedBaset/hadith-json (matched by their English titles).

Run:  python tools/build_library.py
"""
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'js', 'library-meta.js')
BOOKS = [
    ('bukhari', 'صحيح البخاري', 'Sahih al-Bukhari', 'الإمام محمد بن إسماعيل البخاري', 'Imam Muhammad ibn Isma‘il al-Bukhari'),
    ('muslim', 'صحيح مسلم', 'Sahih Muslim', 'الإمام مسلم بن الحجاج النيسابوري', 'Imam Muslim ibn al-Hajjaj'),
    ('abudawud', 'سنن أبي داود', 'Sunan Abi Dawud', 'الإمام أبو داود السجستاني', 'Imam Abu Dawud al-Sijistani'),
    ('tirmidhi', 'جامع الترمذي', 'Jami‘ at-Tirmidhi', 'الإمام محمد بن عيسى الترمذي', 'Imam Muhammad ibn ‘Isa at-Tirmidhi'),
    ('nasai', 'سنن النسائي', 'Sunan an-Nasa’i', 'الإمام أحمد بن شعيب النسائي', 'Imam Ahmad ibn Shu‘ayb an-Nasa’i'),
    ('ibnmajah', 'سنن ابن ماجه', 'Sunan Ibn Majah', 'الإمام محمد بن يزيد ابن ماجه', 'Imam Muhammad ibn Yazid Ibn Majah'),
    ('malik', 'موطأ مالك', 'Muwatta Malik', 'الإمام مالك بن أنس', 'Imam Malik ibn Anas'),
]
# More books from github.com/AhmedBaset/hadith-json (read whole, by chapter; no gradings in the data).
EXTRA = [
    ('nawawi40', 'forties/nawawi40', 'الأربعون النووية', 'An-Nawawi’s Forty', 'الإمام يحيى بن شرف النووي', 'Imam an-Nawawi'),
    ('qudsi40', 'forties/qudsi40', 'الأربعون القدسية', 'Forty Hadith Qudsi', 'مختارة', 'A selection'),
    ('riyad', 'other_books/riyad_assalihin', 'رياض الصالحين', 'Riyad as-Salihin', 'الإمام يحيى بن شرف النووي', 'Imam an-Nawawi'),
    ('bulugh', 'other_books/bulugh_almaram', 'بلوغ المرام من أدلة الأحكام', 'Bulugh al-Maram', 'الحافظ ابن حجر العسقلاني', 'Ibn Hajar al-‘Asqalani'),
    ('adab', 'other_books/aladab_almufrad', 'الأدب المفرد', 'Al-Adab al-Mufrad', 'الإمام البخاري', 'Imam al-Bukhari'),
    ('shamail', 'other_books/shamail_muhammadiyah', 'الشمائل المحمدية', 'Ash-Shama’il al-Muhammadiyah', 'الإمام الترمذي', 'Imam at-Tirmidhi'),
    ('mishkat', 'other_books/mishkat_almasabih', 'مشكاة المصابيح', 'Mishkat al-Masabih', 'الخطيب التبريزي', 'Al-Khatib at-Tabrizi'),
]
AB = 'https://cdn.jsdelivr.net/gh/AhmedBaset/hadith-json@main/db/by_book/{}.json'


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'muslim-todo-list-builder'})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode('utf-8'))


def key(s):
    return re.sub(r'[^a-z]', '', s.lower())


def main():
    info = get('https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/info.min.json')
    books = []
    for bid, ar, en, author_ar, author_en in BOOKS:
        meta = info[bid]['metadata']
        chapters = get(f'https://raw.githubusercontent.com/AhmedBaset/hadith-json/main/db/by_book/the_9_books/{bid}.json')['chapters']
        arabic = {key(c['english']): c['arabic'].strip() for c in chapters}
        sections, missing = [], 0
        for k in sorted((k for k, v in meta['sections'].items() if v), key=float):
            d = meta['section_details'][k]
            title_en = meta['sections'][k].strip()
            title_ar = arabic.get(key(title_en))
            if not title_ar:
                missing += 1
            sections.append([k, title_ar or '', title_en, d['hadithnumber_first'], d['hadithnumber_last'],
                             str(d['arabicnumber_first']), str(d['arabicnumber_last'])])
        total = int(meta['last_hadithnumber'])
        print(bid, len(sections), 'sections,', total, 'hadiths, without an Arabic title:', missing)
        books.append({'id': bid, 'ar': ar, 'en': en, 'authorAr': author_ar, 'authorEn': author_en, 'count': total, 'sections': sections})
    for bid, path, ar, en, author_ar, author_en in EXTRA:
        d = get(AB.format(path))
        ranges = {}
        for h in d['hadiths']:
            r = ranges.setdefault(h['chapterId'], [h['idInBook'], h['idInBook']])
            r[0], r[1] = min(r[0], h['idInBook']), max(r[1], h['idInBook'])
        sections = [[str(c['id']), c['arabic'].replace('ـ', '').strip(), c['english'].strip(), ranges[c['id']][0], ranges[c['id']][1],
                     str(ranges[c['id']][0]), str(ranges[c['id']][1])] for c in d['chapters'] if c['id'] in ranges]
        print(bid, len(sections), 'sections,', len(d['hadiths']), 'hadiths')
        books.append({'id': bid, 'ar': ar, 'en': en, 'authorAr': author_ar, 'authorEn': author_en, 'count': len(d['hadiths']),
                      'sections': sections, 'src': 'ab', 'path': path})
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Generated by tools/build_library.py. Do not edit by hand.\n')
        f.write('// sections: [id, Arabic title, English title, first, last (hadith numbers), first, last (standard numbering)]\n')
        f.write('window.NOON_LIBRARY = ')
        json.dump({'books': books}, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')


if __name__ == '__main__':
    main()
