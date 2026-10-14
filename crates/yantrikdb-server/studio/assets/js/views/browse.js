/** Memory browser: faceted, filterable, paged, table or card layout. */

import { html } from '../core/html.js';
import { api } from '../core/api.js';
import { actions } from '../core/actions.js';
import { local } from '../core/storage.js';
import { nf, timestamp } from '../core/format.js';
import { databaseById } from '../app/state.js';
import { reload, refresh } from '../app/host.js';
import { icon } from '../ui/icons.js';
import { badge, typeBadge, typeColor, bar, pageHead, empty } from '../ui/components.js';
import { highlight } from '../ui/highlight.js';
import { downloadCsv } from '../ui/csv.js';
import { memoryDrawer } from './_memory-drawer.js';

const state = {
  db: null, limit: 50, offset: 0, sort: 'created_at', type: '', domain: '', filter: '',
  rows: [], total: 0, layout: local.get('ydb_browse_layout', 'table'),
};

const CSV_COLUMNS = ['rid', 'type', 'text', 'domain', 'source', 'importance', 'certainty', 'valence', 'access_count', 'created_at_iso', 'namespace', 'session_id'];

async function load(dbId) {
  const qs = new URLSearchParams({ limit: state.limit, offset: state.offset, sort: state.sort });
  if (state.type) qs.set('memory_type', state.type);
  if (state.domain) qs.set('domain', state.domain);
  const r = await api.get(`/v1/admin/ops/databases/${dbId}/memories?${qs}`);
  state.rows = r.items;
  state.total = r.total;
}

const importanceCell = (v) =>
  v == null ? '—' : html`<div style="display:flex;align-items:center;gap:.4rem;justify-content:flex-end">${bar(v * 100, 46)}<span>${Number(v).toFixed(2)}</span></div>`;

function tableLayout(rows) {
  return html`<div class="gridwrap rise"><table><thead><tr><th>Created</th><th>Type</th><th>Text</th><th>Domain</th><th style="text-align:right">Importance</th><th style="text-align:right">Certainty</th><th style="text-align:right">Hits</th><th>RID</th></tr></thead><tbody>
    ${rows.map((m) => html`<tr class="click" data-action="browse.open" data-index="${state.rows.indexOf(m)}"><td class="mono">${timestamp(m.created_at_iso)}</td><td>${typeBadge(m.type)}</td><td class="clip">${highlight(m.text, state.filter)}</td><td>${m.domain || ''}</td><td class="num">${importanceCell(m.importance)}</td><td class="num">${m.certainty == null ? '—' : Number(m.certainty).toFixed(2)}</td><td class="num">${nf(m.access_count)}</td><td class="mono muted">${String(m.rid).slice(0, 8)}</td></tr>`)}
  </tbody></table></div>`;
}

function cardLayout(rows) {
  return html`<div class="cards">${rows.map((m) => html`<div class="mcard rise" data-action="browse.open" data-index="${state.rows.indexOf(m)}">
    <div style="display:flex;gap:.4rem;align-items:center">${typeBadge(m.type)}${m.domain ? badge(m.domain) : ''}<span class="spacer"></span><span class="mono muted" style="font-size:.66rem">${String(m.rid).slice(0, 8)}</span></div>
    <p>${highlight(m.text, state.filter)}</p>
    <div class="f">${bar((m.importance || 0) * 100, 60)}imp ${m.importance == null ? '—' : Number(m.importance).toFixed(2)}<span class="spacer"></span>${timestamp(m.created_at_iso).slice(0, 10)}</div></div>`)}</div>`;
}

export default {
  async render({ params, fetch }) {
    const id = Number(params.db);
    const db = databaseById(id);
    if (!db) return empty('db', 'Database not found.');
    if (state.db !== id) Object.assign(state, { db: id, offset: 0, type: '', domain: '', filter: '' });
    if (fetch) await load(id);

    const needle = state.filter.toLowerCase();
    const rows = needle ? state.rows.filter((m) => JSON.stringify([m.text, m.rid, m.domain, m.source]).toLowerCase().includes(needle)) : state.rows;
    const counts = {};
    state.rows.forEach((m) => { counts[m.type] = (counts[m.type] || 0) + 1; });
    const types = [...new Set(['episodic', 'semantic', 'procedural', ...Object.keys(counts)])];
    const from = state.total ? state.offset + 1 : 0;
    const to = Math.min(state.offset + state.limit, state.total);

    return html`${pageHead({ crumb: `Databases / ${db.name}`, title: 'Memories', sub: 'read-only browser', right: badge(`${nf(state.total)} rows`, 'accent') })}
      <div class="facets rise">${types.map((t) => html`<span class="facet ${state.type === t ? 'on' : ''}" data-action="browse.type" data-value="${state.type === t ? '' : t}"><i style="background:${typeColor(t)}"></i>${t}<b>${counts[t] || 0}</b></span>`)}<span class="muted" style="font-size:.72rem;align-self:center">counts reflect this page</span></div>
      <div class="toolbar rise">
        <input id="browse-filter" class="grow" placeholder="Filter this page…  ( / )" value="${state.filter}" data-on-input="browse.filter"/>
        <input id="browse-domain" placeholder="domain" value="${state.domain}" style="width:120px" data-on-change="browse.domain"/>
        <select data-on-change="browse.sort">${['created_at', 'importance', 'last_access'].map((s) => html`<option value="${s}" ${state.sort === s ? 'selected' : ''}>sort: ${s}</option>`)}</select>
        <select data-on-change="browse.limit">${[25, 50, 100, 200].map((n) => html`<option value="${n}" ${state.limit === n ? 'selected' : ''}>${n} / page</option>`)}</select>
        <div class="seg"><button class="${state.layout === 'table' ? 'on' : ''}" data-action="browse.layout" data-value="table">${icon('list')}Table</button><button class="${state.layout === 'cards' ? 'on' : ''}" data-action="browse.layout" data-value="cards">${icon('grid')}Cards</button></div>
        <button class="btn ghost" data-action="browse.csv">${icon('dl')}CSV</button></div>
      ${rows.length ? (state.layout === 'cards' ? cardLayout(rows) : tableLayout(rows)) : empty('mem', 'No matching memories.')}
      <div class="pager"><button class="btn ghost sm" ${state.offset <= 0 ? 'disabled' : ''} data-action="browse.page" data-dir="-1">← Prev</button><span>${from}–${to} of ${nf(state.total)}</span><button class="btn ghost sm" ${state.offset + state.limit >= state.total ? 'disabled' : ''} data-action="browse.page" data-dir="1">Next →</button></div>`;
  },
};

const requery = () => { state.offset = 0; reload(); };

actions({
  'browse.filter': (el) => { state.filter = el.value; refresh(); },
  'browse.type': (el) => { state.type = el.dataset.value; requery(); },
  'browse.domain': (el) => { state.domain = el.value.trim(); requery(); },
  'browse.sort': (el) => { state.sort = el.value; requery(); },
  'browse.limit': (el) => { state.limit = Number(el.value); requery(); },
  'browse.layout': (el) => { state.layout = el.dataset.value; local.set('ydb_browse_layout', state.layout); refresh(); },
  'browse.page': (el) => { state.offset = Math.max(0, state.offset + Number(el.dataset.dir) * state.limit); reload(); },
  'browse.csv': () => downloadCsv(state.rows, CSV_COLUMNS, `memories-${state.db}-${state.offset}.csv`),
  'browse.open': (el) => memoryDrawer(state.rows[Number(el.dataset.index)], 'Memory'),
});

