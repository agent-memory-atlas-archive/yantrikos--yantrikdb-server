/** Search-term highlighting over *escaped* text (safe by construction). */

import { raw, escape } from '../core/html.js';

const regexEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Wrap each query word (≥3 chars) in <mark>. Text is escaped first. */
export function highlight(text, query) {
  const escaped = escape(text);
  const words = String(query || '').split(/\s+/).filter((w) => w.length > 2).map((w) => regexEscape(escape(w)));
  if (!words.length) return raw(escaped);
  return raw(escaped.replace(new RegExp(`(${words.join('|')})`, 'gi'), '<mark>$1</mark>'));
}

