#!/usr/bin/env python3
# ===========================================================================
#  ZYNQ FX — مولّد ملفات المساعد الآلي (الروبوت)
#  ينشئ 100 ملف متنوّع عاملاً جميعاً، مع بيانệt عربي (files.json)
#  يستخدم مكتبة Python القياسية فقط — بلا أيّ مكتبات خارجية.
#  التشغيل:  python3 tools/gen_files.py
# ===========================================================================
import os, struct, zlib, json, wave, math, zipfile, io, random
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES_DIR = os.path.join(ROOT, 'site', 'public', 'files')
MANIFEST = os.path.join(FILES_DIR, 'files.json')

random.seed(20261101)

CATEGORIES_AR = {
    'avatars': 'صور شخصية',
    'logos': 'شعارات',
    'icons': 'أيقونات',
    'wallpapers': 'خلفيات',
    'ringtones': 'نغمات',
    'nature': 'أصوات الطبيعة',
    'alerts': 'تنبيهات',
    'texts': 'نصوص عربية',
    'json': 'بيانات JSON',
    'csv': 'بيانات CSV',
    'html': 'صفحات ويب',
    'js': 'سكريبتات',
    'css': 'أنماط CSS',
    'zip': 'حزم مضغوطة',
}

CAT_ARABIC = {
    'avatars': 'صور شخصية',
    'logos': 'شعارات',
    'icons': 'أيقونات',
    'wallpapers': 'خلفيات',
    'ringtones': 'نغمات',
    'nature': 'أصوات الطبيعة',
    'alerts': 'تنبيهات',
    'texts': 'نصوص عربية',
    'json': 'بيانات JSON',
    'csv': 'بيانات CSV',
    'html': 'صفحات ويب',
    'js': 'سكريبتات',
    'css': 'أنماط CSS',
    'zip': 'حزم مضغوطة',
}

MIME = {
    'svg': 'image/svg+xml',
    'png': 'image/png',
    'wav': 'audio/wav',
    'txt': 'text/plain; charset=utf-8',
    'md': 'text/markdown; charset=utf-8',
    'json': 'application/json; charset=utf-8',
    'csv': 'text/csv; charset=utf-8',
    'html': 'text/html; charset=utf-8',
    'js': 'text/javascript; charset=utf-8',
    'css': 'text/css; charset=utf-8',
    'zip': 'application/zip',
}

def png(w, h, px):
    """مُرمِّز PNG مصغَّر (فلتر無، RGBA مضغوط بـ deflate)."""
    raw = bytearray()
    for row in px:
        raw.append(0)  # فلتر لا شيء
        for r, g, b, a in row:
            raw += struct.pack('BBBB', r, g, b, a)
    data = zlib.compress(bytes(raw), 6)

    def chunk(t, d):
        c = zlib.crc32(t + d) & 0xffffffff
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', c)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    idat = chunk(b'IDAT', data)
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

def wav(samples, sr=22050):
    """ملف WAVPCM 16 بت صافٍ من عيّنات بين -1 و 1."""
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s)) * 30000)) for s in samples))
    return buf.getvalue()

def tone(freq, dur, sr=22050, kind='sine', vol=0.5):
    n = int(sr * dur)
    out = []
    for i in range(n):
        t = i / sr
        if kind == 'sine':
            v = math.sin(2 * math.pi * freq * t)
        elif kind == 'square':
            v = 1.0 if math.sin(2 * math.pi * freq * t) >= 0 else -1.0
        elif kind == 'saw':
            v = 2 * ((freq * t) % 1) - 1
        elif kind == 'tri':
            x = (freq * t) % 1
            v = 4 * abs(x - 0.5) - 1
        elif kind == 'noise':
            v = random.uniform(-1, 1)
        else:
            v = 0
        out.append(v * vol * (1 - i / n))  #微弱 تناقص في النهاية
    return out

def chord(freqs, dur, sr=22050, kind='sine', vol=0.3):
    n = int(sr * dur)
    out = []
    for i in range(n):
        t = i / sr
        v = 0
        for f in freqs:
            v += math.sin(2 * math.pi * f * t)
        v = v / len(freqs)
        out.append(v * vol * (1 - i / n))
    return out

AR_WORDS = [
    'مرحبا', 'زيتونة', 'زينك', 'تأثير', 'مؤثر', 'ضوء', 'سطوع', 'لون', 'بنى', 'أخضر',
    'أزرق', 'أحمر', 'أصفر', 'بنفسجي', 'برتقالي', 'وردي', 'أسود', 'أبيض', 'رمادي',
    'شعار', 'حركي', 'بريمير', 'أفتر', 'ريزولف', 'فاينال', 'كت', 'ويب', 'موبايل',
    'تصميم', 'فيليب', 'طفل', 'قمر', 'شمس', 'نجم', 'مجرة', 'بحر', 'جبل', 'صحراء',
    'غابة', 'زهرة', 'شجرة', 'طائر', 'سمكة', 'أسد', 'نمر', 'فيل', 'حصان', 'كلب',
    'قطة', 'أرنب', 'غزال', 'نخلة', 'وردة', 'ياسمين', 'زنبق', 'قلم', 'ورقة', 'كتاب',
    'مدرسة', 'جامعة', 'مستشفى', 'مطار', 'محطة', 'قطار', 'طائرة', 'سيارة', 'دراجة',
    'ساعة', 'هاتف', 'حاسوب', 'لوحة', 'قلم', 'مفتاح', 'باب', 'نافذة', 'كرسي', 'طاولة',
]

def lorem_ar(n=40):
    return ' '.join(random.choice(AR_WORDS) for _ in range(n))

def ensure(d):
    os.makedirs(d, exist_ok=True)

def write(rel, data):
    full = os.path.join(FILES_DIR, rel)
    ensure(os.path.dirname(full))
    with open(full, 'wb') as f:
        f.write(data)
    return full

entries = []
counter = [0]

def add(rel, data, category, name_ar, desc_ar):
    counter[0] += 1
    full = write(rel, data)
    size = os.path.getsize(full)
    ext = os.path.splitext(rel)[1].lstrip('.')
    entries.append({
        'id': f'f{counter[0]:03d}',
        'name': name_ar,
        'category': category,
        'categoryAr': CAT_ARABIC[category],
        'type': MIME.get(ext, 'application/octet-stream'),
        'ext': ext,
        'size': size,
        'url': f'/files/{rel}',
        'desc': desc_ar,
    })

# ---------------------------------------------------------------- الصور الشخصية
for i in range(1, 6):
    r, g, b = [random.randint(60, 230) for _ in range(3)]
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <circle cx="100" cy="100" r="90" fill="#{r:02x}{g:02x}{b:02x}"/>
  <circle cx="100" cy="78" r="34" fill="#fff" opacity=".9"/>
  <path d="M70 120 Q100 160 130 120" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
  <text x="100" y="140" text-anchor="middle" fill="#fff" font-size="26" font-weight="bold" font-family="system-ui,sans-serif">ز{i}</text>
</svg>'''
    add(f'avatars/avatar-{i:02d}.svg', svg.encode('utf-8'), 'avatars',
        f'صورة شخصية رقم {i}',
        f'صورة شخصية ملونة رقم {i} لاستخدامها كصورة ملف شخصي.')
for i in range(6, 11):
    r, g, b = [random.randint(40, 200) for _ in range(3)]
    px = [[(r, g, b, 255) if (x + y) % 2 == 0 else (255, 255, 255, 255) for x in range(120)] for y in range(120)]
    add(f'avatars/avatar-{i:02d}.png', png(120, 120, px), 'avatars',
        f'صورة شخصية بكسل رقم {i}',
        f'صورة شخصية بكسلية رقم {i} بتصميم 뚜حبان.')

# ---------------------------------------------------------------- الشعارات
logo_shapes = ['برق', 'نجم', 'دائرة', 'مثلث', 'مربع', 'هاتف', 'كاميرا', 'قلب']
for i, shape in enumerate(logo_shapes, 1):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#0b0e16"/>
  <path d="M100 20 L130 80 L190 80 L140 120 L160 180 L100 140 L40 180 L60 120 L10 80 L70 80 Z" fill="#ffd23f"/>
  <text x="100" y="175" text-anchor="middle" fill="#fff" font-size="18" font-weight="bold" font-family="system-ui,sans-serif">ZYNQ {shape}</text>
</svg>'''
    add(f'logos/logo-{i:02d}.svg', svg.encode('utf-8'), 'logos',
        f'شعار ZYNQ — {shape}',
        f'شعار زينك على شكل {shape} للعمل التجاري والهوية البصرية.')

# ---------------------------------------------------------------- الأيقونات
icon_symbols = ['تشغيل', 'تحميل', 'مشاركة', 'بحث', 'إعدادات', 'إعجاب', 'تعليق', 'إيقاف']
for i, sym in enumerate(icon_symbols, 1):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="28" fill="#7c3aed"/>
  <text x="32" y="40" text-anchor="middle" fill="#fff" font-size="26" font-weight="bold" font-family="system-ui,sans-serif">●</text>
  <text x="32" y="52" text-anchor="middle" fill="#ffd23f" font-size="14" font-family="system-ui,sans-serif">{sym[:1]}</text>
</svg>'''
    add(f'icons/icon-{i:02d}.svg', svg.encode('utf-8'), 'icons',
        f'أيقونة {sym}',
        f'أيقونة رمز {sym} بتصميم نيون 사용.')

# ---------------------------------------------------------------- الخلفيات
for i in range(1, 5):
    c1 = [random.randint(0, 80) for _ in range(3)]
    c2 = [random.randint(150, 255) for _ in range(3)]
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
  <defs><linearGradient id="g{i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="rgb({c1[0]},{c1[1]},{c1[2]})"/><stop offset="100%" stop-color="rgb({c2[0]},{c2[1]},{c2[2]})"/></linearGradient></defs>
  <rect width="400" height="300" fill="url(#g{i})"/>
  <circle cx="{random.randint(50,350)}" cy="{random.randint(50,250)}" r="{random.randint(30,80)}" fill="#fff" opacity=".15"/>
</svg>'''
    add(f'wallpapers/wall-{i:02d}.svg', svg.encode('utf-8'), 'wallpapers',
        f'خلفية تدرجية رقم {i}',
        f'خلفية تدرجية ملونة رقم {i} للشاشات والعروض التقديمية.')
for i in range(5, 9):
    r, g, b = [random.randint(30, 120) for _ in range(3)]
    px = [[(r + (x*3) % 60, g + (y*2) % 60, b + (x+y) % 60, 255) for x in range(200)] for y in range(150)]
    add(f'wallpapers/wall-{i:02d}.png', png(200, 150, px), 'wallpapers',
        f'خلفية بكسلية رقم {i}',
        f'خلفية بكسلية هادئة رقم {i} تعمل كخلفية سطح مكتب.')

# ---------------------------------------------------------------- النغمات
for i in range(1, 6):
    f0 = 220 + i * 45
    s = tone(f0, 0.9, kind='tri', vol=0.45) + tone(f0 * 1.5, 0.9, kind='sine', vol=0.25)
    add(f'audio/ringtones/ring-{i:02d}.wav', wav(s), 'ringtones',
        f'نغمة هاتف رقم {i}',
        f'نغمة تنبيه هاتفية رقم {i} نغمة واضحة ومختصرة.')
for i in range(6, 11):
    s = chord([440, 554, 659], 1.0, kind='sine', vol=0.35) + tone(880, 0.4, kind='tri', vol=0.2)
    add(f'audio/ringtones/ring-{i:02d}.wav', wav(s), 'ringtones',
        f'نغمة تراثية رقم {i}',
        f'نغمة تراثية شرقية رقم {i} للعرض والإشعارات.')

# ---------------------------------------------------------------- أصوات الطبيعة
nature = [('أمطار', 'tri'), (('أمواج البحر', 'sine')), ('ريح forest', 'saw'), ('طيور', 'tri'),
          ('م fogo', 'saw'), ('ثunder', 'sine'), ('شلال', 'tri'), ('رياح شتاء', 'sine')]
for i, (nm, kind) in enumerate(nature, 1):
    s = []
    base = 110 + i * 30
    for _ in range(40):
        s += tone(base + random.randint(-40, 40), 0.06, kind=kind, vol=random.uniform(0.15, 0.4))
    add(f'audio/nature/nature-{i:02d}.wav', wav(s), 'nature',
        f'صوت طبيعة — {nm}',
        f'تسجيل صناعي لصوت {nm} مناسب للاسترخاء والتصميم الصوتي.')

# ---------------------------------------------------------------- التنبيهات
alerts = ['تنبيه-success', 'تنبيه-error', 'تنبيه-warning', 'تنبيه-info', 'تنبيه-attention', 'تنبيه-done']
for i, nm in enumerate(alerts, 1):
    s2 = tone(900 + i * 60, 0.18, kind='tri', vol=0.5) + tone(1400 + i * 60, 0.25, kind='tri', vol=0.45)
    add(f'audio/alerts/alert-{i:02d}.wav', wav(s2), 'alerts',
        f'تنبيه {nm.split("-")[1]}',
        f'صوت تنبيه قصير من نوع {nm.split("-")[1]} لواجهات المستخدم.')

# ---------------------------------------------------------------- النصوص العربية
for i in range(1, 6):
    txt = f'''نص عربي رقم {i}
{'='*30}
{lorem_ar(50)}
{lorem_ar(50)}
هذا النص جاهز للاستخدام في مشاريع التصميم والتجريب، وهو ملف نصي صالح تماماً.
تاريخ الإنشاء: {datetime.now(timezone.utc).strftime("%Y-%m-%d")}
'''
    add(f'texts/text-{i:02d}.txt', txt.encode('utf-8'), 'texts',
        f'نص عربي模板 رقم {i}',
        f'نص عربي تجريبي طويل رقم {i} للاختبار والتصميم.')
for i in range(6, 11):
    md = f'''# وثيقة رقم {i}

## مقدمة
هذا ملف ماركداون عربي ({i}) يحتوي على:

- عنصر أول
- عنصر ثاني
- عنصر ثالث

## قسم فرعي
{lorem_ar(30)}

---
زر ZYNQ FX — توليد تلقائي
'''
    add(f'texts/doc-{i:02d}.md', md.encode('utf-8'), 'texts',
        f'وثيقة ماركداون رقم {i}',
        f'ملف ماركداون منظم رقم {i} للعرض والتوثيق.')

# ---------------------------------------------------------------- بيانات JSON
for i in range(1, 5):
    data = {
        'id': i,
        'الاسم': f'منتج {i}',
        'النوع': random.choice(list(CATEGORIES_AR.values())),
        'السعر': round(random.uniform(10, 500), 2),
        'متوفر': random.choice([True, False]),
        'التصنيف': lorem_ar(8),
        'التاريخ': '2026-11-01',
    }
    add(f'data/json/product-{i:02d}.json', (json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode('utf-8'), 'json',
        f'منتج JSON رقم {i}',
        f'ملف بيانات JSON番号 {i} يحتوي على تفاصيل منتج باللغة العربية.')
for i in range(5, 9):
    data = {'المستخدم': f'مستخدم {i}', 'البريد': f'user{i}@zynq.test', 'الدور': random.choice(['مدير', 'مصمم', 'مطور']), 'النقاط': random.randint(0, 1000)}
    add(f'data/json/user-{i:02d}.json', (json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode('utf-8'), 'json',
        f'بيانات مستخدم JSON رقم {i}',
        f'ملف JSON لمستخدم رقم {i}suitable for APIs.')

# ---------------------------------------------------------------- بيانات CSV
for i in range(1, 4):
    lines = ['الاسم,المدينة,العمر,المهنة']
    for j in range(10):
        lines.append(f'شخص {i}-{j},{random.choice(["الرياض", "القاهرة", "دبي", "بيروت", "الرباط"])},{random.randint(18, 60)},{random.choice(["مصمم", "مطور", "كاتب", "مصور"])}')
    add(f'data/csv/list-{i:02d}.csv', ('\n'.join(lines) + '\n').encode('utf-8'), 'csv',
        f'قائمة بيانات CSV رقم {i}',
        f'ملف CSV جاهز للاستيراد في جداول البيانات رقم {i}.')
for i in range(4, 7):
    lines = ['التاريخ,المبيعات,الزوار']
    for j in range(7):
        lines.append(f'2026-10-{j+1:02d},{random.randint(100, 900)},{random.randint(50, 500)}')
    add(f'data/csv/stats-{i:02d}.csv', ('\n'.join(lines) + '\n').encode('utf-8'), 'csv',
        f'إحصائيات CSV رقم {i}',
        f'ملف إحصائيات أسبوعية رقم {i} للتقارير والرسوم البيانية.')

# ---------------------------------------------------------------- صفحات ويب
for i in range(1, 4):
    html = f'''<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>صفحة {i} — ZYNQ</title></head>
<body><h1>مرحباً بك في صفحة numero {i}</h1>
<p>{lorem_ar(40)}</p>
<a href="/">العودة للموقع</a>
</body></html>'''
    add(f'web/html/page-{i:02d}.html', html.encode('utf-8'), 'html',
        f'صفحة ويب عدد {i}',
        f'صفحة ويب عربية عدد {i} جاهزة للفتح في المتصفح.')
for i in range(4, 7):
    html = f'''<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>باقة {i}</title></head>
<body><h2>باقة التأثيرات {i}</h2>
<ul><li>تأثير {lorem_ar(3)}</li><li>تأثير {lorem_ar(3)}</li></ul>
</body></html>'''
    add(f'web/html/fx-{i:02d}.html', html.encode('utf-8'), 'html',
        f'باقة تأثيرات ويب رقم {i}',
        f'صفحة عرض لباقة تأثيرات رقم {i} للمواقع والتطبيقات.')

# ---------------------------------------------------------------- سكريبتات
for i in range(1, 4):
    js = f'''// سكريبت ZYNQ رقم {i}
function greet() {{ console.log('مرحباً من زينك رقم {i}!'); }}
const data = {{ id: {i}, version: '1.0.0', lang: 'ar' }};
export {{ greet, data }};
'''
    add(f'code/js/script-{i:02d}.js', js.encode('utf-8'), 'js',
        f'سكريبت JavaScript رقم {i}',
        f'ملف جافاسكريبت رقم {i} لنماذج الويب والتطبيقات.')
for i in range(4, 7):
    js = f'''/* أداة زينك رقم {i} */
const fx{i} = () => 'تأثير {i} نشط';
document.addEventListener('DOMContentLoaded', () => {{ console.log(fx{i}()); }});
'''
    add(f'code/js/tool-{i:02d}.js', js.encode('utf-8'), 'js',
        f'أداة ويب رقم {i}',
        f'أداة جافاسكريبت رقم {i} لتعديل واجهات المستخدم.')

# ---------------------------------------------------------------- أنماط CSS
for i in range(1, 4):
    css = f'''/* أنماط زينك رقم {i} */
.bot-card-{i} {{
  border: 2px solid #7c3aed;
  border-radius: 12px;
  padding: 16px;
  color: #fff;
  background: #0b0e16;
}}
.bot-card-{i}:hover {{ border-color: #ffd23f; }}
'''
    add(f'code/css/style-{i:02d}.css', css.encode('utf-8'), 'css',
        f'ملف أنماط CSS رقم {i}',
        f'ملف أنماط Cascading رقم {i} لتصميم بطاقات واجهة المستخدم.')

# ---------------------------------------------------------------- حزم مضغوطة
for i in range(1, 4):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr(f'readme-{i}.txt', f'هذا ملف داخل حزمة زينك المضغوطة رقم {i}.\nlorem: {lorem_ar(20)}\n')
        z.writestr(f'data-{i}.json', json.dumps({'pack': i, 'ok': True}, ensure_ascii=False) + '\n')
    add(f'packs/zip/pack-{i:02d}.zip', buf.getvalue(), 'zip',
        f'حزمة مضغوطة رقم {i}',
        f'ملف ZIP رقم {i} يحتوي على ملفات نصية وبيانات للتجريب.')

# ---------------------------------------------------------------- البيان العربي
manifest = {
    'version': 1,
    'count': len(entries),
    'generated': datetime.now(timezone.utc).isoformat(),
    'title': 'ملفات مساعد زينك الآلي',
    'description': '100 ملف متنوّع عاملاً لجميع الأنواع، يساعد الروبوت الزائر على الوصول إليها وتحميلها.',
    'lang': 'ar',
    'categories': CATEGORIES_AR,
    'files': entries,
}
with open(MANIFEST, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)

print(f'تم توليد {len(entries)} ملفًا في {FILES_DIR}')
print(f'البيان العربي: {MANIFEST}')
for c in sorted(CATEGORIES_AR):
    n = sum(1 for e in entries if e['category'] == c)
    print(f'  {CATEGORIES_AR[c]:14s}: {n} ملف')
