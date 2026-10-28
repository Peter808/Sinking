/* ==========================================================================
   scripts/lib/cities.js
   Loads data/cities.json (or builds an empty skeleton from
   config/stations.json the first time), so each fetch script only has to
   fill in its own section:
     fetch-tides.js   -> water, tides, thresholds, floodDays
     fetch-weather.js -> weather
     fetch-floods.js  -> alerts
   derive.js then fills flooding, risk, headline.
   ========================================================================== */
'use strict';

const { loadConfig } = require('./config');
const { readData } = require('./store');

function loadCities() {
  const { stations } = loadConfig();
  const doc = readData('cities.json', null) || { cities: {} };
  doc.schemaVersion = 1;

  /* Make sure every configured city exists, and refresh its static info
     from config (so editing stations.json takes effect next run). */
  stations.cities.forEach((cfg) => {
    const g = stations.gauges[cfg.gauge];
    const w = stations.weatherStations[cfg.weather];
    const c = (doc.cities[cfg.id] = doc.cities[cfg.id] || { id: cfg.id });
    c.name = cfg.name;
    c.gauge = { id: cfg.gauge, label: g.label, name: g.name };
    c.weatherStation = { id: cfg.weather, name: w.name };
    c.point = { lat: cfg.lat, lon: cfg.lon };
  });
  /* Drop cities that were removed from config */
  Object.keys(doc.cities).forEach((id) => { if (!stations.cities.find((c) => c.id === id)) delete doc.cities[id]; });
  return doc;
}

/* Cities grouped by tide gauge, so each gauge is fetched once:
   { "8723214": [cityObj, cityObj], ... } */
function byGauge(doc) {
  const out = {};
  Object.values(doc.cities).forEach((c) => { (out[c.gauge.id] = out[c.gauge.id] || []).push(c); });
  return out;
}

/* Same, grouped by weather station */
function byWeatherStation(doc) {
  const out = {};
  Object.values(doc.cities).forEach((c) => { (out[c.weatherStation.id] = out[c.weatherStation.id] || []).push(c); });
  return out;
}

module.exports = { loadCities, byGauge, byWeatherStation };
