"""Draw the app's icon (a golden crescent and a white check on deep green) in every size it is used at.

The drawing is the same as desktop/icon.svg (the desktop app's icon, made from that file by
`tauri icon` in its build), here with Pillow so no SVG renderer is needed:
  icons/                       the website: favicon-32, apple-touch-icon (180), icon-192, icon-512, icon-maskable-512
  app/assets/                  the sources Capacitor's tools expect (icon-only, -foreground, -background, splash, splash-dark)
  app/android/.../res/mipmap-*  the Android launcher icons (plain, round, and the adaptive layers)
  app/android/.../res/drawable*/splash.png  the Android splash screens (the icon in the middle)
Run:  py -3 tools/build_icons.py
"""
import glob
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'app', 'android', 'app', 'src', 'main', 'res')
TOP, BOTTOM = (0x1D, 0x6B, 0x57), (0x0D, 0x3F, 0x33)
GOLD, WHITE = (0xE9, 0xC4, 0x6A, 255), (255, 255, 255, 255)
SPLASH_BG = (239, 239, 236)
S = 8  # drawn this many times larger, then reduced: smooth edges


def gradient(n):
    g = Image.new('RGBA', (1, 256))
    for y in range(256):
        t = y / 255
        g.putpixel((0, y), tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)) + (255,))
    return g.resize((n, n), Image.BILINEAR)


def glyph(n, scale=1.0):
    """The crescent and the check, on transparency, in an n x n square (512 units = the whole icon)."""
    big = n * S
    u = big / 512 * scale
    off = big / 2 - 256 * u  # keep the drawing centred when scaled
    P = lambda x, y: (off + x * u, off + y * u)
    img = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    # The crescent: the disc (242.6, 256, r 170) less the disc (300, 256, r 160), as in icon.svg.
    m = Image.new('L', (big, big), 0)
    d = ImageDraw.Draw(m)
    cx, cy, r = 242.6, 256, 170
    d.ellipse([*P(cx - r, cy - r), *P(cx + r, cy + r)], fill=255)
    cx, r = 300, 160
    d.ellipse([*P(cx - r, cy - r), *P(cx + r, cy + r)], fill=0)
    img.paste(Image.new('RGBA', (big, big), GOLD), (0, 0), m)
    # The check, 40 units wide, round ends and joint.
    d = ImageDraw.Draw(img)
    pts = [P(236, 262), P(288, 306), P(396, 178)]
    w = 40 * u
    d.line(pts, fill=WHITE, width=round(w))
    for x, y in pts:
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=WHITE)
    return img.resize((n, n), Image.LANCZOS)


def tile(n, rounded=True, scale=1.0):
    """The whole icon: the green tile (rounded, with a margin, or the full square) and the glyph."""
    big = n * S
    out = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    m = Image.new('L', (big, big), 0)
    if rounded:
        k = big / 512
        ImageDraw.Draw(m).rounded_rectangle([16 * k, 16 * k, 496 * k, 496 * k], radius=110 * k, fill=255)
    else:
        m.paste(255, (0, 0, big, big))
    out.paste(gradient(big), (0, 0), m)
    out = out.resize((n, n), Image.LANCZOS)
    g = glyph(n, scale)
    out.alpha_composite(g)
    return out


def circle(n):
    out = tile(n, rounded=False, scale=0.86)
    m = Image.new('L', (n * S, n * S), 0)
    ImageDraw.Draw(m).ellipse([0, 0, n * S - 1, n * S - 1], fill=255)
    out.putalpha(m.resize((n, n), Image.LANCZOS))
    return out


def splash(w, h, bg=SPLASH_BG):
    out = Image.new('RGBA', (w, h), bg + (255,))
    n = round(min(w, h) * 0.367)
    out.alpha_composite(tile(n), ((w - n) // 2, (h - n) // 2))
    return out


def save(img, path, mode='RGBA'):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.convert(mode).save(path, optimize=True)
    print(os.path.relpath(path, ROOT), img.size)


def main():
    icons = os.path.join(ROOT, 'icons')
    save(tile(32), os.path.join(icons, 'favicon-32.png'))
    save(tile(180, rounded=False, scale=0.9), os.path.join(icons, 'apple-touch-icon.png'), 'RGB')
    save(tile(192), os.path.join(icons, 'icon-192.png'))
    save(tile(512), os.path.join(icons, 'icon-512.png'))
    # Maskable: the full square, the glyph inside the middle 80% that every mask keeps.
    save(tile(512, rounded=False, scale=0.78), os.path.join(icons, 'icon-maskable-512.png'), 'RGB')

    assets = os.path.join(ROOT, 'app', 'assets')
    save(tile(1024), os.path.join(assets, 'icon-only.png'))
    save(glyph(1024, 0.62), os.path.join(assets, 'icon-foreground.png'))
    save(gradient(1024), os.path.join(assets, 'icon-background.png'), 'RGB')
    save(splash(2732, 2732), os.path.join(assets, 'splash.png'))
    save(splash(2732, 2732), os.path.join(assets, 'splash-dark.png'))

    # Android: replace each existing file at its own size.
    for f in glob.glob(os.path.join(RES, 'mipmap-*', '*.png')):
        n = Image.open(f).size[0]
        name = os.path.basename(f)
        if name == 'ic_launcher.png':
            img = tile(n)
        elif name == 'ic_launcher_round.png':
            img = circle(n)
        elif name == 'ic_launcher_foreground.png':
            # Shown through the inset in mipmap-anydpi-v26 (16.7% each side), then masked by the launcher.
            img = glyph(n, 0.86)
        elif name == 'ic_launcher_background.png':
            img = gradient(n)
        else:
            continue
        save(img, f, 'RGB' if name == 'ic_launcher_background.png' else 'RGBA')
    for f in glob.glob(os.path.join(RES, 'drawable*', 'splash.png')):
        w, h = Image.open(f).size
        save(splash(w, h), f)


if __name__ == '__main__':
    main()
