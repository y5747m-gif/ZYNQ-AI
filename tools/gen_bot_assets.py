#!/usr/bin/env python3
"""أصول البوت: 8 ملفات Lottie و8 ملفات SVG متحركة، قابلة لإعادة التوليد.
التشغيل من جذر المشروع: python3 tools/gen_bot_assets.py
ثم python3 tools/gen_files.py لتحديث مكتبة المساعد. لا مكتبات خارجية.
"""
import json
import math
from pathlib import Path
from html import escape
from gen_assets import s, kf, transform, rect, ellipse, fill, stroke, group, shape_layer, lottie

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'site' / 'downloads' / 'bot'
OUT.mkdir(parents=True, exist_ok=True)
PURPLE = [0.66, 0.47, 1, 1]
CYAN = [0.37, 0.83, 1, 1]
MINT = [0.29, 0.87, 0.65, 1]
GOLD = [1, 0.82, 0.25, 1]
WHITE = [1, 1, 1, 1]
items = []


def save_lottie(slug, name, description, layers, frames=120):
    path = OUT / f'{slug}.json'
    data = lottie(name, frames, layers, w=512, h=512)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    items.append(dict(id=f'bot-{slug}', name=name, tagline=description, category='bot',
                      programs=['web'], format='Lottie JSON', quality='512×512', fps='60fps',
                      file=f'downloads/bot/{slug}.json', preview='pulse', badge='جديد · البوت',
                      description=description + ' ملف متجهي بخلفية شفافة، قابل لتغيير الألوان والحجم دون فقدان الجودة.',
                      usage='افتح المعاينة في مساعد الملفات، أو حمّل JSON وشغّله بمكتبة lottie-web. في أفتر إيفكت استخدم إضافة Lottie/Bodymovin؛ يلزم تصديره إلى فيديو لاستخدامه مباشرة في بريمير.',
                      tags=['أنيميشن', 'مؤثرات البوت', 'animation', 'lottie', 'شفاف']))


def ring_layer(index, color, delay=0, diameter=240, width=12):
    return shape_layer(index, f'حلقة {index}', [group([ellipse(diameter), stroke(color, width)])],
                       transform(p=s([256, 256, 0]), sc=kf([(delay, [65, 65, 100]), (60, [115, 115, 100]), (120, [65, 65, 100])]),
                                 o=kf([(0, 35), (60, 100), (120, 35)])), 120)

# 1. تحية: حلقات متموجة ونواة مضيئة.
save_lottie('welcome-rings', 'حلقات الترحيب', 'ثلاث حلقات تستقبل الزائر وتتمدد حول نواة مضيئة.', [
    ring_layer(1, PURPLE, 0, 280), ring_layer(2, CYAN, 15, 200), ring_layer(3, GOLD, 30, 120),
    shape_layer(4, 'النواة', [group([ellipse(56), fill(WHITE)])], transform(p=s([256, 256, 0])), 120)])

# 2. تفكير: أقمار تدور حول مركز ثابت.
layers = [ring_layer(1, PURPLE, 0, 260, 4)]
for i, color in enumerate([PURPLE, CYAN, GOLD]):
    angle = i * 2 * math.pi / 3
    points = [(t, [256 + 125 * math.cos(angle + t * math.pi / 60), 256 + 125 * math.sin(angle + t * math.pi / 60), 0]) for t in range(0, 121, 10)]
    layers.append(shape_layer(i + 2, f'قمر {i + 1}', [group([ellipse(30 + i * 8), fill(color)])], transform(p=kf(points)), 120))
save_lottie('thinking-orbit', 'مدار التفكير', 'ثلاثة أقمار تدور أثناء البحث عن الملف المناسب.', layers)

# 3. موجات صوتية: أطوال متحركة، لا تدّعي قياس صوت الميكروفون.
layers = []
for i in range(7):
    height = 60 + (3 - abs(3 - i)) * 42
    layers.append(shape_layer(i + 1, f'موجة {i + 1}', [group([rect(22, 180, 11), fill(PURPLE if i % 2 else CYAN)])],
                              transform(p=s([148 + i * 36, 256, 0]), sc=kf([(0, [100, 30, 100]), (20 + i * 5, [100, 100, 100]), (70 + i * 4, [100, 40, 100]), (120, [100, 30, 100])])), 120))
save_lottie('voice-bars', 'موجات الحديث', 'مؤشر زخرفي للحديث يتحرك مع حالة المساعد، وليس مقياسًا للميكروفون.', layers)

# 4. تحميل: نقطة مضيئة تدور على مسار دائري.
layers = [ring_layer(1, [0.24, 0.2, 0.36, 1], 0, 260, 16)]
for i in range(3):
    points = [(t, [256 + 130 * math.cos((t * 3 + i * 120) * math.pi / 180), 256 + 130 * math.sin((t * 3 + i * 120) * math.pi / 180), 0]) for t in range(0, 121, 5)]
    layers.append(shape_layer(i + 2, f'نقطة {i + 1}', [group([ellipse(32 - i * 6), fill([PURPLE, CYAN, GOLD][i])])], transform(p=kf(points)), 120))
save_lottie('loading-orbit', 'مدار التحميل', 'حلقة تحميل لرسائل الانتظار والبحث عن الملفات.', layers)

# 5. نجاح: علامة صح تُرسم بمسار Trim Path.
def path_shape(points, closed=False):
    return {'ty': 'sh', 'd': 1, 'ks': s({'i': [[0, 0] for _ in points], 'o': [[0, 0] for _ in points], 'v': points, 'c': closed})}
check = path_shape([[-80, 0], [-22, 60], [94, -70]])
trim = {'ty': 'tm', 's': s(0), 'e': kf([(12, 0), (65, 100), (120, 100)]), 'o': s(0), 'm': 1}
save_lottie('success-check', 'علامة النجاح', 'علامة صح تُرسم تدريجيًا لتأكيد طلب التحميل، ولا تعني اكتمال حفظ الملف.', [
    ring_layer(1, MINT, 0, 280, 14), shape_layer(2, 'علامة صح', [group([check, stroke(MINT, 22), trim])], transform(p=s([256, 256, 0])), 120)])

# 6. تنزيل: سهم يتحرك إلى قاعدة ثابتة.
arrow = path_shape([[0, -85], [0, 48]])
arrow_head = path_shape([[-48, 5], [0, 53], [48, 5]])
tray = path_shape([[-90, 75], [-90, 108], [90, 108], [90, 75]])
save_lottie('download-arrow', 'سهم التنزيل', 'سهم متحرك لزر تنزيل الملفات والمؤثرات.', [
    shape_layer(1, 'السهم', [group([arrow, arrow_head, stroke(CYAN, 18)])], transform(p=kf([(0, [256, 205, 0]), (50, [256, 245, 0]), (100, [256, 205, 0]), (120, [256, 205, 0])])), 120),
    shape_layer(2, 'القاعدة', [group([tray, stroke(PURPLE, 18)])], transform(p=s([256, 256, 0])), 120)])

# 7. كتابة: ثلاث نقاط تتابع النبض.
layers = []
for i in range(3):
    layers.append(shape_layer(i + 1, f'نقطة كتابة {i + 1}', [group([ellipse(44), fill([PURPLE, CYAN, GOLD][i])])],
                              transform(p=kf([(0, [176 + i * 80, 256, 0]), (20 + i * 15, [176 + i * 80, 220, 0]), (50 + i * 15, [176 + i * 80, 256, 0]), (120, [176 + i * 80, 256, 0])]),
                                        o=kf([(0, 40), (25 + i * 15, 100), (70 + i * 10, 40), (120, 40)])), 120))
save_lottie('typing-dots', 'نقاط الكتابة', 'ثلاث نقاط متتابعة عندما يجهّز المساعد ردًا بالعربية.', layers)

# 8. شرارات نجاح: ثمانية جسيمات تنطلق من المركز.
layers = []
for i in range(8):
    a = i * math.pi / 4
    layers.append(shape_layer(i + 1, f'شرارة {i + 1}', [group([ellipse(18), fill([PURPLE, CYAN, GOLD, MINT][i % 4])])],
                              transform(p=kf([(0, [256, 256, 0]), (70, [256 + 185 * math.cos(a), 256 + 185 * math.sin(a), 0]), (120, [256 + 200 * math.cos(a), 256 + 200 * math.sin(a), 0])]),
                                        sc=kf([(0, [20, 20, 100]), (15, [100, 100, 100]), (120, [10, 10, 100])]),
                                        o=kf([(0, 0), (12, 100), (85, 80), (120, 0)])), 120))
save_lottie('celebration-sparks', 'شرارات الاحتفال', 'دفعة جسيمات ملونة للاحتفال باختيار مؤثر أو بدء تنزيل.', layers)

# ثماني ملفات SVG مستقلة. تحتوي كل منها على حركتها ووصف عربي ودعم تقليل الحركة.
SVG_SHAPES = {
    'bot-hello': ('تحية البوت', 'وجه مساعد يتحرك برفق مع نجوم ترحيب.', '''<g class="motion"><rect x="156" y="160" width="200" height="165" rx="65" fill="#eeeaff"/><rect x="176" y="183" width="160" height="108" rx="38" fill="#151025"/><path d="M211 231q15-24 30 0m30 0q15-24 30 0" fill="none" stroke="#a878ff" stroke-width="12" stroke-linecap="round"/><path d="M236 264q20 18 40 0" fill="none" stroke="#5fd4ff" stroke-width="8" stroke-linecap="round"/><path d="M365 270q65-55 42-100" fill="none" stroke="#eeeaff" stroke-width="25" stroke-linecap="round"/></g>'''),
    'bot-scan': ('مسح الملفات', 'خط سماوي يمسح إطار البحث عن الملفات.', '''<rect x="125" y="125" width="262" height="262" rx="38" fill="#151025" stroke="#a878ff" stroke-width="8"/><path d="M170 195h172m-172 60h125m-125 60h150" stroke="#493761" stroke-width="14" stroke-linecap="round"/><rect class="motion" x="140" y="145" width="232" height="10" rx="5" fill="#5fd4ff"/>'''),
    'bot-energy': ('طاقة البوت', 'برق ذهبي نابض داخل حلقة بنفسجية.', '''<circle cx="256" cy="256" r="155" fill="#151025" stroke="#a878ff" stroke-width="8"/><path class="motion" d="M282 116l-110 163h77l-22 119 118-177h-80z" fill="#ffd23f"/>'''),
    'bot-stars': ('نجوم التفاعل', 'ثلاث نجوم تتلألأ حول وجه مساعد سعيد.', '''<rect x="156" y="170" width="200" height="165" rx="60" fill="#eeeaff"/><rect x="177" y="190" width="158" height="112" rx="38" fill="#151025"/><path d="M211 240l15-12 15 12m30 0l15-12 15 12" fill="none" stroke="#a878ff" stroke-width="10" stroke-linecap="round"/><path class="motion" d="M256 70l13 35 37 2-29 23 9 36-30-20-30 20 9-36-29-23 37-2z" fill="#ffd23f"/><circle class="motion delay" cx="116" cy="230" r="15" fill="#5fd4ff"/><circle class="motion" cx="398" cy="230" r="15" fill="#ff7ab8"/>'''),
    'bot-talk': ('فقاعة العربية', 'فقاعة كلام عربية مع نقاط حديث متحركة.', '''<path d="M110 140h292v205H245l-65 61v-61h-70z" fill="#151025" stroke="#a878ff" stroke-width="8" stroke-linejoin="round"/><text x="256" y="235" text-anchor="middle" fill="#eeeaff" font-size="54" font-family="sans-serif" direction="rtl">أهلًا بك</text><g class="motion" fill="#5fd4ff"><circle cx="216" cy="285" r="9"/><circle cx="256" cy="285" r="9"/><circle cx="296" cy="285" r="9"/></g>'''),
    'bot-sleep': ('استراحة البوت', 'وجه هادئ يدخل في الاستراحة مع نجوم صغيرة تطفو.', '''<rect x="145" y="180" width="222" height="170" rx="65" fill="#eeeaff"/><rect x="166" y="201" width="180" height="115" rx="40" fill="#151025"/><path d="M198 253h38m40 0h38" stroke="#a878ff" stroke-width="10" stroke-linecap="round"/><path class="motion" d="M294 90h55l-55 55h55m20-100h40l-40 40h40" fill="none" stroke="#5fd4ff" stroke-width="8" stroke-linejoin="round"/>'''),
    'bot-download': ('تنزيل هادئ', 'سهم تنزيل مع حلقة تقدم زخرفية.', '''<circle cx="256" cy="256" r="160" fill="#151025" stroke="#493761" stroke-width="12"/><circle class="spin" cx="256" cy="256" r="160" fill="none" stroke="#a878ff" stroke-width="12" stroke-dasharray="220 785" stroke-linecap="round"/><g class="motion" fill="none" stroke="#5fd4ff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"><path d="M256 155v155m-60-60l60 60 60-60M176 345h160"/></g>'''),
    'bot-notification': ('تنبيه لطيف', 'جرس ذهبي يتمايل عند وصول تنبيه جديد.', '''<circle cx="256" cy="256" r="160" fill="#151025" stroke="#a878ff" stroke-width="8"/><g class="motion"><path d="M170 310l22-42v-58a64 64 0 0 1 128 0v58l22 42z" fill="#ffd23f"/><circle cx="256" cy="337" r="23" fill="#5fd4ff"/><circle cx="256" cy="139" r="13" fill="#ffd23f"/></g>'''),
}
for slug, (name, description, body) in SVG_SHAPES.items():
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" class="zy-bot-svg {slug}" viewBox="0 0 512 512" role="img" aria-labelledby="title desc">
<title id="title">{escape(name)}</title><desc id="desc">{escape(description)}</desc>
<style>
.{slug} .motion{{animation:zy-float 2.4s ease-in-out infinite;transform-box:fill-box;transform-origin:center}}
.{slug} .delay{{animation-delay:.6s}}.{slug} .spin{{animation:zy-spin 5s linear infinite;transform-origin:256px 256px}}
@keyframes zy-float{{0%,100%{{transform:translateY(0);opacity:.85}}50%{{transform:translateY(-12px);opacity:1}}}}
@keyframes zy-spin{{to{{transform:rotate(360deg)}}}}
@keyframes zy-scan{{0%,100%{{transform:translateY(0)}}50%{{transform:translateY(210px)}}}}
@keyframes zy-ring{{0%,100%{{transform:rotate(-8deg)}}50%{{transform:rotate(8deg)}}}}
@keyframes zy-dots{{0%,100%{{opacity:.35;transform:translateY(0)}}50%{{opacity:1;transform:translateY(-5px)}}}}
@keyframes zy-sleep{{0%,100%{{opacity:.4;transform:translate(0,0)}}50%{{opacity:1;transform:translate(10px,-20px)}}}}
{ {'bot-scan': f'.{slug} .motion{{animation-name:zy-scan}}', 'bot-notification': f'.{slug} .motion{{animation-name:zy-ring;transform-box:view-box;transform-origin:256px 140px}}', 'bot-talk': f'.{slug} .motion{{animation-name:zy-dots}}', 'bot-sleep': f'.{slug} .motion{{animation-name:zy-sleep}}'}.get(slug, '') }
@media(prefers-reduced-motion:reduce){{.{slug} .motion,.{slug} .spin{{animation:none!important}}}}
</style>{body}</svg>'''
    (OUT / f'{slug}.svg').write_text(svg, encoding='utf-8')
    items.append(dict(id=slug, name=name, tagline=description, category='bot', programs=['web'],
                      format='SVG متحرك', quality='512×512 · متجهي', fps='CSS', file=f'downloads/bot/{slug}.svg',
                      preview='pulse', badge='جديد · البوت', description=description + ' يعمل مباشرة في المتصفح ويحترم إعداد تقليل الحركة في النظام.',
                      usage='افتحه في المتصفح أو ضعه في عنصر img. لتعديل الحركة والألوان، عدّل CSS داخل ملف SVG. برامج المونتاج تحتاج تصديره إلى فيديو أولًا.',
                      tags=['أنيميشن', 'مؤثرات البوت', 'animation', 'svg', 'شفاف']))

# أضف الأصول الجديدة مرة واحدة فقط؛ إعادة التشغيل تستبدل بياناتها ولا تكررها.
catalog_path = ROOT / 'site' / 'public' / 'catalog.json'
catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
catalog['version'] = 2
if not any(c['id'] == 'bot' for c in catalog['categories']):
    catalog['categories'].append({'id': 'bot', 'name': 'مؤثرات البوت', 'tagline': 'تحية، حديث، تحميل، تفكير واحتفال'})
new_ids = {item['id'] for item in items}
catalog['items'] = [item for item in catalog['items'] if item['id'] not in new_ids] + items
catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'تم توليد {len(items)} أصلًا جديدًا في {OUT.relative_to(ROOT)}؛ إجمالي المكتبة {len(catalog["items"])} أصلًا.')
