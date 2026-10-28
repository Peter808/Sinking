/* ==========================================================================
   risk-tool.js
   Address flood-risk tool (demo logic only).
   Current behavior:
     - Empty submit       -> inline validation message
     - Outside coverage   -> "outside coverage area" message
                             (Tampa, Orlando, a non-FL state, or a ZIP outside
                             Miami-Dade / Broward)
     - Contains "error"   -> error state (demo hook so the state can be reviewed)
     - Anything else      -> 800ms loading, then the SAMPLE result
   All markup lives in index.html; this file only shows, hides, and fills it.
   ========================================================================== */
(function () {
  'use strict';

  var LOADING_MS = 800; // fake lookup time; remove when the real lookup exists

  /* Places we know are outside coverage. Add more lowercase names here. */
  var OUTSIDE_PLACES = ['tampa', 'orlando'];

  /* Every US state except Florida, as 2-letter codes and full names.
     Matched only after a comma ("..., GA" or "..., Georgia") so street
     suffixes like "Ct" or "Dr" don't trigger it. */
  var OTHER_STATE_CODES = 'AL AK AZ AR CA CO CT DE DC GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
  var OTHER_STATE_NAMES = ['alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming'];

  /* Miami-Dade and Broward ZIPs start with 330 to 333 */
  var COVERED_ZIP = /^33[0-3]/;


  /* Returns true when the address is clearly outside Miami-Dade / Broward.
     Input: raw address string. */
  function isOutsideCoverage(address) {
    var a = address.toLowerCase();
    if (OUTSIDE_PLACES.some(function (p) { return a.indexOf(p) > -1; })) return true;

    var parts = a.split(',').map(function (s) { return s.trim(); }).slice(1); // pieces after the first comma
    var stateHit = parts.some(function (part) {
      var code = part.replace(/\s*\d{5}(-\d{4})?$/, '').replace(/\.$/, '');
      return OTHER_STATE_CODES.indexOf(code.toUpperCase()) > -1 || OTHER_STATE_NAMES.indexOf(code) > -1;
    });
    if (stateHit) return true;

    var zip = /\b(\d{5})(?:-\d{4})?\s*$/.exec(a);
    if (zip && !COVERED_ZIP.test(zip[1])) return true;
    return false;
  }


  /* Status panel templates (loading, outside, error). Plain HTML strings.
     Edit the copy here. */
  var ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
  var ICON_ALERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17v.5"/></svg>';

  var STATUS = {
    loading: '<div class="risk-tool__status"><div class="risk-tool__status-icon"><span class="spinner"></span></div><div><h3>Checking <span data-addr></span></h3><p>Looking up flood zone, elevation, and 2050 projections.</p></div></div>',
    outside: '<div class="risk-tool__status"><div class="risk-tool__status-icon" style="color:var(--risk-moderate)">' + ICON_PIN + '</div><div><h3>Outside our coverage area</h3><p><span data-addr></span> looks like it is outside Miami-Dade and Broward. For other areas, check the <a href="https://msc.fema.gov/portal/home" rel="noopener">FEMA Flood Map Service Center</a>.</p></div></div>',
    error: '<div class="risk-tool__status"><div class="risk-tool__status-icon" style="color:var(--risk-severe)">' + ICON_ALERT + '</div><div><h3>Something went wrong</h3><p>We couldn\'t check that address right now. Please try again in a minute.</p></div></div>'
  };


  function init() {
    var tool = document.querySelector('[data-risk-tool]');
    if (!tool) return;

    var form   = tool.querySelector('[data-risk-form]');
    var input  = tool.querySelector('[data-risk-input]');
    var field  = tool.querySelector('[data-risk-field]');
    var error  = tool.querySelector('[data-risk-error]');
    var result = tool.querySelector('[data-risk-result]');
    var status = tool.querySelector('[data-risk-status]');
    var timer;

    /* With JS on, the example result starts hidden and appears after a search */
    result.hidden = true;
    result.setAttribute('data-state', 'result');
    tool.querySelector('[data-risk-kicker]').textContent = 'Sample result for';

    /* Shows one status template, or hides the panel when name is null */
    function showStatus(name, address) {
      if (!name) { status.hidden = true; status.innerHTML = ''; return; }
      status.innerHTML = STATUS[name];
      var slot = status.querySelector('[data-addr]');
      if (slot) slot.textContent = address; // textContent = safe from HTML injection
      status.setAttribute('data-state', name);
      status.hidden = false;
    }

    /* Inline validation on/off */
    function setInvalid(on) {
      error.hidden = !on;
      field.classList.toggle('is-invalid', on);
      if (on) {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', 'risk-error risk-coverage');
      } else {
        input.removeAttribute('aria-invalid');
        input.setAttribute('aria-describedby', 'risk-coverage');
      }
    }

    input.addEventListener('input', function () { if (!error.hidden) setInvalid(false); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearTimeout(timer);
      var address = input.value.trim();
      result.hidden = true;

      // 1. Validate
      if (!address) { showStatus(null); setInvalid(true); input.focus(); return; }
      setInvalid(false);

      // 2. Coverage check
      // FUTURE: replace with the geocoder's county result (Miami-Dade or Broward)
      if (isOutsideCoverage(address)) { showStatus('outside', address); return; }

      // Demo hook: type "error" anywhere to preview the error state
      if (/error/i.test(address)) { showStatus('error', address); return; }

      // 3. Loading
      showStatus('loading', address);

      // FUTURE: real lookup, step by step (see config.js for endpoints)
      //   a. Geocode the address via the Cloudflare Worker -> lat/lng + county
      //   b. Query FEMA NFHL for the flood zone at lat/lng
      //   c. Query USGS EPQS for ground elevation
      //   d. Compare with NOAA / SE FL Compact 2050 projected high water
      //   e. Map the gap to the 4-step risk scale and fill [data-result] fields
      timer = setTimeout(function () {
        showStatus(null);
        tool.querySelector('[data-risk-address]').textContent = address;
        result.hidden = false;
        result.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }, LOADING_MS);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
