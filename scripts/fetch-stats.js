#!/usr/bin/env node
/* ==========================================================================
   scripts/fetch-stats.js
   Slow-changing numbers for the "By the numbers" section. Runs weekly
   (statsEveryMinutes in config/schedule.json).

   Currently:
     nfipClaims  Total flood insurance claims and dollars paid in Miami-Dade
                 (12086) and Broward (12011) since 1978, from FEMA's public
                 NFIP claims dataset (OpenFEMA, v3/NfipClaims). About 97,000
                 rows, read 5,000 at a time; takes about a minute.

   Writes data/stats.json. On failure the previous file is kept.
   Run:  node scripts/fetch-stats.js   (FORCE=1 to skip the schedule)
   ========================================================================== */
'use strict';

const { fetchJSON } = require('./lib/http');
const { readData, writeData, loadMeta, saveMeta, recordSuccess, recordError, checkDue } = require('./lib/store');

const API = 'https://www.fema.gov/api/open/v3/NfipClaims';
const COUNTIES = { '12086': 'Miami-Dade', '12011': 'Broward' };   // FIPS codes
const PAGE = 5000;                                   // rows per request (OpenFEMA allows up to 10,000, but big pages are slow)

/* Adds up every claim payment for one county, page by page */
async function countyTotals(fips) {
  let skip = 0, count = 0, paid = 0, first = 9999, last = 0;
  for (;;) {
    const url = `${API}?$filter=countyCode%20eq%20%27${fips}%27`
      + '&$select=amountPaidOnBuildingClaim,amountPaidOnContentsClaim,amountPaidOnIncreasedCostOfComplianceClaim,yearOfLoss'
      + `&$top=${PAGE}&$skip=${skip}`;
    const rows = (await fetchJSON(url, { timeoutMs: 90000 })).NfipClaims || [];
    rows.forEach((r) => {
      count++;
      paid += (r.amountPaidOnBuildingClaim || 0) + (r.amountPaidOnContentsClaim || 0) + (r.amountPaidOnIncreasedCostOfComplianceClaim || 0);
      if (r.yearOfLoss) { first = Math.min(first, r.yearOfLoss); last = Math.max(last, r.yearOfLoss); }
    });
    if (rows.length < PAGE) break;
    skip += PAGE;
  }
  return { count, paid, first, last };
}

async function main() {
  const meta = loadMeta();
  const due = checkDue(meta, 'stats', 'stats');
  if (!due.due) { console.log(`stats: not due yet (every ${due.intervalMinutes} min). Exiting.`); return; }

  const stats = readData('stats.json', {});
  try {
    const per = {};
    for (const [fips, name] of Object.entries(COUNTIES)) {
      per[name] = await countyTotals(fips);
      console.log(`  ${name}: ${per[name].count} claims, $${(per[name].paid / 1e9).toFixed(2)}B`);
    }
    const all = Object.values(per);
    stats.nfipClaims = {
      count: all.reduce((a, c) => a + c.count, 0),
      paidUsd: Math.round(all.reduce((a, c) => a + c.paid, 0)),
      firstYear: Math.min(...all.map((c) => c.first)),
      lastYear: Math.max(...all.map((c) => c.last)),
      byCounty: per,
      source: { name: 'FEMA NFIP claims (OpenFEMA)', url: 'https://www.fema.gov/about/openfema/data-sets' },
      updatedAt: new Date().toISOString()
    };
    recordSuccess(meta, 'fema-nfip-claims');
  } catch (err) { recordError(meta, 'fema-nfip-claims', err); }

  meta.runs.stats = new Date().toISOString();
  const changed = writeData('stats.json', stats);
  saveMeta(meta);
  console.log(`stats: done. stats.json ${changed ? 'updated' : 'unchanged'}.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
