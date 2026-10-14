/** Presentational building blocks. Pure functions → safe HTML. */

import { html } from '../core/html.js';
import { icon } from './icons.js';

export const badge = (text, tone = '') => html`<span class="badge ${tone}">${text}</span>`;

export const typeBadge = (type) => html`<span class="badge t-${String(type || '').replace(/[^a-z]/gi, '')}">${type || '—'}</span>`;

export const typeColor = (type) =>
  ({ episodic: 'var(--t-epi)', semantic: 'var(--t-sem)', procedural: 'var(--t-pro)' })[type] || 'var(--t-oth)';

export const bar = (pct, width) =>
  html`<div class="bar" style="${width ? `width:${width}px` : ''}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;

export const empty = (iconName, text) => html`<div class="empty">${icon(iconName)}${text}</div>`;

/** @param {'bad'|'warn'|'ok'} tone */
export function alertBox(tone, title, detail) {
  const glyph = tone === 'bad' ? 'x' : tone === 'ok' ? 'check' : 'warn';
  return html`<div class="alert ${tone}"><span class="ai">${icon(glyph)}</span><div><b>${title}</b><span>${detail}</span></div></div>`;
}

export function pageHead({ crumb = '', title, sub = '', right = '' }) {
  return html`<div class="crumbs rise">${crumb}</div>
    <div class="pagehead rise"><h2>${title}</h2>${sub ? html`<span class="sub2">${sub}</span>` : ''}<span class="spacer"></span>${right}</div>`;
}

export function tile({ label, glyph, value, sub = '', spark = '', tone = '' }) {
  return html`<div class="tile rise ${tone}"><div class="k">${icon(glyph)}${label}</div><div class="v">${value}</div><div class="s">${sub}</div>${spark ? html`<div class="sp">${spark}</div>` : ''}</div>`;
}

export function panel(title, body, { glyph = '', right = '' } = {}) {
  return html`<div class="panel rise"><h3>${glyph ? icon(glyph) : ''} ${title}${right ? html`<span class="r">${right}</span>` : ''}</h3>${body}</div>`;
}

/** Segmented control. `items` = [[value, label]]; clicks fire `action` with data-value. */
export function segmented(items, current, action) {
  return html`<div class="seg">${items.map(([v, l]) => html`<button class="${v === current ? 'on' : ''}" data-action="${action}" data-value="${v}">${l}</button>`)}</div>`;
}

/** A page that could not load its data: say why, offer a retry, never go blank. */
export function unavailable(title, detail) {
  return html`${alertBox('bad', title, detail)}
    <div class="toolbar rise"><button class="btn" data-action="app.retry">${icon('jobs')}Try again</button>
    <span class="muted" style="font-size:.78rem">If this node is busy (for example running maintenance), other nodes in the cluster may still answer.</span></div>`;
}

/** Shown above stale numbers while the overview is failing. */
export const staleBanner = (ageSecs, error) =>
  alertBox('warn', `Showing the last known data (${ageSecs}s old)`, `${error} — figures below may be out of date.`);

/** Wrap a <table> in the scrollable grid frame. */
export const gridWrap = (inner, extra = '') => html`<div class="gridwrap ${extra}"><table>${inner}</table></div>`;
