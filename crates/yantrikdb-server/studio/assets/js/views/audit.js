/** Audit trail: replicated, quorum-durable change log with filtering and export. */

import { html } from '../core/html.js';
import { api } from '../core/api.js';
import { actions } from '../core/actions.js';
import { timestamp } from '../core/format.js';
import { reload, refresh } from '../app/host.js';
import { icon } from '../ui/icons.js';
import { badge, pageHead, empty } from '../ui/components.js';
import { downloadCsv } from '../ui/csv.js';

const state = { rows: [], filter: '', limit: 200 };

/** Filter rows by a free-text needle over actor/action/target. Pure. */
export function filterAudit(rows, needle) {
  const q = needle.toLowerCase();
  return q ? rows.filter((a) => JSON.stringify([a.actor, a.action, a.target]).toLowerCase().includes(q)) : rows;
}

export default {
  async render({ fetch }) {
    if (fetch) state.rows = (await api.get(`/v1/admin/audit?limit=${state.limit}`)).audit;
    const rows = filterAudit(state.rows, state.filter);
    const actors = {};
    state.rows.forEach((a) => { actors[a.actor] = (actors[a.actor] || 0) + 1; });
    const top = Object.entries(actors).sort((a, b) => b[1] - a[1]).slice(0, 8);

    return html`${pageHead({ crumb: 'Security', title: 'Audit trail', sub: 'replicated across all nodes · quorum-durable' })}
      <div class="facets rise">${top.map(([actor, n]) => html`<span class="facet ${state.filter === actor ? 'on' : ''}" data-action="audit.actor" data-value="${state.filter === actor ? '' : actor}"><i style="background:var(--accent)"></i>${actor}<b>${n}</b></span>`)}</div>
      <div class="toolbar rise"><input id="audit-filter" class="grow" placeholder="Filter by actor, action or target…  ( / )" value="${state.filter}" data-on-input="audit.filter"/>
        <select data-on-change="audit.limit">${[100, 200, 500, 1000].map((n) => html`<option ${state.limit === n ? 'selected' : ''}>${n}</option>`)}</select>
        <button class="btn ghost" data-action="audit.csv">${icon('dl')}CSV</button></div>
      ${rows.length
        ? html`<div class="gridwrap rise"><table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Log #</th></tr></thead><tbody>
          ${rows.map((a) => html`<tr><td class="mono">${timestamp(a.at)}</td><td><b>${a.actor}</b></td><td>${badge(a.action, 'accent')}</td><td>${a.target}</td><td class="num">${a.yrp_index}</td></tr>`)}</tbody></table></div>`
        : empty('list', 'No audit entries.')}`;
  },
};

actions({
  'audit.filter': (el) => { state.filter = el.value; refresh(); },
  'audit.actor': (el) => { state.filter = el.dataset.value; refresh(); },
  'audit.limit': (el) => { state.limit = Number(el.value); reload(); },
  'audit.csv': () => downloadCsv(state.rows, ['at', 'actor', 'action', 'target', 'yrp_index'], 'audit.csv'),
});
