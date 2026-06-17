import { CONFIG, formatDate, debounce } from './utils.js';

export const state = {
  dateStart:     null,   // Date
  dateEnd:       null,   // Date
  commodities:   new Set(Object.keys(CONFIG.commodities)),
  hiddenSeries:  new Set(),  // keys hidden via legend click
  priceField:    'close',
  eventCats:     new Set(Object.keys(CONFIG.categories)),
  showEventMarkers: true,
  showEventLabels:  true,
  showVolume:       true,
  showMA30:         false,
  showMA90:         false,
  normalizePrice:   false,
  logScale:         false,
  impactWindow:     30,
  analysisMode:     false,
  tableSearch:      '',
  tableSort:        { col: 'date', dir: 'asc' },
  tableCatFilter:   null,
};

const listeners = { change: [] };

export function onChange(fn) { listeners.change.push(fn); }

function emit() {
  listeners.change.forEach(fn => fn(state));
}

export function initFilters(priceData, events) {
  // Determine global date range from data
  const allDates = Object.values(priceData).flatMap(s => s.map(d => d.date));
  const dataMin  = new Date(Math.min(...allDates));
  const dataMax  = new Date(Math.max(...allDates));

  state.dateStart = dataMin;
  state.dateEnd   = dataMax;

  setupCollapsibles();
  setupDateRange(dataMin, dataMax);
  setupCommodityFilters();
  setupPriceTypeFilter();
  setupEventCatFilters();
  setupVizOptions();
}

function setupCollapsibles() {
  document.querySelectorAll('.ctrl-section-header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.ctrl-section').classList.toggle('collapsed');
    });
  });
}


function setupDateRange(dataMin, dataMax) {
  const startInput = document.getElementById('date-start');
  const endInput   = document.getElementById('date-end');

  startInput.value = formatDate(dataMin);
  endInput.value   = formatDate(dataMax);
  startInput.min   = formatDate(dataMin);
  startInput.max   = formatDate(dataMax);
  endInput.min     = formatDate(dataMin);
  endInput.max     = formatDate(dataMax);

  startInput.addEventListener('change', () => {
    state.dateStart = startInput.value ? new Date(startInput.value + 'T00:00:00Z') : dataMin;
    clearActiveRange();
    emit();
  });

  endInput.addEventListener('change', () => {
    state.dateEnd = endInput.value ? new Date(endInput.value + 'T00:00:00Z') : dataMax;
    clearActiveRange();
    emit();
  });

  // Quick range buttons
  document.querySelectorAll('.quick-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const range = btn.dataset.range;
      applyQuickRange(range, dataMax, dataMin, startInput, endInput);
      document.querySelectorAll('.quick-range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      emit();
    });
  });

  // Default: show all
  document.querySelector('[data-range="all"]').classList.add('active');
}

function applyQuickRange(range, dataMax, dataMin, startInput, endInput) {
  let start = new Date(dataMax);
  switch (range) {
    case 'all': start = dataMin; break;
    case '1y':  start = new Date(dataMax); start.setUTCFullYear(start.getUTCFullYear() - 1); break;
    case '3y':  start = new Date(dataMax); start.setUTCFullYear(start.getUTCFullYear() - 3); break;
    case '5y':  start = new Date(dataMax); start.setUTCFullYear(start.getUTCFullYear() - 5); break;
    case '10y': start = new Date(dataMax); start.setUTCFullYear(start.getUTCFullYear() - 10); break;
    case '20y': start = new Date(dataMax); start.setUTCFullYear(start.getUTCFullYear() - 20); break;
  }
  if (start < dataMin) start = dataMin;
  state.dateStart = start;
  state.dateEnd   = dataMax;
  startInput.value = formatDate(start);
  endInput.value   = formatDate(dataMax);
}

function clearActiveRange() {
  document.querySelectorAll('.quick-range-btn').forEach(b => b.classList.remove('active'));
}


function setupCommodityFilters() {
  document.querySelectorAll('.commodity-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const key = cb.dataset.key;
      if (cb.checked) state.commodities.add(key);
      else            state.commodities.delete(key);
      emit();
    });
  });
}


function setupPriceTypeFilter() {
  document.querySelectorAll('.price-type-radio').forEach(rb => {
    rb.addEventListener('change', () => {
      if (rb.checked) { state.priceField = rb.value; emit(); }
    });
  });
}


function setupEventCatFilters() {
  document.querySelectorAll('.event-cat-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const cat = cb.dataset.cat;
      if (cb.checked) state.eventCats.add(cat);
      else            state.eventCats.delete(cat);
      emit();
    });
  });
}


function setupVizOptions() {
  bindToggle('toggle-event-markers', v => { state.showEventMarkers = v; });
  bindToggle('toggle-event-labels',  v => { state.showEventLabels  = v; });
  bindToggle('toggle-volume',        v => { state.showVolume        = v; });
  bindToggle('toggle-ma30',          v => { state.showMA30          = v; });
  bindToggle('toggle-ma90',          v => { state.showMA90          = v; });
  bindToggle('toggle-normalize',     v => { state.normalizePrice    = v; });
}

function bindToggle(id, setter) {
  const el = document.getElementById(id);
  if (!el) return;
  setter(el.checked); // no emit — first render reads initial state directly
  el.addEventListener('change', () => { setter(el.checked); emit(); });
}

// called by legend clicks in chart.js
export function toggleSeriesVisibility(key) {
  if (state.hiddenSeries.has(key)) state.hiddenSeries.delete(key);
  else state.hiddenSeries.add(key);
  emit();
}
