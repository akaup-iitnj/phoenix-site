// Shared helpers for the e2e suite.
const fs = require('fs');
const path = require('path');

const CONFIG = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../config.json'), 'utf8'));

/** Open the home page while recording console errors, page errors and every network request. */
async function openHome(page, opts = {}) {
  const log = { consoleErrors: [], pageErrors: [], requests: [] };
  page.on('console', (m) => { if (m.type() === 'error') log.consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => log.pageErrors.push(e.message));
  page.on('request', (r) => log.requests.push(r.url()));
  await page.goto('/', { waitUntil: 'load' });
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

module.exports = { CONFIG, openHome, scrollTo };
