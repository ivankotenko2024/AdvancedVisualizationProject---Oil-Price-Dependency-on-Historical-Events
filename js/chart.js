import { CONFIG, fmtPrice, getCatColor, friendlyDate, formatDate, addDays, esc } from './utils.js';
import { filterPriceSeries, computeMovingAverage } from './dataLoader.js';
import { showEventDetail, drawAnalysisOverlay } from './eventAnalysis.js';

let svg, chartG, xScale, yScale, yScaleVol;
let width, height, innerW, innerH;
let margin = { top: 20, right: 60, bottom: 36, left: 64 };
let currentState = null;
let currentPriceData = null;
let currentEvents = null;
let zoomBehavior = null;
let brushBehavior = null;
let currentZoomTransform = d3.zoomIdentity;
let filteredSeriesCache = {};
let onTableHighlight = null;

const MA_COLORS = { 30: 'rgba(80,80,80,0.45)', 90: 'rgba(80,80,80,0.25)' };

export function initChart(priceData, events, state, tableHighlightFn) {
  currentPriceData = priceData;
  currentEvents    = events;
  currentState     = state;
  onTableHighlight = tableHighlightFn;

  buildLegend(state);
  buildSvg();
  renderChart(state);

  const container = document.getElementById('chart-svg-container');
  const ro = new ResizeObserver(debounce(() => {
    buildSvg();
    renderChart(currentState);
  }, 120));
  ro.observe(container);
}

function debounce(fn, delay) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); };
}

function buildSvg() {
  const container = document.getElementById('chart-svg-container');
  width  = container.clientWidth;
  height = container.clientHeight;
  innerW = width  - margin.left - margin.right;
  innerH = height - margin.top  - margin.bottom;

  d3.select('#chart-svg').selectAll('*').remove();

  svg = d3.select('#chart-svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('width',  width)
    .attr('height', height);

  // Clip path
  svg.append('defs').append('clipPath').attr('id', 'chart-clip')
    .append('rect').attr('width', innerW).attr('height', innerH);

  // Background
  svg.append('rect').attr('width', width).attr('height', height).attr('fill', 'transparent');

  chartG = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  chartG.append('g').attr('class', 'grid grid-x');
  chartG.append('g').attr('class', 'grid grid-y');

  chartG.append('g').attr('class', 'volume-layer').attr('clip-path', 'url(#chart-clip)');
  chartG.append('g').attr('class', 'lines-layer').attr('clip-path', 'url(#chart-clip)');
  chartG.append('g').attr('class', 'ma-layer').attr('clip-path', 'url(#chart-clip)');
  chartG.append('g').attr('class', 'event-layer').attr('clip-path', 'url(#chart-clip)');

  chartG.append('g').attr('class', 'axis axis-x').attr('transform', `translate(0,${innerH})`);
  chartG.append('g').attr('class', 'axis axis-y');
  chartG.append('g').attr('class', 'axis axis-y-right').attr('transform', `translate(${innerW},0)`);

  chartG.append('line').attr('class', 'crosshair-line crosshair-v').attr('y1', 0).attr('y2', innerH);
  chartG.append('line').attr('class', 'crosshair-line crosshair-h').attr('x1', 0).attr('x2', innerW);

  chartG.append('g').attr('class', 'brush-layer');

  chartG.append('rect')
    .attr('class', 'interaction-rect')
    .attr('width', innerW).attr('height', innerH)
    .attr('fill', 'transparent')
    .attr('cursor', 'crosshair');

  setupBrushAndZoom();
  setupMouseInteraction();
}

export function renderChart(state) {
  currentState = state;
  if (!svg || !chartG) return;

  filteredSeriesCache = {};

  const visibleKeys = [...state.commodities].filter(k => !state.hiddenSeries.has(k));

  for (const key of visibleKeys) {
    if (!currentPriceData[key]) continue;
    filteredSeriesCache[key] = filterPriceSeries(
      currentPriceData[key],
      state.dateStart,
      state.dateEnd,
      state.priceField,
      state.normalizePrice
    );
  }

  const allDates = Object.values(filteredSeriesCache).flatMap(s => s.map(d => d.date));
  const allVals  = Object.values(filteredSeriesCache).flatMap(s => s.map(d => d.value).filter(v => v != null));

  if (allDates.length === 0 || allVals.length === 0) {
    chartG.selectAll('.lines-layer path').remove();
    return;
  }

  xScale = d3.scaleUtc()
    .domain([d3.min(allDates), d3.max(allDates)])
    .range([0, innerW]);

  const yMin = d3.min(allVals) * 0.98;
  const yMax = d3.max(allVals) * 1.02;

  yScale = (state.logScale ? d3.scaleLog() : d3.scaleLinear())
    .domain([Math.max(state.logScale ? 0.01 : yMin, yMin), yMax])
    .range([innerH, 0])
    .nice();

  const allVolumes = Object.values(filteredSeriesCache).flatMap(s => s.map(d => d.volume || 0));
  yScaleVol = d3.scaleLinear()
    .domain([0, d3.max(allVolumes) || 1])
    .range([innerH, innerH * 0.75]);

  drawAxes(state);
  drawGridLines();
  drawVolume(state, visibleKeys);
  drawLines(state, visibleKeys);
  drawMAs(state, visibleKeys);
  drawEventMarkers(state);
  applyCurrentZoom();
}

function drawAxes(state) {
  const xAxis = d3.axisBottom(xScale)
    .ticks(Math.max(4, Math.floor(innerW / 100)))
    .tickSize(4)
    .tickPadding(6);

  chartG.select('.axis-x')
    .call(xAxis)
    .call(g => g.select('.domain').attr('stroke', 'var(--border)'))
    .call(g => g.selectAll('.tick line').attr('stroke', 'var(--border)'))
    .call(g => g.selectAll('.tick text').attr('fill', 'var(--text-muted)').style('font-family', 'var(--font-ui)').style('font-size', '10px'));

  const yAxisFmt = state.normalizePrice
    ? d => d.toFixed(0) + '%'
    : d => d >= 1000 ? (d/1000).toFixed(1)+'k' : d.toFixed(d < 10 ? 2 : 0);

  const yAxis = d3.axisLeft(yScale).ticks(6).tickSize(4).tickPadding(6).tickFormat(yAxisFmt);

  chartG.select('.axis-y')
    .call(yAxis)
    .call(g => g.select('.domain').remove())
    .call(g => g.selectAll('.tick line').attr('stroke', 'var(--border)'))
    .call(g => g.selectAll('.tick text').attr('fill', 'var(--text-muted)').style('font-family', 'var(--font-ui)').style('font-size', '10px'));
}

function drawGridLines() {
  const xTicks = xScale.ticks(Math.max(4, Math.floor(innerW / 100)));
  const yTicks = yScale.ticks(6);

  chartG.select('.grid-x')
    .selectAll('line').data(yTicks)
    .join('line')
    .attr('x1', 0).attr('x2', innerW)
    .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
    .attr('stroke', '#e9ecef')
    .attr('stroke-dasharray', null);

  chartG.select('.grid-y')
    .selectAll('line').data(xTicks)
    .join('line')
    .attr('y1', 0).attr('y2', innerH)
    .attr('x1', d => xScale(d)).attr('x2', d => xScale(d))
    .attr('stroke', '#f3f4f6')
    .attr('stroke-dasharray', null);
}

function drawVolume(state, visibleKeys) {
  const volLayer = chartG.select('.volume-layer');
  volLayer.selectAll('*').remove();
  if (!state.showVolume) return;

  // only draw volume for the first visible series
  const key = visibleKeys[0];
  if (!key || !filteredSeriesCache[key]) return;

  const series = filteredSeriesCache[key];
  const barW = Math.max(1, innerW / series.length - 0.5);
  const color = CONFIG.commodities[key]?.color || '#60a5fa';

  volLayer.selectAll('rect').data(series)
    .join('rect')
    .attr('class', 'volume-bar')
    .attr('x', d => xScale(d.date) - barW / 2)
    .attr('y', d => yScaleVol(d.volume || 0))
    .attr('width', barW)
    .attr('height', d => innerH - yScaleVol(d.volume || 0))
    .attr('fill', color);
}

function drawLines(state, visibleKeys) {
  const lineLayer = chartG.select('.lines-layer');
  lineLayer.selectAll('path.price-line').remove();

  const lineGen = d3.line()
    .x(d => xScale(d.date))
    .y(d => yScale(d.value))
    .defined(d => d.value != null)
    .curve(d3.curveMonotoneX);

  for (const key of visibleKeys) {
    const series = filteredSeriesCache[key];
    if (!series || series.length === 0) continue;
    const color = CONFIG.commodities[key]?.color || '#888';

    lineLayer.append('path')
      .datum(series)
      .attr('class', `price-line line`)
      .attr('data-key', key)
      .attr('d', lineGen)
      .attr('stroke', color)
      .attr('fill', 'none')
      .attr('stroke-width', 1.8)
      .attr('opacity', 0.9);
  }
}

function drawMAs(state, visibleKeys) {
  const maLayer = chartG.select('.ma-layer');
  maLayer.selectAll('*').remove();

  const lineGen = d3.line()
    .x(d => xScale(d.date))
    .y(d => yScale(d.value))
    .defined(d => d.value != null)
    .curve(d3.curveMonotoneX);

  for (const key of visibleKeys) {
    const series = filteredSeriesCache[key];
    if (!series || series.length < 5) continue;
    const color = CONFIG.commodities[key]?.color || '#888';

    if (state.showMA30) {
      const ma = computeMovingAverage(series, 30);
      maLayer.append('path')
        .datum(ma)
        .attr('class', 'ma-line')
        .attr('d', lineGen)
        .attr('stroke', color)
        .attr('opacity', 0.5)
        .attr('stroke-dasharray', '5,3')
        .attr('stroke-width', 1.2)
        .attr('fill', 'none');
    }

    if (state.showMA90) {
      const ma = computeMovingAverage(series, 90);
      maLayer.append('path')
        .datum(ma)
        .attr('class', 'ma-line')
        .attr('d', lineGen)
        .attr('stroke', color)
        .attr('opacity', 0.3)
        .attr('stroke-dasharray', '8,5')
        .attr('stroke-width', 1.5)
        .attr('fill', 'none');
    }
  }
}

function drawEventMarkers(state) {
  const evLayer = chartG.select('.event-layer');
  evLayer.selectAll('*').remove();
  if (!state.showEventMarkers || !currentEvents) return;

  const visibleEvents = currentEvents.filter(e =>
    e.date >= state.dateStart &&
    e.date <= state.dateEnd &&
    state.eventCats.has(e.category)
  );

  const byDate = d3.group(visibleEvents, d => formatDate(d.date));

  const DOT_Y   = 11;
  const DOT_R   = 5;
  const LABEL_H = 14;  // vertical step between stagger levels
  const CHAR_W  = 5.2; // approx px per char at 9px font

  // per-level label extents for overlap avoidance
  const labelLevels = {};

  byDate.forEach((events, dateStr) => {
    const x        = xScale(events[0].date);
    const catColor = getCatColor(events[0].category);
    const count    = events.length;
    const dotR     = count > 1 ? DOT_R + 2 : DOT_R;

    const g = evLayer.append('g')
      .attr('class', 'event-marker-group')
      .style('cursor', 'pointer');

    // Very subtle full-height rule
    g.append('line')
      .attr('class', 'event-line')
      .attr('x1', x).attr('x2', x)
      .attr('y1', DOT_Y).attr('y2', innerH)
      .attr('stroke', catColor)
      .attr('stroke-width', 0.75)
      .attr('opacity', 0.15);

    // Short solid flagpole above the dot
    g.append('line')
      .attr('x1', x).attr('x2', x)
      .attr('y1', 0).attr('y2', DOT_Y - dotR)
      .attr('stroke', catColor)
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.7)
      .attr('pointer-events', 'none');

    g.append('circle')
      .attr('class', 'event-dot')
      .attr('cx', x).attr('cy', DOT_Y)
      .attr('r', dotR)
      .attr('fill', catColor)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5);

    // Count badge when multiple events share the date
    if (count > 1) {
      g.append('text')
        .attr('x', x).attr('y', DOT_Y)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', '#fff')
        .attr('font-size', 7)
        .attr('font-weight', '700')
        .attr('pointer-events', 'none')
        .text(count > 9 ? '9+' : count);
    }

    // Staggered horizontal labels
    if (state.showEventLabels) {
      const raw   = events[0].name;
      const label = raw.length > 18 ? raw.slice(0, 17) + '…' : raw;
      const labelW = label.length * CHAR_W + 8;
      const PAD   = 3;

      // Find the first stagger level with no horizontal overlap
      let level = 0;
      while (true) {
        if (!labelLevels[level]) labelLevels[level] = [];
        const used = labelLevels[level];
        const overlaps = used.some(e => x < e.right + PAD && x + labelW > e.x - PAD);
        if (!overlaps) {
          used.push({ x, right: x + labelW });
          break;
        }
        level++;
        if (level > 6) break;
      }

      const labelY = DOT_Y + DOT_R + 6 + level * LABEL_H;

      // Pill background
      g.append('rect')
        .attr('x', x + 1)
        .attr('y', labelY - LABEL_H / 2 + 1)
        .attr('width', labelW)
        .attr('height', LABEL_H - 2)
        .attr('rx', 3)
        .attr('fill', catColor)
        .attr('opacity', 0.1)
        .attr('pointer-events', 'none');

      g.append('text')
        .attr('x', x + 5)
        .attr('y', labelY)
        .attr('dominant-baseline', 'central')
        .attr('fill', catColor)
        .attr('font-size', 9)
        .attr('font-weight', '500')
        .attr('pointer-events', 'none')
        .text(label);
    }

    // Hover: slightly enlarge dot and brighten line
    g.on('mouseover', function(ev) {
        d3.select(this).select('circle.event-dot').attr('r', dotR + 2);
        d3.select(this).select('line.event-line').attr('opacity', 0.45);
        showEventTooltip(events, ev);
      })
      .on('mouseout', function() {
        d3.select(this).select('circle.event-dot').attr('r', dotR);
        d3.select(this).select('line.event-line').attr('opacity', 0.15);
        hideEventTooltip();
      })
      .on('click', function(e) { e.stopPropagation(); handleEventClick(events); });
  });
}

function setupBrushAndZoom() {
  brushBehavior = d3.brushX()
    .extent([[0, 0], [innerW, innerH]])
    .on('end', onBrushEnd);

  const brushG = chartG.select('.brush-layer').call(brushBehavior);

  zoomBehavior = d3.zoom()
    .scaleExtent([1, 500])
    .translateExtent([[0, 0], [innerW, innerH]])
    .extent([[0, 0], [innerW, innerH]])
    .on('zoom', onZoom);
}

function onBrushEnd(event) {
  if (!event.selection) return;
  const [x0, x1] = event.selection;
  if (x1 - x0 < 4) return;

  const newXScale = xScale.copy();
  const [d0, d1] = [newXScale.invert(x0), newXScale.invert(x1)];

  currentState.dateStart = d0;
  currentState.dateEnd   = d1;

  chartG.select('.brush-layer').call(brushBehavior.move, null);

  showResetZoom();
  renderChart(currentState);
}

function onZoom(event) {
  currentZoomTransform = event.transform;
  const newX = event.transform.rescaleX(xScale);
  const xAxis = d3.axisBottom(newX).ticks(Math.max(4, Math.floor(innerW / 100))).tickSize(4).tickPadding(6);
  chartG.select('.axis-x').call(xAxis)
    .call(g => g.select('.domain').attr('stroke', 'var(--border)'))
    .call(g => g.selectAll('.tick text').attr('fill', 'var(--text-muted)').style('font-family', 'var(--font-ui)').style('font-size', '10px'));
}

function applyCurrentZoom() {
  // no-op: brush-based zoom rewrites state
}

export function resetZoom(state) {
  const allDates = Object.values(currentPriceData).flatMap(s => s.map(d => d.date));
  state.dateStart = new Date(Math.min(...allDates));
  state.dateEnd   = new Date(Math.max(...allDates));
  const si = document.getElementById('date-start');
  const ei = document.getElementById('date-end');
  if (si) si.value = formatDate(state.dateStart);
  if (ei) ei.value = formatDate(state.dateEnd);
  hideResetZoom();
  renderChart(state);
}

function showResetZoom() {
  document.getElementById('reset-zoom-btn')?.classList.add('visible');
}

function hideResetZoom() {
  document.getElementById('reset-zoom-btn')?.classList.remove('visible');
}

function setupMouseInteraction() {
  chartG.select('.interaction-rect')
    .on('mousemove', onMouseMove)
    .on('mouseleave', onMouseLeave)
    .on('click', onChartClick);
}

function onMouseMove(event) {
  const [mx, my] = d3.pointer(event);
  if (mx < 0 || mx > innerW || my < 0 || my > innerH) return;

  chartG.select('.crosshair-v').attr('x1', mx).attr('x2', mx).attr('opacity', 1);
  chartG.select('.crosshair-h').attr('y1', my).attr('y2', my).attr('opacity', 1);

  if (!xScale) return;
  const hoverDate = xScale.invert(mx);
  showCrosshairTooltip(hoverDate, mx, my, event);
}

function onMouseLeave() {
  chartG.select('.crosshair-v').attr('opacity', 0);
  chartG.select('.crosshair-h').attr('opacity', 0);
  hideCrosshairTooltip();
}

function onChartClick(event) {
  const [mx] = d3.pointer(event);
  if (!xScale) return;
  const clickDate = xScale.invert(mx);

  const tolerance = xScale.invert(mx + 5) - clickDate;
  const nearby = (currentEvents || []).filter(e =>
    Math.abs(e.date - clickDate) <= tolerance * 2 &&
    currentState.eventCats.has(e.category)
  );

  if (nearby.length === 0) return;

  // snap to closest date so events from different dates never merge into one group
  const closest = nearby.reduce((best, e) =>
    Math.abs(e.date - clickDate) < Math.abs(best.date - clickDate) ? e : best
  );
  const closestDateStr = formatDate(closest.date);
  const sameDate = nearby.filter(e => formatDate(e.date) === closestDateStr);

  handleEventClick(sameDate);
}

function showCrosshairTooltip(date, mx, my, event) {
  const tt = document.getElementById('crosshair-tooltip');
  if (!tt) return;

  const container = document.getElementById('chart-svg-container');
  const rect = container.getBoundingClientRect();
  const svgRect = document.getElementById('chart-svg').getBoundingClientRect();
  const relX = event.clientX - svgRect.left;
  const relY = event.clientY - svgRect.top;

  let html = `<div class="tt-date">${friendlyDate(date)}</div>`;

  const visibleKeys = [...currentState.commodities].filter(k => !currentState.hiddenSeries.has(k));
  for (const key of visibleKeys) {
    const series = filteredSeriesCache[key];
    if (!series || series.length === 0) continue;
    const closest = series.reduce((best, d) => Math.abs(d.date - date) < Math.abs(best.date - date) ? d : best);
    const color = CONFIG.commodities[key]?.color || '#888';
    const label = CONFIG.commodities[key]?.label || key;
    html += `<div class="tt-row">
      <span class="tt-name"><span class="tt-dot" style="background:${color}"></span>${label}</span>
      <span class="tt-val">${fmtPrice(closest.value)}</span>
    </div>`;
  }

  tt.innerHTML = html;
  tt.classList.add('visible');

  const ttW = 190, ttH = tt.offsetHeight || 120;
  let left = relX + 14;
  let top  = relY - 20;
  if (left + ttW > svgRect.width) left = relX - ttW - 10;
  if (top + ttH > svgRect.height) top = svgRect.height - ttH - 10;
  tt.style.left = left + 'px';
  tt.style.top  = top  + 'px';
}

function hideCrosshairTooltip() {
  const tt = document.getElementById('crosshair-tooltip');
  if (tt) tt.classList.remove('visible');
}

function showEventTooltip(events, mouseEvent) {
  const tt = document.getElementById('event-tooltip');
  if (!tt) return;

  const ev = events[0];
  const catColor = getCatColor(ev.category);
  const extra = events.length > 1 ? `<div style="margin-top:6px;font-size:10px;color:var(--text-muted)">+${events.length - 1} more event${events.length > 2 ? 's' : ''}</div>` : '';

  tt.innerHTML = `
    <div class="et-cat" style="color:${catColor}">${esc(ev.category)}</div>
    <div class="et-name">${esc(ev.name)}</div>
    <div class="et-date">${friendlyDate(ev.date)}</div>
    <div class="et-desc">${esc(ev.desc)}</div>
    ${extra}
  `;
  tt.classList.add('visible');

  const svgRect = document.getElementById('chart-svg').getBoundingClientRect();
  const relX = mouseEvent.clientX - svgRect.left;
  const relY = mouseEvent.clientY - svgRect.top;
  const ttW = 280, ttH = tt.offsetHeight || 100;
  let left = relX + 12;
  let top  = relY - 40;
  if (left + ttW > svgRect.width) left = relX - ttW - 10;
  if (top < 0) top = 10;
  tt.style.left = left + 'px';
  tt.style.top  = top  + 'px';
}

function hideEventTooltip() {
  const tt = document.getElementById('event-tooltip');
  if (tt) tt.classList.remove('visible');
}

function handleEventClick(events) {
  const ev = events[0];

  if (currentState.analysisMode) {
    drawAnalysisOverlay(
      chartG, ev, xScale,
      { main: yScale, vol: yScaleVol },
      filteredSeriesCache,
      currentState.impactWindow,
      innerH
    );
  }

  showEventDetail(events, currentPriceData, currentState.priceField, currentState.impactWindow);

  if (onTableHighlight) onTableHighlight(ev);
}

export function centerChartOnDate(date, state) {
  if (!xScale) return;
  const range = state.dateEnd - state.dateStart;
  const half  = range / 4;
  state.dateStart = new Date(date.getTime() - half);
  state.dateEnd   = new Date(date.getTime() + half);

  const si = document.getElementById('date-start');
  const ei = document.getElementById('date-end');
  if (si) si.value = formatDate(state.dateStart);
  if (ei) ei.value = formatDate(state.dateEnd);

  showResetZoom();
  renderChart(state);
}

// legend was removed from the UI but the export is kept for API compat
export function buildLegend() {}
