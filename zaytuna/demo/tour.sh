#!/usr/bin/env bash
# ============================================================
#  زيتونة — جولة عرض سريعة (١٠ أوامر)
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

line "3) ميزات اللغة: اختر/حالة · انشر (بسط) · دوال سهمية · أدوات نصية"
$Z تشغيل examples/اختر_وبسط.zy

line "4) فحص ملف زيتونة فيه خطأ إملائي — تشخيص عربي باقتراح"
$Z فحص examples/به_اخطاء.zy || true

line "5) فحص ملف جافاسكربت فيه أخطاء «عربية»"
$Z فحص examples/كود_به_أخطاء.js | head -24 || true

line "6) إصلاح تلقائي — المستوى 0 (حتمي وآمن)"
cp examples/كود_به_أخطاء.js /tmp/zaytuna-tour-0.js
$Z إصلاح /tmp/zaytuna-tour-0.js --tier 0 || true

line "7) إصلاح تلقائي — المستوى 1 (يضيف إعادة التسمية المتسقة)"
cp examples/كود_به_أخطاء.js /tmp/zaytuna-tour-1.js
$Z إصلاح /tmp/zaytuna-tour-1.js --tier 1 || true

line "8) الملف بعد الإصلاح الفعلي + التحقق من node"
$Z إصلاح /tmp/zaytuna-tour-1.js --tier 1 --write --quiet | tail -3
node --check /tmp/zaytuna-tour-1.js 2>/dev/null && echo "node --check (/tmp/zaytuna-tour-1.js): سليم ✔" || node --check /tmp/zaytuna-tour-1.js
cat /tmp/zaytuna-tour-1.js

line "9) لغة أخرى حقيقية: سي (C) — خطأ من gcc ثم إصلاح يجتاز التحقق"
cat > /tmp/zaytuna-tour.c <<'C'
#include <stdio.h>
int main(void) {
  int عدد = ٥;
  printf("%d\\n", عدد);
  return 0;
}
C
$Z فحص /tmp/zaytuna-tour.c | head -8 || true
$Z إصلاح /tmp/zaytuna-tour.c --tier 0 --write | tail -3 || true

line "10) حرف مخفي داخل «if» يكسر الشل — والإصلاح يعيده سليمًا"
printf 'i\342\200\213f [ 1 -eq 1 ]; then\n  echo نعم\nfi\n' > /tmp/zaytuna-tour.sh   # \342\200\213 = ZWSP
bash -n /tmp/zaytuna-tour.sh 2>&1 | head -2 || true
$Z إصلاح /tmp/zaytuna-tour.sh --tier 0 --write | tail -2 || true
bash -n /tmp/zaytuna-tour.sh && echo "bash -n (/tmp/zaytuna-tour.sh): سليم ✔"

printf '\n\033[32mانتهت الجولة.\033[0m\n'
