#!/usr/bin/env node
/* ==========================================================================
   scripts/intake.js
   Run by .github/workflows/issue-intake.yml when the owner submits one of
   the GitHub Issue Forms. Reads the form answers from the issue body and
   updates the hand-edited data files on main:
     add-meeting  -> data/curated/meetings.json (new meeting card)
     hide-item    -> data/curated/hidden.json   (link to leave off the site)
   Input (environment): ISSUE_BODY, ISSUE_LABELS (comma list), ISSUE_NUMBER
   Output: writes a short message to intake-result.md for the issue comment.
   Exits 1 (and explains why) if the form has a problem, so nothing is saved.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { offsetET } = require('./lib/time');

const ROOT = path.join(__dirname, '..');
const CURATED = path.join(ROOT, 'data', 'curated');
const CITY_IDS = { 'Miami': 'miami', 'Miami Beach': 'miami-beach', 'Hallandale Beach': 'hallandale-beach', 'Hollywood': 'hollywood', 'Fort Lauderdale': 'fort-lauderdale' };
const COUNTY_CITIES = { 'miami-dade': ['miami', 'miami-beach'], 'broward': ['hallandale-beach', 'hollywood', 'fort-lauderdale'] };
const LEVELS = { 'City': 'city', 'County': 'county', 'Regional or state': 'regional', 'Neighborhood or HOA': 'community' };

const body = process.env.ISSUE_BODY || '';
const labels = (process.env.ISSUE_LABELS || '').split(',').map((s) => s.trim());
const issue = process.env.ISSUE_NUMBER || '';

/* Issue forms arrive as "### Label\n\nanswer" blocks. Returns { label: answer }.
   "_No response_" (left blank) becomes "". */
function parseForm(md) {
  const out = {};
  md.split(/^###\s+/m).slice(1).forEach((block) => {
    const [label, ...rest] = block.split('\n');
    const val = rest.join('\n').trim();
    out[label.trim()] = val === '_No response_' ? '' : val;
  });
  return out;
}

const readJSON = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return fb; } };
const writeJSON = (f, d) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n'); };
const result = (msg) => fs.writeFileSync(path.join(ROOT, 'intake-result.md'), msg);
function fail(msg) { result(`Nothing was saved. ${msg}\n\nClose this issue and fill in the form again.`); console.error(msg); process.exit(1); }
const isUrl = (u) => /^https?:\/\/\S+$/i.test(u);

const f = parseForm(body);

/* ----- Add a public meeting ---------------------------------------------- */
if (labels.includes('add-meeting')) {
  const title = f['Meeting name'], org = f['Who is holding it'], date = f['Date'];
  const time = f['Start time'] || '', link = f['Link to the meeting notice or agenda'];
  if (!title || !org) fail('The meeting name and who is holding it are both required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) fail(`The date "${date}" isn't in YYYY-MM-DD format, for example 2026-11-12.`);
  if (!isUrl(link)) fail(`The link "${link}" doesn't look like a web address (it should start with https://).`);
  const tm = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i.exec(time.trim());
  if (time && !tm) fail(`The start time "${time}" should look like 6:00 PM.`);

  let cities = ((f['Which city pages should show it'] || '').match(/- \[x\] (.+)/gi) || []).map((l) => CITY_IDS[l.replace(/- \[x\] /i, '').trim()]).filter(Boolean);
  const level = LEVELS[f['Type of meeting']] || 'city';
  /* County or regional meeting with no city ticked: show on every city it covers */
  if (!cities.length) cities = /broward/i.test(org) ? COUNTY_CITIES.broward : /miami-dade|dade/i.test(org) ? COUNTY_CITIES['miami-dade'] : Object.values(CITY_IDS);

  let h = 12, min = 0;
  if (tm) { h = (+tm[1] % 12) + (tm[3].toLowerCase() === 'p' ? 12 : 0); min = +(tm[2] || 0); }
  const start = `${date}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00${offsetET(new Date(`${date}T12:00:00Z`))}`;

  const file = path.join(CURATED, 'meetings.json');
  const doc = readJSON(file, { _comment: 'Meetings added with the "Add a public meeting" GitHub form. Safe to edit or delete entries by hand. Past meetings stop showing on their own.', items: [] });
  doc.items = doc.items.filter((m) => m.link !== link);           // re-submitting the same link replaces it
  doc.items.push({
    id: `manual-${issue || Date.now()}`, org, title, level, cities, date,
    time: tm ? `${+tm[1]}:${tm[2] || '00'} ${tm[3].toUpperCase()}M` : '', start,
    location: f['Where'] || '', summary: (f["What's being discussed"] || '').replace(/\s+/g, ' ').slice(0, 280),
    topics: [], link, agenda: null, source: `GitHub issue #${issue}`
  });
  doc.items.sort((a, b) => a.start.localeCompare(b.start));
  writeJSON(file, doc);
  result(`Added **${title}** (${org}) on ${date}${time ? ' at ' + time : ''}.\nIt shows on the News page after the redeploy finishes (about 2 minutes), and pins to the home page and ${cities.length} city page(s) 7 days before.`);
  console.log('meeting added');
}

/* ----- Hide a post ------------------------------------------------------- */
else if (labels.includes('hide-item')) {
  const link = f['Link of the item to hide'];
  if (!isUrl(link)) fail(`The link "${link}" doesn't look like a web address.`);
  const file = path.join(CURATED, 'hidden.json');
  const doc = readJSON(file, { _comment: 'Links left off the site (news, meetings, alerts). Added with the "Hide a post" GitHub form. Delete a line to show it again.', items: [] });
  if (!doc.items.some((x) => (x.url || x) === link)) doc.items.push({ url: link, reason: f['Why (just for your records)'] || '', issue: +issue || null, at: new Date().toISOString().slice(0, 10) });
  writeJSON(file, doc);
  result(`Hidden. The item leaves the site after the redeploy finishes (about 2 minutes).`);
  console.log('item hidden');
}

else fail('This issue has neither the add-meeting nor the hide-item label.');
