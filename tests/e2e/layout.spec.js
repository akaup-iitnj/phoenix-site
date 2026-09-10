// Layout across phone, tablet and desktop (runs once per Playwright project).
const { test, expect } = require('@playwright/test');
const { openHome, scrollTo } = require('./helpers');

test.describe('layout', () => {
  test('never scrolls sideways', async ({ page }) => {
    await openHome(page);
    for (const y of [0, 900, 2200, 4000, 99999]) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(120);
      const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      expect(sw, `scrollWidth at y=${y}`).toBeLessThanOrEqual(iw);
    }
  });

  test('headline fits the viewport and the CTA is above the fold', async ({ page, viewport }) => {
    await openHome(page);
    const h1 = await page.locator('h1').boundingBox();
    expect(h1.x).toBeGreaterThanOrEqual(0);
    expect(h1.x + h1.width).toBeLessThanOrEqual(viewport.width + 1);
    await expect(page.locator('.hero .btn')).toBeInViewport();
  });

  test('"One facility. Every part of the program." stays on one line on wide screens', async ({ page, viewport }) => {
    test.skip(viewport.width < 900, 'wraps by design below 900px');
    await openHome(page);
    const h = page.locator('.h2.oneline');
    const { height, fontSize } = await h.evaluate((el) => ({ height: el.getBoundingClientRect().height, fontSize: parseFloat(getComputedStyle(el).fontSize) }));
    expect(height).toBeLessThan(fontSize * 1.4);
  });

  test('the six package cells fill the row as a 3x2 grid (2x3 on narrow phones)', async ({ page, viewport }) => {
    await openHome(page);
    const cells = page.locator('.chips.grid3 button');
    expect(await cells.count()).toBe(6);
    const boxes = await cells.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    const rows = new Set(boxes.map((b) => Math.round(b.top)));
    expect(rows.size).toBe(viewport.width <= 480 ? 3 : 2);
    const wrap = await page.locator('.chips.grid3').boundingBox();
    const right = Math.max(...boxes.map((b) => b.right));
    expect(Math.abs(wrap.x + wrap.width - right)).toBeLessThan(2);
  });

  test('line images stay inside their stage', async ({ page }) => {
    await openHome(page);
    await scrollTo(page, '#line');
    const stage = await page.locator('#line-art').boundingBox();
    expect(stage.width).toBeGreaterThan(200);
    for (let i = 0; i < 5; i++) {
      await page.locator('#line [role="tab"]').nth(i).click();
      const img = await page.locator('#line-art img').nth(i).boundingBox();
      expect(img.x).toBeGreaterThanOrEqual(stage.x - 1);
      expect(img.x + img.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
      expect(img.y).toBeGreaterThanOrEqual(stage.y - 1);
      expect(img.y + img.height).toBeLessThanOrEqual(stage.y + stage.height + 1);
    }
  });

  test('tap targets are large enough', async ({ page }) => {
    await openHome(page);
    const boxes = await page.locator('button, a.btn, .links a, .footer .totop').evaluateAll((els) =>
      els.filter((e) => e.offsetParent !== null).map((e) => ({ t: e.textContent.trim(), h: e.getBoundingClientRect().height })));
    for (const b of boxes) expect(b.h, `"${b.t}" height`).toBeGreaterThanOrEqual(28);
  });

  test('form inputs and button line up without overflow', async ({ page, viewport }) => {
    await openHome(page);
    await scrollTo(page, '#contact');
    const form = await page.locator('#lead').boundingBox();
    expect(form.x + form.width).toBeLessThanOrEqual(viewport.width);
    const send = await page.locator('#send').boundingBox();
    expect(send.height).toBeGreaterThanOrEqual(44);
  });

  test('full page renders (visual record)', async ({ page }, testInfo) => {
    await openHome(page);
    await page.waitForTimeout(500);
    const shot = await page.screenshot({ fullPage: true });
    await testInfo.attach(`full-page-${testInfo.project.name}`, { body: shot, contentType: 'image/png' });
  });
});
