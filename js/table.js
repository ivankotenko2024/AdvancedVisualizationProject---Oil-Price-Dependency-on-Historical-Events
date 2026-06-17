import { CONFIG, getCatColor, getCatBg, friendlyDate, esc } from './utils.js';

let allEvents = [];
let currentSort = { col: 'date', dir: 'asc' };
let currentSearch = '';
let currentCatFilter = null;
let onRowClick = null;

export function initTable(events, rowClickFn) {
  allEvents  = events;
  onRowClick = rowClickFn;

  buildCatFilterButtons();
  setupSearch();
  setupSortHeaders();
  renderTable();
}

export function renderTable(search, catFilter, sortState) {
  if (search    !== undefined) currentSearch    = search;
  if (catFilter !== undefined) currentCatFilter = catFilter;
  if (sortState !== undefined) currentSort      = sortState;

  const filtered = filterEvents();
  const sorted   = sortEvents(filtered);

  const tbody = document.querySelector('#events-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted)">No events match the current filters</td></tr>`;
    updateCount(0);
    return;
  }

  for (const ev of sorted) {
    const tr = document.createElement('tr');
    tr.dataset.date = ev.date.toISOString();
    tr.innerHTML = buildRow(ev);
    tr.addEventListener('click', () => handleRowClick(ev, tr));
    tbody.appendChild(tr);
  }

  updateCount(sorted.length);
}

function buildRow(ev) {
  const catColor = getCatColor(ev.category);
  const catBg    = getCatBg(ev.category);
  return `
    <td class="td-date">${friendlyDate(ev.date)}</td>
    <td class="td-cat">
      <span class="cat-badge" style="color:${catColor};background:${catBg}">${esc(ev.category)}</span>
    </td>
    <td class="td-event-name">${esc(ev.name)}</td>
    <td class="td-description">${esc(ev.desc)}</td>
  `;
}

function filterEvents() {
  return allEvents.filter(ev => {
    if (currentCatFilter && ev.category !== currentCatFilter) return false;
    if (currentSearch) {
      const q = currentSearch.toLowerCase();
      return ev.name.toLowerCase().includes(q) ||
             ev.desc.toLowerCase().includes(q) ||
             ev.category.toLowerCase().includes(q) ||
             friendlyDate(ev.date).toLowerCase().includes(q);
    }
    return true;
  });
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    let va, vb;
    switch (currentSort.col) {
      case 'date':     va = a.date;     vb = b.date;     break;
      case 'category': va = a.category; vb = b.category; break;
      case 'name':     va = a.name;     vb = b.name;     break;
      case 'desc':     va = a.desc;     vb = b.desc;     break;
      default: return 0;
    }
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return currentSort.dir === 'asc' ? cmp : -cmp;
  });
}

function handleRowClick(ev, tr) {
  document.querySelectorAll('#events-table tbody tr').forEach(r => r.classList.remove('highlighted'));
  tr.classList.add('highlighted');

  if (onRowClick) onRowClick(ev);
}

export function highlightTableRow(event) {
  const tbody = document.querySelector('#events-table tbody');
  if (!tbody) return;

  const rows = tbody.querySelectorAll('tr');
  rows.forEach(r => r.classList.remove('highlighted'));

  for (const row of rows) {
    const rowDate = row.dataset.date;
    if (rowDate && Math.abs(new Date(rowDate) - event.date) < 86400000) {
      row.classList.add('highlighted');
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      break;
    }
  }
}

function updateCount(n) {
  const el = document.getElementById('table-count');
  if (el) el.textContent = `${n} event${n !== 1 ? 's' : ''}`;
}

function buildCatFilterButtons() {
  const container = document.querySelector('.table-cat-filter');
  if (!container) return;
  container.innerHTML = '';

  const allColor = '#6b7280';
  const allBg    = 'rgba(107,114,128,0.1)';
  const buttons  = [];

  function applyActive(btn) {
    btn.style.background = btn.dataset.color;
    btn.style.color      = '#fff';
    btn.style.borderColor = btn.dataset.color;
  }

  function applyInactive(btn) {
    btn.style.background  = btn.dataset.bg;
    btn.style.color       = btn.dataset.color;
    btn.style.borderColor = btn.dataset.color;
  }

  function makeBtn(label, cat, color, bg) {
    const btn = document.createElement('button');
    btn.className      = 'tbl-cat-btn';
    btn.textContent    = label;
    btn.dataset.color  = color;
    btn.dataset.bg     = bg;
    btn.dataset.cat    = cat || '';
    applyInactive(btn);
    btn.addEventListener('click', () => {
      currentCatFilter = cat;
      buttons.forEach(applyInactive);
      applyActive(btn);
      renderTable();
    });
    container.appendChild(btn);
    buttons.push(btn);
    return btn;
  }

  const allBtn = makeBtn('All', null, allColor, allBg);
  applyActive(allBtn); // initially active

  for (const [cat, cfg] of Object.entries(CONFIG.categories)) {
    const label = cat === 'Environment & Infrastructure' ? 'Environment' : cat;
    makeBtn(label, cat, cfg.color, cfg.bg);
  }
}


function setupSearch() {
  const input = document.getElementById('table-search');
  if (!input) return;
  input.addEventListener('input', () => {
    currentSearch = input.value.trim();
    renderTable();
  });
}


function setupSortHeaders() {
  const headers = document.querySelectorAll('#events-table th[data-col]');
  headers.forEach(th => {
    th.innerHTML += '<span class="sort-arrow"></span>';
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (currentSort.col === col) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort.col = col;
        currentSort.dir = 'asc';
      }
      headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
      th.classList.add(currentSort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
      renderTable();
    });
  });
  const defaultTh = document.querySelector('#events-table th[data-col="date"]');
  if (defaultTh) defaultTh.classList.add('sort-asc');
}
