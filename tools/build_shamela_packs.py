"""Build the desktop app's Shamela library: the classical books of the user's Shamela 4 copy, one pack per shelf.

Every book whose author died before 1350 AH is converted the same way as the website's books
(tools/build_library_local.py: the author's text only, without the editor's footnotes, introductions
and indexes), into OUT:
  books/s<id>/index.json.gz, books/s<id>/<k>.json.gz : the book, as the reader reads it
  cat-<c>.json        : the books of shelf c: [{id, slug, ar, author, death, edition, files, pages, size, fc}]
  packs/shamela-<c>.zip : books/s<id>/... and cat-<c>.json, for the app to download and unpack
  catalog.json        : the shelves: [{id, name, books, size}] (size: bytes of the pack)
A book already built is kept (delete its folder to build it again), so a stopped run goes on where it was.

Needs: Shamela 4 at SHAMELA (default D:\\shamela4) and the JPype package.
Run:  py -3 tools/build_shamela_packs.py [shelf id ...]     (no ids: every shelf)
"""
import glob
import json
import os
import sys
import zipfile

os.environ.setdefault('SHAMELA', r'D:\shamela4')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_library_local as B  # noqa: E402

OUT = os.environ.get('SHAMELA_OUT', r'D:\muslim-library')
DEATH = 1350  # authors who died before this year (AH)


def shelves():
    return B.master().execute('select category_id, category_name from category order by category_order').fetchall()


def books_of(cat):
    return [r[0] for r in B.master().execute(
        'select b.book_id from book b join author a on a.author_id = b.main_author '
        'where b.book_category = ? and a.death_number < ? and coalesce(b.hidden, 0) = 0 order by b.book_id', (cat, DEATH))]


def build_shelf(cat):
    B.OUT = os.path.join(OUT, 'books')
    out = []
    ids = books_of(cat)
    for n, bid in enumerate(ids, 1):
        slug = f's{bid}'
        done = os.path.join(B.OUT, slug, 'record.json')
        if os.path.exists(done):
            out.append(json.load(open(done, encoding='utf-8')))
            continue
        try:
            r = B.build_book({'id': bid, 'slug': slug, 'en': '', 'authorEn': '', 'cat': cat}, None)
        except Exception as e:  # a book with no text left, or a broken one: left out
            print(f'  [{n}/{len(ids)}] {slug} left out: {e}', flush=True)
            continue
        rec = {'id': bid, 'slug': slug, 'ar': r['ar'], 'author': r['author'], 'death': r['death'], 'edition': r['edition'],
               'files': r['files'], 'pages': r['pages'], 'size': r['size'], 'fc': r['fc']}
        json.dump(rec, open(done, 'w', encoding='utf-8'), ensure_ascii=False)
        out.append(rec)
        print(f'  [{n}/{len(ids)}]', flush=True)
    json.dump(out, open(os.path.join(OUT, f'cat-{cat}.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    return out


def pack(cat, recs):
    os.makedirs(os.path.join(OUT, 'packs'), exist_ok=True)
    path = os.path.join(OUT, 'packs', f'shamela-{cat}.zip')
    with zipfile.ZipFile(path + '.part', 'w', zipfile.ZIP_STORED) as z:  # the files are gzipped already
        z.write(os.path.join(OUT, f'cat-{cat}.json'), f'cat-{cat}.json')
        for r in recs:
            for f in sorted(glob.glob(os.path.join(OUT, 'books', r['slug'], '*.json.gz'))):
                z.write(f, f"books/{r['slug']}/{os.path.basename(f)}")
    os.replace(path + '.part', path)
    return os.path.getsize(path)


def main():
    os.makedirs(OUT, exist_ok=True)
    want = {int(x) for x in sys.argv[1:]}
    cat_path = os.path.join(OUT, 'catalog.json')
    catalog = {c['id']: c for c in json.load(open(cat_path, encoding='utf-8'))} if os.path.exists(cat_path) else {}
    for cat, name in shelves():
        if want and cat not in want:
            continue
        print(f'{cat} {name}: {len(books_of(cat))} books', flush=True)
        recs = build_shelf(cat)
        if not recs:
            continue
        size = pack(cat, recs)
        catalog[cat] = {'id': cat, 'name': name, 'books': len(recs), 'size': size}
        print(f'{cat} {name}: {len(recs)} books, {size / 1e6:.0f} MB', flush=True)
        order = [c for c, _ in shelves()]
        json.dump([catalog[c] for c in order if c in catalog], open(cat_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    titles()


def titles():
    """books/shamela-titles.json on the website: every shelf's titles, so the app lists them before a download.
    {"shelf id": [[book id, title, author, death year, pages, edition (when it has one)], ...]}"""
    out = {}
    for c, _ in shelves():
        f = os.path.join(OUT, f'cat-{c}.json')
        if os.path.exists(f):
            out[str(c)] = [[r['id'], r['ar'], r['author'], r['death'], r['pages']] + ([r['edition']] if r.get('edition') else []) for r in json.load(open(f, encoding='utf-8'))]
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'books', 'shamela-titles.json')
    json.dump(out, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{path}: {sum(len(v) for v in out.values())} titles, {os.path.getsize(path) / 1e3:.0f} KB')


if __name__ == '__main__':
    if sys.argv[1:] == ['--titles']:
        titles()
    else:
        main()
