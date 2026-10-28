// Мелкие помощники: DOM, форматирование, даты.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Число в русском формате: 27.5 → «27,5», без лишних нулей. */
export function fmt(n, digits = 1) {
  if (n === null || n === undefined || n === '' || Number.isNaN(+n)) return '—';
  const v = Math.round(+n * 10 ** digits) / 10 ** digits;
  return v.toLocaleString('ru-RU', { maximumFractionDigits: digits });
}

/** Тоннаж: до 10 т в кг, дальше в тоннах. */
export function fmtMass(kg) {
  if (!kg) return '0 кг';
  if (kg >= 10000) return fmt(kg / 1000, 1) + ' т';
  return Math.round(kg).toLocaleString('ru-RU') + ' кг';
}

export function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export const todayISO = () => toISO(new Date());
export function toISO(d) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function parseISO(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
export const fmtDate = s => { const d = parseISO(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
export const fmtDateLong = s => { const d = parseISO(s); return `${d.getDate()} ${MONTHS_FULL[d.getMonth()]}, ${WD[d.getDay()]}`; };
export const fmtDateShort = s => { const d = parseISO(s); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; };

/** ISO-неделя как ключ «2026-W38». */
export function weekKey(s) {
  const d = parseISO(s);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
}
/** Понедельник недели для даты. */
export function mondayOf(s) {
  const d = parseISO(s); const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day); return toISO(d);
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export const uid = (p = 'id') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function fmtDuration(min) {
  if (!min) return '—';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} ч ${m} мин` : `${m} мин`;
}

export function storage(key, val) {
  try {
    if (val === undefined) { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; }
    if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val));
  } catch (e) { return null; }
}

let toastTimer;
export function toast(msg, kind = '') {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.className = 'show ' + kind;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.className = ''), 2600);
}

export function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }

export function linreg(xs, ys) {
  const n = xs.length; if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  if (!sxx) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r2: syy ? (sxy * sxy) / (sxx * syy) : 0 };
}
