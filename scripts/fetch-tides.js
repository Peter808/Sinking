#!/usr/bin/env node
/* ==========================================================================
   scripts/fetch-tides.js
   Tide data from NOAA CO-OPS for each gauge in config/stations.json, copied
   to every city that uses that gauge.

   Writes, per city in data/cities.json:
     water       current level (ft above MHHW = normal high tide), rising/falling
     tides       next high, today's highs/lows, 24h curve (48 points), forecast peak
     thresholds  NWS minor/moderate/major flood levels, converted to ft above MHHW
     floodDays   days at/above the NWS minor flood level, this and last
                 meteorological year (May to April)

   Each part is fetched separately; one failing leaves the others (and its
   own last good values) untouched.

   Run:  node scripts/fetch-tides.js          (respects the schedule)
         FORCE=1 node scripts/fetch-tides.js  (run now)
   ========================================================================== */
'use strict';

const { fetchJSON } = require('./lib/http');
const { byGauge } = require('./lib/cities');
const { runConditionsScript, safely } = require('./lib/run');
const T = require('./lib/time');

const API = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const MDAPI = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations';
const COMMON = 'datum=MHHW&units=english&time_zone=lst_ldt&format=json&application=SinkingSouthFlorida';
const SOURCE = 'NOAA Tides & Currents';

/* How often the slower-changing parts refresh (minutes) */
const THRESHOLDS_EVERY = 24 * 60;
const FLOOD_DAYS_EVERY = 6 * 60;

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const minutesSince = (iso) => (iso ? (Date.now() - new Date(iso)) / 60000 : Infinity);
const coops = (params) => fetchJSON(`${API}?${params}&${COMMON}`);


/* ----- Flood thresholds --------------------------------------------------
   NOAA lists flood levels against the station's own datum (STND). We
   subtract MHHW so everything on the site is "ft above normal high tide". */
async function getThresholds(id) {
  const [levels, datums] = await Promise.all([
    fetchJSON(`${MDAPI}/${id}/floodlevels.json`),
    fetchJSON(`${MDAPI}/${id}/datums.json?units=english`)
  ]);
  const mhhw = (datums.datums || []).find((d) => d.name === 'MHHW');
  if (!mhhw) throw new Error('MHHW datum missing');
  const rel = (v) => (v == null ? null : round(v - mhhw.value));
  const out = { minorFlood: rel(levels.nws_minor), moderateFlood: rel(levels.nws_moderate), majorFlood: rel(levels.nws_major) };
  if (out.minorFlood == null) throw new Error('No NWS minor flood level for this gauge');
  return { ...out, datum: 'MHHW', basis: 'NWS flood categories', updatedAt: new Date().toISOString() };
}


/* ----- Current water level + rising/falling -----------------------------
   Last hour of 6-minute readings. Status compares the newest reading with
   the one about 18 minutes earlier so tiny wobbles don't flip it. */
async function getWater(id) {
  const d = await coops(`product=water_level&station=${id}&range=1`);
  const rows = (d.data || []).filter((r) => r.v !== '');
  if (!rows.length) throw new Error('no recent readings');
  const last = rows[rows.length - 1];
  const prev = rows[Math.max(0, rows.length - 4)];
  const diff = +last.v - +prev.v;
  return {
    levelFt: round(+last.v),
    status: Math.abs(diff) < 0.03 ? 'steady' : diff > 0 ? 'rising' : 'falling',
    observedAt: T.noaaLocalToISO(last.t),
    rawTime: last.t
  };
}


/* ----- Predictions: today's curve + highs/lows ---------------------------
   6-minute predictions for today give both the curve (downsampled to 48
   points, every 30 min) and the predicted value at the time of the latest
   reading (to measure the anomaly). hilo covers 48 hours for "next high". */
async function getPredictions(id) {
  const today = T.ymdET();
  const [six, hilo] = await Promise.all([
    coops(`product=predictions&station=${id}&begin_date=${today}&range=24&interval=6`),
    coops(`product=predictions&station=${id}&begin_date=${today}&range=48&interval=hilo`)
  ]);
  const pts = six.predictions || [];
  if (!pts.length) throw new Error('no predictions');

  const curve = pts.filter((p) => /:(00|30)$/.test(p.t)).slice(0, 48).map((p) => ({ t: p.t.slice(11), h: round(+p.v) }));
  const extremes = (hilo.predictions || []).map((p) => ({
    type: p.type === 'H' ? 'high' : 'low',
    at: T.noaaLocalToISO(p.t),
    localTime: p.t.slice(11),
    date: p.t.slice(0, 10),
    heightFt: round(+p.v)
  }));
  return { curve, extremes, six: pts };
}


/* ----- Flood days -------------------------------------------------------
   Counts days whose highest water reached the NWS minor flood level.
   Verified highs/lows (product=high_low) lag a month or two, so the most
   recent days come from preliminary 6-minute readings (max 31 days/request).
   Note: NOAA's own annual counts (Derived Product API) use a different,
   NOAA-derived threshold and don't exist for Port Everglades, so we count
   ourselves with the same NWS level used for risk. */
async function countFloodDays(id, startYmd, endYmd, minor) {
  const maxByDay = {};
  const add = (t, v) => { if (v === '' || v == null) return; const day = t.slice(0, 10); maxByDay[day] = Math.max(maxByDay[day] ?? -99, +v); };

  const hl = await coops(`product=high_low&station=${id}&begin_date=${startYmd}&end_date=${endYmd}`);
  (hl.data || []).forEach((r) => add(r.t, r.v));

  /* Fill the gap after the last verified day with preliminary data */
  const lastVerified = (hl.data || []).length ? hl.data[hl.data.length - 1].t.slice(0, 10).replace(/-/g, '') : T.addDaysYmd(startYmd, -1);
  let from = T.addDaysYmd(lastVerified, 1);
  while (from <= endYmd) {
    const to = [T.addDaysYmd(from, 30), endYmd].sort()[0];
    const wl = await coops(`product=water_level&station=${id}&begin_date=${from}&end_date=${to}`);
    (wl.data || []).forEach((r) => add(r.t, r.v));
    from = T.addDaysYmd(to, 1);
  }
  const days = Object.keys(maxByDay).filter((d) => maxByDay[d] >= minor).sort();
  return { count: days.length, dates: days, verifiedThrough: lastVerified };
}


/* ----- Main ------------------------------------------------------------- */
runConditionsScript('tides', async (doc, meta) => {
  const groups = byGauge(doc);

  for (const [id, cities] of Object.entries(groups)) {
    const label = cities[0].gauge.label;
    console.log(`  gauge ${id} (${label}) -> ${cities.map((c) => c.name).join(', ')}`);
    const source = { name: SOURCE, detail: `${label} gauge`, url: `https://tidesandcurrents.noaa.gov/stationhome.html?id=${id}` };
    const setAll = (key, val) => cities.forEach((c) => { c[key] = val; });

    /* Thresholds: once a day */
    if (minutesSince(cities[0].thresholds && cities[0].thresholds.updatedAt) >= THRESHOLDS_EVERY) {
      await safely(meta, `noaa-thresholds:${id}`, async () => setAll('thresholds', await getThresholds(id)));
    }

    /* Water level */
    let water = null;
    await safely(meta, `noaa-water:${id}`, async () => {
      water = await getWater(id);
      setAll('water', { ...water, unit: 'ft above MHHW', source, updatedAt: new Date().toISOString() });
    });

    /* Predictions + anomaly + forecast peak */
    await safely(meta, `noaa-predictions:${id}`, async () => {
      const p = await getPredictions(id);
      const now = new Date();
      const todayIso = T.isoDateET(now);
      const highsToday = p.extremes.filter((e) => e.type === 'high' && e.date === todayIso);
      const nextHigh = p.extremes.find((e) => e.type === 'high' && new Date(e.at) > now) || null;

      /* Anomaly: observed minus predicted at the same 6-minute timestamp */
      const w = water || (cities[0].water || null);
      const match = w && p.six.find((x) => x.t === w.rawTime);
      const anomaly = match ? round(w.levelFt - +match.v) : null;
      /* Peak = highest high tide still ahead today. Once today's last high
         has passed, fall back to today's highest so the value doesn't vanish. */
      const ahead = highsToday.filter((h) => new Date(h.at) > now);
      const pool = ahead.length ? ahead : highsToday;
      const predictedPeak = pool.length ? Math.max(...pool.map((h) => h.heightFt)) : null;

      setAll('tides', {
        date: todayIso,
        nextHigh,
        today: p.extremes.filter((e) => e.date === todayIso),
        next48h: p.extremes,
        curve: p.curve,
        anomalyFt: anomaly,
        todayPredictedPeakFt: predictedPeak,
        todayForecastPeakFt: predictedPeak != null && anomaly != null ? round(predictedPeak + anomaly) : predictedPeak,
        source,
        updatedAt: new Date().toISOString()
      });
    });

    /* Flood days: every 6 hours (several requests each time) */
    const th = cities[0].thresholds;
    const fd = cities[0].floodDays;
    if (th && th.minorFlood != null && minutesSince(fd && fd.updatedAt) >= FLOOD_DAYS_EVERY) {
      await safely(meta, `noaa-flooddays:${id}`, async () => {
        const my = T.metYears();
        const today = T.ymdET();
        const current = await countFloodDays(id, my.current.start, today, th.minorFlood);
        /* Last year never changes once complete, so reuse it when we have it */
        let last = fd && fd.lastYear && fd.lastYear.year === my.last.year && fd.lastYear.thresholdFt === th.minorFlood ? fd.lastYear : null;
        if (!last) {
          const r = await countFloodDays(id, my.last.start, my.last.end, th.minorFlood);
          last = { year: my.last.year, label: my.last.label, count: r.count, thresholdFt: th.minorFlood };
        }
        setAll('floodDays', {
          thisYear: { year: my.current.year, label: my.current.label, count: current.count, lastFloodDay: current.dates.slice(-1)[0] || null, thresholdFt: th.minorFlood },
          lastYear: last,
          definition: 'Days when water reached the NWS minor flood level at this gauge. Meteorological year, May to April.',
          source,
          updatedAt: new Date().toISOString()
        });
      });
    }
  }
}).catch((err) => { console.error(err); process.exit(1); });
