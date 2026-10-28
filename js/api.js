// Связь с Google Apps Script. Демо-режим — локальная имитация того же API на выдуманных данных.
import { storage } from './util.js';

export const COLS = {
  payments: ['id', 'date', 'source_id', 'source', 'category', 'amount', 'expr', 'accrual', 'kind', 'note', 'updated'],
  sources: ['id', 'name', 'kind', 'rule', 'cutoff', 'color', 'archived', 'order', 'note'],
  categories: ['id', 'source_id', 'name', 'order'],
  settings: ['key', 'value']
};

export const K = { config: 'it_config', cache: 'it_cache', queue: 'it_queue', prefs: 'it_prefs', demo: 'it_demo_db', lock: 'it_lock' };

export const getConfig = () => storage(K.config) || {};
export const setConfig = c => storage(K.config, c);
export const isConfigured = () => { const c = getConfig(); return !!(c.demo || (c.url && c.token)); };

export class ApiError extends Error { constructor(msg, code) { super(msg); this.code = code; } }

export async function call(action, payload, opts = {}) {
  const cfg = getConfig();
  if (cfg.demo) return demoCall(action, payload);
  if (!cfg.url) throw new ApiError('Не указан адрес API', 'config');
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), opts.timeout || 30000);
  let res;
  try {
    res = await fetch(cfg.url, {
      method: 'POST', redirect: 'follow', signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: cfg.token, payload })
    });
  } catch (e) {
    throw new ApiError(e.name === 'AbortError' ? 'Сервер не ответил вовремя' : 'Нет связи с сервером', 'network');
  } finally { clearTimeout(t); }
  let data;
  try { data = await res.json(); } catch (e) { throw new ApiError('Сервер вернул не JSON — проверьте адрес развёртывания', 'format'); }
  if (!data.ok) throw new ApiError(data.message || data.error || 'Ошибка сервера', data.error);
  return data;
}

/* ------------------------------- Демо ------------------------------- */

async function demoDB() {
  let db = storage(K.demo);
  if (!db) {
    const seed = await (await fetch(new URL(window.DEMO_DATA || '../demo.json', import.meta.url))).json();
    db = { payments: seed.payments, sources: seed.sources, categories: seed.categories, settings: [] };
    storage(K.demo, db);
  }
  return db;
}
export const resetDemo = () => storage(K.demo, null);
const toRow = (t, o) => COLS[t].map(c => o[c] ?? '');

async function demoCall(action, p) {
  await new Promise(r => setTimeout(r, 100));
  const db = await demoDB(), save = () => storage(K.demo, db);
  switch (action) {
    case 'ping': return { ok: true };
    case 'bootstrap': { const data = {}; for (const k in COLS) data[k] = { cols: COLS[k], rows: db[k] || [] }; return { ok: true, data }; }
    case 'savePayments': {
      const ids = new Set(p.items.map(x => x.id)), now = new Date().toISOString();
      db.payments = db.payments.filter(r => !ids.has(r[0])).concat(p.items.map(x => toRow('payments', { ...x, updated: now })));
      db.payments.sort((a, b) => String(a[1]).localeCompare(String(b[1])));
      save(); return { ok: true };
    }
    case 'deletePayments': { const ids = new Set(p.ids); db.payments = db.payments.filter(r => !ids.has(r[0])); save(); return { ok: true }; }
    case 'saveSources':
      db.sources = p.sources.map(o => toRow('sources', o)); db.categories = p.categories.map(o => toRow('categories', o));
      save(); return { ok: true };
    case 'saveSettings': db.settings = Object.entries(p).map(([k, v]) => [k, String(v)]); save(); return { ok: true };
  }
  throw new ApiError('Неизвестное действие');
}
