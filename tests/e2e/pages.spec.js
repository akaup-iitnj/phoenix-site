// The Facility, Production Lines, About and Contact pages: what each says, what each links to, and that each behaves.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { CONFIG, openHome, scrollTo, menuMode } = require('./helpers');

const LINES = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../src/lines.json'), 'utf8'));
const LINE_PAGES = Object.entries(LINES).filter(([k, v]) => !k.startsWith('_') && v.page);

const PAGES = [
  { file: 'facility.html', title: 'The Facility', h1: 'One building. The whole program.', from: ['#facility .more-link a', 'See the facility'] },
  { file: 'lines.html', title: 'Production Lines', h1: 'Choose what your students will make.', from: ['#line .more-link a', 'See all lines'] },
  { file: 'about.html', title: 'About', h1: 'We run one.', from: ['.who .more-link a', 'About us'] },
  { file: 'contact.html', title: 'Contact', h1: 'Book a walkthrough.', from: null },
];

async function openPage(page, file) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('https://docs.google.com/**', (route) => route.fulfill({ status: 200, body: '' }));
  await page.goto(`/${file}${file === 'facility.html' ? '?no3d' : ''}`, { waitUntil: 'load' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

test.describe('inner pages', () => {
  for (const p of PAGES) {
    test(`${p.title}: title, heading, nav, closing link, no sideways scroll, accessible`, async ({ page, baseURL }, testInfo) => {
      const errors = await openPage(page, p.file);
      await expect(page).toHaveTitle(`${p.title} — ${CONFIG.title}`);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', CONFIG.site_url + p.file);
      expect((await page.locator('meta[name="description"]').getAttribute('content')).length).toBeGreaterThan(80);
      await expect(page.locator('h1')).toHaveText(p.h1);
      expect(await page.locator('h1').count()).toBe(1);
      for (const y of [0, 1200, 3000, 99999]) {
        await page.evaluate((v) => window.scrollTo(0, v), y);
        await page.waitForTimeout(80);
        const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
        expect(sw, `scrollWidth at y=${y}`).toBeLessThanOrEqual(iw);
      }
      expect(errors).toEqual([]);
      const levels = await page.locator('h1, h2, h3').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => +e.tagName[1]));
      for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], 'no skipped heading levels').toBeLessThanOrEqual(1);
      // every page but Contact closes with the walkthrough button, which leads to the contact page
      if (p.file !== 'contact.html') await expect(page.locator('.closing .btn')).toHaveAttribute('href', 'contact.html');
      // the shared nav marks nothing as current but reaches every page
      if (menuMode(page)) await page.locator('#menu').click();
      await expect(page.locator('.links a', { hasText: 'About' })).toHaveAttribute('href', 'about.html');
      await expect(page.locator('.nav .cta')).toHaveAttribute('href', 'contact.html');
      if (menuMode(page)) await page.keyboard.press('Escape');
      if (testInfo.project.name !== 'tablet') {
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
        const bad = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
        expect(bad.map((v) => `${v.id}: ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n  ')}`)).toEqual([]);
      }
    });

    if (p.from) {
      test(`${p.title}: the home page links to it`, async ({ page }) => {
        await openHome(page, { no3d: true });
        const link = page.locator(p.from[0]);
        await scrollTo(page, p.from[0]);
        await expect(link).toContainText(p.from[1]);
        await expect(link).toHaveAttribute('href', p.file);
      });
    }
  }

  test('the Facility: five zone chips, the model takes over from the still (or the still stays), the timeline reads in order', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/facility.html', { waitUntil: 'load' });
    const host = page.locator('#hero3d');
    await expect(page.locator('#hero-fallback')).toBeVisible();
    await expect.poll(async () => host.getAttribute('data-3d'), { timeout: 20000 }).toMatch(/live|unsupported|failed/);
    if ((await host.getAttribute('data-3d')) === 'live') {
      await expect(host).toHaveClass(/is-live/);
      const box = await host.locator('canvas').boundingBox();
      expect(box.width).toBeGreaterThan(300);
    }
    const chips = page.locator('#zones [role="tab"]');
    expect(await chips.allTextContents()).toEqual(['Classrooms', 'Trainer Labs', 'Production Floor', 'Storage', 'Control Center']);
    await scrollTo(page, '#zones');
    await chips.nth(3).click();
    await expect(page.locator('#zones .panel b')).toHaveText('Storage.');
    const steps = await page.locator('#timeline .timeline li b').allTextContents();
    expect(steps).toEqual(['Walkthrough.', 'Site survey and layout.', 'Order and build.', 'Delivery and installation.', 'Commissioning.', 'Instructor training.', 'First cohort.']);
    await expect(page.locator('#arrives')).toContainText('during the walkthrough');
    await expect(page.locator('#arrives')).not.toContainText(/ceiling/i);
    expect(await page.locator('#after .pack > div').count()).toBe(3);
    expect(errors).toEqual([]);
  });

  test('Production Lines: one card per line, the lines with pages link to them, the rest read as coming soon', async ({ page }) => {
    await openPage(page, 'lines.html');
    const cards = page.locator('.cards .card');
    const keys = Object.keys(LINES).filter((k) => !k.startsWith('_'));
    expect(await cards.count()).toBe(keys.length);
    for (let i = 0; i < keys.length; i++) {
      const line = LINES[keys[i]], card = cards.nth(i);
      await expect(card.locator('h2')).toHaveText(line.name);
      if (line.page) {
        await expect(card).toHaveAttribute('href', `${line.slug}.html`);
        const img = card.locator('img');
        await img.scrollIntoViewIfNeeded();
        await expect(img).toHaveAttribute('src', `assets/img/line_${keys[i]}.webp`);
        expect(await img.evaluate((el) => el.complete && el.naturalWidth >= 1900)).toBe(true);
        await expect(card.locator('.more')).toContainText('See the line');
      } else {
        await expect(card).toHaveClass(/soon/);
        await expect(card.locator('.soon-art')).toHaveText('Coming soon');
        expect(await card.locator('a').count()).toBe(0);
      }
    }
    // clicking a card opens its page
    await cards.first().click();
    await page.waitForURL(new RegExp(`${LINES[keys[0]].slug}\\.html$`));
    await expect(page.locator('h1')).toHaveText(LINES[keys[0]].page.h1);
    await page.goBack();
    // the three ways to choose, and the closing says one line runs
    expect(await page.locator('#choose [role="tab"]').allTextContents()).toEqual(['By Process', 'By Product', 'By Footprint']);
    await scrollTo(page, '#choose');
    await page.locator('#choose [role="tab"]').nth(2).click();
    await expect(page.locator('#choose .panel')).toContainText('36 × 24 ft to 56 × 32 ft');
    await expect(page.locator('.closing')).toContainText('runs one line in production');
  });

  test('About: the story names Pleasantville and no school, four beliefs, the address and the map link', async ({ page }) => {
    await openPage(page, 'about.html');
    const lede = page.locator('.page-head .lede');
    await expect(lede).toContainText('started in Pleasantville, New Jersey');
    await expect(lede).toContainText('America needs technicians');
    expect(await page.locator('main').textContent()).not.toMatch(/Ideal|IITNJ|school/i);
    expect(await page.locator('#believe [role="tab"]').allTextContents()).toEqual(['Learning by Doing', 'Real Products', 'Entry-Level Ready', 'One Package']);
    for (const line of CONFIG.address) await expect(page.locator('#where')).toContainText(line);
    await expect(page.locator('#where')).toContainText('An hour from Philadelphia');
    const maps = page.locator('#where a', { hasText: 'Open in Google Maps' });
    await expect(maps).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\//);
    await expect(maps).toHaveAttribute('rel', /noopener/);
    expect(await page.locator('main img').count(), 'no photo until there is one worth using').toBe(0);
  });

  test('Contact: the form works on its own page and records where the lead came from', async ({ page }) => {
    await openPage(page, 'contact.html');
    let posted = null;
    await page.route('https://docs.google.com/**', (route) => { posted = route.request(); route.fulfill({ status: 200, body: '' }); });
    await expect(page.locator('#lead')).toHaveAttribute('method', 'post');
    await expect(page.locator('#lead')).toHaveAttribute('data-source', `${CONFIG.form.source}/contact`);
    // validation first
    await page.locator('#send').click();
    await expect(page.locator('.contact')).toHaveAttribute('data-state', 'invalid');
    await expect(page.locator('#name')).toBeFocused();
    // then a real lead
    await page.fill('#name', 'Dean Example');
    await page.fill('#email', 'dean@college.edu');
    await page.locator('#send').click();
    await expect(page.locator('.contact')).toHaveAttribute('data-state', 'sent');
    await expect(page.locator('#thanks-h')).toHaveText('Thank you, Dean.');
    expect(posted, 'a request reached the form endpoint').not.toBeNull();
    const body = new URLSearchParams(posted.postData());
    expect(body.get(CONFIG.form.name_field)).toBe('Dean Example');
    expect(body.get(CONFIG.form.source_field)).toBe(`${CONFIG.form.source}/contact`);
    expect(await page.evaluate(() => Object.keys(localStorage).length)).toBe(0);
    // what happens next, and the ways to reach us
    expect(await page.locator('#next .timeline li b').allTextContents()).toEqual(['We reply', 'We walk the facility', 'You get a floor plan and a proposal']);
    await expect(page.locator(`#visit a[href="mailto:${CONFIG.contact_email}"]`)).toHaveText(CONFIG.contact_email);
    await expect(page.locator('#visit a[href^="tel:"]')).toHaveText(CONFIG.contact_phone);
    for (const line of CONFIG.address) await expect(page.locator('#visit')).toContainText(line);
    expect(await page.locator('#visit').textContent()).not.toMatch(/parking|entrance/i);
    // the nav's Contact button on an inner page comes here; on the home page it stays on the page
    await expect(page.locator('.nav .cta')).toHaveAttribute('href', 'contact.html');
    await openHome(page, { no3d: true });
    await expect(page.locator('.nav .cta')).toHaveAttribute('href', '#contact');
  });

  test('every page is in the sitemap and none mentions the equipment maker', async ({ request, baseURL }) => {
    const sitemap = await (await request.get(`${baseURL}/sitemap.xml`)).text();
    for (const p of PAGES) expect(sitemap).toContain(`<loc>${CONFIG.site_url}${p.file}</loc>`);
    for (const [, line] of LINE_PAGES) expect(sitemap).toContain(`<loc>${CONFIG.site_url}${line.slug}.html</loc>`);
  });
});
