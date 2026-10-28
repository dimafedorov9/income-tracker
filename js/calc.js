// Аналитика доходов. Все суммы считаются по месяцу начисления (как в исходной таблице), а не по дате выплаты.
import { state, sourceById } from './store.js';
import { addMonths, monthRange, money0, monthLong, monthName, cap } from './money.js';
import { todayISO, parseISO, toISO, daysBetween, plural } from './util.js';

const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const currentMonth = () => todayISO().slice(0, 7);

/** Фильтр периода: 'all' | '12m' | 'YYYY'. Последние 12 месяцев — включая текущий. */
export function periodRange(period) {
  const ks = state.payments.map(p => p.accrual).sort();
  const first = ks[0] || currentMonth(), last = ks[ks.length - 1] || currentMonth(), cur = currentMonth();
  if (period === '12m') return [addMonths(cur, -11), cur > last ? cur : last];
  if (/^\d{4}$/.test(period)) return [`${period}-01`, `${period}-12`];
  return [first, last > cur ? last : cur];
}
export const periodLabel = p => (p === 'all' ? 'за всё время' : p === '12m' ? 'за 12 месяцев' : `за ${p} год`);

export function inRange(p, [a, b]) { return p.accrual >= a && p.accrual <= b; }

/** Сумма по месяцам начисления: [{ key, parts: { source_id: сумма }, total, count }] — только непустые месяцы, если fill=false. */
export function byMonth(range, { fill = true, filter = () => true } = {}) {
  const m = new Map();
  for (const p of state.payments) {
    if (!inRange(p, range) || !filter(p)) continue;
    const r = m.get(p.accrual) || { key: p.accrual, parts: {}, total: 0, count: 0 };
    r.parts[p.source_id] = (r.parts[p.source_id] || 0) + p.amount; r.total += p.amount; r.count++;
    m.set(p.accrual, r);
  }
  if (!fill) return [...m.values()].sort((a, b) => a.key.localeCompare(b.key));
  const keys = [...m.keys()].sort();
  if (!keys.length) return [];
  const end = range[1] < currentMonth() ? range[1] : (keys[keys.length - 1] > currentMonth() ? keys[keys.length - 1] : currentMonth());
  return monthRange(keys[0] > range[0] ? keys[0] : range[0], end).map(k => m.get(k) || { key: k, parts: {}, total: 0, count: 0 });
}

/** Сводка за период — те же показатели, что на листе «Сводка» исходной таблицы, плюс разбивки. */
export function summary(period) {
  const range = periodRange(period);
  const months = byMonth(range, { fill: false });
  const cur = currentMonth();
  // текущий незакрытый месяц не участвует в «лучшем/худшем» и в среднем
  const closed = months.filter(m => m.key < cur && m.total > 0);
  const total = months.reduce((a, m) => a + m.total, 0);
  const totalClosed = closed.reduce((a, m) => a + m.total, 0);
  const best = closed.reduce((b, m) => (!b || m.total > b.total ? m : b), null);
  const worst = closed.reduce((b, m) => (!b || m.total < b.total ? m : b), null);
  const bySrc = new Map(), byCat = new Map();
  for (const p of state.payments) {
    if (!inRange(p, range)) continue;
    bySrc.set(p.source_id, (bySrc.get(p.source_id) || 0) + p.amount);
    const ck = p.source_id + '|' + p.category;
    byCat.set(ck, (byCat.get(ck) || 0) + p.amount);
  }
  const sources = [...bySrc].map(([id, sum]) => {
    const s = sourceById(id) || { id, name: id, color: 8, kind: 'other' };
    const act = months.filter(m => m.parts[id]).length;
    return { id, name: s.name, color: s.color, kind: s.kind, sum, share: total ? sum / total : 0, perMonth: act ? sum / act : 0, months: act };
  }).sort((a, b) => b.sum - a.sum);
  const categories = [...byCat].map(([k, sum]) => { const [sid, cat] = k.split('|'); const s = sourceById(sid); return { sid, cat, src: s?.name || sid, color: s?.color || 8, sum }; })
    .sort((a, b) => b.sum - a.sum);
  const byKind = { job: 0, side: 0, other: 0 };
  for (const s of sources) byKind[s.kind in byKind ? s.kind : 'other'] += s.sum;
  return {
    range, months, total, activeMonths: months.filter(m => m.total > 0).length,
    avgMonth: closed.length ? totalClosed / closed.length : (months.length ? total / months.length : 0),
    best, worst, sources, categories, byKind, count: months.reduce((a, m) => a + m.count, 0)
  };
}

/** По годам: итог, активные месяцы, среднее, лучший и худший месяц, изменение к прошлому году. */
export function byYear() {
  const years = new Map();
  for (const m of byMonth(periodRange('all'), { fill: false })) {
    const y = m.key.slice(0, 4), r = years.get(y) || { year: y, total: 0, months: [], parts: {} };
    r.total += m.total; r.months.push(m);
    for (const [id, v] of Object.entries(m.parts)) r.parts[id] = (r.parts[id] || 0) + v;
    years.set(y, r);
  }
  const cur = currentMonth();
  const list = [...years.values()].sort((a, b) => a.year.localeCompare(b.year));
  list.forEach((r, i) => {
    const closed = r.months.filter(m => m.key < cur && m.total > 0);
    r.active = r.months.filter(m => m.total > 0).length;
    r.avg = closed.length ? closed.reduce((a, m) => a + m.total, 0) / closed.length : r.total / Math.max(r.active, 1);
    r.best = closed.reduce((b, m) => (!b || m.total > b.total ? m : b), null);
    r.worst = closed.reduce((b, m) => (!b || m.total < b.total ? m : b), null);
    const prev = list[i - 1];
    r.yoyAvg = prev && prev.avg ? r.avg / prev.avg - 1 : null;
  });
  return list;
}

/** Доход за 12 месяцев, заканчивающихся каждым месяцем (скользящий год) — сглаженный тренд. */
export function rolling12() {
  const ms = byMonth(periodRange('all'));
  const cur = currentMonth();
  const closed = ms.filter(m => m.key < cur);
  const out = [];
  for (let i = 11; i < closed.length; i++) out.push({ key: closed[i].key, y: closed.slice(i - 11, i + 1).reduce((a, m) => a + m.total, 0) });
  return out;
}

export function cumulative(range) {
  let acc = 0;
  return byMonth(range).map(m => ({ key: m.key, y: (acc += m.total) }));
}

/* ======================= Ожидаемые выплаты ======================= */

/**
 * По истории каждого источника с правилом «аванс/остаток» находит типичные числа выплат и суммы
 * (медиана за последние 6 месяцев) и строит ближайшие ожидаемые выплаты. Статус: получено / задерживается / ожидается.
 */
export function expected() {
  const today = todayISO(), out = [];
  const from = toISO(new Date(parseISO(today) - 180 * 86400000));
  for (const s of state.sources.filter(x => !x.archived && x.rule === 'split')) {
    const recent = state.payments.filter(p => p.source_id === s.id && p.date >= from);
    if (recent.length < 4) continue;
    for (const half of ['Остаток', 'Аванс']) {
      const ps = recent.filter(p => (+p.date.slice(8, 10) <= s.cutoff) === (half === 'Остаток'));
      if (ps.length < 2) continue;
      const day = Math.round(median(ps.map(p => +p.date.slice(8, 10))));
      const amt = median(ps.slice(-3).map(p => p.amount));
      for (const off of [-1, 0, 1]) {
        const base = parseISO(today); base.setDate(1); base.setMonth(base.getMonth() + off);
        const last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
        const d = toISO(new Date(base.getFullYear(), base.getMonth(), Math.min(day, last)));
        const lo = toISO(new Date(parseISO(d) - 6 * 86400000)), hi = toISO(new Date(+parseISO(d) + 6 * 86400000));
        const got = state.payments.find(p => p.source_id === s.id && p.date >= lo && p.date <= hi && (+p.date.slice(8, 10) <= s.cutoff) === (half === 'Остаток'));
        const diff = daysBetween(today, d);
        if (diff < -10 || diff > 35) continue;
        const status = got ? 'received' : diff < -2 ? 'late' : 'upcoming';
        if (status === 'received' && diff < -7) continue;
        out.push({ source: s, half, date: d, amount: amt, status, got, diff });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ======================== Нетипичные выплаты ======================== */

/** Выплаты «Зарплата» больше чем в 1,8 раза от медианы этого источника и половины месяца за год до неё. */
export function unusual(limit = 5) {
  const out = [];
  for (const p of state.payments) {
    if (p.category !== 'Зарплата') continue;
    const s = sourceById(p.source_id);
    if (!s || s.rule !== 'split') continue;
    const yearAgo = toISO(new Date(parseISO(p.date) - 365 * 86400000));
    const same = state.payments.filter(q => q !== p && q.source_id === p.source_id && q.category === 'Зарплата' && q.date >= yearAgo && q.date <= p.date && q.kind === p.kind);
    if (same.length < 4) continue;
    const med = median(same.map(q => q.amount));
    if (p.amount > med * 1.8 && p.amount - med > 15000) out.push({ p, med, ratio: p.amount / med });
  }
  return out.slice(-limit).reverse();
}

/* ============================== Выводы ============================== */

export function insights() {
  const out = [], cur = currentMonth();
  const all = byMonth(periodRange('all'));
  const closed = all.filter(m => m.key < cur);
  if (!closed.length) return out;
  const last12 = closed.slice(-12), prev12 = closed.slice(-24, -12);
  const avg12 = last12.reduce((a, m) => a + m.total, 0) / last12.length;
  const lastM = closed[closed.length - 1];
  if (lastM && avg12) {
    const d = lastM.total / avg12 - 1;
    out.push({ tone: d >= 0 ? 'good' : 'warn', text: `${cap(monthLong(lastM.key))}: ${money0(lastM.total)} — ${d >= 0 ? 'на ' + Math.round(d * 100) + '% выше' : 'на ' + Math.round(-d * 100) + '% ниже'} среднего за 12 месяцев (${money0(avg12)}).` });
  }
  if (prev12.length === 12) {
    const a = last12.reduce((s, m) => s + m.total, 0), b = prev12.reduce((s, m) => s + m.total, 0);
    if (b) out.push({ tone: a >= b ? 'good' : 'warn', text: `${cap(monthName(last12[0].key))} ${last12[0].key.slice(0, 4)} — ${monthName(lastM.key)} ${lastM.key.slice(0, 4)}: ${money0(a)}, это ${a >= b ? '+' : '−'}${Math.abs(Math.round((a / b - 1) * 100))}% к тем же 12 месяцам годом раньше (${money0(b)}).` });
  }
  const y = cur.slice(0, 4), py = String(+y - 1);
  const ytd = all.filter(m => m.key.startsWith(y) && m.key < cur), pytd = all.filter(m => m.key.startsWith(py) && m.key.slice(5) < cur.slice(5));
  if (ytd.length && pytd.some(m => m.total)) {
    const a = ytd.reduce((s, m) => s + m.total, 0), b = pytd.reduce((s, m) => s + m.total, 0);
    const span = ytd.length > 1 ? `январь — ${monthName(addMonths(cur, -1))}` : 'январь';
    out.push({ tone: a >= b ? 'good' : 'warn', text: `${cap(span)} ${y}: ${money0(a)}; за те же месяцы ${py} года было ${money0(b)} (${a >= b ? '+' : '−'}${Math.abs(Math.round((a / b - 1) * 100))}%).` });
  }
  const sm = summary(y);
  if (sm.sources.length > 1) {
    const top = sm.sources[0];
    out.push({ tone: 'info', text: `В ${y} году больше всего приносит ${top.name}: ${Math.round(top.share * 100)}% дохода, в среднем ${money0(top.perMonth)} в месяц.` });
  }
  if (sm.byKind.side > 0) {
    const n = state.payments.filter(p => p.accrual.startsWith(y) && sourceById(p.source_id)?.kind === 'side').length;
    out.push({ tone: 'good', text: `Подработки в ${y} году: ${money0(sm.byKind.side)} за ${n} ${plural(n, 'выплату', 'выплаты', 'выплат')} — ${Math.round((sm.byKind.side / sm.total) * 100)}% дохода.` });
  }
  for (const e of expected().filter(x => x.status === 'late')) {
    out.push({ tone: 'warn', text: `${e.source.name}: ${e.half === 'Аванс' ? 'аванс' : 'остаток'} обычно приходит около ${+e.date.slice(8, 10)}-го, прошло ${-e.diff} ${plural(-e.diff, 'день', 'дня', 'дней')} — выплаты пока нет.` });
  }
  return out;
}
