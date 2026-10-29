/* ==========================================================================
   config.js
   Settings for browser features. Edit values here, not in the scripts.
   Currently used by: risk-tool.js (address flood-risk lookup)
   ========================================================================== */
window.SSF_CONFIG = {

  /* ----- Address risk tool --------------------------------------------- */
  riskTool: {

    /* Free, keyless services called straight from the browser (all allow it).
       OpenStreetMap's usage policy: max 1 lookup per second, show attribution.
       The tool waits between lookups, so normal use stays well inside it. */
    endpoints: {
      geocode: 'https://nominatim.openstreetmap.org/search',
      femaZone: 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query',
      elevation: 'https://epqs.nationalmap.gov/v1/json',
      tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
    },
    timeoutMs: 15000,

    /* COVERAGE: everywhere from northern Broward down through Homestead and
       Florida City (decided 2026-10-29). An address is covered if its point
       falls inside coverageBox and OpenStreetMap doesn't name it as one of
       the excludedCounties. This works even when OSM leaves the county blank.
       searchBox (slightly larger) is where the first, local search looks. */
    coverageBox: { west: -80.9, south: 25.2, east: -80.0, north: 26.35 },
    excludedCounties: ['Monroe County', 'Palm Beach County', 'Collier County', 'Hendry County'],
    searchBox: { west: -80.95, south: 25.1, east: -80.0, north: 26.4 },
    counties: ['Miami-Dade County', 'Broward County'],   // used to pick the tide gauge

    /* Tide gauge reference levels, in feet NAVD88 (the same reference USGS
       uses for ground elevation). From NOAA station datums (epoch 1983-2001)
       and NWS flood levels:
         highTide   = MHHW, the average daily high tide today
         minorFlood = NWS minor flood level (king tides start flooding streets)
       Miami-Dade uses Virginia Key, Broward uses South Port Everglades.
       If OSM gives no county, points north of gaugeSplitLat use Port Everglades. */
    gaugeSplitLat: 25.97,
    gauges: {
      'Miami-Dade County': { name: 'Virginia Key', highTide: 0.23, minorFlood: 1.51 },
      'Broward County': { name: 'South Port Everglades', highTide: 0.57, minorFlood: 1.84 }
    },

    /* Sea level rise by 2050, NOAA 2022 Technical Report, Intermediate
       scenario, Virginia Key (32 cm). NOAA publishes no projection for Port
       Everglades, so Broward uses the same value; the regional difference is
       small. Baseline is the year 2000, close to the datum epoch above.
       To use a different scenario: Low 0.79, Int-Low 0.92, Int-High 1.25, High 1.48 */
    slr2050Ft: 1.05,
    slrLabel: 'NOAA Intermediate scenario',

    /* Risk rules. Checked from Severe down; first match wins.
       margin = ground elevation minus projected 2050 high tide (ft). */
    risk: {
      severe:   { marginAtOrBelow: 0 },
      high:     { marginAtOrBelow: 1, zones: ['A', 'AE', 'AH', 'AO', 'AR', 'A99', 'V', 'VE'] },
      moderate: { marginAtOrBelow: 3, zoneSubtypes: ['0.2 PCT ANNUAL CHANCE FLOOD HAZARD'] }
      /* low: everything else */
    }
  }

  // FUTURE: city tide + conditions JSON for the browser data loader
  // citiesData: 'data/cities.json',
};
