"""Downloads the extra interface fonts offered in Settings › Fonts and writes fonts/extra.css.

All are from Google Fonts under the SIL Open Font License 1.1, kept with the site so they work
offline and in the app. The browser fetches a font only once it is chosen.
Run: python tools/build_fonts.py
"""
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'fonts', 'extra')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'

# family, Google Fonts axis spec, the subsets kept
FONTS = [
    # Arabic (each also carries Latin letters and digits)
    ('Cairo', 'wght@400..700', ['arabic', 'latin']),
    ('Tajawal', 'wght@400;700', ['arabic', 'latin']),
    ('Almarai', 'wght@400;700', ['arabic']),
    ('Noto Kufi Arabic', 'wght@400..700', ['arabic']),
    ('Noto Naskh Arabic', 'wght@400..700', ['arabic']),
    ('Readex Pro', 'wght@400..700', ['arabic', 'latin']),
    ('El Messiri', 'wght@400..700', ['arabic', 'latin']),
    # English
    ('Inter', 'wght@400..700', ['latin', 'latin-ext']),
    ('Roboto', 'wght@400..700', ['latin', 'latin-ext']),
    ('Nunito', 'wght@400..700', ['latin', 'latin-ext']),
    ('Lato', 'wght@400;700', ['latin', 'latin-ext']),
    ('Poppins', 'wght@400;700', ['latin', 'latin-ext']),
]


def get(url, binary=False):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    return data if binary else data.decode('utf-8')


def main():
    os.makedirs(OUT, exist_ok=True)
    out = ['/* Extra interface fonts for Settings › Fonts (SIL Open Font License 1.1, from Google Fonts).',
           '   Written by tools/build_fonts.py; do not edit by hand. */']
    total = 0
    for family, axes, subsets in FONTS:
        css = get('https://fonts.googleapis.com/css2?family=%s:%s&display=swap' % (family.replace(' ', '+'), axes))
        # Each block: /* subset */ @font-face { ... }
        for subset, block in re.findall(r'/\* ([\w-]+) \*/\s*(@font-face \{.*?\})', css, re.S):
            if subset not in subsets:
                continue
            weight = re.search(r'font-weight: ([\d ]+);', block).group(1).strip()
            url = re.search(r'url\((https://[^)]+\.woff2)\)', block).group(1)
            name = '%s-%s-%s.woff2' % (family.replace(' ', ''), weight.replace(' ', '_'), subset)
            path = os.path.join(OUT, name)
            if not os.path.exists(path):
                with open(path, 'wb') as f:
                    f.write(get(url, binary=True))
            total += os.path.getsize(path)
            rng = re.search(r'unicode-range: ([^;]+);', block).group(1)
            out.append('@font-face { font-family: %r; font-style: normal; font-weight: %s; font-display: swap; '
                       'src: url(extra/%s) format("woff2"); unicode-range: %s; }' % (family, weight, name, rng))
    with open(os.path.join(ROOT, 'fonts', 'extra.css'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(out).replace("'", '"') + '\n')
    print('%d fonts, %.0f KB' % (len(FONTS), total / 1024))


if __name__ == '__main__':
    main()
