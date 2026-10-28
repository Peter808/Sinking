/* ==========================================================================
   scripts/lib/derive.js
   Turns raw readings into the things people see: risk level, "flooding
   likely today", and the two-line headline. Runs at the end of every
   conditions script so these stay consistent no matter which source
   updated last. All thresholds and wording come from config/schedule.json
   (rules.risk and rules.headline).
   ========================================================================== */
'use strict';

const { loadConfig } = require('./config');

const RISK_ORDER = ['severe', 'high', 'moderate', 'low'];

/* Is any alert in `names` active for this city? */
function hasAlert(city, names) {
  const items = (city.alerts && city.alerts.items) || [];
  return items.some((a) => names.includes(a.event));
}

/* Risk level for one city: 'low' | 'moderate' | 'high' | 'severe'.
   Uses the current water level vs the gauge's NWS flood thresholds,
   plus active NWS alerts. First matching level (from severe down) wins. */
function riskFor(city, rules) {
  const level = city.water && city.water.levelFt;
  const th = city.thresholds || {};
  const items = (city.alerts && city.alerts.items) || [];
  const has = (n) => level != null && th[n] != null && level >= th[n];

  const r = rules.risk;
  if (has(r.severe.atOrAbove) || items.some((a) => (r.severe.alertSeverities || []).includes(a.severity)) || hasAlert(city, r.severe.alerts || [])) return { level: 'severe', why: whyText(city, 'severe') };
  if (has(r.high.atOrAbove) || hasAlert(city, r.high.alerts)) return { level: 'high', why: whyText(city, 'high') };
  const near = level != null && th.minorFlood != null && level >= th.minorFlood - r.moderate.withinFtOfMinor;
  if (near || hasAlert(city, r.moderate.alerts)) return { level: 'moderate', why: whyText(city, 'moderate') };
  return { level: 'low', why: 'Below the minor flood level and no flood alerts.' };

  function whyText(c, lvl) {
    const a = items.map((x) => x.event);
    return a.length ? `Active: ${a.join(', ')}.` : `Water at ${level != null ? level.toFixed(2) : '?'} ft vs minor flood level ${th.minorFlood} ft.`;
  }
}

/* "Flooding likely today": today's highest predicted tide plus how far the
   water is currently running above prediction (the anomaly) reaches the
   minor flood level. This is our stand-in for NOAA's daily outlook, which
   the public API does not provide (see step 1 notes). */
function floodingToday(city) {
  const t = city.tides || {};
  const th = city.thresholds || {};
  if (t.todayForecastPeakFt == null || th.minorFlood == null) return null;
  return {
    likely: t.todayForecastPeakFt >= th.minorFlood,
    forecastPeakFt: t.todayForecastPeakFt,
    minorFloodFt: th.minorFlood,
    basis: 'Today\'s highest predicted tide plus the current difference between observed and predicted water level.'
  };
}

/* Headline: first matching row in rules.headline.order wins */
function headlineFor(city, rules) {
  const h = rules.headline;
  const peak = city.tides && city.tides.todayForecastPeakFt;
  const level = city.water && city.water.levelFt;
  const tests = {
    coastalFloodWarning: () => hasAlert(city, ['Coastal Flood Warning']),
    kingTideFloodingLikely: () => !!(city.flooding && city.flooding.likely),
    heavyRainAlert: () => hasAlert(city, h.heavyRainAlerts),
    waterElevated: () => Math.max(level ?? -99, peak ?? -99) >= h.elevatedMinFt,
    default: () => true
  };
  /* FORCE_HEADLINE=heavyRainAlert lets us test each row without real weather */
  const forced = process.env.FORCE_HEADLINE;
  const row = h.order.find((r) => (forced ? r.when === forced : tests[r.when] && tests[r.when]()));
  return { line1: row.line1, line2: row.line2, condition: row.when };
}

/* Applies all derived fields to every city in a cities.json object (in place) */
function deriveAll(doc) {
  const { schedule } = loadConfig();
  Object.values(doc.cities).forEach((c) => {
    c.flooding = floodingToday(c);
    c.risk = riskFor(c, schedule.rules);
    c.headline = headlineFor(c, schedule.rules);
  });
  return doc;
}

module.exports = { deriveAll, riskFor, headlineFor, RISK_ORDER };
