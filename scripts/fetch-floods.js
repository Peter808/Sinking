#!/usr/bin/env node
/* ==========================================================================
   scripts/fetch-floods.js
   Active National Weather Service alerts for each city, looked up by the
   city's coordinates (config/stations.json lat/lon).

   Only flood-related alerts are kept (coastal flood statements, advisories,
   watches, warnings, flood/flash flood alerts, storm surge, tropical).
   Edit KEEP below to change which alerts count.

   Writes, per city: alerts { items: [{ event, severity, headline, expires, url }], source, updatedAt }
   An empty items list means "checked, nothing active", not "unknown".

   Run:  node scripts/fetch-floods.js   (FORCE=1 to skip the schedule)
   ========================================================================== */
'use strict';

const { fetchJSON } = require('./lib/http');
const { runConditionsScript, safely } = require('./lib/run');

const NWS = 'https://api.weather.gov';
const SOURCE = 'National Weather Service alerts';

/* Alert "event" names containing any of these words are kept */
const KEEP = /flood|surge|hurricane|tropical storm/i;

/* Severity order, for sorting the most serious alert first */
const SEV = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };

async function alertsFor(city) {
  const { lat, lon } = city.point;
  const d = await fetchJSON(`${NWS}/alerts/active?point=${lat},${lon}`, { accept: 'application/geo+json' });
  return (d.features || [])
    .map((f) => f.properties)
    .filter((p) => KEEP.test(p.event))
    .map((p) => ({
      event: p.event,
      severity: p.severity,
      headline: p.headline,
      onset: p.onset,
      expires: p.ends || p.expires,
      url: p['@id'] || p.id
    }))
    .sort((a, b) => (SEV[a.severity] ?? 9) - (SEV[b.severity] ?? 9));
}

runConditionsScript('floods', async (doc, meta) => {
  for (const city of Object.values(doc.cities)) {
    await safely(meta, `nws-alerts:${city.id}`, async () => {
      const items = await alertsFor(city);
      console.log(`  ${city.name}: ${items.length ? items.map((a) => a.event).join(', ') : 'no flood alerts'}`);
      city.alerts = {
        items,
        source: { name: SOURCE, detail: `Point ${city.point.lat}, ${city.point.lon}`, url: `https://alerts.weather.gov/` },
        updatedAt: new Date().toISOString()
      };
    });
  }
}).catch((err) => { console.error(err); process.exit(1); });
