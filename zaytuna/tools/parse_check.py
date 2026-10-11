#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
زيتونة — فحص بنيوي بقواعد tree-sitter (ليس مترجمًا رسميًا!)

يُستخدم حين لا يكون مترجم اللغة مثبّتًا على الجهاز: نُحلّل المخرج بقواعد
الشجرة النحوية الرسمية للغة، فإن ظهرت عُقد خطأ (ERROR/MISSING) نقولها بموضعها،
وإن نجح التحليل نقول "بنية سليمة بقواعد tree-sitter" — ولا نقول "تحقّق بمترجم".

الاستخدام:  python3 tools/parse_check.py <لغة> <ملف>
المخرَج: JSON على stdout: {"ok":…, "grammar":…, "errors":[…], "reason":…}
"""

import json
import os
import sys

# مكتبات القواعد تُثبَّت من PyPI:  pip install tree-sitter-ruby tree-sitter-php …
# ويمكن تحديد مجلدها عبر ZAYTUNA_PYLIB أو بأحد المسارات الافتراضية أدناه.
LIB_CANDIDATES = [
    os.environ.get('ZAYTUNA_PYLIB', ''),
    os.path.join(os.path.expanduser('~'), '.zaytuna-pylibs'),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.pylibs'),
    '/usr/local/lib/zaytuna-pylibs',
]

GRAMMARS = {
    'ruby':    ('tree_sitter_ruby',    ('language',)),
    'php':     ('tree_sitter_php',     ('language_php', 'language')),
    'java':    ('tree_sitter_java',    ('language',)),
    'c_sharp': ('tree_sitter_c_sharp', ('language',)),
    'go':      ('tree_sitter_go',      ('language',)),
    'rust':    ('tree_sitter_rust',    ('language',)),
    'c':       ('tree_sitter_c',       ('language',)),
    'cpp':     ('tree_sitter_cpp',     ('language',)),
    'typescript': ('tree_sitter_typescript', ('language_typescript', 'language')),
}

MAX_ERRORS = 8


def prepare_path():
    for cand in LIB_CANDIDATES:
        if cand and os.path.isdir(cand) and cand not in sys.path:
            sys.path.insert(0, cand)


def load_language(lang):
    mod_name, attrs = GRAMMARS[lang]
    import importlib
    mod = importlib.import_module(mod_name)
    from tree_sitter import Language
    for attr in attrs:
        if hasattr(mod, attr):
            val = getattr(mod, attr)
            val = val() if callable(val) else val
            try:
                return Language(val)
            except Exception:                       # واجهات أقدم/أحدث
                return val
    raise RuntimeError('لا واجهة لغة داخل الحزمة ' + mod_name)


def deepest_errors(node, out):
    """نجمع أضيق عُقد الخطأ (لا الكبيرة التي تحتوي الملف كله) لنحدّد الموضع بدقة."""
    if node.type == 'ERROR' or node.is_missing:
        inner = [c for c in node.children if c.type == 'ERROR' or c.is_missing or c.has_error]
        if inner:
            for child in inner:
                deepest_errors(child, out)
        else:
            out.append(node)
        return
    for child in node.children:
        if child.type == 'ERROR' or child.is_missing or child.has_error:
            deepest_errors(child, out)


def collect_errors(node, source, out, limit=MAX_ERRORS):
    raw = []
    deepest_errors(node, raw)
    raw.sort(key=lambda n: (n.start_byte, n.end_byte - n.start_byte))
    for n in raw:
        if len(out) >= limit:
            break
        line = source[:n.start_byte].count(b'\n') + 1
        snippet = source[n.start_byte:min(n.end_byte, n.start_byte + 70)].decode('utf-8', 'replace')
        out.append({
            'line': line,
            'col': n.start_point[1] + 1,
            'type': 'MISSING' if n.is_missing else 'ERROR',
            'text': snippet.replace('\n', '⏎'),
        })


def main():
    if len(sys.argv) < 3:
        print(json.dumps({'ok': False, 'reason': 'الاستخدام: parse_check.py <لغة> <ملف>'}, ensure_ascii=False))
        return 2
    lang, path = sys.argv[1], sys.argv[2]
    if lang not in GRAMMARS:
        print(json.dumps({'ok': False, 'reason': f'لا قواعد لهذه اللغة: {lang}'}, ensure_ascii=False))
        return 2

    prepare_path()
    try:
        from tree_sitter import Parser
    except Exception as exc:                        # مكتبة tree-sitter غير مثبتة
        print(json.dumps({'ok': False, 'verified': False, 'reason': f'tree-sitter غير مثبتة: {exc}'}, ensure_ascii=False))
        return 3
    try:
        language = load_language(lang)
        parser = Parser(language)
    except Exception as exc:
        print(json.dumps({'ok': False, 'verified': False, 'reason': f'قواعد {lang} غير مثبتة: {exc}'}, ensure_ascii=False))
        return 3

    source = open(path, 'rb').read()
    tree = parser.parse(source)
    errors = []
    collect_errors(tree.root_node, source, errors)
    ok = len(errors) == 0
    print(json.dumps({
        'ok': ok,
        'verified': True,
        'grammar': GRAMMARS[lang][0],
        'errors': errors,
        'reason': '' if ok else 'وجدت قواعد الشجرة عُقد خطأ في المخرج.',
    }, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
