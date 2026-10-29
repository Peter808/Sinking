/* ==========================================================================
   scripts/lib/store.js
   Reading and writing the generated JSON files, plus meta.json bookkeeping.

   meta.json records, per source:
     lastRun      when the script last tried (used for the schedule check)
     lastSuccess  when it last got good data
     lastError    { at, message } from the most recent failure, or null
   If a source fails, its old values in cities.json are left alone
   ("keep the last good value") and only lastError changes.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { PATHS, loadConfig } = require('./config');
const { inSeason } = require('./time');

/* Reads a JSON file from /data. Returns `fallback` if it doesn't exist yet. */
function readData(name, fallback) {
  const file = path.join(PATHS.data, name);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}

/* Writes a JSON file to /data only if its content actually changed.
   Returns true when the file was written. */
function writeData(name, obj) {
  const file = path.join(PATHS.data, name);
  const next = JSON.stringify(obj, null, 2) + '\n';
  let prev = null;
  try { prev = fs.readFileSync(file, 'utf8'); } catch (e) { /* new file */ }
  if (prev === next) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
  return true;
}

/* ----- meta.json ------------------------------------------------------- */
function loadMeta() { return readData('meta.json', { sources: {}, runs: {} }); }
function saveMeta(meta) { return writeData('meta.json', meta); }

function recordSuccess(meta, key) {
  const s = (meta.sources[key] = meta.sources[key] || {});
  s.lastSuccess = new Date().toISOString();
  s.lastError = null;
}
function recordError(meta, key, err) {
  const s = (meta.sources[key] = meta.sources[key] || {});
  s.lastError = { at: new Date().toISOString(), message: String(err && err.message || err) };
  console.warn(`  ! ${key}: ${s.lastError.message}`);
}

/* ----- Schedule check ---------------------------------------------------
   Decides whether a script should run now.
   runKey: which script ('tides', 'weather', 'floods', 'news', 'social');
           each keeps its own last-run time in meta.runs
   type:   'conditions' (tides, weather, alerts), 'news', 'social', or 'stats'
   - conditions: hourly in king tide season, every 6h off-season, and hourly
     whenever any flood alert is active (alertOverride in schedule.json)
   - FORCE=1 skips the check (manual runs, tests)
   Returns { due, intervalMinutes, reason } */
function checkDue(meta, runKey, type, now = new Date()) {
  const { schedule } = loadConfig();
  let interval, reason;
  if (type === 'news') { interval = schedule.newsEveryMinutes; reason = 'news interval'; }
  else if (type === 'social') { interval = schedule.socialEveryMinutes; reason = 'social interval'; }
  else if (type === 'stats') { interval = schedule.statsEveryMinutes; reason = 'weekly stats'; }
  else {
    const season = inSeason(schedule.kingTideSeason, now);
    const alerts = schedule.alertOverride && anyFloodAlert();
    interval = season || alerts ? schedule.inSeasonEveryMinutes : schedule.offSeasonEveryMinutes;
    reason = alerts ? 'flood alert active (hourly override)' : season ? 'king tide season' : 'off-season';
  }
  const last = meta.runs[runKey] ? new Date(meta.runs[runKey]) : null;
  /* 5-minute grace so an hourly cron that fires at :02 then :01 still counts as due */
  const due = process.env.FORCE === '1' || !last || (now - last) >= (interval - 5) * 60000;
  return { due, intervalMinutes: interval, reason };
}

/* True if the last saved cities.json has any active flood alert for any city */
function anyFloodAlert() {
  const cities = readData('cities.json', null);
  if (!cities) return false;
  return Object.values(cities.cities || {}).some((c) => (c.alerts && c.alerts.items || []).length > 0);
}

module.exports = { readData, writeData, loadMeta, saveMeta, recordSuccess, recordError, checkDue };
