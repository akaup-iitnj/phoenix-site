// Abuse the page the way a bored visitor, a flaky network or a bot would, and check nothing breaks or leaks.
const { test, expect } = require('@playwright/test');
const { openHome, scrollTo, menuMode } = require('./helpers');

test.beforeEach(async ({}, testInfo) => { test.skip(testInfo.project.name === 'tablet', 'phone and desktop cover these'); });

const HOSTILE = [
  '<script>window.__x=1</script>', '"><img src=x onerror=window.__x=1>', "Robert'); DROP TABLE leads;--",
  'rtl \u202eevil\u202c 名前 🚀 ñ ü ß', 'A'.repeat(300), '%00%0d%0aBcc:x@y.z', '=HYPERLINK("http://x","y")', ' \t\n ', '../../etc/passwd',
];

test.describe('stress', () => {
  test('survives a chaos session and still works afterwards', async ({ page, viewport, isMobile }) => {
    test.setTimeout(120000);
    const log = await openHome(page, { no3d: true });            // the model has its own tests; here the CPU belongs to the DOM
    let posts = 0;
    await page.route('https://docs.google.com/**', (route) => { posts++; route.fulfill({ status: 200, body: '' }); });
    await page.evaluate(() => document.getElementById('lead').setAttribute('data-action', 'https://docs.google.com/forms/d/e/TEST/formResponse'));

    // 1. hammer the chips out of order, then spam the keyboard on a tablist
    const chips = page.locator('[data-reveal] [role="tab"]');
    const n = await chips.count();
    for (let i = 0; i < 24; i++) await chips.nth((i * 7) % n).dispatchEvent('click');
    await chips.first().focus();
    for (const k of ['ArrowRight', 'ArrowRight', 'End', 'Home', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Enter', 'Space', 'Tab', 'Shift+Tab', 'Escape']) await page.keyboard.press(k);

    // 2. menu spam (phones) and a resize storm
    if (menuMode(page)) for (let i = 0; i < 12; i++) await page.locator('#menu').dispatchEvent('click');
    for (const w of [320, 1600, 700, 1024, viewport.width]) { await page.setViewportSize({ width: w, height: viewport.height }); await page.waitForTimeout(40); }

    // 3. scroll storm through the whole page and back
    for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, i % 4 === 3 ? -2600 : 1600); await page.waitForTimeout(20); }
    await page.evaluate(() => window.scrollTo(0, 0));

    // 4. the tab goes to the background and comes back
    await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('load')); });

    // 5. hostile input, submitted quickly one after another
    await scrollTo(page, '#contact');
    for (const s of HOSTILE) {
      await page.fill('#name', s).catch(() => {});
      await page.fill('#email', s.includes('@') ? s : `${s.replace(/[^a-z]/gi, '') || 'x'}@example.edu`).catch(() => {});
      await page.locator('#send').dispatchEvent('click');
      await expect.poll(() => page.locator('.contact').getAttribute('data-state')).toMatch(/invalid|sent|error/);   // settled, not 'sending'
      if ((await page.locator('.contact').getAttribute('data-state')) === 'sent') await page.locator('#another').click();
    }
    expect(await page.evaluate(() => window.__x)).toBeUndefined();
    expect(posts).toBeLessThanOrEqual(HOSTILE.length);

    // 6. the page is intact: no errors, no sideways scroll, no stored personal data, and it still responds
    expect(log.pageErrors).toEqual([]);
    expect(log.consoleErrors.filter((m) => !/net::ERR|Failed to load resource/.test(m))).toEqual([]);
    const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(sw).toBeLessThanOrEqual(iw);
    expect(await page.evaluate(() => Object.keys(localStorage).length + Object.keys(sessionStorage).length)).toBe(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    const group = page.locator('[data-reveal]').first();
    await group.locator('[role="tab"]', { hasText: 'Curriculum' }).click();
    await expect(group.locator('.panel')).toContainText('225 hours each');
    expect(await page.locator('[role="tab"][aria-selected="true"]').count(), 'exactly one selected chip per group').toBe(3);
  });

  test('the model keeps its frame budget honest: no per-frame allocations leak the heap', async ({ page }) => {
    await openHome(page);
    const host = page.locator('#hero3d');
    await expect.poll(async () => host.getAttribute('data-3d'), { timeout: 15000 }).toMatch(/live|unsupported|failed/);
    test.skip((await host.getAttribute('data-3d')) !== 'live', 'no WebGL in this browser');
    const heap = async () => page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));
    const f0 = +(await host.getAttribute('data-frames'));
    const h0 = await heap();
    await page.waitForTimeout(2500);
    const f1 = +(await host.getAttribute('data-frames'));
    const h1 = await heap();
    expect(f1, 'the loop is running').toBeGreaterThan(f0);
    if (h0) expect(h1 - h0, 'heap growth over 2.5 s of rendering (bytes)').toBeLessThan(25 * 1024 * 1024);
  });
});
