#!/usr/bin/env node
/* ==========================================================================
   scripts/prerender.js
   Runs at deploy time. Writes current data straight into the HTML so real
   values are in the page source (search engines, no-JS visitors).

   How it finds what to replace: marker comments in the HTML,
     <!-- PRERENDER:name START ... -->  ...sample markup...  <!-- PRERENDER:name END -->
   Everything between a pair is swapped for freshly rendered markup. If the
   data file is missing or empty, the sample markup is left untouched.

   Currently renders:
     news-status     "Updated 2:15 PM" eyebrow (replaces the Sample badge)
     news-cards      3 newest headlines, one per city where possible
     hero-*          h1, mini stats, city list, tide wave, Miami's values in
                     every data-field, and a JSON snapshot of all 5 cities
                     that js/hero.js uses for the city switcher
     city cards      risk chip + peak today (data-card-risk / data-card-peak)
     numbers-*       the 4 "By the numbers" stats (home only)
     fixes           proposed fixes timeline (city pages, from
                     data/curated/timeline/<city>.json)
   Pages: index.html and every <city>/index.html that exists.
   Data files: cities.json (hourly), news.json, stats.json (weekly).

   Usage: node scripts/prerender.js <site-folder>   (e.g. _site)
          Reads data from <site-folder>/data unless DATA_DIR is set.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const SITE = path.resolve(process.argv[2] || '.');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(SITE, 'data');
const TZ = 'America/New_York';

/* City id -> display name and news photos. News cards use the "news-" photo
   first (different from the city cards above them); if two stories share a
   city, the second gets the "city-" photo so no two cards look the same.
   Add a city here if one is added to config. */
const CITY = {
  'miami': { name: 'Miami', imgs: ['images/news-miami.webp', 'images/city-miami.webp'] },
  'miami-beach': { name: 'Miami Beach', imgs: ['images/news-miami-beach.webp', 'images/city-miami-beach.webp'] },
  'hallandale-beach': { name: 'Hallandale Beach', imgs: ['images/news-hallandale-beach.webp', 'images/city-hallandale-beach.webp'] },
  'hollywood': { name: 'Hollywood', imgs: ['images/news-hollywood.webp', 'images/city-hollywood.webp'] },
  'fort-lauderdale': { name: 'Fort Lauderdale', imgs: ['images/news-fort-lauderdale.webp', 'images/city-fort-lauderdale.webp'] }
};
const ALL_IMGS = Object.values(CITY).reduce((a, c) => a.concat(c.imgs), []);

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch (e) { return null; } };
const fmtDate = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
const fmtTime = (d) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(d);

/* Swaps the content between a START/END marker pair. Returns the new HTML
   (unchanged if the markers aren't found). */
function replaceBlock(html, name, inner) {
  const re = new RegExp(`(<!-- PRERENDER:${name} START[\\s\\S]*?-->)[\\s\\S]*?(<!-- PRERENDER:${name} END -->)`);
  if (!re.test(html)) return html;   // this page doesn't have that block
  return html.replace(re, (_, a, b) => `${a}\n${inner}\n${b}`);
}

/* Picks n items, newest first, avoiding repeat cities when possible */
function pickVaried(items, n) {
  const out = [], used = new Set();
  for (const it of items) { const c = it.cities[0] || 'none'; if (!used.has(c)) { out.push(it); used.add(c); } if (out.length === n) return out; }
  for (const it of items) { if (!out.includes(it)) out.push(it); if (out.length === n) break; }
  return out;
}

/* One news card. No article images or text (copyright): the photo is our
   own city image, and the line under the headline is the outlet name. */
function newsCard(it, used, base = '', regional = false) {
  const city = CITY[it.cities[0]];
  /* First unused photo for this city, else any unused photo (untagged stories) */
  const img = (city ? city.imgs : []).concat(ALL_IMGS).find((p) => !used.has(p)) || ALL_IMGS[0];
  used.add(img);
  const tags = regional ? '<span class="tag">Regional</span>'
    : it.cities.map((c) => CITY[c] && `<span class="tag">${esc(CITY[c].name)}</span>`).filter(Boolean).join('');
  return `      <li class="card">
        <div class="card__media"><img src="${base}${img}" alt="" loading="lazy" decoding="async"></div>
        <div class="card__body">
          <p class="card__meta">${it.date ? `<time datetime="${esc(it.date)}">${esc(fmtDate(it.date))}</time>` : ''}${tags}</p>
          <h3 class="card__title"><a href="${esc(it.link)}" target="_blank" rel="noopener">${esc(it.headline)}<span class="visually-hidden"> (opens ${esc(it.source)} in a new tab)</span></a></h3>
          <p class="card__text">${esc(it.source)}</p>
        </div>
      </li>`;
}

/* Home: 3 newest, one per city where possible.
   City page: 3 newest that mention that city; if fewer than 3, the newest
   other South Florida stories fill in, tagged "Regional". */
function renderNews(html, page) {
  const news = readJSON('news.json');
  const items = news && news.items || [];
  if (!items.length) { console.log('  news: no data, keeping sample cards'); return html; }
  let pick, regional = new Set();
  if (page.city) {
    pick = items.filter((it) => it.cities.includes(page.city)).slice(0, 3);
    items.filter((it) => !pick.includes(it)).slice(0, 3 - pick.length).forEach((it) => { pick.push(it); regional.add(it); });
  } else {
    pick = pickVaried(items, 3);
  }
  const used = new Set();
  html = replaceBlock(html, 'news-cards', `    <ul class="news__row" role="list">\n${pick.map((it) => newsCard(it, used, page.base, regional.has(it))).join('\n')}\n    </ul>`);
  html = replaceBlock(html, 'news-status', `          <p class="label section-head__eyebrow">Updated ${esc(fmtTime(new Date()))} ET</p>`);
  console.log(`  news: rendered ${pick.length} cards`);
  return html;
}

/* ========================================================================
   HERO + CITY CARDS (from cities.json)
   "Peak" everywhere = today's forecast peak water level: the highest
   predicted high tide still ahead today plus how far the water is
   currently running above prediction. Ft above normal high tide (MHHW).
   ======================================================================== */
const HERO = require('../js/hero.js');   // shares the tide-curve math with the browser
const SCHEDULE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'schedule.json'), 'utf8'));
const MINI_ORDER = ['miami-beach', 'hollywood', 'fort-lauderdale', 'miami', 'hallandale-beach']; // same as hero.js
const RISK_LABEL = { low: 'Low', moderate: 'Moderate', high: 'High', severe: 'Severe' };
const RISK_POS = { low: 12, moderate: 38, high: 64, severe: 88 };
const RADIAL_MAX_DAYS = 60;

const r1 = (n) => Math.round(n * 10) / 10;
const fmtLevel = (n) => (n >= 0 ? '+' : '') + n.toFixed(1);
/* "23:23" -> "11:23 PM" */
const to12 = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : '';

/* Replaces the text of every element with data-field="name" (hero + header) */
function setField(html, name, value) {
  const re = new RegExp(`(<[^>]*\\sdata-field="${name}"[^>]*>)[^<]*(<)`, 'g');
  return html.replace(re, (_, a, b) => a + esc(value) + b);
}

/* Two-line plain-language summary under the h1, built from the data */
function summaryFor(c) {
  const parts = [];
  const alert = c.alerts && c.alerts.items && c.alerts.items[0];
  if (alert) parts.push(`${alert.event} in effect${alert.expires ? ' until ' + fmtTime(new Date(alert.expires)) : ''}.`);
  const t = c.tides || {}, nh = t.nextHigh, anom = t.anomalyFt || 0, minor = c.thresholds && c.thresholds.minorFlood;
  if (nh) {
    const peak = r1(nh.heightFt + anom);
    const today = nh.date === new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
    const when = (today ? '' : 'tomorrow at ') + to12(nh.localTime);
    if (minor != null && peak >= minor) parts.push(`Next high tide at ${when} is expected to reach about ${fmtLevel(peak)} ft above normal high tide, enough to flood low streets.`);
    else if (peak >= 0.5) parts.push(`Next high tide at ${when} is expected to run ${fmtLevel(peak)} ft above normal.`);
    else parts.push(`Next high tide at ${when}, close to normal levels.`);
  }
  const rain = c.weather && c.weather.rain24hIn;
  if (rain != null && rain >= 0.25) parts.push(`${rain.toFixed(2)} in of rain fell in the last 24 hours.`);
  return parts.join(' ') || 'Tides and rain near normal today.';
}

/* Compact per-city record for the browser (same shape as hero.js CITIES) */
function snapshotCity(c) {
  const t = c.tides || {}, anom = t.anomalyFt || 0;
  const fd = c.floodDays || {};
  return {
    name: c.name,
    level: t.todayForecastPeakFt != null ? r1(t.todayForecastPeakFt) : (c.water ? r1(c.water.levelFt) : 0),
    risk: c.risk ? c.risk.level : 'low',
    nextHigh: t.nextHigh ? to12(t.nextHigh.localTime) : '',
    rain: c.weather ? c.weather.rain24hIn : 0,
    floodDays: fd.thisYear ? fd.thisYear.count : 0,
    floodDaysLast: fd.lastYear ? fd.lastYear.count : 0,
    tideStatus: cap(c.water && c.water.status),
    summary: summaryFor(c),
    /* Today's highs/lows as EXPECTED water: prediction + current anomaly */
    tide: (t.today || []).map((e) => [to12(e.localTime), r1(e.heightFt + anom), e.type]),
    gauge: c.gauge.label,
    updated: c.water && c.water.updatedAt ? fmtTime(new Date(c.water.updatedAt)) : '',
    updatedAt: c.water ? c.water.updatedAt : null
  };
}

/* page.city = null for the home page (Miami data, city switcher),
   or a city id for a city page (that city's data, city list as links). */
function renderHero(html, page) {
  const doc = readJSON('cities.json');
  if (!doc || !doc.cities || !doc.cities.miami || !doc.cities.miami.tides) { console.log('  hero: no data, keeping sample'); return html; }
  const snap = {};
  Object.values(doc.cities).forEach((c) => { snap[c.id] = snapshotCity(c); });
  const id = page.city || 'miami';
  if (!snap[id]) return html;
  const m = snap[id], mc = doc.cities[id];

  /* h1. Home: Miami's headline ("King Tide / with Street Flooding Likely").
     City page: "Miami Flooding" + that city's condition, for the keyword. */
  const h = mc.headline || { line1: 'Normal Tides', line2: 'No Flooding Expected' };
  const line2 = page.city ? (/^[a-z]/.test(h.line2) ? `${h.line1} ${h.line2}` : `${h.line1}, ${h.line2}`) : h.line2;
  html = replaceBlock(html, 'hero-h1', `      <h1 class="hero__title${page.city ? ' hero__title--city' : ''}" id="hero-title">
        <span class="hero__title-1">${esc(page.city ? m.name + ' Flooding' : h.line1)}</span>
        <span class="hero__title-2">${esc(line2)}<span class="visually-hidden"> ${page.city ? 'today' : 'in South Florida'}</span></span>
      </h1>`);

  /* Simple text fields (also the header tide pill) */
  [['city-name', m.name], ['summary', m.summary], ['flood-days', m.floodDays], ['flood-days-last', m.floodDaysLast],
   ['risk-label', RISK_LABEL[m.risk]], ['tide-status', m.tideStatus || 'Steady'], ['gauge', m.gauge], ['updated', m.updated],
   ['water-level', fmtLevel(m.level)], ['next-high', m.nextHigh || '-'], ['rainfall', m.rain != null ? m.rain.toFixed(2) : '-']]
    .forEach(([k, v]) => { html = setField(html, k, v); });

  /* Radial rings and risk slider */
  const dash = (days, r) => { const circ = 2 * Math.PI * r; return `${(Math.min(days / RADIAL_MAX_DAYS, 1) * circ).toFixed(1)} ${circ.toFixed(1)}`; };
  html = html.replace(/(data-ring="this" stroke-dasharray=")[^"]*"/, `$1${dash(m.floodDays, 52)}"`)
             .replace(/(data-ring="last" stroke-dasharray=")[^"]*"/, `$1${dash(m.floodDaysLast, 40)}"`)
             .replace(/data-risk-meter data-risk="\w+" style="--pos: \d+%"/, `data-risk-meter data-risk="${m.risk}" style="--pos: ${RISK_POS[m.risk]}%"`);

  /* Mini stats: first three cities that aren't this page's city */
  const minis = MINI_ORDER.filter((k) => k !== id && snap[k]).slice(0, 3).map((k) => { const c = snap[k]; return `      <li class="mini" data-mini data-risk="${c.risk}">
        <p class="mini__value"><span data-mini-level>${fmtLevel(c.level)}</span><span class="mini__unit">ft</span></p>
        <p class="mini__city"><span data-mini-city>${esc(c.name)}</span></p>
        <p class="mini__risk"><span data-mini-risk>${RISK_LABEL[c.risk]}</span> risk</p>
      </li>`; }).join('\n');
  html = replaceBlock(html, 'hero-mini', `    <ul class="hero__mini" role="list" aria-label="Peak water today in other cities">\n${minis}\n    </ul>`);

  /* City list */
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 10c1.5 0 1.5-1.6 3-1.6S7.5 10 9 10s1.5-1.6 3-1.6 1.5 1.6 3 1.6 1.5-1.6 3-1.6 1.5 1.6 3 1.6M3 15c1.5 0 1.5-1.6 3-1.6S7.5 15 9 15s1.5-1.6 3-1.6 1.5 1.6 3 1.6 1.5-1.6 3-1.6 1.5 1.6 3 1.6"/></svg>';
  const inner = (k) => `
          <span class="city-row__name">${esc(snap[k].name)}</span><span class="city-row__value">${fmtLevel(snap[k].level)} ft</span>
          <span class="city-row__icon" aria-hidden="true">${icon}</span>
        `;
  const rows = Object.keys(CITY).filter((k) => snap[k]).map((k) => page.city
    ? `        <li><a class="city-row" href="${k === id ? './' : '../' + k + '/'}" data-risk="${snap[k].risk}"${k === id ? ' aria-current="page"' : ''}>${inner(k)}</a></li>`
    : `        <li><button class="city-row" type="button" data-city-btn="${k}" aria-pressed="${k === 'miami'}" data-risk="${snap[k].risk}">${inner(k)}</button></li>`).join('\n');
  html = replaceBlock(html, 'hero-cities', `      <ul class="city-list" role="list" aria-labelledby="city-picker-label">\n${rows}\n      </ul>`);

  /* Tide wave: curve, HIGH/LOW labels, "Now" dot (as of deploy; hero.js moves it live) */
  if (m.tide.length) {
    const pts = HERO.extremes(m.tide);
    const labels = pts.filter((p) => !p.edge).map((p) => {
      const pct = p.t / 24 * 100;
      const cls = 'tide__label tide__label--' + p.type + (pct < 12 ? ' is-start' : pct > 88 ? ' is-end' : '');
      return `      <li class="${cls}" style="left:${pct.toFixed(2)}%;top:${HERO.yFor(p.h).toFixed(2)}%"><span>${p.type.toUpperCase()} ${p.time}</span><span>${p.h >= 0 ? '+' : ''}${p.h.toFixed(1)} FT</span></li>`;
    }).join('\n');
    const nowParts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
    const nowH = (+nowParts.find((x) => x.type === 'hour').value % 24) + (+nowParts.find((x) => x.type === 'minute').value) / 60;
    html = replaceBlock(html, 'hero-tide', `    <svg class="tide__svg" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
      <path class="tide__path" data-tide-path d="${HERO.buildPath(pts)}"/>
    </svg>

    <ul class="tide__labels" role="list" aria-hidden="true" data-tide-labels>
${labels}
    </ul>
    <span class="tide__now${pts.some((p) => !p.edge && p.type === 'high' && Math.abs(p.t - nowH) < 2) ? ' is-below' : ''}" data-tide-now style="left:${(nowH / 24 * 100).toFixed(2)}%;top:${HERO.yFor(HERO.heightAt(pts, nowH)).toFixed(2)}%" aria-hidden="true"><span class="tide__now-label">Now</span></span>`);
    const aria = 'Today\'s expected tide at ' + m.gauge + ': ' + m.tide.map((e) => `${e[2]} ${e[0]} at ${e[1]} feet`).join(', ') + '.';
    html = html.replace(/data-tide-aria aria-label="[^"]*"/, `data-tide-aria aria-label="${esc(aria)}"`);
  }

  /* JSON snapshot for the city switcher. "<" escaped so it can't close the script tag. */
  const inSeasonNow = (() => { const md = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, month: '2-digit', day: '2-digit' }).format(new Date()).replace('/', '-'); const s = SCHEDULE.kingTideSeason; return md >= s.start && md <= s.end; })();
  const anyAlert = Object.values(doc.cities).some((c) => c.alerts && c.alerts.items && c.alerts.items.length);
  const interval = inSeasonNow || anyAlert ? SCHEDULE.inSeasonEveryMinutes : SCHEDULE.offSeasonEveryMinutes;
  /* City pages only need their own city (smaller page) */
  const cities = page.city ? { [id]: snap[id] } : snap;
  const payload = JSON.stringify({ generatedAt: new Date().toISOString(), staleAfterMinutes: interval * (SCHEDULE.staleMultiplier || 3), cities }).replace(/</g, '\\u003c');
  html = replaceBlock(html, 'hero-data', `  <script type="application/json" id="hero-data">${payload}</script>`);

  /* City cards: risk chip + peak */
  Object.entries(snap).forEach(([k, c]) => {
    html = html.replace(new RegExp(`<span class="risk-chip" data-risk="\\w+" data-card-risk="${k}">[^<]*</span>`), `<span class="risk-chip" data-risk="${c.risk}" data-card-risk="${k}">${RISK_LABEL[c.risk]}</span>`)
               .replace(new RegExp(`(<strong data-card-peak="${k}">)[^<]*(</strong>)`), `$1${fmtLevel(c.level)} ft$2`);
  });
  html = replaceBlock(html, 'cities-status', `      <p class="label section-head__eyebrow">Updated ${esc(m.updated)} ET</p>`);
  console.log(`  hero: ${mc.headline ? mc.headline.line1 : '?'}; ${m.name} peak ${fmtLevel(m.level)} ft, risk ${m.risk}`);
  return html;
}

/* ========================================================================
   BY THE NUMBERS
   1. SE Florida Compact 2040 projection (fixed, published 2019)
   2. Flood days last meteorological year at Virginia Key (cities.json)
   3. FEMA flood insurance claims paid, Miami-Dade + Broward (stats.json)
   4. NOAA 2050 rise at Virginia Key, Intermediate (fixed, 2022 report:
      32 cm = 12.6 in, relative to 2005)
   ======================================================================== */
function stat(color, value, unit, label, sourceHtml) {
  return `      <li class="stat stat--line" style="--risk-color: var(${color})">
        <p class="stat__value">${value}<span class="stat__unit">${unit}</span></p>
        <p class="stat__label">${label}</p>
        <p class="stat__source">${sourceHtml}</p>
      </li>`;
}
function renderNumbers(html) {
  if (!html.includes('PRERENDER:numbers-stats')) return html;
  const doc = readJSON('cities.json');
  const claims = (readJSON('stats.json') || {}).nfipClaims;
  const mia = doc && doc.cities && doc.cities.miami;
  const fd = mia && mia.floodDays && mia.floodDays.lastYear;
  if (!fd || !claims) { console.log('  numbers: missing data, keeping sample'); return html; }
  const items = [
    stat('--risk-high', '+10–17', 'in', 'Sea level rise projected for South Florida by 2040, compared with 2000',
      'Source: <a href="https://southeastfloridaclimatecompact.org/announcements/the-compact-releases-its-3rd-regionally-unified-sea-level-rise-projection/" rel="noopener">SE Florida Regional Climate Change Compact, 2019</a>'),
    stat('--risk-moderate', String(fd.count), 'days', `Days Virginia Key reached the NWS minor flood level, ${esc(fd.label)}`,
      'Source: <a href="https://tidesandcurrents.noaa.gov/stationhome.html?id=8723214" rel="noopener">NOAA Tides &amp; Currents</a>, NWS flood levels'),
    stat('--risk-severe', '$' + (claims.paidUsd / 1e9).toFixed(2), 'billion', `Flood insurance claims paid in Miami-Dade and Broward since ${claims.firstYear} (${claims.count.toLocaleString('en-US')} claims)`,
      'Source: <a href="https://www.fema.gov/about/openfema/data-sets" rel="noopener">FEMA NFIP claims (OpenFEMA)</a>, updated weekly'),
    stat('--tide-aqua', '+12.6', 'in', 'More sea level rise expected at Virginia Key by 2050, compared with 2005 (NOAA Intermediate scenario)',
      'Source: <a href="https://tidesandcurrents.noaa.gov/sltrends/sltrends_station.shtml?id=8723214" rel="noopener">NOAA 2022 projections, Virginia Key station</a>')
  ];
  html = replaceBlock(html, 'numbers-stats', `    <ul class="numbers__grid" role="list">\n${items.join('\n')}\n    </ul>`);
  html = replaceBlock(html, 'numbers-status', '');
  console.log('  numbers: rendered 4 stats');
  return html;
}


/* ========================================================================
   PROPOSED FIXES TIMELINE (city pages)
   Reads data/curated/timeline/<city>.json from the repo (hand-edited,
   reviewed quarterly). Newest first. Entries without a source are skipped.
   ======================================================================== */
const STATUS_SLUG = (s) => String(s || '').toLowerCase().replace(/\s+/g, '-');
const fmtUsd = (n) => n >= 1e9 ? '$' + (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B' : '$' + Math.round(n / 1e6) + 'M';
const fmtMonth = (d) => new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z'));

function renderFixes(html, page) {
  if (!page.city || !html.includes('PRERENDER:fixes')) return html;
  let tl;
  try { tl = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'curated', 'timeline', page.city + '.json'), 'utf8')); }
  catch (e) { console.log(`  fixes: no timeline file for ${page.city}`); return html; }
  const items = (tl.items || []).filter((i) => i.sources && i.sources.length).sort((a, b) => b.date.localeCompare(a.date));
  if (!items.length) return html;

  /* Summary strip. "Proposed or under way" leaves out completed, revised and
     on-hold items, and any item marked inTotal:false (its cost is already
     inside a bigger plan), so nothing is counted twice. */
  const live = items.filter((i) => !/revised|on hold|completed/i.test(i.status) && i.inTotal !== false);   // inTotal:false = part of another item's budget
  const total = live.reduce((a, i) => a + (i.cost && i.cost.usd || 0), 0);
  const count = (re) => items.filter((i) => re.test(i.status)).length;
  const maxCost = Math.max(...items.map((i) => (i.cost && i.cost.usd) || 0));
  const sum = (num, label) => `      <div class="fixes__sum"><p class="fixes__sum-num">${num}</p><p class="fixes__sum-label">${label}</p></div>`;

  const cards = items.map((i) => {
    const usd = (i.cost && i.cost.usd) || 0;
    const pct = maxCost ? Math.max(2, Math.sqrt(usd / maxCost) * 100) : 0;   // square-root scale
    const srcs = i.sources.map((x) => `<a href="${esc(x.url)}" rel="noopener">${esc(x.name)}</a>`).join(', ');
    return `      <li class="tl" data-status="${STATUS_SLUG(i.status)}">
        <span class="tl__year" aria-hidden="true">${esc(i.date.slice(0, 4))}</span>
        <article class="tl__card">
          <div class="tl__top"><time class="tl__when" datetime="${esc(i.date)}">${esc(fmtMonth(i.date))}</time><span class="tl__status">${esc(i.status)}</span></div>
          <h3 class="tl__title">${esc(i.title)}</h3>
          <div class="tl__cost">
            <p class="tl__cost-num${usd ? '' : ' tl__cost-num--none'}">${esc((i.cost && i.cost.label) || (usd ? fmtUsd(usd) : 'Cost not published'))}</p>
            ${usd ? `<div class="tl__bar" aria-hidden="true"><span style="width:${pct.toFixed(1)}%"></span></div>` : ''}
          </div>
          <p class="tl__summary">${esc(i.summary)}</p>
          <p class="tl__outcome"><strong>Outcome</strong>${esc(i.outcome)}</p>
          <p class="tl__sources">Source: ${srcs}</p>
        </article>
      </li>`;
  }).join('\n');

  html = replaceBlock(html, 'fixes', `    <div class="fixes__summary">
${sum(fmtUsd(total), 'proposed or under way')}
${sum(items.length, 'plans, projects, and funding')}
${sum(count(/in progress|in design/i), 'in design or under construction')}
${sum(count(/completed/i), 'completed')}
    </div>
    <ol class="timeline" role="list">
${cards}
    </ol>
    <p class="fixes__note">Bars compare each cost with the largest item (square-root scale, so smaller projects stay visible). Last reviewed ${esc(fmtMonth(tl.lastReviewed))}. Costs are as published; final costs may change.</p>`);
  console.log(`  fixes: ${items.length} items, ${fmtUsd(total)}`);
  return html;
}

/* ========================================================================
   NEWS PAGE (news/index.html)
   Every story in news.json as a text card (no photos, so 60 stories don't
   repeat the same 10 images), plus city filter chips with counts.
   js/news.js does the filtering and "Load more" in the browser.
   ======================================================================== */
function renderNewsPage(html, page) {
  if (page.type !== 'news') return html;
  const news = readJSON('news.json');
  const items = news && news.items || [];
  if (!items.length) { console.log('  news page: no data, keeping sample'); return html; }
  const cards = items.map((it) => {
    const tags = it.cities.map((c) => CITY[c] && `<span class="tag">${esc(CITY[c].name)}</span>`).filter(Boolean).join('') || '<span class="tag">Regional</span>';
    return `      <li class="card" data-cities="${esc(it.cities.join(' '))}">
        <div class="card__body">
          <p class="card__meta">${it.date ? `<time datetime="${esc(it.date)}">${esc(fmtDate(it.date))}</time>` : ''}${tags}</p>
          <h3 class="card__title"><a href="${esc(it.link)}" target="_blank" rel="noopener">${esc(it.headline)}<span class="visually-hidden"> (opens ${esc(it.source)} in a new tab)</span></a></h3>
          <p class="card__text">${esc(it.source)}</p>
        </div>
      </li>`;
  });
  const n = (id) => items.filter((it) => it.cities.includes(id)).length;
  const chip = (id, name, k) => `      <button class="city-chip city-chip--plain" type="button" aria-pressed="${id === 'all'}" data-filter="${id}">${esc(name)} <span class="count">${k}</span></button>`;
  const chips = [chip('all', 'All', items.length)].concat(Object.keys(CITY).filter((id) => n(id)).map((id) => chip(id, CITY[id].name, n(id))));
  html = replaceBlock(html, 'news-chips', `    <div class="news-filter js-only" role="group" aria-label="Filter stories by city" data-news-filter>\n${chips.join('\n')}\n    </div>`);
  html = replaceBlock(html, 'news-feed', `    <ol class="news-list" role="list" data-news-list>\n${cards.join('\n')}\n    </ol>`);
  html = replaceBlock(html, 'news-status', `        <p class="label section-head__eyebrow">${items.length} stories · Updated ${esc(fmtTime(new Date()))} ET</p>`);
  console.log(`  news page: ${items.length} stories`);
  return html;
}

/* sitemap.xml: sets every <lastmod> to today's date, since pages are
   re-rendered with fresh data on every deploy. */
function updateSitemap() {
  const f = path.join(SITE, 'sitemap.xml');
  if (!fs.existsSync(f)) return;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());   // YYYY-MM-DD
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/<lastmod>[^<]*<\/lastmod>/g, `<lastmod>${today}</lastmod>`));
  console.log(`sitemap: lastmod ${today}`);
}

/* ----- Main ------------------------------------------------------------- */
/* Every page that exists: the home page plus each city folder */
const PAGES = [{ file: 'index.html', city: null, base: '' }]
  .concat(Object.keys(CITY).map((id) => ({ file: `${id}/index.html`, city: id, base: '../' })))
  .concat([{ file: 'news/index.html', city: null, base: '../', type: 'news' }])
  .filter((p) => fs.existsSync(path.join(SITE, p.file)));

PAGES.forEach((page) => {
  const file = path.join(SITE, page.file);
  let html = fs.readFileSync(file, 'utf8');
  console.log(`prerender: ${page.file}`);
  if (page.type === 'news') { fs.writeFileSync(file, renderNewsPage(html, page)); return; }
  html = renderNews(html, page);
  html = renderHero(html, page);
  html = renderNumbers(html);
  html = renderFixes(html, page);
  fs.writeFileSync(file, html);
});
updateSitemap();
console.log('prerender: done');
