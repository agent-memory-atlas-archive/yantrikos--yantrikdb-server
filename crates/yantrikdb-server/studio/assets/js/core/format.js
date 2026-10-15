/** Pure formatting helpers. No DOM access — unit-testable in Node. */

export const nf = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));

/** Compact count: 12 400 → "12.4k". */
export function compact(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return nf(n);
}

export function bytes(b) {
  if (b == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = Number(b);
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return v.toFixed(i ? 1 : 0) + ' ' + units[i];
}

/** Seconds → "3d 4h" / "2h 5m" / "4m 9s" / "12s". */
export function duration(secs) {
  const s = Math.floor(secs || 0);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/** Milliseconds with adaptive precision. */
export function ms(v) {
  if (v == null) return '—';
  return (v < 1 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)) + ' ms';
}

/** ISO-ish timestamp → "YYYY-MM-DD HH:MM:SS". */
export const timestamp = (s) => String(s ?? '').replace('T', ' ').slice(0, 19);

export const hhmm = (epochSecs) => new Date(epochSecs * 1000).toTimeString().slice(0, 5);
export const hhmmss = (epochSecs) => new Date(epochSecs * 1000).toTimeString().slice(0, 8);

export function epochToIso(secs) {
  const n = Number(secs);
  return Number.isFinite(n) ? new Date(n * 1000).toISOString().replace('T', ' ').slice(0, 19) : String(secs ?? '');
}

/** Round a chart maximum up to a 1/2/5 × 10ⁿ boundary. */
export function niceMax(m) {
  if (!(m > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  const n = m / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
