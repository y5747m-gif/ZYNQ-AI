#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
==============================================================================
 ZYNQ FX — مولّد أيقونات تطبيق «ستيريو» (بلا أي مكتبات خارجية)
------------------------------------------------------------------------------
 يولّد PNG حقيقية (RGBA) لأيقونة التطبيق:
   · أيقونات PWA:  site/public/stereo/icons/icon-192.png · icon-512.png
                   site/public/stereo/icons/maskable-512.png
   · أيقونات أندرويد: site/downloads/stereo-sound/app/src/main/res/mipmap-*/
                       ic_launcher.png · ic_launcher_round.png

 الرسم بلا PIL: نرسم بدقة 4× ثم نصغّر (box filter) فتخرج الحواف ناعمة.

 التشغيل:  python3 tools/gen_app_icons.py
==============================================================================
"""
import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RED = (232, 69, 69)
CREAM = (255, 248, 231)
INK = (20, 17, 15)
CYAN = (20, 200, 200)
YELLOW = (255, 210, 63)

SS = 4  # معامل التكبير للتنعيم


# ----------------------------------------------------------------------------
# ترميز PNG (RGBA 8-bit) — بلا مكتبات
# ----------------------------------------------------------------------------
def _chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data +
            struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))


def write_png(path, width, height, pixels):
    """pixels: بايتات RGBA طولها width*height*4"""
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)  # no filter
        raw += pixels[y * stride:(y + 1) * stride]
    png = b"\x89PNG\r\n\x1a\n"
    png += _chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += _chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += _chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(png)
    print(f"  ✔ {os.path.relpath(path, ROOT)}  ({len(png):,} bytes, {width}×{height})")


# ----------------------------------------------------------------------------
# لوحة رسم بسيطة (RGBA float) مع تنعيم بالتصغير
# ----------------------------------------------------------------------------
class Canvas:
    def __init__(self, size):
        self.size = size
        self.w = size * SS
        self.buf = bytearray(self.w * self.w * 4)

    def _blend(self, x, y, color, alpha=1.0):
        if x < 0 or y < 0 or x >= self.w or y >= self.w or alpha <= 0:
            return
        i = (y * self.w + x) * 4
        b = self.buf
        sa = alpha
        da = b[i + 3] / 255.0
        oa = sa + da * (1 - sa)
        if oa <= 0:
            return
        for k in range(3):
            b[i + k] = int(round((color[k] * sa + b[i + k] * da * (1 - sa)) / oa))
        b[i + 3] = int(round(oa * 255))

    # ---- أشكال ----
    def rounded_rect(self, x0, y0, x1, y1, r, color, alpha=1.0):
        r = max(0, min(r, (x1 - x0) / 2, (y1 - y0) / 2))
        for y in range(int(y0), int(math.ceil(y1))):
            for x in range(int(x0), int(math.ceil(x1))):
                cy = min(max(y + 0.5, y0 + r), y1 - r)
                cx = min(max(x + 0.5, x0 + r), x1 - r)
                dx, dy = x + 0.5 - cx, y + 0.5 - cy
                inside = (x0 <= x + 0.5 <= x1 and y0 <= y + 0.5 <= y1 and
                          math.hypot(dx, dy) <= r + 0.001)
                if inside:
                    self._blend(x, y, color, alpha)

    def circle(self, cx, cy, r, color, alpha=1.0):
        for y in range(int(cy - r) - 1, int(cy + r) + 2):
            for x in range(int(cx - r) - 1, int(cx + r) + 2):
                if math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r:
                    self._blend(x, y, color, alpha)

    def ring(self, cx, cy, r_out, r_in, color, a0=None, a1=None, alpha=1.0):
        for y in range(int(cy - r_out) - 1, int(cy + r_out) + 2):
            for x in range(int(cx - r_out) - 1, int(cx + r_out) + 2):
                d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                if not (r_in <= d <= r_out):
                    continue
                if a0 is not None:
                    ang = math.degrees(math.atan2(y + 0.5 - cy, x + 0.5 - cx))
                    if not (a0 <= ang <= a1):
                        continue
                self._blend(x, y, color, alpha)

    def polygon(self, pts, color, alpha=1.0):
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(math.ceil(max(ys))) + 1):
            for x in range(int(min(xs)), int(math.ceil(max(xs))) + 1):
                if _point_in_poly(x + 0.5, y + 0.5, pts):
                    self._blend(x, y, color, alpha)

    def polyline(self, pts, width, color, alpha=1.0):
        for i in range(len(pts) - 1):
            x0, y0 = pts[i]
            x1, y1 = pts[i + 1]
            steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
            for k in range(steps + 1):
                t = k / steps
                self.circle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width / 2, color, alpha)

    # ---- تصغير ----
    def downsample(self, size):
        out = bytearray(size * size * 4)
        w = self.w
        for y in range(size):
            for x in range(size):
                r = g = b = a = 0
                for dy in range(SS):
                    for dx in range(SS):
                        i = (((y * SS + dy) * w) + (x * SS + dx)) * 4
                        r += self.buf[i]
                        g += self.buf[i + 1]
                        b += self.buf[i + 2]
                        a += self.buf[i + 3]
                n = SS * SS
                o = (y * size + x) * 4
                out[o] = r // n
                out[o + 1] = g // n
                out[o + 2] = b // n
                out[o + 3] = a // n
        return out


def _point_in_poly(x, y, pts):
    inside = False
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        if (y0 > y) != (y1 > y):
            xi = x0 + (y - y0) * (x1 - x0) / (y1 - y0)
            if x < xi:
                inside = not inside
    return inside


# ----------------------------------------------------------------------------
# تصميم الأيقونة: مكبّر صوت كريمي + موجات سماوية على خلفية حمراء
# ----------------------------------------------------------------------------
def draw_icon(size, maskable=False):
    c = Canvas(size)
    W = c.w
    u = W / 100.0  # وحدة نسبة (0..100)

    pad = 14 * u if maskable else 0.0
    # الخلفية
    if maskable:
        c.rounded_rect(0, 0, W, W, 0, RED)
    else:
        c.rounded_rect(0, 0, W, W, 18 * u, RED)
    # إطار حبري رقيق
    if not maskable:
        c.rounded_rect(0, 0, W, W, 18 * u, INK, alpha=0.0)
    # دائرة كريمية خلفية الرمز
    c.circle(W / 2, W / 2, 31 * u, (255, 255, 255))

    cx, cy = 36 * u, W / 2
    # مكبّر الصوت: صندوق خلفي + مخروط أمامي متّسع
    c.rounded_rect(cx - 15 * u, cy - 7.5 * u, cx - 1 * u, cy + 7.5 * u, 2 * u, INK)
    c.polygon([(cx - 3 * u, cy - 8 * u), (cx + 11 * u, cy - 16 * u),
               (cx + 11 * u, cy + 16 * u), (cx - 3 * u, cy + 8 * u)], INK)

    # موجات الصوت تنطلق من فتحة المخروط
    for i, r in enumerate((10.5, 17, 23.5)):
        col = CYAN if i < 2 else YELLOW
        c.ring(cx + 10 * u, cy, r * u, (r - 3.4) * u, col, a0=-55, a1=55)

    pixels = c.downsample(size)
    return pixels


def main():
    jobs = [
        (os.path.join(ROOT, "site", "public", "stereo", "icons", "icon-192.png"), 192, False),
        (os.path.join(ROOT, "site", "public", "stereo", "icons", "icon-512.png"), 512, False),
        (os.path.join(ROOT, "site", "public", "stereo", "icons", "maskable-512.png"), 512, True),
        # أندرويد: mipmap-* لكل كثافة
        ("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192),
    ]
    print("أيقونات PWA:")
    for path, size, maskable in jobs[:3]:
        write_png(path, size, size, draw_icon(size, maskable))

    print("أيقونات أندرويد:")
    base = os.path.join(ROOT, "site", "downloads", "stereo-sound", "app", "src", "main", "res")
    for density, size in jobs[3:]:
        px = draw_icon(size, False)
        write_png(os.path.join(base, f"mipmap-{density}", "ic_launcher.png"), size, size, px)
        # الأيقونة المستديرة: نفس الرسم مع قناع دائري
        c = Canvas(size)
        c.circle(c.w / 2, c.w / 2, c.w / 2 - 1, (255, 255, 255), alpha=0.0)
        round_px = _round_mask(px, size)
        write_png(os.path.join(base, f"mipmap-{density}", "ic_launcher_round.png"), size, size, round_px)


def _round_mask(px, size):
    out = bytearray(px)
    r = size / 2
    for y in range(size):
        for x in range(size):
            if math.hypot(x + 0.5 - r, y + 0.5 - r) > r:
                i = (y * size + x) * 4
                out[i + 3] = 0
    return out


if __name__ == "__main__":
    main()
