#!/usr/bin/env node
'use strict';
/* Regression tests for the actual failure: wrong manifest URL, missing FX, and fake Arabic fallback. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'site/public');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ✔ ' + name); }

const manifest = JSON.parse(read('site/public/files/files.json'));
const catalog = JSON.parse(read('site/public/catalog.json'));
const app = read('site/public/files-bot/app.js');
const html = read('site/public/files-bot/index.html');
const css = read('site/public/files-bot/style.css');
const fresh = manifest.files.filter((f) => /^fx-bot-/.test(f.id));

test('150 real files: 100 original + 50 effects, with a correct manifest count', () => {
  assert.equal(manifest.files.length, 150);
  assert.equal(manifest.count, 150);
  assert.equal(catalog.items.length, 50);
  assert.equal(manifest.files.filter((f) => f.category === 'effects').length, 50);
  assert.equal(fresh.length, 16);
  assert.equal(new Set(manifest.files.map((f) => f.id)).size, manifest.files.length);
});
test('Every advertised file exists at its real URL with the advertised byte size', () => {
  for (const f of manifest.files) {
    assert.match(f.url, /^\/(files|downloads)\//);
    const full = path.join(PUBLIC, f.url.replace(/^\//, ''));
    const alternate = path.join(ROOT, 'site', f.url.replace(/^\//, ''));
    const actual = fs.existsSync(full) ? full : alternate;
    assert.ok(fs.existsSync(actual), f.url);
    assert.equal(fs.statSync(actual).size, f.size, f.url);
    assert.ok(f.size > 0);
    assert.ok(manifest.categories[f.category]);
  }
});
test('Manifest references the same effect bytes as the main catalog, without duplicate storage', () => {
  for (const item of catalog.items) {
    const f = manifest.files.find((entry) => entry.id === 'fx-' + item.id);
    assert.ok(f, item.id);
    assert.equal(f.url, '/' + item.file);
    assert.equal(f.usage, item.usage);
    assert.ok(f.programs.length);
  }
});
test('Assistant fetches ../files/files.json, not the old nonexistent local files.json', () => {
  assert.ok(app.includes('../files/files.json?v=2.0.0'));
  assert.ok(!/fetch\(['"]files\.json/.test(app));
  assert.ok(app.includes('new URL('));
  assert.ok(app.includes('retry.addEventListener'));
});
test('Arabic names and descriptions contain no leftover CJK or placeholder language fragments', () => {
  for (const f of manifest.files) {
    assert.ok(!/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(f.name + f.desc), f.id);
    assert.ok(!/suitable for APIs|numero|forest|escritura|Cascading/.test(f.desc), f.id);
  }
  assert.ok(!/escritura/.test(html));
});
test('All 8 new Lottie files have layers, timing and real animated properties', () => {
  const files = fresh.filter((f) => f.ext === 'json');
  assert.equal(files.length, 8);
  for (const f of files) {
    const data = JSON.parse(read('site/' + f.url.slice(1)));
    assert.equal(data.fr, 60); assert.equal(data.w, 512); assert.equal(data.h, 512);
    assert.ok(data.op > data.ip); assert.ok(data.layers.length >= 2);
    assert.ok(JSON.stringify(data).includes('"a":1'), f.id);
    for (const layer of data.layers) { assert.equal(layer.ty, 4); assert.ok(layer.shapes.length); }
  }
});
test('All 8 new SVG files are self-contained, titled and respect reduced motion', () => {
  const files = fresh.filter((f) => f.ext === 'svg');
  assert.equal(files.length, 8);
  for (const f of files) {
    const text = read('site/' + f.url.slice(1));
    assert.ok(text.includes('<title')); assert.ok(text.includes('<desc'));
    assert.ok(text.includes('@keyframes')); assert.ok(text.includes('prefers-reduced-motion'));
    const slug = f.url.split('/').pop().replace('.svg', '');
    assert.ok(text.includes('class="zy-bot-svg ' + slug + '"'));
    assert.ok(text.includes('.' + slug + ' .motion{animation:')); // inline SVG styles must not animate other cards
    assert.ok(!/<script|(?:href|src)="https?:\/\//.test(text));
  }
});
test('Search combines category/group/query and normalizes Arabic spelling', () => {
  assert.ok(app.includes("if (state.category && file.category !== state.category) return false"));
  assert.ok(app.includes("groups[state.group]"));
  assert.ok(app.includes('.replace(/[أإآٱ]/g,'));
  assert.ok(app.includes('terms.every'));
  assert.ok(!/stage\.say\(msg/.test(app)); // no speech on each keystroke
});
test('Real preview, local Lottie player, pause control and accessible native dialog are wired', () => {
  for (const id of ['file-dialog','dialog-preview','preview-toggle','motion-toggle','voice-select','voice-status','chat-input','download-status']) assert.ok(html.includes('id="' + id + '"'), id);
  assert.ok(html.includes('lottie-5.13.0.min.js'));
  assert.ok(read('site/public/bot/preview.js').includes('animationData: data'));
  assert.ok(read('site/public/bot/preview.js').includes('audio.preload = \'none\''));
  assert.ok(app.includes('dialog.showModal()'));
  assert.ok(app.includes("dialog.addEventListener('close'"));
  assert.ok(css.includes('prefers-reduced-motion'));
  assert.ok(fs.existsSync(path.join(PUBLIC, 'vendor/LOTTIE-LICENSE.md')));
  const lab = read('site/public/bot/index.html');
  assert.ok(lab.indexOf('voice-controls.js') < lab.indexOf('src="app.js'));
  assert.ok(lab.includes('id="voice-test"'));
  assert.ok(!read('site/public/bot/app.js').includes('ZynqVoiceControls.init') || lab.includes('voice-controls.js'));
});
test('Download reports browser handoff, not a false claim that the file was saved', () => {
  assert.ok(app.includes('response.blob()'));
  assert.ok(app.includes('URL.createObjectURL(blob)'));
  assert.ok(app.includes('URL.revokeObjectURL'));
  assert.ok(app.includes('تم إرسال'));
  assert.ok(!app.includes('تم حفظ الملف'));
});

function harness(initialVoices) {
  let voices = initialVoices;
  let contexts = 0;
  const spoken = [];
  const timers = new Set();
  const storage = new Map();
  const global = {
    console, location: { href: 'http://localhost/files-bot/' },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    matchMedia: () => ({ matches: false }),
    setTimeout(fn, ms) { const timer = { fn, ms }; timers.add(timer); return timer; },
    clearTimeout(timer) { timers.delete(timer); },
    localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k,v) => storage.set(k,v) },
    speechSynthesis: { getVoices: () => voices, addEventListener() {}, speak: (u) => spoken.push(u), cancel() { this.cancelled = true; } },
    SpeechSynthesisUtterance: function (text) { this.text = text; },
    AudioContext: function () {
      contexts++;
      this.state = 'running'; this.currentTime = 0; this.destination = {};
      const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
      const node = () => ({ connect() {}, disconnect() {}, gain: param(), frequency: param(), Q: { value: 0 }, start() {}, stop() {} });
      this.createGain = node; this.createAnalyser = node; this.createOscillator = node; this.createBiquadFilter = node;
    },
  };
  const sandbox = { window: global, console, setTimeout: global.setTimeout, clearTimeout: global.clearTimeout, localStorage: global.localStorage };
  vm.createContext(sandbox);
  vm.runInContext(read('site/public/bot/bot-engine.js'), sandbox);
  return { api: global.ZynqBot, voice: global.ZynqBot.voice, synthesis: global.speechSynthesis, spoken, timers, storage, setVoices: (v) => { voices = v; }, contexts: () => contexts };
}
const en = { name: 'English', lang: 'en-US', voiceURI: 'en' };
const sa = { name: 'Arabic Saudi', lang: 'ar-SA', voiceURI: 'sa' };
const eg = { name: 'Arabic Egypt', lang: 'ar-EG', voiceURI: 'eg' };

test('Arabic is the default; Egyptian Arabic wins when installed', () => {
  const h = harness([en, sa, eg]);
  assert.equal(h.voice.mode, 'arabic');
  const result = h.voice.speak('أهلًا بك');
  assert.equal(result.engine, 'speech'); assert.equal(result.queued, true);
  assert.equal(h.spoken[0].voice.voiceURI, 'eg'); assert.equal(h.spoken[0].lang, 'ar-EG');
  assert.equal(h.spoken[0].text, 'أهلًا بك');
});
test('No Arabic voice means visible-text fallback, never English speech or fake Arabic beeps', () => {
  const h = harness([en]);
  const result = h.voice.speak('مرحبًا');
  assert.equal(result.reason, 'no-arabic-voice'); assert.equal(result.spoken, false);
  assert.equal(h.spoken.length, 0); assert.equal(h.contexts(), 0);
});
test('Late-arriving Arabic voices are discovered without overriding a valid manual choice', () => {
  const h = harness([]); h.setVoices([en, eg, sa]); h.voice.refreshVoices();
  assert.equal(h.voice.arabicVoices().length, 2);
  assert.equal(h.voice.setVoice('en'), false);
  assert.equal(h.voice.setVoice('sa'), true);
  h.voice.refreshVoices(); assert.equal(h.voice.status().voice.uri, 'sa');
});
test('Speech lifecycle follows engine start/end events, not a guessed duration', () => {
  const h = harness([eg]); let ended = false;
  h.voice.speak('اختبار', { onEnd: () => { ended = true; } });
  assert.equal(h.voice.speaking, false); assert.equal(h.voice.pending, true);
  h.spoken[0].onstart(); assert.equal(h.voice.speaking, true);
  h.spoken[0].onend(); assert.equal(h.voice.speaking, false); assert.equal(ended, true);
});
test('Replacing a spoken turn preserves the new turn and restores its expression on end', () => {
  const h = harness([eg]);
  const attrs = {}; const classes = new Set();
  const svg = { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle: (c,v) => v ? classes.add(c) : classes.delete(c), contains: (c) => classes.has(c) }, setAttribute(k,v) { attrs[k] = v; }, getAttribute() { return 'open'; }, style: { setProperty() {} } };
  const bot = h.api.mount({ querySelector: () => svg, innerHTML: '' }, { alive: false, expression: 'idle' });
  bot.say('الجملة الأولى', { expression: 'happy', then: 'idle' });
  h.spoken[0].onstart();
  bot.say('الجملة الثانية', { expression: 'star', then: 'idle' });
  h.spoken[1].onstart(); assert.equal(classes.has('is-talking'), true);
  h.spoken[1].onend(); assert.equal(classes.has('is-talking'), false); assert.equal(attrs['data-eyes'], 'open');
  bot.destroy();
});
test('A stuck speech engine times out, cancels audio and reports the real failure', () => {
  const h = harness([eg]); let reason = '';
  h.synthesis.cancelled = false;
  h.voice.speak('اختبار', { onEnd: (result) => { reason = result.reason; } });
  const timer = [...h.timers][0]; timer.fn();
  assert.equal(reason, 'timeout'); assert.equal(h.voice.speaking, false); assert.equal(h.synthesis.cancelled, true);
});
test('Mute cancels speech, persists and does not queue more audio', () => {
  const h = harness([eg]); h.voice.speak('اختبار'); h.voice.setMuted(true);
  assert.equal(h.voice.speaking, false); assert.equal(h.storage.get('zynq-bot-muted'), '1');
  assert.equal(h.voice.speak('لن يُنطق').reason, 'muted'); assert.equal(h.spoken.length, 1);
});
test('Robot beeps are explicit and never reported as spoken Arabic', () => {
  const h = harness([eg]); h.voice.setMode('beep');
  const result = h.voice.speak('مرحبًا');
  assert.equal(result.engine, 'beep'); assert.equal(result.spoken, false);
  assert.equal(h.spoken.length, 0); assert.ok(h.contexts() > 0);
  let ended = false; h.voice.speak('اختبار النغمات', { onEnd: () => { ended = true; } });
  [...h.timers].find((timer) => timer.ms > 200).fn(); assert.equal(ended, true);
  h.voice.stop(); assert.equal(h.voice.speaking, false);
});
test('Mounting and silent waving create no audio; destroy clears pending animation timers', () => {
  const h = harness([]);
  const classes = new Set();
  const svg = { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle: (c,v) => v ? classes.add(c) : classes.delete(c), contains: (c) => classes.has(c) }, setAttribute() {}, getAttribute() { return 'open'; }, style: { setProperty() {} } };
  const host = { querySelector: () => svg, innerHTML: '' };
  const bot = h.api.mount(host, { alive: false });
  bot.wave({ silent: true }); assert.equal(h.contexts(), 0); assert.equal(h.spoken.length, 0);
  let visible = '';
  bot.say('النص يظهر حتى بدون صوت', { onSay: (text) => { visible = text; } });
  assert.ok(visible); assert.equal(classes.has('is-talking'), false);
  bot.wave({ silent: true }); assert.ok(h.timers.size > 0);
  bot.destroy(); assert.equal(h.timers.size, 0); assert.equal(host.innerHTML, '');
});
console.log('  النتيجة: ' + passed + ' فحصًا ناجحًا للصوت والمساعد والمؤثرات');
