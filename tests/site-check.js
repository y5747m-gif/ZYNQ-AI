#!/usr/bin/env node
'use strict';

// ==========================================================================
//  فحص آلي شامل للموقع وتطبيق «ستيريو»
//  يُشغَّل بـ:  node tests/site-check.js
//  ------------------------------------------------------------------------
//  يكشف الأعطال التي تجعل «التطبيق لا يعمل» قبل التسليم:
//    1) كتالوج: كل ملف مذكور موجود فعلًا، وكل برنامج/تصنيف/معاينة معرَّف.
//    2) خادم: كل مسار في الصفحة يردّ 200 فعلًا (بما فيها الباقات وملف المشروع).
//    3) واجهة: كل سكربت/نمط/أيقونة مذكورة في HTML موجودة.
//    4) تطبيق ستيريو (ويب): الملفات الأساسية + عامل الخدمة + بيانات التطبيق.
//    5) مشروع أندرويد: لا imports غير موجودة، والأيقونات موجودة لكل كثافة،
//       و namespace يطابق المانيفست، ولا ملف APK مُلفَّق.
//  لا يحتاج أي مكتبات خارجية — Node فقط.
// ==========================================================================

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const PUBLIC = path.join(SITE, 'public');

let pass = 0;
let fail = 0;
const failures = [];

function ok(cond, label) {
  if (cond) {
    pass++;
    console.log(`  ✔ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  ✘ ${label}`);
  }
}

function exists(p) {
  try { return fs.existsSync(p); } catch (_) { return false; }
}

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

// ------------------------------------------------------------------ 1) كتالوج
function checkCatalog() {
  console.log('\nالكتالوج والملفات:');
  const catalog = JSON.parse(read(path.join(PUBLIC, 'catalog.json')));
  ok(Array.isArray(catalog.items) && catalog.items.length > 0, 'الكتالوج يحتوي أصولًا');

  const programIds = new Set(catalog.programs.map((p) => p.id));
  const categoryIds = new Set(catalog.categories.map((c) => c.id));
  const appJs = read(path.join(PUBLIC, 'app.js'));
  const previewKinds = new Set([...appJs.matchAll(/case '([a-z]+)':/g)].map((m) => m[1]));

  let missingFiles = [];
  let badPrograms = [];
  let badCategories = [];
  let badPreviews = [];
  const seen = new Set();
  const dups = [];

  for (const it of catalog.items) {
    const f = path.join(SITE, it.file);
    if (!exists(f) || fs.statSync(f).size === 0) missingFiles.push(it.id);
    for (const pid of it.programs) if (!programIds.has(pid)) badPrograms.push(`${it.id}:${pid}`);
    if (!categoryIds.has(it.category)) badCategories.push(`${it.id}:${it.category}`);
    if (!previewKinds.has(it.preview)) badPreviews.push(`${it.id}:${it.preview}`);
    if (seen.has(it.id)) dups.push(it.id);
    seen.add(it.id);
  }

  ok(missingFiles.length === 0, `كل ملفات الكتالوج موجودة وغير فارغة (${catalog.items.length} أصلًا)${missingFiles.length ? ' — ناقص: ' + missingFiles.join('، ') : ''}`);
  ok(badPrograms.length === 0, `كل البرامج المُشار إليها معرَّفة${badPrograms.length ? ' — ' + badPrograms.join('، ') : ''}`);
  ok(badCategories.length === 0, `كل التصنيفات معرَّفة${badCategories.length ? ' — ' + badCategories.join('، ') : ''}`);
  ok(badPreviews.length === 0, `كل أنواع المعاينة لها كود في app.js${badPreviews.length ? ' — ' + badPreviews.join('، ') : ''}`);
  ok(dups.length === 0, `لا معرّفات مكرّرة${dups.length ? ' — ' + dups.join('، ') : ''}`);

  return catalog;
}

// ------------------------------------------------------------------- 2) واجهة
function checkFrontend() {
  console.log('\nملفات الواجهة:');
  const html = read(path.join(PUBLIC, 'index.html'));

  const localAssets = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)]
    .map((m) => m[1])
    .filter((p) => !p.startsWith('/') && !p.startsWith('http'));

  const missing = localAssets.filter((p) => !exists(path.join(PUBLIC, p)));
  ok(missing.length === 0, `كل ملفات HTML المحلية موجودة${missing.length ? ' — ناقص: ' + missing.join('، ') : ''}`);

  // عناصر تُستخدم من app.js عبر #id
  const appJs = read(path.join(PUBLIC, 'app.js'));
  const usedIds = new Set([...appJs.matchAll(/\$\('#([\w-]+)'\)/g)].map((m) => m[1]));
  const htmlIds = new Set([...html.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
  const missingIds = [...usedIds].filter((id) => !htmlIds.has(id));
  ok(missingIds.length === 0, `كل عناصر الواجهة التي يستخدمها app.js موجودة في HTML${missingIds.length ? ' — ناقص: ' + missingIds.join('، ') : ''}`);

  // ملفات تطبيق ستيريو
  const stereoDir = path.join(PUBLIC, 'stereo');
  const required = ['index.html', 'app.js', 'style.css', 'sw.js', 'manifest.webmanifest',
    'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'];
  const missingStereo = required.filter((f) => !exists(path.join(stereoDir, f)));
  ok(missingStereo.length === 0, `ملفات تطبيق ستيريو كاملة${missingStereo.length ? ' — ناقص: ' + missingStereo.join('، ') : ''}`);

  let manifest = null;
  try { manifest = JSON.parse(read(path.join(stereoDir, 'manifest.webmanifest'))); } catch (_) { /* يُفحص أدناه */ }
  ok(!!manifest, 'manifest.webmanifest صالح كـ JSON');
  if (manifest) {
    const iconPaths = (manifest.icons || []).map((i) => i.src.replace('./', ''));
    const missingIcons = iconPaths.filter((p) => !exists(path.join(stereoDir, p)));
    ok(missingIcons.length === 0, 'أيقونات الـ manifest موجودة فعلًا');
    ok(manifest.display === 'standalone', 'التطبيق يُثبَّت كتطبيق مستقل (standalone)');
    ok(manifest.start_url === './index.html' || manifest.start_url === '.', 'start_url يعمل داخل نطاق التطبيق');

    // كل ملفات القشرة يجب أن تكون في قائمة الكاش
    const sw = read(path.join(stereoDir, 'sw.js'));
    const shellMissing = required
      .filter((f) => f !== './')
      .filter((f) => !sw.includes('./' + f) && !sw.includes(f));
    ok(shellMissing.length === 0, `عامل الخدمة يخزّن كل ملفات القشرة${shellMissing.length ? ' — ناقص: ' + shellMissing.join('، ') : ''}`);
  }

  // تنظيف JS: تحقّق من أن ملفات JS تُحلَّل نحويًا
  const jsFiles = [
    path.join(PUBLIC, 'app.js'),
    path.join(stereoDir, 'app.js'),
    path.join(stereoDir, 'sw.js'),
    path.join(SITE, 'server.js'),
  ];
  let syntaxBad = [];
  for (const f of jsFiles) {
    const r = require('child_process').spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    if (r.status !== 0) syntaxBad.push(path.relative(ROOT, f));
  }
  ok(syntaxBad.length === 0, `كل ملفات JS سليمة نحويًا${syntaxBad.length ? ' — ' + syntaxBad.join('، ') : ''}`);

  // ------------------------------------------------------- تثبيت تطبيق أندرويد
  // الزر يجب أن يفتح لوحة تثبيت داخل الصفحة نفسها، لا أن ينقل الزائر إلى GitHub.
  const ghLinks = [...html.matchAll(/href="(https?:\/\/[^"]*)"/g)].map((m) => m[1]);
  ok(ghLinks.length === 0, `لا روابط خارجية في الصفحة تنقل الزائر بعيدًا${ghLinks.length ? ' — ' + ghLinks.join('، ') : ''}`);
  ok(!/href="[^"]*github\.com/i.test(html), 'لا يوجد زر يفتح صفحة GitHub عند الضغط');
  ok(/<button[^>]+id="app-install-btn"[^>]*type="button"/.test(html)
    || /<button[^>]+type="button"[^>]+id="app-install-btn"/.test(html),
  'زر تثبيت التطبيق من نوع button (لا ينقّل إلى أي صفحة)');
  ok(/id="app-install"/.test(html), 'نافذة تثبيت التطبيق موجودة داخل الصفحة');
  ok(/aria-controls="app-install"/.test(html), 'الزر يشير إلى نافذة التثبيت (aria-controls)');
  ok(/setupInstallDialog\(\)/.test(appJs) && /openInstallDialog\(\)/.test(appJs), 'منطق فتح لوحة التثبيت داخل الصفحة موجود في app.js');
  ok(/\/api\/app\/status/.test(appJs) && /\/api\/app\/apk/.test(appJs), 'الواجهة تستعلم عن حالة APK وتنزّله من الخادم نفسه');
  const installDl = html.match(/id="app-install-download"[^>]*/);
  ok(!!installDl && /download/.test(installDl[0]), 'رابط التنزيل داخل اللوحة يحمّل الملف بدل فتحه');
}

// --------------------------------------------------------------- 3) أندرويد
function checkAndroidProject() {
  console.log('\nمشروع أندرويد:');
  const dir = path.join(SITE, 'downloads', 'stereo-sound');
  const appDir = path.join(dir, 'app', 'src', 'main');

  ok(exists(path.join(dir, 'settings.gradle.kts')), 'settings.gradle.kts موجود');
  ok(exists(path.join(dir, 'build.gradle.kts')), 'build.gradle.kts الجذري موجود');
  ok(exists(path.join(dir, 'gradle', 'wrapper', 'gradle-wrapper.properties')), 'إعدادات غلاف غرادل في مكانها الصحيح');
  ok(exists(path.join(appDir, 'AndroidManifest.xml')), 'المانيفست موجود');
  ok(exists(path.join(appDir, 'res', 'layout', 'activity_main.xml')), 'تخطيط الشاشة موجود');

  // غلاف غرادل يشير إلى نسخة متوافقة مع AGP
  const wrapper = read(path.join(dir, 'gradle', 'wrapper', 'gradle-wrapper.properties'));
  const gradleVersion = (wrapper.match(/gradle-([\d.]+)-bin\.zip/) || [])[1];
  const rootGradle = read(path.join(dir, 'build.gradle.kts'));
  const agp = (rootGradle.match(/com\.android\.application"\) version "([\d.]+)"/) || [])[1];
  ok(!!gradleVersion, `نسخة غرادل محددة (${gradleVersion || 'غير موجودة'})`);
  ok(!!agp, `نسخة إضافة أندرويد محددة (${agp || 'غير موجودة'})`);
  if (gradleVersion && agp) {
    const g = Number(gradleVersion.split('.').slice(0, 2).join('.'));
    const major = Number(agp.split('.')[0]);
    // AGP 8.x يحتاج غرادل 8.0+ على الأقل
    ok(major === 8 ? g >= 8 : g >= 7, `غرادل ${gradleVersion} متوافق مع AGP ${agp}`);
  }

  // namespace في gradle == package في المانيفست (AGP 8 يرفض package في المانيفست)
  const appGradle = read(path.join(dir, 'app', 'build.gradle.kts'));
  const namespace = (appGradle.match(/namespace\s*=\s*"([^"]+)"/) || [])[1];
  const manifest = read(path.join(appDir, 'AndroidManifest.xml'));
  ok(!!namespace, `namespace معرَّف (${namespace || 'غير موجود'})`);
  ok(!/\spackage="/.test(manifest), 'لا يوجد package داخل المانيفست (شرط AGP 8)');
  ok(manifest.includes('android:name=".MainActivity"'), 'النشاط الرئيسي معلَن باسمه الصحيح');

  // أيقونات لكل كثافة
  const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
  const missingIcons = [];
  for (const d of densities) {
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
      const p = path.join(appDir, 'res', `mipmap-${d}`, name);
      if (!exists(p) || fs.statSync(p).size < 100) missingIcons.push(`${d}/${name}`);
    }
  }
  ok(missingIcons.length === 0, `أيقونات التطبيق موجودة لكل كثافة${missingIcons.length ? ' — ناقص: ' + missingIcons.join('، ') : ''}`);

  // لا imports لکلاسات غير موجودة في أندرويد (هذا ما كسر النسخة السابقة)
  const kotlinFiles = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const full = path.join(d, f);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (f.endsWith('.kt')) kotlinFiles.push(full);
    }
  })(path.join(appDir, 'java'));

  ok(kotlinFiles.length >= 3, `ملفات كوتلن موجودة (${kotlinFiles.length})`);
  const badImports = [];
  const androidKnown = new Set([
    'android.Manifest', 'android.content.Context', 'android.content.Intent', 'android.content.SharedPreferences',
    'android.graphics.Typeface', 'android.media.AudioFocusRequest', 'android.media.AudioManager', 'android.os.Build',
    'android.media.AudioAttributes', 'android.media.AudioFormat', 'android.media.AudioTrack',
    'android.media.MediaPlayer', 'android.media.audiofx.BassBoost', 'android.media.audiofx.Equalizer',
    'android.media.audiofx.Virtualizer', 'android.net.Uri', 'android.os.Bundle', 'android.os.Handler',
    'android.os.IBinder', 'android.os.Looper', 'android.provider.OpenableColumns', 'android.view.View',
    'android.widget.Button', 'android.widget.LinearLayout', 'android.widget.SeekBar', 'android.widget.TextView',
    'android.widget.Toast', 'android.app.Service',
  ]);
  for (const f of kotlinFiles) {
    // نتجاهل التعليقات حتى لا تُحسب أسماء مذكورة في الشرح كأنها استيرادات
    const code = read(f)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    for (const m of code.matchAll(/^import\s+([\w.]+)/gm)) {
      const imp = m[1];
      if (imp.startsWith('android.') && !androidKnown.has(imp)) {
        badImports.push(`${path.basename(f)}: ${imp}`);
      }
    }
    if (code.includes('android.media.Equalizer')) badImports.push(`${path.basename(f)}: android.media.Equalizer (غير موجود — الصحيح audiofx.Equalizer)`);
  }
  ok(badImports.length === 0, `لا استيرادات لأصناف أندرويد غير موجودة${badImports.length ? ' — ' + badImports.join('؛ ') : ''}`);

  // Native app: no remote website/WebView, no unnecessary file or Internet permission.
  const nativeSources = kotlinFiles.map((f) => read(f)).join('\n');
  const layout = read(path.join(appDir, 'res', 'layout', 'activity_main.xml'));
  const nativeIds = new Set([...layout.matchAll(/@\+id\/([\w]+)/g)].map((m) => m[1]));
  const usedNativeIds = new Set([...nativeSources.matchAll(/R\.id\.([\w]+)/g)].map((m) => m[1]));
  const missingNativeIds = [...usedNativeIds].filter((id) => !nativeIds.has(id));
  ok(missingNativeIds.length === 0, `كل عناصر واجهة أندرويد المرتبطة موجودة${missingNativeIds.length ? ' — ' + missingNativeIds.join('، ') : ''}`);
  ok(!/android\.permission\.(INTERNET|READ_MEDIA_AUDIO|READ_EXTERNAL_STORAGE)/.test(manifest), 'التطبيق بلا إذن إنترنت أو إذن قراءة شامل للملفات');
  ok(!/\bWebView\b/.test(nativeSources), 'التطبيق أصلي ولا يعرض موقعًا داخل WebView');
  const neededDrawables = [...layout.matchAll(/@drawable\/([\w]+)/g)].map((m) => m[1]);
  const missingDrawables = neededDrawables.filter((name) => !exists(path.join(appDir, 'res', 'drawable', `${name}.xml`)) && !exists(path.join(appDir, 'res', 'drawable-nodpi', `${name}.png`)));
  ok(missingDrawables.length === 0, `رسومات الكوميكس المحلية موجودة${missingDrawables.length ? ' — ' + missingDrawables.join('، ') : ''}`);
  ok(exists(path.join(dir, 'gradlew')) && exists(path.join(dir, 'gradlew.bat')) && exists(path.join(dir, 'gradle', 'wrapper', 'gradle-wrapper.jar')), 'غلاف Gradle كامل لبناء التطبيق');
  ok(/android\.useAndroidX=true/.test(read(path.join(dir, 'gradle.properties'))), 'استخدام AndroidX مفعّل');
  ok(/targetSdk\s*=\s*36/.test(appGradle), 'التطبيق يستهدف Android API 36');
  ok(!/signingConfig\s*=\s*signingConfigs\.getByName\(\s*"debug"/.test(appGradle), 'نسخة الإصدار لا تُوقّع بمفتاح التصحيح');
  ok(exists(path.join(dir, 'app', 'src', 'test', 'java', 'com', 'zynq', 'stereosound', 'SoundMathTest.kt')), 'اختبارات حساب الصوت الأصلي موجودة');

  // لا ملف APK مُلفَّق
  const apks = fs.readdirSync(dir).filter((f) => f.endsWith('.apk'));
  ok(apks.length === 0, 'لا يوجد ملف APK مُلفَّق في المستودع (يُبنى من المصدر)');

  // ملف بناء المشروع موجود لكل ما يحتاجه Android Studio
  ok(exists(path.join(dir, 'app', 'build.gradle.kts')), 'إعدادات بناء الوحدة موجودة');
  ok(/com\.android\.application/.test(rootGradle) && /kotlin\.android/.test(rootGradle), 'إضافتا أندرويد وكوتلن معلنتان في البناء الجذري');

  return dir;
}

// ------------------------------------------------------- 4) الخادم والمسارات
function fetchPath(port, p, method = 'GET', timeoutMs = 15000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val) => { if (!settled) { settled = true; clearTimeout(timer); resolve(val); } };
    const req = http.request({ host: '127.0.0.1', port, path: encodeURI(p), method }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => finish({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      // الخادم يقطع الرد عمدًا في اختبار «انقطاع المصدر أثناء البثّ»
      res.on('aborted', () => finish({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), truncated: true }));
      res.on('error', () => finish({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), truncated: true }));
      res.on('close', () => finish({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), truncated: true }));
    });
    const timer = setTimeout(() => { req.destroy(); finish({ status: 0, error: 'timeout', body: Buffer.alloc(0) }); }, timeoutMs);
    req.on('error', (err) => finish({ status: 0, error: err.message, body: Buffer.alloc(0) }));
    req.end();
  });
}

async function checkServer(catalog) {
  console.log('\nالخادم والمسارات:');
  const port = 4600 + Math.floor(Math.random() * 300);
  const child = spawn(process.execPath, [path.join(SITE, 'server.js'), `--port=${port}`], {
    cwd: ROOT, stdio: 'ignore',
  });

  // انتظار جاهزية الخادم (بلا حلقات sleep طويلة)
  let ready = false;
  for (let i = 0; i < 40; i++) {
    const r = await fetchPath(port, '/');
    if (r.status === 200) { ready = true; break; }
    await new Promise((res) => setTimeout(res, 100));
  }

  try {
    ok(ready, 'الخادم يبدأ ويخدم الصفحة الرئيسية');

    if (ready) {
      const pages = [
        '/', '/style.css', '/app.js', '/catalog.json', '/logo.svg',
        '/api/catalog', '/favicon.ico',
        '/stereo/', '/stereo/index.html', '/stereo/app.js', '/stereo/style.css',
        '/stereo/sw.js', '/stereo/manifest.webmanifest',
        '/stereo/icons/icon-192.png', '/stereo/icons/icon-512.png', '/stereo/icons/maskable-512.png',
      ];
      // كل ملف أصل + باقة لكل تصنيف
      for (const it of catalog.items) pages.push('/' + it.file);
      for (const c of catalog.categories) pages.push(`/api/pack/${c.id}.zip`);

      const results = await Promise.all(pages.map(async (p) => ({ p, r: await fetchPath(port, p) })));
      const broken = results.filter((x) => x.r.status !== 200).map((x) => `${x.p} (${x.r.status})`);
      ok(broken.length === 0, `كل المسارات تردّ 200 (${pages.length} مسارًا)${broken.length ? ' — أعطال: ' + broken.slice(0, 8).join('، ') : ''}`);

      const redirect = await fetchPath(port, '/stereo');
      ok(redirect.status === 301 || redirect.status === 308, '‏/stereo يعيد التوجيه إلى /stereo/ (حتى تعمل المسارات النسبية)');

      const pack = await fetchPath(port, '/api/pack/all.zip');
      ok(pack.status === 200 && pack.body.slice(0, 2).toString() === 'PK', 'باقة الكل ZIP صحيحة (توقيع PK)');

      const src = await fetchPath(port, '/api/app/source.zip');
      const isZip = src.status === 200 && src.body.slice(0, 2).toString() === 'PK';
      ok(isZip, 'مشروع أندرويد يُنزَّل كملف ZIP صالح');
      if (isZip) {
        // نتأكد أن الأرشيف يحتوي الملفات الأساسية للمشروع
        const raw = src.body.toString('latin1');
        const wanted = ['settings.gradle.kts', 'build.gradle.kts', 'AndroidManifest.xml', 'MainActivity.kt'];
        const missing = wanted.filter((w) => !raw.includes(w));
        ok(missing.length === 0, `أرشيف المشروع يحتوي ملفات البناء${missing.length ? ' — ناقص: ' + missing.join('، ') : ''}`);
      }

      // A locally configured signing key must never leak in the public source ZIP.
      const secretDir = fs.mkdtempSync(path.join(SITE, 'downloads', 'stereo-sound', '.source-zip-test-'));
      try {
        fs.writeFileSync(path.join(secretDir, 'test-private-key.jks'), 'must-not-be-shipped');
        fs.writeFileSync(path.join(secretDir, '.env.release'), 'must-not-be-shipped');
        const sourceWithSecrets = await fetchPath(port, '/api/app/source.zip');
        const zipped = sourceWithSecrets.body.toString('latin1');
        ok(sourceWithSecrets.status === 200 && !zipped.includes('test-private-key.jks') && !zipped.includes('.env.release'), 'أرشيف المصدر يستثني مفاتيح التوقيع وملفات البيئة');
      } finally {
        fs.rmSync(secretDir, { recursive: true, force: true });
      }

      // لوحة التثبيت داخل الصفحة: الخادم يوفّر حالة APK ويبثّ الملف بنفسه،
      // فلا حاجة إلى فتح صفحة GitHub. يُختبر بمصدر APK محلي وهمي (بلا شبكة).
      const apkSource = http.createServer((req, res) => {
        const fake = Buffer.from('PK\u0003\u0004fake-apk-for-test');
        if (req.url === '/redirect') { res.writeHead(302, { Location: '/stereo-sound.apk' }); return res.end(); }
        if (req.url === '/broken') { res.writeHead(500, { 'Content-Type': 'text/plain' }); return res.end('no apk here'); }
        if (req.url === '/partial') {
          // يرسل جزءًا ثم يقطع الاتصال — كان هذا يُسقِط الخادم بالكامل
          res.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Length': 999999 });
          res.write('PK\u0003\u0004partial');
          setTimeout(() => res.socket.destroy(), 60);
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Length': fake.length });
        res.end(fake);
      });
      await new Promise((r) => apkSource.listen(0, '127.0.0.1', r));
      const apkPort = apkSource.address().port;
      const apkChild = spawn(process.execPath, [path.join(SITE, 'server.js'), `--port=${port + 1}`], {
        cwd: ROOT, stdio: 'ignore', env: Object.assign({}, process.env, { STEREO_APK_URL: `http://127.0.0.1:${apkPort}/redirect` }),
      });
      try {
        let apkReady = false;
        for (let i = 0; i < 40; i++) {
          const r = await fetchPath(port + 1, '/api/app/status');
          if (r.status === 200 || r.status === 503) { apkReady = true; break; }
          await new Promise((res) => setTimeout(res, 100));
        }
        ok(apkReady, 'خادم لوحة التثبيت يبدأ ويردّ على /api/app/status');

        if (apkReady) {
          const st = await fetchPath(port + 1, '/api/app/status');
          let stBody = null;
          try { stBody = JSON.parse(st.body.toString('utf8')); } catch (_) { /* يُفحص أدناه */ }
          ok(st.status === 200 && !!stBody && stBody.ready === true, 'حالة APK تُبلّغ أن الملف جاهز للتنزيل داخل الصفحة');
          ok(!!stBody && stBody.download === '/api/app/apk', 'الحالة تشير إلى مسار التنزيل داخل الموقع نفسه');
          ok(!!stBody && Array.isArray(stBody.steps) && stBody.steps.length >= 3, 'خطوات التثبيت تُرسل إلى الواجهة');

          const apk = await fetchPath(port + 1, '/api/app/apk');
          ok(apk.status === 200, 'ملف APK يُخدم من الخادم (200) بلا تحويل إلى موقع آخر');
          ok(/attachment/.test(String(apk.headers['content-disposition'] || '')) && /\.apk/.test(String(apk.headers['content-disposition'] || '')),
            'التنزيل يُرسل كملف مرفق (Content-Disposition: attachment)');
          ok(String(apk.headers['content-type'] || '').includes('android.package-archive'), 'نوع المحتوى الصحيح لملف APK');
          ok(apk.body.toString('utf8').includes('fake-apk-for-test'), 'محتوى APK يصل كاملًا عبر الخادم');
        }
      } finally {
        apkChild.kill('SIGTERM');
      }

      // مصدر APK معطوب: يجب أن يردّ الخادم بخطأ نظيف وألّا يسقط (كان خطأ التدفّق
      // غير المعالج يُنهي العملية كلها، فتتعطل المكتبة بأكملها).
      const badChild = spawn(process.execPath, [path.join(SITE, 'server.js'), `--port=${port + 2}`], {
        cwd: ROOT, stdio: 'ignore',
        env: Object.assign({}, process.env, { STEREO_APK_URL: `http://127.0.0.1:${apkPort}/broken` }),
      });
      const partialChild = spawn(process.execPath, [path.join(SITE, 'server.js'), `--port=${port + 3}`], {
        cwd: ROOT, stdio: 'ignore',
        env: Object.assign({}, process.env, { STEREO_APK_URL: `http://127.0.0.1:${apkPort}/partial` }),
      });
      try {
        let badReady = false;
        for (let i = 0; i < 40; i++) {
          const r = await fetchPath(port + 2, '/api/app/status');
          if (r.status === 200 || r.status === 503) { badReady = true; break; }
          await new Promise((res) => setTimeout(res, 100));
        }
        ok(badReady, 'خادم المصدر المعطوب يبدأ');
        if (badReady) {
          const broken = await fetchPath(port + 2, '/api/app/apk');
          ok(broken.status === 502 && broken.body.toString('utf8').includes('source.zip'),
            'مصدر APK المعطوب يردّ 502 مع بديل متاح (لا 500 غامض)');
          const alive = await fetchPath(port + 2, '/');
          ok(alive.status === 200, 'الخادم يبقى يعمل بعد فشل مصدر APK (لا سقوط)');
        }

        let partialReady = false;
        for (let i = 0; i < 40; i++) {
          const r = await fetchPath(port + 3, '/api/app/status');
          if (r.status === 200 || r.status === 503) { partialReady = true; break; }
          await new Promise((res) => setTimeout(res, 100));
        }
        ok(partialReady, 'خادم المصدر المنقطع يبدأ');
        if (partialReady) {
          const cut = await fetchPath(port + 3, '/api/app/apk');
          ok(cut.status === 200 && cut.truncated === true, 'البثّ المقطوع يصل كردّ ناقص بدل تعطّل الطلب');
          await new Promise((res) => setTimeout(res, 350));
          const stillUp = await fetchPath(port + 3, '/api/app/status');
          ok(stillUp.status === 200, 'انقطاع المصدر أثناء البثّ لا يُسقِط الخادم');
        }
      } finally {
        badChild.kill('SIGTERM');
        partialChild.kill('SIGTERM');
        apkSource.close();
      }

      const notFound = await fetchPath(port, '/لا-يوجد');
      ok(notFound.status === 404, 'المسار غير المعروف يردّ 404 (لا 500)');
    }
  } finally {
    child.kill('SIGTERM');
  }
}

// ------------------------------------------------------------------- التشغيل
(async () => {
  console.log('═'.repeat(62));
  console.log(' فحص الموقع وتطبيق ستيريو');
  console.log('═'.repeat(62));

  const catalog = checkCatalog();
  checkFrontend();
  checkAndroidProject();
  await checkServer(catalog);

  console.log('\n' + '═'.repeat(62));
  console.log(` النتيجة: ${pass} ناجح · ${fail} فاشل`);
  if (fail) {
    console.log(' الإخفاقات:');
    for (const f of failures) console.log('   ✘ ' + f);
  }
  console.log('═'.repeat(62));
  process.exit(fail ? 1 : 0);
})();
