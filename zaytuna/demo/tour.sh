#!/usr/bin/env bash
# ============================================================
#  زيتونة — جولة عرض سريعة (٧ أوامر)
#  التشغيل:  bash demo/tour.sh
# ============================================================
set -u
cd "$(dirname "$0")/.."
Z="node bin/zaytuna.js"
line() { printf '\n\033[1m──────── %s ────────\033[0m\n' "$1"; }

line "1) تشغيل برنامج بلغة زيتونة"
$Z تشغيل examples/مرحبا.zy

line "2) حاسبة كاملة (دوال · شروط · حلقات · أصناف · دوال عربية مدمجة)"
$Z تشغيل examples/حاسبة.zy

line "3) فحص ملف زيتونة فيه خطأ إملائي — تشخيص عربي باقتراح"
$Z فحص examples/به_اخطاء.zy || true

line "4) فحص ملف جافاسكربت فيه أخطاء «عربية»"
$Z فحص examples/كود_به_أخطاء.js | head -24 || true

line "5) إصلاح تلقائي — المستوى 0 (حتمي وآمن)"
cp examples/كود_به_أخطاء.js /tmp/zaytuna-tour-0.js
$Z إصلاح /tmp/zaytuna-tour-0.js --tier 0 || true

line "6) إصلاح تلقائي — المستوى 1 (يضيف إعادة التسمية المتسقة)"
cp examples/كود_به_أخطاء.js /tmp/zaytuna-tour-1.js
$Z إصلاح /tmp/zaytuna-tour-1.js --tier 1 || true

line "7) الملف بعد الإصلاح الفعلي + التحقق من node"
$Z إصلاح /tmp/zaytuna-tour-1.js --tier 1 --write --quiet | tail -3
node --check /tmp/zaytuna-tour-1.js 2>/dev/null && echo "node --check (/tmp/zaytuna-tour-1.js): سليم ✔" || node --check /tmp/zaytuna-tour-1.js
cat /tmp/zaytuna-tour-1.js

printf '\n\033[32mانتهت الجولة.\033[0m\n'
