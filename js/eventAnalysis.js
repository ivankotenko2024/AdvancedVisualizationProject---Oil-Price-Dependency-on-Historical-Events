import { CONFIG, fmtPrice, fmtPct, getCatColor, getCatBg, friendlyDate, addDays, esc } from './utils.js';
import { getEventImpact } from './dataLoader.js';

// events can be a single event or array (multiple on same date)
export function showEventDetail(events, priceData, field, windowDays) {
  const card = document.getElementById('event-detail-card');
  if (!card) return;

  const arr    = Array.isArray(events) ? events : [events];
  const first  = arr[0];
  const impact = getEventImpact(priceData, first.date, field, windowDays);
  const multi  = arr.length > 1;

  // header varies: single event vs. multiple on same date
  let headerHTML;
  if (!multi) {
    const catColor = getCatColor(first.category);
    headerHTML = `
      <div class="edc-header">
        <div>
          <div class="edc-cat" style="color:${catColor}">${esc(first.category)}</div>
          <div class="edc-name">${esc(first.name)}</div>
        </div>
        <button class="edc-close" id="edc-close-btn">✕</button>
      </div>
      <div class="edc-body">
        <div class="edc-date">${friendlyDate(first.date)}</div>
        <div class="edc-desc">${esc(first.desc)}</div>`;
  } else {
    const eventsHTML = arr.map((ev, i) => {
      const catColor = getCatColor(ev.category);
      return `
        ${i > 0 ? '<div class="edc-event-divider"></div>' : ''}
        <div class="edc-event-item">
          <div class="edc-cat" style="color:${catColor}">${esc(ev.category)}</div>
          <div class="edc-name">${esc(ev.name)}</div>
          <div class="edc-desc" style="margin-top:3px">${esc(ev.desc)}</div>
        </div>`;
    }).join('');

    headerHTML = `
      <div class="edc-header">
        <div>
          <div class="edc-cat" style="color:var(--text-muted)">${arr.length} Events · ${friendlyDate(first.date)}</div>
        </div>
        <button class="edc-close" id="edc-close-btn">✕</button>
      </div>
      <div class="edc-body">
        <div class="edc-events-list">${eventsHTML}</div>`;
  }

  // price impact table — same date applies to all events in the group
  const priceHTML = `
      <div class="edc-prices-title" style="margin-top:10px">Price Impact (±${windowDays}d)</div>
      <div class="edc-price-header">
        <span>Commodity</span>
        <span style="text-align:right">Before</span>
        <span style="text-align:right">After</span>
        <span style="text-align:right">Δ%</span>
      </div>
      ${Object.entries(CONFIG.commodities).map(([key, cfg]) => {
        const imp = impact[key];
        if (!imp || imp.before == null) return '';
        const pct = imp.changePct;
        const cls = pct == null ? '' : pct >= 0 ? 'change-pos' : 'change-neg';
        return `
          <div class="edc-price-row">
            <span class="commodity-name" style="color:${cfg.color}">${cfg.label}</span>
            <span class="price-val">${fmtPrice(imp.before)}</span>
            <span class="price-val">${fmtPrice(imp.after)}</span>
            <span class="change-val ${cls}">${fmtPct(pct)}</span>
          </div>`;
      }).join('')}
    </div>`;

  card.innerHTML = headerHTML + priceHTML;
  card.classList.add('visible');

  document.getElementById('edc-close-btn').addEventListener('click', () => {
    card.classList.remove('visible');
  });
}

export function hideEventDetail() {
  const card = document.getElementById('event-detail-card');
  if (card) card.classList.remove('visible');
}

export function drawAnalysisOverlay(svg, event, xScale, yScales, filteredSeries, windowDays, chartHeight) {
  svg.selectAll('.analysis-overlay').remove();

  if (!event) return;

  const et    = event.date;
  const wBefore = addDays(et, -windowDays);
  const wAfter  = addDays(et,  windowDays);

  const x0 = xScale(wBefore);
  const x1 = xScale(et);
  const x2 = xScale(wAfter);

  const overlay = svg.append('g').attr('class', 'analysis-overlay').style('pointer-events', 'none');

  // before shade
  overlay.append('rect')
    .attr('x', Math.max(0, x0))
    .attr('y', 0)
    .attr('width', Math.max(0, x1 - Math.max(0, x0)))
    .attr('height', chartHeight)
    .attr('fill', 'rgba(239,68,68,0.06)')
    .attr('stroke', 'none');

  // after shade
  overlay.append('rect')
    .attr('x', x1)
    .attr('y', 0)
    .attr('width', Math.max(0, x2 - x1))
    .attr('height', chartHeight)
    .attr('fill', 'rgba(52,211,153,0.06)')
    .attr('stroke', 'none');

  // center line at event date
  overlay.append('line')
    .attr('x1', x1).attr('x2', x1)
    .attr('y1', 0).attr('y2', chartHeight)
    .attr('stroke', '#e2e8f0').attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '6,4');

  // window boundary lines
  [x0, x2].forEach((x, i) => {
    if (x < 0) return;
    overlay.append('line')
      .attr('x1', x).attr('x2', x)
      .attr('y1', 0).attr('y2', chartHeight)
      .attr('stroke', i === 0 ? '#ef4444' : '#34d399')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,4')
      .attr('opacity', 0.6);
  });

  const labelY = 14;
  if (x0 >= 0 && x1 >= 0) {
    overlay.append('text')
      .attr('x', (x0 + x1) / 2).attr('y', labelY)
      .attr('text-anchor', 'middle')
      .attr('fill', '#ef4444')
      .attr('font-size', 10)
      .text('BEFORE');
  }

  overlay.append('text')
    .attr('x', x1).attr('y', chartHeight - 6)
    .attr('text-anchor', 'middle')
    .attr('fill', '#e2e8f0')
    .attr('font-size', 10)
    .text(event.name.length > 20 ? event.name.slice(0, 20) + '…' : event.name);

  if (x2 <= xScale.range()[1]) {
    overlay.append('text')
      .attr('x', (x1 + x2) / 2).attr('y', labelY)
      .attr('text-anchor', 'middle')
      .attr('fill', '#34d399')
      .attr('font-size', 10)
      .text('AFTER');
  }
}
