/**
 * Application lifecycle: sign-in → shell + polling → sign-out.
 * Owns the single overview poller so nothing else starts timers.
 */

import { api, auth, authEvents } from '../core/api.js';
import { sessionStore, overviewStore, prefsStore } from './state.js';
import { fetchOverview, createOverviewPoller } from './overview.js';
import { renderRoute } from './host.js';
import { router } from './routes.js';
import { isModalOpen, isDrawerOpen, closeModal, closeDrawer } from '../ui/overlay.js';
import { renderLogin } from '../views/login.js';

const $ = (id) => document.getElementById(id);

const poller = createOverviewPoller(() => {
  // Repaint live views only when nothing would be disturbed.
  if (router.current().route.live && !isModalOpen() && !isDrawerOpen()) renderRoute({ quiet: true, coalesce: true });
});

export function setRefresh(ms) {
  prefsStore.set({ refreshMs: ms });
  poller.restart();
}


/** Show the login screen. */
export function showLogin() {
  poller.stop();
  sessionStore.set({ user: null });
  overviewStore.set({ data: null, at: 0, error: null });
  closeModal();
  closeDrawer();
  $('shell').classList.add('hidden');
  $('loginview').classList.remove('hidden');
  renderLogin();
}

/** Called after a token is stored (or found on load). */
export async function boot() {
  let me;
  try {
    me = await api.get('/v1/admin/me');
  } catch {
    showLogin();
    return;
  }
  sessionStore.set({ user: { username: me.username, role: me.role } });
  $('loginview').classList.add('hidden');
  $('shell').classList.remove('hidden');
  // Paint immediately. The overview is fetched in the background with its own
  // timeout, so a busy engine can delay the numbers but never the console.
  renderRoute();
  fetchOverview().catch(() => {}); // shared with the view's own request
  poller.start();
}

/** "Try again" after the overview failed to load. */
export async function retryOverview() {
  await fetchOverview({ force: true }).catch(() => {});
  renderRoute({ quiet: true });
}

export function logout() {
  auth.clear();
  showLogin();
}

authEvents.addEventListener('unauthorized', showLogin);

