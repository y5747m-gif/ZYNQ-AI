'use strict';

// ==========================================================================
//  زيتونة — المترجم: شجرة عربية (AST) → جافاسكربت + خريطة أسطر
//  الترجمة حتمية 1:1، والتعليقات العربية تُنقل كما هي (خروج بلا قفل).
// ==========================================================================

const { MACROS } = require('./dictionary');
const { ZError } = require('./errors');

const PREC = {
  '||': 1, '&&': 2,
  '===': 3, '!==': 3,
  '<': 4, '>': 4, '<=': 4, '>=': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '%': 6,
  '**': 7,
};
const RIGHT_ASSOC = new Set(['**']);

class Emitter {
  constructor() {
    this.lines = [];
    this.map = [];
    this.indent = 0;
    this.commentIdx = 0;
  }
  pad() { return '  '.repeat(this.indent); }
  push(text, arLine = null) {
    this.lines.push(this.pad() + text);
    this.map.push({ jsLine: this.lines.length, arLine });
  }
  /** يطبع التعليقات المعلّقة قبل سطر معيّن (حفاظًا على التعليقات العربية) */
  flushComments(beforeLine, comments) {
    if (!comments) return;
    while (this.commentIdx < comments.length && comments[this.commentIdx].line < beforeLine) {
      const c = comments[this.commentIdx++];
      if (c.block) this.push(`/*${c.text}*/`, c.line);
      else if (c.text.startsWith('#')) this.push(`//${c.text.slice(1)}`, c.line);
      else this.push(c.text, c.line);
    }
  }
  flushRest(comments) {
    if (!comments) return;
    while (this.commentIdx < comments.length) {
      const c = comments[this.commentIdx++];
      if (c.block) this.push(`/*${c.text}*/`, c.line);
      else if (c.text.startsWith('#')) this.push(`//${c.text.slice(1)}`, c.line);
      else this.push(c.text, c.line);
    }
  }
}

function precOf(node) {
  if (!node) return 99;
  if (node.type === 'Bin' || node.type === 'Logical') return PREC[node.op] ?? 99;
  return 99;
}

class Transpiler {
  constructor(ast) {
    this.ast = ast;
    this.em = new Emitter();
  }

  run() {
    const { body, comments } = this.ast;
    for (const stmt of body) {
      this.em.flushComments(stmt.line, comments);
      this.emitStatement(stmt);
    }
    this.em.flushRest(comments);
    const code = this.em.lines.join('\n') + '\n';
    return { code, map: this.em.map };
  }

  // ---------- عبارات ----------
  emitStatement(node) {
    switch (node.type) {
      case 'VarDecl': return this.em.push(this.varDeclInline(node) + ';', node.line);
      case 'FuncDecl': return this.emitFuncDecl(node);
      case 'ClassDecl': return this.emitClass(node);
      case 'IfStmt': return this.emitIf(node);
      case 'WhileStmt': return this.emitWhile(node);
      case 'ForStmt': return this.emitFor(node);
      case 'ForOfStmt': return this.emitForOf(node);
      case 'SwitchStmt': return this.emitSwitch(node);
      case 'ReturnStmt':
        return this.em.push(`return${node.argument ? ' ' + this.expr(node.argument) : ''};`, node.line);
      case 'BreakStmt': return this.em.push('break;', node.line);
      case 'ContinueStmt': return this.em.push('continue;', node.line);
      case 'ThrowStmt': return this.em.push(`throw ${this.expr(node.argument)};`, node.line);
      case 'TryStmt': return this.emitTry(node);
      case 'ImportStmt': return this.emitImport(node);
      case 'ExportStmt': return this.emitExport(node);
      case 'Block':
        this.em.push('{', node.line);
        this.emitBody(node.body);
        this.em.push('}', node.line);
        return;
      case 'ExprStmt': return this.em.push(this.expr(node.expr) + ';', node.line);
      default:
        throw new ZError('Z090', `عقدة غير مدعومة في الترجمة: ${node.type}`, node.line || 1, 1);
    }
  }

  emitBody(body) {
    this.em.indent++;
    for (const stmt of body) {
      this.em.flushComments(stmt.line, this.ast.comments);
      this.emitStatement(stmt);
    }
    this.em.indent--;
  }

  varDeclInline(node) {
    const parts = node.decls.map((d) => `${d.name}${d.init ? ' = ' + this.expr(d.init) : ''}`);
    return `${node.kind} ${parts.join(', ')}`;
  }

  emitFuncDecl(node) {
    const prefix = `${node.exported ? 'export ' : ''}${node.async ? 'async ' : ''}function ${node.name}(${node.params.join(', ')}) {`;
    this.em.push(prefix, node.line);
    this.emitBody(node.body.body);
    this.em.push('}', node.line);
  }

  emitClass(node) {
    const head = `${node.exported ? 'export ' : ''}class ${node.name}${node.superClass ? ' extends ' + node.superClass : ''} {`;
    this.em.push(head, node.line);
    this.em.indent++;
    for (const m of node.members) {
      this.em.flushComments(m.line, this.ast.comments);
      if (m.kind === 'constructor') {
        this.em.push(`constructor(${m.params.join(', ')}) {`, m.line);
        this.emitBody(m.body.body);
        this.em.push('}', m.line);
      } else if (m.kind === 'method') {
        this.em.push(`${m.isStatic ? 'static ' : ''}${m.name}(${m.params.join(', ')}) {`, m.line);
        this.emitBody(m.body.body);
        this.em.push('}', m.line);
      } else {
        this.em.push(`${m.isStatic ? 'static ' : ''}${m.name} = ${this.expr(m.value)};`, m.line);
      }
    }
    this.em.indent--;
    this.em.push('}', node.line);
  }

  emitIf(node) {
    let cur = node;
    this.em.push(`if (${this.expr(cur.test)}) {`, cur.line);
    this.emitBody(cur.consequent.body);
    while (cur.alternate && cur.alternate.type === 'IfStmt') {
      cur = cur.alternate;
      this.em.push(`} else if (${this.expr(cur.test)}) {`, cur.line);
      this.emitBody(cur.consequent.body);
    }
    if (cur.alternate) {
      this.em.push('} else {', cur.line);
      this.emitBody(cur.alternate.body);
    }
    this.em.push('}', node.line);
  }

  /** اختر/حالة → switch/case (كل حالة داخل كتلة {} لتفادي تسرّب النطاق) */
  emitSwitch(node) {
    this.em.push(`switch (${this.expr(node.discriminant)}) {`, node.line);
    this.em.indent++;
    for (const c of node.cases) {
      this.em.flushComments(c.line, this.ast.comments);
      this.em.push(c.test === null ? 'default:' : `case ${this.expr(c.test)}:`, c.line);
      this.em.indent++;
      this.em.push('{', c.line);
      this.emitBody(c.body);
      this.em.push('}', c.line);
      this.em.indent--;
    }
    this.em.indent--;
    this.em.push('}', node.line);
  }

  emitWhile(node) {
    this.em.push(`while (${this.expr(node.test)}) {`, node.line);
    this.emitBody(node.body.body);
    this.em.push('}', node.line);
  }

  emitFor(node) {
    const init = node.init
      ? (node.init.type === 'VarDecl' ? this.varDeclInline(node.init) : this.expr(node.init))
      : '';
    const test = node.test ? this.expr(node.test) : '';
    const update = node.update ? this.expr(node.update) : '';
    this.em.push(`for (${init}; ${test}; ${update}) {`, node.line);
    this.emitBody(node.body.body);
    this.em.push('}', node.line);
  }

  emitForOf(node) {
    this.em.push(`for (const ${node.name} of ${this.expr(node.iterable)}) {`, node.line);
    this.emitBody(node.body.body);
    this.em.push('}', node.line);
  }

  emitTry(node) {
    this.em.push('try {', node.line);
    this.emitBody(node.block.body);
    if (node.handler) {
      this.em.push(`} catch (${node.param || 'خطأ_غير_مسمى'}) {`, node.line);
      this.emitBody(node.handler.body);
    }
    if (node.finalizer) {
      this.em.push('} finally {', node.line);
      this.emitBody(node.finalizer.body);
    }
    this.em.push('}', node.line);
  }

  emitImport(node) {
    const parts = [];
    const def = node.specifiers.find((s) => s.kind === 'default');
    const ns = node.specifiers.find((s) => s.kind === 'namespace');
    const named = node.specifiers.filter((s) => s.kind === 'named');
    if (def) parts.push(def.local);
    if (ns) parts.push(`* as ${ns.local}`);
    if (named.length) parts.push(`{ ${named.map((s) => (s.imported === s.local ? s.local : `${s.imported} as ${s.local}`)).join(', ')} }`);
    const prefix = parts.length ? `${parts.join(', ')} from ` : '';
    this.em.push(`import ${prefix}${node.source};`, node.line);
  }

  emitExport(node) {
    if (node.variant === 'default') {
      this.em.push(`export default ${this.expr(node.declaration)};`, node.line);
      return;
    }
    if (node.variant === 'named') {
      const list = node.specifiers.map((s) => (s.local === s.exported ? s.local : `${s.local} as ${s.exported}`)).join(', ');
      const from = node.source ? ` from ${node.source}` : '';
      this.em.push(`export { ${list} }${from};`, node.line);
    }
  }

  // ---------- تعبيرات ----------
  expr(node, parentPrec = 0, isRight = false) {
    const out = this.exprRaw(node, parentPrec, isRight);
    return out;
  }

  exprRaw(node, parentPrec, isRight) {
    switch (node.type) {
      case 'NumLit': return node.value;
      case 'StrLit': return node.js;
      case 'BoolLit': return node.value ? 'true' : 'false';
      case 'NullLit': return 'null';
      case 'UndefinedLit': return 'undefined';
      case 'ThisLit': return 'this';
      case 'Id': return node.name;
      case 'Member': return `${this.expr(node.object, 99)}${node.computed ? `[${this.expr(node.property)}]` : `.${node.property}`}`;
      case 'Call': return this.call(node);
      case 'New': return `new ${this.expr(node.callee, 99)}(${node.args.map((a) => this.expr(a)).join(', ')})`;
      case 'ArrayLit': return `[${node.elements.map((e) => this.expr(e)).join(', ')}]`;
      case 'ObjectLit':
        return `{ ${node.properties.map((p) => p.spread ? `...${this.expr(p.value)}` : (p.shorthand ? p.key : `${p.computed ? `[${this.expr(p.key)}]` : /^[A-Za-z_$][\w$]*$/.test(p.key) ? p.key : JSON.stringify(p.key)}: ${this.expr(p.value)}`)).join(', ')} }`;
      case 'Arrow': {
        const body = node.expression ? this.expr(node.body) : `{ ${this.emitArrowBlock(node.body.body)} }`;
        return `(${node.params.join(', ')}) => ${body}`;
      }
      case 'FuncExpr': {
        const name = node.name ? ` ${node.name}` : '';
        return `${node.async ? 'async ' : ''}function${name}(${node.params.join(', ')}) { ${this.emitArrowBlock(node.body.body)} }`;
      }
      case 'Await': return `await ${this.expr(node.arg, 8)}`;
      case 'Unary': {
        if (node.op === 'typeof') return `typeof ${this.expr(node.arg, 8)}`;
        if (node.op === 'delete') return `delete ${this.expr(node.arg, 8)}`;
        return `${node.op}${this.expr(node.arg, 8)}`;
      }
      case 'Spread': return `...${this.expr(node.arg, 8)}`;
      case 'Super': return 'super';
      case 'Update': return node.prefix ? `${node.op}${this.expr(node.arg, 99)}` : `${this.expr(node.arg, 99)}${node.op}`;
      case 'Assign': return `${this.expr(node.target, 8)} ${node.op} ${this.expr(node.value, 8, true)}`;
      case 'Conditional': {
        const s = `${this.expr(node.test, 3)} ? ${this.expr(node.consequent, 3)} : ${this.expr(node.alternate, 3)}`;
        return parentPrec > 2 ? `(${s})` : s;
      }
      case 'Bin': case 'Logical': {
        const p = PREC[node.op] ?? 99;
        const rightAssoc = RIGHT_ASSOC.has(node.op);
        const leftPrec = rightAssoc ? p + 1 : p;
        const rightPrec = rightAssoc ? p : p + 1;
        const text = `${this.expr(node.left, leftPrec)} ${node.op} ${this.expr(node.right, rightPrec)}`;
        return p < parentPrec ? `(${text})` : text;
      }
      default:
        throw new ZError('Z091', `تعبير غير مدعوم في الترجمة: ${node.type}`, node.line || 1, 1);
    }
  }

  emitArrowBlock(body) {
    const sub = new Transpiler({ body, comments: this.ast.comments });
    for (const stmt of body) { sub.em.flushComments(stmt.line, this.ast.comments); sub.emitStatement(stmt); }
    return sub.em.lines.map((l) => l.trim()).join(' ');
  }

  /** نداء: يحوّل الدوال العربية المدمجة (اطبع، طول، أضف، …) إلى ما يقابلها */
  call(node) {
    if (node.callee.type === 'Id' && MACROS[node.callee.name]) {
      const macro = MACROS[node.callee.name];
      if (macro.arity === null || node.args.length === macro.arity) {
        return macro.js(node.args.map((a) => this.expr(a)));
      }
    }
    return `${this.expr(node.callee, 99)}(${node.args.map((a) => this.expr(a)).join(', ')})`;
  }
}

function transpile(ast) {
  return new Transpiler(ast).run();
}

module.exports = { transpile, Emitter };
