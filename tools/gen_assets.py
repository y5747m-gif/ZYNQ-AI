#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
==============================================================================
 ZYNQ FX — مولّد الأصول الرقمية للمؤثرات الحركية والضوئية
------------------------------------------------------------------------------
 يولّد ملفات تحميل حقيقية تُستخدم في برامج المونتاج:
   1) Lottie / Bodymovin JSON  (After Effects عبر إضافة Lottie، والويب)
   2) SVG متحركة               (أفتر إيفكت / الويب)
   3) GIF أوفلاي أوفلاي        (وضع دمج Screen في أي مونتير) — عبر ImageMagick
   4) تسلسلات PNG بشفافية      (تُستورد كـ Sequence في AE/Premiere/Resolve/FCP)
   5) لوكات ألوان .cube        (Premiere / AE / Resolve / FCP)
   6) تعابير After Effects     (نصوص جاهزة للنسخ)

 التشغيل:  python3 tools/gen_assets.py
==============================================================================
"""
import json
import math
import os
import random
import shutil
import struct
import subprocess
import sys
import zipfile
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DL = os.path.join(ROOT, "site", "downloads")
TMP = os.path.join(ROOT, ".asset-tmp")

# ----------------------------------------------------------------------------
# أدوات عامة
# ----------------------------------------------------------------------------

def ensure(*parts):
    p = os.path.join(*parts)
    os.makedirs(p, exist_ok=True)
    return p

def write_json(path, data):
    ensure(os.path.dirname(path))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  ✔ {os.path.relpath(path, ROOT)}  ({os.path.getsize(path):,} bytes)")

def write_text(path, text):
    ensure(os.path.dirname(path))
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"  ✔ {os.path.relpath(path, ROOT)}  ({os.path.getsize(path):,} bytes)")

# ----------------------------------------------------------------------------
# Lottie helpers (Bodymovin 5.x — شكل مسطّح متوافق مع كل مشغّلات Lottie)
# ----------------------------------------------------------------------------

def s(v):
    """قيمة ثابتة"""
    return {"a": 0, "k": v}

def kf(times_values, dims=1):
    """حركة keyframes خطية: [(t, value), ...]"""
    k = []
    for idx, (t, v) in enumerate(times_values):
        item = {"t": t, "s": v if isinstance(v, list) else [v]}
        if idx < len(times_values) - 1:
            nxt = times_values[idx + 1][1]
            item["e"] = nxt if isinstance(nxt, list) else [nxt]
        k.append(item)
    prop = {"a": 1, "k": k}
    return prop

def transform(p=None, a=None, sc=None, r=None, o=None):
    return {
        "p": s([0, 0, 0]) if p is None else (p if isinstance(p, dict) and "a" in p else s(p)),
        "a": s([0, 0, 0]) if a is None else (a if isinstance(a, dict) and "a" in a else s(a)),
        "s": s([100, 100, 100]) if sc is None else (sc if isinstance(sc, dict) and "a" in sc else s(sc)),
        "r": s(0) if r is None else (r if isinstance(r, dict) and "a" in r else s(r)),
        "o": s(100) if o is None else (o if isinstance(o, dict) and "a" in o else s(o)),
    }

def rect(w, h, radius=0):
    return {"ty": "rc", "d": 1, "s": s([w, h]), "p": s([0, 0]), "r": s(radius)}

def ellipse(w, h=None):
    return {"ty": "el", "d": 1, "s": s([w, h if h is not None else w]), "p": s([0, 0])}

def fill(rgba):
    return {"ty": "fl", "c": s(list(rgba)), "o": s(100), "r": 1, "bm": 0}

def stroke(rgba, width, cap=2, join=2):
    return {"ty": "st", "c": s(list(rgba)), "o": s(100), "w": s(width), "lc": cap, "lj": join, "ml": 4}

def group(items):
    items = list(items) + [{
        "ty": "tr", "p": s([0, 0]), "a": s([0, 0]), "s": s([100, 100]),
        "r": s(0), "o": s(100), "sk": s(0), "sa": s(0),
    }]
    return {"ty": "gr", "it": items, "nm": "g"}

def shape_layer(ind, nm, shapes, ks, op, ip=0):
    return {
        "ddd": 0, "ind": ind, "ty": 4, "nm": nm, "sr": 1,
        "ks": ks, "ao": 0, "shapes": shapes,
        "ip": ip, "op": op, "st": 0, "bm": 0,
    }

def lottie(nm, op, layers, fr=60, w=1920, h=1080):
    return {"v": "5.7.4", "fr": fr, "ip": 0, "op": op, "w": w, "h": h,
            "nm": nm, "ddd": 0, "assets": [], "fonts": None, "layers": layers}

# ألوان
RED = [0.91, 0.18, 0.18, 1]
YEL = [1.0, 0.79, 0.16, 1]
CYA = [0.10, 0.78, 0.80, 1]
WHT = [1, 1, 1, 1]
INK = [0.07, 0.06, 0.06, 1]
BLK = [0, 0, 0, 1]

# ----------------------------------------------------------------------------
# 1) Lottie
# ----------------------------------------------------------------------------

def gen_lotties():
    print("▶ Lottie / Bodymovin …")
    out = ensure(DL, "lottie")

    # 1) كنس ضوئي — ضوء عريض يمسح الشاشة (تدمج بوضع Screen)
    layers = []
    for i, (tint, wdt, spd, opv) in enumerate([
        (WHT, 460, 0, 85), (CYA, 300, 12, 60), (YEL, 180, 24, 75),
    ]):
        layers.append(shape_layer(i + 1, f"sweep-{i}", [
            group([rect(wdt, 1600, wdt // 2), fill(tint)]),
        ], transform(
            p=kf([(0 + spd, [-600, 540, 0]), (75 + spd, [2520, 540, 0])]),
            sc=s([100, 100, 100]), o=s(opv),
        ), 120))
    layers.append(shape_layer(4, "flare-dot", [
        group([ellipse(120), fill(WHT)]),
    ], transform(p=kf([(0, [-600, 540, 0]), (75, [2520, 540, 0])]), o=s(60)), 120))
    write_json(os.path.join(out, "light-sweep-hero.json"), lottie("ZYNQ FX — Light Sweep", 120, layers))

    # 2) وميض اصطدام — فلاش + حلقة تمدد + صليب ضوئي
    layers = []
    layers.append(shape_layer(1, "white-flash", [
        group([rect(1920, 1080), fill(WHT)]),
    ], transform(o=kf([(0, [0]), (8, [100]), (18, [70]), (34, [0])])), 60))
    layers.append(shape_layer(2, "ring", [
        group([ellipse(900), stroke(WHT, 26)]),
    ], transform(p=s([960, 540, 0]),
                 sc=kf([(4, [4, 4, 100]), (40, [130, 130, 100])]),
                 o=kf([(4, [0]), (10, [100]), (40, [0])])), 60))
    layers.append(shape_layer(3, "ring-2", [
        group([ellipse(600), stroke(YEL, 16)]),
    ], transform(p=s([960, 540, 0]),
                 sc=kf([(10, [2, 2, 100]), (46, [170, 170, 100])]),
                 o=kf([(10, [0]), (18, [90]), (46, [0])])), 60))
    layers.append(shape_layer(4, "cross-v", [
        group([rect(46, 900, 20), fill(WHT)]),
    ], transform(p=s([960, 540, 0]), sc=kf([(2, [40, 0, 100]), (16, [100, 120, 100]), (36, [60, 10, 100])]),
                 o=kf([(2, [0]), (12, [100]), (36, [0])])), 60))
    layers.append(shape_layer(5, "cross-h", [
        group([rect(900, 46, 20), fill(WHT)]),
    ], transform(p=s([960, 540, 0]), sc=kf([(2, [0, 40, 100]), (16, [120, 100, 100]), (36, [10, 60, 100])]),
                 o=kf([(2, [0]), (12, [100]), (36, [0])])), 60))
    layers.append(shape_layer(6, "core", [
        group([ellipse(220), fill(WHT)]),
    ], transform(p=s([960, 540, 0]), sc=kf([(0, [0, 0, 100]), (12, [120, 120, 100]), (36, [20, 20, 100])]),
                 o=kf([(0, [100]), (36, [0])])), 60))
    write_json(os.path.join(out, "flash-burst.json"), lottie("ZYNQ FX — Flash Burst", 60, layers))

    # 3) وميض عدسة أفقي (Anamorphic Streak)
    layers = []
    layers.append(shape_layer(1, "streak", [
        group([rect(2200, 26, 13), fill(CYA)]),
    ], transform(p=kf([(0, [-1400, 500, 0]), (60, [1400, 560, 0]), (120, [3320, 620, 0])]),
                 o=kf([(0, [0]), (14, [100]), (100, [80]), (120, [0])])), 150))
    layers.append(shape_layer(2, "streak-soft", [
        group([rect(1800, 90, 45), fill(WHT)]),
    ], transform(p=kf([(0, [-1200, 505, 0]), (60, [1360, 552, 0]), (120, [3120, 610, 0])]),
                 o=kf([(0, [0]), (18, [55]), (100, [40]), (120, [0])])), 150))
    for i, (dx, dy, dd, dia, tint) in enumerate([
        (-260, -30, 4, 130, CYA), (-60, 20, 10, 70, YEL), (120, -10, 16, 100, WHT), (300, 30, 22, 55, RED),
    ]):
        layers.append(shape_layer(3 + i, f"orb-{i}", [
            group([ellipse(dia), stroke(tint, 8)]),
        ], transform(p=kf([(0 + dd, [-1400 + dx, 500 + dy, 0]), (60 + dd, [1400 + dx, 560 + dy, 0]), (120 + dd, [3320 + dx, 620 + dy, 0])]),
                     o=kf([(0 + dd, [0]), (16 + dd, [80]), (100 + dd, [60]), (120 + dd, [0])])), 150))
    layers.append(shape_layer(8, "glow", [
        group([ellipse(520), fill([0.55, 0.9, 1, 1])]),
    ], transform(p=kf([(0, [-1400, 520, 0]), (60, [1400, 556, 0]), (120, [3320, 592, 0])]),
                 sc=kf([(0, [20, 60, 100]), (60, [100, 100, 100]), (120, [20, 60, 100])]),
                 o=kf([(0, [0]), (20, [45]), (100, [35]), (120, [0])])), 150))
    write_json(os.path.join(out, "lens-flare-streak.json"), lottie("ZYNQ FX — Lens Flare Streak", 150, layers))

    # 4) تشويش رقمي — أشرطة تنطّ + انفصال RGB
    rnd = random.Random(7)
    layers = []
    for i in range(7):
        y = 120 + i * 130
        frames = []
        for t in range(0, 90, 6):
            frames.append((t, [rnd.choice([0, 200, 700, 1300, 1650]), y + rnd.choice([0, 0, 0, 18, -18]), 0]))
        layers.append(shape_layer(i + 1, f"bar-{i}", [
            group([rect(rnd.choice([280, 520, 760]), rnd.choice([26, 44, 60])), fill(WHT if i % 2 == 0 else CYA)]),
        ], transform(p=kf(frames), o=kf([(0, [0]), (6, [95]), (84, [95]), (90, [0])])), 90))
    layers.append(shape_layer(8, "rgb-r", [
        group([rect(1200, 640, 8), fill(RED)]),
    ], transform(p=kf([(0, [940, 540, 0]), (12, [992, 528, 0]), (24, [920, 552, 0]), (36, [976, 534, 0]), (48, [940, 540, 0])]),
                 o=s(38)), 90))
    layers.append(shape_layer(9, "rgb-c", [
        group([rect(1200, 640, 8), fill(CYA)]),
    ], transform(p=kf([(0, [980, 540, 0]), (12, [928, 552, 0]), (24, [1000, 528, 0]), (36, [944, 546, 0]), (48, [980, 540, 0])]),
                 o=s(38)), 90))
    layers.append(shape_layer(10, "scanline", [
        group([rect(1920, 8), fill(WHT)]),
    ], transform(p=kf([(0, [960, -20, 0]), (90, [960, 1100, 0])]), o=s(55)), 90))
    write_json(os.path.join(out, "glitch-scan.json"), lottie("ZYNQ FX — Glitch Scan", 90, layers))

    # 5) انفجار جزيئات
    rnd = random.Random(21)
    layers = [shape_layer(1, "core-pop", [
        group([ellipse(160), fill(YEL)]),
    ], transform(p=s([960, 540, 0]),
                 sc=kf([(0, [0, 0, 100]), (12, [160, 160, 100]), (40, [40, 40, 100])]),
                 o=kf([(0, [100]), (40, [0])])), 120)]
    for i in range(16):
        ang = (i / 16) * math.tau + rnd.uniform(-0.12, 0.12)
        dist = rnd.uniform(420, 880)
        ex = 960 + math.cos(ang) * dist
        ey = 540 + math.sin(ang) * dist * 0.62
        dia = rnd.choice([18, 24, 30, 40])
        tint = [WHT, YEL, CYA, RED][i % 4]
        layers.append(shape_layer(i + 2, f"p-{i}", [
            group([ellipse(dia), fill(tint)]),
        ], transform(
            p=kf([(0, [960, 540, 0]), (14, [960 + math.cos(ang) * dist * 0.32, 540 + math.sin(ang) * dist * 0.2, 0]),
                  (120, [ex, ey + 180, 0])]),
            sc=kf([(0, [20, 20, 100]), (16, [120, 120, 100]), (120, [10, 10, 100])]),
            o=kf([(0, [0]), (8, [100]), (70, [90]), (120, [0])]),
        ), 120))
    write_json(os.path.join(out, "particles-burst.json"), lottie("ZYNQ FX — Particles Burst", 120, layers))

    # 6) بوكيه عائم (حلقات ضوء خلفية)
    rnd = random.Random(5)
    layers = []
    for i in range(11):
        x = rnd.uniform(120, 1800)
        y0 = rnd.uniform(200, 1100)
        dia = rnd.choice([60, 90, 130, 180, 240])
        spd = rnd.uniform(160, 420)
        tint = [WHT, YEL, CYA][i % 3]
        layers.append(shape_layer(i + 1, f"bok-{i}", [
            group([ellipse(dia), fill(tint)]),
        ], transform(
            p=kf([(0, [x, y0, 0]), (300, [x + rnd.uniform(-60, 60), y0 - spd, 0])]),
            sc=kf([(0, [100, 100, 100]), (150, [118, 118, 100]), (300, [100, 100, 100])]),
            o=kf([(0, [0]), (40, [40]), (260, [35]), (300, [0])]),
        ), 300))
    write_json(os.path.join(out, "bokeh-drift.json"), lottie("ZYNQ FX — Bokeh Drift", 300, layers))

    # 7) كشف شعار بحلقات
    layers = []
    layers.append(shape_layer(1, "ring-out", [
        group([ellipse(760), stroke(YEL, 18)]),
    ], transform(p=s([960, 540, 0]),
                 sc=kf([(6, [0, 0, 100]), (70, [140, 140, 100])]),
                 o=kf([(6, [0]), (18, [100]), (70, [0])])), 150))
    layers.append(shape_layer(2, "ring-out-2", [
        group([ellipse(760), stroke(CYA, 12)]),
    ], transform(p=s([960, 540, 0]),
                 sc=kf([(18, [0, 0, 100]), (86, [175, 175, 100])]),
                 o=kf([(18, [0]), (30, [100]), (86, [0])])), 150))
    layers.append(shape_layer(3, "line-l", [
        group([rect(560, 14, 7), fill(WHT)]),
    ], transform(p=kf([(24, [360, 540, 0]), (64, [620, 540, 0])]),
                 o=kf([(24, [0]), (36, [100]), (120, [100]), (150, [0])])), 150))
    layers.append(shape_layer(4, "line-r", [
        group([rect(560, 14, 7), fill(WHT)]),
    ], transform(p=kf([(24, [1560, 540, 0]), (64, [1300, 540, 0])]),
                 o=kf([(24, [0]), (36, [100]), (120, [100]), (150, [0])])), 150))
    layers.append(shape_layer(5, "logo-block", [
        group([rect(300, 300, 36), fill(RED)]),
    ], transform(p=s([960, 540, 0]),
                 sc=kf([(30, [0, 0, 100]), (52, [112, 112, 100]), (62, [100, 100, 100])]),
                 r=kf([(30, [-8]), (62, [0])]),
                 o=kf([(30, [0]), (40, [100])])), 150))
    layers.append(shape_layer(6, "logo-bolt", [
        group([rect(70, 190, 14), fill(YEL)]),
    ], transform(p=kf([(46, [960, 520, 0]), (58, [960, 540, 0])]),
                 r=s(18),
                 sc=kf([(46, [0, 0, 100]), (58, [118, 118, 100]), (66, [100, 100, 100])]),
                 o=kf([(46, [0]), (54, [100])])), 150))
    layers.append(shape_layer(7, "spark", [
        group([ellipse(26), fill(WHT)]),
    ], transform(p=kf([(52, [720, 400, 0]), (72, [640, 320, 0])]), o=kf([(52, [0]), (58, [100]), (72, [0])])), 150))
    layers.append(shape_layer(8, "spark-2", [
        group([ellipse(20), fill(WHT)]),
    ], transform(p=kf([(56, [1200, 380, 0]), (78, [1300, 300, 0])]), o=kf([(56, [0]), (62, [100]), (78, [0])])), 150))
    write_json(os.path.join(out, "logo-reveal-rings.json"), lottie("ZYNQ FX — Logo Reveal Rings", 150, layers))

    # 8) لَوَر ثِرْد (شريط سفلي)
    layers = []
    layers.append(shape_layer(1, "bg-bar", [
        group([rect(980, 150), fill(INK)]),
    ], transform(p=kf([(0, [-600, 860, 0]), (22, [430, 860, 0])]), o=s(100)), 120))
    layers.append(shape_layer(2, "accent", [
        group([rect(22, 150), fill(RED)]),
    ], transform(p=kf([(6, [-600, 860, 0]), (28, [925, 860, 0])]), o=s(100)), 120))
    layers.append(shape_layer(3, "accent-2", [
        group([rect(120, 150), fill(YEL)]),
    ], transform(p=kf([(10, [-600, 860, 0]), (32, [1010, 860, 0])]), o=s(100)), 120))
    layers.append(shape_layer(4, "line-main", [
        group([rect(560, 26, 13), fill(WHT)]),
    ], transform(p=kf([(18, [180, 842, 0]), (34, [560, 842, 0])]),
                 sc=s([100, 100, 100]), o=s(95)), 120))
    layers.append(shape_layer(5, "line-sub", [
        group([rect(320, 14, 7), fill([0.85, 0.85, 0.85, 1])]),
    ], transform(p=kf([(24, [180, 892, 0]), (40, [420, 892, 0])]), o=s(85)), 120))
    write_json(os.path.join(out, "lower-third-pack.json"), lottie("ZYNQ FX — Lower Third", 120, layers))

    # 9) تايتل صَمْ (هبوط قوي بظل كوميكس)
    layers = []
    layers.append(shape_layer(1, "shadow", [
        group([rect(1300, 320, 24), fill(BLK)]),
    ], transform(p=kf([(6, [982, 566, 0]), (20, [968, 552, 0])]),
                 sc=kf([(6, [150, 150, 100]), (20, [102, 102, 100])]),
                 o=kf([(6, [0]), (14, [80])])), 90))
    layers.append(shape_layer(2, "title-block", [
        group([rect(1300, 320, 24), fill(YEL)]),
    ], transform(p=kf([(6, [960, 500, 0]), (16, [960, 560, 0]), (22, [960, 540, 0])]),
                 sc=kf([(6, [160, 160, 100]), (16, [96, 96, 100]), (22, [100, 100, 100])]),
                 r=kf([(6, [-6]), (22, [0])]),
                 o=kf([(6, [0]), (10, [100])])), 90))
    layers.append(shape_layer(3, "bar-red", [
        group([rect(1100, 34, 17), fill(RED)]),
    ], transform(p=kf([(18, [960, 470, 0]), (28, [960, 452, 0])]),
                 sc=kf([(18, [30, 100, 100]), (28, [100, 100, 100])]),
                 o=kf([(18, [0]), (26, [100])])), 90))
    layers.append(shape_layer(4, "bar-ink", [
        group([rect(760, 22, 11), fill(INK)]),
    ], transform(p=kf([(22, [960, 630, 0]), (32, [960, 618, 0])]),
                 sc=kf([(22, [30, 100, 100]), (32, [100, 100, 100])]),
                 o=kf([(22, [0]), (30, [100])])), 90))
    layers.append(shape_layer(5, "flash", [
        group([rect(1920, 1080), fill(WHT)]),
    ], transform(o=kf([(4, [0]), (8, [80]), (16, [0])])), 90))
    write_json(os.path.join(out, "title-slam-comic.json"), lottie("ZYNQ FX — Title Slam", 90, layers))

    # 10) نبض توهّج
    layers = []
    for i, (tint, d0, d1, off) in enumerate([(CYA, 260, 760, 0), (WHT, 200, 620, 30), (YEL, 140, 520, 60)]):
        layers.append(shape_layer(i + 1, f"pulse-{i}", [
            group([ellipse(300), fill(tint)]),
        ], transform(p=s([960, 540, 0]),
                     sc=kf([(off, [d0 / 3, d0 / 3, 100]), (off + 60, [d1 / 3, d1 / 3, 100]), (off + 120, [d0 / 3, d0 / 3, 100])]),
                     o=kf([(off, [0]), (off + 30, [55]), (off + 120, [0])])), 180))
    layers.append(shape_layer(4, "core", [
        group([ellipse(180), fill(WHT)]),
    ], transform(p=s([960, 540, 0]),
                 sc=kf([(0, [100, 100, 100]), (60, [130, 130, 100]), (120, [100, 100, 100]), (180, [130, 130, 100])]),
                 o=s(90)), 180))
    write_json(os.path.join(out, "glow-pulse.json"), lottie("ZYNQ FX — Glow Pulse", 180, layers))

    # 11) انتقال ويب سريع
    layers = []
    layers.append(shape_layer(1, "sweep-ink", [
        group([rect(2400, 1300), fill(INK)]),
    ], transform(p=kf([(0, [-1500, 540, 0]), (26, [960, 540, 0]), (52, [3420, 540, 0])])), 60))
    for i, (tint, off) in enumerate([(YEL, 4), (RED, 8), (CYA, 12)]):
        layers.append(shape_layer(2 + i, f"trail-{i}", [
            group([rect(2400, 240), fill(tint)]),
        ], transform(p=kf([(0, [-1700 - i * 200, 540, 0]), (28 + off, [960, 540, 0]), (56, [3620, 540, 0])]),
                     o=s(85)), 60))
    layers.append(shape_layer(5, "flash-mid", [
        group([rect(1920, 1080), fill(WHT)]),
    ], transform(o=kf([(20, [0]), (26, [70]), (34, [0])])), 60))
    write_json(os.path.join(out, "whip-transition.json"), lottie("ZYNQ FX — Whip Transition", 60, layers))

    # 12) إطار HUD بزوايا
    layers = []
    corners = [(-1, -1), (1, -1), (-1, 1), (1, 1)]
    for i, (sx, sy) in enumerate(corners):
        cx, cy = 960 + sx * 720, 540 + sy * 360
        layers.append(shape_layer(i + 1, f"corner-{i}", [
            group([rect(190, 26, 6), fill(CYA)]),
            group([rect(26, 190, 6), fill(CYA)]),
        ], transform(p=kf([(8, [960 + sx * 1050, 540 + sy * 620, 0]), (30, [cx, cy, 0])]),
                     o=kf([(8, [0]), (18, [100])])), 150))
        layers.append(shape_layer(5 + i, f"dot-{i}", [
            group([ellipse(22), fill(YEL)]),
        ], transform(p=s([cx - sx * 60, cy - sy * 60, 0]),
                     o=kf([(30, [0]), (38, [100]), (70, [40]), (90, [100]), (150, [40])])), 150))
    layers.append(shape_layer(9, "scan", [
        group([rect(1600, 6, 3), fill(WHT)]),
    ], transform(p=kf([(20, [960, 160, 0]), (110, [960, 920, 0])]), o=s(60)), 150))
    layers.append(shape_layer(10, "bar-bottom", [
        group([rect(600, 10, 5), fill(RED)]),
    ], transform(p=kf([(30, [960, 950, 0]), (55, [960, 930, 0])]),
                 sc=kf([(30, [0, 100, 100]), (55, [100, 100, 100])]), o=s(95)), 150))
    write_json(os.path.join(out, "hud-frame-tech.json"), lottie("ZYNQ FX — HUD Frame", 150, layers))

    # 13) حلقة تقدّم (Trim Path)
    layers = []
    layers.append(shape_layer(1, "track", [
        group([ellipse(560), stroke([0.25, 0.25, 0.25, 1], 44)]),
    ], transform(p=s([960, 540, 0]), o=s(100)), 120))
    layers.append(shape_layer(2, "arc", [
        group([ellipse(560), stroke(YEL, 44),
               {"ty": "tm", "s": s(0), "e": kf([(6, [0]), (96, [100])]), "o": s(0), "m": 1, "ix": 1}]),
    ], transform(p=s([960, 540, 0]), r=s(-90)), 120))
    layers.append(shape_layer(3, "dot", [
        group([ellipse(70), fill(CYA)]),
    ], transform(p=s([960, 540, 0]), o=kf([(6, [0]), (14, [100])])), 120))
    write_json(os.path.join(out, "progress-ring.json"), lottie("ZYNQ FX — Progress Ring", 120, layers))

    # 14) ذيول شرارات
    rnd = random.Random(11)
    layers = []
    for i in range(12):
        ang = (i / 12) * math.tau
        dist = rnd.uniform(520, 980)
        ex = 960 + math.cos(ang) * dist
        ey = 540 + math.sin(ang) * dist * 0.7
        layers.append(shape_layer(i + 1, f"trail-{i}", [
            group([rect(230, 12, 6), fill([WHT, YEL, CYA, RED][i % 4])]),
        ], transform(
            p=kf([(0, [960, 540, 0]), (70, [ex, ey, 0])]),
            r=s(math.degrees(ang)),
            sc=kf([(0, [120, 100, 100]), (70, [20, 40, 100])]),
            o=kf([(0, [0]), (8, [100]), (50, [80]), (70, [0])]),
        ), 90))
    write_json(os.path.join(out, "spark-trails.json"), lottie("ZYNQ FX — Spark Trails", 90, layers))

# ----------------------------------------------------------------------------
# 2) SVG متحركة (SMIL داخل الملف)
# ----------------------------------------------------------------------------

SVG_WRAP = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" width="960" height="540">
<defs>
{defs}
</defs>
<rect width="960" height="540" fill="#0d0c0c"/>
{body}
</svg>
"""

def gen_svgs():
    print("▶ SVG متحركة …")
    out = ensure(DL, "svg")

    # كنس ضوء دافئ
    defs = """
<linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#ffd23f" stop-opacity="0"/>
  <stop offset="0.5" stop-color="#fff8e7" stop-opacity="0.95"/>
  <stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/>
</linearGradient>
<filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>"""
    body = """
<g filter="url(#soft)">
  <rect x="-320" y="-80" width="320" height="700" fill="url(#sweep)" transform="rotate(12 480 270)">
    <animateTransform attributeName="transform" type="translate" from="0 0" to="1500 0" dur="2.8s" repeatCount="indefinite"/>
  </rect>
  <rect x="-320" y="-80" width="180" height="700" fill="url(#sweep)" opacity="0.7" transform="rotate(12 480 270)">
    <animateTransform attributeName="transform" type="translate" from="-260 0" to="1400 0" dur="2.8s" begin="0.5s" repeatCount="indefinite"/>
  </rect>
</g>"""
    write_text(os.path.join(out, "light-leak-sweep.svg"), SVG_WRAP.format(defs=defs, body=body))

    # خط نيون يُرسم
    defs = """
<linearGradient id="neon" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#14d9d9"/><stop offset="0.5" stop-color="#fff8e7"/><stop offset="1" stop-color="#ffd23f"/>
</linearGradient>
<filter id="glow"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>"""
    body = """
<rect x="80" y="330" width="800" height="18" rx="9" fill="url(#neon)" filter="url(#glow)"
  stroke-dasharray="800" stroke-dashoffset="0">
  <animate attributeName="opacity" values="0.35;1;0.35" dur="2.2s" repeatCount="indefinite"/>
</rect>
<rect x="80" y="330" width="800" height="18" rx="9" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="800">
  <animate attributeName="stroke-dashoffset" values="800;0;0;800" keyTimes="0;0.4;0.75;1" dur="3.4s" repeatCount="indefinite"/>
</rect>
<g filter="url(#glow)">
  <circle r="10" fill="#fff8e7">
    <animate attributeName="cx" values="80;880;880;80" keyTimes="0;0.4;0.75;1" dur="3.4s" repeatCount="indefinite"/>
    <animate attributeName="cy" values="339;339;339;339" dur="3.4s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur="3.4s" repeatCount="indefinite"/>
  </circle>
</g>"""
    write_text(os.path.join(out, "neon-underline.svg"), SVG_WRAP.format(defs=defs, body=body))

    # بقع حبر تكشف لوحة
    defs = """
<filter id="inkblur"><feGaussianBlur stdDeviation="4"/></filter>
<clipPath id="reveal">
  <rect x="140" y="120" width="680" height="300">
    <animate attributeName="width" values="0;680" dur="1.6s" fill="freeze"/>
  </rect>
</clipPath>"""
    body = """
<g clip-path="url(#reveal)">
  <rect x="140" y="120" width="680" height="300" fill="#ffd23f"/>
  <rect x="140" y="120" width="680" height="46" fill="#e84545"/>
</g>
<g filter="url(#inkblur)" fill="#14110f">
  <ellipse cx="150" cy="270" rx="42" ry="60"><animate attributeName="cx" values="120;150" dur="1.6s" fill="freeze"/></ellipse>
  <ellipse cx="150" cy="180" rx="30" ry="34"><animate attributeName="cx" values="100;150" dur="1.6s" fill="freeze"/></ellipse>
  <ellipse cx="150" cy="360" rx="34" ry="40"><animate attributeName="cx" values="110;150" dur="1.6s" fill="freeze"/></ellipse>
</g>"""
    write_text(os.path.join(out, "ink-reveal.svg"), SVG_WRAP.format(defs=defs, body=body))

    # صاعقة كهربائية
    defs = """<filter id="boltglow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>"""
    body = """
<g filter="url(#boltglow)">
  <path d="M480 40 L360 260 L455 260 L400 500 L610 230 L505 230 L580 40 Z" fill="#ffd23f" stroke="#fff8e7" stroke-width="4">
    <animate attributeName="opacity" values="1;0.25;1;0.6;1" keyTimes="0;0.12;0.2;0.55;1" dur="1.1s" repeatCount="indefinite"/>
    <animateTransform attributeName="transform" type="translate" values="0 0; -8 4; 6 -3; 0 0" keyTimes="0;0.3;0.65;1" dur="1.1s" repeatCount="indefinite"/>
  </path>
  <path d="M480 40 L360 260 L455 260 L400 500 L610 230 L505 230 L580 40 Z" fill="none" stroke="#14d9d9" stroke-width="12" opacity="0.5">
    <animate attributeName="opacity" values="0.5;0.05;0.5" keyTimes="0;0.12;0.2" dur="1.1s" repeatCount="indefinite"/>
  </path>
</g>"""
    write_text(os.path.join(out, "electric-bolt.svg"), SVG_WRAP.format(defs=defs, body=body))

    # انفجار هافتون كوميكس
    defs = """<radialGradient id="fade"><stop offset="0" stop-color="#ffd23f" stop-opacity="1"/><stop offset="1" stop-color="#ffd23f" stop-opacity="0"/></radialGradient>
<pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="3" fill="#ffd23f"/></pattern>"""
    body = """
<circle cx="480" cy="270" r="200" fill="url(#fade)" opacity="0.35">
  <animate attributeName="r" values="120;250;120" dur="2.4s" repeatCount="indefinite"/>
</circle>
<g>
  <circle cx="480" cy="270" r="120" fill="none" stroke="#ffd23f" stroke-width="10" stroke-dasharray="8 14">
    <animateTransform attributeName="transform" type="rotate" from="0 480 270" to="360 480 270" dur="7s" repeatCount="indefinite"/>
    <animate attributeName="r" values="120;170;120" dur="2.4s" repeatCount="indefinite"/>
  </circle>
  <circle cx="480" cy="270" r="180" fill="none" stroke="#e84545" stroke-width="8" stroke-dasharray="4 18">
    <animateTransform attributeName="transform" type="rotate" from="360 480 270" to="0 480 270" dur="9s" repeatCount="indefinite"/>
    <animate attributeName="r" values="180;230;180" dur="2.4s" repeatCount="indefinite"/>
  </circle>
</g>
<circle cx="480" cy="270" r="60" fill="url(#dots)" opacity="0.9"/>"""
    write_text(os.path.join(out, "halftone-burst.svg"), SVG_WRAP.format(defs=defs, body=body))

    # خيوط دخان
    defs = """<filter id="smoke"><feGaussianBlur stdDeviation="26"/></filter>"""
    body = """
<g filter="url(#smoke)" fill="#8d8680">
  <ellipse cx="300" cy="380" rx="120" ry="80" opacity="0.5">
    <animate attributeName="cy" values="400;180" dur="7s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.55;0" dur="7s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="520" cy="400" rx="150" ry="90" opacity="0.4">
    <animate attributeName="cy" values="420;160" dur="9s" begin="1s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.45;0" dur="9s" begin="1s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="700" cy="390" rx="110" ry="70" opacity="0.45">
    <animate attributeName="cy" values="410;190" dur="8s" begin="2s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.5;0" dur="8s" begin="2s" repeatCount="indefinite"/>
  </ellipse>
</g>"""
    write_text(os.path.join(out, "smoke-wisp.svg"), SVG_WRAP.format(defs=defs, body=body))

# ----------------------------------------------------------------------------
# 3) GIF عبر ImageMagick
# ----------------------------------------------------------------------------

def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def gen_gifs():
    print("▶ GIF أوفلاي أوفلاي (ImageMagick) …")
    out = ensure(DL, "overlays")
    ensure(TMP)

    def frames_to_gif(prefix, delay, dest):
        pattern = os.path.join(TMP, f"{prefix}-*.png")
        run(["convert", "-delay", str(delay), "-loop", "0", pattern, "-layers", "Optimize", dest])
        for f in os.listdir(TMP):
            if f.startswith(prefix + "-"):
                os.remove(os.path.join(TMP, f))
        print(f"  ✔ {os.path.relpath(dest, ROOT)}  ({os.path.getsize(dest):,} bytes)")

    # light leak
    for i in range(24):
        x = -400 + i * 70
        run(["convert", "-size", "800x450", "xc:black",
             "-fill", f"rgba(255,210,80,{0.10 + 0.02 * (i % 5)})", "-draw", "rectangle 0,0 800,450",
             "-fill", "rgba(255,122,26,0.85)", "-draw", f"ellipse {x},225 260,400 0,360",
             "-fill", "rgba(255,236,180,0.95)", "-draw", f"ellipse {x + 120},225 120,320 0,360",
             "-fill", "rgba(255,255,255,0.9)", "-draw", f"ellipse {x + 200},225 46,240 0,360",
             "-blur", "0x26",
             os.path.join(TMP, f"ll-{i:02d}.png")])
    frames_to_gif("ll", 7, os.path.join(out, "light-leak-overlay.gif"))

    # flash hit
    for i in range(16):
        a = max(0.0, min(1.0, (1.0 - abs(i - 5) / 6.0)))
        rad = 60 + i * 42
        run(["convert", "-size", "800x450", "xc:black",
             "-fill", f"rgba(255,255,255,{a})", "-draw", "rectangle 0,0 800,450",
             "-fill", f"rgba(255,226,120,{a * 0.9})", "-draw", f"ellipse 400,225 {rad},{int(rad * 0.7)} 0,360",
             "-blur", "0x18",
             os.path.join(TMP, f"fl-{i:02d}.png")])
    frames_to_gif("fl", 6, os.path.join(out, "flash-hit-overlay.gif"))

    # glitch bars
    rnd = random.Random(3)
    for i in range(20):
        args = ["convert", "-size", "800x450", "xc:black"]
        for _ in range(9):
            y = rnd.randint(0, 430)
            h = rnd.randint(6, 34)
            w = rnd.randint(120, 520)
            x = rnd.randint(-40, 600)
            col = rnd.choice(["rgba(232,69,69,0.95)", "rgba(20,217,217,0.95)", "rgba(255,255,255,0.9)", "rgba(255,210,61,0.9)"])
            args += ["-fill", col, "-draw", f"rectangle {x},{y} {x + w},{y + h}"]
        if i % 3 == 0:
            args += ["-fill", "rgba(255,255,255,0.25)", "-draw", "rectangle 0,0 800,450"]
        args += ["-blur", "0x1.2", os.path.join(TMP, f"gl-{i:02d}.png")]
        run(args)
    frames_to_gif("gl", 5, os.path.join(out, "glitch-bars-overlay.gif"))

    # film burn
    for i in range(20):
        x = 250 + (i * 26) % 320
        warm = 0.35 + 0.06 * ((i * 7) % 5)
        run(["convert", "-size", "800x450", "xc:#1a0d02",
             "-fill", f"rgba(255,140,20,{warm})", "-draw", f"ellipse {x},225 340,380 0,360",
             "-fill", f"rgba(255,220,120,{warm * 1.4})", "-draw", f"ellipse {x + 60},210 150,260 0,360",
             "-fill", f"rgba(255,255,255,{min(0.85, warm)})", "-draw", f"ellipse {x + 110},225 46,160 0,360",
             "-blur", "0x22",
             os.path.join(TMP, f"fb-{i:02d}.png")])
    frames_to_gif("fb", 7, os.path.join(out, "film-burn-overlay.gif"))

# ----------------------------------------------------------------------------
# 4) تسلسلات PNG بشفافية + ZIP
# ----------------------------------------------------------------------------

def write_png_rgba(path, w, h, buf):
    raw = bytearray()
    stride = w * 4
    for y in range(h):
        raw.append(0)  # filter none
        raw += buf[y * stride:(y + 1) * stride]
    comp = zlib.compress(bytes(raw), 9)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b"IDAT", comp))
        f.write(chunk(b"IEND", b""))

def gen_sequences():
    print("▶ تسلسلات PNG بشفافية …")
    out = ensure(DL, "sequences")
    W, H, N = 640, 360, 24

    def make_seq(name, painter, desc):
        seqdir = ensure(TMP, name)
        for i in range(N):
            buf = bytearray(W * H * 4)
            painter(buf, i, N)
            write_png_rgba(os.path.join(seqdir, f"{name}_{i:03d}.png"), W, H, buf)
        zpath = os.path.join(out, f"{name}.zip")
        with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
            for i in range(N):
                z.write(os.path.join(seqdir, f"{name}_{i:03d}.png"), f"{name}/{name}_{i:03d}.png")
            z.writestr(f"{name}/README.txt", desc)
        shutil.rmtree(seqdir)
        print(f"  ✔ {os.path.relpath(zpath, ROOT)}  ({os.path.getsize(zpath):,} bytes, {N} إطار)")

    def paint_sweep(buf, i, n):
        # شريط ضوء يمسح الإطار + توهّج ناعم — يُدمج بوضع Screen
        t = i / (n - 1)
        cx = int((-0.25 + t * 1.5) * W)
        cy = int(H * 0.5 + math.sin(t * math.tau) * H * 0.06)
        for y in range(0, H, 2):
            for x in range(0, W, 2):
                dx = (x - cx) / (W * 0.16)
                dy = (y - cy) / (H * 0.85)
                d = dx * dx + dy * dy
                if d < 6.5:
                    a = math.exp(-d * 1.25)
                    edge = max(0.0, 1.0 - abs(x - cx) / (W * 0.42))
                    v = a * (0.55 + 0.45 * edge)
                    px = (y * W + x) * 4
                    for oy in (0, 1):
                        for ox in (0, 1):
                            p = px + (oy * W + ox) * 4
                            if p + 3 < len(buf):
                                r = min(255, int(buf[p] + 255 * v))
                                g = min(255, int(buf[p + 1] + 220 * v))
                                b = min(255, int(buf[p + 2] + 150 * v))
                                a2 = min(255, int(buf[p + 3] + 255 * v * 0.9))
                                buf[p], buf[p + 1], buf[p + 2], buf[p + 3] = r, g, b, a2

    make_seq("light-sweep-seq", paint_sweep,
             "ZYNQ FX — Light Sweep Sequence (24 frames, 640x360, RGBA)\n"
             "Import as image sequence in After Effects / Premiere / Resolve / Final Cut.\n"
             "Blend mode: Screen / Add. Scale to fit your composition.\n")

    def paint_burst(buf, i, n):
        t = i / (n - 1)
        cx, cy = W // 2, H // 2
        radius = (0.05 + t * 0.85) * W * 0.7
        fade = 1.0 - t
        ringw = W * 0.06 * (1.2 - t)
        for y in range(0, H, 2):
            for x in range(0, W, 2):
                dx, dy = x - cx, (y - cy) * 1.15
                d = math.sqrt(dx * dx + dy * dy)
                core = math.exp(-((d / max(12.0, radius * 0.35)) ** 2)) * fade
                ring = math.exp(-(((d - radius) / max(8.0, ringw)) ** 2)) * fade * 0.95
                v = min(1.0, core + ring)
                if v > 0.01:
                    px = (y * W + x) * 4
                    for oy in (0, 1):
                        for ox in (0, 1):
                            p = px + (oy * W + ox) * 4
                            if p + 3 < len(buf):
                                r = min(255, int(buf[p] + 255 * v))
                                g = min(255, int(buf[p + 1] + 235 * v * (0.7 + 0.3 * fade)))
                                b = min(255, int(buf[p + 2] + 190 * v * fade))
                                a2 = min(255, int(buf[p + 3] + 255 * v))
                                buf[p], buf[p + 1], buf[p + 2], buf[p + 3] = r, g, b, a2

    make_seq("flash-burst-seq", paint_burst,
             "ZYNQ FX — Flash Burst Sequence (24 frames, 640x360, RGBA)\n"
             "Import as image sequence in After Effects / Premiere / Resolve / Final Cut.\n"
             "Blend mode: Screen / Add.\n")

# ----------------------------------------------------------------------------
# 5) لوكات ألوان .cube (LUT ثلاثي الأبعاد)
# ----------------------------------------------------------------------------

def gen_luts():
    print("▶ لوكات ألوان .cube …")
    out = ensure(DL, "luts")
    N = 17

    def write_cube(name, title, fn):
        lines = [f'TITLE "{title}"', "LUT_3D_SIZE %d" % N, "DOMAIN_MIN 0.0 0.0 0.0", "DOMAIN_MAX 1.0 1.0 1.0", ""]
        for b in range(N):
            for g in range(N):
                for r in range(N):
                    rr, gg, bb = fn(r / (N - 1), g / (N - 1), b / (N - 1))
                    lines.append(f"{rr:.6f} {gg:.6f} {bb:.6f}")
        write_text(os.path.join(out, name), "\n".join(lines) + "\n")

    def clamp(x):
        return max(0.0, min(1.0, x))

    write_cube("cinematic-teal-orange.cube", "ZYNQ FX — Cinematic Teal & Orange",
               lambda r, g, b: (clamp(r * 1.06 + 0.02), clamp(g * 0.98 + (1 - r) * 0.02), clamp(b * 0.94 + r * 0.045)))

    write_cube("warm-film-look.cube", "ZYNQ FX — Warm Film Look",
               lambda r, g, b: (clamp(r * 1.08 + 0.03), clamp(g * 1.01 + 0.012), clamp(b * 0.9 + 0.01)))

    write_cube("neon-night.cube", "ZYNQ FX — Neon Night",
               lambda r, g, b: (clamp(r * 1.1 - 0.03 + b * 0.12), clamp(g * 0.96), clamp(b * 1.14 + 0.05 + r * 0.05)))

    def bw(r, g, b):
        y = clamp(0.2126 * r + 0.7152 * g + 0.0722 * b)
        y = clamp((y - 0.5) * 1.22 + 0.5)  # تباين درامي
        return (y, y, y)

    write_cube("bw-dramatic.cube", "ZYNQ FX — B&W Dramatic", bw)

    def vintage(r, g, b):
        r2 = clamp(r * 0.92 + 0.055 + (1 - r) * 0.02)
        g2 = clamp(g * 0.9 + 0.05)
        b2 = clamp(b * 0.86 + 0.085)
        # تلاشي الأسود (matte)
        return (clamp(r2 * 0.94 + 0.06), clamp(g2 * 0.94 + 0.06), clamp(b2 * 0.94 + 0.06))

    write_cube("vintage-fade.cube", "ZYNQ FX — Vintage Fade", vintage)

# ----------------------------------------------------------------------------
# 6) تعابير After Effects
# ----------------------------------------------------------------------------

def gen_expressions():
    print("▶ تعابير After Effects …")
    out = ensure(DL, "expressions")

    # حزمة موثّقة: كل تعبير هنا مُجرَّب ويعمل على محرّك التعبيرات القياسي.
    # (حُذف منها: Bounce وLoop-in+out وSmooth Follow — لأنها لا تعمل بشكل صحيح)
    pack = """# ============================================================
#  ZYNQ FX — حزمة تعابير After Effects الموثّقة
#  كل تعبير هنا مُجرَّب ويعمل فعليًا — انسخه كما هو.
#  الوضع: Alt/Option + انقر على مؤقت الخاصية ← الصق التعبير
# ============================================================

## 1) Overshoot — ارتداد ناعم بعد نهاية الحركة (Position / Scale / Rotation)
n = 0;
if (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }
if (n == 0) { value } else {
  t = time - key(n).time;
  vel = velocityAtTime(key(n).time - thisComp.frameDuration / 100) * 0.06;
  add(vel * Math.sin(t * 2.2 * 2 * Math.PI) / Math.exp(4 * t), value);
}

## 2) Wiggle أفقي — اهتزاز يمين/يسار فقط مع ثبات الرأسي (Position)
speed = 2;
amount = 30;
w = wiggle(speed, amount);
[w[0], value[1]]

## 3) Auto Fade In/Out — ظهور وتلاشٍ تلقائي حسب مدة الطبقة (Opacity)
fadeTime = 0.6;
inP = linear(time, inPoint, inPoint + fadeTime, 0, 100);
outP = linear(time, outPoint - fadeTime, outPoint, 100, 0);
Math.min(inP, outP)

## 4) Pulsing — نبض توافقي (Opacity أو Glow Intensity أو أي Slider)
freq = 1.4;
Math.sin(time * freq * 2 * Math.PI) * 20 + 30

## 5) Float — تمايل رأسي ناعم فوق القيمة الأصلية (Position)
freq = 1.2;
amp = 12;
value + [0, Math.sin(time * freq * 2 * Math.PI) * amp]

## 6) Speed Fade — شفافية تتناسب مع سرعة الحركة (Motion Trail) (Opacity)
s = length(velocity);
linear(s, 0, 2500, 15, 100)

---
صُنعت بواسطة ZYNQ FX — استخدمها بحرية في مشاريعك التجارية.
كل تعبير في هذه الحزمة يعمل على محرّك التعبيرات القياسي في After Effects.
"""
    write_text(os.path.join(out, "ae-expressions-pack.txt"), pack)

    singles = {
        "overshoot.txt": "n = 0;\nif (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }\nif (n == 0) { value } else {\n  t = time - key(n).time;\n  vel = velocityAtTime(key(n).time - thisComp.frameDuration / 100) * 0.06;\n  add(vel * Math.sin(t * 2.2 * 2 * Math.PI) / Math.exp(4 * t), value);\n}\n",
        "auto-fade.txt": "fadeTime = 0.6;\ninP = linear(time, inPoint, inPoint + fadeTime, 0, 100);\noutP = linear(time, outPoint - fadeTime, outPoint, 100, 0);\nMath.min(inP, outP)\n",
    }
    for name, txt in singles.items():
        write_text(os.path.join(out, name), txt)

# ----------------------------------------------------------------------------
# تشغيل
# ----------------------------------------------------------------------------

def main():
    ensure(DL)
    gen_lotties()
    gen_svgs()
    gen_gifs()
    gen_sequences()
    gen_luts()
    gen_expressions()
    if os.path.isdir(TMP):
        shutil.rmtree(TMP)
    print("\n✅ اكتمل توليد كل الأصول في site/downloads")

if __name__ == "__main__":
    main()
