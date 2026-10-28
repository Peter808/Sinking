# Prompt 02: Data Pipeline

Paste everything below the line into Claude Code.

---

Build the data pipeline for Sinking South Florida. Follow CLAUDE.md, with the exceptions listed in section 1 below (add them to CLAUDE.md first). Work through the build steps in section 12 in order and stop for review after each one.

## 1. Update CLAUDE.md first

Add these exceptions to CLAUDE.md before writing pipeline code:
- **Node scripts are allowed in `/scripts`**, run only by GitHub Actions. Node 20+, built-in `fetch`, **no npm dependencies**. The public site itself stays plain HTML/CSS/JS.
- **The site deploys through GitHub Actions** (Pages source: "GitHub Actions"), not directly from a branch.
- **Third-party embed scripts are allowed only for social embeds** (Bluesky, Instagram), lazy-loaded when the section scrolls into view.
- Add the new folders from section 2 to the file structure.

## 2. Architecture

```
main branch   → site code (HTML, CSS, JS, scripts, workflows, config)
data branch   → generated JSON only, updated by Actions

Deploy workflow: checkout main + copy /data from data branch
               → pre-render current values into HTML
               → deploy to GitHub Pages
```

- Data commits go **only** to the `data` branch, so main history stays clean.
- **Only commit when data actually changed.** Skip commits when nothing is new.
- After a data commit, trigger the deploy workflow.
- **Pre-render step** (`scripts/prerender.js`): writes current values into every `data-field` element in the HTML at deploy time, so real numbers are in the page source for SEO and no-JS users. The JS data loader then refreshes them in the browser.

New folders:
```
/scripts/            fetch-tides.js, fetch-weather.js, fetch-floods.js,
                     fetch-news.js, fetch-social.js, prerender.js, lib/
/config/             stations.json, sources.json, schedule.json,
                     blocklist.txt, keywords.json
/data/               (generated, lives on data branch) cities.json,
                     news.json, social.json, meta.json
/data/curated/       (on main, hand-edited) instagram.json,
                     hidden.json, timeline/{city}.json
/.github/workflows/  update-data.yml, deploy.yml, issue-intake.yml
/.github/ISSUE_TEMPLATE/
/js/data-loader.js
```

## 3. Stations and city mapping

`config/stations.json`:

| City | Tide gauge | Rain / weather station |
|---|---|---|
| Miami | Virginia Key, Biscayne Bay (8723214) | KMIA (Miami Intl) |
| Miami Beach | Virginia Key, Biscayne Bay (8723214) | KMIA |
| Hallandale Beach | South Port Everglades (8722956) | KHWO (North Perry) |
| Hollywood | South Port Everglades (8722956) | KHWO |
| Fort Lauderdale | South Port Everglades (8722956) | KFLL (Fort Lauderdale Intl) |

Every city object in the output includes a `gauge` field. The UI shows "Nearest gauge: Virginia Key" under each water level.

Also store each city's coordinates for NWS alert lookups (`api.weather.gov/alerts/active?point=lat,lon`).

## 4. Data sources and outputs

Verify each endpoint before relying on it. If one doesn't work as described, tell me and propose an alternative. Do not invent endpoints.

| Output field | Source | Notes |
|---|---|---|
| Water level now | NOAA CO-OPS Data API, `product=water_level`, `datum=MHHW`, `units=english`, `time_zone=lst_ldt` | Value is feet above normal high tide |
| Tide status (rising/falling) | Last two water level readings | |
| Next high tide, HIGH/LOW labels | CO-OPS `product=predictions`, `interval=hilo` | Next 48 hours |
| Tide curve | CO-OPS `predictions`, 30-min or hourly interval, 24 hours | Downsample to ~48 points |
| Flood thresholds | CO-OPS station metadata (NWS minor/moderate/major flood levels) | Used for risk level |
| Flood likelihood today | CO-OPS Derived Product API (high tide flooding daily/monthly outlook) | |
| Flood days this year / last year | CO-OPS Derived Product API, annual high tide flood counts | **Meteorological year, May to April.** Label it that way in the UI. |
| Rainfall 24h | NWS API observations for the city's station | Send a descriptive User-Agent with contact email |
| Active alerts | NWS API active alerts by point | Coastal flood advisories, warnings, flood watches |

### Risk level rule
- **Low:** below NWS minor flood threshold, no alerts
- **Moderate:** within 0.25 ft of minor threshold, or a coastal flood statement/advisory is active
- **High:** at or above minor threshold, or a flood warning is active
- **Severe:** at or above moderate threshold, or a major flood warning is active

Put these thresholds in `config/schedule.json` (or a `rules` section) so they're editable without touching code.

### Headline rule
Generated from data, never hardcoded. Store `headline.line1` and `headline.line2` per city.

| Condition | Line 1 | Line 2 |
|---|---|---|
| Coastal flood warning active | Coastal Flood Warning | Flooding Expected Today |
| King tide predicted (high tide flooding likely today) | King Tide | with Street Flooding Likely |
| Heavy rain alert active | Heavy Rain | Flooding Possible in Low Areas |
| Water level elevated but under threshold | Higher Than Normal Tides | Minor Flooding Possible |
| None of the above | Normal Tides | No Flooding Expected |

First match wins. Keep the wording table in config so it's editable.

## 5. Update schedule

Season-aware. `config/schedule.json`:

```json
{
  "kingTideSeason": { "start": "08-15", "end": "12-15" },
  "inSeasonEveryMinutes": 60,
  "offSeasonEveryMinutes": 360,
  "alertOverride": true,
  "newsEveryMinutes": 180,
  "socialEveryMinutes": 120
}
```

- The workflow cron runs hourly. Each script first checks `data/meta.json` for its last run time and **exits early** if it isn't due yet.
- **Alert override:** if any NWS coastal flood or flood alert is active for any city, run hourly regardless of season.
- Comment the season dates in the config: South Florida king tides peak in fall, and NOAA's monthly outlook can be used to refine the window later.
- Add a keepalive safeguard: GitHub may disable scheduled workflows in repos with no activity for 60 days. Check whether data-branch commits count; if not, add a lightweight monthly keepalive.

## 6. Failure handling

- Each source fetch is independent. One failing never blocks the others.
- On failure, **keep the last good value** and record the error in `meta.json` (`source`, `lastSuccess`, `lastError`).
- Every data panel shows **"Source: NOAA Tides & Currents, Virginia Key gauge · Updated 2:00 PM"**.
- If data is older than 3x its expected interval, show a muted **"Data delayed"** label with the last update time.
- Never show an empty or broken panel. Never show sample values once real data has loaded.
- Retry with backoff (3 attempts) and a 15-second timeout per request.

## 7. News

`config/sources.json` lists RSS feeds. Start with these and verify each one:
- City of Miami Beach news (the site appears to be WordPress, so try `/feed/`)
- City of Miami, Miami-Dade County, City of Hollywood, City of Fort Lauderdale, City of Hallandale Beach newsrooms (find RSS if it exists; list any that don't have one)
- WLRN, Local10, and other local outlets with public RSS
- Google News RSS search: `"Miami flooding"`, `"Miami Beach flooding"`, `"king tide" Florida`, `"Fort Lauderdale flooding"`, `"Hollywood FL flooding"`

Rules:
- Store only **headline, source name, link, publish date, and city tags**. **No article text or images** (copyright).
- City tags come from matching city names in the headline.
- Relevance filter: headline must match at least one keyword from `config/keywords.json` (flood, flooding, king tide, tide, sea level, stormwater, seawall, pump, resilience, etc.).
- Run every headline through the blocklist (section 9).
- Deduplicate by URL and by near-identical headline.
- Keep the latest 60 items; older ones drop off.
- **Auto-publish.** No review queue.

## 8. Social

### Automated: Bluesky + Reddit
- **Bluesky:** public search API for `#KingTide`, `#MiamiFlooding`, `#SunnyDayFlooding`, `#SeaLevelRise` combined with location terms (Miami, Miami Beach, South Beach, Hallandale, Hollywood, Fort Lauderdale, Broward). Display with Bluesky's official embed.
- **Reddit:** subreddit search RSS for r/Miami, r/MiamiBeach, r/fortlauderdale, r/SouthFlorida with flood keywords. Show title, subreddit, and link only.
- A post must match **both** a flood keyword and a location term.
- Run through the blocklist. Auto-publish.
- Keep the latest 40 items.

### Hand-picked: Instagram (make this very easy for me)
Build a **GitHub Issue Form** called "Add Instagram post" with one required field: the Instagram post URL, plus an optional city dropdown and an optional caption note.

- I fill it out from my phone or browser and submit
- `issue-intake.yml` runs **only if the issue author is the repo owner**, validates the URL format, adds it to `data/curated/instagram.json`, commits to main, closes the issue with a confirmation comment, and triggers a deploy
- If the URL is invalid, it comments the reason and leaves the issue open
- The site renders these with Instagram's standard embed code, lazy-loaded

Write a short `HOW-TO-ADD-INSTAGRAM.md` with 3 steps and a bookmarkable link to the issue form.

### Hide anything fast
A second issue form, **"Hide a post"**: paste any news, Bluesky, Reddit, or Instagram URL. The intake workflow adds it to `data/curated/hidden.json` and redeploys. Every fetch and render step skips hidden URLs. Same owner-only rule.

## 9. Blocklist

`config/blocklist.txt`, one term per line, with comments explaining the format.
- Case-insensitive, whole-word matching
- Applies to news headlines, social post text, and author handles
- Seed it with common profanity, slurs, and spam terms ("crypto", "giveaway", "OnlyFans", "promo code", etc.)
- Matched items are dropped silently, and their count is logged in `meta.json`
- Add a comment at the top explaining how to add terms and that changes apply on the next run

## 10. Flooding & Resilience History (city pages only)

A neutral, factual timeline of what each city has planned, built, and changed over time. **Neutral tone throughout.** Hand-curated, not automated.

`data/curated/timeline/{city}.json`, schema:
```json
{
  "date": "2017-08-01",
  "title": "Stormwater pumps tested by Tropical Storm Emily",
  "summary": "One or two plain, factual sentences.",
  "type": "plan | project | event | update",
  "status": "Planned | In progress | Completed | Revised",
  "sources": [{ "name": "Miami New Times", "url": "https://..." }]
}
```

- Every entry needs at least one source. The renderer skips entries without one.
- Seed `miami-beach.json` with 4 to 5 entries from public sources (2013 pump program launch, 2017 Tropical Storm Emily, 2018 ULI advisory panel, stormwater master plan update). **Mark every seeded entry `"verify": true`**, and show a small "Needs verification" tag on the page until I remove it.
- Leave the other four city files with one example entry marked `verify`.
- Add an issue form, "Add history entry," with the same fields, using the same owner-only intake pattern.
- Section title on city pages: **"Flooding & Resilience History"**.
- Rendered as a vertical timeline, newest first, with type icons and source links.

## 11. Front end: `js/data-loader.js`

- Fetches `/data/cities.json`, `news.json`, `social.json`, `curated/instagram.json`, `curated/timeline/{city}.json`
- Fills every `data-field` element. Renders news and social cards.
- Removes the Sample Data badges once real data has loaded
- Shows source and "Updated X ago" lines, plus "Data delayed" when stale
- Hero city switcher reads from the loaded data
- If a fetch fails, leaves the pre-rendered values in place
- Heavily commented, like everything else

## 12. Build steps (stop after each)

1. Update CLAUDE.md, create config files, and write `fetch-tides.js` + `fetch-weather.js` + `fetch-floods.js`. Run them locally and show me the real output for all 5 cities.
2. `update-data.yml` with the schedule logic and the data branch. Show me a test run.
3. `deploy.yml` + `prerender.js`. Confirm the site deploys with real values in the HTML source.
4. `data-loader.js`, wired into the home page. Remove sample data badges where real data now exists.
5. News + social fetchers, blocklist, keyword filter.
6. Issue forms + `issue-intake.yml` (Instagram, Hide a post, History entry) + HOW-TO doc.
7. History timeline component + seeded Miami Beach file.

## Acceptance checklist
- [ ] No API keys anywhere in the repo
- [ ] All 5 cities show real data with correct gauge labels
- [ ] Headline changes correctly; test by temporarily forcing each condition
- [ ] Killing one source (bad URL) leaves the rest working and shows "Data delayed" only where it applies
- [ ] Off-season runs every 6 hours; an active alert forces hourly
- [ ] No commits when data is unchanged
- [ ] Blocklisted test term is filtered from news and social
- [ ] Issue forms only work for the repo owner
- [ ] Page source (view-source) contains real numbers after deploy
