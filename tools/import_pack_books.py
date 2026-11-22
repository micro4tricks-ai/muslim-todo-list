"""Add books to the website's library from the desktop app's Shamela packs, without Shamela itself.

The packs (tools/build_shamela_packs.py) are on the GitHub release «shamela-library», one zip per
shelf, each book already converted the way the website reads it (the author's text only). This
reads just the chosen books out of the zips (HTTP range requests: the zips themselves, hundreds of
megabytes, are not downloaded), and for each one:
  books/<slug>/                 its index.json.gz (slug and English title set) and text files, unchanged
  tools/library_local.json      the book, so a rebuild from Shamela (build_library_local.py) keeps it
  js/library-books.js           its entry, then fingerprinted (build_library_local.py --stamp)
The text is not touched: the files are copied as the pack has them.

Run:  python tools/import_pack_books.py tools/pack_books.json
pack_books.json: [{"id": shamela id, "shelf": pack number, "slug": ..., "cat": website shelf, "en": ..., "authorEn": ...}]
"""
import gzip
import io
import json
import os
import subprocess
import sys
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RELEASE = 'https://github.com/micro4tricks-ai/muslim-todo-list/releases/download/shamela-library/'


class Remote(io.RawIOBase):
    """A file on the web, read in pieces (Range requests), for zipfile."""

    def __init__(self, url):
        req = urllib.request.Request(url, method='HEAD')
        with urllib.request.urlopen(req) as r:
            self.url = r.url  # after GitHub's redirect
            self.size = int(r.headers['Content-Length'])
        self.pos = 0

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.size - self.pos
        if n == 0 or self.pos >= self.size:
            return b''
        end = min(self.size, self.pos + n) - 1
        req = urllib.request.Request(self.url, headers={'Range': f'bytes={self.pos}-{end}'})
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    data = r.read()
                break
            except OSError:
                if attempt == 4:
                    raise
        self.pos += len(data)
        return data

    def readinto(self, b):
        data = self.read(len(b))
        b[:len(data)] = data
        return len(data)


def gz(obj):
    raw = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode='wb', mtime=0) as f:
        f.write(raw)
    return buf.getvalue()


def main():
    want = json.load(open(sys.argv[1], encoding='utf-8'))
    cfg_path = os.path.join(ROOT, 'tools', 'library_local.json')
    cfg = json.load(open(cfg_path, encoding='utf-8'))
    js_path = os.path.join(ROOT, 'js', 'library-books.js')
    src = open(js_path, encoding='utf-8').read()
    lib = json.loads(src[src.index('{'):src.rindex('}') + 1])
    have = {b['slug'] for b in lib['books']}
    shelves = {}
    for w in want:
        shelves.setdefault(w['shelf'], []).append(w)
    for shelf, books in shelves.items():
        z = zipfile.ZipFile(io.BufferedReader(Remote(f'{RELEASE}shamela-{shelf}.zip'), buffer_size=1 << 20))
        cat = {x['id']: x for x in json.loads(z.read(f'cat-{shelf}.json'))}
        for w in books:
            if w['slug'] in have:
                print('already there:', w['slug'])
                continue
            meta = cat[w['id']]
            out = os.path.join(ROOT, 'books', w['slug'])
            os.makedirs(out, exist_ok=True)
            prefix = f'books/s{w["id"]}/'
            names = [n for n in z.namelist() if n.startswith(prefix) and not n.endswith('/')]
            for n in names:
                data = z.read(n)
                base = n[len(prefix):]
                if base == 'index.json.gz':
                    idx = json.loads(gzip.decompress(data))
                    idx['slug'] = w['slug']
                    idx['en'] = w['en']
                    data = gz(idx)
                with open(os.path.join(out, base), 'wb') as f:
                    f.write(data)
            lib['books'].append({'slug': w['slug'], 'ar': meta['ar'], 'en': w['en'], 'author': meta['author'], 'authorEn': w['authorEn'],
                                 'death': meta['death'], 'edition': meta.get('edition', ''), 'cat': w['cat'], 'files': meta['files'],
                                 'pages': meta['pages'], 'size': meta['size'], 'fc': meta['fc']})
            cfg['books'].append({'id': w['id'], 'slug': w['slug'], 'cat': w['cat'], 'en': w['en'], 'authorEn': w['authorEn']})
            have.add(w['slug'])
            print(f'{w["slug"]}: {meta["ar"]} — {len(names)} files, {meta["pages"]} pages', flush=True)
    # Shelf by shelf, in the website's order.
    order = [c[0] for c in lib['cats']]
    lib['books'].sort(key=lambda b: order.index(b['cat']))
    cfg['books'].sort(key=lambda b: order.index(b['cat']))
    with open(js_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Generated by tools/build_library_local.py from Shamela. Do not edit by hand.\n')
        f.write('window.NOON_BOOKS = ')
        json.dump(lib, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    # The same layout as the file had: one shelf, one book per line.
    def line(x):
        return json.dumps(x, ensure_ascii=False)
    text = ('{\n  "note": ' + line(cfg['note']) + ',\n  "cats": [\n' + ',\n'.join('    ' + line(c) for c in cfg['cats']) + '\n  ],\n'
            '  "hadith": [\n' + ',\n'.join('    ' + line(h) for h in cfg['hadith']) + '\n  ],\n'
            '  "books": [\n' + ''.join(('' if k == 0 else ',\n\n' if b['cat'] != cfg['books'][k - 1]['cat'] else ',\n') + '    ' + line(b)
                                         for k, b in enumerate(cfg['books'])) + '\n  ]\n}\n')
    with open(cfg_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'build_library_local.py'), '--stamp'], check=True)


if __name__ == '__main__':
    main()
