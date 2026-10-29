# Sinking South Florida: Master Build Instructions

Read this entire file before writing any code. These rules apply to every page and every task in this repo.

---

## 1. Project overview

- **Site name:** Sinking South Florida
- **Primary domain:** MiamiFlooding.com
- **Purpose:** Education, news, and a homeowner flood-risk tool covering sea level rise and flooding in South Florida
- **Audience:** Residents, homeowners, buyers, renters, journalists
- **Tone:** Urgent but factual. Punchy headlines, no exaggeration. Every statistic must cite a source (NOAA, FEMA, USGS, county or city data).
- **Copy:** Placeholder copy for now. Write realistic placeholder text, never lorem ipsum.

---

## 2. Tech stack (strict)

- Plain **HTML5, CSS3, vanilla JavaScript (ES6+)**
- **No** React, Vue, frameworks, bundlers, build steps, or npm dependencies
- **No** single-page app routing. Every page is a real `.html` file with its own `<title>`, meta tags, and content in the HTML (not injected by JS). This is required for SEO.
- JS is progressive enhancement only. All content must be readable with JS disabled.
- Hosted on **GitHub Pages**. Must work by opening files locally and when served from the repo root.
- Allowed external resources: Google Fonts only. Inline SVG for icons. (Exception: social embeds, see below.)

### Exceptions for the data pipeline (added 2026-10-28)

- **Node scripts are allowed in `/scripts`**, run only by GitHub Actions. Node 20+, built-in `fetch`, **no npm dependencies** (no `package.json` installs). The public site itself stays plain HTML/CSS/JS.
- **The site deploys through GitHub Actions** (repo Settings > Pages > Source: "GitHub Actions"), not directly from a branch. Repo: `Peter808/Sinking`.
- **Third-party embed scripts are allowed only for social embeds** (Bluesky, Instagram), lazy-loaded when their section scrolls into view.
- **No API keys anywhere in the repo.** Every source used is public and keyless.
- NWS requests send the User-Agent `SinkingSouthFlorida/1.0 (petersargalski@gmail.com)`, as NWS requires a contact. This is intentionally public.

---

## 3. File structure

```
/
├── index.html                  Home
├── miami/index.html
├── miami-beach/index.html
├── hallandale-beach/index.html
├── hollywood/index.html
├── fort-lauderdale/index.html
├── news/index.html             Article feed
├── news/_article-template.html Template for future articles
├── resources/index.html        Insurance, flood zones, what to do
├── 404.html
├── css/
│   ├── tokens.css              Design tokens (colors, type, spacing). Edit here first.
│   ├── base.css                Reset, typography, layout primitives
│   ├── components.css          Reusable components
│   └── pages.css               Page-specific styles only
├── js/
│   ├── main.js                 Nav, dropdown, mobile menu
│   ├── hero.js                 Hero city switcher, tide wave
│   ├── risk-tool.js            Address lookup UI (placeholder logic for now)
│   └── config.js               Future API endpoints (empty for now)
├── js/data-loader.js           Loads /data JSON in the browser, fills data-field elements
├── data/                       Generated JSON (lives on the `data` branch, copied in at deploy)
│   ├── cities.json, news.json, social.json, meta.json
│   └── curated/                Hand-edited, lives on main
│       ├── instagram.json, hidden.json
│       └── timeline/{city}.json
├── scripts/                    Node scripts run by GitHub Actions only
│   ├── fetch-tides.js, fetch-weather.js, fetch-floods.js
│   ├── fetch-news.js, fetch-social.js, prerender.js
│   └── lib/                    Shared helpers (fetch with retry, meta.json, blocklist)
├── config/                     Editable settings, no code knowledge needed
│   ├── stations.json           Tide gauges, weather stations, city coordinates
│   ├── schedule.json           Update timing + risk and headline rules
│   ├── sources.json            News and social feeds
│   ├── keywords.json           Relevance keywords, location terms, city tags
│   └── blocklist.txt           Terms that drop a news or social item
├── .github/
│   ├── workflows/              update-data.yml, deploy.yml, issue-intake.yml
│   └── ISSUE_TEMPLATE/         Add Instagram post, Hide a post, Add history entry
├── images/                     Photos (hero.png + hero-miami.webp) and placeholders
├── CNAME                       Contains: miamiflooding.com
├── robots.txt
├── sitemap.xml
└── CLAUDE.md
```

Use clean, **relative** URLs: from the home page link to `miami/`, from a city page to `../miami/`. Never `/miami/index.html`. Relative links keep the site working when opened straight from disk and on GitHub Pages (decided 2026-10-28). Fetches for JSON are relative too (`data/cities.json`).

---

## 4. Code commenting (required)

The owner is a designer with front-end experience who will edit this code by hand. Comments are a core deliverable, not an afterthought.

- **Every HTML file:** top comment block with page purpose, target keyword, and last-edited note. Comment the start and end of every section: `<!-- ===== SECTION: Hero ===== -->` and `<!-- ===== END: Hero ===== -->`
- **Every CSS file:** table of contents at the top. Section dividers. Comment what each component is and where it's used.
- **Every JS function:** a short comment explaining what it does, its inputs, and what to edit to change behavior.
- Mark every placeholder value with `<!-- PLACEHOLDER: [what real data goes here + likely source] -->`
- Mark future feature hooks with `<!-- FUTURE: [feature description] -->` or `// FUTURE:`
- Write comments in plain language. Explain *why*, not just *what*.

---

## 5. SEO requirements (every page)

- Unique `<title>` (under 60 chars) and `<meta name="description">` (under 155 chars) targeting that page's keyword
- `<link rel="canonical" href="https://miamiflooding.com/[path]/">`
- Open Graph and Twitter card tags (title, description, image, url)
- One `<h1>` per page. Logical heading order, no skipped levels.
- Semantic HTML: `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`
- Descriptive `alt` text on every image
- JSON-LD structured data:
  - Home: `WebSite` + `Organization`
  - City pages: `WebPage` + `Place` (with city name and geo coordinates)
  - News articles: `NewsArticle`
  - Resources: `FAQPage` where there are Q&As
  - All pages except home: `BreadcrumbList`
- `lang="en"` on `<html>`
- Internal linking: every city page links to the other four cities, the address tool (`/#check-your-address`), and News

### Target keywords per page

| Page | Primary keyword |
|---|---|
| Home | south florida flooding, miami flooding, flood risk by address |
| /miami/ | miami flooding, sinking miami |
| /miami-beach/ | miami beach flooding, south beach flooding |
| /hallandale-beach/ | hallandale beach flooding |
| /hollywood/ | hollywood fl flooding |
| /fort-lauderdale/ | fort lauderdale flooding |
| /news/ | miami sea level rise news |

### Files to generate

- `sitemap.xml` listing every page
- `robots.txt` allowing all and pointing to the sitemap
- `CNAME` with `miamiflooding.com`

---

## 6. Secondary domains (handled outside the code)

These are 301 redirects set up at the domain registrar, not in this repo. Document them in a comment in `README.md` only. Do not create pages for them.

| Domain | Redirects to |
|---|---|
| sinkingmiami.com | miamiflooding.com/miami/ |
| risingtidemiami.com | miamiflooding.com/ |
| miamibeachflooding.com | miamiflooding.com/miami-beach/ |
| southbeachsinking.com | miamiflooding.com/miami-beach/ |
| southbeachflooding.com | miamiflooding.com/miami-beach/ |

The Miami Beach page must mention South Beach by name in its content and headings.

---

## 7. Design system

### Direction

Hybrid. The hero is airy, atmospheric blue with frosted glass data panels (inspired by a weather dashboard). Below the hero, the page fades into deep navy sections with heavy condensed uppercase headlines (editorial, magazine energy). Data stays front and center throughout: big numbers, stat strips, bento cards.

### Color tokens (define in `tokens.css` as CSS custom properties)

```css
/* Hero (light, atmospheric) */
--hero-sky-top:     #8FB4E3;
--hero-sky-bottom:  #5B86C9;
--glass-bg:         rgba(255, 255, 255, 0.14);
--glass-border:     rgba(255, 255, 255, 0.28);
--glass-blur:       18px;

/* Body (dark) */
--navy-900:         #050B1A;   /* page background */
--navy-800:         #0A1630;   /* section alt background */
--navy-700:         #12224A;   /* cards */
--navy-600:         #1C3266;   /* borders, dividers */

/* Accents */
--tide-aqua:        #4FD1E8;   /* primary accent, links, CTAs */
--tide-aqua-glow:   rgba(79, 209, 232, 0.35);

/* Risk scale (used on chips, lines, sliders) */
--risk-low:         #5EE3A1;
--risk-moderate:    #F5C451;
--risk-high:        #F58A4B;
--risk-severe:      #F0506E;

/* Text */
--text-primary:     #FFFFFF;
--text-secondary:   rgba(255, 255, 255, 0.72);
--text-muted:       rgba(255, 255, 255, 0.48);
```

### Typography

- **Display (section headlines):** `Anton` or `Archivo Black`, uppercase, tight letter-spacing, very large (clamp 48px to 120px)
- **Hero headline and big data numbers:** `Inter` at weight 300, large and airy like the weather reference
- **Body and UI:** `Inter` 400/500/600
- **Small labels and data captions:** `Inter` 600, uppercase, letter-spacing 0.08em, 11 to 12px
- Use `clamp()` for all fluid type sizes

### Spacing and layout

- 8px spacing scale as tokens: `--space-1` (8px) through `--space-12` (96px)
- Max content width 1280px, 24px side gutters (16px on mobile)
- Border radius: `--radius-sm` 8px, `--radius-md` 16px, `--radius-lg` 24px, `--radius-pill` 999px
- Mobile-first. Breakpoints at 640px, 960px, 1280px.

### The hero-to-dark transition

The hero background is the blue sky gradient plus image. Its bottom edge blends into `--navy-900` through a tall gradient (about 240px) so there's no hard line. The tide wave line sits on top of that transition.

---

## 8. Global components (build these first, reuse everywhere)

### Header / nav
- Logo mark (simple placeholder SVG wave) + "Sinking South Florida" wordmark
- Nav links: **Cities** (dropdown with all 5), **News**, **Resources**
- Right side: current date and time (JS-updated), and a primary CTA button "Check Your Address" linking to `/#check-your-address` (smooth scroll when already on home)
- On the hero: transparent with glass pill buttons. On scroll: solid `--navy-900` with a subtle border.
- Mobile: hamburger opens a full-screen menu. Dropdown must work by keyboard and on touch.

### Address risk tool (home page, directly after the hero)
The most important feature on the site. Section `id="check-your-address"`.
- Large condensed headline (e.g. "IS YOUR ADDRESS AT RISK?") and one line of supporting copy
- One prominent address input with a "Check Risk" button. Real `<form>` with a `<label>`, works on mobile, Enter submits.
- Results panel (glass, sits on the dark section) showing placeholder results after submit:
  - FEMA flood zone (e.g. "AE")
  - Ground elevation vs. projected 2050 water level
  - Risk level on the 4-step risk scale, with text label
  - Short "What this means" line and links to Resources
- Empty, loading, error, and "address outside coverage area" states, all styled
- Coverage note: Miami-Dade and Broward only
- Disclaimer under results: not an official flood determination
- For now, `risk-tool.js` returns hardcoded sample results for any address, with the Sample Data badge visible
- Built as a self-contained component so it can also be dropped onto city pages later

### Glass panel
Reusable `.glass` class: `--glass-bg`, `backdrop-filter: blur(var(--glass-blur))`, `--glass-border`, `--radius-lg`. Include a solid fallback for browsers without `backdrop-filter`.

### Stat block
Big light-weight number, small uppercase label, source line underneath ("Source: NOAA, 2025"). Optional colored underline using the risk scale.

### City chip
Pill button with city name and a colored risk dot. Active state is filled.

### Card
Dark card (`--navy-700`) with image, title, short description, tag chips. Used for news and resources.

### Section header
Huge condensed uppercase headline, optional small eyebrow label above, optional "View all" outline pill button aligned right.

### Sample data badge
Small pill reading "SAMPLE DATA" that appears on every stat panel holding placeholder numbers. It must be easy to remove once real data is wired in (one class, commented). Reason: the site's tone is "urgent but factual," so placeholder statistics must never look like real ones.

### Footer
Logo, short mission line, columns for Cities, Explore (Risk Tool, News, Resources), Data Sources (NOAA, FEMA, USGS links), copyright, and a disclaimer: "Not a substitute for official flood zone determinations."

---

## 9. Images

- Claude Code does not generate images. For every image slot, create a placeholder:
  - A styled `<div>` or a simple inline SVG gradient at the correct aspect ratio, with a visible label like "IMAGE: Rain over Miami skyline"
  - An HTML comment directly above it containing a **ready-to-use AI image prompt**, the target filename, and dimensions. Example:
    `<!-- IMAGE PROMPT: Moody rainstorm over the Miami skyline at dusk, soft blue tones, mist, cinematic, no text. FILE: images/hero-miami.webp SIZE: 2400x1400 -->`
- When real images are added, use `.webp`, `loading="lazy"` (except hero), explicit `width` and `height`
- Keep it simple. Images just need to communicate the idea.

---

## 10. Data and future features

Live data now comes from the pipeline in section 14. Hardcoded sample values remain in the HTML only as a fallback until the first deploy pre-renders real numbers. The structure rules below still apply:

- Wrap every dynamic value in an element with a `data-field` attribute, e.g. `<span data-field="water-level">+1.4</span>`
- Group values by city with `data-city="miami"` on the container
- Add a `// FUTURE:` comment in `hero.js` explaining that values will later load from `/data/cities.json`
- Leave `js/config.js` with commented-out example endpoints only

Planned future features (do not build now, just leave hooks):
- Live tide levels from NOAA, updated by a scheduled GitHub Action that writes JSON
- News articles pulled automatically into `/news/`
- Real address lookup in the home page tool: geocode the address, query FEMA flood zone and elevation data, compare to NOAA sea level projections. Likely needs a Cloudflare Worker for geocoding and CORS. Leave `// FUTURE:` comments at each step in `risk-tool.js`.

---

## 11. Accessibility

- WCAG 2.2 AA contrast. Check white text on glass panels especially; add a subtle dark scrim behind text if needed.
- Visible focus states on all interactive elements (aqua outline)
- Never rely on color alone for risk level; always pair with a text label
- Respect `prefers-reduced-motion`: disable wave animation and transitions
- Skip-to-content link

---

## 12. Performance

- No JS libraries. Total JS under 30KB unminified. (Currently ~30KB before `data-loader.js`. Budget to be revisited in pipeline step 4.)
- Preconnect to Google Fonts, use `font-display: swap`
- Hero image preloaded; everything else lazy
- Target Lighthouse 90+ in all categories

---

## 13. How to work

- Build in this order and **stop after each step for review**:
  1. `tokens.css`, `base.css`, and global components (header, footer, glass, stat block, chips)
  2. Home page, including the address risk tool section
  3. One city page (Miami) as the template
  4. Remaining city pages from that template
  5. News, Resources, 404
  6. sitemap.xml, robots.txt, CNAME, README.md
- Do not invent real statistics. Use placeholders marked as such.
- If a requirement here conflicts with a page prompt, ask before proceeding.
- Never use em dashes in copy or comments.

---

## 14. Data pipeline

### Architecture

```
main branch   -> site code (HTML, CSS, JS, scripts, workflows, config, data/curated)
data branch   -> generated JSON only, updated by Actions

Deploy workflow: checkout main + copy /data from the data branch
               -> scripts/prerender.js writes current values into every data-field
               -> deploy to GitHub Pages
```

- Data commits go **only** to the `data` branch so main history stays clean.
- **Only commit when data actually changed.**
- After a data commit, the update workflow triggers the deploy workflow.
- Pre-render puts real numbers in the page source (SEO, no-JS). `js/data-loader.js` refreshes them in the browser.

### Rules

- Stations, sources, schedule, risk thresholds, and headline wording all live in `/config`. Change behavior there, not in code.
- Every source fetch is independent: one failing never blocks the others. On failure keep the last good value and record `source`, `lastSuccess`, `lastError` in `meta.json`.
- 3 attempts with backoff, 15-second timeout per request.
- Every data panel shows its source and update time ("Source: NOAA Tides & Currents, Virginia Key gauge · Updated 2:00 PM"). Data older than 3x its expected interval shows a muted "Data delayed" label.
- Never show sample values once real data has loaded. Never show an empty panel.
- Flood day counts use NOAA's **meteorological year (May to April)** and must be labeled that way.
- News stores only headline, source name, link, date, and city tags. No article text or images.
- The hero `<h1>` is generated from **Miami's** data at deploy time (headline rules in `config/schedule.json`). The city switcher changes data values only, never the h1.
- The King Tide Season panel in the hero is hand-edited in `index.html` (dates per season), not pipeline data.
- Curated content (Instagram, hidden posts, history timeline) is added through owner-only GitHub Issue Forms.
- Pre-render works through marker comments: `<!-- PRERENDER:name START -->` ... `<!-- PRERENDER:name END -->`. Content between a pair is replaced at deploy; sample markup inside only shows if data is missing. Don't delete the markers.
- News auto-publishes after keyword, location, and blocklist filters. Reddit posts are vetted: they go to a daily GitHub review issue and only ticked posts publish (decided 2026-10-29). Bluesky auto-publishes after filters.

