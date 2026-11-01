#!/usr/bin/env node
'use strict';
/* Real Chromium regressions. Run: npm run test:browser (install Chromium once with npx playwright-core install chromium).
 * Set CHROMIUM_EXECUTABLE and optionally CHROMIUM_LIBRARY_PATH for a preinstalled browser. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const PORT = 4900 + Math.floor(Math.random() * 500);
const BASE = 'http://127.0.0.1:' + PORT;
const OUT = path.join(ROOT, '.browser-test-artifacts');
fs.mkdirSync(OUT, { recursive: true });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const server = spawn(process.execPath, [path.join(ROOT, 'site/server.js'), '--port=' + PORT], { cwd: ROOT, stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 60; i++) {
      try { const response = await fetch(BASE + '/'); if (response.ok) break; } catch (_) { /* startup */ }
      await delay(100);
    }
    const executablePath = process.env.CHROMIUM_EXECUTABLE || chromium.executablePath();
    if (process.env.CHROMIUM_LIBRARY_PATH) process.env.LD_LIBRARY_PATH = process.env.CHROMIUM_LIBRARY_PATH + ':' + (process.env.LD_LIBRARY_PATH || '');
    browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    const failed = [];
    const external = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => { if (response.status() >= 400) failed.push(response.url() + ' ' + response.status()); });
    page.on('request', (request) => { if (!request.url().startsWith(BASE) && !request.url().startsWith('blob:')) external.push(request.url()); });
    await page.goto(BASE + '/files-bot');
    await page.waitForSelector('.file-card');
    assert.equal(await page.locator('.file-card').count(), 12);
    assert.match(await page.locator('#result-count').textContent(), /150/);
    assert.equal(await page.locator('#brand-bot').evaluate((el) => el.getBoundingClientRect().width), 44);
    await page.waitForFunction(() => document.querySelectorAll('.file-thumb path[d]').length > 10);
    assert.equal(await page.evaluate(() => window.ZynqBot.version), '2.0.0');
    assert.equal(await page.evaluate(() => window.ZynqBot.voice.ctx), null);
    console.log('✔Loads the real 150-file manifest and renders animated Lottie paths, without autoplay audio');

    await page.locator('#show-new').click();
    assert.match(await page.locator('#result-count').textContent(), /16/);
    await page.locator('.file-card .btn-ghost').first().click();
    await page.waitForSelector('#dialog-preview path[d]');
    assert.equal(await page.locator('#file-dialog').evaluate((el) => el.open), true);
    const frame = () => page.evaluate(() => window.lottie.getRegisteredAnimations().at(-1).currentFrame);
    await page.locator('#preview-toggle').click();
    const paused = await frame(); await delay(180); assert.equal(await frame(), paused);
    await page.locator('#preview-toggle').click();
    await delay(180); assert.notEqual(await frame(), paused);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#dialog-download').click();
    const download = await downloadPromise;
    const downloaded = fs.readFileSync(await download.path());
    const original = fs.readFileSync(path.join(ROOT, 'site/downloads/bot', download.suggestedFilename()));
    assert.deepEqual(downloaded, original);
    assert.match(await page.locator('#download-status').textContent(), /تم إرسال/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#file-dialog').evaluate((el) => el.open), false);
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'معاينة');
    console.log('✔Native dialog, real animation pause/resume, Escape/focus restoration and byte-identical download');

    await page.locator('#category-select').selectOption('effects');
    await page.locator('#search').fill('برق');
    await page.waitForFunction(() => /وجدت ملفًا واحدًا/.test(document.querySelector('#result-count').textContent));
    assert.ok(await page.locator('.file-card').count() > 0);
    await page.locator('#search').fill('لا-يوجد-ملف-بهذا-الاسم');
    await page.waitForSelector('#empty:not([hidden])');
    await page.locator('#empty-reset').click();
    assert.equal(await page.locator('.file-card').count(), 12);
    await page.locator('#next-page').click();
    assert.match(await page.locator('#page-label').textContent(), /2/);
    await page.locator('[data-group="audio"]').click();
    assert.match(await page.locator('#result-count').textContent(), /24/);
    await page.locator('.file-card .btn-ghost').first().click();
    assert.equal(await page.locator('#dialog-preview audio').getAttribute('preload'), 'none');
    await page.locator('#dialog-close').click();
    console.log('✔Combined search, Arabic empty state, reset, pagination, audio category and opt-in audio preview');

    await page.locator('[data-ask="وريني الأنيميشن الجديد"]').click();
    assert.match(await page.locator('#chat-log').textContent(), /16/);
    await page.locator('#chat-input').fill('إزاي أستخدم Lottie؟');
    await page.locator('#chat-form button').click();
    assert.match(await page.locator('#chat-log').textContent(), /lottie-web/);
    await page.locator('.voice-settings summary').click();
    await page.locator('#voice-test').click();
    assert.match(await page.locator('#voice-status').textContent(), /لم أجد صوتًا عربيًا/);
    await page.locator('#btn-mute').click();
    assert.equal(await page.locator('#btn-mute').getAttribute('aria-pressed'), 'true');
    console.log('✔Arabic assistant intents and honest device-voice availability; mute is functional');

    await page.locator('#reset-filters').click();
    await page.locator('#motion-toggle').click();
    await page.screenshot({ path: path.join(OUT, 'assistant-desktop.png'), fullPage: true });
    for (const width of [390, 320, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'overflow at ' + width);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(OUT, 'assistant-mobile.png'), fullPage: true });
    await page.locator('.file-card .btn-ghost').first().click();
    assert.ok(await page.locator('#file-dialog').evaluate((el) => el.getBoundingClientRect().width <= innerWidth));
    await page.keyboard.press('Escape');
    console.log('✔320px, 390px, 768px and desktop layouts; mobile dialog stays inside viewport');

    // Intercept the manifest once to exercise the real retry path, then let it recover.
    await page.route('**/files/files.json*', (route) => route.fulfill({ status: 503, body: '{}' }), { times: 1 });
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#result-count').textContent.includes('تعذّر'));
    await page.locator('#result-count button').click();
    await page.waitForSelector('.file-card');
    console.log('✔Manifest failure shows an Arabic retry action and recovers to real data');

    // All new and existing Lottie assets must produce visible geometry in a real player.
    const geometry = await page.evaluate(async () => {
      const catalog = await (await fetch('/catalog.json')).json();
      const results = [];
      for (const item of catalog.items.filter((item) => item.format === 'Lottie JSON')) {
        const data = await (await fetch('/' + item.file)).json();
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:0;top:0;width:512px;height:512px';
        document.body.appendChild(host);
        const animation = window.lottie.loadAnimation({ container: host, renderer: 'svg', autoplay: false, animationData: data });
        let visible = false;
        for (const fraction of [0.1, 0.25, 0.4, 0.6, 0.8]) {
          animation.goToAndStop(animation.totalFrames * fraction, true);
          if (Array.from(host.querySelectorAll('path')).some((path) => (path.getAttribute('d') || '').length > 10)) visible = true;
        }
        results.push({ id: item.id, visible });
        animation.destroy(); host.remove();
      }
      return results;
    });
    assert.ok(geometry.every((item) => item.visible), JSON.stringify(geometry.filter((item) => !item.visible)));
    console.log('✔All ' + geometry.length + ' Lottie files render real visible geometry across animation frames');

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(BASE + '/bot/');
    await page.waitForSelector('#bot-stage svg');
    await page.locator('#say-input').fill('<img src=x onerror=alert(1)>');
    await page.locator('#say-btn').click();
    assert.equal(await page.locator('#say-log img').count(), 0);
    assert.match(await page.locator('#say-log').textContent(), /<img/);
    await page.locator('#mode-toggle').click();
    assert.equal(await page.evaluate(() => window.ZynqBot.voice.mode), 'beep');
    await page.locator('#mode-toggle').click();
    assert.equal(await page.evaluate(() => window.ZynqBot.voice.mode), 'arabic');
    await page.goto(BASE + '/');
    await page.waitForSelector('#grid .card');
    assert.equal(await page.locator('#grid .card').count(), 50);
    assert.deepEqual(errors, []);
    // The deliberately intercepted manifest 503 is expected; the homepage's APK may genuinely be unpublished.
    assert.deepEqual(failed.filter((url) => !url.includes('/files/files.json') && !url.includes('/api/app/status')), []);
    assert.deepEqual(external, []);
    console.log('✔Bot lab and 50-asset homepage; no JS errors, broken requests or external asset calls');
    console.log('Browser checks passed. Screenshots: ' + path.relative(ROOT, OUT));
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
