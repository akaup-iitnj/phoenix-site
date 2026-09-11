# Phoenix Industrial Labs — website

Site for phoenixindustriallabs.com: a one-page home, a Curriculum page, and one page per production line. Static files,
no framework: a small Python build script assembles `src/` and `assets/` into `dist/site/` (what GitHub Pages serves) and
`dist/artifact/` (single inlined files, one per page, for the Claude artifact previews).

```
src/                 page templates (index, curriculum, line), lines.json (one entry per production line), nav/footer partials, page script, form helpers, 3D model, 404/robots/favicon
assets/              fonts (Hanken Grotesk subsets), line renders (2x webp), 3D still, three.js, brand images (phoenix mark SVG, icons, og.jpg)
build.py             build (stdlib only) — `npm run build` calls it with whichever Python is installed
tests/unit           node --test: form validation and payload helpers
tests/e2e            Playwright: content rules, interactions, layout on phone/tablet/desktop, accessibility (axe), stress
tools/               static server, Lighthouse budgets, brand-image generator, build wrapper
.github/workflows    CI: build → unit + e2e + Lighthouse → deploy to GitHub Pages
config.json          site URL, tagline, description, contact email, street address, Google Form wiring, artifact URLs
```

## Run it locally

Needs Node 20+ and Python 3.

```bash
npm install
npx playwright install chromium     # once
npm run build                        # -> dist/site and dist/artifact
npm run serve                        # http://127.0.0.1:4173/
npm test                             # unit + end-to-end (about 6 minutes; the 3D hero renders in software)
npm run test:lighthouse              # performance/accessibility/SEO budgets, writes lighthouse-report-*.html
```

`npx playwright test --ui` opens the interactive runner; `npx playwright show-report` opens the last HTML report.

## Where it lives

- Repository: https://github.com/akaup-iitnj/phoenix-site (public; GitHub Pages requires that on a free account)
- Live site: https://akaup-iitnj.github.io/phoenix-site/ — until phoenixindustriallabs.com is pointed at it (below)
- Deploys: every push to `main` runs the workflow in `.github/workflows/pages.yml`: build → unit + end-to-end tests →
  Lighthouse (reported) → deploy. If a test fails nothing is deployed and the previous version stays up. About 10 minutes.
- Pages is set to **Settings → Pages → Source: GitHub Actions** (done once by hand; the workflow token cannot enable it).

To change the site: edit, run `npm run build && npm test` locally, commit, push (or upload the changed files through the
GitHub web UI into the same folders).

## Point phoenixindustriallabs.com at it

1. Register the domain (Cloudflare Registrar or Namecheap are both fine; about $10–12/year).
2. At the registrar, add these DNS records:

   | Type  | Name | Value |
   |-------|------|-------|
   | A     | @    | 185.199.108.153 |
   | A     | @    | 185.199.109.153 |
   | A     | @    | 185.199.110.153 |
   | A     | @    | 185.199.111.153 |
   | CNAME | www  | `<your-user>.github.io` |

   (If the registrar offers "proxy"/orange-cloud mode, leave it off for these records.)
3. On GitHub: **Settings → Pages → Custom domain** → enter `phoenixindustriallabs.com` → Save.
   GitHub adds a `CNAME` file to the deployed site automatically.
4. Once the DNS check passes (minutes to a few hours), tick **Enforce HTTPS**.
5. `config.json` already carries `https://phoenixindustriallabs.com/` for the canonical URL, sitemap and social preview.

## Leads: Google Form → Google Sheet

The contact form posts name, email and source to the Google Form **"Phoenix Industrial Labs — Walkthrough requests"**
(Google account ashraykaup@gmail.com); every submission appends a row to the linked Sheet of the same name.
`config.json` already carries the form's action URL and field ids. If `action` is emptied, the site falls back to
opening a prefilled email to `contact_email`. To hear about each lead: open the Sheet → Tools → Notification settings →
"Any changes", email right away.

To recreate or move the form (for example into another Google account):

1. At forms.google.com create a form with two **Short answer** questions, in this order: **Name**, **Email**.
   Optionally a third, **Source**. Settings → Responses → turn **off** "Collect email addresses" (the form has its own).
2. Click the **Responses** tab → the Sheets icon → **Create a new spreadsheet**. That sheet is your lead list.
3. Send the form's public link (the *Send* button → link icon) to Claude, or read the field ids yourself:
   open the public form, view page source, and search for `entry.` — the numbers after each `entry.` are the
   field ids, in question order.
4. Fill in `config.json`:
   ```json
   "form": {
     "action": "https://docs.google.com/forms/d/e/<FORM_ID>/formResponse",
     "name_field": "entry.1111111",
     "email_field": "entry.2222222",
     "source_field": "entry.3333333",
     "source": "phoenixindustriallabs.com"
   }
   ```
   (`source_field` may stay empty if you skipped that question.)
5. Rebuild and push. The e2e test *posts to the configured Google Form endpoint* guards the wiring.
   Turn on Sheets notifications (Tools → Notification settings → "Any changes", email right away) to hear about each lead.

## Editing copy or images

Text lives in `src/index.template.html` (home) and `src/curriculum.template.html` (the Curriculum page, reached from
"Learn more about the curriculum", the nav and the footer). The production-line pages come from `src/lines.json`: each
entry with a `page` block becomes `<slug>.html` through `src/line.template.html` (headline, facts, the stops of one order
around the loop with a generated schematic, what the line is built from, skill groups, an at-a-glance list, and the
closing call to action), and the line's chip on the home page gains a "See the line" link. Stops may carry a third
value, `control` or `store`, to be drawn beside the loop rather than on it. To add a line page, add its `page` block
(and, if there is a second view, its `image2`), rebuild, and run the tests: `tests/e2e/lines.spec.js` checks every
page in the file. The nav and footer are shared partials (`src/nav.partial.html`, `src/footer.partial.html`);
`{{HOME}}` in them becomes `index.html` on inner pages. The footer's address and map link come from `address` /
`maps_url` in `config.json`, the email from `contact_email`, and the year is stamped at build time. The stylesheet is the
`<style>` block at the top of the index template; every page inlines it. `sitemap.xml` is generated from the page list
in `build.py`. Line images are `assets/img/line_*.webp` (2600 px wide, i.e. 2x the widest stage, background flattened
to paper #F5F5F3). They were prepared in the original working session from the supplier's ~1000 px renders: logos
inpainted, background trimmed, Real-ESRGAN x4plus upscale (the model brightens flat paper, so the paper tone is
restored where the source was transparent), then settled to 2600 px with Lanczos and a light unsharp mask. A sharper
source render would still beat any upscale — ask the supplier for 3000 px+ exports if they exist. The hero still is rendered from the 3D model with `still.html` in the
original working session, then trimmed so the building is centred and spans 97% of the image width — the same framing
the live model uses (`fitDist` in `src/facility3d.js`), which is what makes the still-to-3D crossfade seamless. If the
still is re-rendered, update the `width`/`height` attributes, the `.stage .track` aspect ratio and the `data-x`/`data-y`
marker positions in the template. After any change: `npm run build && npm test`.

## Security posture

The site is static: no server code, no database, no accounts, no third-party scripts. What can go wrong is therefore
narrow, and each item below is covered by a test.

- **Content Security Policy** (a `<meta>` tag, since GitHub Pages cannot send headers): scripts, fonts and images only
  from the site's own origin; no inline scripts; network only to the origin and the Google Form endpoint; `object-src`
  and `base-uri` off. A `referrer` policy keeps the full URL from leaking to other sites.
- **Contact form:** nothing typed by a visitor is ever inserted as HTML (`textContent` only); names are capped at 80
  characters and emails at 254; one submission at a time; a hanging endpoint times out after 10 s with a retry message;
  a hidden honeypot field silently drops form-filling bots; the form uses `method="post"` so, without JavaScript, a
  name never ends up in a URL (a `<noscript>` note offers the email address instead). No personal data is stored in the
  browser.
- **3D hero:** if the browser takes the WebGL context away (memory pressure, driver reset) the still image returns and
  the render loop stops; the loop allocates nothing per frame.
- **Dev server** (`tools/serve.js`, local and CI only): confined to the site directory, GET/HEAD only, bad escapes
  rejected.
- **Supply chain:** the site has zero runtime npm dependencies (three.js is vendored). Test tooling is dev-only,
  `npm audit` is clean, and Dependabot keeps it that way weekly. The workflow token has read-only contents access.
- **Stress test** (`tests/e2e/stress.spec.js`): rapid clicking, keyboard spam, resize and scroll storms, hostile input
  (script tags, RTL overrides, 5,000-character names, header-injection strings) — the page must end with no errors, no
  sideways scroll, nothing in storage, and still respond.

Not possible on GitHub Pages, by design: custom response headers (HSTS is on for `*.github.io`; for the custom domain
tick *Enforce HTTPS*), and server-side rate limiting — the Google Form endpoint is public, so a determined sender can
still post to it directly. If the Sheet ever fills with junk, add a required question to the form and mirror it in
`config.json`, or move the endpoint behind a small proxy.

## What the tests protect

- **Brand rules:** no vendor name anywhere in the page or its scripts, no leftover template placeholders, key headlines present, course hours consistent (5 × 225 = 1,125).
- **Interactions:** chips swap text and image, keyboard navigation, coming-soon state, the 3D hero (still first, live model fades in; drag rotates; context loss falls back), the sticky nav, the phone menu (opens, closes on choice/Escape/outside tap), back-to-top, facility walk steps, contact form validation, thank-you state, Google Form payload, failure, timeout, double-submit and honeypot handling.
- **Layout:** no horizontal scroll at 390 / 768 / 1440 px, the hero's copy and model share the first screen, one-line headline on wide screens, 3×2 package grid, images inside their stage, tap-target sizes.
- **Accessibility:** axe-core scan (WCAG 2.1 AA), keyboard-only form, landmarks and heading order.
- **Performance:** Lighthouse mobile — the page without the 3D model should score ≥ 75 and paint within 2 s; the full page must paint within 2 s and stay above a floor (headless Chrome renders WebGL in software, so its 3D numbers run far slower than a phone's). Lighthouse is reported in CI but does not block a deploy; the unit and end-to-end tests do.
