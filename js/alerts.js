/* ==========================================================================
   alerts.js (home, city pages, News)
   Keeps the pinned cards current between deploys:
     1. Hides any card whose data-expires time has passed (an expired weather
        alert, or a meeting from yesterday).
     2. Asks the National Weather Service for active alerts right now and
        rebuilds the weather alert cards, so a new tornado or flood warning
        shows up without waiting for the hourly data update.
   Which places to check (data-alert-points) and which alert types get a
   card (data-alert-events, from config/alerts.json) are written onto the
   list by scripts/prerender.js. If NWS can't be reached, the cards from the
   last deploy stay as they are. Card markup matches alertCard() in prerender.js.
   To change how often it re-checks, edit REFRESH_MIN.
   ========================================================================== */
(() => {
  const REFRESH_MIN = 5;
  const NWS = 'https://api.weather.gov/alerts/active?point=';
  const RISK = { warning: 'severe', watch: 'high', advisory: 'moderate' };
  const LABEL = { warning: 'Warning', watch: 'Watch', advisory: 'Advisory' };
  const ORDER = { warning: 0, watch: 1, advisory: 2 };
  const lists = Array.from(document.querySelectorAll('[data-pins]'));
  if (!lists.length) return;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const timeET = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const parse = (s, fb) => { try { return JSON.parse(s); } catch (e) { return fb; } };

  /* Hides cards whose data-expires is in the past */
  function hideExpired() {
    const now = Date.now();
    document.querySelectorAll('.pin[data-expires]').forEach((li) => {
      const t = Date.parse(li.dataset.expires);
      if (t && t < now) li.remove();
    });
  }

  /* Builds one weather alert card. Input: { id, event, level, expires, url, cities: [names] } */
  function card(a) {
    const until = a.expires ? ` · Until ${timeET(a.expires)}` : '';
    return `<li class="pin pin--alert" data-level="${a.level}" data-expires="${esc(a.expires)}" data-alert-id="${esc(a.id)}">
        <p class="pin__kicker"><span class="risk-chip" data-risk="${RISK[a.level]}">${LABEL[a.level]}</span><span class="label">Weather alert${esc(until)}</span></p>
        <h3 class="pin__title"><a href="${esc(a.url)}" rel="noopener">${esc(a.event)}<span class="visually-hidden"> (National Weather Service)</span></a></h3>
        <p class="pin__text">${esc(a.cities.join(', '))}</p>
      </li>`;
  }

  /* Fetches alerts for every point on one list and swaps in fresh cards.
     Meeting cards on the same list are left alone (alerts go first). */
  async function refresh(list) {
    const points = parse(list.dataset.alertPoints, []);
    const events = parse(list.dataset.alertEvents, {});
    const names = parse(list.dataset.cityNames, {});
    if (!points.length) return;
    try {
      const byId = new Map();
      const results = await Promise.all(points.map(([lat, lon, city]) =>
        fetch(NWS + lat + ',' + lon, { headers: { Accept: 'application/geo+json' } })
          .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then((d) => ({ city, features: d.features || [] }))));
      results.forEach(({ city, features }) => features.forEach((f) => {
        const p = f.properties;
        if (!events[p.event]) return;
        const id = p.id || p['@id'];
        if (!byId.has(id)) byId.set(id, { id, event: p.event, level: events[p.event], expires: p.ends || p.expires, url: p['@id'] || id, cities: [] });
        byId.get(id).cities.push(names[city] || city);
      }));
      const fresh = [...byId.values()].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
      list.querySelectorAll('.pin--alert').forEach((li) => li.remove());
      list.insertAdjacentHTML('afterbegin', fresh.map(card).join(''));
    } catch (e) {
      /* NWS unreachable: keep the cards from the last deploy */
    }
    hideExpired();
  }

  function run() { hideExpired(); lists.forEach(refresh); }
  run();
  setInterval(run, REFRESH_MIN * 60000);
})();
