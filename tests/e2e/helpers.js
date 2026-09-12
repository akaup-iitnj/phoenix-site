// Shared helpers for the e2e suite.
const fs = require('fs');
const path = require('path');

const CONFIG = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../config.json'), 'utf8'));

/** Open the home page while recording console errors, page errors and every network request. */
async function openHome(page, opts = {}) {
  const log = { consoleErrors: [], pageErrors: [], requests: [] };
  // Never let a test post a real lead: the Google Form endpoint is answered locally unless a test routes it itself.
  await page.route('https://docs.google.com/**', (route) => route.fulfill({ status: 200, body: '' }));
  page.on('console', (m) => { if (m.type() === 'error') log.consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => log.pageErrors.push(e.message));
  page.on('request', (r) => log.requests.push(r.url()));
  await page.goto(opts.no3d ? '/?no3d' : '/', { waitUntil: 'load' });
  if (!opts.keepSmoothScroll) await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
  await page.evaluate(() => document.fonts.ready);
  return log;
}

async function scrollTo(page, selector, offset = -80) {
  await page.evaluate(([s, o]) => {
    const el = document.querySelector(s);
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + o);
  }, [selector, offset]);
  await page.waitForTimeout(250);
}

/** The section links sit behind the menu button under 900px (phones and tablets in portrait). */
function menuMode(page) { return page.viewportSize().width < 900; }

module.exports = { CONFIG, openHome, scrollTo, menuMode };
