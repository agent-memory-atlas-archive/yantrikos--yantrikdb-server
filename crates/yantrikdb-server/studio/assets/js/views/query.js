/** Query console: semantic recall against one database, read-only. */

import { html } from '../core/html.js';
import { api } from '../core/api.js';
import { actions } from '../core/actions.js';
import { local } from '../core/storage.js';
import { ms } from '../core/format.js';
import { loadDatabase } from './_data.js';
import { refresh } from '../app/host.js';
import { icon } from '../ui/icons.js';
import { badge, typeBadge, bar, alertBox, pageHead, empty } from '../ui/components.js';
import { highlight } from '../ui/highlight.js';
import { downloadCsv } from '../ui/csv.js';
import { toast } from '../ui/overlay.js';
import { memoryDrawer } from './_memory-drawer.js';

const HISTORY_KEY = 'ydb_query_history';
const state = { db: null, text: '', topK: 10, type: '', domain: '', superseded: false, expand: false, busy: false, error: null, result: null };

const history = () => local.getJson(HISTORY_KEY, []);
const remember = (q) => local.setJson(HISTORY_KEY, [q, ...history().filter((x) => x !== q)].slice(0, 20));

function results() {
  if (state.busy) return html`<div class="skel"></div><div class="skel"></div>`;
  if (state.error) return alertBox('bad', 'Query failed', state.error);
  if (!state.result) return empty('search', 'Run a query to see ranked results with relevance scores.');
  const r = state.result.results || [];
  const top = Math.max(...r.map((m) => m.score), 1e-9);
  return html`<div class="toolbar">${badge(`${r.length} result${r.length === 1 ? '' : 's'}`, 'ok')}<span class="muted" style="font-size:.78rem">${ms(state.result.elapsed_ms)}</span><span class="spacer"></span>${r.length ? html`<button class="btn ghost sm" data-action="query.csv">${icon('dl')}CSV</button>` : ''}</div>
    ${r.length
      ? html`<div class="gridwrap" style="background:var(--panel)">${r.map((m, i) => html`<div class="result" data-action="query.open" data-index="${i}"><div class="rk">${i + 1}</div>
          <div class="rb"><div class="rt">${highlight(m.text, state.text)}</div><div class="rm">${typeBadge(m.memory_type)}${m.domain ? badge(m.domain) : ''}${[].concat(m.why_retrieved || []).slice(0, 4).map((w) => badge(w, 'accent'))}</div></div>
          <div class="sc"><b>${Number(m.score).toFixed(3)}</b>${bar((m.score / top) * 100)}</div></div>`)}</div>`
      : empty('search', 'No results.')}`;
}

export default {
  async render({ params }) {
    const id = Number(params.db);
    const db = await loadDatabase(id);
    if (state.db !== id) Object.assign(state, { db: id, result: null, error: null });
    const recent = history().slice(0, 6);

    return html`${pageHead({ crumb: `Databases / ${db.name}`, title: 'Query console', sub: 'semantic recall', right: badge(html`${icon('shield')}read-only · no reinforcement`, 'ok') })}
      <div class="qbox rise"><textarea id="query-text" rows="2" placeholder="Ask your memory anything…" data-on-ctrl-enter="query.run">${state.text}</textarea>
        <div class="qb">
          <label>top_k <input id="query-k" type="number" min="1" max="100" value="${state.topK}" style="width:64px"></label>
          <select id="query-type"><option value="">any type</option>${['episodic', 'semantic', 'procedural'].map((t) => html`<option ${state.type === t ? 'selected' : ''}>${t}</option>`)}</select>
          <input id="query-domain" placeholder="domain" value="${state.domain}" style="width:110px">
          <label><input id="query-superseded" type="checkbox" ${state.superseded ? 'checked' : ''}> superseded</label>
          <label><input id="query-expand" type="checkbox" ${state.expand ? 'checked' : ''}> expand entities</label>
          <span class="spacer"></span><kbd>Ctrl ↵</kbd><button class="btn" id="query-run" data-action="query.run" ${state.busy ? 'disabled' : ''}>${icon('play')}Run</button></div></div>
      ${recent.length ? html`<div class="toolbar" style="margin-top:.8rem"><span class="muted" style="font-size:.74rem">Recent</span>${recent.map((q, i) => html`<span class="chipbtn" data-action="query.recent" data-index="${i}" title="${q}">${q.length > 36 ? q.slice(0, 36) + '…' : q}</span>`)}</div>` : ''}
      <div style="margin-top:1rem">${results()}</div>`;
  },
};

function readForm() {
  const $ = (id) => document.getElementById(id);
  state.text = $('query-text').value;
  state.topK = Number($('query-k').value) || 10;
  state.type = $('query-type').value;
  state.domain = $('query-domain').value.trim();
  state.superseded = $('query-superseded').checked;
  state.expand = $('query-expand').checked;
}

actions({
  'query.run': async () => {
    readForm();
    if (!state.text.trim()) return toast('Enter a query', 'bad');
    Object.assign(state, { busy: true, error: null });
    refresh();
    try {
      state.result = await api.post(`/v1/admin/ops/databases/${state.db}/recall`, {
        query: state.text, top_k: state.topK, memory_type: state.type, domain: state.domain,
        include_superseded: state.superseded, expand_entities: state.expand,
      });
      remember(state.text);
    } catch (e) {
      Object.assign(state, { error: e.message, result: null });
    }
    state.busy = false;
    refresh();
  },
  'query.recent': (el) => { readForm(); state.text = history()[Number(el.dataset.index)]; refresh(); },
  'query.open': (el) => {
    const i = Number(el.dataset.index);
    const m = state.result.results[i];
    memoryDrawer(m, `Result ${i + 1}`, html` <span class="badge ok">${Number(m.score).toFixed(3)}</span>`);
  },
  'query.csv': () => downloadCsv(state.result.results, ['rid', 'score', 'memory_type', 'text', 'domain', 'source', 'importance', 'certainty', 'created_at'], 'recall.csv'),
});
