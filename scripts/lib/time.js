/* ==========================================================================
   scripts/lib/time.js
   Date helpers, all in Miami time (America/New_York), because NOAA returns
   local times like "2026-10-28 15:12" with no offset attached.
   ========================================================================== */
'use strict';

const TZ = 'America/New_York';

/* Parts of a date as seen in Miami: { y, m, d, hh, mm } (strings, zero-padded) */
function partsET(date = new Date()) {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).forEach((x) => { p[x.type] = x.value; });
  return { y: p.year, m: p.month, d: p.day, hh: p.hour, mm: p.minute };
}

/* "20261028" for NOAA begin_date / end_date */
function ymdET(date = new Date()) { const p = partsET(date); return p.y + p.m + p.d; }

/* "2026-10-28" */
function isoDateET(date = new Date()) { const p = partsET(date); return `${p.y}-${p.m}-${p.d}`; }

/* "-04:00" or "-05:00" for a given instant (handles daylight saving) */
function offsetET(date) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(date).find((x) => x.type === 'timeZoneName').value; // "GMT-04:00"
  return name === 'GMT' ? '+00:00' : name.replace('GMT', '');
}

/* NOAA local time "2026-10-28 15:12" -> ISO "2026-10-28T15:12:00-04:00".
   Guesses the offset from a noon UTC on that day, which is right except in
   the two hours around a DST switch (close enough for display). */
function noaaLocalToISO(s) {
  const [d, t] = s.split(' ');
  const off = offsetET(new Date(d + 'T12:00:00Z'));
  return `${d}T${t}:00${off}`;
}

/* Decimal hours since midnight, Miami time, for an ISO string or Date */
function hoursET(date) { const p = partsET(new Date(date)); return +p.hh + (+p.mm) / 60; }

/* Is today inside the king tide season? season = { start: "08-15", end: "12-15" } */
function inSeason(season, date = new Date()) {
  const p = partsET(date);
  const md = `${p.m}-${p.d}`;
  return season.start <= season.end
    ? md >= season.start && md <= season.end
    : md >= season.start || md <= season.end; // season that wraps past New Year
}

/* NOAA meteorological year: May 1 to April 30. Returns the current and last one. */
function metYears(date = new Date()) {
  const p = partsET(date);
  const startYear = +p.m >= 5 ? +p.y : +p.y - 1;
  const mk = (y) => ({
    year: y,
    start: `${y}0501`,
    end: `${y + 1}0430`,
    label: `May ${y} to Apr ${y + 1}`
  });
  return { current: mk(startYear), last: mk(startYear - 1) };
}

/* "20261001" + n days -> "20261031" */
function addDaysYmd(ymd, n) {
  const dt = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + n));
  return dt.toISOString().slice(0, 10).replace(/-/g, '');
}

module.exports = { partsET, ymdET, isoDateET, noaaLocalToISO, hoursET, inSeason, metYears, addDaysYmd, offsetET, TZ };
