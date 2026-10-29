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
     news-status  "Updated 2:15 PM" eyebrow (replaces the Sample badge)
     news-cards   3 newest headlines, one per city where possible

   Usage: node scripts/prerender.js <site-folder>   (e.g. _site)
          Reads data from <site-folder>/data unless DATA_DIR is set.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const SITE = path.resolve(process.argv[2] || '.');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(SITE, 'data');
const TZ = 'America/New_York';

/* City id -> display name and card photo. Add a city here if one is added to config. */
const CITY = {
  'miami': { name: 'Miami', img: 'images/city-miami.webp' },
  'miami-beach': { name: 'Miami Beach', img: 'images/city-miami-beach.webp' },
  'hallandale-beach': { name: 'Hallandale Beach', img: 'images/city-hallandale-beach.webp' },
  'hollywood': { name: 'Hollywood', img: 'images/city-hollywood.webp' },
  'fort-lauderdale': { name: 'Fort Lauderdale', img: 'images/city-fort-lauderdale.webp' }
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch (e) { return null; } };
const fmtDate = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
const fmtTime = (d) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(d);

/* Swaps the content between a START/END marker pair. Returns the new HTML
   (unchanged if the markers aren't found). */
function replaceBlock(html, name, inner) {
  const re = new RegExp(`(<!-- PRERENDER:${name} START[\\s\\S]*?-->)[\\s\\S]*?(<!-- PRERENDER:${name} END -->)`);
  if (!re.test(html)) { console.warn(`  marker PRERENDER:${name} not found`); return html; }
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
function newsCard(it) {
  const city = CITY[it.cities[0]] || CITY.miami;
  const tags = it.cities.map((c) => CITY[c] && `<span class="tag">${esc(CITY[c].name)}</span>`).filter(Boolean).join('');
  return `      <li class="card">
        <div class="card__media"><img src="${city.img}" alt="" loading="lazy" decoding="async"></div>
        <div class="card__body">
          <p class="card__meta">${it.date ? `<time datetime="${esc(it.date)}">${esc(fmtDate(it.date))}</time>` : ''}${tags}</p>
          <h3 class="card__title"><a href="${esc(it.link)}" target="_blank" rel="noopener">${esc(it.headline)}<span class="visually-hidden"> (opens ${esc(it.source)} in a new tab)</span></a></h3>
          <p class="card__text">${esc(it.source)}</p>
        </div>
      </li>`;
}

function renderNews(html) {
  const news = readJSON('news.json');
  const items = news && news.items || [];
  if (!items.length) { console.log('  news: no data, keeping sample cards'); return html; }
  const pick = pickVaried(items, 3);
  html = replaceBlock(html, 'news-cards', `    <ul class="news__row" role="list">\n${pick.map(newsCard).join('\n')}\n    </ul>`);
  html = replaceBlock(html, 'news-status', `          <p class="label section-head__eyebrow">Updated ${esc(fmtTime(new Date()))} ET</p>`);
  console.log(`  news: rendered ${pick.length} cards`);
  return html;
}

/* ----- Main ------------------------------------------------------------- */
const file = path.join(SITE, 'index.html');
let html = fs.readFileSync(file, 'utf8');
console.log(`prerender: ${file}`);
html = renderNews(html);
fs.writeFileSync(file, html);
console.log('prerender: done');
