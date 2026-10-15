/** Light/dark theme. Persisted per browser; defaults to the OS preference. */

import { local } from '../core/storage.js';

const KEY = 'ydb_theme';

export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function initTheme() {
  const stored = local.get(KEY);
  applyTheme(stored || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  local.set(KEY, next);
  return next;
}
