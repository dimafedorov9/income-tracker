// SVG-графики без библиотек: столбцы по месяцам с разбивкой по источникам, линия, горизонтальные полосы.
import { esc } from './util.js';
import { money, moneyShort, monthShort, monthLong } from './money.js';

function niceTicks(min, max, n = 4) {
  if (min === max) { min = Math.min(0, min); max = max || 1; }
  const span = max - min, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => s >= step0) || mag * 10;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(6));
  return { lo, hi, ticks };
}

/**
 * Столбцы по месяцам. months: [{ key: '2026-01', parts: { id: сумма }, total }]
 * series: [{ id, name, color }] — порядок слоёв снизу вверх. avg — пунктирная линия среднего.
 */
export function monthBars(months, series, { width = 340, height = 190, avg = null, highlight = null } = {}) {
  if (!months.length) return '<p class="muted small">Нет выплат за этот период.</p>';
  const pad = { l: 40, r: 6, t: 10, b: 28 }, W = width - pad.l - pad.r, H = height - pad.t - pad.b;
  const max = Math.max(...months.map(m => m.total), avg || 0);
  const { hi, ticks } = niceTicks(0, max, 4);
  const Y = v => pad.t + H - (v / hi) * H;
  const bw = W / months.length, gap = Math.min(bw * 0.25, 6);
  let s = '';
  for (const t of ticks) s += `<line class="grid" x1="${pad.l}" x2="${width - pad.r}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ax" x="${pad.l - 6}" y="${Y(t) + 4}" text-anchor="end">${moneyShort(t)}</text>`;
  const every = Math.ceil(months.length / 8);
  months.forEach((m, i) => {
    const x = pad.l + i * bw + gap / 2, w = Math.max(bw - gap, 1);
    let y = pad.t + H;
    s += `<g class="mb${m.key === highlight ? ' hi' : ''}" data-i="${i}">`;
    for (const sr of series) {
      const v = m.parts[sr.id] || 0;
      if (!v) continue;
      const h = (v / hi) * H;
      y -= h;
      s += `<rect class="seg c${sr.color}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(h - 0.5, 0.5).toFixed(1)}"/>`;
    }
    s += `<rect class="hit" x="${(pad.l + i * bw).toFixed(1)}" y="${pad.t}" width="${bw.toFixed(1)}" height="${H}"/></g>`;
    const [yy, mm] = m.key.split('-');
    if (i % every === 0 || mm === '01') {
      s += `<text class="ax" x="${(x + w / 2).toFixed(1)}" y="${height - 14}" text-anchor="middle">${monthShort(m.key)}</text>`;
      if (mm === '01' || i === 0) s += `<text class="ax yr" x="${(x + w / 2).toFixed(1)}" y="${height - 2}" text-anchor="middle">${yy}</text>`;
    }
  });
  if (avg) s += `<line class="avg" x1="${pad.l}" x2="${width - pad.r}" y1="${Y(avg)}" y2="${Y(avg)}"/>`;
  const data = months.map(m => ({ k: m.key, t: m.total, p: series.filter(sr => m.parts[sr.id]).map(sr => [sr.name, m.parts[sr.id], sr.color]) }));
  const legend = series.length > 1 ? `<div class="legend">${series.map(sr => `<span class="lg"><i class="sw c${sr.color}"></i>${esc(sr.name)}</span>`).join('')}${avg ? '<span class="lg"><i class="sw avg"></i>Среднее</span>' : ''}</div>` : '';
  return `<div class="chart mchart" data-months='${esc(JSON.stringify(data))}'>
    <svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Доход по месяцам">${s}</svg><div class="tip" hidden></div></div>${legend}`;
}

/** Линия по месяцам: points [{ key, y }] */
export function monthLine(points, { width = 340, height = 170, cls = 'c1' } = {}) {
  if (points.length < 2) return '<p class="muted small">Мало данных для графика.</p>';
  const pad = { l: 44, r: 8, t: 10, b: 24 }, W = width - pad.l - pad.r, H = height - pad.t - pad.b;
  const { lo, hi, ticks } = niceTicks(Math.min(0, ...points.map(p => p.y)), Math.max(...points.map(p => p.y)), 4);
  const X = i => pad.l + (i / (points.length - 1)) * W, Y = v => pad.t + H - ((v - lo) / (hi - lo)) * H;
  let s = '';
  for (const t of ticks) s += `<line class="grid" x1="${pad.l}" x2="${width - pad.r}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ax" x="${pad.l - 6}" y="${Y(t) + 4}" text-anchor="end">${moneyShort(t)}</text>`;
  const every = Math.ceil(points.length / 7);
  points.forEach((p, i) => { if (i % every === 0) s += `<text class="ax" x="${X(i)}" y="${height - 6}" text-anchor="middle">${monthShort(p.key)}${p.key.endsWith('-01') || i === 0 ? ' ' + p.key.slice(2, 4) : ''}</text>`; });
  const line = points.map((p, i) => `${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  s += `<polygon class="area ${cls}" points="${X(0)},${Y(Math.max(lo, 0))} ${line} ${X(points.length - 1)},${Y(Math.max(lo, 0))}"/><polyline class="ln ${cls}" points="${line}"/>`;
  const last = points[points.length - 1];
  s += `<circle class="pt ${cls}" cx="${X(points.length - 1)}" cy="${Y(last.y)}" r="4"/>`;
  const data = points.map((p, i) => ({ x: X(i), k: p.key, v: p.y }));
  return `<div class="chart lchart" data-line='${esc(JSON.stringify(data))}'><svg viewBox="0 0 ${width} ${height}" width="100%" role="img">${s}<line class="cursor" visibility="hidden" y1="${pad.t}" y2="${pad.t + H}"/></svg><div class="tip" hidden></div></div>`;
}

export function bindCharts(root, { hidden = () => false } = {}) {
  const m = v => (hidden() ? '•••' : money(v));
  root.querySelectorAll('.mchart').forEach(el => {
    const data = JSON.parse(el.dataset.months), tip = el.querySelector('.tip'), svg = el.querySelector('svg');
    const show = g => {
      const d = data[+g.dataset.i];
      el.querySelectorAll('.mb.on').forEach(x => x.classList.remove('on')); g.classList.add('on');
      tip.hidden = false;
      tip.innerHTML = `<b>${monthLong(d.k)}: ${m(d.t)}</b>` + d.p.map(([n, v, c]) => `<div><i class="sw c${c}"></i>${esc(n)}: ${m(v)}</div>`).join('');
      const r = svg.getBoundingClientRect(), gr = g.getBoundingClientRect();
      tip.style.left = Math.min(Math.max(gr.left - r.left + gr.width / 2 - 85, 0), r.width - 170) + 'px';
    };
    el.querySelectorAll('.mb').forEach(g => { g.addEventListener('pointerenter', () => show(g)); g.addEventListener('pointerdown', () => show(g)); });
    el.addEventListener('pointerleave', () => { tip.hidden = true; el.querySelectorAll('.mb.on').forEach(x => x.classList.remove('on')); });
  });
  root.querySelectorAll('.lchart').forEach(el => {
    const pts = JSON.parse(el.dataset.line), svg = el.querySelector('svg'), tip = el.querySelector('.tip'), cur = el.querySelector('.cursor');
    const show = ev => {
      const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, x = ((ev.clientX - r.left) / r.width) * vb.width;
      const p = pts.reduce((b, q) => (Math.abs(q.x - x) < Math.abs(b.x - x) ? q : b));
      cur.setAttribute('x1', p.x); cur.setAttribute('x2', p.x); cur.setAttribute('visibility', 'visible');
      tip.hidden = false; tip.innerHTML = `<b>${monthLong(p.k)}</b><div>${m(p.v)}</div>`;
      tip.style.left = Math.min(Math.max((p.x / vb.width) * r.width - 70, 0), r.width - 150) + 'px';
    };
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointermove', e => (e.buttons || e.pointerType === 'mouse' ? show(e) : null));
    svg.addEventListener('pointerleave', () => { tip.hidden = true; cur.setAttribute('visibility', 'hidden'); });
  });
}

/** Горизонтальные полосы: [{ label, value, color, sub }] */
export function hbars(rows, { fmtV = money } = {}) {
  if (!rows.length) return '<p class="muted small">Нет данных.</p>';
  const max = Math.max(...rows.map(r => r.value)) || 1;
  return `<div class="hbars">${rows.map(r => `<div class="hb"><span class="hb-l">${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>
    <span class="hb-t"><span class="hb-f c${r.color || 1}" style="width:${Math.max((r.value / max) * 100, 0.5)}%"></span></span>
    <span class="hb-v amt">${fmtV(r.value)}</span></div>`).join('')}</div>`;
}

/** Полоса долей (100%): [{ name, value, color }] */
export function shareBar(rows) {
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  return `<div class="share" role="img" aria-label="Доли источников">${rows.map(r => `<span class="c${r.color}" style="width:${(r.value / total) * 100}%" title="${esc(r.name)}: ${Math.round((r.value / total) * 100)}%"></span>`).join('')}</div>`;
}
