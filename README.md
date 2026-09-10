# Phoenix Industrial Labs — website

One-page site for phoenixindustriallabs.com. Static files, no framework: a small Python build script assembles
`src/` and `assets/` into `dist/site/` (what GitHub Pages serves) and `dist/artifact/index.html` (a single inlined
file for the Claude artifact preview).

```
src/                 page template, page script, form helpers, 3D facility model, 404/robots/sitemap/favicon
assets/              fonts (Hanken Grotesk subsets), line renders (2x webp), 3D still, three.js, brand images
build.py             build (stdlib only) — `npm run build` calls it with whichever Python is installed
tests/unit           node --test: form validation and payload helpers
tests/e2e            Playwright: content rules, interactions, layout on phone/tablet/desktop, accessibility (axe)
tools/               static server, Lighthouse budgets, brand-image generator, build wrapper
.github/workflows    CI: build → unit + e2e + Lighthouse → deploy to GitHub Pages
config.json          site URL, description, contact address, Google Form wiring
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

## Go live on GitHub Pages

1. Create a new **public** repository on GitHub named `phoenix-site` (any name works). Do not add a README or license.
2. Push this folder to it:
   ```bash
   git init && git add -A && git commit -m "Phoenix Industrial Labs site"
   git branch -M main
   git remote add origin https://github.com/<your-user>/phoenix-site.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions.**
4. The **Actions** tab shows the first run: it builds, runs every test, then deploys. About 10 minutes.
   The site is then live at `https://<your-user>.github.io/phoenix-site/`.
5. Every later push to `main` repeats that: if a test fails, nothing is deployed and the previous version stays up.

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

The contact form posts name and email to a Google Form; every submission appends a row to its linked Sheet.
Until the form is configured the site falls back to opening a prefilled email to `contact_email`.

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

Text lives in `src/index.template.html`. Line images are `assets/img/line_*.webp` (2x, roughly 2000 px wide,
background flattened to paper #F5F5F3). The hero still is rendered from the 3D model with `still.html` in the
original working session; the model itself is `src/facility3d.js`. After any change: `npm run build && npm test`.

## What the tests protect

- **Brand rules:** no vendor name anywhere in the page or its scripts, no leftover template placeholders, key headlines present, course hours consistent (5 × 225 = 1,125).
- **Interactions:** chips swap text and image, keyboard navigation, coming-soon state, the 3D hero (still first, live model fades in; drag rotates), the sticky nav and back-to-top, facility walk steps, contact form validation, thank-you state, Google Form payload, failure handling.
- **Layout:** no horizontal scroll at 390 / 768 / 1440 px, one-line headline on wide screens, 3×2 package grid, images inside their stage, tap-target sizes.
- **Accessibility:** axe-core scan (WCAG 2.1 AA), keyboard-only form, landmarks and heading order.
- **Performance:** Lighthouse mobile — the page without the 3D model must score ≥ 90; the full page must paint within 1.8 s and stay above a floor (headless Chrome renders WebGL in software, so its 3D numbers run far slower than a phone's).
