/**
 * Журнал доходов — бэкенд на Google Apps Script.
 * Хранит выплаты, источники дохода и категории в Google Таблице и отдаёт их приложению (GitHub Pages).
 *
 * Первый запуск: вставить Code.gs и Seed.gs, выбрать функцию setup → Выполнить → взять TOKEN из журнала.
 * Потом: Развернуть → Новое развёртывание → Веб-приложение (выполнять от моего имени, доступ: все).
 * Без токена сервер ничего не отдаёт и не принимает.
 */

var API_VERSION = 1;

var TABLES = {
  payments: { name: 'Выплаты', text: [1, 2, 3, 7, 8], cols: [
    ['id', 'ID'], ['date', 'Дата выплаты'], ['source_id', 'ID источника'], ['source', 'Источник'], ['category', 'Категория'],
    ['amount', 'Сумма, ₽'], ['expr', 'Формула суммы'], ['accrual', 'Месяц начисления'], ['kind', 'Тип'], ['note', 'Заметка'],
    ['updated', 'Изменено']] },
  sources: { name: 'Источники', text: [1], cols: [
    ['id', 'ID'], ['name', 'Название'], ['kind', 'Вид (job/side/other)'], ['rule', 'Месяц начисления (split/paydate)'],
    ['cutoff', 'Граница, число месяца'], ['color', 'Цвет (1–8)'], ['archived', 'В архиве (1/0)'], ['order', 'Порядок'], ['note', 'Заметка']] },
  categories: { name: 'Категории', text: [1, 2], cols: [
    ['id', 'ID'], ['source_id', 'ID источника'], ['name', 'Название'], ['order', 'Порядок']] },
  settings: { name: 'Настройки', text: [1], cols: [['key', 'Ключ'], ['value', 'Значение']] }
};

/* ============================ Установка ============================ */

function setup() {
  ensureSheets_(true);
  ensurePivot_();
  showSecrets();
}

/** Создаёт недостающие листы и заголовки. seedEmpty — наполнить пустые листы из Seed.gs. */
function ensureSheets_(seedEmpty) {
  var ss = getSS_();
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN')) props.setProperty('TOKEN', randomToken_(28));
  Object.keys(TABLES).forEach(function (key) {
    var t = TABLES[key];
    var sh = ss.getSheetByName(t.name), isNew = !sh;
    if (!sh) sh = ss.insertSheet(t.name);
    var labels = t.cols.map(function (c) { return c[1]; });
    sh.getRange(1, 1, 1, labels.length).setValues([labels]).setFontWeight('bold').setBackground('#eef1f4');
    sh.setFrozenRows(1);
    t.text.forEach(function (col) { sh.getRange(1, col, sh.getMaxRows(), 1).setNumberFormat('@'); });
    if (key === 'payments') sh.getRange(2, 6, sh.getMaxRows() - 1, 1).setNumberFormat('#,##0.00');
    if (seedEmpty && (isNew || sh.getLastRow() < 2) && typeof SEED !== 'undefined' && SEED[key] && SEED[key].length) {
      writeRows_(sh, SEED[key], labels.length);
    }
    sh.autoResizeColumns(1, labels.length);
  });
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Лист1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
}

/** Лист «По месяцам» — живая сводная таблица формулой QUERY, для просмотра прямо в Таблице. */
function ensurePivot_() {
  var ss = getSS_(), name = 'По месяцам';
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.getRange('A1').setFormula("=QUERY('Выплаты'!A1:K, \"select H, sum(F) where H is not null group by H pivot D order by H label H 'Месяц'\", 1)");
  sh.setFrozenRows(1);
}

/** Показать токен в журнале выполнения. */
function showSecrets() {
  Logger.log('TOKEN (вставить в приложение при первом входе): ' + PropertiesService.getScriptProperties().getProperty('TOKEN'));
}

/** Выпустить новый токен — все устройства придётся подключить заново. */
function rotateToken() {
  PropertiesService.getScriptProperties().setProperty('TOKEN', randomToken_(28));
  showSecrets();
}

/**
 * Догрузить данные из Seed.gs в уже настроенную таблицу: добавляет только записи с новыми ID.
 * Можно запускать повторно.
 */
function importSeed() {
  if (typeof SEED === 'undefined') throw new Error('Нет файла Seed.gs');
  ensureSheets_(false);
  var added = withLock_(function () {
    var res = {};
    ['payments', 'sources', 'categories'].forEach(function (k) {
      var have = {};
      readRows_(k).forEach(function (r) { have[String(r[0])] = 1; });
      var rows = (SEED[k] || []).filter(function (r) { return !have[String(r[0])]; });
      writeRows_(sheet_(k), rows, TABLES[k].cols.length);
      res[k] = rows.length;
    });
    sortBy_('payments', [{ column: 2, ascending: true }]);
    return res;
  });
  Logger.log('Добавлено: выплат ' + added.payments + ', источников ' + added.sources + ', категорий ' + added.categories);
}

/* ============================== API ============================== */

function doGet() {
  return json_({ ok: true, app: 'income-tracker', version: API_VERSION, hint: 'Используйте POST' });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Неверный JSON' }); }
  if (!req.token || req.token !== PropertiesService.getScriptProperties().getProperty('TOKEN')) {
    return json_({ ok: false, error: 'auth', message: 'Неверный токен' });
  }
  try {
    var p = req.payload || {};
    switch (req.action) {
      case 'ping': return json_({ ok: true, version: API_VERSION });
      case 'bootstrap': return json_({ ok: true, data: bootstrap_() });
      case 'savePayments': return json_(withLock_(function () { return savePayments_(p.items || []); }));
      case 'deletePayments': return json_(withLock_(function () { return deletePayments_(p.ids || []); }));
      case 'saveSources': return json_(withLock_(function () { return saveSources_(p); }));
      case 'saveSettings': return json_(withLock_(function () { return saveSettings_(p); }));
      default: return json_({ ok: false, error: 'Неизвестное действие: ' + req.action });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function bootstrap_() {
  var out = {};
  Object.keys(TABLES).forEach(function (k) {
    out[k] = { cols: TABLES[k].cols.map(function (c) { return c[0]; }), rows: readRows_(k) };
  });
  return out;
}

function savePayments_(items) {
  var now = new Date().toISOString(), ids = {}, rows = [];
  items.forEach(function (x) {
    if (!x || !x.id || !x.date) throw new Error('Нет даты выплаты');
    if (typeof x.amount !== 'number' || !isFinite(x.amount)) throw new Error('Сумма должна быть числом');
    x.updated = now; ids[String(x.id)] = 1; rows.push(rowFromObj_('payments', x));
  });
  replaceIds_('payments', ids, rows);
  if (rows.length) sortBy_('payments', [{ column: 2, ascending: true }]);
  return { ok: true, count: rows.length };
}

function deletePayments_(list) {
  var ids = {};
  list.forEach(function (id) { ids[String(id)] = 1; });
  replaceIds_('payments', ids, []);
  return { ok: true };
}

/** Источники и категории сохраняются целиком (их немного), выплаты при этом не трогаются. */
function saveSources_(p) {
  replaceAll_('sources', (p.sources || []).map(function (o) { return rowFromObj_('sources', o); }));
  replaceAll_('categories', (p.categories || []).map(function (o) { return rowFromObj_('categories', o); }));
  return { ok: true };
}

function saveSettings_(obj) {
  replaceAll_('settings', Object.keys(obj || {}).map(function (k) { return [k, String(obj[k])]; }));
  return { ok: true };
}

/* ========================== Хранилище ========================== */

function getSS_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(key) {
  var sh = getSS_().getSheetByName(TABLES[key].name);
  if (!sh) { ensureSheets_(false); sh = getSS_().getSheetByName(TABLES[key].name); }
  return sh;
}

function readRows_(key) {
  var sh = sheet_(key), n = TABLES[key].cols.length, last = sh.getLastRow();
  if (last < 2) return [];
  var tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, last - 1, n).getValues()
    .filter(function (r) { return String(r[0]) !== ''; })
    .map(function (r) {
      return r.map(function (v) { return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v; });
    });
}

function rowFromObj_(key, o) {
  return TABLES[key].cols.map(function (c) { var v = o[c[0]]; return (v === undefined || v === null) ? '' : v; });
}

function writeRows_(sh, rows, n) {
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, n).setValues(rows);
}

function replaceIds_(key, ids, newRows) {
  var sh = sheet_(key), n = TABLES[key].cols.length, rows = readRows_(key);
  var kept = rows.filter(function (r) { return !ids[String(r[0])]; });
  if (kept.length === rows.length) { writeRows_(sh, newRows, n); return; }
  rewrite_(sh, kept.concat(newRows), n, rows.length);
}

function replaceAll_(key, rows) {
  var sh = sheet_(key);
  rewrite_(sh, rows, TABLES[key].cols.length, Math.max(sh.getLastRow() - 1, 0));
}

function rewrite_(sh, rows, n, oldCount) {
  if (oldCount > 0) sh.getRange(2, 1, oldCount, n).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, n).setValues(rows);
}

function sortBy_(key, spec) {
  var sh = sheet_(key), last = sh.getLastRow();
  if (last > 2) sh.getRange(2, 1, last - 1, TABLES[key].cols.length).sort(spec);
}

/* ============================ Утилиты ============================ */

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function randomToken_(len) {
  var a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', s = '';
  for (var i = 0; i < len; i++) s += a.charAt(Math.floor(Math.random() * a.length));
  return s;
}
