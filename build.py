#!/usr/bin/env python3
"""Build the Phoenix Industrial Labs site.

  python3 build.py            -> dist/site (multi-file, for GitHub Pages) and dist/artifact (single inlined file)
  python3 build.py --site     -> only dist/site
  python3 build.py --artifact -> only dist/artifact

Pure standard library: image sizes are read from the WebP/PNG headers directly.
"""
import base64, json, os, re, shutil, struct, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
ASSETS = os.path.join(ROOT, 'assets')
DIST = os.path.join(ROOT, 'dist')
CONFIG = json.load(open(os.path.join(ROOT, 'config.json')))

LINES = ['flashlight', 'penholder', 'photoframe', 'water', 'nightlight']
HERO_SCRIPTS = [('assets/vendor/three.min.js', os.path.join(ASSETS, 'vendor', 'three.min.js')),
                ('assets/facility3d.js', os.path.join(SRC, 'facility3d.js'))]
PAGE_SCRIPTS = [('assets/form.js', os.path.join(SRC, 'lib', 'form.js')),
                ('assets/site.js', os.path.join(SRC, 'site.js'))]
SCRIPTS = HERO_SCRIPTS + PAGE_SCRIPTS


def read(p, mode='r'):
    with open(p, mode) as f:
        return f.read()


def b64(p):
    return base64.b64encode(read(p, 'rb')).decode()


def image_size(path):
    """Width/height for WebP (VP8, VP8L, VP8X) and PNG without external libraries."""
    d = read(path, 'rb')
    if d[:8] == b'\x89PNG\r\n\x1a\n':
        return struct.unpack('>II', d[16:24])
    if d[:4] == b'RIFF' and d[8:12] == b'WEBP':
        chunk = d[12:16]
        if chunk == b'VP8X':
            w = 1 + int.from_bytes(d[24:27], 'little'); h = 1 + int.from_bytes(d[27:30], 'little')
            return w, h
        if chunk == b'VP8L':
            b = d[21:25]
            w = 1 + (((b[1] & 0x3F) << 8) | b[0]); h = 1 + (((b[3] & 0x0F) << 10) | (b[2] << 2) | ((b[1] & 0xC0) >> 6))
            return w, h
        if chunk == b'VP8 ':
            w = struct.unpack('<H', d[26:28])[0] & 0x3FFF; h = struct.unpack('<H', d[28:30])[0] & 0x3FFF
            return w, h
    raise ValueError('unsupported image: ' + path)


def mark_svg():
    """The phoenix mark, inlined so it scales crisply and takes its colour from CSS."""
    svg = read(os.path.join(ASSETS, 'brand', 'phoenix-mark.svg')).strip()
    return svg.replace('<svg ', '<svg class="logo" aria-hidden="true" focusable="false" ', 1)


def prefill_panels(html):
    """Copy each chip group's first description into its (empty) panel so the page reads without JavaScript."""
    out, pos = [], 0
    for m in re.finditer(r'<button role="tab" aria-selected="true" data-text="(.*?)">', html):
        panel = html.find('<p class="panel" role="tabpanel"></p>', m.end())
        assert panel > 0, 'every chip group needs an empty panel after its selected chip'
        out.append(html[pos:panel]); out.append('<p class="panel" role="tabpanel">%s</p>' % m.group(1))
        pos = panel + len('<p class="panel" role="tabpanel"></p>')
    out.append(html[pos:])
    return ''.join(out)


def common_replacements():
    rep = {}
    form = CONFIG['form']
    rep['{{FORM_ACTION}}'] = form.get('action', '')
    rep['{{FORM_NAME_FIELD}}'] = form.get('name_field', '')
    rep['{{FORM_EMAIL_FIELD}}'] = form.get('email_field', '')
    rep['{{FORM_SOURCE_FIELD}}'] = form.get('source_field', '')
    rep['{{FORM_SOURCE}}'] = form.get('source', '')
    rep['{{FORM_TO}}'] = CONFIG['contact_email']
    rep['{{MARK_SVG}}'] = mark_svg()
    for name in LINES:
        w, h = image_size(os.path.join(ASSETS, 'img', f'line_{name}.webp'))
        rep['{{W_%s}}' % name.upper()] = str(w)
        rep['{{H_%s}}' % name.upper()] = str(h)
    return rep


def apply(template, rep):
    for k, v in rep.items():
        template = template.replace(k, v)
    left = re.findall(r'\{\{[A-Z_]+\}\}', template)
    assert not left, 'unfilled placeholders: %s' % left
    return prefill_panels(template)


def split_head(body):
    """The template starts with <title> and <style>; lift them into <head> for the standalone page."""
    m = re.match(r'\s*<title>(.*?)</title>\s*<style>(.*?)</style>\s*', body, re.S)
    assert m, 'template must start with <title> and <style>'
    return m.group(1), m.group(2), body[m.end():]


def build_site():
    out = os.path.join(DIST, 'site')
    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(os.path.join(out, 'assets', 'img'))
    os.makedirs(os.path.join(out, 'assets', 'fonts'))
    os.makedirs(os.path.join(out, 'assets', 'vendor'))
    # assets
    for name in LINES + ['facility3d_still']:
        shutil.copy(os.path.join(ASSETS, 'img', f'{name if name == "facility3d_still" else "line_" + name}.webp'), os.path.join(out, 'assets', 'img'))
    for f in ('hanken.woff2', 'hanken-italic.woff2'):
        shutil.copy(os.path.join(ASSETS, 'fonts', f), os.path.join(out, 'assets', 'fonts'))
    for rel, src in SCRIPTS:
        shutil.copy(src, os.path.join(out, rel))
    for f in ('robots.txt', 'sitemap.xml', '404.html', 'favicon.svg'):
        p = os.path.join(SRC, f)
        if os.path.exists(p):
            shutil.copy(p, out)
    for f in os.listdir(os.path.join(ASSETS, 'brand')) if os.path.isdir(os.path.join(ASSETS, 'brand')) else []:
        shutil.copy(os.path.join(ASSETS, 'brand', f), out)
    open(os.path.join(out, '.nojekyll'), 'w').close()

    rep = common_replacements()
    rep.update({
        '{{SRC_FONT_HANKEN}}': 'assets/fonts/hanken.woff2',
        '{{SRC_FONT_HANKEN_I}}': 'assets/fonts/hanken-italic.woff2',
        '{{SRC_STILL}}': 'assets/img/facility3d_still.webp',
        '{{SCRIPTS}}': '\n'.join('<script src="%s" defer></script>' % rel for rel, _ in PAGE_SCRIPTS),
        '{{HERO_THREE}}': HERO_SCRIPTS[0][0],
        '{{HERO_FACILITY}}': HERO_SCRIPTS[1][0],
    })
    for name in LINES:
        rep['{{SRC_LINE_%s}}' % name.upper()] = f'assets/img/line_{name}.webp'
    body = apply(read(os.path.join(SRC, 'index.template.html')), rep)
    title, style, markup = split_head(body)
    url = CONFIG['site_url']
    # GitHub Pages cannot send security headers, so the policy travels in the document: scripts and fonts only from
    # this origin, inline styles allowed (the page's own <style>), network only to this origin and the form endpoint.
    form_origin = re.match(r'https://[^/]+', CONFIG['form'].get('action', '') or 'https://docs.google.com').group(0)
    csp = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; "
           f"connect-src 'self' {form_origin}; form-action 'self'; base-uri 'none'; object-src 'none'")
    head = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="{csp}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>{title} — {CONFIG['tagline']}</title>
<meta name="description" content="{CONFIG['description']}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#F5F5F3">
<link rel="icon" href="favicon.svg?v=2" type="image/svg+xml">
<link rel="icon" href="favicon-32.png?v=2" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="apple-touch-icon.png?v=2">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{title}">
<meta property="og:title" content="{title} — {CONFIG['tagline']}">
<meta property="og:description" content="{CONFIG['description']}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{url}og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" href="assets/fonts/hanken.woff2" as="font" type="font/woff2" crossorigin>
<style>{style}</style>
</head>
<body>
'''
    html = head + markup.rstrip() + '\n</body>\n</html>\n'
    open(os.path.join(out, 'index.html'), 'w').write(html)
    return out, len(html.encode())


def build_artifact():
    out = os.path.join(DIST, 'artifact')
    os.makedirs(out, exist_ok=True)
    rep = common_replacements()
    rep.update({
        '{{SRC_FONT_HANKEN}}': 'data:font/woff2;base64,' + b64(os.path.join(ASSETS, 'fonts', 'hanken.woff2')),
        '{{SRC_FONT_HANKEN_I}}': 'data:font/woff2;base64,' + b64(os.path.join(ASSETS, 'fonts', 'hanken-italic.woff2')),
        '{{SRC_STILL}}': 'data:image/webp;base64,' + b64(os.path.join(ASSETS, 'img', 'facility3d_still.webp')),
        # page scripts run right away; the 3D bundle waits for the load event so text paints first
        '{{SCRIPTS}}': '\n'.join('<script>%s</script>' % read(src) for _, src in PAGE_SCRIPTS)
                       + '\n<script>window.addEventListener("load",function(){\n' + '\n'.join(read(src) for _, src in HERO_SCRIPTS) + '\n});</script>',
        '{{HERO_THREE}}': '',
        '{{HERO_FACILITY}}': '',
    })
    for name in LINES:
        rep['{{SRC_LINE_%s}}' % name.upper()] = 'data:image/webp;base64,' + b64(os.path.join(ASSETS, 'img', f'line_{name}.webp'))
    html = apply(read(os.path.join(SRC, 'index.template.html')), rep)
    open(os.path.join(out, 'index.html'), 'w').write(html)
    return out, len(html.encode())


if __name__ == '__main__':
    args = set(sys.argv[1:])
    if not args or '--site' in args:
        p, n = build_site(); print(f'site      -> {os.path.relpath(p, ROOT)}/  (index.html {n/1024:.0f} KB)')
    if not args or '--artifact' in args:
        p, n = build_artifact(); print(f'artifact  -> {os.path.relpath(p, ROOT)}/index.html  ({n/1024/1024:.2f} MB)')
