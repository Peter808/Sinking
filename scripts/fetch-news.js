#!/usr/bin/env node
/* ==========================================================================
   scripts/fetch-news.js
   Pulls headlines from the RSS feeds in config/sources.json (status "ok"),
   filters them, and writes data/news.json. Auto-publishes: no review step.

   For each headline:
     1. Must contain a flood word (keywords.json "relevance") and no
        "exclude" phrase
     2. Must mention a South Florida place, unless the feed is a city's own
        newsroom (cityHint)
     3. Dropped if it hits the blocklist or a URL you hid
     4. Tagged with cities found in the headline
   Then: dedupe by URL and near-identical headline, newest first, keep 60.

   Stored per item: headline, source, link, date, cities. Never article
   text or images (copyright).

   Run:  node scripts/fetch-news.js        (respects newsEveryMinutes)
         FORCE=1 node scripts/fetch-news.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { fetchText } = require('./lib/http');
const { PATHS } = require('./lib/config');
const { readData, writeData, loadMeta, saveMeta, recordSuccess, recordError, checkDue } = require('./lib/store');
const T = require('./lib/text');

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

/* Pulls <item> (RSS) or <entry> (Atom) blocks out of a feed.
   Simple regex parsing is enough for headlines and links. */
function parseFeed(xml) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/g) || [];
  const tag = (b, t) => { const m = new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`, 'i').exec(b); return m ? T.clean(m[1]) : ''; };
  return blocks.map((b) => {
    let link = tag(b, 'link');
    if (!link) { const m = /<link[^>]*href="([^"]+)"/i.exec(b); link = m ? m[1] : ''; }
    const src = /<source[^>]*>([\s\S]*?)<\/source>/i.exec(b); // Google News names the original outlet here
    return {
      title: tag(b, 'title'),
      link: link.replace(/&amp;/g, '&'),
      date: tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'),
      outlet: src ? T.clean(src[1]) : ''
    };
  });
}

/* Google News headlines end with " - Outlet Name"; move that to `source` */
function splitOutlet(title, outlet) {
  if (outlet && title.endsWith(' - ' + outlet)) return { title: title.slice(0, -(outlet.length + 3)), outlet };
  return { title, outlet };
}

async function main() {
  const meta = loadMeta();
  meta.blocked = meta.blocked || {};
  const due = checkDue(meta, 'news', 'news');
  if (!due.due) { console.log(`news: not due yet (every ${due.intervalMinutes} min). Exiting.`); return; }

  const sources = JSON.parse(fs.readFileSync(path.join(PATHS.config, 'sources.json'), 'utf8'));
  const feeds = sources.news.filter((s) => s.status === 'ok' && s.url);
  const max = (sources.limits && sources.limits.newsMax) || 60;
  console.log(`news: ${feeds.length} feeds`);

  const fresh = [];
  let blocked = 0, ok = 0;
  for (const f of feeds) {
    const key = `news:${f.name}${f.query ? ' / ' + f.query : ''}`;
    try {
      const xml = await fetchText(f.url, f.userAgent === 'browser' ? { userAgent: BROWSER_UA } : {});
      const items = parseFeed(xml);
      let kept = 0;
      items.forEach((it) => {
        const { title, outlet } = splitOutlet(it.title, it.outlet);
        if (!title || !it.link) return;
        if (title.split(' ').length < 4) return;          // skip slugs like "miami-future-srl-flooding"
        if (!T.isRelevant(title)) return;
        if (!f.cityHint && !T.hasLocation(title)) return;
        if (T.isBlocked(title, outlet) || T.isHidden(it.link)) { blocked++; return; }
        const d = new Date(it.date);
        const cities = T.cityTags(title);
        if (f.cityHint && !cities.includes(f.cityHint)) cities.push(f.cityHint);
        fresh.push({
          headline: title,
          source: outlet || f.name,
          link: it.link,
          date: isNaN(d) ? null : d.toISOString(),
          cities,
          via: f.name
        });
        kept++;
      });
      console.log(`  ${key}: ${items.length} items, kept ${kept}`);
      recordSuccess(meta, key); ok++;
    } catch (err) { recordError(meta, key, err); }
  }

  /* Merge with what we already have (keeps older items when a feed is down) */
  const prev = readData('news.json', { items: [] }).items || [];
  const all = [...fresh, ...prev]
    .filter((x) => !T.isHidden(x.link) && !T.isBlocked(x.headline, x.source))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const out = [];
  const seen = new Set();
  for (const it of all) {
    const u = T.normUrl(it.link);
    if (seen.has(u) || out.some((o) => T.sameStory(o.headline, it.headline))) continue;
    seen.add(u); out.push(it);
    if (out.length >= max) break;
  }

  meta.blocked.news = blocked;
  meta.runs.news = new Date().toISOString();
  if (ok === 0 && feeds.length) console.warn('news: every feed failed; keeping the previous news.json');
  const changed = ok > 0 && writeData('news.json', { items: out });
  saveMeta(meta);
  console.log(`news: ${out.length} items (${blocked} blocked). news.json ${changed ? 'updated' : 'unchanged'}.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
