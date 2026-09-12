// Brand and content rules: what the page must and must not say, and that it stays self-contained.
const { test, expect } = require('@playwright/test');
const { CONFIG, openHome } = require('./helpers');
const fs = require('fs');
const path = require('path');
const LINES = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../src/lines.json'), 'utf8'));
const LINE_PAGES = Object.values(LINES).filter((v) => v && v.page).map((v) => `${v.slug}.html`);

// No vendor names anywhere: not the equipment maker, and no controls/robot/vision platform brands on a program-level site.
const FORBIDDEN = [/dolang/i, /allen[- ]bradley/i, /\bfanuc\b/i, /cognex/i, /keyence/i, /siemens/i, /mitsubishi/i, /universal robots/i,
  /\bDL[A-Z]{2,}-[A-Z]*\d{3}/,   // the equipment maker's model numbers
  /lorem ipsum/i, /\{\{[A-Z0-9_]+\}\}/, /TODO/, /placeholder text/i];

test.describe('content', () => {
  test.beforeEach(async ({}, testInfo) => { test.skip(testInfo.project.name === 'tablet', 'phone and desktop cover these'); });
  test('title, description and canonical are set', async ({ page }) => {
    await openHome(page);
    await expect(page).toHaveTitle(`${CONFIG.title} — ${CONFIG.tagline}`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', CONFIG.description);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', CONFIG.site_url);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', CONFIG.site_url + 'og.jpg');
  });

  test('never mentions the vendor or leaves placeholders (page and scripts)', async ({ page, request, baseURL }) => {
    await openHome(page);
    const html = await page.content();
    for (const re of FORBIDDEN) expect(html, `page matches ${re}`).not.toMatch(re);
    for (const asset of ['curriculum.html', ...LINE_PAGES, 'assets/site.js', 'assets/form.js', 'assets/facility3d.js', '404.html', 'robots.txt', 'sitemap.xml']) {
      const body = await (await request.get(`${baseURL}/${asset}`)).text();
      for (const re of FORBIDDEN) expect(body, `${asset} matches ${re}`).not.toMatch(re);
    }
  });

  test('key copy is present', async ({ page }) => {
    await openHome(page);
    await expect(page.locator('h1')).toHaveText(CONFIG.tagline);
    await expect(page.locator('.hero .sub')).toContainText('Designed and delivered as one.');
    const h2s = await page.locator('h2').allTextContents();
    for (const h of ['One Facility. Every Part of the Program.', 'Walk the facility.', 'The production floor makes a real product.', 'Book a walkthrough.'])
      expect(h2s).toContain(h);
    await expect(page.locator('footer')).toContainText('Phoenix Industrial Labs');
  });

  test('course hours add up', async ({ page }) => {
    await openHome(page);
    const each = await page.locator('[data-reveal] [role="tab"]', { hasText: 'Curriculum' }).getAttribute('data-text');
    const m = each.match(/Five courses, (\d+) hours each/);
    expect(m, 'curriculum chip states hours per course').not.toBeNull();
    const total = await page.locator('#curriculum h2').textContent();
    const t = total.match(/([\d,]+) hours/);
    expect(t).not.toBeNull();
    expect(parseInt(t[1].replace(/,/g, ''), 10)).toBe(5 * parseInt(m[1], 10));
    expect(await page.locator('#curriculum [role="tab"]').count()).toBe(5);
  });

  test('every image has alt text and every line image is a 2x asset', async ({ page }) => {
    await openHome(page);
    const imgs = page.locator('img');
    const n = await imgs.count();
    for (let i = 0; i < n; i++) expect(await imgs.nth(i).getAttribute('alt'), `img #${i} alt`).not.toBeNull();
    const widths = await page.locator('#line-art img').evaluateAll((els) => els.map((e) => +e.getAttribute('width')));
    expect(widths.length).toBe(5);
    for (const w of widths) expect(w).toBeGreaterThanOrEqual(1900);
  });

  test('loads without errors and without third-party requests', async ({ page, baseURL }) => {
    const log = await openHome(page);
    await page.waitForTimeout(800);
    expect(log.pageErrors).toEqual([]);
    expect(log.consoleErrors).toEqual([]);
    const foreign = log.requests.filter((u) => !u.startsWith(baseURL) && !u.startsWith('data:'));
    expect(foreign, 'all requests stay on our origin').toEqual([]);
  });

  test('ships a content security policy and a referrer policy', async ({ page }) => {
    const log = await openHome(page);
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/script-src 'self'(;|$)/);              // no inline or third-party script may run
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/base-uri 'none'/);
    expect(csp).toMatch(/connect-src 'self' https:\/\/docs\.google\.com/);
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'strict-origin-when-cross-origin');
    // the policy must not be fighting the page itself
    await page.waitForTimeout(800);
    expect(log.consoleErrors.filter((m) => /Content Security Policy/i.test(m))).toEqual([]);
  });

  test('reads without JavaScript: copy, first descriptions, the still and a way to get in touch', async ({ browser, baseURL, request }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(baseURL + '/');
    await expect(page.locator('h1')).toHaveText(CONFIG.tagline);
    await expect(page.locator('#hero-fallback')).toBeVisible();
    const panels = await page.locator('.panel').allTextContents();
    expect(panels.length).toBe(3);
    for (const p of panels) expect(p.trim().length).toBeGreaterThan(20);
    expect(await page.locator('#lead').getAttribute('method')).toBe('post');   // no accidental GET with a name in the URL
    await ctx.close();
    const raw = await (await request.get(baseURL + '/')).text();
    const noscript = raw.match(/<noscript>([\s\S]*?)<\/noscript>/);
    expect(noscript && noscript[1]).toContain(`mailto:${CONFIG.contact_email}`);
  });

  test('404 page, robots and sitemap are served', async ({ request, baseURL }) => {
    const missing = await request.get(`${baseURL}/does-not-exist`);
    expect(missing.status()).toBe(404);
    expect(await missing.text()).toContain('Phoenix Industrial Labs');
    expect(await (await request.get(`${baseURL}/robots.txt`)).text()).toContain('Sitemap:');
    const sitemap = await (await request.get(`${baseURL}/sitemap.xml`)).text();
    expect(sitemap).toContain(`<loc>${CONFIG.site_url}</loc>`);
    expect(sitemap).toContain(`<loc>${CONFIG.site_url}curriculum.html</loc>`);
    expect((await request.get(`${baseURL}/og.jpg`)).status()).toBe(200);
    expect((await request.get(`${baseURL}/favicon.svg`)).status()).toBe(200);
  });
});
