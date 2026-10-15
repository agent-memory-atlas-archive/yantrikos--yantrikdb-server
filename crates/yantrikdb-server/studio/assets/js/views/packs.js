/** Packs: sealed knowledge bundles — upload, mount, unmount. */

import { html } from '../core/html.js';
import { api } from '../core/api.js';
import { actions } from '../core/actions.js';
import { bytes } from '../core/format.js';
import { can } from '../app/state.js';
import { reload } from '../app/host.js';
import { toast, confirmBox } from '../ui/overlay.js';
import { icon } from '../ui/icons.js';
import { badge, pageHead, panel, empty } from '../ui/components.js';

const $ = (id) => document.getElementById(id);
let uploaded = []; // packs available to mount, refreshed on every render

export default {
  async render() {
    const [{ packs }, { databases }] = await Promise.all([api.get('/v1/admin/packs'), api.get('/v1/admin/databases')]);
    uploaded = packs;
    const admin = can('admin');

    const list = packs.length
      ? html`<div class="gridwrap"><table><thead><tr><th>Digest</th><th>Size</th></tr></thead><tbody>${packs.map((p) => html`<tr><td class="mono">${p.digest}</td><td class="num">${bytes(p.size)}</td></tr>`)}</tbody></table></div>`
      : empty('box', 'No packs uploaded yet.');

    return html`${pageHead({ crumb: 'Operations', title: 'Packs', sub: 'sealed knowledge bundles' })}
      ${panel('Uploaded packs', html`${admin ? html`<div class="toolbar"><input type="file" id="pack-file" accept=".ydbpack"/><button class="btn" data-action="pack.upload">${icon('plus')}Upload</button></div>` : ''}${list}
        <div class="note">A pack is a sealed .ydbpack a database mounts to gain knowledge. Files replicate to every node; mounts survive failover.</div>`, { glyph: 'box' })}
      ${panel('Mounts per database', html`<div class="toolbar"><select id="pack-db" data-on-change="pack.select"><option value="">— choose database —</option>${databases.map((d) => html`<option value="${d.id}">${d.name}</option>`)}</select></div><div id="pack-mounts" class="empty">Select a database.</div>`, { glyph: 'db' })}`;
  },
};

async function showMounts(dbId) {
  const el = $('pack-mounts');
  if (!dbId) {
    el.className = 'empty';
    el.textContent = 'Select a database.';
    return;
  }
  try {
    const { manifest, status } = await api.get(`/v1/admin/databases/${dbId}/packs`);
    const state = (digest) => (status.mounted.includes(digest) ? badge('mounted', 'ok') : status.poisoned.includes(digest) ? badge('poisoned', 'bad') : badge('pending', 'warn'));
    const mounted = new Set(manifest.map((m) => m.pack_digest));
    const available = uploaded.filter((p) => !mounted.has(p.digest));
    const admin = can('admin');
    el.className = '';
    el.innerHTML = html`${manifest.length
      ? html`<div class="gridwrap"><table><thead><tr><th>Pack</th><th>Digest</th><th>State</th><th></th></tr></thead><tbody>${manifest.map((m) => html`<tr><td><b>${m.pack_name}</b></td><td class="mono">${m.pack_digest.slice(0, 16)}…</td><td>${state(m.pack_digest)}</td><td class="rowacts">${admin ? html`<button class="btn danger sm" data-action="pack.unmount" data-db="${dbId}" data-digest="${m.pack_digest}">Unmount</button>` : ''}</td></tr>`)}</tbody></table></div>`
      : empty('box', 'No packs mounted.')}
      ${admin && available.length ? html`<div class="toolbar" style="margin-top:.8rem"><select id="mount-pick">${available.map((p) => html`<option value="${p.digest}">${p.digest.slice(0, 16)}…</option>`)}</select><input id="mount-name" placeholder="label (optional)"/><button class="btn" data-action="pack.mount" data-db="${dbId}">Mount</button></div>` : ''}`.toString();
  } catch (e) {
    el.className = 'empty';
    el.textContent = e.message;
  }
}

actions({
  'pack.upload': async () => {
    const file = $('pack-file').files[0];
    if (!file) return toast('Choose a .ydbpack file', 'bad');
    try {
      const r = await api.upload('/v1/admin/packs', await file.arrayBuffer());
      toast(`Uploaded (${r.digest.slice(0, 12)}…)`, 'ok');
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    }
  },
  'pack.select': (el) => showMounts(Number(el.value)),
  'pack.mount': async (el) => {
    const digest = $('mount-pick').value;
    const name = $('mount-name').value.trim();
    try {
      await api.post(`/v1/admin/databases/${el.dataset.db}/packs`, name ? { digest, name } : { digest });
      toast('Mount accepted — reconciling across the cluster', 'ok');
      showMounts(Number(el.dataset.db));
    } catch (e) {
      toast(e.message, 'bad');
    }
  },
  'pack.unmount': async (el) => {
    if (!(await confirmBox('Unmount pack', 'Its knowledge is removed from this database.', 'Unmount', true))) return;
    try {
      await api.del(`/v1/admin/databases/${el.dataset.db}/packs/${el.dataset.digest}`);
      toast('Unmount accepted', 'ok');
      showMounts(Number(el.dataset.db));
    } catch (e) {
      toast(e.message, 'bad');
    }
  },
});
