/** Polls the consolidated server overview and publishes it to the store. */

import { api } from '../core/api.js';
import { createPoller } from '../core/poller.js';
import { overviewStore, prefsStore } from './state.js';

/** The overview must answer quickly or be reported as unavailable. */
const OVERVIEW_TIMEOUT_MS = 8_000;

/**
 * Fetch and publish. On failure the previous data is kept (so the UI can show
 * the last good numbers marked stale) and `error` is set.
 */
export async function fetchOverview() {
  try {
    const data = await api.get('/v1/admin/ops/overview', { timeoutMs: OVERVIEW_TIMEOUT_MS });
    overviewStore.set({ data, at: Date.now(), error: null });
    return data;
  } catch (e) {
    overviewStore.set({ error: e.message });
    throw e;
  }
}

/** `onTick` runs after each successful poll (the host uses it to repaint live views). */
export function createOverviewPoller(onTick) {
  const poller = createPoller(async () => {
    try {
      await fetchOverview();
    } catch {
      return;
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
