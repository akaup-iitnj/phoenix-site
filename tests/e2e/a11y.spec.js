// Accessibility: axe-core scan of the whole page plus keyboard reachability.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { openHome, scrollTo } = require('./helpers');

test.describe('accessibility', () => {
  test.beforeEach(async ({}, testInfo) => { test.skip(testInfo.project.name === 'tablet', 'phone and desktop cover these'); });
  test('no serious or critical axe violations', async ({ page }) => {
    await openHome(page);
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    const bad = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n  ')}`).join('\n');
    expect(bad, summary).toEqual([]);
  });

  test('the form is usable with a keyboard alone', async ({ page }) => {
    await openHome(page);
    await scrollTo(page, '#contact');
    await page.locator('#name').focus();
    await page.keyboard.type('Ash Kaup');
    await page.keyboard.press('Tab');
    await expect(page.locator('#email')).toBeFocused();
    await page.keyboard.type('akaup@iitnj.edu');
    await page.keyboard.press('Tab');
    await expect(page.locator('#send')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.contact')).toHaveAttribute('data-state', 'sent');
  });

  test('language, landmarks and headings are in place', async ({ page }) => {
    await openHome(page);
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
    expect(await page.locator('main').count()).toBe(1);
    expect(await page.locator('header').count()).toBe(1);
    expect(await page.locator('footer').count()).toBe(1);
    expect(await page.locator('h1').count()).toBe(1);
    const levels = await page.locator('h1, h2, h3').evaluateAll((els) => els.map((e) => +e.tagName[1]));
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], 'no skipped heading levels').toBeLessThanOrEqual(1);
  });
});
