/** Polls the consolidated server overview and publishes it to the store. */

import { api } from '../core/api.js';
import { createPoller } from '../core/poller.js';
import { overviewStore, prefsStore } from './state.js';

/** The overview must answer quickly or be reported as unavailable. */
const OVERVIEW_TIMEOUT_MS = 8_000;

let inflight = null;
let controller = null;

/**
 * Fetch and publish. Concurrent callers (first paint, the view, the poller)
 * share ONE request, so a busy server is waited on once, not once per caller.
 * `force` (a user pressing "Try again") abandons any request already waiting
 * and starts a fresh one — a retry must never queue behind the hang it is
 * trying to get past. On failure the previous data is kept (the UI shows it
 * marked stale) and `error` is set.
 */
export function fetchOverview({ force = false } = {}) {
  if (inflight && !force) return inflight;
  if (controller) controller.abort();
  const mine = new AbortController();
  controller = mine;
  const run = (async () => {
    try {
      const data = await api.get('/v1/admin/ops/overview', { timeoutMs: OVERVIEW_TIMEOUT_MS, signal: mine.signal });
      overviewStore.set({ data, at: Date.now(), error: null });
      return data;
    } catch (e) {
      if (!e.superseded) overviewStore.set({ error: e.message }); // an abandoned request says nothing about the server
      throw e;
    } finally {
      if (inflight === run) {
        inflight = null;
        controller = null;
      }
    }
  })();
  inflight = run;
  return run;
}

/** `onTick` runs after each successful poll (the host uses it to repaint live views). */
export function createOverviewPoller(onTick) {
  const poller = createPoller(async () => {
    try {
      await fetchOverview();
    } catch {
      /* the store now carries the error; repaint so live views show it */
    }
    onTick();
  });
  return {
    start: () => poller.start(prefsStore.get().refreshMs),
    stop: () => poller.stop(),
    restart: () => poller.start(prefsStore.get().refreshMs),
    /** Poll once, now. */
    tick: () => poller.tick(),
    get live() {
      return poller.active;
    },
  };
}
