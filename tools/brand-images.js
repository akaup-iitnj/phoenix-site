// Generates the social preview (og.jpg) and PNG favicons from the site's own type and render.
// Usage: node tools/brand-images.js   (needs Playwright's Chromium: npx playwright install chromium)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'brand');
fs.mkdirSync(OUT, { recursive: true });

const font = fs.readFileSync(path.join(ROOT, 'assets/fonts/hanken.woff2')).toString('base64');
const still = fs.readFileSync(path.join(ROOT, 'assets/img/facility3d_still.webp')).toString('base64');

const og = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:H;font-weight:100 900;src:url(data:font/woff2;base64,${font}) format("woff2")}
html,body{margin:0}
body{width:1200px;height:630px;background:#F5F5F3;color:#1B1D20;font-family:H,sans-serif;position:relative;overflow:hidden}
.brand{position:absolute;left:72px;top:64px;font-size:26px;font-weight:500;letter-spacing:-.012em}
h1{position:absolute;left:72px;top:150px;margin:0;font-weight:300;font-size:96px;line-height:.98;letter-spacing:-.028em;max-width:520px}
p{position:absolute;left:72px;bottom:64px;margin:0;font-size:24px;line-height:1.35;color:#5C6066;max-width:440px}
img{position:absolute;left:585px;top:120px;width:680px;z-index:0}
.brand,h1,p{z-index:1}
</style></head><body>
<div class="brand">Phoenix Industrial Labs</div>
<h1>The factory that teaches.</h1>
<p>Classrooms, trainer labs, and a working production floor. Designed and delivered as one.</p>
<img src="data:image/webp;base64,${still}" alt="">
</body></html>`;

const icon = (size) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:H;font-weight:100 900;src:url(data:font/woff2;base64,${font}) format("woff2")}
html,body{margin:0}
body{width:${size}px;height:${size}px;background:#1B1D20;position:relative;font-family:H,sans-serif;border-radius:${size * 0.16}px;overflow:hidden}
span{position:absolute;left:0;right:0;top:0;bottom:0;display:flex;align-items:center;justify-content:center;color:#F5F5F3;font-weight:500;font-size:${size * 0.66}px;letter-spacing:-.04em;transform:translateY(-${size * 0.02}px)}
i{position:absolute;right:${size * 0.16}px;bottom:${size * 0.16}px;width:${size * 0.14}px;height:${size * 0.14}px;background:#BD4A15}
</style></head><body><span>P</span><i></i></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(og); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'og.jpg'), type: 'jpeg', quality: 88 });
  for (const [name, size] of [['favicon-32.png', 32], ['apple-touch-icon.png', 180], ['icon-512.png', 512]]) {
    const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await p.setContent(icon(size)); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(OUT, name), omitBackground: true });
    await p.close();
  }
  await browser.close();
  console.log('brand images ->', path.relative(ROOT, OUT));
})();
