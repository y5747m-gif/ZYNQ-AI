'use strict';

// ==========================================================================
//  زيتونة — المُحلِّل النحوي (Parser) → شجرة برامج عربية (AST)
//  الفاصلة المنقوطة اختيارية (نهاية السطر تكفي)، والكلمات المفتاحية عربية.
// ==========================================================================

const { Lexer } = require('./lexer');
const { ZError, diag } = require('./errors');
const { suggestKeyword } = require('./dictionary');

class Parser {
  constructor(tokens, opts = {}) {
    this.tokens = tokens;
    this.pos = 0;
    this.diagnostics = opts.diagnostics || [];
    this.comments = opts.comments || [];
    this.prevToken = null;
  }

  // ---------- أدوات ----------
  tok(off = 0) { return this.tokens[this.pos + off] || this.tokens[this.tokens.length - 1]; }
  next() { const t = this.tok(); this.pos++; this.prevToken = t; return t; }
  eof() { return this.tok().type === 'eof'; }
  isKw(word, off = 0) { const t = this.tok(off); return t.type === 'kw' && t.ar === word; }
  isPunc(v, off = 0) { const t = this.tok(off); return t.type === 'punc' && t.value === v; }
  isOp(v, off = 0) { const t = this.tok(off); return (t.type === 'op' || t.type === 'punc') && t.value === v; }

  fail(code, message, token = this.tok(), extra = {}) {
    throw new ZError(code, message, token.line, token.col, extra);
  }
  expectPunc(v, what) {
    if (this.isPunc(v)) return this.next();
    const t = this.tok();
    if (t.type === 'id' || t.type === 'kw') {
      const sug = suggestKeyword(t.raw || t.value);
      if (sug) this.fail('Z011', `متوقّع «${v}» قبل «${t.raw}» — هل تقصد الكلمة المفتاحية «${sug}»؟`,
        t, { suggestion: `«${sug}»` });
    }
    this.fail('Z011', `متوقّع «${v}» ${what ? '— ' + what : ''} لكن وجدنا «${t.raw ?? t.value}».`, t, { suggestion: `أضف ${v}` });
  }
  expectKw(word, what) {
    if (this.isKw(word)) return this.next();
    const t = this.tok();
    this.fail('Z012', `متوقّع كلمة «${word}»${what ? ' ' + what : ''} لكن وجدنا «${t.raw ?? t.value}».`, t);
  }
  expectId(what) {
    const t = this.tok();
    if (t.type === 'id') { this.next(); return t.value; }
    if (t.type === 'kw') {
      // كلمة مفتاحية في موضع اسم = خطأ مفهوم مع اقتراح
      const sug = suggestKeyword(t.raw);
      this.fail('Z013', `متوقّع ${what || 'اسمًا'}، لكن «${t.raw}» كلمة محجوزة في اللغة${sug ? ` (هل تقصد «${sug}»؟)` : ''}.`,
        t, { suggestion: 'اختر اسمًا آخر لا تبدأ به الكلمة المفتاحية' });
    }
    this.fail('Z013', `متوقّع ${what || 'اسمًا'} لكن وجدنا «${t.raw ?? t.value}».`, t);
  }

  /** نهاية عبارة: فاصلة منقوطة صريحة أو نهاية سطر (اختيارية) */
  endStatement() {
    if (this.isPunc(';')) { this.next(); return; }
    const prev = this.prevToken;
    const nx = this.tok();
    if (nx.type === 'eof' || this.isPunc('}')) return;
    if (prev && nx.line > prev.line) return; // نهاية السطر تكفي
    this.fail('Z010', 'تعبير غير مكتمل — ربما نسيت فاصلة منقوطة «;» أو أن السطر مقطوع.',
      nx, { suggestion: 'أكمل التعبير أو أضف «;»', hint: 'الفاصلة المنقوطة اختيارية في زيتونة إذا انتهى السطر' });
  }

  // ---------- البرنامج ----------
  parseProgram() {
    const body = [];
    while (!this.eof()) body.push(this.parseStatement());
    return { type: 'Program', body, comments: this.comments };
  }

  parseStatement() {
    const t = this.tok();

    if (t.type === 'kw') {
      switch (t.ar) {
        case 'متغير': case 'ثابت': return this.parseVarDecl();
        case 'دالة': return this.parseFuncDecl(false, false);
        case 'غير_متزامن': {
          if (this.isKw('دالة', 1)) { this.next(); return this.parseFuncDecl(false, true); }
          break;
        }
        case 'صنف': return this.parseClassDecl(false);
        case 'إذا': return this.parseIf();
        case 'طالما': return this.parseWhile();
        case 'كرر': return this.parseFor();
        case 'اختر': return this.parseSwitch();
        case 'لكل': return this.parseForOf();
        case 'أرجع': {
          this.next();
          let argument = null;
          if (!this.isPunc(';') && !this.isPunc('}') && this.tok().line === t.line) argument = this.parseExpr();
          this.endStatement();
          return { type: 'ReturnStmt', argument, line: t.line };
        }
        case 'كسر': this.next(); this.endStatement(); return { type: 'BreakStmt', line: t.line };
        case 'استمر': this.next(); this.endStatement(); return { type: 'ContinueStmt', line: t.line };
        case 'ارفع': {
          this.next();
          const argument = this.parseExpr();
          this.endStatement();
          return { type: 'ThrowStmt', argument, line: t.line };
        }
        case 'جرب': return this.parseTry();
        case 'استورد': return this.parseImport();
        case 'صدّر': return this.parseExport();
        default: break;
      }
    }
    if (this.isPunc('{')) return this.parseBlock();
    const expr = this.parseExpr();
    // «طالم (…) { }» — كلمة قريبة من كلمة مفتاحية: اقتراح مباشر بدل «تعبير غير مكتمل»
    if (t.type === 'id' && this.isPunc('{') && expr.type === 'Call' && expr.callee.type === 'Id') {
      const sug = suggestKeyword(expr.callee.name);
      if (sug) {
        this.fail('Z020', `«${expr.callee.name}» ليست كلمة مفتاحية — هل تقصد «${sug}»؟`, t,
          { suggestion: `اكتب «${sug}» بدلًا من «${expr.callee.name}»` });
      }
    }
    this.endStatement();
    return { type: 'ExprStmt', expr, line: t.line };
  }

  /**
   * اختر (تعبير) {
   *   حالة 1: …
   *   حالة 2: …
   *   غير_ذلك: …
   * }
   */
  parseSwitch() {
    const t = this.next(); // اختر
    const open = this.expectPunc('(', 'شرط الاختيار');
    const discriminant = this.parseExpr();
    this.expectPunc(')', 'إغلاق شرط الاختيار');
    this.expectPunc('{', 'بداية كتلة الاختيار');
    const cases = [];
    while (!this.eof() && !this.isPunc('}')) {
      let test = null;
      let caseLine = this.tok().line;
      if (this.isKw('حالة')) {
        caseLine = this.next().line;
        test = this.parseExpr();
      } else if (this.isKw('غير_ذلك')) {
        this.next();
      } else {
        this.fail('Z024', `متوقّع «حالة» أو «غير_ذلك» داخل «اختر»، لكن وجدنا «${this.tok().raw ?? this.tok().value}».`, this.tok(),
          { suggestion: 'اكتب «حالة قيمة:» أو «غير_ذلك:»' });
      }
      this.expectPunc(':', 'بعد «حالة قيمة» أو «غير_ذلك»');
      const body = [];
      while (!this.eof() && !this.isPunc('}') && !this.isKw('حالة') && !this.isKw('غير_ذلك')) {
        body.push(this.parseStatement());
      }
      cases.push({ test, body, line: caseLine });
    }
    this.expectPunc('}', 'إغلاق كتلة الاختيار');
    return { type: 'SwitchStmt', discriminant, cases, line: t.line };
  }

  parseBlock() {
    const t = this.expectPunc('{', 'بداية كتلة');
    const body = [];
    while (!this.eof() && !this.isPunc('}')) body.push(this.parseStatement());
    this.expectPunc('}', 'نهاية الكتلة');
    return { type: 'Block', body, line: t.line };
  }

  parseVarDecl(exported = false, inFor = false) {
    const t = this.next(); // متغير/ثابت
    const kind = t.ar === 'ثابت' ? 'const' : 'let';
    const decls = [];
    for (;;) {
      const nameToken = this.tok();
      const name = this.expectId('اسمًا للمتغيّر');
      let init = null;
      if (this.isOp('=')) { this.next(); init = this.parseExpr(); }
      else if (kind === 'const') {
        this.fail('Z014', `الثابت «${name}» بلا قيمة — «ثابت» يجب أن يُسند عند التعريف.`,
          nameToken, { suggestion: `اكتب: ثابت ${name} = …` });
      }
      decls.push({ name, init, line: nameToken.line });
      if (this.isPunc(',')) { this.next(); continue; }
      break;
    }
    if (!inFor) this.endStatement();
    return { type: 'VarDecl', kind, decls, exported, line: t.line };
  }

  parseFuncDecl(exported = false, async = false) {
    const t = this.next(); // دالة
    const name = this.expectId('اسمًا للدالة');
    const params = this.parseParams();
    const body = this.parseBlock();
    return { type: 'FuncDecl', name, params, body, async, exported, line: t.line };
  }

  parseParams() {
    this.expectPunc('(', 'قائمة معاملات');
    const params = [];
    while (!this.eof() && !this.isPunc(')')) {
      const rest = this.isKw('انشر');
      if (rest) this.next();
      const name = this.expectId('اسم معامل');
      if (rest) {
        if (params.length) this.fail('Z025', '«انشر» (المعامل الباقي) يجب أن يكون آخر المعاملات.', this.tok());
        params.push('...' + name);
        break;
      }
      params.push(name);
      if (this.isPunc(',')) this.next();
      else break;
    }
    this.expectPunc(')', 'إغلاق قائمة المعاملات');
    return params;
  }

  parseClassDecl(exported = false) {
    const t = this.next(); // صنف
    const name = this.expectId('اسمًا للصنف');
    let superClass = null;
    if (this.isKw('موسع')) { this.next(); superClass = this.expectId('اسم الصنف الأب'); }
    this.expectPunc('{', 'بداية جسم الصنف');
    const members = [];
    while (!this.eof() && !this.isPunc('}')) members.push(this.parseClassMember());
    this.expectPunc('}', 'نهاية جسم الصنف');
    return { type: 'ClassDecl', name, superClass, members, exported, line: t.line };
  }

  parseClassMember() {
    const t = this.tok();
    let isStatic = false;
    if (this.isKw('ساكن')) { this.next(); isStatic = true; }
    if (this.isKw('منشئ')) {
      this.next();
      const params = this.parseParams();
      const body = this.parseBlock();
      return { type: 'ClassMember', kind: 'constructor', name: 'constructor', params, body, isStatic, line: t.line };
    }
    if (this.isKw('دالة')) {
      this.next();
      const name = this.expectId('اسمًا للدالة');
      const params = this.parseParams();
      const body = this.parseBlock();
      return { type: 'ClassMember', kind: 'method', name, params, body, isStatic, line: t.line };
    }
    const name = this.expectId('اسمًا لعضو الصنف');
    this.expectPunc('=', 'إسناد قيمة للعضو');
    const value = this.parseExpr();
    this.endStatement();
    return { type: 'ClassMember', kind: 'field', name, value, isStatic, line: t.line };
  }

  parseIf() {
    const t = this.next();
    this.expectPunc('(', 'شرط');
    const test = this.parseExpr();
    this.expectPunc(')', 'إغلاق الشرط');
    const consequent = this.parseBlockOrStatement();
    let alternate = null;
    if (this.isKw('وإلا')) {
      this.next();
      alternate = this.isKw('إذا') ? this.parseIf() : this.parseBlockOrStatement();
    }
    return { type: 'IfStmt', test, consequent, alternate, line: t.line };
  }

  parseBlockOrStatement() {
    if (this.isPunc('{')) return this.parseBlock();
    return this.parseStatement();
  }

  parseWhile() {
    const t = this.next();
    this.expectPunc('(', 'شرط الحلقة');
    const test = this.parseExpr();
    this.expectPunc(')', 'إغلاق الشرط');
    const body = this.parseBlockOrStatement();
    return { type: 'WhileStmt', test, body, line: t.line };
  }

  parseFor() {
    const t = this.next();
    this.expectPunc('(', 'رأس الحلقة');
    let init = null;
    if (!this.isPunc(';')) {
      init = (this.isKw('متغير') || this.isKw('ثابت')) ? this.parseVarDecl(false, true) : this.parseExpr();
      if (!this.isPunc(';')) this.expectPunc(';', 'فاصل رأس الحلقة');
    }
    if (this.isPunc(';')) this.next();
    let test = null;
    if (!this.isPunc(';')) test = this.parseExpr();
    this.expectPunc(';', 'فاصل رأس الحلقة');
    let update = null;
    if (!this.isPunc(')')) update = this.parseExpr();
    this.expectPunc(')', 'إغلاق رأس الحلقة');
    const body = this.parseBlockOrStatement();
    return { type: 'ForStmt', init, test, update, body, line: t.line };
  }

  parseForOf() {
    const t = this.next(); // لكل
    const paren = this.isPunc('(');
    if (paren) this.next();
    const name = this.expectId('اسم عنصر الحلقة');
    this.expectKw('في', 'لكتابة: لكل عنصر في القائمة');
    const iterable = this.parseExpr();
    if (paren) this.expectPunc(')', 'إغلاق رأس الحلقة');
    const body = this.parseBlockOrStatement();
    return { type: 'ForOfStmt', name, iterable, body, line: t.line };
  }

  parseTry() {
    const t = this.next();
    const block = this.parseBlock();
    let param = null, handler = null, finalizer = null;
    if (this.isKw('التقط')) {
      this.next();
      if (this.isPunc('(')) { this.next(); param = this.expectId('اسم الخطأ'); this.expectPunc(')', 'إغلاق'); }
      handler = this.parseBlock();
    }
    if (this.isKw('أخيرًا')) { this.next(); finalizer = this.parseBlock(); }
    if (!handler && !finalizer) {
      this.fail('Z015', '«جرب» بلا «التقط» أو «أخيرًا» — لا معنى لها.', t,
        { suggestion: 'أضف «التقط (خطأ) { … }» أو «أخيرًا { … }»' });
    }
    return { type: 'TryStmt', block, param, handler, finalizer, line: t.line };
  }

  parseImport() {
    const t = this.next();
    const specifiers = [];
    let source;
    if (this.tok().type === 'str') {
      source = this.next().js;
    } else {
      // استورد اسم … أو استورد * كـ اسم … أو استورد { … }
      if (this.tok().type === 'id') {
        const local = this.next().value;
        specifiers.push({ kind: 'default', local, imported: 'default' });
        if (this.isPunc(',')) this.next();
      }
      if (this.isOp('*')) {
        this.next();
        this.expectKw('كـ', 'لكتابة: استورد * كـ اسم');
        const local = this.expectId('اسمًا بديلًا');
        specifiers.push({ kind: 'namespace', local, imported: '*' });
      } else if (this.isPunc('{')) {
        this.next();
        while (!this.eof() && !this.isPunc('}')) {
          const imported = this.expectId('اسمًا مُستوردًا');
          let local = imported;
          if (this.isKw('كـ')) { this.next(); local = this.expectId('اسمًا بديلًا'); }
          specifiers.push({ kind: 'named', local, imported });
          if (this.isPunc(',')) this.next();
        }
        this.expectPunc('}', 'إغلاق قائمة الاستيراد');
      }
      this.expectKw('من', 'لكتابة: استورد … من "المسار"');
      if (this.tok().type !== 'str') this.fail('Z016', 'متوقّع مسارًا نصيًا بعد «من».', this.tok());
      source = this.next().js;
    }
    this.endStatement();
    return { type: 'ImportStmt', specifiers, source, line: t.line };
  }

  parseExport() {
    const t = this.next();
    if (this.isKw('افتراضي')) {
      this.next();
      const declaration = this.parseExpr();
      this.endStatement();
      return { type: 'ExportStmt', variant: 'default', declaration, line: t.line };
    }
    if (this.isKw('دالة')) return this.parseFuncDecl(true, false);
    if (this.isKw('صنف')) return this.parseClassDecl(true);
    if (this.isKw('متغير') || this.isKw('ثابت')) return this.parseVarDecl(true);
    if (this.isPunc('{')) {
      this.next();
      const specifiers = [];
      while (!this.eof() && !this.isPunc('}')) {
        const local = this.expectId('اسمًا للتصدير');
        let exported = local;
        if (this.isKw('كـ')) { this.next(); exported = this.expectId('اسمًا بديلًا'); }
        specifiers.push({ local, exported });
        if (this.isPunc(',')) this.next();
      }
      this.expectPunc('}', 'إغلاق قائمة التصدير');
      let source = null;
      if (this.isKw('من')) { this.next(); source = this.next().js; }
      this.endStatement();
      return { type: 'ExportStmt', variant: 'named', specifiers, source, line: t.line };
    }
    this.fail('Z017', '«صدّر» يجب أن تتبعها دالة أو صنف أو متغيّر أو ثابت أو قائمة أسماء.', this.tok());
  }

  // ---------- التعبيرات (تدرّج الأسبقية) ----------
  parseExpr() { return this.parseAssign(); }

  parseAssign() {
    const left = this.parseConditional();
    const t = this.tok();
    const assignOps = ['=', '+=', '-=', '*=', '/=', '%='];
    if ((t.type === 'op') && assignOps.includes(t.value)) {
      this.next();
      const value = this.parseAssign();
      if (left.type !== 'Id' && left.type !== 'Member') {
        this.fail('Z018', 'لا يمكن الإسناد إلى هذا التعبير (يجب أن يكون اسمًا أو خاصية).', t);
      }
      return { type: 'Assign', op: t.value, target: left, value, line: t.line };
    }
    return left;
  }

  parseConditional() {
    const test = this.parseLogicalOr();
    if (this.isOp('?')) {
      const t = this.next();
      const consequent = this.parseAssign();
      this.expectPunc(':', 'الفصل بين فرعي شرط «؟ :»');
      const alternate = this.parseAssign();
      return { type: 'Conditional', test, consequent, alternate, line: t.line };
    }
    return test;
  }

  parseLogicalOr() {
    let left = this.parseLogicalAnd();
    while (this.isKw('أو') || this.isOp('||')) {
      const t = this.next();
      left = { type: 'Logical', op: '||', left, right: this.parseLogicalAnd(), line: t.line };
    }
    return left;
  }
  parseLogicalAnd() {
    let left = this.parseEquality();
    while (this.isKw('و') || this.isOp('&&')) {
      const t = this.next();
      left = { type: 'Logical', op: '&&', left, right: this.parseEquality(), line: t.line };
    }
    return left;
  }
  parseEquality() {
    let left = this.parseRelational();
    for (;;) {
      const t = this.tok();
      const map = { 'مطابق': '===', 'مختلف': '!==', '==': '===', '!=': '!==', '===': '===', '!==': '!==' };
      const op = t.type === 'kw' ? map[t.ar] : (t.type === 'op' ? map[t.value] : undefined);
      if (!op) break;
      this.next();
      left = { type: 'Bin', op, left, right: this.parseRelational(), line: t.line };
    }
    return left;
  }
  parseRelational() {
    let left = this.parseAdditive();
    while (this.isOp('<') || this.isOp('>') || this.isOp('<=') || this.isOp('>=')) {
      const t = this.next();
      left = { type: 'Bin', op: t.value, left, right: this.parseAdditive(), line: t.line };
    }
    return left;
  }
  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.isOp('+') || this.isOp('-')) {
      const t = this.next();
      left = { type: 'Bin', op: t.value, left, right: this.parseMultiplicative(), line: t.line };
    }
    return left;
  }
  parseMultiplicative() {
    let left = this.parseUnary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('%') || this.isOp('**')) {
      const t = this.next();
      left = { type: 'Bin', op: t.value, left, right: this.parseUnary(), line: t.line };
    }
    return left;
  }
  parseUnary() {
    const t = this.tok();
    if (this.isKw('ليس')) { this.next(); return { type: 'Unary', op: '!', arg: this.parseUnary(), prefix: true, line: t.line }; }
    if (this.isKw('احذف')) { this.next(); return { type: 'Unary', op: 'delete', arg: this.parseUnary(), prefix: true, line: t.line }; }
    if (this.isKw('نوع')) { this.next(); return { type: 'Unary', op: 'typeof', arg: this.parseUnary(), prefix: true, line: t.line }; }
    if (this.isKw('انتظر')) { this.next(); return { type: 'Await', arg: this.parseUnary(), line: t.line }; }
    if (this.isOp('!')) { this.next(); return { type: 'Unary', op: '!', arg: this.parseUnary(), prefix: true, line: t.line }; }
    if (this.isOp('-')) { this.next(); return { type: 'Unary', op: '-', arg: this.parseUnary(), prefix: true, line: t.line }; }
    if (this.isOp('+')) { this.next(); return { type: 'Unary', op: '+', arg: this.parseUnary(), prefix: true, line: t.line }; }
    if (this.isOp('++') || this.isOp('--')) {
      this.next();
      return { type: 'Update', op: t.value, arg: this.parseUnary(), prefix: true, line: t.line };
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let expr = this.parsePrimary();
    for (;;) {
      if (this.isPunc('.')) {
        this.next();
        const prop = this.tok();
        if (prop.type === 'id' || prop.type === 'kw') { this.next(); expr = { type: 'Member', object: expr, property: prop.value || prop.ar, computed: false, line: prop.line }; }
        else this.fail('Z019', 'متوقّع اسم خاصية بعد «.».', prop);
        continue;
      }
      if (this.isPunc('[')) {
        this.next();
        const property = this.parseExpr();
        this.expectPunc(']', 'إغلاق الفهرس');
        expr = { type: 'Member', object: expr, property, computed: true, line: expr.line };
        continue;
      }
      if (this.isPunc('(')) {
        const args = this.parseArgs();
        expr = { type: 'Call', callee: expr, args, line: expr.line };
        continue;
      }
      break;
    }
    if (this.isOp('++') || this.isOp('--')) {
      const t = this.next();
      expr = { type: 'Update', op: t.value, arg: expr, prefix: false, line: t.line };
    }
    return expr;
  }

  /** عنصر قد يكون «انشر تعبير» (بسط/تجميع) */
  parseElement() {
    if (this.isKw('انشر')) {
      const t = this.next();
      return { type: 'Spread', arg: this.parseExpr(), line: t.line };
    }
    return this.parseExpr();
  }

  parseArgs() {
    this.expectPunc('(', 'قائمة الوسائط');
    const args = [];
    while (!this.eof() && !this.isPunc(')')) {
      args.push(this.parseElement());
      if (this.isPunc(',')) this.next();
      else break;
    }
    this.expectPunc(')', 'إغلاق قائمة الوسائط');
    return args;
  }

  looksLikeArrow() {
    let depth = 0;
    for (let k = this.pos; k < this.tokens.length; k++) {
      const t = this.tokens[k];
      if (t.type === 'punc' && t.value === '(') depth++;
      else if (t.type === 'punc' && t.value === ')') {
        depth--;
        if (depth === 0) {
          const n = this.tokens[k + 1];
          return !!(n && n.type === 'op' && n.value === '=>');
        }
      }
      if (t.type === 'eof') return false;
    }
    return false;
  }

  parsePrimary() {
    const t = this.tok();

    if (t.type === 'num') { this.next(); return { type: 'NumLit', value: t.value, raw: t.ar, line: t.line }; }
    if (t.type === 'str') { this.next(); return { type: 'StrLit', js: t.js, raw: t.value, line: t.line }; }

    if (t.type === 'kw') {
      switch (t.ar) {
        case 'صحيح': this.next(); return { type: 'BoolLit', value: true, line: t.line };
        case 'باطل': this.next(); return { type: 'BoolLit', value: false, line: t.line };
        case 'عدم': this.next(); return { type: 'NullLit', line: t.line };
        case 'لاشيء': this.next(); return { type: 'UndefinedLit', line: t.line };
        case 'هذا': this.next(); return { type: 'ThisLit', line: t.line };
        case 'الأصل': this.next(); return { type: 'Super', line: t.line };
        case 'جديد': {
          this.next();
          const callee = this.parsePostfix();
          const args = (callee.type === 'Call') ? callee.args : [];
          const target = (callee.type === 'Call') ? callee.callee : callee;
          return { type: 'New', callee: target, args, line: t.line };
        }
        case 'دالة': {
          this.next();
          const name = (this.tok().type === 'id') ? this.next().value : null;
          const params = this.parseParams();
          const body = this.parseBlock();
          return { type: 'FuncExpr', name, params, body, async: false, line: t.line };
        }
        case 'غير_متزامن': {
          this.next();
          this.expectKw('دالة', 'بعد «غير_متزامن»');
          const name = (this.tok().type === 'id') ? this.next().value : null;
          const params = this.parseParams();
          const body = this.parseBlock();
          return { type: 'FuncExpr', name, params, body, async: true, line: t.line };
        }
        default: break;
      }
      const sug = suggestKeyword(t.raw);
      const useSug = sug && sug !== t.ar;
      this.fail('Z020', `«${t.raw}» كلمة محجوزة ولا تصلح هنا${useSug ? ` — هل تقصد «${sug}»؟` : ''}.`,
        t, { suggestion: useSug ? `استخدم «${sug}»` : 'راجع الكلمات المفتاحية' });
    }

    if (t.type === 'id') {
      // دالة سهمية بمعامل واحد: س => …
      const nx = this.tok(1);
      if (nx.type === 'op' && nx.value === '=>') {
        this.next(); this.next();
        return this.parseArrowBody([t.value], t.line);
      }
      this.next();
      return { type: 'Id', name: t.value, line: t.line };
    }

    if (this.isPunc('(')) {
      if (this.looksLikeArrow()) {
        const params = this.parseParams();
        const arrow = this.tokens[this.pos];
        if (!(arrow && arrow.type === 'op' && arrow.value === '=>')) this.fail('Z021', 'متوقّع «=>» بعد معاملات الدالة السهمية.', this.tok());
        this.next();
        return this.parseArrowBody(params, t.line);
      }
      this.next();
      const inner = this.parseExpr();
      this.expectPunc(')', 'إغلاق القوس');
      return inner;
    }

    if (this.isPunc('[')) {
      this.next();
      const elements = [];
      while (!this.eof() && !this.isPunc(']')) {
        elements.push(this.parseElement());
        if (this.isPunc(',')) this.next();
        else break;
      }
      this.expectPunc(']', 'إغلاق المصفوفة');
      return { type: 'ArrayLit', elements, line: t.line };
    }

    if (this.isPunc('{')) {
      this.next();
      const properties = [];
      while (!this.eof() && !this.isPunc('}')) {
        if (this.isKw('انشر')) {
          const sp = this.next();
          properties.push({ spread: true, value: this.parseExpr(), line: sp.line });
          if (this.isPunc(',')) this.next();
          continue;
        }
        const keyTok = this.tok();
        let key, computed = false;
        if (keyTok.type === 'id' || keyTok.type === 'kw') { key = keyTok.value || keyTok.ar; this.next(); }
        else if (keyTok.type === 'str') { key = keyTok.value; this.next(); }
        else if (keyTok.type === 'num') { key = keyTok.value; this.next(); }
        else if (this.isPunc('[')) { this.next(); key = this.parseExpr(); computed = true; this.expectPunc(']', 'إغلاق المفتاح المحسوب'); }
        else this.fail('Z022', 'مفتاح غير صالح في الكائن.', keyTok);

        if (this.isPunc(':')) {
          this.next();
          properties.push({ key, computed, value: this.parseExpr() });
        } else {
          properties.push({ key, computed: false, value: { type: 'Id', name: key, line: keyTok.line }, shorthand: true });
        }
        if (this.isPunc(',')) this.next();
        else break;
      }
      this.expectPunc('}', 'إغلاق الكائن');
      return { type: 'ObjectLit', properties, line: t.line };
    }

    this.fail('Z023', `تعبير غير متوقّع: «${t.raw ?? t.value}».`, t, { suggestion: 'راجع السطر — قد يكون قوس ناقص أو كلمة في غير موضعها' });
  }

  parseArrowBody(params, line) {
    if (this.isPunc('{')) {
      const body = this.parseBlock();
      return { type: 'Arrow', params, body, expression: false, line };
    }
    const body = this.parseAssign();
    return { type: 'Arrow', params, body, expression: true, line };
  }
}

function parse(source, opts = {}) {
  const diagnostics = opts.diagnostics || [];
  const lexer = new Lexer(source, { file: opts.file, diagnostics });
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, { diagnostics, comments: lexer.comments });
  const ast = parser.parseProgram();
  ast.comments = lexer.comments;
  return { ast, diagnostics, comments: lexer.comments };
}

module.exports = { Parser, parse };
