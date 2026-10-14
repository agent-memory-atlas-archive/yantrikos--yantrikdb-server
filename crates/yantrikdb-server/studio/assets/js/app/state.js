/** Application state: who is signed in, the latest server overview, user prefs. */

import { createStore } from '../core/store.js';
import { local } from '../core/storage.js';

export const ROLE_RANK = { readonly: 0, admin: 1, owner: 2 };

/** @type {ReturnType<typeof createStore<{user: {username:string, role:string}|null}>>} */
export const sessionStore = createStore({ user: null });

/** `data` is the last /v1/admin/ops/overview payload; `at` its arrival time. */
export const overviewStore = createStore({ data: null, at: 0, error: null });

export const prefsStore = createStore({
  refreshMs: Number(local.get('ydb_refresh', 3000)),
  collapsed: Boolean(local.get('ydb_collapsed')),
});

prefsStore.subscribe((p) => {
  local.set('ydb_refresh', String(p.refreshMs));
  local.set('ydb_collapsed', p.collapsed ? '1' : '');
});

export const user = () => sessionStore.get().user;
export const overview = () => overviewStore.get().data;

/** Does the signed-in user hold at least `role`? */
export function can(role) {
  const u = user();
  return !!u && ROLE_RANK[u.role] >= ROLE_RANK[role];
}

/** Is the overview currently failing, and how old is the data we still hold? */
export function overviewStatus() {
  const { data, at, error } = overviewStore.get();
  return { error, hasData: !!data, ageSecs: data ? Math.round((Date.now() - at) / 1000) : null };
}

export const databases = () => (overview() && overview().databases) || [];
export const databaseById = (id) => databases().find((d) => d.id === Number(id));
