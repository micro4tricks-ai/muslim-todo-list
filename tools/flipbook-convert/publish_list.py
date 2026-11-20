"""Copy the translated Mushafs' list and covers into the site's mushafs/ folder.

    python tools/flipbook-convert/publish_list.py <converted folder> --pages <address of the pages>

The converted folder is convert.py's output. Only index.json and each book's cover.webp go into
the repository (and so into the website and the Android app); the pages themselves are uploaded
to the host given by --pages, laid out the same way: <pages>/<book id>/p0001.webp ...
The address is written into mushafs/index.json, so moving the pages needs no new app:
change it here and publish the website.
"""
import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('--pages', default='', help='where the pages are hosted (empty: not online yet)')
    ap.add_argument('--only', help='list only these book ids (comma-separated): the ones already uploaded')
    a = ap.parse_args()
    src = Path(a.src)
    idx = json.loads((src / 'index.json').read_text(encoding='utf-8'))
    out = ROOT / 'mushafs'
    out.mkdir(exist_ok=True)
    keep = set()
    if a.only:
        ids = set(a.only.split(','))
        idx['books'] = [b for b in idx['books'] if b['id'] in ids]
    for b in idx['books']:
        d = out / b['id']
        d.mkdir(exist_ok=True)
        shutil.copyfile(src / b['id'] / 'cover.webp', d / 'cover.webp')
        keep.add(b['id'])
    # books no longer in the list
    for d in out.iterdir():
        if d.is_dir() and d.name not in keep:
            shutil.rmtree(d)
    pages = a.pages
    if pages and not pages.endswith('/'):
        pages += '/'
    data = {'version': 1, 'pages': pages, 'books': idx['books']}
    (out / 'index.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    size = sum(f.stat().st_size for f in out.rglob('*') if f.is_file())
    print(f'mushafs/: {len(keep)} books, {size / 1024:.0f} KB, pages at {pages or "(not online yet)"}')


if __name__ == '__main__':
    main()
