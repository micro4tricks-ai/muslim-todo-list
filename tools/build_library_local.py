"""Build the library's full books from the user's Shamela 4 copy (Lucene text, read through JPype).

For every book in tools/library_local.json:
  books/<slug>/index.json.gz : title, author, edition, the table of contents and which file holds each heading
  books/<slug>/<k>.json.gz   : the text, page by page: [page id, volume, printed page, [paragraph | [toc id, heading]]]
and for the hadith books listed under "hadith" (the whole Musnad of Ahmad, al-Risalah edition):
  books/<slug>/h<k>.json.gz  : one section: [[hadith number, text], ...]
plus js/library-books.js (the shelves and books) and js/library-local.js (the hadith books' sections).

Only the author's text is taken: the editor's footnotes (the "foot" field) and their references in
the text, and the editor's introductions, manuscript descriptions and indexes (top-level headings
matched by EDITORIAL) are left out. Nothing is typed by hand; the text is the source's, with markup
removed. Files are gzipped (fixed timestamp, so a rebuild of the same text gives the same bytes).

Needs: Shamela 4 at SHAMELA (default C:\\Users\\Mahmoud Lab\\Pictures\\shamela4) and the JPype package.
Run:  python tools/build_library_local.py [slug ...]
"""
import glob
import gzip
import hashlib
import json
import os
import re
import sqlite3
import sys
import unicodedata
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHAMELA = os.environ.get('SHAMELA', r'C:\Users\Mahmoud Lab\Pictures\shamela4')
DB = os.path.join(SHAMELA, 'database')
OUT = os.path.join(ROOT, 'books')
CHUNK = 300_000  # characters per text file, give or take a chapter

EDITORIAL = re.compile(
    r'^[\s\[(]*(مقدمات|تقديم|تصدير|مقدمة (التحقيق|المحقق|المحققين|الناشر|الطبعة|الطبع|المعتني|المراجع|الدار|سماحة|فضيلة|الأستاذ|الدكتور)|كلمة (الناشر|المحقق|الدار)|'
    r'(ال)?تعريف بال(مؤلف|مصنف|ناظم|كتاب|شارح)|المؤلف والكتاب|'
    r'بين يدي|ترجمة (المؤلف|المصنف|الناظم|الشارح)|منهج (التحقيق|العمل|عملنا|عملي)|عمل(ي|نا) في|'
    r'وصف (النسخ|المخطوط|النسخة)|النسخ (المعتمدة|الخطية|المخطوطة)|نماذج (من|المخطوط)|صور (من )?(المخطوط|النسخ)|قسم الدراسة|الدراسة|'
    r'فهرس|الفهارس|المصادر والمراجع|ثبت المصادر|مصادر التحقيق)')
TITLE = re.compile(r"""<span data-type=['"]title['"]([^>]*)>(.*?)</span>""", re.S)
TOC_ID = re.compile(r'toc-(\d+)')
FOOTREF = re.compile(r'\s?\(¬?([٠-٩]{1,3})\)')  # the editor's footnote marks, (١) or (¬١)
# A volume or "introductions" heading only groups others: the headings under it count as top-level.
CONTAINER = re.compile(r'^[\s\[(]*((المجلد|الجزء|السفر|المجلدة)\s|المقدمات)')
TAG = re.compile(r'<[^>]+>')
GLUED_NOTES = re.compile(r'(^|\r)[١-٩][٠-٩]?\s')
GLUED = re.compile(r'(?<=[ء-يً-ْ.\])])[١-٩][٠-٩]?(?=[\s.,،:؛)\]»"]|$)')


# ---- reading Shamela ----
_lucene = {}


def lucene_docs(store, book):
    """{page or title id: {field: text}} for one book in a Lucene store (page, title)."""
    import jpype
    if not jpype.isJVMStarted():
        jre = os.path.join(SHAMELA, 'app', 'win', '64', 'jre', '2')
        os.add_dll_directory(os.path.join(jre, 'bin'))
        jpype.startJVM(os.path.join(jre, 'bin', 'server', 'jvm.dll'), '-Xmx2g',
                       classpath=glob.glob(os.path.join(SHAMELA, 'app', 'lucene', '2', '*.jar')))
    J = jpype.JClass
    if store not in _lucene:
        reader = J('org.apache.lucene.index.DirectoryReader').open(
            J('org.apache.lucene.store.FSDirectory').open(J('java.nio.file.Paths').get(os.path.join(DB, 'store', store))))
        _lucene[store] = (reader, J('org.apache.lucene.search.IndexSearcher')(reader))
    reader, searcher = _lucene[store]
    query = J('org.apache.lucene.search.PrefixQuery')(J('org.apache.lucene.index.Term')('id', f'{book}-'))
    fields = reader.storedFields()
    out = {}
    for hit in searcher.search(query, 50_000_000).scoreDocs:
        d = fields.document(hit.doc)
        f = {x.name(): str(x.stringValue()) for x in d.getFields() if x.stringValue() is not None}
        out[int(f['id'].split('-', 1)[1])] = f
    return out


def master():
    return sqlite3.connect(f'file:{os.path.join(DB, "master.db")}?mode=ro', uri=True)


def book_db(book):
    return sqlite3.connect(f'file:{os.path.join(DB, "book", "%03d" % (book % 1000), f"{book}.db")}?mode=ro', uri=True)


def meta(book):
    m = master()
    name, meta_data, author, death = m.execute(
        'select b.book_name, b.meta_data, a.author_name, a.death_number from book b join author a on a.author_id = b.main_author where b.book_id = ?',
        (book,)).fetchone()
    md = json.loads(meta_data or '{}')
    # "Title - edition" in the catalogue name; its own prefix field is sometimes a short form in quotes.
    title, _, edition = name.partition(' - ')
    return {'name': name, 'title': title.strip(), 'edition': (edition or md.get('suffix') or '').strip(), 'author': author, 'death': death}


def toc(book):
    """[(toc id, first page id, depth, text)] in book order."""
    rows = book_db(book).execute('select id, page, parent from title order by id').fetchall()
    text = lucene_docs('title', book)
    depth, out = {}, []
    for tid, page, parent in rows:
        depth[tid] = depth.get(parent, -1) + 1 if parent else 0
        out.append((tid, page, depth[tid], clean_line(text.get(tid, {}).get('body', ''))))
    return out


def clean_line(t):
    t = TAG.sub('', t).replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"').replace('&amp;', '&')
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', t)).strip()


def page_items(body, foot):
    """The page as paragraphs and [toc id, heading] items, without the marks of the editor's footnotes."""
    items, pos = [], 0
    if foot.strip():
        body = FOOTREF.sub('', body)
        # Some editions number their notes "1 ..." and glue the digit to the word ("بعد١").
        if GLUED_NOTES.search(foot):
            body = GLUED.sub('', body)
    for m in TITLE.finditer(body):
        items += [x for x in (clean_line(l) for l in body[pos:m.start()].split('\r')) if x]
        head = clean_line(m.group(2).replace('\r', ' '))
        if head:
            tid = TOC_ID.search(m.group(1))
            items.append([int(tid.group(1)) if tid else 0, head])
        pos = m.end()
    items += [x for x in (clean_line(l) for l in body[pos:].split('\r')) if x]
    return items


def kept_pages(book, skip=()):
    """The author's pages: [(page id, volume, printed page, items)], and the toc entries on them.
    skip: headings (any level) whose pages are the editor's though their title does not say so."""
    rows = book_db(book).execute('select id, part, page from page order by id').fetchall()
    text = lucene_docs('page', book)
    entries = toc(book)
    tops, in_box, box_page = [], False, None
    for e in entries:
        if e[2] == 0:
            in_box = bool(CONTAINER.match(e[3]))
            box_page = e[1] if in_box else None
            if not in_box:
                tops.append(e)
        elif e[2] == 1 and in_box:
            # The first heading in a volume also covers the volume's own first pages (often the author's opening).
            tops.append((e[0], min(e[1], box_page), e[2], e[3]) if box_page is not None else e)
            box_page = None
    # Each top-level heading covers the pages up to the next one; editorial ones are dropped.
    drop = set()
    bare = lambda t: re.sub(r'[\[\]():]', '', t).strip()
    for k, e in enumerate(entries):
        if bare(e[3]) in skip:
            end = next((x[1] for x in entries[k + 1:] if x[2] <= e[2]), float('inf'))
            drop.update(p for p, _, _ in rows if e[1] <= p < end)
    first_kept = None
    for k, (tid, page, depth, t) in enumerate(tops):
        end = tops[k + 1][1] if k + 1 < len(tops) else float('inf')
        if EDITORIAL.match(t) or bare(t) in skip:
            drop.update(p for p, _, _ in rows if page <= p < end)
        elif first_kept is None and not all(p in drop for p, _, _ in rows if page <= p < end):
            first_kept = page
    pages = []
    for pid, part, printed in rows:
        if pid in drop or (first_kept is not None and pid < first_kept):
            continue
        d = text.get(pid, {})
        body = d.get('body', '')
        if body.lstrip().startswith('الكتاب:') and pid == rows[0][0]:
            continue  # Shamela's card about the book
        items = page_items(body, d.get('foot', ''))
        if items:
            pages.append((pid, part or '', printed or 0, items))
    kept = {p[0] for p in pages}
    entries = [e for e in entries if e[1] in kept and e[3]]
    return pages, entries


def gz_dump(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with open(path, 'wb') as f:
        f.write(gzip.compress(raw, 9, mtime=0))
    return os.path.getsize(path)


# ---- a book to read, page by page ----
def build_book(b, cats):
    info = meta(b['id'])
    pages, entries = kept_pages(b['id'], set(b.get('skip', [])))
    assert pages, f"{b['slug']}: no pages left"
    depth_of = {e[0]: e[2] for e in entries}
    out = os.path.join(OUT, b['slug'])
    for f in glob.glob(os.path.join(out, '*.json.gz')):
        os.remove(f)
    files, cur, size, where, total = [], [], 0, {}, 0
    for pg in pages:
        heads = [x[0] for x in pg[3] if isinstance(x, list)]
        at_chapter = any(depth_of.get(h, 9) <= 1 for h in heads)
        if cur and (size > CHUNK and at_chapter or size > 2 * CHUNK):
            files.append(cur)
            cur, size = [], 0
        cur.append(list(pg))
        size += sum(len(x if isinstance(x, str) else x[1]) for x in pg[3])
        for h in heads:
            where.setdefault(h, len(files))
    if cur:
        files.append(cur)
    for k, chunk in enumerate(files):
        total += gz_dump(os.path.join(out, f'{k}.json.gz'), chunk)
    # Headings: [toc id, depth, text, file]; the page each starts on decides its file when the body has no marker.
    first_file = {}
    for k, chunk in enumerate(files):
        for pg in chunk:
            first_file.setdefault(pg[0], k)
    page_ids = [pg[0] for pg in pages]
    def file_of(e):
        if e[0] in where:
            return where[e[0]]
        later = [p for p in page_ids if p >= e[1]]
        return first_file[later[0]] if later else len(files) - 1
    toc_out = [[e[0], e[2], e[3], file_of(e)] for e in entries]
    index = {'v': 1, 'slug': b['slug'], 'ar': info['title'], 'en': b['en'], 'edition': info['edition'],
             'author': info['author'], 'authorEn': b['authorEn'], 'death': info['death'], 'cat': b['cat'],
             'shamela': b['id'], 'files': len(files), 'pages': len(pages), 'toc': toc_out}
    total += gz_dump(os.path.join(out, 'index.json.gz'), index)
    chars = sum(sum(len(x if isinstance(x, str) else x[1]) for x in pg[3]) for pg in pages)
    print(f"{b['slug']}: {len(pages)} pages, {len(files)} files, {len(toc_out)} headings, {chars / 1e6:.1f}M chars, {total / 1e6:.1f} MB", flush=True)
    return {'slug': b['slug'], 'ar': info['title'], 'en': b['en'], 'author': info['author'], 'authorEn': b['authorEn'],
            'death': info['death'], 'edition': info['edition'], 'cat': b['cat'], 'files': len(files), 'pages': len(pages),
            'size': total}


# ---- a hadith book, by section and hadith number ----
HADITH = re.compile(r'^(?:[*•°"\s]|\([*•°]\))*([٠-٩]+)(?:\s*(?:و|-)\s*[٠-٩]+)?\s*[-–]\s*(.+)$')  # *, •, ° (also in brackets): the edition's marks for Abdullah's additions and what he found in his father's book; "12 و 13 -" / "12 - 13 -": one text under two numbers
AR_DIGITS = str.maketrans('٠١٢٣٤٥٦٧٨٩', '0123456789')


def norm(t):
    t = re.sub(r'[\u064B-\u0652\u0670\u0640]', '', t)
    t = re.sub(r'[أإآٱ]', 'ا', t).replace('ى', 'ي').replace('ة', 'ه')
    return re.sub(r'[^\u0621-\u064A]', '', t)


def build_hadith(h):
    pages, entries = kept_pages(h['id'])
    depth_of = {e[0]: e[2] for e in entries}
    sections, cur, last, open_ = [], None, 0, False
    for pg in pages:
        for x in pg[3]:
            if isinstance(x, list):
                if depth_of.get(x[0], 9) <= h['secDepth']:
                    cur = {'title': x[1], 'items': []}
                    sections.append(cur)
                continue
            m = HADITH.match(x)
            n = int(m.group(1).translate(AR_DIGITS)) if m else 0
            if m and cur is not None and last < n <= last + 300:
                cur['items'].append([n, m.group(2)])
                last, open_ = n, True
            elif m:
                open_ = False  # a numbered list that is not the hadith count (the edition's notes): skipped, with what follows it
            elif cur is not None and cur['items'] and open_:
                cur['items'][-1][1] += '\n' + x  # a further chain or a note of the same hadith
    sections = [s for s in sections if s['items']]
    out = os.path.join(OUT, h['slug'])
    for f in glob.glob(os.path.join(out, 'h*.json.gz')):
        os.remove(f)
    total, secs, numbers = 0, [], []
    for k, s in enumerate(sections):
        total += gz_dump(os.path.join(out, f'h{k + 1}.json.gz'), s['items'])
        ns = [n for n, _ in s['items']]
        numbers += ns
        secs.append([str(k + 1), s['title'], '', min(ns), max(ns), str(min(ns)), str(max(ns))])
    gaps = sum(1 for a, b in zip(numbers, numbers[1:]) if b != a + 1)
    print(f"{h['slug']}: {len(sections)} sections, {len(numbers)} hadiths (from {numbers[0]} to {numbers[-1]}, {gaps} breaks in the order), {total / 1e6:.1f} MB", flush=True)
    info = meta(h['id'])
    entry = {'slug': h['slug'], 'count': len(numbers), 'sections': secs, 'edition': info['edition'], 'shamela': h['id']}
    if h['book'] == 'ahmad':
        entry['migrate'] = migrate_ahmad([it for s in sections for it in s['items']])
    return entry


def migrate_ahmad(items):
    """[old number, new number] for the hadiths of the partial Musnad (hadith-json) whose number changes."""
    url = 'https://cdn.jsdelivr.net/gh/AhmedBaset/hadith-json@main/db/by_book/the_9_books/ahmed.json'
    req = urllib.request.Request(url, headers={'User-Agent': 'muslim-todo-list-builder'})
    with urllib.request.urlopen(req, timeout=300) as r:
        old = json.loads(r.read().decode('utf-8'))['hadiths']
    # The al-Risalah text starts each hadith with the chain from Abdullah ibn Ahmad, so a piece from
    # inside the old text is looked for near the start of each new one, in order.
    keys = [(n, norm(t)[:600]) for n, t in items]
    pairs, missing, k = [], 0, 0
    for h in old:
        o = norm(h['arabic'])
        probes = [o[i:i + 36] for i in (8, 30, 60) if len(o) >= i + 36] or [o]
        found = None
        for j in range(max(0, k - 20), min(len(keys), k + 300)):
            if any(p in keys[j][1] for p in probes):
                found = j
                break
        if found is None:
            # Not found (the two texts differ too much): moved by the same amount as the one before it.
            missing += 1
            shift = pairs[-1][1] - pairs[-1][0] if pairs else 0
            if shift:
                pairs.append([h['idInBook'], h['idInBook'] + shift])
            continue
        k = found + 1
        if keys[found][0] != h['idInBook']:
            pairs.append([h['idInBook'], keys[found][0]])
    print(f'  Musnad bookmarks: {len(old) - missing} of {len(old)} matched, {len(pairs)} renumbered', flush=True)
    return pairs


def stamp(slug, pattern='*.json.gz'):
    """A short fingerprint of a book's files: the page asks for ?v=<it>, so a rebuilt book is fetched anew."""
    h = hashlib.sha1()
    for f in sorted(glob.glob(os.path.join(OUT, slug, pattern))):
        h.update(os.path.basename(f).encode())
        h.update(open(f, 'rb').read())
    return h.hexdigest()[:8]


def read_js(path):
    src = open(path, encoding='utf-8').read()
    return json.loads(src[src.index('{'):src.rindex('}') + 1])


def write_js(path, name, data, note=''):
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Generated by tools/build_library_local.py from Shamela. Do not edit by hand.\n' + note)
        f.write(f'window.{name} = ')
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')


def main():
    cfg = json.load(open(os.path.join(ROOT, 'tools', 'library_local.json'), encoding='utf-8'))
    if sys.argv[1:] == ['--stamp']:  # only fingerprint what is already built
        for path, name in ((os.path.join(ROOT, 'js', 'library-books.js'), 'NOON_BOOKS'), (os.path.join(ROOT, 'js', 'library-local.js'), 'NOON_LIBRARY_LOCAL')):
            data = read_js(path)
            if name == 'NOON_BOOKS':
                for b in data['books']:
                    b['v'] = stamp(b['slug'])
                write_js(path, name, data)
            else:
                for e in data.values():
                    e['v'] = stamp(e['slug'], 'h*.json.gz')
                write_js(path, name, data, '// sections: [id, Arabic title, English title, first, last (hadith numbers), first, last]\n')
        print('stamped')
        return
    only = set(sys.argv[1:])
    books, done = [], {}
    cat_file = os.path.join(ROOT, 'js', 'library-books.js')
    if only and os.path.exists(cat_file):  # rebuilding a few: keep the others' entries
        src = open(cat_file, encoding='utf-8').read()
        done = {x['slug']: x for x in json.loads(src[src.index('{'):src.rindex('}') + 1])['books']}
    for b in cfg['books']:
        if only and b['slug'] not in only:
            if b['slug'] in done:
                books.append(done[b['slug']])
            continue
        books.append(build_book(b, cfg['cats']))
        books[-1]['v'] = stamp(b['slug'])
    with open(cat_file, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Generated by tools/build_library_local.py from Shamela. Do not edit by hand.\n')
        f.write('window.NOON_BOOKS = ')
        json.dump({'cats': cfg['cats'], 'books': books}, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    if not only or any(h['slug'] in only for h in cfg['hadith']):
        local = {h['book']: build_hadith(h) for h in cfg['hadith']}
        for h in cfg['hadith']:
            local[h['book']]['v'] = stamp(h['slug'], 'h*.json.gz')
        with open(os.path.join(ROOT, 'js', 'library-local.js'), 'w', encoding='utf-8', newline='\n') as f:
            f.write('// Generated by tools/build_library_local.py from Shamela. Do not edit by hand.\n')
            f.write('// sections: [id, Arabic title, English title, first, last (hadith numbers), first, last]\n')
            f.write('window.NOON_LIBRARY_LOCAL = ')
            json.dump(local, f, ensure_ascii=False, separators=(',', ':'))
            f.write(';\n')
    print('books:', len(books), 'MB:', round(sum(b['size'] for b in books) / 1e6, 1))


if __name__ == '__main__':
    main()
