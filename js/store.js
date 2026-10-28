// Данные: кэш на устройстве, синхронизация с таблицей, очередь неотправленных изменений.
import { call, COLS, K } from './api.js';
import { storage, num } from './util.js';

export const state = { payments: [], sources: [], categories: [], settings: {}, loaded: false, syncedAt: null, offline: false };

const listeners = new Set();
export const onChange = fn => listeners.add(fn);
const emit = () => listeners.forEach(fn => fn());

const objects = (t, block) => {
  const cols = block?.cols || COLS[t];
  return (block?.rows || []).map(r => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
};
const truthy = v => v === 1 || v === '1' || v === true || v === 'TRUE';

export function normPayment(x) {
  return {
    id: String(x.id), date: String(x.date).slice(0, 10), source_id: String(x.source_id || ''), source: String(x.source || ''),
    category: String(x.category || ''), amount: num(x.amount) ?? 0, expr: String(x.expr || ''),
    accrual: String(x.accrual || String(x.date).slice(0, 7)).slice(0, 7), kind: String(x.kind || ''), note: String(x.note || ''), pending: !!x.pending
  };
}

function ingest(data) {
  const sources = objects('sources', data.sources).map(s => ({
    id: String(s.id), name: String(s.name), kind: s.kind || 'job', rule: s.rule || 'split', cutoff: num(s.cutoff) || 15,
    color: num(s.color) || 1, archived: truthy(s.archived), order: num(s.order) || 0, note: s.note || ''
  })).sort((a, b) => a.order - b.order);
  const categories = objects('categories', data.categories).map(c => ({ id: String(c.id), source_id: String(c.source_id), name: String(c.name), order: num(c.order) || 0 }))
    .sort((a, b) => a.order - b.order);
  const payments = objects('payments', data.payments).map(normPayment);
  const settings = {};
  objects('settings', data.settings).forEach(r => (settings[r.key] = String(r.value)));
  return { sources, categories, payments, settings };
}

let raw = null;

function rebuild(base) {
  let payments = base.payments;
  for (const q of storage(K.queue) || []) {
    if (q.type === 'save') {
      const ids = new Set(q.items.map(x => x.id));
      payments = payments.filter(p => !ids.has(p.id)).concat(q.items.map(x => normPayment({ ...x, pending: true })));
    } else if (q.type === 'delete') {
      const ids = new Set(q.ids); payments = payments.filter(p => !ids.has(p.id));
    }
  }
  payments = [...payments].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  Object.assign(state, base, { payments, loaded: true });
}

export function loadCache() {
  raw = storage(K.cache);
  if (raw) { rebuild(ingest(raw.data)); state.syncedAt = raw.at; }
  return !!raw;
}

export async function refresh() {
  try {
    const res = await call('bootstrap');
    raw = { data: res.data, at: new Date().toISOString() };
    storage(K.cache, raw);
    state.offline = false; state.syncedAt = raw.at;
    rebuild(ingest(res.data));
    await flushQueue(true);
  } catch (e) {
    state.offline = e.code === 'network';
    if (!raw) throw e;
  }
  emit();
}

const baseData = () => (raw ? ingest(raw.data) : { sources: state.sources, categories: state.categories, payments: [], settings: state.settings });
export const pendingCount = () => (storage(K.queue) || []).reduce((a, q) => a + (q.items?.length || q.ids?.length || 0), 0);

function enqueue(op) {
  storage(K.queue, (storage(K.queue) || []).concat([{ ...op, v: Date.now() + Math.random() }]));
  rebuild(baseData()); emit();
  return flushQueue();
}
export const savePayments = items => enqueue({ type: 'save', items });
export const deletePayments = ids => enqueue({ type: 'delete', ids });

/** Отправляет очередь по порядку. true — всё на сервере. */
export async function flushQueue(silent) {
  const queue = storage(K.queue) || [];
  if (!queue.length) return true;
  const done = new Set();
  try {
    for (const q of queue) {
      if (q.type === 'save') await call('savePayments', { items: q.items });
      else await call('deletePayments', { ids: q.ids });
      done.add(q.v);
    }
  } catch (e) {
    storage(K.queue, (storage(K.queue) || []).filter(q => !done.has(q.v)));
    state.offline = e.code === 'network';
    if (!silent) emit();
    return false;
  }
  storage(K.queue, (storage(K.queue) || []).filter(q => !done.has(q.v)));
  state.offline = false;
  if (!silent) await refresh();
  return true;
}

export async function saveSources(sources, categories) {
  await call('saveSources', {
    sources: sources.map((s, i) => ({ ...s, archived: s.archived ? 1 : 0, order: i + 1 })),
    categories: categories.map((c, i) => ({ id: c.id, source_id: c.source_id, name: c.name, order: c.order ?? i + 1 }))
  });
  await refresh();
}

/* -------------------------------- Выборки -------------------------------- */

export const sourceById = id => state.sources.find(s => s.id === id);
export const activeSources = () => state.sources.filter(s => !s.archived);
export const catsOf = sid => state.categories.filter(c => c.source_id === sid);

/** Настройки устройства (тема, оформление, скрытие сумм) — хранятся только локально. */
export function pref(key, def) { const p = storage(K.prefs) || {}; return p[key] ?? def; }
export function setPref(key, val) { const p = storage(K.prefs) || {}; p[key] = val; storage(K.prefs, p); }
