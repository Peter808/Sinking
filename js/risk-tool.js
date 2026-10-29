/* ==========================================================================
   risk-tool.js
   Address flood-risk lookup. Runs entirely in the browser with free public
   services (settings in js/config.js, riskTool):
     1. OpenStreetMap (Nominatim)  address -> location + county
     2. FEMA flood maps (NFHL)     location -> flood zone, 100-year flood level
     3. USGS elevation (3DEP)      location -> ground elevation
     4. NOAA 2022 projections      2050 high tide = today's high tide + 2050 rise
   Then applies the risk rules from config.js and fills the results panel.

   States: empty (inline message), loading, outside coverage, not found,
   error (all services failed), result (with partial notes if one failed).
   Markup lives in index.html; this file only shows, hides, and fills it.
   ========================================================================== */
(function () {
  'use strict';

  var CFG = (window.SSF_CONFIG || {}).riskTool;
  if (!CFG) return;

  /* Quick text check before calling any service (saves a lookup).
     Matched only after a comma, so street suffixes like "Ct" don't trigger it. */
  var OUTSIDE_PLACES = ['tampa', 'orlando', 'jacksonville', 'tallahassee', 'naples', 'key west', 'key largo', 'tavernier', 'islamorada', 'marathon', 'big pine', 'boca raton', 'west palm', 'palm beach'];
  var OTHER_STATES = 'AL AK AZ AR CA CO CT DE DC GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');

  var ZONE_NOTES = {
    AE: 'High-risk zone (1% yearly flood chance). Flood insurance is usually required with a federally backed mortgage.',
    A: 'High-risk zone (1% yearly flood chance), without a detailed flood height study.',
    AH: 'High-risk zone with shallow ponding (1 to 3 ft).',
    AO: 'High-risk zone with shallow sheet flow (1 to 3 ft).',
    VE: 'Coastal high-hazard zone: storm waves plus a 1% yearly flood chance.',
    V: 'Coastal high-hazard zone with wave action.',
    X_SHADED: 'Shaded X: moderate-risk zone (0.2% yearly flood chance). Insurance optional but recommended.',
    X: 'Minimal-risk zone on FEMA maps. About 1 in 4 flood claims still come from outside high-risk zones.',
    D: 'Flood risk not yet studied by FEMA here.'
  };
  var MEANING = {
    severe: 'By 2050, an ordinary high tide is projected to reach above this ground level. Expect regular tidal flooding without raised roads, seawalls, or pumps.',
    high: 'This location already sits in, or close to, flood-prone ground. Flood insurance and an elevation certificate are worth getting now.',
    moderate: 'Not in FEMA\'s highest-risk zone, but close enough to future high tides that storms and king tides can still reach it.',
    low: 'Ground sits well above projected 2050 high tides and outside FEMA high-risk zones. Heavy rain can still flood any street.'
  };
  var RISK_STEP = { low: 1, moderate: 2, high: 3, severe: 4 };
  var RISK_LABEL = { low: 'Low', moderate: 'Moderate', high: 'High', severe: 'Severe' };

  var lastGeocode = 0;      // for OpenStreetMap's 1-request-per-second policy
  var runId = 0;            // ignores results from an older search

  /* ----- Helpers ------------------------------------------------------- */
  var ft = function (n) { return (Math.round(n * 10) / 10).toFixed(1) + ' ft'; };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* fetch() with a timeout and one retry (FEMA's server is sometimes slow);
     resolves to parsed JSON or rejects */
  function getJSON(url) {
    return getOnce(url).catch(function (e) {
      if (e && e.status === 429) throw e;   // rate limited: retrying right away makes it worse
      return sleep(800).then(function () { return getOnce(url); });
    });
  }
  function getOnce(url) {
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, CFG.timeoutMs);
    return fetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (r) {
      clearTimeout(t);
      if (!r.ok) { var err = new Error('HTTP ' + r.status); err.status = r.status; throw err; }
      return r.json();
    }, function (e) { clearTimeout(t); throw e; });
  }

  function qs(params) {
    return Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  }

  /* True when the typed text is clearly outside Miami-Dade / Broward */
  function looksOutside(address) {
    var a = address.toLowerCase();
    if (OUTSIDE_PLACES.some(function (p) { return a.indexOf(p) > -1; })) return true;
    return a.split(',').slice(1).some(function (part) {
      var code = part.trim().replace(/\s*\d{5}(-\d{4})?$/, '').replace(/\.$/, '').toUpperCase();
      return OTHER_STATES.indexOf(code) > -1;
    });
  }


  /* ----- 1. Address -> location (OpenStreetMap Nominatim) ---------------
     Covers everywhere from northern Broward to Homestead (coverageBox in
     config.js): searches locally first, nationwide only if nothing is found.

     normalizeAddress(): people often write "Unincorporated Dade" or
     "Dade County", which OpenStreetMap doesn't recognize. We remove
     "unincorporated", turn any "Dade"/"Dade County" into "Miami-Dade County",
     and add ", FL" if no state is given.

     If the first search only finds the street (no house number) and the
     address has a neighborhood name (Kendall, Westchester...), we try once
     more with "Miami", the official mailing city for unincorporated
     addresses. That second try often finds the exact house.
     Max 2 lookups per check, 1.1s apart (OpenStreetMap's usage policy). */
  function normalizeAddress(address) {
    var a = address
      .replace(/\bunincorporated\b/ig, '')
      .replace(/\b(?:miami[\s-]*)?dade(?:\s+county)?\b/ig, 'Miami-Dade County')
      .replace(/\s*,\s*,+/g, ',').replace(/^[\s,]+|[\s,]+$/g, '').replace(/\s{2,}/g, ' ');
    if (!/,\s*(fl|fla|florida)\b|\bFL\s*\d{5}/i.test(a) && !/\b(?:[A-Z]{2})\s*\d{5}\b/.test(a)) a += ', FL';
    return a;
  }

  /* "3000 SW 87th Ave, Westchester, FL 33165" -> "3000 SW 87th Ave, Miami, FL 33165" */
  function asMiamiMailing(address) {
    var parts = address.split(',').map(function (p) { return p.trim(); });
    var zip = (address.match(/\b(3\d{4})\b/) || [])[1];
    return parts[0] + ', Miami, FL' + (zip ? ' ' + zip : '');
  }

  /* One OpenStreetMap lookup. local = true searches ONLY inside searchBox;
     false searches the whole US (used to detect out-of-area addresses). */
  function searchOnce(q, local) {
    var wait = Math.max(0, 1100 - (Date.now() - lastGeocode));
    return sleep(wait).then(function () {
      lastGeocode = Date.now();
      var b = CFG.searchBox;
      var params = {
        q: q, format: 'jsonv2', addressdetails: 1, limit: 1, countrycodes: 'us',
        viewbox: [b.west, b.north, b.east, b.south].join(',')
      };
      if (local) params.bounded = 1;
      return getOnce(CFG.endpoints.geocode + '?' + qs(params));
    }).then(function (list) {
      if (!list || !list.length) return null;
      var r = list[0], a = r.address || {};
      return {
        lat: +r.lat, lon: +r.lon,
        county: a.county || '',
        exact: !!a.house_number,
        label: [a.house_number && a.road ? a.house_number + ' ' + a.road : (a.road || r.name || ''), a.city || a.town || a.village || (a.county === 'Miami-Dade County' ? 'Unincorporated Miami-Dade' : (a.hamlet || '')), a.postcode || ''].filter(Boolean).join(', ')
      };
    });
  }

  function geocode(address) {
    var q = normalizeAddress(address);
    var hasNumber = /^\s*\d+/.test(q);
    var place = q.split(',')[1] ? q.split(',')[1].trim().toLowerCase() : '';
    var retryable = hasNumber && place && place !== 'miami' && place !== 'fl';
    /* 1. Local search (Broward to Homestead only) */
    return searchOnce(q, true).then(function (first) {
      if (first && first.exact) return first;
      /* 2. Street-level or no match in Miami-Dade: retry with "Miami" mailing city */
      /* Only for Miami-Dade: a street-level Miami-Dade match, or the text says
         Miami-Dade. Never for Broward, so it can't jump to a Miami street. */
      var tryMiami = retryable && ((first && first.county === 'Miami-Dade County') || /miami-dade county/i.test(q));
      var next = tryMiami ? searchOnce(asMiamiMailing(q), true).then(function (second) {
        return second && second.exact ? second : (first || second);
      }, function () { return first; }) : Promise.resolve(first);
      return next.then(function (best) {
        if (best) return best;
        /* 3. Nothing locally: search nationwide only to say where it is */
        return searchOnce(q, false);
      });
    });
  }

  /* Is a matched point inside our coverage area? (see config.js coverageBox) */
  function inCoverage(place) {
    var b = CFG.coverageBox;
    if (CFG.excludedCounties.indexOf(place.county) > -1) return false;
    return place.lat >= b.south && place.lat <= b.north && place.lon >= b.west && place.lon <= b.east;
  }

  /* Tide gauge for a point: by county name, else by latitude */
  function gaugeFor(place) {
    if (CFG.gauges[place.county]) return CFG.gauges[place.county];
    return CFG.gauges[place.lat >= CFG.gaugeSplitLat ? 'Broward County' : 'Miami-Dade County'];
  }

  /* ----- 2. FEMA flood zone at the point -------------------------------- */
  function femaZone(lat, lon) {
    return getJSON(CFG.endpoints.femaZone + '?' + qs({
      geometry: lon + ',' + lat, geometryType: 'esriGeometryPoint', inSR: 4326,
      spatialRel: 'esriSpatialRelIntersects', outFields: 'FLD_ZONE,ZONE_SUBTY,STATIC_BFE,SFHA_TF',
      returnGeometry: false, f: 'json'
    })).then(function (d) {
      if (d.error) throw new Error(d.error.message);
      var f = d.features && d.features[0] && d.features[0].attributes;
      if (!f) return { zone: null };
      var bfe = f.STATIC_BFE != null && f.STATIC_BFE > -9000 ? f.STATIC_BFE : null; // -9999 = none
      return { zone: f.FLD_ZONE, subtype: f.ZONE_SUBTY || '', bfe: bfe, sfha: f.SFHA_TF === 'T' };
    });
  }

  /* ----- 3. Ground elevation (USGS), feet NAVD88 ------------------------ */
  function elevation(lat, lon) {
    return getJSON(CFG.endpoints.elevation + '?' + qs({ x: lon, y: lat, units: 'Feet', wkid: 4326 })).then(function (d) {
      var v = d && +d.value;
      if (!isFinite(v) || v < -1000) throw new Error('no elevation data here');
      return v;
    });
  }

  /* ----- 4. Risk level from the rules in config.js ----------------------
     margin = ground elevation - projected 2050 high tide */
  function riskLevel(zone, margin) {
    var r = CFG.risk;
    var hasMargin = margin != null;
    if (hasMargin && margin <= r.severe.marginAtOrBelow) return 'severe';
    if ((hasMargin && margin <= r.high.marginAtOrBelow) || (zone && zone.zone && r.high.zones.indexOf(zone.zone) > -1)) return 'high';
    if ((hasMargin && margin <= r.moderate.marginAtOrBelow) || (zone && r.moderate.zoneSubtypes.indexOf((zone.subtype || '').toUpperCase()) > -1)) return 'moderate';
    return 'low';
  }

  /* ----- Static map: 3x3 OpenStreetMap tiles centered on the point ------- */
  function drawMap(el, lat, lon) {
    var z = 17, n = Math.pow(2, z);
    var px = (lon + 180) / 360 * n * 256;
    var rad = lat * Math.PI / 180;
    var py = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n * 256;
    var tx = Math.floor(px / 256), ty = Math.floor(py / 256);
    var layer = el.querySelector('[data-map-tiles]');
    layer.innerHTML = '';
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        var img = document.createElement('img');
        img.src = CFG.endpoints.tiles.replace('{z}', z).replace('{x}', tx + dx).replace('{y}', ty + dy);
        img.alt = ''; img.width = 256; img.height = 256; img.decoding = 'async';
        img.style.left = ((dx + 1) * 256) + 'px'; img.style.top = ((dy + 1) * 256) + 'px';
        layer.appendChild(img);
      }
    }
    /* Shift the 768px tile block so the point sits at the center of the box */
    layer.style.transform = 'translate(' + (-(px - (tx - 1) * 256)) + 'px,' + (-(py - (ty - 1) * 256)) + 'px)';
    el.hidden = false;
  }


  /* ----- Results rendering ---------------------------------------------- */
  function render(tool, r) {
    var $ = function (k) { return tool.querySelector('[data-result="' + k + '"]'); };
    var set = function (k, v) { var e = $(k); if (e) e.textContent = v; };
    var show = function (k, on) { var e = $(k); if (e) e.hidden = !on; };

    set('kicker', r.exact ? 'Result for' : 'Closest match (street level)');
    set('address', r.label);
    show('street-note', !r.exact);

    /* Flood zone */
    if (r.zone && r.zone.zone) {
      var shaded = r.zone.zone === 'X' && /0\.2 PCT/i.test(r.zone.subtype);
      set('zone', r.zone.zone);
      var note = ZONE_NOTES[shaded ? 'X_SHADED' : r.zone.zone] || 'See FEMA\'s map for what this zone means.';
      if (r.zone.bfe != null && r.elev != null) {
        var d = r.zone.bfe - r.elev;
        note += ' 100-year flood level: ' + ft(r.zone.bfe) + (d > 0 ? ', ' + ft(d) + ' above the ground here.' : '.');
      }
      set('zone-note', note);
    } else {
      set('zone', r.zoneFailed ? 'Unavailable' : 'Not mapped');
      set('zone-note', r.zoneFailed ? 'FEMA\'s map service didn\'t respond. Try again in a minute.' : 'FEMA has no flood zone mapped at this exact point.');
    }

    /* Elevation bars: ground vs 2050 high tide vs today's king tide flood level */
    show('bars', r.elev != null);
    if (r.elev != null) {
      var top = Math.max(r.elev, r.ht2050, r.gauge.minorFlood) + 1;
      var pct = function (v) { return Math.max(3, Math.min(100, v / top * 100)) + '%'; };
      set('elevation', ft(r.elev));
      set('water2050', ft(r.ht2050));
      set('kingtide', ft(r.gauge.minorFlood));
      $('bar-ground').style.width = pct(r.elev);
      $('bar-2050').style.width = pct(r.ht2050);
      $('bar-king').style.width = pct(r.gauge.minorFlood);
      var m = r.elev - r.ht2050;
      set('elev-note', m <= 0
        ? 'Projected 2050 high tide is ' + ft(-m) + ' above this ground.'
        : 'Ground is ' + ft(m) + ' above projected 2050 high tide.');
    } else {
      set('elev-note', 'USGS elevation data didn\'t load for this spot, so the risk level uses the flood zone only.');
    }

    /* Risk chip */
    var chip = $('risk');
    chip.setAttribute('data-risk', r.risk);
    chip.textContent = RISK_LABEL[r.risk];
    set('risk-step', 'Step ' + RISK_STEP[r.risk] + ' of 4 on our scale: Low, Moderate, High, Severe.');
    set('meaning', MEANING[r.risk]);
    set('gauge', r.gauge.name);

    drawMap(tool.querySelector('[data-risk-map]'), r.lat, r.lon);
  }


  /* ----- Status panel (loading / outside / not found / error) ----------- */
  var ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
  var ICON_ALERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17v.5"/></svg>';
  var STATUS = {
    loading: '<div class="risk-tool__status"><div class="risk-tool__status-icon"><span class="spinner"></span></div><div><h3>Checking <span data-addr></span></h3><p>Finding the address, then looking up its flood zone and ground elevation.</p></div></div>',
    outside: '<div class="risk-tool__status"><div class="risk-tool__status-icon" style="color:var(--risk-moderate)">' + ICON_PIN + '</div><div><h3>Outside our coverage area</h3><p><span data-addr></span> looks like it is outside Miami-Dade and Broward. For other areas, check the <a href="https://msc.fema.gov/portal/home" rel="noopener">FEMA Flood Map Service Center</a>.</p></div></div>',
    notfound: '<div class="risk-tool__status"><div class="risk-tool__status-icon" style="color:var(--risk-moderate)">' + ICON_PIN + '</div><div><h3>We couldn\'t find that address</h3><p>Try adding the city, for example "123 Main St, Hollywood". Unit numbers can confuse the search, so leave them out.</p></div></div>',
    busy: '<div class="risk-tool__status"><div class="risk-tool__status-icon" style="color:var(--risk-moderate)">' + ICON_ALERT + '</div><div><h3>The address search is busy</h3><p>OpenStreetMap\'s free address search is limiting requests right now. Please wait a minute and try again.</p></div></div>',
    error: '<div class="risk-tool__status"><div class="risk-tool__status-icon" style="color:var(--risk-severe)">' + ICON_ALERT + '</div><div><h3>Something went wrong</h3><p>The mapping services didn\'t respond. Please try again in a minute.</p></div></div>'
  };


  /* ----- Init: wire up the form ----------------------------------------- */
  function init() {
    var tool = document.querySelector('[data-risk-tool]');
    if (!tool) return;
    var form = tool.querySelector('[data-risk-form]');
    var input = tool.querySelector('[data-risk-input]');
    var field = tool.querySelector('[data-risk-field]');
    var error = tool.querySelector('[data-risk-error]');
    var result = tool.querySelector('[data-risk-result]');
    var status = tool.querySelector('[data-risk-status]');
    var submit = form.querySelector('[type="submit"]');

    /* With JS on, the example result starts hidden */
    result.hidden = true;

    function showStatus(name, address) {
      if (!name) { status.hidden = true; status.innerHTML = ''; return; }
      status.innerHTML = STATUS[name];
      var slot = status.querySelector('[data-addr]');
      if (slot) slot.textContent = address; // textContent: safe from HTML injection
      status.setAttribute('data-state', name);
      status.hidden = false;
    }
    function setInvalid(on) {
      error.hidden = !on;
      field.classList.toggle('is-invalid', on);
      if (on) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', 'risk-error risk-coverage'); }
      else { input.removeAttribute('aria-invalid'); input.setAttribute('aria-describedby', 'risk-coverage'); }
    }
    input.addEventListener('input', function () { if (!error.hidden) setInvalid(false); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var address = input.value.trim();
      var my = ++runId;
      result.hidden = true;

      if (!address) { showStatus(null); setInvalid(true); input.focus(); return; }
      setInvalid(false);
      if (looksOutside(address)) { showStatus('outside', address); return; }

      showStatus('loading', address);
      submit.disabled = true;

      geocode(address).then(function (place) {
        if (my !== runId) return;
        if (!place) { showStatus('notfound', address); return; }
        if (!inCoverage(place)) { showStatus('outside', place.label || address); return; }

        /* FEMA and USGS in parallel; either may fail on its own */
        return Promise.all([
          femaZone(place.lat, place.lon).then(function (z) { return { ok: z }; }, function () { return { fail: true }; }),
          elevation(place.lat, place.lon).then(function (v) { return { ok: v }; }, function () { return { fail: true }; })
        ]).then(function (res) {
          if (my !== runId) return;
          if (res[0].fail && res[1].fail) { showStatus('error', address); return; }
          var gauge = gaugeFor(place);
          var elev = res[1].fail ? null : res[1].ok;
          var ht2050 = gauge.highTide + CFG.slr2050Ft;
          var zone = res[0].fail ? null : res[0].ok;
          render(tool, {
            label: place.label || address, exact: place.exact, lat: place.lat, lon: place.lon,
            zone: zone, zoneFailed: res[0].fail, elev: elev, ht2050: ht2050, gauge: gauge,
            risk: riskLevel(zone, elev == null ? null : elev - ht2050)
          });
          showStatus(null);
          result.hidden = false;
          result.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        });
      }).catch(function (e) {
        if (my === runId) showStatus(e && e.status === 429 ? 'busy' : 'error', address);
      }).then(function () { if (my === runId) submit.disabled = false; });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
