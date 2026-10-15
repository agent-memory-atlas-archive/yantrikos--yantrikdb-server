/**
 * Guarded Web Storage. Storage can be absent or throw (private windows,
 * blocked site data), so every access is wrapped and the app works without it.
 */

const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const local = {
  get: (k, d = null) => safe(() => localStorage.getItem(k) ?? d, d),
  set: (k, v) => safe(() => localStorage.setItem(k, v), undefined),
  getJson(k, d) {
    return safe(() => JSON.parse(localStorage.getItem(k)) ?? d, d);
  },
  setJson(k, v) {
    safe(() => localStorage.setItem(k, JSON.stringify(v)), undefined);
  },
};

/** Session credentials live in sessionStorage: gone when the tab closes. */
export const session = {
  get: (k) => safe(() => sessionStorage.getItem(k), null),
  set: (k, v) => safe(() => sessionStorage.setItem(k, v), undefined),
  remove: (k) => safe(() => sessionStorage.removeItem(k), undefined),
};
