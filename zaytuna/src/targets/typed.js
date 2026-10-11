'use strict';

// ==========================================================================
//  زيتونة — عائلة الأقواس: جو (Go) · رست (Rust) · جافا (Java) · سي شارب (C#)
//  ترجمة من الشجرة العربية إلى كود نظيف، مع أدوات مولَّدة عند اللزوم
//  (تحويل القيم إلى نصّ بنفس صيغة جافاسكربت، وقوائم عددية).
//  ما لا يُترجم بأمانة (أصناف في جو/رست، ديناميكيات…) يُسجَّل ويُعلن.
// ==========================================================================

const { Writer } = require('./writer');
const { MACROS } = require('../dictionary');

const HELPERS = {
  go: `// ===== أدوات زيتونة (مولَّدة آليًا) =====
func _ز_نص(قيمة interface{}) string {
	switch v := قيمة.(type) {
	case []float64:
		أجزاء := make([]string, 0, len(v))
		for _, عنصر := range v {
			أجزاء = append(أجزاء, _ز_نص(عنصر))
		}
		return "[" + _ز_دمج_قائمة(أجزاء) + "]"
	case bool:
		if v {
			return "true"
		}
		return "false"
	case float64:
		if v == float64(int64(v)) {
			return fmt.Sprintf("%d", int64(v))
		}
		return fmt.Sprintf("%g", v)
	case string:
		return v
	}
	return fmt.Sprintf("%v", قيمة)
}

func _ز_دمج_قائمة(أجزاء []string) string {
	ر := ""
	for ع, جزء := range أجزاء {
		if ع > 0 {
			ر += ", "
		}
		ر += جزء
	}
	return ر
}

func _ز_دمج(أ string, ب string) string { return أ + ب }
func _ز_طبع(قيمة string)               { fmt.Println(قيمة) }
func _ز_طول(قائمة []float64) float64   { return float64(len(قائمة)) }
func _ز_رتب(قائمة []float64) {
	for i := 1; i < len(قائمة); i++ {
		for j := i; j > 0 && قائمة[j] < قائمة[j-1]; j-- {
			قائمة[j], قائمة[j-1] = قائمة[j-1], قائمة[j]
		}
	}
}
func _ز_يحتوي(قائمة []float64, قيمة float64) bool {
	for _, عنصر := range قائمة {
		if عنصر == قيمة {
			return true
		}
	}
	return false
}
func _ز_انضم(قائمة []float64, فاصل string) string {
	أجزاء := make([]string, 0, len(قائمة))
	for _, عنصر := range قائمة {
		أجزاء = append(أجزاء, _ز_نص(عنصر))
	}
	ر := ""
	for ع, جزء := range أجزاء {
		if ع > 0 {
			ر += فاصل
		}
		ر += جزء
	}
	return ر
}
// ===== نهاية الأدوات =====`,

  rust: `// ===== أدوات زيتونة (مولَّدة آليًا) =====
fn _ز_نص_عدد(قيمة: f64) -> String {
    if قيمة == قيمة.trunc() {
        format!("{}", قيمة as i64)
    } else {
        format!("{}", قيمة)
    }
}

fn _ز_نص(قيمة: &str) -> String { قيمة.to_string() }

fn _ز_دمج(أ: &str, ب: &str) -> String { format!("{}{}", أ, ب) }

fn _ز_طبع(قيمة: &str) { println!("{}", قيمة); }

fn _ز_طول(قائمة: &Vec<f64>) -> f64 { قائمة.len() as f64 }

fn _ز_رتب(قائمة: &mut Vec<f64>) {
    قائمة.sort_by(|أ, ب| أ.partial_cmp(ب).unwrap());
}

fn _ز_يحتوي(قائمة: &Vec<f64>, قيمة: f64) -> bool { قائمة.iter().any(|ع| *ع == قيمة) }

fn _ز_نص_قائمة(قائمة: &Vec<f64>) -> String {
    let أجزاء: Vec<String> = قائمة.iter().map(|ع| _ز_نص_عدد(*ع)).collect();
    format!("[{}]", أجزاء.join(", "))
}
// ===== نهاية الأدوات =====`,

  java: `  // ===== أدوات زيتونة (مولَّدة آليًا) =====
  static String _ز_نص(double قيمة) {
    if (قيمة == Math.rint(قيمة) && !Double.isInfinite(قيمة)) return String.valueOf((long) قيمة);
    return String.valueOf(قيمة);
  }

  static String _ز_نص_منطقي(boolean قيمة) { return قيمة ? "true" : "false"; }

  static String _ز_نص_نص(String قيمة) { return قيمة; }

  static String _ز_نص_قائمة(java.util.List<Double> قائمة) {
    StringBuilder ر = new StringBuilder("[");
    for (int i = 0; i < قائمة.size(); i++) {
      if (i > 0) ر.append(", ");
      ر.append(_ز_نص(قائمة.get(i)));
    }
    return ر.append("]").toString();
  }

  static String _ز_دمج(String أ, String ب) { return أ + ب; }

  static void _ز_طبع(String قيمة) { System.out.println(قيمة); }

  static java.util.List<Double> _ز_قائمة_جديدة() { return new java.util.ArrayList<>(); }

  static double _ز_طول(java.util.List<Double> قائمة) { return قائمة.size(); }

  static void _ز_رتب(java.util.List<Double> قائمة) { java.util.Collections.sort(قائمة); }

  static boolean _ز_يحتوي(java.util.List<Double> قائمة, double قيمة) { return قائمة.contains(قيمة); }

  static String _ز_انضم(java.util.List<Double> قائمة, String فاصل) {
    StringBuilder ر = new StringBuilder();
    for (int i = 0; i < قائمة.size(); i++) {
      if (i > 0) ر.append(فاصل);
      ر.append(_ز_نص(قائمة.get(i)));
    }
    return ر.toString();
  }
  // ===== نهاية الأدوات =====`,

  cs: `  // ===== أدوات زيتونة (مولَّدة آليًا) =====
  static string _ز_نص(double قيمة) {
    if (قيمة == Math.Round(قيمة) && !double.IsInfinity(قيمة)) return ((long) قيمة).ToString();
    return قيمة.ToString();
  }

  static string _ز_نص_منطقي(bool قيمة) { return قيمة ? "true" : "false"; }

  static string _ز_نص_قائمة(List<double> قائمة) {
    var أجزاء = new List<string>();
    foreach (var ع in قائمة) أجزاء.Add(_ز_نص(ع));
    return "[" + string.Join(", ", أجزاء) + "]";
  }

  static string _ز_دمج(string أ, string ب) { return أ + ب; }

  static void _ز_طبع(string قيمة) { Console.WriteLine(قيمة); }

  static List<double> _ز_قائمة_جديدة() { return new List<double>(); }

  static double _ز_طول(List<double> قائمة) { return قائمة.Count; }

  static void _ز_رتب(List<double> قائمة) { قائمة.Sort(); }

  static bool _ز_يحتوي(List<double> قائمة, double قيمة) { return قائمة.Contains(قيمة); }

  static string _ز_انضم(List<double> قائمة, string فاصل) {
    var أجزاء = new List<string>();
    foreach (var ع in قائمة) أجزاء.Add(_ز_نص(ع));
    return string.Join(فاصل, أجزاء);
  }
  // ===== نهاية الأدوات =====`,
};

const CFG = {
  go: {
    label: 'جو', ext: '.go',
    comment: '// ',
    trueLit: 'true', falseLit: 'false', nullLit: 'nil',
    num: 'float64', str: 'string', bool: 'bool', list: '[]float64', void: '',
    wrap: (body) => `package main\n\nimport "fmt"\n\n${HELPERS.go}\n\n${body}`,
    funcHead: (name, params, ret) => `func ${name}(${params.join(', ')})${ret ? ' ' + ret : ''}`,
    param: (name, type) => `${name} ${type}`,
    localDecl: (name, type, init) => `var ${name} ${type} = ${init}`,
    shortDecl: (name, init) => `${name} := ${init}`,
    ifHead: (c) => `if ${c}`,
    whileHead: (c) => `for ${c}`,
    forClause: (init, test, update) => `for ${init}; ${test}; ${update}`,
    forOf: (name, iterable) => `for _, ${name} := range ${iterable}`,
    arrayLit: (els) => `[]float64{${els.join(', ')}}`,
    callList: (list) => list,
    concat: (a, b) => `_ز_دمج(${a}, ${b})`,
    toText: (code, kind) => (kind === 'str' ? code : kind === 'bool' ? `_ز_نص_منطقي_جو(${code})` : `_ز_نص(${code})`),
    returnKw: 'return',
  },
  rs: {
    label: 'رست', ext: '.rs',
    comment: '// ',
    trueLit: 'true', falseLit: 'false', nullLit: 'None',
    num: 'f64', str: 'String', bool: 'bool', list: 'Vec<f64>', void: '',
    wrap: (body) => `${HELPERS.rust}\n\n${body}`,
    funcHead: (name, params, ret) => `fn ${name}(${params.join(', ')})${ret ? ' -> ' + ret : ''}`,
    param: (name, type) => `${name}: ${type}`,
    localDecl: (name, type, init) => `let ${name}: ${type} = ${init}`,
    shortDecl: (name, init) => `let mut ${name} = ${init}`,
    ifHead: (c) => `if ${c}`,
    whileHead: (c) => `while ${c}`,
    forClause: (init, test, update) => `while ${test}`,          // تحديث الحلقة داخل الجسم
    forOf: (name, iterable) => `for ${name} in &${iterable}`,
    arrayLit: (els) => `vec![${els.join(', ')}]`,
    callList: (list) => `&${list}`,
    concat: (a, b) => `_ز_دمج(&${a}, &${b})`,
    toText: (code, kind) => (kind === 'str' ? `${code}.clone()` : `_ز_نص_عدد(${code})`),
    returnKw: 'return',
  },
  java: {
    label: 'جافا', ext: '.java',
    comment: '// ',
    trueLit: 'true', falseLit: 'false', nullLit: 'null',
    num: 'double', str: 'String', bool: 'boolean', list: 'java.util.List<Double>', void: 'void',
    wrap: (body) => `import java.util.*;\n\npublic class المخرج {\n${body}\n}\n`,
    funcHead: (name, params, ret) => `  static ${ret || 'void'} ${name}(${params.join(', ')})`,
    param: (name, type) => `${type} ${name}`,
    localDecl: (name, type, init) => `${type} ${name} = ${init}`,
    shortDecl: (name, init) => `double ${name} = ${init}`,
    ifHead: (c) => `if (${c})`,
    whileHead: (c) => `while (${c})`,
    forClause: (init, test, update) => `for (${init}; ${test}; ${update})`,
    forOf: (name, iterable) => `for (double ${name} : ${iterable})`,
    arrayLit: (els) => `new java.util.ArrayList<>(java.util.Arrays.asList(${els.join(', ')}))`,
    callList: (list) => list,
    concat: (a, b) => `_ز_دمج(${a}, ${b})`,
    toText: (code, kind) => (kind === 'str' ? code : kind === 'bool' ? `_ز_نص_منطقي(${code})` : `_ز_نص(${code})`),
    returnKw: 'return',
  },
  cs: {
    label: 'سي شارب', ext: '.cs',
    comment: '// ',
    trueLit: 'true', falseLit: 'false', nullLit: 'null',
    num: 'double', str: 'string', bool: 'bool', list: 'List<double>', void: 'void',
    wrap: (body) => `using System;\nusing System.Collections.Generic;\n\nclass المخرج {\n${body}\n}\n`,
    funcHead: (name, params, ret) => `  static ${ret || 'void'} ${name}(${params.join(', ')})`,
    param: (name, type) => `${type} ${name}`,
    localDecl: (name, type, init) => `${type} ${name} = ${init}`,
    shortDecl: (name, init) => `double ${name} = ${init}`,
    ifHead: (c) => `if (${c})`,
    whileHead: (c) => `while (${c})`,
    forClause: (init, test, update) => `for (${init}; ${test}; ${update})`,
    forOf: (name, iterable) => `foreach (double ${name} in ${iterable})`,
    arrayLit: (els) => `new List<double> { ${els.join(', ')} }`,
    callList: (list) => list,
    concat: (a, b) => `_ز_دمج(${a}, ${b})`,
    toText: (code, kind) => (kind === 'str' ? code : kind === 'bool' ? `_ز_نص_منطقي(${code})` : `_ز_نص(${code})`),
    returnKw: 'return',
  },
};

const TYPE_HINT = { 'عدد': 'num', 'عشري': 'num', 'نص': 'str', 'منطقي': 'bool', 'قائمة': 'list' };

function isThis(n) { return !!n && (n.type === 'ThisLit' || (n.type === 'Id' && n.name === 'this')); }

let SEQ = 0;

class TypedEmitter {
  constructor(ast, lang) {
    this.ast = ast;
    this.lang = lang;
    this.c = CFG[lang];
    this.w = new Writer('  ', '');
    this.unsupported = [];
    this.notes = [];
    this.kinds = new Map();
    this.funcs = new Map();
    this.inMethod = false;
  }

  bad(kind, node) { this.unsupported.push({ kind, line: node && node.line ? node.line : null }); }

  typeOf(kind) { return this.c[kind] || this.c.num; }

  // --------------------------------------------------------------- التنفيذ
  run() {
    const body = this.ast.body || [];
    this.infer(body);
    if (this.lang === 'java' || this.lang === 'cs') this.w.indent = 1;

    const top = body.filter((s) => s.type === 'FuncDecl');
    const main = body.filter((s) => s.type !== 'FuncDecl');
    for (const s of top) {
      this.w.flushComments(s.line, this.ast.comments, this.c.comment);
      this.emitStatement(s);
      this.w.push('');
    }
    const mainHead = this.lang === 'go' ? 'func main()' : this.lang === 'rs' ? 'fn main()' : 'public static void main(String[] args)';
    const csHead = 'static void Main()';
    this.w.push(this.lang === 'cs' ? csHead : mainHead);
    this.w.push('{');
    this.w.indent++;
    for (const s of main) {
      this.w.flushComments(s.line, this.ast.comments, this.c.comment);
      this.emitStatement(s);
    }
    this.w.indent--;
    this.w.push('}');
    this.w.flushRest(this.ast.comments, this.c.comment);
    const text = this.w.toString().replace(/\n+$/, '');
    return { code: this.c.wrap(text), map: this.w.map, unsupported: this.unsupported, notes: this.notes };
  }

  infer(body) {
    for (const s of body) {
      if (s.type === 'VarDecl') for (const d of s.decls) this.kinds.set(d.name, this.kindFromAnn(d.typeAnn) || this.kindOf(d.init));
      if (s.type === 'FuncDecl') {
        this.funcs.set(s.name, { decl: s, ret: this.kindFromAnn(s.returnType) || null, params: s.params.map((p, i) => this.typeFromAnn(s.paramTypes && s.paramTypes[i])) });
      }
    }
    // نوع الإرجاع: من عبارات «أرجع»
    for (const [, f] of this.funcs) {
      const kinds = [];
      const walk = (n) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(walk);
        if (n.type === 'ReturnStmt' && n.argument) kinds.push(this.kindOf(n.argument));
        for (const k of Object.keys(n)) if (!['type', 'line', 'col'].includes(k)) walk(n[k]);
      };
      walk(f.decl.body.body);
      if (!f.ret) f.ret = kinds.length && kinds.every((k) => k === kinds[0]) ? kinds[0] : (kinds.length ? null : 'void');
    }
  }

  typeFromAnn(t) { return t ? this.typeOf(this.kindFromAnn(t) || 'num') : null; }
  kindFromAnn(t) {
    if (!t) return null;
    const n = t.name || (t.kind === 'name' ? t.js : null);
    return TYPE_HINT[n] || null;
  }

  kindOf(n) {
    if (!n) return 'void';
    switch (n.type) {
      case 'NumLit': return 'num';
      case 'StrLit': return 'str';
      case 'BoolLit': return 'bool';
      case 'ArrayLit': return 'list';
      case 'Id': return this.kinds.get(n.name) || 'num';
      case 'Index': return this.kindOf(n.object) === 'list' ? 'num' : 'num';
      case 'Member': return n.property === 'length' ? 'num' : 'num';
      case 'Bin': case 'Logical': return this.isStr(n) ? 'str'
        : ['&&', '||', '===', '!==', '<', '>', '<=', '>=', '==', '!='].includes(n.op) ? 'bool' : 'num';
      case 'Unary': return n.op === '!' ? 'bool' : 'num';
      case 'Update': return 'num';
      case 'Conditional': return this.kindOf(n.consequent);
      case 'Call': {
        if (n.callee.type === 'Id') {
          const macro = MACROS[n.callee.name];
          if (macro) {
            if (['نص', 'انضم'].includes(n.callee.name)) return 'str';
            if (['منطقي', 'يحتوي'].includes(n.callee.name)) return 'bool';
            if (['طول', 'عدد'].includes(n.callee.name)) return 'num';
          }
          const f = this.funcs.get(n.callee.name);
          if (f) return f.ret || 'num';
        }
        if (n.callee.type === 'Member') {
          const p = n.callee.computed ? '' : n.callee.property;
          if (['includes', 'startsWith', 'endsWith'].includes(p)) return 'bool';
          if (['join', 'toUpperCase', 'toLowerCase', 'trim', 'toString'].includes(p)) return 'str';
          if (p === 'split' || p === 'map' || p === 'filter') return 'list';
        }
        return 'num';
      }
      default: return 'num';
    }
  }

  isStr(n) {
    if (!n || n.type !== 'Bin' || n.op !== '+') return false;
    const part = (x) => x.type === 'StrLit' || this.kindOf(x) === 'str';
    return part(n.left) || part(n.right);
  }

  /** نصّ من قيمة (بصيغة جافاسكربت: true/false · [1, 2] · 1 لا 1.0) */
  asText(node) {
    const code = this.expr(node);
    const kind = this.kindOf(node);
    if (kind === 'str') return code;
    if (kind === 'bool') {
      if (this.lang === 'go') return `_ز_نص(${code})`;
      return this.c.toText(code, 'bool');
    }
    if (kind === 'list') {
      if (this.lang === 'go') return `_ز_نص(${code})`;
      return `_ز_نص_قائمة(${code})`;
    }
    return this.c.toText(code, 'num');
  }

  emitStatement(node) {
    switch (node.type) {
      case 'VarDecl': {
        for (const d of node.decls) {
          const kind = this.kindFromAnn(d.typeAnn) || this.kindOf(d.init);
          this.kinds.set(d.name, kind);
          const type = this.typeOf(kind);
          let init = d.init ? this.expr(d.init) : this.defaultValue(kind);
          if (init === this.c.nullLit) init = this.defaultValue(kind);   // قيمة غير مدعومة ⇒ لا نُنتج كودًا لا يُترجم
          this.w.push(`${this.c.localDecl(d.name, type, init)};`, d.line || node.line);
        }
        return;
      }
      case 'ExprStmt': {
        const e = node.expr;
        if (e.type === 'Call' && e.callee.type === 'Id' && MACROS[e.callee.name]) {
          const stmt = this.macroStatement(e);
          if (stmt) { this.w.push(stmt, node.line); return; }
        }
        const text = this.expr(e);
        this.w.push(`${text}${/;$/.test(text) ? '' : ';'}`, node.line);
        return;
      }
      case 'FuncDecl': return this.funcDecl(node);
      case 'ClassDecl': this.bad(`أصناف «${node.name}» — ${this.c.label} بلا صفوف في هذا المخرج (استخدم دوال + قوائم)`, node); return;
      case 'IfStmt': return this.ifStmt(node);
      case 'WhileStmt':
        this.w.push(`${this.c.whileHead(this.expr(node.test))} {`, node.line);
        this.body(node.body.body);
        this.w.push('}');
        return;
      case 'ForStmt': return this.forStmt(node);
      case 'ForOfStmt':
        this.w.push(`${this.c.forOf(node.name, this.expr(node.iterable))} {`, node.line);
        this.kinds.set(node.name, 'num');
        this.body(node.body.body);
        this.w.push('}');
        return;
      case 'SwitchStmt': return this.switchStmt(node);
      case 'MatchStmt': return this.matchStmt(node);
      case 'ReturnStmt': this.w.push(`return${node.argument ? ' ' + this.expr(node.argument) : ''};`, node.line); return;
      case 'BreakStmt': this.w.push('break;', node.line); return;
      case 'ContinueStmt': this.w.push('continue;', node.line); return;
      case 'Block': this.w.push('{'); this.body(node.body); this.w.push('}'); return;
      case 'TryStmt': this.bad('جرب/التقط (المعاملات هنا بلا استثناءات مترجمة)', node); return;
      case 'ThrowStmt': this.bad('ارفع (throw)', node); return;
      case 'ImportStmt': case 'ExportStmt': this.bad('استورد/صدّر (الوحدات)', node); return;
      default: this.bad(`عقدة غير معروفة: ${node.type}`, node);
    }
  }

  body(list) { this.w.indent++; for (const s of list) { this.w.flushComments(s.line, this.ast.comments, this.c.comment); this.emitStatement(s); } this.w.indent--; }

  defaultValue(kind) {
    if (kind === 'str') return this.lang === 'rs' || this.lang === 'java' || this.lang === 'cs' ? '""' : '""';
    if (kind === 'bool') return 'false';
    if (kind === 'list') return this.c.list === 'Vec<f64>' ? 'Vec::new()' : this.c.arrayLit([]);
    return '0';
  }

  funcDecl(node) {
    const f = this.funcs.get(node.name);
    if (node.params.some((p) => p.startsWith('...'))) this.bad(`معامل تجميعي في «${node.name}» — هذا المخرج لا يدعمه`, node);
    const params = node.params.map((p, i) => {
      const name = p.replace(/^\.\.\./, '');
      const type = (f.params[i]) || this.typeOf(this.kinds.get(name) || 'num');
      return this.c.param(name, type);
    });
    const ret = f.ret === 'void' ? '' : this.typeOf(f.ret || 'num');
    this.w.push(`${this.c.funcHead(node.name, params, ret)} {`, node.line);
    this.body(node.body.body);
    if (f.ret && f.ret !== 'void' && ret && !this.endsWithReturn(node.body.body)) this.w.push(this.retDefault(f.ret));
    this.w.push('}');
  }

  retDefault(kind) {
    if (kind === 'str') return 'return "";';
    if (kind === 'bool') return 'return false;';
    if (kind === 'list') return this.lang === 'rs' ? 'return Vec::new();' : 'return ' + this.c.arrayLit([]) + ';';
    return 'return 0;';
  }

  endsWithReturn(list) {
    const last = [...(list || [])].reverse().find((s) => s && s.type !== 'Block');
    if (!last) return false;
    if (last.type === 'ReturnStmt' || last.type === 'SwitchStmt' || last.type === 'MatchStmt') return true;
    if (last.type === 'IfStmt' && last.alternate) return this.endsWithReturn(last.consequent.body) && this.endsWithReturn(last.alternate.type === 'IfStmt' ? [last.alternate] : last.alternate.body);
    return false;
  }

  /**
   * جو ترفض «}» ثم «else» في سطر جديد — نستبدل آخر «}» بالدمج المطلوب.
   */
  mergeClosingBrace(text) {
    for (let i = this.w.lines.length - 1; i >= 0; i--) {
      const line = this.w.lines[i];
      if (!line.trim()) continue;
      const idx = line.lastIndexOf('}');
      if (idx === -1) break;
      this.w.lines[i] = line.slice(0, idx) + '} ' + text;
      return;
    }
  }

  ifStmt(node) {
    let cur = node;
    let first = true;
    while (true) {
      if (first) this.w.push(`${this.c.ifHead(this.expr(cur.test))} {`, cur.line);
      else if (this.lang === 'go') this.mergeClosingBrace(`else if (${this.expr(cur.test)}) {`);
      else this.w.push(`else if (${this.expr(cur.test)}) {`, cur.line);
      this.body(cur.consequent.body);
      this.w.push('}');
      first = false;
      if (cur.alternate && cur.alternate.type === 'IfStmt') { cur = cur.alternate; continue; }
      break;
    }
    if (cur.alternate) {
      if (this.lang === 'go') this.mergeClosingBrace('else {');
      else this.w.push('else {', cur.line);
      this.body(cur.alternate.body);
      this.w.push('}');
    }
  }

  forStmt(node) {
    const init = node.init;
    const single = init && init.type === 'VarDecl' && init.decls.length === 1 ? init.decls[0] : null;
    const initVal = single && single.init ? this.expr(single.init) : '0';
    const initText = single
      ? (this.lang === 'go' ? `${single.name} := ${initVal}`
        : this.lang === 'rs' ? `let mut ${single.name}: f64 = ${initVal}`
        : `double ${single.name} = ${initVal}`)
      : (init ? this.expr(init).replace(/;$/, '') : '');
    if (single) this.kinds.set(single.name, 'num');
    const name = single ? single.name : '__ع' + (++SEQ);
    if (!single) this.w.push(`var ${name} float64 = 0;`);
    const test = node.test ? this.expr(node.test) : 'true';
    let update = '';
    if (node.update) {
      update = node.update.type === 'Update'
        ? (node.update.prefix ? `${node.update.op}${this.expr(node.update.arg)}` : `${this.expr(node.update.arg)}${node.update.op}`)
        : this.expr(node.update).replace(/;$/, '');
    }
    if (this.lang === 'rs') {
      // رست: «for» الكلاسيكية تُصاغ كـ while + تحديث في نهاية الجسم (±1 بدل ++/--)
      if (single) this.w.push(`let mut ${single.name}: f64 = ${initVal};`);
      this.w.push(`while ${test} {`, node.line);
      this.w.indent++;
      this.body(node.body.body);
      if (update) this.w.push(`${update.replace(/\+\+/g, '+= 1').replace(/--/g, '-= 1')};`);
      this.w.push('}');
      this.w.indent--;
      return;
    }
    if (single) {
      this.w.push(this.lang === 'go' ? `for ${initText}; ${test}; ${update} {` : this.c.forClause(initText, test, update) + ' {', node.line);
    } else {
      this.w.push(this.c.forClause(initText, test, update) + ' {', node.line);
    }
    this.body(node.body.body);
    this.w.push('}');
  }

  switchStmt(node) {
    if (node.discriminant.type === 'BoolLit' && node.discriminant.value === true) {
      this.chain(node.cases.map((c) => ({ cond: c.test ? this.expr(c.test) : null, body: c.body, line: c.line })), node);
      return;
    }
    const n = ++SEQ;
    const tmp = `__ق${n}`;
    const kind = this.kindOf(node.discriminant);
    const decl = this.lang === 'go' ? `${tmp} := ${this.expr(node.discriminant)};`
      : this.lang === 'rs' ? `let ${tmp}: ${this.typeOf(kind)} = ${this.expr(node.discriminant)};`
      : `${this.typeOf(kind)} ${tmp} = ${this.expr(node.discriminant)};`;
    this.w.push(decl, node.line);
    this.chain(node.cases.map((c) => ({ cond: c.test ? `${tmp} == ${this.expr(c.test)}` : null, body: c.body, line: c.line })), node);
  }

  matchStmt(node) {
    const tmp = `__م${++SEQ}`;
    const kind = this.kindOf(node.discriminant);
    const decl = this.lang === 'go' ? `${tmp} := ${this.expr(node.discriminant)};`
      : this.lang === 'rs' ? `let ${tmp}: ${this.typeOf(kind)} = ${this.expr(node.discriminant)};`
      : `${this.typeOf(kind)} ${tmp} = ${this.expr(node.discriminant)};`;
    this.w.push(decl, node.line);
    this.chain(node.arms.map((a) => ({
      cond: this.pattern(tmp, a.pattern, a.guard), body: this.dropBreaks(a.body), line: a.line,
      binds: a.pattern.kind === 'array' ? a.pattern.names.map((n, i) => this.bindLine(n, `${tmp}[${i}]`)) : [],
    })), node);
  }

  /** سطر ربط اسم بقيمة عددية — بصيغة كل لغة */
  bindLine(name, value) {
    if (this.lang === 'go') return `${name} := ${value};`;
    if (this.lang === 'rs') return `let ${name}: f64 = ${value};`;
    return `double ${name} = ${value};`;
  }

  dropBreaks(body) { return (body || []).filter((s) => s.type !== 'BreakStmt'); }

  chain(items, node) {
    const branches = items.filter((i) => i.cond !== null);
    const rest = items.find((i) => i.cond === null);
    let first = true;
    for (const it of branches) {
      if (first) this.w.push(`if (${it.cond}) {`, it.line);
      else if (this.lang === 'go') this.mergeClosingBrace(`else if (${it.cond}) {`);
      else this.w.push(`else if (${it.cond}) {`, it.line);
      this.w.indent++;
      for (const b of (it.binds || [])) this.w.push(b);
      this.w.indent--;
      this.body(it.body);
      this.w.push('}');
      first = false;
    }
    if (rest) {
      if (!first && this.lang === 'go') this.mergeClosingBrace('else {');
      else this.w.push(first ? 'if (true) {' : 'else {', rest.line);
      this.w.indent++;
      for (const b of (rest.binds || [])) this.w.push(b);
      this.w.indent--;
      this.body(rest.body);
      this.w.push('}');
    }
  }

  pattern(tmp, pattern, guard) {
    const g = guard ? `(${this.expr(guard)})` : null;
    if (pattern.kind === 'default') return g;
    let cond;
    switch (pattern.kind) {
      case 'lit': {
        const isStr = this.kindOf(pattern.value) === 'str';
        if (isStr && this.lang === 'java') cond = `${tmp}.equals(${this.expr(pattern.value)})`;
        else if (isStr && this.lang === 'rs') cond = `${tmp} == ${this.expr(pattern.value)}`;
        else cond = `${tmp} == ${this.expr(pattern.value)}`;
        break;
      }
      case 'alt': cond = pattern.alts.map((a) => `(${this.pattern(tmp, a, null)})`).join(' || '); break;
      case 'range': cond = `(${tmp} >= ${this.expr(pattern.from)} && ${tmp} <= ${this.expr(pattern.to)})`; break;
      case 'type': {
        const raw = pattern.arg.type === 'StrLit' ? pattern.arg.raw : null;
        this.bad(`نمط النوع «${raw}» — لا فحص أنواع وقت التشغيل في هذا المخرج`, pattern);
        cond = 'true';
        break;
      }
      case 'array': {
        const n2 = pattern.names.length;
        const sizeOf = this.lang === 'go' ? `${tmp}.len()` : this.lang === 'java' || this.lang === 'cs' ? `${tmp}.size()` : `${tmp}.len() as f64`;
        cond = `(${sizeOf} == ${this.lang === 'java' || this.lang === 'cs' ? n2 + '.0' : n2})`;
        break;
      }
      default: this.bad('نمط كائن (لا قواميس في هذا المخرج)', pattern); cond = 'true';
    }
    return g ? `(${cond}) && ${g}` : cond;
  }

  // ------------------------------------------------------------- التعبيرات
  expr(node) {
    if (!node) return '';
    switch (node.type) {
      case 'NumLit': return String(node.value);
      case 'StrLit': return node.js;
      case 'BoolLit': return node.value ? this.c.trueLit : this.c.falseLit;
      case 'NullLit': case 'UndefinedLit': return this.c.nullLit;
      case 'ThisLit': this.bad('«هذا» خارج صنف (غير مدعوم هنا)', node); return this.c.nullLit;
      case 'Id': return node.name;
      case 'ArrayLit': {
        const els = node.elements.map((e) => {
          const k = this.kindOf(e);
          if (k === 'str') { this.bad('قائمة نصوص — قوائم هذا المخرج عددية', e); return '0'; }
          if (e.type === 'Spread') return this.expr(e.arg);
          return this.lang === 'go' ? this.expr(e) : this.expr(e);
        });
        return this.c.arrayLit(els);
      }
      case 'ObjectLit': this.bad('كائن/قاموس', node); return this.c.nullLit;
      case 'Member': {
        if (!node.computed && node.property === 'length') {
          const k = this.kindOf(node.object);
          if (k === 'str') return this.lang === 'go' ? `float64(len(${this.expr(node.object)}))` : this.lang === 'java' ? `${this.expr(node.object)}.length()` : this.lang === 'cs' ? `${this.expr(node.object)}.Length` : `${this.expr(node.object)}.len() as f64`;
          return this.lang === 'java' || this.lang === 'cs' ? `${this.expr(node.object)}.size()` : `_ز_طول(${this.expr(node.object)})`;
        }
        if (node.computed) return `${this.expr(node.object)}[${this.expr(node.property)}]`;
        return this.bad(`خاصية «${node.property}»`, node) || this.c.nullLit;
      }
      case 'Index': return `${this.expr(node.object)}[${this.expr(node.property)}]`;
      case 'Bin': case 'Logical': return this.bin(node);
      case 'Unary': {
        if (node.op === 'typeof') { this.bad('«نوع» (typeof)', node); return '"number"'; }
        if (node.op === 'delete') { this.bad('«احذف»', node); return this.c.nullLit; }
        return node.op === '!' ? `!${this.expr(node.arg)}` : `${node.op}${this.expr(node.arg)}`;
      }
      case 'Update': return node.prefix ? `${node.op}${this.expr(node.arg)}` : `${this.expr(node.arg)}${node.op}`;
      case 'Assign': return `${this.expr(node.target)} ${node.op} ${this.expr(node.value)}`;
      case 'Conditional': {
        const kind = this.kindOf(node.consequent);
        const type = this.lang === 'go' ? this.typeOf(kind) : '';
        if (this.lang === 'go') {
          return `func() ${type} { if ${this.expr(node.test)} { return ${this.expr(node.consequent)} }; return ${this.expr(node.alternate)} }()`;
        }
        if (this.lang === 'rs') return `if ${this.expr(node.test)} { ${this.expr(node.consequent)} } else { ${this.expr(node.alternate)} }`;
        return `(${this.expr(node.test)} ? ${this.expr(node.consequent)} : ${this.expr(node.alternate)})`;
      }
      case 'New': this.bad('«جديد» (بلا أصناف في هذا المخرج)', node); return this.c.nullLit;
      case 'Call': return this.call(node);
      case 'Arrow': this.bad('دالة سهمية داخل تعبير', node); return '0';
      case 'FuncExpr': this.bad('دالة داخل تعبير', node); return '0';
      case 'Await': this.bad('«انتظر» (await)', node); return this.expr(node.arg);
      case 'Spread': return this.expr(node.arg);
      default: this.bad(`تعبير ${node.type}`, node); return '0';
    }
  }

  bin(node) {
    if (node.op === '+' && this.isStr(node)) return this.concat(node);
    const map = { '===': '==', '!==': '!=', '&&': ' && ', '||': ' || ' };
    const op = map[node.op] || node.op;
    if (node.op === '**') { this.bad('الأس «**»', node); return `${this.expr(node.left)} * ${this.expr(node.right)}`; }
    return `(${this.expr(node.left)}${op}${this.expr(node.right)})`;
  }

  concat(node) {
    const parts = [];
    const walk = (n) => {
      if (n.type === 'Bin' && n.op === '+' && this.isStr(n)) { walk(n.left); walk(n.right); return; }
      parts.push(n);
    };
    walk(node);
    const pieces = parts.map((p) => this.asText(p));
    return pieces.reduce((a, b) => this.c.concat(a, b));
  }

  /** الدوال المدمجة التي تُصبح تعليمة (اطبع، أضف، رتب) */
  macroStatement(node) {
    const name = node.callee.name;
    const args = node.args.map((a) => this.expr(a));
    switch (name) {
      case 'اطبع': {
        if (!args.length) return `_ز_طبع("");`;
        const texted = node.args.map((a) => this.asText(a));
        return `_ز_طبع(${texted.reduce((a, b) => this.c.concat(a, b))});`;
      }
      case 'أضف': {
        if (this.lang === 'go') return `${args[0]} = append(${args[0]}, ${args[1]});`;
        if (this.lang === 'rs') return `${args[0]}.push(${args[1]});`;
        return `${args[0]}.add(${args[1]});`;
      }
      case 'رتب': return `_ز_رتب(${args[0]});`;
      default: return null;
    }
  }

  call(node) {
    const args = node.args.map((a) => this.expr(a));
    if (node.callee.type === 'Id') {
      const name = node.callee.name;
      const macro = MACROS[name];
      if (macro && (macro.arity === null || args.length === macro.arity)) {
        switch (name) {
          case 'اطبع': return this.emitPrint(node) || '""';
          case 'طول': {
            const k = this.kindOf(node.args[0]);
            if (k === 'str') return this.lang === 'go' ? `float64(len(${args[0]}))` : this.lang === 'java' ? `${args[0]}.length()` : this.lang === 'cs' ? `${args[0]}.Length` : `${args[0]}.len() as f64`;
            return this.lang === 'java' || this.lang === 'cs' ? `${args[0]}.size()` : `_ز_طول(${args[0]})`;
          }
          case 'أضف': {
            if (this.lang === 'go') return `append(${args[0]}, ${args[1]})`;
            if (this.lang === 'rs') return `${args[0]}.push(${args[1]})`;
            return `${args[0]}.add(${args[1]})`;
          }
          case 'رتب': { this.unsupported.push({ kind: 'رتب داخل تعبير (اكتبها سطرًا)', line: node.line }); return args[0]; }
          case 'نص': return this.asText(node.args[0]);
          case 'عدد': return this.kindOf(node.args[0]) === 'str' ? (this.lang === 'go' ? `__تحويل_عدد(${args[0]})` : this.lang === 'rs' ? `${args[0]}.parse::<f64>().unwrap()` : this.lang === 'cs' ? `double.Parse(${args[0]})` : `Double.parseDouble(${args[0]})`) : args[0];
          case 'منطقي': return this.kindOf(node.args[0]) === 'str' ? `(${args[0]}.length() > 0)` : `(${args[0]} != 0)`;
          case 'يحتوي': return this.kindOf(node.args[0]) === 'str' ? `${args[0]}.contains(${args[1]})` : `_ز_يحتوي(${args[0]}, ${args[1]})`;
          case 'انضم': return this.lang === 'go' ? `_ز_انضم(${args[0]}, ${args[1]})` : `_ز_انضم(${args[0]}, ${args[1]})`;
          case 'اقسم': case 'استبدل': case 'مفاتيح': case 'قيم':
            this.bad(`الدالة «${name}» في هذا المخرج`, node);
            return args[0] || '""';
          default: break;
        }
      }
      return `${name}(${args.join(', ')})`;
    }
    if (node.callee.type === 'Member') {
      const m = node.callee;
      const obj = this.expr(m.object);
      const prop = m.computed ? null : m.property;
      if (prop === 'push') return this.lang === 'go' ? `append(${obj}, ${args[0]})` : `${obj}.push(${args[0]})`;
      if (prop === 'includes') return this.kindOf(m.object) === 'str' ? `${obj}.contains(${args[0]})` : `_ز_يحتوي(${obj}, ${args[0]})`;
      if (prop === 'map' || prop === 'filter' || prop === 'forEach') { this.bad(`«${prop}» — اكتبها حلقة «لكل» في زيتونة`, node); return obj; }
      if (prop === 'split' || prop === 'join') { this.bad(`«${prop}» في هذا المخرج`, node); return obj; }
      if (prop === 'toUpperCase') return `${obj}.toUpperCase()`;
      if (prop === 'toLowerCase') return `${obj}.toLowerCase()`;
      if (prop === 'trim') return `${obj}${this.lang === 'go' ? '' : '()'}`;
      this.bad(`نداء «${prop || '؟'}» على كائن`, node);
      return obj;
    }
    return `${this.expr(node.callee)}(${args.join(', ')})`;
  }

  emitPrint(node) {
    const texted = node.args.map((a) => this.asText(a));
    return texted.length ? texted.reduce((a, b) => this.c.concat(a, b)) : '""';
  }
}

function emitTyped(ast, lang, opts = {}) {
  if (!CFG[lang]) throw new Error(`لغة غير معروفة في عائلة الأقواس: ${lang}`);
  return new TypedEmitter(ast, lang).run();
}

module.exports = { emitTyped, TYPED_LANGS: Object.keys(CFG) };
