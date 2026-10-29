#!/usr/bin/env node
/* ==========================================================================
   scripts/fetch-meetings.js
   Finds upcoming government meetings that deal with flooding, stormwater,
   seawalls, sea level rise, or ground and water problems, and writes
   data/meetings.json. Settings: config/meetings.json.

   Two kinds of calendar are read:
     legistar  Legistar public API (Hollywood, Fort Lauderdale, Hallandale
               Beach, Broward County). Each meeting's agenda items are checked
               against agendaKeywords, so only relevant meetings are kept.
     iqm2      City of Miami's calendar RSS. Agendas are PDFs, so only the
               meeting name is checked (bodyKeywords).

   Writes: { items: [{ id, org, title, level, cities, date, time, start,
             location, topics, link, agenda, source }], updatedAt }
   Each source is independent: if one fails, its last good meetings are kept.
   Hand-added meetings (GitHub form) are in data/curated/meetings.json and
   are merged in at deploy by prerender.js, not here.

   Run:  node scripts/fetch-meetings.js   (FORCE=1 to skip the schedule)
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { fetchJSON, fetchText } = require('./lib/http');
const { PATHS } = require('./lib/config');
const { readData, writeData, loadMeta, saveMeta, recordSuccess, recordError, checkDue } = require('./lib/store');
const { isoDateET, addDaysYmd, offsetET } = require('./lib/time');
const { clean } = require('./lib/text');

const CFG = JSON.parse(fs.readFileSync(path.join(PATHS.config, 'meetings.json'), 'utf8'));

/* Whole-word, case-insensitive matcher for a list of phrases */
const words = (list) => new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${list.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]+')).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'iu');
const BODY_RE = words(CFG.bodyKeywords);
const AGENDA_RE = words(CFG.agendaKeywords);
const EXCLUDE_RE = words(CFG.agendaExclude);
const relevantItem = (t) => AGENDA_RE.test(t) && !EXCLUDE_RE.test(t);

/* "1:00 PM" + "2026-11-05" -> "2026-11-05T13:00:00-05:00" (Eastern time) */
function toISO(date, time) {
  const m = /(\d{1,2}):(\d{2})\s*([AP])M/i.exec(time || '');
  let h = 12, min = 0;                           // no time listed: assume noon
  if (m) { h = (+m[1] % 12) + (m[3].toUpperCase() === 'P' ? 12 : 0); min = +m[2]; }
  const off = offsetET(new Date(`${date}T12:00:00Z`));
  return `${date}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00${off}`;
}

/* Turns a long legal agenda title into one readable line:
   "A Resolution Of The City Commission Of The City Of Hollywood, Florida,
   Establishing The Hollywood Beach ... Trust Fund; Establishing..." ->
   "Establishing The Hollywood Beach ... Trust Fund" */
function shortTopic(t) {
  let s = clean(t)
    .replace(/^(?:an?\s+)?(?:resolution|ordinance|motion)\s+of\s+the\s+.*?(?:florida|county),?\s*/i, '')
    .replace(/^(?:a|an)\s+(?:resolution|ordinance)[^,]*,\s*/i, '');
  s = s.split(/;\s/)[0].trim();
  if (s.length > 140) s = s.slice(0, 137).replace(/\s+\S*$/, '') + '...';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ----- Legistar ---------------------------------------------------------- */
async function fromLegistar(src, from, to) {
  const base = `https://webapi.legistar.com/v1/${src.client}`;
  const q = `$filter=EventDate+ge+datetime'${from}'+and+EventDate+le+datetime'${to}'&$orderby=EventDate`;
  const events = await fetchJSON(`${base}/events?${q}`);
  const out = [];
  for (const e of events) {
    const date = e.EventDate.slice(0, 10);
    const bodyHit = BODY_RE.test(e.EventBodyName);
    let topics = [];
    try {
      const items = await fetchJSON(`${base}/events/${e.EventId}/eventitems`, { timeoutMs: 30000 });
      topics = items.map((i) => i.EventItemTitle || i.EventItemMatterName || '').filter(relevantItem).map(shortTopic);
    } catch (err) { if (!bodyHit) continue; }    // can't read the agenda: keep only if the name matches
    if (!bodyHit && !topics.length) continue;
    out.push({
      id: `${src.client}-${e.EventId}`,
      org: src.org, title: e.EventBodyName.replace(/\s+/g, ' ').trim(), level: src.level, cities: src.cities,
      date, time: e.EventTime || '', start: toISO(date, e.EventTime),
      location: e.EventLocation || '',
      topics: [...new Set(topics)].slice(0, 3),
      link: e.EventInSiteURL || `https://${src.client}.legistar.com/Calendar.aspx`,
      agenda: e.EventAgendaFile || null,
      source: 'Legistar'
    });
  }
  return out;
}

/* ----- iqm2 (City of Miami) ---------------------------------------------- */
async function fromIqm2(src, from, to) {
  const xml = await fetchText(src.url);
  const out = [];
  /* Each meeting: <h2>Body - Agenda - Nov 2, 2026 6:00 PM</h2> ... Detail_Meeting.aspx?ID=5360 */
  const re = /<h2>([\s\S]*?)<\/h2>[\s\S]*?(https?:\/\/[^'"]*Detail_Meeting\.aspx\?ID=(\d+))/gi;
  let m;
  while ((m = re.exec(xml))) {
    const head = clean(m[1]);
    const parts = /^(.*?)\s+-\s+(?:Agenda|Notice|Meeting)[^-]*-\s+([A-Z][a-z]{2} \d{1,2}, \d{4})\s*(\d{1,2}:\d{2}\s*[AP]M)?/i.exec(head);
    if (!parts) continue;
    const date = isoDateET(new Date(`${parts[2]} 12:00 GMT-0500`));
    if (date < from || date > to || !BODY_RE.test(parts[1])) continue;
    out.push({
      id: `miami-iqm2-${m[3]}`,
      org: src.org, title: parts[1].trim(), level: src.level, cities: src.cities,
      date, time: (parts[3] || '').toUpperCase(), start: toISO(date, parts[3]),
      location: '', topics: [], link: m[2], agenda: null, source: 'City of Miami'
    });
  }
  return out;
}

/* ----- Main -------------------------------------------------------------- */
(async () => {
  const meta = loadMeta();
  const due = checkDue(meta, 'meetings', 'meetings');
  if (!due.due) { console.log(`meetings: not due yet (every ${due.intervalMinutes} min). Exiting.`); return; }

  const today = isoDateET();
  const to = addDaysYmd(today.replace(/-/g, ''), CFG.lookAheadDays).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
  const prev = readData('meetings.json', { items: [] });
  let items = [];

  for (const src of CFG.sources) {
    const key = `meetings:${src.client || src.org}`;
    try {
      const got = src.type === 'legistar' ? await fromLegistar(src, today, to) : await fromIqm2(src, today, to);
      console.log(`  ${src.org}: ${got.length} flood-related meeting(s)`);
      items = items.concat(got);
      recordSuccess(meta, key);
    } catch (err) {
      recordError(meta, key, err);
      /* keep this source's last good meetings that haven't happened yet */
      items = items.concat(prev.items.filter((i) => i.org === src.org && i.date >= today));
    }
  }

  items.sort((a, b) => a.start.localeCompare(b.start));
  meta.runs.meetings = new Date().toISOString();
  const changed = writeData('meetings.json', { items });   // no timestamp, so unchanged data doesn't trigger a commit
  saveMeta(meta);
  console.log(`meetings: ${items.length} total. meetings.json ${changed ? 'updated' : 'unchanged'}.`);
})().catch((err) => { console.error(err); process.exit(1); });
