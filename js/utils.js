export const CONFIG = {
  commodities: {
    CL_F: { label: 'WTI Crude',   color: '#ed7d31' },
    BZ_F: { label: 'Brent Crude', color: '#4472c4' },
    HO_F: { label: 'Heating Oil', color: '#70ad47' },
    RB_F: { label: 'RBOB Gas',    color: '#ffc000' },
    NG_F: { label: 'Natural Gas', color: '#5b9bd5' },
  },
  categories: {
    'Economy':                  { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    'Geopolitics':              { color: '#e53e3e', bg: 'rgba(229,62,62,0.12)'  },
    'Market':                   { color: '#38a169', bg: 'rgba(56,161,105,0.12)' },
    'Environment & Infrastructure': { color: '#6b46c1', bg: 'rgba(107,70,193,0.12)' },
  },
  defaultCategoryColor: '#9ca3af',
  windowOptions: [3, 7, 14, 30],
  maOptions:     [30, 90],
  priceFields:   ['close', 'open', 'high', 'low'],
};

// YYYY-MM-DD
export function formatDate(d) {
  if (!d) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fmtPrice(v, decimals = 2) {
  if (v == null || isNaN(v)) return '–';
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtPct(v) {
  if (v == null || isNaN(v)) return '–';
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function getCatColor(category) {
  return (CONFIG.categories[category] || {}).color || CONFIG.defaultCategoryColor;
}

export function getCatBg(category) {
  return (CONFIG.categories[category] || {}).bg || 'rgba(136,153,170,0.15)';
}

export function friendlyDate(d) {
  if (!d) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function addDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}

export function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

// basic XSS escape via DOM
export function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
