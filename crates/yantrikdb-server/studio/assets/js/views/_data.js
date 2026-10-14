/** Data access shared by views. Keeps views off the stores' internals. */

import { overview as current } from '../app/state.js';
import { fetchOverview } from '../app/overview.js';

export const overview = current;

/** The cached overview, fetching once (shared, bounded) if there is none yet. Throws if unavailable. */
export async function fetchIfMissing() {
  return current() || fetchOverview();
}

/**
 * A database from the overview. Throws a precise error — "overview
 * unavailable" is not the same as "no such database", and the page must say which.
 */
export async function loadDatabase(id) {
  const o = await fetchIfMissing();
  const db = (o.databases || []).find((d) => d.id === Number(id));
  if (!db) throw new Error(`Database ${id} not found`);
  return db;
}
