'use strict';

// ==========================================================================
//  زيتونة — الأخطاء والتشخيصات
//  كل رسالة بالعربية + رمز ثابت + موضع دقيق + إصلاح مقترح.
//  الرموز: Z0xx لغة · Z1xx أمان وحروف مخفية · Z2xx أرقام وترقيم
//          Z3xx مصحّح تلقائي · Z4xx تحقق خارجي
// ==========================================================================

class ZError extends Error {
  constructor(code, message, line, col, extra = {}) {
    super(message);
    this.name = 'ZaytunaError';
    this.isZaytunaError = true;
    this.code = code;
    this.line = line;
    this.col = col;
    this.severity = extra.severity || 'error';
    this.suggestion = extra.suggestion || null;   // نص الإصلاح المقترح
    this.hint = extra.hint || null;               // شرح إضافي
    this.length = extra.length || 1;              // طول الجزء المُشار إليه
  }
  toDiagnostic() {
    return {
      severity: this.severity, code: this.code, message: this.message,
      line: this.line, col: this.col, suggestion: this.suggestion,
      hint: this.hint, length: this.length,
    };
  }
}

const SEVERITY_LABEL = {
  error: 'خطأ',
  warning: 'تحذير',
  info: 'ملاحظة',
  security: 'خطر أمني',
};

/** إضافة تشخيص غير قاتل (تحذير/ملاحظة) إلى قائمة التشخيصات */
function diag(list, severity, code, message, line, col, extra = {}) {
  list.push({ severity, code, message, line, col, ...extra });
}

module.exports = { ZError, diag, SEVERITY_LABEL };
