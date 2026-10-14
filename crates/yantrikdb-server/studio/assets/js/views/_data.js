/** Data access shared by views. Keeps views off the stores' internals. */

import { overview as current } from '../app/state.js';
import { fetchOverview } from '../app/overview.js';

export const overview = current;

/** The cached overview, fetching once if the poller has not delivered yet. */
export async function fetchIfMissing() {
  return current() || fetchOverview();
}
