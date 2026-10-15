/**
 * App chrome: sidebar, node card and top bar. Subscribes to the stores and
 * repaints only the chrome; the main pane is the host's job.
 */

import { html } from '../core/html.js';
import { duration, compact } from '../core/format.js';
import { icon } from '../ui/icons.js';
import { currentTheme } from '../ui/theme.js';
import { overviewStore, sessionStore, prefsStore, can, databases } from './state.js';
import { router } from './routes.js';

const $ = (id) => document.getElementById(id);

const NAV = [
  { h: 'Server' },
  { id: 'dashboard', to: 'dashboard', label: 'Dashboard', icon: 'dash' },
  { id: 'cluster', to: 'cluster', label: 'Cluster', icon: 'cluster' },
  { h: 'Databases' },
  { dbs: true },
  { id: 'databases', to: 'databases', label: 'Manage', icon: 'gear' },
  { h: 'Security' },
  { id: 'tokens', to: 'tokens', label: 'Tokens', icon: 'key' },
  { id: 'users', to: 'users', label: 'Users & roles', icon: 'users', min: 'owner' },
  { id: 'audit', to: 'audit', label: 'Audit trail', icon: 'list', min: 'admin' },
  { h: 'Operations' },
  { id: 'packs', to: 'packs', label: 'Packs', icon: 'box' },
  { id: 'maintenance', to: 'maintenance', label: 'Maintenance', icon: 'wrench' },
  { id: 'jobs', to: 'jobs', label: 'Jobs', icon: 'jobs', min: 'admin' },
];

/** Items the palette and shortcuts can navigate to. */
export const navTargets = () => NAV.filter((n) => n.id && (!n.min || can(n.min)));

const DB_SUBPAGES = [
  ['browse', 'Browse'],
  ['query', 'Query console'],
  ['conflicts', 'Conflicts'],
];

function sidebar() {
  const { route, params } = router.current();
  const activeDb = route.id.startsWith('db-') ? Number(params.db) : null;
  return html`${NAV.filter((n) => !n.min || can(n.min)).map((n) => {
    if (n.h) return html`<div class="nh">${n.h}</div>`;
    if (n.dbs) {
      const dbs = databases();
      if (!dbs.length) return html`<div class="node sub muted"><span class="lbl">no databases</span></div>`;
      return dbs.map((d) => html`<div class="node ${activeDb === d.id ? 'active' : ''}" data-action="nav" data-to="db/${d.id}/browse"><span class="ic">${icon('db')}</span><span class="lbl">${d.name}</span><span class="n">${compact(d.active_memories)}</span></div>
        ${activeDb === d.id
          ? DB_SUBPAGES.map(([k, label]) => html`<div class="node sub ${route.id === 'db-' + k ? 'active' : ''}" data-action="nav" data-to="db/${d.id}/${k}"><span class="lbl">${label}${k === 'conflicts' && d.open_conflicts ? ` (${d.open_conflicts})` : ''}</span></div>`)
          : ''}`);
    }
    return html`<div class="node ${route.id === n.id ? 'active' : ''}" data-action="nav" data-to="${n.to}" title="${n.label}"><span class="ic">${icon(n.icon)}</span><span class="lbl">${n.label}</span></div>`;
  })}`;
}

function nodeCard(o) {
  if (!o) return '';
  const c = o.cluster;
  return html`<div><b>${o.mode}</b> ${c ? `· node ${c.node_id}` : ''}</div>
    <div class="r"><span>role</span><b>${c ? c.role : 'standalone'}</b></div>
    <div class="r"><span>uptime</span><b>${duration(o.uptime_secs)}</b></div>
    <div class="r"><span>version</span><b>v${o.version}</b></div>`;
}

export function paintChrome() {
  const o = overviewStore.get().data;
  const { refreshMs, collapsed } = prefsStore.get();
  const user = sessionStore.get().user;

  $('side').innerHTML = sidebar().toString();
  $('nodecard').innerHTML = nodeCard(o).toString();
  $('shell').classList.toggle('collapsed', collapsed);
  $('refresh').value = String(refreshMs);
  $('themebtn').innerHTML = icon(currentTheme() === 'light' ? 'moon' : 'sun').toString();
  $('live').innerHTML = (refreshMs > 0 ? html`<span class="dot ok"></span><b>LIVE</b>` : html`<span class="dot"></span>paused`).toString();
  if (user) {
    $('whoname').textContent = user.username;
    $('whorole').textContent = user.role;
  }
  if (o) {
    const bad = o.control_stale || o.quarantine || (o.cluster && !o.cluster.healthy);
    $('hdot').className = 'dot ' + (bad ? 'bad' : o.accepts_writes ? 'ok' : 'warn');
    $('hmode').textContent = o.mode + (o.accepts_writes ? '' : ' · read-only');
  }
  if (overviewStore.get().error && !o) $('hdot').className = 'dot bad';
}

/** One-time: static icons in the top bar, and store subscriptions. */
export function initShell() {
  $('sicon').innerHTML = icon('search').toString();
  $('colbtn').innerHTML = icon('side').toString();
  $('helpbtn').innerHTML = icon('help').toString();
  $('outbtn').innerHTML = icon('out').toString();
  overviewStore.subscribe(paintChrome);
  sessionStore.subscribe(paintChrome);
  prefsStore.subscribe(paintChrome);
  router.onChange(paintChrome);
  paintChrome();
}
