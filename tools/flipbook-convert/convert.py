"""Turn scanned Mushaf PDFs into page images for the flip-book reader (CPU only).

    python tools/flipbook-convert/convert.py <pdf folder> <out folder> [--width 1000] [--quality 70] [--only ID] [--limit N]

For every PDF (searched recursively) it writes
    out/<book-id>/p0001.webp ...   one WebP per page, <width> px wide
    out/<book-id>/cover.webp       a small cover (first page, 300 px)
    out/<book-id>/book.json        title, language, pages, width, height, bytes
    out/<book-id>/.done            marker: the book is complete and is skipped next time
and finally out/index.json listing every finished book.

It resumes where it stopped (pages already written are kept), uses every CPU core,
and prints progress plus an estimate of the final size after the first book.
1000 px / quality 70 was measured on 2026-11-19: ~100 KB a page, sharp on a phone
(1200 px / 75 was ~135 KB a page for no visible gain).
Book ids are ASCII: the number the file name starts with, else a Latin slug of it.
"""
import argparse
import json
import os
import re
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import pymupdf
from PIL import Image

# Arabic language names in the file names -> (code, English name)
LANGS = {
    'اليونانية': ('el', 'Greek'), 'الصينية': ('zh', 'Chinese'), 'الاويغورية': ('ug', 'Uyghur'),
    'الكشميرية': ('ks', 'Kashmiri'), 'الفرنسية': ('fr', 'French'), 'اليوربا': ('yo', 'Yoruba'),
    'المقدونية': ('mk', 'Macedonian'), 'الفارسية': ('fa', 'Persian'), 'الالبانية': ('sq', 'Albanian'),
    'الاندونيسية': ('id', 'Indonesian'), 'الهوسا': ('ha', 'Hausa'), 'البشتو': ('ps', 'Pashto'),
    'الاسبانية': ('es', 'Spanish'), 'القازاقية': ('kk', 'Kazakh'), 'البنغالية': ('bn', 'Bengali'),
    'التركية': ('tr', 'Turkish'), 'السندية': ('sd', 'Sindhi'), 'الايرانونية': ('ilp', 'Iranun'),
    'الروسية': ('ru', 'Russian'), 'الصومالية': ('so', 'Somali'), 'الالمانية': ('de', 'German'),
    'الاردية': ('ur', 'Urdu'), 'Kuran_s_prevodom': ('bs', 'Bosnian'),
}

# Files whose name gives no language, checked by eye (book id -> the Arabic name in LANGS).
LANG_BY_ID = {'111726': 'التركية'}
# Files named in Latin letters: all Madinah Mushaf prints (same cover), named here from their file names.
TITLE_BY_ID = {
    'big-quran': 'مصحف المدينة النبوية — الحجم الكبير',
    'mumtaz-1': 'مصحف المدينة النبوية — الطبعة الممتازة',
    'sousi-1': 'مصحف المدينة النبوية — رواية السوسي',
    'standard1-quran': 'مصحف المدينة النبوية — الطبعة العادية',
    'mshf-almdynh-alnbwyh-alkbyr-alazrq-hfs': 'مصحف المدينة النبوية الكبير (الأزرق) — رواية حفص',
    # The Complex's digital Mushaf (vector pages, joined by join_pages.py from D:\القرآن الكريم\القرآن مايكرو).
    'madinah-hafs-1441': 'مصحف المدينة النبوية الرقمي — رواية حفص (1441هـ)',
    'madinah-qalun-1443': 'مصحف المدينة النبوية الرقمي — رواية قالون (1443هـ)',
}
# Books left out of the list because a better copy replaced them (id -> the one that replaced it).
REPLACED = {'mshf-qalwn': 'madinah-qalun-1443'}

TRANSLIT = str.maketrans({
    'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
    'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z',
    'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w',
    'ي': 'y', 'ى': 'a', 'ة': 'h', 'ء': '', 'ئ': 'y', 'ؤ': 'w',
})


def book_id(pdf: Path) -> str:
    m = re.match(r'(\d+)', pdf.stem)
    if m:
        return m.group(1)
    slug = re.sub(r'[^a-z0-9]+', '-', pdf.stem.lower().translate(TRANSLIT)).strip('-')
    return slug[:60] or 'book'


def describe(pdf: Path):
    """(title, (code, English name), Arabic name of the language) from the file name."""
    stem = pdf.stem
    lang, lang_ar = ('ar', 'Arabic'), 'العربية'
    key = LANG_BY_ID.get(book_id(pdf)) or next((k for k in LANGS if k in stem), None)
    if key:
        lang = LANGS[key]
        lang_ar = 'البوسنية' if key.startswith('Kuran') else key
    title = re.sub(r'^\d+\s*[-_]?\s*', '', stem).replace('_', ' ').strip()
    title = re.sub(r'\s*=.*$', '', title).strip() or stem
    title = TITLE_BY_ID.get(book_id(pdf), title)
    return title, lang, lang_ar


def describe_into(meta: dict):
    """Refresh the title and language of a book from its source file name (LANG_BY_ID may have changed)."""
    title, (code, lang_en), lang_ar = describe(Path(meta['source']))
    meta.update(title=title, lang=code, langName=lang_en, langAr=lang_ar)
    return meta


def render_pages(pdf: str, out: str, pages: list, width: int, quality: int):
    """Worker: render the given 0-based pages, return (page, bytes, w, h) for each."""
    doc = pymupdf.open(pdf)
    res = []
    for i in pages:
        dst = os.path.join(out, f'p{i + 1:04d}.webp')
        if os.path.exists(dst) and os.path.getsize(dst) > 0:
            with Image.open(dst) as im:
                res.append((i, os.path.getsize(dst), im.width, im.height))
            continue
        page = doc[i]
        zoom = width / page.rect.width
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), colorspace=pymupdf.csRGB, alpha=False)
        im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        tmp = dst + '.part'
        im.save(tmp, 'WEBP', quality=quality, method=4)
        os.replace(tmp, dst)
        res.append((i, os.path.getsize(dst), im.width, im.height))
    doc.close()
    return res


def convert_book(pdf: Path, root: Path, width: int, quality: int, pool, workers: int):
    bid = book_id(pdf)
    out = root / bid
    out.mkdir(parents=True, exist_ok=True)
    meta_path = out / 'book.json'
    if (out / '.done').exists() and meta_path.exists():
        return json.loads(meta_path.read_text(encoding='utf-8')), True
    doc = pymupdf.open(str(pdf))
    n = doc.page_count
    # cover
    cover = out / 'cover.webp'
    if not cover.exists():
        p = doc[0]
        z = 300 / p.rect.width
        pix = p.get_pixmap(matrix=pymupdf.Matrix(z, z), colorspace=pymupdf.csRGB, alpha=False)
        Image.frombytes('RGB', (pix.width, pix.height), pix.samples).save(cover, 'WEBP', quality=70)
    doc.close()
    chunk = max(4, n // (workers * 4))
    jobs = [list(range(s, min(n, s + chunk))) for s in range(0, n, chunk)]
    futs = [pool.submit(render_pages, str(pdf), str(out), j, width, quality) for j in jobs]
    sizes = {}
    dims = {}
    done = 0
    t0 = time.time()
    for f in as_completed(futs):
        for i, b, w, h in f.result():
            sizes[i] = b
            dims[(w, h)] = dims.get((w, h), 0) + 1
            done += 1
        print(f'\r  {bid}: {done}/{n} pages, {sum(sizes.values()) / 2**20:.0f} MB, {time.time() - t0:.0f}s', end='', flush=True)
    print()
    (w, h), _ = max(dims.items(), key=lambda kv: kv[1])
    meta = describe_into({
        'id': bid, 'pages': n,
        'width': w, 'height': h, 'bytes': sum(sizes.values()) + cover.stat().st_size,
        'source': pdf.name,
    })
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding='utf-8')
    (out / '.done').write_text('ok', encoding='utf-8')
    return meta, False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--width', type=int, default=1000)
    ap.add_argument('--quality', type=int, default=70)
    ap.add_argument('--only', help='convert only this book id')
    ap.add_argument('--limit', type=int, help='stop after this many new books')
    ap.add_argument('--workers', type=int, default=os.cpu_count() or 2)
    a = ap.parse_args()
    src, root = Path(a.src), Path(a.out)
    root.mkdir(parents=True, exist_ok=True)
    # ~$name / ~~$name: lock files left by a program that has the PDF open
    pdfs = sorted((p for p in src.rglob('*.pdf') if not p.name.startswith('~')), key=lambda p: book_id(p))
    ids = {}
    for p in pdfs:
        b = book_id(p)
        if b in ids:
            sys.exit(f'two files give the id {b}: {ids[b].name} / {p.name}')
        ids[b] = p
    if a.only:
        pdfs = [p for p in pdfs if book_id(p) == a.only]
    print(f'{len(pdfs)} PDFs, {sum(p.stat().st_size for p in pdfs) / 2**30:.1f} GB, {a.workers} workers')
    total_src = sum(p.stat().st_size for p in pdfs)
    books, new, src_done, out_done = [], 0, 0, 0
    with ProcessPoolExecutor(a.workers) as pool:
        for p in pdfs:
            if a.limit is not None and new >= a.limit:
                break
            meta, skipped = convert_book(p, root, a.width, a.quality, pool, a.workers)
            books.append(meta)
            src_done += p.stat().st_size
            out_done += meta['bytes']
            if not skipped:
                new += 1
                est = out_done / src_done * total_src
                print(f'  -> {meta["pages"]} pages, {meta["bytes"] / 2**20:.0f} MB, '
                      f'{meta["bytes"] / meta["pages"] / 1024:.0f} KB/page; estimate for all: {est / 2**30:.1f} GB')
    # index of every finished book in the out folder (also ones converted in earlier runs)
    index = []
    for d in sorted(root.iterdir()):
        j = d / 'book.json'
        if (d / '.done').exists() and j.exists() and d.name not in REPLACED:
            m = describe_into(json.loads(j.read_text(encoding='utf-8')))
            j.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding='utf-8')
            m.pop('source', None)
            index.append(m)
    (root / 'index.json').write_text(json.dumps({'version': 1, 'books': index}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'index.json: {len(index)} books, {sum(b["bytes"] for b in index) / 2**30:.2f} GB')


if __name__ == '__main__':
    main()
