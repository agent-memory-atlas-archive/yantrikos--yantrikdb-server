/** Database management: list, create, quotas. */

import { html } from '../core/html.js';
import { api } from '../core/api.js';
import { actions } from '../core/actions.js';
import { nf, bytes, timestamp } from '../core/format.js';
import { can, databaseById } from '../app/state.js';
import { fetchOverview } from '../app/overview.js';
import { reload } from '../app/host.js';
import { toast, form } from '../ui/overlay.js';
import { icon } from '../ui/icons.js';
import { pageHead, panel, empty } from '../ui/components.js';

const $ = (id) => document.getElementById(id);

export default {
  async render() {
    const { databases } = await api.get('/v1/admin/databases');
    const row = (d) => {
      const live = databaseById(d.id) || {};
      return html`<tr><td><b>${d.name}</b></td><td class="mono">${d.id}</td><td class="num">${nf(live.active_memories)}</td><td class="num">${nf(live.entities)}</td><td class="num">${bytes(live.storage_bytes)}</td><td class="num">${d.token_count}</td><td class="mono">${timestamp(d.created_at)}</td>
        <td class="rowacts"><button class="btn ghost sm" data-action="nav" data-to="db/${d.id}/browse">Browse</button><button class="btn ghost sm" data-action="nav" data-to="db/${d.id}/query">Query</button>
          ${can('admin') ? html`<button class="btn ghost sm" data-action="db.quota" data-id="${d.id}" data-name="${d.name}">Quota</button>` : ''}</td></tr>`;
    };
    const create = can('admin')
      ? html`<div class="toolbar" style="margin:0"><input id="db-name" placeholder="new database name" data-on-enter="db.create"/><button class="btn" data-action="db.create">${icon('plus')}Create</button></div>`
      : '';
    return html`${pageHead({ crumb: 'Databases', title: 'Manage databases', right: create })}
      ${panel('Databases', html`${databases.length
        ? html`<div class="gridwrap"><table><thead><tr><th>Name</th><th>ID</th><th>Memories</th><th>Entities</th><th>Storage</th><th>Tokens</th><th>Created</th><th></th></tr></thead><tbody>${databases.map(row)}</tbody></table></div>`
        : empty('db', 'No databases yet.')}
        <div class="note">Creation replicates through YRP — created on every node, survives failover.</div>`)}`;
  },
};

actions({
  'db.create': async () => {
    const name = $('db-name').value.trim();
    if (!name) return;
    try {
      const r = await api.post('/v1/admin/databases', { name });
      toast(`Database "${name}" created (id ${r.id})`, 'ok');
      await fetchOverview();
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    }
  },

  'db.quota': async (el) => {
    const { id, name } = el.dataset;
    try {
      const q = await api.get(`/v1/admin/databases/${id}/quota`);
      const v = await form(`Quota — ${name}`, [
        { label: 'max_memories', value: q.max_memories, type: 'number' },
        { label: 'max_rps', value: q.max_rps, type: 'number' },
      ]);
      if (!v) return;
      await api.put(`/v1/admin/databases/${id}/quota`, { max_memories: Number(v[0]), max_rps: Number(v[1]) });
      toast('Quota updated', 'ok');
    } catch (e) {
      toast(e.message, 'bad');
    }
  },
});
