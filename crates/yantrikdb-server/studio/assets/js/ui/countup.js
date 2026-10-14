/**
 * Animated numbers. Returns markup showing the previous value, then eases to
 * the new one after paint. Values that did not change render statically.
 */

import { html } from '../core/html.js';
import { nf } from '../core/format.js';

const previous = new Map();

export function countUp(key, value, fmt = nf) {
  const id = `n_${key}`;
  const from = previous.get(key);
  previous.set(key, value);
  if (from == null || from === value || typeof document === 'undefined' || document.hidden) {
    return html`<span id="${id}">${fmt(value)}</span>`;
  }
  setTimeout(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 500);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (value - from) * eased);
      if (k < 1) requestAnimationFrame(step);
      else el.textContent = fmt(value);
    };
    requestAnimationFrame(step);
  }, 0);
  return html`<span id="${id}">${fmt(from)}</span>`;
}
