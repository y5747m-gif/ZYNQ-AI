# تطبيق «ستيريو» — Stereo Sound

تطبيق يعالج صوت الهاتف ليصبح **ستيريو حقيقيًا**: توسيع ستيريو، موازن يمين/يسار،
معادل صوتي، ونغمة اختبار لكل قناة.

> **مهم:** لا يوجد ملف `APK` جاهز داخل هذا المجلد، وهذا مقصود.
> الملف الذي كان هنا سابقًا (`stereo-sound.apk`) كان أرشيفًا بحجم 828 بايت
> يحوي `AndroidManifest.xml` و`classes.dex` فارغًا (120 بايت) — لم يكن تطبيقًا
> ولا يمكن تثبيته على أي هاتف. البناء الحقيقي يحتاج JDK 17 + Android SDK،
> وهما غير متوفّرين في بيئة إنشاء هذا المستودع. لذلك يُبنى الملف من المصدر
> بالطرق الثلاث أدناه.

---

## 1) استخدم التطبيق الآن على الهاتف (بلا تثبيت)

نسخة الويب-التطبيق (PWA) موجودة في [`site/public/stereo/`](../../public/stereo)
وتعمل بنفس المعالجة عبر Web Audio API:

1. شغّل الخادم: `node site/server.js` ثم افتح `http://<ip-جهازك>:4173/stereo/`
   (أو افتح المسار `/stereo/` على النسخة المنشورة).
2. من قائمة المتصفح ⋮ اختر **«إضافة إلى الشاشة الرئيسية»**.
3. افتح التطبيق، اختر ملفًا صوتيًا، وشغّله.

تعمل نسخة الويب بلا إنترنت بعد أول فتح (عامل خدمة)، ولا ترسل أي صوت إلى أي خادم.

## 2) بناء APK على GitHub Actions (بلا جهازك)

الملف [`.github/workflows/android-apk.yml`](../../../.github/workflows/android-apk.yml)
يبني الـ APK تلقائيًا:

- افتح تبويب **Actions** ← «بناء تطبيق ستيريو (APK)» ← **Run workflow**.
- بعد انتهاء المهمة نزّل الـ APK من قسم **Artifacts** (`stereo-sound-apk`).

ناتج البناء `app-debug.apk` موقّع بمفتاح التصحيح، فيُثبَّت مباشرة على أندرويد
(فعّل «تثبيت من مصادر غير معروفة» لتطبيق المتصفح أو مدير الملفات).

## 3) بناء APK على جهازك (Android Studio)

1. افتح المجلد `site/downloads/stereo-sound/` في **Android Studio** (File ▸ Open).
2. انتظر مزامنة Gradle (تحتاج JDK 17، وهو مضمّن في Android Studio الحديث).
3. **Build ▸ Build Bundle(s) / APK(s) ▸ Build APK(s)**.
4. الملف: `app/build/outputs/apk/debug/app-debug.apk`.

أو من سطر الأوامر:

```bash
cd site/downloads/stereo-sound
gradle wrapper --gradle-version 8.7 --distribution-type bin   # مرة واحدة فقط
./gradlew assembleDebug
```

للنشر على Google Play: **Build ▸ Generate Signed Bundle / APK** وأنشئ مفتاح توقيع خاصًا بك.

---

## ماذا يفعل التطبيق فعلًا

| الميزة | كيف تعمل |
|---|---|
| تشغيل ملف صوتي | `MediaPlayer` + `ActivityResultContracts.OpenDocument` لاختيار الملف من ذاكرة الهاتف |
| توسيع الستيريو 100%→200% | `android.media.audiofx.Virtualizer` على جلسة الصوت |
| موازن يمين/يسار + مستوى | `MediaPlayer.setVolume(left, right)` بقيمتين مستقلتين |
| تقوية البيس | `BassBoost` |
| معادل متعدد النطاقات | `Equalizer` — تُبنى شرائح التمرير ديناميكيًا حسب نطاقات الجهاز |
| نغمة اختبار لكل قناة | `AudioTrack` بجلسة PCM 16-bit ستيريو مباشرة (بلا وسيط) |
| حفظ الإعدادات | `SharedPreferences` |

كل مؤثر من مؤثرات النظام قد لا يكون متوفرًا على جهاز بعينه، لذلك يُنشأ كل واحد
داخل محاولة مستقلة، وإن غاب يُعطَّل عنصر الواجهة ويُكتب ذلك صراحةً — لا أزرار توهم بوظيفة غير موجودة.

## ما الذي كان مكسورًا في النسخة السابقة (وتم إصلاحه)

| العطل | الأثر | الإصلاح |
|---|---|---|
| `import android.media.Equalizer` | صنف غير موجود ⇒ **المشروع لا يُبنى أصلًا** (Unresolved reference) | `android.media.audiofx.Equalizer` |
| `engine.balance = …` على خاصية `private set` | خطأ ترجمة | واجهة `StereoEffects` بديلة |
| ضرب `Short * Float` داخل `AudioTrack.write` | خطأ نوعي في الترجمة | حساب في `Double` ثم `toShort()` |
| `package="…"` داخل المانيفست مع AGP 8 | البناء يفشل | حُذف، والاعتماد على `namespace` |
| `@mipmap/ic_launcher` غير موجود | فشل دمج الموارد | أيقونات حقيقية لكل كثافة (مولَّدة بـ `tools/gen_app_icons.py`) |
| `buildscript classpath` + `plugins {}` معًا | تعارض إصدارات | `plugins` الحديث في البناء الجذري |
| غلاف غرادل ناقص و`gradle-wrapper.properties` في مسار خاطئ | `./gradlew` لا يعمل | المسار الصحيح + CI يولّد الغلاف |
| `StereoService` بلا `startForeground` مع `foregroundServiceType` | انهيار عند التشغيل على أندرويد 12+ | حُذفت الخدمة غير المستخدمة |
| الإذن `RECORD_AUDIO` بلا استخدام | إزعاج ومراجعة متجر | حُذف |
| ملف `.apk` بحجم 828 بايت | «التطبيق لا يُثبَّت» | حُذف؛ يُبنى من المصدر |

## ملاحظة صريحة عن الحدود

المؤثرات تُطبَّق على **جلسة الصوت الخاصة بالتطبيق** فقط، لأن أندرويد لا يمنح
تطبيقًا عاديًا صلاحية معالجة صوت بقية التطبيقات (تحتاج `AudioEffect` نظاميًا أو root).
لذلك: شغّل ملفاتك داخل «ستيريو» وستُعالج، أما موسيقى تطبيق آخر فلن تتأثر.

## البنية

```
stereo-sound/
├── settings.gradle.kts · build.gradle.kts        إعدادات المشروع (AGP 8.5.2 · Kotlin 1.9.24)
├── gradle/wrapper/gradle-wrapper.properties      Gradle 8.7
└── app/
    ├── build.gradle.kts                          إعدادات الوحدة (minSdk 23 · targetSdk 34)
    ├── src/main/AndroidManifest.xml
    ├── src/main/java/com/zynq/stereosound/
    │   ├── MainActivity.kt                       الواجهة والتشغيل والإعدادات
    │   ├── StereoEffects.kt                      التوسيع/البيس/المعادل على جلسة الصوت
    │   └── ChannelTester.kt                      نغمة اختبار لكل قناة
    └── src/main/res/                             التخطيط والنصوص والألوان والأيقونات
```
