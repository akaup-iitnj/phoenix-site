// The curriculum page and the footer (both pages share the nav and footer partials).
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { CONFIG, openHome, scrollTo, menuMode } = require('./helpers');

test.describe('curriculum page', () => {
  test('"Learn more" under the course chips opens the curriculum page, which links back home', async ({ page }) => {
    await openHome(page);
    await scrollTo(page, '#curriculum');
    const link = page.locator('.more-link a');
    await expect(link).toContainText('Learn more about the curriculum');
    await link.click();
    await page.waitForURL(/curriculum\.html$/);
    await expect(page).toHaveTitle(`Curriculum — ${CONFIG.title}`);
    await expect(page.locator('h1')).toHaveText('Five courses. One working line.');
    expect(await page.locator('.course').count()).toBe(5);
    // every course has a goal, a topic list and ten weeks
    for (let i = 0; i < 5; i++) {
      const c = page.locator('.course').nth(i);
      await expect(c.locator('.num')).toHaveText(`Course ${i + 1}`);
      expect((await c.locator('.goal').textContent()).length).toBeGreaterThan(60);
      expect(await c.locator('ul li').count()).toBeGreaterThanOrEqual(5);
      expect(await c.locator('.weeks li').count()).toBe(10);
    }
    await expect(page.locator('.course h2').first()).toHaveText('Industrial Foundations');
    await expect(page.locator('.course h2').last()).toHaveText('Production Floor III: Capstone Build');
    // the hours match the home page
    await expect(page.locator('.facts')).toContainText('225');
    await expect(page.locator('.facts')).toContainText('1,125');
    // the closing call to action and the brand both lead back to the home page
    await expect(page.locator('.closing .btn')).toHaveAttribute('href', 'index.html#contact');
    if (menuMode(page)) { await page.locator('#menu').click(); }
    await expect(page.locator('.links a', { hasText: 'The Facility' })).toHaveAttribute('href', 'index.html#facility');
    await page.locator('.brand').click();
    await page.waitForURL(/\/(index\.html)?#top$/);
    await expect(page.locator('h1')).toHaveText(CONFIG.tagline);
  });

  test('curriculum page: no sideways scroll, no errors, accessible', async ({ page, viewport }, testInfo) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/curriculum.html', { waitUntil: 'load' });
    await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
    for (const y of [0, 1500, 4000, 99999]) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(80);
      const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      expect(sw, `scrollWidth at y=${y}`).toBeLessThanOrEqual(iw);
    }
    expect(errors).toEqual([]);
    expect(await page.locator('h1').count()).toBe(1);
    const levels = await page.locator('h1, h2, h3').evaluateAll((els) => els.map((e) => +e.tagName[1]));
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], 'no skipped heading levels').toBeLessThanOrEqual(1);
    if (testInfo.project.name !== 'tablet') {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
      const bad = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
      expect(bad.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    }
  });
});

test.describe('footer', () => {
  test('carries the address with a map link, the contact email, section links and the legal line', async ({ page }) => {
    await openHome(page);
    const footer = page.locator('.footer');
    await scrollTo(page, '.footer');
    for (const line of CONFIG.address) await expect(footer.locator('address')).toContainText(line);
    const maps = footer.locator('a', { hasText: 'Open in Google Maps' });
    await expect(maps).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\//);
    await expect(maps).toHaveAttribute('target', '_blank');
    await expect(maps).toHaveAttribute('rel', /noopener/);
    await expect(footer.locator(`a[href="mailto:${CONFIG.contact_email}"]`)).toHaveText(CONFIG.contact_email);
    await expect(footer.locator('a[href="#facility"]')).toHaveCount(1);
    await expect(footer.locator('a[href="curriculum.html"]')).toHaveCount(1);
    await expect(footer).toContainText(`© ${new Date().getFullYear()} Phoenix Industrial Labs`);
    await expect(footer.locator('.fmark .logo')).toBeVisible();
    // the map link is the only external destination on the page, and it is a link, not an embed
    expect(await page.locator('iframe').count()).toBe(0);
  });
});
