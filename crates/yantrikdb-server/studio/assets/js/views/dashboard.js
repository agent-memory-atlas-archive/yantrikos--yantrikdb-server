/** Dashboard: health, KPIs, live charts, alerts, databases, handler latency. */

import { html } from '../core/html.js';
import { nf, compact, bytes, duration, ms } from '../core/format.js';
import { fetchIfMissing } from './_data.js';
import { overviewStatus } from '../app/state.js';
import { computeAlerts, healthScore } from '../app/health.js';
import { deriveSeries, last } from '../app/series.js';
import { areaChart, sparkline, ring } from '../ui/charts.js';
import { countUp } from '../ui/countup.js';
import { icon } from '../ui/icons.js';
import { alertBox, tile, panel, empty, unavailable, staleBanner, pageHead } from '../ui/components.js';

function databaseCard(d) {
  const segments = [
    { v: d.active_memories || 0, c: 'var(--accent)' },
    { v: d.consolidated_memories || 0, c: 'var(--accent3)' },
    { v: d.tombstoned_memories || 0, c: 'var(--line2)' },
  ];
  const status = d.error
    ? html`<span class="badge bad">error</span>`
    : d.busy
      ? html`<span class="badge warn" title="A long-running operation holds this database's engine">engine busy</span>`
      : d.stale
        ? html`<span class="badge warn" title="Engine busy — showing the last known numbers">stale ${d.age_secs}s</span>`
        : d.open_conflicts
          ? html`<span class="badge warn">${d.open_conflicts} conflicts</span>`
          : html`<span class="badge ok">healthy</span>`;
  return html`<div class="dbcard" data-action="nav" data-to="db/${d.id}/browse">
    <div class="top"><span style="color:var(--accent)">${icon('db')}</span><b>${d.name}</b>${status}</div>
    <div class="body">${ring(segments, 84, 9, html`<b>${compact(d.active_memories)}</b><span>memories</span>`)}
      <dl><dt>entities</dt><dd>${compact(d.entities)}</dd><dt>edges</dt><dd>${compact(d.edges)}</dd><dt>operations</dt><dd>${compact(d.operations)}</dd><dt>triggers</dt><dd>${nf(d.pending_triggers)}</dd><dt>storage</dt><dd>${bytes(d.storage_bytes)}</dd></dl></div>
    <div class="foot"><button class="btn ghost sm" data-action="nav" data-to="db/${d.id}/browse">${icon('mem')}Browse</button><button class="btn ghost sm" data-action="nav" data-to="db/${d.id}/query">${icon('search')}Query</button></div></div>`;
}

function handlerTable(handlers) {
  const hs = handlers.filter((h) => h.count > 0).slice(0, 12);
  if (!hs.length) return empty('bolt', 'No traffic recorded yet.');
  const maxLat = Math.max(1, ...hs.map((h) => h.p99_ms));
  const layer = (w, bg) => html`<i style="position:absolute;left:0;top:0;bottom:0;width:${Math.max(1, (w / maxLat) * 100)}%;background:${bg}"></i>`;
  return html`<div class="gridwrap"><table><thead><tr><th>Handler</th><th>Calls</th><th style="width:30%">Latency profile</th><th>avg</th><th>p50</th><th>p95</th><th>p99</th></tr></thead><tbody>
    ${hs.map((h) => html`<tr><td class="mono">${h.handler}</td><td class="num">${nf(h.count)}</td>
      <td><div style="position:relative;height:10px;background:var(--line);border-radius:6px;overflow:hidden">${layer(h.p99_ms, 'rgba(251,113,133,.45)')}${layer(h.p95_ms, 'rgba(176,124,255,.7)')}${layer(h.p50_ms, 'var(--accent3)')}</div></td>
      <td class="num">${ms(h.avg_ms)}</td><td class="num">${ms(h.p50_ms)}</td><td class="num">${ms(h.p95_ms)}</td>
      <td class="num">${h.p99_ms >= 1000 ? html`<span class="badge warn">${ms(h.p99_ms)}</span>` : ms(h.p99_ms)}</td></tr>`)}
  </tbody></table></div>`;
}

export default {
  async render() {
    let o;
    try {
      o = await fetchIfMissing();
    } catch (e) {
      return html`${pageHead({ crumb: 'Server', title: 'Dashboard' })}${unavailable('Server overview unavailable', e.message)}`;
    }
    const health = overviewStatus();
    const dbs = o.databases || [];
    const S = deriveSeries(o.history);
    const total = (k) => dbs.reduce((a, d) => a + (d[k] || 0), 0);
    const alerts = computeAlerts(o);
    const crit = alerts.some((a) => a[0] === 'bad');
    const score = healthScore(alerts);
    const tone = crit ? 'var(--bad)' : alerts.length ? 'var(--warn)' : 'var(--ok)';
    const state = crit ? 'Attention required' : alerts.length ? 'Operational with warnings' : 'All systems nominal';
    const rps = last(S.rps);
    const p95 = last(S.p95);
    const trend = (series, n = 40) => series.map((p) => p.v).slice(-n);

    return html`
      ${health.error && health.hasData ? staleBanner(health.ageSecs, health.error) : ''}
      <div class="hero rise">${ring([{ v: score, c: tone }, { v: 100 - score, c: 'transparent' }], 96, 9, html`<b style="color:${tone}">${score}</b><span>health</span>`)}
        <div style="flex:1;min-width:0"><h1>${state}</h1>
          <p>${o.mode} mode · ${o.cluster ? `node ${o.cluster.node_id} (${o.cluster.role}), term ${o.cluster.term}` : 'standalone node'} · ${dbs.length} database${dbs.length === 1 ? '' : 's'} · up ${duration(o.uptime_secs)}</p>
          <div class="chips"><span class="chip"><span class="dot ${o.accepts_writes ? 'ok' : 'warn'}"></span>${o.accepts_writes ? 'accepting writes' : 'read-only'}</span>
            <span class="chip">${o.engines_loaded} engines · ${o.workers} workers</span><span class="chip">v<b>${o.version}</b></span>
            ${alerts.length ? html`<span class="chip" style="color:${tone}">${alerts.length} alert${alerts.length === 1 ? '' : 's'}</span>` : ''}</div></div></div>
      <div class="tiles">
        ${tile({ label: 'Memories', glyph: 'mem', value: countUp('mem', total('active_memories')), sub: `${nf(total('consolidated_memories'))} consolidated · ${nf(total('tombstoned_memories'))} forgotten` })}
        ${tile({ label: 'Throughput', glyph: 'bolt', value: countUp('rps', rps, (v) => Number(v).toFixed(1) + '/s'), sub: `${nf(o.requests_total)} requests total`, spark: sparkline(trend(S.rps), 'var(--accent)') })}
        ${tile({ label: 'p95 latency', glyph: 'flag', value: countUp('p95', p95, ms), sub: 'worst handler', spark: sparkline(trend(S.p95), 'var(--accent2)') })}
        ${tile({ label: 'In flight', glyph: 'jobs', value: countUp('infl', o.inflight), sub: `of ${o.max_inflight} max`, spark: sparkline(trend(S.inflight), 'var(--accent3)'), tone: o.inflight > o.max_inflight * 0.75 ? 'warn' : '' })}
        ${tile({ label: 'Knowledge graph', glyph: 'link', value: countUp('ent', total('entities'), compact), sub: `${nf(total('edges'))} edges` })}
        ${tile({ label: 'Storage', glyph: 'disk', value: bytes(total('storage_bytes')), sub: `${dbs.length} database(s)` })}
        ${tile({ label: 'Open conflicts', glyph: 'warn', value: countUp('conf', total('open_conflicts')), sub: `${nf(total('pending_triggers'))} pending triggers`, tone: total('open_conflicts') ? 'warn' : '' })}
      </div>
      <div class="row2">
        ${panel('Throughput', areaChart({ series: [{ name: 'req/s', color: '#7c8cff', data: S.rps }], fmt: (v) => (v >= 10 ? Math.round(v) : v.toFixed(1)) }), { glyph: 'bolt', right: html`<b>${rps.toFixed(1)}</b> req/s · last hour` })}
        ${panel('Latency', areaChart({ series: [{ name: 'p95', color: '#b07cff', data: S.p95 }, { name: 'p99', color: '#fb7185', data: S.p99 }], fmt: (v) => (v >= 10 ? Math.round(v) : v.toFixed(1)), fmt2: ms }), { glyph: 'flag', right: 'worst handler · ms' })}
        ${panel('Concurrency', areaChart({ series: [{ name: 'in flight', color: '#35d4ee', data: S.inflight }], min: 4, fmt: (v) => Math.round(v) }), { glyph: 'jobs', right: 'in-flight operations' })}
      </div>
      ${panel('Health & alerts', alerts.length ? alerts.map(([tone, title, detail]) => alertBox(tone, title, detail)) : alertBox('ok', 'All clear', 'No active alerts on this node.'), { glyph: 'shield' })}
      ${panel('Databases', dbs.length ? html`<div class="dbgrid">${dbs.map(databaseCard)}</div>` : empty('db', 'No databases yet.'), { glyph: 'db', right: html`<a href="#/databases">manage →</a>` })}
      ${panel('Request latency by handler', handlerTable(o.handlers || []), { glyph: 'bolt', right: 'since process start · bars show p50 · p95 · p99' })}`;
  },
};

