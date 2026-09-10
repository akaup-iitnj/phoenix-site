// Lighthouse budgets for the built site (mobile emulation, simulated 4G throttling).
//
// Two runs:
//   1. The page with the 3D hero switched off (?no3d): the strict budget (shared CI runners score 5-10 points
//      below a laptop, so the bar sits at 75). This is what every visitor gets
//      before the model loads, and what a phone shows if WebGL is unavailable.
//   2. The full page: reported, with a loose floor. Headless Chrome has no GPU, so WebGL context creation and
//      shader compilation run in software and look 5-10x slower than on a real phone; treat these numbers as a
//      regression alarm, not as what visitors see.
//
// Usage: node tools/lighthouse.js [baseUrl] [--devtools]   (default http://127.0.0.1:4173/)
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const base = (process.argv.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const devtools = process.argv.includes('--devtools');
const RUNS = [
  { name: 'page without 3D (strict)', url: base + '?no3d', budgets: { performance: 0.75, accessibility: 0.95, 'best-practices': 0.9, seo: 0.9 }, fcpMax: 2000 },
  { name: 'full page with 3D (floor)', url: base, budgets: { performance: 0.3, accessibility: 0.95, 'best-practices': 0.9, seo: 0.9 }, fcpMax: 2000 },
];

async function run(lighthouse, chrome, cfg) {
  const flags = { port: chrome.port, output: ['html', 'json'], logLevel: 'error', onlyCategories: Object.keys(cfg.budgets) };
  if (devtools) flags.throttlingMethod = 'devtools';
  const result = await lighthouse(cfg.url, flags);
  const slug = cfg.url.includes('no3d') ? 'no3d' : 'full';
  fs.writeFileSync(`lighthouse-report-${slug}.html`, result.report[0]);
  fs.writeFileSync(`lighthouse-report-${slug}.json`, result.report[1]);
  const cats = result.lhr.categories, a = result.lhr.audits;
  let failed = false;
  console.log(`\n${cfg.name}: ${cfg.url}`);
  for (const [id, min] of Object.entries(cfg.budgets)) {
    const score = cats[id].score, ok = score >= min;
    failed = failed || !ok;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${id.padEnd(15)} ${String(Math.round(score * 100)).padStart(3)}  (budget ${Math.round(min * 100)})`);
  }
  const fcp = a['first-contentful-paint'].numericValue;
  const fcpOk = fcp <= cfg.fcpMax;
  failed = failed || !fcpOk;
  const ms = (k) => a[k] && a[k].numericValue != null ? `${Math.round(a[k].numericValue)} ms` : 'n/a';
  console.log(`  ${fcpOk ? 'ok  ' : 'FAIL'} first paint     ${Math.round(fcp)} ms  (budget ${cfg.fcpMax})`);
  console.log(`       LCP ${ms('largest-contentful-paint')} · TBT ${ms('total-blocking-time')} · CLS ${a['cumulative-layout-shift'].displayValue} · transfer ${Math.round(a['total-byte-weight'].numericValue / 1024)} KB · report lighthouse-report-${slug}.html`);
  return !failed;
}

async function main() {
  const lighthouse = (await import('lighthouse')).default;
  const chromeLauncher = await import('chrome-launcher');
  let server = null;
  if (!process.argv.some((a) => /^https?:/.test(a))) {
    server = spawn(process.execPath, [path.join(__dirname, 'serve.js'), 'dist/site', '4173'], { stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 800));
  }
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  let ok = true;
  try {
    for (const cfg of RUNS) ok = (await run(lighthouse, chrome, cfg)) && ok;
  } finally {
    await chrome.kill();
    if (server) server.kill();
  }
  console.log(ok ? '\nLighthouse budgets met.' : '\nLighthouse budgets NOT met.');
  process.exitCode = ok ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
