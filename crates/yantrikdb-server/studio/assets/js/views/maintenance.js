/**
 * Maintenance: autonomous-hygiene counters and on-demand runs.
 *
 * A run is a *background job*: the server answers 202 at once and reports
 * progress as `maintenance_run` in the overview. This view therefore always
 * has something to show — "running since…", "finished", or "failed: …" —
 * and never leaves a button that appears to do nothing.
 */

import { html } from '../core/html.js';
import { api } from '../core/api.js';
import { actions } from '../core/actions.js';
import { nf, ms, duration, timestamp } from '../core/format.js';
import { can, overview } from '../app/state.js';
import { fetchOverview } from '../app/overview.js';
import { renderRoute } from '../app/host.js';
import { fetchIfMissing } from './_data.js';
import { toast, confirmBox } from '../ui/overlay.js';
import { icon } from '../ui/icons.js';
import { badge, tile, pageHead, panel, alertBox, unavailable } from '../ui/components.js';

let wasRunning = false;
let fastPoll = null;

/** Why can't this node run maintenance? `null` when it can. */
export function disabledReason(o) {
  if (!o.accepts_writes) {
    const leader = o.cluster && o.cluster.leader_addr;
    return `This node is a follower — maintenance mutates state and runs on the leader only${leader ? ` (${leader})` : ''}.`;
  }
  if (o.maintenance_run && o.maintenance_run.running) return 'A maintenance run is already in progress on this node.';
  return null;
}

function runBanner(run) {
  if (!run || (!run.running && !run.started_at)) return '';
  const target = run.tenant ? `“${run.tenant}”` : 'all databases';
  if (run.running) {
    const secs = Math.max(0, Math.round((Date.now() - Date.parse(run.started_at)) / 1000));
    return alertBox('warn', `Maintenance running on ${target} — ${duration(secs)} so far`, `Started by ${run.started_by || 'unknown'} at ${timestamp(run.started_at)}. Large databases can take several minutes; queries on them may be slow until it finishes.`);
  }
  return run.ok
    ? alertBox('ok', `Maintenance finished on ${target}`, `Completed ${timestamp(run.finished_at)}${run.results ? ` · ${run.results.length} database(s) processed` : ''}.`)
    : alertBox('bad', `Maintenance failed on ${target}`, run.error || 'Unknown error.');
}

export default {
  async render() {
    let o;
    try {
      o = await fetchIfMissing();
    } catch (e) {
      return html`${pageHead({ crumb: 'Operations', title: 'Maintenance' })}${unavailable('Maintenance status unavailable', e.message)}`;
    }
    const run = o.maintenance_run;
    // Announce completion once, even if the user was on another page when it ended.
    if (wasRunning && run && !run.running) {
      toast(run.ok ? 'Maintenance finished' : `Maintenance failed: ${run.error || 'unknown error'}`, run.ok ? 'ok' : 'bad');
    }
    wasRunning = !!(run && run.running);

    const byDb = Object.fromEntries((o.maintenance || []).map((m) => [m.database, m]));
    const sum = (k) => (o.maintenance || []).reduce((a, m) => a + (m[k] || 0), 0);
    const admin = can('admin');
    const reason = disabledReason(o);

    const runAll = admin
      ? html`<button class="btn" data-action="maintenance.run" data-tenant="" ${reason ? 'disabled' : ''}>${icon('play')}Run on all</button>`
      : '';
    const row = (d) => {
      const m = byDb[d.name] || {};
      return html`<tr><td><b>${d.name}</b></td><td class="num">${nf(m.runs || 0)}</td><td class="num">${m.failures ? badge(m.failures, 'bad') : 0}</td><td class="num">${nf(m.consolidations || 0)}</td><td class="num">${nf(m.conflicts_resolved || 0)}</td><td class="num">${nf(m.triggers_pruned || 0)}</td><td class="num">${nf(m.entities_linked || 0)}</td><td class="num">${m.last_duration_ms ? ms(m.last_duration_ms) : '—'}</td>
        <td class="rowacts">${admin ? html`<button class="btn ghost sm" data-action="maintenance.run" data-tenant="${d.name}" ${reason ? 'disabled' : ''}>Run now</button>` : ''}</td></tr>`;
    };

    return html`${pageHead({ crumb: 'Operations', title: 'Maintenance', sub: 'autonomous memory hygiene', right: runAll })}
      ${runBanner(run)}
      ${admin && reason && !(run && run.running) ? alertBox('warn', 'Run actions are unavailable on this node', reason) : ''}
      <div class="tiles">
        ${tile({ label: 'Runs', glyph: 'jobs', value: nf(sum('runs')) })}
        ${tile({ label: 'Consolidations', glyph: 'link', value: nf(sum('consolidations')) })}
        ${tile({ label: 'Conflicts resolved', glyph: 'check', value: nf(sum('conflicts_resolved')) })}
        ${tile({ label: 'Failures', glyph: 'warn', value: nf(sum('failures')), tone: sum('failures') ? 'bad' : '' })}
      </div>
      ${panel('Per database', html`<div class="gridwrap"><table><thead><tr><th>Database</th><th>Runs</th><th>Failures</th><th>Consolidations</th><th>Conflicts resolved</th><th>Triggers pruned</th><th>Entities linked</th><th>Last run</th><th></th></tr></thead><tbody>${(o.databases || []).map(row)}</tbody></table></div>`, { glyph: 'wrench', right: 'counters since process start' })}
      ${run && run.results ? panel('Last run report', html`<pre class="json">${JSON.stringify(run.results, null, 2)}</pre>`) : ''}`;
  },
};

/** Poll quickly while a run is active so progress and completion appear promptly. */
function watchRun() {
  clearInterval(fastPoll);
  fastPoll = setInterval(async () => {
    try {
      await fetchOverview();
    } catch {
      /* the banner keeps the last known state */
    }
    const running = !!(overview() && overview().maintenance_run && overview().maintenance_run.running);
    renderRoute({ quiet: true });
    if (!running) clearInterval(fastPoll);
  }, 2000);
}

actions({
  'maintenance.run': async (el) => {
    const tenant = el.dataset.tenant;
    const what = tenant ? html`“${tenant}”` : 'every database';
    const ok = await confirmBox(
      'Run maintenance',
      html`Run a maintenance cycle on ${what}? It runs in the background and can take several minutes on large databases; queries against them may be slow until it finishes.`,
      'Start',
    );
    if (!ok) return;
    try {
      await api.post(`/v1/admin/ops/maintenance/run${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''}`, {}, { timeoutMs: 15_000 });
      toast('Maintenance started — running in the background', 'ok');
      wasRunning = true;
      await fetchOverview().catch(() => {});
      renderRoute({ quiet: true });
      watchRun();
    } catch (e) {
      toast(e.message, 'bad');
    }
  },
});
