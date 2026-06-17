import { CONFIG } from './utils.js';

function parseDate(d) {
  if (!d) return null;
  const [y, m, day] = d.trim().split('-');
  return new Date(Date.UTC(+y, +m - 1, +day));
}

export async function loadData() {
  const files = [
    { key: 'CL_F', path: 'data/CL_F.csv' },
    { key: 'BZ_F', path: 'data/BZ_F.csv' },
    { key: 'HO_F', path: 'data/HO_F.csv' },
    { key: 'RB_F', path: 'data/RB_F.csv' },
    { key: 'NG_F', path: 'data/NG_F.csv' },
  ];

  const [priceResults, eventsRaw] = await Promise.all([
    Promise.all(files.map(f => d3.csv(f.path).then(rows => ({ key: f.key, rows })))),
    d3.csv('data/events_dataset.csv'),
  ]);

  const priceData = {};
  for (const { key, rows } of priceResults) {
    priceData[key] = parsePriceSeries(rows);
  }

  const events = parseEvents(eventsRaw);

  return { priceData, events };
}


function parsePriceSeries(rows) {
  return rows
    .filter(r => r.Date && r.Close)
    .map(r => ({
      date:   parseDate(r.Date),
      open:   +r.Open  || null,
      high:   +r.High  || null,
      low:    +r.Low   || null,
      close:  +r.Close || null,
      volume: +r.Volume || 0,
    }))
    .filter(r => r.date && !isNaN(r.date) && r.close > 0)
    .sort((a, b) => a.date - b.date);
}


function parseEvents(rows) {
  return rows
    .filter(r => r.Date && r['Event Name'])
    .map(r => ({
      date:     parseDate(r.Date),
      name:     r['Event Name'].trim(),
      category: r.Category.trim(),
      desc:     r.Description.trim(),
    }))
    .filter(r => r.date && !isNaN(r.date))
    .sort((a, b) => a.date - b.date);
}

// Filter to date range and optionally rebase to 100
export function filterPriceSeries(series, start, end, field, normalize) {
  let filtered = series.filter(d => d.date >= start && d.date <= end);
  if (filtered.length === 0) return [];

  const values = filtered.map(d => ({ date: d.date, value: d[field], volume: d.volume }));

  if (normalize) {
    const base = values[0].value;
    if (base && base !== 0) {
      return values.map(d => ({ ...d, value: d.value != null ? (d.value / base) * 100 : null }));
    }
  }
  return values;
}

export function computeMovingAverage(series, window) {
  const out = [];
  for (let i = 0; i < series.length; i++) {
    const slice = series.slice(Math.max(0, i - window + 1), i + 1);
    const vals = slice.map(d => d.value).filter(v => v != null);
    out.push({
      date:  series[i].date,
      value: vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
    });
  }
  return out;
}

// Returns { before, on, after, changePct } per commodity for a given event date
export function getEventImpact(priceData, eventDate, field, windowDays) {
  const impact = {};
  const et = eventDate.getTime();

  for (const [key, series] of Object.entries(priceData)) {
    const sorted = series.filter(d => d[field] != null);

    // Find closest point on or before event date
    const beforeCandidates = sorted.filter(d => d.date.getTime() <= et);
    const afterCandidates  = sorted.filter(d => d.date.getTime() > et);

    const beforePt = beforeCandidates.length ? beforeCandidates[beforeCandidates.length - 1] : null;
    const onPt     = sorted.find(d => d.date.getTime() === et) || beforePt;

    // Find price ~windowDays after event
    const targetAfter = new Date(et + windowDays * 86400000);
    const afterPt = afterCandidates.reduce((best, d) => {
      if (!best) return d;
      return Math.abs(d.date - targetAfter) < Math.abs(best.date - targetAfter) ? d : best;
    }, null);

    const preBefore = beforePt ? beforePt[field] : null;
    const preOn     = onPt     ? onPt[field]     : null;
    const preAfter  = afterPt  ? afterPt[field]  : null;
    const changePct = preBefore && preAfter ? ((preAfter - preBefore) / preBefore * 100) : null;

    impact[key] = { before: preBefore, on: preOn, after: preAfter, changePct };
  }
  return impact;
}
