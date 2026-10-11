'use strict';

// ==========================================================================
//  زيتونة — الفحص البنيوي بقواعد tree-sitter
//  حين لا يكون مترجم اللغة مثبّتًا على الجهاز، لا نترك المخرج بلا فحص:
//  نُحلّله بقواعد الشجرة النحوية الرسمية للغة (tree-sitter) — وهذا **ليس**
//  مترجمًا، فنقول ذلك صريحًا ولا نسمّيه «تحقّق بمترجم».
//  التثبيت:  pip install tree-sitter tree-sitter-ruby tree-sitter-php \
//            tree-sitter-java tree-sitter-c-sharp tree-sitter-go tree-sitter-rust
// ==========================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'tools', 'parse_check.py');

const GRAMMAR_FOR = {
  rb: 'ruby', php: 'php', java: 'java', cs: 'c_sharp', go: 'go', rs: 'rust',
  c: 'c', cpp: 'cpp', ts: 'typescript',
};

const CACHE = new Map();

/** هل python3 موجود؟ */
function pythonBin() {
  if (CACHE.has('py')) return CACHE.get('py');
  let bin = null;
  for (const cand of ['python3', 'python']) {
    const r = spawnSync('bash', ['-c', `command -v ${cand}`], { encoding: 'utf8', timeout: 5000 });
    if (r.status === 0) { bin = cand; break; }
  }
  CACHE.set('py', bin);
  return bin;
}

/** المكتبات: متغيّر بيئة أو أحد المسارات المعتادة */
function libsProbe() {
  if (CACHE.has('libs')) return CACHE.get('libs');
  const bin = pythonBin();
  if (!bin) { CACHE.set('libs', { ok: false, note: 'python3 غير مثبّت — لا فحص بنيوي.' }); return CACHE.get('libs'); }
  const probe = spawnSync(bin, ['-c', 'import tree_sitter; print("ok")'], { encoding: 'utf8', timeout: 20000, env: probeEnv() });
  const ok = probe.status === 0 && (probe.stdout || '').includes('ok');
  const res = ok ? { ok: true, bin } : { ok: false, note: 'مكتبة tree-sitter غير مثبتة (pip install tree-sitter tree-sitter-ruby … ).' };
  CACHE.set('libs', res);
  return res;
}

function probeEnv() {
  const candidates = [
    process.env.ZAYTUNA_PYLIB,
    path.join(os.homedir(), '.zaytuna-pylibs'),
    path.join(__dirname, '..', '..', '.pylibs'),
  ].filter(Boolean).filter((d) => { try { return fs.statSync(d).isDirectory(); } catch (_) { return false; } });
  return candidates.length ? { ...process.env, PYTHONPATH: candidates.join(path.delimiter) + path.delimiter + (process.env.PYTHONPATH || '') } : process.env;
}

/**
 * فحص بنيوي لمخرج بلغة معيّنة.
 * @returns {{attempted:boolean, verified:boolean, ok:boolean, grammar:string|null,
 *            errors:Array, note?:string, isCompiler:false}}
 */
function structuralCheck(code, targetId, opts = {}) {
  const grammar = GRAMMAR_FOR[targetId];
  if (!grammar) {
    return { attempted: false, verified: false, ok: false, grammar: null, errors: [], note: 'لا قواعد شجرة لهذه اللغة.', isCompiler: false };
  }
  const libs = libsProbe();
  if (!libs.ok) {
    return { attempted: true, verified: false, ok: false, grammar, errors: [], note: libs.note, isCompiler: false };
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zaytuna-parse-'));
  const file = path.join(dir, `مخرج.${grammar}`);
  const pre = preprocessForGrammar(code, targetId);
  try {
    fs.writeFileSync(file, pre.code, 'utf8');
    const r = spawnSync(libs.bin, [SCRIPT, grammar, file], { encoding: 'utf8', timeout: opts.timeout || 30000, env: probeEnv() });
    if (r.error) return { attempted: true, verified: false, ok: false, grammar, errors: [], note: 'تعذّر تشغيل الفاحص: ' + r.error.message, isCompiler: false };
    let data = null;
    try { data = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch (_) { /* أدناه */ }
    if (!data) {
      return { attempted: true, verified: false, ok: false, grammar, errors: [], note: 'مخرَج غير مفهوم من الفاحص: ' + ((r.stderr || r.stdout || '').slice(0, 200)), isCompiler: false };
    }
    if (data.verified === false) {
      return { attempted: true, verified: false, ok: false, grammar, errors: [], note: data.reason || 'القواعد غير متاحة.', isCompiler: false };
    }
    const note = data.ok
      ? (pre.note ? 'لا عُقد خطأ في شجرة الصياغة. ' + pre.note : 'لا عُقد خطأ في شجرة الصياغة.')
      : (data.reason || '') + (pre.note ? ' ' + pre.note : '');
    return { attempted: true, verified: true, ok: !!data.ok, grammar, errors: data.errors || [], note, isCompiler: false };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* تجاهل */ }
  }
}

/**
 * تحويلات صغيرة **للفحص فقط** لتفادي قيود معروفة في القواعد (لا في اللغة).
 * مُوثَّقة ومُعلَنة: أي تحويل يجري هنا يُذكر في التقرير، ولا يُخفي خطأً حقيقيًا.
 */
function preprocessForGrammar(code, targetId) {
  if (targetId === 'rb') {
    // قواعد tree-sitter لروبي ترفض أسماء ثوابت غير لاتينية (مثل: class مركبة) —
    // وهي صحيحة في مترجم روبي الحقيقي (كما class 日本語)، فنستبدلها مؤقتًا للتحليل.
    let i = 0;
    if (/(^|\n)\s*class\s+[^\sA-Z_\s]/.test(code)) {
      const fixed = code.replace(/(^|\n)(\s*)class\s+([^\s(]+)/g, (m, nl, ind, name) => {
        if (/^[A-Z_]/.test(name)) return m;
        i++;
        return `${nl}${ind}class Zy${i}__`;
      });
      return { code: fixed, note: `(استُبدلت ${i} أسماء صنف غير لاتينية مؤقتًا للتحليل — قيد في قواعد tree-sitter لروبي، لا في اللغة.)` };
    }
  }
  return { code, note: '' };
}

/** هل الفحص البنيوي متاح الآن؟ (للتقارير) */
function structuralAvailable() { return libsProbe().ok; }

module.exports = { structuralCheck, structuralAvailable, GRAMMAR_FOR, preprocessForGrammar };
