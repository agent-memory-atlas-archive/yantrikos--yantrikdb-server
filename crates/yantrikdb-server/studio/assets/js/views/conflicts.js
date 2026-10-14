/** Conflicts: read-only view of detected contradictions. */

import { html } from '../core/html.js';
import { api } from '../core/api.js';
import { actions } from '../core/actions.js';
import { epochToIso } from '../core/format.js';
import { databaseById } from '../app/state.js';
import { reload } from '../app/host.js';
import { badge, pageHead, segmented, empty } from '../ui/components.js';

const state = { status: 'open' };

export default {
  async render({ params }) {
    const id = Number(params.db);
    const db = databaseById(id);
    if (!db) return empty('db', 'Database not found.');
    const r = await api.get(`/v1/admin/ops/databases/${id}/conflicts?limit=200${state.status ? `&status=${state.status}` : ''}`);
    const list = r.conflicts || r.items || [];

    return html`${pageHead({ crumb: `Databases / ${db.name}`, title: 'Conflicts', sub: 'contradictions detected between memories', right: badge(list.length, list.length && state.status === 'open' ? 'warn' : '') })}
      <div class="toolbar rise">${segmented([['open', 'Open'], ['resolved', 'Resolved'], ['', 'All']], state.status, 'conflicts.status')}
        <span class="muted" style="font-size:.76rem">Resolution is performed through the data-plane API / agents; this view is read-only.</span></div>
      ${list.length
        ? html`<div class="gridwrap rise"><table><thead><tr><th>Detected</th><th>Type</th><th>Priority</th><th>Entity</th><th>Reason</th><th>Memory A</th><th>Memory B</th><th>Status</th></tr></thead><tbody>
          ${list.map((c) => html`<tr><td class="mono">${epochToIso(c.detected_at)}</td><td>${badge(c.conflict_type, 'warn')}</td><td>${c.priority}</td><td>${c.entity || ''}</td><td class="clip" style="max-width:320px">${c.detection_reason || ''}</td><td class="mono muted">${String(c.memory_a).slice(0, 8)}</td><td class="mono muted">${String(c.memory_b).slice(0, 8)}</td><td>${badge(c.status, c.status === 'open' ? 'warn' : 'ok')}</td></tr>`)}</tbody></table></div>`
        : empty('check', `No ${state.status} conflicts. The memory is internally consistent.`)}`;
  },
};

actions({ 'conflicts.status': (el) => { state.status = el.dataset.value; reload(); } });
