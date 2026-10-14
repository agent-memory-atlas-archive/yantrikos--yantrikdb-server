/**
 * View host. Resolves the current route, enforces its role requirement,
 * renders the view into <main>, and keeps scroll position and input focus
 * stable across repaints.
 *
 * A view is `{ render(ctx) → html, after?(ctx) }` where
 *   ctx = { params, quiet, fetch }
 * `quiet`  — a background repaint (poll tick): no skeleton, no entrance animation.
 * `fetch`  — false when only local UI state changed; views reuse cached data.
 */

import { html } from '../core/html.js';
import { can } from './state.js';
import { resetCharts } from '../ui/charts.js';
import { empty, unavailable } from '../ui/components.js';
import { router } from './routes.js';

const main = () => document.getElementById('main');
let seq = 0;

const skeleton = () =>
  html`<div class="skel"></div><div class="skel" style="height:140px"></div><div class="skel" style="height:220px"></div>`;

function captureFocus() {
  const el = document.activeElement;
  if (!el || !el.id || !main().contains(el)) return null;
  const sel = typeof el.selectionStart === 'number' ? [el.selectionStart, el.selectionEnd] : null;
  return { id: el.id, sel };
}

function restoreFocus(snapshot) {
  if (!snapshot) return;
  const el = document.getElementById(snapshot.id);
  if (!el) return;
  el.focus();
  if (snapshot.sel && el.setSelectionRange) el.setSelectionRange(...snapshot.sel);
}

export function currentRoute() {
  return router.current();
}

export async function renderRoute({ quiet = false, fetch = true } = {}) {
  const { route, params } = router.current();
  const el = main();
  const mine = ++seq;

  if (route.min && !can(route.min)) {
    el.innerHTML = empty('shield', `${route.min} role required.`).toString();
    return;
  }

  const scroll = el.scrollTop;
  const focus = captureFocus();
  el.classList.toggle('anim', !quiet && fetch);
  if (!quiet && fetch && !route.noSkeleton) el.innerHTML = skeleton().toString();

  try {
    const view = await route.view();
    resetCharts();
    const out = await view.render({ params, quiet, fetch, route });
    if (mine !== seq) return; // a newer render superseded this one
    el.innerHTML = out.toString();
    el.scrollTop = quiet || !fetch ? scroll : 0;
    restoreFocus(focus);
    if (view.after) view.after({ params });
  } catch (e) {
    if (mine !== seq) return;
    el.innerHTML = unavailable('This page could not be loaded', e.message || 'Something went wrong').toString();
  }
}

/** Repaint after a local state change (filter, view toggle) without refetching. */
export const refresh = () => renderRoute({ quiet: true, fetch: false });

/** Repaint and refetch data in place. */
export const reload = () => renderRoute({ quiet: true, fetch: true });
