// Журнал доходов: экраны и навигация.
import { $, esc, uid, todayISO, toISO, parseISO, plural, toast, storage, daysBetween } from './util.js';
import { call, getConfig, setConfig, isConfigured, resetDemo, K } from './api.js';
import { state, loadCache, refresh, onChange, pendingCount, flushQueue, savePayments, deletePayments, saveSources, sourceById, activeSources, catsOf, pref, setPref } from './store.js';
import { money, money0, moneyShort, parseAmount, prettyExpr, exprToInput, accrualFor, kindFor, monthLong, monthName, monthShort, cap, addMonths } from './money.js';
import { summary, byYear, byMonth, periodRange, periodLabel, rolling12, cumulative, expected, unusual, insights, currentMonth } from './calc.js';
import { monthBars, monthLine, bindCharts, hbars, shareBar } from './charts.js';
import { sheet, confirmSheet, promptSheet, closeSheet } from './ui.js';
import { guard, lockEnabled, lockSupported, pinScreen, setPin, clearPin } from './lock.js';

const main = $('#main');
const nav = h => (location.hash = h);

/* ---------------- Суммы: скрытие по кнопке «глаз» ---------------- */
const hidden = () => pref('hide', false);
const M = n => (hidden() ? '•••' : money(n));
const M0 = n => (hidden() ? '•••' : money0(n));
const MS = n => (hidden() ? '•••' : moneyShort(n) + (Math.abs(n) >= 1000 ? '' : ' ₽'));
const showExpr = e => (e ? prettyExpr(exprToInput(e)) : '');

const KIND_LABEL = { job: 'Основная работа', side: 'Подработка', other: 'Прочее' };
const fmtD = iso => { const d = parseISO(iso); return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); };
const fmtDY = iso => { const d = parseISO(iso); return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); };
const fmtDS = iso => iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4);

/* ================================ Роутер ================================ */

const routes = [
  [/^#\/?$/, home], [/^#\/payments$/, payments], [/^#\/add$/, () => form()], [/^#\/edit\/(.+)$/, id => form(id)],
  [/^#\/stats$/, stats], [/^#\/month\/(\d{4}-\d{2})$/, monthView], [/^#\/sources$/, sources], [/^#\/source\/(.+)$/, sourceView],
  [/^#\/settings$/, settings], [/^#\/setup$/, setup]
];

function route() {
  const h = location.hash || '#/';
  if (!isConfigured() && h !== '#/setup') return nav('#/setup');
  closeSheet();
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (!m) continue;
    const tab = h.split('/')[1] || 'home';
    document.body.dataset.view = tab;
    document.querySelectorAll('.tabbar a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === tab ? 'page' : 'false'));
    fn(...m.slice(1).map(x => x && decodeURIComponent(x)));
    window.scrollTo(0, 0);
    return;
  }
  nav('#/');
}
window.addEventListener('hashchange', route);

function syncBanner() {
  const n = pendingCount();
  if (n) return `<button class="banner warn" data-sync>Не отправлено в таблицу: ${n}. Отправить сейчас</button>`;
  if (state.offline) return '<div class="banner">Нет связи с сервером — показаны сохранённые данные.</div>';
  return '';
}

function bindCommon(root = main) {
  root.querySelectorAll('[data-go]').forEach(b => (b.onclick = () => nav(b.dataset.go)));
  const s = root.querySelector('[data-sync]');
  if (s) s.onclick = async () => { s.disabled = true; s.textContent = 'Отправляю…'; const ok = await flushQueue(); toast(ok ? 'Отправлено' : 'Пока нет связи', ok ? 'ok' : 'warn'); route(); };
  const eye = root.querySelector('[data-eye]');
  if (eye) eye.onclick = () => { setPref('hide', !hidden()); route(); };
  bindCharts(root, { hidden });
}

const ICON = {
  gear: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  eye: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.5 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.1-.9M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>'
};
const eyeBtn = () => `<button class="icon-btn" data-eye aria-label="${hidden() ? 'Показать суммы' : 'Скрыть суммы'}" aria-pressed="${hidden()}">${hidden() ? ICON.eyeOff : ICON.eye}</button>`;

const tile = (k, v, s = '') => `<div class="tile"><span>${esc(k)}</span><b class="amt">${v}</b>${s ? `<small>${s}</small>` : ''}</div>`;
const pct = (v, digits = 0) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(digits).replace('.', ',')}%`;
const dl = v => (v == null ? '' : `<span class="dl ${v > 0.005 ? 'up' : v < -0.005 ? 'down' : ''}">${pct(v)}</span>`);

/* ================================ Сводка ================================ */

function home() {
  const cur = currentMonth();
  const all = byMonth(periodRange('all'));
  const closed = all.filter(m => m.key < cur);
  const curM = all.find(m => m.key === cur) || { total: 0, parts: {} };
  const last3 = closed.slice(-3);
  const usual = last3.length ? last3.reduce((a, m) => a + m.total, 0) / last3.length : 0;
  const y = summary(cur.slice(0, 4)), t12 = summary('12m'), allS = summary('all');
  const exp = expected().filter(e => e.diff >= -7 && e.diff <= 16).slice(0, 6);
  const recent = [...state.payments].reverse().slice(0, 6);
  const ins = insights().slice(0, 3);
  const srcParts = activeSources().filter(s => curM.parts[s.id]);

  main.innerHTML = `
    <header class="top"><span class="brand">Доходы</span><span class="grow"></span>${eyeBtn()}<button class="icon-btn" data-go="#/settings" aria-label="Настройки">${ICON.gear}</button></header>
    ${syncBanner()}
    <section class="hero">
      <p class="hero-k">${cap(monthLong(cur))}, начислено</p>
      <h1 class="amt big-num">${M(curM.total)}</h1>
      ${usual ? `<div class="meter" role="img" aria-label="${Math.round((curM.total / usual) * 100)}% от обычного месяца"><span style="width:${Math.min(curM.total / usual, 1) * 100}%"></span></div>
        <p class="hero-sub">${Math.round((curM.total / usual) * 100)}% от обычного месяца — в среднем за последние 3 месяца ${M0(usual)}</p>` : ''}
      ${srcParts.length ? `<div class="chips-row">${srcParts.map(s => `<span class="pill"><i class="sw c${s.color}"></i>${esc(s.name)} <b class="amt">${M0(curM.parts[s.id])}</b></span>`).join('')}</div>` : ''}
      <button class="btn primary big" data-go="#/add">Добавить выплату</button>
    </section>
    ${exp.length ? `<section class="block"><h2>Ближайшие выплаты</h2><ul class="exp">${exp.map((e, i) => `
      <li class="st-${e.status}"><button data-exp="${i}">
        <span class="e-d"><b>${+e.date.slice(8, 10)}</b><small>${monthShort(e.date.slice(0, 7))}</small></span>
        <span class="e-m"><b>${esc(e.source.name)}</b><small>${e.half === 'Аванс' ? 'Аванс' : 'Остаток'}, обычно ≈ ${M0(e.amount)}</small></span>
        <em>${e.status === 'received' ? 'получено' : e.status === 'late' ? 'задерживается' : e.diff === 0 ? 'сегодня' : e.diff === 1 ? 'завтра' : e.diff < 0 ? 'ожидалось' : `через ${e.diff} ${plural(e.diff, 'день', 'дня', 'дней')}`}</em>
      </button></li>`).join('')}</ul>
      <p class="note">Дни и суммы — по медиане ваших выплат за полгода. Нажмите на ожидаемую, чтобы внести её.</p></section>` : ''}
    <div class="tiles">
      ${tile('За 12 месяцев', M0(t12.total), `${monthShort(t12.range[0])} ${t12.range[0].slice(2, 4)} — ${monthShort(t12.range[1])} ${t12.range[1].slice(2, 4)}, в среднем ${M0(t12.avgMonth)}`)}
      ${tile(`С начала ${cur.slice(0, 4)}`, M0(y.total), `${y.activeMonths} ${plural(y.activeMonths, 'месяц', 'месяца', 'месяцев')}`)}
      ${tile('Лучший месяц', t12.best ? M0(t12.best.total) : '—', t12.best ? cap(monthLong(t12.best.key)) : '')}
      ${tile('Всего в журнале', M0(allS.total), `${state.payments.length} ${plural(state.payments.length, 'выплата', 'выплаты', 'выплат')}`)}
    </div>
    ${ins.length ? `<section class="block"><h2>Выводы</h2>${insightList(ins)}<button class="link" data-go="#/stats">Вся аналитика</button></section>` : ''}
    <section class="block"><h2>Последние выплаты</h2>${payList(recent)}<button class="link" data-go="#/payments">Все выплаты</button></section>`;
  bindCommon();
  bindPayList(main);
  main.querySelectorAll('[data-exp]').forEach(b => (b.onclick = () => {
    const e = exp[+b.dataset.exp];
    if (e.status === 'received' && e.got) return nav('#/edit/' + encodeURIComponent(e.got.id));
    storage('it_prefill', { source_id: e.source.id, date: e.date <= todayISO() ? todayISO() : e.date, amount: Math.round(e.amount * 100) / 100 });
    nav('#/add');
  }));
}

function insightList(list) {
  return `<ul class="ins">${list.map(i => `<li class="t-${i.tone}">${hidden() ? esc(i.text.replace(/[\d\s ,]+₽/g, '••• ₽')) : esc(i.text)}</li>`).join('')}</ul>`;
}

function payList(list, { showMonth = false } = {}) {
  if (!list.length) return '<p class="muted small">Выплат пока нет.</p>';
  return `<ul class="pays">${list.map(p => {
    const s = sourceById(p.source_id);
    return `<li><button data-pid="${esc(p.id)}">
      <span class="p-c"><i class="sw c${s?.color || 8}"></i></span>
      <span class="p-m"><b>${esc(s?.name || p.source)}</b><small>${fmtD(p.date)} · ${esc(p.category || '—')}${p.kind && p.kind !== 'Разовая' ? ', ' + p.kind.toLowerCase() : ''}${showMonth || p.accrual !== p.date.slice(0, 7) ? ` · за ${monthName(p.accrual)}` : ''}${p.pending ? ' · не отправлено' : ''}</small>
        ${p.note ? `<small class="p-n">${esc(p.note)}</small>` : ''}${p.expr && !hidden() ? `<small class="p-n">${esc(showExpr(p.expr))}</small>` : ''}</span>
      <span class="p-a amt">${M(p.amount)}</span></button></li>`;
  }).join('')}</ul>`;
}
function bindPayList(root) {
  root.querySelectorAll('[data-pid]').forEach(b => (b.onclick = () => nav('#/edit/' + encodeURIComponent(b.dataset.pid))));
}

/* ================================ Выплаты ================================ */

let payFilter = { src: 'all', q: '' };

function payments() {
  const srcs = state.sources.filter(s => state.payments.some(p => p.source_id === s.id));
  const q = payFilter.q.trim().toLowerCase();
  const list = state.payments.filter(p => (payFilter.src === 'all' || p.source_id === payFilter.src) &&
    (!q || [p.source, p.category, p.note, p.date, String(p.amount)].join(' ').toLowerCase().includes(q)));
  const groups = new Map();
  for (const p of [...list].reverse()) { if (!groups.has(p.accrual)) groups.set(p.accrual, []); groups.get(p.accrual).push(p); }
  main.innerHTML = `<header class="top"><h1 class="h1">Выплаты</h1>${eyeBtn()}<button class="chip" data-import>Импорт</button><button class="chip" data-export>Экспорт</button></header>
    ${syncBanner()}
    <div class="filters">
      <div class="seg-scroll" role="tablist">${[['all', 'Все'], ...srcs.map(s => [s.id, s.name])].map(([id, n]) => `<button class="chip${payFilter.src === id ? ' on' : ''}" data-src="${esc(id)}">${esc(n)}</button>`).join('')}</div>
      <label class="field search"><span class="vh">Поиск</span><input id="pay-q" type="search" placeholder="Поиск: категория, заметка, сумма" value="${esc(payFilter.q)}"></label>
    </div>
    ${[...groups].map(([k, arr]) => `<section class="block mgroup"><h2><button class="mg-h" data-go="#/month/${k}"><span>${cap(monthLong(k))}</span><b class="amt">${M(arr.reduce((a, p) => a + p.amount, 0))}</b></button></h2>${payList(arr)}</section>`).join('') || '<p class="empty">Ничего не найдено.</p>'}
    <p class="note pad">Выплаты сгруппированы по месяцу начисления: то, что пришло 1–15 числа от основной работы, относится к прошлому месяцу.</p>`;
  bindCommon(); bindPayList(main);
  main.querySelectorAll('[data-src]').forEach(b => (b.onclick = () => { payFilter.src = b.dataset.src; payments(); }));
  const qi = main.querySelector('#pay-q');
  qi.oninput = () => { payFilter.q = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => { const pos = qi.selectionStart; payments(); const n = main.querySelector('#pay-q'); n.focus(); n.setSelectionRange(pos, pos); }, 250); };
  main.querySelector('[data-import]').onclick = importSheet;
  main.querySelector('[data-export]').onclick = exportSheet;
}

/* ============================ Добавить / изменить ============================ */

function form(id) {
  const editing = id ? state.payments.find(p => p.id === id) : null;
  if (id && !editing) return nav('#/payments');
  const pre = editing ? null : storage('it_prefill');
  storage('it_prefill', null);
  const srcs = activeSources().concat(editing && sourceById(editing.source_id)?.archived ? [sourceById(editing.source_id)] : []);
  const lastSrc = [...state.payments].reverse()[0]?.source_id;
  const f = editing ? { ...editing, input: editing.expr ? exprToInput(editing.expr) : String(editing.amount).replace('.', ',') } :
    { date: pre?.date || todayISO(), source_id: pre?.source_id || lastSrc || srcs[0]?.id, category: '', input: pre?.amount ? String(pre.amount).replace('.', ',') : '', note: '', accrual: null };
  let accrualManual = editing ? editing.accrual !== accrualFor(editing.date, sourceById(editing.source_id)) : false;

  main.innerHTML = `<header class="top"><button class="icon-btn" data-back aria-label="Назад">‹</button><h1 class="h1">${editing ? 'Выплата' : 'Новая выплата'}</h1><span></span></header>
    <form class="pform" novalidate>
      <label class="amount-in"><span class="vh">Сумма</span><input id="f-amount" inputmode="decimal" autocomplete="off" placeholder="0 ₽" value="${esc(f.input)}"><small id="f-calc" class="calc"></small></label>
      <div class="center"><button type="button" class="chip" id="f-last" hidden></button></div>
      <p class="note center">Можно ввести формулой, как в таблице: 23133,19+34283,21</p>
      <div class="fgroup"><span class="flabel">Источник</span><div class="chips" id="f-srcs"></div></div>
      <div class="fgroup"><span class="flabel">Категория</span><div class="chips" id="f-cats"></div></div>
      <div class="two">
        <label class="field"><span>Дата выплаты</span><input type="date" id="f-date" value="${f.date}"></label>
        <label class="field"><span>Месяц начисления</span><input type="month" id="f-acc"></label>
      </div>
      <p class="note" id="f-rule"></p>
      <label class="field"><span>Заметка</span><textarea id="f-note" rows="2" placeholder="Например: презентация для конференции">${esc(f.note || '')}</textarea></label>
      <div class="row-btns">${editing ? '<button type="button" class="btn ghost danger-t" data-del>Удалить</button>' : ''}<button type="submit" class="btn primary big">${editing ? 'Сохранить' : 'Добавить'}</button></div>
    </form>`;
  bindCommon();
  const q = s => main.querySelector(s);
  q('[data-back]').onclick = () => history.length > 1 ? history.back() : nav('#/');
  const amt = q('#f-amount'), calc = q('#f-calc'), dateIn = q('#f-date'), accIn = q('#f-acc'), rule = q('#f-rule');

  const drawSrcs = () => {
    q('#f-srcs').innerHTML = srcs.map(s => `<button type="button" class="chip src${f.source_id === s.id ? ' on' : ''}" data-s="${esc(s.id)}"><i class="sw c${s.color}"></i>${esc(s.name)}</button>`).join('') +
      '<button type="button" class="chip add" data-newsrc>+ источник</button>';
    q('#f-srcs').querySelectorAll('[data-s]').forEach(b => (b.onclick = () => { f.source_id = b.dataset.s; f.category = ''; drawSrcs(); drawCats(); syncAccrual(); hintLast(); }));
    q('[data-newsrc]').onclick = () => sourceEditor(null, s => { srcs.push(s); f.source_id = s.id; f.category = ''; drawSrcs(); drawCats(); syncAccrual(); });
  };
  const drawCats = () => {
    const cats = catsOf(f.source_id);
    if (!f.category && cats.length) {
      const used = [...state.payments].reverse().find(p => p.source_id === f.source_id)?.category;
      f.category = used && cats.some(c => c.name === used) ? used : cats[0].name;
    }
    const names = cats.map(c => c.name);
    if (f.category && !names.includes(f.category)) names.push(f.category);
    q('#f-cats').innerHTML = names.map(n => `<button type="button" class="chip${f.category === n ? ' on' : ''}" data-c="${esc(n)}">${esc(n)}</button>`).join('') +
      '<button type="button" class="chip add" data-newcat>+ категория</button>';
    q('#f-cats').querySelectorAll('[data-c]').forEach(b => (b.onclick = () => { f.category = b.dataset.c; drawCats(); }));
    q('[data-newcat]').onclick = async () => {
      const n = (await promptSheet('Новая категория', { label: `Для источника «${sourceById(f.source_id)?.name || ''}»`, okLabel: 'Добавить' }))?.trim();
      if (!n) return;
      if (!catsOf(f.source_id).some(c => c.name.toLowerCase() === n.toLowerCase())) {
        try { await saveSources(state.sources, state.categories.concat([{ id: uid('c'), source_id: f.source_id, name: n, order: catsOf(f.source_id).length + 1 }])); }
        catch (e) { toast('Категория будет только у этой выплаты: ' + e.message, 'warn'); }
      }
      f.category = n; drawCats();
    };
  };
  const syncAccrual = () => {
    const s = sourceById(f.source_id);
    if (!accrualManual) accIn.value = accrualFor(dateIn.value || todayISO(), s);
    const kind = kindFor(dateIn.value || todayISO(), s);
    rule.textContent = !s ? '' : s.rule === 'split'
      ? `${kind}: выплаты до ${s.cutoff}-го числа относятся к прошлому месяцу.${accrualManual ? ' Месяц изменён вручную.' : ''}`
      : `Месяц начисления — по дате выплаты.${accrualManual ? ' Изменён вручную.' : ''}`;
  };
  const lastBtn = q('#f-last');
  const hintLast = () => {
    const last = [...state.payments].reverse().find(p => p.source_id === f.source_id && p.id !== editing?.id && p.kind === kindFor(dateIn.value, sourceById(f.source_id)));
    lastBtn.hidden = !last || !!amt.value;
    if (last) {
      lastBtn.textContent = `Как в прошлый раз: ${M(last.amount)}`;
      lastBtn.onclick = () => { amt.value = last.expr ? exprToInput(last.expr) : String(last.amount).replace('.', ','); showCalc(); lastBtn.hidden = true; amt.focus(); };
    }
  };
  const showCalc = () => {
    const r = parseAmount(amt.value);
    calc.textContent = !amt.value ? '' : !r ? 'Не похоже на сумму' : r.expr ? `= ${M(r.value)}` : '';
    calc.classList.toggle('bad', !!amt.value && !r);
  };
  if (editing) accIn.value = editing.accrual;
  drawSrcs(); drawCats(); syncAccrual(); hintLast(); showCalc();
  amt.oninput = () => { showCalc(); hintLast(); };
  dateIn.onchange = () => { syncAccrual(); hintLast(); };
  accIn.onchange = () => { accrualManual = accIn.value !== accrualFor(dateIn.value, sourceById(f.source_id)); syncAccrual(); };
  if (!editing && matchMedia('(pointer:fine)').matches) amt.focus();

  q('.pform').onsubmit = async ev => {
    ev.preventDefault();
    const r = parseAmount(amt.value);
    if (!r) { toast('Введите сумму', 'err'); amt.focus(); return; }
    const s = sourceById(f.source_id);
    if (!s) { toast('Выберите источник', 'err'); return; }
    const date = dateIn.value || todayISO();
    const item = {
      id: editing?.id || uid('p'), date, source_id: s.id, source: s.name, category: f.category || '', amount: r.value, expr: r.expr,
      accrual: accIn.value || accrualFor(date, s), kind: kindFor(date, s), note: q('#f-note').value.trim()
    };
    const ok = await savePayments([item]);
    toast(ok ? (editing ? 'Сохранено' : `Добавлено: ${money(item.amount)}`) : 'Сохранено на устройстве, отправлю при появлении сети', ok ? 'ok' : 'warn');
    nav(editing ? '#/payments' : '#/');
  };
  const del = q('[data-del]');
  if (del) del.onclick = async () => {
    if (!(await confirmSheet('Удалить выплату?', `${editing.source}, ${fmtDY(editing.date)}, ${money(editing.amount)}.`, 'Удалить', true))) return;
    const ok = await deletePayments([editing.id]);
    toast(ok ? 'Удалено' : 'Удалено на устройстве, отправлю при появлении сети', ok ? 'ok' : 'warn');
    nav('#/payments');
  };
}

/* ================================ Аналитика ================================ */

let period = '12m';

function stats() {
  const years = [...new Set(state.payments.map(p => p.accrual.slice(0, 4)))].sort();
  if (period !== 'all' && period !== '12m' && !years.includes(period)) period = '12m';
  const S = summary(period);
  const width = Math.min(main.clientWidth || 360, 720) - 8;
  const series = state.sources.filter(s => S.sources.some(x => x.id === s.id)).map(s => ({ id: s.id, name: s.name, color: s.color }));
  const months = byMonth(S.range);
  const yrs = byYear();
  const r12 = rolling12();
  const cum = cumulative(S.range);
  const un = unusual(4);

  main.innerHTML = `<header class="top"><h1 class="h1">Аналитика</h1>${eyeBtn()}</header>
    <div class="seg-scroll periods">${[['12m', '12 месяцев'], ...years.slice().reverse().map(y => [y, y]), ['all', 'Всё время']].map(([k, n]) => `<button class="chip${period === k ? ' on' : ''}" data-p="${k}">${n}</button>`).join('')}</div>
    <div class="tiles">
      ${tile('Всего ' + periodLabel(period), M0(S.total), `${S.count} ${plural(S.count, 'выплата', 'выплаты', 'выплат')}`)}
      ${tile('В среднем в месяц', M0(S.avgMonth), `${S.activeMonths} ${plural(S.activeMonths, 'месяц', 'месяца', 'месяцев')} с доходом`)}
      ${tile('Лучший месяц', S.best ? M0(S.best.total) : '—', S.best ? cap(monthLong(S.best.key)) : '')}
      ${tile('Худший месяц', S.worst ? M0(S.worst.total) : '—', S.worst ? cap(monthLong(S.worst.key)) : '')}
    </div>
    <section class="block"><h2>По месяцам</h2>${monthBars(months, series, { width, avg: S.avgMonth, highlight: currentMonth() })}
      <p class="note">Нажмите на столбец, чтобы увидеть разбивку. Текущий месяц ещё не закрыт и в среднее не входит.</p>
      <div class="mlinks">${months.slice().reverse().filter(m => m.total).slice(0, 6).map(m => `<button class="chip" data-go="#/month/${m.key}">${cap(monthLong(m.key))}</button>`).join('')}</div></section>
    <section class="block"><h2>По источникам</h2>${shareBar(S.sources.map(s => ({ name: s.name, value: s.sum, color: s.color })))}
      <table class="tbl"><thead><tr><th>Источник</th><th>Сумма</th><th>Доля</th></tr></thead><tbody>
      ${S.sources.map(s => `<tr><td><a href="#/source/${encodeURIComponent(s.id)}"><i class="sw c${s.color}"></i>${esc(s.name)}</a><small class="muted">≈ ${M0(s.perMonth)} в месяц</small></td><td class="amt">${M0(s.sum)}</td><td>${Math.round(s.share * 100)}%</td></tr>`).join('')}
      </tbody></table>
      ${S.byKind.side || S.byKind.other ? `<p class="note">Основная работа — ${M0(S.byKind.job)}, подработки — ${M0(S.byKind.side)}, прочее — ${M0(S.byKind.other)}.</p>` : ''}</section>
    ${S.categories.length > S.sources.length ? `<section class="block"><h2>По категориям</h2>${hbars(S.categories.slice(0, 10).map(c => ({ label: c.cat || 'Без категории', sub: c.src, value: c.sum, color: c.color })), { fmtV: M0 })}</section>` : ''}
    ${r12.length > 1 ? `<section class="block"><h2>Доход за скользящие 12 месяцев</h2>${monthLine(r12, { width })}<p class="note">Каждая точка — сумма за 12 месяцев, заканчивающихся этим месяцем. Сглаживает премии и отпускные и показывает настоящий тренд.</p></section>` : ''}
    <section class="block"><h2>Накопительно ${periodLabel(period)}</h2>${monthLine(cum, { width, cls: 'c3' })}</section>
    <section class="block"><h2>По годам</h2><div class="tscroll"><table class="tbl"><thead><tr><th>Год</th><th>Итого</th><th>В месяц</th><th>к прошл.</th></tr></thead><tbody>
      ${yrs.slice().reverse().map(r => `<tr><td><button class="link-b" data-p="${r.year}">${r.year}</button><small class="muted">${r.active} мес.${r.best ? ', лучший ' + monthShort(r.best.key) : ''}</small></td><td class="amt">${M0(r.total)}</td><td class="amt">${M0(r.avg)}</td><td>${dl(r.yoyAvg)}</td></tr>`).join('')}
      </tbody></table></div><p class="note">«В месяц» — среднее по закрытым месяцам с доходом; «к прошл.» — изменение среднего месячного дохода к прошлому году.</p></section>
    ${un.length ? `<section class="block"><h2>Нетипично крупные выплаты</h2><ul class="ins">${un.map(u => `<li class="t-info"><button class="link-b" data-go="#/edit/${encodeURIComponent(u.p.id)}">${fmtDS(u.p.date)}, ${esc(u.p.source)}: ${M0(u.p.amount)}</button> — в ${String(u.ratio.toFixed(1)).replace('.', ',')} раза больше обычной (${M0(u.med)}). Если это премия или отпускные, отметьте категорию — так средние будут честнее.</li>`).join('')}</ul></section>` : ''}
    <section class="block"><h2>Выводы</h2>${insightList(insights())}</section>`;
  bindCommon();
  main.querySelectorAll('[data-p]').forEach(b => (b.onclick = () => { period = b.dataset.p; stats(); }));
}

function monthView(key) {
  const list = state.payments.filter(p => p.accrual === key);
  const total = list.reduce((a, p) => a + p.amount, 0);
  const prev = state.payments.filter(p => p.accrual === addMonths(key, -1)).reduce((a, p) => a + p.amount, 0);
  const ly = state.payments.filter(p => p.accrual === addMonths(key, -12)).reduce((a, p) => a + p.amount, 0);
  const bySrc = new Map();
  for (const p of list) bySrc.set(p.source_id, (bySrc.get(p.source_id) || 0) + p.amount);
  main.innerHTML = `<header class="top"><button class="icon-btn" data-back aria-label="Назад">‹</button><h1 class="h1">${cap(monthLong(key))}</h1>${eyeBtn()}</header>
    <div class="tiles three">${tile('Начислено', M0(total), `${list.length} ${plural(list.length, 'выплата', 'выплаты', 'выплат')}`)}${tile('К прошлому месяцу', prev ? dl(total / prev - 1) : '—', prev ? M0(prev) : '')}${tile('Год назад', ly ? dl(total / ly - 1) : '—', ly ? M0(ly) : '')}</div>
    <section class="block"><h2>По источникам</h2>${hbars([...bySrc].map(([id, v]) => ({ label: sourceById(id)?.name || id, value: v, color: sourceById(id)?.color })).sort((a, b) => b.value - a.value), { fmtV: M0 })}</section>
    <section class="block"><h2>Выплаты</h2>${payList([...list].reverse())}</section>
    <div class="row-btns pad"><button class="btn ghost" data-go="#/month/${addMonths(key, -1)}">‹ ${cap(monthName(addMonths(key, -1)))}</button>${key < currentMonth() ? `<button class="btn ghost" data-go="#/month/${addMonths(key, 1)}">${cap(monthName(addMonths(key, 1)))} ›</button>` : ''}</div>`;
  bindCommon(); bindPayList(main);
  main.querySelector('[data-back]').onclick = () => history.back();
}

/* ================================ Источники ================================ */

function sources() {
  const y = currentMonth().slice(0, 4), S = summary(y), all = summary('all');
  const groups = ['job', 'side', 'other'].map(k => [k, state.sources.filter(s => s.kind === k && !s.archived)]).filter(([, l]) => l.length);
  const arch = state.sources.filter(s => s.archived);
  const row = s => {
    const ys = S.sources.find(x => x.id === s.id), as = all.sources.find(x => x.id === s.id);
    const cats = catsOf(s.id).map(c => c.name);
    return `<a class="srow" href="#/source/${encodeURIComponent(s.id)}"><i class="sw lg c${s.color}"></i>
      <span class="s-m"><b>${esc(s.name)}</b><small>${cats.length ? esc(cats.join(', ')) : 'без категорий'}</small></span>
      <span class="s-a"><b class="amt">${ys ? M0(ys.sum) : '—'}</b><small>${as ? 'всего ' + MS(as.sum) : 'выплат нет'}</small></span></a>`;
  };
  main.innerHTML = `<header class="top"><h1 class="h1">Источники</h1>${eyeBtn()}</header>
    <p class="sub">Суммы за ${y} год. У каждого источника свои категории: например, у студии — «Создание презентаций».</p>
    ${groups.map(([k, l]) => `<section class="block"><h2>${KIND_LABEL[k]}</h2>${l.map(row).join('')}</section>`).join('')}
    ${arch.length ? `<section class="block"><h2>В архиве</h2>${arch.map(row).join('')}</section>` : ''}
    <div class="row-btns pad"><button class="btn primary big" data-new>Добавить источник</button></div>`;
  bindCommon();
  main.querySelector('[data-new]').onclick = () => sourceEditor(null, () => sources());
}

function sourceView(id) {
  const s = sourceById(id);
  if (!s) return nav('#/sources');
  const width = Math.min(main.clientWidth || 360, 720) - 8;
  const list = state.payments.filter(p => p.source_id === id);
  const range = periodRange('all');
  const months = byMonth(['0000-00', '9999-99'], { filter: p => p.source_id === id }).slice(-24);
  const total = list.reduce((a, p) => a + p.amount, 0);
  const y = currentMonth().slice(0, 4), ytot = list.filter(p => p.accrual.startsWith(y)).reduce((a, p) => a + p.amount, 0);
  const cats = new Map();
  for (const p of list) cats.set(p.category || 'Без категории', (cats.get(p.category || 'Без категории') || 0) + p.amount);
  const activeM = new Set(list.map(p => p.accrual)).size;
  main.innerHTML = `<header class="top"><button class="icon-btn" data-back aria-label="Назад">‹</button><h1 class="h1"><i class="sw lg c${s.color}"></i> ${esc(s.name)}</h1><button class="chip" data-edit>Изменить</button></header>
    <p class="sub">${KIND_LABEL[s.kind]}. ${s.rule === 'split' ? `Выплаты до ${s.cutoff}-го числа — за прошлый месяц.` : 'Месяц начисления — по дате выплаты.'}${s.archived ? ' В архиве.' : ''}${s.note ? ' ' + esc(s.note) + '.' : ''}</p>
    <div class="tiles">${tile(`За ${y} год`, M0(ytot))}${tile('Всего', M0(total), `${list.length} ${plural(list.length, 'выплата', 'выплаты', 'выплат')}`)}${tile('В среднем в месяц', activeM ? M0(total / activeM) : '—', `${activeM} ${plural(activeM, 'месяц', 'месяца', 'месяцев')}`)}${tile('Последняя', list.length ? M0(list[list.length - 1].amount) : '—', list.length ? fmtDY(list[list.length - 1].date) : '')}</div>
    ${months.length ? `<section class="block"><h2>По месяцам</h2>${monthBars(months, [{ id: s.id, name: s.name, color: s.color }], { width })}</section>` : ''}
    <section class="block"><h2>Категории</h2>${cats.size ? hbars([...cats].map(([n, v]) => ({ label: n, value: v, color: s.color })).sort((a, b) => b.value - a.value), { fmtV: M0 }) : '<p class="muted small">Выплат пока нет.</p>'}</section>
    <section class="block"><h2>Выплаты</h2>${payList([...list].reverse().slice(0, 30))}${list.length > 30 ? `<button class="link" data-all>Все ${list.length}</button>` : ''}</section>
    <div class="row-btns pad"><button class="btn primary big" data-add>Добавить выплату</button></div>`;
  bindCommon(); bindPayList(main);
  main.querySelector('[data-back]').onclick = () => history.back();
  main.querySelector('[data-edit]').onclick = () => sourceEditor(s, () => sourceView(id));
  main.querySelector('[data-add]').onclick = () => { storage('it_prefill', { source_id: id }); nav('#/add'); };
  const all = main.querySelector('[data-all]');
  if (all) all.onclick = () => { payFilter = { src: id, q: '' }; nav('#/payments'); };
}

/** Редактор источника с категориями. done(source) вызывается после сохранения. */
function sourceEditor(src, done) {
  const s = src ? { ...src } : { id: uid('src'), name: '', kind: 'side', rule: 'paydate', cutoff: 15, color: nextColor(), archived: false, note: '' };
  let cats = src ? catsOf(src.id).map(c => ({ ...c })) : [];
  const hasPays = src && state.payments.some(p => p.source_id === src.id);
  sheet({
    title: src ? 'Источник' : 'Новый источник',
    body: `<label class="field"><span>Название</span><input id="se-name" value="${esc(s.name)}" placeholder="Например: студия дизайна"></label>
      <div class="fgroup"><span class="flabel">Вид дохода</span><div class="chips" id="se-kind">${Object.entries(KIND_LABEL).map(([k, n]) => `<button type="button" class="chip${s.kind === k ? ' on' : ''}" data-k="${k}">${n}</button>`).join('')}</div></div>
      <div class="fgroup"><span class="flabel">Месяц начисления</span>
        <label class="toggle"><input type="radio" name="se-rule" value="split" ${s.rule === 'split' ? 'checked' : ''}><span>Аванс и остаток: выплаты до <input id="se-cut" class="inline-num" inputmode="numeric" value="${s.cutoff}" aria-label="Число месяца">-го числа — за прошлый месяц</span></label>
        <label class="toggle"><input type="radio" name="se-rule" value="paydate" ${s.rule !== 'split' ? 'checked' : ''}><span>По дате выплаты — для разовых и подработок</span></label></div>
      <div class="fgroup"><span class="flabel">Цвет</span><div class="swatches">${[1, 2, 3, 4, 5, 6, 7, 8].map(c => `<button type="button" class="swb c${c}${s.color === c ? ' on' : ''}" data-c="${c}" aria-label="Цвет ${c}"></button>`).join('')}</div></div>
      <div class="fgroup"><span class="flabel">Категории</span><div id="se-cats"></div>
        <div class="addcat"><input id="se-newcat" placeholder="Новая категория, например «Создание презентаций»"><button type="button" class="btn ghost" data-addcat>Добавить</button></div></div>
      <label class="field"><span>Заметка</span><input id="se-note" value="${esc(s.note)}"></label>
      ${src ? `<label class="toggle"><input type="checkbox" id="se-arch" ${s.archived ? 'checked' : ''}><span>В архиве — не предлагать при добавлении выплат</span></label>` : ''}
      <div class="row-btns">${src && !hasPays ? '<button type="button" class="btn ghost danger-t" data-del>Удалить</button>' : ''}<button type="button" class="btn primary" data-save>Сохранить</button></div>`,
    onMount: (el, close) => {
      const q = x => el.querySelector(x);
      const drawCats = () => {
        q('#se-cats').innerHTML = cats.length ? cats.map((c, i) => `<div class="catrow"><input value="${esc(c.name)}" data-ci="${i}" aria-label="Категория"><button type="button" class="icon-btn sm danger-t" data-cd="${i}" aria-label="Удалить категорию">✕</button></div>`).join('') : '<p class="muted small">Пока нет. Категория — вид работы у этого источника: зарплата, премия, презентации…</p>';
        q('#se-cats').querySelectorAll('[data-ci]').forEach(inp => (inp.oninput = () => (cats[+inp.dataset.ci].name = inp.value)));
        q('#se-cats').querySelectorAll('[data-cd]').forEach(b => (b.onclick = () => { cats.splice(+b.dataset.cd, 1); drawCats(); }));
      };
      drawCats();
      q('#se-kind').querySelectorAll('[data-k]').forEach(b => (b.onclick = () => {
        s.kind = b.dataset.k; q('#se-kind').querySelectorAll('[data-k]').forEach(x => x.classList.toggle('on', x === b));
        if (!src) el.querySelector(`[name="se-rule"][value="${s.kind === 'job' ? 'split' : 'paydate'}"]`).checked = true;
      }));
      el.querySelectorAll('[data-c]').forEach(b => (b.onclick = () => { s.color = +b.dataset.c; el.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === b)); }));
      const addCat = () => { const v = q('#se-newcat').value.trim(); if (!v) return; cats.push({ id: uid('c'), source_id: s.id, name: v }); q('#se-newcat').value = ''; drawCats(); };
      q('[data-addcat]').onclick = addCat;
      q('#se-newcat').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addCat(); } };
      q('[data-save]').onclick = async () => {
        s.name = q('#se-name').value.trim();
        if (!s.name) return toast('Введите название', 'err');
        if (state.sources.some(x => x.id !== s.id && x.name.toLowerCase() === s.name.toLowerCase())) return toast('Такой источник уже есть', 'err');
        s.rule = el.querySelector('[name="se-rule"]:checked').value;
        s.cutoff = Math.min(Math.max(parseInt(q('#se-cut').value) || 15, 1), 28);
        s.note = q('#se-note').value.trim();
        if (src) s.archived = q('#se-arch').checked;
        cats = cats.filter(c => c.name.trim()).map((c, i) => ({ ...c, name: c.name.trim(), order: i + 1 }));
        const nextSources = src ? state.sources.map(x => (x.id === s.id ? s : x)) : state.sources.concat([s]);
        const nextCats = state.categories.filter(c => c.source_id !== s.id).concat(cats);
        q('[data-save]').disabled = true;
        try {
          await saveSources(nextSources, nextCats);
          // переименование: обновить название в строках выплат, чтобы таблица читалась
          if (src && src.name !== s.name) {
            const items = state.payments.filter(p => p.source_id === s.id).map(p => ({ ...p, source: s.name }));
            if (items.length) await savePayments(items);
          }
          close(); toast('Источник сохранён', 'ok'); done && done(sourceById(s.id) || s);
        } catch (e) { toast(e.message, 'err'); q('[data-save]').disabled = false; }
      };
      const del = q('[data-del]');
      if (del) del.onclick = async () => {
        close();
        if (!(await confirmSheet('Удалить источник?', `«${s.name}» и его категории будут удалены. Выплат у него нет.`, 'Удалить', true))) return;
        try { await saveSources(state.sources.filter(x => x.id !== s.id), state.categories.filter(c => c.source_id !== s.id)); toast('Удалено', 'ok'); nav('#/sources'); }
        catch (e) { toast(e.message, 'err'); }
      };
    }
  });
}
const nextColor = () => { const used = new Set(state.sources.map(s => s.color)); for (let c = 1; c <= 8; c++) if (!used.has(c)) return c; return 1 + (state.sources.length % 8); };

/* ============================ Импорт и экспорт ============================ */

/**
 * Строки, скопированные из таблицы (через табуляцию, «;» или «,»): дата, источник, сумма[, категория[, заметка]].
 * Дата — дд.мм.гггг или гггг-мм-дд; сумма может быть формулой «=23133,19+34283,21».
 */
function parseRows(text) {
  const out = [], errors = [];
  text.replace(/\r/g, '').split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    const cells = line.includes('\t') ? line.split('\t') : line.includes(';') ? line.split(';') : line.split(/,(?=\s*\S)(?![^"]*"(?:[^"]*"[^"]*")*[^"]*$)/);
    const c = cells.map(x => x.trim().replace(/^"|"$/g, ''));
    let d = c[0], m;
    if ((m = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/))) d = `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    else if (!/^\d{4}-\d{2}-\d{2}/.test(d)) { if (i === 0 && /дата/i.test(line)) return; errors.push(`Строка ${i + 1}: не понял дату «${c[0]}»`); return; }
    const amt = parseAmount(c[2]);
    if (!c[1] || !amt) { errors.push(`Строка ${i + 1}: нужен источник и сумма`); return; }
    out.push({ date: d.slice(0, 10), source: c[1], amount: amt.value, expr: amt.expr, category: c[3] || '', note: c[4] || '', line: i + 1 });
  });
  return { rows: out, errors };
}

function importSheet() {
  let parsed = null;
  sheet({
    title: 'Импорт выплат',
    body: `<p class="sheet-text">Скопируйте строки из Google Таблицы или Excel и вставьте сюда. Столбцы: дата, источник, сумма, категория (необязательно), заметка (необязательно).</p>
      <textarea class="txt-out" id="im-text" rows="8" placeholder="28.10.2026	Студия	15000	Создание презентаций	Слайды для конференции"></textarea>
      <div class="row-btns"><button class="btn primary" data-parse>Разобрать</button></div><div data-pv></div>`,
    onMount: (el, close) => {
      const pv = el.querySelector('[data-pv]');
      el.querySelector('[data-parse]').onclick = () => {
        parsed = parseRows(el.querySelector('#im-text').value);
        const byName = new Map(state.sources.map(s => [s.name.toLowerCase(), s]));
        const newSrc = [...new Set(parsed.rows.filter(r => !byName.has(r.source.toLowerCase())).map(r => r.source))];
        parsed.rows.forEach(r => {
          const s = byName.get(r.source.toLowerCase());
          r.dup = !!(s && state.payments.some(p => p.source_id === s.id && p.date === r.date && Math.abs(p.amount - r.amount) < 0.01));
          r.pick = !r.dup;
        });
        pv.innerHTML = `${parsed.errors.length ? `<div class="im-err"><b>Не разобрано</b>${parsed.errors.map(x => `<p>${esc(x)}</p>`).join('')}</div>` : ''}
          ${newSrc.length ? `<p class="small">Новые источники — будут созданы как «Подработка», по дате выплаты: ${newSrc.map(esc).join(', ')}.</p>` : ''}
          <div class="im-list">${parsed.rows.map((r, i) => `<label class="im-row"><input type="checkbox" data-i="${i}" ${r.pick ? 'checked' : ''}><span><b>${fmtDS(r.date)} — ${esc(r.source)}: ${money(r.amount)}</b><small>${esc([r.category, r.note].filter(Boolean).join(', '))}</small>${r.dup ? '<em class="st warn">Уже есть такая выплата</em>' : ''}</span></label>`).join('')}</div>
          ${parsed.rows.length ? '<div class="row-btns"><button class="btn primary big" data-save></button></div>' : ''}`;
        const btn = pv.querySelector('[data-save]');
        if (!btn) return;
        const label = () => { const n = parsed.rows.filter(r => r.pick).length; btn.textContent = n ? `Добавить ${n} ${plural(n, 'выплату', 'выплаты', 'выплат')}` : 'Ничего не выбрано'; btn.disabled = !n; };
        pv.querySelectorAll('[data-i]').forEach(c => (c.onchange = () => { parsed.rows[+c.dataset.i].pick = c.checked; label(); }));
        label();
        btn.onclick = async () => {
          btn.disabled = true;
          const pick = parsed.rows.filter(r => r.pick);
          let srcs = state.sources.slice(), cats = state.categories.slice(), changed = false;
          const find = n => srcs.find(s => s.name.toLowerCase() === n.toLowerCase());
          for (const r of pick) {
            let s = find(r.source);
            if (!s) { s = { id: uid('src'), name: r.source, kind: 'side', rule: 'paydate', cutoff: 15, color: 1 + (srcs.length % 8), archived: false, note: '' }; srcs.push(s); changed = true; }
            if (r.category && !cats.some(c => c.source_id === s.id && c.name.toLowerCase() === r.category.toLowerCase())) { cats.push({ id: uid('c'), source_id: s.id, name: r.category }); changed = true; }
            r.s = s;
          }
          try {
            if (changed) await saveSources(srcs, cats);
            const items = pick.map(r => ({ id: uid('p'), date: r.date, source_id: r.s.id, source: r.s.name, category: r.category, amount: r.amount, expr: r.expr, accrual: accrualFor(r.date, r.s), kind: kindFor(r.date, r.s), note: r.note }));
            const ok = await savePayments(items);
            close(); toast(ok ? `Добавлено: ${items.length}` : 'Сохранено на устройстве, отправлю при появлении сети', ok ? 'ok' : 'warn'); payments();
          } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
        };
      };
    }
  });
}

function exportSheet() {
  const years = [...new Set(state.payments.map(p => p.accrual.slice(0, 4)))].sort().reverse();
  let per = 'all';
  const rows = () => state.payments.filter(p => per === 'all' || p.accrual.startsWith(per));
  const csv = () => {
    const q = v => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ['Дата выплаты', 'Источник', 'Категория', 'Сумма', 'Формула', 'Месяц начисления', 'Тип', 'Заметка'];
    return '﻿' + [head, ...rows().map(p => [fmtDS(p.date), p.source, p.category, String(p.amount).replace('.', ','), showExpr(p.expr), p.accrual, p.kind, p.note])].map(r => r.map(q).join(';')).join('\n');
  };
  sheet({
    title: 'Экспорт выплат',
    body: `<div class="seg-scroll">${[['all', 'Всё время'], ...years.map(y => [y, y])].map(([k, n]) => `<button class="chip${k === per ? ' on' : ''}" data-y="${k}">${n}</button>`).join('')}</div>
      <p class="sheet-text" data-n></p>
      <div class="row-btns"><button class="btn primary" data-dl>Скачать CSV</button><button class="btn ghost" data-copy>Скопировать для таблицы</button></div>
      <p class="note">CSV открывается в Excel и Google Таблицах (разделитель «;»). «Скопировать» кладёт строки через табуляцию — их можно вставить прямо в таблицу.</p>`,
    onMount: el => {
      const upd = () => { el.querySelector('[data-n]').textContent = `${rows().length} ${plural(rows().length, 'выплата', 'выплаты', 'выплат')} на ${money(rows().reduce((a, p) => a + p.amount, 0))}`; };
      el.querySelectorAll('[data-y]').forEach(b => (b.onclick = () => { per = b.dataset.y; el.querySelectorAll('[data-y]').forEach(x => x.classList.toggle('on', x === b)); upd(); }));
      upd();
      el.querySelector('[data-dl]').onclick = () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv()], { type: 'text/csv;charset=utf-8' }));
        a.download = `доходы_${per}_${todayISO()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      };
      el.querySelector('[data-copy]').onclick = async () => {
        const t = rows().map(p => [fmtDS(p.date), p.source, String(p.amount).replace('.', ','), p.category, p.note].join('\t')).join('\n');
        try { await navigator.clipboard.writeText(t); toast('Скопировано', 'ok'); } catch (e) { toast('Браузер не дал скопировать — используйте CSV', 'warn'); }
      };
    }
  });
}

/* =============================== Настройки =============================== */

function settings() {
  const cfg = getConfig();
  main.innerHTML = `<header class="top"><button class="icon-btn" data-go="#/" aria-label="Назад">‹</button><h1 class="h1">Настройки</h1><span></span></header>
    ${syncBanner()}
    <section class="block"><h2>Подключение</h2>
      <p class="small">${cfg.demo ? (window.DEMO_REAL ? 'Предпросмотр на ваших данных из Excel. Изменения хранятся только в этом браузере и в таблицу не попадают.' : 'Демо-режим: выдуманные данные, хранятся только в этом браузере.') : 'Google Таблица подключена.'}</p>
      <p class="small muted">${state.syncedAt ? 'Синхронизировано: ' + new Date(state.syncedAt).toLocaleString('ru-RU') : 'Ещё не синхронизировано'}</p>
      <div class="row-btns"><button class="btn ghost" data-refresh>Обновить данные</button><button class="btn ghost" data-go="#/setup">Сменить подключение</button></div></section>
    <section class="block"><h2>Защита на этом устройстве</h2>
      ${lockSupported() ? `<label class="toggle"><input type="checkbox" id="st-lock" ${lockEnabled() ? 'checked' : ''}><span>Код из 4 цифр при входе и после 5 минут в фоне</span></label>` : '<p class="small muted">Код на вход работает только по https.</p>'}
      <label class="toggle"><input type="checkbox" id="st-hide" ${hidden() ? 'checked' : ''}><span>Скрывать суммы (кнопка с глазом в шапке)</span></label>
      <p class="note">Данные в таблице защищены токеном: без него сервер ничего не отдаёт. Код и скрытие сумм — от чужих глаз на разблокированном телефоне.</p></section>
    <section class="block"><h2>Оформление</h2>
      <div class="skins" role="radiogroup" aria-label="Оформление">${[['classic', 'Классика', 'Светлые карточки, индиго'], ['premium', 'Премиум', 'Графит и шампанское']].map(([k, t, d]) => `
        <button class="skin-opt${pref('skin', 'classic') === k ? ' on' : ''}" role="radio" aria-checked="${pref('skin', 'classic') === k}" data-skin="${k}"><span class="skin-pv sk-${k}"><i></i><i></i><i></i></span><b>${t}</b><small>${d}</small></button>`).join('')}</div>
      <label class="field"><span>Тема</span><select id="st-theme">${[['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([v, n]) => `<option value="${v}" ${pref('theme', 'auto') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label></section>
    ${cfg.demo ? '<section class="block"><h2>Демо</h2><button class="btn ghost danger-t" data-resetdemo>Сбросить демо-данные</button></section>' : ''}`;
  bindCommon();
  const q = s => main.querySelector(s);
  q('[data-refresh]').onclick = async () => { try { await refresh(); toast('Данные обновлены', 'ok'); settings(); } catch (e) { toast(e.message, 'err'); } };
  q('#st-hide').onchange = e => setPref('hide', e.target.checked);
  q('#st-theme').onchange = e => { setPref('theme', e.target.value); applyTheme(); };
  main.querySelectorAll('[data-skin]').forEach(b => (b.onclick = () => { setPref('skin', b.dataset.skin); applyTheme(); settings(); }));
  const lk = q('#st-lock');
  if (lk) lk.onchange = async () => {
    if (lk.checked) {
      const a = await pinScreen({ title: 'Новый код', sub: 'Придумайте 4 цифры', mode: 'set', onCancel: () => (lk.checked = false) });
      const b = await pinScreen({ title: 'Повторите код', mode: 'set', onCancel: () => (lk.checked = false) });
      if (a !== b) { lk.checked = false; return toast('Коды не совпали', 'err'); }
      await setPin(a); toast('Код установлен', 'ok');
    } else { await pinScreen({ title: 'Отключить код', sub: 'Введите текущий код', onCancel: () => (lk.checked = true) }); clearPin(); toast('Код отключён', 'ok'); }
  };
  const rd = q('[data-resetdemo]');
  if (rd) rd.onclick = async () => {
    if (!(await confirmSheet('Сбросить демо?', 'Демо-данные вернутся к исходным.', 'Сбросить', true))) return;
    resetDemo(); storage(K.cache, null); storage(K.queue, null); location.reload();
  };
}

function setup() {
  const cfg = getConfig();
  document.body.dataset.view = 'setup';
  main.innerHTML = `<section class="setup">
    <h1>Доходы</h1>
    <p>Выплаты хранятся в вашей Google Таблице. Вставьте адрес веб-приложения Apps Script и токен из журнала выполнения функции <code>setup</code>.</p>
    <label class="field"><span>Адрес веб-приложения</span><input id="su-url" value="${esc(cfg.url || '')}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" inputmode="url"></label>
    <label class="field"><span>Токен</span><input id="su-token" value="${esc(cfg.token || '')}" autocomplete="off"></label>
    <button class="btn primary big" data-connect>Подключить</button>
    <p class="or">или</p>
    <button class="btn ghost" data-demo>Посмотреть демо на выдуманных данных</button>
  </section>`;
  main.querySelector('[data-connect]').onclick = async e => {
    const url = main.querySelector('#su-url').value.trim(), token = main.querySelector('#su-token').value.trim();
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) return toast('Адрес должен начинаться с https://script.google.com/', 'err');
    if (!token) return toast('Вставьте токен', 'err');
    const prev = getConfig();
    setConfig({ url, token }); e.target.disabled = true; e.target.textContent = 'Проверяю…';
    try { await call('ping'); storage(K.cache, null); await refresh(); toast('Подключено', 'ok'); nav('#/'); }
    catch (err) { setConfig(prev); toast(err.code === 'auth' ? 'Токен не подошёл' : err.message, 'err'); e.target.disabled = false; e.target.textContent = 'Подключить'; }
  };
  main.querySelector('[data-demo]').onclick = async () => { setConfig({ demo: true }); storage(K.cache, null); await refresh(); nav('#/'); };
}

/* ================================ Запуск ================================ */

const PREMIUM_FONTS = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@400;500;600&display=swap';
function applyTheme() {
  const root = document.documentElement, t = pref('theme', 'auto');
  if (t === 'auto') root.removeAttribute('data-theme'); else root.dataset.theme = t;
  if (pref('skin', 'classic') === 'premium') {
    root.dataset.skin = 'premium';
    if (!document.getElementById('premium-fonts')) { const l = document.createElement('link'); l.id = 'premium-fonts'; l.rel = 'stylesheet'; l.href = PREMIUM_FONTS; document.head.appendChild(l); }
  } else root.removeAttribute('data-skin');
}

async function init() {
  applyTheme();
  if (!isConfigured()) return route();
  const cached = loadCache();
  if (cached) route(); else main.innerHTML = '<p class="loading">Загружаю журнал…</p>';
  try { await refresh(); } catch (e) {
    if (!cached) {
      main.innerHTML = `<section class="setup"><h1>Не удалось загрузить</h1><p>${esc(e.message)}</p><div class="row-btns"><button class="btn primary" data-retry>Повторить</button><button class="btn ghost" data-go="#/setup">Проверить подключение</button></div></section>`;
      main.querySelector('[data-retry]').onclick = init; bindCommon(); return;
    }
  }
  const h = location.hash;
  if (!cached || !(h.startsWith('#/add') || h.startsWith('#/edit') || document.querySelector('.sheet-wrap'))) route();
}

window.addEventListener('online', () => flushQueue().then(ok => ok && pendingCount() === 0 && toast('Синхронизировано', 'ok')));
if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.NO_SW) navigator.serviceWorker.register('sw.js').catch(() => {});
guard(init);
