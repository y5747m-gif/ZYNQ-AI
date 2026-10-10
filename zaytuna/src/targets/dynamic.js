'use strict';

// ==========================================================================
//  زيتونة — أهداف ديناميكية: بايثون · روبي · بي إتش بي
//  ترجمة مباشرة من الشجرة العربية إلى كود نظيف بإزاحة (بلا مكتبات وسيطة).
//  كل ما لا نستطيع ترجمته بأمانة يُسجَّل في «غير مدعوم» ولا يُخفي.
// ==========================================================================

const { Writer } = require('./writer');
const { MACROS } = require('../dictionary');

const INDENT = { python: '    ', ruby: '  ', php: '    ' };

// ------------------------------------------------------------------ البنية
const L = {
  python: {
    label: 'بايثون', ext: '.py',
    comment: '# ',
    trueLit: 'True', falseLit: 'False', nullLit: 'None', undefLit: 'None',
    and: ' and ', or: ' or ', not: 'not ',
    eq: '==', neq: '!=',
    elseIf: 'elif',
    def: (name, params) => `def ${name}(${params.join(', ')})`,
    cls: (name, base) => `class ${name}${base ? '(' + base + ')' : ''}`,
    ctor: '__init__', selfName: 'self', selfMember: (p) => `self.${p}`, brace: false, endKw: null,
    print: (a) => `_ز_طبع(${a.join(', ')})`,
    len: (x) => `len(${x})`,
    array: (els) => `[${els.join(', ')}]`,
    dictPair: (k, v) => `${k}: ${v}`,
    newExpr: (cls, a) => `${cls}(${a.join(', ')})`,
    ternary: (c, a, b) => `(${a} if ${c} else ${b})`,
    forOf: (n, it) => `for ${n} in ${it}`,
    forRange: (n, a, b, inclusive) => `for ${n} in range(${a}, ${b}${inclusive ? ' + 1' : ''})`,
    whileHead: (c) => `while ${c}`,
    ifHead: (c) => `if ${c}`,
    inline: (s) => s,                       // استخدام متغيّر كما هو
    spread: (x) => `*${x}`,
    interpOpen: null,                        // f"…{x}…"
    typeofCall: (x) => `type(${x}).__name__`,
    instanceOf: { 'قائمة': (x) => `isinstance(${x}, list)`, 'كائن': (x) => `isinstance(${x}, dict)`, 'نص': (x) => `isinstance(${x}, str)`, 'string': (x) => `isinstance(${x}, str)`, 'عدد': (x) => `isinstance(${x}, (int, float))`, 'number': (x) => `isinstance(${x}, (int, float))`, 'منطقي': (x) => `isinstance(${x}, bool)`, 'boolean': (x) => `isinstance(${x}, bool)` },
    tryHead: 'try', exceptHead: (e) => `except Exception as ${e}`, finallyHead: 'finally',
    raiseKw: 'raise',
    hasAsync: true, hasAwait: true,
    // أدوات
    append: (arr, v) => `${arr}.append(${v})`,
    sortFn: (arr) => `${arr}.sort()`,
    toStr: (x) => `str(${x})`,
    toNum: (x) => `int(float(${x}))`,
    toBool: (x) => `bool(${x})`,
    keys: (x) => `list((${x}).keys())`,
    values: (x) => `list((${x}).values())`,
    split: (s, sep) => `(${s}).split(${sep})`,
    join: (arr, sep) => `${sep}.join(${arr})`,
    replace: (s, a, b) => `(${s}).replace(${a}, ${b})`,
    contains: (s, v) => `(${v} in ${s})`,
    pow: (a, b) => `${a} ** ${b}`,
  },
  ruby: {
    label: 'روبي', ext: '.rb',
    comment: '# ',
    trueLit: 'true', falseLit: 'false', nullLit: 'nil', undefLit: 'nil',
    and: ' && ', or: ' || ', not: '!',
    eq: '==', neq: '!=',
    elseIf: 'elsif',
    def: (name, params) => `def ${name}(${params.join(', ')})`,
    cls: (name, base) => `class ${name}${base ? ' < ' + base : ''}`,
    ctor: 'initialize', selfName: null, selfMember: (p) => `@${p}`, brace: false, endKw: 'end',
    print: (a) => `_ز_طبع(${a.join(', ')})`,
    len: (x) => `(${x}).length`,
    array: (els) => `[${els.join(', ')}]`,
    dictPair: (k, v) => `${k} => ${v}`,
    newExpr: (cls, a) => `${cls}.new(${a.join(', ')})`,
    ternary: (c, a, b) => `(${c} ? ${a} : ${b})`,
    forOf: (n, it) => `for ${n} in ${it}`,
    forRange: (n, a, b, inclusive) => `for ${n} in (${a}...${b}${inclusive ? ' + 1' : ''})`,
    whileHead: (c) => `while ${c}`,
    ifHead: (c) => `if ${c}`,
    inline: (s) => s,
    spread: (x) => `*${x}`,
    interpOpen: '#{',
    typeofCall: (x) => `(${x}).class.name`,
    instanceOf: { 'قائمة': (x) => `(${x}).is_a?(Array)`, 'كائن': (x) => `(${x}).is_a?(Hash)`, 'نص': (x) => `(${x}).is_a?(String)`, 'string': (x) => `(${x}).is_a?(String)`, 'عدد': (x) => `(${x}).is_a?(Numeric)`, 'number': (x) => `(${x}).is_a?(Numeric)`, 'منطقي': (x) => `(${x}).is_a?(TrueClass) || (${x}).is_a?(FalseClass)`, 'boolean': (x) => `(${x}).is_a?(TrueClass) || (${x}).is_a?(FalseClass)` },
    tryHead: 'begin', exceptHead: (e) => `rescue => ${e}`, finallyHead: 'ensure',
    raiseKw: 'raise',
    hasAsync: false, hasAwait: false,
    append: (arr, v) => `${arr}.push(${v})`,
    sortFn: (arr) => `${arr}.sort!`,
    toStr: (x) => `(${x}).to_s`,
    toNum: (x) => `(${x}).to_i`,
    toBool: (x) => `!!(${x})`,
    keys: (x) => `(${x}).keys`,
    values: (x) => `(${x}).values`,
    split: (s, sep) => `(${s}).split(${sep})`,
    join: (arr, sep) => `(${arr}).join(${sep})`,
    replace: (s, a, b) => `(${s}).gsub(${a}, ${b})`,
    contains: (s, v) => `(${s}).include?(${v})`,
    pow: (a, b) => `${a} ** ${b}`,
  },
  php: {
    label: 'بي إتش بي', ext: '.php',
    comment: '// ',
    trueLit: 'true', falseLit: 'false', nullLit: 'null', undefLit: 'null',
    and: ' && ', or: ' || ', not: '!',
    eq: '===', neq: '!==',
    elseIf: 'else if',
    def: (name, params) => `function ${name}(${params.join(', ')})`,
    cls: (name, base) => `class ${name}${base ? ' extends ' + base : ''}`,
    ctor: '__construct', selfName: null, selfMember: (p) => `$this->${p}`, brace: true, endKw: null,
    print: (a) => `_ز_طبع(${a.join(', ')});`,
    len: (x) => `count(${x})`,
    array: (els) => `[${els.join(', ')}]`,
    dictPair: (k, v) => `${k} => ${v}`,
    newExpr: (cls, a) => `new ${cls}(${a.join(', ')})`,
    ternary: (c, a, b) => `(${c} ? ${a} : ${b})`,
    forOf: (n, it) => `foreach (${it} as $${n})`,
    forRange: (n, a, b, inclusive) => `foreach (range(${a}, ${b}${inclusive ? ' - 1' : ''}) as $${n})`,
    whileHead: (c) => `while (${c})`,
    ifHead: (c) => `if (${c})`,
    inline: (s) => `$${s}`,
    spread: (x) => `...${x}`,
    interpOpen: null,
    typeofCall: (x) => `gettype(${x})`,
    instanceOf: { 'قائمة': (x) => `is_array(${x})`, 'كائن': (x) => `(is_array(${x}) || is_object(${x}))`, 'نص': (x) => `is_string(${x})`, 'string': (x) => `is_string(${x})`, 'عدد': (x) => `(is_int(${x}) || is_float(${x}))`, 'number': (x) => `(is_int(${x}) || is_float(${x}))`, 'منطقي': (x) => `is_bool(${x})`, 'boolean': (x) => `is_bool(${x})` },
    tryHead: 'try', exceptHead: (e) => `catch (Throwable $${e})`, finallyHead: 'finally',
    raiseKw: null,                       // بي إتش بي: throw يحتاج كائنًا استثنائيًا
    hasAsync: false, hasAwait: false,
    append: (arr, v) => `${arr}[] = ${v}`,
    sortFn: (arr) => `sort(${arr})`,
    toStr: (x) => `strval(${x})`,
    toNum: (x) => `intval(${x})`,
    toBool: (x) => `boolval(${x})`,
    keys: (x) => `array_keys(${x})`,
    values: (x) => `array_values(${x})`,
    split: (s, sep) => `explode(${sep}, ${s})`,
    join: (arr, sep) => `implode(${sep}, ${arr})`,
    replace: (s, a, b) => `str_replace(${a}, ${b}, ${s})`,
    contains: (s, v) => `(strpos(${s}, ${v}) !== false)`,
    pow: (a, b) => `${a} ** ${b}`,
  },
};


// ------------------------------------------------------------------ مقدّمات
/**
 * «اطبع» في جافاسكربت تطبع true/false والقوائم بصيغة معيّنة،
 * فنجعل مخرجات اللغات الأخرى مطابقة لها تمامًا (وهذا ما نتحقق منه بالتنفيذ).
 */
const PRELUDE = {
  python: `def _ز_نص(قيمة):
    if isinstance(قيمة, bool):
        return "true" if قيمة else "false"
    if isinstance(قيمة, list):
        return "[" + ", ".join(_ز_نص(ع) for ع in قيمة) + "]"
    if isinstance(قيمة, dict):
        return "{" + ", ".join(f"{_ز_نص(ك)}: {_ز_نص(ع)}" for ك, ع in قيمة.items()) + "}"
    if قيمة is None:
        return "undefined"
    return str(قيمة)


def _ز_طبع(*قيم):
    print(" ".join(_ز_نص(ق) for ق in قيم))`,

  ruby: `def _ز_نص(قيمة)
  return (قيمة ? "true" : "false") if [true, false].include?(قيمة)
  return "undefined" if قيمة.nil?
  return "[" + قيمة.map { |ع| _ز_نص(ع) }.join(", ") + "]" if قيمة.is_a?(Array)
  return "{" + قيمة.map { |ك, ع| "#{_ز_نص(ك)}: #{_ز_نص(ع)}" }.join(", ") + "}" if قيمة.is_a?(Hash)
  قيمة.to_s
end

def _ز_طبع(*قيم)
  puts قيم.map { |ق| _ز_نص(ق) }.join(" ")
end`,

  php: `function _ز_نص($قيمة) {
    if (is_bool($قيمة)) return $قيمة ? "true" : "false";
    if ($قيمة === null) return "undefined";
    if (is_array($قيمة)) {
        $أجزاء = [];
        $مفتاح = 0;
        foreach ($قيمة as $ك => $ع) {
            $أجزاء[] = ($ك === $مفتاح++ ? _ز_نص($ع) : _ز_نص($ك) . ": " . _ز_نص($ع));
        }
        return (array_keys($قيمة) === range(0, count($قيمة) - 1)) ? "[" . implode(", ", $أجزاء) . "]" : "{" . implode(", ", $أجزاء) . "}";
    }
    return strval($قيمة);
}

function _ز_طبع(...$قيم) {
    echo implode(" ", array_map("_ز_نص", $قيم)), PHP_EOL;
}`,
};

let SEQ = 0;

class DynamicEmitter {
  constructor(ast, lang) {
    this.ast = ast;
    this.lang = lang;
    this.c = L[lang];
    this.w = new Writer(INDENT[lang], '');
    this.unsupported = [];
    this.notes = [];
    this.inMethod = false;
    this.usedHelpers = false;
    this.classStack = [];
    this.superName = null;
  }

  // -------------------------------------------------------------- أدوات
  bad(kind, node) {
    const line = node && node.line ? node.line : null;
    this.unsupported.push({ kind, line });
    return `${line ? '' : ''}${this.c.nullLit}`;
  }

  sigil(name) { return this.lang === 'php' && /^[^\W\d]/.test(name) ? '$' + name : name; }

  head(text, node) {                    // بداية كتلة
    if (this.c.brace) this.w.push(text + ' {', node && node.line);
    else this.w.push(text + ':', node && node.line);
    this.w.indent++;
  }
  foot() {                              // نهاية كتلة بسيطة
    this.w.indent--;
    if (this.c.brace) this.w.push('}');
    else if (this.c.endKw) this.w.push(this.c.endKw);
  }

  stmtLine(text, node) {
    const t = this.c.brace ? (text.trimEnd().endsWith(';') || text.trimEnd().endsWith('}') || text.trimEnd().endsWith('{') ? text : text + ';') : text;
    this.w.push(t, node && node.line);
  }

  // -------------------------------------------------------------- التنفيذ
  run() {
    for (const stmt of this.ast.body || []) {
      this.w.flushComments(stmt.line, this.ast.comments, this.c.comment);
      this.emitStatement(stmt);
    }
    this.w.flushRest(this.ast.comments, this.c.comment);
    const head = [];
    if (this.lang === 'php') head.push('<?php');
    if (this.usedHelpers) head.push(...PRELUDE[this.lang].split('\n'), '');
    const code = head.concat(this.w.lines).join('\n') + '\n';
    const map = head.map(() => ({ outLine: 0, arLine: null })).concat(this.w.map.map((m) => ({ outLine: m.outLine + head.length, arLine: m.arLine })));
    return { code, map, unsupported: this.unsupported, notes: this.notes };
  }
  emitBlockBody(body) {
    for (const s of body) {
      this.w.flushComments(s.line, this.ast.comments, this.c.comment);
      this.emitStatement(s);
    }
  }

  emitStatement(node) {
    switch (node.type) {
      case 'VarDecl': return this.varDecl(node);
      case 'FuncDecl': return this.funcDecl(node);
      case 'ClassDecl': return this.classDecl(node);
      case 'IfStmt': return this.ifStmt(node);
      case 'WhileStmt': return this.whileStmt(node);
      case 'ForStmt': return this.forStmt(node);
      case 'ForOfStmt': return this.forOf(node);
      case 'SwitchStmt': return this.switchStmt(node);
      case 'MatchStmt': return this.matchStmt(node);
      case 'ReturnStmt': return this.stmtLine(`return${node.argument ? ' ' + this.expr(node.argument) : ''}`, node);
      case 'BreakStmt': return this.stmtLine('break', node);
      case 'ContinueStmt': return this.stmtLine(this.lang === 'ruby' ? 'next' : 'continue', node);
      case 'ThrowStmt':
        if (!this.c.raiseKw) { this.bad('ارفع (throw) — بي إتش بي يحتاج كائن استثناء', node); return; }
        return this.stmtLine(`${this.c.raiseKw} ${this.expr(node.argument)}`, node);
      case 'TryStmt': return this.tryStmt(node);
      case 'ImportStmt': return this.bad('استورد (استيراد الوحدات غير مترجم بين اللغات)', node);
      case 'ExportStmt': return this.bad('صدّر (التصدير غير مترجم بين اللغات)', node);
      case 'Block': this.head('', node); this.emitBlockBody(node.body); this.foot(); return;
      case 'ExprStmt': return this.exprStmt(node);
      default: return this.bad(`عقدة غير معروفة: ${node.type}`, node);
    }
  }

  varDecl(node) {
    for (const d of node.decls) {
      const name = this.c.inline(d.name);
      const val = d.init ? this.expr(d.init) : this.c.nullLit;
      if (d.init && d.typeAnn) this.notes.push(`سطر ${d.line || node.line}: نوع «${d.typeAnn.name || ''}» مشطوب في ${this.c.label}.`);
      this.stmtLine(`${name} = ${val}`, d.line ? d : node);
    }
  }

  exprStmt(node) {
    const e = node.expr;
    if (e.type === 'Update') return this.stmtLine(`${this.expr(e.arg)} ${e.op === '++' ? '+=' : '-='} 1`, node);
    if (e.type === 'Assign' && e.target.type === 'Member' && this.inMethod && isThis(e.target.object)) {
      return this.stmtLine(`${this.c.selfMember(e.target.property)} ${e.op} ${this.expr(e.value)}`, node);
    }
    const text = this.expr(e);
    if (this.c.brace && /;\s*$/.test(text)) { this.w.push(text, node.line); return; }  // مثل echo
    this.stmtLine(text, node);
  }

  /** «هذا» بالعربية أو «this» اللاتينية — كلتاهما تشير إلى الكائن الحالي */
  selfRef(node) {
    if (!this.inMethod) return this.bad('«هذا/this» خارج صنف', node);
    return this.c.selfName || '$this';
  }

  /** معامل واحد: «انشر س» ← *س (بايثون/روبي) أو ...$س (بي إتش بي) */
  paramText(p) {
    if (/^\.\.\./.test(p)) {
      const n = p.slice(3);
      return this.lang === 'php' ? `...$${n}` : `*${n}`;
    }
    return this.c.inline(p);
  }

  funcDecl(node) {
    const params = node.params;
    const kw = node.async ? (this.c.hasAsync ? 'async ' : '') : '';
    if (node.async && !this.c.hasAsync) this.notes.push(`سطر ${node.line}: دالة «غير_متزامن» تُرجمت دالة عادية (لا وعود في ${this.c.label}).`);
    if (node.paramTypes && node.paramTypes.some(Boolean)) this.notes.push(`سطر ${node.line}: أنواع المعاملات مشطوبة.`);
    this.head(kw + this.c.def(node.name, params.map((p) => this.paramText(p))), node);
    this.emitBlockBody(node.body.body);
    this.foot();
  }

  classDecl(node) {
    this.classStack.push(node.name);
    const savedSuper = this.superName;
    this.superName = node.superClass;
    this.head(this.c.cls(node.name, node.superClass), node);
    for (const m of node.members) {
      if (m.kind === 'constructor') {
        const params = this.lang === 'python' ? [this.c.selfName, ...m.params] : m.params;
        this.head(this.c.def(this.c.ctor, params.map((p) => (p === this.c.selfName ? p : this.paramText(p)))), m);
        this.inMethod = true; this.emitBlockBody(m.body.body); this.inMethod = false;
        this.foot();
      } else if (m.kind === 'method') {
        const params = this.lang === 'python' ? [this.c.selfName, ...m.params] : m.params;
        this.head(this.c.def(m.name, params.map((p) => (p === this.c.selfName ? p : this.paramText(p)))), m);
        this.inMethod = true; this.emitBlockBody(m.body.body); this.inMethod = false;
        this.foot();
      } else {
        this.notes.push(`سطر ${m.line}: حقل الصنف «${m.name}» — ضعه في المنشئ في ${this.c.label}.`);
        this.bad(`حقل صنف مستقل: ${m.name}`, m);
      }
    }
    this.foot();
    this.classStack.pop();
    this.superName = savedSuper;
  }

  ifStmt(node) {
    const items = [];
    let cur = node;
    while (true) {
      items.push({ cond: this.expr(cur.test), body: cur.consequent.body, line: cur.line });
      if (cur.alternate && cur.alternate.type === 'IfStmt') { cur = cur.alternate; continue; }
      break;
    }
    if (cur.alternate) items.push({ cond: null, body: cur.alternate.body, line: cur.line });
    this.chain(items, node, 'إذا');
  }

  whileStmt(node) {
    this.head(this.c.whileHead(this.expr(node.test)), node);
    this.emitBlockBody(node.body.body);
    this.foot();
  }

  /** «كرر (متغير ع = 0؛ ع < ن؛ ع++)» — يُترجم لكل لغة بصيغتها */
  forStmt(node) {
    const init = node.init;
    const upd = node.update;
    const single = init && init.type === 'VarDecl' && init.decls.length === 1 ? init.decls[0] : null;
    const isInc = upd && upd.type === 'Update' && upd.op === '++' && upd.arg.type === 'Id';
    const cmp = node.test && node.test.type === 'Bin' && (node.test.op === '<' || node.test.op === '<=');
    if (single && isInc && cmp && node.test.left.type === 'Id' && node.test.left.name === single.name && upd.arg.name === single.name) {
      const from = single.init ? this.expr(single.init) : '0';
      let to = this.expr(node.test.right);
      let inclusive = node.test.op === '<=';
      if (inclusive && node.test.right.type === 'NumLit') { to = String(Number(node.test.right.value) + 1); inclusive = false; }
      this.head(this.c.forRange(this.c.inline(single.name), from, to, inclusive), node);
      this.emitBlockBody(node.body.body);
      this.foot();
      return;
    }
    // صيغة عامة: نحلّها إلى «تهيئة ← طالما ← تحديث»
    const lines = [];
    if (init) {
      if (init.type === 'VarDecl') {
        for (const d of init.decls) {
          this.stmtLine(`${this.c.inline(d.name)} = ${d.init ? this.expr(d.init) : this.c.nullLit}`, node);
        }
      } else {
        this.stmtLine(this.expr(init), node);
      }
    }
    this.head(this.c.whileHead(node.test ? this.expr(node.test) : this.c.trueLit), node);
    this.emitBlockBody(node.body.body);
    if (upd) {
      if (upd.type === 'Update') this.stmtLine(`${this.expr(upd.arg)} ${upd.op === '++' ? '+=' : '-='} 1`, node);
      else this.stmtLine(this.expr(upd), node);
    }
    this.foot();
    return lines;
  }

  forOf(node) {
    this.head(this.c.forOf(this.c.inline(node.name), this.expr(node.iterable)), node);
    this.emitBlockBody(node.body.body);
    this.foot();
  }

  switchStmt(node) {
    // «اختر (صحيح) { حالة شرط: … }» = سلسلة شروط (نمط switch(true) في جافاسكربت)
    if (node.discriminant.type === 'BoolLit' && node.discriminant.value === true) {
      this.chain(node.cases.map((c) => ({
        cond: c.test === null ? null : this.expr(c.test),
        body: this.stripBreaks(c.body),
        line: c.line,
      })), node, 'اختر');
      return;
    }
    const tmp = `__ق${++SEQ}`;
    this.stmtLine(`${this.lang === 'php' ? '$' : ''}${tmp} = ${this.expr(node.discriminant)}`, node);
    this.chain(node.cases.map((c) => ({
      cond: c.test === null ? null : `${tmp} ${this.c.eq} ${this.expr(c.test)}`,
      body: c.test === null ? c.body : this.stripBreaks(c.body),
      line: c.line,
    })), node, 'اختر');
  }

  matchStmt(node) {
    const tmp = `__م${++SEQ}`;
    this.stmtLine(`${this.lang === 'php' ? '$' : ''}${tmp} = ${this.expr(node.discriminant)}`, node);
    const arms = node.arms.map((a) => {
      const r = this.pattern(tmp, a.pattern, a.guard);
      const binds = [];
      if (a.pattern.kind === 'array') a.pattern.names.forEach((n, i) => binds.push(`${this.c.inline(n)} = ${tmp}[${i}]`));
      if (a.pattern.kind === 'object') a.pattern.keys.forEach((k) => binds.push(`${this.c.inline(k)} = ${tmp}["${k}"]`));
      return { cond: r.cond, body: this.stripBreaks(a.body), binds, line: a.line };
    });
    this.chain(arms, node, 'طابق');
  }

  /** سلسلة if / else-if / else — موحّدة للثلاث لغات */
  chain(items, node, what) {
    const branches = items.filter((it) => it.cond !== null);
    const rest = items.find((it) => it.cond === null);
    let idx = 0;
    for (const it of branches) {
      if (idx > 0 && !this.c.brace) this.w.indent--;
      const head = idx === 0
        ? this.c.ifHead(it.cond)
        : `${this.c.elseIf} ${this.c.brace ? '(' + it.cond + ')' : it.cond}`;
      this.head(head, it);
      for (const b of (it.binds || [])) this.stmtLine(b, it);
      this.emitBlockBody(it.body);
      if (this.c.brace) { this.w.indent--; this.w.push('}', it.line); }
      idx++;
    }
    if (rest) {
      if (!this.c.brace && idx > 0) this.w.indent--;
      this.head('else', rest);
      for (const b of (rest.binds || [])) this.stmtLine(b, rest);
      this.emitBlockBody(rest.body);
      if (this.c.brace) { this.w.indent--; this.w.push('}', rest.line); }
    }
    if (!this.c.brace) {
      if (idx > 0 || rest) this.w.indent--;
      if (this.c.endKw) this.w.push(this.c.endKw, node.line);
    }
    if (idx === 0 && !rest) this.notes.push(`سطر ${node.line}: «${what}» بلا فروع مترجمة.`);
  }

  /**
   * «كسر» داخل «اختر/طابق»: الفرع ينتهي طبيعيًا في اللغات الأخرى،
   * كما أن «break» خارج حلقة لا يصحّ في بايثون وبي إتش بي.
   */
  stripBreaks(body) {
    return body.filter((s) => s.type !== 'BreakStmt');
  }

  tryStmt(node) {
    this.head(this.c.tryHead, node);
    this.emitBlockBody(node.block.body);
    if (node.handler) {
      if (!this.c.brace) this.w.indent--;
      this.head(this.c.exceptHead(node.param || (this.lang === 'ruby' ? 'خطأ' : 'خطأ')), node);
      this.emitBlockBody(node.handler.body);
      if (this.c.brace) { this.w.indent--; this.w.push('}', node.line); }
    }
    if (node.finalizer) {
      if (!this.c.brace) this.w.indent--;
      this.head(this.c.finallyHead, node);
      this.emitBlockBody(node.finalizer.body);
      if (this.c.brace) { this.w.indent--; this.w.push('}', node.line); }
    }
    if (!this.c.brace) {
      this.w.indent--;
      if (this.c.endKw) this.w.push(this.c.endKw, node.line);
    }
  }

  /** شرط نمط مطابقة واحد */
  pattern(tmp, pattern, guard) {
    const g = guard ? `(${this.expr(guard)})` : null;
    if (pattern.kind === 'default') return { cond: g || null };
    let cond;
    switch (pattern.kind) {
      case 'lit': cond = `${tmp} ${this.c.eq} ${this.expr(pattern.value)}`; break;
      case 'alt': cond = pattern.alts.map((a) => `(${this.pattern(tmp, a, null).cond})`).join(this.c.or.trim()); break;
      case 'range': {
        // بايثون يرفض مقارنة نص بعدد — نحرس النوع قبل المدى (وفي جافاسكربت النتيجة false بلا خطأ)
        const r = `${tmp} >= ${this.expr(pattern.from)}${this.c.and}${tmp} <= ${this.expr(pattern.to)}`;
        cond = this.lang === 'python' ? `(isinstance(${tmp}, (int, float))${this.c.and}${r})`
          : this.lang === 'php' ? `(is_numeric(${tmp})${this.c.and}${r})`
          : `(${r})`;
        break;
      }
      case 'type': {
        const raw = pattern.arg.type === 'StrLit' ? pattern.arg.raw : null;
        const f = raw && this.c.instanceOf[raw];
        cond = f ? f(tmp) : this.bad(`نمط النوع «${raw}»`, pattern);
        break;
      }
      case 'array': cond = `(${this.c.instanceOf['قائمة'](tmp)}${this.c.and}${this.c.len(tmp)} == ${pattern.names.length})`; break;
      case 'object': cond = `(${this.c.instanceOf['كائن'](tmp)}${this.c.and}${pattern.keys.map((k) => `${JSON.stringify(k)} in ${tmp}`).join(' and ')})`; break;
      default: cond = this.c.trueLit;
    }
    return { cond: g ? `(${cond})${this.c.and}${g}` : cond };
  }

  // ------------------------------------------------------------ التعبيرات
  expr(node) {
    if (!node) return '';
    switch (node.type) {
      case 'NumLit': return String(node.value);
      case 'StrLit': return node.js;
      case 'BoolLit': return node.value ? this.c.trueLit : this.c.falseLit;
      case 'NullLit': return this.c.nullLit;
      case 'UndefinedLit': return this.c.undefLit;
      case 'ThisLit': return this.selfRef(node);
      case 'Id':
        if (node.name === 'this') return this.selfRef(node);
        return this.c.inline(node.name);
      case 'ArrayLit': return this.c.array(node.elements.map((e) => e.type === 'Spread' ? this.c.spread(this.expr(e.arg)) : this.expr(e)));
      case 'ObjectLit': {
        const pairs = node.properties.map((p) => {
          if (p.spread) return this.c.spread(this.expr(p.value));
          const key = p.computed ? this.expr(p.key) : JSON.stringify(p.key);
          const val = p.shorthand ? this.c.inline(p.key) : this.expr(p.value);
          return this.c.dictPair(key, val);
        });
        return `{${pairs.join(', ')}}`;
      }
      case 'Member': {
        if (isThis(node.object) && this.inMethod) return this.c.selfMember(node.computed ? this.expr(node.property) : node.property);
        if (!node.computed && node.property === 'length') return this.c.len(this.expr(node.object));
        const obj = this.expr(node.object);
        if (this.lang === 'php') return `${obj}->${node.property}`;
        return node.computed ? `${obj}[${this.expr(node.property)}]` : `${obj}.${node.property}`;
      }
      case 'Index': return `${this.expr(node.object)}[${this.expr(node.property)}]`;
      case 'Bin': case 'Logical': return this.bin(node);
      case 'Unary': return this.unary(node);
      case 'Update': {
        this.unsupported.push({ kind: `«${node.op}» داخل تعبير (السطر ${node.line || '؟'})`, line: node.line });
        return `${this.expr(node.arg)} ${node.op === '++' ? '+' : '-'} 1`;
      }
      case 'Assign': {
        if (node.target.type === 'Member' && isThis(node.target.object) && this.inMethod) {
          return `${this.c.selfMember(node.target.property)} ${node.op} ${this.expr(node.value)}`;
        }
        return `${this.expr(node.target)} ${node.op} ${this.expr(node.value)}`;
      }
      case 'Conditional': return this.c.ternary(this.expr(node.test), this.expr(node.consequent), this.expr(node.alternate));
      case 'New': return this.c.newExpr(node.callee.name || this.expr(node.callee), node.args.map((a) => (a.type === 'Spread' ? this.c.spread(this.expr(a.arg)) : this.expr(a))));
      case 'Call': return this.call(node);
      case 'Arrow': {
        if (!node.expression) { this.bad('دالة سهمية بكتلة', node); return this.c.nullLit; }
        const ps = node.params.map((p) => this.paramText(p));
        if (this.lang === 'php') return `fn(${ps.join(', ')}) => ${this.expr(node.body)}`;
        if (this.lang === 'ruby') return `->(${ps.join(', ')}) { ${this.expr(node.body)} }`;
        return `lambda ${ps.join(', ')}: ${this.expr(node.body)}`;
      }
      case 'FuncExpr': return this.bad('دالة داخل تعبير', node);
      case 'Await': return this.c.hasAwait ? `await ${this.expr(node.arg)}` : this.bad('«انتظر» (await)', node);
      case 'Spread': return this.c.spread(this.expr(node.arg));
      case 'Super': return this.lang === 'python' ? 'super()' : 'super';
      default:
        this.bad(`تعبير ${node.type}`, node);
        return this.c.nullLit;
    }
  }

  unary(node) {
    const a = this.expr(node.arg);
    if (node.op === '!') return `${this.c.not}${a}`;
    if (node.op === 'typeof') return this.c.typeofCall(a);
    if (node.op === 'delete') { this.bad('«احذف» (delete)', node); return a; }
    return `${node.op}${a}`;
  }

  bin(node) {
    if (node.op === '+' && isStringConcat(node)) return this.concat(node);
    const map = { '&&': this.c.and, '&': this.c.and, '||': this.c.or, '===': this.c.eq, '!==': this.c.neq, '**': this.c.pow('', '').trim() === '**' ? '**' : '**' };
    const op = map[node.op] || node.op;
    if (node.op === '**' && this.lang === 'php') return `${this.expr(node.left)} ** ${this.expr(node.right)}`;
    return `${this.expr(node.left)}${op}${this.expr(node.right)}`;
  }

  /** جمع النصوص: f-string في بايثون، #{} في روبي، «.» في بي إتش بي */
  concat(node) {
    const segs = [];
    let lit = '';
    const walk = (n) => {
      if (n.type === 'Bin' && n.op === '+' && isStringConcat(n)) { walk(n.left); walk(n.right); return; }
      if (n.type === 'StrLit') { lit += n.raw !== undefined ? n.raw : ''; return; }
      if (lit) { segs.push({ t: 'lit', v: lit }); lit = ''; }
      segs.push({ t: 'expr', v: this.expr(n) });
    };
    walk(node);
    if (lit) segs.push({ t: 'lit', v: lit });
    if (segs.every((s) => s.t === 'lit')) return this.c.array ? JSON.stringify(segs.map((s) => s.v).join('')) : '""';
    if (this.lang === 'php') {
      this.usedHelpers = true;
      return segs.map((s) => (s.t === 'lit' ? JSON.stringify(s.v) : `_ز_نص(${s.v})`)).join(' . ');
    }
    if (segs.every((s) => s.t === 'expr')) return segs.map((s) => s.v).join(' + ');
    if (this.lang === 'python') {
      const delim = pickDelimiter(segs);
      if (!delim) {   // تعبير يجمع الاقتباسين — نلجأ إلى جمع صريح بدل f-string
        this.notes.push('جمع نصّي فيه اقتباسان — استُخدم الجمع الصريح مع str() بدل f-string.');
        return segs.map((s) => (s.t === 'lit' ? JSON.stringify(s.v) : `str(${s.v})`)).join(' + ');
      }
      this.usedHelpers = true;
      const esc = (t) => t.replace(/\\/g, '\\\\').replace(/\{/g, '{{').replace(/\}/g, '}}').replace(/\$/g, '\\$');
      const body = segs.map((s) => (s.t === 'lit' ? esc(s.v) : `{_ز_نص(${s.v})}`)).join('');
      return `f${delim}${body}${delim}`;
    }
    const body = segs.map((s) => (s.t === 'lit' ? s.v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') : `#{_ز_نص(${s.v})}`)).join('');
    return `"${body}"`;
  }

  /** نداء دالة على كائن: إمّا دالة جافاسكربت شائعة، أو تمرير كما هو */
  memberCall(m, args, node) {
    const obj = this.expr(m.object);
    const prop = m.computed ? null : m.property;
    if (!prop) return `(${obj}[${this.expr(m.property)}])(${args.join(', ')})`;
    const table = METHODS[this.lang];
    const f = table[prop];
    if (f) return f(obj, args, node, this);
    if (this.lang === 'php') return `${obj}->${prop}(${args.join(', ')})`;
    return `${obj}.${prop}(${args.join(', ')})`;
  }

  call(node) {
    const args = node.args.map((a) => (a.type === 'Spread' ? this.c.spread(this.expr(a.arg)) : this.expr(a)));
    if (node.callee.type === 'Id') {
      const name = node.callee.name;
      const macro = MACROS[name];
      if (macro && (macro.arity === null || args.length === macro.arity) && args.length) {
        switch (name) {
          case 'اطبع': return this.c.print(args);
          case 'طول': return this.c.len(args[0]);
          case 'أضف': return this.c.append(args[0], args[1]);
          case 'رتب': return this.c.sortFn(args[0]);
          case 'نص': return this.c.toStr(args[0]);
          case 'عدد': return this.c.toNum(args[0]);
          case 'منطقي': return this.c.toBool(args[0]);
          case 'مفاتيح': return this.c.keys(args[0]);
          case 'قيم': return this.c.values(args[0]);
          case 'اقسم': return this.c.split(args[0], args[1]);
          case 'انضم': return this.c.join(args[0], args[1]);
          case 'استبدل': return this.c.replace(args[0], args[1], args[2]);
          case 'يحتوي': return this.c.contains(args[0], args[1]);
          default: break;
        }
      }
      return `${this.c.inline(name)}(${args.join(', ')})`;
    }
    if (node.callee.type === 'Member') {
      const m = node.callee;
      if (isThis(m.object) && this.inMethod) {
        const prop = m.computed ? this.expr(m.property) : m.property;
        if (this.lang === 'php') return `$this->${prop}(${args.join(', ')})`;
        if (this.lang === 'ruby') return `${prop}(${args.join(', ')})`;
        return `${this.c.selfMember(prop)}(${args.join(', ')})`;
      }
      if (m.object.type === 'Super' && !m.computed) {
        if (this.lang === 'python') return `super().${m.property}(${args.join(', ')})`;
        if (this.lang === 'ruby') return `super(${args.join(', ')})`;
        return `parent::${m.property}(${args.join(', ')})`;
      }
      if (!m.computed && m.property === 'codePointAt') {
        if (this.lang === 'python') return `ord(${this.expr(m.object)})`;
        if (this.lang === 'ruby') return `${this.expr(m.object)}.ord`;
        return `mb_ord(${this.expr(m.object)})`;
      }
      if (!m.computed && m.property === 'normalize') {
        if (this.lang === 'python') return `unicodedata.normalize(${args[0]}, ${this.expr(m.object)})`;
        return this.bad('normalize (تطبيع Unicode)', node);
      }
      // دوال جافاسكربت الشائعة (map/join/includes...) ← مقابلها في اللغة الهدف
      return this.memberCall(m, args, node);
    }
    return `${this.expr(node.callee)}(${args.join(', ')})`;
  }
}

/** هل هذه العقدة جمع نصوص (لا جمع أرقام)؟ */
function isThis(n) { return !!n && (n.type === 'ThisLit' || (n.type === 'Id' && n.name === 'this')); }

function isStringConcat(n) {
  if (!n || n.type !== 'Bin' || n.op !== '+') return false;
  if (n.left.type === 'StrLit' || n.right.type === 'StrLit') return true;
  return isStringConcat(n.left) || isStringConcat(n.right);
}

// ---------------------------------------------------------------- جداول الدوال
// دوال جافاسكربت القياسية ← مقابلها الحقيقي في كل لغة (بلا تخمين)
const METHODS = {
  python: {
    map: (o, a) => `list(map(${a[0]}, ${o}))`,
    filter: (o, a) => `list(filter(${a[0]}, ${o}))`,
    forEach: (o, a, n, e) => { e.unsupported.push({ kind: '«forEach» في موضع تعبير', line: n && n.line }); return `[${a[0]}(__ع) for __ع in ${o}]`; },
    join: (o, a) => `${a[0]}.join(${o})`,
    includes: (o, a) => `(${a[0]} in ${o})`,
    indexOf: (o, a, n, e) => { e.notes.push(`سطر ${n && n.line}: «indexOf» ← «index» — بايثون يرفع استثناءً إن لم يجد بدل -1.`); return `${o}.index(${a[0]})`; },
    push: (o, a) => `${o}.append(${a[0]})`,
    pop: (o, a) => (a.length ? `${o}.pop(${a[0]})` : `${o}.pop()`),
    slice: (o, a) => (a.length > 1 ? `${o}[${a[0]}:${a[1]}]` : `${o}[${a[0]}:]`),
    reverse: (o) => `${o}[::-1]`,
    toUpperCase: (o) => `${o}.upper()`,
    toLowerCase: (o) => `${o}.lower()`,
    trim: (o) => `${o}.strip()`,
    startsWith: (o, a) => `${o}.startswith(${a[0]})`,
    endsWith: (o, a) => `${o}.endswith(${a[0]})`,
    charAt: (o, a) => `${o}[${a[0]}]`,
    repeat: (o, a) => `${o} * ${a[0]}`,
    keys: (o) => `${o}.keys()`,
    values: (o) => `${o}.values()`,
    sort: (o) => `${o}.sort()`,
  },
  ruby: {
    map: (o, a) => `${o}.map(&${a[0]})`,
    filter: (o, a) => `${o}.select(&${a[0]})`,
    forEach: (o, a, n, e) => { e.unsupported.push({ kind: '«forEach» في موضع تعبير', line: n && n.line }); return `${o}.each { |__ع| ${a[0]}.call(__ع) }`; },
    join: (o, a) => `${o}.join(${a[0]})`,
    includes: (o, a) => `${o}.include?(${a[0]})`,
    indexOf: (o, a) => `${o}.index(${a[0]})`,
    push: (o, a) => `${o}.push(${a[0]})`,
    pop: (o, a) => (a.length ? `${o}.delete_at(${a[0]})` : `${o}.pop`),
    slice: (o, a) => (a.length > 1 ? `${o}[${a[0]}...${a[1]}]` : `${o}[${a[0]}..]`),
    reverse: (o) => `${o}.reverse`,
    toUpperCase: (o) => `${o}.upcase`,
    toLowerCase: (o) => `${o}.downcase`,
    trim: (o) => `${o}.strip`,
    startsWith: (o, a) => `${o}.start_with?(${a[0]})`,
    endsWith: (o, a) => `${o}.end_with?(${a[0]})`,
    charAt: (o, a) => `${o}[${a[0]}]`,
    repeat: (o, a) => `${o} * ${a[0]}`,
    keys: (o) => `${o}.keys`,
    values: (o) => `${o}.values`,
    sort: (o) => `${o}.sort`,
  },
  php: {
    map: (o, a) => `array_map(${a[0]}, ${o})`,
    filter: (o, a) => `array_values(array_filter(${o}, ${a[0]}))`,
    forEach: (o, a, n, e) => { e.unsupported.push({ kind: '«forEach» في موضع تعبير', line: n && n.line }); return `array_map(${a[0]}, ${o})`; },
    join: (o, a) => `implode(${a[0]}, ${o})`,
    includes: (o, a) => `in_array(${a[0]}, ${o})`,
    indexOf: (o, a) => `array_search(${a[0]}, ${o})`,
    push: (o, a) => `array_push(${o}, ${a[0]})`,
    pop: (o) => `array_pop(${o})`,
    slice: (o, a) => (a.length > 1 ? `array_slice(${o}, ${a[0]}, ${a[1]})` : `array_slice(${o}, ${a[0]})`),
    reverse: (o) => `array_reverse(${o})`,
    toUpperCase: (o) => `strtoupper(${o})`,
    toLowerCase: (o) => `strtolower(${o})`,
    trim: (o) => `trim(${o})`,
    startsWith: (o, a) => `str_starts_with(${o}, ${a[0]})`,
    endsWith: (o, a) => `str_ends_with(${o}, ${a[0]})`,
    charAt: (o, a) => `${o}[${a[0]}]`,
    repeat: (o, a) => `str_repeat(${o}, ${a[0]})`,
    keys: (o) => `array_keys(${o})`,
    values: (o) => `array_values(${o})`,
    sort: (o) => `sort(${o})`,
  },
};


/**
 * بايثون: لا يجوز أن تحمل تعبيرات f-string علامة الإغلاق نفسها،
 * ولا محارف الإزاحة. فنختار علامة لا تظهر في أي جزء، ثم نجرّب ثلاثية العلامات.
 */
function pickDelimiter(segs) {
  const exprs = segs.filter((s) => s.t === 'expr').map((s) => s.v).join(' ');
  const lits = segs.filter((s) => s.t === 'lit').map((s) => s.v).join('');
  const badInExpr = (d) => exprs.includes(d) || /\\|\n/.test(exprs);
  const badInLit = (d) => lits.includes(d) || /\\|\n/.test(lits);
  for (const d of ['"', "'"]) if (!badInExpr(d) && !badInLit(d)) return d;
  for (const d of ['"'.repeat(3), "'".repeat(3)]) if (!badInExpr(d) && !badInLit(d)) return d;
  return null;
}

function emitDynamic(ast, lang, opts = {}) {
  if (!L[lang]) throw new Error(`لغة هدف ديناميكية غير معروفة: ${lang}`);
  return new DynamicEmitter(ast, lang).run();
}

module.exports = { emitDynamic, L, isStringConcat, DYN_LANGS: Object.keys(L) };
