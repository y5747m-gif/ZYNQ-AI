'use strict';

// ==========================================================================
//  زيتونة — المستوى الثاني في المصحّح: إصلاح بنموذج لغوي
//  - مفاتيح المستخدم فقط (BYO key) — لا تمرّ الأكواد على خوادمنا.
//  - إلزامي: كل إصلاح يُختبر على مدقّق اللغة الحقيقي قبل أن يُقبل (حلقة تحقق).
//  - إن لم ينجح النموذج في n محاولة: نرفض الإصلاح ونقول ذلك صراحة (لا تجميل).
// ==========================================================================

const DEFAULT_BASE = process.env.ZAYTUNA_BASE_URL || 'https://api.openai.com/v1';
const DEFAULT_MODEL = process.env.ZAYTUNA_MODEL || 'gpt-4o-mini';

function pickKey(opts = {}) {
  return opts.apiKey || process.env.ZAYTUNA_API_KEY || process.env.OPENAI_API_KEY || null;
}

function buildPrompt({ code, lang, diagnostics, attempt }) {
  const langLabel = { js: 'JavaScript', ts: 'TypeScript', py: 'Python', zy: 'Zaytuna (Arabic syntax that compiles to JavaScript)' }[lang] || lang;
  const issueList = (diagnostics || [])
    .slice(0, 40)
    .map((d) => `- [${d.line}:${d.col}] ${d.code} ${(d.message || '').slice(0, 200)}`)
    .join('\n');
  return [
    {
      role: 'system',
      content:
        'أنت مصحّح أكواد دقيق. مهمتك إصلاح الأخطاء المُبلَّغ عنها بأقل تغيير ممكن، دون تغيير المنطق أو تنسيق الملف كله، ' +
        'ودون حذف تعليقات. تعامل بحذر شديد مع الحروف غير المرئية وأحرف الاتجاه: احذفها. ' +
        'Reply with ONE fenced code block containing the FULL corrected file and nothing else.',
    },
    {
      role: 'user',
      content:
        `اللغة: ${langLabel}\n` +
        `محاولة الإصلاح رقم: ${attempt}\n` +
        (issueList ? `المشاكل المرصودة:\n${issueList}\n` : '') +
        `\nالكود الحالي:\n\`\`\`${lang}\n${code}\n\`\`\`\n\n` +
        'أعد الملف كاملًا بعد الإصلاح داخل كتلة كود واحدة. لا تكتب أي شرح خارج الكتلة.',
    },
  ];
}

function extractCode(reply) {
  if (!reply) return null;
  const fenced = reply.match(/```[a-zA-Z_+-]*\n([\s\S]*?)```/);
  if (fenced) return fenced[1].replace(/\n$/, '\n');
  return null;
}

/**
 * محاولة إصلاح واحدة بالنموذج.
 * @returns {Promise<{ok:boolean, code?:string, error?:string, raw?:string}>}
 */
async function aiRepair({ code, lang, diagnostics, apiKey, model, baseUrl, attempt = 1, timeoutMs = 60000 }) {
  const key = pickKey({ apiKey });
  if (!key) {
    return { ok: false, error: 'لا يوجد مفتاح API. عيّن ZAYTUNA_API_KEY أو OPENAI_API_KEY (مفتاحك يبقى عندك ولا يُرسل لأي وسيط).' };
  }
  const url = `${(baseUrl || DEFAULT_BASE).replace(/\/$/, '')}/chat/completions`;
  const body = {
    model: model || DEFAULT_MODEL,
    temperature: 0,
    messages: buildPrompt({ code, lang, diagnostics, attempt }),
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `النموذج رفض الطلب (${res.status}): ${text.slice(0, 300)}` };
    let data;
    try { data = JSON.parse(text); } catch (_) { return { ok: false, error: 'رد غير مفهوم من النموذج.' }; }
    const reply = data?.choices?.[0]?.message?.content || '';
    const fixed = extractCode(reply);
    if (!fixed) return { ok: false, error: 'النموذج لم يُعد كتلة كود قابلة للتطبيق.', raw: reply.slice(0, 400) };
    return { ok: true, code: fixed, raw: reply.slice(0, 400) };
  } catch (err) {
    const msg = err && err.name === 'AbortError' ? 'انتهت مهلة الطلب.' : String(err && err.message);
    return { ok: false, error: `فشل الاتصال بالنموذج: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { aiRepair, extractCode, pickKey };
