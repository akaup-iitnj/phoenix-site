// Production-line pages (built from src/lines.json through src/line.template.html), and the way the home page reaches them.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { CONFIG, openHome, scrollTo } = require('./helpers');

const LINES = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../src/lines.json'), 'utf8'));
const PAGES = Object.entries(LINES).filter(([k, v]) => !k.startsWith('_') && v.page);

test.describe('line pages', () => {
  test('there is at least one line page, and every line with a page is linked from its chip', async ({ page }) => {
    expect(PAGES.length).toBeGreaterThan(0);
    await openHome(page);
    await scrollTo(page, '#line');
    for (const [, line] of PAGES) {
      await page.locator('#line [role="tab"]', { hasText: line.name }).click();
      const link = page.locator('#line .panel a.more');
      await expect(link).toHaveText(/See the line/);
      await expect(link).toHaveAttribute('href', `${line.slug}.html`);
    }
  });

  for (const [key, line] of PAGES) {
    const p = line.page;
    test(`${line.name}: the page tells the line's story and leads back home`, async ({ page, isMobile }) => {
      await openHome(page);
      await scrollTo(page, '#line');
      await page.locator('#line [role="tab"]', { hasText: line.name }).click();
      await page.locator('#line .panel a.more').click();
      await page.waitForURL(new RegExp(`${line.slug}\\.html$`));
      await expect(page).toHaveTitle(`${line.name} line — ${CONFIG.title}`);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', p.description);
      await expect(page.locator('h1')).toHaveText(p.h1);
      // hero image and facts
      const hero = page.locator('.line-hero img');
      await expect(hero).toHaveAttribute('src', `assets/img/line_${key}.webp`);
      expect(await hero.evaluate((i) => i.complete && i.naturalWidth >= 1900)).toBe(true);
      const facts = page.locator('.line-hero .facts > div');
      expect(await facts.count()).toBe(p.facts.length);
      for (let i = 0; i < p.facts.length; i++) await expect(facts.nth(i).locator('b')).toHaveText(p.facts[i][0]);
      // the route: one chip per stop, one ring per stop, the chosen stop's ring shown
      const chips = page.locator('#route [role="tab"]');
      expect(await chips.count()).toBe(p.route.steps.length);
      expect(await page.locator('#route-art .slide').count()).toBe(p.route.steps.length);
      await scrollTo(page, '#route');
      for (const i of [0, Math.floor(p.route.steps.length / 2), p.route.steps.length - 1]) {
        await chips.nth(i).click();
        await expect(page.locator('#route .panel b')).toHaveText(`${p.route.steps[i][0]}.`);
        await expect(page.locator('#route .panel')).toContainText(p.route.steps[i][1]);
        await expect(page.locator('#route-art .slide').nth(i)).toHaveClass(/is-on/);
        expect(await page.locator('#route-art .slide.is-on').count()).toBe(1);
      }
      // the schematic is a desktop nicety: hidden on phones, where the chips and text carry the content
      expect(await page.locator('#route-art').isVisible()).toBe(!isMobile);
      // built, skills, glance, closing
      expect(await page.locator('#built .pack > div').count()).toBe(p.built.items.length);
      if (p.image2) {
        const fig = page.locator('.line-figure img');
        await fig.scrollIntoViewIfNeeded();
        await expect(fig).toHaveAttribute('src', `assets/img/line_${p.image2}.webp`);
        expect(await fig.evaluate((i) => i.complete && i.naturalWidth >= 1900)).toBe(true);
      }
      const skills = page.locator('#skills [role="tab"]');
      expect(await skills.count()).toBe(p.skills.groups.length);
      await scrollTo(page, '#skills');
      await skills.nth(1).click();
      await expect(page.locator('#skills .panel b')).toHaveText(`${p.skills.groups[1][0]}.`);
      await expect(page.locator('#skills .more-link a')).toHaveAttribute('href', 'curriculum.html');
      expect(await page.locator('.glance dt').count()).toBe(p.glance.length);
      await expect(page.locator('.closing h2')).toHaveText(p.closing.h);
      await expect(page.locator('.closing .btn')).toHaveAttribute('href', 'index.html#contact');
      // the shared nav points home from an inner page
      if (isMobile) await page.locator('#menu').click();
      await expect(page.locator('.links a', { hasText: 'The line' })).toHaveAttribute('href', 'index.html#line');
    });

    test(`${line.name}: no sideways scroll, no errors, no vendor names, accessible`, async ({ page, request, baseURL }, testInfo) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`/${line.slug}.html`, { waitUntil: 'load' });
      await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
      for (const y of [0, 1200, 3000, 99999]) {
        await page.evaluate((v) => window.scrollTo(0, v), y);
        await page.waitForTimeout(80);
        const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
        expect(sw, `scrollWidth at y=${y}`).toBeLessThanOrEqual(iw);
      }
      expect(errors).toEqual([]);
      const html = await (await request.get(`${baseURL}/${line.slug}.html`)).text();
      for (const re of [/dolang/i, /\bDL[A-Z]{2,}-[A-Z]*\d{3}/, /allen[- ]bradley/i, /\bfanuc\b/i, /cognex/i, /keyence/i, /siemens/i, /mitsubishi/i, /\{\{[A-Z0-9_]+\}\}/])
        expect(html, `page matches ${re}`).not.toMatch(re);
      expect(await page.locator('h1').count()).toBe(1);
      const levels = await page.locator('h1, h2, h3').evaluateAll((els) => els.map((e) => +e.tagName[1]));
      for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], 'no skipped heading levels').toBeLessThanOrEqual(1);
      if (testInfo.project.name !== 'tablet') {
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
        const bad = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
        expect(bad.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      }
    });
  }

  test('every line page is in the sitemap', async ({ request, baseURL }) => {
    const sitemap = await (await request.get(`${baseURL}/sitemap.xml`)).text();
    for (const [, line] of PAGES) expect(sitemap).toContain(`<loc>${CONFIG.site_url}${line.slug}.html</loc>`);
  });
});
