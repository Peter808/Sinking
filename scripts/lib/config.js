/* ==========================================================================
   scripts/lib/config.js
   Reads the files in /config once and shares them with every script.
   Also defines where files live, so paths are set in one spot.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

/* DATA_DIR lets a test write somewhere else: DATA_DIR=/tmp/test node scripts/fetch-tides.js */
const PATHS = {
  root: ROOT,
  config: path.join(ROOT, 'config'),
  data: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data')
};

let cache = null;

/* Returns { stations, schedule } parsed from /config. */
function loadConfig() {
  if (cache) return cache;
  const read = (f) => JSON.parse(fs.readFileSync(path.join(PATHS.config, f), 'utf8'));
  cache = { stations: read('stations.json'), schedule: read('schedule.json') };
  return cache;
}

module.exports = { loadConfig, PATHS };
