/** Derive chart series from the server's sampled history. Pure. */

/**
 * @param {{t:number,requests:number,inflight:number,p95_ms:number,p99_ms:number}[]} history
 * @returns {{rps:{t:number,v:number}[], inflight:{t:number,v:number}[], p95:{t:number,v:number}[], p99:{t:number,v:number}[]}}
 */
export function deriveSeries(history = []) {
  const rps = [];
  for (let i = 1; i < history.length; i++) {
    const dt = history[i].t - history[i - 1].t || 1;
    const delta = history[i].requests - history[i - 1].requests;
    rps.push({ t: history[i].t, v: Math.max(0, delta / dt) });
  }
  const pick = (k) => history.map((s) => ({ t: s.t, v: s[k] }));
  return { rps, inflight: pick('inflight'), p95: pick('p95_ms'), p99: pick('p99_ms') };
}

export const last = (series) => (series.length ? series[series.length - 1].v : 0);
