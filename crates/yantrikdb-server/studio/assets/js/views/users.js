/** Users & roles (owner only). */

import { html } from '../core/html.js';
import { api } from '../core/api.js';
import { actions } from '../core/actions.js';
import { timestamp } from '../core/format.js';
import { user } from '../app/state.js';
import { reload } from '../app/host.js';
import { toast, confirmBox, form } from '../ui/overlay.js';
import { icon } from '../ui/icons.js';
import { badge, pageHead, panel } from '../ui/components.js';

const $ = (id) => document.getElementById(id);
const ROLES = ['readonly', 'admin', 'owner'];

export default {
  async render() {
    const { users } = await api.get('/v1/admin/users');
    const me = user();
    const row = (u) => html`<tr><td><b>${u.username}</b>${u.username === me.username ? html` ${badge('you', 'accent')}` : ''}</td>
      <td><select data-on-change="user.role" data-user="${u.username}" ${u.disabled ? 'disabled' : ''}>${ROLES.map((r) => html`<option ${u.role === r ? 'selected' : ''}>${r}</option>`)}</select></td>
      <td>${u.disabled ? badge('disabled', 'bad') : badge('active', 'ok')}</td><td class="mono">${timestamp(u.created_at)}</td>
      <td class="rowacts"><button class="btn ghost sm" data-action="user.reset" data-user="${u.username}">Reset password</button>${u.disabled ? '' : html`<button class="btn danger sm" data-action="user.disable" data-user="${u.username}">Disable</button>`}</td></tr>`;

    return html`${pageHead({ crumb: 'Security', title: 'Users & roles', sub: 'role-based access control', right: badge(users.length, 'accent') })}
      ${panel('Administrators', html`<div class="toolbar"><input id="user-name" placeholder="username"/><input id="user-pass" type="password" placeholder="password (≥8)"/>
        <select id="user-role">${ROLES.map((r) => html`<option>${r}</option>`)}</select><button class="btn" data-action="user.create">${icon('plus')}Create user</button></div>
        <div class="note" style="margin:-.3rem 0 .8rem"><b>readonly</b> views · <b>admin</b> manages databases, tokens, packs, runs maintenance · <b>owner</b> manages users. Passwords are argon2id-hashed; the last owner cannot be disabled or demoted.</div>
        <div class="gridwrap"><table><thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>${users.map(row)}</tbody></table></div>`)}`;
  },
};

const path = (u, leaf) => `/v1/admin/users/${encodeURIComponent(u)}/${leaf}`;

actions({
  'user.create': async () => {
    const username = $('user-name').value.trim();
    const password = $('user-pass').value;
    if (!username || password.length < 8) return toast('Username and a password of at least 8 characters are required', 'bad');
    try {
      await api.post('/v1/admin/users', { username, password, role: $('user-role').value });
      toast(`User "${username}" created`, 'ok');
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    }
  },
  'user.role': async (el) => {
    const { user: name } = el.dataset;
    try {
      const r = await api.post(path(name, 'role'), { role: el.value });
      if (r.role !== el.value) toast('Refused (owner floor): role unchanged', 'bad');
      else toast(`${name} → ${el.value}`, 'ok');
    } catch (e) {
      toast(e.message, 'bad');
    }
    reload();
  },
  'user.reset': async (el) => {
    const name = el.dataset.user;
    const v = await form(`Reset password — ${name}`, [{ label: 'New password (≥8 chars)', type: 'password' }], 'Reset');
    if (!v) return;
    if (v[0].length < 8) return toast('At least 8 characters', 'bad');
    try {
      await api.post(path(name, 'password'), { password: v[0] });
      toast('Password rotated — the user’s sessions are now invalid', 'ok');
    } catch (e) {
      toast(e.message, 'bad');
    }
  },
  'user.disable': async (el) => {
    const name = el.dataset.user;
    if (!(await confirmBox('Disable user', html`${name}’s sessions end immediately.`, 'Disable', true))) return;
    try {
      const r = await api.post(path(name, 'disable'), {});
      if (!r.disabled) toast('Refused (owner floor): cannot disable the last owner', 'bad');
      else toast(`${name} disabled`, 'ok');
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    }
  },
});
