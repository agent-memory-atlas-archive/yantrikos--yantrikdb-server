/** Command palette (Ctrl+K). Items are supplied by the app; this owns the UI. */

import { html } from '../core/html.js';
import { icon } from './icons.js';
import { openModal, closeModal } from './overlay.js';

const $ = (id) => document.getElementById(id);

/** @param {{title:string,hint:string,icon:string,run:()=>void}[]} items */
export function openPalette(items) {
  let selected = 0;
  let list = items;

  openModal(html`<div class="pal" role="dialog" aria-label="Command palette"><input id="pal-q" placeholder="Jump to a page, database or action…" autocomplete="off"><div class="list" id="pal-list"></div></div>`);

  const paint = () => {
    $('pal-list').innerHTML = (
      list.length
        ? list.map((x, i) => html`<div class="it ${i === selected ? 'sel' : ''}" data-i="${i}"><span class="muted">${icon(x.icon)}</span>${x.title}<span>${x.hint}</span></div>`)
        : html`<div class="empty">No matches</div>`
    ).toString();
  };
  const run = (i) => {
    const item = list[i];
    closeModal();
    if (item) item.run();
  };

  const input = $('pal-q');
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    list = items.filter((x) => x.title.toLowerCase().includes(q));
    selected = 0;
    paint();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      selected = Math.min(selected + 1, list.length - 1);
      paint();
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      selected = Math.max(selected - 1, 0);
      paint();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      run(selected);
    }
  });
  $('pal-list').addEventListener('click', (e) => {
    const row = e.target.closest('.it');
    if (row) run(Number(row.dataset.i));
  });
  paint();
  input.focus();
}
