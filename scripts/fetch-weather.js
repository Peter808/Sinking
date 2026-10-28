#!/usr/bin/env node
/* ==========================================================================
   scripts/fetch-weather.js
   24-hour rainfall from the National Weather Service, per weather station
   in config/stations.json (KMIA, KHWO, KFLL), copied to each city.

   HOW RAINFALL IS CALCULATED
   The NWS API no longer returns a ready-made "precipitation last hour"
   value, so we read it from the raw airport weather reports (METARs).
   Each routine hourly report has a remark like "P0012" = 0.12 in of rain
   since the previous hourly report. Adding the last 24 hours of those gives
   24-hour rainfall. A report with no P group means no measurable rain.
   Some hours are occasionally missing from the API, so we also record how
   many hourly reports were counted (out of ~24).

   Writes, per city: weather { rain24hIn, reportsCounted, station, source, updatedAt }

   Run:  node scripts/fetch-weather.js   (FORCE=1 to skip the schedule)
   ========================================================================== */
'use strict';

const { fetchJSON } = require('./lib/http');
const { byWeatherStation } = require('./lib/cities');
const { runConditionsScript, safely } = require('./lib/run');

const NWS = 'https://api.weather.gov';
const SOURCE = 'National Weather Service';

/* Sums the P groups from routine hourly reports in the last 24 hours.
   Routine reports include sea-level pressure ("SLP"); special reports
   (SPECI) usually don't, which avoids counting the same rain twice. */
async function rain24h(stationId) {
  const start = new Date(Date.now() - 24 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
  const d = await fetchJSON(`${NWS}/stations/${stationId}/observations?start=${start}`, { accept: 'application/geo+json' });
  const reports = (d.features || [])
    .map((f) => f.properties.rawMessage || '')
    .filter((m) => / SLP(\d{3}|NO)\b/.test(m));
  if (!reports.length) throw new Error('no hourly reports in the last 24h');

  let inches = 0;
  reports.forEach((m) => {
    const g = / P(\d{4})\b/.exec(m);
    if (g) inches += parseInt(g[1], 10) / 100;
  });
  return { rain24hIn: Math.round(inches * 100) / 100, reportsCounted: reports.length };
}

runConditionsScript('weather', async (doc, meta) => {
  for (const [id, cities] of Object.entries(byWeatherStation(doc))) {
    const name = cities[0].weatherStation.name;
    console.log(`  station ${id} (${name}) -> ${cities.map((c) => c.name).join(', ')}`);
    await safely(meta, `nws-rain:${id}`, async () => {
      const r = await rain24h(id);
      const weather = {
        ...r,
        station: { id, name },
        source: { name: SOURCE, detail: `${name} (${id})`, url: `https://www.weather.gov/wrh/timeseries?site=${id}` },
        updatedAt: new Date().toISOString()
      };
      cities.forEach((c) => { c.weather = weather; });
    });
  }
}).catch((err) => { console.error(err); process.exit(1); });
