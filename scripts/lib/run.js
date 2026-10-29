/* ==========================================================================
   scripts/lib/run.js
   Shared wrapper for the three conditions scripts. Handles the boring parts
   so each script only contains its own fetching logic:
     1. schedule check (exit early if not due)
     2. load cities.json
     3. run the script's work (which records successes/errors in meta)
     4. derive risk + headline, save cities.json (only if changed), save meta
   ========================================================================== */
'use strict';

const { loadMeta, saveMeta, writeData, checkDue } = require('./store');
const { loadCities } = require('./cities');
const { deriveAll } = require('./derive');

async function runConditionsScript(runKey, work, type = 'conditions') {
  const meta = loadMeta();
  const due = checkDue(meta, runKey, type);
  if (!due.due) {
    console.log(`${runKey}: not due yet (every ${due.intervalMinutes} min, ${due.reason}). Exiting.`);
    return;
  }
  console.log(`${runKey}: running (every ${due.intervalMinutes} min, ${due.reason})`);

  const doc = loadCities();
  await work(doc, meta);          // the script's own fetches; never throws for one bad source
  deriveAll(doc);

  meta.runs[runKey] = new Date().toISOString();
  const changed = writeData('cities.json', doc);
  saveMeta(meta);
  console.log(`${runKey}: done. cities.json ${changed ? 'updated' : 'unchanged'}.`);
}

/* Runs one source's fetch, isolating failures: on error the city data is
   left as it was (last good value) and the error is logged in meta. */
async function safely(meta, key, fn) {
  try { await fn(); require('./store').recordSuccess(meta, key); return true; }
  catch (err) { require('./store').recordError(meta, key, err); return false; }
}

module.exports = { runConditionsScript, safely };
