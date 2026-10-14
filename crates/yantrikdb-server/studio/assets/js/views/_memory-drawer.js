/** Memory detail drawer, shared by the browser and the query console. */

import { html } from '../core/html.js';
import { actions } from '../core/actions.js';
import { openDrawer, copyText } from '../ui/overlay.js';
import { icon } from '../ui/icons.js';
import { typeBadge, badge } from '../ui/components.js';

const META_KEYS = ['type', 'memory_type', 'domain', 'source', 'namespace', 'importance', 'certainty', 'valence', 'access_count', 'storage_tier', 'consolidation_status', 'created_at_iso', 'session_id'];

let current = null;

export function memoryDrawer(m, title, extra = '') {
  current = m;
  const meta = META_KEYS.filter((k) => m[k] != null).map((k) => html`<dt>${k}</dt><dd>${m[k]}</dd>`);
  openDrawer(html`${icon('mem')} ${title}${extra}`, html`
    <div style="display:flex;gap:.4rem;align-items:center;margin-bottom:.6rem">${typeBadge(m.type || m.memory_type)}${m.domain ? badge(m.domain) : ''}<span class="mono muted" style="font-size:.7rem">${m.rid}</span><button class="btn ghost sm" data-action="memory.copyRid">${icon('copy')}</button></div>
    <div class="tabs"><button class="on" data-action="memory.tab" data-tab="content">Content</button><button data-action="memory.tab" data-tab="meta">Metadata</button><button data-action="memory.tab" data-tab="raw">Raw JSON</button></div>
    <div data-pane="content"><p style="white-space:pre-wrap;margin-top:0;line-height:1.6;font-size:.92rem">${m.text}</p><button class="btn ghost sm" data-action="memory.copyText">${icon('copy')}Copy text</button></div>
    <div data-pane="meta" class="hidden"><dl class="rows">${meta}</dl></div>
    <div data-pane="raw" class="hidden"><pre class="json">${JSON.stringify(m, null, 2)}</pre></div>`);
}

actions({
  'memory.tab': (el) => {
    const drawer = document.getElementById('drawer');
    drawer.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b === el));
    drawer.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== el.dataset.tab));
  },
  'memory.copyRid': () => current && copyText(current.rid),
  'memory.copyText': () => current && copyText(current.text),
});
