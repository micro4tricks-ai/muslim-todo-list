"""Join a Mushaf kept as one file per page into a single PDF, so convert.py can take it.

    python tools/flipbook-convert/join_pages.py <folder or .zip> <out.pdf>

For the King Fahd Complex digital Mushaf files (Adobe Illustrator .ai, which are PDF inside):
001___Hafs39__DM.ai ... 604___Hafs39__DM.ai. Pages are taken in file-name order and copied as they
are (vector, nothing changed). The source folder is only read.
"""
import re
import sys
import zipfile
from pathlib import Path

import pymupdf

PAGE = re.compile(r'(\d+)[^/\\]*\.(ai|pdf)$', re.I)


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    doc = pymupdf.open()
    if src.suffix.lower() == '.zip':
        z = zipfile.ZipFile(src)
        names = sorted((n for n in z.namelist() if PAGE.search(n)), key=lambda n: int(PAGE.search(n).group(1)))
        read = lambda n: pymupdf.open(stream=z.read(n), filetype='pdf')
    else:
        names = sorted((p for p in src.iterdir() if PAGE.search(p.name)), key=lambda p: int(PAGE.search(p.name).group(1)))
        read = lambda p: pymupdf.open(p, filetype='pdf')
    nums = [int(PAGE.search(str(n)).group(1)) for n in names]
    if nums != list(range(1, len(nums) + 1)):
        sys.exit(f'pages are not 1..{len(nums)} in order')
    for n in names:
        with read(n) as one:
            doc.insert_pdf(one)
    out.parent.mkdir(parents=True, exist_ok=True)
    doc.save(out, garbage=3, deflate=True)
    print(f'{out.name}: {doc.page_count} pages, {out.stat().st_size / 2**20:.0f} MB')


if __name__ == '__main__':
    main()
