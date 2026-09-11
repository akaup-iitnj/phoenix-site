#!/usr/bin/env python3
"""Build the Phoenix Industrial Labs site.

  python3 build.py            -> dist/site (multi-file, for GitHub Pages) and dist/artifact (single inlined file)
  python3 build.py --site     -> only dist/site
  python3 build.py --artifact -> only dist/artifact

Pure standard library: image sizes are read from the WebP/PNG headers directly.
"""
import base64, datetime, html, json, math, os, re, shutil, struct, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
ASSETS = os.path.join(ROOT, 'assets')
DIST = os.path.join(ROOT, 'dist')
CONFIG = json.load(open(os.path.join(ROOT, 'config.json')))

LINES = ['flashlight', 'penholder', 'photoframe', 'water', 'nightlight']          # images shown on the home page, in chip order
LINEDATA = json.load(open(os.path.join(SRC, 'lines.json')))
LINE_PAGES = [(k, v) for k, v in LINEDATA.items() if not k.startswith('_') and v.get('page')]
EXTRA_IMAGES = [v['page']['image2'] for _, v in LINE_PAGES if v['page'].get('image2')]
HERO_SCRIPTS = [('assets/vendor/three.min.js', os.path.join(ASSETS, 'vendor', 'three.min.js')),
                ('assets/facility3d.js', os.path.join(SRC, 'facility3d.js'))]
PAGE_SCRIPTS = [('assets/form.js', os.path.join(SRC, 'lib', 'form.js')),
                ('assets/site.js', os.path.join(SRC, 'site.js'))]
SCRIPTS = HERO_SCRIPTS + PAGE_SCRIPTS

# (template, output file, <title> suffix or None for the tagline, meta description or None for the site's, line key or None)
PAGES = [
    ('index.template.html', 'index.html', None, None, None),
    ('curriculum.template.html', 'curriculum.html', 'Curriculum',
     'The Production Technician curriculum behind the Phoenix Industrial Labs facility: five courses of 225 hours, from industrial '
     'foundations and automation to operating, building and commissioning a working production line.', None),
] + [('line.template.html', v['slug'] + '.html', v['name'] + ' line', v['page']['description'], k) for k, v in LINE_PAGES]


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


def partial(name):
    return read(os.path.join(SRC, name)).strip()


def maps_url():
    if CONFIG.get('maps_url'):
        return CONFIG['maps_url']
    q = ' '.join(CONFIG.get('address', [])).replace(' ', '+').replace(',', '')
    return 'https://www.google.com/maps/search/?api=1&query=' + q


def common_replacements():
    rep = {}
    form = CONFIG['form']
    rep['{{ADDRESS_LINES}}'] = '<br>'.join(CONFIG.get('address', []))
    rep['{{MAPS_URL}}'] = maps_url()
    rep['{{YEAR}}'] = str(datetime.date.today().year)
    rep['{{FORM_ACTION}}'] = form.get('action', '')
    rep['{{FORM_NAME_FIELD}}'] = form.get('name_field', '')
    rep['{{FORM_EMAIL_FIELD}}'] = form.get('email_field', '')
    rep['{{FORM_SOURCE_FIELD}}'] = form.get('source_field', '')
    rep['{{FORM_SOURCE}}'] = form.get('source', '')
    rep['{{FORM_TO}}'] = CONFIG['contact_email']
    rep['{{MARK_SVG}}'] = mark_svg()
    for name in LINES + EXTRA_IMAGES:
        w, h = image_size(os.path.join(ASSETS, 'img', f'line_{name}.webp'))
        rep['{{W_%s}}' % name.upper()] = str(w)
        rep['{{H_%s}}' % name.upper()] = str(h)
    return rep


def esc(t):
    return html.escape(t, quote=True)


def attr(t):
    """For data-text attributes, whose value is HTML (a <b> lead-in): escape only what would end the attribute."""
    return t.replace('&', '&amp;').replace('"', '&quot;')


def route_svg(steps):
    """Schematic of the conveyor loop: stops on the loop spread clockwise from the top-left corner to the
    bottom-left corner; a control desk and a warehouse sit off the loop at the left, the warehouse joined by
    the mobile robot's dashed path. One <g class="slide"> per stop carries its ember ring (the reveal script
    shows the one whose chip is selected)."""
    W, H = 1000, 300
    x0, y0, x1, y1, r = 250, 68, 935, 232, 62
    # perimeter walk, clockwise from (x0, y0 + r) [top of the left edge] to (x0, y1 - r) [bottom of the left edge]
    segs = []  # (length, function t->(x,y))
    def arc(cx, cy, a0, a1):
        L = abs(a1 - a0) * r
        return (L, lambda t: (cx + r * math.cos(a0 + (a1 - a0) * t), cy + r * math.sin(a0 + (a1 - a0) * t)))
    def line(ax, ay, bx, by):
        return (math.hypot(bx - ax, by - ay), lambda t: (ax + (bx - ax) * t, ay + (by - ay) * t))
    segs.append(arc(x0 + r, y0 + r, math.pi, 1.5 * math.pi))          # top-left corner
    segs.append(line(x0 + r, y0, x1 - r, y0))                          # top edge
    segs.append(arc(x1 - r, y0 + r, 1.5 * math.pi, 2 * math.pi))      # top-right corner
    segs.append(line(x1, y0 + r, x1, y1 - r))                          # right edge
    segs.append(arc(x1 - r, y1 - r, 0, 0.5 * math.pi))                 # bottom-right corner
    segs.append(line(x1 - r, y1, x0 + r, y1))                          # bottom edge
    segs.append(arc(x0 + r, y1 - r, 0.5 * math.pi, math.pi))           # bottom-left corner
    total = sum(L for L, _ in segs)
    def point_at(d):
        for L, f in segs:
            if d <= L:
                return f(d / L)
            d -= L
        return segs[-1][1](1.0)
    loop_steps = [i for i, st in enumerate(steps) if (st[2] if len(st) > 2 else 'loop') == 'loop']
    pos = {}
    for n, i in enumerate(loop_steps):
        pos[i] = point_at(total * (n + 0.5) / len(loop_steps))
    off = {'control': (95, y0 + 2), 'store': (95, y1 - 30)}
    for i, st in enumerate(steps):
        kind = st[2] if len(st) > 2 else 'loop'
        if kind != 'loop':
            pos[i] = off[kind]
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    out = [f'<svg viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="Schematic of the line: stops around a conveyor loop, with the warehouse and control desk beside it">']
    out.append(f'<rect class="loop" x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" rx="{r}"/>')
    kinds = [st[2] if len(st) > 2 else 'loop' for st in steps]
    if 'store' in kinds:   # the warehouse, joined to the loop by the mobile robot's dashed path
        sx, sy = off['store']
        ex = x0 + r - math.sqrt(max(0, r * r - (sy - (y1 - r)) ** 2)) if sy > y1 - r else x0
        out.append(f'<path class="agv" d="M{sx + 24} {sy} H{ex - 2:.1f}"/>')
        out.append(f'<path class="icon" d="M{sx - 52} {sy - 24} h32 v48 h-32 z M{sx - 52} {sy - 8} h32 M{sx - 52} {sy + 8} h32"/>')  # a rack
    if 'control' in kinds:  # the control and display center, wired to the loop
        kx, ky = off['control']
        out.append(f'<path class="agv" d="M{kx + 24} {ky} H{x0 + r}"/>')
        out.append(f'<path class="icon" d="M{kx - 54} {ky - 13} h36 v24 h-36 z M{kx - 36} {ky + 11} v8 M{kx - 45} {ky + 19} h18"/>')  # a screen
    for i, st in enumerate(steps):
        x, y = pos[i]
        nx, ny = (x - cx) / max(1, abs(x - cx)) if abs(x - cx) > 40 else 0, (y - cy) / max(1, abs(y - cy)) if abs(y - cy) > 40 else 0
        if kinds[i] != 'loop':
            lx, ly, anchor = x, y + 36, 'middle'
        elif abs(y - cy) >= (y1 - y0) / 2 - 6:      # top or bottom edge
            lx, ly, anchor = x, (y - 30 if y < cy else y + 40), 'middle'
        else:                                         # right edge or corners
            lx, ly, anchor = (x + 32 if x > cx else x - 32), y + 5, ('start' if x > cx else 'end')
        out.append(f'<circle class="node" cx="{x:.1f}" cy="{y:.1f}" r="15"/><text class="num" x="{x:.1f}" y="{y:.1f}">{i + 1}</text>')
        out.append(f'<text class="lbl" x="{lx:.1f}" y="{ly:.1f}" text-anchor="{anchor}">{esc(st[0])}</text>')
    for i, st in enumerate(steps):
        x, y = pos[i]
        out.append(f'<g class="slide"><circle class="ring" cx="{x:.1f}" cy="{y:.1f}" r="25"/></g>')
    out.append('</svg>')
    return '\n'.join(out)


def line_replacements(key, src):
    """Placeholders for one production-line page; src(name) gives the image path or data URI."""
    d = LINEDATA[key]; p = d['page']
    rep = {
        '{{L_NAME}}': esc(d['name']), '{{L_EYEBROW}}': esc(p['eyebrow']), '{{L_H1}}': esc(p['h1']), '{{L_SUB}}': esc(p['sub']),
        '{{L_IMG}}': src(key), '{{L_IMG_ALT}}': esc(p['image_alt']),
        '{{L_IMG_W}}': '{{W_%s}}' % key.upper(), '{{L_IMG_H}}': '{{H_%s}}' % key.upper(),
        '{{L_FACTS}}': '\n'.join(f'    <div><b>{esc(n)}</b><span>{esc(t)}</span></div>' for n, t in p['facts']),
        '{{L_ROUTE_H}}': esc(p['route']['h']), '{{L_ROUTE_P}}': esc(p['route']['p']),
        '{{L_ROUTE_CHIPS}}': '\n'.join(
            f'      <button role="tab" aria-selected="{"true" if i == 0 else "false"}" data-text="{attr("<b>%s.</b> %s" % (st[0], st[1]))}">{esc(st[0])}</button>'
            for i, st in enumerate(p['route']['steps'])),
        '{{L_ROUTE_SVG}}': route_svg(p['route']['steps']),
        '{{L_BUILT_H}}': esc(p['built']['h']),
        '{{L_BUILT_ITEMS}}': '\n'.join(f'    <div><h3>{esc(h)}</h3><p>{esc(t)}</p></div>' for h, t in p['built']['items']),
        '{{L_FIGURE}}': (f'  <div class="line-figure"><img src="{src(p["image2"])}" alt="{esc(p["image2_alt"])}" width="{{{{W_{p["image2"].upper()}}}}}" '
                         f'height="{{{{H_{p["image2"].upper()}}}}}" loading="lazy" decoding="async"></div>') if p.get('image2') else '',
        '{{L_SKILLS_H}}': esc(p['skills']['h']), '{{L_SKILLS_P}}': esc(p['skills']['p']),
        '{{L_SKILL_CHIPS}}': '\n'.join(
            f'      <button role="tab" aria-selected="{"true" if i == 0 else "false"}" data-text="{attr("<b>%s.</b> %s" % (g[0], g[1]))}">{esc(g[0])}</button>'
            for i, g in enumerate(p['skills']['groups'])),
        '{{L_SKILLS_MORE}}': esc(p['skills'].get('more', '')),
        '{{L_GLANCE}}': '\n'.join(f'    <dt>{esc(k)}</dt><dd>{esc(v)}</dd>' for k, v in p['glance']),
        '{{L_CLOSE_H}}': esc(p['closing']['h']), '{{L_CLOSE_P}}': esc(p['closing']['p']),
    }
    return rep


def fill(text, rep):
    for _ in range(3):                      # a replacement may itself contain a placeholder (line pages: image sizes)
        for k, v in rep.items():
            text = text.replace(k, v)
    left = re.findall(r'\{\{[A-Z0-9_]+\}\}', text)
    assert not left, 'unfilled placeholders: %s' % left
    return text


def apply(template, rep):
    template = template.replace('{{NAV}}', partial('nav.partial.html')).replace('{{FOOTER}}', partial('footer.partial.html'))
    return prefill_panels(fill(template, rep))


def split_head(body):
    """The template starts with <title> and (optionally) <style>; lift them into <head> for the standalone page."""
    m = re.match(r'\s*<title>(.*?)</title>\s*(?:<style>(.*?)</style>)?\s*', body, re.S)
    assert m, 'template must start with <title>'
    return m.group(1), m.group(2) or '', body[m.end():]


def shared_style():
    """The site's stylesheet lives in the index template's <style>; every page inlines the same one."""
    m = re.search(r'<style>(.*?)</style>', read(os.path.join(SRC, 'index.template.html')), re.S)
    return m.group(1)


def sitemap():
    url = CONFIG['site_url']
    today = datetime.date.today().isoformat()
    rows = ''.join(f'\n  <url><loc>{url}{"" if out == "index.html" else out}</loc><lastmod>{today}</lastmod>'
                   f'<changefreq>monthly</changefreq><priority>{"1.0" if out == "index.html" else "0.8"}</priority></url>'
                   for _, out, _, _, _ in PAGES)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{rows}\n</urlset>\n'


def page_head(title, tagline_or_suffix, description, canonical, style, csp):
    site = CONFIG['title']
    full = f"{site} — {CONFIG['tagline']}" if tagline_or_suffix is None else f"{tagline_or_suffix} — {site}"
    desc = description or CONFIG['description']
    url = CONFIG['site_url']
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="{csp}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>{full}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{canonical}">
<meta name="theme-color" content="#F5F5F3">
<link rel="icon" href="favicon.svg?v=2" type="image/svg+xml">
<link rel="icon" href="favicon-32.png?v=2" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="apple-touch-icon.png?v=2">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{site}">
<meta property="og:title" content="{full}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{url}og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" href="assets/fonts/hanken.woff2" as="font" type="font/woff2" crossorigin>
<style>{style}</style>
</head>
<body>
'''


def build_site():
    out = os.path.join(DIST, 'site')
    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(os.path.join(out, 'assets', 'img'))
    os.makedirs(os.path.join(out, 'assets', 'fonts'))
    os.makedirs(os.path.join(out, 'assets', 'vendor'))
    # assets
    for name in LINES + EXTRA_IMAGES + ['facility3d_still']:
        shutil.copy(os.path.join(ASSETS, 'img', f'{name if name == "facility3d_still" else "line_" + name}.webp'), os.path.join(out, 'assets', 'img'))
    for f in ('hanken.woff2', 'hanken-italic.woff2'):
        shutil.copy(os.path.join(ASSETS, 'fonts', f), os.path.join(out, 'assets', 'fonts'))
    for rel, src in SCRIPTS:
        shutil.copy(src, os.path.join(out, rel))
    for f in ('robots.txt', '404.html', 'favicon.svg'):
        p = os.path.join(SRC, f)
        if os.path.exists(p):
            shutil.copy(p, out)
    open(os.path.join(out, 'sitemap.xml'), 'w').write(sitemap())
    for f in os.listdir(os.path.join(ASSETS, 'brand')) if os.path.isdir(os.path.join(ASSETS, 'brand')) else []:
        shutil.copy(os.path.join(ASSETS, 'brand', f), out)
    open(os.path.join(out, '.nojekyll'), 'w').close()

    # GitHub Pages cannot send security headers, so the policy travels in the document: scripts and fonts only from
    # this origin, inline styles allowed (the page's own <style>), network only to this origin and the form endpoint.
    form_origin = re.match(r'https://[^/]+', CONFIG['form'].get('action', '') or 'https://docs.google.com').group(0)
    csp = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; "
           f"connect-src 'self' {form_origin}; form-action 'self'; base-uri 'none'; object-src 'none'")
    url = CONFIG['site_url']
    total = 0
    for template, outname, suffix, description, line_key in PAGES:
        rep = common_replacements()
        rep.update({
            '{{SRC_FONT_HANKEN}}': 'assets/fonts/hanken.woff2',
            '{{SRC_FONT_HANKEN_I}}': 'assets/fonts/hanken-italic.woff2',
            '{{SRC_STILL}}': 'assets/img/facility3d_still.webp',
            '{{SCRIPTS}}': '\n'.join('<script src="%s" defer></script>' % rel for rel, _ in PAGE_SCRIPTS),
            '{{HERO_THREE}}': HERO_SCRIPTS[0][0],
            '{{HERO_FACILITY}}': HERO_SCRIPTS[1][0],
            '{{HOME}}': '' if outname == 'index.html' else 'index.html',
            '{{CURRICULUM_URL}}': 'curriculum.html',
        })
        for name in LINES:
            rep['{{SRC_LINE_%s}}' % name.upper()] = f'assets/img/line_{name}.webp'
        for k, v in LINE_PAGES:
            rep['{{URL_%s}}' % k.upper()] = v['slug'] + '.html'
        if line_key:
            rep.update(line_replacements(line_key, lambda name: f'assets/img/line_{name}.webp'))
        body = apply(read(os.path.join(SRC, template)), rep)
        title, style, markup = split_head(body)
        canonical = url if outname == 'index.html' else url + outname
        html = page_head(title, suffix, description, canonical, style or fill(shared_style(), rep), csp) + markup.rstrip() + '\n</body>\n</html>\n'
        open(os.path.join(out, outname), 'w').write(html)
        total += len(html.encode())
    return out, total


def build_artifact():
    """Single inlined files for the Claude artifact preview: index.html and curriculum.html (published separately)."""
    out = os.path.join(DIST, 'artifact')
    os.makedirs(out, exist_ok=True)
    art = CONFIG.get('artifact', {})
    total = 0
    for template, outname, suffix, description, line_key in PAGES:
        rep = common_replacements()
        rep.update({
            '{{SRC_FONT_HANKEN}}': 'data:font/woff2;base64,' + b64(os.path.join(ASSETS, 'fonts', 'hanken.woff2')),
            '{{SRC_FONT_HANKEN_I}}': 'data:font/woff2;base64,' + b64(os.path.join(ASSETS, 'fonts', 'hanken-italic.woff2')),
            '{{SRC_STILL}}': 'data:image/webp;base64,' + b64(os.path.join(ASSETS, 'img', 'facility3d_still.webp')),
            # page scripts run right away; the 3D bundle waits for the load event so text paints first
            '{{SCRIPTS}}': '\n'.join('<script>%s</script>' % read(src) for _, src in PAGE_SCRIPTS)
                           + ('\n<script>window.addEventListener("load",function(){\n' + '\n'.join(read(src) for _, src in HERO_SCRIPTS) + '\n});</script>'
                              if outname == 'index.html' else ''),
            '{{HERO_THREE}}': '',
            '{{HERO_FACILITY}}': '',
            # the two previews are separate artifacts; config.json carries their URLs once they exist
            '{{HOME}}': '' if outname == 'index.html' else art.get('home_url', 'index.html'),
            '{{CURRICULUM_URL}}': art.get('curriculum_url', 'curriculum.html'),
        })
        for name in LINES:
            rep['{{SRC_LINE_%s}}' % name.upper()] = 'data:image/webp;base64,' + b64(os.path.join(ASSETS, 'img', f'line_{name}.webp'))
        # each line preview is its own artifact; config.json's artifact.line_urls carries the URLs once they exist
        for k, v in LINE_PAGES:
            rep['{{URL_%s}}' % k.upper()] = art.get('line_urls', {}).get(k, v['slug'] + '.html')
        if line_key:
            rep.update(line_replacements(line_key, lambda name: 'data:image/webp;base64,' + b64(os.path.join(ASSETS, 'img', f'line_{name}.webp'))))
        html = apply(read(os.path.join(SRC, template)), rep)
        if outname != 'index.html':   # borrow the stylesheet from the index template
            html = html.replace('</title>', '</title>\n<style>%s</style>' % fill(shared_style(), rep), 1)
        open(os.path.join(out, outname), 'w').write(html)
        total += len(html.encode())
    return out, total


if __name__ == '__main__':
    args = set(sys.argv[1:])
    if not args or '--site' in args:
        p, n = build_site(); print(f'site      -> {os.path.relpath(p, ROOT)}/  ({len(PAGES)} pages, {n/1024:.0f} KB)')
    if not args or '--artifact' in args:
        p, n = build_artifact(); print(f'artifact  -> {os.path.relpath(p, ROOT)}/  ({len(PAGES)} files, {n/1024/1024:.2f} MB)')
