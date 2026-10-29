/* ==========================================================================
   hero.js
   Home page hero: city switcher, tide wave, "Now" dot.
   Progressive enhancement only. The HTML already shows Miami's values,
   so the page reads fine with JS off. This file just swaps values when a
   city is picked and draws the tide curve for that city.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     FALLBACK SAMPLE DATA (placeholders, only used if the page has no live
     snapshot). At deploy, scripts/prerender.js embeds real data for all 5
     cities in <script id="hero-data">, which replaces this object below.
     One object per city. Keys must match the data-city-btn values in the HTML.
       level          ft above normal high tide (shown as "+1.4")
       risk           low | moderate | high | severe
       nextHigh       next high tide time (text)
       rain           rainfall last 24h, inches
       floodDays      flood days this year / floodDaysLast: last year
       tideStatus     text for the header pill ("Rising" / "Falling")
       summary        two lines of supporting text under the h1
       tide           today's highs and lows: [time, height ft, 'high'|'low']
     Live snapshot adds: gauge (label), updated ("2:07 PM"), updatedAt (ISO).
     In the snapshot, level = today's forecast PEAK and tide heights are
     expected water (prediction + current anomaly).
     ------------------------------------------------------------------------ */
  var CITIES = {
    'miami': {
      name: 'Miami', level: 1.4, risk: 'moderate', nextHigh: '7:42 PM', rain: 1.8,
      floodDays: 38, floodDaysLast: 27, tideStatus: 'Rising',
      summary: 'Seasonal king tides peak this evening. Expect shallow water on low streets in Brickell and Shorecrest around high tide.',
      tide: [['1:30 AM', 0.4, 'low'], ['7:42 AM', 2.1, 'high'], ['1:58 PM', 0.3, 'low'], ['7:42 PM', 2.3, 'high']]
    },
    'miami-beach': {
      name: 'Miami Beach', level: 1.9, risk: 'high', nextHigh: '7:36 PM', rain: 2.1,
      floodDays: 52, floodDaysLast: 41, tideStatus: 'Rising',
      summary: 'Highest tide of the month tonight. West Avenue and parts of South Beach may see water in the street even without rain.',
      tide: [['1:22 AM', 0.5, 'low'], ['7:31 AM', 2.4, 'high'], ['1:49 PM', 0.4, 'low'], ['7:36 PM', 2.6, 'high']]
    },
    'hallandale-beach': {
      name: 'Hallandale Beach', level: 1.1, risk: 'moderate', nextHigh: '7:48 PM', rain: 1.2,
      floodDays: 24, floodDaysLast: 19, tideStatus: 'Rising',
      summary: 'Elevated tide this evening. Low spots along the Intracoastal may pond briefly near high tide.',
      tide: [['1:40 AM', 0.4, 'low'], ['7:50 AM', 1.9, 'high'], ['2:06 PM', 0.3, 'low'], ['7:48 PM', 2.0, 'high']]
    },
    'hollywood': {
      name: 'Hollywood', level: 1.2, risk: 'moderate', nextHigh: '7:51 PM', rain: 1.4,
      floodDays: 29, floodDaysLast: 22, tideStatus: 'Rising',
      summary: 'King tide window continues. Watch for standing water near the Intracoastal and Hollywood Lakes after dark.',
      tide: [['1:44 AM', 0.4, 'low'], ['7:53 AM', 2.0, 'high'], ['2:10 PM', 0.3, 'low'], ['7:51 PM', 2.1, 'high']]
    },
    'fort-lauderdale': {
      name: 'Fort Lauderdale', level: 1.6, risk: 'high', nextHigh: '7:55 PM', rain: 1.6,
      floodDays: 44, floodDaysLast: 35, tideStatus: 'Rising',
      summary: 'Tidal flooding likely around high tide. Las Olas Isles and Rio Vista streets are the usual trouble spots.',
      tide: [['1:50 AM', 0.5, 'low'], ['8:01 AM', 2.2, 'high'], ['2:16 PM', 0.4, 'low'], ['7:55 PM', 2.4, 'high']]
    }
  };

  /* Live snapshot written at deploy (see header comment). Skipped in Node,
     where prerender.js loads this file only for the tide math. */
  var SNAP = null;
  if (typeof document !== 'undefined') {
    try {
      var snapEl = document.getElementById('hero-data');
      if (snapEl) { SNAP = JSON.parse(snapEl.textContent); CITIES = SNAP.cities; }
    } catch (e) { SNAP = null; }
  }

  /* Order used for the three mini stats: shows the first three cities that
     are NOT the active one. Default (Miami active) = Miami Beach, Hollywood,
     Fort Lauderdale. Reorder this list to change which cities appear. */
  var MINI_ORDER = ['miami-beach', 'hollywood', 'fort-lauderdale', 'miami', 'hallandale-beach'];

  var RISK_LABEL = { low: 'Low', moderate: 'Moderate', high: 'High', severe: 'Severe' };
  /* Marker position on the risk slider (percent from left) */
  var RISK_POS = { low: 12, moderate: 38, high: 64, severe: 88 };

  /* Radial chart: rings are drawn as a share of this many days */
  var RADIAL_MAX_DAYS = 60;

  /* Tide wave drawing area. Matches the SVG viewBox in index.html. */
  var WAVE = { w: 1000, h: 100, minFt: -2.5, maxFt: 3.0, top: 32, bottom: 80 }; /* real lows reach about -2 ft */


  /* ===== Helpers ======================================================== */

  /* "+1.4" style formatting for water levels */
  function fmtLevel(n) { return (n >= 0 ? '+' : '') + n.toFixed(1); }

  /* "7:42 PM" -> 19.7 (decimal hours) */
  function toHours(str) {
    var m = /(\d+):(\d+)\s*(AM|PM)/i.exec(str);
    var h = (+m[1]) % 12 + (/pm/i.test(m[3]) ? 12 : 0);
    return h + (+m[2]) / 60;
  }

  /* Tide height (ft) -> SVG y. Higher water = higher on screen. */
  function yFor(ft) {
    var f = (ft - WAVE.minFt) / (WAVE.maxFt - WAVE.minFt);
    return WAVE.bottom - f * (WAVE.bottom - WAVE.top);
  }

  /* Turn the day's highs and lows into points with decimal hours.
     Adds one extra point before midnight and after 11:59 PM so the curve
     reaches both edges of the screen. */
  function extremes(tide) {
    var pts = tide.map(function (p) { return { t: toHours(p[0]), h: p[1], type: p[2], time: p[0] }; });
    var gap = 6.21; // average hours between a high and a low
    pts.unshift({ t: pts[0].t - gap, h: pts[1].h, type: pts[1].type, edge: true });
    var n = pts.length;
    pts.push({ t: pts[n - 1].t + gap, h: pts[n - 2].h, type: pts[n - 2].type, edge: true });
    return pts;
  }

  /* Height at any hour, using a cosine ease between neighboring extremes.
     This is how tide curves are usually approximated between predictions. */
  function heightAt(pts, t) {
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      if (t >= a.t && t <= b.t) {
        var f = (t - a.t) / (b.t - a.t);
        return a.h + (b.h - a.h) * (1 - Math.cos(Math.PI * f)) / 2;
      }
    }
    return pts[0].h;
  }

  /* Builds the SVG path "d" string for a city's 24h tide curve */
  function buildPath(pts) {
    var d = '';
    for (var t = 0; t <= 24.001; t += 0.25) {
      var x = (t / 24) * WAVE.w;
      d += (t === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + yFor(heightAt(pts, t)).toFixed(1) + ' ';
    }
    return d.trim();
  }

  /* Current hour in Miami (America/New_York), as decimal hours */
  function nowHours() {
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
      var h = 0, m = 0;
      parts.forEach(function (p) { if (p.type === 'hour') h = +p.value % 24; if (p.type === 'minute') m = +p.value; });
      return h + m / 60;
    } catch (e) { var d = new Date(); return d.getHours() + d.getMinutes() / 60; }
  }


  /* ===== Tide wave ======================================================
     Redraws the curve, HIGH/LOW labels, and the "Now" dot.
     Labels and dot are HTML (not SVG text) so they stay crisp and round
     while the SVG stretches to full width.
     ====================================================================== */
  function renderTide(root, city) {
    var pts = extremes(city.tide);
    var path = root.querySelector('[data-tide-path]');
    var labels = root.querySelector('[data-tide-labels]');
    var dot = root.querySelector('[data-tide-now]');
    if (!path || !labels) return;

    path.setAttribute('d', buildPath(pts));

    labels.innerHTML = '';
    pts.forEach(function (p) {
      if (p.edge) return;
      var li = document.createElement('li');
      var pct = p.t / 24 * 100;
      li.className = 'tide__label tide__label--' + p.type +
        (pct < 12 ? ' is-start' : pct > 88 ? ' is-end' : ''); /* keeps edge labels on screen */
      li.style.left = pct.toFixed(2) + '%';
      li.style.top = yFor(p.h).toFixed(2) + '%';
      li.innerHTML = '<span>' + p.type.toUpperCase() + ' ' + p.time + '</span><span>' + (p.type === 'high' ? '+' : '') + p.h.toFixed(1) + ' FT</span>';
      labels.appendChild(li);
    });

    if (dot) {
      var t = nowHours();
      dot.style.left = (t / 24 * 100).toFixed(2) + '%';
      dot.style.top = yFor(heightAt(pts, t)).toFixed(2) + '%';
      /* Keep the "Now" pill off a nearby HIGH label */
      var nearHigh = pts.some(function (p) { return !p.edge && p.type === 'high' && Math.abs(p.t - t) < 2; });
      dot.classList.toggle('is-below', nearHigh);
    }
  }


  /* ===== City switch ====================================================
     Updates every [data-field] in the hero, the mini stats, radial chart,
     risk slider, tide wave, and the header tide pill.
     Input: city key, e.g. "miami-beach". Edit CITIES above to change values.
     ====================================================================== */
  function setCity(hero, key) {
    var c = CITIES[key];
    if (!c) return;
    hero.setAttribute('data-city', key);

    var fields = {
      'city-name': c.name,
      'water-level': fmtLevel(c.level),
      'next-high': c.nextHigh,
      'rainfall': c.rain != null ? c.rain.toFixed(2) : '',
      'flood-days': c.floodDays,
      'flood-days-last': c.floodDaysLast,
      'risk-label': RISK_LABEL[c.risk],
      'summary': c.summary,
      'tide-status': c.tideStatus,
      'gauge': c.gauge || '',
      'updated': c.updated || ''
    };
    hero.querySelectorAll('[data-field]').forEach(function (el) {
      var k = el.getAttribute('data-field');
      if (k in fields && fields[k] !== '') el.textContent = fields[k];
    });
    markDelayed(hero, c);
    /* Header tide pill lives outside the hero */
    document.querySelectorAll('[data-field="tide-status"]').forEach(function (el) { el.textContent = c.tideStatus; });

    /* Mini stats: first three cities that are not active */
    var others = MINI_ORDER.filter(function (k) { return k !== key; }).slice(0, 3);
    hero.querySelectorAll('[data-mini]').forEach(function (el, i) {
      var o = CITIES[others[i]];
      el.setAttribute('data-risk', o.risk);
      el.querySelector('[data-mini-level]').textContent = fmtLevel(o.level);
      el.querySelector('[data-mini-city]').textContent = o.name;
      el.querySelector('[data-mini-risk]').textContent = RISK_LABEL[o.risk];
    });

    /* Radial chart rings (stroke-dasharray = filled length, then gap) */
    hero.querySelectorAll('[data-ring]').forEach(function (ring) {
      var days = ring.getAttribute('data-ring') === 'this' ? c.floodDays : c.floodDaysLast;
      var circ = 2 * Math.PI * parseFloat(ring.getAttribute('r'));
      var len = Math.min(days / RADIAL_MAX_DAYS, 1) * circ;
      ring.setAttribute('stroke-dasharray', len.toFixed(1) + ' ' + circ.toFixed(1));
    });

    /* Risk slider marker */
    var meter = hero.querySelector('[data-risk-meter]');
    if (meter) {
      meter.setAttribute('data-risk', c.risk);
      meter.style.setProperty('--pos', RISK_POS[c.risk] + '%');
    }

    /* City buttons: only the active one is pressed */
    hero.querySelectorAll('[data-city-btn]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-city-btn') === key));
    });

    renderTide(hero, c);

    var live = hero.querySelector('[data-hero-live]');
    if (live) live.textContent = 'Showing sample conditions for ' + c.name + '.';
  }


  /* ===== King tide season panel ==========================================
     Reads data-start / data-end (YYYY-MM-DD) on each row and compares them
     with today's date in Miami. Marks past rows, the current cycle ("Now"),
     and, if today falls between cycles, the next one ("Next").
     To change the season, edit the rows in index.html. No edits needed here.
     ====================================================================== */
  function todayISO() {
    try {
      /* en-CA formats dates as YYYY-MM-DD, which compares correctly as text */
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    } catch (e) { return new Date().toISOString().slice(0, 10); }
  }

  function initKingTides() {
    var list = document.querySelector('[data-kt-list]');
    if (!list) return;
    var today = todayISO();
    var rows = list.querySelectorAll('[data-start]');
    var currentIdx = -1, nextIdx = -1;

    rows.forEach(function (row, i) {
      var start = row.getAttribute('data-start'), end = row.getAttribute('data-end');
      var status = row.querySelector('.kt__status');
      row.classList.remove('is-past', 'is-current', 'is-next');
      row.removeAttribute('aria-current');
      status.textContent = '';

      if (end < today) { row.classList.add('is-past'); status.textContent = 'Past'; }
      else if (start <= today) { row.classList.add('is-current'); row.setAttribute('aria-current', 'date'); status.textContent = 'Now'; currentIdx = i; }
      else if (nextIdx === -1) { nextIdx = i; }
    });

    /* Between cycles: flag the upcoming one */
    if (currentIdx === -1 && nextIdx > -1) {
      rows[nextIdx].classList.add('is-next');
      rows[nextIdx].querySelector('.kt__status').textContent = 'Next';
    }

    /* Scroll so the most recent past cycle is the top visible row.
       Earlier cycles stay reachable by scrolling up. */
    var box = document.querySelector('[data-kt-scroll]');
    var past = list.querySelectorAll('.is-past');
    if (box && past.length) box.scrollTop = past[past.length - 1].offsetTop;

    var count = document.querySelector('[data-kt-count]');
    if (count) {
      count.textContent = currentIdx > -1 ? 'Cycle ' + (currentIdx + 1) + ' of ' + rows.length
        : nextIdx > -1 ? 'Next: cycle ' + (nextIdx + 1) + ' of ' + rows.length
        : 'Season over';
    }
  }


  /* ===== "Data delayed" label ===========================================
     Shown when the active city's data is older than staleAfterMinutes
     (3x the update interval, from config/schedule.json via the snapshot). */
  function markDelayed(hero, c) {
    var el = hero.querySelector('[data-delayed]');
    if (!el || !SNAP || !c.updatedAt) return;
    el.hidden = (Date.now() - new Date(c.updatedAt)) / 60000 <= SNAP.staleAfterMinutes;
  }


  /* ===== Init ============================================================ */
  function init() {
    initKingTides();
    var hero = document.querySelector('[data-hero]');
    if (!hero) return;

    hero.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-city-btn]');
      if (btn) setCity(hero, btn.getAttribute('data-city-btn'));
    });

    /* Redraw on load so the "Now" dot uses the real current time */
    setCity(hero, hero.getAttribute('data-city') || 'miami');
  }

  /* Exposed only so the static HTML wave can be regenerated with Node.
     Safe to ignore. */
  if (typeof module !== 'undefined') {
    module.exports = { CITIES: CITIES, extremes: extremes, buildPath: buildPath, yFor: yFor, heightAt: heightAt, toHours: toHours };
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
