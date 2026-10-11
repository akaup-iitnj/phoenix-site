// Every link, image, script and font reference in the built site must point at a file the build produced.
// Runs against dist/site (the build runs first in CI and in `npm test`), so a renamed page or a typo in a
// template fails here before anything is deployed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SITE = path.resolve(__dirname, '../../dist/site');
const PAGES = fs.existsSync(SITE) ? fs.readdirSync(SITE).filter((f) => f.endsWith('.html')) : [];

function refsIn(html) {
  // href/src attributes, plus url(...) in inline styles; decode the few entities a URL can carry
  const out = [];
  for (const m of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) out.push(m[1]);
  for (const m of html.matchAll(/url\((["']?)([^)"']+)\1\)/g)) out.push(m[2]);
  return out.map((u) => u.replace(/&amp;/g, '&').replace(/&#x27;/g, "'"));
}

function isLocal(u) {
  return !/^(?:[a-z]+:|\/\/|#|data:)/i.test(u) && u.trim() !== '';
}

test('the build exists', () => {
  assert.ok(PAGES.length >= 11, `expected the built pages in ${SITE}, found ${PAGES.length}`);
  for (const p of ['index.html', 'facility.html', 'lines.html', 'curriculum.html', 'about.html', 'contact.html', 'night-lamp.html',
                   'flashlight.html', 'pen-holder.html', 'photo-frame.html', 'purified-water.html', '404.html'])
    assert.ok(PAGES.includes(p), `${p} was built`);
});

for (const page of PAGES) {
  test(`${page}: every local link and asset resolves`, () => {
    const html = fs.readFileSync(path.join(SITE, page), 'utf8');
    const missing = [];
    for (const ref of refsIn(html)) {
      if (!isLocal(ref)) continue;
      const [file, hash] = ref.split('#');
      const target = file === '' ? page : file.split('?')[0];
      const full = path.join(SITE, target);
      if (!fs.existsSync(full)) { missing.push(ref); continue; }
      if (hash && target.endsWith('.html')) {
        const doc = target === page ? html : fs.readFileSync(full, 'utf8');
        if (!new RegExp(`\\bid=["']${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(doc)) missing.push(ref + ' (no such anchor)');
      }
    }
    assert.deepEqual(missing, [], `${page} points at things that do not exist`);
  });
}

test('every page is reachable from the home page by following links', () => {
  if (!PAGES.length) return;
  const seen = new Set(['index.html']), queue = ['index.html'];
  while (queue.length) {
    const p = queue.shift();
    const html = fs.readFileSync(path.join(SITE, p), 'utf8');
    for (const ref of refsIn(html)) {
      if (!isLocal(ref)) continue;
      const file = ref.split('#')[0].split('?')[0];
      if (file.endsWith('.html') && !seen.has(file) && fs.existsSync(path.join(SITE, file))) { seen.add(file); queue.push(file); }
    }
  }
  const unreachable = PAGES.filter((p) => p !== '404.html' && !seen.has(p));
  assert.deepEqual(unreachable, [], 'pages nothing links to');
});

test('the sitemap lists exactly the pages that were built', () => {
  if (!PAGES.length) return;
  const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+\/(?:phoenix-site\/)?/, '') || 'index.html');
  const built = PAGES.filter((p) => p !== '404.html').sort();
  assert.deepEqual(listed.sort(), built);
});
