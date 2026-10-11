'use strict';

// ==========================================================================
//  زيتونة — هدف لغة سي (C11)
//  ليست سي سهلة الهدف: لا نصوص ديناميكية ولا قوائم مدمجة — لذلك نُولّد مع
//  المخرج **أدوات صغيرة** (تحويل القيم إلى نص، دمج النصوص، قوائم عددية)،
//  ونستنتج أنواع الدوال من مواضع الاستدعاء، وما لا نستطيع ترجمته نقوله.
//  والتحقق هنا حقيقي: gcc هو الحكم، ثم نُشغّل المخرج ونقارنه بجافاسكربت.
// ==========================================================================

const { Writer } = require('./writer');
const { MACROS } = require('../dictionary');

const PRELUDE = `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>

/* ===== أدوات زيتونة في سي (مولَّدة آليًا) ===== */
static char* _ز_نص_عدد(double قيمة) {
  char* نص = (char*)malloc(64);
  if (قيمة == (double)(long long)قيمة) snprintf(نص, 64, "%lld", (long long)قيمة);
  else snprintf(نص, 64, "%g", قيمة);
  return نص;
}

static char* _ز_نص_منطقي(int قيمة) {
  char* نص = (char*)malloc(8);
  strcpy(نص, قيمة ? "true" : "false");
  return نص;
}

static char* _ز_دمج(const char* أ, const char* ب) {
  size_t ن = strlen(أ) + strlen(ب) + 1;
  char* ر = (char*)malloc(ن);
  strcpy(ر, أ);
  strcat(ر, ب);
  return ر;
}

static void _ز_إلحاق(char** نص, size_t* طول, const char* زيادة) {
  size_t ع = strlen(زيادة);
  *نص = (char*)realloc(*نص, *طول + ع + 1);
  strcpy(*نص + *طول, زيادة);
  *طول += ع;
}

static void _ز_طبع(const char* نص) { printf("%s\\n", نص); }

typedef struct { double* عناصر; long حجم; long سعة; } _ز_قائمة;

static _ز_قائمة* _ز_قائمة_جديدة(void) {
  _ز_قائمة* ق = (_ز_قائمة*)malloc(sizeof(_ز_قائمة));
  ق->سعة = 4; ق->حجم = 0;
  ق->عناصر = (double*)malloc(sizeof(double) * 4);
  return ق;
}

static void _ز_أضف(_ز_قائمة* ق, double عنصر) {
  if (ق->حجم == ق->سعة) {
    ق->سعة *= 2;
    ق->عناصر = (double*)realloc(ق->عناصر, sizeof(double) * ق->سعة);
  }
  ق->عناصر[ق->حجم++] = عنصر;
}

static long _ز_طول(_ز_قائمة* ق) { return ق->حجم; }

static _ز_قائمة* _ز_قائمة_من(long عدد, ...) {
  _ز_قائمة* ق = _ز_قائمة_جديدة();
  va_list وسائط;
  va_start(وسائط, عدد);
  for (long i = 0; i < عدد; i++) _ز_أضف(ق, va_arg(وسائط, double));
  va_end(وسائط);
  return ق;
}

static char* _ز_نص_قائمة(_ز_قائمة* ق) {
  char* ر = (char*)malloc(2);
  size_t طول = 0;
  ر[0] = '\\0';
  _ز_إلحاق(&ر, &طول, "[");
  for (long i = 0; i < ق->حجم; i++) {
    if (i) _ز_إلحاق(&ر, &طول, ", ");
    _ز_إلحاق(&ر, &طول, _ز_نص_عدد(ق->عناصر[i]));
  }
  _ز_إلحاق(&ر, &طول, "]");
  return ر;
}

static int _ز_مقارنة(const void* أ, const void* ب) {
  double x = *(const double*)أ, y = *(const double*)ب;
  return (x > y) - (x < y);
}

static void _ز_رتب(_ز_قائمة* ق) { qsort(ق->عناصر, ق->حجم, sizeof(double), _ز_مقارنة); }

static _ز_قائمة* _ز_تحويل(_ز_قائمة* ق, double (*دالة)(double)) {
  _ز_قائمة* ر = _ز_قائمة_جديدة();
  for (long i = 0; i < ق->حجم; i++) _ز_أضف(ر, دالة(ق->عناصر[i]));
  return ر;
}

static _ز_قائمة* _ز_منقي(_ز_قائمة* ق, int (*دالة)(double)) {
  _ز_قائمة* ر = _ز_قائمة_جديدة();
  for (long i = 0; i < ق->حجم; i++) if (دالة(ق->عناصر[i])) _ز_أضف(ر, ق->عناصر[i]);
  return ر;
}

static int _ز_يحتوي(_ز_قائمة* ق, double قيمة) {
  for (long i = 0; i < ق->حجم; i++) if (ق->عناصر[i] == قيمة) return 1;
  return 0;
}
/* ===== نهاية الأدوات ===== */`;

const TYPE_HINT = { 'عدد': 'double', 'عشري': 'double', 'نص': 'const char*', 'منطقي': 'int', 'قائمة': '_ز_قائمة*' };

function isThis(n) { return !!n && (n.type === 'ThisLit' || (n.type === 'Id' && n.name === 'this')); }

let SEQ = 0;

class CEmitter {
  constructor(ast, opts = {}) {
    this.ast = ast;
    this.w = new Writer('  ', '');
    this.unsupported = [];
    this.notes = [];
    this.funcs = new Map();       // اسم الدالة ← {decl, paramKinds, retKind}
    this.kinds = new Map();       // اسم متغيّر ← نوع
    this.lambdas = new Map();     // دوال سهمية مولَّدة
  }

  bad(kind, node) {
    this.unsupported.push({ kind, line: node && node.line ? node.line : null });
  }

  // ------------------------------------------------------- استنتاج الأنواع
  run() {
    const body = this.ast.body || [];
    this.collectFunctions(body);
    this.inferFunctions(body);
    this.inferToplevel(body);

    for (const line of PRELUDE.split('\n')) this.w.push(line);
    this.w.push('');
    const declIndex = this.w.lines.length;      // موضع إعلانات دوال السهام (تُملأ في النهاية)

    const top = body.filter((s) => s.type === 'FuncDecl');
    const main = body.filter((s) => s.type !== 'FuncDecl');
    for (const s of top) {
      this.w.flushComments(s.line, this.ast.comments, '// ');
      this.emitStatement(s);
      this.w.push('');
    }
    this.w.push('int main(void) {', null);
    this.w.indent++;
    for (const s of main) {
      this.w.flushComments(s.line, this.ast.comments, '// ');
      this.emitStatement(s);
    }
    this.w.push('return 0;', null);
    this.w.indent--;
    this.w.push('}', null);

    // دوال الدوال السهمية تُكتب آخر الملف، وإعلاناتها تُدرج في موضعها المحفوظ
    const decls = [];
    if (this.lambdas.size) this.w.push('');
    for (const [name, l] of this.lambdas) {
      if (!l.body) continue;
      decls.push(`static ${l.ret} ${name}(double ${l.param});`);
      this.w.push(`static ${l.ret} ${name}(double ${l.param}) { return ${l.body}; }`);
    }
    this.w.insert(declIndex, decls);
    this.w.flushRest(this.ast.comments, '// ');
    return { code: this.w.toString(), map: this.w.map, unsupported: this.unsupported, notes: this.notes };
  }

  collectFunctions(body) {
    for (const s of body) {
      if (s.type !== 'FuncDecl') continue;
      this.funcs.set(s.name, { decl: s, paramKinds: s.params.map(() => new Set()), paramTypes: s.paramTypes || [], retKind: null, returns: [] });
      s.params.forEach((p, i) => { if (p.startsWith('...')) this.funcs.get(s.name).paramKinds[i].add('list'); });
    }
  }

  /** أنواع الوسائط من مواضع الاستدعاء + نوع الإرجاع من عبارات «أرجع» */
  inferFunctions(body) {
    const walk = (node, fn) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { for (const x of node) walk(x, fn); return; }
      if (node.type === 'Call' && node.callee && node.callee.type === 'Id' && this.funcs.has(node.callee.name)) {
        const f = this.funcs.get(node.callee.name);
        node.args.forEach((a, i) => { if (f.paramKinds[i]) f.paramKinds[i].add(this.kindOfLocal(a, fn)); });
      }
      if (node.type === 'ReturnStmt' && node.argument && fn) fn.returns.push(this.kindOfLocal(node.argument, fn));
      for (const k of Object.keys(node)) {
        if (k === 'type' || k === 'line' || k === 'col') continue;
        walk(node[k], fn);
      }
    };
    for (const [name, f] of this.funcs) {
      walk(f.decl.body.body, f);
      const kinds = new Set(f.returns);
      kinds.delete('void');
      if (kinds.size === 0) f.retKind = 'void';
      else if (kinds.size === 1) f.retKind = [...kinds][0];
      else {
        f.retKind = 'void';
        this.notes.push(`سطر ${f.decl.line}: الدالة «${name}» تُرجع أنواعًا مختلفة — تُرجمت دون قيمة مرجعة (راجعها).`);
      }
    }
  }

  inferToplevel(body) {
    for (const s of body) {
      if (s.type === 'VarDecl') for (const d of s.decls) this.kinds.set(d.name, this.annKind(d.typeAnn) || this.kindOfLocal(d.init, null));
    }
  }

  annKind(t) {
    if (!t) return null;
    const name = t.name || (t.kind === 'name' ? t.js : null);
    return TYPE_HINT[name] || null;
  }

  /** نوع تعبير بالتقريب (للطباعة والتحويلات) */
  kindOfLocal(n, fn) {
    if (!n) return 'void';
    switch (n.type) {
      case 'NumLit': return 'num';
      case 'StrLit': return 'str';
      case 'BoolLit': return 'bool';
      case 'ArrayLit': return 'list';
      case 'Spread': return 'list';
      case 'Id':
        if (this.kinds.has(n.name)) return this.kinds.get(n.name);
        return 'num';                       // متغيّر حلقة/غير معروف: نفترض رقمًا (ويظهر في الملاحظات عند الشك)
      case 'Member': return 'num';
      case 'Index': return 'num';
      case 'Bin': case 'Logical':
        return (n.op === '+' && this.isStr(n)) ? 'str' : (n.op === '&&' || n.op === '||' || n.op === '===' || n.op === '!==' || n.op === '<' || n.op === '>' || n.op === '<=' || n.op === '>=') ? 'bool' : 'num';
      case 'Unary': return n.op === '!' ? 'bool' : 'num';
      case 'Update': return 'num';
      case 'Conditional': return this.kindOfLocal(n.consequent, fn);
      case 'Call': {
        if (n.callee.type === 'Id') {
          const macro = MACROS[n.callee.name];
          if (macro) {
            if (n.callee.name === 'نص') return 'str';
            if (n.callee.name === 'عدد') return 'num';
            if (n.callee.name === 'منطقي') return 'bool';
            if (n.callee.name === 'يحتوي' || n.callee.name === 'مفاتيح') return 'bool';
            if (n.callee.name === 'قيم' || n.callee.name === 'اقسم') return 'list';
            if (n.callee.name === 'انضم' || n.callee.name === 'طول' && this.kindOfLocal(n.args[0], fn) === 'str') return 'num';
          }
          const f = this.funcs.get(n.callee.name);
          if (f && f.retKind) return f.retKind;
        }
        if (n.callee.type === 'Member') {
          const prop = n.callee.computed ? null : n.callee.property;
          if (prop === 'length') return 'num';
          if (prop === 'includes' || prop === 'startsWith' || prop === 'endsWith') return 'bool';
          if (prop === 'join' || prop === 'toString' || prop === 'toUpperCase' || prop === 'toLowerCase' || prop === 'trim') return 'str';
          if (prop === 'split' || prop === 'map' || prop === 'filter') return 'list';
        }
        return 'num';
      }
      default: return 'num';
    }
  }

  isStr(n) {
    if (!n || n.type !== 'Bin' || n.op !== '+') return false;
    const part = (x) => x.type === 'StrLit' || this.kindOfLocal(x, null) === 'str';
    return part(n.left) || part(n.right);
  }

  strTypeFor(kind) {
    if (kind === 'str') return 'const char*';
    if (kind === 'list') return '_ز_قائمة*';
    if (kind === 'bool') return 'int';
    return 'double';
  }

  /** تحويل قيمة إلى نصّ كما تطبعه جافاسكربت */
  asText(node) {
    const before = this.unsupported.length;
    const code = this.expr(node);
    const kind = this.kindOfLocal(node, null);
    // تعبير غير مدعوم ⇒ نصّ فارغ بدل تعبير لا يُترجم (وقد أُعلن السبب أصلًا)
    if (this.unsupported.length > before) return '""';
    if (kind === 'str') return code;
    if (kind === 'bool') return `_ز_نص_منطقي(${code})`;
    if (kind === 'list') return `_ز_نص_قائمة(${code})`;
    if (kind === 'void') { this.bad('قيمة بلا نوع معروف في نصّ', node); return `""`; }
    return `_ز_نص_عدد(${code})`;
  }

  /** أنواع الوسائط المحسومة (تُحسب مرة واحدة) — لضبط النداءات أيضًا */
  resolvedParams(f) {
    if (!f._resolved) f._resolved = f.decl.params.map((p, i) => {
      if (p.startsWith('...')) return '_ز_قائمة*';
      return this.paramType(f, i, p.replace(/^\.\.\./, ''));
    });
    return f._resolved;
  }

  paramType(f, index, name) {
    const ann = this.annKind(f.paramTypes[index]);
    if (ann) return ann;
    const kinds = [...f.paramKinds[index] || []];
    const real = kinds.filter((k) => k !== 'void');
    if (real.length === 1) return this.strTypeFor(real[0]);
    if (real.length === 0) {
      this.notes.push(`سطر ${f.decl.line}: الوسيط «${name}» بلا استدعاء ولا نوع ← عُومل رقمًا (double).`);
      return 'double';
    }
    this.bad(`الوسيط «${name}» في «${f.decl.name}» يُستدعى بأنواع مختلفة (${real.join('، ')}) — سي تحتاج دوال منفصلة`, f.decl);
    return 'double';
  }

  // -------------------------------------------------------------- الكتابة
  emitStatement(node) {
    switch (node.type) {
      case 'VarDecl': {
        for (const d of node.decls) {
          const ann = this.annKind(d.typeAnn);
          if (d.init && d.init.type === 'Arrow' && !ann) {
            // دالة سهمية في ثابت ⇒ مؤشر دالة (نستدعيها بالاسم كما في زيتونة)
            const ref = this.lambdaRef(d.init);
            const l = this.lambdas.get(ref);
            const retType = l ? l.ret : 'double';
            this.kinds.set(d.name, 'fn');
            this.w.push(`${retType} (*${d.name})(double) = ${ref};`, d.line || node.line);
            continue;
          }
          const kind = ann ? this.kindFromType(ann) : this.kindOfLocal(d.init, null);
          this.kinds.set(d.name, kind);
          const type = ann || this.strTypeFor(kind);
          const value = d.init ? this.expr(d.init) : this.defaultFor(ann || this.strTypeFor(kind));
          this.w.push(`${type} ${d.name} = ${value};`, d.line || node.line);
        }
        return;
      }
      case 'ExprStmt': {
        const e = node.expr;
        if (e.type === 'Call' && e.callee.type === 'Id' && MACROS[e.callee.name]) {
          const inside = this.macroCall(e, true);
          if (inside !== null) { this.w.push(inside, node.line); return; }
        }
        const text = this.expr(e);
        this.w.push(`${text}${/;$/.test(text) ? '' : ';'}`, node.line);
        return;
      }
      case 'FuncDecl': return this.funcDecl(node);
      case 'IfStmt': return this.ifStmt(node);
      case 'WhileStmt': {
        this.w.push(`while (${this.truth(this.expr(node.test))}) {`, node.line);
        this.body(node.body.body); this.w.push('}');
        return;
      }
      case 'ForStmt': return this.forStmt(node);
      case 'ForOfStmt': return this.forOf(node);
      case 'SwitchStmt': return this.switchStmt(node);
      case 'MatchStmt': return this.matchStmt(node);
      case 'ReturnStmt': this.w.push(`return${node.argument ? ' ' + this.expr(node.argument) : ''};`, node.line); return;
      case 'BreakStmt': this.w.push('break;', node.line); return;
      case 'ContinueStmt': this.w.push('continue;', node.line); return;
      case 'Block': this.w.push('{'); this.body(node.body); this.w.push('}'); return;
      case 'ClassDecl': this.bad('أصناف (سي لا تدعم الصفوف)', node); return;
      case 'TryStmt': this.bad('جرب/التقط (لا استثناءات في سي)', node); return;
      case 'ThrowStmt': this.bad('ارفع (throw)', node); return;
      case 'ImportStmt': case 'ExportStmt': this.bad('استورد/صدّر (الوحدات)', node); return;
      default: this.bad(`عقدة غير معروفة: ${node.type}`, node);
    }
  }

  kindFromType(type) {
    if (type === 'const char*') return 'str';
    if (type === '_ز_قائمة*') return 'list';
    if (type === 'int') return 'bool';
    return 'num';
  }

  defaultFor(type) {
    if (type === 'const char*') return '""';
    if (type === '_ز_قائمة*') return '_ز_قائمة_جديدة()';
    return '0';
  }

  body(list) { this.w.indent++; for (const s of list) { this.w.flushComments(s.line, this.ast.comments, '// '); this.emitStatement(s); } this.w.indent--; }

  /** «قيمة صحيحة؟» — سي تحتاج مقارنة صريحة */
  truth(code) { return `(${code}) != 0`; }

  funcDecl(node) {
    const f = this.funcs.get(node.name);
    const params = node.params.map((p, i) => {
      const name = p.replace(/^\.\.\./, '');
      if (p.startsWith('...')) {
        this.notes.push(`سطر ${node.line}: المعامل التجميعي «${name}» ← قائمة سي (_ز_قائمة*)؛ النداءات يجب أن تمرّر «انشر قائمة».`);
        return `_ز_قائمة* ${name}`;
      }
      return `${this.paramType(f, i, name)} ${name}`;
    });
    const ret = f.retKind === 'str' ? 'const char*' : f.retKind === 'list' ? '_ز_قائمة*' : f.retKind === 'bool' ? 'int' : f.retKind === 'void' ? 'void' : 'double';
    if (node.typeParams && node.typeParams.length) this.bad('أدوية عامة (generics) — سي لا تدعمها', node);
    // نُسجّل أنواع الوسائط كي يُعرَف داخل الجسم أنها (قائمة/نصّ/عدد)
    node.params.forEach((p, i) => {
      const name = p.replace(/^\.\.\./, '');
      const type = params[i].split(' ')[0];
      this.kinds.set(name, p.startsWith('...') ? 'list' : this.kindFromType(type));
    });
    this.w.push(`static ${ret} ${node.name}(${params.length ? params.join(', ') : 'void'}) {`, node.line);
    this.body(node.body.body);
    if (f.retKind !== 'void' && !this.endsWithReturn(node.body.body)) {
      const rt = ret === 'const char*' ? '""' : ret === '_ز_قائمة*' ? '_ز_قائمة_جديدة()' : ret === 'int' ? '0' : '0';
      this.w.push(`return ${rt};`);
    }
    this.w.push('}');
  }

  endsWithReturn(list) {
    const last = [...(list || [])].reverse().find((s) => s && s.type !== 'Block');
    if (!last) return false;
    if (last.type === 'ReturnStmt') return true;
    if (last.type === 'IfStmt' && last.alternate && last.consequent && last.alternate) {
      return this.endsWithReturn(last.consequent.body) && this.endsWithReturn(last.alternate.type === 'IfStmt' ? [last.alternate] : last.alternate.body);
    }
    if (last.type === 'MatchStmt' || last.type === 'SwitchStmt') return true;   // كل الفروع تُرجع أو لا (نتسامح مع الأخير)
    return false;
  }

  ifStmt(node) {
    let cur = node;
    let first = true;
    while (true) {
      this.w.push(`${first ? 'if' : 'else if'} (${this.truth(this.expr(cur.test))}) {`, cur.line);
      this.body(cur.consequent.body);
      this.w.push('}');
      first = false;
      if (cur.alternate && cur.alternate.type === 'IfStmt') { cur = cur.alternate; continue; }
      break;
    }
    if (cur.alternate) {
      this.w.push('else {', cur.line);
      this.body(cur.alternate.body);
      this.w.push('}');
    }
  }

  forStmt(node) {
    const init = node.init;
    const single = init && init.type === 'VarDecl' && init.decls.length === 1 ? init.decls[0] : null;
    const initText = single
      ? `${this.annKind(single.typeAnn) || 'double'} ${single.name} = ${single.init ? this.expr(single.init) : '0'}`
      : (init ? this.expr(init).replace(/;$/, '') : '');
    if (single) this.kinds.set(single.name, 'num');
    const test = node.test ? this.truth(this.expr(node.test)) : '1';
    let update = '';
    if (node.update) {
      update = node.update.type === 'Update'
        ? (node.update.prefix ? `${node.update.op}${this.expr(node.update.arg)}` : `${this.expr(node.update.arg)}${node.update.op}`)
        : this.expr(node.update).replace(/;$/, '');
    }
    this.w.push(`for (${initText}; ${test}; ${update}) {`, node.line);
    this.body(node.body.body);
    this.w.push('}');
  }

  forOf(node) {
    const kind = this.kindOfLocal(node.iterable, null);
    if (kind !== 'list') { this.bad('«لكل … في» على قيمة ليست قائمة عددية', node); return; }
    const src = `__ق${++SEQ}`;
    this.w.push(`_ز_قائمة* ${src} = ${this.expr(node.iterable)};`, node.line);
    this.w.push(`for (long __i${SEQ} = 0; __i${SEQ} < _ز_طول(${src}); __i${SEQ}++) {`);
    this.w.indent++;
    this.kinds.set(node.name, 'num');
    this.w.push(`double ${node.name} = ${src}->عناصر[__i${SEQ}];`);
    this.w.indent--;
    this.body(node.body.body);
    this.w.push('}');
  }

  switchStmt(node) {
    if (node.discriminant.type === 'BoolLit' && node.discriminant.value === true) {
      this.chain(node.cases.map((c) => ({ cond: c.test ? this.expr(c.test) : null, body: this.dropBreaks(c.body), line: c.line })), node);
      return;
    }
    const tmp = this.kindOfLocal(node.discriminant, null) === 'str' ? `const char* __ق${++SEQ}` : `double __ق${++SEQ}`;
    const name = tmp.split(' ').pop();
    this.w.push(`${tmp} = ${this.expr(node.discriminant)};`, node.line);
    const isStr = tmp.startsWith('const char*');
    this.chain(node.cases.map((c) => ({
      cond: c.test === null ? null : (isStr ? `strcmp(${name}, ${this.expr(c.test)}) == 0` : `${name} == ${this.expr(c.test)}`),
      body: this.dropBreaks(c.body), line: c.line,
    })), node);
  }

  matchStmt(node) {
    const kind = this.kindOfLocal(node.discriminant, null);
    const name = `__م${++SEQ}`;
    const type = kind === 'str' ? 'const char*' : kind === 'list' ? '_ز_قائمة*' : 'double';
    this.w.push(`${type} ${name} = ${this.expr(node.discriminant)};`, node.line);
    this.chain(node.arms.map((a) => {
      if (a.pattern.kind === 'object') {
        this.bad('فرع بـ«نمط كائن» — سي لا خرائط فيها، ولم يُترجم جسم الفرع', a.pattern);
        return { cond: '0', body: [], line: a.line, binds: [] };
      }
      const isList = a.pattern.kind === 'array';
      if (isList && kind !== 'list') {
        this.bad(`نمط قائمة على قيمة نوعها ${kind} في سي`, a.pattern);
        return { cond: '0', body: [], line: a.line, binds: [] };
      }
      return {
        cond: this.pattern(name, kind, a.pattern, a.guard),
        body: this.dropBreaks(a.body), line: a.line,
        binds: isList ? a.pattern.names.map((n2, i) => { this.kinds.set(n2, 'num'); return `double ${n2} = ${name}->عناصر[${i}];`; }) : [],
      };
    }), node);
  }

  dropBreaks(body) { return (body || []).filter((s) => s.type !== 'BreakStmt'); }

  chain(items, node) {
    const branches = items.filter((i) => i.cond !== null);
    const rest = items.find((i) => i.cond === null);
    let first = true;
    for (const it of branches) {
      this.w.push(`${first ? 'if' : 'else if'} (${it.cond}) {`, it.line);
      this.w.indent++;
      for (const b of (it.binds || [])) this.w.push(b);
      this.w.indent--;
      this.body(it.body);
      this.w.push('}');
      first = false;
    }
    if (rest) {
      this.w.push(first ? 'if (1) {' : 'else {', rest.line);
      this.w.indent++;
      for (const b of (rest.binds || [])) this.w.push(b);
      this.w.indent--;
      this.body(rest.body);
      this.w.push('}');
    }
  }

  pattern(tmp, kind, pattern, guard) {
    const g = guard ? `(${this.truth(this.expr(guard))})` : null;
    if (pattern.kind === 'default') return g;
    let cond;
    switch (pattern.kind) {
      case 'lit': {
        const lit = this.expr(pattern.value);
        cond = (kind === 'str' && pattern.value.type === 'StrLit') ? `strcmp(${tmp}, ${lit}) == 0` : `${tmp} == ${lit}`;
        break;
      }
      case 'alt': cond = pattern.alts.map((a) => `(${this.pattern(tmp, kind, a, null)})`).join(' || '); break;
      case 'range': cond = `(${tmp} >= ${this.expr(pattern.from)} && ${tmp} <= ${this.expr(pattern.to)})`; break;
      case 'type': {
        const raw = pattern.arg.type === 'StrLit' ? pattern.arg.raw : null;
        this.bad(`نمط النوع «${raw}» — سي لا تعرف الأنواع وقت التشغيل`, pattern);
        cond = '1';
        break;
      }
      case 'array':
        if (kind !== 'list') { this.bad('نمط قائمة على قيمة ليست قائمة في سي', pattern); cond = '0'; }
        else cond = `(_ز_طول(${tmp}) == ${pattern.names.length})`;
        break;
      default:
        this.bad('نمط كائن (لا خرائط في سي)', pattern);
        cond = '1';
    }
    return g ? `(${cond}) && ${g}` : cond;
  }

  // ------------------------------------------------------------ التعبيرات
  expr(node) {
    if (!node) return '';
    switch (node.type) {
      case 'NumLit': return String(node.value);
      case 'StrLit': return node.js;
      case 'BoolLit': return node.value ? '1' : '0';
      case 'NullLit': case 'UndefinedLit': return '0';
      case 'ThisLit': this.bad('«هذا» خارج صنف — سي بلا أصناف', node); return '0';
      case 'Id': return node.name;
      case 'ArrayLit': {
        const kinds = node.elements.map((e) => this.kindOfLocal(e, null));
        if (kinds.some((k) => k === 'str')) {
          this.bad('قائمة نصوص — قوائم سي العددية فقط', node);
          return '_ز_قائمة_جديدة()';
        }
        const بناء = `_ز_قائمة_جديدة()`;
        const tmp = `__ل${++SEQ}`;
        // نبني القائمة عبر تعبير شرطي غير ممكن ⇒ نستخدم دالة مساعدة سطرية
        // مهم: القيم تُمرَّر كـ double صراحةً (va_arg يقرأ double — الأعداد الصحيحة تُفسَّر خطأً)
        const els = node.elements.map((e) => `(double)(${this.expr(e)})`);
        return `_ز_قائمة_من(${els.length}${els.length ? ', ' + els.join(', ') : ''})`;
      }
      case 'ObjectLit': this.bad('كائن/قاموس (لا خرائط في سي)', node); return '0';
      case 'Member': {
        if (node.computed) return this.index(node.object, node.property);   // ق[0] ← ق->عناصر[0]
        if (node.property === 'length') {
          const k = this.kindOfLocal(node.object, null);
          return k === 'str' ? `(double)strlen(${this.expr(node.object)})` : `(double)_ز_طول(${this.expr(node.object)})`;
        }
        if (node.object.type === 'ArrayLit') return `_ز_قائمة_جديدة()`;
        this.bad('خاصية كائن (لا كائنات في سي)', node);
        return '0';
      }
      case 'Index': return this.index(node.object, node.property);
      case 'Bin': case 'Logical': return this.bin(node);
      case 'Unary': {
        if (node.op === 'typeof') { this.bad('«نوع» (typeof)', node); return '"number"'; }
        if (node.op === 'delete') { this.bad('«احذف»', node); return '0'; }
        const a = this.expr(node.arg);
        if (node.op === '!') return `(!(${this.truth(a)}))`;
        return `(${node.op}(${a}))`;
      }
      case 'Update': this.bad(`«${node.op}» داخل تعبير — استخدم «+= 1» في سطر`, node); return `${this.expr(node.arg)} + 1`;
      case 'Assign': {
        const op = node.op === '=' ? '=' : node.op;
        return `${this.expr(node.target)} ${op} ${this.expr(node.value)}`;
      }
      case 'Conditional': return `(${this.truth(this.expr(node.test))} ? ${this.expr(node.consequent)} : ${this.expr(node.alternate)})`;
      case 'New': this.bad('«جديد» (لا أصناف في سي)', node); return '0';
      case 'Call': return this.call(node);
      case 'Arrow': return this.lambdaRef(node);
      case 'FuncExpr': this.bad('دالة داخل تعبير', node); return '0';
      case 'Await': this.bad('«انتظر» (await)', node); return this.expr(node.arg);
      case 'Spread': return this.expr(node.arg);   // القائمة نفسها (تُمرَّر كما هي في النداءات)
      default: this.bad(`تعبير ${node.type}`, node); return '0';
    }
  }

  bin(node) {
    if (node.op === '+' && this.isStr(node)) return this.concat(node);
    if (node.op === '%') return `fmod(${this.expr(node.left)}, ${this.expr(node.right)})`;
    const map = { '===': '==', '!==': '!=', '&&': ' && ', '||': ' || ' };
    const op = map[node.op] || node.op;
    if (node.op === '**') { this.bad('الأس «**» (استخدم دالة)', node); return `${this.expr(node.left)} * ${this.expr(node.right)}`; }
    return `(${this.expr(node.left)}${op}${this.expr(node.right)})`;
  }

  /**
   * دالة سهمية: نولّد لها دالة سي حقيقية ونمرّرها كمؤشر دالة
   * (تُستخدم في «تحويل»/«منقي»: [١،٢،٣].map(س => س*س))
   */
  lambdaRef(node) {
    if (!node.expression || node.params.length !== 1) {
      this.bad('دالة سهمية بغير معامل واحد (سي تدعم معاملًا واحدًا)', node);
      return 'NULL';
    }
    const name = `__سهم${this.lambdas.size + 1}`;
    const param = node.params[0].replace(/^\.\.\./, '');
    const kind = this.kindOfLocal(node.body, null);
    const ret = kind === 'bool' ? 'int' : 'double';
    this.lambdas.set(name, { param, ret, body: this.expr(node.body) });
    this.kinds.set(param, kind === 'bool' ? 'bool' : 'num');
    return name;
  }

  /** فهرسة: قائمة عددية (عناصر) أو نصّ (غير مدعوم في سي) أو مصفوفة سي عادية */
  index(object, property) {
    const k = this.kindOfLocal(object, null);
    const obj = this.expr(object);
    const idx = this.expr(property);
    if (k === 'list') return `${obj}->عناصر[(long)(${idx})]`;
    if (k === 'str') { this.bad('فهرسة نصّ في سي (تحتاج دالة مساعدة)', object); return `${obj}[0]`; }
    return `${obj}[(long)(${idx})]`;
  }

  concat(node) {
    const parts = [];
    const walk = (n) => {
      if (n.type === 'Bin' && n.op === '+' && this.isStr(n)) { walk(n.left); walk(n.right); return; }
      parts.push(n);
    };
    walk(node);
    const pieces = parts.map((p) => this.asText(p));
    return pieces.reduce((a, b) => `_ز_دمج(${a}, ${b})`);
  }

  /** الدوال المدمجة: تعيد نصّ التعليمة أو null */
  macroCall(node, asStatement) {
    const name = node.callee.name;
    const args = node.args.map((a) => this.expr(a));
    const kinds = node.args.map((a) => this.kindOfLocal(a, null));
    switch (name) {
      case 'اطبع': {
        if (!args.length) return '_ز_طبع("");';
        const texted = node.args.map((a) => this.asText(a));
        const joined = texted.reduce((a, b) => `_ز_دمج(${a}, _ز_دمج(" ", ${b}))`);
        return `_ز_طبع(${joined});`;
      }
      case 'طول': {
        if (kinds[0] === 'str') return `((double)strlen(${args[0]}))`;
        if (kinds[0] === 'list') return `((double)_ز_طول(${args[0]}))`;
        this.bad('طول() على نوع غير معروف في سي', node);
        return `((double)strlen(${args[0]}))`;
      }
      case 'أضف': return `_ز_أضف(${args[0]}, ${args[1]});`;
      case 'رتب': return `_ز_رتب(${args[0]});`;
      case 'نص': return this.asText(node.args[0]);
      case 'عدد': return kinds[0] === 'str' ? `atof(${args[0]})` : `(${args[0]})`;
      case 'منطقي': return kinds[0] === 'str' ? `(strlen(${args[0]}) > 0)` : `(${this.truth(args[0])})`;
      case 'يحتوي': return kinds[0] === 'str' ? `(strstr(${args[0]}, ${args[1]}) != NULL)` : `_ز_يحتوي(${args[0]}, ${args[1]})`;
      default:
        this.bad(`الدالة المدمجة «${name}» في سي`, node);
        return `${name}(${args.join(', ')})`;
    }
  }

  call(node) {
    if (node.callee.type === 'Id') {
      const name = node.callee.name;
      if (MACROS[name]) {
        const r = this.macroCall(node, false);
        return r.replace(/;$/, '');
      }
      const f = this.funcs.get(name);
      const declared = f ? this.resolvedParams(f) : null;
      const args = node.args.map((a, i) => {
        if (a.type === 'Spread') return this.expr(a.arg);   // «انشر قائمة» ⇒ نمرّر القائمة نفسها
        if (declared && declared[i]) {
          const want = this.kindFromType(declared[i]);
          const got = a.type === 'Spread' ? 'list' : this.kindOfLocal(a, null);
          if (want !== got && got !== 'void') {
            this.bad(`الوسيط ${i + 1} في نداء «${name}» نوعه ${got} والوسيط ${want} — سي لغة ساكنة الأنواع (وُضعت قيمة افتراضية)`, node);
            return this.defaultFor(declared[i]);
          }
        }
        return this.expr(a);
      });
      return `${name}(${args.join(', ')})`;
    }
    if (node.callee.type === 'Member') {
      const m = node.callee;
      const prop = m.computed ? null : m.property;
      const obj = this.expr(m.object);
      const args = node.args.map((a) => this.expr(a));
      const objKind = this.kindOfLocal(m.object, null);
      if (prop === 'push') return `_ز_أضف(${obj}, ${args[0]});`;
      if (prop === 'map' && args[0]) return `_ز_تحويل(${obj}, ${args[0]})`;
      if (prop === 'filter' && args[0]) return `_ز_منقي(${obj}, ${args[0]})`;
      if (prop === 'includes') return objKind === 'str' ? `(strstr(${obj}, ${args[0]}) != NULL)` : `_ز_يحتوي(${obj}, ${args[0]})`;
      if (prop === 'join' || prop === 'split' || prop === 'map' || prop === 'filter' || prop === 'forEach' ||
          prop === 'sort' || prop === 'reverse' || prop === 'toUpperCase' || prop === 'toLowerCase' || prop === 'trim' ||
          prop === 'slice' || prop === 'indexOf' || prop === 'startsWith' || prop === 'endsWith' || prop === 'charAt' || prop === 'toString') {
        if (prop === 'sort') return `_ز_رتب(${obj});`;
        if (prop === 'length') return `((double)_ز_طول(${obj}))`;
        this.bad(`«${prop}» — اكتبها يدويًا في سي (أو استخدم «لكل» في زيتونة)`, node);
        return obj;
      }
      this.bad(`استدعاء «${prop || '?'}» على كائن في سي`, node);
      return obj;
    }
    return `${this.expr(node.callee)}(${node.args.map((a) => this.expr(a)).join(', ')})`;
  }
}

function emitC(ast, opts = {}) {
  return new CEmitter(ast, opts).run();
}

module.exports = { emitC };
