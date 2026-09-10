// Brand and content rules: what the page must and must not say, and that it stays self-contained.
const { test, expect } = require('@playwright/test');
const { CONFIG, openHome } = require('./helpers');

const FORBIDDEN = [/dolang/i, /lorem ipsum/i, /\{\{[A-Z_]+\}\}/, /TODO/, /placeholder text/i];

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
    for (const asset of ['assets/site.js', 'assets/form.js', 'assets/facility3d.js', '404.html', 'robots.txt', 'sitemap.xml']) {
      const body = await (await request.get(`${baseURL}/${asset}`)).text();
      for (const re of FORBIDDEN) expect(body, `${asset} matches ${re}`).not.toMatch(re);
    }
  });

  test('key copy is present', async ({ page }) => {
    await openHome(page);
    await expect(page.locator('h1')).toHaveText('The factory that teaches.');
    await expect(page.locator('.hero .sub')).toContainText('Designed and delivered as one.');
    const h2s = await page.locator('h2').allTextContents();
    for (const h of ['One facility. Every part of the program.', 'Walk the facility.', 'The production floor makes a real product.', 'Book a walkthrough.'])
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

  test('404 page, robots and sitemap are served', async ({ request, baseURL }) => {
    const missing = await request.get(`${baseURL}/does-not-exist`);
    expect(missing.status()).toBe(404);
    expect(await missing.text()).toContain('Phoenix Industrial Labs');
    expect(await (await request.get(`${baseURL}/robots.txt`)).text()).toContain('Sitemap:');
    expect(await (await request.get(`${baseURL}/sitemap.xml`)).text()).toContain(CONFIG.site_url);
    expect((await request.get(`${baseURL}/og.jpg`)).status()).toBe(200);
    expect((await request.get(`${baseURL}/favicon.svg`)).status()).toBe(200);
  });
});
