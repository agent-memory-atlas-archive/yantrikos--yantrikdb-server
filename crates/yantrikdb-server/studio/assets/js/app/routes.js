/**
 * Route table. Views are lazy-loaded with dynamic import() so the first paint
 * only pays for the shell and the dashboard.
 *
 *   path   — hash pattern
 *   view   — () => Promise<{render, after?}>
 *   min    — minimum role (omit for any signed-in user)
 *   live   — repaint on every overview poll
 */

import { createRouter } from '../core/router.js';

const v = (name) => () => import(`../views/${name}.js`).then((m) => m.default);

export const routeDefs = [
  { id: 'dashboard', path: 'dashboard', view: v('dashboard'), live: true, noSkeleton: false },
  { id: 'cluster', path: 'cluster', view: v('cluster'), live: true },
  { id: 'databases', path: 'databases', view: v('databases') },
  { id: 'db-browse', path: 'db/:db/browse', view: v('browse') },
  { id: 'db-query', path: 'db/:db/query', view: v('query'), noSkeleton: true },
  { id: 'db-conflicts', path: 'db/:db/conflicts', view: v('conflicts') },
  { id: 'tokens', path: 'tokens', view: v('tokens') },
  { id: 'users', path: 'users', view: v('users'), min: 'owner' },
  { id: 'audit', path: 'audit', view: v('audit'), min: 'admin' },
  { id: 'packs', path: 'packs', view: v('packs') },
  { id: 'maintenance', path: 'maintenance', view: v('maintenance'), live: true },
  { id: 'jobs', path: 'jobs', view: v('jobs'), min: 'admin', live: true },
];

export const router = createRouter(routeDefs);
