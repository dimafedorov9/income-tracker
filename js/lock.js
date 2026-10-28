// Код на вход: 4 цифры, хранится на устройстве только в виде хеша SHA-256 с солью.
// Защищает от чужих глаз на разблокированном телефоне; доступ к данным на сервере закрыт токеном.
import { storage } from './util.js';
import { K } from './api.js';

const RELOCK_MS = 5 * 60 * 1000;
let hiddenAt = 0;

async function hash(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const lockEnabled = () => !!storage(K.lock)?.hash;
export const lockSupported = () => !!(window.crypto && crypto.subtle);

export async function setPin(pin) {
  const salt = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
  storage(K.lock, { salt, hash: await hash(pin, salt) });
}
export const clearPin = () => storage(K.lock, null);
export async function checkPin(pin) {
  const l = storage(K.lock);
  return !!l && (await hash(pin, l.salt)) === l.hash;
}

/** Показывает экран с цифровой клавиатурой. mode: 'unlock' | 'set'. Возвращает Promise с введённым кодом. */
export function pinScreen({ title, sub = '', mode = 'unlock', onCancel } = {}) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'lock';
    el.innerHTML = `<div class="lock-in">
      <h1>${title}</h1><p class="lock-sub">${sub}</p>
      <div class="dots" aria-live="polite">${'<i></i>'.repeat(4)}</div>
      <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? (onCancel ? '<button data-k="x" class="pk txt">Отмена</button>' : '<span></span>') : `<button class="pk" data-k="${k}" aria-label="${k === '⌫' ? 'Стереть' : k}">${k}</button>`).join('')}</div>
    </div>`;
    document.body.appendChild(el);
    document.body.classList.add('locked');
    let v = '';
    const dots = el.querySelectorAll('.dots i');
    const draw = () => dots.forEach((d, i) => d.classList.toggle('on', i < v.length));
    const close = () => { el.remove(); document.body.classList.remove('locked'); document.removeEventListener('keydown', onKey); };
    const press = async k => {
      if (k === 'x') { close(); onCancel && onCancel(); return; }
      if (k === '⌫') v = v.slice(0, -1);
      else if (v.length < 4) v += k;
      draw();
      if (v.length === 4) {
        if (mode === 'unlock') {
          if (await checkPin(v)) { close(); resolve(v); }
          else { el.querySelector('.dots').classList.add('bad'); setTimeout(() => { v = ''; draw(); el.querySelector('.dots').classList.remove('bad'); }, 450); }
        } else { const pin = v; setTimeout(() => { close(); resolve(pin); }, 120); }
      }
    };
    el.querySelectorAll('[data-k]').forEach(b => (b.onclick = () => press(b.dataset.k)));
    const onKey = e => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('⌫'); };
    document.addEventListener('keydown', onKey);
  });
}

/** Блокировать при запуске и после 5 минут в фоне. */
export function guard(start) {
  const lockNow = () => pinScreen({ title: 'Доходы', sub: 'Введите код' });
  document.addEventListener('visibilitychange', async () => {
    if (!lockEnabled()) return;
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > RELOCK_MS && !document.querySelector('.lock')) { await lockNow(); }
  });
  if (lockEnabled()) lockNow().then(start); else start();
}
