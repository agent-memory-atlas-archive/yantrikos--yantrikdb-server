/** Jobs: the durable background queue. */

import { html } from '../core/html.js';
import { api } from '../core/api.js';
import { actions } from '../core/actions.js';
import { epochToIso } from '../core/format.js';
import { reload } from '../app/host.js';
import { badge, pageHead, segmented, empty } from '../ui/components.js';

const state = { filter: '' };
const TONES = { Succeeded: 'ok', Failed: 'bad', Pending: 'warn', Leased: 'accent' };

/** Server timestamps arrive as `{secs_since_epoch}` objects or strings. */
const when = (t) => (t == null ? '—' : typeof t === 'object' && t.secs_since_epoch != null ? epochToIso(t.secs_since_epoch) : String(t));
const plain = (v) => JSON.stringify(v).replace(/[^\w-]/g, '');

export default {
  async render() {
    const { jobs = [] } = await api.get(`/v1/admin/ops/jobs?limit=200${state.filter ? `&state=${state.filter}` : ''}`);
    return html`${pageHead({ crumb: 'Operations', title: 'Jobs', sub: 'durable background queue', right: badge(jobs.length, 'accent') })}
      <div class="toolbar rise">${segmented([['', 'All'], ['Pending', 'Pending'], ['Leased', 'Leased'], ['Succeeded', 'Succeeded'], ['Failed', 'Failed'], ['Cancelled', 'Cancelled']], state.filter, 'jobs.filter')}</div>
      ${jobs.length
        ? html`<div class="gridwrap rise"><table><thead><tr><th>Kind</th><th>State</th><th>Tenant</th><th>Created</th><th>Completed</th><th>Error</th><th>ID</th></tr></thead><tbody>
          ${jobs.map((j) => html`<tr><td>${j.kind}</td><td>${badge(j.state, TONES[j.state] || '')}</td><td class="num">${plain(j.tenant_id)}</td><td class="mono">${when(j.created_at)}</td><td class="mono">${when(j.completed_at)}</td><td class="clip muted" style="max-width:260px">${j.error_message || ''}</td><td class="mono muted">${plain(j.id).slice(0, 13)}</td></tr>`)}</tbody></table></div>`
        : empty('jobs', 'Queue is empty.')}`;
  },
};

actions({ 'jobs.filter': (el) => { state.filter = el.dataset.value; reload(); } });
