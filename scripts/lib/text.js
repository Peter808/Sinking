/* ==========================================================================
   scripts/lib/text.js
   Text matching shared by the news and social fetchers:
     - keyword relevance (config/keywords.json)
     - location check and city tags
     - blocklist (config/blocklist.txt)
     - hidden URLs (data/curated/hidden.json)
     - near-duplicate headline detection
   All matching is case-insensitive and whole-word.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { PATHS } = require('./config');

let kw = null, block = null, hidden = null;

/* Builds a whole-word regex for a list of terms/phrases.
   "tide" matches "tide" and "Tide," but not "tidewater". */
function wordsRegex(terms) {
  const esc = terms.filter(Boolean).map((t) => t.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
  return esc.length ? new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${esc.join('|')})(?=$|[^\\p{L}\\p{N}])`, 'iu') : null;
}

function keywords() {
  if (kw) return kw;
  const k = JSON.parse(fs.readFileSync(path.join(PATHS.config, 'keywords.json'), 'utf8'));
  kw = {
    relevance: wordsRegex(k.relevance),
    exclude: k.exclude && k.exclude.length ? new RegExp(k.exclude.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i') : null,
    socialFlood: wordsRegex(k.socialFlood),
    location: wordsRegex(k.locationTerms),
    cityTags: Object.entries(k.cityTags).map(([id, c]) => ({ id, re: wordsRegex(c.terms), ctx: c.requiresContext ? wordsRegex(c.requiresContext) : null }))
  };
  return kw;
}

/* Reads config/blocklist.txt: one term per line, # for comments */
function blocklist() {
  if (block !== null) return block;
  const lines = fs.readFileSync(path.join(PATHS.config, 'blocklist.txt'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  block = wordsRegex(lines);
  return block;
}

/* URLs you hid with the "Hide a post" form (data/curated/hidden.json) */
function hiddenUrls() {
  if (hidden) return hidden;
  try {
    const h = JSON.parse(fs.readFileSync(path.join(PATHS.root, 'data', 'curated', 'hidden.json'), 'utf8'));
    hidden = new Set((h.items || h || []).map((x) => normUrl(typeof x === 'string' ? x : x.url)));
  } catch (e) { hidden = new Set(); }
  return hidden;
}

/* --- Checks --- */
const isRelevant = (text) => { const k = keywords(); return !!(k.relevance && k.relevance.test(text)) && !(k.exclude && k.exclude.test(text)); };
const isSocialFlood = (text) => !!keywords().socialFlood.test(text);
const hasLocation = (text) => !!keywords().location.test(text);
const isBlocked = (...texts) => { const b = blocklist(); return !!b && texts.some((t) => t && b.test(t)); };
const isHidden = (url) => hiddenUrls().has(normUrl(url));

/* City ids mentioned in the text, most specific first ("Miami Beach" -> miami-beach, not miami) */
function cityTags(text) {
  const tags = [];
  let rest = text;
  keywords().cityTags.forEach((c) => {
    if (c.re && c.re.test(rest) && (!c.ctx || c.ctx.test(text))) {
      tags.push(c.id);
      rest = rest.replace(new RegExp(c.re.source, 'giu'), ' '); // so "Miami Beach" doesn't also tag "Miami"
    }
  });
  return tags;
}

/* --- Dedupe helpers --- */
function normUrl(u) {
  try { const x = new URL(u); x.hash = ''; ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((p) => x.searchParams.delete(p)); return x.toString().replace(/\/$/, ''); }
  catch (e) { return String(u || ''); }
}
/* Headline "fingerprint": lowercase words, no punctuation, no source suffix */
function titleKey(t) {
  return String(t).toLowerCase().replace(/\s+[-|–]\s+[^-|–]+$/, '').replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter((w) => w.length > 2);
}
/* Near-identical = 80% of the shorter headline's words appear in the other */
function sameStory(a, b) {
  const A = new Set(titleKey(a)), B = new Set(titleKey(b));
  if (!A.size || !B.size) return false;
  let hit = 0; A.forEach((w) => { if (B.has(w)) hit++; });
  return hit / Math.min(A.size, B.size) >= 0.8;
}

/* Strips tags and decodes the common HTML entities in RSS text */
function clean(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

module.exports = { isRelevant, isSocialFlood, hasLocation, isBlocked, isHidden, cityTags, normUrl, sameStory, clean };
