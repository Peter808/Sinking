/* ==========================================================================
   scripts/lib/http.js
   One place for every network request the pipeline makes.
   - 15-second timeout per attempt
   - 3 attempts with backoff (1s, then 3s) before giving up
   - Sends our User-Agent (NWS requires a contact; see config/stations.json)
   No npm packages: uses Node 20+'s built-in fetch.
   ========================================================================== */
'use strict';

const { loadConfig } = require('./config');

const TIMEOUT_MS = 15000;          // per attempt
const ATTEMPTS = 3;
const BACKOFF_MS = [1000, 3000];   // wait before attempt 2, attempt 3

/* Lets a test break one source on purpose: BREAK_URL=api.weather.gov makes
   every request to that host fail, so we can check the others keep working. */
const BREAK = process.env.BREAK_URL || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Fetches a URL and returns the response body as text.
   Throws after the last failed attempt, with a short readable message. */
async function fetchText(url, { accept } = {}) {
  const { stations } = loadConfig();
  let lastErr;
  for (let i = 0; i < ATTEMPTS; i++) {
    if (i > 0) await sleep(BACKOFF_MS[i - 1]);
    try {
      if (BREAK && url.includes(BREAK)) throw new Error('BREAK_URL test: request blocked on purpose');
      const res = await fetch(url, {
        headers: { 'User-Agent': stations.userAgent, Accept: accept || '*/*' },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (BREAK && url.includes(BREAK)) break; // no point retrying a forced failure
    }
  }
  const msg = lastErr && lastErr.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS / 1000}s` : (lastErr && lastErr.message) || 'unknown error';
  throw new Error(`${msg} (${shorten(url)})`);
}

/* Same as fetchText but parses JSON. NOAA returns HTTP 200 with an
   {"error": {...}} body for bad requests, so that counts as a failure too. */
async function fetchJSON(url, opts) {
  const text = await fetchText(url, opts);
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error(`invalid JSON (${shorten(url)})`); }
  if (data && data.error) throw new Error(`API error: ${data.error.message || JSON.stringify(data.error)} (${shorten(url)})`);
  if (data && data.errorMsg) throw new Error(`API error: ${data.errorMsg} (${shorten(url)})`);
  return data;
}

/* Keeps error messages in meta.json readable */
function shorten(url) {
  try { const u = new URL(url); return u.host + u.pathname; } catch (e) { return url.slice(0, 80); }
}

module.exports = { fetchText, fetchJSON };
