'use strict';

// ==========================================================================
//  زيتونة — هدف سي++ (C++17)
//  الدوال والأصناف قبل main، والتعليمات داخل main. الأنواع المشطوبة تصبح
//  قوالب (template) في الدوال، و«auto» في المتغيّرات — وما لا يمكن ترجمته
//  بأمانة يُسجَّل في «غير مدعوم»، والتحقق الحقيقي بـ g++ هو الحكم.
// ==========================================================================

const { Writer } = require('./writer');
const { MACROS } = require('../dictionary');

const TYPE_MAP = {
  'عدد': 'int', 'عشري': 'double', 'نص': 'std::string', 'منطقي': 'bool',
  'قائمة': 'std::vector', 'عدم': 'int', 'لاشيء': 'int',
};

const PRELUDE = [
  '#include <iostream>',
  '#include <string>',
  '#include <vector>',
  '#include <algorithm>',
  '#include <sstream>',
  '',
  '// نصّ القائمة كما تطبعه جافاسكربت: [1, 2, 3]',
  'template <typename T>',
  'std::string _ز_نص(const std::vector<T>& قائمة) {',
  '  std::ostringstream مخرج;',
  '  مخرج << "[";',
  '  for (size_t i = 0; i < قائمة.size(); i++) { if (i) مخرج << ", "; مخرج << قائمة[i]; }',
  '  مخرج << "]";',
  '  return مخرج.str();',
  '}',
  '',
  '// مقارنة تعمل مع أي نوع (لأن «طابق» قد تعمل على قالب مجهول النوع)',
  'template <typename A, typename B>',
  'bool _ز_يساوي(const A& أ, const B& ب) { return أ == ب; }',
  'inline bool _ز_يساوي(const std::string&, double) { return false; }',
  'inline bool _ز_يساوي(const std::string&, int) { return false; }',
  'inline bool _ز_يساوي(double, const std::string&) { return false; }',
  'inline bool _ز_يساوي(int, const std::string&) { return false; }',
  'template <typename T> bool _ز_يساوي(const std::vector<T>&, int) { return false; }',
  'template <typename T> bool _ز_يساوي(const std::vector<T>&, double) { return false; }',
  'template <typename A, typename B> bool _ز_أكبر_أو_يساوي(const A& أ, const B& ب) { return أ >= ب; }',
  'template <typename T> bool _ز_أكبر_أو_يساوي(const std::vector<T>&, int) { return false; }',
  'template <typename T> bool _ز_أكبر_أو_يساوي(const std::vector<T>&, double) { return false; }',
  'template <typename T> bool _ز_أصغر_أو_يساوي(const std::vector<T>&, int) { return false; }',
  'template <typename T> bool _ز_أصغر_أو_يساوي(const std::vector<T>&, double) { return false; }',
  'inline bool _ز_أكبر_أو_يساوي(const std::string&, double) { return false; }',
  'inline bool _ز_أكبر_أو_يساوي(const std::string&, int) { return false; }',
  'template <typename A, typename B> bool _ز_أصغر_أو_يساوي(const A& أ, const B& ب) { return أ <= ب; }',
  'inline bool _ز_أصغر_أو_يساوي(const std::string&, double) { return false; }',
  'inline bool _ز_أصغر_أو_يساوي(const std::string&, int) { return false; }',
  '',
  '// تحويل أي قيمة إلى نص (كما يفعل جمع النصوص في زيتونة)',
  'template <typename T>',
  'std::string _ز_نص(const T& قيمة) {',
  '  std::ostringstream مخرج;',
  '  مخرج << قيمة;',
  '  return مخرج.str();',
  '}',
  '',
];

function isThis(n) { return !!n && (n.type === 'ThisLit' || (n.type === 'Id' && n.name === 'this')); }

let SEQ = 0;

class CppEmitter {
  constructor(ast, opts = {}) {
    this.ast = ast;
    this.w = new Writer('  ', '');
    this.unsupported = [];
    this.notes = [];
    this.indent0 = 0;
    this.inMethod = false;
    this.className = null;
    this.kinds = new Map();       // اسم ← 'num' | 'str' | 'list' | 'bool' | '?'
    this.templated = new Set();
  }

  bad(kind, node) {
    const line = node && node.line ? node.line : null;
    this.unsupported.push({ kind, line });
  }

  // ---------------------------------------------------------------- تحليل أولي
  scanKinds(body) {
    for (const s of body || []) {
      if (s.type === 'VarDecl') {
        for (const d of s.decls) {
          this.kinds.set(d.name, d.typeAnn ? this.kindFromType(d.typeAnn) : this.kindOf(d.init));
        }
      }
    }
  }
  kindFromType(t) {
    const n = t && (t.name || (t.kind === 'name' ? t.js : null));
    if (n === 'string' || n === 'نص') return 'str';
    if (n === 'number' || n === 'عدد' || n === 'عشري') return 'num';
    if (n === 'boolean' || n === 'منطقي') return 'bool';
    if (n === 'قائمة' || t.kind === 'array' || t.kind === 'generic') return 'list';
    return '?';
  }
  kindOf(n) {
    if (!n) return '?';
    if (n.type === 'NumLit') return 'num';
    if (n.type === 'StrLit') return 'str';
    if (n.type === 'BoolLit') return 'bool';
    if (n.type === 'ArrayLit') return 'list';
    if (n.type === 'Id') return this.kinds.get(n.name) || '?';
    if (n.type === 'Bin' && n.op === '+') return this.isStr(n) ? 'str' : 'num';
    return '?';
  }
  isStr(n) {
    if (!n || n.type !== 'Bin' || n.op !== '+') return false;
    const part = (x) => (x.type === 'StrLit') || (x.type === 'Id' && this.kinds.get(x.name) === 'str') || this.isStr(x);
    return part(n.left) || part(n.right);
  }

  // ---------------------------------------------------------------- التنفيذ
  run() {
    const body = this.ast.body || [];
    this.scanKinds(body);
    for (const line of PRELUDE) this.w.push(line);

    const top = body.filter((s) => s.type === 'FuncDecl' || s.type === 'ClassDecl' || s.type === 'VarDecl' && false);
    const main = body.filter((s) => !top.includes(s));

    for (const s of top) {
      this.w.flushComments(s.line, this.ast.comments, '// ');
      this.emitStatement(s);
    }
    this.w.push('int main() {', null);
    this.w.indent++;
    for (const s of main) {
      this.w.flushComments(s.line, this.ast.comments, '// ');
      this.emitStatement(s);
    }
    this.w.push('return 0;', null);
    this.w.indent--;
    this.w.push('}', null);
    this.w.flushRest(this.ast.comments, '// ');
    return { code: this.w.toString(), map: this.w.map, unsupported: this.unsupported, notes: this.notes };
  }

  stmt(text, node) { this.w.push(text.endsWith(';') || text.endsWith('{') || text.endsWith('}') ? text : text + ';', node && node.line); }
  open(text, node) { this.w.push(text + ' {', node && node.line); this.w.indent++; }
  close(node) { this.w.indent--; this.w.push('}', node && node.line); }

  emitStatement(node) {
    switch (node.type) {
      case 'VarDecl': {
        for (const d of node.decls) {
          const value = d.init ? this.expr(d.init) : this.defaultValue(d.typeAnn);
          this.w.push(`${this.declareVar(d.name, d.typeAnn, d.init)} = ${value};`, d.line);
        }
        return;
      }
      case 'ExprStmt': {
        const text = this.expr(node.expr);
        this.w.push(text.endsWith(';') ? text : text + ';', node.line);
        return;
      }
      case 'FuncDecl': return this.funcDecl(node);
      case 'ClassDecl': return this.classDecl(node);
      case 'IfStmt': return this.ifStmt(node);
      case 'WhileStmt': this.open(`while (${this.expr(node.test)})`, node); this.body(node.body.body); this.close(); return;
      case 'ForStmt': return this.forStmt(node);
      case 'ForOfStmt': {
        this.open(`for (const auto& ${node.name} : ${this.expr(node.iterable)})`, node);
        this.body(node.body.body); this.close();
        return;
      }
      case 'SwitchStmt': return this.switchStmt(node);
      case 'MatchStmt': return this.matchStmt(node);
      case 'ReturnStmt': this.stmt(`return${node.argument ? ' ' + this.expr(node.argument) : ''}`, node); return;
      case 'BreakStmt': this.stmt('break', node); return;
      case 'ContinueStmt': this.stmt('continue', node); return;
      case 'Block': this.w.push('{'); this.body(node.body); this.w.push('}'); return;
      case 'TryStmt': this.bad('جرب/التقط (لا استثناءات في هذا المخرج)', node); return;
      case 'ThrowStmt': this.bad('ارفع (throw)', node); return;
      case 'ImportStmt': case 'ExportStmt': this.bad('استورد/صدّر (الوحدات)', node); return;
      default: this.bad(`عقدة غير معروفة: ${node.type}`, node);
    }
  }
  body(list) { this.w.indent++; for (const s of list) { this.w.flushComments(s.line, this.ast.comments, '// '); this.emitStatement(s); } this.w.indent--; }

  defaultValue(t) {
    const k = t ? this.kindFromType(t) : '?';
    if (k === 'str') return 'std::string()';
    if (k === 'bool') return 'false';
    if (k === 'list') return '{}';
    return '0';
  }

  declareVar(name, typeAnn, init) {
    if (typeAnn) return `${this.typeText(typeAnn)} ${name}`;
    const k = this.kindOf(init);
    if (k === 'num') return `auto ${name}`;
    if (k === 'str') return `std::string ${name}`;
    if (k === 'bool') return `bool ${name}`;
    if (k === 'list') return `auto ${name}`;
    this.notes.push(`سطر ${init ? init.line : '؟'}: نوع «${name}» غير معروف — استُخدم auto.`);
    return `auto ${name}`;
  }

  typeText(t) {
    if (!t) return 'auto';
    if (t.kind === 'name') {
      const ar = t.name || t.js;
      return TYPE_MAP[ar] || ar;
    }
    if (t.kind === 'array') return `std::vector<${this.typeText(t.of)}>`;
    if (t.kind === 'generic') {
      const base = TYPE_MAP[t.name && t.name.name] || (t.name && (t.name.name || t.name.js)) || 'auto';
      return `${base}<${t.args.map((a) => this.typeText(a)).join(', ')}>`;
    }
    if (t.kind === 'union') return `std::variant<${t.parts.map((a) => this.typeText(a)).join(', ')}>`;
    return 'auto';
  }

  funcDecl(node) {
    if (node.typeParams && node.typeParams.length) {
      this.w.push(`template <${node.typeParams.map((t) => `typename ${t}`).join(', ')}>`, node.line);
    }
    const params = node.params || [];
    const types = node.paramTypes || [];
    const untyped = params.filter((p, i) => !types[i]).length;
    let head;
    if (untyped && node.exported !== 'always-concrete') {
      // بلا أنواع: قالب سي++ يعمل مع أي نوع (وهو ما تعنيه زيتونة فعلًا)
      const names = params.map((p, i) => (types[i] ? this.typeText(types[i]) : `T${i + 1}`));
      const decls = params.map((p, i) => `${names[i]} ${p.replace(/^\.\.\./, '')}`);
      const tparams = params.map((p, i) => (types[i] ? null : `typename T${i + 1}`)).filter(Boolean);
      this.w.push(`template <${tparams.join(', ')}>`, node.line);
      head = `auto ${node.name}(${decls.join(', ')})`;
      this.notes.push(`سطر ${node.line}: «${node.name}» بلا أنواع ← قالب سي++ (template).`);
    } else {
      const decls = params.map((p, i) => `${this.typeText(types[i])} ${p.replace(/^\.\.\./, '')}`);
      head = `auto ${node.name}(${decls.join(', ')})`;
    }
    this.w.push(head, node.line);
    this.open('', node);
    this.body(node.body.body);
    this.close(node);
  }

  classDecl(node) {
    this.className = node.name;
    // أنوع الحقول من تعليقات معاملات المنشئ، ومن لا نوع له يصبح معامل قالب
    const ctor = node.members.find((m) => m.kind === 'constructor');
    const fields = [];                     // [{name, type|null}]
    const paramTmpl = new Map();           // اسم معامل ← T1/T2
    if (ctor) {
      for (const s of (ctor.body.body || [])) {
        if (s.type !== 'ExprStmt' || s.expr.type !== 'Assign') continue;
        const t = s.expr.target;
        if (t.type !== 'Member' || !isThis(t.object)) continue;
        const idx = (ctor.params || []).indexOf(s.expr.value.name);
        const ann = idx >= 0 ? (ctor.paramTypes || [])[idx] : null;
        if (ann) fields.push({ name: t.property, type: this.typeText(ann) });
        else {
          const tname = `T${fields.filter((f) => !f.type).length + 1}`;
          fields.push({ name: t.property, type: null, tname });
          if (s.expr.value.type === 'Id') paramTmpl.set(s.expr.value.name, tname);
        }
      }
    }
    if (node.typeParams && node.typeParams.length) {
      this.w.push(`template <${node.typeParams.map((t) => `typename ${t}`).join(', ')}>`, node.line);
      this.notes.push(`سطر ${node.line}: صنف «${node.name}» عام ← قالب سي++ بأنواع عربية.`);
    }
    const tparams = node.typeParams && node.typeParams.length ? [] : fields.filter((f) => !f.type).map((f) => f.tname);
    if (tparams.length) {
      this.w.push(`template <${tparams.map((x) => `typename ${x}`).join(', ')}>`, node.line);
      this.notes.push(`سطر ${node.line}: صنف «${node.name}» بحقول بلا أنواع ← قالب سي++ (يُستنتج نوعه عند الإنشاء).`);
    } else if (!fields.length && ctor) {
      this.notes.push(`سطر ${node.line}: صنف «${node.name}» بلا حقول مكتوبة — قد يحتاج مراجعة.`);
    }
    this.w.push(`class ${node.name}${node.superClass ? ' : public ' + node.superClass : ''} {`, node.line);
    this.w.push('public:');
    this.w.indent++;
    for (const f of fields) this.w.push(`${f.type || f.tname} ${f.name}{};`);
    for (const m of node.members) {
      if (m.kind === 'field') { this.bad(`حقل صنف مستقل: ${m.name}`, m); continue; }
      const params = m.params || [];
      const types = m.paramTypes || [];
      const isCtor = m.kind === 'constructor';
      if (isCtor) {
        const decls = params.map((p, i) => `${types[i] ? this.typeText(types[i]) : (paramTmpl.get(p) || 'auto')} ${p}`);
        this.w.push(`${node.name}(${decls.join(', ')}) {`, m.line);
      } else {
        const tp = params.filter((p, i) => !types[i]);
        if (tp.length) this.w.push(`template <${tp.map((_, i) => `typename U${i + 1}`).join(', ')}>`, m.line);
        let ui = 0;
        const decls = params.map((p, i) => `${types[i] ? this.typeText(types[i]) : `U${++ui}`} ${p}`);
        this.w.push(`auto ${m.name}(${decls.join(', ')}) {`, m.line);
      }
      this.w.indent++;
      this.inMethod = true; this.body(m.body.body); this.inMethod = false;
      this.w.indent--;
      this.w.push('}', m.line);
    }
    this.w.indent--;
    this.w.push('};', node.line);
    this.className = null;
  }

  ifStmt(node) {
    let cur = node;
    let first = true;
    while (true) {
      this.open(`${first ? 'if' : 'else if'} (${this.expr(cur.test)})`, cur);
      this.body(cur.consequent.body);
      this.close();
      first = false;
      if (cur.alternate && cur.alternate.type === 'IfStmt') { cur = cur.alternate; continue; }
      break;
    }
    if (cur.alternate) { this.open('else', cur); this.body(cur.alternate.body); this.close(); }
  }

  forStmt(node) {
    const init = node.init;
    const single = init && init.type === 'VarDecl' && init.decls.length === 1 ? init.decls[0] : null;
    const initText = single
      ? `${single.typeAnn ? this.typeText(single.typeAnn) : 'auto'} ${single.name} = ${single.init ? this.expr(single.init) : '0'}`
      : (init ? this.expr(init) : '');
    const test = node.test ? this.expr(node.test) : '';
    let update = node.update ? this.expr(node.update) : '';
    if (node.update && node.update.type === 'Update') {
      update = node.update.prefix ? `${node.update.op}${this.expr(node.update.arg)}` : `${this.expr(node.update.arg)}${node.update.op}`;
    }
    this.open(`for (${initText}; ${test}; ${update})`, node);
    this.body(node.body.body);
    this.close();
  }

  switchStmt(node) {
    if (node.discriminant.type === 'BoolLit' && node.discriminant.value === true) {
      this.chain(node.cases.map((c) => ({ cond: c.test ? this.expr(c.test) : null, body: c.body, line: c.line })), node);
      return;
    }
    const tmp = `__ق${++SEQ}`;
    this.stmt(`auto ${tmp} = ${this.expr(node.discriminant)}`, node);
    this.chain(node.cases.map((c) => ({ cond: c.test ? `${tmp} == ${this.expr(c.test)}` : null, body: c.body, line: c.line })), node);
  }

  matchStmt(node) {
    const tmp = `__م${++SEQ}`;
    this.stmt(`auto ${tmp} = ${this.expr(node.discriminant)}`, node);
    const kind = this.kindOf(node.discriminant);
    const items = [];
    for (const a of node.arms) {
      if (a.pattern.kind === 'array' || a.pattern.kind === 'object') {
        // سي++ بلا خرائط، وقوائم «طابق» على قالب مجهول لا تُفحص وقت التشغيل
        this.bad(`فرع «${a.pattern.kind === 'array' ? 'نمط قائمة' : 'نمط كائن'}» — لم يُترجم في هذا المخرج (نوع القيمة ${kind})`, a.pattern);
        continue;
      }
      items.push({ cond: this.pattern(tmp, a.pattern, a.guard), body: a.body, line: a.line, binds: [] });
    }
    if (!items.length) { this.bad('«طابق» بلا فرع قابل للترجمة في سي++', node); return; }
    this.chain(items, node);
  }

  chain(items, node) {
    for (const it of items) it.body = (it.body || []).filter((x) => x.type !== 'BreakStmt');
    const branches = items.filter((i) => i.cond !== null);
    const rest = items.find((i) => i.cond === null);
    let first = true;
    for (const it of branches) {
      this.open(`${first ? 'if' : 'else if'} (${it.cond})`, it);
      for (const b of (it.binds || [])) this.stmt(b, it);
      this.body(it.body);
      this.close();
      first = false;
    }
    if (rest) {
      this.open(first ? 'if (true)' : 'else', rest);
      for (const b of (rest.binds || [])) this.stmt(b, rest);
      this.body(rest.body);
      this.close();
    }
  }

  pattern(tmp, pattern, guard) {
    const g = guard ? `(${this.expr(guard)})` : null;
    if (pattern.kind === 'default') return g;
    let cond;
    switch (pattern.kind) {
      case 'lit': cond = `_ز_يساوي(${tmp}, ${this.expr(pattern.value)})`; break;
      case 'alt': cond = pattern.alts.map((a) => `(${this.pattern(tmp, a, null)})`).join(' || '); break;   // كل نمط بديل
      case 'range': cond = `(_ز_أكبر_أو_يساوي(${tmp}, ${this.expr(pattern.from)}) && _ز_أصغر_أو_يساوي(${tmp}, ${this.expr(pattern.to)}))`; break;
      case 'type': cond = this.bad(`نمط النوع (${pattern.arg.raw || '?'}) — لا فحص نوع وقت تشغيل في سي++`, pattern) || 'true'; break;
      case 'array': cond = `(${tmp}.size() == ${pattern.names.length})`; break;
      default: cond = 'true';
    }
    return g ? `(${cond}) && ${g}` : cond;
  }

  // ---------------------------------------------------------------- التعبيرات
  expr(node) {
    if (!node) return '';
    switch (node.type) {
      case 'NumLit': return String(node.value);
      case 'StrLit': return node.raw !== undefined ? `std::string(${node.js})` : node.js;
      case 'BoolLit': return node.value ? 'true' : 'false';
      case 'NullLit': case 'UndefinedLit': return '0';
      case 'ThisLit': return 'this';
      case 'Id': return node.name;
      case 'ArrayLit': return this.arrayLit(node);
      case 'ObjectLit': this.bad('كائن عربي (لا خرائط في هذا المخرج — استخدم صنفًا)', node); return '{}';
      case 'Member': {
        if (!node.computed && node.property === 'length') return `${this.expr(node.object)}.size()`;
        const obj = this.expr(node.object);
        if (node.computed) return `${obj}[${this.expr(node.property)}]`;
        const sep = (node.object.type === 'ThisLit' || (node.object.type === 'Id' && node.object.name === 'this')) ? '->' : '.';
        return `${obj}${sep}${node.property}`;
      }
      case 'Index': return `${this.expr(node.object)}[${this.expr(node.property)}]`;
      case 'Bin': case 'Logical': return this.bin(node);
      case 'Unary': {
        if (node.op === 'typeof') { this.bad('«نوع» (typeof)', node); return '"unknown"'; }
        if (node.op === 'delete') { this.bad('«احذف»', node); return ''; }
        return `${node.op}${this.expr(node.arg)}`;
      }
      case 'Update': return node.prefix ? `${node.op}${this.expr(node.arg)}` : `${this.expr(node.arg)}${node.op}`;
      case 'Assign': {
        const t = this.expr(node.target);
        return `${t} ${node.op} ${this.expr(node.value)}`;
      }
      case 'Conditional': return `(${this.expr(node.test)} ? ${this.expr(node.consequent)} : ${this.expr(node.alternate)})`;
      case 'New': return `${node.callee.name || this.expr(node.callee)}(${node.args.map((a) => this.arg(a)).join(', ')})`;
      case 'Call': return this.call(node);
      case 'Arrow': {
        const ps = node.params.map((p) => `${p.startsWith('...') ? '' : 'auto '}${p.replace(/^\.\.\./, '')}`);
        if (node.expression) return `[&](${ps.join(', ')}) { return ${this.expr(node.body)}; }`;
        this.bad('دالة سهمية بكتلة (اقصرها على تعبير واحد)', node);
        return `[&](${ps.join(', ')}) { }`;
      }
      case 'FuncExpr': { this.bad('دالة داخل تعبير', node); return '[](){}'; }
      case 'Await': this.bad('«انتظر» (await)', node); return this.expr(node.arg);
      case 'Spread': this.bad('البسط في موضع لا يقبله سي++ — استخدم قائمة', node); return this.expr(node.arg);
      case 'Super': return node.type === 'Super' ? 'Base' : 'this';
      default: this.bad(`تعبير ${node.type}`, node); return '0';
    }
  }

  arg(a) {
    if (a.type === 'Spread') { this.bad('بسط في نداء', a); return this.expr(a.arg); }
    if (a.type === 'ObjectLit') { this.bad('كائن في نداء (لا خرائط في هذا المخرج) — وُضعت قيمة محايدة كي يظل المخرج يُترجم', a); return '0'; }
    return this.expr(a);
  }

  arrayLit(node) {
    const kinds = node.elements.map((e) => this.kindOf(e));
    const allNum = kinds.every((k) => k === 'num');
    const allStr = kinds.every((k) => k === 'str');
    const els = node.elements.map((e) => this.expr(e)).join(', ');
    if (allNum) return `std::vector<int>{${els}}`;
    if (allStr) return `std::vector<std::string>{${els}}`;
    this.notes.push(`سطر ${node.line}: قائمة بأنواع مختلطة ← std::vector<int> مع تحويل صريح (تحقّق بـ g++).`);
    return `std::vector<int>{${node.elements.map((e) => this.kindOf(e) === 'num' ? this.expr(e) : `0 /* غير رقمي */`).join(', ')}}`;
  }

  bin(node) {
    if (node.op === '+' && this.isStr(node)) return this.strConcat(node);
    const map = { '===': '==', '!==': '!=', '&&': ' && ', '||': ' || ', '**': '**' };
    const op = map[node.op] || node.op;
    if (node.op === '**') { this.bad('الأس «**» — استخدم دالة', node); return `pow(${this.expr(node.left)}, ${this.expr(node.right)})`; }
    return `(${this.expr(node.left)}${op}${this.expr(node.right)})`;
  }

  /** جمع نصّي: الأرقام تُغلَّف بـ std::to_string */
  strConcat(node) {
    const parts = [];
    const walk = (n) => {
      if (n.type === 'Bin' && n.op === '+' && this.isStr(n)) { walk(n.left); walk(n.right); return; }
      parts.push(n);
    };
    walk(node);
    const pieces = parts.map((p) => {
      const text = this.expr(p);
      const k = this.kindOf(p);
      if (k === 'str' || p.type === 'StrLit') return text;
      return `_ز_نص(${text})`;   // يعمل مع الأعداد والنصوص وأي نوع له <<
    });
    return pieces.length ? pieces.reduce((a, b) => `(${a} + ${b})`) : 'std::string()';
  }

  call(node) {
    if (node.callee.type === 'Id') {
      const name = node.callee.name;
      const args = node.args.map((a) => this.arg(a));
      const macro = MACROS[name];
      if (macro && (macro.arity === null || args.length === macro.arity)) {
        switch (name) {
          case 'اطبع': return `std::cout${args.map((a) => ` << ${a}`).join('')} << "\\n";`;
          case 'طول': return `${args[0]}.size()`;
          case 'أضف': return `${args[0]}.push_back(${args[1]});`;
          case 'رتب': return `std::sort(${args[0]}.begin(), ${args[0]}.end());`;
          case 'نص': return `std::to_string(${args[0]})`;
          case 'عدد': return `std::stod(${args[0]})`;
          case 'منطقي': return `static_cast<bool>(${args[0]})`;
          case 'مفاتيح': case 'قيم': this.bad('مفاتيح/قيم (خرائط)', node); return `${args[0]}`;
          case 'اقسم': this.bad('اقسم (تقطيع نص — استخدم دالة مساعدة)', node); return `${args[0]}`;
          case 'انضم': this.bad('انضم (وصل نص — استخدم حلقة)', node); return `${args[0]}`;
          case 'استبدل': this.bad('استبدل (نص)', node); return `${args[0]}`;
          case 'يحتوي': return `(${args[0]}.find(${args[1]}) != std::string::npos)`;
          default: break;
        }
      }
      return `${name}(${args.join(', ')})`;
    }
    if (node.callee.type === 'Member') {
      const m = node.callee;
      const args = node.args.map((a) => this.arg(a));
      const obj = this.expr(m.object);
      const prop = m.computed ? null : m.property;
      if (prop === 'push') return `${obj}.push_back(${args[0]});`;
      if (prop === 'pop') return `${obj}.pop_back();`;
      if (prop === 'join') { this.bad('join', node); return obj; }
      if (prop === 'split') { this.bad('split', node); return obj; }
      if (prop === 'toUpperCase') return this.bad('toUpperCase (استخدم transform)', node) || obj;
      if (prop === 'toLowerCase') return this.bad('toLowerCase', node) || obj;
      if (prop === 'includes') return `(${obj}.find(${args[0]}) != std::string::npos)`;
      if (prop === 'map' || prop === 'filter' || prop === 'forEach') {
        this.bad(`«${prop}» — اكتبها حلقة «لكل» في زيتونة`, node);
        return obj;
      }
      if (prop === 'codePointAt') return `static_cast<int>(${obj}[${args[0] || '0'}])`;
      return prop ? `${obj}.${prop}(${args.join(', ')})` : `${obj}[${this.expr(m.property)}](${args.join(', ')})`;
    }
    return `${this.expr(node.callee)}(${node.args.map((a) => this.arg(a)).join(', ')})`;
  }
}

function emitCpp(ast, opts = {}) {
  return new CppEmitter(ast, opts).run();
}

module.exports = { emitCpp };
