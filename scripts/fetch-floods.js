#!/usr/bin/env node
/* ==========================================================================
   scripts/fetch-floods.js
   Active National Weather Service alerts for each city, looked up by the
   city's coordinates (config/stations.json lat/lon).

   Only flood-related alerts are kept (coastal flood statements, advisories,
   watches, warnings, flood/flash flood alerts, storm surge, tropical).
   Edit KEEP below to change which alerts count.

   Writes, per city:
     alerts         flood alerts used for the risk level (KEEP below)
                    { items: [{ event, severity, headline, expires, url }], source, updatedAt }
     weatherAlerts  alerts that get a pinned card (config/alerts.json):
                    { items: [{ id, event, level, headline, onset, expires, url }] }
   An empty items list means "checked, nothing active", not "unknown".
   Runs hourly all year (schedule.json alertsEveryMinutes).

   Run:  node scripts/fetch-floods.js   (FORCE=1 to skip the schedule)
   ========================================================================== */
'use strict';

const { fetchJSON } = require('./lib/http');
const fs = require('fs');
const path = require('path');
const { runConditionsScript, safely } = require('./lib/run');
const { PATHS } = require('./lib/config');

/* Which alerts get a card, and their level (warning / watch / advisory) */
const CARD_EVENTS = JSON.parse(fs.readFileSync(path.join(PATHS.config, 'alerts.json'), 'utf8')).events;

const NWS = 'https://api.weather.gov';
const SOURCE = 'National Weather Service alerts';

/* Alert "event" names containing any of these words are kept */
const KEEP = /flood|surge|hurricane|tropical storm/i;

/* Severity order, for sorting the most serious alert first */
const SEV = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };

/* One request per city; returns all active alert properties */
async function activeAlerts(city) {
  const { lat, lon } = city.point;
  const d = await fetchJSON(`${NWS}/alerts/active?point=${lat},${lon}`, { accept: 'application/geo+json' });
  return (d.features || []).map((f) => f.properties);
}

/* Alerts that get a weather alert card, most serious level first */
const LEVEL = { warning: 0, watch: 1, advisory: 2 };
function cardAlerts(all) {
  return all
    .filter((p) => CARD_EVENTS[p.event])
    .map((p) => ({
      id: p.id || p['@id'],
      event: p.event,
      level: CARD_EVENTS[p.event],
      headline: p.headline,
      onset: p.onset || p.effective,
      expires: p.ends || p.expires,
      url: p['@id'] || p.id
    }))
    .sort((a, b) => LEVEL[a.level] - LEVEL[b.level]);
}

function floodAlerts(all) {
  return all
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
      const all = await activeAlerts(city);
      const items = floodAlerts(all);
      const cards = cardAlerts(all);
      console.log(`  ${city.name}: ${all.length ? all.map((a) => a.event).join(', ') : 'no alerts'}`);
      city.weatherAlerts = { items: cards };
      city.alerts = {
        items,
        source: { name: SOURCE, detail: `Point ${city.point.lat}, ${city.point.lon}`, url: `https://alerts.weather.gov/` },
        updatedAt: new Date().toISOString()
      };
    });
  }
}, 'alerts').catch((err) => { console.error(err); process.exit(1); });
