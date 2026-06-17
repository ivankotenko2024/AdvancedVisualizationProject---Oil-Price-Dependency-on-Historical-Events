import { loadData } from './dataLoader.js';
import { initFilters, state, onChange } from './filters.js';
import { initChart, renderChart, centerChartOnDate, resetZoom } from './chart.js';
import { initTable, renderTable, highlightTableRow } from './table.js';

async function bootstrap() {
  showLoading(true);

  try {
    const { priceData, events } = await loadData();
    
    initFilters(priceData, events);
    
    initChart(priceData, events, state, (event) => {
      // chart marker click → sync table
      highlightTableRow(event);
    });

    initTable(events, (event) => {
      centerChartOnDate(event.date, state);
    });

    onChange((newState) => {
      renderChart(newState);
      updateTableWithChartFilter(events, newState);
    });

    document.getElementById('reset-zoom-btn')?.addEventListener('click', () => {
      resetZoom(state);
    });

    initResizers();
    showLoading(false);
  } catch (err) {
    console.error('Dashboard initialization error:', err);
    document.getElementById('loading').innerHTML = `
      <div style="color:var(--danger);text-align:center;padding:24px">
        <div style="font-size:16px;font-weight:600;margin-bottom:8px">Failed to load data</div>
        <div style="font-size:12px;color:var(--text-muted)">${err.message}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:8px">
          Make sure you're serving the project with a local server (e.g. Live Server).<br>
          CSV files must be in the <code>data/</code> directory.
        </div>
      </div>
    `;
  }
}

function updateTableWithChartFilter(events, state) {
  renderTable(state.tableSearch, state.tableCatFilter);
}

function showLoading(show) {
  const overlay = document.getElementById('loading');
  if (!overlay) return;
  if (show) {
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
    setTimeout(() => { overlay.style.display = 'none'; }, 450);
  }
}

function initResizers() {
  // vertical: chart ↔ table
  const vResizer    = document.getElementById('v-resizer');
  const tableSection = document.getElementById('table-section');
  const rightCol    = document.getElementById('right-col');

  if (vResizer && tableSection && rightCol) {
    let vDrag = false, startY = 0, startH = 0;

    vResizer.addEventListener('mousedown', e => {
      vDrag  = true;
      startY = e.clientY;
      startH = tableSection.getBoundingClientRect().height;
      vResizer.classList.add('dragging');
      document.body.style.cursor     = 'ns-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!vDrag) return;
      const delta  = startY - e.clientY;
      const rcH    = rightCol.getBoundingClientRect().height;
      const newH   = Math.min(Math.max(startH + delta, 120), rcH * 0.75);
      tableSection.style.flex = `0 0 ${newH}px`;
    });

    document.addEventListener('mouseup', () => {
      if (!vDrag) return;
      vDrag = false;
      vResizer.classList.remove('dragging');
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
    });
  }

  // horizontal: sidebar ↔ chart
  const hResizer  = document.getElementById('h-resizer');
  const leftPanel = document.getElementById('left-panel');
  const main      = document.getElementById('main');

  if (hResizer && leftPanel && main) {
    let hDrag = false;

    hResizer.addEventListener('mousedown', e => {
      hDrag = true;
      hResizer.classList.add('dragging');
      document.body.style.cursor     = 'ew-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!hDrag) return;
      const mainRect = main.getBoundingClientRect();
      const newW = Math.min(Math.max(e.clientX - mainRect.left, 160), 480);
      leftPanel.style.width = newW + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (!hDrag) return;
      hDrag = false;
      hResizer.classList.remove('dragging');
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
    });
  }
}

bootstrap();
