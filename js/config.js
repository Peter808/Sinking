/* ==========================================================================
   config.js
   Future API endpoints and data paths. Nothing here is used yet.
   When a feature goes live, uncomment its line and read it from
   window.SSF_CONFIG in the matching script.
   ========================================================================== */
window.SSF_CONFIG = {
  // FUTURE: city tide + conditions JSON, written by a scheduled GitHub Action (NOAA CO-OPS)
  // citiesData: 'data/cities.json',

  // FUTURE: news feed JSON, written by a scheduled GitHub Action
  // newsData: 'data/news.json',

  // FUTURE: Cloudflare Worker that geocodes an address and handles CORS
  // geocodeEndpoint: 'https://ssf-geocode.example.workers.dev/geocode',

  // FUTURE: FEMA National Flood Hazard Layer query (flood zone by lat/lng)
  // femaFloodZone: 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query',

  // FUTURE: USGS Elevation Point Query Service (ground elevation by lat/lng)
  // usgsElevation: 'https://epqs.nationalmap.gov/v1/json',

  // FUTURE: NOAA tide predictions
  // noaaTides: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
};
