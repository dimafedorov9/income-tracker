// Деньги: форматирование, разбор сумм-формул, месяцы начисления.

const NB = ' ';

/** 28772.6 → «28 772,60 ₽» */
export function money(n, { cents = true } = {}) {
  if (n === null || n === undefined || Number.isNaN(+n)) return '—';
  const s = (+n).toLocaleString('ru-RU', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  return s.replace(/\s/g, NB).replace('-', '−') + NB + '₽';
}
/** Округлённо: «28 773 ₽» */
export const money0 = n => money(Math.round(n), { cents: false });

/** Для осей и плиток: «28,8 тыс», «1,25 млн» */
export function moneyShort(n) {
  const a = Math.abs(n), sign = n < 0 ? '−' : '';
  const f = (v, d) => v.toLocaleString('ru-RU', { maximumFractionDigits: d });
  if (a >= 1e6) return sign + f(a / 1e6, a >= 1e7 ? 1 : 2) + NB + 'млн';
  if (a >= 1e3) return sign + f(a / 1e3, a >= 1e5 ? 0 : 1) + NB + 'тыс';
  return sign + f(a, 0);
}

/**
 * Разбор суммы, как в ячейке таблицы: «44128,54+32166,64+2276,27», «=20965.23+83220.21-50600», «1 500*3».
 * Разрешены числа, + − * / и скобки. Возвращает { value, expr } или null.
 */
export function parseAmount(input) {
  let s = String(input || '').trim().replace(/^=/, '').replace(/[\s ]/g, '').replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.').replace(/₽|руб\.?/gi, '');
  if (!s) return null;
  if (!/^[0-9.+\-*/()]+$/.test(s)) return null;
  let i = 0;
  const peek = () => s[i];
  const num = () => {
    const m = s.slice(i).match(/^\d+(?:\.\d+)?|^\.\d+/);
    if (!m) throw 0;
    i += m[0].length; return parseFloat(m[0]);
  };
  const factor = () => {
    if (peek() === '-') { i++; return -factor(); }
    if (peek() === '+') { i++; return factor(); }
    if (peek() === '(') { i++; const v = expr(); if (peek() !== ')') throw 0; i++; return v; }
    return num();
  };
  const term = () => { let v = factor(); while (peek() === '*' || peek() === '/') { const op = s[i++]; const r = factor(); v = op === '*' ? v * r : v / r; } return v; };
  const expr = () => { let v = term(); while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; };
  try {
    const v = expr();
    if (i !== s.length || !Number.isFinite(v)) return null;
    const isFormula = /[+\-*/()]/.test(s.replace(/^-/, ''));
    return { value: Math.round(v * 100) / 100, expr: isFormula ? prettyExpr(s) : '' };
  } catch (e) { return null; }
}

export function prettyExpr(s) {
  return s.replace(/(\d)\.(\d)/g, '$1,$2').replace(/([+\-*/])/g, ' $1 ').replace(/-/g, '−').replace(/\*/g, '×').replace(/\s+/g, ' ').trim()
    .replace(/(\d+)(?=(,\d+)?(\s|$|\)))/g, d => d.replace(/\B(?=(\d{3})+(?!\d))/g, NB));
}

/** Формулу из таблицы («44128.54 + 32166.64») — обратно в вид для поля ввода. */
export const exprToInput = e => String(e || '').replace(/ /g, '').replace(/−/g, '-').replace(/×/g, '*').replace(/\s/g, '');

/* --------------------------- Месяц начисления --------------------------- */

/**
 * source.rule: 'split' — выплаты до cutoff-го числа включительно относятся к прошлому месяцу (остаток),
 * после — к текущему (аванс); 'paydate' — месяц даты выплаты.
 */
export function accrualFor(date, source) {
  const [y, m, d] = date.split('-').map(Number);
  if (source && source.rule === 'split' && d <= (source.cutoff || 15)) {
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}
export function kindFor(date, source) {
  if (!source || source.rule !== 'split') return 'Разовая';
  return +date.slice(8, 10) <= (source.cutoff || 15) ? 'Остаток' : 'Аванс';
}

const MS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const ML = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const monthShort = k => MS[+k.slice(5, 7) - 1];
export const monthLong = k => `${ML[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;
export const monthName = k => ML[+k.slice(5, 7) - 1];
export const monthGen = k => MG[+k.slice(5, 7) - 1];
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export function addMonths(key, n) {
  let [y, m] = key.split('-').map(Number);
  m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}`;
}
export function monthRange(from, to) {
  const out = []; let k = from;
  while (k <= to) { out.push(k); k = addMonths(k, 1); }
  return out;
}
