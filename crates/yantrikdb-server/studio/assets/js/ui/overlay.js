/**
 * Modal dialogs, side drawer and toasts.
 *
 * Dialogs are promise-based (`await confirmBox(...)`) so call sites read
 * linearly, and replace the browser's blocking prompt()/confirm().
 */

import { html } from '../core/html.js';
import { actions } from '../core/actions.js';
import { icon } from './icons.js';

const $ = (id) => document.getElementById(id);

// ── modal ──────────────────────────────────────────────

export function openModal(content) {
  const o = $('overlay');
  o.innerHTML = content.toString();
  o.classList.remove('hidden');
}

export function closeModal() {
  const o = $('overlay');
  o.classList.add('hidden');
  o.innerHTML = '';
}

export const isModalOpen = () => !$('overlay').classList.contains('hidden');

let pending = null; // resolver of the dialog currently on screen

function settle(value) {
  const resolve = pending;
  pending = null;
  closeModal();
  if (resolve) resolve(value);
}

export function confirmBox(title, body, label = 'Confirm', danger = false) {
  return new Promise((resolve) => {
    pending = resolve;
    openModal(html`<div class="modal" role="dialog" aria-modal="true" aria-label="${title}"><h3>${title}</h3><div class="muted">${body}</div>
      <div class="acts"><button class="btn ghost" data-action="modal.cancel">Cancel</button><button class="btn ${danger ? 'danger' : ''}" data-action="modal.ok" id="modal-ok">${label}</button></div></div>`);
    $('modal-ok').focus();
  });
}

/** @param {{label:string,type?:string,value?:any}[]} fields  @returns {Promise<string[]|null>} */
export function formBox(title, fields, label = 'Save') {
  return new Promise((resolve) => {
    pending = resolve;
    openModal(html`<div class="modal" role="dialog" aria-modal="true" aria-label="${title}"><h3>${title}</h3>
      ${fields.map((f, i) => html`<label for="mf${i}">${f.label}</label><input id="mf${i}" type="${f.type || 'text'}" value="${f.value ?? ''}" autocomplete="off" data-on-enter="modal.ok">`)}
      <div class="acts"><button class="btn ghost" data-action="modal.cancel">Cancel</button><button class="btn" data-action="modal.ok">${label}</button></div></div>`);
    $('mf0').focus();
    pending.collect = () => fields.map((_, i) => $('mf' + i).value);
  });
}

actions({
  'modal.cancel': () => settle(false),
  'modal.ok': () => {
    const collect = pending && pending.collect;
    settle(collect ? collect() : true);
  },
});

/** A form dialog resolves null (not false) when cancelled. */
export async function form(title, fields, label) {
  const result = await formBox(title, fields, label);
  return result === false ? null : result;
}

// Clicking the backdrop dismisses.
export function installOverlayDismiss() {
  $('overlay').addEventListener('mousedown', (e) => {
    if (e.target.id === 'overlay') {
      if (pending) settle(false);
      else closeModal();
    }
  });
}

// ── drawer ─────────────────────────────────────────────

export function openDrawer(title, body) {
  const d = $('drawer');
  d.innerHTML = html`<h3>${title}<span class="spacer"></span><button class="btn ghost sm" data-action="drawer.close">Close</button></h3>${body}`.toString();
  d.classList.remove('hidden');
}

export function closeDrawer() {
  $('drawer').classList.add('hidden');
}

export const isDrawerOpen = () => !$('drawer').classList.contains('hidden');

actions({ 'drawer.close': closeDrawer });

/** Dismiss whatever overlay is topmost. Returns true if something closed. */
export function dismissTop() {
  if (isModalOpen()) {
    if (pending) settle(false);
    else closeModal();
    return true;
  }
  if (isDrawerOpen()) {
    closeDrawer();
    return true;
  }
  return false;
}

// ── toast ──────────────────────────────────────────────

let toastTimer;
/** @param {'ok'|'bad'|''} kind */
export function toast(message, kind = '') {
  const t = $('toast');
  const glyph = kind === 'bad' ? 'x' : kind === 'ok' ? 'check' : 'info';
  t.innerHTML = html`${icon(glyph)}<span>${message}</span>`.toString();
  t.className = `toast ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 4200);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied', 'ok');
  } catch {
    toast('Copy is not available in this context', 'bad');
  }
}

