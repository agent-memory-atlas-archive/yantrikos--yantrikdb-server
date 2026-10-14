/** Tokens: mint, rotate, revoke. Plaintext is shown once and never persisted. */

import { html } from '../core/html.js';
import { api } from '../core/api.js';
import { actions } from '../core/actions.js';
import { timestamp } from '../core/format.js';
import { can } from '../app/state.js';
import { reload } from '../app/host.js';
import { toast, confirmBox, copyText } from '../ui/overlay.js';
import { icon } from '../ui/icons.js';
import { badge, pageHead, panel, empty } from '../ui/components.js';

const $ = (id) => document.getElementById(id);
let revealed = null; // { title, value } — held in memory only, cleared on navigation away

export default {
  async render() {
    const [{ tokens }, { databases }] = await Promise.all([api.get('/v1/admin/tokens'), api.get('/v1/admin/databases')]);
    const dbName = (id) => (databases.find((d) => d.id === id) || {}).name || `#${id}`;
    const admin = can('admin');

    const reveal = revealed
      ? html`<div class="reveal"><span><b>${revealed.title}</b><br>${revealed.value}</span><button class="btn ghost sm" data-action="token.copy">${icon('copy')}Copy</button></div>`
      : '';
    const mint = admin
      ? html`<div class="toolbar"><select id="token-db">${databases.map((d) => html`<option value="${d.id}">${d.name}</option>`)}</select><input id="token-label" class="grow" placeholder="label (optional)"/><button class="btn" data-action="token.mint">${icon('key')}Mint token</button></div>
          <div class="note" style="margin:-.3rem 0 .8rem">The plaintext token is shown once. Only its hash is stored + replicated.</div>`
      : '';
    const table = tokens.length
      ? html`<div class="gridwrap"><table><thead><tr><th>Label</th><th>Database</th><th>Hash</th><th>Created</th><th></th></tr></thead><tbody>
          ${tokens.map((t) => html`<tr><td><b>${t.label || '—'}</b></td><td>${dbName(t.database_id)}</td><td class="mono">${t.hash_prefix}…</td><td class="mono">${timestamp(t.created_at)}</td>
            <td class="rowacts">${admin ? html`<button class="btn warn sm" data-action="token.rotate" data-hash="${t.hash}">Rotate</button><button class="btn danger sm" data-action="token.revoke" data-hash="${t.hash}">Revoke</button>` : ''}</td></tr>`)}</tbody></table></div>`
      : empty('key', 'No active tokens.');

    return html`${pageHead({ crumb: 'Security', title: 'Tokens', sub: 'database access credentials', right: badge(`${tokens.length} active`, 'accent') })}
      ${panel('Access tokens', html`${reveal}${mint}${table}`)}`;
  },
};

actions({
  'token.mint': async () => {
    const database_id = Number($('token-db').value);
    if (!database_id) return toast('Create a database first', 'bad');
    try {
      const r = await api.post('/v1/admin/tokens', { database_id, label: $('token-label').value.trim() });
      revealed = { title: 'New token — copy now, shown once', value: r.token };
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    }
  },
  'token.copy': () => revealed && copyText(revealed.value),
  'token.rotate': async (el) => {
    if (!(await confirmBox('Rotate token', 'The old token stops working immediately; a new one is issued.', 'Rotate'))) return;
    try {
      const r = await api.post('/v1/admin/tokens/rotate', { hash: el.dataset.hash });
      revealed = { title: 'Rotated token — copy now', value: r.token };
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    }
  },
  'token.revoke': async (el) => {
    if (!(await confirmBox('Revoke token', 'Revoked cluster-wide. Clients using it will be rejected.', 'Revoke', true))) return;
    try {
      await api.post('/v1/admin/tokens/revoke', { hash: el.dataset.hash });
      revealed = null;
      toast('Revoked', 'ok');
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    }
  },
});
