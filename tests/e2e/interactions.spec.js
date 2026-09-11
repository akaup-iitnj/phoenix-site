// Everything a visitor can click, tap, drag or type.
const { test, expect } = require('@playwright/test');
const { openHome, scrollTo } = require('./helpers');

// Interactions are the same on a tablet as on a phone or desktop; the tablet project covers layout only.
test.beforeEach(async ({}, testInfo) => { test.skip(testInfo.project.name === 'tablet', 'phone and desktop cover these'); });

test.describe('navigation', () => {
  test('nav links reach their sections and the page returns to the top', async ({ page, isMobile }) => {
    await openHome(page);
    test.skip(isMobile, 'section links are hidden in the mobile nav (Contact stays)');
    for (const [label, id] of [['The facility', 'facility'], ['The line', 'line']]) {
      await page.locator('.links a', { hasText: label }).click();
      await page.waitForTimeout(300);
      const top = await page.locator(`#${id}`).evaluate((el) => el.getBoundingClientRect().top);
      expect(top, `${label} lands below the sticky nav`).toBeGreaterThanOrEqual(0);
      expect(top).toBeLessThan(140);
    }
    await page.locator('.footer .totop').click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator('.links a', { hasText: 'Curriculum' })).toHaveAttribute('href', 'curriculum.html');
  });

  test('contact button is always reachable and lands on the form', async ({ page }) => {
    await openHome(page);
    await page.locator('.nav .cta').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#name')).toBeInViewport();
  });

  test('the brand carries the phoenix mark and returns to the top', async ({ page }) => {
    await openHome(page);
    const logo = page.locator('.brand .logo');
    await expect(logo).toBeVisible();
    const box = await logo.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(20);
    expect(await logo.getAttribute('aria-hidden')).toBe('true');
    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.locator('.brand').click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('on phones the menu button opens the section links; a chosen link closes it', async ({ page, isMobile }) => {
    await openHome(page);
    const menu = page.locator('#menu'), links = page.locator('#links');
    if (!isMobile) {
      await expect(menu).toBeHidden();
      await expect(links.locator('a').first()).toBeVisible();
      return;
    }
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box.x, 'sits at the far left').toBeLessThan(40);
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(links).toBeHidden();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(links.locator('a', { hasText: 'The facility' })).toBeVisible();
    expect(await links.locator('a').allTextContents()).toEqual(['The facility', 'The line', 'Curriculum']);
    await expect(links.locator('.soon')).toContainText('Trainer kits');
    await links.locator('a', { hasText: 'The line' }).click();
    await page.waitForTimeout(400);
    await expect(links).toBeHidden();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    const top = await page.locator('#line').evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(0); expect(top).toBeLessThan(140);
    // Escape and a tap outside also close it
    await menu.click(); await expect(links).toBeVisible();
    await page.keyboard.press('Escape'); await expect(links).toBeHidden(); await expect(menu).toBeFocused();
    await menu.click(); await expect(links).toBeVisible();
    await page.mouse.click(200, 600); await expect(links).toBeHidden();
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
    ['Flashlight', 'Flashlight.'], ['Pen Holder', 'Pen holder.'], ['Photo Frame', 'Photo frame.'],
    ['Purified Water', 'Purified water.'], ['Night Lamp', 'Night lamp.'],
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
    await page.locator('#line [role="tab"]', { hasText: 'Battery Pack Manufacturing' }).click();
    await expect(page.locator('#line .panel')).toHaveText('Battery pack manufacturing. Coming soon.');
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

  test('losing the WebGL context brings the still image back', async ({ page }) => {
    await openHome(page);
    const host = page.locator('#hero3d');
    await expect.poll(async () => host.getAttribute('data-3d'), { timeout: 15000 }).toMatch(/live|unsupported|failed/);
    test.skip((await host.getAttribute('data-3d')) !== 'live', 'no WebGL in this browser');
    const lost = await page.evaluate(() => {
      const c = document.querySelector('#hero3d canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl');
      const ext = gl && gl.getExtension('WEBGL_lose_context'); if (!ext) return false; ext.loseContext(); return true;
    });
    test.skip(!lost, 'WEBGL_lose_context unavailable');
    await expect(host).toHaveAttribute('data-3d', 'failed');
    await expect(host).not.toHaveClass(/is-live/);
    await expect(page.locator('#hero-fallback')).toHaveCSS('opacity', '1');
    const frames = +(await host.getAttribute('data-frames'));
    await page.waitForTimeout(400);
    expect(+(await host.getAttribute('data-frames')), 'the render loop stopped').toBe(frames);
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
    expect(await page.evaluate(() => Object.keys(localStorage).length), 'nothing personal is kept in the browser').toBe(0);
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

  test('gives up on a hanging endpoint instead of spinning forever', async ({ page }) => {
    await openHome(page);
    await page.route('https://docs.google.com/**', () => { /* never answer */ });
    await page.evaluate(() => { const f = document.getElementById('lead'); f.setAttribute('data-action', 'https://docs.google.com/forms/d/e/TEST/formResponse'); f.setAttribute('data-timeout', '400'); });
    await scrollTo(page, '#contact');
    await page.fill('#name', 'Ash'); await page.fill('#email', 'akaup@iitnj.edu');
    await page.locator('#send').click();
    await expect(page.locator('.contact')).toHaveAttribute('data-state', 'sending');
    await expect(page.locator('#send')).toBeDisabled();
    await expect(page.locator('.contact')).toHaveAttribute('data-state', 'error', { timeout: 5000 });
    await expect(page.locator('#send')).toBeEnabled();
  });

  test('only one submission goes out however often Send is hit', async ({ page }) => {
    await openHome(page);
    let posts = 0, release;
    const gate = new Promise((r) => { release = r; });
    await page.route('https://docs.google.com/**', async (route) => { posts++; await gate; route.fulfill({ status: 200, body: '' }); });
    await page.evaluate(() => document.getElementById('lead').setAttribute('data-action', 'https://docs.google.com/forms/d/e/TEST/formResponse'));
    await scrollTo(page, '#contact');
    await page.fill('#name', 'Ash'); await page.fill('#email', 'akaup@iitnj.edu');
    await page.locator('#send').click({ force: true });
    for (let i = 0; i < 5; i++) { await page.locator('#send').click({ force: true, noWaitAfter: true }).catch(() => {}); await page.locator('#email').press('Enter').catch(() => {}); }
    await page.waitForTimeout(300);
    release();
    await expect(page.locator('.contact')).toHaveAttribute('data-state', 'sent');
    expect(posts).toBe(1);
  });

  test('a filled honeypot is thanked and silently dropped', async ({ page }) => {
    await openHome(page);
    let posted = false;
    await page.route('https://docs.google.com/**', (route) => { posted = true; route.fulfill({ status: 200, body: '' }); });
    await page.evaluate(() => document.getElementById('lead').setAttribute('data-action', 'https://docs.google.com/forms/d/e/TEST/formResponse'));
    await scrollTo(page, '#contact');
    const hp = await page.locator('#company-url').boundingBox();             // people never see it: parked far off-screen, out of the tab order
    expect(hp === null || hp.x + hp.width < 0).toBe(true);
    expect(await page.locator('#company-url').getAttribute('tabindex')).toBe('-1');
    await page.fill('#name', 'Spam Bot'); await page.fill('#email', 'bot@spam.example');
    await page.locator('#company-url').fill('https://spam.example', { force: true });
    await page.locator('#send').click();
    await expect(page.locator('.contact')).toHaveAttribute('data-state', 'sent');
    await page.waitForTimeout(300);
    expect(posted, 'nothing reached the endpoint').toBe(false);
  });

  test('refuses an absurdly long name and caps the input', async ({ page }) => {
    await openHome(page);
    await scrollTo(page, '#contact');
    expect(await page.locator('#name').getAttribute('maxlength')).toBe('80');
    await page.locator('#name').evaluate((el) => { el.removeAttribute('maxlength'); el.value = 'A'.repeat(5000); });
    await page.fill('#email', 'akaup@iitnj.edu');
    await page.locator('#send').click();
    await expect(page.locator('.contact')).toHaveAttribute('data-state', 'invalid');
    await expect(page.locator('#note')).toHaveText('Keep the name under 80 characters.');
  });

  test('markup in a name never reaches the page as HTML', async ({ page }) => {
    await openHome(page);
    await scrollTo(page, '#contact');
    await page.fill('#name', '<img src=x onerror=window.__pwned=1> <b>Bold</b>');
    await page.fill('#email', 'akaup@iitnj.edu');
    await page.locator('#send').click();
    await expect(page.locator('.contact')).toHaveAttribute('data-state', 'sent');
    await expect(page.locator('#thanks-h')).toHaveText('Thank you, <img.');
    expect(await page.locator('#thanks-h img, #thanks-h b').count()).toBe(0);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  });
});
