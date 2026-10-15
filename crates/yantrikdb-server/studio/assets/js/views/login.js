/** Sign-in and first-time owner bootstrap. Rendered into #loginview (outside the shell). */

import { html } from '../core/html.js';
import { api, auth } from '../core/api.js';
import { actions } from '../core/actions.js';
import { toast } from '../ui/overlay.js';
import { icon } from '../ui/icons.js';
import { boot } from '../app/lifecycle.js';

const $ = (id) => document.getElementById(id);

const point = (text) => html`<li>${icon('check')}${text}</li>`;

export function renderLogin() {
  $('loginview').innerHTML = html`
    <div class="lhero">
      <div class="logo" style="border:0;padding:0;height:auto"><div class="mark" style="width:44px;height:44px;border-radius:13px">${icon('db')}</div></div>
      <h1>The control plane for<br><span class="grad-text">cognitive memory.</span></h1>
      <p>Monitor clusters, browse and query memories, manage tokens and roles, and audit every change — from one console served directly by your database.</p>
      <ul>
        ${point('Replicated control plane with quorum-durable audit')}
        ${point('Role-based access — readonly, admin, owner')}
        ${point('Self-contained: works air-gapped, no external assets')}
      </ul>
    </div>
    <div class="lform"><div class="login">
      <div id="signin-box">
        <h2>Sign in</h2>
        <div class="sub">YantrikDB Studio · enterprise control console</div>
        <label for="login-user">Username</label>
        <input id="login-user" autocomplete="username" data-on-enter="login.submit" />
        <label for="login-pass">Password</label>
        <input id="login-pass" type="password" autocomplete="current-password" data-on-enter="login.submit" />
        <button class="btn" data-action="login.submit">Sign in</button>
        <div class="note" style="text-align:center;margin-top:1rem"><a href="#" data-action="login.mode" data-mode="bootstrap">First-time setup →</a></div>
      </div>
      <div id="bootstrap-box" class="hidden">
        <h2>First-time setup</h2>
        <div class="sub">Create the first <b>owner</b> account with the cluster master token. Do this once; afterwards sign in with the account.</div>
        <label for="boot-master">Cluster master token</label>
        <input id="boot-master" type="password" placeholder="ydb_cluster_…" autocomplete="off" />
        <label for="boot-user">Owner username</label>
        <input id="boot-user" autocomplete="off" />
        <label for="boot-pass">Owner password (≥8)</label>
        <input id="boot-pass" type="password" autocomplete="new-password" data-on-enter="login.bootstrap" />
        <button class="btn" data-action="login.bootstrap">Create owner</button>
        <div class="note" style="text-align:center;margin-top:1rem"><a href="#" data-action="login.mode" data-mode="signin">← Back to sign in</a></div>
      </div>
    </div></div>`.toString();
  $('login-user').focus();
}

async function signIn(username, password) {
  const r = await api.post('/v1/admin/session', { username, password });
  auth.set(r.token);
  await boot();
}

actions({
  'login.mode': (el, e) => {
    e.preventDefault();
    const bootstrap = el.dataset.mode === 'bootstrap';
    $('signin-box').classList.toggle('hidden', bootstrap);
    $('bootstrap-box').classList.toggle('hidden', !bootstrap);
  },

  'login.submit': async () => {
    const username = $('login-user').value.trim();
    const password = $('login-pass').value;
    if (!username || !password) return;
    try {
      await signIn(username, password);
      $('login-pass').value = '';
    } catch (e) {
      toast(e.message, 'bad');
    }
  },

  'login.bootstrap': async () => {
    const master = $('boot-master').value.trim();
    const username = $('boot-user').value.trim();
    const password = $('boot-pass').value;
    if (!master || !username || password.length < 8) {
      toast('Master token, username and a password of at least 8 characters are required', 'bad');
      return;
    }
    try {
      await api.withToken(master).post('/v1/admin/users', { username, password, role: 'owner' });
      toast('Owner created — signing in…', 'ok');
      await signIn(username, password);
    } catch (e) {
      toast(e.message, 'bad');
    }
  },
});
