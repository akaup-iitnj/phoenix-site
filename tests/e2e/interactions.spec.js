// Everything a visitor can click, tap, drag or type.
const { test, expect } = require('@playwright/test');
const { openHome, scrollTo } = require('./helpers');

// Interactions are the same on a tablet as on a phone or desktop; the tablet project covers layout only.
test.beforeEach(async ({}, testInfo) => { test.skip(testInfo.project.name === 'tablet', 'phone and desktop cover these'); });

test.describe('navigation', () => {
  test('nav links reach their sections and the page returns to the top', async ({ page, isMobile }) => {
    await openHome(page);
    test.skip(isMobile, 'section links are hidden in the mobile nav (Contact stays)');
    for (const [label, id] of [['The facility', 'facility'], ['The line', 'line'], ['Curriculum', 'curriculum']]) {
      await page.locator('.links a', { hasText: label }).click();
      await page.waitForTimeout(300);
      const top = await page.locator(`#${id}`).evaluate((el) => el.getBoundingClientRect().top);
      expect(top, `${label} lands below the sticky nav`).toBeGreaterThanOrEqual(0);
      expect(top).toBeLessThan(140);
    }
    await page.locator('.footer .totop').click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('contact button is always reachable and lands on the form', async ({ page }) => {
    await openHome(page);
    await page.locator('.links .cta').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#name')).toBeInViewport();
  });

  test('nav stays visible while scrolling', async ({ page }) => {
    await openHome(page);
    await page.evaluate(() => window.scrollTo(0, 2400));
    await page.waitForTimeout(200);
    const box = await page.locator('.nav').boundingBox();
    expect(box.y).toBe(0);
    await expect(page.locator('.brand')).toBeVisible();
  });
});

test.describe('reveal chips', () => {
  test('selecting a chip swaps the description and updates ARIA', async ({ page }) => {
    await openHome(page);
    const group = page.locator('[data-reveal]').first();
    const tabs = group.locator('[role="tab"]');
    const panel = group.locator('.panel');
    await expect(panel).toContainText('A computer lab and instruction rooms');
    await tabs.filter({ hasText: 'Curriculum' }).click();
    await expect(panel).toContainText('225 hours each');
    await expect(tabs.filter({ hasText: 'Curriculum' })).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.filter({ hasText: 'Classrooms' })).toHaveAttribute('aria-selected', 'false');
    expect(await tabs.evaluateAll((els) => els.filter((e) => e.getAttribute('aria-selected') === 'true').length)).toBe(1);
    const panelId = await panel.getAttribute('id');
    await expect(tabs.first()).toHaveAttribute('aria-controls', panelId);
    await expect(panel).toHaveAttribute('aria-labelledby', await tabs.filter({ hasText: 'Curriculum' }).getAttribute('id'));
  });

  test('arrow keys move through the chips', async ({ page }) => {
    await openHome(page);
    const group = page.locator('[data-reveal]').first();
    const tabs = group.locator('[role="tab"]');
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(tabs.last()).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.first()).toBeFocused();
  });

  test('reduced motion swaps text immediately', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', baseURL: 'http://127.0.0.1:4173' });
    const page = await ctx.newPage();
    await openHome(page);
    const group = page.locator('[data-reveal]').first();
    await group.locator('[role="tab"]', { hasText: 'Curriculum' }).click();
    expect(await group.locator('.panel').textContent()).toContain('225 hours each');
    await ctx.close();
  });
});

test.describe('production lines', () => {
  const LINES = [
    ['Flashlight', 'Flashlight.'], ['Pen holder', 'Pen holder.'], ['Photo frame', 'Photo frame.'],
    ['Purified water', 'Purified water.'], ['Creative night light', 'Creative night light.'],
  ];

  test('each line chip shows its own image and caption', async ({ page }) => {
    await openHome(page);
    await scrollTo(page, '#line');
    const slides = page.locator('#line-art .slide');
    for (let i = 0; i < LINES.length; i++) {
      await page.locator('#line [role="tab"]', { hasText: LINES[i][0] }).click();
      await expect(page.locator('#line .panel b')).toHaveText(LINES[i][1]);
      await expect(slides.nth(i)).toHaveClass(/is-on/);
      expect(await slides.evaluateAll((els) => els.filter((e) => e.classList.contains('is-on')).length)).toBe(1);
      await expect(slides.nth(i)).toHaveCSS('opacity', '1');
      const loaded = await slides.nth(i).evaluate((img) => img.complete && img.naturalWidth > 0);
      expect(loaded, `${LINES[i][0]} image decoded`).toBe(true);
    }
  });

  test('battery cell manufacturing reads as coming soon', async ({ page }) => {
    await openHome(page);
    await scrollTo(page, '#line');
    await page.locator('#line [role="tab"]', { hasText: 'Battery cell manufacturing' }).click();
    await expect(page.locator('#line .panel')).toHaveText('Battery cell manufacturing. Coming soon.');
    const soon = page.locator('#line-art .slide.soon');
    await expect(soon).toHaveClass(/is-on/);
    await expect(soon).toHaveCSS('opacity', '1');
    await expect(soon).toHaveText('Coming soon');
    expect(await page.locator('#line-art img.is-on').count()).toBe(0);
  });

  test('the flashlight line fills the stage on phones and fits on desktop', async ({ page, isMobile }) => {
    await openHome(page);
    await scrollTo(page, '#line');
    const fit = await page.locator('#line-art img').first().evaluate((el) => getComputedStyle(el).objectFit);
    expect(fit).toBe(isMobile ? 'cover' : 'contain');
  });
});

test.describe('hero', () => {
  test('the still image shows at once, then the 3D facility takes over (or the still stays)', async ({ page }) => {
    await openHome(page);
    const host = page.locator('#hero3d');
    const still = page.locator('#hero-fallback');
    await expect(still).toBeVisible();
    expect(await still.evaluate((i) => i.complete && i.naturalWidth > 1000)).toBe(true);
    await expect.poll(async () => host.getAttribute('data-3d'), { timeout: 15000 }).toMatch(/live|unsupported|failed/);
    const state = await host.getAttribute('data-3d');
    if (state === 'live') {
      await expect(host).toHaveClass(/is-live/);
      const canvas = host.locator('canvas');
      await expect(canvas).toBeVisible();
      await expect(canvas).toHaveCSS('opacity', '1');
      await expect(still).toHaveCSS('opacity', '0');
      const box = await canvas.boundingBox();
      expect(box.width).toBeGreaterThan(200);
      expect(box.height).toBeGreaterThan(100);
      expect(+(await host.getAttribute('data-frames'))).toBeGreaterThan(0);
    } else {
      await expect(still).toHaveCSS('opacity', '1');
    }
  });

  test('?no3d keeps the still image and never fetches the 3D bundle', async ({ page, baseURL }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto('/?no3d');
    await page.waitForTimeout(1200);
    await expect(page.locator('#hero-fallback')).toBeVisible();
    await expect(page.locator('#hero-fallback')).toHaveCSS('opacity', '1');
    expect(requests.some((u) => /three\.min\.js|facility3d\.js/.test(u))).toBe(false);
    expect(await page.locator('#hero3d canvas').count()).toBe(0);
  });

  test('dragging rotates the model', async ({ page }) => {
    await openHome(page);
    const host = page.locator('#hero3d');
    await expect.poll(async () => host.getAttribute('data-3d'), { timeout: 15000 }).toMatch(/live|unsupported|failed/);
    test.skip((await host.getAttribute('data-3d')) !== 'live', 'no WebGL in this browser');
    await host.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await host.boundingBox();
    const vh = page.viewportSize().height;
    const y = Math.min(Math.max(box.y + box.height * 0.5, 90), vh - 30);
    const before = parseFloat(await host.getAttribute('data-az'));
    const f0 = +(await host.getAttribute('data-frames'));
    await page.mouse.move(box.x + box.width * 0.5, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, y, { steps: 10 });
    await page.mouse.up();
    // software rendering can be slow: wait for a couple of frames to report the new angle
    await expect.poll(async () => +(await host.getAttribute('data-frames')), { timeout: 8000 }).toBeGreaterThan(f0 + 1);
    const after = parseFloat(await host.getAttribute('data-az'));
    expect(Math.abs(after - before), 'azimuth changed by more than idle autorotation would').toBeGreaterThan(0.4);
  });
});

test.describe('walk the facility', () => {
  test('scrolling through the steps updates the label and marker', async ({ page }) => {
    await openHome(page);
    const steps = page.locator('#steps .step');
    const label = page.locator('#label');
    const centre = async (i) => {
      await page.evaluate((k) => {
        const s = document.querySelectorAll('#steps .step')[k];
        window.scrollTo(0, s.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.5 + 10);
      }, i);
      await page.waitForTimeout(600);
    };
    await centre(1);
    await expect(label).toHaveAttribute('data-step', '1');
    await expect(page.locator('#label-h')).toHaveText('Trainer Kits');
    const m1 = await page.locator('#mark').evaluate((m) => m.style.left);
    await centre(2);
    await expect(label).toHaveAttribute('data-step', '2');
    await expect(page.locator('#label-h')).toHaveText('Factory Floor');
    expect(await page.locator('#mark').evaluate((m) => m.style.left)).not.toBe(m1);
    await centre(0);
    await expect(page.locator('#label-h')).toHaveText('Classrooms and Labs');
    expect(await steps.count()).toBe(3);
  });
});

test.describe('contact form', () => {
  test('rejects an empty submission and points at the first problem', async ({ page }) => {
    await openHome(page);
    await scrollTo(page, '#contact');
    await page.locator('#send').click();
    await expect(page.locator('.contact')).toHaveAttribute('data-state', 'invalid');
    await expect(page.locator('#note')).toHaveText('Add a name and a working email address.');
    await expect(page.locator('#name')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#name')).toBeFocused();
  });

  test('rejects a malformed email but keeps a valid name', async ({ page }) => {
    await openHome(page);
    await scrollTo(page, '#contact');
    await page.fill('#name', 'Ash Kaup');
    await page.fill('#email', 'ash@nowhere');
    await page.locator('#send').click();
    await expect(page.locator('#name')).toHaveAttribute('aria-invalid', 'false');
    await expect(page.locator('#email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#note')).toHaveText('Add a working email address.');
    await expect(page.locator('#email')).toBeFocused();
  });

  test('a valid lead reaches the thank-you state and can add another', async ({ page }) => {
    await openHome(page);
    await scrollTo(page, '#contact');
    await page.fill('#name', 'Ash Kaup');
    await page.fill('#email', 'akaup@iitnj.edu');
    await page.locator('#send').click();
    await expect(page.locator('.contact')).toHaveAttribute('data-state', 'sent');
    await expect(page.locator('#thanks')).toBeVisible();
    await expect(page.locator('#thanks-h')).toHaveText('Thank you, Ash.');
    await expect(page.locator('#lead')).toBeHidden();
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem('pil-leads') || '[]'));
    expect(log.at(-1)).toMatchObject({ n: 'Ash Kaup', e: 'akaup@iitnj.edu' });
    await page.locator('#another').click();
    await expect(page.locator('#lead')).toBeVisible();
    await expect(page.locator('#name')).toHaveValue('');
    await expect(page.locator('#name')).toBeFocused();
  });

  test('posts to the configured Google Form endpoint with entry fields', async ({ page }) => {
    await openHome(page);
    let posted = null;
    await page.route('https://docs.google.com/**', (route) => { posted = route.request(); route.fulfill({ status: 200, body: '' }); });
    await page.evaluate(() => {
      const f = document.getElementById('lead');
      f.setAttribute('data-action', 'https://docs.google.com/forms/d/e/TEST/formResponse');
      f.setAttribute('data-name-field', 'entry.101');
      f.setAttribute('data-email-field', 'entry.202');
      f.setAttribute('data-source-field', 'entry.303');
    });
    await scrollTo(page, '#contact');
    await page.fill('#name', 'Dean Example');
    await page.fill('#email', 'dean@college.edu');
    await page.locator('#send').click();
    await expect(page.locator('.contact')).toHaveAttribute('data-state', 'sent');
    expect(posted, 'a request reached the form endpoint').not.toBeNull();
    expect(posted.method()).toBe('POST');
    const body = new URLSearchParams(posted.postData());
    expect(body.get('entry.101')).toBe('Dean Example');
    expect(body.get('entry.202')).toBe('dean@college.edu');
    expect(body.get('entry.303')).toBe('phoenixindustriallabs.com');
  });

  test('reports a failed submission and lets the visitor retry', async ({ page }) => {
    await openHome(page);
    await page.route('https://docs.google.com/**', (route) => route.abort('failed'));
    await page.evaluate(() => document.getElementById('lead').setAttribute('data-action', 'https://docs.google.com/forms/d/e/TEST/formResponse'));
    await scrollTo(page, '#contact');
    await page.fill('#name', 'Ash');
    await page.fill('#email', 'akaup@iitnj.edu');
    await page.locator('#send').click();
    await expect(page.locator('.contact')).toHaveAttribute('data-state', 'error');
    await expect(page.locator('#note')).toHaveText('That did not go through. Try again.');
    await expect(page.locator('#send')).toBeEnabled();
    await expect(page.locator('#lead')).toBeVisible();
  });
});
