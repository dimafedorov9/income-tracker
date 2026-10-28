// Нижние панели (sheets) и подтверждения.
import { esc } from './util.js';

let openSheet = null;

export function sheet({ title, body, onMount, onClose }) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-bg"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip"></div>
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Закрыть">✕</button></div>
      <div class="sheet-body">${body}</div>
    </div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));
  const close = () => {
    if (!wrap.isConnected) return;
    wrap.classList.remove('in');
    setTimeout(() => wrap.remove(), 180);
    openSheet = null;
    onClose && onClose();
  };
  wrap.querySelector('.sheet-bg').onclick = close;
  wrap.querySelector('[data-close]').onclick = close;
  openSheet = close;
  onMount && onMount(wrap.querySelector('.sheet'), close);
  const first = wrap.querySelector('.sheet-body button, .sheet-body input, .sheet-body textarea');
  if (first && matchMedia('(pointer:fine)').matches) first.focus();
  return close;
}

export function closeSheet() { if (openSheet) openSheet(); }

export function confirmSheet(title, text, okLabel = 'Да', danger = false) {
  return new Promise(resolve => {
    let done = false;
    sheet({
      title,
      body: `<p class="sheet-text">${esc(text)}</p>
        <div class="row-btns"><button class="btn ghost" data-no>Отмена</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(okLabel)}</button></div>`,
      onMount: (el, close) => {
        el.querySelector('[data-yes]').onclick = () => { done = true; close(); resolve(true); };
        el.querySelector('[data-no]').onclick = () => close();
      },
      onClose: () => { if (!done) resolve(false); }
    });
  });
}

export function promptSheet(title, { label = '', value = '', type = 'text', okLabel = 'Готово', inputmode } = {}) {
  return new Promise(resolve => {
    let done = false;
    sheet({
      title,
      body: `<label class="field"><span>${esc(label)}</span><input type="${type}" ${inputmode ? `inputmode="${inputmode}"` : ''} value="${esc(value)}" data-in></label>
        <div class="row-btns"><button class="btn ghost" data-no>Отмена</button><button class="btn primary" data-yes>${esc(okLabel)}</button></div>`,
      onMount: (el, close) => {
        const inp = el.querySelector('[data-in]'); inp.focus(); inp.select();
        const ok = () => { done = true; close(); resolve(inp.value); };
        el.querySelector('[data-yes]').onclick = ok;
        inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
        el.querySelector('[data-no]').onclick = () => close();
      },
      onClose: () => { if (!done) resolve(null); }
    });
  });
}
