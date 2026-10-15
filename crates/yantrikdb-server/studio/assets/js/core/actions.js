/**
 * Declarative event delegation.
 *
 * Markup carries intent, never code:
 *
 *   <button data-action="db.create">        click
 *   <input  data-on-input="browse.filter">  input
 *   <select data-on-change="browse.sort">   change
 *   <input  data-on-enter="login.submit">   Enter key
 *
 * Handlers are registered by name and receive `(element, event)`; element
 * data attributes (`data-id="3"`) arrive as `element.dataset`. No inline
 * handlers means no globals and a strict CSP (`script-src 'self'`).
 */

const registry = new Map();

/** Register handlers: `actions({ 'db.create': (el, e) => ... })`. */
export function actions(map) {
  for (const [name, fn] of Object.entries(map)) {
    if (registry.has(name)) console.warn(`[studio] action "${name}" registered twice`);
    registry.set(name, fn);
  }
}

function dispatch(attr, e, filter) {
  const el = e.target.closest?.(`[${attr}]`);
  if (!el || (filter && !filter(e))) return;
  const name = el.getAttribute(attr);
  const fn = registry.get(name);
  if (!fn) {
    console.warn(`[studio] no handler for action "${name}"`);
    return;
  }
  const result = fn(el, e);
  if (result && typeof result.catch === 'function') {
    result.catch((err) => console.error(`[studio] action "${name}" failed`, err));
  }
}

let installed = false;

export function installActionDispatcher(root = document) {
  if (installed) return;
  installed = true;
  root.addEventListener('click', (e) => dispatch('data-action', e));
  root.addEventListener('input', (e) => dispatch('data-on-input', e));
  root.addEventListener('change', (e) => dispatch('data-on-change', e));
  root.addEventListener('keydown', (e) => dispatch('data-on-enter', e, (ev) => ev.key === 'Enter' && !ev.isComposing));
  root.addEventListener('keydown', (e) => dispatch('data-on-ctrl-enter', e, (ev) => ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)));
}
