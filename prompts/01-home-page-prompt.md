# Prompt 01: Home Page

Paste everything below the line into Claude Code.

---

Build the home page (`index.html`) for Sinking South Florida. Follow every rule in CLAUDE.md. If global components (header, footer, glass panel, stat block, city chip, card, section header, sample data badge) don't exist yet, build them first in `components.css` and `main.js`, then stop and show me before building the page.

## Page meta

- `<title>`: South Florida Flooding & Sea Level Rise | Sinking South Florida
- Meta description: Track flooding and sea level rise in Miami, Miami Beach, Hallandale Beach, Hollywood, and Fort Lauderdale. Check your address for flood risk.
- Canonical: `https://miamiflooding.com/`
- JSON-LD: `WebSite` (with `SearchAction` placeholder commented out) + `Organization`
- The `<h1>` lives in the hero

## Section order

1. Header (global)
2. Hero
3. Address risk tool
4. By the numbers
5. Your city
6. Why it's happening
7. Latest news
8. What you can do
9. Final CTA
10. Footer (global)

---

## 1. Hero

Recreate the layout and feel of a modern weather dashboard: full-bleed atmospheric blue background, a photo in the center, light-weight typography, frosted glass panels, and a tide wave across the bottom. Height: `min-height: 100svh` on desktop, content-height on mobile.

### Background
- Sky gradient from `--hero-sky-top` to `--hero-sky-bottom`
- Center image placeholder, soft-masked edges so it blends into the gradient (no hard rectangle):
  `<!-- IMAGE PROMPT: Heavy rain and storm clouds over the Miami skyline and Biscayne Bay, soft blue palette, mist, raindrops, cinematic, no text. FILE: images/hero-miami.webp SIZE: 2400x1400 -->`
- Bottom 240px fades into `--navy-900` (see CLAUDE.md section 7)

### Top bar (inside the global header, hero variant)
Logo and wordmark left. Nav center. Right side: live time, date, and a small tide status pill ("Tide: Rising"). CTA "Check Your Address" as a glass pill.

### Left column
- Small uppercase eyebrow: "LIVE CONDITIONS · MIAMI" (city name updates on switch)
- `<h1>` in two lines, Inter Light, very large:
  - Line 1: "King Tide"
  - Line 2: "with Street Flooding Likely" (smaller)
  - Visually hidden suffix for SEO inside the h1: "in South Florida"
- Two lines of supporting text describing today's conditions
- Row of 3 mini stats (like the weather reference's three city temps): water level number, city name, and a colored underline using the risk scale. Show Miami Beach, Hollywood, Fort Lauderdale by default.
- Bottom left:
  - Radial chart (inline SVG) showing "Flood days this year" vs. last year
  - Risk slider: horizontal gradient bar `--risk-low` to `--risk-severe` with a marker and a text label ("Moderate"). Display only, not draggable.

### Right column
- Large Inter Light number: "+1.4" with "ft" suffix. Label: "ABOVE NORMAL HIGH TIDE"
- Three uppercase data lines: "NEXT HIGH TIDE: 7:42 PM", "RAINFALL 24H: 1.8 IN", "- MIAMI"
- City selector list, all 5 cities stacked vertically. Each row: city name, water level value, and a round glass icon button (tide/wave icon). Active row has a filled icon button, like the weather reference.
- Clicking a city updates every `data-field` value in the hero with that city's numbers

### Tide wave (bottom)
- Full-width inline SVG smooth curve across the bottom of the hero, spanning the fade into navy
- HIGH and LOW labels with times at peaks and troughs ("HIGH 7:42 AM +2.1 FT", "LOW 1:58 PM 0.3 FT")
- A small dot marks "Now" on the curve
- Gentle animated drift, disabled under `prefers-reduced-motion`

### Data
In `hero.js`, create one clearly commented object holding hardcoded sample values for all 5 cities (water level, risk level, next high tide, rainfall, flood days this year and last year, tide curve points). Add a `// FUTURE:` note that this object will be replaced by a fetch from `/data/cities.json`. The Sample Data badge appears on the right-column panel.

### Mobile
Stack in this order: headline, big number, city selector (horizontal scrolling chips instead of a list), 3 mini stats, radial and slider side by side, wave. Center image becomes a background behind the headline with a dark scrim for contrast.

---

## 2. Address risk tool

Build exactly as specified in CLAUDE.md section 8, "Address risk tool." This section starts the dark navy part of the page.

- Headline: "IS YOUR ADDRESS AT RISK?"
- Supporting line: "Enter any address in Miami-Dade or Broward to see its flood zone, elevation, and projected 2050 risk."
- Layout: input and button centered and wide on desktop. Results panel slides in below.
- Demo behavior in `risk-tool.js`:
  - Empty submit: inline validation message
  - Any address containing "tampa", "orlando", or a non-FL state: "outside coverage area" state
  - Anything else: 800ms loading state, then sample results
- Placeholder input text: "e.g. 1700 Convention Center Dr, Miami Beach"

---

## 3. By the numbers

Inspired by large stat strips on modern SaaS pages.

- Section header: "BY THE NUMBERS"
- 4 stat blocks in a row (2x2 on mobile):
  - "+10–17 in" sea level rise expected by 2040 (source: Southeast Florida Regional Climate Change Compact, PLACEHOLDER to verify)
  - "X" sunny-day flood days in Miami last year (PLACEHOLDER, NOAA)
  - "X properties" in high-risk flood zones in Miami-Dade (PLACEHOLDER, FEMA)
  - "$X billion" property value at risk by 2050 (PLACEHOLDER, source to verify)
- Every number has a visible source line and a `<!-- PLACEHOLDER -->` comment. Sample Data badge on the section.

---

## 4. Your city

Bento grid of 5 city cards linking to each city page. Desktop: Miami large on the left spanning 2 rows, four smaller cards in a 2x2 grid on the right. Mobile: single column.

Each card:
- Image placeholder with an IMAGE PROMPT comment (recognizable but generic scene for that city, e.g. "Collins Avenue in Miami Beach after a king tide, shallow water in the street, palm trees, overcast")
- City name in condensed uppercase
- Risk chip (color dot plus text label)
- One key stat (e.g. "+1.4 ft today")
- Arrow link "Explore Miami Beach"
- Miami Beach card subtitle mentions South Beach

---

## 5. Why it's happening

Inspired by a layout with a central image surrounded by four feature blocks.

- Section header: "WHY THE WATER KEEPS COMING"
- Center: illustration placeholder of a ground cross-section showing porous limestone with water rising up through it
  `<!-- IMAGE PROMPT: Clean cutaway illustration of South Florida ground, porous limestone layer with seawater seeping upward under a street and houses, blue and navy palette, minimal, no text. FILE: images/limestone-cutaway.webp SIZE: 1200x1200 -->`
- Four blocks around it (2 left, 2 right; stacked on mobile), each with a small heading and 2 to 3 sentences:
  - **Rising seas:** global sea level rise is accelerating along the Southeast coast
  - **King tides:** the highest tides of the year push water into streets, especially in fall
  - **Porous limestone:** water comes up through the ground, so seawalls alone can't stop it
  - **Heavier rain:** stronger storms overwhelm drains that are already near sea level
- Factual and plain. Each block ends with a small source link placeholder.

---

## 6. Latest news

- Section header: "LATEST NEWS" with "View All News" pill linking to `/news/`
- 3 cards in a row (horizontal scroll on mobile): image placeholder, date, city tag chip, headline, 1-line summary
- Realistic placeholder headlines (e.g. "Miami Beach raises another stretch of Alton Road")
- `<!-- FUTURE: articles will load from /data/news.json, populated by a scheduled GitHub Action -->`

---

## 7. What you can do

A slim icon strip, 4 columns (2x2 on mobile), each with an inline SVG icon, a short title, one line of text, and a link to the matching part of `/resources/`:
- **Know your flood zone:** Check FEMA maps and your elevation certificate
- **Get covered:** Standard homeowners insurance doesn't cover floods
- **Protect your property:** Flood vents, barriers, and elevation
- **Stay alerted:** Sign up for county flood alerts

---

## 8. Final CTA

- Full-width section, subtle aqua glow behind the headline
- Headline: "KNOW BEFORE THE WATER DOES"
- One supporting line
- Two buttons: "Check Your Address" (primary, scrolls to the tool) and "Read the Latest" (outline, `/news/`)

---

## Acceptance checklist

Before telling me you're done, confirm:
- [ ] Page reads correctly with JS disabled (sample values visible in HTML)
- [ ] Every placeholder number has a `PLACEHOLDER` comment and a visible source line
- [ ] Every image slot has an IMAGE PROMPT comment
- [ ] City switcher, nav dropdown, and risk tool all work by keyboard
- [ ] No horizontal scroll at 375px width
- [ ] Text on glass panels passes AA contrast
- [ ] Reduced motion disables the wave animation
- [ ] All sections have start and end comments

Then stop and wait for my review.
